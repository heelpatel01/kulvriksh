// Family tree PDF export against the real test database and a private storage directory
// (`npm run test:db`): the job lifecycle, repeated clicks, access control for customers,
// genealogists (with and without an active assignment) and admins, busy limits, cancellation,
// lease recovery, expiry, failures and the entitlement gate. TASK-11.
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { inflateSync } from 'node:zlib';
import type { AssignmentView, ExportJobView } from '@kulvriksh/shared';
import { cleanup, harness, skip, type Harness } from '../testing/sprint-harness.ts';
import { createPrismaExportStore } from './export-store.ts';

let h: Harness; // defaults: genealogist export off
let g: Harness; // EXPORT_GENEALOGIST_ACCESS=assigned
let busy: Harness; // queue limit 1
let small: Harness; // one page at most
let gated: Harness; // entitlement gate that refuses
let lowered: Harness; // family limits lowered below an existing family

before(async () => {
  if (!skip) {
    h = await harness();
    g = await harness({ export: { genealogistAccess: 'assigned' } });
    busy = await harness({ export: { queueLimit: 1 } });
    small = await harness({ export: { maxPages: 1 } });
    gated = await harness({ exportEntitlement: async () => false });
    lowered = await harness({ limits: { maxMembers: 3, maxRelationships: 3 } });
  }
});

after(async () => {
  if (!skip) {
    for (const x of [h, g, busy, small, gated, lowered]) {
      await x.close();
    }
    await cleanup();
  }
});

type Err = { error: { code: string } };
type JobBody = { job: ExportJobView };

/** A customer with a workspace of three generations: names are distinctive so the PDF can be searched. */
async function family(target: Harness, tag = 'Exp') {
  const c = await target.customer();
  const ws = await target.api<{ workspace: { id: string } }>(c.token, 'POST', '/family', { name: `${tag} family` });
  const add = async (name: string) => (await target.api<{ member: { id: string } }>(c.token, 'POST', '/family/members', { displayName: name })).body.member.id;
  const gp1 = await add(`${tag} Grandfather`);
  const gp2 = await add(`${tag} Grandmother`);
  const p = await add(`${tag} Father`);
  const s = await add(`${tag} Mother`);
  const k1 = await add(`${tag} Daughter`);
  const k2 = await add(`${tag} Son`);
  const rel = (type: string, fromMemberId: string, toMemberId: string) => target.api(c.token, 'POST', '/family/relationships', { type, fromMemberId, toMemberId });
  await rel('spouse_of', gp1, gp2);
  await rel('parent_of', gp1, p);
  await rel('parent_of', gp2, p);
  await rel('spouse_of', p, s);
  for (const k of [k1, k2]) {
    await rel('parent_of', p, k);
    await rel('parent_of', s, k);
  }
  return { ...c, workspaceId: ws.body.workspace.id, members: { gp1, gp2, p, s, k1, k2 }, names: ['Grandfather', 'Grandmother', 'Father', 'Mother', 'Daughter', 'Son'].map((n) => `${tag} ${n}`) };
}

