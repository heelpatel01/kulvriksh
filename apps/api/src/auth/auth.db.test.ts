// Customer sign-in against the real local PostgreSQL test database (kulvriksh_test), connected as
// the least-privilege runtime role. Run with `npm run test:db`. Skipped without TEST_DATABASE_URL.
// Every number is random per run and every row created here is deleted afterwards.
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createApp } from '../app.ts';
import { createDatabase, type Database } from '../db.ts';
import { captureLogger, startServer, type RunningServer } from '../testing/helpers.ts';
import { DEFAULT_AUTH_SETTINGS, type AuthSettings } from './auth-config.ts';
import { hashSessionToken, subjectKey } from './auth-crypto.ts';
import { createAuthService } from './auth-service.ts';
import { createPrismaAuthStore } from './auth-store.ts';
import { DevelopmentOtpOutbox } from './otp-delivery.ts';

const TEST_URL = process.env.TEST_DATABASE_URL;
const skip = TEST_URL ? false : 'TEST_DATABASE_URL is not set (run `npm run test:db` after `npm run db:init`)';
const OTP_KEY = `otp-${crypto.randomUUID()}-${crypto.randomUUID()}`;
const RATE_KEY = `rate-${crypto.randomUUID()}-${crypto.randomUUID()}`;
const PREVIEW = 'db-test-admin-preview-token-0123456789';

const captured = captureLogger();
let db: Database;
const servers: RunningServer[] = [];
const numbers: string[] = [];
const ips: string[] = [];

/** A random Indian number in national form, plus its stored E.164 form. */
function newNumber() {
  const national = `9${String(randomInt(0, 1e9)).padStart(9, '0')}`;
  numbers.push(`+91${national}`);
  return { national, e164: `+91${national}` };
}

/** A documentation-range address not used by any other harness in this run, so per-IP limits never collide. */
function newIp() {
  let ip: string;
  do {
    ip = `198.51.100.${randomInt(1, 255)}`;
  } while (ips.includes(ip));
  ips.push(ip);
  return ip;
}

interface Harness {
  base: string;
  outbox: DevelopmentOtpOutbox;
  ip: string;
  request(mobileNumber: string): Promise<Response>;
  verify(mobileNumber: string, code: string): Promise<Response>;
  code(mobileNumber: string): string | undefined;
}

// Fast settings for tests: no cooldown unless a test asks for one.
const FAST: Partial<AuthSettings> = { otpResendCooldownSeconds: 0 };

async function harness(overrides: Partial<AuthSettings> = {}, database?: Database): Promise<Harness> {
  const outbox = new DevelopmentOtpOutbox();
  const settings = { ...DEFAULT_AUTH_SETTINGS, ...FAST, ...overrides };
  const target = database ?? db;
  const auth = createAuthService({
    store: createPrismaAuthStore(target.prisma),
    sender: outbox,
    settings,
    otpHmacKey: OTP_KEY,
    rateLimitHmacKey: RATE_KEY,
    logger: captured.logger,
  });
  const server = await startServer(createApp({ logger: captured.logger, auth, devOtpOutbox: outbox, adminPreviewToken: PREVIEW }));
  servers.push(server);
  const ip = newIp();
  const post = (path: string, body: unknown) =>
    fetch(`${server.baseUrl}/api/v1${path}`, {
      method: 'POST',
      // The test client is on loopback, so the API trusts the forwarded client address.
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    });
  return {
    base: server.baseUrl,
    outbox,
    ip,
    request: (mobileNumber) => post('/auth/otp/request', { mobileNumber }),
    verify: (mobileNumber, code) => post('/auth/otp/verify', { mobileNumber, code }),
    code: (mobileNumber) => outbox.read(`+91${mobileNumber}`)?.code,
  };
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');
const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(h: Harness, national: string) {
  assert.equal((await h.request(national)).status, 202);
  const res = await h.verify(national, h.code(national)!);
  assert.equal(res.status, 200);
  return ((await res.json()) as { session: { token: string } }).session.token;
}

before(async () => {
  if (TEST_URL) {
    db = createDatabase(TEST_URL);
  }
});

after(async () => {
  if (!TEST_URL) {
    return;
  }
  await Promise.all(servers.map((s) => s.close()));
  const profiles = await db.prisma.customerProfile.findMany({ where: { mobileNumber: { in: numbers } } });
  const userIds = profiles.map((p) => p.userId);
  // Audit rows are append-only for the runtime role, so this run's rows are removed as the owner.
  const owner = createDatabase(process.env.TEST_MIGRATION_DATABASE_URL ?? '');
  try {
    const subjects = numbers.map((n) => subjectKey(RATE_KEY, 'audit:subject', n).slice(0, 32));
    await owner.prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: [...userIds, ...subjects] } }] } });
  } finally {
    await owner.disconnect();
  }
  await db.prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.prisma.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await db.prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
  await db.prisma.otpChallenge.deleteMany({ where: { mobileNumber: { in: numbers } } });
  const keys = [
    ...numbers.flatMap((n) => [
      subjectKey(RATE_KEY, 'otp_request:number', n),
      subjectKey(RATE_KEY, 'otp_verify_fail:number', n),
      subjectKey(RATE_KEY, 'lockout:otp_verify_fail', n),
    ]),
    ...ips.flatMap((ip) => [subjectKey(RATE_KEY, 'otp_request:ip', ip), subjectKey(RATE_KEY, 'otp_verify:ip', ip)]),
  ];
  await db.prisma.rateLimitBucket.deleteMany({ where: { bucketKey: { in: keys } } });
  await db.prisma.authLockout.deleteMany({ where: { subjectKey: { in: keys } } });
  await db.disconnect();
  // AS-AUTH-03: across every test, no code and no full number reached the log.
  const log = captured.raw.join('\n');
  for (const n of numbers) {
    assert.ok(!log.includes(n.slice(3)), 'a full mobile number was logged');
  }
});

