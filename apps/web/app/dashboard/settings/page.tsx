import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/auth/session';
import { LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getMyProfile } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';
import { SettingsForms } from './settings-forms';
import { SignOutEverywhere } from './sign-out-everywhere';

export const metadata: Metadata = { title: 'Profile & settings' };

export default async function SettingsPage() {
  await requireCustomer();
  const result = await getMyProfile();
  if (result.kind !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Account" title="Profile & settings" />
        <LoadError result={result} retryHref="/dashboard/settings" />
      </>
    );
  }
  const { profile } = result.data;
  return (
    <>
      <PageHeader eyebrow="Account" title="Profile & settings" description={`Member since ${formatDate(profile.memberSince)}.`} />
      <SettingsForms profile={profile} />
      <SignOutEverywhere />
    </>
  );
}
