import type { Metadata } from 'next';
import { requireCustomer } from '@/lib/auth/session';
import { LoadError } from '@/components/portal/load-error';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, Notice, PageHeader } from '@/components/ui/primitives';
import { getMyMedia } from '@/lib/api/portal';
import { MediaLibrary } from './media-library';

export const metadata: Metadata = { title: 'Media & voices' };

// Real data: the private files of the customer's own workspace.
export default async function MediaPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await requireCustomer();
  const { before } = await searchParams;
  const result = await getMyMedia(typeof before === 'string' ? before : undefined);
  return (
    <>
      <PageHeader
        eyebrow="Family workspace"
        title="Media & voices"
        description="Photographs, documents and voice records are private to your workspace."
      />
      {result.kind === 'ok' ? (
        <>
          <MediaLibrary items={result.data.items} usedBytes={result.data.usedBytes} nextBefore={result.data.nextBefore} />
          <div style={{ marginTop: 'var(--space-5)' }}>
            <Notice tone="info">Linking files to individual people, thumbnails and text-to-speech are not available yet (FQ-9, FQ-22, M10).</Notice>
          </div>
        </>
      ) : result.kind === 'not_found' ? (
        <Card>
          <EmptyState icon="tree" title="Create your family workspace first" action={<ButtonLink href="/dashboard/family">Create workspace</ButtonLink>}>
            Files are stored in your private family workspace.
          </EmptyState>
        </Card>
      ) : (
        <LoadError result={result} retryHref="/dashboard/media" />
      )}
    </>
  );
}
