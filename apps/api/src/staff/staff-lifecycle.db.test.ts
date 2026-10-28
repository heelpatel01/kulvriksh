// Staff account lifecycle against the real test database (`npm run test:db`): admin-created
// accounts and setup links, privilege-escalation guards, deactivation, resets, password changes,
// self-service reset, TOTP enrolment and sign-in, MFA policy, and the bootstrap command.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { StaffAccountView, StaffLinkIssued } from '@kulvriksh/shared';
import { cleanup, harness, skip, STAFF_PASSWORD, TEST_URL, trackEmail, trackUser, type Harness } from '../testing/sprint-harness.ts';
import { currentStep, totpAt } from './totp.ts';

let h: Harness;
let strict: Harness; // STAFF_MFA=required_admins, admins may manage admins
const NEW_PASSWORD = 'a much better passphrase 2026';

before(async () => {
  if (!skip) {
    h = await harness();
    strict = await harness({ settings: { staffMfaPolicy: 'required_admins', staffAdminsMayManageAdmins: true } });
  }
});

after(async () => {
  if (!skip) {
    await h.close();
    await strict.close();
    await cleanup();
  }
});

type Err = { error: { code: string } };
const email = () => trackEmail(`itest-${crypto.randomUUID().slice(0, 8)}@example.test`);

async function createGenealogist(adminToken: string, target = h) {
  const address = email();
  const res = await target.api<{ account: StaffAccountView; link: StaffLinkIssued }>(adminToken, 'POST', '/admin/staff', {
    email: address,
    displayName: 'Invited genealogist',
    role: 'genealogist',
  });
  assert.equal(res.status, 201);
  trackUser(res.body.account.id, address);
  return { email: address, ...res.body };
}

const signIn = (target: Harness, address: string, password: string) =>
  target.api<{ session?: { token: string }; mfa?: string; challengeToken?: string } & Partial<Err>>(undefined, 'POST', '/staff/auth/sign-in', {
    email: address,
    password,
  });

test('admin creates a genealogist: no password until the one-time setup link is used, once', { skip }, async () => {
  const admin = await h.staff('admin');
  const created = await createGenealogist(admin.token);
  assert.equal(created.account.passwordSet, false);
  assert.match(created.link.token, /^[A-Za-z0-9_-]{43}$/);
  // No default password: nothing works before setup.
  assert.equal((await signIn(h, created.email, '')).status, 400);
  assert.equal((await signIn(h, created.email, 'anything at all 123')).body.error?.code, 'INVALID_CREDENTIALS');
  // The token is stored only as a hash.
  const rows = await h.db.prisma.staffToken.findMany({ where: { userId: created.account.id } });
  assert.ok(rows.every((r) => r.tokenHash !== created.link.token && /^[0-9a-f]{64}$/.test(r.tokenHash)));
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/password/complete', { token: created.link.token, password: 'short' })).status, 400);
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/password/complete', { token: created.link.token, password: NEW_PASSWORD })).status, 204);
  const reuse = await h.api<Err>(undefined, 'POST', '/staff/auth/password/complete', { token: created.link.token, password: NEW_PASSWORD });
  assert.equal(reuse.body.error.code, 'INVALID_LINK');
  assert.equal((await signIn(h, created.email, NEW_PASSWORD)).status, 200);
  assert.equal((await h.api(admin.token, 'POST', '/admin/staff', { email: created.email, displayName: 'Dup', role: 'genealogist' })).status, 409);
});

test('privilege escalation: no role changes, no admin creation (R33 default), no self-management', { skip }, async () => {
  const admin = await h.staff('admin');
  const other = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  assert.equal((await h.api<Err>(admin.token, 'POST', '/admin/staff', { email: email(), displayName: 'X', role: 'admin' })).status, 403);
  assert.equal((await h.api(admin.token, 'POST', '/admin/staff', { email: email(), displayName: 'X', role: 'customer' })).status, 400);
  const withPermissions = await h.api(admin.token, 'POST', '/admin/staff', { email: email(), displayName: 'X', role: 'genealogist', permissions: ['audit.read'] });
  assert.equal(withPermissions.status, 400);
  // There is no route that changes a role.
  for (const method of ['PATCH', 'PUT']) {
    assert.equal((await h.api(admin.token, method, `/admin/staff/${genealogist.userId}`, { role: 'admin' })).status, 404);
  }
  assert.equal((await h.api(admin.token, 'POST', `/admin/staff/${admin.userId}/deactivate`)).status, 403, 'not self');
  assert.equal((await h.api(admin.token, 'POST', `/admin/staff/${other.userId}/deactivate`)).status, 403, 'not another admin');
  assert.equal((await h.api(admin.token, 'POST', `/admin/staff/${other.userId}/password-link`)).status, 403);
  for (const token of [genealogist.token, undefined]) {
    assert.equal((await h.api(token, 'GET', '/admin/staff')).status, token ? 403 : 401);
    assert.equal((await h.api(token, 'POST', '/admin/staff', { email: email(), displayName: 'X', role: 'genealogist' })).status, token ? 403 : 401);
  }
  const roles = await h.db.prisma.appUser.findMany({ where: { id: { in: [genealogist.userId, other.userId] } }, select: { role: true } });
  assert.deepEqual(new Set(roles.map((r) => r.role)), new Set(['genealogist', 'admin']));
});

