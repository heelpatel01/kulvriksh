import type { Metadata } from 'next';
import { LoadError } from '@/components/portal/load-error';
import { Card, Notice, PageHeader } from '@/components/ui/primitives';
import { getAdminCustomers } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { CustomersTable } from './customers-table';

export const metadata: Metadata = { title: 'Customers' };

// Real customers, searched and paginated by the API (F-ADM-01). Read only: which status actions
// admins may take (suspend, delete) is still open (R35), so none are offered.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; before?: string }> }) {
  await requireStaff('admin');
  const { q, before } = await searchParams;
  const query = q?.trim().slice(0, 60) ?? '';
  const result = await getAdminCustomers(query || undefined, before);
  const header = (
    <PageHeader eyebrow="People" title="Customers" description="Customer accounts are created by mobile OTP sign-in. Search by name or at least three digits of the mobile number." />
  );
  if (result.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={result} retryHref="/admin/customers" />
      </>
    );
  }
  return (
    <>
      {header}
      <Notice tone="info">Status changes (such as suspending an account) are not available until their rules are agreed (R35).</Notice>
      <Card padded={false}>
        <CustomersTable customers={result.data.customers} query={query} nextBefore={result.data.nextBefore} paged={Boolean(before)} />
      </Card>
    </>
  );
}
