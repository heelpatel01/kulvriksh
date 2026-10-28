import type { Metadata } from 'next';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getAdminOrders, getPaymentAttention } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { TransactionsAdmin } from './transactions-admin';

export const metadata: Metadata = { title: 'Transactions' };

// Real orders and payments (F-ADM-05): server-side filters and pagination, plus the attention
// queue (amount mismatches, unreconciled orders, failed or stuck grants, webhook events).
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ status?: string; attention?: string; before?: string }> }) {
  await requireStaff('admin');
  const params = await searchParams;
  const filter = { status: params.status, attention: params.attention === '1', before: params.before };
  const [orders, attention] = await Promise.all([getAdminOrders(filter), getPaymentAttention()]);
  const header = (
    <PageHeader eyebrow="Commerce" title="Transactions" description="Orders, payment attempts and items that need attention. Refunds are handled outside the platform (D3)." />
  );
  const failed = firstFailure(orders, attention);
  if (failed || orders.kind !== 'ok' || attention.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={failed ?? { kind: 'unavailable' }} retryHref="/admin/transactions" />
      </>
    );
  }
  return (
    <>
      {header}
      <TransactionsAdmin orders={orders.data.orders} nextBefore={orders.data.nextBefore} filter={filter} attention={attention.data} />
    </>
  );
}