test('with STAFF_ADMINS_MAY_MANAGE_ADMINS an admin can create another admin, never act on themselves', { skip }, async () => {
  const admin = await strict.staff('admin', { signIn: false });
  // required_admins: enrol first, then act.
  const first = await signIn(strict, admin.email, STAFF_PASSWORD);
  assert.equal(first.body.mfa, 'enrolment_required');
  const start = await strict.api<{ enrolment: { secret: string } }>(undefined, 'POST', '/staff/auth/mfa/enrol/start', { challengeToken: first.body.challengeToken });
  const code = totpAt(start.body.enrolment.secret, currentStep());
  const confirmed = await strict.api<{ session: { token: string } }>(undefined, 'POST', '/staff/auth/mfa/enrol/confirm', { challengeToken: first.body.challengeToken, code });
  assert.equal(confirmed.status, 200);
  const token = confirmed.body.session.token;
  const address = email();
  const res = await strict.api<{ account: StaffAccountView }>(token, 'POST', '/admin/staff', { email: address, displayName: 'Second admin', role: 'admin' });
  assert.equal(res.status, 201);
  trackUser(res.body.account.id, address);
  assert.equal((await strict.api(token, 'POST', `/admin/staff/${admin.userId}/deactivate`)).status, 403, 'still not self');
});

test('deactivation revokes sessions at once; reactivation restores sign-in; no links for deactivated accounts', { skip }, async () => {
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  const res = await h.api<{ revokedSessions: number }>(admin.token, 'POST', `/admin/staff/${genealogist.userId}/deactivate`);
  assert.equal(res.body.revokedSessions, 1);
  assert.equal((await h.api(genealogist.token, 'GET', '/genealogist/cases')).status, 401);
  assert.equal((await h.api(admin.token, 'POST', `/admin/staff/${genealogist.userId}/password-link`)).status, 409);
  assert.equal((await signIn(h, genealogist.email, STAFF_PASSWORD)).status, 403);
  assert.equal((await h.api(admin.token, 'POST', `/admin/staff/${genealogist.userId}/reactivate`)).status, 200);
  assert.equal((await signIn(h, genealogist.email, STAFF_PASSWORD)).status, 200);
  const events = await h.db.prisma.auditEvent.findMany({ where: { targetId: genealogist.userId, action: { startsWith: 'genealogist.' } }, orderBy: { id: 'asc' } });
  assert.deepEqual(events.map((e) => e.action), ['genealogist.deactivated', 'genealogist.reactivated']);
});

test('admin-issued reset: the old password and every session stop immediately; the link sets a new one', { skip }, async () => {
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  const res = await h.api<{ link: StaffLinkIssued; cleared: boolean }>(admin.token, 'POST', `/admin/staff/${genealogist.userId}/password-link`);
  assert.equal(res.body.cleared, true);
  assert.equal((await h.api(genealogist.token, 'GET', '/genealogist/cases')).status, 401);
  assert.equal((await signIn(h, genealogist.email, STAFF_PASSWORD)).body.error?.code, 'INVALID_CREDENTIALS');
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/password/complete', { token: res.body.link.token, password: NEW_PASSWORD })).status, 204);
  assert.equal((await signIn(h, genealogist.email, NEW_PASSWORD)).status, 200);
});

