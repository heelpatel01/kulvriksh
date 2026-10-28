// Staff sign-in, role-based authorisation, assignments, research records, reports and audit,
// against the real test database (`npm run test:db`).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AssignmentView, ReportView, ResearchRecordView } from '@kulvriksh/shared';
import { cleanup, harness, skip, STAFF_PASSWORD, trackEmail, type Harness } from '../testing/sprint-harness.ts';

let h: Harness;

before(async () => {
  if (!skip) {
    h = await harness({ settings: { staffFailureLimit: 3 } });
  }
});

after(async () => {
  if (!skip) {
    await h.close();
    await cleanup();
  }
});

type Err = { error: { code: string } };

/** A customer with a workspace and two members, an admin, and a genealogist assigned to it. */
async function scenario() {
  const customer = await h.customer();
  const ws = await h.api<{ workspace: { id: string } }>(customer.token, 'POST', '/family', { name: 'Research family' });
  await h.api(customer.token, 'POST', '/family/members', { displayName: 'Great-grandfather' });
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  const assigned = await h.api<{ assignment: AssignmentView }>(admin.token, 'POST', '/admin/assignments', {
    workspaceId: ws.body.workspace.id,
    genealogistId: genealogist.userId,
  });
  assert.equal(assigned.status, 201);
  return { customer, admin, genealogist, workspaceId: ws.body.workspace.id, assignmentId: assigned.body.assignment.id };
}

test('staff sign-in: one generic failure for unknown email and wrong password; no staff from customer data', { skip }, async () => {
  const g = await h.staff('genealogist', { signIn: false });
  const wrong = await h.api<Err>(undefined, 'POST', '/staff/auth/sign-in', { email: g.email, password: 'wrong password!!' });
  const nobody = trackEmail(`nobody-${crypto.randomUUID().slice(0, 8)}@example.test`);
  const unknown = await h.api<Err>(undefined, 'POST', '/staff/auth/sign-in', { email: nobody, password: 'wrong password!!' });
  assert.equal(wrong.status, 400);
  assert.deepEqual([wrong.body.error.code, unknown.status, unknown.body.error.code], ['INVALID_CREDENTIALS', 400, 'INVALID_CREDENTIALS']);
  const ok = await h.api<{ user: { role: string } }>(undefined, 'POST', '/staff/auth/sign-in', { email: g.email.toUpperCase(), password: STAFF_PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'genealogist');
  // AS-ADM-01: no public route creates staff; the customer OTP routes only ever create customers.
  for (const path of ['/staff', '/staff/auth/register', '/admin/staff', '/admin/genealogists']) {
    assert.notEqual((await h.api(undefined, 'POST', path, { email: 'x@example.test', role: 'admin' })).status, 201);
  }
  const hash = (await h.db.prisma.staffCredential.findUniqueOrThrow({ where: { email: g.email } })).passwordHash ?? '';
  assert.match(hash, /^scrypt\$15\$8\$1\$/);
  assert.ok(!hash.includes(STAFF_PASSWORD));
});

test('staff lockout: repeated wrong passwords lock the account, even the right password then fails', { skip }, async () => {
  const g = await h.staff('genealogist', { signIn: false });
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await h.api(undefined, 'POST', '/staff/auth/sign-in', { email: g.email, password: 'not the password' })).status, 400);
  }
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/sign-in', { email: g.email, password: 'not the password' })).status, 429);
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/sign-in', { email: g.email, password: STAFF_PASSWORD })).status, 429);
  const failures = await h.db.prisma.auditEvent.count({ where: { action: 'auth.staff_sign_in_failed', outcome: 'failure' } });
  assert.ok(failures >= 4);
});

test('deny by default across roles: anonymous 401, customer/genealogist/admin only reach their own routes', { skip }, async () => {
  const { customer, admin, genealogist, workspaceId } = await scenario();
  const adminRoutes = ['/admin/services', '/admin/workspaces', '/admin/assignments', '/admin/reports', '/admin/audit', '/admin/genealogists'];
  const genealogistRoutes = ['/genealogist/cases', `/genealogist/cases/${workspaceId}`, `/genealogist/cases/${workspaceId}/records`];
  for (const path of [...adminRoutes, ...genealogistRoutes]) {
    assert.equal((await h.api(undefined, 'GET', path)).status, 401, `anonymous ${path}`);
    assert.equal((await h.api(customer.token, 'GET', path)).status, 403, `customer ${path}`); // AS-GEN-01
  }
  for (const path of adminRoutes) {
    assert.equal((await h.api(genealogist.token, 'GET', path)).status, 403, `genealogist ${path}`);
    assert.equal((await h.api(admin.token, 'GET', path)).status, 200, `admin ${path}`);
  }
  for (const path of genealogistRoutes) {
    assert.equal((await h.api(admin.token, 'GET', path)).status, 403, `admin ${path}`);
    assert.equal((await h.api(genealogist.token, 'GET', path)).status, 200, `genealogist ${path}`);
  }
  // Staff tokens cannot use customer routes.
  for (const token of [admin.token, genealogist.token]) {
    assert.equal((await h.api(token, 'GET', '/family/tree')).status, 403);
    assert.equal((await h.api(token, 'GET', '/reports')).status, 403);
  }
});

