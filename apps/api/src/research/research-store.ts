import type {
  AdminWorkspaceView,
  AssignmentView,
  CaseSummary,
  FamilyMemberView,
  RelationshipView,
  ReportStatus,
  ReportView,
  ResearchRecordKind,
  ResearchRecordView,
} from '@kulvriksh/shared';
import { auditInTransaction } from '../audit/audit.ts';
import { maskMobileNumber } from '../auth/mobile.ts';
import { isUniqueViolation } from '../db-errors.ts';
import { DEFAULT_NOTIFICATION_CONFIG, renderReportReleased, type NotificationConfig } from '../notifications/notification-events.ts';
import { writeNotifications } from '../notifications/notification-store.ts';
import { toMember, toRelationship } from '../family/family-store.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';

// Assignments, research records and reports (DM §8, Flows §8–§10). Genealogist access is checked
// against the CURRENT active assignment in the same transaction as the read or write, never
// against authorship alone (DM §8.2). Customer contact details are never selected for
// genealogists (FQ-26). Only released reports are ever visible to customers (D4).

type Tx = Prisma.TransactionClient;
export type Fail<K extends string> = { ok: false; reason: K };
export type Ok<T> = { ok: true; value: T };

const LIST_MAX = 200;
const RECORDS_MAX = 500;

export interface ResearchStore {
  // Admin
  listWorkspaces(input: { limit: number; search?: string }): Promise<AdminWorkspaceView[]>;
  listAssignments(input: { active: boolean; limit: number }): Promise<AssignmentView[]>;
  assign(input: { workspaceId: string; genealogistId: string; actorUserId: string; requestId?: string }): Promise<
    Ok<AssignmentView> | Fail<'workspace_not_found' | 'genealogist_unavailable' | 'already_assigned'>
  >;
  removeAssignment(input: { assignmentId: string; actorUserId: string; requestId?: string }): Promise<Ok<AssignmentView> | Fail<'not_found'>>;
  listReportsForReview(input: { status: ReportStatus; limit: number }): Promise<ReportView[]>;
  getReportForAdmin(reportId: string): Promise<ReportView | undefined>;
  returnReport(input: { reportId: string; reason: string; actorUserId: string; requestId?: string }): Promise<Ok<ReportView> | Fail<'not_found' | 'invalid_state'>>;
  releaseReport(input: { reportId: string; actorUserId: string; requestId?: string }): Promise<Ok<ReportView> | Fail<'not_found' | 'invalid_state'>>;
  // Genealogist (every call scoped to the caller's active assignment)
  listCases(genealogistId: string): Promise<CaseSummary[]>;
  getCase(genealogistId: string, workspaceId: string): Promise<
    { workspaceId: string; workspaceName: string; assignedAt: string; members: FamilyMemberView[]; relationships: RelationshipView[] } | undefined
  >;
  listRecords(genealogistId: string, workspaceId: string): Promise<ResearchRecordView[] | undefined>;
  createRecord(genealogistId: string, workspaceId: string, input: { kind: ResearchRecordKind; body: string }, requestId?: string): Promise<
    Ok<ResearchRecordView> | Fail<'not_assigned'>
  >;
  updateRecord(
    genealogistId: string,
    workspaceId: string,
    recordId: string,
    input: { body: string; version: number },
    requestId?: string,
  ): Promise<Ok<ResearchRecordView> | Fail<'not_assigned' | 'not_found' | 'version_conflict'>>;
  listCaseReports(genealogistId: string, workspaceId: string): Promise<ReportView[] | undefined>;
  createReport(genealogistId: string, workspaceId: string, input: { title: string; body: string }, requestId?: string): Promise<
    Ok<ReportView> | Fail<'not_assigned'>
  >;
  updateReport(
    genealogistId: string,
    workspaceId: string,
    reportId: string,
    input: { title: string; body: string; version: number },
    requestId?: string,
  ): Promise<Ok<ReportView> | Fail<'not_assigned' | 'not_found' | 'version_conflict' | 'not_editable'>>;
  submitReport(genealogistId: string, workspaceId: string, reportId: string, requestId?: string): Promise<
    Ok<{ report: ReportView; changed: boolean }> | Fail<'not_assigned' | 'not_found' | 'invalid_state' | 'incomplete'>
  >;
  // Customer
  listReleasedReports(ownerId: string): Promise<ReportView[]>;
}

