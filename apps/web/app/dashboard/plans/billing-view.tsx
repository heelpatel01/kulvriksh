'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { EntitlementView, OrderView, PaymentStatusView, PlanView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button, ButtonLink } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Badge, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { GRANT_STATUS, ORDER_STATUS } from '@/lib/status';
import { createOrderAction } from './actions';

// Real plans, orders and access. Buying creates (or, on a repeated click, reuses) one order, then
// opens its checkout page. Access is only ever granted by the API after it has confirmed the
// payment with the provider; this page never decides that a payment succeeded.

/** What a customer can see about an order that needs a person to look at it. */
function orderNote(o: OrderView): string | null {
  if (o.status === 'paid' && o.grantStatus !== 'granted') {
    return o.grantStatus === 'failed' ? 'We are completing your purchase. If this does not change soon, contact support.' : 'We are completing your purchase.';
  }
  if (o.attentionReason) {
    return 'We are checking this payment. You have not been charged twice.';
  }
  return null;
}

export function BillingView({
  plans,
  orders,
  nextBefore,
  paged,
  entitlements,
  provider,
  mode,
}: {
  plans: PlanView[];
  orders: OrderView[];
  nextBefore: string | null;
  paged: boolean;
  entitlements: EntitlementView[];
  provider: PaymentStatusView['provider'];
  mode: PaymentStatusView['mode'];
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [buying, setBuying] = useState<string>();
  // One request key per plan, kept until the order exists, so a repeated or retried click returns
  // the same order instead of creating a second one (AS-ORD-02).
  const keys = useRef(new Map<string, string>());

  const buy = (plan: PlanView) =>
    start(async () => {
      setError(undefined);
      setBuying(plan.id);
      let key = keys.current.get(plan.id);
      if (!key) {
        key = crypto.randomUUID();
        keys.current.set(plan.id, key);
      }
      const result = await createOrderAction({ planId: plan.id, idempotencyKey: key });
      setBuying(undefined);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      keys.current.delete(plan.id);
      router.push(`/dashboard/plans/checkout/${result.order.id}`);
    });

  const columns: Column<OrderView>[] = [
    {
      key: 'plan',
      header: 'Plan',
      render: (o) => (
        <>
          <span className={styles.cellTitle}>{o.planName}</span>
          <span className={styles.cellMeta}>{o.serviceName}</span>
        </>
      ),
    },
    { key: 'date', header: 'Date', render: (o) => formatDateTime(o.createdAt) },
    { key: 'amount', header: 'Amount', align: 'end', render: (o) => formatMoney(o.amountMinor, o.currency) },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <>
          <StatusBadge map={ORDER_STATUS} value={o.status} />
          {o.status === 'paid' && o.grantStatus ? (
            <>
              {' '}
              <StatusBadge map={GRANT_STATUS} value={o.grantStatus} />
            </>
          ) : null}
          {orderNote(o) ? <span className={styles.cellMeta}>{orderNote(o)}</span> : null}
        </>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (o) =>
        o.status !== 'paid' && provider !== 'none' ? (
          <ButtonLink href={`/dashboard/plans/checkout/${o.id}`} size="sm" variant="secondary">
            Resume payment
          </ButtonLink>
        ) : o.paidAt ? (
          <span className={styles.cellMeta}>Paid {formatDate(o.paidAt)}</span>
        ) : null,
    },
  ];

  return (
    <div className={styles.stack}>
      {provider === 'none' ? (
        <Notice tone="info" title="Payments are not open yet">
          Plans are shown for information. Buying will be possible once online payments are connected.
        </Notice>
      ) : mode !== 'live' ? (
        <Notice tone="warning" title={mode === 'development' ? 'Development payments' : 'Test-mode payments'}>
          {mode === 'development'
            ? 'This environment uses a simulated payment page. No real money moves.'
            : 'Payments run in the provider’s test mode. No real money moves.'}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card title="Your access" description="What your paid plans include. Access is granted only after your payment is confirmed.">
        {entitlements.length === 0 ? (
          <p className={styles.muted}>You have no paid features yet.</p>
        ) : (
          <ul className={styles.rowList}>
            {entitlements.map((e) => (
              <li key={`${e.orderId}:${e.key}`} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    <Badge tone="success">{e.key}</Badge>
                  </p>
                  <p className={styles.rowMeta}>
                    Since {formatDate(e.validFrom)}
                    {e.validUntil ? ` · until ${formatDate(e.validUntil)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Plans">
        {plans.length === 0 ? (
          <EmptyState icon="card" title="No plans are available yet">
            Plans appear here when they are offered.
          </EmptyState>
        ) : (
          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article key={plan.id} className={styles.planCard}>
                <h3 className={styles.planName}>{plan.name}</h3>
                <p className={styles.cellMeta}>{plan.serviceName}</p>
                {plan.description ? <p>{plan.description}</p> : null}
                <p className={styles.planPrice}>{formatMoney(plan.priceMinor, plan.currency)}</p>
                <Button onClick={() => buy(plan)} disabled={provider === 'none' || pending} icon="card">
                  {buying === plan.id ? 'Starting…' : 'Buy'}
                </Button>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card title="Payment history" padded={false}>
        {orders.length === 0 ? (
          <EmptyState icon="list" title={paged ? 'No older orders' : 'No orders yet'}>
            {paged ? 'You have reached the end of your history.' : 'Orders appear here after you choose a plan.'}
          </EmptyState>
        ) : (
          <DataTable caption="Your orders" rows={orders} columns={columns} getRowId={(o) => o.id} pageSize={20} emptyTitle="No orders" />
        )}
        {nextBefore || paged ? (
          <div className={styles.inlineActions}>
            {paged ? (
              <ButtonLink href="/dashboard/plans" size="sm" variant="ghost">
                Newest orders
              </ButtonLink>
            ) : null}
            {nextBefore ? (
              <ButtonLink href={`/dashboard/plans?before=${encodeURIComponent(nextBefore)}`} size="sm" variant="secondary">
                Older orders
              </ButtonLink>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
