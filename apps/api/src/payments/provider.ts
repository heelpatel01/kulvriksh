import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Payment provider interface (Flows §5). The API never trusts the browser about a payment: a
// checkout callback is only a hint whose signature is checked, and the payment itself is read back
// from the provider (or arrives in a signed webhook) before an order can become paid.
//
// RazorpayProvider talks to the Razorpay REST API (Orders and Payments) with HTTP Basic auth and a
// timeout, and checks both signatures Razorpay documents:
//   checkout: HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex
//   webhook:  HMAC-SHA256(raw request body, webhook_secret), hex, header X-Razorpay-Signature
// DevelopmentProvider simulates a gateway in memory for local development only, with the same
// signature scheme, so the verify path is exercised exactly as in production.

export type ProviderPaymentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface ProviderPayment {
  id: string;
  orderId: string;
  status: ProviderPaymentStatus;
  amountMinor: bigint;
  currency: string;
  errorCode: string | null;
}

export interface WebhookEvent {
  eventId: string;
  eventType: string;
  payment?: ProviderPayment;
  /** The provider order the event is about, when it names one. */
  providerOrderId?: string;
  /** Minimal, non-personal fields kept for audit (no card, email or phone details). */
  excerpt: Record<string, string | number | null>;
}

export class ProviderError extends Error {
  readonly kind: 'timeout' | 'unavailable' | 'rejected' | 'not_found';

  constructor(kind: ProviderError['kind'], message: string) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

export interface PaymentProvider {
  readonly name: 'razorpay' | 'development';
  /** Public by design: Checkout needs it in the browser. Never the secret. */
  readonly publicKeyId: string;
  readonly mode: 'test' | 'live' | 'development';
  createOrder(input: { receipt: string; amountMinor: bigint; currency: string; notes: Record<string, string> }): Promise<{ providerOrderId: string }>;
  verifyCheckoutSignature(input: { providerOrderId: string; providerPaymentId: string; signature: string }): boolean;
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;
  listOrderPayments(providerOrderId: string): Promise<ProviderPayment[]>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  /** Parses a body whose signature has already been verified. Throws on a malformed payload. */
  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent;
}

const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

/** Constant-time comparison of two hex digests. */
export function safeEqualHex(expected: string, given: string | undefined): boolean {
  if (typeof given !== 'string' || !/^[0-9a-f]{64}$/i.test(given)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given.toLowerCase(), 'hex'));
}

const PROVIDER_ID = /^[A-Za-z0-9_]{6,64}$/;

function toPayment(raw: unknown): ProviderPayment {
  const p = raw as Record<string, unknown>;
  const status = String(p.status);
  if (typeof p.id !== 'string' || !PROVIDER_ID.test(p.id) || typeof p.order_id !== 'string' || !['created', 'authorized', 'captured', 'failed', 'refunded'].includes(status)) {
    throw new ProviderError('rejected', 'unexpected payment entity');
  }
  if (typeof p.amount !== 'number' || !Number.isSafeInteger(p.amount) || typeof p.currency !== 'string') {
    throw new ProviderError('rejected', 'unexpected payment amount');
  }
  return {
    id: p.id,
    orderId: p.order_id,
    status: status as ProviderPaymentStatus,
    amountMinor: BigInt(p.amount),
    currency: p.currency,
    errorCode: typeof p.error_code === 'string' ? p.error_code.slice(0, 100) : null,
  };
}

