// Admin overview, customers, roles & access and the genealogist profile against the real test
// database (`npm run test:db`). Counts are compared as deltas, because other test files may run
// at the same time. TASK-11.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AdminCustomerDetail, AdminCustomerSummary, AdminOverviewView, GenealogistProfileView, PermissionMatrixView } from '@kulvriksh/shared';
import { PERMISSIONS } from '../auth/authorize.ts';
import { cleanup, harness, skip, type Harness } from '../testing/sprint-harness.ts';

let h: Harness;

before(async () => {
  if (!skip) {
    h = await harness();
  }
});

after(async () => {
  if (!skip) {
    await h.close();
    await cleanup();
  }
});

type Err = { error: { code: string } };

test('overview: real counts that move with the data; admin only', { skip }, async () => {
  const admin = await h.staff('admin');
  const get = async () => (await h.api<{ overview: AdminOverviewView }>(admin.token, 'GET', '/admin/overview')).body.overview;
  const first = await get();
  const c = await h.customer();
  await h.api(c.token, 'POST', '/family', { name: 'Overview family' });
  await h.api(c.token, 'POST', '/family/members', { displayName: 'Counted person' });
  const second = await get();
  assert.ok(second.customers.total >= first.customers.total + 1);
  assert.ok(second.family.workspaces >= first.family.workspaces + 1);
  assert.ok(second.family.members >= first.family.members + 1);
  assert.equal(second.payments.provider, 'none');
  assert.ok(Array.isArray(second.orders.revenue));
  const g = await h.staff('genealogist');
  assert.equal((await h.api(g.token, 'GET', '/admin/overview')).status, 403);
  assert.equal((await h.api(c.token, 'GET', '/admin/overview')).status, 403);
  assert.equal((await h.api(undefined, 'GET', '/admin/overview')).status, 401);
});

test('customers: search by name or mobile digits, paginate, read details; other roles are refused', { skip }, async () => {
  const admin = await h.staff('admin');
  const a = await h.customer();
  const b = await h.customer();
  const tag = `Zed${Date.now().toString(36)}`;
  await h.api(a.token, 'PATCH', '/me/profile', { displayName: `${tag} Alpha` });
  await h.api(b.token, 'PATCH', '/me/profile', { displayName: `${tag} Beta` });
  await h.api(a.token, 'POST', '/family', { name: 'Alpha family' });
  const byName = await h.api<{ customers: AdminCustomerSummary[]; nextBefore: string | null }>(admin.token, 'GET', `/admin/customers?q=${tag}&limit=1`);
  assert.equal(byName.body.customers.length, 1);
  assert.ok(byName.body.nextBefore, 'a second page exists');
  const page2 = await h.api<{ customers: AdminCustomerSummary[] }>(admin.token, 'GET', `/admin/customers?q=${tag}&limit=1&before=${encodeURIComponent(byName.body.nextBefore!)}`);
  const both = [...byName.body.customers, ...page2.body.customers].map((x) => x.id).sort();
  assert.deepEqual(both, [a.userId, b.userId].sort());
  const row = byName.body.customers[0]!;
  assert.match(row.mobileMasked, /•/);
  // Mobile digits search.
  const mobile = (await h.db.prisma.customerProfile.findUnique({ where: { userId: a.userId }, select: { mobileNumber: true } }))!.mobileNumber;
  const byDigits = await h.api<{ customers: AdminCustomerSummary[] }>(admin.token, 'GET', `/admin/customers?q=${mobile.slice(-6)}`);
  assert.ok(byDigits.body.customers.some((x) => x.id === a.userId));
  // Detail: full contact details for admins, workspace, sessions and activity.
  const detail = await h.api<{ customer: AdminCustomerDetail }>(admin.token, 'GET', `/admin/customers/${a.userId}`);
  assert.equal(detail.body.customer.mobileNumber, mobile);
  assert.equal(detail.body.customer.workspace?.name, 'Alpha family');
  assert.equal(detail.body.customer.activeSessions, 1);
  assert.ok(detail.body.customer.recentActivity.some((x) => x.action === 'workspace.created'));
  assert.deepEqual(detail.body.customer.orders, []);
  // Unknown or staff ids are 404; customers and genealogists cannot use these routes.
  assert.equal((await h.api(admin.token, 'GET', `/admin/customers/${admin.userId}`)).status, 404);
  assert.equal((await h.api(admin.token, 'GET', '/admin/customers/not-a-uuid')).status, 404);
  const g = await h.staff('genealogist');
  assert.equal((await h.api<Err>(g.token, 'GET', `/admin/customers/${a.userId}`)).status, 403);
  assert.equal((await h.api<Err>(b.token, 'GET', `/admin/customers/${a.userId}`)).status, 403);
});

