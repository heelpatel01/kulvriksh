// Plans, orders, payments and entitlements against the real test database (`npm run test:db`),
// with the Razorpay adapter talking to a local test double of the Razorpay API. Covers the
// acceptance criteria of Flows §5 (AS-ORD-01 to AS-ORD-23, AS-ADM-06/08). TASK-11.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import type { AdminOrderDetail, CheckoutView, OrderView, PlanView } from '@kulvriksh/shared';
import { cleanup, harness, skip, trackService, type Harness } from '../testing/sprint-harness.ts';
import { startFakeRazorpay, type FakeRazorpay } from '../testing/fake-razorpay.ts';
import { readPaymentConfig } from './payment-config.ts';
import { createPaymentService } from './payment-service.ts';
import { createPrismaPaymentStore } from './payment-store.ts';
import { RazorpayProvider } from './provider.ts';

let fake: FakeRazorpay;
let h: Harness; // Razorpay adapter → test double; export gated by family.export
let none: Harness; // PAYMENT_PROVIDER=none
let faulty: Harness; // grant and webhook fault injection
const faults = { grant: false, webhook: false };

const recon = { minAgeSeconds: 0, lookbackDays: 7, batchSize: 50, attentionAfterChecks: 3, intervalSeconds: 600 };

before(async () => {
  if (skip) {
    return;
  }
  fake = await startFakeRazorpay();
  const provider = () => new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: fake.url, mode: 'test' }, 1500);
  h = await harness({ payments: { provider: provider(), config: { reconcile: recon, grant: { maxAttempts: 2, retrySeconds: 1 } }, gateExportWith: 'family.export' } });
  none = await harness();
  faulty = await harness({
    payments: {
      provider: provider(),
      config: { reconcile: recon, grant: { maxAttempts: 5, retrySeconds: 1 } },
      faults: {
        beforeGrantCommit: () => {
          if (faults.grant) {
            throw new Error('forced grant failure');
          }
        },
        afterWebhookInsert: () => {
          if (faults.webhook) {
            throw new Error('forced webhook failure');
          }
        },
      },
    },
  });
});

after(async () => {
  if (!skip) {
    for (const x of [h, none, faulty]) {
      await x.close();
    }
    await fake.close();
    await cleanup();
  }
});

type Err = { error: { code: string } };
type Created = { order: OrderView; checkout: CheckoutView };

/** An active service with an active plan granting `family.export`, created by an admin. */
async function catalogue(target: Harness, price = 49_900) {
  const admin = await target.staff('admin');
  const svc = await target.api<{ service: { id: string } }>(admin.token, 'POST', '/admin/services', { name: `itest-svc-${randomUUID().slice(0, 6)}`, description: 'Test service', status: 'active' });
  trackService(svc.body.service.id);
  const plan = await target.api<{ plan: PlanView }>(admin.token, 'POST', '/admin/plans', {
    serviceId: svc.body.service.id,
    name: 'Tree export',
    priceMinor: price,
    entitlementKeys: ['family.export'],
  });
  assert.equal(plan.status, 201);
  assert.equal(plan.body.plan.status, 'inactive', 'new plans start inactive');
  const active = await target.api<{ plan: PlanView }>(admin.token, 'PATCH', `/admin/plans/${plan.body.plan.id}`, { status: 'active' });
  return { admin, serviceId: svc.body.service.id, plan: active.body.plan };
}

const order = (target: Harness, token: string, planId: string, key = randomUUID()) => target.api<Created & Err>(token, 'POST', '/orders', { planId, idempotencyKey: key });

