// Unit tests for the public catalogue fetch (run by `npm test` in apps/web, Node's test runner).
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { fetchPublicServices } from './public-services.ts';

let server: Server;
let base: string;
let reply: { status: number; body: string; delayMs?: number } = { status: 200, body: '{"services":[]}' };

before(async () => {
  server = createServer((req, res) => {
    const send = () => {
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(reply.body);
    };
    if (req.url !== '/api/v1/services') {
      res.writeHead(404).end();
      return;
    }
    if (reply.delayMs) {
      setTimeout(send, reply.delayMs);
    } else {
      send();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('returns active services from the API, keeping only the public fields', async () => {
  reply = {
    status: 200,
    body: JSON.stringify({ services: [{ id: 'a', name: 'Research', description: 'One family line', status: 'active', extra: 1 }] }),
  };
  assert.deepEqual(await fetchPublicServices({ baseUrl: base }), {
    kind: 'ok',
    services: [{ id: 'a', name: 'Research', description: 'One family line' }],
  });
});

test('an empty catalogue is a valid result, not an error', async () => {
  reply = { status: 200, body: '{"services":[]}' };
  assert.deepEqual(await fetchPublicServices({ baseUrl: base }), { kind: 'ok', services: [] });
});

test('without API_INTERNAL_URL the catalogue is not configured', async () => {
  assert.deepEqual(await fetchPublicServices({ baseUrl: undefined }), { kind: 'not_configured' });
  assert.deepEqual(await fetchPublicServices({ baseUrl: '  ' }), { kind: 'not_configured' });
});

test('an API error status (e.g. 503 when the database is down) is unavailable', async () => {
  reply = { status: 503, body: '{"error":{"code":"SERVICE_UNAVAILABLE"}}' };
  assert.deepEqual(await fetchPublicServices({ baseUrl: base }), { kind: 'unavailable', reason: 'status' });
});

test('a malformed response is rejected instead of rendered', async () => {
  reply = { status: 200, body: '{"services":[{"id":1}]}' };
  assert.deepEqual(await fetchPublicServices({ baseUrl: base }), { kind: 'unavailable', reason: 'invalid_response' });
  reply = { status: 200, body: 'not json' };
  assert.deepEqual(await fetchPublicServices({ baseUrl: base }), { kind: 'unavailable', reason: 'invalid_response' });
});

test('an unreachable or slow API is unavailable within the timeout', async () => {
  assert.deepEqual(await fetchPublicServices({ baseUrl: 'http://127.0.0.1:1' }), { kind: 'unavailable', reason: 'unreachable' });
  reply = { status: 200, body: '{"services":[]}', delayMs: 1000 };
  const started = Date.now();
  assert.deepEqual(await fetchPublicServices({ baseUrl: base, timeoutMs: 100 }), { kind: 'unavailable', reason: 'unreachable' });
  assert.ok(Date.now() - started < 900);
  reply = { status: 200, body: '{"services":[]}' };
});
