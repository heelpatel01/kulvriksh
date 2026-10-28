import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, DetailList, Grid, Notice, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { getAdminCustomer } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { ACCOUNT_STATUS, GRANT_STATUS, ORDER_STATUS } from '@/lib/status';

export const metadata: Metadata = { title: 'Customer' };

const STATUS = { ...ACCOUNT_STATUS, deactivated: ACCOUNT_STATUS.inactive! };

// One customer (F-ADM-01): profile and contact details, workspace summary, research progress,
// orders, entitlements and recent activity. Private family content (media, tree, exports) is not
// shown to admins (FQ-14).
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('admin');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  const result = await getAdminCustomer(id);
  if (result.kind === 'not_found') {
    notFound();
  }
  if (result.kind !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Customers" title="Customer" />
        <LoadError result={result} retryHref={`/admin/customers/${id}`} />
      </>
    );
  }
  const c = result.data.customer;
  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title={c.displayName ?? 'Customer'}
        description={`Joined ${formatDate(c.createdAt)}`}
        actions={
          <ButtonLink href="/admin/customers" variant="ghost">
            All customers
          </ButtonLink>
        }
      />
      <Notice tone="info">Status actions (suspend, delete) are not available until their rules are agreed (R35).</Notice>
      <Grid>
        <Card title="Account">
          <DetailList
            items={[
              { label: 'Status', value: <StatusBadge map={STATUS} value={c.status} /> },
              { label: 'Mobile', value: <span className={styles.mono}>{c.mobileNumber}</span> },
              { label: 'Active sessions', value: c.activeSessions },
              { label: 'Last seen', value: c.lastSeenAt ? formatDateTime(c.lastSeenAt) : '—' },
            ]}
          />
        </Card>
        <Card title="Family and research">
          <DetailList
            items={[
              { label: 'Workspace', value: c.workspace ? `${c.workspace.name} (${c.workspace.memberCount} people)` : 'Not created yet' },
              { label: 'Genealogist', value: c.assignment ? `${c.assignment.genealogistName} since ${formatDate(c.assignment.assignedAt)}` : 'Not assigned' },
              { label: 'Reports', value: `${c.reports.draft} draft · ${c.reports.submitted} submitted · ${c.reports.returned} returned · ${c.reports.released} released` },
              { label: 'Access', value: c.entitlements.length ? c.entitlements.map((e) => <Badge key={`${e.orderId}${e.key}`}>{e.key}</Badge>) : 'No paid features' },
            ]}
          />
        </Card>
      </Grid>
      <Card title="Orders">
        {c.orders.length === 0 ? (
          <p className={styles.muted}>No orders.</p>
        ) : (
          <ul className={styles.rowList}>
            {c.orders.map((o) => (
              <li key={o.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Link href={`/admin/transactions/${o.id}`}>{o.planName}</Link> · {formatMoney(o.amountMinor, o.currency)} <StatusBadge map={ORDER_STATUS} value={o.status} />{' '}
                    {o.grantStatus ? <StatusBadge map={GRANT_STATUS} value={o.grantStatus} /> : null}
                  </p>
                  <p className={styles.rowMeta}>{formatDateTime(o.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recent activity" description="The customer’s own actions from the audit log.">
        {c.recentActivity.length === 0 ? (
          <p className={styles.muted}>No activity recorded.</p>
        ) : (
          <ul className={styles.rowList}>
            {c.recentActivity.map((a, i) => (
              <li key={`${a.occurredAt}${i}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <span className={styles.mono}>{a.action}</span>
                  </p>
                  <p className={styles.rowMeta}>{formatDateTime(a.occurredAt)}</p>
                </div>
                <div className={styles.rowAside}>
                  <Badge tone={a.outcome === 'success' ? 'success' : 'danger'}>{a.outcome}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
