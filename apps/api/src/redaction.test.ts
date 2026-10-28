import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REDACTED, scrubText, serializeError } from './redaction.ts';

// Each case: input text, secrets that must disappear, context that must survive.
const SCRUB_CASES: ReadonlyArray<{ name: string; input: string; secrets: string[]; keep: string[] }> = [
  {
    name: 'database URL credentials and query values',
    input: 'connect failed: postgres://app:db-pass-77@10.0.0.5:5432/kul?sslmode=require&password=x9y8',
    secrets: ['db-pass-77', 'x9y8', 'app:'],
    keep: ['connect failed', '10.0.0.5:5432/kul'],
  },
  {
    name: 'key=value, key: value and JSON pairs with sensitive keys',
    input: 'password=hunter2 api_key: sk_live_51Hx "client_secret":"s3cr3t" sessionToken=abc DB_PASSWORD=pw1',
    secrets: ['hunter2', 'sk_live_51Hx', 's3cr3t', 'sessionToken=abc', 'pw1'],
    keep: ['password=', 'api_key:', '"client_secret":"', 'DB_PASSWORD='],
  },
  {
    name: 'Authorization header values and JWTs',
    input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl; token eyJa.eyJb.cc',
    secrets: ['eyJhbGciOiJIUzI1NiJ9', 'c2lnbmF0dXJl', 'eyJa.eyJb.cc'],
    keep: ['Authorization:'],
  },
  {
    name: 'OTP codes, phone numbers and email addresses',
    input: 'OTP 482913 rejected for +919876543210 / 9876543210 (jane.doe@example.co.in); pin: 1234',
    secrets: ['482913', '9876543210', 'jane.doe@example.co.in', '1234'],
    keep: ['OTP', 'rejected for', 'pin:'],
  },
  {
    name: 'Razorpay-style signatures, webhook secrets and long hex digests',
    input:
      'x-razorpay-signature=3f1c9a0b7e2d4c6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d webhook_secret: whsec_ABC123def456 digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    secrets: ['3f1c9a0b7e2d4c6f8a1b3c5d', 'whsec_ABC123def456', '9f86d081884c7d659a2feaa0c55ad015'],
    keep: ['x-razorpay-signature=', 'webhook_secret:', 'digest'],
  },
];

for (const c of SCRUB_CASES) {
  test(`scrubText removes ${c.name}`, () => {
    const out = scrubText(c.input);
    for (const secret of c.secrets) {
      assert.ok(!out.includes(secret), `secret "${secret}" survived: ${out}`);
    }
    for (const kept of c.keep) {
      assert.ok(out.includes(kept), `context "${kept}" was lost: ${out}`);
    }
    assert.ok(out.includes('[REDACTED'), out);
  });
}

test('scrubText leaves ordinary diagnostic text unchanged', () => {
  const ordinary = [
    'listen EADDRINUSE: address already in use 127.0.0.1:4103',
    'request completed GET /health 200 in 12.5ms',
    '5493c663-9fbf-454b-94b1-0bac204970ef',
    'at createErrorHandler (file:///C:/Users/dev/KulVriksh/apps/api/src/errors.ts:33:11)',
    '2026-10-24T03:15:10.000Z',
    'http://127.0.0.1:4104/health',
    'Invalid configuration: API_PORT must be an integer, got "abc"',
  ];
  for (const text of ordinary) {
    assert.equal(scrubText(text), text);
  }
});

// Regression (TASK-04C, D1): inputs that took 0.5–4.6 s each before the key-value rule
// was bounded (TASK-04B E2). scrubText is called directly, so no server shares the timing.
const ADVERSARIAL: ReadonlyArray<readonly [string, string]> = [
  ['"otp" x666', 'otp'.repeat(666)],
  ['request path "/" + "otp" x666', '/' + 'otp'.repeat(666)],
  ['"tokenx" x333', 'tokenx'.repeat(333)],
  ['"token" x400', 'token'.repeat(400)],
  ['"password" x250', 'password'.repeat(250)],
  ['"secret_" x285', 'secret_'.repeat(285)],
  ['"token" + 50 spaces x36', `token${' '.repeat(50)}`.repeat(36)],
];
const ADVERSARIAL_LIMIT_MS = 50;
// Backtracking is slow on every run; CPU contention from parallel test files is not. The fastest
// of a few runs therefore keeps the regression signal without failing on a busy machine.
const RUNS = 3;

test('scrubText stays fast on adversarial inputs (ReDoS regression)', () => {
  for (const [name, input] of ADVERSARIAL) {
    let fastest = Infinity;
    for (let run = 0; run < RUNS; run += 1) {
      const started = process.hrtime.bigint();
      scrubText(input);
      fastest = Math.min(fastest, Number(process.hrtime.bigint() - started) / 1e6);
    }
    assert.ok(fastest < ADVERSARIAL_LIMIT_MS, `${name} took ${fastest.toFixed(1)} ms (fastest of ${RUNS})`);
  }
});

