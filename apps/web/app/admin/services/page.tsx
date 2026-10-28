import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff-session';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { listAdminServices } from '@/lib/api/services';
import styles from '@/components/portal/portal-pages.module.css';
import { ServicesAdmin } from './services-admin';

export const metadata: Metadata = { title: 'Services' };

// Live data from PostgreSQL through the Express API: no sample data on this screen.
export default async function AdminServicesPage() {
  await requireStaff('admin');
  const result = await listAdminServices();

  return (
    <>
      <PageHeader
        eyebrow="Content & commerce"
        title="Services"
        description="The service catalogue, stored in the database. New services start inactive; only active services are shown publicly."
      />
      {result.kind === 'ok' ? (
        <ServicesAdmin services={result.data.services} />
      ) : result.kind === 'not_configured' ? (
        <Card>
          <EmptyState icon="plug" title="The database API is not connected">
            Run <code>npm run db:init</code> once (or <code>npm run db:start</code>), start the API with <code>npm run dev:api</code>,
            and make sure <code>apps/web/.env.local</code> sets API_INTERNAL_URL.
          </EmptyState>
        </Card>
      ) : result.kind === 'unauthorized' ? (
        <Notice tone="danger" title="The API refused the admin request">
          Your admin session has ended or lacks permission. Sign in again.
        </Notice>
      ) : (
        <Card>
          <EmptyState
            icon="alert"
            title="Services could not be loaded"
            action={
              <ButtonLink href="/admin/services" variant="secondary">
                Try again
              </ButtonLink>
            }
          >
            {result.kind === 'unreachable' ? 'The API did not answer. Is it running?' : 'The database is unavailable right now.'}
          </EmptyState>
        </Card>
      )}
      <div className={styles.stack} style={{ marginTop: 'var(--space-5)' }}>
        <Notice tone="info" title="Plans and prices are not here yet">
          Plans, prices and entitlements are still to be agreed (R12–R14), so the Plans page keeps clearly labelled sample data.
          Every change on this screen is recorded in the audit log.
        </Notice>
      </div>
    </>
  );
}