async function webhook(target: Harness, delivery: { body: string; signature: string; eventId: string }) {
  const res = await fetch(`${target.base}/api/v1/payments/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': delivery.signature, 'x-razorpay-event-id': delivery.eventId },
    body: delivery.body,
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const entitlements = async (target: Harness, userId: string) => target.db.prisma.entitlement.count({ where: { customerUserId: userId } });

test('catalogue: admin plans, validation, public list, inactive plans cannot be ordered; price changes keep order snapshots', { skip }, async () => {
  const { admin, plan, serviceId } = await catalogue(h, 25_000);
  const pub = await h.api<{ plans: PlanView[] }>(undefined, 'GET', '/plans');
  assert.ok(pub.body.plans.some((p) => p.id === plan.id && p.priceMinor === 25_000 && p.currency === 'INR'));
  const bad = await h.api<Err>(admin.token, 'POST', '/admin/plans', { serviceId, name: 'x', priceMinor: 0, currency: 'USD' });
  assert.deepEqual([bad.status, bad.body.error.code], [400, 'VALIDATION_FAILED']);
  // Customers and genealogists cannot manage plans.
  const c = await h.customer();
  const g = await h.staff('genealogist');
  assert.equal((await h.api(c.token, 'GET', '/admin/plans')).status, 403);
  assert.equal((await h.api(g.token, 'POST', '/admin/plans', { serviceId, name: 'x', priceMinor: 1 })).status, 403);
  // An order snapshots the price; a later price change does not alter it (AS-ADM-06).
  const created = await order(h, c.token, plan.id);
  assert.equal(created.status, 201);
  assert.equal(created.body.order.amountMinor, 25_000);
  await h.api(admin.token, 'PATCH', `/admin/plans/${plan.id}`, { priceMinor: 30_000 });
  const again = await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.body.order.id}`);
  assert.equal(again.body.order.amountMinor, 25_000);
  const audit = await h.db.prisma.auditEvent.findFirst({ where: { targetId: plan.id, action: 'plan.price_changed' }, select: { details: true } });
  assert.deepEqual(audit?.details, { fields: 'priceMinor', fromPriceMinor: '25000', toPriceMinor: '30000' });
  // Deactivated: gone from the public list and not orderable (AS-ORD-03).
  await h.api(admin.token, 'PATCH', `/admin/plans/${plan.id}`, { status: 'inactive' });
  assert.ok(!(await h.api<{ plans: PlanView[] }>(undefined, 'GET', '/plans')).body.plans.some((p) => p.id === plan.id));
  const refused = await order(h, c.token, plan.id);
  assert.deepEqual([refused.status, refused.body.error.code], [409, 'PLAN_UNAVAILABLE']);
});

test('orders: amount comes from the catalogue; one order per idempotency key, even concurrently; key reuse for another plan is 409', { skip }, async () => {
  const { plan, admin, serviceId } = await catalogue(h, 49_900);
  const c = await h.customer();
  // AS-ORD-01: a client amount is not accepted at all, and nothing is created.
  const tampered = await h.api<Err>(c.token, 'POST', '/orders', { planId: plan.id, idempotencyKey: randomUUID(), amountMinor: 1 });
  assert.equal(tampered.status, 400);
  assert.equal(await h.db.prisma.customerOrder.count({ where: { customerUserId: c.userId } }), 0);
  // AS-ORD-02: the same key (sequential and concurrent) gives one order and one provider order.
  const key = randomUUID();
  const before = fake.orders.size;
  const results = await Promise.all([1, 2, 3].map(() => order(h, c.token, plan.id, key)));
  const ids = new Set(results.map((r) => r.body.order.id));
  assert.equal(ids.size, 1);
  assert.equal(await h.db.prisma.customerOrder.count({ where: { customerUserId: c.userId } }), 1);
  assert.ok(fake.orders.size - before <= 3, 'at most one provider order per concurrent request; the losers are never shown');
  const repeat = await order(h, c.token, plan.id, key);
  assert.deepEqual([repeat.status, repeat.body.order.id], [200, [...ids][0]]);
  assert.equal(repeat.body.checkout.providerOrderId, results.find((r) => r.status === 201)!.body.checkout.providerOrderId);
  const [o] = results.map((r) => r.body.order);
  assert.deepEqual([o!.status, o!.amountMinor, o!.currency, o!.planName], ['created', 49_900, 'INR', 'Tree export']);
  const second = await h.api<{ plan: PlanView }>(admin.token, 'POST', '/admin/plans', { serviceId, name: 'Other', priceMinor: 100 });
  const reused = await order(h, c.token, second.body.plan.id, key);
  assert.deepEqual([reused.status, reused.body.error.code], [409, 'IDEMPOTENCY_KEY_REUSED']);
  // The provider is down: no internal order, a retryable error.
  fake.failWith = 503;
  const down = await order(h, c.token, plan.id);
  fake.failWith = undefined;
  assert.equal(down.status, 503);
  assert.equal(await h.db.prisma.customerOrder.count({ where: { customerUserId: c.userId } }), 1);
  // Bad input.
  assert.equal((await h.api(c.token, 'POST', '/orders', { planId: plan.id, idempotencyKey: 'not-a-uuid' })).status, 400);
  assert.equal((await h.api(undefined, 'POST', '/orders', { planId: plan.id, idempotencyKey: randomUUID() })).status, 401);
  // Without a configured provider nothing pretends to take payments.
  const n = await none.customer();
  assert.equal((await order(none, n.token, plan.id)).status, 503);
});

