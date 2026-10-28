import type { Metadata } from 'next';
import { SampleDataNotice } from '@/components/portal/sample-data-notice';
import { requireStaff } from '@/lib/auth/staff-session';
import { PageHeader } from '@/components/ui/primitives';
import { getSurnamePages } from '@/lib/repositories/admin';
import { SurnamePagesAdmin } from './surname-pages-admin';

export const metadata: Metadata = { title: 'Surname pages' };

export default async function ContentPage() {
  await requireStaff('admin');
  const data = await getSurnamePages();
  return (
    <>
      <SampleDataNotice />
      <PageHeader
        eyebrow="Content"
        title="Surname pages"
        description="SEO landing pages for family surnames. The surnames and the source of their content are still to be agreed (R2)."
      />
      <SurnamePagesAdmin planned={data.planned} initial={data.pages} />
    </>
  );
}