test('revoked staff session: logout ends access on the next request', { skip }, async () => {
  const admin = await h.staff('admin');
  assert.equal((await h.api(admin.token, 'GET', '/staff/auth/session')).status, 200);
  assert.equal((await h.api(admin.token, 'POST', '/auth/logout')).status, 204);
  assert.equal((await h.api(admin.token, 'GET', '/admin/workspaces')).status, 401);
});

test('AS-ADM-03: deactivating a genealogist revokes their sessions and blocks sign-in and assignment', { skip }, async () => {
  const { admin, genealogist, workspaceId } = await scenario();
  const res = await h.api<{ revokedSessions: number }>(admin.token, 'POST', `/admin/genealogists/${genealogist.userId}/deactivate`);
  assert.equal(res.status, 200);
  assert.equal(res.body.revokedSessions, 1);
  assert.equal((await h.api(genealogist.token, 'GET', '/genealogist/cases')).status, 401);
  const again = await h.api<Err>(undefined, 'POST', '/staff/auth/sign-in', { email: genealogist.email, password: STAFF_PASSWORD });
  assert.equal(again.status, 403);
  const other = await h.customer();
  const ws2 = await h.api<{ workspace: { id: string } }>(other.token, 'POST', '/family', { name: 'Other' });
  const assign = await h.api<Err>(admin.token, 'POST', '/admin/assignments', { workspaceId: ws2.body.workspace.id, genealogistId: genealogist.userId });
  assert.equal(assign.body.error.code, 'INVALID_GENEALOGIST');
  assert.equal((await h.api(admin.token, 'POST', `/admin/genealogists/${genealogist.userId}/reactivate`)).status, 200);
  // Admins cannot use this route to change another admin or a customer.
  assert.equal((await h.api(admin.token, 'POST', `/admin/genealogists/${admin.userId}/deactivate`)).status, 404);
  assert.ok(workspaceId);
});

test('assignments: one active genealogist per family, concurrent assigns give one 201 and one 409', { skip }, async () => {
  const customer = await h.customer();
  const ws = await h.api<{ workspace: { id: string } }>(customer.token, 'POST', '/family', { name: 'Contested family' });
  const admin = await h.staff('admin');
  const [g1, g2] = [await h.staff('genealogist'), await h.staff('genealogist')];
  const results = await Promise.all(
    [g1, g2].map((g) => h.api(admin.token, 'POST', '/admin/assignments', { workspaceId: ws.body.workspace.id, genealogistId: g.userId })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await h.api<Err>(admin.token, 'POST', '/admin/assignments', { workspaceId: crypto.randomUUID(), genealogistId: g1.userId })).status, 422);
  assert.equal((await h.api(admin.token, 'POST', '/admin/assignments', { workspaceId: ws.body.workspace.id, genealogistId: admin.userId })).status, 422);
});

