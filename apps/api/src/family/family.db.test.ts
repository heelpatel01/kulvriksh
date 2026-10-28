// Customer profile and family workspace against the real test database (`npm run test:db`).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FamilyMemberView, FamilyTreeView, RelationshipView } from '@kulvriksh/shared';
import { cleanup, harness, skip, type Harness } from '../testing/sprint-harness.ts';

let h: Harness;

before(async () => {
  if (!skip) {
    h = await harness({ limits: { maxMembers: 12, maxRelationships: 30 } });
  }
});

after(async () => {
  if (!skip) {
    await h.close();
    await cleanup();
  }
});

async function familyWith(token: string, names: string[]) {
  assert.equal((await h.api(token, 'POST', '/family', { name: 'Test family' })).status, 201);
  const members: FamilyMemberView[] = [];
  for (const displayName of names) {
    const res = await h.api<{ member: FamilyMemberView }>(token, 'POST', '/family/members', { displayName });
    assert.equal(res.status, 201);
    members.push(res.body.member);
  }
  return members;
}

const relate = (token: string, type: string, fromMemberId: string, toMemberId: string) =>
  h.api<{ relationship: RelationshipView; error: { code: string } }>(token, 'POST', '/family/relationships', { type, fromMemberId, toMemberId });

test('profile: read and update own display name; persists across sessions; mobile stays read-only', { skip }, async () => {
  const c = await h.customer();
  const read = await h.api<{ profile: { displayName: string | null; mobileNumberMasked: string; editableFields: string[] } }>(c.token, 'GET', '/me/profile');
  assert.equal(read.status, 200);
  assert.equal(read.body.profile.displayName, null);
  assert.deepEqual(read.body.profile.editableFields, ['displayName']);
  const updated = await h.api(c.token, 'PATCH', '/me/profile', { displayName: '  Asha  ' });
  assert.equal(updated.status, 200);
  // A second session of the same customer sees the saved value.
  const row = await h.db.prisma.customerProfile.findUniqueOrThrow({ where: { userId: c.userId } });
  assert.equal(row.displayName, 'Asha');
  assert.equal((await h.api(c.token, 'PATCH', '/me/profile', { mobileNumber: '+919999999999' })).status, 400);
  assert.equal((await h.api(c.token, 'PATCH', '/me/profile', { displayName: 'x'.repeat(81) })).status, 400);
  assert.equal((await h.api(c.token, 'PATCH', '/me/profile', { displayName: null })).status, 200);
  assert.equal((await h.db.prisma.customerProfile.findUniqueOrThrow({ where: { userId: c.userId } })).displayName, null);
  const audit = await h.db.prisma.auditEvent.findMany({ where: { actorUserId: c.userId, action: 'profile.updated' } });
  assert.equal(audit.length, 2);
  assert.ok(audit.every((e) => !JSON.stringify(e.details).includes('Asha')), 'values are not audited');
});

test('AS-PRO-01: a user id in the body or query cannot reach another profile', { skip }, async () => {
  const a = await h.customer();
  const b = await h.customer();
  assert.equal((await h.api(a.token, 'PATCH', '/me/profile', { displayName: 'A', userId: b.userId })).status, 400);
  await h.api(a.token, 'PATCH', `/me/profile?userId=${b.userId}`, { displayName: 'A' });
  assert.equal((await h.db.prisma.customerProfile.findUniqueOrThrow({ where: { userId: b.userId } })).displayName, null);
});

test('workspace: one per customer; a double create returns the existing one (AS-FAM-02)', { skip }, async () => {
  const c = await h.customer();
  assert.equal((await h.api<{ workspace: null }>(c.token, 'GET', '/family')).body.workspace, null);
  assert.equal((await h.api(c.token, 'GET', '/family/tree')).status, 404);
  const results = await Promise.all([1, 2, 3].map(() => h.api<{ created: boolean }>(c.token, 'POST', '/family', { name: 'Mehta family' })));
  assert.deepEqual(results.map((r) => r.body.created).sort(), [false, false, true]);
  assert.equal(await h.db.prisma.familyWorkspace.count({ where: { ownerUserId: c.userId } }), 1);
  assert.equal((await h.api(c.token, 'PATCH', '/family', { name: '' })).status, 400);
  assert.equal((await h.api(c.token, 'PATCH', '/family', { name: 'Mehta–Shah family' })).status, 200);
});

