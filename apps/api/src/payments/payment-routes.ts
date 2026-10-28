import express, { Router, type Response } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer, requireStaff } from '../auth/authorize.ts';
import { errorBody } from '../errors.ts';
import { conflict, handle, isUuid, limitParam, notFound, rejected, requireJson, unavailable, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import { ENTITLEMENT_KEY } from './payment-config.ts';
import type { PaymentService } from './payment-service.ts';
import type { PaymentStore, PlanInput, PlanPatch } from './payment-store.ts';

// Plans, orders, payments and entitlements over HTTP (F-ORD-01 to F-ORD-07, F-ADM-04, F-ADM-05).
// Customers reach only their own orders (another id is 404, AS-ORD-16). Amounts never come from
// the request. Admin routes need `catalogue.manage` (plans) or `payments.read` / `payments.manage`.

type Body = Record<string, unknown>;
const asBody = (raw: unknown): Body | undefined => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Body) : undefined);

function unknownFields(body: Body, allowed: readonly string[], fields: Record<string, string>) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
}

const PRICE_MAX = 100_000_000_000n;

function readPrice(value: unknown): bigint | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    value = String(value);
  }
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
    return undefined;
  }
  const n = BigInt(value);
  return n > 0n && n <= PRICE_MAX ? n : undefined;
}

function readKeys(value: unknown, fields: Record<string, string>): string[] | undefined {
  if (!Array.isArray(value) || value.length > 20 || !value.every((k) => typeof k === 'string' && ENTITLEMENT_KEY.test(k) && k.length <= 80)) {
    fields.entitlementKeys = 'Use up to 20 keys like family.export (lower case, dots between words).';
    return undefined;
  }
  return [...new Set(value as string[])];
}

export function validatePlan(raw: unknown, currency: string, partial: boolean): { ok: true; value: PlanInput | PlanPatch } | { ok: false; fields: Record<string, string> } {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  unknownFields(body, partial ? ['name', 'description', 'priceMinor', 'status', 'entitlementKeys'] : ['serviceId', 'name', 'description', 'priceMinor', 'currency', 'entitlementKeys'], fields);
  const out: Record<string, unknown> = {};
  if (!partial) {
    if (!isUuid(body.serviceId)) {
      fields.serviceId = 'Choose a service.';
    } else {
      out.serviceId = body.serviceId.toLowerCase();
    }
    // Prices are in the configured currency only (DM §6.1); other currencies are a decision (DQ-2).
    if (body.currency !== undefined && body.currency !== currency) {
      fields.currency = `Prices are in ${currency}.`;
    }
    out.currency = currency;
  }
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim() === '' || body.name.trim().length > 120) {
      fields.name = 'Enter a name of up to 120 characters.';
    } else {
      out.name = body.name.trim();
    }
  }
  if (!partial || body.description !== undefined) {
    const d = body.description ?? '';
    if (typeof d !== 'string' || d.length > 2000) {
      fields.description = 'Use at most 2,000 characters.';
    } else {
      out.description = d.trim();
    }
  }
  if (!partial || body.priceMinor !== undefined) {
    const price = readPrice(body.priceMinor);
    if (price === undefined) {
      fields.priceMinor = 'Enter a positive whole amount in minor units (e.g. paise).';
    } else {
      out.priceMinor = price;
    }
  }
  if (partial && body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'inactive') {
      fields.status = 'Choose active or inactive.';
    } else {
      out.status = body.status;
    }
  }
  if (!partial || body.entitlementKeys !== undefined) {
    const keys = readKeys(body.entitlementKeys ?? [], fields);
    if (keys) {
      out.entitlementKeys = keys;
    }
  }
  if (partial && Object.keys(body).length === 0) {
    fields.body = 'Change at least one field.';
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: out as unknown as PlanInput | PlanPatch };
}

export interface PaymentRouteOptions {
  auth?: AuthService;
  service?: PaymentService;
  store?: PaymentStore;
  logger: Logger;
}

