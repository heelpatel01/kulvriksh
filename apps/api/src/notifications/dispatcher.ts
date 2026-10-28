import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.ts';
import type { Logger } from '../logger.ts';

// Dispatch of email/SMS notification records (Flows F-NOT-01, DM §10.3). In-app records never
// pass through here. No provider is configured yet (R37), so the API does not start a dispatcher;
// this module is the tested mechanism a provider will plug into.
//
// Claim: due `queued` records are taken with FOR UPDATE SKIP LOCKED and given a lease. Complete:
// every state change is fenced on the lease token, so a record whose lease expired and was taken
// by another run cannot be completed by the stale one. Expired leases go back to `queued`.

export type SendOutcome =
  | { kind: 'accepted'; providerMessageId?: string; responseCode?: string }
  | { kind: 'transient'; responseCode?: string }
  | { kind: 'permanent'; responseCode?: string };

export interface NotificationSender {
  readonly channel: 'email' | 'sms';
  send(message: { to: string; title: string; body: string; dedupeKey: string }): Promise<SendOutcome>;
}

export interface DispatchOptions {
  batchSize: number;
  leaseSeconds: number;
  /** Attempts before a transient failure becomes `failed` (FQ-17: values TBC). */
  maxAttempts: number;
  /** Backoff for attempt n: base * 2^(n-1) seconds. */
  backoffBaseSeconds: number;
  sendTimeoutMs: number;
}

export const DEFAULT_DISPATCH: DispatchOptions = { batchSize: 20, leaseSeconds: 120, maxAttempts: 5, backoffBaseSeconds: 60, sendTimeoutMs: 10_000 };

type Claimed = { id: string; channel: 'email' | 'sms'; recipient_address: string; title: string; rendered_body: string; dedupe_key: string; attempt_count: number; lease_token: string };

/** Returns records whose lease expired to `queued` (AS-NOT-04: nothing stays stuck in `sending`). */
export async function recoverExpiredLeases(prisma: PrismaClient): Promise<number> {
  return prisma.$executeRaw`
    UPDATE notification SET status = 'queued', lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE status = 'sending' AND lease_expires_at < now()`;
}

export async function dispatchOnce(
  prisma: PrismaClient,
  senders: readonly NotificationSender[],
  logger: Logger,
  options: DispatchOptions = DEFAULT_DISPATCH,
): Promise<{ claimed: number; sent: number; retried: number; failed: number }> {
  const channels = senders.map((s) => s.channel);
  const totals = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  if (channels.length === 0) {
    return totals;
  }
  const lease = randomUUID();
  const claimed = await prisma.$queryRaw<Claimed[]>`
    UPDATE notification n SET status = 'sending', lease_token = ${lease}::uuid,
           lease_expires_at = now() + ${options.leaseSeconds}::integer * interval '1 second',
           attempt_count = n.attempt_count + 1, updated_at = now()
    WHERE n.id IN (
      SELECT id FROM notification
      WHERE status = 'queued' AND channel::text = ANY(${channels}) AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT ${options.batchSize}::integer
      FOR UPDATE SKIP LOCKED)
    RETURNING n.id::text AS id, n.channel::text AS channel, n.recipient_address, n.title, n.rendered_body, n.dedupe_key,
              n.attempt_count, n.lease_token::text AS lease_token`;
  totals.claimed = claimed.length;

  for (const record of claimed) {
    const sender = senders.find((s) => s.channel === record.channel)!;
    const attempt = await prisma.notificationAttempt.create({ data: { notificationId: record.id, attemptNo: record.attempt_count } });
    let outcome: SendOutcome;
    let timer: NodeJS.Timeout | undefined;
    try {
      outcome = await Promise.race([
        sender.send({ to: record.recipient_address, title: record.title, body: record.rendered_body, dedupeKey: record.dedupe_key }),
        new Promise<SendOutcome>((resolve) => {
          timer = setTimeout(() => resolve({ kind: 'transient', responseCode: 'timeout' }), options.sendTimeoutMs);
        }),
      ]);
    } catch {
      outcome = { kind: 'transient', responseCode: 'exception' };
    } finally {
      clearTimeout(timer);
    }
    const finalFailure = outcome.kind === 'permanent' || (outcome.kind === 'transient' && record.attempt_count >= options.maxAttempts);
    const next = outcome.kind === 'accepted' ? 'sent' : finalFailure ? 'failed' : 'queued';
    const backoff = options.backoffBaseSeconds * 2 ** (record.attempt_count - 1);
    // Fenced on the lease: a stale run cannot overwrite a record another run now owns.
    const updated = await prisma.$executeRaw`
      UPDATE notification SET status = ${next}::notification_status, lease_token = NULL, lease_expires_at = NULL,
             provider_message_id = ${outcome.kind === 'accepted' ? (outcome.providerMessageId ?? null) : null},
             last_error_code = ${outcome.kind === 'accepted' ? null : (outcome.responseCode ?? outcome.kind)},
             sent_at = ${next === 'sent' ? new Date() : null},
             next_attempt_at = CASE WHEN ${next} = 'queued' THEN now() + ${backoff}::integer * interval '1 second' ELSE next_attempt_at END,
             updated_at = now()
      WHERE id = ${record.id}::uuid AND lease_token = ${record.lease_token}::uuid`;
    await prisma.notificationAttempt.update({
      where: { id: attempt.id },
      data: {
        finishedAt: new Date(),
        outcome: updated === 1 ? (outcome.kind === 'accepted' ? 'accepted' : `${outcome.kind}_failure`) : 'lease_expired',
        providerResponseCode: outcome.responseCode ?? null,
      },
    });
    if (updated !== 1) {
      continue;
    }
    if (next === 'sent') {
      totals.sent += 1;
    } else if (next === 'queued') {
      totals.retried += 1;
    } else {
      totals.failed += 1;
      // Alertable: repeated failures need a person (F-NOT-01 "Provider outage").
      logger.error('notification delivery failed', { notificationId: record.id, channel: record.channel, code: outcome.responseCode });
    }
  }
  return totals;
}
