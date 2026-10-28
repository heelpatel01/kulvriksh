'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { MediaItemView } from '@kulvriksh/shared';
import styles from '@/components/portal/portal-pages.module.css';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { deleteMediaAction } from '../actions';

// Real, private media of the customer's workspace. Uploads stream through this site's own
// /api/files/media route to the API, which checks the file's content (not its name), its size and
// the family's storage quota. Downloads are checked again on every request.

const KIND_LABEL: Record<MediaItemView['mediaType'], string> = { photo: 'Photo', document: 'Document', voice: 'Voice', tts_audio: 'Narration' };
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

export function MediaLibrary({ items, usedBytes, nextBefore }: { items: MediaItemView[]; usedBytes: number; nextBefore: string | null }) {
  const router = useRouter();
  const notify = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [deleting, setDeleting] = useState<MediaItemView>();
  const [pending, start] = useTransition();

  async function upload(file: File) {
    setUploading(true);
    setError(undefined);
    try {
      const res = await fetch('/api/files/media', {
        method: 'POST',
        body: file,
        headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
      });
      if (res.ok) {
        notify('File uploaded.');
        router.refresh();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'The upload did not succeed. Please try again.');
      }
    } catch {
      setError('The upload did not succeed. Please try again.');
    } finally {
      setUploading(false);
      if (input.current) {
        input.current.value = '';
      }
    }
  }

  return (
    <div className={styles.stack}>
      <Card title="Add a file" description={`Photos (JPEG, PNG, WebP), PDF documents and voice recordings (MP3, M4A, OGG, WAV). Using ${size(usedBytes)} of your family's storage.`}>
        <div className={styles.stack}>
          <label htmlFor="media-file" className="visually-hidden">
            Choose a file to upload
          </label>
          <input
            id="media-file"
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,audio/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void upload(file);
              }
            }}
          />
          {uploading ? <p role="status">Uploading…</p> : null}
          {error ? (
            <div role="alert">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Your files">
        {items.length === 0 ? (
          <EmptyState icon="image" title="No files yet">
            Upload photographs, certificates or recorded stories. Only you can see them.
          </EmptyState>
        ) : (
          <ul className={styles.rowList} aria-label="Files">
            {items.map((item) => (
              <li key={item.id} className={styles.row}>
                {item.mediaType === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, access-checked file; not optimisable
                  <img src={`/api/files/media/${item.id}`} alt={item.originalFilename ?? 'Family photo'} width={64} height={64} style={{ objectFit: 'cover', borderRadius: 6 }} />
                ) : null}
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {item.originalFilename ?? 'Untitled'} <Badge>{KIND_LABEL[item.mediaType]}</Badge>
                  </p>
                  <p className={styles.rowMeta}>
                    {size(item.byteSize)} · added {new Date(item.createdAt).toLocaleDateString('en-IN')}
                  </p>
                  {item.mediaType === 'voice' ? <audio controls preload="none" src={`/api/files/media/${item.id}`} /> : null}
                </div>
                <span className={styles.inlineActions}>
                  <a href={`/api/files/media/${item.id}`} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(item)}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {nextBefore ? (
          <p style={{ marginTop: 'var(--space-4)' }}>
            <a href={`/dashboard/media?before=${nextBefore}`}>Older files</a>
          </p>
        ) : null}
      </Card>

      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title="Remove this file?"
        description={deleting ? `${deleting.originalFilename ?? 'This file'} will be deleted permanently.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(undefined)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                deleting &&
                start(async () => {
                  const result = await deleteMediaAction({ id: deleting.id });
                  notify(result.message, result.ok ? 'success' : 'warning');
                  setDeleting(undefined);
                })
              }
            >
              {pending ? 'Removing…' : 'Remove file'}
            </Button>
          </>
        }
      >
        <p>This cannot be undone.</p>
      </Dialog>
    </div>
  );
}