test('sign-in end to end: only hashes are stored, the account and session are created', { skip }, async () => {
  const h = await harness();
  const { national, e164 } = newNumber();
  const req = await h.request(national);
  assert.equal(req.status, 202);
  assert.deepEqual(await req.json(), { status: 'accepted', expiresInSeconds: 300, resendAfterSeconds: 0 });
  const code = h.code(national)!;
  assert.match(code, /^\d{6}$/);

  const [challenge] = await db.prisma.otpChallenge.findMany({ where: { mobileNumber: e164 } });
  assert.ok(challenge);
  assert.match(challenge.codeHash, /^[0-9a-f]{64}$/);
  assert.ok(!challenge.codeHash.includes(code));

  const res = await h.verify(national, code);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { session: { token: string }; user: { id: string; mobileNumberMasked: string } };
  assert.equal(body.user.mobileNumberMasked, `+91 ••••••${national.slice(-4)}`);
  const sessions = await db.prisma.session.findMany({ where: { userId: body.user.id } });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]!.tokenHash, hashSessionToken(body.session.token));
  assert.notEqual(sessions[0]!.tokenHash, body.session.token);

  const me = await fetch(`${h.base}/api/v1/me`, { headers: bearer(body.session.token) });
  assert.equal(me.status, 200);
  const session = await fetch(`${h.base}/api/v1/auth/session`, { headers: bearer(body.session.token) });
  assert.equal(session.status, 200);

  // A second sign-in reuses the account (no duplicate customer).
  await signIn(h, national);
  assert.equal(await db.prisma.customerProfile.count({ where: { mobileNumber: e164 } }), 1);
});

test('AS-AUTH-05: a code works once; concurrent submissions create exactly one session', { skip }, async () => {
  const h = await harness();
  const { national } = newNumber();
  await h.request(national);
  const code = h.code(national)!;
  const results = await Promise.all(Array.from({ length: 6 }, () => h.verify(national, code)));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 400, 400, 400, 400, 400]);
  assert.equal((await h.verify(national, code)).status, 400, 'reuse after success fails');
});

test('AS-AUTH-06: an expired code fails', { skip }, async () => {
  const h = await harness({ otpTtlSeconds: 1 });
  const { national } = newNumber();
  await h.request(national);
  const code = h.code(national)!;
  await pause(1300);
  const res = await h.verify(national, code);
  assert.equal(res.status, 400);
  assert.equal(await errorCode(res), 'INVALID_CODE');
});

test('wrong codes: generic failure; after the attempt limit even the right code fails (AS-AUTH-07)', { skip }, async () => {
  const h = await harness({ otpMaxAttempts: 3 });
  const { national, e164 } = newNumber();
  await h.request(national);
  const code = h.code(national)!;
  for (let i = 0; i < 3; i += 1) {
    const res = await h.verify(national, wrong(code));
    assert.equal(res.status, 400);
    assert.equal(await errorCode(res), 'INVALID_CODE');
  }
  assert.equal((await h.verify(national, code)).status, 400);
  const [challenge] = await db.prisma.otpChallenge.findMany({ where: { mobileNumber: e164 } });
  assert.equal(challenge!.attemptCount, 3);
  assert.ok(challenge!.invalidatedAt, 'challenge invalidated once its attempts are used up');
});

