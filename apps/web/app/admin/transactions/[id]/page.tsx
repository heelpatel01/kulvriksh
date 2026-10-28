import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { ButtonLink } from '@/components/ui/button';
import { Badge, Card, DetailList, Grid, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { getAdminOrder } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { formatDateTime, formatMoney } from '@/lib/format';
import { GRANT_STATUS, ORDER_STATUS, WEBHOOK_STATUS } from '@/lib/status';
import { RegrantButton } from './regrant-button';

export const metadata: Metadata = { title: 'Order' };

const VIA: Record<string, string> = { verify: 'checkout verification', webhook: 'webhook', reconciliation: 'reconciliation' };

// One order with everything F-ADM-05 asks for: the plan snapshot, payment attempts, webhook
// events, reconciliation checks, the grant record and the resulting entitlements.
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff('admin');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  const result = await getAdminOrder(id);
  if (result.kind === 'not_found') {
    notFound();
  }
  if (result.kind !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Transactions" title="Order" />
        <LoadError result={result} retryHref={`/admin/transactions/${id}`} />
      </>
    );
  }
  const o = result.data.order;
  return (
    <>
      <PageHeader
        eyebrow="Transactions"
        title={`${o.planName} · ${formatMoney(o.amountMinor, o.currency)}`}
        description={`Order ${o.id}`}
        actions={
          <ButtonLink href="/admin/transactions" variant="ghost">
            All transactions
          </ButtonLink>
        }
      />
      <Grid>
        <Card title="Order">
          <DetailList
            items={[
              { label: 'Status', value: <StatusBadge map={ORDER_STATUS} value={o.status} /> },
              { label: 'Attention', value: o.attentionReason ? <Badge tone="danger">{o.attentionReason}</Badge> : 'None' },
              { label: 'Customer', value: <Link href={`/admin/customers/${o.customerUserId}`}>{o.customerMobileMasked}</Link> },
              { label: 'Provider', value: `${o.provider} · ${o.providerOrderId}` },
              { label: 'Created', value: formatDateTime(o.createdAt) },
              { label: 'Paid', value: o.paidAt ? formatDateTime(o.paidAt) : '—' },
              { label: 'Reconciliation checks', value: `${o.reconcileCheckCount}${o.reconcileLastCheckedAt ? ` · last ${formatDateTime(o.reconcileLastCheckedAt)}` : ''}` },
            ]}
          />
        </Card>
        <Card title="Entitlement grant" action={o.status === 'paid' && o.grant?.status !== 'granted' ? <RegrantButton orderId={o.id} /> : null}>
          {o.grant ? (
            <DetailList
              items={[
                { label: 'Status', value: <StatusBadge map={GRANT_STATUS} value={o.grant.status} /> },
                { label: 'Attempts', value: o.grant.attemptCount },
                { label: 'Last error', value: o.grant.lastError ?? '—' },
                { label: 'Granted', value: o.grant.grantedAt ? formatDateTime(o.grant.grantedAt) : '—' },
                { label: 'Entitlements', value: o.entitlements.length ? o.entitlements.map((e) => <Badge key={e.key}>{e.key}</Badge>) : 'None' },
              ]}
            />
          ) : (
            <p className={styles.muted}>No grant yet: a grant is created only when the payment is confirmed.</p>
          )}
        </Card>
      </Grid>
      <Card title="Payment attempts" description="Read back from the provider or received in signed webhooks. No card or contact details are stored.">
        {o.attempts.length === 0 ? (
          <p className={styles.muted}>No attempts recorded.</p>
        ) : (
          <ul className={styles.rowList}>
            {o.attempts.map((a) => (
              <li key={a.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <span className={styles.mono}>{a.providerPaymentId}</span> <Badge tone={a.status === 'captured' ? 'success' : a.status === 'failed' ? 'danger' : 'info'}>{a.status}</Badge>
                  </p>
                  <p className={styles.rowMeta}>
                    {formatMoney(a.amountMinor, a.currency)} · first seen via {VIA[a.firstSeenVia]} · {formatDateTime(a.createdAt)}
                    {a.failureCode ? ` · ${a.failureCode}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Webhook events">
        {o.webhookEvents.length === 0 ? (
          <p className={styles.muted}>No webhook events for this order.</p>
        ) : (
          <ul className={styles.rowList}>
            {o.webhookEvents.map((e) => (
              <li key={e.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {e.eventType} <StatusBadge map={WEBHOOK_STATUS} value={e.status} />
                  </p>
                  <p className={styles.rowMeta}>
                    {formatDateTime(e.receivedAt)} · <span className={styles.mono}>{e.providerEventId}</span>
                    {e.attentionReason ? ` · ${e.attentionReason}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
