import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.ts';
import { ConfigError, loadConfig } from '../config.ts';
import { captureLogger, startServer } from '../testing/helpers.ts';
import { DEFAULT_AUTH_SETTINGS } from './auth-config.ts';
import { digestsMatch, generateOtp, hashOtp, hashSessionToken, isSessionTokenShape, newSessionToken, subjectKey } from './auth-crypto.ts';
import type { AuthService } from './auth-service.ts';
import { maskMobileNumber, normaliseMobileNumber } from './mobile.ts';
import { DevelopmentOtpOutbox } from './otp-delivery.ts';

const KEY_A = 'a'.repeat(40);
const KEY_B = 'b'.repeat(40);

test('mobile numbers: Indian forms normalise to E.164; anything else is refused', () => {
  for (const raw of ['9876543210', '98765 43210', '+91 98765-43210', '+919876543210', '919876543210', '09876543210', '0091 9876543210']) {
    assert.equal(normaliseMobileNumber(raw), '+919876543210', raw);
  }
  for (const raw of ['', '12345', '5876543210', '+1 2025550123', '98765432101', 'abcdefghij', 9876543210, null, '9'.repeat(40)]) {
    assert.equal(normaliseMobileNumber(raw), undefined, String(raw));
  }
  assert.equal(maskMobileNumber('+919876543210'), '+91 ••••••3210');
});

test('codes: CSPRNG digits of the configured length; hashes are keyed and per challenge', () => {
  const codes = new Set(Array.from({ length: 200 }, () => generateOtp(6)));
  for (const code of codes) {
    assert.match(code, /^\d{6}$/);
  }
  assert.ok(codes.size > 190, 'codes should rarely repeat');
  const hash = hashOtp(KEY_A, 'challenge-1', '123456');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, hashOtp(KEY_B, 'challenge-1', '123456'), 'different key');
  assert.notEqual(hash, hashOtp(KEY_A, 'challenge-2', '123456'), 'different challenge');
  assert.ok(!hash.includes('123456'));
  assert.equal(digestsMatch(hash, hashOtp(KEY_A, 'challenge-1', '123456')), true);
  assert.equal(digestsMatch(hash, hashOtp(KEY_A, 'challenge-1', '123457')), false);
  assert.equal(digestsMatch(hash, 'abcd'), false, 'length mismatch is a mismatch, not an exception');
  assert.equal(digestsMatch('', ''), false);
});

test('session tokens are 256-bit base64url; only a hash is stored; keys hide the identifier', () => {
  const token = newSessionToken();
  assert.equal(isSessionTokenShape(token), true);
  assert.equal(isSessionTokenShape('short'), false);
  assert.notEqual(newSessionToken(), token);
  assert.match(hashSessionToken(token), /^[0-9a-f]{64}$/);
  const key = subjectKey(KEY_A, 'otp_request:number', '+919876543210');
  assert.ok(!key.includes('9876543210'));
  assert.notEqual(key, subjectKey(KEY_A, 'otp_request:ip', '+919876543210'));
});

test('auth config: conservative defaults; sign-in is off unless explicitly enabled', () => {
  const { auth } = loadConfig({});
  assert.deepEqual(auth.settings, DEFAULT_AUTH_SETTINGS);
  assert.equal(auth.otpDelivery, 'none');
  assert.equal(auth.settings.otpLength, 6);
  assert.equal(auth.settings.otpTtlSeconds, 300);
  const custom = loadConfig({ AUTH_OTP_LENGTH: '8', AUTH_OTP_TTL_SECONDS: '120', AUTH_CUSTOMER_SIGNUP: 'existing' }).auth.settings;
  assert.equal(custom.otpLength, 8);
  assert.equal(custom.otpTtlSeconds, 120);
  assert.equal(custom.customerSignup, 'existing');
});

