// Unit tests for the TASK-09 building blocks that need no database: passwords, permissions,
// validation, audit sanitising and configuration guards. Behaviour against PostgreSQL is covered
// by the *.db.test.ts files.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeDetails } from './audit/audit.ts';
import { can, PERMISSIONS } from './auth/authorize.ts';
import { ConfigError, loadConfig } from './config.ts';
import { readProfileFields, validateProfilePatch } from './customers/profile.ts';
import { canonical, validateMemberUpdate, validateRelationship, validateWorkspace } from './family/family-validation.ts';
import { validateRecordCreate, validateReportUpdate, validateReturn } from './research/research-validation.ts';
import { hashPassword, normaliseEmail, passwordProblem, verifyPassword } from './staff/password.ts';

test('passwords: scrypt hash with salt; verifies only the right password; malformed hashes never verify', async () => {
  const hash = await hashPassword('a long enough password');
  assert.match(hash, /^scrypt\$15\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(hash, await hashPassword('a long enough password'), 'random salt');
  assert.equal(await verifyPassword('a long enough password', hash), true);
  assert.equal(await verifyPassword('a long enough passworD', hash), false);
  for (const bad of ['', 'plain', 'scrypt$30$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', hash.replace('$15$', '$12$')]) {
    assert.equal(await verifyPassword('a long enough password', bad), false);
  }
  assert.equal(passwordProblem('short'), 'Use at least 12 characters.');
  assert.equal(passwordProblem('x'.repeat(12)), undefined);
  assert.equal(normaliseEmail('  Admin@Example.TEST '), 'admin@example.test');
  assert.equal(normaliseEmail('not-an-email'), undefined);
});

test('permissions: deny by default; staff permissions never include customers; admin and genealogist are disjoint', () => {
  for (const permission of Object.keys(PERMISSIONS) as Array<keyof typeof PERMISSIONS>) {
    assert.equal(can('customer', permission), false, permission);
  }
  assert.equal(can('admin', 'audit.read'), true);
  assert.equal(can('genealogist', 'audit.read'), false);
  assert.equal(can('genealogist', 'case.work'), true);
  assert.equal(can('admin', 'case.work'), false);
  assert.equal(can('admin', 'nonexistent' as never), false);
  assert.equal(can('admin', 'constructor' as never), false);
});

test('profile: only configured fields are accepted; display name is optional and bounded', () => {
  assert.deepEqual(validateProfilePatch({ displayName: '  Asha ' }, ['displayName']), { ok: true, value: { displayName: 'Asha' } });
  assert.deepEqual(validateProfilePatch({ displayName: '' }, ['displayName']), { ok: true, value: { displayName: null } });
  assert.equal(validateProfilePatch({ displayName: 'x'.repeat(81) }, ['displayName']).ok, false);
  assert.equal(validateProfilePatch({ displayName: 'Asha' }, []).ok, false, 'disabled field');
  assert.equal(validateProfilePatch({ email: 'a@b.c' }, ['displayName']).ok, false, 'undecided field');
  assert.equal(validateProfilePatch({}, ['displayName']).ok, false);
  const issues: string[] = [];
  assert.deepEqual(readProfileFields('none', issues), []);
  readProfileFields('displayName,dateOfBirth', issues);
  assert.match(issues[0] ?? '', /CUSTOMER_PROFILE_FIELDS/);
});

test('family validation: names bounded, unknown fields refused, relationships canonical and never to self', () => {
  assert.equal(validateWorkspace({ name: 'x'.repeat(121) }).ok, false);
  assert.equal(validateMemberUpdate({ displayName: 'A', version: 0 }).ok, false);
  const a = '11111111-1111-4111-8111-111111111111';
  const b = '22222222-2222-4222-8222-222222222222';
  assert.equal(validateRelationship({ type: 'parent_of', fromMemberId: a, toMemberId: a.toUpperCase() }).ok, false, 'self, any case');
  assert.equal(validateRelationship({ type: 'cousin_of', fromMemberId: a, toMemberId: b }).ok, false);
  const spouse = validateRelationship({ type: 'spouse_of', fromMemberId: b, toMemberId: a });
  assert.ok(spouse.ok);
  assert.deepEqual(canonical(spouse.value), { a, b }, 'symmetric types are stored low-high');
  const parent = validateRelationship({ type: 'parent_of', fromMemberId: b, toMemberId: a });
  assert.ok(parent.ok);
  assert.deepEqual(canonical(parent.value), { a: b, b: a }, 'directed types keep their direction');
});

test('research validation: kinds, sizes, versions and a required return reason', () => {
  assert.equal(validateRecordCreate({ kind: 'note', body: '  ' }).ok, false);
  assert.equal(validateRecordCreate({ kind: 'source', body: 'Register', authorUserId: 'x' }).ok, false, 'author comes from the session');
  assert.equal(validateReportUpdate({ title: 'T', body: 'x'.repeat(20_001), version: 1 }).ok, false);
  assert.equal(validateReturn({}).ok, false);
  assert.deepEqual(validateReturn({ reason: ' Add sources ' }), { ok: true, value: { reason: 'Add sources' } });
});

test('audit details: secrets, contact details and long values never get through', () => {
  assert.deepEqual(
    safeDetails({ password: 'p', sessionToken: 't', otpCode: '123456', mobile: '+91', email: 'a@b', type: 'parent_of', note: 'x'.repeat(500) }),
    { type: 'parent_of', note: 'x'.repeat(200) },
  );
  assert.equal(safeDetails({ token: 'x' }), undefined);
  assert.deepEqual(safeDetails({ numberEnding: '3210', 'bad key': 1 }), { numberEnding: '3210' });
});

test('config: development staff provisioning and limits are guarded', () => {
  assert.equal(loadConfig({ DEV_STAFF_PROVISIONING: '1' }).devStaffProvisioning, true);
  for (const nodeEnv of ['production', 'test']) {
    assert.throws(
      () => loadConfig({ NODE_ENV: nodeEnv, DEV_STAFF_PROVISIONING: '1' }),
      (err: unknown) => err instanceof ConfigError && err.issues.some((i) => /development-only/.test(i)),
    );
  }
  assert.equal('devStaffProvisioning' in loadConfig({ DEV_STAFF_PROVISIONING: '0' }), false);
  assert.throws(() => loadConfig({ FAMILY_MAX_MEMBERS: '5' }), /FAMILY_MAX_MEMBERS/);
  assert.throws(() => loadConfig({ AUTH_STAFF_SESSION_TTL_SECONDS: '600', AUTH_STAFF_SESSION_IDLE_SECONDS: '900' }), /must not exceed/);
});
