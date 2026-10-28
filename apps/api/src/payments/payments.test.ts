import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { startFakeRazorpay, type FakeRazorpay } from '../testing/fake-razorpay.ts';
import { readPaymentConfig } from './payment-config.ts';
import { validatePlan } from './payment-routes.ts';
import { evidenceOf } from './payment-service.ts';
import { DevelopmentProvider, ProviderError, RazorpayProvider, safeEqualHex } from './provider.ts';

// Payment provider adapter and configuration (no database). The Razorpay adapter is exercised
// against a local test double of the Razorpay REST API; no live credentials exist in this project.

let fake: FakeRazorpay;
let provider: RazorpayProvider;

before(async () => {
  fake = await startFakeRazorpay();
  provider = new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: fake.url, mode: 'test' }, 2000);
});

after(async () => {
  await fake.close();
});

describe('razorpay adapter', () => {
  it('creates an order with Basic auth, the amount in minor units, the currency and our order id as receipt', async () => {
    const { providerOrderId } = await provider.createOrder({ receipt: '00000000-0000-4000-8000-000000000001', amountMinor: 49_900n, currency: 'INR', notes: { order_id: 'x' } });
    const order = fake.orders.get(providerOrderId)!;
    assert.deepEqual([order.amount, order.currency, order.receipt], [49_900, 'INR', '00000000-0000-4000-8000-000000000001']);
    // Wrong credentials are refused by the provider and surface as a rejection.
    const wrong = new RazorpayProvider({ keyId: fake.keyId, keySecret: 'not-the-secret', webhookSecret: 'x'.repeat(16), apiBase: fake.url, mode: 'test' }, 2000);
    await assert.rejects(wrong.createOrder({ receipt: 'r', amountMinor: 1n, currency: 'INR', notes: {} }), (e: unknown) => e instanceof ProviderError && e.kind === 'rejected');
  });

  it('reads payments back, one by id and all of an order', async () => {
    const { providerOrderId } = await provider.createOrder({ receipt: 'r2', amountMinor: 1000n, currency: 'INR', notes: {} });
    const p = fake.pay(providerOrderId, 'captured');
    const fetched = await provider.fetchPayment(p.id);
    assert.deepEqual([fetched.id, fetched.orderId, fetched.status, fetched.amountMinor, fetched.currency], [p.id, providerOrderId, 'captured', 1000n, 'INR']);
    fake.pay(providerOrderId, 'failed');
    assert.equal((await provider.listOrderPayments(providerOrderId)).length, 2);
    await assert.rejects(provider.fetchPayment('pay_doesnotexist'), (e: unknown) => e instanceof ProviderError && e.kind === 'not_found');
  });

  it('maps outages and timeouts to retryable errors', async () => {
    fake.failWith = 503;
    await assert.rejects(provider.fetchPayment('pay_abcdef1'), (e: unknown) => e instanceof ProviderError && e.kind === 'unavailable');
    fake.failWith = undefined;
    fake.delayMs = 300;
    const slow = new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: fake.url, mode: 'test' }, 1000);
    const fast = new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: fake.url, mode: 'test' }, 50);
    await assert.rejects(fast.fetchPayment('pay_abcdef1'), (e: unknown) => e instanceof ProviderError && e.kind === 'timeout');
    await assert.rejects(slow.fetchPayment('pay_abcdef1'), (e: unknown) => e instanceof ProviderError && e.kind === 'not_found');
    fake.delayMs = 0;
    const closed = new RazorpayProvider({ keyId: fake.keyId, keySecret: fake.keySecret, webhookSecret: fake.webhookSecret, apiBase: 'http://127.0.0.1:1', mode: 'test' }, 1000);
    await assert.rejects(closed.fetchPayment('pay_abcdef1'), (e: unknown) => e instanceof ProviderError && e.kind === 'unavailable');
  });

  it('checks the checkout signature: HMAC-SHA256(order_id|payment_id, key secret), constant time', () => {
    const good = createHmac('sha256', fake.keySecret).update('order_A1b2C3d4|pay_X9y8Z7w6').digest('hex');
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: 'order_A1b2C3d4', providerPaymentId: 'pay_X9y8Z7w6', signature: good }), true);
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: 'order_A1b2C3d4', providerPaymentId: 'pay_other1', signature: good }), false);
    assert.equal(provider.verifyCheckoutSignature({ providerOrderId: 'order_A1b2C3d4', providerPaymentId: 'pay_X9y8Z7w6', signature: good.toUpperCase() }), true);
    for (const bad of ['', 'zz', good.slice(1), `${good}00`]) {
      assert.equal(provider.verifyCheckoutSignature({ providerOrderId: 'order_A1b2C3d4', providerPaymentId: 'pay_X9y8Z7w6', signature: bad }), false);
    }
    assert.equal(safeEqualHex(good, undefined), false);
  });

  it('checks the webhook signature over the raw body and keeps only non-personal fields', () => {
    const { providerOrderId } = { providerOrderId: [...fake.orders.keys()][0]! };
    const payment = fake.pay(providerOrderId, 'captured');
    const { body, signature, eventId } = fake.webhook('payment.captured', payment);
    const raw = Buffer.from(body);
    assert.equal(provider.verifyWebhookSignature(raw, signature), true);
    assert.equal(provider.verifyWebhookSignature(Buffer.from(body.replace('"captured"', '"failed"')), signature), false, 'a modified body fails');
    assert.equal(provider.verifyWebhookSignature(raw, undefined), false);
    const event = provider.parseWebhook(raw, eventId);
    assert.deepEqual([event.eventId, event.eventType, event.providerOrderId, event.payment?.status], [eventId, 'payment.captured', providerOrderId, 'captured']);
    assert.deepEqual(Object.keys(event.excerpt).sort(), ['amount', 'currency', 'event', 'order_id', 'payment_id', 'status']);
    assert.ok(!JSON.stringify(event.excerpt).includes('payer@example.test'));
    assert.throws(() => provider.parseWebhook(raw, undefined), ProviderError);
    const refund = provider.parseWebhook(Buffer.from(fake.webhook('refund.processed', undefined).body), 'evt_r1');
    assert.equal(refund.payment, undefined);
  });

  it('treats only authorised, captured and failed payments as evidence', () => {
    const base = { id: 'pay_abcdef1', orderId: 'order_abcdef1', amountMinor: 1n, currency: 'INR', errorCode: null };
    assert.equal(evidenceOf({ ...base, status: 'captured' })?.status, 'captured');
    assert.equal(evidenceOf({ ...base, status: 'authorized' })?.status, 'authorised');
    assert.equal(evidenceOf({ ...base, status: 'failed' })?.status, 'failed');
    assert.equal(evidenceOf({ ...base, status: 'created' }), undefined);
    assert.equal(evidenceOf({ ...base, status: 'refunded' }), undefined);
  });
});

