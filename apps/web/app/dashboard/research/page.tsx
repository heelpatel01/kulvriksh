import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/auth/session';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Icon } from '@/components/ui/icon';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { getMyReleasedReports } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Research & reports' };

// Real data: only reports that an admin has released for this customer's own family (D4). Drafts,
// submitted reports and research notes are never visible here.
export default async function ResearchPage() {
  await requireCustomer();
  const result = await getMyReleasedReports();

  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Research & reports"
        description="Research is carried out by a genealogist assigned to your family. Reports appear here once they have been reviewed and released."
      />
      <div className={styles.stack}>
        <Notice tone="info">
          Ordering research is not available yet (orders and payments come later). Progress is not shown before release; that
          is still to be decided (FQ-21).
        </Notice>
        {result.kind !== 'ok' ? (
          <LoadError result={result} retryHref="/dashboard/research" />
        ) : result.data.reports.length === 0 ? (
          <Card>
            <EmptyState icon="file" title="No reports available yet">
              When a genealogist’s report has been reviewed and released, it will appear here.
            </EmptyState>
          </Card>
        ) : (
          result.data.reports.map((report) => (
            <Card key={report.id} title={report.title} description={`Released ${formatDate(report.releasedAt ?? report.updatedAt)} · by ${report.authorName}`}>
              <div className={styles.stack}>
                {report.file ? (
                  <p>
                    <a href={`/api/files/reports/${report.id}`}>
                      <Icon name="download" size={14} /> Download the report (PDF, {Math.max(1, Math.round(report.file.byteSize / 1024))} KB)
                    </a>
                  </p>
                ) : null}
                {/* Rendered as text, never as HTML (AS-FAM-04 applies to all user-supplied text). */}
                <p style={{ whiteSpace: 'pre-wrap' }}>{report.body}</p>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
