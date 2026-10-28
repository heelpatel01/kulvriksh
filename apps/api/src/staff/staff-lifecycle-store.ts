import type { StaffAccountView } from '@kulvriksh/shared';
import { auditInTransaction, type AuditRole } from '../audit/audit.ts';
import type { StaffRole } from '../auth/authorize.ts';
import { isUniqueViolation } from '../db-errors.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

// Staff account lifecycle (TASK-10): creation by an admin or the bootstrap command, one-time setup
// and reset links, password changes, the TOTP second factor and status changes. Every change is
// audited in its own transaction together with any session revocation it needs.

export type TokenPurpose = 'setup' | 'reset' | 'mfa_challenge';

export interface Actor {
  userId: string | null;
  role: AuditRole;
  requestId?: string;
}

export interface MfaRecord {
  secretCiphertext: string;
  enabledAt: Date | null;
}

export interface StaffLifecycleStore {
  listStaff(): Promise<StaffAccountView[]>;
  getStaff(userId: string): Promise<StaffAccountView | undefined>;
  countActiveAdmins(): Promise<number>;
  /** New account without a password, plus its setup token, in one transaction. */
  createAccount(input: {
    role: StaffRole;
    email: string;
    displayName: string;
    tokenHash: string;
    ttlSeconds: number;
    actor: Actor;
  }): Promise<{ ok: true; userId: string; expiresAt: Date } | { ok: false; reason: 'email_taken' }>;
  /**
   * Issues a one-time token (any earlier open token of the same purpose is invalidated). For an
   * admin-initiated reset it also removes the password and revokes every session.
   */
  issueToken(input: {
    userId: string;
    purpose: TokenPurpose;
    tokenHash: string;
    ttlSeconds: number;
    clearPassword?: boolean;
    actor?: Actor;
  }): Promise<{ expiresAt: Date } | undefined>;
  /** Consumes a setup/reset token and sets the password; revokes every session. */
  completeToken(input: { tokenHash: string; passwordHash: string; requestId?: string }): Promise<
    { ok: true; userId: string; purpose: 'setup' | 'reset' } | { ok: false; reason: 'invalid_token' }
  >;
  /** Counts a wrong-or-right attempt on an MFA challenge first; undefined when unusable. */
  attemptMfaChallenge(tokenHash: string, maxAttempts: number): Promise<{ userId: string } | undefined>;
  consumeMfaChallenge(tokenHash: string): Promise<boolean>;
  changePassword(input: { userId: string; passwordHash: string; keepSessionId: string; requestId?: string }): Promise<number>;
  getMfa(userId: string): Promise<MfaRecord | undefined>;
  /** Starts (or restarts) enrolment while no factor is enabled. */
  startMfa(userId: string, secretCiphertext: string): Promise<'started' | 'already_enabled'>;
  /** Enables the factor; `step` is the time step of the code that proved it, stored against replay. */
  confirmMfa(userId: string, step: number, requestId?: string): Promise<boolean>;
  /** Accepts a time step only if newer than the last one used (no replay). */
  useMfaStep(userId: string, step: number): Promise<boolean>;
  removeMfa(userId: string, actor: Actor): Promise<boolean>;
  setStatus(input: { userId: string; status: 'active' | 'deactivated'; roles: StaffRole[]; actor: Actor }): Promise<
    { status: 'active' | 'deactivated'; revokedSessions: number; role: StaffRole } | undefined
  >;
}

const MAX_ROWS = 200;