async function waitFor(target: Harness, token: string, path: string): Promise<ExportJobView> {
  const end = Date.now() + 30_000;
  for (;;) {
    const res = await target.api<JobBody>(token, 'GET', path);
    assert.equal(res.status, 200);
    if (res.body.job.status === 'ready' || res.body.job.status === 'failed') {
      return res.body.job;
    }
    if (Date.now() > end) {
      throw new Error(`export still ${res.body.job.status}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** All text shown on all pages of a PDF this API produced. */
function pdfText(pdf: Buffer): string {
  const s = pdf.toString('latin1');
  const texts: string[] = [];
  // Page content streams; every text object carries its exact string as ActualText (UTF-16BE).
  for (const m of s.matchAll(/<< \/Filter \/FlateDecode \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    const content = inflateSync(pdf.subarray(start, start + Number(m[1]))).toString('latin1');
    for (const t of content.matchAll(/\/ActualText <FEFF([0-9A-F]*)>/g)) {
      texts.push(Buffer.from(t[1]!, 'hex').swap16().toString('utf16le'));
    }
  }
  return texts.join('\n');
}

const objectFiles = (dir: string): string[] => {
  const root = join(dir, 'objects');
  return existsSync(root) ? readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name) : [];
};
const tempFiles = (dir: string): string[] => (existsSync(join(dir, 'tmp')) ? readdirSync(join(dir, 'tmp')) : []);

test('customer export: queued → running → ready, valid PDF with every member, private download, one job for repeated clicks', { skip }, async () => {
  const c = await family(h);
  const options = { mode: 'tiled', pageSize: 'A4', scalePercent: 100 };
  // Three rapid clicks: one job (AS-FAM-12).
  const clicks = await Promise.all([1, 2, 3].map(() => h.api<JobBody>(c.token, 'POST', '/family/exports', options)));
  const ids = new Set(clicks.map((r) => r.body.job.id));
  assert.equal(ids.size, 1);
  assert.deepEqual(clicks.map((r) => r.status).sort(), [200, 200, 202]);
  assert.equal(await h.db.prisma.exportJob.count({ where: { workspaceId: c.workspaceId } }), 1);
  const id = [...ids][0]!;
  const job = await waitFor(h, c.token, `/family/exports/${id}`);
  assert.equal(job.status, 'ready');
  assert.equal(job.progress, 100);
  assert.equal(job.memberCount, 6);
  assert.ok(job.pageCount! >= 2, 'overview + at least one sheet');
  assert.equal(job.downloadable, true);
  assert.deepEqual(job.options.mode, 'tiled');
  const res = await h.raw(c.token, `/family/exports/${id}/file`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename="family-tree-\d{4}-\d{2}-\d{2}\.pdf"/);
  const pdf = Buffer.from(await res.arrayBuffer());
  assert.equal(pdf.subarray(0, 8).toString('latin1'), '%PDF-1.7');
  assert.equal(Number(res.headers.get('content-length')), job.byteSize);
  const text = pdfText(pdf);
  for (const name of c.names) {
    assert.ok(text.includes(name), `${name} in the PDF`);
  }
  assert.match(text, /Page 1 of \d+/);
  // Stored through the storage abstraction as an export file; audit has the request, without names.
  const file = await h.db.prisma.storedFile.findFirst({ where: { workspaceId: c.workspaceId, kind: 'export_pdf' }, select: { status: true, storageKey: true } });
  assert.equal(file?.status, 'committed');
  assert.ok(!file!.storageKey.includes(c.workspaceId));
  const audit = await h.db.prisma.auditEvent.findFirst({ where: { workspaceId: c.workspaceId, action: 'export.requested' }, select: { details: true } });
  assert.deepEqual(audit?.details, { mode: 'tiled', pageSize: 'A4', scope: 'all' });
  // Listing shows it; after it finished, a new click makes a new job.
  const list = await h.api<{ jobs: ExportJobView[] }>(c.token, 'GET', '/family/exports');
  assert.deepEqual(list.body.jobs.map((j) => j.id), [id]);
  const again = await h.api<JobBody>(c.token, 'POST', '/family/exports', {});
  assert.equal(again.status, 202);
  assert.notEqual(again.body.job.id, id);
  await waitFor(h, c.token, `/family/exports/${again.body.job.id}`);
  // Media quota ignores export files.
  const media = await h.api<{ usedBytes: number }>(c.token, 'GET', '/family/media');
  assert.equal(media.body.usedBytes, 0);
});

test('isolation: other customers, admins, genealogists and anonymous callers cannot reach an export', { skip }, async () => {
  const a = await family(h, 'Iso');
  const created = await h.api<JobBody>(a.token, 'POST', '/family/exports', { mode: 'single' });
  const id = created.body.job.id;
  await waitFor(h, a.token, `/family/exports/${id}`);
  const b = await family(h, 'Other');
  for (const [method, path] of [['GET', `/family/exports/${id}`], ['DELETE', `/family/exports/${id}`], ['GET', `/family/exports/${id}/file`]] as const) {
    const res = await h.api<Err>(b.token, method, path);
    assert.equal(res.status, 404, `${method} ${path} by another customer`);
  }
  assert.deepEqual((await h.api<{ jobs: ExportJobView[] }>(b.token, 'GET', '/family/exports')).body.jobs, []);
  // A subtree rooted at someone else's member is refused without revealing it.
  const foreign = await h.api<Err>(b.token, 'POST', '/family/exports', { scope: { kind: 'descendants', memberId: a.members.p } });
  assert.deepEqual([foreign.status, foreign.body.error.code], [422, 'SCOPE_MEMBER_NOT_FOUND']);
  // Admins: denied until FQ-14 is decided. Genealogists: the customer route is not theirs.
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  for (const staff of [admin, genealogist]) {
    assert.equal((await h.api(staff.token, 'GET', `/family/exports/${id}/file`)).status, 403);
    assert.equal((await h.api(staff.token, 'POST', '/family/exports', {})).status, 403);
  }
  // The genealogist route is off by default (R28/FQ-25), even with an active assignment.
  await h.api(admin.token, 'POST', '/admin/assignments', { workspaceId: a.workspaceId, genealogistId: genealogist.userId });
  const off = await h.api<Err>(genealogist.token, 'POST', `/genealogist/cases/${a.workspaceId}/exports`, {});
  assert.deepEqual([off.status, off.body.error.code], [403, 'EXPORT_NOT_PERMITTED']);
  assert.equal((await h.api(undefined, 'GET', `/family/exports/${id}/file`)).status, 401);
  // No workspace yet.
  const fresh = await h.customer();
  const none = await h.api<Err>(fresh.token, 'POST', '/family/exports', {});
  assert.deepEqual([none.status, none.body.error.code], [404, 'NO_WORKSPACE']);
  // Malformed ids and bad options.
  assert.equal((await h.api(a.token, 'GET', '/family/exports/not-a-uuid')).status, 404);
  const bad = await h.api<Err>(a.token, 'POST', '/family/exports', { mode: 'huge', workspaceId: b.workspaceId });
  assert.deepEqual([bad.status, bad.body.error.code], [400, 'VALIDATION_FAILED']);
});

test('genealogist export (when enabled): only while assigned; removal ends access; research records never included', { skip }, async () => {
  const c = await family(g, 'Gen');
  const admin = await g.staff('admin');
  const genealogist = await g.staff('genealogist');
  const outsider = await g.staff('genealogist');
  const assigned = await g.api<{ assignment: AssignmentView }>(admin.token, 'POST', '/admin/assignments', { workspaceId: c.workspaceId, genealogistId: genealogist.userId });
  assert.equal(assigned.status, 201);
  const secret = 'Confidential research note 7731';
  assert.equal((await g.api(genealogist.token, 'POST', `/genealogist/cases/${c.workspaceId}/records`, { kind: 'note', body: secret })).status, 201);
  const base = `/genealogist/cases/${c.workspaceId}/exports`;
  const created = await g.api<JobBody>(genealogist.token, 'POST', base, { mode: 'poster' });
  assert.equal(created.status, 202);
  const job = await waitFor(g, genealogist.token, `${base}/${created.body.job.id}`);
  assert.equal(job.status, 'ready');
  const res = await g.raw(genealogist.token, `${base}/${job.id}/file`);
  assert.equal(res.status, 200);
  const text = pdfText(Buffer.from(await res.arrayBuffer()));
  assert.ok(text.includes('Gen Daughter'));
  assert.ok(!text.includes(secret), 'research records are not in the export');
  // The customer and the genealogist do not see each other's jobs.
  assert.equal((await g.api(c.token, 'GET', `/family/exports/${job.id}`)).status, 404);
  // An unassigned genealogist gets 404 for everything under that workspace.
  for (const [method, path] of [['GET', base], ['POST', base], ['GET', `${base}/${job.id}`], ['GET', `${base}/${job.id}/file`]] as const) {
    assert.equal((await g.api(outsider.token, method, path, method === 'POST' ? {} : undefined)).status, 404, `${method} ${path} by an unassigned genealogist`);
  }
  // Assignment removed: the finished export can no longer be listed, read or downloaded.
  assert.equal((await g.api(admin.token, 'POST', `/admin/assignments/${assigned.body.assignment.id}/remove`, {})).status, 200);
  assert.equal((await g.api(genealogist.token, 'GET', `${base}/${job.id}/file`)).status, 404);
  assert.equal((await g.api(genealogist.token, 'GET', `${base}/${job.id}`)).status, 404);
  assert.equal((await g.api(genealogist.token, 'GET', base)).status, 404);
  assert.equal((await g.api(genealogist.token, 'POST', base, {})).status, 404);
  // Admins still have no export route, whatever the genealogist setting.
  assert.equal((await g.api(admin.token, 'POST', base, {})).status, 403);
});

test('busy: new requests get 429 while the export queue is full; cancellation frees it', { skip }, async () => {
  const a = await family(busy, 'BusyA');
  const b = await family(busy, 'BusyB');
  // A queued job that no runner has picked up yet fills the queue (limit 1).
  const queued = await busy.db.prisma.exportJob.create({ data: { workspaceId: a.workspaceId, requestedByUserId: a.userId, options: { mode: 'single' } }, select: { id: true } });
  const refused = await busy.api<Err>(b.token, 'POST', '/family/exports', {});
  assert.deepEqual([refused.status, refused.body.error.code], [429, 'EXPORT_BUSY']);
  // The owner of the queued job still gets their job back, not a busy error.
  const own = await busy.api<JobBody>(a.token, 'POST', '/family/exports', {});
  assert.deepEqual([own.status, own.body.job.id], [200, queued.id]);
  // Cancelling it frees the slot; a second cancel is a conflict.
  assert.equal((await busy.api(a.token, 'DELETE', `/family/exports/${queued.id}`)).status, 204);
  const cancelled = await busy.api<JobBody>(a.token, 'GET', `/family/exports/${queued.id}`);
  assert.deepEqual([cancelled.body.job.status, cancelled.body.job.errorCode], ['failed', 'cancelled']);
  assert.equal((await busy.api<Err>(a.token, 'DELETE', `/family/exports/${queued.id}`)).status, 409);
  const accepted = await busy.api<JobBody>(b.token, 'POST', '/family/exports', {});
  assert.equal(accepted.status, 202);
  assert.equal((await waitFor(busy, b.token, `/family/exports/${accepted.body.job.id}`)).status, 'ready');
});

test('leases: a stale run cannot complete; an expired lease (restart) fails the job; expiry deletes the file', { skip }, async () => {
  const c = await family(h, 'Lease');
  const store = createPrismaExportStore(h.db.prisma);
  const row = await h.db.prisma.exportJob.create({ data: { workspaceId: c.workspaceId, requestedByUserId: c.userId, options: { mode: 'single' } }, select: { id: true } });
  // Claim it as another "process", then cancel it from the API: the stale run's completion is refused.
  const claimed = await store.claim('itest-process', 60);
  assert.equal(claimed?.id, row.id);
  assert.equal((await h.api(c.token, 'DELETE', `/family/exports/${row.id}`)).status, 204);
  const fake = { storageBackend: 'local', storageKey: `export/zz/${'a'.repeat(32)}`, contentType: 'application/pdf', byteSize: 10, sha256: 'b'.repeat(64) };
  assert.equal(await store.complete(claimed!, fake, { pageCount: 1, memberCount: 6, warnings: [] }, 24), false);
  assert.equal(await h.db.prisma.storedFile.count({ where: { storageKey: fake.storageKey } }), 0, 'the file row was rolled back');
  assert.equal(await store.heartbeat(claimed!, 50, 60), false);

  // A run that died: its lease has expired, so recovery marks it failed (F-FAM-05 restart).
  const dead = await h.db.prisma.exportJob.create({ data: { workspaceId: c.workspaceId, requestedByUserId: c.userId, options: { mode: 'single' } }, select: { id: true } });
  const deadClaim = await store.claim('itest-dead-process', 60);
  assert.equal(deadClaim?.id, dead.id);
  await h.db.prisma.$executeRaw`UPDATE export_job SET lease_expires_at = now() - interval '1 second' WHERE id = ${dead.id}::uuid`;
  const { recovered } = await h.exports.maintain();
  assert.ok(recovered >= 1);
  const after = await h.api<JobBody>(c.token, 'GET', `/family/exports/${dead.id}`);
  assert.deepEqual([after.body.job.status, after.body.job.errorCode], ['failed', 'interrupted']);
  assert.equal(await store.fail(deadClaim!, 'generation_failed'), false, 'the dead run cannot overwrite the recovery');

  // Expiry (FQ-11 retention): the file is deleted and the job is no longer downloadable.
  const ready = await h.api<JobBody>(c.token, 'POST', '/family/exports', {});
  const done = await waitFor(h, c.token, `/family/exports/${ready.body.job.id}`);
  assert.equal(done.downloadable, true);
  const before = objectFiles(h.storageDir).length;
  await h.db.prisma.$executeRaw`UPDATE export_job SET expires_at = now() - interval '1 second' WHERE id = ${done.id}::uuid`;
  const { expired } = await h.exports.maintain();
  assert.ok(expired >= 1);
  assert.equal(objectFiles(h.storageDir).length, before - expired);
  const gone = await h.api<JobBody>(c.token, 'GET', `/family/exports/${done.id}`);
  assert.deepEqual([gone.body.job.status, gone.body.job.downloadable, gone.body.job.byteSize], ['ready', false, null]);
  assert.equal((await h.raw(c.token, `/family/exports/${done.id}/file`)).status, 404);
  assert.equal(await h.db.prisma.storedFile.count({ where: { workspaceId: c.workspaceId } }), 0, 'the file row is gone too');
});

test('failures: over the page limit fails cleanly with no file or temporary output; entitlement gate refuses', { skip }, async () => {
  const c = await family(small, 'Fail');
  const created = await small.api<JobBody>(c.token, 'POST', '/family/exports', { mode: 'tiled', scalePercent: 400 });
  const job = await waitFor(small, c.token, `/family/exports/${created.body.job.id}`);
  assert.deepEqual([job.status, job.errorCode, job.downloadable], ['failed', 'too_many_pages', false]);
  assert.equal(await small.db.prisma.storedFile.count({ where: { workspaceId: c.workspaceId } }), 0);
  assert.deepEqual(tempFiles(small.storageDir), []);
  assert.deepEqual(objectFiles(small.storageDir), []);
  assert.equal((await small.raw(c.token, `/family/exports/${job.id}/file`)).status, 404);
  // The internal reason stays in the log; the API shows only the code.
  assert.ok(!JSON.stringify(job).includes('limit is'));

  const d = await family(gated, 'Gate');
  const refused = await gated.api<Err>(d.token, 'POST', '/family/exports', {});
  assert.deepEqual([refused.status, refused.body.error.code], [403, 'ENTITLEMENT_REQUIRED']);
  assert.equal(await gated.db.prisma.exportJob.count({ where: { workspaceId: d.workspaceId } }), 0);
});

test('the whole family is exported even after the family limit is lowered below its size', { skip }, async () => {
  const c = await family(h, 'Low'); // 6 people, 6 relationships, created under the normal limit
  const created = await lowered.api<JobBody>(c.token, 'POST', '/family/exports', { mode: 'single' });
  assert.equal(created.status, 202);
  const job = await waitFor(lowered, c.token, `/family/exports/${created.body.job.id}`);
  assert.deepEqual([job.status, job.memberCount], ['ready', 6]);
  const res = await lowered.raw(c.token, `/family/exports/${job.id}/file`);
  const text = pdfText(Buffer.from(await res.arrayBuffer()));
  for (const name of c.names) {
    assert.ok(text.includes(name), `${name} in the PDF`);
  }
});

test('Gujarati, Devanagari and Latin names export through the worker with embedded fonts and exact text', { skip }, async () => {
  const c = await h.customer();
  await h.api(c.token, 'POST', '/family', { name: 'પટેલ પરિવાર' });
  const names = ['જયેશભાઈ પટેલ', 'હીર પટેલ', 'राजेश कुमार', 'परिवार वृक्ष', 'José Álvarez', 'Ānand'];
  const ids: string[] = [];
  for (const displayName of names) {
    ids.push((await h.api<{ member: { id: string } }>(c.token, 'POST', '/family/members', { displayName })).body.member.id);
  }
  await h.api(c.token, 'POST', '/family/relationships', { type: 'spouse_of', fromMemberId: ids[0], toMemberId: ids[2] });
  await h.api(c.token, 'POST', '/family/relationships', { type: 'parent_of', fromMemberId: ids[0], toMemberId: ids[1] });
  const created = await h.api<JobBody>(c.token, 'POST', '/family/exports', { mode: 'tiled', showGeneration: true });
  const job = await waitFor(h, c.token, `/family/exports/${created.body.job.id}`);
  assert.equal(job.status, 'ready');
  assert.deepEqual(job.warnings.filter((w) => w === 'unsupported_characters'), []);
  const pdf = Buffer.from(await (await h.raw(c.token, `/family/exports/${job.id}/file`)).arrayBuffer());
  const text = pdfText(pdf);
  for (const name of [...names, 'Family tree: પટેલ પરિવાર']) {
    assert.ok(text.includes(name), `${name} in the PDF`);
  }
  const s = pdf.toString('latin1');
  assert.deepEqual([...s.matchAll(/\/Subtype \/Type0 \/BaseFont \/[A-Z]{6}\+(\S+)/g)].map((m) => m[1]).sort(), ['NotoSans-Regular', 'NotoSansDevanagari-Regular', 'NotoSansGujarati-Regular']);
});

test('preview: page count, printed name size and sheets for the chosen options, without a job; own family only', { skip }, async () => {
  const c = await family(h, 'Prev');
  type Preview = { preview: { pageCount: number; withinLimits: boolean; effectiveLabelPt: number; sheets: { rows: number; columns: number } | null; scalePercent: number; warnings: string[]; memberCount: number } };
  const single = await h.api<Preview>(c.token, 'POST', '/family/exports/preview', { mode: 'single', pageSize: 'A4' });
  assert.equal(single.status, 200);
  assert.equal(single.body.preview.memberCount, 6);
  assert.equal(single.body.preview.sheets, null);
  assert.ok(single.body.preview.effectiveLabelPt > 0);
  const tiled = await h.api<Preview>(c.token, 'POST', '/family/exports/preview', { mode: 'tiled', pageSize: 'A4', targetSheets: 1 });
  assert.deepEqual(tiled.body.preview.sheets, { rows: 1, columns: 1 });
  assert.ok(tiled.body.preview.scalePercent > 100, 'a small family fills one sheet at a larger scale');
  // Nothing is created by a preview.
  assert.equal(await h.db.prisma.exportJob.count({ where: { workspaceId: c.workspaceId } }), 0);
  // Over the page limit: reported, not refused.
  const huge = await small.api<Preview>(c.token, 'POST', '/family/exports/preview', { mode: 'tiled', scalePercent: 400 });
  assert.deepEqual([huge.body.preview.withinLimits, huge.body.preview.warnings.includes('too_many_pages')], [false, true]);
  // Another customer's member as subtree root, or no workspace: nothing revealed.
  const other = await family(h, 'PrevOther');
  assert.equal((await h.api(other.token, 'POST', '/family/exports/preview', { scope: { kind: 'descendants', memberId: c.members.p } })).status, 422);
  const none = await h.customer();
  assert.equal((await h.api(none.token, 'POST', '/family/exports/preview', {})).status, 404);
  assert.equal((await h.api(undefined, 'POST', '/family/exports/preview', {})).status, 401);
  const bad = await h.api(c.token, 'POST', '/family/exports/preview', { mode: 'single', targetSheets: 3 });
  assert.equal(bad.status, 400);
});