test('members and relationships persist; the tree comes back in one response', { skip }, async () => {
  const c = await h.customer();
  const [grandpa, father, child, mother] = await familyWith(c.token, ['Harilal', 'Ramesh', 'Asha', 'Savita']);
  assert.equal((await relate(c.token, 'parent_of', grandpa!.id, father!.id)).status, 201);
  assert.equal((await relate(c.token, 'parent_of', father!.id, child!.id)).status, 201);
  // spouse_of is symmetric: stored once in canonical order whichever way it is entered.
  const spouse = await relate(c.token, 'spouse_of', mother!.id, father!.id);
  assert.equal(spouse.status, 201);
  assert.equal((await relate(c.token, 'spouse_of', father!.id, mother!.id)).body.error.code, 'DUPLICATE_RELATIONSHIP');
  const tree = await h.api<FamilyTreeView>(c.token, 'GET', '/family/tree');
  assert.equal(tree.status, 200);
  assert.equal(tree.body.members.length, 4);
  assert.equal(tree.body.relationships.length, 3);
  assert.equal(tree.body.workspace.memberCount, 4);
  const page = await h.api<{ members: FamilyMemberView[]; nextCursor: string }>(c.token, 'GET', '/family/members?limit=3');
  assert.equal(page.body.members.length, 3);
  const rest = await h.api<{ members: FamilyMemberView[]; nextCursor: null }>(c.token, 'GET', `/family/members?limit=3&after=${page.body.nextCursor}`);
  assert.equal(rest.body.members.length, 1);
  assert.equal(rest.body.nextCursor, null);
  const search = await h.api<{ members: FamilyMemberView[] }>(c.token, 'GET', '/family/members?q=ram');
  assert.deepEqual(search.body.members.map((m) => m.displayName), ['Ramesh']);
});

test('AS-FAM-05: cycles in ancestry are rejected with no data change; self-relationships too', { skip }, async () => {
  const c = await h.customer();
  const [a, b, d] = await familyWith(c.token, ['A', 'B', 'D']);
  await relate(c.token, 'parent_of', a!.id, b!.id);
  await relate(c.token, 'parent_of', b!.id, d!.id);
  const cycle = await relate(c.token, 'parent_of', d!.id, a!.id);
  assert.equal(cycle.status, 422);
  assert.equal(cycle.body.error.code, 'ANCESTRY_CYCLE');
  assert.equal((await relate(c.token, 'parent_of', b!.id, a!.id)).status, 422, 'direct reverse is also a cycle');
  assert.equal((await relate(c.token, 'parent_of', a!.id, a!.id)).status, 400);
  assert.equal((await relate(c.token, 'parent_of', a!.id, b!.id)).status, 409, 'duplicate');
  assert.equal(await h.db.prisma.relationship.count({ where: { memberA: { id: { in: [a!.id, b!.id, d!.id] } } } }), 2);
});

