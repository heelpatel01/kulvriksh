import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogger, REDACTED } from './logger.ts';

function collect(level: Parameters<typeof createLogger>[0]['level'] = 'debug') {
  const lines: Record<string, unknown>[] = [];
  const levels: string[] = [];
  const logger = createLogger({
    level,
    now: () => new Date('2026-01-02T03:04:05.000Z'),
    sink: (line, lvl) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
      levels.push(lvl);
    },
  });
  return { logger, lines, levels };
}

test('writes one JSON object per line with time, level, msg and fields', () => {
  const { logger, lines } = collect();
  logger.info('hello', { requestId: 'r-1', count: 2 });
  assert.deepEqual(lines, [{ time: '2026-01-02T03:04:05.000Z', level: 'info', msg: 'hello', requestId: 'r-1', count: 2 }]);
});

test('filters below the configured level', () => {
  const { logger, lines } = collect('warn');
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  assert.deepEqual(
    lines.map((l) => l.level),
    ['warn', 'error'],
  );
});

test('silent emits nothing', () => {
  const { logger, lines } = collect('silent');
  logger.error('e');
  assert.equal(lines.length, 0);
});

test('passes the level to the sink so warn/error can go to stderr', () => {
  const { logger, levels } = collect();
  logger.info('i');
  logger.error('e');
  assert.deepEqual(levels, ['info', 'error']);
});

test('redacts sensitive keys at any depth, case-insensitively', () => {
  const { logger, lines } = collect();
  logger.info('req', {
    password: 'hunter2',
    apiKey: 'k',
    Authorization: 'Bearer abc',
    webhookSecret: 's',
    sessionToken: 't',
    otpCode: '123456',
    headers: { cookie: 'sid=1', 'set-cookie': 'sid=2', 'x-razorpay-signature': 'sig', accept: 'json' },
    path: '/health',
  });
  const line = lines[0] ?? {};
  for (const key of ['password', 'apiKey', 'Authorization', 'webhookSecret', 'sessionToken', 'otpCode']) {
    assert.equal(line[key], REDACTED, key);
  }
  assert.deepEqual(line.headers, {
    cookie: REDACTED,
    'set-cookie': REDACTED,
    'x-razorpay-signature': REDACTED,
    accept: 'json',
  });
  assert.equal(line.path, '/health');
  assert.doesNotMatch(JSON.stringify(lines), /hunter2|Bearer abc|sid=1|123456/);
});

test('error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output', () => {
  const { logger, lines } = collect();
  const inner = new Error('inner: OTP 482913 for jane@example.com');
  const err = Object.assign(new Error('db login failed password=hunter2', { cause: inner }), {
    config: { headers: { cookie: 'sid=s3ss10n' } },
    response: { data: { mobile: '9876543210' } },
  });
  logger.error('failed', { err, requestId: 'r-9' });
  logger.error('rejection', { reason: 'rejected: token=abc123tok' });
  logger.error('provider', { error: { mobile: '9876543210' } });
  const out = JSON.stringify(lines);
  for (const leaked of ['hunter2', '482913', 'jane@example.com', 's3ss10n', '9876543210', 'abc123tok']) {
    assert.ok(!out.includes(leaked), `leaked ${leaked}`);
  }
  const first = lines[0]?.err as Record<string, unknown>;
  assert.equal(first.message, 'db login failed password=[REDACTED]');
  assert.equal((first.cause as Record<string, unknown>).message, 'inner: OTP [REDACTED] for [REDACTED_EMAIL]');
  assert.equal('config' in first, false);
  assert.equal(lines[0]?.requestId, 'r-9');
  assert.deepEqual(lines[1]?.reason, { name: 'NonError', message: 'rejected: token=[REDACTED]' });
  assert.deepEqual(lines[2]?.error, { name: 'NonError', message: '[non-Error object omitted]' });
});