test('auth config: out-of-range values, weak or shared keys are refused', () => {
  for (const [env, message] of [
    [{ AUTH_OTP_LENGTH: '4' }, /AUTH_OTP_LENGTH must be an integer from 6 to 8/],
    [{ AUTH_OTP_MAX_ATTEMPTS: '1000' }, /AUTH_OTP_MAX_ATTEMPTS/],
    [{ AUTH_SESSION_TTL_SECONDS: 'abc' }, /AUTH_SESSION_TTL_SECONDS/],
    [{ AUTH_SESSION_TTL_SECONDS: '3600', AUTH_SESSION_IDLE_SECONDS: '7200' }, /must not exceed/],
    [{ AUTH_CUSTOMER_SIGNUP: 'maybe' }, /AUTH_CUSTOMER_SIGNUP/],
    [{ OTP_HMAC_KEY: 'short' }, /OTP_HMAC_KEY must be at least 32 characters/],
    [{ OTP_HMAC_KEY: KEY_A, RATE_LIMIT_HMAC_KEY: KEY_A }, /must be different/],
    [{ OTP_DELIVERY: 'sms' }, /no SMS provider/],
    [{ OTP_DELIVERY: 'development' }, /needs OTP_HMAC_KEY and RATE_LIMIT_HMAC_KEY/],
  ] as const) {
    assert.throws(() => loadConfig(env), message, JSON.stringify(env));
  }
});

test('auth config: the development outbox can never be enabled outside development', () => {
  const env = { OTP_DELIVERY: 'development', OTP_HMAC_KEY: KEY_A, RATE_LIMIT_HMAC_KEY: KEY_B };
  assert.equal(loadConfig({ ...env, NODE_ENV: 'development' }).auth.otpDelivery, 'development');
  for (const nodeEnv of ['production', 'test']) {
    assert.throws(
      () => loadConfig({ ...env, NODE_ENV: nodeEnv }),
      (err: unknown) => err instanceof ConfigError && err.issues.some((i) => /only when NODE_ENV=development/.test(i)),
    );
  }
});

test('auth config: issue messages never echo key values', () => {
  try {
    loadConfig({ OTP_HMAC_KEY: 'tiny-secret-value' });
    assert.fail('expected ConfigError');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.ok(!err.message.includes('tiny-secret-value'));
  }
});

test('development outbox keeps the latest code per number and drops expired ones', async () => {
  let now = new Date('2026-10-25T10:00:00Z');
  const outbox = new DevelopmentOtpOutbox(() => now);
  await outbox.send('+919876543210', '111111', new Date('2026-10-25T10:05:00Z'));
  await outbox.send('+919876543210', '222222', new Date('2026-10-25T10:05:00Z'));
  assert.equal(outbox.read('+919876543210')?.code, '222222');
  now = new Date('2026-10-25T10:05:00Z');
  assert.equal(outbox.read('+919876543210'), undefined);
  outbox.failNextSend();
  await assert.rejects(outbox.send('+919876543210', '333333', new Date('2026-10-25T11:00:00Z')));
  assert.equal(outbox.read('+919876543210'), undefined);
});

// Route behaviour with a scripted service: status codes, headers and what is (not) disclosed.
function fakeService(overrides: Partial<AuthService>): AuthService {
  const fail = () => Promise.reject(new Error('not scripted'));
  return { requestOtp: fail, verifyOtp: fail, authenticate: async () => undefined, logout: async () => {}, logoutAll: async () => 0, ...overrides };
}

