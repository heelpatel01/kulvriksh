// Media and report files against the real test database and a private temporary storage
// directory (`npm run test:db`): upload validation, limits, quota, access checks, deletion,
// cleanup of abandoned uploads, and report-file visibility before and after release.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { MediaItemView, ReportView } from '@kulvriksh/shared';
import { createDatabase } from '../db.ts';
import { cleanup, harness, skip, type Harness } from '../testing/sprint-harness.ts';
import { createFileService } from './file-service.ts';
import { createPrismaFileStore } from './file-store.ts';
import { LocalDiskStorage } from '../storage/storage.ts';

let h: Harness;
let tight: Harness; // small limits

before(async () => {
  if (!skip) {
    h = await harness();
    tight = await harness({ storage: { mediaMaxBytes: 2048, workspaceQuotaBytes: 4096 } });
  }
});

after(async () => {
  if (!skip) {
    await h.close();
    await tight.close();
    await cleanup();
  }
});

const jpeg = (size = 600) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)]);
const pdf = (text = 'report body') => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);
type Err = { error: { code: string } };

async function customerWithWorkspace(target = h) {
  const customer = await target.customer();
  await target.api(customer.token, 'POST', '/family', { name: 'Media family' });
  return customer;
}

/** Temporary uploads left behind (none, if the upload was refused before reading the body). */
const tempFiles = (dir: string): string[] => (existsSync(join(dir, 'tmp')) ? readdirSync(join(dir, 'tmp')) : []);

const objectFiles = (dir: string): string[] => {
  const root = join(dir, 'objects');
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
};

test('upload → list → download round-trip; private, unsniffable, sandboxed', { skip }, async () => {
  const c = await customerWithWorkspace();
  const bytes = jpeg(900);
  const up = await h.upload<{ item: MediaItemView }>(c.token, '/family/media', bytes, '../../Grandma "1".jpg');
  assert.equal(up.status, 201);
  assert.deepEqual([up.body.item.mediaType, up.body.item.contentType, up.body.item.byteSize, up.body.item.originalFilename], ['photo', 'image/jpeg', 900, 'Grandma 1.jpg']);
  const list = await h.api<{ items: MediaItemView[]; usedBytes: number }>(c.token, 'GET', '/family/media');
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.usedBytes, 900);
  assert.ok(!JSON.stringify(list.body).includes('media/'), 'storage keys are never exposed');
  const res = await h.raw(c.token, `/family/media/${up.body.item.id}/content`);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
  const row = await h.db.prisma.storedFile.findFirstOrThrow({ where: { mediaItem: { id: up.body.item.id } } });
  assert.match(row.checksumSha256, /^[0-9a-f]{64}$/);
  assert.equal(row.storageBackend, 'local');
});

test('access: other customers, staff and anonymous callers never reach the file', { skip }, async () => {
  const owner = await customerWithWorkspace();
  const up = await h.upload<{ item: MediaItemView }>(owner.token, '/family/media', jpeg());
  const id = up.body.item.id;
  const stranger = await customerWithWorkspace();
  assert.equal((await h.raw(stranger.token, `/family/media/${id}/content`)).status, 404);
  assert.equal((await h.api(stranger.token, 'DELETE', `/family/media/${id}`)).status, 404);
  assert.deepEqual((await h.api<{ items: unknown[] }>(stranger.token, 'GET', '/family/media')).body.items, []);
  const admin = await h.staff('admin');
  assert.equal((await h.raw(admin.token, `/family/media/${id}/content`)).status, 403);
  assert.equal((await h.raw(undefined, `/family/media/${id}/content`)).status, 401);
  assert.equal((await h.raw(owner.token, `/family/media/not-a-uuid/content`)).status, 404);
});