export function createPrismaStaffLifecycleStore(prisma: PrismaClient): StaffLifecycleStore {
  const select = {
    id: true,
    role: true,
    status: true,
    createdAt: true,
    staffProfile: { select: { displayName: true } },
    staffCredential: { select: { email: true, passwordHash: true, passwordChangedAt: true } },
    staffMfa: { select: { enabledAt: true } },
    _count: { select: { assignments: { where: { removedAt: null } } } },
  } as const;
  type Row = {
    id: string;
    role: string;
    status: 'active' | 'deactivated';
    createdAt: Date;
    staffProfile: { displayName: string } | null;
    staffCredential: { email: string; passwordHash: string | null; passwordChangedAt: Date } | null;
    staffMfa: { enabledAt: Date | null } | null;
    _count: { assignments: number };
  };
  // Password hashes are read only to report whether one exists; they never leave this function.
  const view = (row: Row): StaffAccountView => ({
    id: row.id,
    role: row.role as StaffRole,
    displayName: row.staffProfile?.displayName ?? 'Unnamed',
    email: row.staffCredential?.email ?? '',
    status: row.status,
    passwordSet: Boolean(row.staffCredential?.passwordHash),
    mfaEnabled: Boolean(row.staffMfa?.enabledAt),
    activeAssignments: row._count.assignments,
    createdAt: row.createdAt.toISOString(),
  });

  return {
    async listStaff() {
      const rows = await prisma.appUser.findMany({
        where: { role: { in: ['genealogist', 'admin'] } },
        select,
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: MAX_ROWS,
      });
      return rows.map((r) => view(r as unknown as Row));
    },

    async getStaff(userId) {
      const row = await prisma.appUser.findFirst({ where: { id: userId, role: { in: ['genealogist', 'admin'] } }, select });
      return row ? view(row as unknown as Row) : undefined;
    },

    countActiveAdmins: () => prisma.appUser.count({ where: { role: 'admin', status: 'active' } }),

    async createAccount({ role, email, displayName, tokenHash, ttlSeconds, actor }) {
      try {
        return await prisma.$transaction(async (tx) => {
          const user = await tx.appUser.create({
            data: { role, staffProfile: { create: { displayName } }, staffCredential: { create: { email, passwordHash: null } } },
            select: { id: true },
          });
          const rows = await tx.$queryRaw<Array<{ expires_at: Date }>>`
            INSERT INTO staff_token (user_id, purpose, token_hash, created_by_user_id, expires_at)
            VALUES (${user.id}::uuid, 'setup', ${tokenHash}, ${actor.userId}::uuid, now() + ${ttlSeconds}::integer * interval '1 second')
            RETURNING expires_at`;
          await auditInTransaction(tx, {
            actorUserId: actor.userId ?? undefined,
            actorRole: actor.role,
            action: 'staff.created',
            targetType: 'user',
            targetId: user.id,
            details: { role },
            requestId: actor.requestId,
          });
          return { ok: true, userId: user.id, expiresAt: rows[0]!.expires_at } as const;
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          return { ok: false, reason: 'email_taken' };
        }
        throw err;
      }
    },

    async issueToken({ userId, purpose, tokenHash, ttlSeconds, clearPassword, actor }) {
      return prisma.$transaction(async (tx) => {
        const target = await tx.appUser.findFirst({ where: { id: userId, role: { in: ['genealogist', 'admin'] } }, select: { id: true } });
        if (!target) {
          return undefined;
        }
        await tx.$executeRaw`
          UPDATE staff_token SET used_at = now()
          WHERE user_id = ${userId}::uuid AND purpose = ${purpose}::staff_token_purpose AND used_at IS NULL`;
        const rows = await tx.$queryRaw<Array<{ expires_at: Date }>>`
          INSERT INTO staff_token (user_id, purpose, token_hash, created_by_user_id, expires_at)
          VALUES (${userId}::uuid, ${purpose}::staff_token_purpose, ${tokenHash}, ${actor?.userId ?? null}::uuid,
                  now() + ${ttlSeconds}::integer * interval '1 second')
          RETURNING expires_at`;
        if (clearPassword) {
          // Admin-initiated reset: the old password stops working and every session ends now.
          await tx.staffCredential.update({ where: { userId }, data: { passwordHash: null, passwordChangedAt: new Date() } });
          await tx.$executeRaw`
            UPDATE session SET revoked_at = now(), revoke_reason = 'admin_action' WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
        }
        if (actor && purpose !== 'mfa_challenge') {
          await auditInTransaction(tx, {
            actorUserId: actor.userId ?? undefined,
            actorRole: actor.role,
            action: purpose === 'setup' ? 'staff.setup_link_issued' : 'staff.password_reset_issued',
            targetType: 'user',
            targetId: userId,
            details: { clearedPassword: Boolean(clearPassword) },
            requestId: actor.requestId,
          });
        }
        return { expiresAt: rows[0]!.expires_at };
      });
    },

    async completeToken({ tokenHash, passwordHash, requestId }) {
      return prisma.$transaction(async (tx) => {
        // Single use: only the request that marks the token used continues.
        const rows = await tx.$queryRaw<Array<{ user_id: string; purpose: 'setup' | 'reset' }>>`
          UPDATE staff_token t SET used_at = now()
          FROM app_user u
          WHERE t.token_hash = ${tokenHash} AND t.purpose IN ('setup', 'reset') AND t.used_at IS NULL AND t.expires_at > now()
            AND u.id = t.user_id AND u.status = 'active' AND u.role IN ('genealogist', 'admin')
          RETURNING t.user_id::text AS user_id, t.purpose::text AS purpose`;
        const row = rows[0];
        if (!row) {
          return { ok: false, reason: 'invalid_token' } as const;
        }
        await tx.staffCredential.update({ where: { userId: row.user_id }, data: { passwordHash, passwordChangedAt: new Date() } });
        await tx.$executeRaw`
          UPDATE session SET revoked_at = now(), revoke_reason = 'logout' WHERE user_id = ${row.user_id}::uuid AND revoked_at IS NULL`;
        await auditInTransaction(tx, {
          actorUserId: row.user_id,
          actorRole: 'anonymous',
          action: 'staff.password_set',
          targetType: 'user',
          targetId: row.user_id,
          details: { via: row.purpose },
          requestId,
        });
        return { ok: true, userId: row.user_id, purpose: row.purpose } as const;
      });
    },

    async attemptMfaChallenge(tokenHash, maxAttempts) {
      const rows = await prisma.$queryRaw<Array<{ user_id: string }>>`
        UPDATE staff_token SET attempt_count = attempt_count + 1
        WHERE token_hash = ${tokenHash} AND purpose = 'mfa_challenge' AND used_at IS NULL AND expires_at > now()
          AND attempt_count < ${maxAttempts}::integer
        RETURNING user_id::text AS user_id`;
      return rows[0] ? { userId: rows[0].user_id } : undefined;
    },

    async consumeMfaChallenge(tokenHash) {
      const count = await prisma.$executeRaw`
        UPDATE staff_token SET used_at = now()
        WHERE token_hash = ${tokenHash} AND purpose = 'mfa_challenge' AND used_at IS NULL AND expires_at > now()`;
      return count === 1;
    },

    async changePassword({ userId, passwordHash, keepSessionId, requestId }) {
      return prisma.$transaction(async (tx) => {
        await tx.staffCredential.update({ where: { userId }, data: { passwordHash, passwordChangedAt: new Date() } });
        // Other devices are signed out; this session stays (the person just proved the password).
        const revoked = await tx.$executeRaw`
          UPDATE session SET revoked_at = now(), revoke_reason = 'logout'
          WHERE user_id = ${userId}::uuid AND revoked_at IS NULL AND id <> ${keepSessionId}::uuid`;
        await auditInTransaction(tx, {
          actorUserId: userId,
          actorRole: (await tx.appUser.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role,
          action: 'staff.password_changed',
          targetType: 'user',
          targetId: userId,
          details: { revokedSessions: revoked },
          requestId,
        });
        return revoked;
      });
    },

    getMfa: async (userId) => (await prisma.staffMfa.findUnique({ where: { userId }, select: { secretCiphertext: true, enabledAt: true } })) ?? undefined,

    async startMfa(userId, secretCiphertext) {
      const existing = await prisma.staffMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
      if (existing?.enabledAt) {
        return 'already_enabled';
      }
      await prisma.staffMfa.upsert({
        where: { userId },
        create: { userId, secretCiphertext },
        update: { secretCiphertext, lastUsedStep: null },
      });
      return 'started';
    },

    async confirmMfa(userId, step, requestId) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.staffMfa.updateMany({ where: { userId, enabledAt: null }, data: { enabledAt: new Date(), lastUsedStep: BigInt(step) } });
        if (updated.count !== 1) {
          return false;
        }
        await auditInTransaction(tx, {
          actorUserId: userId,
          actorRole: (await tx.appUser.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role,
          action: 'staff.mfa_enabled',
          targetType: 'user',
          targetId: userId,
          details: { method: 'totp' },
          requestId,
        });
        return true;
      });
    },

    async useMfaStep(userId, step) {
      const count = await prisma.$executeRaw`
        UPDATE staff_mfa SET last_used_step = ${step}::bigint, updated_at = now()
        WHERE user_id = ${userId}::uuid AND enabled_at IS NOT NULL AND (last_used_step IS NULL OR last_used_step < ${step}::bigint)`;
      return count === 1;
    },

    async removeMfa(userId, actor) {
      return prisma.$transaction(async (tx) => {
        const deleted = await tx.staffMfa.deleteMany({ where: { userId } });
        if (deleted.count !== 1) {
          return false;
        }
        await auditInTransaction(tx, {
          actorUserId: actor.userId ?? undefined,
          actorRole: actor.role,
          action: 'staff.mfa_removed',
          targetType: 'user',
          targetId: userId,
          requestId: actor.requestId,
        });
        return true;
      });
    },

    async setStatus({ userId, status, roles, actor }) {
      return prisma.$transaction(async (tx) => {
        const target = await tx.appUser.findFirst({ where: { id: userId, role: { in: roles } }, select: { role: true, status: true } });
        if (!target) {
          return undefined;
        }
        let revokedSessions = 0;
        if (target.status !== status) {
          await tx.appUser.update({ where: { id: userId }, data: { status, statusChangedAt: new Date() } });
          if (status === 'deactivated') {
            revokedSessions = await tx.$executeRaw`
              UPDATE session SET revoked_at = now(), revoke_reason = 'deactivated' WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
          }
          await auditInTransaction(tx, {
            actorUserId: actor.userId ?? undefined,
            actorRole: actor.role,
            action: `${target.role}.${status === 'active' ? 'reactivated' : 'deactivated'}`,
            targetType: 'user',
            targetId: userId,
            details: { revokedSessions },
            requestId: actor.requestId,
          });
        }
        return { status, revokedSessions, role: target.role as StaffRole };
      });
    },
  };
}
