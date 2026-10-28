import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { PortalShell, type NavSection } from '@/components/portal/portal-shell';
import { SignOutButton } from '@/components/portal/sign-out-button';
import { signOutAction } from '@/app/(public)/sign-in/actions';
import { getMyUnreadCount } from '@/lib/api/portal';
import { requireCustomer } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { template: '%s · Customer · Kulvriksh', default: 'Customer dashboard' },
};

/** The unread count comes from the API on every request; it is the customer's own. */
const navFor = (unread: number): NavSection[] => [
  {
    items: [{ href: '/dashboard', label: 'Overview', icon: 'home', exact: true }],
  },
  {
    title: 'Family',
    items: [
      { href: '/dashboard/family', label: 'Family tree & members', icon: 'tree' },
      { href: '/dashboard/media', label: 'Media & voices', icon: 'image' },
      { href: '/dashboard/research', label: 'Research & reports', icon: 'book' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/dashboard/notifications', label: unread > 0 ? `Notifications (${unread})` : 'Notifications', icon: 'bell' },
      { href: '/dashboard/plans', label: 'Plans & payments', icon: 'card' },
      { href: '/dashboard/settings', label: 'Profile & settings', icon: 'settings' },
    ],
  },
];

// Customer area: rendered per request and never statically cached (Product Flows §14.1).
// The session is validated with the API here and again in every page, because a layout is not
// re-rendered on client-side navigation between its pages.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await connection();
  const customer = await requireCustomer();
  const unread = await getMyUnreadCount();
  const user = { name: 'Your account', detail: customer.mobileNumberMasked, initials: 'You' };
  return (
    <PortalShell
      areaLabel="Customer"
      areaHref="/dashboard"
      sections={navFor(unread.kind === 'ok' ? unread.data.unread : 0)}
      user={user}
      exitControl={<SignOutButton action={signOutAction} redirectTo="/sign-in" />}
      previewNote="You are signed in to your private family workspace."
    >
      {children}
    </PortalShell>
  );
}
