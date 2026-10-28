import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth/staff-session';
import { LoadError } from '@/components/portal/load-error';
import { Card, PageHeader } from '@/components/ui/primitives';
import { getGenealogistsForAdmin } from '@/lib/api/portal';
import { GenealogistsTable } from './genealogists-table';

export const metadata: Metadata = { title: 'Genealogists' };

// Real data from the API. Creating genealogist accounts waits for the sign-in decision (R9).
export default async function GenealogistsPage() {
  await requireStaff('admin');
  const result = await getGenealogistsForAdmin();
  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Genealogists"
        description="Genealogists who research assigned families. Account creation and the final sign-in method are still to be agreed (R9)."
      />
      {result.kind !== 'ok' ? (
        <LoadError result={result} retryHref="/admin/genealogists" />
      ) : (
        <Card>
          <GenealogistsTable genealogists={result.data.genealogists} />
        </Card>
      )}
    </>
  );
}
