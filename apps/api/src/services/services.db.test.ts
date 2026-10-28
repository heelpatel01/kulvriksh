// Integration tests against the real local PostgreSQL test database (kulvriksh_test), connected
// as the least-privilege runtime role. Run with `npm run test:db` (loads apps/api/.env).
// Without TEST_DATABASE_URL they are skipped, so `npm test` never touches a database.
// Every row created here is tracked and deleted afterwards; nothing else is modified.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AdminService } from '@kulvriksh/shared';
import { createApp } from '../app.ts';
import { createDatabase, type Database } from '../db.ts';
import { captureLogger, startServer } from '../testing/helpers.ts';
import { cleanup, harness, skip, TEST_URL, type Harness } from '../testing/sprint-harness.ts';
import { createPrismaServiceRepository } from './service-repository.ts';

const MARK = `itest-${crypto.randomUUID().slice(0, 8)}`;

let h: Harness;
let db: Database;
let server: { baseUrl: string };
/** Admin routes need a signed-in admin session (TASK-09). */
let ADMIN_AUTH: { authorization: string };
const createdIds: string[] = [];

before(async () => {
  if (skip) {
    return;
  }
  h = await harness();
  db = h.db;
  server = { baseUrl: h.base };
  ADMIN_AUTH = { authorization: `Bearer ${(await h.staff('admin')).token}` };
});

after(async () => {
  if (skip) {
    return;
  }
  if (createdIds.length > 0) {
    await db.prisma.service.deleteMany({ where: { id: { in: createdIds } } });
  }
  await h.close();
  await cleanup();
});

async function create(name: string, description = 'Created by an integration test') {
  const res = await fetch(`${server.baseUrl}/api/v1/admin/services`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...ADMIN_AUTH },
    body: JSON.stringify({ name, description }),
  });
  const body = (await res.json()) as { service: AdminService };
  if (res.status === 201) {
    createdIds.push(body.service.id);
  }
  return { status: res.status, service: body.service };
}

test('/ready runs a real query and reports the database as up', { skip }, async () => {
  const res = await fetch(`${server.baseUrl}/ready`);
  assert.equal(res.status, 200);
  assert.deepEqual(((await res.json()) as { dependencies: unknown }).dependencies, { database: 'up' });
});

test('a created service is persisted: a separate connection reads it back', { skip }, async () => {
  const { status, service } = await create(`${MARK} Family workspace`);
  assert.equal(status, 201);
  assert.equal(service.status, 'inactive');
  const other = createDatabase(TEST_URL ?? '');
  try {
    const row = await other.prisma.service.findUnique({ where: { id: service.id } });
    assert.equal(row?.name, `${MARK} Family workspace`);
    assert.equal(row?.status, 'inactive');
  } finally {
    await other.disconnect();
  }
});

test('activation persists, and only active services are public', { skip }, async () => {
  const { service } = await create(`${MARK} Research`);
  const publicIds = async () =>
    ((await (await fetch(`${server.baseUrl}/api/v1/services`)).json()) as { services: Array<{ id: string }> }).services.map((s) => s.id);
  assert.ok(!(await publicIds()).includes(service.id), 'inactive service must not be public');

  const res = await fetch(`${server.baseUrl}/api/v1/admin/services/${service.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...ADMIN_AUTH },
    body: JSON.stringify({ status: 'active', description: 'Updated description' }),
  });
  assert.equal(res.status, 200);
  const updated = ((await res.json()) as { service: AdminService }).service;
  assert.equal(updated.status, 'active');
  assert.ok(Date.parse(updated.updatedAt) >= Date.parse(updated.createdAt));
  assert.ok((await publicIds()).includes(service.id), 'active service must be public');
});

test('the admin list includes inactive services; unknown ids return 404', { skip }, async () => {
  const { service } = await create(`${MARK} Voices`);
  const list = await fetch(`${server.baseUrl}/api/v1/admin/services`, { headers: ADMIN_AUTH });
  const services = ((await list.json()) as { services: AdminService[] }).services;
  assert.ok(services.some((s) => s.id === service.id && s.status === 'inactive'));
  const missing = await fetch(`${server.baseUrl}/api/v1/admin/services/${crypto.randomUUID()}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...ADMIN_AUTH },
    body: JSON.stringify({ status: 'active' }),
  });
  assert.equal(missing.status, 404);
});

test('the database itself rejects invalid rows (CHECK constraints), even bypassing the API', { skip }, async () => {
  await assert.rejects(db.prisma.service.create({ data: { name: '   ', description: 'x' } }), (err: { code?: string }) => err.code === 'P2039');
  await assert.rejects(db.prisma.service.create({ data: { name: 'x'.repeat(121), description: 'x' } }), (err: { code?: string }) => err.code === 'P2039');
});

test('the runtime role is least-privilege: no DDL and no access to migration history', { skip }, async () => {
  await assert.rejects(db.prisma.$executeRawUnsafe('CREATE TABLE itest_should_not_exist (id int)'), /permission denied/i);
  await assert.rejects(db.prisma.$queryRawUnsafe('SELECT count(*) FROM "_prisma_migrations"'), /permission denied/i);
  const roles = await db.prisma.$queryRaw<Array<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>>`
    SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(roles, [{ rolsuper: false, rolcreatedb: false, rolcreaterole: false }]);
});

test('an unreachable database gives 503 on routes and readiness, without leaking details', { skip }, async () => {
  // Port 1 on loopback: nothing listens there, so the connection is refused.
  const down = createDatabase('postgresql://kulvriksh_app:not-a-real-password@127.0.0.1:1/kulvriksh_test');
  const log = captureLogger();
  const downServer = await startServer(
    createApp({ logger: log.logger, database: down.probe, services: createPrismaServiceRepository(down.prisma), readinessTimeoutMs: 3000 }),
  );
  try {
    const route = await fetch(`${downServer.baseUrl}/api/v1/services`);
    const routeText = await route.text();
    assert.equal(route.status, 503);
    assert.doesNotMatch(routeText, /127\.0\.0\.1|P1001|not-a-real-password/);
    const ready = await fetch(`${downServer.baseUrl}/ready`);
    assert.equal(ready.status, 503);
    assert.deepEqual(((await ready.json()) as { dependencies: unknown }).dependencies, { database: 'down' });
    assert.doesNotMatch(log.raw.join('\n'), /not-a-real-password/);
  } finally {
    await downServer.close();
    await down.disconnect();
  }
});
