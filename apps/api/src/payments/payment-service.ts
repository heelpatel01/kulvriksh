import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { CheckoutView, OrderView, PaymentStatusView } from '@kulvriksh/shared';
import { isUniqueViolation } from '../db-errors.ts';
import type { Logger } from '../logger.ts';
import type { GateableFeature, PaymentConfig } from './payment-config.ts';
import type { Actor, OrderRecord, PaymentEvidence, PaymentStore } from './payment-store.ts';
import { DevelopmentProvider, ProviderError, type PaymentProvider, type ProviderPayment } from './provider.ts';

// Order, payment and entitlement operations (F-ORD-01 to F-ORD-06). The rule throughout: the
// browser can only *ask*; an order becomes paid only from a payment the API has read back from the
// provider (verify, reconciliation) or received in a signed webhook, with the amount and currency
// matching the order's snapshot. Provider calls never run inside a database transaction.

export type CreateOrderResult =
  | { kind: 'created' | 'existing'; order: OrderView; checkout: CheckoutView | null }
  | { kind: 'not_configured' | 'plan_unavailable' | 'key_reused' | 'provider_unavailable' };

export type VerifyResult = { kind: 'not_found' } | { kind: 'invalid_signature' } | { kind: 'confirmed' | 'pending' | 'failed'; order: OrderView };

export interface PaymentService {
  readonly status: PaymentStatusView;
  createOrder(customerId: string, input: { planId: string; idempotencyKey: string }, requestId?: string): Promise<CreateOrderResult>;
  /** "Resume payment" on the same order (AS-ORD-05). */
  resume(customerId: string, orderId: string): Promise<{ kind: 'ok'; order: OrderView; checkout: CheckoutView } | { kind: 'not_found' | 'paid' | 'not_configured' }>;
  verify(customerId: string, orderId: string, input: { providerPaymentId: string; signature: string }, requestId?: string): Promise<VerifyResult>;
  /** Raw body and headers of a provider webhook. 'rejected' means a bad signature or payload. */
  webhook(rawBody: Buffer, headers: { signature?: string; eventId?: string }): Promise<{ kind: 'not_configured' | 'rejected' } | { kind: 'ok'; duplicate: boolean; grantFor?: string }>;
  grantNow(orderId: string, actor: Actor): Promise<void>;
  reconcile(): Promise<{ skipped: boolean; checked: number; paid: number }>;
  recoverGrants(): Promise<{ skipped: boolean; attempted: number }>;
  /** Development provider only: the simulated gateway's answer for this customer's order. */
  simulate(customerId: string, orderId: string, outcome: 'success' | 'failure'): Promise<{ providerPaymentId: string; signature: string } | undefined>;
  /** An entitlement check for a gated feature, or undefined when the feature is not gated (R14). */
  gate(feature: GateableFeature): ((userId: string) => Promise<boolean>) | undefined;
  start(): void;
  stop(): void;
}

const RECONCILE_TASK = 'payment_reconciliation';
const GRANT_TASK = 'grant_recovery';

/** The provider's payment status as evidence for Confirm; created or refunded payments are not evidence. */
export function evidenceOf(p: ProviderPayment): PaymentEvidence | undefined {
  const status = p.status === 'captured' ? 'captured' : p.status === 'authorized' ? 'authorised' : p.status === 'failed' ? 'failed' : undefined;
  return status ? { providerPaymentId: p.id, status, amountMinor: p.amountMinor, currency: p.currency, failureCode: p.errorCode } : undefined;
}