test('concurrent relationship writes cannot form a cycle together (workspace lock)', { skip }, async () => {
  const c = await h.customer();
  const [x, y] = await familyWith(c.token, ['X', 'Y']);
  const results = await Promise.all([relate(c.token, 'parent_of', x!.id, y!.id), relate(c.token, 'parent_of', y!.id, x!.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 422]);
});

test('AS-FAM-03/06: another customer cannot read, change or link to a family by guessing IDs', { skip }, async () => {
  const owner = await h.customer();
  const intruder = await h.customer();
  const [m1, m2] = await familyWith(owner.token, ['Owner one', 'Owner two']);
  const [own] = await familyWith(intruder.token, ['Intruder']);
  const rel = await relate(owner.token, 'parent_of', m1!.id, m2!.id);
  assert.equal((await h.api(intruder.token, 'PATCH', `/family/members/${m1!.id}`, { displayName: 'Hacked', version: 1 })).status, 404);
  assert.equal((await h.api(intruder.token, 'DELETE', `/family/members/${m2!.id}`, { version: 1 })).status, 404);
  assert.equal((await h.api(intruder.token, 'DELETE', `/family/relationships/${rel.body.relationship.id}`)).status, 404);
  const cross = await relate(intruder.token, 'parent_of', own!.id, m1!.id);
  assert.equal(cross.status, 422);
  assert.equal(cross.body.error.code, 'INVALID_MEMBER');
  const tree = await h.api<FamilyTreeView>(intruder.token, 'GET', '/family/tree');
  assert.ok(!JSON.stringify(tree.body).includes(m1!.id));
  assert.equal((await h.db.prisma.familyMember.findUniqueOrThrow({ where: { id: m1!.id } })).displayName, 'Owner one');
  // The database itself refuses a relationship whose members are in different workspaces.
  const ws = await h.db.prisma.familyWorkspace.findUniqueOrThrow({ where: { ownerUserId: intruder.userId } });
  await assert.rejects(
    h.db.prisma.relationship.create({
      data: { workspaceId: ws.id, memberAId: own!.id, memberBId: m1!.id, relationshipType: 'parent_of', createdByUserId: intruder.userId },
    }),
  );
});

test('optimistic concurrency: a stale version gets 409; deletion is blocked while relationships exist (R21)', { skip }, async () => {
  const c = await h.customer();
  const [p, q] = await familyWith(c.token, ['P', 'Q']);
  const first = await h.api<{ member: FamilyMemberView }>(c.token, 'PATCH', `/family/members/${p!.id}`, { displayName: 'P2', version: 1 });
  assert.equal(first.status, 200);
  assert.equal(first.body.member.version, 2);
  assert.equal((await h.api(c.token, 'PATCH', `/family/members/${p!.id}`, { displayName: 'P3', version: 1 })).status, 409);
  const rel = await relate(c.token, 'parent_of', p!.id, q!.id);
  const blocked = await h.api<{ error: { code: string } }>(c.token, 'DELETE', `/family/members/${p!.id}`, { version: 2 });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'HAS_RELATIONSHIPS');
  assert.equal((await h.api(c.token, 'DELETE', `/family/relationships/${rel.body.relationship.id}`)).status, 204);
  assert.equal((await h.api(c.token, 'DELETE', `/family/members/${p!.id}`, { version: 1 })).status, 409, 'stale version');
  assert.equal((await h.api(c.token, 'DELETE', `/family/members/${p!.id}`, { version: 2 })).status, 204);
  assert.equal(await h.db.prisma.familyMember.count({ where: { id: p!.id } }), 0);
});

test('limits: the provisional family size limit holds even under concurrent creates', { skip }, async () => {
  const c = await h.customer();
  await familyWith(c.token, []);
  const results = await Promise.all(Array.from({ length: 16 }, (_, i) => h.api(c.token, 'POST', '/family/members', { displayName: `M${i}` })));
  assert.equal(results.filter((r) => r.status === 201).length, 12);
  assert.equal(results.filter((r) => r.status === 422).length, 4);
});

test('validation: unknown fields, oversized names and bad IDs are rejected', { skip }, async () => {
  const c = await h.customer();
  await familyWith(c.token, []);
  assert.equal((await h.api(c.token, 'POST', '/family/members', { displayName: 'x', birthDate: '1900' })).status, 400);
  assert.equal((await h.api(c.token, 'POST', '/family/members', { displayName: 'x'.repeat(121) })).status, 400);
  assert.equal((await h.api(c.token, 'PATCH', '/family/members/not-a-uuid', { displayName: 'x', version: 1 })).status, 404);
  assert.equal((await relate(c.token, 'sibling_of', crypto.randomUUID(), crypto.randomUUID())).status, 400);
});

test('every family write is audited in the same transaction', { skip }, async () => {
  const c = await h.customer();
  const [m] = await familyWith(c.token, ['Audited']);
  const events = await h.db.prisma.auditEvent.findMany({ where: { actorUserId: c.userId }, orderBy: { id: 'asc' } });
  assert.deepEqual(events.map((e) => e.action), ['workspace.created', 'member.created']);
  assert.equal(events[1]!.targetId, m!.id);
  assert.ok(events.every((e) => e.requestId && e.actorRole === 'customer'));
});

test('regression: timestamps written by Prisma match the database clock (UTC session)', { skip }, async () => {
  const c = await h.customer();
  const rows = await h.db.prisma.$queryRaw<Array<{ skew: number }>>`
    SELECT abs(extract(epoch FROM now() - created_at))::float AS skew FROM app_user WHERE id = ${c.userId}::uuid`;
  assert.ok(rows[0]!.skew < 60, `created_at is ${rows[0]!.skew} s away from now()`);
});

test('family routes: staff sessions and anonymous callers are refused', { skip }, async () => {
  const admin = await h.staff('admin');
  assert.equal((await h.api(undefined, 'GET', '/family')).status, 401);
  assert.equal((await h.api(admin.token, 'GET', '/family')).status, 403);
  assert.equal((await h.api(admin.token, 'GET', '/me/profile')).status, 403);
});
