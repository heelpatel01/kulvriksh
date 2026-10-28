import type { PrismaClient } from '../generated/prisma/client.ts';

// Bounded cleanup of expired authentication records (DM §12: short technical retention, FQ-3/4).
// Each batch is one short DELETE of at most `batchSize` rows chosen through an indexed predicate,
// committed on its own, so no long transaction or table-wide lock is ever taken. Only rows that
// are past their expiry (or revoked) by more than the grace period are removed. It runs only
// when invoked (`npm run db:cleanup`), never on a request.

export interface CleanupOptions {
  batchSize: number;
  /** Upper bound per table per run, so one run has a predictable maximum cost. */
  maxBatches: number;
  /** Keep recently expired rows this long (useful for investigating a recent incident). */
  graceSeconds: number;
}

export const DEFAULT_CLEANUP: CleanupOptions = { batchSize: 500, maxBatches: 200, graceSeconds: 24 * 3600 };

export type CleanupCounts = Record<'otpChallenges' | 'rateLimitBuckets' | 'authLockouts' | 'expiredSessions' | 'revokedSessions' | 'staffTokens', number>;

async function drain(step: () => Promise<number>, { batchSize, maxBatches }: CleanupOptions): Promise<number> {
  let total = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const deleted = await step();
    total += deleted;
    if (deleted < batchSize) {
      break;
    }
  }
  return total;
}

export async function runCleanup(prisma: PrismaClient, options: CleanupOptions = DEFAULT_CLEANUP): Promise<CleanupCounts> {
  const { batchSize: n, graceSeconds: grace } = options;
  const cutoff = () => prisma.$queryRaw<Array<{ t: Date }>>`SELECT now() - ${grace}::integer * interval '1 second' AS t`;
  const [{ t: before }] = (await cutoff()) as [{ t: Date }];

  return {
    otpChallenges: await drain(
      () => prisma.$executeRaw`
        DELETE FROM otp_challenge WHERE id IN (
          SELECT id FROM otp_challenge WHERE expires_at < ${before} LIMIT ${n}::integer)`,
      options,
    ),
    rateLimitBuckets: await drain(
      () => prisma.$executeRaw`
        DELETE FROM rate_limit_bucket WHERE bucket_key IN (
          SELECT bucket_key FROM rate_limit_bucket WHERE expires_at < ${before} LIMIT ${n}::integer)`,
      options,
    ),
    authLockouts: await drain(
      () => prisma.$executeRaw`
        DELETE FROM auth_lockout WHERE subject_key IN (
          SELECT subject_key FROM auth_lockout WHERE locked_until < ${before} LIMIT ${n}::integer)`,
      options,
    ),
    expiredSessions: await drain(
      () => prisma.$executeRaw`
        DELETE FROM session WHERE id IN (
          SELECT id FROM session WHERE expires_at < ${before} LIMIT ${n}::integer)`,
      options,
    ),
    // One-time staff links and MFA challenges, used or not, once past their expiry.
    staffTokens: await drain(
      () => prisma.$executeRaw`
        DELETE FROM staff_token WHERE id IN (
          SELECT id FROM staff_token WHERE expires_at < ${before} LIMIT ${n}::integer)`,
      options,
    ),
    revokedSessions: await drain(
      () => prisma.$executeRaw`
        DELETE FROM session WHERE id IN (
          SELECT id FROM session WHERE revoked_at IS NOT NULL AND revoked_at < ${before} LIMIT ${n}::integer)`,
      options,
    ),
  };
}
