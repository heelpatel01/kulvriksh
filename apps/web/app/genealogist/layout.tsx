import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { PortalShell, type NavSection } from '@/components/portal/portal-shell';
import { SignOutButton } from '@/components/portal/sign-out-button';
import { staffSignOutAction } from '@/app/(public)/staff/sign-in/actions';
import { requireStaff } from '@/lib/auth/staff-session';

export const metadata: Metadata = {
  title: { template: '%s · Genealogist · Kulvriksh', default: 'Genealogist portal' },
};

const NAV: NavSection[] = [
  {
    items: [
      { href: '/genealogist', label: 'Overview', icon: 'home', exact: true },
      { href: '/genealogist/cases', label: 'Assigned families', icon: 'clipboard' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/genealogist/account', label: 'Your account', icon: 'lock' },
      { href: '/genealogist/settings', label: 'Profile', icon: 'settings' },
    ],
  },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

// Genealogist portal: rendered per request and never statically cached (Product Flows §14.1).
// The genealogist session is checked here and in every page; the API also checks the assignment
// on every request, so a removed assignment ends access immediately.
export default async function GenealogistLayout({ children }: { children: ReactNode }) {
  await connection();
  const genealogist = await requireStaff('genealogist');
  const user = { name: genealogist.displayName, detail: 'Genealogist', initials: initials(genealogist.displayName) };
  return (
    <PortalShell
      previewNote="Signed in as a genealogist. You see only the families currently assigned to you."
      areaLabel="Genealogist"
      areaHref="/genealogist"
      sections={NAV}
      user={user}
      exitControl={<SignOutButton action={staffSignOutAction} redirectTo="/staff/sign-in" />}
    >
      {children}
    </PortalShell>
  );
}