test('AS-GEN-02/03/04: only assigned families are visible; unassignment removes access on the next request', { skip }, async () => {
  const { admin, genealogist, workspaceId, assignmentId } = await scenario();
  const outsider = await h.staff('genealogist');
  const cases = await h.api<{ cases: Array<{ workspaceId: string }> }>(genealogist.token, 'GET', '/genealogist/cases');
  assert.deepEqual(cases.body.cases.map((c) => c.workspaceId), [workspaceId]);
  const detail = await h.api<{ case: { members: unknown[] } }>(genealogist.token, 'GET', `/genealogist/cases/${workspaceId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.case.members.length, 1);
  assert.ok(!JSON.stringify(detail.body).includes('+91'), 'no customer contact details (FQ-26)');
  assert.equal((await h.api(outsider.token, 'GET', `/genealogist/cases/${workspaceId}`)).status, 404);
  assert.equal((await h.api(outsider.token, 'POST', `/genealogist/cases/${workspaceId}/records`, { kind: 'note', body: 'x' })).status, 404);
  assert.equal((await h.api(genealogist.token, 'GET', `/genealogist/cases/${crypto.randomUUID()}`)).status, 404);

  const record = await h.api<{ record: ResearchRecordView }>(genealogist.token, 'POST', `/genealogist/cases/${workspaceId}/records`, {
    kind: 'source',
    body: 'Bhuj register, 1921',
  });
  assert.equal(record.status, 201);
  assert.equal((await h.api(admin.token, 'POST', `/admin/assignments/${assignmentId}/remove`)).status, 200);
  assert.equal((await h.api(admin.token, 'POST', `/admin/assignments/${assignmentId}/remove`)).status, 404, 'already removed');
  assert.equal((await h.api(genealogist.token, 'GET', `/genealogist/cases/${workspaceId}`)).status, 404);
  assert.equal((await h.api(genealogist.token, 'GET', `/genealogist/cases/${workspaceId}/records`)).status, 404);
  const late = await h.api(genealogist.token, 'PATCH', `/genealogist/cases/${workspaceId}/records/${record.body.record.id}`, {
    body: 'changed after removal',
    version: 1,
  });
  assert.equal(late.status, 404);
  // Records are kept for history (F-GEN-03).
  assert.equal((await h.db.prisma.researchRecord.findUniqueOrThrow({ where: { id: record.body.record.id } })).body, 'Bhuj register, 1921');
  assert.deepEqual((await h.api<{ cases: unknown[] }>(genealogist.token, 'GET', '/genealogist/cases')).body.cases, []);
});

test('research records: versioned updates (409 on a stale version), audited with the genealogist', { skip }, async () => {
  const { genealogist, workspaceId } = await scenario();
  const base = `/genealogist/cases/${workspaceId}/records`;
  const created = await h.api<{ record: ResearchRecordView }>(genealogist.token, 'POST', base, { kind: 'note', body: 'First note' });
  const id = created.body.record.id;
  const results = await Promise.all(
    ['A', 'B'].map((v) => h.api(genealogist.token, 'PATCH', `${base}/${id}`, { body: `Edit ${v}`, version: 1 })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await h.api(genealogist.token, 'POST', base, { kind: 'rumour', body: 'x' })).status, 400);
  assert.equal((await h.api(genealogist.token, 'POST', base, { kind: 'note', body: 'x'.repeat(5001) })).status, 400);
  const events = await h.db.prisma.auditEvent.findMany({ where: { targetId: id }, orderBy: { id: 'asc' } });
  assert.deepEqual(events.map((e) => [e.action, e.actorUserId, e.actorRole]), [
    ['research_record.created', genealogist.userId, 'genealogist'],
    ['research_record.updated', genealogist.userId, 'genealogist'],
  ]);
});

test('reports: draft → submitted → returned → resubmitted → released; customer sees only the released one', { skip }, async () => {
  const { customer, admin, genealogist, workspaceId } = await scenario();
  const base = `/genealogist/cases/${workspaceId}/reports`;
  const draft = await h.api<{ report: ReportView }>(genealogist.token, 'POST', base, { title: 'Mehta line', body: '' });
  assert.equal(draft.status, 201);
  const id = draft.body.report.id;
  assert.equal((await h.api<Err>(genealogist.token, 'POST', `${base}/${id}/submit`)).body.error.code, 'REPORT_INCOMPLETE');
  await h.api(genealogist.token, 'PATCH', `${base}/${id}`, { title: 'Mehta line', body: 'Findings…', version: 1 });

  // AS-GEN-08: submitting twice produces one transition.
  const submits = await Promise.all([1, 2].map(() => h.api<{ changed: boolean }>(genealogist.token, 'POST', `${base}/${id}/submit`)));
  assert.deepEqual(submits.map((s) => [s.status, s.body.changed]).sort(), [[200, false], [200, true]]);
  assert.equal(await h.db.prisma.auditEvent.count({ where: { targetId: id, action: 'report.submitted' } }), 1);
  assert.equal((await h.api(genealogist.token, 'PATCH', `${base}/${id}`, { title: 'x', body: 'y', version: 3 })).status, 409, 'not editable');
  // AS-GEN-07: a submitted report is not visible to the customer.
  assert.deepEqual((await h.api<{ reports: unknown[] }>(customer.token, 'GET', '/reports')).body.reports, []);

  assert.equal((await h.api(admin.token, 'POST', `/admin/reports/${id}/return`, {})).status, 400, 'reason required');
  const returned = await h.api<{ report: ReportView }>(admin.token, 'POST', `/admin/reports/${id}/return`, { reason: 'Add sources' });
  assert.equal(returned.body.report.status, 'returned');
  assert.equal(returned.body.report.returnReason, 'Add sources');
  assert.equal((await h.api(admin.token, 'POST', `/admin/reports/${id}/release`)).status, 409, 'only submitted reports release');
  const current = (await h.api<{ reports: ReportView[] }>(genealogist.token, 'GET', base)).body.reports[0]!;
  await h.api(genealogist.token, 'PATCH', `${base}/${id}`, { title: 'Mehta line', body: 'Findings with sources', version: current.version });
  await h.api(genealogist.token, 'POST', `${base}/${id}/submit`);
  assert.equal(await h.db.prisma.auditEvent.count({ where: { targetId: id, action: 'report.resubmitted' } }), 1);

  const queue = await h.api<{ reports: ReportView[] }>(admin.token, 'GET', '/admin/reports?status=submitted');
  assert.ok(queue.body.reports.some((r) => r.id === id));
  // AS-REP-04: releasing twice (even concurrently) makes one transition.
  const releases = await Promise.all([1, 2].map(() => h.api<{ report: ReportView }>(admin.token, 'POST', `/admin/reports/${id}/release`)));
  assert.deepEqual(releases.map((r) => [r.status, r.body.report.status]), [[200, 'released'], [200, 'released']]);
  assert.equal(await h.db.prisma.auditEvent.count({ where: { targetId: id, action: 'report.released' } }), 1);
  const visible = await h.api<{ reports: ReportView[] }>(customer.token, 'GET', '/reports');
  assert.deepEqual(visible.body.reports.map((r) => [r.id, r.status]), [[id, 'released']]);
  // Another customer never sees it.
  const stranger = await h.customer();
  assert.deepEqual((await h.api<{ reports: unknown[] }>(stranger.token, 'GET', '/reports')).body.reports, []);
});

test('audit: admins can read, others cannot; the runtime role cannot change or delete audit rows', { skip }, async () => {
  const { customer, admin, genealogist } = await scenario();
  const page = await h.api<{ events: Array<{ action: string; details: unknown }> }>(admin.token, 'GET', '/admin/audit?action=assignment.&limit=5');
  assert.equal(page.status, 200);
  assert.ok(page.body.events.length >= 1 && page.body.events.every((e) => e.action.startsWith('assignment.')));
  assert.equal((await h.api(genealogist.token, 'GET', '/admin/audit')).status, 403);
  assert.equal((await h.api(customer.token, 'GET', '/admin/audit')).status, 403);
  await assert.rejects(h.db.prisma.$executeRaw`UPDATE audit_event SET action = 'x.y' WHERE id = (SELECT max(id) FROM audit_event)`, /permission denied/i);
  await assert.rejects(h.db.prisma.$executeRaw`DELETE FROM audit_event WHERE id = (SELECT max(id) FROM audit_event)`, /permission denied/i);
  // No secret or full number ever reaches audit details.
  const all = await h.db.prisma.auditEvent.findMany({ orderBy: { id: 'desc' }, take: 500 });
  const text = JSON.stringify(all.map((e) => e.details));
  assert.ok(!text.includes(STAFF_PASSWORD) && !/\+91\d{10}/.test(text) && !/scrypt\$/.test(text));
});

test('fail closed: an unreachable database gives 503 on staff and research routes', { skip }, async () => {
  const { createDatabase } = await import('../db.ts');
  const { createApp } = await import('../app.ts');
  const { createAuthService } = await import('../auth/auth-service.ts');
  const { createPrismaAuthStore } = await import('../auth/auth-store.ts');
  const { createPrismaResearchStore } = await import('../research/research-store.ts');
  const { DEFAULT_AUTH_SETTINGS } = await import('../auth/auth-config.ts');
  const { startServer, testToken } = await import('../testing/helpers.ts');
  const down = createDatabase('postgresql://nobody:nothing@127.0.0.1:1/none');
  const auth = createAuthService({
    store: createPrismaAuthStore(down.prisma),
    settings: DEFAULT_AUTH_SETTINGS,
    otpHmacKey: 'k'.repeat(40),
    rateLimitHmacKey: 'r'.repeat(40),
    logger: h.captured.logger,
  });
  const server = await startServer(createApp({ logger: h.captured.logger, auth, research: createPrismaResearchStore(down.prisma) }));
  try {
    const res = await fetch(`${server.baseUrl}/api/v1/genealogist/cases`, { headers: { authorization: `Bearer ${testToken('any')}` } });
    assert.equal(res.status, 503);
    assert.doesNotMatch(await res.text(), /127\.0\.0\.1|P2010|nobody/);
  } finally {
    await server.close();
    await down.disconnect();
  }
});
