// Expired-record cleanup against the real test database (`npm run test:db`). Seeds its own rows
// (marked with random keys and numbers) and checks only those, so other data is never touched.
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createDatabase, type Database } from '../db.ts';
import { runCleanup } from './cleanup.ts';

const TEST_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_URL ? false : 'TEST_DATABASE_URL is not set (run `npm run test:db`)';
const MARK = `itest-cleanup-${randomUUID().slice(0, 8)}`;
let db: Database;
const users: string[] = [];

before(() => {
  if (TEST_URL) {
    db = createDatabase(TEST_URL);
  }
});

after(async () => {
  if (!TEST_URL) {
    return;
  }
  await db.prisma.session.deleteMany({ where: { userId: { in: users } } });
  await db.prisma.otpChallenge.deleteMany({ where: { codeHash: { startsWith: MARK } } });
  await db.prisma.rateLimitBucket.deleteMany({ where: { bucketKey: { startsWith: MARK } } });
  await db.prisma.authLockout.deleteMany({ where: { subjectKey: { startsWith: MARK } } });
  await db.prisma.appUser.deleteMany({ where: { id: { in: users } } });
  await db.disconnect();
});

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000);
const ahead = (hours: number) => new Date(Date.now() + hours * 3_600_000);

test('deletes only rows expired or revoked beyond the grace period, in bounded batches', { skip }, async () => {
  const user = await db.prisma.appUser.create({ data: { role: 'customer' } });
  users.push(user.id);
  const number = () => `+919${String(randomInt(0, 1e9)).padStart(9, '0')}`;
  // Five long-expired challenges and one fresh one; all consumed, so the open-challenge index allows them.
  for (let i = 0; i < 5; i += 1) {
    await db.prisma.otpChallenge.create({
      data: { mobileNumber: number(), codeHash: `${MARK}-old-${i}`, createdAt: ago(50), expiresAt: ago(49), consumedAt: ago(49) },
    });
  }
  await db.prisma.otpChallenge.create({ data: { mobileNumber: number(), codeHash: `${MARK}-fresh`, expiresAt: ahead(1) } });
  await db.prisma.otpChallenge.create({
    data: { mobileNumber: number(), codeHash: `${MARK}-recent`, createdAt: ago(2), expiresAt: ago(1), consumedAt: ago(1) },
  });
  await db.prisma.rateLimitBucket.createMany({
    data: [
      { bucketKey: `${MARK}-old`, windowStart: ago(50), count: 3, expiresAt: ago(49) },
      { bucketKey: `${MARK}-fresh`, windowStart: ago(0.1), count: 1, expiresAt: ahead(1) },
    ],
  });
  await db.prisma.authLockout.createMany({
    data: [
      { subjectKey: `${MARK}-old`, lockedUntil: ago(48), reason: 'otp_verify_fail' },
      { subjectKey: `${MARK}-active`, lockedUntil: ahead(1), reason: 'otp_verify_fail' },
    ],
  });
  await db.prisma.session.createMany({
    data: [
      { userId: user.id, tokenHash: `${MARK}-expired`, createdAt: ago(100), lastSeenAt: ago(100), expiresAt: ago(30) },
      { userId: user.id, tokenHash: `${MARK}-revoked`, createdAt: ago(40), lastSeenAt: ago(40), expiresAt: ahead(100), revokedAt: ago(30), revokeReason: 'logout' },
      { userId: user.id, tokenHash: `${MARK}-revoked-recently`, createdAt: ago(2), expiresAt: ahead(100), revokedAt: ago(1), revokeReason: 'logout' },
      { userId: user.id, tokenHash: `${MARK}-live`, expiresAt: ahead(100) },
    ],
  });

  // Tiny batches prove the loop drains in bounded steps.
  const counts = await runCleanup(db.prisma, { batchSize: 2, maxBatches: 1000, graceSeconds: 24 * 3600 });
  assert.ok(counts.otpChallenges >= 5 && counts.rateLimitBuckets >= 1 && counts.authLockouts >= 1);
  assert.ok(counts.expiredSessions >= 1 && counts.revokedSessions >= 1);

  const left = async () => ({
    challenges: (await db.prisma.otpChallenge.findMany({ where: { codeHash: { startsWith: MARK } } })).map((r) => r.codeHash).sort(),
    buckets: (await db.prisma.rateLimitBucket.findMany({ where: { bucketKey: { startsWith: MARK } } })).map((r) => r.bucketKey),
    lockouts: (await db.prisma.authLockout.findMany({ where: { subjectKey: { startsWith: MARK } } })).map((r) => r.subjectKey),
    sessions: (await db.prisma.session.findMany({ where: { userId: user.id } })).map((r) => r.tokenHash).sort(),
  });
  assert.deepEqual(await left(), {
    challenges: [`${MARK}-fresh`, `${MARK}-recent`],
    buckets: [`${MARK}-fresh`],
    lockouts: [`${MARK}-active`],
    sessions: [`${MARK}-live`, `${MARK}-revoked-recently`],
  });

  // Running again changes nothing for these rows; maxBatches bounds the work of one run.
  await runCleanup(db.prisma, { batchSize: 2, maxBatches: 1, graceSeconds: 24 * 3600 });
  assert.equal((await left()).sessions.length, 2);
});
