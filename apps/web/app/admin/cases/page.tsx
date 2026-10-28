import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff-session';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getGenealogistsForAdmin, getReportsForReview, getWorkspacesForAdmin } from '@/lib/api/portal';
import { CasesAdmin } from './cases-admin';

export const metadata: Metadata = { title: 'Cases & assignments' };

// Real data: assignments and report review from the API (no sample data on this screen).
export default async function AdminCasesPage() {
  await requireStaff('admin');
  const [workspaces, genealogists, reports] = await Promise.all([getWorkspacesForAdmin(), getGenealogistsForAdmin(), getReportsForReview('submitted')]);
  const header = (
    <PageHeader
      eyebrow="Research"
      title="Cases & assignments"
      description="Assign genealogists to families, and review reports before they are released to customers."
    />
  );
  const failed = firstFailure(workspaces, genealogists, reports);
  if (failed || workspaces.kind !== 'ok' || genealogists.kind !== 'ok' || reports.kind !== 'ok') {
    return (
      <>
        {header}
        {failed ? <LoadError result={failed} retryHref="/admin/cases" /> : null}
      </>
    );
  }
  return (
    <>
      {header}
      <CasesAdmin workspaces={workspaces.data.workspaces} genealogists={genealogists.data.genealogists} reports={reports.data.reports} />
    </>
  );
}
