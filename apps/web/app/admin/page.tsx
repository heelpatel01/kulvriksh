import type { Metadata } from 'next';
import Link from 'next/link';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, DetailList, EmptyState, Grid, PageHeader, StatCard, StatGrid } from '@/components/ui/primitives';
import { getAdminOverviewData, getAuditEvents, getReportsForReview } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { formatDateTime, formatMoney } from '@/lib/format';

// The area's title template applies to child segments only, so this title is absolute.
export const metadata: Metadata = { title: { absolute: 'Overview · Admin · Kulvriksh' } };

// Real figures from the API (counts are aggregate queries), the review queue and recent audit.
export default async function AdminOverviewPage() {
  await requireStaff('admin');
  const [overview, review, audit] = await Promise.all([getAdminOverviewData(), getReportsForReview('submitted'), getAuditEvents()]);
  const header = <PageHeader eyebrow="Admin panel" title="Overview" description="What needs attention across customers, research, payments and exports." />;
  const failed = firstFailure(overview, review, audit);
  if (failed || overview.kind !== 'ok' || review.kind !== 'ok' || audit.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={failed ?? { kind: 'unavailable' }} retryHref="/admin" />
      </>
    );
  }
  const o = overview.data.overview;
  const attentionTotal = o.attention.amountMismatch + o.attention.unreconciled + o.attention.grantsFailed + o.attention.grantsStuck + o.attention.webhookAttention;
  const revenue = o.orders.revenue.length ? o.orders.revenue.map((r) => formatMoney(r.amountMinor, r.currency)).join(' + ') : formatMoney(0, o.payments.currency);
  return (
    <>
      {header}
      <StatGrid>
        <StatCard label="Customers" value={o.customers.total} hint={`${o.customers.newLast30Days} new in 30 days`} icon="users" />
        <StatCard label="Family workspaces" value={o.family.workspaces} hint={`${o.family.members} people recorded`} icon="tree" />
        <StatCard label="Active assignments" value={o.research.activeAssignments} hint={`${o.research.unassignedWorkspaces} families unassigned`} icon="clipboard" />
        <StatCard label="Reports awaiting review" value={o.attention.reportsAwaitingReview} icon="file" />
        <StatCard label="Payment items needing attention" value={attentionTotal} hint={`Provider: ${o.payments.provider}`} icon="alert" />
      </StatGrid>

      <Grid>
        <Card title="Orders and payments" action={<ButtonLink href="/admin/transactions" size="sm" variant="secondary">Transactions</ButtonLink>}>
          <DetailList
            items={[
              { label: 'Paid', value: `${o.orders.paid} (${o.orders.paidLast30Days} in 30 days)` },
              { label: 'Awaiting payment', value: `${o.orders.created} created · ${o.orders.pending} pending · ${o.orders.failed} failed` },
              { label: 'Paid total', value: revenue },
              {
                label: 'Attention',
                value: attentionTotal ? (
                  <Link href="/admin/transactions?attention=1">
                    {o.attention.amountMismatch} mismatches · {o.attention.unreconciled} unreconciled · {o.attention.grantsFailed + o.attention.grantsStuck} grants ·{' '}
                    {o.attention.webhookAttention} webhook events
                  </Link>
                ) : (
                  'Nothing'
                ),
              },
            ]}
          />
        </Card>
        <Card title="Reports awaiting review" action={<ButtonLink href="/admin/cases" size="sm" variant="secondary">Review</ButtonLink>}>
          {review.data.reports.length === 0 ? (
            <EmptyState icon="check" title="No reports waiting" />
          ) : (
            <ul className={styles.rowList}>
              {review.data.reports.slice(0, 6).map((r) => (
                <li key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>{r.title}</p>
                    <p className={styles.rowMeta}>Updated {formatDateTime(r.updatedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Family data and exports">
          <DetailList
            items={[
              { label: 'People', value: o.family.members },
              { label: 'Relationships', value: o.family.relationships },
              { label: 'PDF exports in progress', value: o.exports.queued + o.exports.running },
              { label: 'PDF exports, last 7 days', value: `${o.exports.readyLast7Days} ready · ${o.exports.failedLast7Days} failed` },
            ]}
          />
        </Card>
        <Card title="Recent activity" action={<Link href="/admin/audit">Audit log</Link>}>
          {audit.data.events.length === 0 ? (
            <p className={styles.muted}>No activity yet.</p>
          ) : (
            <ul className={styles.rowList}>
              {audit.data.events.slice(0, 8).map((event) => (
                <li key={event.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      {event.actorRole} · <span className={styles.mono}>{event.action}</span>
                    </p>
                    <p className={styles.rowMeta}>
                      {event.targetType} · {formatDateTime(event.occurredAt)}
                    </p>
                  </div>
                  <div className={styles.rowAside}>
                    <Badge tone={event.outcome === 'success' ? 'success' : 'danger'}>{event.outcome}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Grid>
      <p className={styles.muted}>
        Staff: {o.staff.admins} admins · {o.staff.genealogists} genealogists · {o.staff.deactivated} deactivated. Figures as of {formatDateTime(o.generatedAt)}.
      </p>
    </>
  );
}
