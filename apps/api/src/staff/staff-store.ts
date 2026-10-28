import type { GenealogistSummary } from '@kulvriksh/shared';
import { auditInTransaction, type AuditEntry } from '../audit/audit.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import type { StaffRole } from '../auth/authorize.ts';

// Persistence for staff identity (DM §5.3) and genealogist management (F-ADM-02).

export interface StaffCredentialRecord {
  userId: string;
  role: 'customer' | StaffRole;
  status: 'active' | 'deactivated';
  displayName: string | null;
  /** Null until the account owner completes their setup link. */
  passwordHash: string | null;
}

export type { GenealogistSummary };

export interface StaffStore {
  findCredential(email: string): Promise<StaffCredentialRecord | undefined>;
  /** Creates the session and writes the success audit in one transaction. */
  createSession(input: { userId: string; tokenHash: string; ttlSeconds: number; audit: Omit<AuditEntry, 'targetId'> }): Promise<{
    sessionId: string;
    expiresAt: Date;
  }>;
  listGenealogists(): Promise<GenealogistSummary[]>;
  /**
   * Sets a genealogist's status. Deactivation revokes every open session in the same transaction
   * (DM §5.6, AS-ADM-03). Undefined when the user is not a genealogist.
   */
  setGenealogistStatus(input: {
    userId: string;
    status: 'active' | 'deactivated';
    actorUserId: string;
    requestId?: string;
  }): Promise<{ status: 'active' | 'deactivated'; revokedSessions: number } | undefined>;
  /** Development provisioning only (src/tools/dev-staff.ts). */
  createStaff(input: { role: StaffRole; email: string; displayName: string; passwordHash?: string }): Promise<string>;
}

const MAX_ROWS = 200;

export function createPrismaStaffStore(prisma: PrismaClient): StaffStore {
  return {
    async findCredential(email) {
      const row = await prisma.staffCredential.findUnique({
        where: { email },
        select: { userId: true, passwordHash: true, user: { select: { role: true, status: true, staffProfile: { select: { displayName: true } } } } },
      });
      return row
        ? {
            userId: row.userId,
            role: row.user.role,
            status: row.user.status,
            displayName: row.user.staffProfile?.displayName ?? null,
            passwordHash: row.passwordHash,
          }
        : undefined;
    },

    async createSession({ userId, tokenHash, ttlSeconds, audit }) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string; expires_at: Date }>>`
          INSERT INTO session (user_id, token_hash, expires_at)
          VALUES (${userId}::uuid, ${tokenHash}, now() + ${ttlSeconds}::integer * interval '1 second')
          RETURNING id::text AS id, expires_at`;
        const row = rows[0]!;
        await auditInTransaction(tx, { ...audit, targetId: row.id });
        return { sessionId: row.id, expiresAt: row.expires_at };
      });
    },

    async listGenealogists() {
      const rows = await prisma.appUser.findMany({
        where: { role: 'genealogist' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          staffProfile: { select: { displayName: true } },
          staffCredential: { select: { email: true } },
          _count: { select: { assignments: { where: { removedAt: null } } } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_ROWS,
      });
      return rows.map((row) => ({
        id: row.id,
        displayName: row.staffProfile?.displayName ?? 'Unnamed genealogist',
        email: row.staffCredential?.email ?? '',
        status: row.status,
        activeAssignments: row._count.assignments,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    async setGenealogistStatus({ userId, status, actorUserId, requestId }) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.appUser.updateMany({
          where: { id: userId, role: 'genealogist', status: status === 'active' ? 'deactivated' : 'active' },
          data: { status, statusChangedAt: new Date() },
        });
        const current = await tx.appUser.findFirst({ where: { id: userId, role: 'genealogist' }, select: { status: true } });
        if (!current) {
          return undefined;
        }
        let revokedSessions = 0;
        if (updated.count === 1) {
          if (status === 'deactivated') {
            revokedSessions = await tx.$executeRaw`
              UPDATE session SET revoked_at = now(), revoke_reason = 'deactivated'
              WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
          }
          await auditInTransaction(tx, {
            actorUserId,
            actorRole: 'admin',
            action: status === 'active' ? 'genealogist.reactivated' : 'genealogist.deactivated',
            targetType: 'user',
            targetId: userId,
            details: { revokedSessions },
            requestId,
          });
        }
        return { status: current.status, revokedSessions };
      });
    },

    async createStaff({ role, email, displayName, passwordHash }) {
      return prisma.$transaction(async (tx) => {
        const user = await tx.appUser.create({
          data: {
            role,
            staffProfile: { create: { displayName } },
            staffCredential: { create: { email, passwordHash: passwordHash ?? null } },
          },
        });
        await auditInTransaction(tx, {
          actorRole: 'system',
          action: 'staff.provisioned',
          targetType: 'user',
          targetId: user.id,
          details: { role, via: 'dev_staff_command' },
        });
        return user.id;
      });
    },
  };
}
