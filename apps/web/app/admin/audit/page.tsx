import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { getAuditEvents } from '@/lib/api/portal';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Audit log' };

// Real, append-only audit trail from the API. Newest first, 50 per page.
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireStaff('admin');
  const { before } = await searchParams;
  const result = await getAuditEvents(typeof before === 'string' ? before : undefined);
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Audit log"
        description="A read-only record of sign-ins and changes. Records cannot be edited or deleted. Retention and the final view scope are still to be agreed (R10, FQ-13)."
      />
      {result.kind !== 'ok' ? (
        <LoadError result={result} retryHref="/admin/audit" />
      ) : result.data.events.length === 0 ? (
        <Card>
          <EmptyState icon="list" title="No audit events yet" />
        </Card>
      ) : (
        <Card>
          <ul className={styles.rowList} aria-label="Audit events">
            {result.data.events.map((e) => (
              <li key={e.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <span className={styles.mono}>{e.action}</span>{' '}
                    {e.outcome === 'failure' ? <Badge tone="danger">failure</Badge> : null}
                  </p>
                  <p className={styles.rowMeta}>
                    {formatDateTime(e.occurredAt)} · {e.actorRole}
                    {e.actorUserId ? ` ${e.actorUserId.slice(0, 8)}` : ''} · {e.targetType} {e.targetId.slice(0, 12)}
                    {e.details ? ` · ${JSON.stringify(e.details)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {result.data.nextBefore ? (
            <p style={{ marginTop: 'var(--space-4)' }}>
              <Link href={`/admin/audit?before=${result.data.nextBefore}`}>Older events</Link>
            </p>
          ) : null}
        </Card>
      )}
    </>
  );
}
