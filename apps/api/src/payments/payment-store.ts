import type {
  AdminOrderDetail,
  AdminOrderView,
  EntitlementView,
  GrantStatus,
  OrderView,
  PaymentAttemptView,
  PlanView,
  WebhookEventView,
} from '@kulvriksh/shared';
import { auditData, auditInTransaction, type AuditRole } from '../audit/audit.ts';
import { maskMobileNumber } from '../auth/mobile.ts';
import { isDatabaseUnavailable, isUniqueViolation } from '../db-errors.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import type { WebhookEvent } from './provider.ts';

// Plans, orders, payments and entitlements in PostgreSQL (DM §6, Flows §5).
//
//   Confirm (transaction A): lock the order row, upsert the attempt by provider payment id, and
//     only for a captured payment whose amount and currency match the order's snapshot, move the
//     order to `paid` and create the `pending` grant. Forward-only; a paid order never changes.
//   Grant (transaction B): lock the grant row; create the plan's entitlements once (unique per
//     grant and key); mark the grant `granted`. A failure is recorded separately and retried.
//   Webhooks: the event row and its effects commit together; a duplicate event id is a no-op.
//
// No provider call ever happens inside these transactions.

type Tx = Prisma.TransactionClient;

export interface Actor {
  userId?: string;
  role: AuditRole;
  requestId?: string;
}

export interface PlanInput {
  serviceId: string;
  name: string;
  description: string;
  priceMinor: bigint;
  currency: string;
  entitlementKeys: string[];
}

export interface PlanPatch {
  name?: string;
  description?: string;
  priceMinor?: bigint;
  status?: 'active' | 'inactive';
  entitlementKeys?: string[];
}

/** The plan as it was when the order was created (DM §6.2). Later catalogue changes never affect it. */
export interface PlanSnapshot {
  planId: string;
  planName: string;
  serviceId: string;
  serviceName: string;
  priceMinor: string;
  currency: string;
  entitlementKeys: string[];
}

export interface PaymentEvidence {
  providerPaymentId: string;
  status: 'authorised' | 'captured' | 'failed';
  amountMinor: bigint;
  currency: string;
  failureCode: string | null;
}

export type ConfirmResult = 'paid_now' | 'already_paid' | 'mismatch' | 'updated' | 'unchanged' | 'foreign_payment' | 'not_found';

export interface OrderRecord {
  view: OrderView;
  provider: string;
  providerOrderId: string;
  planId: string;
}

/** Test seams for the failure cases the spec requires (AS-ORD-17, AS-ORD-19). Never set in production. */
export interface PaymentFaults {
  beforeGrantCommit?: () => void;
  afterWebhookInsert?: () => void;
}

export interface PaymentStore {
  listPlans(filter: { activeOnly: boolean }): Promise<PlanView[]>;
  createPlan(input: PlanInput, actor: Actor): Promise<{ ok: true; plan: PlanView } | { ok: false; reason: 'service_not_found' }>;
  updatePlan(id: string, patch: PlanPatch, actor: Actor): Promise<{ ok: true; plan: PlanView } | { ok: false; reason: 'not_found' }>;
  /** An active plan of an active service, ready to snapshot. */
  orderablePlan(planId: string): Promise<PlanSnapshot | undefined>;

  orderByIdempotencyKey(customerId: string, key: string): Promise<OrderRecord | undefined>;
  insertOrder(input: { id: string; customerId: string; idempotencyKey: string; snapshot: PlanSnapshot; provider: string; providerOrderId: string }, actor: Actor): Promise<OrderRecord>;
  customerOrder(customerId: string, orderId: string): Promise<OrderRecord | undefined>;
  listCustomerOrders(customerId: string, page: { limit: number; before?: string }): Promise<{ orders: OrderView[]; nextBefore: string | null }>;
  entitlementsOf(customerId: string): Promise<EntitlementView[]>;
  hasEntitlement(customerId: string, key: string): Promise<boolean>;