describe('development provider', () => {
  it('signs simulated payments with a per-process secret; another instance cannot verify them', async () => {
    const dev = new DevelopmentProvider();
    const { providerOrderId } = await dev.createOrder({ receipt: 'r', amountMinor: 500n, currency: 'INR' });
    const paid = dev.simulate(providerOrderId, 'success')!;
    assert.equal(dev.verifyCheckoutSignature({ providerOrderId, ...paid }), true);
    assert.equal(new DevelopmentProvider().verifyCheckoutSignature({ providerOrderId, ...paid }), false);
    assert.equal((await dev.fetchPayment(paid.providerPaymentId)).status, 'captured');
    assert.equal(dev.simulate('order_unknown', 'success'), undefined);
  });
});

describe('payment configuration', () => {
  const read = (env: Record<string, string>, nodeEnv: 'development' | 'test' | 'production' = 'test') => {
    const issues: string[] = [];
    const config = readPaymentConfig(env, nodeEnv, issues);
    return { config, issues };
  };
  const keys = { RAZORPAY_KEY_ID: 'rzp_test_AbCdEf123456', RAZORPAY_KEY_SECRET: 'secret-value-123456', RAZORPAY_WEBHOOK_SECRET: 'webhook-secret-123456' };

  it('defaults to no provider, INR, and nothing gated', () => {
    const { config, issues } = read({});
    assert.deepEqual(issues, []);
    assert.deepEqual([config.provider, config.currency, config.gates], ['none', 'INR', {}]);
  });

  it('requires all three Razorpay values, refuses live keys outside production and never echoes secrets', () => {
    assert.ok(read({ PAYMENT_PROVIDER: 'razorpay' }).issues.length >= 3);
    const ok = read({ PAYMENT_PROVIDER: 'razorpay', ...keys });
    assert.deepEqual(ok.issues, []);
    assert.equal(ok.config.razorpay?.mode, 'test');
    const live = read({ PAYMENT_PROVIDER: 'razorpay', ...keys, RAZORPAY_KEY_ID: 'rzp_live_AbCdEf123456' });
    assert.ok(live.issues.some((i) => i.includes('live keys are refused')));
    assert.deepEqual(read({ PAYMENT_PROVIDER: 'razorpay', ...keys, RAZORPAY_KEY_ID: 'rzp_live_AbCdEf123456' }, 'production').issues, []);
    assert.ok(read({ PAYMENT_PROVIDER: 'razorpay', ...keys, RAZORPAY_API_BASE: 'http://127.0.0.1:9' }, 'production').issues.length === 1);
    const all = JSON.stringify(read({ PAYMENT_PROVIDER: 'razorpay', RAZORPAY_KEY_ID: 'bad', RAZORPAY_KEY_SECRET: 'short', RAZORPAY_WEBHOOK_SECRET: 'tiny' }).issues);
    assert.ok(!all.includes('short') && !all.includes('tiny'));
  });

  it('refuses the development provider outside development', () => {
    assert.deepEqual(read({ PAYMENT_PROVIDER: 'development' }, 'development').issues, []);
    assert.equal(read({ PAYMENT_PROVIDER: 'development' }, 'production').issues.length, 1);
    assert.equal(read({ PAYMENT_PROVIDER: 'development' }, 'test').issues.length, 1);
  });

  it('parses entitlement gates and currencies strictly', () => {
    assert.deepEqual(read({ ENTITLEMENT_GATES: 'tree_export=family.export' }).config.gates, { tree_export: 'family.export' });
    assert.equal(read({ ENTITLEMENT_GATES: 'unknown_feature=x' }).issues.length, 1);
    assert.equal(read({ ENTITLEMENT_GATES: 'tree_export=Bad Key' }).issues.length, 1);
    assert.equal(read({ PAYMENT_CURRENCY: 'inr' }).issues.length, 1);
  });
});