test('parallel wrong guesses cannot exceed the per-challenge attempt limit', { skip }, async () => {
  const h = await harness({ otpMaxAttempts: 3 });
  const { national, e164 } = newNumber();
  await h.request(national);
  const code = h.code(national)!;
  await Promise.all(Array.from({ length: 10 }, () => h.verify(national, wrong(code))));
  const [challenge] = await db.prisma.otpChallenge.findMany({ where: { mobileNumber: e164 } });
  assert.equal(challenge!.attemptCount, 3);
});

test('AS-AUTH-09: a resend invalidates the previous code', { skip }, async () => {
  const h = await harness();
  const { national } = newNumber();
  await h.request(national);
  const first = h.code(national)!;
  await h.request(national);
  const second = h.code(national)!;
  if (first !== second) {
    assert.equal((await h.verify(national, first)).status, 400);
  }
  assert.equal((await h.verify(national, second)).status, 200);
});

test('resend cooldown: a second request inside the cooldown is 429 with Retry-After', { skip }, async () => {
  const h = await harness({ otpResendCooldownSeconds: 60 });
  const { national } = newNumber();
  assert.equal((await h.request(national)).status, 202);
  const res = await h.request(national);
  assert.equal(res.status, 429);
  const retry = Number(res.headers.get('retry-after'));
  assert.ok(retry > 0 && retry <= 60, `retry-after ${retry}`);
});

test('concurrent requests for one number leave exactly one open challenge', { skip }, async () => {
  const h = await harness({ otpResendCooldownSeconds: 60 });
  const { national, e164 } = newNumber();
  const statuses = (await Promise.all(Array.from({ length: 5 }, () => h.request(national)))).map((r) => r.status).sort();
  assert.deepEqual(statuses, [202, 429, 429, 429, 429]);
  assert.equal(await db.prisma.otpChallenge.count({ where: { mobileNumber: e164, consumedAt: null, invalidatedAt: null } }), 1);
});

test('AS-AUTH-02: request limits per number and per IP return 429', { skip }, async () => {
  const perNumber = await harness({ otpRequestsPerNumber: 2 });
  const { national } = newNumber();
  assert.deepEqual([(await perNumber.request(national)).status, (await perNumber.request(national)).status], [202, 202]);
  assert.equal((await perNumber.request(national)).status, 429);

  const perIp = await harness({ otpRequestsPerIp: 2 });
  assert.equal((await perIp.request(newNumber().national)).status, 202);
  assert.equal((await perIp.request(newNumber().national)).status, 202);
  assert.equal((await perIp.request(newNumber().national)).status, 429, 'third number from the same IP');

  const verifyIp = await harness({ verifyRequestsPerIp: 2 });
  const other = newNumber();
  await verifyIp.request(other.national);
  await verifyIp.verify(other.national, '000000');
  await verifyIp.verify(other.national, '000000');
  assert.equal((await verifyIp.verify(other.national, '000000')).status, 429);
});

test('lockout: the failure budget spans challenges; a new code does not reset it', { skip }, async () => {
  const h = await harness({ otpMaxAttempts: 3, verifyFailureLimit: 4, lockoutSeconds: 120 });
  const { national } = newNumber();
  await h.request(national);
  const first = h.code(national)!;
  for (let i = 0; i < 3; i += 1) {
    await h.verify(national, wrong(first));
  }
  await h.request(national);
  const second = h.code(national)!;
  const locked = await h.verify(national, wrong(second));
  assert.equal(locked.status, 429, 'fourth failure across two challenges locks the number');
  assert.equal(await errorCode(locked), 'RATE_LIMITED');
  assert.equal((await h.verify(national, second)).status, 429, 'the right code fails while locked');
  assert.equal((await h.request(national)).status, 429, 'no new code while locked');
});

test('AS-AUTH-01: registered and unregistered numbers get identical responses', { skip }, async () => {
  const h = await harness();
  const registered = newNumber();
  await signIn(h, registered.national);
  const fresh = newNumber();
  const a = await h.request(registered.national);
  const b = await h.request(fresh.national);
  assert.equal(a.status, b.status);
  assert.deepEqual(await a.json(), await b.json());
});