  confirm(orderId: string, evidence: PaymentEvidence, via: 'verify' | 'webhook' | 'reconciliation', actor: Actor): Promise<ConfirmResult>;
  grant(orderId: string, actor: Actor, retry: { maxAttempts: number; retrySeconds: number }): Promise<'granted' | 'already' | 'no_grant' | 'failed_attempt'>;
  /** Admin re-run: a failed grant goes back to pending first (F-ADM-05). */
  reopenGrant(orderId: string, actor: Actor): Promise<boolean>;
  processWebhook(event: WebhookEvent): Promise<{ duplicate: true } | { duplicate: false; status: WebhookEventView['status']; orderId?: string }>;

  /** Run leases on background_task_state (DM §10.1). Returns the lease token, or undefined if held. */
  claimTask(task: string, owner: string, leaseSeconds: number): Promise<string | undefined>;
  renewTask(task: string, token: string, leaseSeconds: number): Promise<boolean>;
  releaseTask(task: string, token: string): Promise<void>;
  ordersToReconcile(options: { minAgeSeconds: number; lookbackDays: number; limit: number }): Promise<Array<{ id: string; providerOrderId: string }>>;
  recordCheck(orderId: string, attentionAfterChecks: number): Promise<void>;
  grantsDue(limit: number): Promise<string[]>;

  listOrders(filter: { status?: OrderView['status']; attention?: boolean; limit: number; before?: string }): Promise<{ orders: AdminOrderView[]; nextBefore: string | null }>;
  orderDetail(orderId: string): Promise<AdminOrderDetail | undefined>;
  listWebhookEvents(filter: { status?: WebhookEventView['status']; limit: number }): Promise<WebhookEventView[]>;
  attentionSummary(pendingGrantMinutes: number): Promise<{ amountMismatch: number; unreconciled: number; grantsFailed: number; grantsStuck: number; webhookAttention: number }>;
  /** A failure or security event (e.g. a bad signature), in its own transaction. */
  auditFailure(entry: { actorUserId?: string; actorRole: AuditRole; action: string; targetId: string; reason: string; requestId?: string }): Promise<void>;
}

const planSelect = {
  id: true,
  serviceId: true,
  name: true,
  description: true,
  priceMinor: true,
  currency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  service: { select: { name: true } },
  entitlements: { select: { entitlementKey: true }, orderBy: { entitlementKey: 'asc' } },
} as const;

type PlanRow = Prisma.PlanGetPayload<{ select: typeof planSelect }>;

