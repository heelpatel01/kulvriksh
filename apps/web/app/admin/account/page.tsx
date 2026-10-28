import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import { StaffAccountPanel } from '@/components/portal/staff-account';
import { PageHeader } from '@/components/ui/primitives';
import { getMyStaffMfa } from '@/lib/api/portal';

export const metadata: Metadata = { title: 'Your account' };

// Real: password change and two-step sign-in for the signed-in staff member.
export default async function AccountPage() {
  const me = await requireStaff('admin');
  const mfa = await getMyStaffMfa();
  return (
    <>
      <PageHeader eyebrow="Account" title="Your account" description={`Signed in as ${me.displayName}.`} />
      {mfa.kind === 'ok' ? <StaffAccountPanel area="admin" mfa={mfa.data} /> : <LoadError result={mfa} retryHref="/admin/account" />}
    </>
  );
}
