import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LoadError } from '@/components/portal/load-error';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { getCheckout, getMyOrder } from '@/lib/api/portal';
import { requireCustomer } from '@/lib/auth/session';
import { CheckoutClient } from './checkout-client';

export const metadata: Metadata = { title: 'Payment' };

// The payment page of one of the customer's own orders. Another customer's order id is a plain
// 404 (AS-ORD-16). The Razorpay Checkout script is loaded only on this route (AS-ORD-04).
export default async function CheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  await requireCustomer();
  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    notFound();
  }
  const order = await getMyOrder(orderId);
  if (order.kind === 'not_found') {
    notFound();
  }
  const header = <PageHeader eyebrow="Plans & payments" title="Payment" />;
  if (order.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={order} retryHref={`/dashboard/plans/checkout/${orderId}`} />
      </>
    );
  }
  if (order.data.order.status === 'paid') {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon="check"
            title="Payment confirmed"
            action={
              <ButtonLink href="/dashboard/plans" variant="secondary">
                Back to plans
              </ButtonLink>
            }
          >
            {order.data.order.grantStatus === 'granted' ? 'This order is paid. Your access is ready.' : 'This order is paid. We are completing your purchase.'}
          </EmptyState>
        </Card>
      </>
    );
  }
  const checkout = await getCheckout(orderId);
  if (checkout.kind !== 'ok') {
    return (
      <>
        {header}
        {checkout.kind === 'unavailable' ? (
          <Card>
            <EmptyState icon="alert" title="Payments are not available right now">
              Nothing has been charged. Please try again later.
            </EmptyState>
          </Card>
        ) : (
          <LoadError result={checkout} retryHref={`/dashboard/plans/checkout/${orderId}`} />
        )}
      </>
    );
  }
  return (
    <>
      {header}
      <CheckoutClient order={checkout.data.order} checkout={checkout.data.checkout} />
    </>
  );
}