test('verify: only a provider-confirmed capture pays; bad signatures, other customers and mismatches change nothing', { skip }, async () => {
  const { plan } = await catalogue(h, 49_900);
  const c = await h.customer();
  const other = await h.customer();
  const created = (await order(h, c.token, plan.id)).body;
  const pid = created.checkout.providerOrderId;
  const payment = fake.pay(pid, 'captured');
  const sig = fake.checkoutSignature(pid, payment.id);
  // AS-ORD-07: a forged signature is rejected and audited; the order is unchanged.
  const forged = await h.api<Err>(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: payment.id, signature: 'f'.repeat(64) });
  assert.deepEqual([forged.status, forged.body.error.code], [400, 'INVALID_SIGNATURE']);
  assert.equal((await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.order.id}`)).body.order.status, 'created');
  assert.ok(await h.db.prisma.auditEvent.findFirst({ where: { targetId: created.order.id, action: 'order.verify_rejected', outcome: 'failure' } }));
  // AS-ORD-10 / AS-ORD-16: another customer's order is simply not found.
  assert.equal((await h.api(other.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: payment.id, signature: sig })).status, 404);
  assert.equal((await h.api(other.token, 'GET', `/orders/${created.order.id}`)).status, 404);
  // Valid: paid, granted, exactly one entitlement; calling again changes nothing (AS-ORD-08).
  const ok = await h.api<{ result: string; order: OrderView }>(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: payment.id, signature: sig });
  assert.deepEqual([ok.status, ok.body.result, ok.body.order.status, ok.body.order.grantStatus], [200, 'confirmed', 'paid', 'granted']);
  const twice = await h.api<{ order: OrderView }>(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: payment.id, signature: sig });
  assert.equal(twice.body.order.status, 'paid');
  // ... and a webhook for the same payment afterwards is a no-op too.
  const wh = await webhook(h, fake.webhook('payment.captured', payment));
  assert.equal(wh.status, 200);
  assert.equal(await entitlements(h, c.userId), 1);
  assert.equal(await h.db.prisma.auditEvent.count({ where: { targetId: created.order.id, action: 'order.paid' } }), 1);
  const ents = await h.api<{ entitlements: Array<{ key: string }> }>(c.token, 'GET', '/me/entitlements');
  assert.deepEqual(ents.body.entitlements.map((e) => e.key), ['family.export']);
  // No personal payment details are stored.
  const stored = JSON.stringify(await h.db.prisma.webhookEvent.findMany({ where: { relatedOrderId: created.order.id } }));
  assert.ok(!stored.includes('payer@example.test') && !stored.includes('+919999999999'));

  // AS-ORD-09: a capture with the wrong amount never pays and is flagged.
  const mismatch = (await order(h, c.token, plan.id)).body;
  const cheap = fake.pay(mismatch.checkout.providerOrderId, 'captured', { amount: 100 });
  const mm = await h.api<{ result: string; order: OrderView }>(c.token, 'POST', `/orders/${mismatch.order.id}/verify`, { providerPaymentId: cheap.id, signature: fake.checkoutSignature(mismatch.checkout.providerOrderId, cheap.id) });
  assert.deepEqual([mm.body.order.status, mm.body.order.attentionReason, mm.body.order.grantStatus], ['created', 'amount_mismatch', null]);
  assert.equal(await entitlements(h, c.userId), 1);
  // A payment of a different order cannot be used for this one, even with a valid signature for it.
  const third = (await order(h, c.token, plan.id)).body;
  const foreignSig = fake.checkoutSignature(third.checkout.providerOrderId, payment.id);
  assert.equal((await h.api(c.token, 'POST', `/orders/${third.order.id}/verify`, { providerPaymentId: payment.id, signature: foreignSig })).status, 400);
  // Provider unreachable during verify: "still confirming", nothing changes; reconciliation completes it later.
  const pending = (await order(h, c.token, plan.id)).body;
  const later = fake.pay(pending.checkout.providerOrderId, 'captured');
  fake.failWith = 503;
  const wait = await h.api<{ result: string; order: OrderView }>(c.token, 'POST', `/orders/${pending.order.id}/verify`, {
    providerPaymentId: later.id,
    signature: fake.checkoutSignature(pending.checkout.providerOrderId, later.id),
  });
  fake.failWith = undefined;
  assert.deepEqual([wait.status, wait.body.result, wait.body.order.status], [202, 'pending', 'created']);
  // A failed attempt moves the order to failed (not terminal), and resume reuses the same order (AS-ORD-05).
  const retry = (await order(h, c.token, plan.id)).body;
  const declined = fake.pay(retry.checkout.providerOrderId, 'failed');
  const failed = await h.api<{ result: string; order: OrderView }>(c.token, 'POST', `/orders/${retry.order.id}/verify`, {
    providerPaymentId: declined.id,
    signature: fake.checkoutSignature(retry.checkout.providerOrderId, declined.id),
  });
  assert.deepEqual([failed.body.result, failed.body.order.status], ['failed', 'failed']);
  const resumed = await h.api<Created>(c.token, 'POST', `/orders/${retry.order.id}/checkout`);
  assert.equal(resumed.body.checkout.providerOrderId, retry.checkout.providerOrderId);
  const second = fake.pay(retry.checkout.providerOrderId, 'captured');
  const paid = await h.api<{ order: OrderView }>(c.token, 'POST', `/orders/${retry.order.id}/verify`, { providerPaymentId: second.id, signature: fake.checkoutSignature(retry.checkout.providerOrderId, second.id) });
  assert.equal(paid.body.order.status, 'paid');
  assert.equal((await h.api<Err>(c.token, 'POST', `/orders/${retry.order.id}/checkout`)).status, 409);
  // Order history: own orders only, newest first, paginated.
  const list = await h.api<{ orders: OrderView[]; nextBefore: string | null }>(c.token, 'GET', '/orders?limit=2');
  assert.equal(list.body.orders.length, 2);
  assert.ok(list.body.nextBefore);
  const next = await h.api<{ orders: OrderView[] }>(c.token, 'GET', `/orders?limit=50&before=${encodeURIComponent(list.body.nextBefore!)}`);
  assert.equal(next.body.orders.length + 2, await h.db.prisma.customerOrder.count({ where: { customerUserId: c.userId } }));
  assert.deepEqual((await h.api<{ orders: OrderView[] }>(other.token, 'GET', '/orders')).body.orders, []);
});

test('webhooks: signature on raw body, replay-safe, out-of-order safe, refunds ignored, unknown orders flagged', { skip }, async () => {
  const { plan } = await catalogue(h, 49_900);
  const c = await h.customer();
  const created = (await order(h, c.token, plan.id)).body;
  const pid = created.checkout.providerOrderId;
  const captured = fake.pay(pid, 'captured');
  // AS-ORD-13: unsigned or mis-signed deliveries are rejected and nothing is stored.
  const good = fake.webhook('payment.captured', captured);
  assert.equal((await webhook(h, { ...good, signature: '0'.repeat(64) })).status, 400);
  assert.equal((await webhook(h, { ...good, body: good.body.replace('49900', '100') })).status, 400);
  assert.equal(await h.db.prisma.webhookEvent.count({ where: { providerEventId: good.eventId } }), 0);
  // Concurrent duplicate deliveries: both 2xx, one effect (AS-ORD-20); a replay later: no effect (AS-ORD-11).
  const [a, b] = await Promise.all([webhook(h, good), webhook(h, good)]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.equal(await h.db.prisma.webhookEvent.count({ where: { providerEventId: good.eventId } }), 1);
  assert.equal((await webhook(h, good)).body.duplicate, true);
  await h.payments.recoverGrants();
  const after = await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.order.id}`);
  assert.deepEqual([after.body.order.status, after.body.order.grantStatus], ['paid', 'granted']);
  assert.equal(await entitlements(h, c.userId), 1);
  // AS-ORD-12: a failed (or authorised) event after capture leaves the order paid.
  const lateFail = fake.pay(pid, 'failed');
  assert.equal((await webhook(h, fake.webhook('payment.failed', lateFail))).status, 200);
  assert.equal((await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.order.id}`)).body.order.status, 'paid');
  // AS-ORD-21: refund events are stored as ignored and change nothing.
  const refund = fake.webhook('refund.processed', undefined);
  assert.equal((await webhook(h, refund)).status, 200);
  const stored = await h.db.prisma.webhookEvent.findUnique({ where: { providerEventId: refund.eventId }, select: { status: true } });
  assert.equal(stored?.status, 'ignored');
  assert.equal(await entitlements(h, c.userId), 1);
  // An event about an order we never created is kept for admins, with a 2xx (redelivery would not help).
  fake.orders.set('order_strangerX1', { id: 'order_strangerX1', amount: 5, currency: 'INR', receipt: 'x' });
  const stranger = fake.webhook('payment.captured', fake.pay('order_strangerX1', 'captured'));
  assert.equal((await webhook(h, stranger)).status, 200);
  const flagged = await h.db.prisma.webhookEvent.findUnique({ where: { providerEventId: stranger.eventId }, select: { status: true, attentionReason: true } });
  assert.deepEqual(flagged, { status: 'needs_attention', attentionReason: 'unknown_order' });
  // Authorised first, captured later, by webhook only.
  const second = (await order(h, c.token, plan.id)).body;
  const auth = fake.pay(second.checkout.providerOrderId, 'authorized');
  await webhook(h, fake.webhook('payment.authorized', auth));
  assert.equal((await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${second.order.id}`)).body.order.status, 'pending');
  fake.payments.get(auth.id)!.status = 'captured';
  await webhook(h, fake.webhook('payment.captured', fake.payments.get(auth.id)));
  assert.equal((await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${second.order.id}`)).body.order.status, 'paid');
});

test('failure injection: an error after the event insert leaves nothing, and the redelivery is applied once (AS-ORD-19)', { skip }, async () => {
  const { plan } = await catalogue(faulty, 10_000);
  const c = await faulty.customer();
  const created = (await order(faulty, c.token, plan.id)).body;
  const delivery = fake.webhook('payment.captured', fake.pay(created.checkout.providerOrderId, 'captured'));
  faults.webhook = true;
  assert.equal((await webhook(faulty, delivery)).status, 500);
  faults.webhook = false;
  assert.equal(await faulty.db.prisma.webhookEvent.count({ where: { providerEventId: delivery.eventId } }), 0);
  assert.equal(await faulty.db.prisma.paymentAttempt.count({ where: { orderId: created.order.id } }), 0);
  assert.equal((await faulty.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.order.id}`)).body.order.status, 'created');
  assert.equal((await webhook(faulty, delivery)).status, 200);
  assert.equal(await faulty.db.prisma.webhookEvent.count({ where: { providerEventId: delivery.eventId } }), 1);
  assert.equal((await faulty.api<{ order: OrderView }>(c.token, 'GET', `/orders/${created.order.id}`)).body.order.status, 'paid');
});

