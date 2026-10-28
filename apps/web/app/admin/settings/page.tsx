import type { Metadata } from 'next';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import { Badge, Card, Grid, PageHeader } from '@/components/ui/primitives';
import { getSystemStatus } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { ApiStatusCard } from './api-status-card';

export const metadata: Metadata = { title: 'System & integrations' };

const STATUS = {
  connected: { label: 'Connected', tone: 'success' },
  development_only: { label: 'Development only', tone: 'warning' },
  not_configured: { label: 'Not configured', tone: 'neutral' },
} as const;

// Real status, from the API's own configuration. Provider credentials are server-side settings and
// are never shown. Platform-wide editable settings are not specified yet, so none are offered.
export default async function SystemSettingsPage() {
  await requireStaff('admin');
  const result = await getSystemStatus();
  const header = (
    <PageHeader
      eyebrow="Operations"
      title="System & integrations"
      description="Connection status of external services on this server. Provider credentials are server-side settings and are never shown here."
    />
  );
  if (result.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={result} retryHref="/admin/settings" />
      </>
    );
  }
  const { environment, integrations } = result.data.system;
  return (
    <>
      {header}
      <div className={styles.stack}>
        <ApiStatusCard />
        <Card title="Integrations">
          <ul className={styles.rowList}>
            {integrations.map((integration) => (
              <li key={integration.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {integration.name} <span className={styles.muted}>· {integration.purpose}</span>
                  </p>
                  <p className={styles.rowMeta}>{integration.detail}</p>
                </div>
                <div className={styles.rowAside}>
                  <Badge tone={STATUS[integration.status].tone}>{STATUS[integration.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Grid>
          <Card title="Environment">
            <ul className={styles.rowList}>
              <li className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>Mode</p>
                  <p className={styles.rowMeta}>{environment}</p>
                </div>
              </li>
              <li className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>Hosting</p>
                  <p className={styles.rowMeta}>Production server set-up is part of Phase 10 (D6)</p>
                </div>
              </li>
              <li className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>Staging</p>
                  <p className={styles.rowMeta}>Not agreed (R11)</p>
                </div>
              </li>
            </ul>
          </Card>
          <Card title="Platform settings">
            <p className={styles.muted}>Editable platform-wide settings (for example a support address or a maintenance message) are not specified yet, so none are offered here.</p>
          </Card>
        </Grid>
      </div>
    </>
  );
}
