import styles from '@/components/portal/portal-pages.module.css';
import { Badge, Card, Notice, type Tone } from '@/components/ui/primitives';
import { getApiReadiness, type ApiReadiness } from '@/lib/api/readiness';

const STATE: Record<ApiReadiness['state'], { label: string; tone: Tone; text: string }> = {
  ready: { label: 'Ready', tone: 'success', text: 'The API answered its readiness check.' },
  not_ready: { label: 'Not ready', tone: 'danger', text: 'The API is running, but a dependency it needs is down.' },
  unreachable: { label: 'Unreachable', tone: 'danger', text: 'The API did not answer within 2 seconds. Is it running?' },
  unexpected: {
    label: 'Unexpected response',
    tone: 'warning',
    text: 'Something answered, but it is not the Kulvriksh API. Check the port in API_INTERNAL_URL.',
  },
  misconfigured: { label: 'Misconfigured', tone: 'warning', text: 'API_INTERNAL_URL is not a valid http(s) address.' },
  not_configured: {
    label: 'Not connected',
    tone: 'neutral',
    text: 'Set API_INTERNAL_URL in apps/web/.env.local to show the live status of a locally running API.',
  },
};

const DATABASE_LABEL = { up: 'Up', down: 'Down', not_configured: 'Not configured' } as const;

/** Live, per-request status of the Express API: the first part of the UI backed by the real backend. */
export async function ApiStatusCard() {
  const readiness = await getApiReadiness();
  const state = STATE[readiness.state];
  return (
    <Card title="Live API status" description="Checked on the server each time this page loads." action={<Badge tone={state.tone}>{state.label}</Badge>}>
      <div className={styles.stack}>
        <p className={styles.muted}>{state.text}</p>
        {readiness.state === 'ready' || readiness.state === 'not_ready' ? (
          <p className={styles.muted}>
            Database: <strong>{DATABASE_LABEL[readiness.database]}</strong>
            {readiness.database === 'not_configured' ? ' (the database driver is not installed yet)' : null}
          </p>
        ) : null}
        {readiness.state === 'unexpected' ? <p className={styles.muted}>HTTP status: {readiness.httpStatus}</p> : null}
        <Notice tone="info">The rest of this page still uses sample data.</Notice>
      </div>
    </Card>
  );
}
