import type { FamilyMemberView, FamilyWorkspaceView, RelationshipView } from '@kulvriksh/shared';
import { auditInTransaction } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { ANCESTRY_TYPES, canonical, RELATIONSHIP_RULES, type RelationshipInput } from './family-validation.ts';

// Persistence for the customer's family workspace (DM §7.1–7.3). Every method takes the owner's
// user ID from the session and resolves the workspace from it, so a customer can only ever reach
// their own rows; IDs from the request are always matched together with that workspace.

export interface FamilyLimits {
  /** Provisional (R19): maximum family size. */
  maxMembers: number;
  maxRelationships: number;
}

export type Fail<K extends string> = { ok: false; reason: K };
export type Ok<T> = { ok: true; value: T };

export interface MemberPage {
  members: FamilyMemberView[];
  nextCursor: string | null;
}

export interface FamilyStore {
  getWorkspace(ownerId: string): Promise<FamilyWorkspaceView | undefined>;
  createWorkspace(ownerId: string, name: string, requestId?: string): Promise<{ created: boolean; workspace: FamilyWorkspaceView }>;
  renameWorkspace(ownerId: string, name: string, requestId?: string): Promise<FamilyWorkspaceView | undefined>;
  listMembers(ownerId: string, page: { limit: number; after?: string; search?: string }): Promise<MemberPage | undefined>;
  createMember(ownerId: string, displayName: string, requestId?: string): Promise<Ok<FamilyMemberView> | Fail<'no_workspace' | 'limit_reached'>>;
  updateMember(
    ownerId: string,
    memberId: string,
    input: { displayName: string; version: number },
    requestId?: string,
  ): Promise<Ok<FamilyMemberView> | Fail<'not_found' | 'version_conflict'>>;
  deleteMember(ownerId: string, memberId: string, version: number, requestId?: string): Promise<Ok<null> | Fail<'not_found' | 'version_conflict' | 'has_relationships'>>;
  listRelationships(ownerId: string): Promise<RelationshipView[] | undefined>;
  createRelationship(
    ownerId: string,
    input: RelationshipInput,
    requestId?: string,
  ): Promise<Ok<RelationshipView> | Fail<'no_workspace' | 'member_not_found' | 'cycle' | 'duplicate' | 'limit_reached'>>;
  deleteRelationship(ownerId: string, relationshipId: string, requestId?: string): Promise<boolean>;
  getTree(ownerId: string): Promise<{ workspace: FamilyWorkspaceView; members: FamilyMemberView[]; relationships: RelationshipView[] } | undefined>;
}

type MemberRow = { id: string; displayName: string; version: number; createdAt: Date; updatedAt: Date };
type RelationshipRow = { id: string; relationshipType: string; memberAId: string; memberBId: string; createdAt: Date };

const memberSelect = { id: true, displayName: true, version: true, createdAt: true, updatedAt: true } as const;
const relationshipSelect = { id: true, relationshipType: true, memberAId: true, memberBId: true, createdAt: true } as const;

