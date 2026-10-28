import type { Metadata } from 'next';
import { LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getMyGenealogistProfile } from '@/lib/api/portal';
import { requireStaff } from '@/lib/auth/staff-session';
import { formatDate } from '@/lib/format';
import { GenealogistSettings } from './genealogist-settings';

export const metadata: Metadata = { title: 'Profile' };

// The genealogist's own real profile and workload. Availability is not part of the agreed design,
// so it is not offered (a product decision is needed before it can be stored).
export default async function GenealogistSettingsPage() {
  await requireStaff('genealogist');
  const result = await getMyGenealogistProfile();
  if (result.kind !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Account" title="Profile" />
        <LoadError result={result} retryHref="/genealogist/settings" />
      </>
    );
  }
  const profile = result.data.profile;
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" description={`Working with Kulvriksh since ${formatDate(profile.createdAt)}.`} />
      <GenealogistSettings profile={profile} />
    </>
  );
}
