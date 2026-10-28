import { auditInTransaction } from '../audit/audit.ts';
import { isUniqueViolation } from '../db-errors.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';

// Persistence for customer sign-in (DM §5.4, §5.5). Every check that guards a limit is a single
// atomic statement evaluated by PostgreSQL with its own clock (now()), so concurrent requests
// cannot exceed a limit and API clock drift cannot shorten an expiry.

export type RevokeReason = 'logout' | 'expired' | 'deactivated' | 'admin_action';

export interface CustomerRecord {
  id: string;
  mobileNumber: string;
  createdAt: Date;
}

export type CreateChallengeResult =
  | { kind: 'created'; id: string; expiresAt: Date }
  /** A code was issued for this number less than the cooldown ago, or a concurrent request won. */
  | { kind: 'cooldown'; retryAfterSeconds: number };

export interface OpenAttempt {
  id: string;
  codeHash: string;
  attemptCount: number;
}

export type SignInResult =
  | { kind: 'signed_in'; customer: CustomerRecord; sessionId: string; expiresAt: Date }
  /** Another request consumed the challenge first, or it expired meanwhile. */
  | { kind: 'not_consumed' }
  | { kind: 'no_account' }
  | { kind: 'account_unavailable' };

export type UserRole = 'customer' | 'genealogist' | 'admin';

export interface ActiveSession {
  sessionId: string;
  userId: string;
  role: UserRole;
  expiresAt: Date;
  customer?: CustomerRecord;
  staff?: { displayName: string };
}

/** Idle timeout per role: staff sessions end sooner than customer sessions. */
export type IdleSeconds = Record<UserRole, number>;

export interface AuthStore {
  /** Fixed-window counter (DM §5.5): one atomic upsert, returns the count including this hit. */
  hit(bucketKey: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds: number }>;
  /** Seconds left on an active lockout, or 0. */
  lockedFor(subjectKey: string): Promise<number>;
  /** Upserts a lockout; never shortens an existing one (greatest()). */
  lockOut(subjectKey: string, seconds: number, reason: string): Promise<void>;
  customerExists(mobileNumber: string): Promise<boolean>;
  /** Cooldown check, invalidation of the open challenge and insert, in one transaction. */
  createChallenge(input: {
    id: string;
    mobileNumber: string;
    codeHash: string;
    ttlSeconds: number;
    cooldownSeconds: number;
  }): Promise<CreateChallengeResult>;
  invalidateChallenge(id: string): Promise<void>;
  invalidateOpenChallenge(mobileNumber: string): Promise<void>;
  /** Counts an attempt BEFORE the code is compared; undefined when no usable challenge exists. */
  recordAttempt(mobileNumber: string, maxAttempts: number): Promise<OpenAttempt | undefined>;
  /** Consumes the challenge and creates the session in one transaction (DM §5.5 step 5.5). */
  consumeAndSignIn(input: {
    challengeId: string;
    mobileNumber: string;
    createAccount: boolean;
    tokenHash: string;
    sessionTtlSeconds: number;
    requestId?: string;
  }): Promise<SignInResult>;
  /** A live session for the token hash: unrevoked, unexpired, not idle, active user. */
  findSession(tokenHash: string, idleSeconds: IdleSeconds, touchSeconds: number): Promise<ActiveSession | undefined>;
  /** Revokes a live session; returns whose it was, or undefined when nothing was revoked. */
  revokeSession(tokenHash: string, reason: RevokeReason): Promise<{ userId: string; role: UserRole } | undefined>;
  revokeAllSessions(userId: string, reason: RevokeReason): Promise<number>;
}

const seconds = (until: Date, now: Date) => Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000));