export const toMember = (row: MemberRow): FamilyMemberView => ({
  id: row.id,
  displayName: row.displayName,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toRelationship = (row: RelationshipRow): RelationshipView => ({
  id: row.id,
  type: row.relationshipType as RelationshipView['type'],
  fromMemberId: row.memberAId,
  toMemberId: row.memberBId,
  createdAt: row.createdAt.toISOString(),
});

export function createPrismaFamilyStore(prisma: PrismaClient, limits: FamilyLimits): FamilyStore {
  async function workspaceView(ownerId: string): Promise<FamilyWorkspaceView | undefined> {
    const row = await prisma.familyWorkspace.findUnique({
      where: { ownerUserId: ownerId },
      select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { members: true, relationships: true } } },
    });
    return row
      ? {
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          memberCount: row._count.members,
          relationshipCount: row._count.relationships,
          limits: { ...limits },
        }
      : undefined;
  }

  const workspaceId = async (ownerId: string) =>
    (await prisma.familyWorkspace.findUnique({ where: { ownerUserId: ownerId }, select: { id: true } }))?.id;

  return {
    getWorkspace: workspaceView,

    async createWorkspace(ownerId, name, requestId) {
      try {
        await prisma.$transaction(async (tx) => {
          const created = await tx.familyWorkspace.create({ data: { ownerUserId: ownerId, name }, select: { id: true } });
          await auditInTransaction(tx, {
            actorUserId: ownerId,
            actorRole: 'customer',
            action: 'workspace.created',
            targetType: 'family_workspace',
            targetId: created.id,
            workspaceId: created.id,
            requestId,
          });
        });
      } catch (err) {
        // One workspace per customer (FQ-8 default): a double submission returns the existing one.
        if (!isUniqueViolation(err)) {
          throw err;
        }
        return { created: false, workspace: (await workspaceView(ownerId))! };
      }
      return { created: true, workspace: (await workspaceView(ownerId))! };
    },

    async renameWorkspace(ownerId, name, requestId) {
      const updated = await prisma.$transaction(async (tx) => {
        const rows = await tx.familyWorkspace.updateManyAndReturn({ where: { ownerUserId: ownerId }, data: { name }, select: { id: true } });
        const row = rows[0];
        if (row) {
          await auditInTransaction(tx, {
            actorUserId: ownerId,
            actorRole: 'customer',
            action: 'workspace.renamed',
            targetType: 'family_workspace',
            targetId: row.id,
            workspaceId: row.id,
            requestId,
          });
        }
        return Boolean(row);
      });
      return updated ? workspaceView(ownerId) : undefined;
    },

    async listMembers(ownerId, { limit, after, search }) {
      const id = await workspaceId(ownerId);
      if (!id) {
        return undefined;
      }
      const rows = await prisma.familyMember.findMany({
        where: { workspaceId: id, ...(search ? { displayName: { contains: search, mode: 'insensitive' } } : {}) },
        select: memberSelect,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        take: limit + 1,
        ...(after ? { cursor: { id_workspaceId: { id: after, workspaceId: id } }, skip: 1 } : {}),
      });
      const page = rows.slice(0, limit);
      return { members: page.map(toMember), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
    },

    async createMember(ownerId, displayName, requestId) {
      return prisma.$transaction(async (tx) => {
        // Lock the workspace so concurrent creates cannot pass the size limit together.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text AS id FROM family_workspace WHERE owner_user_id = ${ownerId}::uuid FOR UPDATE`;
        const ws = locked[0]?.id;
        if (!ws) {
          return { ok: false, reason: 'no_workspace' } as const;
        }
        if ((await tx.familyMember.count({ where: { workspaceId: ws } })) >= limits.maxMembers) {
          return { ok: false, reason: 'limit_reached' } as const;
        }
        const row = await tx.familyMember.create({ data: { workspaceId: ws, displayName, createdByUserId: ownerId }, select: memberSelect });
        await auditInTransaction(tx, {
          actorUserId: ownerId,
          actorRole: 'customer',
          action: 'member.created',
          targetType: 'member',
          targetId: row.id,
          workspaceId: ws,
          requestId,
        });
        return { ok: true, value: toMember(row) } as const;
      });
    },

    async updateMember(ownerId, memberId, { displayName, version }, requestId) {
      const ws = await workspaceId(ownerId);
      if (!ws) {
        return { ok: false, reason: 'not_found' };
      }
      return prisma.$transaction(async (tx) => {
        // Optimistic concurrency: only the version the client saw may be updated (F-FAM-02).
        const rows = await tx.familyMember.updateManyAndReturn({
          where: { id: memberId, workspaceId: ws, version },
          data: { displayName, version: { increment: 1 }, updatedByUserId: ownerId },
          select: memberSelect,
        });
        const row = rows[0];
        if (!row) {
          const exists = await tx.familyMember.count({ where: { id: memberId, workspaceId: ws } });
          return { ok: false, reason: exists ? 'version_conflict' : 'not_found' } as const;
        }
        await auditInTransaction(tx, {
          actorUserId: ownerId,
          actorRole: 'customer',
          action: 'member.updated',
          targetType: 'member',
          targetId: memberId,
          workspaceId: ws,
          requestId,
        });
        return { ok: true, value: toMember(row) } as const;
      });
    },

    async deleteMember(ownerId, memberId, version, requestId) {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text AS id FROM family_workspace WHERE owner_user_id = ${ownerId}::uuid FOR UPDATE`;
        const ws = locked[0]?.id;
        if (!ws) {
          return { ok: false, reason: 'not_found' } as const;
        }
        const member = await tx.familyMember.findFirst({ where: { id: memberId, workspaceId: ws }, select: { version: true } });
        if (!member) {
          return { ok: false, reason: 'not_found' } as const;
        }
        if (member.version !== version) {
          return { ok: false, reason: 'version_conflict' } as const;
        }
        // R21 is open: deletion is blocked while relationships exist, never silently cascaded.
        const linked = await tx.relationship.count({ where: { workspaceId: ws, OR: [{ memberAId: memberId }, { memberBId: memberId }] } });
        if (linked > 0) {
          return { ok: false, reason: 'has_relationships' } as const;
        }
        // Matching the version again covers an edit committed between the check and the delete.
        const deleted = await tx.familyMember.deleteMany({ where: { id: memberId, workspaceId: ws, version } });
        if (deleted.count !== 1) {
          return { ok: false, reason: 'version_conflict' } as const;
        }
        await auditInTransaction(tx, {
          actorUserId: ownerId,
          actorRole: 'customer',
          action: 'member.deleted',
          targetType: 'member',
          targetId: memberId,
          workspaceId: ws,
          requestId,
        });
        return { ok: true, value: null } as const;
      });
    },

    async listRelationships(ownerId) {
      const ws = await workspaceId(ownerId);
      if (!ws) {
        return undefined;
      }
      const rows = await prisma.relationship.findMany({
        where: { workspaceId: ws },
        select: relationshipSelect,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limits.maxRelationships,
      });
      return rows.map(toRelationship);
    },

    async createRelationship(ownerId, input, requestId) {
      const { a, b } = canonical(input);
      try {
        return await prisma.$transaction(async (tx) => {
          // Serialise relationship writes per workspace, so two concurrent inserts cannot each pass
          // the cycle check and together form a cycle (DM §7.3).
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id::text AS id FROM family_workspace WHERE owner_user_id = ${ownerId}::uuid FOR UPDATE`;
          const ws = locked[0]?.id;
          if (!ws) {
            return { ok: false, reason: 'no_workspace' } as const;
          }
          const found = await tx.familyMember.count({ where: { workspaceId: ws, id: { in: [a, b] } } });
          if (found !== 2) {
            return { ok: false, reason: 'member_not_found' } as const;
          }
          if ((await tx.relationship.count({ where: { workspaceId: ws } })) >= limits.maxRelationships) {
            return { ok: false, reason: 'limit_reached' } as const;
          }
          if (RELATIONSHIP_RULES[input.type].ancestry) {
            // a becomes an ancestor of b. That is a cycle if a is already a descendant of b
            // through any ancestry type.
            const rows = await tx.$queryRaw<Array<{ cycle: boolean }>>`
              WITH RECURSIVE descendants(id) AS (
                SELECT ${b}::uuid
                UNION
                SELECT r.member_b_id FROM relationship r JOIN descendants d ON r.member_a_id = d.id
                WHERE r.workspace_id = ${ws}::uuid AND r.relationship_type = ANY(${[...ANCESTRY_TYPES]})
              )
              SELECT EXISTS (SELECT 1 FROM descendants WHERE id = ${a}::uuid) AS cycle`;
            if (rows[0]?.cycle) {
              return { ok: false, reason: 'cycle' } as const;
            }
          }
          const row = await tx.relationship.create({
            data: { workspaceId: ws, memberAId: a, memberBId: b, relationshipType: input.type, createdByUserId: ownerId },
            select: relationshipSelect,
          });
          await auditInTransaction(tx, {
            actorUserId: ownerId,
            actorRole: 'customer',
            action: 'relationship.created',
            targetType: 'relationship',
            targetId: row.id,
            workspaceId: ws,
            details: { type: input.type },
            requestId,
          });
          return { ok: true, value: toRelationship(row) } as const;
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, reason: 'duplicate' };
        }
        throw err;
      }
    },

    async deleteRelationship(ownerId, relationshipId, requestId) {
      const ws = await workspaceId(ownerId);
      if (!ws) {
        return false;
      }
      return prisma.$transaction(async (tx) => {
        const deleted = await tx.relationship.deleteMany({ where: { id: relationshipId, workspaceId: ws } });
        if (deleted.count === 1) {
          await auditInTransaction(tx, {
            actorUserId: ownerId,
            actorRole: 'customer',
            action: 'relationship.deleted',
            targetType: 'relationship',
            targetId: relationshipId,
            workspaceId: ws,
            requestId,
          });
        }
        return deleted.count === 1;
      });
    },

    async getTree(ownerId) {
      const workspace = await workspaceView(ownerId);
      if (!workspace) {
        return undefined;
      }
      // Two bounded queries regardless of family size (AS-FAM-08: no N+1).
      const [members, relationships] = await Promise.all([
        prisma.familyMember.findMany({
          where: { workspaceId: workspace.id },
          select: memberSelect,
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          take: limits.maxMembers,
        }),
        prisma.relationship.findMany({
          where: { workspaceId: workspace.id },
          select: relationshipSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: limits.maxRelationships,
        }),
      ]);
      return { workspace, members: members.map(toMember), relationships: relationships.map(toRelationship) };
    },
  };
}