const toPlan = (row: PlanRow): PlanView => ({
  id: row.id,
  serviceId: row.serviceId,
  serviceName: row.service.name,
  name: row.name,
  description: row.description,
  priceMinor: Number(row.priceMinor),
  currency: row.currency,
  status: row.status,
  entitlementKeys: row.entitlements.map((e) => e.entitlementKey),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const orderSelect = {
  id: true,
  status: true,
  planId: true,
  planSnapshot: true,
  amountMinor: true,
  currency: true,
  provider: true,
  providerOrderId: true,
  createdAt: true,
  paidAt: true,
  attentionReason: true,
  grant: { select: { status: true } },
} as const;

type OrderRow = Prisma.CustomerOrderGetPayload<{ select: typeof orderSelect }>;

const snapshotOf = (row: { planSnapshot: unknown }) => row.planSnapshot as PlanSnapshot;

const toOrder = (row: OrderRow): OrderView => ({
  id: row.id,
  status: row.status,
  planId: row.planId,
  planName: snapshotOf(row).planName,
  serviceName: snapshotOf(row).serviceName,
  amountMinor: Number(row.amountMinor),
  currency: row.currency,
  provider: row.provider,
  createdAt: row.createdAt.toISOString(),
  paidAt: row.paidAt?.toISOString() ?? null,
  grantStatus: (row.grant?.status ?? null) as GrantStatus | null,
  attentionReason: row.attentionReason,
});

const toRecord = (row: OrderRow): OrderRecord => ({ view: toOrder(row), provider: row.provider, providerOrderId: row.providerOrderId, planId: row.planId });

const adminOrderSelect = { ...orderSelect, customerUserId: true, reconcileCheckCount: true, reconcileLastCheckedAt: true, customer: { select: { customerProfile: { select: { mobileNumber: true } } } } } as const;
type AdminOrderRow = Prisma.CustomerOrderGetPayload<{ select: typeof adminOrderSelect }>;

const toAdminOrder = (row: AdminOrderRow): AdminOrderView => ({
  ...toOrder(row),
  customerUserId: row.customerUserId,
  customerMobileMasked: row.customer.customerProfile ? maskMobileNumber(row.customer.customerProfile.mobileNumber) : '',
  providerOrderId: row.providerOrderId,
  reconcileCheckCount: row.reconcileCheckCount,
  reconcileLastCheckedAt: row.reconcileLastCheckedAt?.toISOString() ?? null,
});

const toAttempt = (row: Prisma.PaymentAttemptGetPayload<object>): PaymentAttemptView => ({
  id: row.id,
  providerPaymentId: row.providerPaymentId,
  status: row.status,
  amountMinor: Number(row.amountMinor),
  currency: row.currency,
  capturedAt: row.capturedAt?.toISOString() ?? null,
  failureCode: row.failureCode,
  firstSeenVia: row.firstSeenVia,
  createdAt: row.createdAt.toISOString(),
});

const toEvent = (row: Prisma.WebhookEventGetPayload<object>): WebhookEventView => ({
  id: row.id,
  providerEventId: row.providerEventId,
  eventType: row.eventType,
  status: row.status,
  attentionReason: row.attentionReason,
  relatedOrderId: row.relatedOrderId,
  receivedAt: row.receivedAt.toISOString(),
});

/** Keyset cursor "createdAtISO_id" for newest-first lists. */
function cursorWhere(before: string | undefined): Prisma.CustomerOrderWhereInput {
  const m = before ? /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/.exec(before) : null;
  if (!m) {
    return {};
  }
  const at = new Date(m[1]!);
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: m[2]! } }] };
}
const cursorOf = (row: { createdAt: Date; id: string }) => `${row.createdAt.toISOString()}_${row.id}`;