test('scrubText still redacts long sensitive key names after the quantifiers were bounded', () => {
  // Key names here have no digits: a 32+ character name that mixes letters and digits is
  // itself replaced by the long-token rule (over-redaction, unchanged by this fix).
  const input = [
    'x_razorpay_webhook_signature_header=abcd1234',
    'MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t',
    `${'A'.repeat(40)}_PASSWORD=pw40long`,
  ].join(' ');
  const out = scrubText(input);
  for (const secret of ['abcd1234', 's3cr3t', 'pw40long']) {
    assert.ok(!out.includes(secret), `secret "${secret}" survived: ${out}`);
  }
  assert.ok(out.includes('x_razorpay_webhook_signature_header='), out);
  assert.ok(out.includes('MY_APP_DATABASE_PASSWORD_PRIMARY:'), out);
});

test('scrubText caps very long text', () => {
  const out = scrubText('a'.repeat(5000));
  assert.ok(out.length < 2100);
  assert.match(out, /…\[truncated\]$/);
});

test('serializeError keeps allowlisted fields and never copies arbitrary properties', () => {
  const err = Object.assign(new Error('provider call failed: token=abc123tok'), {
    code: 'ECONNRESET',
    status: 502,
    syscall: 'read',
    config: { headers: { Authorization: 'Bearer live-key-1' }, data: '{"otp":"482913"}' },
    request: { path: '/v1/send?mobile=9876543210' },
    response: { data: { mobile: '9876543210', email: 'jane@example.com' } },
    body: '{"password":"hunter2"}',
  });
  const safe = serializeError(err);
  assert.deepEqual(Object.keys(safe).sort(), ['code', 'message', 'name', 'stack', 'status', 'syscall']);
  assert.equal(safe.code, 'ECONNRESET');
  assert.equal(safe.status, 502);
  assert.equal(safe.syscall, 'read');
  assert.equal(safe.message, `provider call failed: token=${REDACTED}`);
  const json = JSON.stringify(safe);
  for (const leaked of ['abc123tok', 'live-key-1', '482913', '9876543210', 'jane@example.com', 'hunter2']) {
    assert.ok(!json.includes(leaked), `leaked ${leaked}`);
  }
});

test('serializeError drops the stack header line, which repeats the unscrubbed message', () => {
  const safe = serializeError(new Error('secret=hunter2'));
  assert.ok(safe.stack, 'expected stack frames');
  assert.doesNotMatch(safe.stack ?? '', /hunter2|^Error:/m);
  assert.ok((safe.stack ?? '').split('\n').every((line) => line.startsWith('at ')));
});

test('serializeError limits stack frames', () => {
  const err = new Error('deep');
  err.stack = ['Error: deep', ...Array.from({ length: 40 }, (_, i) => `    at fn${i} (file.ts:${i}:1)`)].join('\n');
  assert.equal(serializeError(err).stack?.split('\n').length, 15);
});

test('serializeError follows cause chains (scrubbed) to a bounded depth', () => {
  let err: unknown = new Error('root: password=hunter2');
  for (let i = 0; i < 6; i++) {
    err = new Error(`level ${i}`, { cause: err });
  }
  const safe = serializeError(err);
  let depth = 0;
  let node: typeof safe | undefined = safe;
  while (node?.cause) {
    node = node.cause;
    depth++;
  }
  assert.equal(depth, 3);
  assert.doesNotMatch(JSON.stringify(safe), /hunter2/);
});

test('serializeError includes scrubbed cause messages', () => {
  const safe = serializeError(new Error('outer', { cause: new Error('inner token=abc123tok') }));
  assert.equal(safe.cause?.message, `inner token=${REDACTED}`);
});

test('serializeError summarises AggregateError members (at most 5)', () => {
  const agg = new AggregateError(
    Array.from({ length: 8 }, (_, i) => new Error(`member ${i} otp: 48291${i}`)),
    'several failed',
  );
  const safe = serializeError(agg);
  assert.equal(safe.errors?.length, 5);
  assert.doesNotMatch(JSON.stringify(safe), /48291\d/);
});

test('serializeError handles non-Error values without dumping objects', () => {
  assert.deepEqual(serializeError('rejected with token=abc123tok'), {
    name: 'NonError',
    message: `rejected with token=${REDACTED}`,
  });
  assert.deepEqual(serializeError({ response: { data: { mobile: '9876543210' } } }), {
    name: 'NonError',
    message: '[non-Error object omitted]',
  });
  assert.deepEqual(serializeError(['a']), { name: 'NonError', message: '[non-Error array omitted]' });
  assert.deepEqual(serializeError(42), { name: 'NonError', message: '42' });
  assert.deepEqual(serializeError(undefined), { name: 'NonError', message: 'undefined' });
});

test('serializeError rejects unsafe code values', () => {
  const err = Object.assign(new Error('x'), { code: 'not a code; password=hunter2' });
  assert.equal(serializeError(err).code, undefined);
});