test('validation: type from content, not the name; disguised and unsupported files are refused', { skip }, async () => {
  const c = await customerWithWorkspace();
  for (const [bytes, name] of [
    [Buffer.from('MZ\x90\x00 pretend executable', 'latin1'), 'photo.jpg'],
    [Buffer.from('<html><script>alert(1)</script></html>'), 'image.png'],
    [Buffer.alloc(0), 'empty.jpg'],
  ] as const) {
    const res = await h.upload<Err>(c.token, '/family/media', bytes, name);
    assert.equal(res.status, 422, name);
    assert.equal(res.body.error.code, 'UNSUPPORTED_FILE_TYPE');
  }
  const form = await fetch(`${h.base}/api/v1/family/media`, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.token}`, 'content-type': 'multipart/form-data; boundary=x' },
    body: '--x--',
  });
  assert.equal(form.status, 415);
  const pdfUp = await h.upload<{ item: MediaItemView }>(c.token, '/family/media', pdf(), 'certificate.pdf');
  assert.equal(pdfUp.body.item.mediaType, 'document');
  assert.equal(await h.db.prisma.mediaItem.count({ where: { workspace: { ownerUserId: c.userId } } }), 1);
  assert.deepEqual(tempFiles(h.storageDir), [], 'refused uploads leave no temporary files');
});

test('limits: oversized files are 413 (declared or streamed); the workspace quota holds under concurrency', { skip }, async () => {
  const c = await customerWithWorkspace(tight);
  const big = await tight.upload<Err>(c.token, '/family/media', jpeg(3000));
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, 'FILE_TOO_LARGE');
  assert.deepEqual(tempFiles(tight.storageDir), []);
  // Four 1.5 kB uploads against a 4 kB quota, in parallel: at most two may succeed.
  const results = await Promise.all([1, 2, 3, 4].map(() => tight.upload(c.token, '/family/media', jpeg(1500))));
  const created = results.filter((r) => r.status === 201).length;
  assert.equal(created, 2);
  assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 422));
  assert.equal(objectFiles(tight.storageDir).length, 2, 'refused uploads leave no committed bytes');
});

test('delete removes metadata, bytes and the file row; a second delete is 404', { skip }, async () => {
  const c = await customerWithWorkspace();
  const up = await h.upload<{ item: MediaItemView }>(c.token, '/family/media', jpeg());
  const before = objectFiles(h.storageDir).length;
  assert.equal((await h.api(c.token, 'DELETE', `/family/media/${up.body.item.id}`)).status, 204);
  assert.equal(objectFiles(h.storageDir).length, before - 1);
  assert.equal(await h.db.prisma.storedFile.count({ where: { workspace: { ownerUserId: c.userId } } }), 0);
  assert.equal((await h.api(c.token, 'DELETE', `/family/media/${up.body.item.id}`)).status, 404);
  const events = await h.db.prisma.auditEvent.findMany({ where: { actorUserId: c.userId, action: { startsWith: 'media.' } }, orderBy: { id: 'asc' } });
  assert.deepEqual(events.map((e) => e.action), ['media.uploaded', 'media.deleted']);
});

test('cleanup sweeps abandoned uploads and retries failed byte removals', { skip }, async () => {
  const c = await customerWithWorkspace();
  const up = await h.upload<{ item: MediaItemView }>(c.token, '/family/media', jpeg());
  // Simulate a deletion whose byte removal failed: the row is pending and the bytes still exist.
  const file = await h.db.prisma.storedFile.findFirstOrThrow({ where: { mediaItem: { id: up.body.item.id } } });
  await h.db.prisma.mediaItem.delete({ where: { id: up.body.item.id } });
  await h.db.prisma.storedFile.update({ where: { id: file.id }, data: { status: 'pending_deletion' } });
  const abandoned = join(h.storageDir, 'tmp', 'c'.repeat(32));
  writeFileSync(abandoned, 'interrupted upload');
  utimesSync(abandoned, new Date(Date.now() - 2 * 3_600_000), new Date(Date.now() - 2 * 3_600_000));
  const db = createDatabase(process.env.TEST_DATABASE_URL ?? '');
  try {
    const service = createFileService({ storage: new LocalDiskStorage(h.storageDir), store: createPrismaFileStore(db.prisma), config: h.storage, logger: h.captured.logger });
    const swept = await service.sweep();
    assert.ok(swept.abandonedUploads >= 1 && swept.retriedDeletions >= 1);
  } finally {
    await db.disconnect();
  }
  assert.equal(existsSync(abandoned), false);
  assert.equal(await h.db.prisma.storedFile.count({ where: { id: file.id } }), 0);
});

test('report files: PDF only, editable reports only; customers see them only after release', { skip }, async () => {
  const customer = await customerWithWorkspace();
  const ws = (await h.api<{ workspace: { id: string } }>(customer.token, 'GET', '/family')).body.workspace.id;
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  const assignment = await h.api<{ assignment: { id: string } }>(admin.token, 'POST', '/admin/assignments', { workspaceId: ws, genealogistId: genealogist.userId });
  const base = `/genealogist/cases/${ws}/reports`;
  const draft = await h.api<{ report: ReportView }>(genealogist.token, 'POST', base, { title: 'With a file', body: 'Summary' });
  const id = draft.body.report.id;
  assert.equal((await h.upload(genealogist.token, `${base}/${id}/file`, jpeg())).status, 422, 'not a PDF');
  assert.equal((await h.upload(genealogist.token, `${base}/${id}/file`, pdf('v1'))).status, 204);
  assert.equal((await h.upload(genealogist.token, `${base}/${id}/file`, pdf('version two'))).status, 204, 'replace while draft');
  assert.equal(await h.db.prisma.storedFile.count({ where: { workspaceId: ws, kind: 'report' } }), 1, 'the replaced file is removed');
  const listed = (await h.api<{ reports: ReportView[] }>(genealogist.token, 'GET', base)).body.reports[0]!;
  assert.equal(listed.file?.contentType, 'application/pdf');

  // Before release: the customer gets 404 even with the exact report ID (AS-REP-01).
  assert.equal((await h.raw(customer.token, `/reports/${id}/file`)).status, 404);
  await h.api(genealogist.token, 'POST', `${base}/${id}/submit`);
  assert.equal((await h.upload(genealogist.token, `${base}/${id}/file`, pdf('late'))).status, 409, 'not editable once submitted');
  const review = await h.raw(admin.token, `/admin/reports/${id}/file`);
  assert.equal(review.status, 200);
  assert.match(Buffer.from(await review.arrayBuffer()).toString(), /version two/);
  assert.equal((await h.raw(customer.token, `/reports/${id}/file`)).status, 404);

  await h.api(admin.token, 'POST', `/admin/reports/${id}/release`);
  const released = await h.raw(customer.token, `/reports/${id}/file`);
  assert.equal(released.status, 200);
  assert.match(released.headers.get('content-disposition') ?? '', /^attachment/);
  const stranger = await customerWithWorkspace();
  assert.equal((await h.raw(stranger.token, `/reports/${id}/file`)).status, 404);

  // Unassigned genealogists lose file access too.
  assert.equal((await h.raw(genealogist.token, `${base}/${id}/file`)).status, 200);
  await h.api(admin.token, 'POST', `/admin/assignments/${assignment.body.assignment.id}/remove`);
  assert.equal((await h.raw(genealogist.token, `${base}/${id}/file`)).status, 404);
});