describe('plan validation', () => {
  const service = '00000000-0000-4000-8000-0000000000aa';
  it('accepts a plan in the configured currency with entitlement keys', () => {
    const r = validatePlan({ serviceId: service, name: ' Basic ', priceMinor: 49900, entitlementKeys: ['family.export', 'family.export'] }, 'INR', false);
    assert.equal(r.ok, true);
    assert.deepEqual(r.ok && r.value, { serviceId: service, currency: 'INR', name: 'Basic', description: '', priceMinor: 49_900n, entitlementKeys: ['family.export'] });
  });

  it('refuses zero, negative, fractional or huge prices, other currencies and bad keys', () => {
    for (const priceMinor of [0, -1, 1.5, '12abc', 1e15, '0']) {
      assert.equal(validatePlan({ serviceId: service, name: 'x', priceMinor }, 'INR', false).ok, false, `price ${priceMinor}`);
    }
    assert.equal(validatePlan({ serviceId: service, name: 'x', priceMinor: 1, currency: 'USD' }, 'INR', false).ok, false);
    assert.equal(validatePlan({ serviceId: service, name: 'x', priceMinor: 1, entitlementKeys: ['Not Valid'] }, 'INR', false).ok, false);
    assert.equal(validatePlan({ status: 'archived' }, 'INR', true).ok, false);
    assert.equal(validatePlan({}, 'INR', true).ok, false);
    assert.equal(validatePlan({ status: 'active' }, 'INR', true).ok, true);
  });
});
