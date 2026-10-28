import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getStaffAccounts } from '@/lib/api/portal';
import { StaffAdmin } from './staff-admin';

export const metadata: Metadata = { title: 'Staff accounts' };

// Real data: every staff account. The API decides who may be changed; this screen only mirrors it.
export default async function StaffPage() {
  const me = await requireStaff('admin');
  const result = await getStaffAccounts();
  return (
    <>
      <PageHeader eyebrow="People" title="Staff accounts" description="Create accounts, issue one-time password links, and deactivate access. Every change is audited." />
      {result.kind === 'ok' ? (
        <StaffAdmin staff={result.data.staff} selfId={me.id} adminsMayManageAdmins={result.data.adminsMayManageAdmins} />
      ) : (
        <LoadError result={result} retryHref="/admin/staff" />
      )}
    </>
  );
}
