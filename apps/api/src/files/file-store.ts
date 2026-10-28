import type { MediaItemView } from '@kulvriksh/shared';
import { auditInTransaction, type AuditRole } from '../audit/audit.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';

// File metadata and access checks (DM §7.4, §7.5, §11.2). Content lookups return the storage key
// only after the caller's access has been checked in the same query; metadata queries never select
// it. Rows are inserted only after the bytes are committed to storage.

type Tx = Prisma.TransactionClient;

export interface CommittedFile {
  storageBackend: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

export interface FileContent {
  storageKey: string;
  contentType: string;
  byteSize: number;
  filename: string | null;
}

export type Fail<K extends string> = { ok: false; reason: K };

export interface FileStore {
  workspaceOf(ownerId: string): Promise<string | undefined>;
  listMedia(ownerId: string, page: { limit: number; before?: string }): Promise<{ items: MediaItemView[]; nextBefore: string | null; usedBytes: number } | undefined>;
  /** Inserts stored_file + media_item; re-checks the quota under the workspace lock. */
  createMedia(input: {
    ownerId: string;
    file: CommittedFile;
    mediaType: 'photo' | 'document' | 'voice';
    filename: string | null;
    quotaBytes: number;
    requestId?: string;
  }): Promise<{ ok: true; item: MediaItemView } | Fail<'no_workspace' | 'quota_exceeded'>>;
  mediaContent(ownerId: string, mediaId: string): Promise<FileContent | undefined>;
  /** Removes the media item and marks its file for deletion; the caller then deletes the bytes. */
  deleteMedia(ownerId: string, mediaId: string, requestId?: string): Promise<{ fileId: string; storageKey: string } | undefined>;
  /** Attaches a PDF to an editable report of an assigned genealogist; the old file is released. */
  attachReportFile(input: { genealogistId: string; workspaceId: string; reportId: string; file: CommittedFile; requestId?: string }): Promise<
    { ok: true; replaced?: { fileId: string; storageKey: string } } | Fail<'not_found' | 'not_editable'>
  >;
  reportFileForGenealogist(genealogistId: string, workspaceId: string, reportId: string): Promise<FileContent | undefined>;
  reportFileForAdmin(reportId: string): Promise<FileContent | undefined>;
  /** Only a released report of the customer's own workspace (D4, AS-REP-01). */
  reportFileForCustomer(ownerId: string, reportId: string): Promise<FileContent | undefined>;
  /** Final step of a deletion, after the bytes are gone. */
  forgetFile(fileId: string): Promise<void>;
  /** Files stuck in pending_deletion (a failed byte removal), for the cleanup retry. */
  pendingDeletions(limit: number): Promise<Array<{ fileId: string; storageKey: string }>>;
  /** Writes a failure/security audit row about file access (e.g. a refused upload). */
  auditFailure(entry: { actorUserId: string; actorRole: AuditRole; action: string; workspaceId?: string; reason: string; requestId?: string }): Promise<void>;
}

const toMedia = (row: { id: string; mediaType: MediaItemView['mediaType']; originalFilename: string | null; createdAt: Date; file: { contentType: string; byteSize: bigint } }): MediaItemView => ({
  id: row.id,
  mediaType: row.mediaType,
  contentType: row.file.contentType,
  byteSize: Number(row.file.byteSize),
  originalFilename: row.originalFilename,
  createdAt: row.createdAt.toISOString(),
});

const mediaSelect = { id: true, mediaType: true, originalFilename: true, createdAt: true, file: { select: { contentType: true, byteSize: true } } } as const;

async function insertFile(tx: Tx, workspaceId: string, kind: 'media' | 'report', file: CommittedFile, userId: string) {
  return tx.storedFile.create({
    data: {
      workspaceId,
      kind,
      storageBackend: file.storageBackend,
      storageKey: file.storageKey,
      contentType: file.contentType,
      byteSize: BigInt(file.byteSize),
      checksumSha256: file.sha256,
      createdByUserId: userId,
    },
    select: { id: true },
  });
}

/** Same rule as the research store: the CURRENT active assignment, locked against removal. */
async function assigned(tx: Tx, genealogistId: string, workspaceId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT a.id::text AS id FROM assignment a
    JOIN app_user u ON u.id = a.genealogist_user_id AND u.status = 'active'
    WHERE a.workspace_id = ${workspaceId}::uuid AND a.genealogist_user_id = ${genealogistId}::uuid AND a.removed_at IS NULL
    FOR SHARE OF a`;
  return rows.length > 0;
}

const contentOf = (file: { storageKey: string; contentType: string; byteSize: bigint; status: string } | null, filename: string | null): FileContent | undefined =>
  file && file.status === 'committed' ? { storageKey: file.storageKey, contentType: file.contentType, byteSize: Number(file.byteSize), filename } : undefined;

const fileSelect = { storageKey: true, contentType: true, byteSize: true, status: true } as const;

export function createPrismaFileStore(prisma: PrismaClient): FileStore {
  const workspaceOf = async (ownerId: string) => (await prisma.familyWorkspace.findUnique({ where: { ownerUserId: ownerId }, select: { id: true } }))?.id;

  return {
    workspaceOf,

    async listMedia(ownerId, { limit, before }) {
      const ws = await workspaceOf(ownerId);
      if (!ws) {
        return undefined;
      }
      const cursor = before ? await prisma.mediaItem.findFirst({ where: { id: before, workspaceId: ws }, select: { id: true, createdAt: true } }) : null;
      const rows = await prisma.mediaItem.findMany({
        where: {
          workspaceId: ws,
          ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
        },
        select: mediaSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const used = await prisma.storedFile.aggregate({ where: { workspaceId: ws, kind: { not: 'export_pdf' } }, _sum: { byteSize: true } });
      const page = rows.slice(0, limit);
      return { items: page.map(toMedia), nextBefore: rows.length > limit ? page[page.length - 1]!.id : null, usedBytes: Number(used._sum.byteSize ?? 0n) };
    },

    async createMedia({ ownerId, file, mediaType, filename, quotaBytes, requestId }) {
      return prisma.$transaction(async (tx) => {
        // Serialise uploads per workspace so concurrent uploads cannot pass the quota together.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text AS id FROM family_workspace WHERE owner_user_id = ${ownerId}::uuid FOR UPDATE`;
        const ws = locked[0]?.id;
        if (!ws) {
          return { ok: false, reason: 'no_workspace' } as const;
        }
        const used = await tx.storedFile.aggregate({ where: { workspaceId: ws, kind: { not: 'export_pdf' } }, _sum: { byteSize: true } });
        if (Number(used._sum.byteSize ?? 0n) + file.byteSize > quotaBytes) {
          return { ok: false, reason: 'quota_exceeded' } as const;
        }
        const stored = await insertFile(tx, ws, 'media', file, ownerId);
        const item = await tx.mediaItem.create({
          data: { workspaceId: ws, fileId: stored.id, mediaType, originalFilename: filename, uploadedByUserId: ownerId },
          select: mediaSelect,
        });
        await auditInTransaction(tx, {
          actorUserId: ownerId,
          actorRole: 'customer',
          action: 'media.uploaded',
          targetType: 'media_item',
          targetId: item.id,
          workspaceId: ws,
          details: { type: file.contentType, bytes: file.byteSize },
          requestId,
        });
        return { ok: true, item: toMedia(item) } as const;
      });
    },

    async mediaContent(ownerId, mediaId) {
      const row = await prisma.mediaItem.findFirst({
        where: { id: mediaId, workspace: { ownerUserId: ownerId } },
        select: { originalFilename: true, file: { select: fileSelect } },
      });
      return row ? contentOf(row.file, row.originalFilename) : undefined;
    },

    async deleteMedia(ownerId, mediaId, requestId) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.mediaItem.findFirst({
          where: { id: mediaId, workspace: { ownerUserId: ownerId } },
          select: { id: true, workspaceId: true, fileId: true, file: { select: { storageKey: true } } },
        });
        if (!row) {
          return undefined;
        }
        await tx.mediaItem.delete({ where: { id: row.id } });
        await tx.storedFile.update({ where: { id: row.fileId }, data: { status: 'pending_deletion' } });
        await auditInTransaction(tx, {
          actorUserId: ownerId,
          actorRole: 'customer',
          action: 'media.deleted',
          targetType: 'media_item',
          targetId: row.id,
          workspaceId: row.workspaceId,
          requestId,
        });
        return { fileId: row.fileId, storageKey: row.file.storageKey };
      });
    },

    async attachReportFile({ genealogistId, workspaceId, reportId, file, requestId }) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_found' } as const;
        }
        const locked = await tx.$queryRaw<Array<{ status: string; report_file_id: string | null }>>`
          SELECT status::text AS status, report_file_id::text AS report_file_id FROM report
          WHERE id = ${reportId}::uuid AND workspace_id = ${workspaceId}::uuid FOR UPDATE`;
        const report = locked[0];
        if (!report) {
          return { ok: false, reason: 'not_found' } as const;
        }
        if (report.status !== 'draft' && report.status !== 'returned') {
          return { ok: false, reason: 'not_editable' } as const;
        }
        const stored = await insertFile(tx, workspaceId, 'report', file, genealogistId);
        await tx.report.update({ where: { id: reportId }, data: { reportFileId: stored.id, version: { increment: 1 } } });
        let replaced: { fileId: string; storageKey: string } | undefined;
        if (report.report_file_id) {
          const old = await tx.storedFile.update({ where: { id: report.report_file_id }, data: { status: 'pending_deletion' }, select: { id: true, storageKey: true } });
          replaced = { fileId: old.id, storageKey: old.storageKey };
        }
        await auditInTransaction(tx, {
          actorUserId: genealogistId,
          actorRole: 'genealogist',
          action: 'report.file_attached',
          targetType: 'report',
          targetId: reportId,
          workspaceId,
          details: { bytes: file.byteSize, replaced: Boolean(replaced) },
          requestId,
        });
        return { ok: true, ...(replaced ? { replaced } : {}) } as const;
      });
    },

    async reportFileForGenealogist(genealogistId, workspaceId, reportId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return undefined;
        }
        const row = await tx.report.findFirst({ where: { id: reportId, workspaceId }, select: { title: true, reportFile: { select: fileSelect } } });
        return row ? contentOf(row.reportFile, `${row.title}.pdf`) : undefined;
      });
    },

    async reportFileForAdmin(reportId) {
      const row = await prisma.report.findUnique({ where: { id: reportId }, select: { title: true, reportFile: { select: fileSelect } } });
      return row ? contentOf(row.reportFile, `${row.title}.pdf`) : undefined;
    },

    async reportFileForCustomer(ownerId, reportId) {
      const row = await prisma.report.findFirst({
        where: { id: reportId, status: 'released', workspace: { ownerUserId: ownerId } },
        select: { title: true, reportFile: { select: fileSelect } },
      });
      return row ? contentOf(row.reportFile, `${row.title}.pdf`) : undefined;
    },

    async forgetFile(fileId) {
      await prisma.storedFile.deleteMany({ where: { id: fileId, status: 'pending_deletion' } });
    },

    async pendingDeletions(limit) {
      const rows = await prisma.storedFile.findMany({ where: { status: 'pending_deletion' }, select: { id: true, storageKey: true }, orderBy: { updatedAt: 'asc' }, take: limit });
      return rows.map((r) => ({ fileId: r.id, storageKey: r.storageKey }));
    },

    async auditFailure({ actorUserId, actorRole, action, workspaceId, reason, requestId }) {
      await prisma.auditEvent
        .create({
          data: {
            actorUserId,
            actorRole,
            action,
            targetType: 'upload',
            targetId: actorUserId,
            workspaceId: workspaceId ?? null,
            outcome: 'failure',
            details: { reason },
            requestId: requestId ?? null,
          },
        })
        .catch(() => undefined);
    },
  };
}
