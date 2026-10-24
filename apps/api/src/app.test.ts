import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.ts';
import { captureLogger, startServer, UUID_PATTERN, type RunningServer } from './testing/helpers.ts';

const captured = captureLogger();
let server: RunningServer;

before(async () => {
  server = await startServer(createApp({ logger: captured.logger }));
});

after(async () => {
  await server.close();
});

test('GET /health returns 200 and reports the database as not configured', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'ok',
    service: 'kulvriksh-api',
    dependencies: { database: 'not_configured' },
  });
});

test('responses carry security headers and are not cacheable', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('every response gets a new server-generated request ID; client-supplied IDs are ignored', async () => {
  const a = await fetch(`${server.baseUrl}/health`, { headers: { 'X-Request-Id': 'attacker-chosen-id' } });
  const b = await fetch(`${server.baseUrl}/health`);
  const idA = a.headers.get('x-request-id') ?? '';
  const idB = b.headers.get('x-request-id') ?? '';
  assert.match(idA, UUID_PATTERN);
  assert.match(idB, UUID_PATTERN);
  assert.notEqual(idA, 'attacker-chosen-id');
  assert.notEqual(idA, idB);
});

test('unknown routes return the JSON error envelope with the request ID', async () => {
  const res = await fetch(`${server.baseUrl}/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: res.headers.get('x-request-id') },
  });
});

test('error responses carry the same security headers as successful ones', async () => {
  const ok = await fetch(`${server.baseUrl}/health`);
  const notFound = await fetch(`${server.baseUrl}/does-not-exist`);
  for (const name of [
    'cache-control',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'cross-origin-resource-policy',
    'content-security-policy',
  ]) {
    assert.equal(notFound.headers.get(name), ok.headers.get(name), name);
  }
  assert.match(notFound.headers.get('content-type') ?? '', /^application\/json/);
});

test('unsupported methods on known paths are not found', async () => {
  const res = await fetch(`${server.baseUrl}/health`, { method: 'POST' });
  assert.equal(res.status, 404);
});

test('the access log records path and status but never the query string', async () => {
  const res = await fetch(`${server.baseUrl}/missing?token=secret-value-123&mobile=9999999999`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  // The 'finish' event can fire just after the client receives the response.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const entry = captured.lines.find((l) => l.msg === 'request completed' && l.requestId === id);
  assert.ok(entry, 'expected an access log entry');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/missing');
  assert.equal(entry.status, 404);
  assert.equal(entry.level, 'info');
  assert.equal(typeof entry.durationMs, 'number');
  assert.doesNotMatch(captured.raw.join('\n'), /secret-value-123|9999999999/);
});

test('health checks are logged at debug level only', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'debug');
});