test('roles & access: the matrix is the one the API enforces; no route changes roles', { skip }, async () => {
  const admin = await h.staff('admin');
  const res = await h.api<{ access: PermissionMatrixView }>(admin.token, 'GET', '/admin/access');
  assert.equal(res.status, 200);
  assert.deepEqual(
    Object.fromEntries(res.body.access.permissions.map((p) => [p.key, p.roles])),
    Object.fromEntries(Object.entries(PERMISSIONS).map(([k, v]) => [k, [...v]])),
  );
  assert.ok(res.body.access.permissions.every((p) => p.description.length > 10));
  assert.ok(res.body.access.policies.some((p) => p.decision === 'R35'));
  const g = await h.staff('genealogist');
  assert.equal((await h.api(g.token, 'GET', '/admin/access')).status, 403);
  // There is no role-changing endpoint: an attempt to PATCH a staff role does not exist.
  for (const [method, path] of [['PATCH', `/admin/staff/${g.userId}`], ['POST', `/admin/staff/${g.userId}/role`], ['PATCH', `/admin/customers/${g.userId}`]] as const) {
    assert.equal((await h.api(admin.token, method, path, { role: 'admin' })).status, 404, `${method} ${path}`);
  }
  assert.equal((await h.db.prisma.appUser.findUnique({ where: { id: g.userId }, select: { role: true } }))?.role, 'genealogist');
});

test('genealogist profile: their own real data only', { skip }, async () => {
  const g = await h.staff('genealogist');
  const res = await h.api<{ profile: GenealogistProfileView }>(g.token, 'GET', '/genealogist/profile');
  assert.equal(res.status, 200);
  assert.equal(res.body.profile.email, g.email);
  assert.deepEqual([res.body.profile.activeAssignments, res.body.profile.mfaEnabled], [0, false]);
  const admin = await h.staff('admin');
  assert.equal((await h.api(admin.token, 'GET', '/genealogist/profile')).status, 403);
});

test('notifications overview: real delivery status, no message content; candidate events awaiting R36; admin only', { skip }, async () => {
  const admin = await h.staff('admin');
  const res = await h.api<{ notifications: { events: Array<{ eventKey: string; status: string; channels: string[] }>; providers: Record<string, string>; counts: unknown[]; recent: Array<Record<string, unknown>> } }>(admin.token, 'GET', '/admin/notifications');
  assert.equal(res.status, 200);
  const released = res.body.notifications.events.find((e) => e.eventKey === 'report.released')!;
  assert.deepEqual([released.status, released.channels], ['active', ['in_app']]);
  assert.ok(res.body.notifications.events.filter((e) => e.eventKey !== 'report.released').every((e) => e.status === 'awaiting_decision' && e.channels.length === 0));
  assert.deepEqual(res.body.notifications.providers, { email: 'none', sms: 'none' });
  for (const row of res.body.notifications.recent) {
    assert.ok(!('title' in row) && !('body' in row) && !('recipientAddress' in row), 'no content or addresses');
  }
  const g = await h.staff('genealogist');
  assert.equal((await h.api(g.token, 'GET', '/admin/notifications')).status, 403);
});