async function confirmInTx(tx: Tx, orderId: string, ev: PaymentEvidence, via: 'verify' | 'webhook' | 'reconciliation', actor: Actor): Promise<ConfirmResult> {
  const rows = await tx.$queryRaw<Array<{ status: string; amount_minor: bigint; currency: string; customer_user_id: string }>>`
    SELECT status::text AS status, amount_minor, currency, customer_user_id::text AS customer_user_id
    FROM customer_order WHERE id = ${orderId}::uuid FOR UPDATE`;
  const order = rows[0];
  if (!order) {
    return 'not_found';
  }
  const existing = await tx.paymentAttempt.findUnique({ where: { providerPaymentId: ev.providerPaymentId }, select: { id: true, orderId: true, status: true } });
  if (existing && existing.orderId !== orderId) {
    return 'foreign_payment';
  }
  if (!existing) {
    await tx.paymentAttempt.create({
      data: {
        orderId,
        providerPaymentId: ev.providerPaymentId,
        status: ev.status,
        amountMinor: ev.amountMinor,
        currency: ev.currency,
        capturedAt: ev.status === 'captured' ? new Date() : null,
        failureCode: ev.failureCode,
        firstSeenVia: via,
      },
    });
  } else if (existing.status !== 'captured' && existing.status !== ev.status && !(existing.status === 'failed' && ev.status === 'authorised')) {
    // An attempt only moves forward: authorised → captured | failed; captured is final.
    await tx.paymentAttempt.update({
      where: { id: existing.id },
      data: { status: ev.status, ...(ev.status === 'captured' ? { capturedAt: new Date() } : {}), ...(ev.failureCode ? { failureCode: ev.failureCode } : {}) },
    });
  }
  if (order.status === 'paid') {
    return 'already_paid';
  }
  const audit = (action: string, outcome: 'success' | 'failure' = 'success', details: Record<string, string> = {}) =>
    auditInTransaction(tx, {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action,
      targetType: 'order',
      targetId: orderId,
      outcome,
      details: { via, ...details },
      requestId: actor.requestId,
    });
  if (ev.status === 'captured') {
    if (ev.amountMinor !== order.amount_minor || ev.currency !== order.currency) {
      // AS-ORD-09: never paid on a mismatch; an admin follows up.
      await tx.customerOrder.update({ where: { id: orderId }, data: { attentionReason: 'amount_mismatch' } });
      await audit('order.amount_mismatch', 'failure');
      return 'mismatch';
    }
    await tx.customerOrder.update({ where: { id: orderId }, data: { status: 'paid', paidAt: new Date(), attentionReason: null } });
    await tx.entitlementGrant.create({ data: { orderId } });
    await audit('order.paid');
    return 'paid_now';
  }
  const next = ev.status === 'authorised' ? 'pending' : 'failed';
  if (order.status === next) {
    return 'unchanged';
  }
  await tx.customerOrder.update({ where: { id: orderId }, data: { status: next } });
  await audit(`order.${next}`);
  return 'updated';
}

