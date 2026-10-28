import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.ts';
import type { DatabaseProbe } from './readiness.ts';
import { captureLogger, startServer } from './testing/helpers.ts';

async function readiness(database: DatabaseProbe | undefined, readinessTimeoutMs?: number) {
  const captured = captureLogger();
  const server = await startServer(createApp({ logger: captured.logger, database, readinessTimeoutMs }));
  try {
    const started = Date.now();
    const res = await fetch(`${server.baseUrl}/ready`);
    const body = (await res.json()) as Record<string, unknown>;
    return { status: res.status, body, elapsedMs: Date.now() - started, raw: captured.raw, cacheControl: res.headers.get('cache-control') };
  } finally {
    await server.close();
  }
}

test('without a database probe the API is ready and reports the database as not configured', async () => {
  const result = await readiness(undefined);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: 'ready', service: 'kulvriksh-api', dependencies: { database: 'not_configured' } });
  assert.equal(result.cacheControl, 'no-store');
});

test('a healthy database probe makes the API ready', async () => {
  const result = await readiness({ ping: async () => {} });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.dependencies, { database: 'up' });
});

test('a failing probe returns 503 without details, and logs the error in the safe form', async () => {
  const probe: DatabaseProbe = {
    ping: async () => {
      throw new Error('connect ECONNREFUSED postgresql://kulvriksh_app:sample-pw-not-real@127.0.0.1:5434/kulvriksh');
    },
  };
  const result = await readiness(probe);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { status: 'not_ready', service: 'kulvriksh-api', dependencies: { database: 'down' } });
  const log = result.raw.join('\n');
  assert.match(log, /database readiness check failed/);
  assert.match(log, /ECONNREFUSED/);
  assert.doesNotMatch(log, /sample-pw-not-real/);
  assert.doesNotMatch(JSON.stringify(result.body), /ECONNREFUSED|127\.0\.0\.1/);
});

test('a hanging probe is abandoned at the timeout and reported as down', async () => {
  let aborted = false;
  const probe: DatabaseProbe = {
    ping: (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }),
  };
  const result = await readiness(probe, 150);
  assert.equal(result.status, 503);
  assert.deepEqual(result.body.dependencies, { database: 'down' });
  assert.ok(aborted, 'the probe received the abort signal');
  assert.ok(result.elapsedMs < 2000, `responded in ${result.elapsedMs} ms`);
  assert.match(result.raw.join('\n'), /timed out after 150 ms/);
});

test('readiness requests are logged at debug level only', async () => {
  const result = await readiness(undefined);
  const access = result.raw.map((line) => JSON.parse(line) as Record<string, unknown>).find((l) => l.path === '/ready');
  assert.equal(access?.level, 'debug');
});
