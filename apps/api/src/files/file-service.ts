import type { Readable } from 'node:stream';
import type { MediaItemView } from '@kulvriksh/shared';
import type { Logger } from '../logger.ts';
import { detectType, type MediaKind } from '../storage/file-types.ts';
import type { StorageConfig } from '../storage/storage-config.ts';
import { newStorageKey, UploadTooLargeError, type StorageProvider, type TempUpload } from '../storage/storage.ts';
import type { CommittedFile, FileContent, FileStore } from './file-store.ts';

// Uploads and downloads (Flows §7.1, §7.2). Order of an upload:
//   1. stream to the temporary area, stopping at the size limit;
//   2. detect the type from the content signature and check it against the allowed list;
//   3. commit the bytes under a new server-generated key;
//   4. insert the rows (quota re-checked under a lock). If 4 fails, the committed bytes are deleted.
// An interrupted upload leaves only a temporary file, which the cleanup command removes.

export type UploadResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'too_large'; limit: number }
  | { kind: 'unsupported_type' }
  | { kind: 'quota_exceeded' }
  | { kind: 'not_found' }
  | { kind: 'not_editable' }
  | { kind: 'no_workspace' };

export interface FileService {
  uploadMedia(input: { ownerId: string; body: Readable; declaredBytes?: number; filename: string | null; requestId?: string }): Promise<UploadResult<MediaItemView>>;
  uploadReportFile(input: { genealogistId: string; workspaceId: string; reportId: string; body: Readable; declaredBytes?: number; requestId?: string }): Promise<UploadResult<null>>;
  deleteMedia(ownerId: string, mediaId: string, requestId?: string): Promise<boolean>;
  open(content: FileContent): Promise<{ stream: Readable; byteSize: number }>;
  /** Cleanup: abandoned temporary uploads and files whose byte removal failed earlier. */
  sweep(): Promise<{ abandonedUploads: number; retriedDeletions: number }>;
}

const MEDIA_KINDS: Record<MediaKind, 'photo' | 'document' | 'voice'> = { photo: 'photo', document: 'document', voice: 'voice' };

export function createFileService({ storage, store, config, logger }: { storage: StorageProvider; store: FileStore; config: StorageConfig; logger: Logger }): FileService {
  async function stage(body: Readable, declared: number | undefined, limit: number, allowed: readonly string[]) {
    // Refuse before reading when the declared size is already too large.
    if (declared !== undefined && declared > limit) {
      body.resume();
      return { kind: 'too_large', limit } as const;
    }
    let temp: TempUpload;
    try {
      temp = await storage.writeTemp(body, limit);
    } catch (err) {
      if (err instanceof UploadTooLargeError) {
        return { kind: 'too_large', limit } as const;
      }
      throw err;
    }
    const detected = detectType(temp.head);
    if (!detected || !allowed.includes(detected.type) || temp.byteSize === 0) {
      await storage.discardTemp(temp);
      return { kind: 'unsupported_type' } as const;
    }
    return { kind: 'staged', temp, detected } as const;
  }

  async function commit(temp: TempUpload, kind: 'media' | 'report', contentType: string): Promise<CommittedFile> {
    const key = newStorageKey(kind);
    await storage.commit(temp, key);
    return { storageBackend: storage.backend, storageKey: key, contentType, byteSize: temp.byteSize, sha256: temp.sha256 };
  }

  /** Removes bytes, then the row. A failed removal leaves the row pending for the cleanup retry. */
  async function destroy(fileId: string, storageKey: string) {
    try {
      await storage.delete(storageKey);
      await store.forgetFile(fileId);
    } catch (err) {
      logger.warn('file byte removal failed; cleanup will retry', { fileId, err });
    }
  }

  return {
    async uploadMedia({ ownerId, body, declaredBytes, filename, requestId }) {
      if (!(await store.workspaceOf(ownerId))) {
        body.resume();
        return { kind: 'no_workspace' };
      }
      const staged = await stage(body, declaredBytes, config.mediaMaxBytes, config.allowedMediaTypes);
      if (staged.kind !== 'staged') {
        await store.auditFailure({ actorUserId: ownerId, actorRole: 'customer', action: 'media.upload_refused', reason: staged.kind, requestId });
        return staged;
      }
      const file = await commit(staged.temp, 'media', staged.detected.type);
      try {
        const result = await store.createMedia({
          ownerId,
          file,
          mediaType: MEDIA_KINDS[staged.detected.kind],
          filename,
          quotaBytes: config.workspaceQuotaBytes,
          requestId,
        });
        if (!result.ok) {
          await storage.delete(file.storageKey);
          return { kind: result.reason };
        }
        return { kind: 'ok', value: result.item };
      } catch (err) {
        await storage.delete(file.storageKey);
        throw err;
      }
    },

    async uploadReportFile({ genealogistId, workspaceId, reportId, body, declaredBytes, requestId }) {
      // Report files are PDFs only (R31: the format of uploaded reports is otherwise open).
      const staged = await stage(body, declaredBytes, config.reportMaxBytes, ['application/pdf']);
      if (staged.kind !== 'staged') {
        return staged;
      }
      const file = await commit(staged.temp, 'report', staged.detected.type);
      try {
        const result = await store.attachReportFile({ genealogistId, workspaceId, reportId, file, requestId });
        if (!result.ok) {
          await storage.delete(file.storageKey);
          return { kind: result.reason };
        }
        if (result.replaced) {
          await destroy(result.replaced.fileId, result.replaced.storageKey);
        }
        return { kind: 'ok', value: null };
      } catch (err) {
        await storage.delete(file.storageKey);
        throw err;
      }
    },

    async deleteMedia(ownerId, mediaId, requestId) {
      const removed = await store.deleteMedia(ownerId, mediaId, requestId);
      if (!removed) {
        return false;
      }
      await destroy(removed.fileId, removed.storageKey);
      return true;
    },

    open: (content) => storage.open(content.storageKey),

    async sweep() {
      const abandonedUploads = await storage.sweepTemp(config.abandonedUploadSeconds * 1000);
      let retriedDeletions = 0;
      for (const pending of await store.pendingDeletions(200)) {
        await destroy(pending.fileId, pending.storageKey);
        retriedDeletions += 1;
      }
      return { abandonedUploads, retriedDeletions };
    },
  };
}