test('grants: a failing grant leaves the order paid and pending; recovery grants exactly once (AS-ORD-17, AS-ORD-18, AS-ADM-08)', { skip }, async () => {
  const { plan, admin } = await catalogue(faulty, 10_000);
  const c = await faulty.customer();
  const created = (await order(faulty, c.token, plan.id)).body;
  const p = fake.pay(created.checkout.providerOrderId, 'captured');
  faults.grant = true;
  const verified = await faulty.api<{ order: OrderView }>(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: p.id, signature: fake.checkoutSignature(created.checkout.providerOrderId, p.id) });
  assert.deepEqual([verified.body.order.status, verified.body.order.grantStatus], ['paid', 'pending']);
  assert.equal(await entitlements(faulty, c.userId), 0);
  const detail = await faulty.api<{ order: AdminOrderDetail }>(admin.token, 'GET', `/admin/orders/${created.order.id}`);
  assert.deepEqual([detail.body.order.grant?.status, detail.body.order.grant?.attemptCount, detail.body.order.grant?.lastError], ['pending', 1, 'forced grant failure']);
  faults.grant = false;
  await new Promise((r) => setTimeout(r, 1100)); // the retry delay
  const run = await faulty.payments.recoverGrants();
  assert.equal(run.skipped, false);
  assert.equal(await entitlements(faulty, c.userId), 1);
  // Re-running the grant (admin) or recovery again creates nothing new.
  const regrant = await faulty.api<{ order: AdminOrderDetail }>(admin.token, 'POST', `/admin/orders/${created.order.id}/regrant`);
  assert.equal(regrant.body.order.grant?.status, 'granted');
  await faulty.payments.recoverGrants();
  assert.equal(await entitlements(faulty, c.userId), 1);

  // AS-ORD-18: Confirm committed, then the process "died" before Grant: recovery completes it.
  const second = (await order(faulty, c.token, plan.id)).body;
  const p2 = fake.pay(second.checkout.providerOrderId, 'captured');
  const store = createPrismaPaymentStore(faulty.db.prisma);
  assert.equal(await store.confirm(second.order.id, { providerPaymentId: p2.id, status: 'captured', amountMinor: 10_000n, currency: 'INR', failureCode: null }, 'verify', { role: 'system' }), 'paid_now');
  assert.equal((await faulty.api<{ order: OrderView }>(c.token, 'GET', `/orders/${second.order.id}`)).body.order.grantStatus, 'pending');
  await faulty.payments.recoverGrants();
  assert.equal((await faulty.api<{ order: OrderView }>(c.token, 'GET', `/orders/${second.order.id}`)).body.order.grantStatus, 'granted');
  // One grant record per order: the plan grants one key, so two paid orders give two entitlements.
  assert.equal(await entitlements(faulty, c.userId), 2);

  // Grants that keep failing reach `failed` after the attempt limit and show in the attention queue.
  const third = (await order(faulty, c.token, plan.id)).body;
  const p3 = fake.pay(third.checkout.providerOrderId, 'captured');
  faults.grant = true;
  await faulty.api(c.token, 'POST', `/orders/${third.order.id}/verify`, { providerPaymentId: p3.id, signature: fake.checkoutSignature(third.checkout.providerOrderId, p3.id) });
  for (let i = 0; i < 5; i += 1) {
    await faulty.db.prisma.entitlementGrant.updateMany({ where: { orderId: third.order.id }, data: { nextAttemptAt: null } });
    await faulty.payments.recoverGrants();
  }
  faults.grant = false;
  const attention = await faulty.api<{ summary: { grantsFailed: number }; orders: Array<{ id: string }> }>(admin.token, 'GET', '/admin/payments/attention');
  assert.ok(attention.body.summary.grantsFailed >= 1);
  assert.ok(attention.body.orders.some((o) => o.id === third.order.id));
  const fixed = await faulty.api<{ order: AdminOrderDetail }>(admin.token, 'POST', `/admin/orders/${third.order.id}/regrant`);
  assert.equal(fixed.body.order.grant?.status, 'granted');
  assert.equal(await entitlements(faulty, c.userId), 3);
  assert.ok(await faulty.db.prisma.auditEvent.findFirst({ where: { targetId: third.order.id, action: 'entitlement.regrant_requested', actorUserId: admin.userId } }));
});

