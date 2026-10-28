import type { ExportJobView, ExportOptionsView } from '@kulvriksh/shared';
import { auditInTransaction } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import type { CommittedFile, FileContent } from '../files/file-store.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import type { ExportOptions } from './export-options.ts';
import type { TreeMember, TreeRelationship } from './tree-layout.ts';

// Export jobs (DM §7.6, Flows F-FAM-05, §12.4). The workspace always comes from the caller's
// session (owner) or is re-checked against a CURRENT assignment (genealogist) in the same query
// that reads the job, so a job id from another family is simply not found. Running jobs carry a
// lease and a fresh token; every update is conditional on that token, and an expired lease marks
// the job failed. All lease times use the database clock.

/** Who is asking. A genealogist is limited to a workspace with their active assignment. */
export type ExportAccess = { kind: 'owner'; userId: string } | { kind: 'genealogist'; userId: string; workspaceId: string };

export interface ClaimedJob {
  id: string;
  token: string;
  workspaceId: string;
  requestedByUserId: string;
  options: ExportOptions;
}

export interface ExportStore {
  /** The workspace the caller may export, or undefined (no workspace, or no active assignment). */
  workspaceFor(access: ExportAccess): Promise<{ id: string; name: string } | undefined>;
  request(input: { access: ExportAccess; options: ExportOptions; queueLimit: number; requestId?: string }): Promise<
    { kind: 'created' | 'existing'; job: ExportJobView } | { kind: 'busy' } | { kind: 'no_workspace' } | { kind: 'scope_not_found' }
  >;
  list(access: ExportAccess, limit: number): Promise<ExportJobView[] | undefined>;
  get(access: ExportAccess, jobId: string): Promise<ExportJobView | undefined>;
  cancel(access: ExportAccess, jobId: string, requestId?: string): Promise<'cancelled' | 'not_open' | 'not_found'>;
  download(access: ExportAccess, jobId: string): Promise<FileContent | undefined>;

  claim(owner: string, leaseSeconds: number): Promise<ClaimedJob | undefined>;
  /**
   * Only the data the drawing needs: names and relationships. No research, reports or media. The
   * whole family is loaded (never cut at the current, possibly lowered, family limit); undefined if
   * it is larger than an export can ever be.
   */
  loadTree(workspaceId: string): Promise<{ name: string; members: TreeMember[]; relationships: TreeRelationship[] } | undefined>;
  heartbeat(job: ClaimedJob, progress: number, leaseSeconds: number): Promise<boolean>;
  complete(
    job: ClaimedJob,
    file: CommittedFile,
    result: { pageCount: number; memberCount: number; warnings: string[] },
    retentionHours: number,
  ): Promise<boolean>;
  fail(job: ClaimedJob, errorCode: string): Promise<boolean>;
  /** Running jobs whose lease expired (crash, restart, hang) become failed. */
  recoverExpired(): Promise<number>;
  /** Releases the files of jobs past their expiry; returns what to delete from storage. */
  expireFinished(limit: number): Promise<Array<{ fileId: string; storageKey: string }>>;
  /** Final step of an expiry, after the bytes are gone. */
  forgetFile(fileId: string): Promise<void>;
}

/** The configuration's upper bounds for a family (FAMILY_MAX_MEMBERS, FAMILY_MAX_RELATIONSHIPS). */
export const EXPORT_MAX_TREE = { members: 5000, relationships: 20_000 } as const;

const jobSelect = {
  id: true,
  status: true,
  progress: true,
  options: true,
  pageCount: true,
  memberCount: true,
  warnings: true,
  errorCode: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  expiresAt: true,
  file: { select: { byteSize: true, status: true } },
} as const;

type JobRow = Prisma.ExportJobGetPayload<{ select: typeof jobSelect }>;

export function toExportJob(row: JobRow, now = new Date()): ExportJobView {
  const downloadable = row.status === 'ready' && row.file?.status === 'committed' && row.expiresAt !== null && row.expiresAt > now;
  return {
    id: row.id,
    status: row.status,
    progress: row.progress,
    options: row.options as unknown as ExportOptionsView,
    pageCount: row.pageCount,
    memberCount: row.memberCount,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    downloadable,
    byteSize: downloadable && row.file ? Number(row.file.byteSize) : null,
  };
}

/** Jobs the caller may see: their own, in a workspace they may currently export. */
function scope(access: ExportAccess): Prisma.ExportJobWhereInput {
  return access.kind === 'owner'
    ? { requestedByUserId: access.userId, workspace: { ownerUserId: access.userId } }
    : {
        requestedByUserId: access.userId,
        workspaceId: access.workspaceId,
        workspace: { assignments: { some: { genealogistUserId: access.userId, removedAt: null, genealogist: { status: 'active' } } } },
      };
}