test('Error instances under other keys or inside arrays also use the safe form', () => {
  const { logger, lines } = collect();
  const failure = Object.assign(new Error('upload failed token=abc123tok'), { response: { data: { mobile: '9876543210' } } });
  logger.warn('x', { failure, attempts: [new Error('attempt 1 password=hunter2')] });
  const out = JSON.stringify(lines);
  for (const leaked of ['abc123tok', '9876543210', 'hunter2']) {
    assert.ok(!out.includes(leaked), `leaked ${leaked}`);
  }
  const failed = lines[0]?.failure as Record<string, unknown>;
  assert.equal(failed.message, 'upload failed token=[REDACTED]');
  assert.equal('response' in failed, false);
  assert.equal(((lines[0]?.attempts as Record<string, unknown>[])[0] ?? {}).message, 'attempt 1 password=[REDACTED]');
});

test('ordinary string fields are scrubbed too', () => {
  const { logger, lines } = collect();
  logger.info('x', { note: 'callback https://user:pw@host/cb?code=99&state=abc', path: '/health' });
  assert.equal(lines[0]?.note, 'callback https://[REDACTED]@host/cb?code=[REDACTED]&state=[REDACTED]');
  assert.equal(lines[0]?.path, '/health');
});

test('binary values are summarised by size and their bytes never reach output', () => {
  const { logger, lines } = collect();
  const secret = '{"otp":"482913"}';
  logger.info('upload', {
    chunk: Buffer.from(secret),
    view: new Uint8Array(Buffer.from(secret)),
    floats: new Float64Array(2),
    data: new DataView(new ArrayBuffer(3)),
    raw: new ArrayBuffer(8),
    nested: { parts: [Buffer.from(secret)] },
  });
  const line = lines[0] ?? {};
  assert.equal(line.chunk, '[binary 16 bytes]');
  assert.equal(line.view, '[binary 16 bytes]');
  assert.equal(line.floats, '[binary 16 bytes]');
  assert.equal(line.data, '[binary 3 bytes]');
  assert.equal(line.raw, '[binary 8 bytes]');
  assert.deepEqual(line.nested, { parts: ['[binary 16 bytes]'] });
  // No byte-indexed map ("0":123,...) or decoded content that could rebuild the original.
  const out = JSON.stringify(lines);
  assert.doesNotMatch(out, /482913|"0":|123,34/);
});

test('the msg text is scrubbed, keeping its useful context', () => {
  const { logger, lines } = collect();
  logger.error('login failed for 9876543210 password=hunter2');
  logger.info('request completed');
  assert.equal(lines[0]?.msg, 'login failed for [REDACTED_NUMBER] password=[REDACTED]');
  assert.equal(lines[1]?.msg, 'request completed');
});

test('serialises errors with name, message and stack', () => {
  const { logger, lines } = collect();
  logger.error('failed', { err: new TypeError('bad input') });
  const err = lines[0]?.err as Record<string, unknown>;
  assert.equal(err.name, 'TypeError');
  assert.equal(err.message, 'bad input');
  assert.equal(typeof err.stack, 'string');
});

test('handles circular references, bigint, dates, undefined and deep nesting', () => {
  const { logger, lines } = collect();
  const circular: Record<string, unknown> = { name: 'loop' };
  circular.self = circular;
  logger.info('x', {
    circular,
    big: 10n,
    when: new Date('2026-01-01T00:00:00.000Z'),
    missing: undefined,
    deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } },
  });
  const line = lines[0] ?? {};
  assert.deepEqual(line.circular, { name: 'loop', self: '[Circular]' });
  assert.equal(line.big, '10');
  assert.equal(line.when, '2026-01-01T00:00:00.000Z');
  assert.equal('missing' in line, false);
  assert.match(JSON.stringify(line.deep), /\[Truncated\]/);
});

test('fields cannot overwrite time, level or msg', () => {
  const { logger, lines } = collect();
  logger.info('real message', { time: 'fake', level: 'error', msg: 'forged' });
  assert.deepEqual(lines[0], { time: '2026-01-02T03:04:05.000Z', level: 'info', msg: 'real message' });
});

test('child loggers add bindings, and call fields take precedence', () => {
  const { logger, lines } = collect();
  const child = logger.child({ service: 'api', component: 'a' });
  child.info('x', { component: 'b' });
  assert.equal(lines[0]?.service, 'api');
  assert.equal(lines[0]?.component, 'b');
});