const id = (raw: unknown) => {
  const value = String(raw).toLowerCase();
  return isUuid(value) ? value : undefined;
};

function notConfigured(res: Response) {
  unavailable(res, 'Payments are not available yet.');
}

/** The signed provider webhook. Mounted BEFORE the JSON parser: the signature is over the raw bytes. */
export function paymentWebhookRoutes({ service, logger }: Pick<PaymentRouteOptions, 'service' | 'logger'>): Router {
  const router = Router();
  router.post(
    '/payments/webhooks/razorpay',
    express.raw({ type: () => true, limit: '256kb' }),
    handle(service, logger, async (s, req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await s.webhook(raw, { signature: req.get('x-razorpay-signature') ?? undefined, eventId: req.get('x-razorpay-event-id') ?? undefined });
      if (result.kind === 'not_configured') {
        notConfigured(res);
        return;
      }
      if (result.kind !== 'ok') {
        res.status(400).json(errorBody('INVALID_WEBHOOK', 'Invalid webhook', getRequestId(res)));
        return;
      }
      // 2xx only after the event and its effects have committed; Grant runs after the response.
      res.status(200).json({ received: true, duplicate: result.duplicate });
      if (result.grantFor) {
        void s.grantNow(result.grantFor, { role: 'system', requestId: getRequestId(res) });
      }
    }),
  );
  return router;
}