// The file's type and size only: storage keys never leave the file layer (DM §11.2).
const reportInclude = {
  workspace: { select: { name: true } },
  reportFile: { select: { contentType: true, byteSize: true, status: true } },
} as const;
type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

export function createPrismaResearchStore(
  prisma: PrismaClient,
  notifications: NotificationConfig = DEFAULT_NOTIFICATION_CONFIG,
): ResearchStore {
  /** Display names for staff authors, in one query for a whole page. */
  async function staffNames(db: Tx | PrismaClient, ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    const rows = await db.staffProfile.findMany({ where: { userId: { in: unique } }, select: { userId: true, displayName: true } });
    return new Map(rows.map((r) => [r.userId, r.displayName]));
  }

  const toReport = (row: ReportRow, names: Map<string, string>): ReportView => ({
    id: row.id,
    workspaceId: row.workspaceId,
    workspaceName: row.workspace.name,
    status: row.status,
    title: row.title,
    body: row.body,
    version: row.version,
    authorName: names.get(row.authorUserId) ?? 'Genealogist',
    submittedAt: row.submittedAt?.toISOString() ?? null,
    returnedAt: row.returnedAt?.toISOString() ?? null,
    returnReason: row.returnReason,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    file:
      row.reportFile && row.reportFile.status === 'committed'
        ? { contentType: row.reportFile.contentType, byteSize: Number(row.reportFile.byteSize) }
        : null,
  });

  async function reports(db: Tx | PrismaClient, where: Prisma.ReportWhereInput, take = LIST_MAX): Promise<ReportView[]> {
    const rows = await db.report.findMany({
      where,
      include: reportInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take,
    });
    const names = await staffNames(db, rows.map((r) => r.authorUserId));
    return rows.map((r) => toReport(r, names));
  }

  async function oneReport(db: Tx | PrismaClient, where: Prisma.ReportWhereInput): Promise<ReportView | undefined> {
    return (await reports(db, where, 1))[0];
  }

  type RecordRow = { id: string; kind: string; body: string; version: number; authorUserId: string; createdAt: Date; updatedAt: Date };
  const toRecord = (row: RecordRow, names: Map<string, string>): ResearchRecordView => ({
    id: row.id,
    kind: row.kind as ResearchRecordKind,
    body: row.body,
    version: row.version,
    authorName: names.get(row.authorUserId) ?? 'Genealogist',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  /**
   * True when the genealogist holds an active assignment for the workspace. The row is locked FOR
   * SHARE, so an unassignment waits for this transaction and takes effect from the next request.
   */
  async function assigned(tx: Tx, genealogistId: string, workspaceId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT a.id::text AS id FROM assignment a
      JOIN app_user u ON u.id = a.genealogist_user_id AND u.status = 'active'
      WHERE a.workspace_id = ${workspaceId}::uuid AND a.genealogist_user_id = ${genealogistId}::uuid AND a.removed_at IS NULL
      FOR SHARE OF a`;
    return rows.length > 0;
  }

  const assignmentInclude = {
    workspace: { select: { name: true } },
    genealogist: { select: { staffProfile: { select: { displayName: true } } } },
  } as const;
  type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

  async function assignmentView(db: Tx | PrismaClient, id: string): Promise<AssignmentView> {
    return toAssignment(await db.assignment.findUniqueOrThrow({ where: { id }, include: assignmentInclude }));
  }

  function toAssignment(row: AssignmentRow): AssignmentView {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceName: row.workspace.name,
      genealogistId: row.genealogistUserId,
      genealogistName: row.genealogist.staffProfile?.displayName ?? 'Genealogist',
      assignedAt: row.assignedAt.toISOString(),
      removedAt: row.removedAt?.toISOString() ?? null,
    };
  }

  const genealogistAudit = (genealogistId: string, workspaceId: string, requestId?: string) => ({
    actorUserId: genealogistId,
    actorRole: 'genealogist' as const,
    workspaceId,
    requestId,
  });

  return {
    async listWorkspaces({ limit, search }) {
      const rows = await prisma.familyWorkspace.findMany({
        where: search ? { name: { contains: search, mode: 'insensitive' } } : {},
        select: {
          id: true,
          name: true,
          createdAt: true,
          owner: { select: { customerProfile: { select: { mobileNumber: true } } } },
          _count: { select: { members: true } },
          assignments: {
            where: { removedAt: null },
            take: 1,
            select: { id: true, assignedAt: true, genealogistUserId: true, genealogist: { select: { staffProfile: { select: { displayName: true } } } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: Math.min(limit, LIST_MAX),
      });
      return rows.map((row) => {
        const active = row.assignments[0];
        const mobile = row.owner.customerProfile?.mobileNumber;
        return {
          id: row.id,
          name: row.name,
          ownerMobileMasked: mobile ? maskMobileNumber(mobile) : '',
          memberCount: row._count.members,
          createdAt: row.createdAt.toISOString(),
          activeAssignment: active
            ? {
                id: active.id,
                genealogistId: active.genealogistUserId,
                genealogistName: active.genealogist.staffProfile?.displayName ?? 'Genealogist',
                assignedAt: active.assignedAt.toISOString(),
              }
            : null,
        };
      });
    },

    async listAssignments({ active, limit }) {
      const rows = await prisma.assignment.findMany({
        where: { removedAt: active ? null : { not: null } },
        include: assignmentInclude,
        orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
        take: Math.min(limit, LIST_MAX),
      });
      return rows.map(toAssignment);
    },

    async assign({ workspaceId, genealogistId, actorUserId, requestId }) {
      try {
        return await prisma.$transaction(async (tx) => {
          if (!(await tx.familyWorkspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) {
            return { ok: false, reason: 'workspace_not_found' } as const;
          }
          // Lock the genealogist row so a concurrent deactivation cannot slip in between.
          const genealogist = await tx.$queryRaw<Array<{ ok: boolean }>>`
            SELECT (role = 'genealogist' AND status = 'active') AS ok FROM app_user WHERE id = ${genealogistId}::uuid FOR SHARE`;
          if (!genealogist[0]?.ok) {
            return { ok: false, reason: 'genealogist_unavailable' } as const;
          }
          const created = await tx.assignment.create({
            data: { workspaceId, genealogistUserId: genealogistId, assignedByUserId: actorUserId },
            select: { id: true },
          });
          await auditInTransaction(tx, {
            actorUserId,
            actorRole: 'admin',
            action: 'assignment.created',
            targetType: 'assignment',
            targetId: created.id,
            workspaceId,
            details: { genealogistId },
            requestId,
          });
          return { ok: true, value: await assignmentView(tx, created.id) } as const;
        });
      } catch (err) {
        // R29 default: one active genealogist per family (partial unique index).
        if (isUniqueViolation(err)) {
          return { ok: false, reason: 'already_assigned' };
        }
        throw err;
      }
    },

    async removeAssignment({ assignmentId, actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.assignment.updateManyAndReturn({
          where: { id: assignmentId, removedAt: null },
          data: { removedAt: new Date(), removedByUserId: actorUserId },
          select: { id: true, workspaceId: true, genealogistUserId: true },
        });
        const row = rows[0];
        if (!row) {
          return { ok: false, reason: 'not_found' } as const;
        }
        await auditInTransaction(tx, {
          actorUserId,
          actorRole: 'admin',
          action: 'assignment.removed',
          targetType: 'assignment',
          targetId: row.id,
          workspaceId: row.workspaceId,
          details: { genealogistId: row.genealogistUserId },
          requestId,
        });
        return { ok: true, value: await assignmentView(tx, row.id) } as const;
      });
    },

    listReportsForReview: ({ status, limit }) => reports(prisma, { status }, Math.min(limit, LIST_MAX)),

    getReportForAdmin: (reportId) => oneReport(prisma, { id: reportId }),

    async returnReport({ reportId, reason, actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        // Conditional transition: only a submitted report can be returned (F-REP-02).
        const rows = await tx.report.updateManyAndReturn({
          where: { id: reportId, status: 'submitted' },
          data: {
            status: 'returned',
            returnedAt: new Date(),
            returnedByUserId: actorUserId,
            returnReason: reason,
            version: { increment: 1 },
          },
          select: { id: true, workspaceId: true },
        });
        const row = rows[0];
        if (!row) {
          const exists = await tx.report.count({ where: { id: reportId } });
          return { ok: false, reason: exists ? 'invalid_state' : 'not_found' } as const;
        }
        await auditInTransaction(tx, {
          actorUserId,
          actorRole: 'admin',
          action: 'report.returned',
          targetType: 'report',
          targetId: row.id,
          workspaceId: row.workspaceId,
          requestId,
        });
        return { ok: true, value: (await oneReport(tx, { id: row.id }))! } as const;
      });
    },

    async releaseReport({ reportId, actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.report.updateManyAndReturn({
          where: { id: reportId, status: 'submitted' },
          data: { status: 'released', releasedAt: new Date(), releasedByUserId: actorUserId, version: { increment: 1 } },
          select: { id: true, workspaceId: true },
        });
        const row = rows[0];
        if (!row) {
          const current = await tx.report.findUnique({ where: { id: reportId }, select: { status: true } });
          if (!current) {
            return { ok: false, reason: 'not_found' } as const;
          }
          // A second release returns the current state without a second transition (AS-REP-04).
          return current.status === 'released'
            ? ({ ok: true, value: (await oneReport(tx, { id: reportId }))! } as const)
            : ({ ok: false, reason: 'invalid_state' } as const);
        }
        // F-REP-01 step 3: the customer's notification is written in the SAME transaction, so it
        // exists only if the release commits; the dedupe key keeps a repeated release to one record.
        const released = await tx.report.findUniqueOrThrow({
          where: { id: row.id },
          select: { title: true, workspace: { select: { name: true, ownerUserId: true } } },
        });
        await writeNotifications(tx, {
          eventKey: 'report.released',
          sourceType: 'report',
          sourceId: row.id,
          workspaceId: row.workspaceId,
          recipientUserId: released.workspace.ownerUserId,
          ...renderReportReleased({ reportTitle: released.title, workspaceName: released.workspace.name }),
          channels: notifications.reportReleasedChannels,
        });
        await auditInTransaction(tx, {
          actorUserId,
          actorRole: 'admin',
          action: 'report.released',
          targetType: 'report',
          targetId: row.id,
          workspaceId: row.workspaceId,
          requestId,
        });
        return { ok: true, value: (await oneReport(tx, { id: row.id }))! } as const;
      });
    },

    async listCases(genealogistId) {
      const rows = await prisma.assignment.findMany({
        where: { genealogistUserId: genealogistId, removedAt: null, genealogist: { status: 'active' } },
        select: {
          assignedAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              _count: { select: { members: true, reports: { where: { status: { in: ['draft', 'submitted', 'returned'] } } } } },
            },
          },
        },
        orderBy: [{ assignedAt: 'desc' }, { id: 'asc' }],
        take: LIST_MAX,
      });
      return rows.map((r) => ({
        workspaceId: r.workspace.id,
        workspaceName: r.workspace.name,
        assignedAt: r.assignedAt.toISOString(),
        memberCount: r.workspace._count.members,
        openReports: r.workspace._count.reports,
      }));
    },

    async getCase(genealogistId, workspaceId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return undefined;
        }
        const assignment = await tx.assignment.findFirstOrThrow({
          where: { workspaceId, genealogistUserId: genealogistId, removedAt: null },
          select: { assignedAt: true, workspace: { select: { name: true } } },
        });
        // Members and relationships only: no owner, no contact details (FQ-26), no media (FQ-25).
        // Sequential: queries inside one interactive transaction share a single connection.
        const members = await tx.familyMember.findMany({
          where: { workspaceId },
          select: { id: true, displayName: true, version: true, createdAt: true, updatedAt: true },
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          take: 1000,
        });
        const relationships = await tx.relationship.findMany({
          where: { workspaceId },
          select: { id: true, relationshipType: true, memberAId: true, memberBId: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 4000,
        });
        return {
          workspaceId,
          workspaceName: assignment.workspace.name,
          assignedAt: assignment.assignedAt.toISOString(),
          members: members.map(toMember),
          relationships: relationships.map(toRelationship),
        };
      });
    },

    async listRecords(genealogistId, workspaceId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return undefined;
        }
        const rows = await tx.researchRecord.findMany({
          where: { workspaceId },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: RECORDS_MAX,
        });
        const names = await staffNames(tx, rows.map((r) => r.authorUserId));
        return rows.map((r) => toRecord(r, names));
      });
    },

    async createRecord(genealogistId, workspaceId, input, requestId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_assigned' } as const;
        }
        const row = await tx.researchRecord.create({ data: { workspaceId, authorUserId: genealogistId, kind: input.kind, body: input.body } });
        // AS-GEN-06: every create and update names the genealogist.
        await auditInTransaction(tx, {
          ...genealogistAudit(genealogistId, workspaceId, requestId),
          action: 'research_record.created',
          targetType: 'research_record',
          targetId: row.id,
          details: { kind: input.kind },
        });
        return { ok: true, value: toRecord(row, await staffNames(tx, [genealogistId])) } as const;
      });
    },

    async updateRecord(genealogistId, workspaceId, recordId, input, requestId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_assigned' } as const;
        }
        const rows = await tx.researchRecord.updateManyAndReturn({
          where: { id: recordId, workspaceId, version: input.version },
          data: { body: input.body, version: { increment: 1 } },
        });
        const row = rows[0];
        if (!row) {
          const exists = await tx.researchRecord.count({ where: { id: recordId, workspaceId } });
          return { ok: false, reason: exists ? 'version_conflict' : 'not_found' } as const;
        }
        await auditInTransaction(tx, {
          ...genealogistAudit(genealogistId, workspaceId, requestId),
          action: 'research_record.updated',
          targetType: 'research_record',
          targetId: row.id,
        });
        return { ok: true, value: toRecord(row, await staffNames(tx, [row.authorUserId])) } as const;
      });
    },

    async listCaseReports(genealogistId, workspaceId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return undefined;
        }
        return reports(tx, { workspaceId });
      });
    },

    async createReport(genealogistId, workspaceId, input, requestId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_assigned' } as const;
        }
        const row = await tx.report.create({ data: { workspaceId, authorUserId: genealogistId, title: input.title, body: input.body } });
        await auditInTransaction(tx, {
          ...genealogistAudit(genealogistId, workspaceId, requestId),
          action: 'report.created',
          targetType: 'report',
          targetId: row.id,
        });
        return { ok: true, value: (await oneReport(tx, { id: row.id }))! } as const;
      });
    },

    async updateReport(genealogistId, workspaceId, reportId, input, requestId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_assigned' } as const;
        }
        // Editable only as a draft or after being returned (F-GEN-04 step 4).
        const rows = await tx.report.updateManyAndReturn({
          where: { id: reportId, workspaceId, version: input.version, status: { in: ['draft', 'returned'] } },
          data: { title: input.title, body: input.body, version: { increment: 1 } },
          select: { id: true },
        });
        if (!rows[0]) {
          const current = await tx.report.findFirst({ where: { id: reportId, workspaceId }, select: { status: true, version: true } });
          if (!current) {
            return { ok: false, reason: 'not_found' } as const;
          }
          return { ok: false, reason: current.status === 'draft' || current.status === 'returned' ? 'version_conflict' : 'not_editable' } as const;
        }
        await auditInTransaction(tx, {
          ...genealogistAudit(genealogistId, workspaceId, requestId),
          action: 'report.updated',
          targetType: 'report',
          targetId: reportId,
        });
        return { ok: true, value: (await oneReport(tx, { id: reportId }))! } as const;
      });
    },

    async submitReport(genealogistId, workspaceId, reportId, requestId) {
      return prisma.$transaction(async (tx) => {
        if (!(await assigned(tx, genealogistId, workspaceId))) {
          return { ok: false, reason: 'not_assigned' } as const;
        }
        const current = await tx.report.findFirst({ where: { id: reportId, workspaceId }, select: { status: true, body: true } });
        if (!current) {
          return { ok: false, reason: 'not_found' } as const;
        }
        // AS-GEN-08: submitting twice produces one transition.
        if (current.status === 'submitted') {
          return { ok: true, value: { report: (await oneReport(tx, { id: reportId }))!, changed: false } } as const;
        }
        if (current.status === 'released') {
          return { ok: false, reason: 'invalid_state' } as const;
        }
        // Completeness rules are R31's decision; for now a report needs some content.
        if (current.body.trim() === '') {
          return { ok: false, reason: 'incomplete' } as const;
        }
        const wasReturned = current.status === 'returned';
        const updated = await tx.report.updateMany({
          where: { id: reportId, workspaceId, status: current.status },
          data: { status: 'submitted', submittedAt: new Date(), version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          // A concurrent submit won; report the state it produced.
          return { ok: true, value: { report: (await oneReport(tx, { id: reportId }))!, changed: false } } as const;
        }
        await auditInTransaction(tx, {
          ...genealogistAudit(genealogistId, workspaceId, requestId),
          action: wasReturned ? 'report.resubmitted' : 'report.submitted',
          targetType: 'report',
          targetId: reportId,
        });
        return { ok: true, value: { report: (await oneReport(tx, { id: reportId }))!, changed: true } } as const;
      });
    },

    listReleasedReports: (ownerId) => reports(prisma, { status: 'released', workspace: { ownerUserId: ownerId } }),
  };
}
