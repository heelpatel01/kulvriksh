import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { PortalShell, type NavSection } from '@/components/portal/portal-shell';
import { SignOutButton } from '@/components/portal/sign-out-button';
import { staffSignOutAction } from '@/app/(public)/staff/sign-in/actions';
import { requireStaff } from '@/lib/auth/staff-session';

export const metadata: Metadata = {
  title: { template: '%s · Admin · Kulvriksh', default: 'Admin panel' },
};

const initials = (name: string) =>
  name
    .split(/s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const NAV: NavSection[] = [
  { items: [{ href: '/admin', label: 'Overview', icon: 'home', exact: true }] },
  {
    title: 'People',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: 'users' },
      { href: '/admin/genealogists', label: 'Genealogists', icon: 'briefcase' },
      { href: '/admin/staff', label: 'Staff accounts', icon: 'shield' },
    ],
  },
  {
    title: 'Research',
    items: [{ href: '/admin/cases', label: 'Cases & assignments', icon: 'clipboard' }],
  },
  {
    title: 'Content & commerce',
    items: [
      { href: '/admin/content', label: 'Surname pages', icon: 'globe' },
      { href: '/admin/services', label: 'Services', icon: 'book' },
      { href: '/admin/plans', label: 'Plans', icon: 'layers' },
      { href: '/admin/transactions', label: 'Transactions', icon: 'card' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
      { href: '/admin/access', label: 'Roles & access', icon: 'lock' },
      { href: '/admin/audit', label: 'Audit log', icon: 'list' },
      { href: '/admin/settings', label: 'System & integrations', icon: 'plug' },
      { href: '/admin/account', label: 'Your account', icon: 'settings' },
    ],
  },
];

// Admin panel: rendered per request and never statically cached (Product Flows §14.1). The admin
// session is checked here and again in every page; the API checks the permission on every call.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  const admin = await requireStaff('admin');
  const user = { name: admin.displayName, detail: 'Administrator', initials: initials(admin.displayName) };
  return (
    <PortalShell
      areaLabel="Admin"
      areaHref="/admin"
      sections={NAV}
      user={user}
      exitControl={<SignOutButton action={staffSignOutAction} redirectTo="/staff/sign-in" />}
    >
      {children}
    </PortalShell>
  );
}