async function withApp(deps: Parameters<typeof createApp>[0], run: (baseUrl: string) => Promise<void>) {
  const server = await startServer(createApp(deps));
  try {
    await run(server.baseUrl);
  } finally {
    await server.close();
  }
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('without a configured sign-in, every auth route answers 503 and customer routes are closed', async () => {
  const { logger } = captureLogger();
  await withApp({ logger }, async (base) => {
    assert.equal((await post(`${base}/api/v1/auth/otp/request`, { mobileNumber: '9876543210' })).status, 503);
    assert.equal((await post(`${base}/api/v1/auth/otp/verify`, { mobileNumber: '9876543210', code: '123456' })).status, 503);
    assert.equal((await fetch(`${base}/api/v1/me`)).status, 503);
    assert.equal((await fetch(`${base}/api/v1/dev/otp-outbox?mobileNumber=9876543210`)).status, 404, 'dev route not registered');
    // Unrelated paths are still 404, not caught by the customer guard.
    assert.equal((await fetch(`${base}/api/v1/nothing-here`)).status, 404);
  });
});

test('OTP request: 202 generic body, 400 for a bad number, 429 with Retry-After, 503 on delivery failure', async () => {
  const { logger } = captureLogger();
  const results = [
    { kind: 'accepted', expiresInSeconds: 300, resendAfterSeconds: 60 },
    { kind: 'invalid_number' },
    { kind: 'rate_limited', retryAfterSeconds: 42 },
    { kind: 'delivery_failed' },
  ] as const;
  let i = 0;
  const auth = fakeService({ requestOtp: async () => results[i++]! });
  await withApp({ logger, auth }, async (base) => {
    const ok = await post(`${base}/api/v1/auth/otp/request`, { mobileNumber: '9876543210' });
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { status: 'accepted', expiresInSeconds: 300, resendAfterSeconds: 60 });
    const bad = await post(`${base}/api/v1/auth/otp/request`, { mobileNumber: 'x' });
    assert.equal(bad.status, 400);
    assert.equal(((await bad.json()) as { error: { code: string } }).error.code, 'VALIDATION_FAILED');
    const limited = await post(`${base}/api/v1/auth/otp/request`, { mobileNumber: '9876543210' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '42');
    assert.equal(((await limited.json()) as { error: { retryAfterSeconds: number } }).error.retryAfterSeconds, 42);
    assert.equal((await post(`${base}/api/v1/auth/otp/request`, { mobileNumber: '9876543210' })).status, 503);
    // Form posts are refused (CSRF safeguard).
    const form = await fetch(`${base}/api/v1/auth/otp/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'mobileNumber=9876543210',
    });
    assert.equal(form.status, 415);
  });
});

test('customer routes require a well-formed Bearer token for a live customer session', async () => {
  const { logger } = captureLogger();
  const token = newSessionToken();
  const customer = { id: '00000000-0000-4000-8000-000000000001', mobileNumber: '+919876543210', createdAt: new Date('2026-10-25T00:00:00Z') };
  const auth = fakeService({
    authenticate: async (t) =>
      t === token ? { sessionId: 's1', userId: customer.id, role: 'customer', expiresAt: new Date('2026-11-01T00:00:00Z'), customer } : undefined,
  });
  await withApp({ logger, auth }, async (base) => {
    assert.equal((await fetch(`${base}/api/v1/me`)).status, 401);
    assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: 'Bearer not-a-token' } })).status, 401);
    assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${newSessionToken()}` } })).status, 401);
    const me = await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(me.status, 200);
    const body = (await me.json()) as { user: { mobileNumberMasked: string } };
    assert.equal(body.user.mobileNumberMasked, '+91 ••••••3210');
    assert.ok(!JSON.stringify(body).includes('9876543210'), 'full number is not returned');
    assert.equal(me.headers.get('cache-control'), 'no-store');
  });
});

test('staff sessions cannot use customer routes', async () => {
  const { logger } = captureLogger();
  const token = newSessionToken();
  const auth = fakeService({
    authenticate: async () => ({ sessionId: 's', userId: 'u', role: 'admin', expiresAt: new Date('2026-11-01T00:00:00Z') }),
  });
  await withApp({ logger, auth }, async (base) => {
    assert.equal((await fetch(`${base}/api/v1/me`, { headers: { authorization: `Bearer ${token}` } })).status, 403);
  });
});

test('logout is idempotent and always 204', async () => {
  const { logger } = captureLogger();
  const revoked: string[] = [];
  const auth = fakeService({ logout: async (t) => void revoked.push(t) });
  await withApp({ logger, auth }, async (base) => {
    const token = newSessionToken();
    assert.equal((await post(`${base}/api/v1/auth/logout`, {}, { authorization: `Bearer ${token}` })).status, 204);
    assert.equal((await post(`${base}/api/v1/auth/logout`, {})).status, 204);
    assert.deepEqual(revoked, [token]);
  });
});

test('development outbox route: only when configured, and only with the preview token', async () => {
  const { logger, raw } = captureLogger();
  const outbox = new DevelopmentOtpOutbox();
  await outbox.send('+919876543210', '654321', new Date(Date.now() + 60_000));
  const token = 'unit-test-admin-preview-token-0123456789';
  await withApp({ logger, auth: fakeService({}), devOtpOutbox: outbox, adminPreviewToken: token }, async (base) => {
    const url = `${base}/api/v1/dev/otp-outbox?mobileNumber=9876543210`;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { 'x-admin-preview-token': 'wrong' } })).status, 401);
    const ok = await fetch(url, { headers: { 'x-admin-preview-token': token } });
    assert.equal(ok.status, 200);
    assert.equal(((await ok.json()) as { code: string }).code, '654321');
  });
  assert.ok(!raw.join('\n').includes('654321'), 'the code never reaches the log');
  assert.ok(!raw.join('\n').includes('9876543210'), 'the number (query string) never reaches the log');
});
