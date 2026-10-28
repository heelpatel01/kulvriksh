// Test-only: a local stand-in for the Razorpay REST API (Orders and Payments), so the provider
// adapter and the whole payment flow can be tested without network access or real credentials.
// It implements only what RazorpayProvider calls, with the documented request and response shapes,
// and checks HTTP Basic auth. It is NOT evidence that the live Razorpay integration works.
import { createHmac, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakePayment {
  id: string;
  entity: 'payment';
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  error_code: string | null;
  email: string;
  contact: string;
}

export interface FakeRazorpay {
  url: string;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  orders: Map<string, { id: string; amount: number; currency: string; receipt: string }>;
  payments: Map<string, FakePayment>;
  /** Number of API calls received, by path pattern. */
  calls: string[];
  /** When set, every call answers this HTTP status. */
  failWith?: number;
  /** Delay before answering (to exercise timeouts). */
  delayMs: number;
  pay(orderId: string, status: FakePayment['status'], override?: Partial<Pick<FakePayment, 'amount' | 'currency'>>): FakePayment;
  /** What Checkout hands the browser after a successful payment. */
  checkoutSignature(orderId: string, paymentId: string): string;
  /** A signed webhook delivery for a payment (body, signature header, event id header). */
  webhook(event: string, payment: FakePayment | undefined, eventId?: string): { body: string; signature: string; eventId: string };
  close(): Promise<void>;
}

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

async function read(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function startFakeRazorpay(): Promise<FakeRazorpay> {
  const keyId = `rzp_test_${randomBytes(7).toString('hex')}`;
  const keySecret = randomBytes(16).toString('hex');
  const webhookSecret = randomBytes(16).toString('hex');
  const fake = {
    keyId,
    keySecret,
    webhookSecret,
    orders: new Map(),
    payments: new Map(),
    calls: [],
    delayMs: 0,
  } as unknown as FakeRazorpay;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const body = await read(req);
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (fake.delayMs > 0) {
        await new Promise((r) => setTimeout(r, fake.delayMs));
      }
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      fake.calls.push(`${req.method} ${path.replace(/(order|pay)_[A-Za-z0-9]+/g, '$1_*')}`);
      if (req.headers.authorization !== `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`) {
        send(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
        return;
      }
      if (fake.failWith) {
        send(fake.failWith, { error: { code: 'SERVER_ERROR', description: 'unavailable' } });
        return;
      }
      if (req.method === 'POST' && path === '/v1/orders') {
        const input = JSON.parse(body) as { amount: number; currency: string; receipt: string };
        const order = { id: `order_${randomBytes(7).toString('hex')}`, entity: 'order', amount: input.amount, currency: input.currency, receipt: input.receipt, status: 'created' };
        fake.orders.set(order.id, order);
        send(200, order);
        return;
      }
      const payment = /^\/v1\/payments\/([A-Za-z0-9_]+)$/.exec(path);
      if (req.method === 'GET' && payment) {
        const p = fake.payments.get(payment[1]!);
        send(p ? 200 : 404, p ?? { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } });
        return;
      }
      const orderPayments = /^\/v1\/orders\/([A-Za-z0-9_]+)\/payments$/.exec(path);
      if (req.method === 'GET' && orderPayments) {
        const items = [...fake.payments.values()].filter((p) => p.order_id === orderPayments[1]);
        send(200, { entity: 'collection', count: items.length, items });
        return;
      }
      send(404, { error: { code: 'BAD_REQUEST_ERROR', description: 'not found' } });
    })();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  fake.pay = (orderId, status, override = {}) => {
    const order = fake.orders.get(orderId);
    if (!order) {
      throw new Error('unknown fake order');
    }
    const p: FakePayment = {
      id: `pay_${randomBytes(7).toString('hex')}`,
      entity: 'payment',
      order_id: orderId,
      amount: override.amount ?? order.amount,
      currency: override.currency ?? order.currency,
      status,
      error_code: status === 'failed' ? 'BAD_REQUEST_ERROR' : null,
      // Personal fields Razorpay includes; the API must not store them.
      email: 'payer@example.test',
      contact: '+919999999999',
    };
    fake.payments.set(p.id, p);
    return p;
  };
  fake.checkoutSignature = (orderId, paymentId) => hmac(keySecret, `${orderId}|${paymentId}`);
  fake.webhook = (event, payment, eventId = `evt_itest_${randomBytes(6).toString('hex')}`) => {
    const body = JSON.stringify({
      entity: 'event',
      account_id: 'acc_itest',
      event,
      contains: payment ? ['payment'] : [],
      payload: payment ? { payment: { entity: payment } } : {},
      created_at: Math.floor(Date.now() / 1000),
    });
    return { body, signature: hmac(webhookSecret, body), eventId };
  };
  fake.close = () => new Promise<void>((r) => server.close(() => r()));
  return fake;
}