export function paymentRoutes({ auth, service, store, logger }: PaymentRouteOptions): Router {
  const router = Router();
  const customer = requireCustomer(auth, logger);
  const catalogue = requireStaff(auth, logger, 'catalogue.manage');
  const paymentsRead = requireStaff(auth, logger, 'payments.read');
  const paymentsManage = requireStaff(auth, logger, 'payments.manage');
  const both = service && store ? { service, store } : undefined;

  // ---- Public ----

  router.get(
    '/plans',
    handle(store, logger, async (s, _req, res) => {
      res.json({ plans: await s.listPlans({ activeOnly: true }) });
    }),
  );

  router.get(
    '/payments/status',
    handle(service, logger, async (s, _req, res) => {
      res.json({ payments: s.status });
    }),
  );

  // ---- Customer ----

  router.post(
    '/orders',
    customer,
    requireJson,
    handle(service, logger, async (s, req, res) => {
      const body = asBody(req.body);
      const fields: Record<string, string> = {};
      if (!body) {
        validationFailed(res, { body: 'Send a JSON object.' });
        return;
      }
      unknownFields(body, ['planId', 'idempotencyKey'], fields);
      if (!isUuid(body.planId)) {
        fields.planId = 'Choose a plan.';
      }
      if (!isUuid(body.idempotencyKey)) {
        fields.idempotencyKey = 'Reload the page and try again.';
      }
      if (Object.keys(fields).length > 0) {
        validationFailed(res, fields);
        return;
      }
      const result = await s.createOrder(actorOf(res).userId, { planId: String(body.planId).toLowerCase(), idempotencyKey: String(body.idempotencyKey).toLowerCase() }, getRequestId(res));
      switch (result.kind) {
        case 'created':
        case 'existing':
          res.status(result.kind === 'created' ? 201 : 200).json({ order: result.order, checkout: result.checkout });
          return;
        case 'not_configured':
          notConfigured(res);
          return;
        case 'plan_unavailable':
          conflict(res, 'PLAN_UNAVAILABLE', 'This plan is not available. Reload to see the current plans.');
          return;
        case 'key_reused':
          conflict(res, 'IDEMPOTENCY_KEY_REUSED', 'This request was already used for another plan. Reload and try again.');
          return;
        case 'provider_unavailable':
          unavailable(res, 'We could not start the payment. Nothing was charged; please try again.');
          return;
      }
    }),
  );

  router.get(
    '/orders',
    customer,
    handle(store, logger, async (s, req, res) => {
      const before = typeof req.query.before === 'string' ? req.query.before.slice(0, 80) : undefined;
      res.json(await s.listCustomerOrders(actorOf(res).userId, { limit: limitParam(req.query.limit, 20, 50), ...(before ? { before } : {}) }));
    }),
  );

  router.get(
    '/orders/:id',
    customer,
    handle(store, logger, async (s, req, res) => {
      const orderId = id(req.params.id);
      const record = orderId ? await s.customerOrder(actorOf(res).userId, orderId) : undefined;
      if (!record) {
        notFound(res);
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ order: record.view });
    }),
  );

  router.post(
    '/orders/:id/checkout',
    customer,
    handle(service, logger, async (s, req, res) => {
      const orderId = id(req.params.id);
      const result = orderId ? await s.resume(actorOf(res).userId, orderId) : { kind: 'not_found' as const };
      if (result.kind === 'ok') {
        res.json({ order: result.order, checkout: result.checkout });
      } else if (result.kind === 'paid') {
        conflict(res, 'ALREADY_PAID', 'This order is already paid.');
      } else if (result.kind === 'not_configured') {
        notConfigured(res);
      } else {
        notFound(res);
      }
    }),
  );

  router.post(
    '/orders/:id/verify',
    customer,
    requireJson,
    handle(service, logger, async (s, req, res) => {
      const orderId = id(req.params.id);
      const body = asBody(req.body);
      const fields: Record<string, string> = {};
      if (body) {
        unknownFields(body, ['providerPaymentId', 'signature'], fields);
      }
      if (!body || typeof body.providerPaymentId !== 'string' || !/^[A-Za-z0-9_]{6,64}$/.test(body.providerPaymentId)) {
        fields.providerPaymentId = 'Missing payment reference.';
      }
      if (!body || typeof body.signature !== 'string' || body.signature.length > 200) {
        fields.signature = 'Missing payment signature.';
      }
      if (!orderId) {
        notFound(res);
        return;
      }
      if (Object.keys(fields).length > 0) {
        validationFailed(res, fields);
        return;
      }
      const result = await s.verify(actorOf(res).userId, orderId, { providerPaymentId: String(body!.providerPaymentId), signature: String(body!.signature) }, getRequestId(res));
      if (result.kind === 'not_found') {
        notFound(res);
      } else if (result.kind === 'invalid_signature') {
        res.status(400).json(errorBody('INVALID_SIGNATURE', 'The payment could not be verified.', getRequestId(res)));
      } else {
        // 202 while the payment is still being confirmed (the webhook or reconciliation completes it).
        res.status(result.kind === 'pending' ? 202 : 200).json({ result: result.kind, order: result.order });
      }
    }),
  );

  router.get(
    '/me/entitlements',
    customer,
    handle(store, logger, async (s, _req, res) => {
      res.json({ entitlements: await s.entitlementsOf(actorOf(res).userId) });
    }),
  );

  // Development provider only: the simulated gateway "page". Any other provider answers 404.
  router.post(
    '/orders/:id/simulate',
    customer,
    requireJson,
    handle(service, logger, async (s, req, res) => {
      const orderId = id(req.params.id);
      const outcome = asBody(req.body)?.outcome;
      if (outcome !== 'success' && outcome !== 'failure') {
        validationFailed(res, { outcome: 'Choose success or failure.' });
        return;
      }
      const result = orderId ? await s.simulate(actorOf(res).userId, orderId, outcome) : undefined;
      if (!result) {
        notFound(res);
        return;
      }
      res.json(result);
    }),
  );

  // ---- Admin: plans (F-ADM-04) ----

  router.get(
    '/admin/plans',
    catalogue,
    handle(store, logger, async (s, _req, res) => {
      res.json({ plans: await s.listPlans({ activeOnly: false }), payments: service?.status ?? null });
    }),
  );

  router.post(
    '/admin/plans',
    catalogue,
    requireJson,
    handle(both, logger, async ({ store: s, service: svc }, req, res) => {
      const parsed = validatePlan(req.body, svc.status.currency, false);
      if (!parsed.ok) {
        validationFailed(res, parsed.fields);
        return;
      }
      const result = await s.createPlan(parsed.value as PlanInput, { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) });
      if (!result.ok) {
        rejected(res, 'SERVICE_NOT_FOUND', 'Choose an existing service.');
        return;
      }
      res.status(201).json({ plan: result.plan });
    }),
  );

  router.patch(
    '/admin/plans/:id',
    catalogue,
    requireJson,
    handle(both, logger, async ({ store: s, service: svc }, req, res) => {
      const planId = id(req.params.id);
      if (!planId) {
        notFound(res);
        return;
      }
      const parsed = validatePlan(req.body, svc.status.currency, true);
      if (!parsed.ok) {
        validationFailed(res, parsed.fields);
        return;
      }
      const result = await s.updatePlan(planId, parsed.value as PlanPatch, { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) });
      if (!result.ok) {
        notFound(res);
        return;
      }
      res.json({ plan: result.plan });
    }),
  );

  // ---- Admin: orders and payments (F-ADM-05) ----

  router.get(
    '/admin/orders',
    paymentsRead,
    handle(store, logger, async (s, req, res) => {
      const status = typeof req.query.status === 'string' && ['created', 'pending', 'paid', 'failed'].includes(req.query.status) ? (req.query.status as 'paid') : undefined;
      const before = typeof req.query.before === 'string' ? req.query.before.slice(0, 80) : undefined;
      res.json(await s.listOrders({ ...(status ? { status } : {}), attention: req.query.attention === '1', limit: limitParam(req.query.limit, 25, 100), ...(before ? { before } : {}) }));
    }),
  );

  router.get(
    '/admin/orders/:id',
    paymentsRead,
    handle(store, logger, async (s, req, res) => {
      const orderId = id(req.params.id);
      const detail = orderId ? await s.orderDetail(orderId) : undefined;
      if (!detail) {
        notFound(res);
        return;
      }
      res.json({ order: detail });
    }),
  );

  router.post(
    '/admin/orders/:id/regrant',
    paymentsManage,
    handle(both, logger, async ({ store: s, service: svc }, req, res) => {
      const orderId = id(req.params.id);
      const detail = orderId ? await s.orderDetail(orderId) : undefined;
      if (!detail) {
        notFound(res);
        return;
      }
      if (detail.status !== 'paid' || !detail.grant) {
        conflict(res, 'NOT_PAID', 'Only a paid order can be granted.');
        return;
      }
      const actor = { userId: actorOf(res).userId, role: 'admin' as const, requestId: getRequestId(res) };
      // Idempotent: an already-granted order gets no second entitlement (AS-ADM-08).
      if (detail.grant.status !== 'granted') {
        await s.reopenGrant(orderId!, actor);
        await svc.grantNow(orderId!, actor);
      }
      res.json({ order: await s.orderDetail(orderId!) });
    }),
  );

  router.get(
    '/admin/payments/attention',
    paymentsRead,
    handle(store, logger, async (s, _req, res) => {
      const [summary, orders, events] = await Promise.all([
        s.attentionSummary(30),
        s.listOrders({ attention: true, limit: 50 }),
        s.listWebhookEvents({ status: 'needs_attention', limit: 50 }),
      ]);
      res.json({ summary, orders: orders.orders, webhookEvents: events });
    }),
  );

  router.get(
    '/admin/payments/webhook-events',
    paymentsRead,
    handle(store, logger, async (s, req, res) => {
      const status = typeof req.query.status === 'string' && ['processed', 'ignored', 'needs_attention'].includes(req.query.status) ? (req.query.status as 'processed') : undefined;
      res.json({ events: await s.listWebhookEvents({ ...(status ? { status } : {}), limit: limitParam(req.query.limit, 50, 200) }) });
    }),
  );

  return router;
}