export function createPrismaExportStore(prisma: PrismaClient): ExportStore {
  async function workspaceFor(access: ExportAccess) {
    const row =
      access.kind === 'owner'
        ? await prisma.familyWorkspace.findUnique({ where: { ownerUserId: access.userId }, select: { id: true, name: true } })
        : await prisma.familyWorkspace.findFirst({
            where: {
              id: access.workspaceId,
              assignments: { some: { genealogistUserId: access.userId, removedAt: null, genealogist: { status: 'active' } } },
            },
            select: { id: true, name: true },
          });
    return row ?? undefined;
  }

  const openJob = (tx: Prisma.TransactionClient, workspaceId: string, userId: string) =>
    tx.exportJob.findFirst({ where: { workspaceId, requestedByUserId: userId, status: { in: ['queued', 'running'] } }, select: jobSelect });

  return {
    workspaceFor,

    async request({ access, options, queueLimit, requestId }) {
      const ws = await workspaceFor(access);
      if (!ws) {
        return { kind: 'no_workspace' };
      }
      // A subtree must start from a member of this workspace; a member id from elsewhere is not found.
      if (options.scope.kind !== 'all' && (await prisma.familyMember.count({ where: { id: options.scope.memberId, workspaceId: ws.id } })) !== 1) {
        return { kind: 'scope_not_found' };
      }
      try {
        return await prisma.$transaction(async (tx) => {
          // Repeated clicks reuse the open job (AS-FAM-12); the partial unique index backs this up.
          const existing = await openJob(tx, ws.id, access.userId);
          if (existing) {
            return { kind: 'existing', job: toExportJob(existing) } as const;
          }
          const open = await tx.exportJob.count({ where: { status: { in: ['queued', 'running'] } } });
          if (open >= queueLimit) {
            return { kind: 'busy' } as const;
          }
          const row = await tx.exportJob.create({
            data: { workspaceId: ws.id, requestedByUserId: access.userId, options: options as unknown as Prisma.InputJsonObject },
            select: jobSelect,
          });
          await auditInTransaction(tx, {
            actorUserId: access.userId,
            actorRole: access.kind === 'owner' ? 'customer' : 'genealogist',
            action: 'export.requested',
            targetType: 'export_job',
            targetId: row.id,
            workspaceId: ws.id,
            details: { mode: options.mode, pageSize: options.pageSize, scope: options.scope.kind },
            requestId,
          });
          return { kind: 'created', job: toExportJob(row) } as const;
        });
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        // Two requests raced; both get the one open job.
        const existing = await prisma.$transaction((tx) => openJob(tx, ws.id, access.userId));
        if (!existing) {
          throw err;
        }
        return { kind: 'existing', job: toExportJob(existing) };
      }
    },

    async list(access, limit) {
      if (!(await workspaceFor(access))) {
        return undefined;
      }
      const rows = await prisma.exportJob.findMany({ where: scope(access), select: jobSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
      return rows.map((r) => toExportJob(r));
    },

    async get(access, jobId) {
      const row = await prisma.exportJob.findFirst({ where: { id: jobId, ...scope(access) }, select: jobSelect });
      return row ? toExportJob(row) : undefined;
    },

    async cancel(access, jobId, requestId) {
      return prisma.$transaction(async (tx) => {
        const row = await tx.exportJob.findFirst({ where: { id: jobId, ...scope(access) }, select: { id: true, status: true, workspaceId: true } });
        if (!row) {
          return 'not_found' as const;
        }
        // Clearing the lease makes the running worker's next fenced update fail, so it stops.
        const updated = await tx.exportJob.updateMany({
          where: { id: row.id, status: { in: ['queued', 'running'] } },
          data: { status: 'failed', errorCode: 'cancelled', leaseOwner: null, leaseToken: null, leaseExpiresAt: null, finishedAt: new Date() },
        });
        if (updated.count === 0) {
          return 'not_open' as const;
        }
        await auditInTransaction(tx, {
          actorUserId: access.userId,
          actorRole: access.kind === 'owner' ? 'customer' : 'genealogist',
          action: 'export.cancelled',
          targetType: 'export_job',
          targetId: row.id,
          workspaceId: row.workspaceId,
          requestId,
        });
        return 'cancelled' as const;
      });
    },

    async download(access, jobId) {
      const row = await prisma.exportJob.findFirst({
        where: { id: jobId, status: 'ready', expiresAt: { gt: new Date() }, ...scope(access) },
        select: { createdAt: true, file: { select: { storageKey: true, contentType: true, byteSize: true, status: true } } },
      });
      if (!row?.file || row.file.status !== 'committed') {
        return undefined;
      }
      return {
        storageKey: row.file.storageKey,
        contentType: row.file.contentType,
        byteSize: Number(row.file.byteSize),
        filename: `family-tree-${row.createdAt.toISOString().slice(0, 10)}.pdf`,
      };
    },

    async claim(owner, leaseSeconds) {
      const rows = await prisma.$queryRaw<Array<{ id: string; token: string; workspace_id: string; requested_by_user_id: string; options: unknown }>>`
        UPDATE export_job SET status = 'running', lease_owner = ${owner}, lease_token = gen_random_uuid(),
          lease_expires_at = now() + make_interval(secs => ${leaseSeconds}), started_at = now(), progress = 0, updated_at = now()
        WHERE id = (SELECT id FROM export_job WHERE status = 'queued' ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING id::text AS id, lease_token::text AS token, workspace_id::text AS workspace_id,
          requested_by_user_id::text AS requested_by_user_id, options`;
      const row = rows[0];
      return row
        ? { id: row.id, token: row.token, workspaceId: row.workspace_id, requestedByUserId: row.requested_by_user_id, options: row.options as ExportOptions }
        : undefined;
    },

    async loadTree(workspaceId) {
      const [workspace, members, relationships] = await Promise.all([
        prisma.familyWorkspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
        prisma.familyMember.findMany({ where: { workspaceId }, select: { id: true, displayName: true }, orderBy: { id: 'asc' }, take: EXPORT_MAX_TREE.members + 1 }),
        prisma.relationship.findMany({
          where: { workspaceId },
          select: { id: true, relationshipType: true, memberAId: true, memberBId: true },
          orderBy: { id: 'asc' },
          take: EXPORT_MAX_TREE.relationships + 1,
        }),
      ]);
      if (members.length > EXPORT_MAX_TREE.members || relationships.length > EXPORT_MAX_TREE.relationships) {
        return undefined;
      }
      return {
        name: workspace.name,
        members: members.map((m) => ({ id: m.id, name: m.displayName })),
        relationships: relationships.map((r) => ({ id: r.id, type: r.relationshipType as TreeRelationship['type'], from: r.memberAId, to: r.memberBId })),
      };
    },

    async heartbeat(job, progress, leaseSeconds) {
      const n = await prisma.$executeRaw`
        UPDATE export_job SET progress = GREATEST(progress, ${Math.min(99, Math.max(0, Math.round(progress)))}),
          lease_expires_at = now() + make_interval(secs => ${leaseSeconds}), updated_at = now()
        WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.token}::uuid`;
      return n === 1;
    },

    async complete(job, file, result, retentionHours) {
      try {
        return await prisma.$transaction(async (tx) => {
          const stored = await tx.storedFile.create({
            data: {
              workspaceId: job.workspaceId,
              kind: 'export_pdf',
              storageBackend: file.storageBackend,
              storageKey: file.storageKey,
              contentType: file.contentType,
              byteSize: BigInt(file.byteSize),
              checksumSha256: file.sha256,
              createdByUserId: job.requestedByUserId,
            },
            select: { id: true },
          });
          const n = await tx.$executeRaw`
            UPDATE export_job SET status = 'ready', progress = 100, file_id = ${stored.id}::uuid,
              expires_at = now() + make_interval(hours => ${retentionHours}), finished_at = now(),
              page_count = ${result.pageCount}, member_count = ${result.memberCount}, warnings = ${JSON.stringify(result.warnings)}::jsonb,
              lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
            WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.token}::uuid`;
          if (n !== 1) {
            // Lost the lease (cancelled or recovered): undo the file row; the caller deletes the bytes.
            throw new LostLease();
          }
          return true;
        });
      } catch (err) {
        if (err instanceof LostLease) {
          return false;
        }
        throw err;
      }
    },

    async fail(job, errorCode) {
      const n = await prisma.$executeRaw`
        UPDATE export_job SET status = 'failed', error_code = ${errorCode}, finished_at = now(),
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = ${job.id}::uuid AND status = 'running' AND lease_token = ${job.token}::uuid`;
      return n === 1;
    },

    async recoverExpired() {
      return prisma.$executeRaw`
        UPDATE export_job SET status = 'failed', error_code = 'interrupted', finished_at = now(),
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE status = 'running' AND lease_expires_at < now()`;
    },

    async expireFinished(limit) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ job_id: string; file_id: string; storage_key: string }>>`
          SELECT j.id::text AS job_id, f.id::text AS file_id, f.storage_key FROM export_job j
          JOIN stored_file f ON f.id = j.file_id
          WHERE j.status = 'ready' AND j.expires_at < now()
          ORDER BY j.expires_at LIMIT ${limit} FOR UPDATE OF j SKIP LOCKED`;
        if (rows.length === 0) {
          return [];
        }
        await tx.exportJob.updateMany({ where: { id: { in: rows.map((r) => r.job_id) } }, data: { fileId: null } });
        await tx.storedFile.updateMany({ where: { id: { in: rows.map((r) => r.file_id) } }, data: { status: 'pending_deletion' } });
        return rows.map((r) => ({ fileId: r.file_id, storageKey: r.storage_key }));
      });
    },

    async forgetFile(fileId) {
      await prisma.storedFile.deleteMany({ where: { id: fileId, kind: 'export_pdf', status: 'pending_deletion' } });
    },
  };
}

class LostLease extends Error {
  constructor() {
    super('export lease lost');
    this.name = 'LostLease';
  }
}
