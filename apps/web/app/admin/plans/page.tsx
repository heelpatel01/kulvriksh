import type { Metadata } from 'next';
import { firstFailure, LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getAdminPlans, getAdminServices } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { PlansAdmin } from './plans-admin';

export const metadata: Metadata = { title: 'Plans' };

// Real plans (F-ADM-04). Prices are whatever an admin enters (R12); which features a plan unlocks
// is its list of entitlement keys (R14). New plans start inactive.
export default async function AdminPlansPage() {
  await requireStaff('admin');
  const [plans, services] = await Promise.all([getAdminPlans(), getAdminServices()]);
  const header = (
    <PageHeader
      eyebrow="Commerce"
      title="Plans"
      description="Plans customers can buy. Price changes never affect existing orders, which keep the price they were created with."
    />
  );
  const failed = firstFailure(plans, services);
  if (failed || plans.kind !== 'ok' || services.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={failed ?? { kind: 'unavailable' }} retryHref="/admin/plans" />
      </>
    );
  }
  return (
    <>
      {header}
      <PlansAdmin plans={plans.data.plans} services={services.data.services} payments={plans.data.payments} />
    </>
  );
}
