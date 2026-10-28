import type { Metadata } from 'next';
import Link from 'next/link';
import { requireCustomer } from '@/lib/auth/session';
import { LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getMyNotifications } from '@/lib/api/portal';
import { NotificationList } from './notification-list';

export const metadata: Metadata = { title: 'Notifications' };

// Real data: the customer's own in-app notifications, newest first, 20 per page.
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireCustomer();
  const { before } = await searchParams;
  const result = await getMyNotifications(typeof before === 'string' ? before : undefined);
  return (
    <>
      <PageHeader eyebrow="Account" title="Notifications" description="Messages about your family's research. Email and SMS delivery are not set up yet." />
      {result.kind !== 'ok' ? (
        <LoadError result={result} retryHref="/dashboard/notifications" />
      ) : (
        <>
          <NotificationList notifications={result.data.notifications} unread={result.data.unread} />
          {result.data.nextBefore ? (
            <p style={{ marginTop: 'var(--space-4)' }}>
              <Link href={`/dashboard/notifications?before=${result.data.nextBefore}`}>Older notifications</Link>
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
