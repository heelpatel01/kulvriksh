'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import type { NotificationView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { markAllNotificationsReadAction, markNotificationReadAction } from '../actions';

// Real, persisted in-app notifications of the signed-in customer.
export function NotificationList({ notifications, unread }: { notifications: NotificationView[]; unread: number }) {
  const notify = useToast();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await action();
      notify(result.message, result.ok ? 'success' : 'warning');
    });

  if (notifications.length === 0) {
    return (
      <Card>
        <EmptyState icon="bell" title="No notifications yet">
          You will be told here when a research report is released to you.
        </EmptyState>
      </Card>
    );
  }
  return (
    <Card
      title={unread > 0 ? `${unread} unread` : 'All read'}
      action={
        unread > 0 ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(markAllNotificationsReadAction)}>
            Mark all as read
          </Button>
        ) : null
      }
    >
      <ul className={styles.rowList} aria-label="Notifications">
        {notifications.map((n) => (
          <li key={n.id} className={styles.row} data-unread={n.readAt ? undefined : 'true'}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>
                {n.title} {n.readAt ? null : <Badge tone="info">New</Badge>}
              </p>
              <p className={styles.rowMeta}>{n.body}</p>
              <p className={styles.rowMeta}>{new Date(n.createdAt).toLocaleString('en-IN')}</p>
            </div>
            <span className={styles.inlineActions}>
              {n.link ? <Link href={n.link}>Open</Link> : null}
              {n.readAt ? null : (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => markNotificationReadAction({ id: n.id }))}>
                  Mark as read
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
