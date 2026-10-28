import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth/staff-session';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Icon } from '@/components/ui/icon';
import { PageHeader } from '@/components/ui/primitives';
import { getCase, getCaseRecords, getCaseReports } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';
import { CaseWorkspace } from './case-workspace';

export const metadata: Metadata = { title: 'Assigned family' };

// Real data for one assigned family. Every read below is re-authorised by the API against the
// genealogist's current assignment; an unassigned or unknown family is a 404 (AS-GEN-04).
export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  await requireStaff('genealogist');
  const { caseId } = await params;
  const [detail, records, reports] = await Promise.all([getCase(caseId), getCaseRecords(caseId), getCaseReports(caseId)]);
  if (detail.kind === 'not_found') {
    notFound();
  }
  const failed = firstFailure(detail, records, reports);
  if (failed || detail.kind !== 'ok' || records.kind !== 'ok' || reports.kind !== 'ok') {
    // A removal between the loads shows as not_found on the later ones: treat it as a 404 too.
    if (!failed || failed.kind === 'not_found') {
      notFound();
    }
    return <LoadError result={failed} retryHref={`/genealogist/cases/${caseId}`} />;
  }
  const item = detail.data.case;
  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/genealogist/cases">Assigned families</Link>
        <Icon name="chevronRight" size={14} />
        <span aria-current="page">{item.workspaceName}</span>
      </nav>
      <PageHeader title={item.workspaceName} description={`Assigned ${formatDate(item.assignedAt)} · ${item.members.length} people`} />
      <CaseWorkspace detail={item} records={records.data.records} reports={reports.data.reports} />
    </>
  );
}
