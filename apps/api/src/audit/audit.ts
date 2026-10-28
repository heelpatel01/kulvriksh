import type { AuditEventView } from '@kulvriksh/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import type { Logger } from '../logger.ts';

// Persistent audit trail (DM §9.4). The runtime database role can only INSERT and SELECT this
// table, and no API route modifies it. Success events are written in the same transaction as the
// change they describe; failure and security events use their own short transaction.

export type AuditRole = 'customer' | 'genealogist' | 'admin' | 'system' | 'anonymous';

export interface AuditEntry {
  actorUserId?: string;
  actorRole: AuditRole;
  /** `<resource>.<verb>`, e.g. `member.created`, `assignment.removed`, `auth.sign_in_failed`. */
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
  outcome?: 'success' | 'failure';
  /** Minimal, non-sensitive facts only. Unsafe keys and long values are dropped. */
  details?: Record<string, string | number | boolean | null>;
  requestId?: string;
}

// Never stored in audit, whatever the caller passes (DM §9.4: no secrets, OTPs, tokens).
const FORBIDDEN_KEY = /token|password|secret|otp|code|hash|cookie|authorization|mobile|phone|email|body/i;
const MAX_KEYS = 12;
const MAX_VALUE_LENGTH = 200;

export function safeDetails(details: AuditEntry['details']): Prisma.InputJsonObject | undefined {
  if (!details) {
    return undefined;
  }
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details).slice(0, MAX_KEYS)) {
    if (FORBIDDEN_KEY.test(key) || !/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) {
      continue;
    }
    out[key] = typeof value === 'string' ? value.slice(0, MAX_VALUE_LENGTH) : value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function auditData(entry: AuditEntry): Prisma.AuditEventUncheckedCreateInput {
  const details = safeDetails(entry.details);
  return {
    actorUserId: entry.actorUserId ?? null,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    workspaceId: entry.workspaceId ?? null,
    outcome: entry.outcome ?? 'success',
    ...(details ? { details } : {}),
    requestId: entry.requestId ?? null,
  };
}

type Tx = Pick<PrismaClient, 'auditEvent'>;

/** Writes the event inside the caller's transaction, so it commits or rolls back with the change. */
export async function auditInTransaction(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditEvent.create({ data: auditData(entry) });
}

export interface AuditWriter {
  /** Separate short transaction for failure and security events. Never throws. */
  record(entry: AuditEntry): Promise<void>;
}

export function createAuditWriter(prisma: PrismaClient, logger: Logger): AuditWriter {
  return {
    async record(entry) {
      try {
        await prisma.auditEvent.create({ data: auditData(entry) });
      } catch (err) {
        // DM §9.4: if the separate audit write fails, the request still returns its normal answer.
        logger.error('audit write failed', { action: entry.action, requestId: entry.requestId, err });
      }
    },
  };
}

export interface AuditReader {
  /** Newest first, keyset-paginated by id. */
  list(input: { limit: number; before?: bigint; actionPrefix?: string }): Promise<AuditEventView[]>;
}

export function createAuditReader(prisma: PrismaClient): AuditReader {
  return {
    async list({ limit, before, actionPrefix }) {
      const rows = await prisma.auditEvent.findMany({
        where: {
          ...(before ? { id: { lt: before } } : {}),
          ...(actionPrefix ? { action: { startsWith: actionPrefix } } : {}),
        },
        orderBy: { id: 'desc' },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id.toString(),
        occurredAt: row.occurredAt.toISOString(),
        actorUserId: row.actorUserId,
        actorRole: row.actorRole,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        workspaceId: row.workspaceId,
        outcome: row.outcome,
        details: row.details,
        requestId: row.requestId,
      }));
    },
  };
}
