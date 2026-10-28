import type { Metadata } from 'next';
import { LoadError } from '@/components/portal/load-error';
import styles from '@/components/portal/portal-pages.module.css';
import tables from '@/components/ui/interactive.module.css';
import { Badge, Card, EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/ui/status-badge';
import { getNotificationOverview } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { formatDateTime } from '@/lib/format';
import { NOTIFICATION_STATUS } from '@/lib/status';

export const metadata: Metadata = { title: 'Notifications' };

// Real notification events and delivery status (DM §9.3). Message content and addresses are not
// shown. Editing templates and toggling events (F-ADM-08) waits for the confirmed event list and
// content (R36) and for email/SMS providers (R37); nothing here pretends those exist.
export default async function NotificationsPage() {
  await requireStaff('admin');
  const result = await getNotificationOverview();
  const header = (
    <PageHeader eyebrow="Operations" title="Notifications" description="Which events notify people, on which channels, and how delivery is going. Message content is not shown here." />
  );
  if (result.kind !== 'ok') {
    return (
      <>
        {header}
        <LoadError result={result} retryHref="/admin/notifications" />
      </>
    );
  }
  const { events, counts, recent } = result.data.notifications;
  return (
    <>
      {header}
      <div className={styles.stack}>
        <Notice tone="info" title="Email and SMS are not connected">
          No email or SMS provider is configured (decision R37), so only in-app notifications are delivered. Templates and per-event switches (F-ADM-08) become available once the event
          list and wording are agreed (R36).
        </Notice>
        <Card title="Events" padded={false}>
          <div className={tables.tableScroll}>
            <table className={tables.table} aria-label="Notification events">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Channels</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.eventKey}>
                    <td>
                      <span className={styles.cellTitle}>{e.trigger}</span>
                      <span className={`${styles.cellMeta} ${styles.mono}`}>{e.eventKey}</span>
                    </td>
                    <td>{e.recipient}</td>
                    <td>{e.channels.length ? e.channels.map((c) => <Badge key={c}>{c === 'in_app' ? 'In-app' : c}</Badge>) : '—'}</td>
                    <td>{e.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Awaiting decision (R36)</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Delivery totals">
          {counts.length === 0 ? (
            <p className={styles.muted}>No notifications have been created yet.</p>
          ) : (
            <ul className={styles.rowList}>
              {counts.map((c) => (
                <li key={`${c.eventKey}${c.channel}${c.status}`} className={styles.row}>
                  <div className={styles.rowMain}>
                    <p className={styles.rowTitle}>
                      <span className={styles.mono}>{c.eventKey}</span> · {c.channel} <StatusBadge map={NOTIFICATION_STATUS} value={c.status} />
                    </p>
                  </div>
                  <div className={styles.rowAside}>{c.count}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent notifications" padded={false}>
          {recent.length === 0 ? (
            <EmptyState icon="bell" title="Nothing sent yet">
              Notifications appear here when, for example, a report is released to a customer.
            </EmptyState>
          ) : (
            <div className={tables.tableScroll}>
              <table className={tables.table} aria-label="Recent notifications">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Channel</th>
                    <th scope="col">Status</th>
                    <th scope="col">Attempts</th>
                    <th scope="col">Created</th>
                    <th scope="col">Read</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((n) => (
                    <tr key={n.id}>
                      <td className={styles.mono}>{n.eventKey}</td>
                      <td>{n.channel === 'in_app' ? 'In-app' : n.channel}</td>
                      <td>
                        <StatusBadge map={NOTIFICATION_STATUS} value={n.status} />
                        {n.lastErrorCode ? <span className={styles.cellMeta}>{n.lastErrorCode}</span> : null}
                      </td>
                      <td>{n.attemptCount}</td>
                      <td>{formatDateTime(n.createdAt)}</td>
                      <td>{n.readAt ? formatDateTime(n.readAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
