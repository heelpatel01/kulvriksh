'use server';

import { revalidatePath } from 'next/cache';
import type { CheckoutView, OrderView } from '@kulvriksh/shared';
import { customerApi, failureMessage } from '@/lib/api/session-api';

// Order and payment actions. The API takes the customer from the session, the price from the
// catalogue and the provider order from its own records; the browser only passes the plan, a
// one-time request key, and what the payment page returned (which the API verifies).

export type OrderActionResult = { ok: true; order: OrderView; checkout?: CheckoutView | null } | { ok: false; message: string };

const segment = (id: string) => encodeURIComponent(String(id));

export async function createOrderAction(input: { planId: string; idempotencyKey: string }): Promise<OrderActionResult> {
  const result = await customerApi<{ order: OrderView; checkout: CheckoutView | null }>('/api/v1/orders', {
    method: 'POST',
    body: { planId: String(input.planId), idempotencyKey: String(input.idempotencyKey) },
  });
  if (result.kind === 'ok') {
    revalidatePath('/dashboard/plans');
    return { ok: true, order: result.data.order, checkout: result.data.checkout };
  }
  if (result.kind === 'unavailable') {
    return { ok: false, message: 'Payments are not available right now. Nothing was charged; please try again later.' };
  }
  return { ok: false, message: failureMessage(result) };
}

export async function verifyPaymentAction(input: { orderId: string; providerPaymentId: string; signature: string }): Promise<OrderActionResult & { result?: string }> {
  const result = await customerApi<{ result: string; order: OrderView }>(`/api/v1/orders/${segment(input.orderId)}/verify`, {
    method: 'POST',
    body: { providerPaymentId: String(input.providerPaymentId), signature: String(input.signature) },
  });
  if (result.kind === 'ok') {
    revalidatePath('/dashboard/plans');
    return { ok: true, order: result.data.order, result: result.data.result };
  }
  if (result.kind === 'invalid') {
    return { ok: false, message: 'The payment could not be verified. If money was taken, it will be matched automatically; check your orders shortly.' };
  }
  return { ok: false, message: failureMessage(result) };
}

export async function getOrderAction(input: { orderId: string }): Promise<OrderActionResult> {
  const result = await customerApi<{ order: OrderView }>(`/api/v1/orders/${segment(input.orderId)}`);
  return result.kind === 'ok' ? { ok: true, order: result.data.order } : { ok: false, message: failureMessage(result) };
}

/** Development provider only: the simulated gateway. The API answers 404 for any other provider. */
export async function simulatePaymentAction(input: { orderId: string; outcome: 'success' | 'failure' }): Promise<{ ok: true; providerPaymentId: string; signature: string } | { ok: false; message: string }> {
  const result = await customerApi<{ providerPaymentId: string; signature: string }>(`/api/v1/orders/${segment(input.orderId)}/simulate`, {
    method: 'POST',
    body: { outcome: input.outcome === 'failure' ? 'failure' : 'success' },
  });
  return result.kind === 'ok' ? { ok: true, ...result.data } : { ok: false, message: failureMessage(result) };
}