export function createPaymentService(deps: { store: PaymentStore; provider?: PaymentProvider; config: PaymentConfig; logger: Logger }): PaymentService {
  const { store, provider, config, logger } = deps;
  const owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const timers: NodeJS.Timeout[] = [];
  let reconciling = false;
  let recovering = false;
  const system: Actor = { role: 'system' };

  const checkoutOf = (record: OrderRecord): CheckoutView | null =>
    provider && record.provider === provider.name
      ? {
          provider: provider.name,
          mode: provider.mode,
          keyId: provider.publicKeyId,
          providerOrderId: record.providerOrderId,
          amountMinor: record.view.amountMinor,
          currency: record.view.currency,
          name: record.view.planName,
        }
      : null;

  async function grantNow(orderId: string, actor: Actor) {
    try {
      const result = await store.grant(orderId, actor, config.grant);
      if (result === 'failed_attempt') {
        logger.warn('entitlement grant failed; it will be retried', { orderId });
      }
    } catch (err) {
      logger.warn('entitlement grant could not run; recovery will retry', { orderId, err });
    }
  }

  async function freshOrder(customerId: string, orderId: string): Promise<OrderView> {
    return (await store.customerOrder(customerId, orderId))!.view;
  }

  async function reconcile() {
    if (!provider || reconciling) {
      return { skipped: true, checked: 0, paid: 0 };
    }
    reconciling = true;
    const leaseSeconds = Math.ceil((config.reconcile.batchSize * config.providerTimeoutMs) / 1000) + 60;
    let token: string | undefined;
    let checked = 0;
    let paid = 0;
    try {
      token = await store.claimTask(RECONCILE_TASK, owner, leaseSeconds);
      if (!token) {
        return { skipped: true, checked: 0, paid: 0 };
      }
      const orders = await store.ordersToReconcile({ minAgeSeconds: config.reconcile.minAgeSeconds, lookbackDays: config.reconcile.lookbackDays, limit: config.reconcile.batchSize });
      for (const order of orders) {
        // A run that lost its lease stops; compare-and-set transitions keep any overlap harmless.
        if (!(await store.renewTask(RECONCILE_TASK, token, leaseSeconds))) {
          logger.warn('reconciliation lost its lease; stopping this run');
          break;
        }
        checked += 1;
        try {
          const payments = await provider.listOrderPayments(order.providerOrderId);
          const evidence = payments.map(evidenceOf).filter((e): e is PaymentEvidence => e !== undefined);
          // Record every attempt; a captured one (applied last) can move the order to paid.
          evidence.sort((a, b) => (a.status === 'captured' ? 1 : 0) - (b.status === 'captured' ? 1 : 0));
          let nowPaid = false;
          for (const ev of evidence) {
            const result = await store.confirm(order.id, ev, 'reconciliation', system);
            nowPaid ||= result === 'paid_now';
          }
          if (nowPaid) {
            paid += 1;
            await grantNow(order.id, system);
          } else {
            await store.recordCheck(order.id, config.reconcile.attentionAfterChecks);
          }
        } catch (err) {
          logger.warn('reconciliation could not check an order', { orderId: order.id, kind: err instanceof ProviderError ? err.kind : 'error' });
          await store.recordCheck(order.id, config.reconcile.attentionAfterChecks).catch(() => undefined);
        }
      }
      return { skipped: false, checked, paid };
    } finally {
      if (token) {
        await store.releaseTask(RECONCILE_TASK, token).catch(() => undefined);
      }
      reconciling = false;
    }
  }

  async function recoverGrants() {
    if (recovering) {
      return { skipped: true, attempted: 0 };
    }
    recovering = true;
    let token: string | undefined;
    try {
      token = await store.claimTask(GRANT_TASK, owner, 120);
      if (!token) {
        return { skipped: true, attempted: 0 };
      }
      const due = await store.grantsDue(50);
      for (const orderId of due) {
        await grantNow(orderId, system);
      }
      return { skipped: false, attempted: due.length };
    } finally {
      if (token) {
        await store.releaseTask(GRANT_TASK, token).catch(() => undefined);
      }
      recovering = false;
    }
  }

  return {
    status: {
      provider: provider ? provider.name : 'none',
      mode: provider ? provider.mode : null,
      currency: config.currency,
      gates: { ...config.gates },
    },

    async createOrder(customerId, { planId, idempotencyKey }, requestId) {
      if (!provider) {
        return { kind: 'not_configured' };
      }
      const actor: Actor = { userId: customerId, role: 'customer', requestId };
      const existing = await store.orderByIdempotencyKey(customerId, idempotencyKey);
      if (existing) {
        return existing.planId === planId ? { kind: 'existing', order: existing.view, checkout: checkoutOf(existing) } : { kind: 'key_reused' };
      }
      // The price comes from the catalogue, never from the request (AS-ORD-01).
      const snapshot = await store.orderablePlan(planId);
      if (!snapshot || snapshot.currency !== config.currency) {
        return { kind: 'plan_unavailable' };
      }
      const id = randomUUID();
      let providerOrderId: string;
      try {
        ({ providerOrderId } = await provider.createOrder({ receipt: id, amountMinor: BigInt(snapshot.priceMinor), currency: snapshot.currency, notes: { order_id: id } }));
      } catch (err) {
        logger.warn('payment provider order creation failed', { orderId: id, kind: err instanceof ProviderError ? err.kind : 'error' });
        return { kind: 'provider_unavailable' };
      }
      try {
        const record = await store.insertOrder({ id, customerId, idempotencyKey, snapshot, provider: provider.name, providerOrderId }, actor);
        return { kind: 'created', order: record.view, checkout: checkoutOf(record) };
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        // A concurrent request with the same key won; its order is the one to pay (AS-ORD-02).
        const winner = await store.orderByIdempotencyKey(customerId, idempotencyKey);
        if (!winner) {
          throw err;
        }
        return winner.planId === planId ? { kind: 'existing', order: winner.view, checkout: checkoutOf(winner) } : { kind: 'key_reused' };
      }
    },

    async resume(customerId, orderId) {
      const record = await store.customerOrder(customerId, orderId);
      if (!record) {
        return { kind: 'not_found' };
      }
      if (record.view.status === 'paid') {
        return { kind: 'paid' };
      }
      const checkout = checkoutOf(record);
      return checkout ? { kind: 'ok', order: record.view, checkout } : { kind: 'not_configured' };
    },

    async verify(customerId, orderId, { providerPaymentId, signature }, requestId) {
      const record = await store.customerOrder(customerId, orderId);
      if (!record) {
        return { kind: 'not_found' };
      }
      const actor: Actor = { userId: customerId, role: 'customer', requestId };
      if (record.view.status === 'paid') {
        if (record.view.grantStatus === 'pending') {
          await grantNow(orderId, actor);
        }
        return { kind: 'confirmed', order: await freshOrder(customerId, orderId) };
      }
      // The provider order id comes from our own row, never from the browser.
      if (!provider || record.provider !== provider.name || !provider.verifyCheckoutSignature({ providerOrderId: record.providerOrderId, providerPaymentId, signature })) {
        logger.warn('payment verification rejected: invalid signature', { orderId, requestId });
        await store.auditFailure({ actorUserId: customerId, actorRole: 'customer', action: 'order.verify_rejected', targetId: orderId, reason: 'invalid_signature', requestId });
        return { kind: 'invalid_signature' };
      }
      let payment: ProviderPayment;
      try {
        payment = await provider.fetchPayment(providerPaymentId);
      } catch (err) {
        // Not confirmed yet: the webhook or reconciliation completes it (F-ORD-03 step 3).
        logger.warn('payment lookup failed during verify', { orderId, kind: err instanceof ProviderError ? err.kind : 'error' });
        return { kind: 'pending', order: record.view };
      }
      if (payment.orderId !== record.providerOrderId) {
        logger.warn('payment verification rejected: payment belongs to another order', { orderId, requestId });
        return { kind: 'invalid_signature' };
      }
      const evidence = evidenceOf(payment);
      if (!evidence) {
        return { kind: 'pending', order: record.view };
      }
      const result = await store.confirm(orderId, evidence, 'verify', actor);
      if (result === 'paid_now' || result === 'already_paid') {
        await grantNow(orderId, actor);
      }
      const order = await freshOrder(customerId, orderId);
      return { kind: order.status === 'paid' ? 'confirmed' : order.status === 'failed' ? 'failed' : 'pending', order };
    },

    async webhook(rawBody, { signature, eventId }) {
      if (!provider) {
        return { kind: 'not_configured' };
      }
      // Signature first, on the raw bytes, before anything is parsed (F-ORD-04 step 1).
      if (!provider.verifyWebhookSignature(rawBody, signature)) {
        logger.warn('payment webhook rejected: invalid signature');
        await store.auditFailure({ actorRole: 'anonymous', action: 'payment.webhook_rejected', targetId: 'webhook', reason: 'invalid_signature' });
        return { kind: 'rejected' };
      }
      let event;
      try {
        event = provider.parseWebhook(rawBody, eventId);
      } catch {
        logger.warn('payment webhook rejected: malformed payload');
        return { kind: 'rejected' };
      }
      const result = await store.processWebhook(event);
      if (result.duplicate) {
        return { kind: 'ok', duplicate: true };
      }
      if (result.status === 'needs_attention') {
        logger.warn('payment webhook needs attention', { eventType: event.eventType });
      }
      return { kind: 'ok', duplicate: false, ...(result.orderId ? { grantFor: result.orderId } : {}) };
    },

    grantNow,
    reconcile,
    recoverGrants,

    async simulate(customerId, orderId, outcome) {
      if (!(provider instanceof DevelopmentProvider)) {
        return undefined;
      }
      const record = await store.customerOrder(customerId, orderId);
      return record && record.provider === 'development' ? provider.simulate(record.providerOrderId, outcome) : undefined;
    },

    gate(feature) {
      const key = config.gates[feature];
      return key ? (userId: string) => store.hasEntitlement(userId, key) : undefined;
    },

    start() {
      const run = (label: string, fn: () => Promise<unknown>) => () => void fn().catch((err: unknown) => logger.warn(`${label} failed`, { err }));
      // Startup recovery shortly after boot, then on intervals (§12.4).
      const boot = setTimeout(() => {
        run('grant recovery', recoverGrants)();
        run('reconciliation', reconcile)();
      }, 5_000);
      boot.unref();
      const grants = setInterval(run('grant recovery', recoverGrants), 60_000);
      grants.unref();
      const recon = setInterval(run('reconciliation', reconcile), config.reconcile.intervalSeconds * 1000);
      recon.unref();
      timers.push(boot, grants, recon);
    },

    stop() {
      timers.forEach((t) => clearInterval(t));
      timers.length = 0;
    },
  };
}