test('password change: needs the current password; other sessions end, this one stays', { skip }, async () => {
  const genealogist = await h.staff('genealogist');
  const second = await signIn(h, genealogist.email, STAFF_PASSWORD);
  assert.equal((await h.api(genealogist.token, 'POST', '/staff/me/password', { currentPassword: 'wrong password!', newPassword: NEW_PASSWORD })).status, 400);
  assert.equal((await h.api(genealogist.token, 'POST', '/staff/me/password', { currentPassword: STAFF_PASSWORD, newPassword: 'short' })).status, 400);
  const changed = await h.api<{ revokedSessions: number }>(genealogist.token, 'POST', '/staff/me/password', { currentPassword: STAFF_PASSWORD, newPassword: NEW_PASSWORD });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.revokedSessions, 1);
  assert.equal((await h.api(genealogist.token, 'GET', '/staff/auth/session')).status, 200, 'current session kept');
  assert.equal((await h.api(second.body.session!.token, 'GET', '/staff/auth/session')).status, 401, 'other session revoked');
  assert.equal((await signIn(h, genealogist.email, STAFF_PASSWORD)).body.error?.code, 'INVALID_CREDENTIALS');
  assert.equal((await signIn(h, genealogist.email, NEW_PASSWORD)).status, 200);
});

test('self-service reset: same answer for unknown emails; links are superseded and expire', { skip }, async () => {
  const genealogist = await h.staff('genealogist');
  const unknown = await h.api(undefined, 'POST', '/staff/auth/password/reset-request', { email: email() });
  const known = await h.api(undefined, 'POST', '/staff/auth/password/reset-request', { email: genealogist.email });
  assert.deepEqual([unknown.status, unknown.body], [known.status, known.body]);
  const delivered = h.staffOutbox.read(genealogist.email);
  assert.ok(delivered);
  // Requesting a reset does not lock the person out until the link is used.
  assert.equal((await signIn(h, genealogist.email, STAFF_PASSWORD)).status, 200);
  await h.api(undefined, 'POST', '/staff/auth/password/reset-request', { email: genealogist.email });
  const fresh = h.staffOutbox.read(genealogist.email)!;
  await h.db.prisma.$executeRaw`UPDATE staff_token SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second'
    WHERE user_id = ${genealogist.userId}::uuid AND purpose = 'reset' AND used_at IS NULL`;
  assert.equal((await h.api<Err>(undefined, 'POST', '/staff/auth/password/complete', { token: fresh.token, password: NEW_PASSWORD })).body.error.code, 'INVALID_LINK', 'expired');
  assert.equal((await h.api<Err>(undefined, 'POST', '/staff/auth/password/complete', { token: delivered.token, password: NEW_PASSWORD })).body.error.code, 'INVALID_LINK', 'superseded');
});

test('TOTP: enrol while signed in; then sign-in needs a code; replays and too many attempts fail', { skip }, async () => {
  const genealogist = await h.staff('genealogist');
  const start = await h.api<{ enrolment: { secret: string; otpauthUri: string } }>(genealogist.token, 'POST', '/staff/me/mfa/start');
  assert.equal(start.status, 200);
  assert.match(start.body.enrolment.otpauthUri, /^otpauth:\/\/totp\//);
  const stored = await h.db.prisma.staffMfa.findUniqueOrThrow({ where: { userId: genealogist.userId } });
  assert.ok(!stored.secretCiphertext.includes(start.body.enrolment.secret), 'secret stored encrypted');
  const secret = start.body.enrolment.secret;
  assert.equal((await h.api(genealogist.token, 'POST', '/staff/me/mfa/confirm', { code: '000000' })).status, 400);
  const firstCode = totpAt(secret, currentStep());
  assert.equal((await h.api(genealogist.token, 'POST', '/staff/me/mfa/confirm', { code: firstCode })).status, 200);

  const challenge = await signIn(h, genealogist.email, STAFF_PASSWORD);
  assert.equal(challenge.body.mfa, 'required');
  assert.equal(challenge.body.session, undefined, 'no session from the password alone');
  // The code used for enrolment cannot be replayed.
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/mfa', { challengeToken: challenge.body.challengeToken, code: firstCode })).status, 400);
  const nextCode = totpAt(secret, currentStep() + 1);
  const ok = await h.api<{ session: { token: string } }>(undefined, 'POST', '/staff/auth/mfa', { challengeToken: challenge.body.challengeToken, code: nextCode });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.session.token);
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/mfa', { challengeToken: challenge.body.challengeToken, code: nextCode })).status, 400, 'challenge used');

  // Attempt limit: after 5 wrong codes on a challenge even a right one fails.
  const again = await signIn(h, genealogist.email, STAFF_PASSWORD);
  for (let i = 0; i < 5; i += 1) {
    await h.api(undefined, 'POST', '/staff/auth/mfa', { challengeToken: again.body.challengeToken, code: '123456' });
  }
  assert.equal((await h.api(undefined, 'POST', '/staff/auth/mfa', { challengeToken: again.body.challengeToken, code: totpAt(secret, currentStep()) })).status, 400);
  const open = await h.db.prisma.staffToken.findFirstOrThrow({ where: { userId: genealogist.userId, purpose: 'mfa_challenge', usedAt: null } });
  assert.equal(open.attemptCount, 5);

  // An admin can reset a lost factor for a genealogist.
  const admin = await h.staff('admin');
  assert.deepEqual((await h.api(admin.token, 'POST', `/admin/staff/${genealogist.userId}/mfa/reset`)).body, { removed: true });
  assert.ok((await signIn(h, genealogist.email, STAFF_PASSWORD)).body.session, 'optional policy: password only once the factor is removed');
});