export function createPrismaAuthStore(prisma: PrismaClient): AuthStore {
  return {
    async hit(bucketKey, windowSeconds) {
      const rows = await prisma.$queryRaw<Array<{ count: number; expires_at: Date; now: Date }>>`
        INSERT INTO rate_limit_bucket AS b (bucket_key, window_start, count, expires_at)
        VALUES (${bucketKey}, now(), 1, now() + ${windowSeconds}::integer * interval '1 second')
        ON CONFLICT (bucket_key) DO UPDATE SET
          window_start = CASE WHEN b.expires_at <= now() THEN now() ELSE b.window_start END,
          count        = CASE WHEN b.expires_at <= now() THEN 1 ELSE b.count + 1 END,
          expires_at   = CASE WHEN b.expires_at <= now() THEN now() + ${windowSeconds}::integer * interval '1 second' ELSE b.expires_at END
        RETURNING count, expires_at, now() AS now`;
      const row = rows[0];
      if (!row) {
        throw new Error('rate limit upsert returned no row');
      }
      return { count: row.count, retryAfterSeconds: seconds(row.expires_at, row.now) };
    },

    async lockedFor(key) {
      const rows = await prisma.$queryRaw<Array<{ locked_until: Date; now: Date }>>`
        SELECT locked_until, now() AS now FROM auth_lockout WHERE subject_key = ${key} AND locked_until > now()`;
      const row = rows[0];
      return row ? seconds(row.locked_until, row.now) : 0;
    },

    async lockOut(key, lockSeconds, reason) {
      await prisma.$executeRaw`
        INSERT INTO auth_lockout AS l (subject_key, locked_until, reason, updated_at)
        VALUES (${key}, now() + ${lockSeconds}::integer * interval '1 second', ${reason}, now())
        ON CONFLICT (subject_key) DO UPDATE SET
          locked_until = greatest(l.locked_until, excluded.locked_until),
          reason = excluded.reason,
          updated_at = now()`;
    },

    async customerExists(mobileNumber) {
      return (await prisma.customerProfile.count({ where: { mobileNumber } })) > 0;
    },

    async createChallenge({ id, mobileNumber, codeHash, ttlSeconds, cooldownSeconds }) {
      try {
        return await prisma.$transaction(async (tx) => {
          // Serialises requests for one number: without it a request whose cooldown check ran
          // before another committed would invalidate that challenge and issue a second code.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'otp:' + mobileNumber}))`;
          const recent = await tx.$queryRaw<Array<{ created_at: Date; now: Date }>>`
            SELECT created_at, now() AS now FROM otp_challenge
            WHERE mobile_number = ${mobileNumber} AND created_at > now() - ${cooldownSeconds}::integer * interval '1 second'
            ORDER BY created_at DESC LIMIT 1`;
          const last = recent[0];
          if (last) {
            const until = new Date(last.created_at.getTime() + cooldownSeconds * 1000);
            return { kind: 'cooldown', retryAfterSeconds: seconds(until, last.now) } as const;
          }
          await tx.$executeRaw`
            UPDATE otp_challenge SET invalidated_at = now()
            WHERE mobile_number = ${mobileNumber} AND consumed_at IS NULL AND invalidated_at IS NULL`;
          const rows = await tx.$queryRaw<Array<{ expires_at: Date }>>`
            INSERT INTO otp_challenge (id, mobile_number, code_hash, expires_at)
            VALUES (${id}::uuid, ${mobileNumber}, ${codeHash}, now() + ${ttlSeconds}::integer * interval '1 second')
            RETURNING expires_at`;
          return { kind: 'created', id, expiresAt: rows[0]!.expires_at } as const;
        });
      } catch (err) {
        // The partial unique index: a concurrent request for the same number committed first.
        if (isUniqueViolation(err)) {
          return { kind: 'cooldown', retryAfterSeconds: cooldownSeconds };
        }
        throw err;
      }
    },

    async invalidateChallenge(id) {
      await prisma.$executeRaw`
        UPDATE otp_challenge SET invalidated_at = now()
        WHERE id = ${id}::uuid AND consumed_at IS NULL AND invalidated_at IS NULL`;
    },

    async invalidateOpenChallenge(mobileNumber) {
      await prisma.$executeRaw`
        UPDATE otp_challenge SET invalidated_at = now()
        WHERE mobile_number = ${mobileNumber} AND consumed_at IS NULL AND invalidated_at IS NULL`;
    },

    async recordAttempt(mobileNumber, maxAttempts) {
      const rows = await prisma.$queryRaw<Array<{ id: string; code_hash: string; attempt_count: number }>>`
        UPDATE otp_challenge SET attempt_count = attempt_count + 1
        WHERE mobile_number = ${mobileNumber} AND consumed_at IS NULL AND invalidated_at IS NULL
          AND expires_at > now() AND attempt_count < ${maxAttempts}::integer
        RETURNING id::text AS id, code_hash, attempt_count`;
      const row = rows[0];
      return row ? { id: row.id, codeHash: row.code_hash, attemptCount: row.attempt_count } : undefined;
    },

    async consumeAndSignIn({ challengeId, mobileNumber, createAccount, tokenHash, sessionTtlSeconds, requestId }) {
      return prisma.$transaction(async (tx): Promise<SignInResult> => {
        const consumed = await tx.$executeRaw`
          UPDATE otp_challenge SET consumed_at = now()
          WHERE id = ${challengeId}::uuid AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()`;
        if (consumed !== 1) {
          return { kind: 'not_consumed' };
        }
        let profile = await tx.customerProfile.findUnique({ where: { mobileNumber }, include: { user: true } });
        if (!profile) {
          if (!createAccount) {
            return { kind: 'no_account' };
          }
          const user = await tx.appUser.create({ data: { role: 'customer', customerProfile: { create: { mobileNumber } } } });
          profile = await tx.customerProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { user: true } });
        }
        if (profile.user.role !== 'customer' || profile.user.status !== 'active') {
          return { kind: 'account_unavailable' };
        }
        const rows = await tx.$queryRaw<Array<{ id: string; expires_at: Date }>>`
          INSERT INTO session (user_id, token_hash, expires_at)
          VALUES (${profile.userId}::uuid, ${tokenHash}, now() + ${sessionTtlSeconds}::integer * interval '1 second')
          RETURNING id::text AS id, expires_at`;
        // The success audit commits with the session (DM §9.4).
        await auditInTransaction(tx, {
          actorUserId: profile.userId,
          actorRole: 'customer',
          action: 'auth.signed_in',
          targetType: 'session',
          targetId: rows[0]!.id,
          details: { method: 'otp' },
          requestId,
        });
        return {
          kind: 'signed_in',
          customer: { id: profile.userId, mobileNumber: profile.mobileNumber, createdAt: profile.createdAt },
          sessionId: rows[0]!.id,
          expiresAt: rows[0]!.expires_at,
        };
      });
    },

    async findSession(tokenHash, idleSeconds, touchSeconds) {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          role: ActiveSession['role'];
          status: string;
          expires_at: Date;
          live: boolean;
          stale: boolean;
          mobile_number: string | null;
          profile_created_at: Date | null;
          staff_display_name: string | null;
        }>
      >`
        SELECT s.id::text AS id, s.user_id::text AS user_id, u.role::text AS role, u.status::text AS status, s.expires_at,
               (s.expires_at > now() AND s.last_seen_at > now() - (CASE u.role
                   WHEN 'customer' THEN ${idleSeconds.customer}::integer
                   WHEN 'genealogist' THEN ${idleSeconds.genealogist}::integer
                   ELSE ${idleSeconds.admin}::integer END) * interval '1 second') AS live,
               (s.last_seen_at < now() - ${touchSeconds}::integer * interval '1 second') AS stale,
               p.mobile_number, p.created_at AS profile_created_at, sp.display_name AS staff_display_name
        FROM session s
        JOIN app_user u ON u.id = s.user_id
        LEFT JOIN customer_profile p ON p.user_id = s.user_id
        LEFT JOIN staff_profile sp ON sp.user_id = s.user_id
        WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL`;
      const row = rows[0];
      if (!row) {
        return undefined;
      }
      if (!row.live || row.status !== 'active') {
        const reason: RevokeReason = row.live ? 'deactivated' : 'expired';
        await prisma.$executeRaw`
          UPDATE session SET revoked_at = now(), revoke_reason = ${reason}::session_revoke_reason
          WHERE id = ${row.id}::uuid AND revoked_at IS NULL`;
        return undefined;
      }
      if (row.stale) {
        await prisma.$executeRaw`UPDATE session SET last_seen_at = now() WHERE id = ${row.id}::uuid`;
      }
      return {
        sessionId: row.id,
        userId: row.user_id,
        role: row.role,
        expiresAt: row.expires_at,
        ...(row.mobile_number && row.profile_created_at
          ? { customer: { id: row.user_id, mobileNumber: row.mobile_number, createdAt: row.profile_created_at } }
          : {}),
        ...(row.staff_display_name ? { staff: { displayName: row.staff_display_name } } : {}),
      };
    },

    async revokeSession(tokenHash, reason) {
      const rows = await prisma.$queryRaw<Array<{ user_id: string; role: UserRole }>>`
        UPDATE session s SET revoked_at = now(), revoke_reason = ${reason}::session_revoke_reason
        FROM app_user u
        WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL AND u.id = s.user_id
        RETURNING s.user_id::text AS user_id, u.role::text AS role`;
      const row = rows[0];
      return row ? { userId: row.user_id, role: row.role } : undefined;
    },

    async revokeAllSessions(userId, reason) {
      return prisma.$executeRaw`
        UPDATE session SET revoked_at = now(), revoke_reason = ${reason}::session_revoke_reason
        WHERE user_id = ${userId}::uuid AND revoked_at IS NULL`;
    },
  };
}