test('reconciliation: pays captured orders without webhooks; one run at a time; a dead run is picked up after its lease (AS-ORD-14/22/23)', { skip }, async () => {
  const { plan } = await catalogue(h, 20_000);
  const c = await h.customer();
  const orders = [];
  for (let i = 0; i < 3; i += 1) {
    const created = (await order(h, c.token, plan.id)).body;
    fake.pay(created.checkout.providerOrderId, 'captured');
    orders.push(created.order.id);
  }
  const unpaid = (await order(h, c.token, plan.id)).body;
  // Another process holds the run lease: this run is skipped (AS-ORD-22).
  await h.db.prisma.backgroundTaskState.upsert({
    where: { taskName: 'payment_reconciliation' },
    create: { taskName: 'payment_reconciliation', leaseOwner: 'other-process', leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) },
    update: { leaseOwner: 'other-process', leaseToken: randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) },
  });
  assert.equal((await h.payments.reconcile()).skipped, true);
  // That process died: once its lease expires, the next run finishes the work (AS-ORD-23).
  await h.db.prisma.$executeRaw`UPDATE background_task_state SET lease_expires_at = now() - interval '1 second' WHERE task_name = 'payment_reconciliation'`;
  // Two runs at once (two "processes"): exactly one does the work.
  const other = createPaymentService({
    store: createPrismaPaymentStore(h.db.prisma),
    provider: new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: fake.url, mode: 'test' }, 1500),
    config: { ...readPaymentConfig({}, 'test', []), reconcile: recon },
    logger: h.captured.logger,
  });
  const [r1, r2] = await Promise.all([h.payments.reconcile(), other.reconcile()]);
  assert.equal([r1, r2].filter((r) => !r.skipped).length, 1);
  for (const id of orders) {
    const o = await h.api<{ order: OrderView }>(c.token, 'GET', `/orders/${id}`);
    assert.deepEqual([o.body.order.status, o.body.order.grantStatus], ['paid', 'granted']);
  }
  assert.equal(await entitlements(h, c.userId), 3);
  assert.equal(await h.db.prisma.auditEvent.count({ where: { targetId: { in: orders }, action: 'order.paid' } }), 3);
  // Another full run changes nothing; the unpaid order is checked and, after enough checks, flagged.
  for (let i = 0; i < 3; i += 1) {
    await h.payments.reconcile();
  }
  assert.equal(await entitlements(h, c.userId), 3);
  const flagged = await h.db.prisma.customerOrder.findUnique({ where: { id: unpaid.order.id }, select: { attentionReason: true, reconcileCheckCount: true } });
  assert.equal(flagged?.attentionReason, 'unreconciled');
  assert.ok(flagged!.reconcileCheckCount >= 3);
  const lease = await h.db.prisma.backgroundTaskState.findUnique({ where: { taskName: 'payment_reconciliation' }, select: { leaseToken: true, lastRunFinishedAt: true } });
  assert.deepEqual([lease?.leaseToken, Boolean(lease?.lastRunFinishedAt)], [null, true]);
});

