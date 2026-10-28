'use client';

import Script from 'next/script';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { CheckoutView, OrderView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, DetailList, Notice } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney } from '@/lib/format';
import { ORDER_STATUS } from '@/lib/status';
import { getOrderAction, simulatePaymentAction, verifyPaymentAction } from '../../actions';

// The payment step (F-ORD-02). The payment page (Razorpay Checkout, or the development simulator)
// hands back a payment id and signature; the API verifies both and reads the payment from the
// provider before anything changes. While that is pending we poll a bounded number of times and
// never block the page. Closing the payment page keeps the same order for "Resume payment".

type Phase = 'ready' | 'paying' | 'confirming' | 'paid' | 'failed' | 'closed' | 'still_confirming' | 'error';

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const POLLS = 10;
const POLL_MS = 3000;

export function CheckoutClient({ order: initial, checkout }: { order: OrderView; checkout: CheckoutView }) {
  const [order, setOrder] = useState(initial);
  const [phase, setPhase] = useState<Phase>('ready');
  const [message, setMessage] = useState<string>();
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [pending, start] = useTransition();
  const polling = useRef(false);

  useEffect(() => () => void (polling.current = false), []);

  /** Bounded polling after an unconfirmed verify: the webhook or reconciliation may finish it. */
  async function poll() {
    polling.current = true;
    for (let i = 0; i < POLLS && polling.current; i += 1) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const result = await getOrderAction({ orderId: order.id });
      if (result.ok) {
        setOrder(result.order);
        if (result.order.status === 'paid') {
          setPhase('paid');
          return;
        }
      }
    }
    if (polling.current) {
      setPhase('still_confirming');
    }
  }

  function verify(providerPaymentId: string, signature: string) {
    setPhase('confirming');
    start(async () => {
      const result = await verifyPaymentAction({ orderId: order.id, providerPaymentId, signature });
      if (!result.ok) {
        setMessage(result.message);
        setPhase('error');
        return;
      }
      setOrder(result.order);
      if (result.order.status === 'paid') {
        setPhase('paid');
      } else if (result.result === 'failed') {
        setPhase('failed');
      } else {
        void poll();
      }
    });
  }

  function openRazorpay() {
    if (!window.Razorpay) {
      setScriptFailed(true);
      return;
    }
    setMessage(undefined);
    setPhase('paying');
    const rzp = new window.Razorpay({
      key: checkout.keyId,
      order_id: checkout.providerOrderId,
      amount: checkout.amountMinor,
      currency: checkout.currency,
      name: 'Kulvriksh',
      description: checkout.name,
      handler: (response: RazorpayResponse) => verify(response.razorpay_payment_id, response.razorpay_signature),
      modal: { ondismiss: () => setPhase((p) => (p === 'paying' ? 'closed' : p)) },
    });
    rzp.on('payment.failed', (response) => {
      setMessage(response.error?.description ?? 'The payment did not go through.');
      setPhase('failed');
    });
    rzp.open();
  }

  function simulate(outcome: 'success' | 'failure') {
    setMessage(undefined);
    setPhase('paying');
    start(async () => {
      const result = await simulatePaymentAction({ orderId: order.id, outcome });
      if (!result.ok) {
        setMessage(result.message);
        setPhase('error');
        return;
      }
      verify(result.providerPaymentId, result.signature);
    });
  }

  const busy = pending || phase === 'paying' || phase === 'confirming';

  return (
    <div className={styles.stack}>
      {checkout.provider === 'razorpay' ? (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onReady={() => setScriptReady(true)} onError={() => setScriptFailed(true)} />
      ) : null}
      <Card title={checkout.name} description="Review your order, then pay securely.">
        <DetailList
          items={[
            { label: 'Plan', value: `${order.planName} (${order.serviceName})` },
            { label: 'Amount', value: formatMoney(order.amountMinor, order.currency) },
            { label: 'Order status', value: <StatusBadge map={ORDER_STATUS} value={order.status} /> },
          ]}
        />
      </Card>

      {phase === 'paid' ? (
        <Notice tone="success" title="Payment confirmed">
          {order.grantStatus === 'granted' ? 'Your access is ready.' : 'We are completing your purchase; your access will appear shortly.'}
        </Notice>
      ) : null}
      {phase === 'confirming' ? <Notice tone="info">Confirming your payment…</Notice> : null}
      {phase === 'still_confirming' ? (
        <Notice tone="info" title="Payment is being confirmed">
          This can take a few minutes. You will not be charged twice. Check your order history shortly.
        </Notice>
      ) : null}
      {phase === 'failed' ? (
        <Notice tone="danger" title="The payment did not go through">
          {message ?? 'No money was taken for a failed payment.'} You can try again with the same order.
        </Notice>
      ) : null}
      {phase === 'closed' ? <Notice tone="info">The payment window was closed. Your order is kept; you can resume whenever you like.</Notice> : null}
      {phase === 'error' && message ? <Notice tone="danger">{message}</Notice> : null}
      {scriptFailed ? <Notice tone="danger">The payment page could not be loaded. Check your connection and try again.</Notice> : null}

      {phase !== 'paid' ? (
        checkout.provider === 'development' ? (
          <Card title="Development payment simulator" description="This environment has no real payment provider. These buttons play the part of the payment page; the API still verifies the signed result.">
            <div className={styles.inlineActions}>
              <Button onClick={() => simulate('success')} disabled={busy} icon="check">
                Simulate a successful payment
              </Button>
              <Button variant="secondary" onClick={() => simulate('failure')} disabled={busy}>
                Simulate a failed payment
              </Button>
            </div>
          </Card>
        ) : (
          <div className={styles.inlineActions}>
            <Button onClick={openRazorpay} disabled={busy || !scriptReady} icon="card">
              {phase === 'failed' || phase === 'closed' ? 'Try again' : scriptReady ? 'Pay now' : 'Loading payment page…'}
            </Button>
          </div>
        )
      ) : null}
      <div className={styles.inlineActions}>
        <ButtonLink href="/dashboard/plans" variant="ghost">
          Back to plans
        </ButtonLink>
      </div>
    </div>
  );
}
