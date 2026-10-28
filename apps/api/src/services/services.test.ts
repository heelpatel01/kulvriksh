// Route and validation tests with an in-memory repository (no database needed).
// The same behaviour against real PostgreSQL is covered by services.db.test.ts.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AdminService } from '@kulvriksh/shared';
import { createApp } from '../app.ts';
import { captureLogger, fakeAuth, startServer, testToken, type RunningServer } from '../testing/helpers.ts';
import type { ServiceRepository } from './service-repository.ts';
import { validateCreate, validateUpdate } from './service-validation.ts';

const ADMIN = testToken('admin-session');
const GENEALOGIST = testToken('genealogist-session');
const CUSTOMER = testToken('customer-session');
const auth = fakeAuth({ [ADMIN]: { role: 'admin' }, [GENEALOGIST]: { role: 'genealogist' }, [CUSTOMER]: { role: 'customer' } });

function memoryRepository(): ServiceRepository {
  const rows: AdminService[] = [];
  return {
    async listActive() {
      return rows.filter((r) => r.status === 'active').map(({ id, name, description }) => ({ id, name, description }));
    },
    async listAll() {
      return [...rows];
    },
    async create(input) {
      const now = new Date().toISOString();
      const row = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (!row) {
        throw Object.assign(new Error('not found'), { code: 'P2025' });
      }
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      return row;
    },
  };
}

const captured = captureLogger();
let server: RunningServer;
let noDatabase: RunningServer;
let downDatabase: RunningServer;

before(async () => {
  server = await startServer(createApp({ logger: captured.logger, services: memoryRepository(), auth }));
  noDatabase = await startServer(createApp({ logger: captured.logger, auth }));
  const failing = async () => {
    throw Object.assign(new Error("Can't reach database server at 127.0.0.1:5434"), { code: 'P1001' });
  };
  downDatabase = await startServer(
    createApp({
      logger: captured.logger,
      auth,
      services: { listActive: failing, listAll: failing, create: failing, update: failing },
    }),
  );
});

after(async () => {
  await Promise.all([server.close(), noDatabase.close(), downDatabase.close()]);
});

const admin = (base: string, path: string, init: RequestInit = {}) =>
  fetch(`${base}/api/v1/admin${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN}`, ...init.headers },
  });

test('validation: create requires name and description, trims them, defaults to inactive', () => {
  assert.deepEqual(validateCreate({ name: '  Research  ', description: ' One family line ' }), {
    ok: true,
    value: { name: 'Research', description: 'One family line', status: 'inactive' },
  });
  const result = validateCreate({ name: '  ', status: 'archived', price: 5 });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.ok ? {} : result.fields).sort(), ['description', 'name', 'price', 'status']);
  assert.equal(validateCreate({ name: 'x'.repeat(121), description: 'ok' }).ok, false);
  assert.equal(validateCreate(['not', 'an', 'object']).ok, false);
});

test('validation: update needs at least one known field', () => {
  assert.equal(validateUpdate({}).ok, false);
  assert.deepEqual(validateUpdate({ status: 'active' }), { ok: true, value: { status: 'active' } });
  assert.equal(validateUpdate({ id: 'x' }).ok, false);
});

test('admin routes need an admin session: anonymous 401, unknown token 401, other roles 403', async () => {
  const missing = await fetch(`${server.baseUrl}/api/v1/admin/services`);
  assert.equal(missing.status, 401);
  const unknown = await admin(server.baseUrl, '/services', { headers: { authorization: `Bearer ${testToken('nobody')}` } });
  assert.equal(unknown.status, 401);
  for (const token of [GENEALOGIST, CUSTOMER]) {
    const res = await admin(server.baseUrl, '/services', { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'FORBIDDEN');
  }
  // The development preview token no longer opens admin routes.
  const preview = await admin(server.baseUrl, '/services', { headers: { authorization: '', 'x-admin-preview-token': 'x'.repeat(40) } });
  assert.equal(preview.status, 401);
  // Without a session service (no database or keys) admin routes are closed, never open.
  const unconfigured = await startServer(createApp({ logger: captured.logger, services: memoryRepository() }));
  try {
    assert.equal((await admin(unconfigured.baseUrl, '/services')).status, 503);
  } finally {
    await unconfigured.close();
  }
});

test('create → inactive and hidden publicly; activate → listed publicly', async () => {
  const created = await admin(server.baseUrl, '/services', {
    method: 'POST',
    body: JSON.stringify({ name: 'Genealogy research', description: 'Research by an assigned genealogist.' }),
  });
  assert.equal(created.status, 201);
  const { service } = (await created.json()) as { service: AdminService };
  assert.equal(service.status, 'inactive');
  const publicBefore = (await (await fetch(`${server.baseUrl}/api/v1/services`)).json()) as { services: unknown[] };
  assert.equal(publicBefore.services.length, 0);
  const activated = await admin(server.baseUrl, `/services/${service.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  assert.equal(activated.status, 200);
  const publicAfter = (await (await fetch(`${server.baseUrl}/api/v1/services`)).json()) as { services: Array<Record<string, unknown>> };
  assert.deepEqual(publicAfter.services, [{ id: service.id, name: 'Genealogy research', description: 'Research by an assigned genealogist.' }]);
});

test('invalid input returns 400 VALIDATION_FAILED with field messages', async () => {
  const res = await admin(server.baseUrl, '/services', { method: 'POST', body: JSON.stringify({ name: '' }) });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: string; fields: Record<string, string> } };
  assert.equal(body.error.code, 'VALIDATION_FAILED');
  assert.ok(body.error.fields.name && body.error.fields.description);
});

test('writes must be JSON (415), malformed JSON is a generic 400, oversized bodies are 413', async () => {
  const form = await admin(server.baseUrl, '/services', { method: 'POST', body: 'name=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const malformed = await admin(server.baseUrl, '/services', { method: 'POST', body: '{"name":' });
  assert.equal(malformed.status, 400);
  const huge = await admin(server.baseUrl, '/services', { method: 'POST', body: JSON.stringify({ name: 'x', description: 'y'.repeat(70_000) }) });
  assert.equal(huge.status, 413);
});

test('unknown or malformed ids return 404', async () => {
  const unknown = await admin(server.baseUrl, '/services/2f1c2a8e-6a3b-4c7d-9e0f-1a2b3c4d5e6f', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  assert.equal(unknown.status, 404);
  const malformed = await admin(server.baseUrl, '/services/not-a-uuid', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  assert.equal(malformed.status, 404);
});

test('without a database, service routes answer 503', async () => {
  const res = await fetch(`${noDatabase.baseUrl}/api/v1/services`);
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'SERVICE_UNAVAILABLE');
});

test('an unreachable database answers 503 without internal details', async () => {
  const res = await fetch(`${downDatabase.baseUrl}/api/v1/services`);
  const text = await res.text();
  assert.equal(res.status, 503);
  assert.doesNotMatch(text, /5434|127\.0\.0\.1|P1001|reach/);
  assert.match(captured.raw.join('\n'), /database unavailable/);
});