test('entitlements gate features on the server: no purchase, no export (AS-ORD-15); admin views', { skip }, async () => {
  const { plan, admin } = await catalogue(h, 15_000);
  const c = await h.customer();
  await h.api(c.token, 'POST', '/family', { name: 'Gated family' });
  const refused = await h.api<Err>(c.token, 'POST', '/family/exports', {});
  assert.deepEqual([refused.status, refused.body.error.code], [403, 'ENTITLEMENT_REQUIRED']);
  const created = (await order(h, c.token, plan.id)).body;
  // A frontend "success" without a verified payment grants nothing.
  assert.equal((await h.api(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: 'pay_madeup123', signature: 'a'.repeat(64) })).status, 400);
  assert.equal((await h.api(c.token, 'POST', '/family/exports', {})).status, 403);
  const p = fake.pay(created.checkout.providerOrderId, 'captured');
  await h.api(c.token, 'POST', `/orders/${created.order.id}/verify`, { providerPaymentId: p.id, signature: fake.checkoutSignature(created.checkout.providerOrderId, p.id) });
  const allowed = await h.api(c.token, 'POST', '/family/exports', {});
  assert.equal(allowed.status, 202);
  // Admin order views: filters, detail with attempts and events; customers cannot reach them.
  const list = await h.api<{ orders: Array<{ id: string; customerMobileMasked: string }> }>(admin.token, 'GET', '/admin/orders?status=paid&limit=100');
  const row = list.body.orders.find((o) => o.id === created.order.id);
  assert.ok(row);
  assert.match(row!.customerMobileMasked, /•{4,}\d{4}$/, 'the mobile number is masked');
  const detail = await h.api<{ order: AdminOrderDetail }>(admin.token, 'GET', `/admin/orders/${created.order.id}`);
  assert.deepEqual([detail.body.order.attempts.length, detail.body.order.attempts[0]?.firstSeenVia, detail.body.order.entitlements.map((e) => e.key)], [1, 'verify', ['family.export']]);
  assert.equal((await h.api(c.token, 'GET', '/admin/orders')).status, 403);
  const g = await h.staff('genealogist');
  assert.equal((await h.api(g.token, 'GET', `/admin/orders/${created.order.id}`)).status, 403);
  const status = await h.api<{ payments: { provider: string; currency: string; gates: Record<string, string> } }>(undefined, 'GET', '/payments/status');
  assert.deepEqual(status.body.payments, { provider: 'razorpay', mode: 'test', currency: 'INR', gates: { tree_export: 'family.export' } });
  assert.ok(!JSON.stringify(status.body).includes(fake.keySecret));
});
