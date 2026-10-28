import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, PageHeader, StatCard, StatGrid } from '@/components/ui/primitives';
import { getMyCases } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';

// The area's title template applies to child segments only, so this title is absolute.
export const metadata: Metadata = { title: { absolute: 'Overview · Genealogist · Kulvriksh' } };

// Real data: the families currently assigned to this genealogist.
export default async function GenealogistOverviewPage() {
  const me = await requireStaff('genealogist');
  const result = await getMyCases();

  return (
    <>
      <PageHeader
        eyebrow="Genealogist portal"
        title={`Good day, ${me.displayName}`}
        description="Families assigned to you by the Kulvriksh team. You can only see families you are assigned to."
        actions={
          <ButtonLink href="/genealogist/cases" icon="clipboard">
            Assigned families
          </ButtonLink>
        }
      />
      {result.kind !== 'ok' ? (
        <LoadError result={result} retryHref="/genealogist" />
      ) : (
        <>
          <StatGrid>
            <StatCard label="Assigned families" value={result.data.cases.length} icon="briefcase" />
            <StatCard
              label="Open reports"
              value={result.data.cases.reduce((sum, c) => sum + c.openReports, 0)}
              hint="Draft, submitted or returned"
              icon="clipboard"
            />
          </StatGrid>
          <Card title="Most recent assignments">
            {result.data.cases.length === 0 ? (
              <EmptyState icon="check" title="No families assigned yet" />
            ) : (
              <ul className={styles.rowList}>
                {result.data.cases.slice(0, 5).map((c) => (
                  <li key={c.workspaceId} className={styles.row}>
                    <div className={styles.rowMain}>
                      <p className={styles.rowTitle}>
                        <Link href={`/genealogist/cases/${c.workspaceId}`}>{c.workspaceName}</Link>
                      </p>
                      <p className={styles.rowMeta}>Assigned {formatDate(c.assignedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
