import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Icon } from '@/components/ui/icon';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { getMyCases } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Assigned families' };

// Real data: only families with an active assignment to this genealogist (AS-GEN-02).
export default async function CasesPage() {
  await requireStaff('genealogist');
  const result = await getMyCases();
  return (
    <>
      <PageHeader eyebrow="Research" title="Assigned families" description="Every family currently assigned to you by the Kulvriksh team." />
      {result.kind !== 'ok' ? (
        <LoadError result={result} retryHref="/genealogist/cases" />
      ) : result.data.cases.length === 0 ? (
        <Card>
          <EmptyState icon="briefcase" title="No families assigned yet">
            When an administrator assigns a family to you, it will appear here.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <ul className={styles.rowList} aria-label="Assigned families">
            {result.data.cases.map((c) => (
              <li key={c.workspaceId} className={styles.row}>
                <span className={styles.rowIcon}>
                  <Icon name="briefcase" size={16} />
                </span>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Link href={`/genealogist/cases/${c.workspaceId}`}>{c.workspaceName}</Link>
                  </p>
                  <p className={styles.rowMeta}>
                    Assigned {formatDate(c.assignedAt)} · {c.memberCount} people
                  </p>
                </div>
                <div className={styles.rowAside}>{c.openReports > 0 ? <Badge tone="info">{c.openReports} open report(s)</Badge> : null}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
