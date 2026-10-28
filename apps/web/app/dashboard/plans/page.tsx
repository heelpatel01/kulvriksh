import type { Metadata } from 'next';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getMyEntitlements, getMyOrders, getPaymentStatus, getPlans } from '@/lib/api/portal';
import { requireCustomer } from '@/lib/auth/session';
import { BillingView } from './billing-view';

export const metadata: Metadata = { title: 'Plans & payments' };

// Real data: active plans from the catalogue, the customer's own orders (newest first, paginated)
// and what they have access to. Paying happens on the checkout page of one order.
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireCustomer();
  const { before } = await searchParams;
  const [plans, orders, entitlements, status] = await Promise.all([getPlans(), getMyOrders(before), getMyEntitlements(), getPaymentStatus()]);
  const header = (
    <PageHeader eyebrow="Account" title="Plans & payments" description="What you have access to, the plans you can buy, and your payment history." />
  );
  const failed = firstFailure(plans, orders, entitlements);
  if (failed || plans.kind !== 'ok' || orders.kind !== 'ok' || entitlements.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={failed ?? { kind: 'unavailable' }} retryHref="/dashboard/plans" />
      </>
    );
  }
  return (
    <>
      {header}
      <BillingView
        plans={plans.data.plans}
        orders={orders.data.orders}
        nextBefore={orders.data.nextBefore}
        paged={Boolean(before)}
        entitlements={entitlements.data.entitlements}
        provider={status.kind === 'ok' ? status.data.payments.provider : 'none'}
        mode={status.kind === 'ok' ? status.data.payments.mode : null}
      />
    </>
  );
}