/** Webhook parsing shared by both providers (Razorpay's event format). */
function parseRazorpayEvent(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent {
  const eventId = eventIdHeader?.trim();
  if (!eventId || eventId.length > 200) {
    throw new ProviderError('rejected', 'missing event id');
  }
  const body = JSON.parse(rawBody.toString('utf8')) as { event?: unknown; payload?: Record<string, { entity?: unknown }> };
  if (typeof body.event !== 'string' || !/^[a-z][a-z0-9_.]{0,79}$/.test(body.event)) {
    throw new ProviderError('rejected', 'missing event type');
  }
  const paymentEntity = body.payload?.payment?.entity;
  const orderEntity = body.payload?.order?.entity as { id?: unknown } | undefined;
  const payment = paymentEntity && !body.event.startsWith('refund.') ? toPayment(paymentEntity) : undefined;
  const providerOrderId = payment?.orderId ?? (typeof orderEntity?.id === 'string' ? orderEntity.id : undefined);
  return {
    eventId,
    eventType: body.event,
    ...(payment ? { payment } : {}),
    ...(providerOrderId ? { providerOrderId } : {}),
    excerpt: {
      event: body.event,
      payment_id: payment?.id ?? null,
      order_id: providerOrderId ?? null,
      status: payment?.status ?? null,
      amount: payment ? Number(payment.amountMinor) : null,
      currency: payment?.currency ?? null,
    },
  };
}

export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly publicKeyId: string;
  readonly mode: 'test' | 'live';
  readonly #secret: string;
  readonly #webhookSecret: string;
  readonly #base: string;
  readonly #timeoutMs: number;

  constructor(config: { keyId: string; keySecret: string; webhookSecret: string; apiBase: string; mode: 'test' | 'live' }, timeoutMs: number) {
    this.publicKeyId = config.keyId;
    this.mode = config.mode;
    this.#secret = config.keySecret;
    this.#webhookSecret = config.webhookSecret;
    this.#base = config.apiBase.replace(/\/$/, '');
    this.#timeoutMs = timeoutMs;
  }

  async #call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.#base}${path}`, {
        method,
        headers: {
          authorization: `Basic ${Buffer.from(`${this.publicKeyId}:${this.#secret}`).toString('base64')}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unavailable', 'payment provider unreachable');
    }
    const payload: unknown = await res.json().catch(() => null);
    if (res.status === 404) {
      throw new ProviderError('not_found', 'not found at payment provider');
    }
    if (!res.ok) {
      // Razorpay error bodies carry a code and description; neither contains our secrets.
      const code = (payload as { error?: { code?: string } } | null)?.error?.code ?? `HTTP_${res.status}`;
      throw new ProviderError(res.status >= 500 ? 'unavailable' : 'rejected', `payment provider error ${code}`);
    }
    return payload;
  }

  async createOrder({ receipt, amountMinor, currency, notes }: { receipt: string; amountMinor: bigint; currency: string; notes: Record<string, string> }) {
    const order = (await this.#call('POST', '/v1/orders', { amount: Number(amountMinor), currency, receipt, notes })) as { id?: unknown; amount?: unknown };
    if (typeof order?.id !== 'string' || !PROVIDER_ID.test(order.id) || order.amount !== Number(amountMinor)) {
      throw new ProviderError('rejected', 'unexpected order response');
    }
    return { providerOrderId: order.id };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqualHex(hmacHex(this.#secret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  async fetchPayment(providerPaymentId: string) {
    if (!PROVIDER_ID.test(providerPaymentId)) {
      throw new ProviderError('not_found', 'bad payment id');
    }
    return toPayment(await this.#call('GET', `/v1/payments/${providerPaymentId}`));
  }

  async listOrderPayments(providerOrderId: string) {
    const list = (await this.#call('GET', `/v1/orders/${encodeURIComponent(providerOrderId)}/payments`)) as { items?: unknown[] };
    return (Array.isArray(list?.items) ? list.items : []).slice(0, 100).map(toPayment);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
    return safeEqualHex(hmacHex(this.#webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined) {
    return parseRazorpayEvent(rawBody, eventIdHeader);
  }
}

/**
 * A simulated gateway for local development (PAYMENT_PROVIDER=development, refused elsewhere).
 * Orders and payments live in memory; `simulate` plays the part of the customer paying on the
 * gateway's page and returns what Checkout would return to the browser, signed with a random
 * per-process secret. Nothing here can mark an order paid by itself: the API still verifies the
 * signature and reads the payment back, exactly as with Razorpay.
 */
export class DevelopmentProvider implements PaymentProvider {
  readonly name = 'development';
  readonly publicKeyId = 'development';
  readonly mode = 'development';
  readonly #secret = randomBytes(32).toString('hex');
  readonly #webhookSecret = randomBytes(32).toString('hex');
  readonly #orders = new Map<string, { amountMinor: bigint; currency: string }>();
  readonly #payments = new Map<string, ProviderPayment>();

  async createOrder({ amountMinor, currency }: { receipt: string; amountMinor: bigint; currency: string }) {
    const providerOrderId = `order_dev${randomBytes(8).toString('hex')}`;
    this.#orders.set(providerOrderId, { amountMinor, currency });
    return { providerOrderId };
  }

  /** The customer "pays" (or the payment fails) on the simulated gateway. */
  simulate(providerOrderId: string, outcome: 'success' | 'failure'): { providerPaymentId: string; signature: string } | undefined {
    const order = this.#orders.get(providerOrderId);
    if (!order) {
      return undefined;
    }
    const id = `pay_dev${randomBytes(8).toString('hex')}`;
    this.#payments.set(id, {
      id,
      orderId: providerOrderId,
      status: outcome === 'success' ? 'captured' : 'failed',
      amountMinor: order.amountMinor,
      currency: order.currency,
      errorCode: outcome === 'success' ? null : 'BAD_REQUEST_ERROR',
    });
    return { providerPaymentId: id, signature: hmacHex(this.#secret, `${providerOrderId}|${id}`) };
  }

  verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }: { providerOrderId: string; providerPaymentId: string; signature: string }) {
    return safeEqualHex(hmacHex(this.#secret, `${providerOrderId}|${providerPaymentId}`), signature);
  }

  async fetchPayment(providerPaymentId: string) {
    const payment = this.#payments.get(providerPaymentId);
    if (!payment) {
      throw new ProviderError('not_found', 'unknown payment');
    }
    return payment;
  }

  async listOrderPayments(providerOrderId: string) {
    return [...this.#payments.values()].filter((p) => p.orderId === providerOrderId);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
    return safeEqualHex(hmacHex(this.#webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined) {
    return parseRazorpayEvent(rawBody, eventIdHeader);
  }
}
