import Link from 'next/link';
import type { AdminOrderView, WebhookEventView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import tables from '@/components/ui/interactive.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, EmptyState, StatCard, StatGrid } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime, formatMoney } from '@/lib/format';
import { GRANT_STATUS, ORDER_STATUS, WEBHOOK_STATUS } from '@/lib/status';

// Server-rendered: filters and pages are links, so every view is a real API query.

const REASON: Record<string, string> = {
  amount_mismatch: 'Amount mismatch',
  unreconciled: 'Unreconciled',
  unknown_order: 'Unknown order',
  no_usable_payment: 'No usable payment',
  payment_order_mismatch: 'Payment of another order',
};

const FILTERS = [
  { label: 'All', href: '/admin/transactions' },
  { label: 'Needs attention', href: '/admin/transactions?attention=1' },
  { label: 'Paid', href: '/admin/transactions?status=paid' },
  { label: 'Pending', href: '/admin/transactions?status=pending' },
  { label: 'Created', href: '/admin/transactions?status=created' },
  { label: 'Failed', href: '/admin/transactions?status=failed' },
];

function OrdersTable({ orders }: { orders: AdminOrderView[] }) {
  return (
    <div className={tables.tableScroll}>
      <table className={tables.table} aria-label="Orders">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Customer</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/admin/transactions/${o.id}`} className={styles.cellTitle}>
                  {o.planName}
                </Link>
                <span className={`${styles.cellMeta} ${styles.mono}`}>{o.id.slice(0, 8)}</span>
              </td>
              <td>
                <Link href={`/admin/customers/${o.customerUserId}`} className={styles.mono}>
                  {o.customerMobileMasked}
                </Link>
              </td>
              <td>{formatMoney(o.amountMinor, o.currency)}</td>
              <td>
                <StatusBadge map={ORDER_STATUS} value={o.status} /> {o.grantStatus ? <StatusBadge map={GRANT_STATUS} value={o.grantStatus} /> : null}{' '}
                {o.attentionReason ? <Badge tone="danger">{REASON[o.attentionReason] ?? o.attentionReason}</Badge> : null}
              </td>
              <td>{formatDateTime(o.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TransactionsAdmin({
  orders,
  nextBefore,
  filter,
  attention,
}: {
  orders: AdminOrderView[];
  nextBefore: string | null;
  filter: { status?: string; attention: boolean; before?: string };
  attention: {
    summary: { amountMismatch: number; unreconciled: number; grantsFailed: number; grantsStuck: number; webhookAttention: number };
    webhookEvents: WebhookEventView[];
  };
}) {
  const { summary } = attention;
  const query = (extra: string) => {
    const parts = [filter.status ? `status=${filter.status}` : '', filter.attention ? 'attention=1' : '', extra].filter(Boolean);
    return `/admin/transactions${parts.length ? `?${parts.join('&')}` : ''}`;
  };
  return (
    <div className={styles.stack}>
      <StatGrid>
        <StatCard label="Amount mismatches" value={summary.amountMismatch} icon="alert" />
        <StatCard label="Unreconciled orders" value={summary.unreconciled} icon="activity" />
        <StatCard label="Failed grants" value={summary.grantsFailed} icon="shield" />
        <StatCard label="Grants pending > 30 min" value={summary.grantsStuck} icon="clipboard" />
        <StatCard label="Webhook events to check" value={summary.webhookAttention} icon="bell" />
      </StatGrid>

      <Card title="Orders" padded={false}>
        <nav className={styles.inlineActions} aria-label="Filter orders">
          {FILTERS.map((f) => {
            const active = f.href === query('');
            return (
              <ButtonLink key={f.href} href={f.href} size="sm" variant={active ? 'primary' : 'ghost'}>
                {f.label}
              </ButtonLink>
            );
          })}
        </nav>
        {orders.length === 0 ? (
          <EmptyState icon="card" title={filter.before ? 'No older orders' : 'No orders here'}>
            {filter.attention ? 'Nothing needs attention right now.' : 'Orders appear when customers start a payment.'}
          </EmptyState>
        ) : (
          <OrdersTable orders={orders} />
        )}
        {filter.before || nextBefore ? (
          <div className={styles.inlineActions}>
            {filter.before ? (
              <ButtonLink href={query('')} size="sm" variant="ghost">
                Newest
              </ButtonLink>
            ) : null}
            {nextBefore ? (
              <ButtonLink href={query(`before=${encodeURIComponent(nextBefore)}`)} size="sm" variant="secondary">
                Older
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card title="Webhook events that need attention" description="Valid, signed events that could not be applied. Invalid signatures are never stored.">
        {attention.webhookEvents.length === 0 ? (
          <p className={styles.muted}>None.</p>
        ) : (
          <ul className={styles.rowList}>
            {attention.webhookEvents.map((e) => (
              <li key={e.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {e.eventType} <StatusBadge map={WEBHOOK_STATUS} value={e.status} />
                  </p>
                  <p className={styles.rowMeta}>
                    {REASON[e.attentionReason ?? ''] ?? e.attentionReason} · received {formatDateTime(e.receivedAt)} · <span className={styles.mono}>{e.providerEventId}</span>
                    {e.relatedOrderId ? (
                      <>
                        {' · '}
                        <Link href={`/admin/transactions/${e.relatedOrderId}`}>order</Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
