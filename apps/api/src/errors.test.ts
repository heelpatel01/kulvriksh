import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createErrorHandler, notFoundHandler } from './errors.ts';
import { requestId } from './middleware.ts';
import { captureLogger, startServer, type RunningServer } from './testing/helpers.ts';

// A test-only app exercising the real error handlers with routes that fail in different ways.
const captured = captureLogger();
let server: RunningServer;

before(async () => {
  const app = express();
  app.use(requestId);
  app.get('/boom', () => {
    throw new Error('database password=hunter2 at /srv/internal/path');
  });
  app.get('/async-boom', async () => {
    throw new Error('async failure detail');
  });
  app.get('/bad-request', (_req, _res, next) => next(Object.assign(new Error('parse detail'), { status: 400 })));
  app.get('/too-large', (_req, _res, next) => next(Object.assign(new Error('size detail'), { statusCode: 413 })));
  app.get('/teapot', (_req, _res, next) => next(Object.assign(new Error('teapot'), { status: 418 })));
  app.get('/not-an-error', (_req, _res, next) => next('a plain string'));
  // Shaped like a body-parser JSON error, which carries the raw request body.
  app.get('/bad-json', (_req, _res, next) =>
    next(
      Object.assign(new SyntaxError('Unexpected token } in JSON at position 30'), {
        status: 400,
        type: 'entity.parse.failed',
        body: '{"otp":"482913","mobile":"9876543210"}',
      }),
    ),
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(captured.logger));
  server = await startServer(app);
});

after(async () => {
  await server.close();
});

test('unexpected errors return a generic 500 without internal details', async () => {
  const res = await fetch(`${server.baseUrl}/boom`);
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.deepEqual(JSON.parse(text), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: res.headers.get('x-request-id') },
  });
  assert.doesNotMatch(text, /hunter2|\/srv\/internal|stack|Error:/);
});

test('the 500 is logged with the request ID and a scrubbed error message (no secret in any log line)', async () => {
  const res = await fetch(`${server.baseUrl}/boom`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  const entry = captured.lines.find((l) => l.msg === 'unhandled error' && l.requestId === id);
  assert.ok(entry, 'expected an error log entry');
  assert.equal(entry.level, 'error');
  assert.equal((entry.err as Record<string, unknown>).message, 'database password=[REDACTED] at /srv/internal/path');
  assert.doesNotMatch(captured.raw.join('\n'), /hunter2/);
});

test('client errors carrying a raw request body are logged without the body', async () => {
  const res = await fetch(`${server.baseUrl}/bad-json`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  assert.equal(res.status, 400);
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'warn');
  const err = entry?.err as Record<string, unknown>;
  assert.equal(err.name, 'SyntaxError');
  assert.equal('body' in err, false);
  assert.doesNotMatch(captured.raw.join('\n'), /482913|9876543210/);
});

test('rejected promises in async handlers are caught (Express 5) and return 500', async () => {
  const res = await fetch(`${server.baseUrl}/async-boom`);
  assert.equal(res.status, 500);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INTERNAL_ERROR');
});

test('client errors keep their status with a generic message', async () => {
  const bad = await fetch(`${server.baseUrl}/bad-request`);
  assert.equal(bad.status, 400);
  assert.deepEqual(((await bad.json()) as { error: object }).error, {
    code: 'BAD_REQUEST',
    message: 'The request could not be processed',
    requestId: bad.headers.get('x-request-id'),
  });

  const large = await fetch(`${server.baseUrl}/too-large`);
  assert.equal(large.status, 413);
  assert.equal(((await large.json()) as { error: { code: string } }).error.code, 'PAYLOAD_TOO_LARGE');

  const teapot = await fetch(`${server.baseUrl}/teapot`);
  assert.equal(teapot.status, 418);
  assert.equal(((await teapot.json()) as { error: { code: string } }).error.code, 'CLIENT_ERROR');
});

test('client errors are logged at warn, not error', async () => {
  const res = await fetch(`${server.baseUrl}/bad-request`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'warn');
  assert.equal(entry?.status, 400);
});

test('non-Error values passed to next() are treated as 500', async () => {
  const res = await fetch(`${server.baseUrl}/not-an-error`);
  assert.equal(res.status, 500);
});