export function createPrismaPaymentStore(prisma: PrismaClient, faults: PaymentFaults = {}): PaymentStore {
  const getPlan = async (id: string) => {
    const row = await prisma.plan.findUnique({ where: { id }, select: planSelect });
    return row ? toPlan(row) : undefined;
  };

  return {
    async listPlans({ activeOnly }) {
      const rows = await prisma.plan.findMany({
        where: activeOnly ? { status: 'active', service: { status: 'active' } } : {},
        select: planSelect,
        orderBy: [{ priceMinor: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      return rows.map(toPlan);
    },

    async createPlan(input, actor) {
      return prisma.$transaction(async (tx) => {
        if (!(await tx.service.findUnique({ where: { id: input.serviceId }, select: { id: true } }))) {
          return { ok: false, reason: 'service_not_found' } as const;
        }
        // New plans start inactive (AS-ORD-03 relies on explicit activation).
        const row = await tx.plan.create({
          data: {
            serviceId: input.serviceId,
            name: input.name,
            description: input.description,
            priceMinor: input.priceMinor,
            currency: input.currency,
            entitlements: { create: input.entitlementKeys.map((entitlementKey) => ({ entitlementKey })) },
          },
          select: { id: true },
        });
        await auditInTransaction(tx, {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'plan.created',
          targetType: 'plan',
          targetId: row.id,
          details: { priceMinor: String(input.priceMinor), currency: input.currency },
          requestId: actor.requestId,
        });
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: row.id }, select: planSelect });
        return { ok: true, plan: toPlan(plan) } as const;
      });
    },

    async updatePlan(id, patch, actor) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.plan.findUnique({ where: { id }, select: { priceMinor: true, status: true } });
        if (!current) {
          return { ok: false, reason: 'not_found' } as const;
        }
        const { entitlementKeys, ...fields } = patch;
        await tx.plan.update({ where: { id }, data: fields });
        if (entitlementKeys) {
          // Existing orders keep their snapshot, so changing the mapping affects only new orders.
          await tx.planEntitlement.deleteMany({ where: { planId: id } });
          await tx.planEntitlement.createMany({ data: entitlementKeys.map((entitlementKey) => ({ planId: id, entitlementKey })) });
        }
        const action =
          patch.status !== undefined && patch.status !== current.status
            ? `plan.${patch.status === 'active' ? 'activated' : 'deactivated'}`
            : patch.priceMinor !== undefined && patch.priceMinor !== current.priceMinor
              ? 'plan.price_changed'
              : 'plan.updated';
        await auditInTransaction(tx, {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action,
          targetType: 'plan',
          targetId: id,
          details: {
            fields: Object.keys(patch).join(','),
            ...(patch.priceMinor !== undefined ? { fromPriceMinor: String(current.priceMinor), toPriceMinor: String(patch.priceMinor) } : {}),
          },
          requestId: actor.requestId,
        });
        return { ok: true, plan: (await getPlan(id)) ?? toPlan(await tx.plan.findUniqueOrThrow({ where: { id }, select: planSelect })) } as const;
      });
    },

    async orderablePlan(planId) {
      const row = await prisma.plan.findFirst({ where: { id: planId, status: 'active', service: { status: 'active' } }, select: planSelect });
      return row
        ? {
            planId: row.id,
            planName: row.name,
            serviceId: row.serviceId,
            serviceName: row.service.name,
            priceMinor: String(row.priceMinor),
            currency: row.currency,
            entitlementKeys: row.entitlements.map((e) => e.entitlementKey),
          }
        : undefined;
    },

    async orderByIdempotencyKey(customerId, key) {
      const row = await prisma.customerOrder.findUnique({ where: { customerUserId_idempotencyKey: { customerUserId: customerId, idempotencyKey: key } }, select: orderSelect });
      return row ? toRecord(row) : undefined;
    },

    async insertOrder({ id, customerId, idempotencyKey, snapshot, provider, providerOrderId }, actor) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.customerOrder.create({
          data: {
            id,
            customerUserId: customerId,
            planId: snapshot.planId,
            idempotencyKey,
            provider,
            providerOrderId,
            amountMinor: BigInt(snapshot.priceMinor),
            currency: snapshot.currency,
            planSnapshot: snapshot as unknown as Prisma.InputJsonObject,
          },
          select: orderSelect,
        });
        await auditInTransaction(tx, {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'order.created',
          targetType: 'order',
          targetId: id,
          details: { planId: snapshot.planId, amountMinor: snapshot.priceMinor, currency: snapshot.currency },
          requestId: actor.requestId,
        });
        return toRecord(row);
      });
    },

    async customerOrder(customerId, orderId) {
      const row = await prisma.customerOrder.findFirst({ where: { id: orderId, customerUserId: customerId }, select: orderSelect });
      return row ? toRecord(row) : undefined;
    },

    async listCustomerOrders(customerId, { limit, before }) {
      const rows = await prisma.customerOrder.findMany({
        where: { customerUserId: customerId, ...cursorWhere(before) },
        select: orderSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return { orders: page.map(toOrder), nextBefore: rows.length > limit ? cursorOf(page[page.length - 1]!) : null };
    },

    async entitlementsOf(customerId) {
      const rows = await prisma.entitlement.findMany({
        where: { customerUserId: customerId, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
        select: { entitlementKey: true, validFrom: true, validUntil: true, grant: { select: { orderId: true } } },
        orderBy: [{ validFrom: 'desc' }],
        take: 200,
      });
      return rows.map((r) => ({ key: r.entitlementKey, validFrom: r.validFrom.toISOString(), validUntil: r.validUntil?.toISOString() ?? null, orderId: r.grant.orderId }));
    },

    async hasEntitlement(customerId, key) {
      const n = await prisma.entitlement.count({ where: { customerUserId: customerId, entitlementKey: key, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] } });
      return n > 0;
    },

    async confirm(orderId, evidence, via, actor) {
      try {
        return await prisma.$transaction((tx) => confirmInTx(tx, orderId, evidence, via, actor));
      } catch (err) {
        // Two first sightings of one payment raced on the unique key; the second simply re-runs.
        if (isUniqueViolation(err)) {
          return prisma.$transaction((tx) => confirmInTx(tx, orderId, evidence, via, actor));
        }
        throw err;
      }
    },

    async grant(orderId, actor, { maxAttempts, retrySeconds }) {
      try {
        return await prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
            SELECT id::text AS id, status::text AS status FROM entitlement_grant WHERE order_id = ${orderId}::uuid FOR UPDATE`;
          const grant = locked[0];
          if (!grant) {
            return 'no_grant' as const;
          }
          if (grant.status === 'granted') {
            return 'already' as const;
          }
          const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, customerUserId: true, planSnapshot: true } });
          if (order.status !== 'paid') {
            throw new Error('grant on an order that is not paid');
          }
          const keys = snapshotOf(order).entitlementKeys ?? [];
          await tx.entitlement.createMany({
            data: keys.map((entitlementKey) => ({ grantId: grant.id, customerUserId: order.customerUserId, entitlementKey })),
            skipDuplicates: true,
          });
          faults.beforeGrantCommit?.();
          await tx.entitlementGrant.update({
            where: { id: grant.id },
            data: { status: 'granted', grantedAt: new Date(), failedAt: null, lastError: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null },
          });
          await auditInTransaction(tx, {
            actorUserId: actor.userId,
            actorRole: actor.role,
            action: 'entitlement.granted',
            targetType: 'order',
            targetId: orderId,
            details: { keys: keys.join(',') },
            requestId: actor.requestId,
          });
          return 'granted' as const;
        });
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          throw err;
        }
        // The grant transaction rolled back; record the attempt on its own (F-ORD-03).
        const reason = (err instanceof Error ? err.message : 'grant failed').slice(0, 200);
        await prisma.$executeRaw`
          UPDATE entitlement_grant SET attempt_count = attempt_count + 1, last_error = ${reason},
            next_attempt_at = now() + make_interval(secs => ${retrySeconds}),
            status = CASE WHEN attempt_count + 1 >= ${maxAttempts} THEN 'failed'::grant_status ELSE status END,
            failed_at = CASE WHEN attempt_count + 1 >= ${maxAttempts} THEN now() ELSE failed_at END, updated_at = now()
          WHERE order_id = ${orderId}::uuid AND status = 'pending'`;
        return 'failed_attempt';
      }
    },

    async reopenGrant(orderId, actor) {
      return prisma.$transaction(async (tx) => {
        const n = await tx.entitlementGrant.updateMany({ where: { orderId, status: { in: ['failed', 'pending'] } }, data: { status: 'pending', failedAt: null, nextAttemptAt: null } });
        await auditInTransaction(tx, {
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'entitlement.regrant_requested',
          targetType: 'order',
          targetId: orderId,
          requestId: actor.requestId,
        });
        return n.count === 1;
      });
    },

    async processWebhook(event) {
      const run = () =>
        prisma.$transaction(async (tx) => {
          // The unique event id makes a redelivery (or a concurrent duplicate) a conflict here.
          const row = await tx.webhookEvent.create({
            data: { providerEventId: event.eventId, eventType: event.eventType, status: 'processed', payloadExcerpt: event.excerpt },
            select: { id: true },
          });
          faults.afterWebhookInsert?.();
          let status: WebhookEventView['status'] = 'processed';
          let reason: string | null = null;
          let orderId: string | undefined;
          const paymentEvent = ['payment.authorized', 'payment.captured', 'payment.failed', 'order.paid'].includes(event.eventType);
          if (!paymentEvent) {
            // Refunds are excluded (D3); other event types are not used.
            status = 'ignored';
          } else if (!event.payment || event.payment.status === 'created' || event.payment.status === 'refunded') {
            status = 'needs_attention';
            reason = 'no_usable_payment';
          } else {
            const order = event.providerOrderId
              ? await tx.customerOrder.findUnique({ where: { providerOrderId: event.providerOrderId }, select: { id: true } })
              : null;
            if (!order) {
              status = 'needs_attention';
              reason = 'unknown_order';
            } else {
              orderId = order.id;
              const p = event.payment;
              const result = await confirmInTx(
                tx,
                order.id,
                {
                  providerPaymentId: p.id,
                  status: p.status === 'authorized' ? 'authorised' : p.status === 'captured' ? 'captured' : 'failed',
                  amountMinor: p.amountMinor,
                  currency: p.currency,
                  failureCode: p.errorCode,
                },
                'webhook',
                { role: 'system' },
              );
              if (result === 'mismatch') {
                status = 'needs_attention';
                reason = 'amount_mismatch';
              } else if (result === 'foreign_payment') {
                status = 'needs_attention';
                reason = 'payment_order_mismatch';
              }
            }
          }
          await tx.webhookEvent.update({ where: { id: row.id }, data: { status, attentionReason: reason, relatedOrderId: orderId ?? null } });
          return { duplicate: false, status, ...(orderId ? { orderId } : {}) } as const;
        });
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await run();
        } catch (err) {
          if (!isUniqueViolation(err)) {
            throw err;
          }
          // Either this event was already stored (a redelivery: nothing to do), or the same payment
          // was first recorded by a concurrent verify call; then the event is applied again.
          if ((await prisma.webhookEvent.count({ where: { providerEventId: event.eventId } })) > 0) {
            return { duplicate: true };
          }
          if (attempt >= 2) {
            throw err; // 5xx: the provider redelivers later
          }
        }
      }
    },

    async claimTask(task, owner, leaseSeconds) {
      const rows = await prisma.$queryRaw<Array<{ token: string }>>`
        INSERT INTO background_task_state (task_name, lease_owner, lease_token, lease_expires_at, last_run_started_at)
        VALUES (${task}, ${owner}, gen_random_uuid(), now() + make_interval(secs => ${leaseSeconds}), now())
        ON CONFLICT (task_name) DO UPDATE SET lease_owner = EXCLUDED.lease_owner, lease_token = EXCLUDED.lease_token,
          lease_expires_at = EXCLUDED.lease_expires_at, last_run_started_at = now()
        WHERE background_task_state.lease_expires_at IS NULL OR background_task_state.lease_expires_at < now()
        RETURNING lease_token::text AS token`;
      return rows[0]?.token;
    },

    async renewTask(task, token, leaseSeconds) {
      const n = await prisma.$executeRaw`
        UPDATE background_task_state SET lease_expires_at = now() + make_interval(secs => ${leaseSeconds})
        WHERE task_name = ${task} AND lease_token = ${token}::uuid`;
      return n === 1;
    },

    async releaseTask(task, token) {
      await prisma.$executeRaw`
        UPDATE background_task_state SET lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, last_run_finished_at = now()
        WHERE task_name = ${task} AND lease_token = ${token}::uuid`;
    },

    async ordersToReconcile({ minAgeSeconds, lookbackDays, limit }) {
      const rows = await prisma.$queryRaw<Array<{ id: string; provider_order_id: string }>>`
        SELECT id::text AS id, provider_order_id FROM customer_order
        WHERE status IN ('created', 'pending', 'failed')
          AND created_at < now() - make_interval(secs => ${minAgeSeconds})
          AND created_at > now() - make_interval(days => ${lookbackDays})
        ORDER BY reconcile_last_checked_at ASC NULLS FIRST, created_at ASC
        LIMIT ${limit}`;
      return rows.map((r) => ({ id: r.id, providerOrderId: r.provider_order_id }));
    },

    async recordCheck(orderId, attentionAfterChecks) {
      await prisma.$executeRaw`
        UPDATE customer_order SET reconcile_last_checked_at = now(), reconcile_check_count = reconcile_check_count + 1,
          attention_reason = CASE WHEN status <> 'paid' AND reconcile_check_count + 1 >= ${attentionAfterChecks} AND attention_reason IS NULL
            THEN 'unreconciled'::order_attention_reason ELSE attention_reason END,
          updated_at = now()
        WHERE id = ${orderId}::uuid`;
    },

    async grantsDue(limit) {
      const rows = await prisma.entitlementGrant.findMany({
        where: { status: 'pending', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        select: { orderId: true },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      return rows.map((r) => r.orderId);
    },

    async listOrders({ status, attention, limit, before }) {
      const rows = await prisma.customerOrder.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(attention ? { OR: [{ attentionReason: { not: null } }, { grant: { status: 'failed' } }] } : {}),
          ...cursorWhere(before),
        },
        select: adminOrderSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return { orders: page.map(toAdminOrder), nextBefore: rows.length > limit ? cursorOf(page[page.length - 1]!) : null };
    },

    async orderDetail(orderId) {
      const row = await prisma.customerOrder.findUnique({
        where: { id: orderId },
        select: {
          ...adminOrderSelect,
          attempts: { orderBy: { createdAt: 'asc' }, take: 50 },
          webhookEvents: { orderBy: { receivedAt: 'asc' }, take: 50 },
          grant: { select: { status: true, attemptCount: true, lastError: true, grantedAt: true, failedAt: true, entitlements: { select: { entitlementKey: true, validFrom: true, validUntil: true } } } },
        },
      });
      if (!row) {
        return undefined;
      }
      return {
        ...toAdminOrder(row),
        planSnapshot: row.planSnapshot,
        attempts: row.attempts.map(toAttempt),
        webhookEvents: row.webhookEvents.map(toEvent),
        grant: row.grant
          ? {
              status: row.grant.status,
              attemptCount: row.grant.attemptCount,
              lastError: row.grant.lastError,
              grantedAt: row.grant.grantedAt?.toISOString() ?? null,
              failedAt: row.grant.failedAt?.toISOString() ?? null,
            }
          : null,
        entitlements: (row.grant?.entitlements ?? []).map((e) => ({ key: e.entitlementKey, validFrom: e.validFrom.toISOString(), validUntil: e.validUntil?.toISOString() ?? null, orderId: row.id })),
      };
    },

    async listWebhookEvents({ status, limit }) {
      const rows = await prisma.webhookEvent.findMany({ where: status ? { status } : {}, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: limit });
      return rows.map(toEvent);
    },

    async attentionSummary(pendingGrantMinutes) {
      const stuckBefore = new Date(Date.now() - pendingGrantMinutes * 60_000);
      const [amountMismatch, unreconciled, grantsFailed, grantsStuck, webhookAttention] = await Promise.all([
        prisma.customerOrder.count({ where: { attentionReason: 'amount_mismatch' } }),
        prisma.customerOrder.count({ where: { attentionReason: 'unreconciled', status: { not: 'paid' } } }),
        prisma.entitlementGrant.count({ where: { status: 'failed' } }),
        prisma.entitlementGrant.count({ where: { status: 'pending', createdAt: { lt: stuckBefore } } }),
        prisma.webhookEvent.count({ where: { status: 'needs_attention' } }),
      ]);
      return { amountMismatch, unreconciled, grantsFailed, grantsStuck, webhookAttention };
    },

    auditFailure: (entry) => auditPaymentFailure(prisma, entry),
  };
}

/** Failure and security events about payments (e.g. a bad signature), in their own transaction. */
export async function auditPaymentFailure(prisma: PrismaClient, entry: { actorUserId?: string; actorRole: AuditRole; action: string; targetId: string; reason: string; requestId?: string }) {
  await prisma.auditEvent
    .create({
      data: auditData({
        actorUserId: entry.actorUserId,
        actorRole: entry.actorRole,
        action: entry.action,
        targetType: 'order',
        targetId: entry.targetId,
        outcome: 'failure',
        details: { reason: entry.reason },
        requestId: entry.requestId,
      }),
    })
    .catch(() => undefined);
}
