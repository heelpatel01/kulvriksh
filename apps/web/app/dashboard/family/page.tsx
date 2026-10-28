import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/auth/session';
import { LoadError } from '@/components/portal/load-error';
import { PageHeader } from '@/components/ui/primitives';
import { getMyExports, getMyFamilyTree } from '@/lib/api/portal';
import { formatDate } from '@/lib/format';
import { ExportPanel } from './export-panel';
import { FamilyManager } from './family-manager';

export const metadata: Metadata = { title: 'Family tree & members' };

// Real data: the customer's own workspace from the API (no sample data on this screen).
export default async function FamilyPage() {
  await requireCustomer();
  const result = await getMyFamilyTree();
  if (result.kind !== 'ok' && result.kind !== 'not_found') {
    return (
      <>
        <PageHeader eyebrow="Family workspace" title="Family tree & members" />
        <LoadError result={result} retryHref="/dashboard/family" />
      </>
    );
  }
  const tree = result.kind === 'ok' ? result.data : null;
  // Recent exports load with the page; if they cannot be read, the panel simply starts empty.
  const exports = tree ? await getMyExports() : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Family workspace"
        title={tree ? tree.workspace.name : 'Family tree & members'}
        description={
          tree
            ? `Created ${formatDate(tree.workspace.createdAt)}. Only you can see this workspace.`
            : 'Start your private family workspace.'
        }
      />
      <FamilyManager tree={tree} />
      {tree ? <ExportPanel members={tree.members} initialJobs={exports?.kind === 'ok' ? exports.data.jobs : []} /> : null}
    </>
  );
}