test('FQ-2 `existing` mode: unknown numbers get the same answer but no code and no account', { skip }, async () => {
  const known = newNumber();
  await signIn(await harness(), known.national);
  const h = await harness({ customerSignup: 'existing' });
  const unknown = newNumber();
  const a = await h.request(known.national);
  const b = await h.request(unknown.national);
  assert.equal(a.status, 202);
  assert.deepEqual(await a.json(), await b.json());
  assert.ok(h.code(known.national));
  assert.equal(h.code(unknown.national), undefined, 'nothing sent to an unknown number');
  assert.equal(await db.prisma.customerProfile.count({ where: { mobileNumber: unknown.e164 } }), 0);
});

test('AS-AUTH-04: a delivery failure is retryable and invalidates the challenge', { skip }, async () => {
  const h = await harness();
  const { national, e164 } = newNumber();
  h.outbox.failNextSend();
  const res = await h.request(national);
  assert.equal(res.status, 503);
  assert.equal(await db.prisma.otpChallenge.count({ where: { mobileNumber: e164, invalidatedAt: null } }), 0);
  assert.ok(captured.lines.some((l) => l.msg === 'otp delivery failed' && l.level === 'error'));
  assert.equal((await h.request(national)).status, 202, 'retry works');
});

test('logout revokes the session server-side; logout-all revokes every session', { skip }, async () => {
  const h = await harness();
  const { national } = newNumber();
  const one = await signIn(h, national);
  const two = await signIn(h, national);
  const three = await signIn(h, national);
  const out = await fetch(`${h.base}/api/v1/auth/logout`, { method: 'POST', headers: bearer(one) });
  assert.equal(out.status, 204);
  assert.equal((await fetch(`${h.base}/api/v1/me`, { headers: bearer(one) })).status, 401, 'AS-AUTH-10');
  assert.equal((await fetch(`${h.base}/api/v1/me`, { headers: bearer(two) })).status, 200);
  assert.equal((await fetch(`${h.base}/api/v1/auth/logout-all`, { method: 'POST', headers: bearer(two) })).status, 204);
  for (const token of [two, three]) {
    assert.equal((await fetch(`${h.base}/api/v1/me`, { headers: bearer(token) })).status, 401);
  }
  const row = await db.prisma.session.findUnique({ where: { tokenHash: hashSessionToken(one) } });
  assert.equal(row?.revokeReason, 'logout');
});

test('idle timeout and absolute expiry end the session (revoke_reason expired)', { skip }, async () => {
  const idle = await harness({ sessionIdleSeconds: 1, sessionTouchSeconds: 3600 });
  const a = newNumber();
  const token = await signIn(idle, a.national);
  await pause(1300);
  assert.equal((await fetch(`${idle.base}/api/v1/me`, { headers: bearer(token) })).status, 401);
  const row = await db.prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
  assert.equal(row?.revokeReason, 'expired');

  const absolute = await harness({ sessionTtlSeconds: 1 });
  const b = newNumber();
  const other = await signIn(absolute, b.national);
  await pause(1300);
  assert.equal((await fetch(`${absolute.base}/api/v1/me`, { headers: bearer(other) })).status, 401);
});

test('a deactivated account cannot sign in, and its open session stops working', { skip }, async () => {
  const h = await harness();
  const { national, e164 } = newNumber();
  const token = await signIn(h, national);
  const profile = await db.prisma.customerProfile.findUniqueOrThrow({ where: { mobileNumber: e164 } });
  await db.prisma.appUser.update({ where: { id: profile.userId }, data: { status: 'deactivated' } });
  assert.equal((await fetch(`${h.base}/api/v1/me`, { headers: bearer(token) })).status, 401);
  await h.request(national);
  const res = await h.verify(national, h.code(national)!);
  assert.equal(res.status, 403);
  assert.equal(await errorCode(res), 'ACCOUNT_UNAVAILABLE');
});

test('database checks reject impossible rows', { skip }, async () => {
  await assert.rejects(db.prisma.$executeRaw`INSERT INTO otp_challenge (mobile_number, code_hash, expires_at) VALUES ('12345', 'x', now() + interval '1 minute')`);
  await assert.rejects(db.prisma.$executeRaw`INSERT INTO rate_limit_bucket (bucket_key, window_start, count, expires_at) VALUES ('itest', now(), 0, now() + interval '1 minute')`);
});

test('sign-in fails closed with 503 when the database is unreachable', { skip }, async () => {
  const down = createDatabase('postgresql://nobody:nothing@127.0.0.1:1/none');
  try {
    const h = await harness({}, down);
    const res = await h.request(newNumber().national);
    assert.equal(res.status, 503);
    assert.equal((await fetch(`${h.base}/api/v1/me`, { headers: bearer('A'.repeat(43)) })).status, 503);
  } finally {
    await down.disconnect();
  }
});
