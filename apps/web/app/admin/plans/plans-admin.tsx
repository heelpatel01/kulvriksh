'use client';

import { useState, useTransition } from 'react';
import type { AdminService, PaymentStatusView, PlanView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button, ButtonLink } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { FormActions, FormGrid, SelectField, TextareaField, TextField } from '@/components/ui/form';
import { Badge, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { currencyDigits, formatDateTime, formatMoney } from '@/lib/format';
import { createPlanAction, updatePlanAction, type ActionResult } from '../actions';

// Plans in the real catalogue. The API validates every field (positive price in minor units, the
// configured currency, entitlement key format) and audits price and activation changes.

const toMinor = (text: string, digits: number): number | undefined => {
  const value = text.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return undefined;
  }
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > digits) {
    return undefined;
  }
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || 0);
};
const toMajor = (minor: number, digits: number) => (minor / 10 ** digits).toFixed(digits);
const keysOf = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean);

function PlanForm({
  plan,
  services,
  currency,
  onDone,
}: {
  plan?: PlanView;
  services: AdminService[];
  currency: string;
  onDone: () => void;
}) {
  const notify = useToast();
  const digits = currencyDigits(currency);
  const [serviceId, setServiceId] = useState(plan?.serviceId ?? services[0]?.id ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [description, setDescription] = useState(plan?.description ?? '');
  const [price, setPrice] = useState(plan ? toMajor(plan.priceMinor, digits) : '');
  const [keys, setKeys] = useState(plan?.entitlementKeys.join(', ') ?? '');
  const [error, setError] = useState<ActionResult & { ok: false }>();
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const priceMinor = toMinor(price, digits);
      if (priceMinor === undefined || priceMinor <= 0) {
        setError({ ok: false, message: 'Please correct the highlighted fields.', fields: { priceMinor: `Enter a positive amount with at most ${digits} decimals.` } });
        return;
      }
      const result = plan
        ? await updatePlanAction({ id: plan.id, name, description, priceMinor, entitlementKeys: keysOf(keys) })
        : await createPlanAction({ serviceId, name, description, priceMinor, entitlementKeys: keysOf(keys) });
      if (result.ok) {
        notify(result.message);
        onDone();
      } else {
        setError(result);
      }
    });

  return (
    <form
      className={styles.stack}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormGrid>
        {plan ? null : (
          <SelectField
            id="plan-service"
            label="Service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            options={services.map((s) => ({ value: s.id, label: `${s.name}${s.status === 'active' ? '' : ' (inactive)'}` }))}
            error={error?.fields?.serviceId}
            required
          />
        )}
        <TextField id="plan-name" label="Plan name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={error?.fields?.name} required />
        <TextField
          id="plan-price"
          label={`Price (${currency})`}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          hint={price && toMinor(price, digits) ? `Charged as ${formatMoney(toMinor(price, digits)!, currency)}` : undefined}
          error={error?.fields?.priceMinor}
          required
        />
        <TextField
          id="plan-keys"
          label="Entitlement keys"
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
          hint="What this plan unlocks, comma separated, e.g. family.export. Leave empty for none."
          error={error?.fields?.entitlementKeys}
        />
      </FormGrid>
      <TextareaField id="plan-description" label="Description" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} error={error?.fields?.description} />
      {error && !error.fields ? <Notice tone="danger">{error.message}</Notice> : null}
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
        </Button>
      </FormActions>
    </form>
  );
}

export function PlansAdmin({ plans, services, payments }: { plans: PlanView[]; services: AdminService[]; payments: PaymentStatusView | null }) {
  const notify = useToast();
  const [editing, setEditing] = useState<PlanView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const currency = payments?.currency ?? 'INR';

  const toggle = (plan: PlanView) =>
    start(async () => {
      const result = await updatePlanAction({ id: plan.id, status: plan.status === 'active' ? 'inactive' : 'active' });
      notify(result.message, result.ok ? 'success' : 'warning');
    });

  const columns: Column<PlanView>[] = [
    {
      key: 'name',
      header: 'Plan',
      sortValue: (p) => p.name,
      render: (p) => (
        <>
          <span className={styles.cellTitle}>{p.name}</span>
          <span className={styles.cellMeta}>{p.serviceName}</span>
        </>
      ),
    },
    { key: 'price', header: 'Price', align: 'end', sortValue: (p) => p.priceMinor, render: (p) => formatMoney(p.priceMinor, p.currency) },
    {
      key: 'keys',
      header: 'Unlocks',
      hideOnMobile: true,
      render: (p) => (p.entitlementKeys.length ? p.entitlementKeys.map((k) => <Badge key={k}>{k}</Badge>) : <span className={styles.muted}>Nothing</span>),
    },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
    { key: 'updated', header: 'Updated', hideOnMobile: true, sortValue: (p) => p.updatedAt, render: (p) => formatDateTime(p.updatedAt) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'end',
      render: (p) => (
        <div className={styles.inlineActions}>
          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
            Edit
          </Button>
          <Button size="sm" variant={p.status === 'active' ? 'secondary' : 'primary'} onClick={() => toggle(p)} disabled={pending}>
            {p.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.stack}>
      <Notice tone={payments?.provider === 'none' ? 'warning' : 'info'} title="Payment setup">
        Provider: {payments?.provider ?? 'none'}
        {payments?.mode ? ` (${payments.mode} mode)` : ''} · Currency: {currency} (provisional, DQ-2) ·{' '}
        {payments && Object.keys(payments.gates).length
          ? `Gated features: ${Object.entries(payments.gates)
              .map(([feature, key]) => `${feature} needs ${key}`)
              .join(', ')}`
          : 'No features are gated yet (R14)'}
        . Refunds are handled outside the platform (D3).
      </Notice>
      <Card
        title="Plans"
        padded={false}
        action={
          services.length > 0 ? (
            <Button icon="plus" onClick={() => setCreating(true)}>
              New plan
            </Button>
          ) : null
        }
      >
        {services.length === 0 ? (
          <EmptyState icon="briefcase" title="Create a service first" action={<ButtonLink href="/admin/services">Go to services</ButtonLink>}>
            Every plan belongs to a service.
          </EmptyState>
        ) : plans.length === 0 ? (
          <EmptyState icon="card" title="No plans yet">
            Create a plan, then activate it to offer it to customers.
          </EmptyState>
        ) : (
          <DataTable caption="Plans" rows={plans} columns={columns} getRowId={(p) => p.id} getSearchText={(p) => `${p.name} ${p.serviceName}`} searchLabel="Search plans" pageSize={20} />
        )}
      </Card>
      <Dialog open={creating} onClose={() => setCreating(false)} title="New plan" description="New plans start inactive.">
        {creating ? <PlanForm services={services} currency={currency} onDone={() => setCreating(false)} /> : null}
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Edit ${editing.name}` : 'Edit plan'} description="Existing orders keep their price and what they unlock.">
        {editing ? <PlanForm plan={editing} services={services} currency={currency} onDone={() => setEditing(null)} /> : null}
      </Dialog>
    </div>
  );
}