test('STAFF_MFA=required_admins: an admin never gets a session from a password alone and cannot turn MFA off', { skip }, async () => {
  const admin = await strict.staff('admin', { signIn: false });
  const genealogist = await strict.staff('genealogist');
  assert.ok(genealogist.token, 'genealogists are not affected by required_admins');
  const first = await signIn(strict, admin.email, STAFF_PASSWORD);
  assert.equal(first.body.mfa, 'enrolment_required');
  assert.equal(first.body.session, undefined);
  assert.equal((await strict.api(undefined, 'POST', '/staff/auth/mfa', { challengeToken: first.body.challengeToken, code: '000000' })).status, 400);
  const start = await strict.api<{ enrolment: { secret: string } }>(undefined, 'POST', '/staff/auth/mfa/enrol/start', { challengeToken: first.body.challengeToken });
  const done = await strict.api<{ session: { token: string } }>(undefined, 'POST', '/staff/auth/mfa/enrol/confirm', {
    challengeToken: first.body.challengeToken,
    code: totpAt(start.body.enrolment.secret, currentStep()),
  });
  assert.equal(done.status, 200);
  const disable = await strict.api(done.body.session.token, 'POST', '/staff/me/mfa/disable', { code: totpAt(start.body.enrolment.secret, currentStep() + 1) });
  assert.equal(disable.status, 403);
  const status = await strict.api<{ enabled: boolean; required: boolean }>(done.body.session.token, 'GET', '/staff/me/mfa');
  assert.deepEqual([status.body.enabled, status.body.required], [true, true]);
  assert.equal((await signIn(strict, admin.email, STAFF_PASSWORD)).body.mfa, 'required');
});

test('no credential, token, hash or TOTP secret reaches logs or audit details', { skip }, async () => {
  const log = [h.captured.raw.join('\n'), strict.captured.raw.join('\n')].join('\n');
  assert.ok(!log.includes(STAFF_PASSWORD) && !log.includes(NEW_PASSWORD) && !/scrypt\$/.test(log));
  const tokens = await h.db.prisma.staffToken.findMany({ select: { tokenHash: true }, take: 200 });
  assert.ok(tokens.every((t) => !log.includes(t.tokenHash)));
  const details = JSON.stringify((await h.db.prisma.auditEvent.findMany({ where: { action: { startsWith: 'staff.' } }, take: 500 })).map((e) => e.details));
  assert.ok(!details.includes(STAFF_PASSWORD) && !/[A-Za-z0-9_-]{43}/.test(details));
});

test('bootstrap command: refuses without --confirm and while an active admin exists', { skip }, async () => {
  await h.staff('admin', { signIn: false }); // guarantees an active admin in the test database
  const run = (args: string[]) =>
    spawnSync(process.execPath, [join(import.meta.dirname, '..', 'tools', 'bootstrap-admin.ts'), ...args], {
      env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: TEST_URL, OTP_DELIVERY: '', ADMIN_PREVIEW_TOKEN: '', DEV_STAFF_PROVISIONING: '' },
      encoding: 'utf8',
    });
  const noConfirm = run(['--email', 'boot@example.test', '--name', 'Boot']);
  assert.equal(noConfirm.status, 2);
  assert.match(noConfirm.stderr, /--confirm/);
  const exists = run(['--email', 'boot@example.test', '--name', 'Boot', '--confirm']);
  assert.equal(exists.status, 2);
  assert.match(exists.stderr, /already exists/);
  assert.equal(await h.db.prisma.staffCredential.count({ where: { email: 'boot@example.test' } }), 0);
});
