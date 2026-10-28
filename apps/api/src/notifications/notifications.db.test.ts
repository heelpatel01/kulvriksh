// Notifications against the real test database (`npm run test:db`): created in the release
// transaction, once per event; private to the recipient; and the outbox dispatcher's leasing.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AssignmentView, NotificationView, ReportView } from '@kulvriksh/shared';
import { cleanup, harness, skip, type Harness } from '../testing/sprint-harness.ts';
import { dispatchOnce, recoverExpiredLeases, type NotificationSender, type SendOutcome } from './dispatcher.ts';
import { writeNotifications } from './notification-store.ts';

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

/** A customer family with a genealogist whose report is submitted and waiting for review. */
async function submittedReport(title = 'Origins of the family') {
  const customer = await h.customer();
  const ws = await h.api<{ workspace: { id: string } }>(customer.token, 'POST', '/family', { name: 'Notified family' });
  const admin = await h.staff('admin');
  const genealogist = await h.staff('genealogist');
  await h.api<{ assignment: AssignmentView }>(admin.token, 'POST', '/admin/assignments', { workspaceId: ws.body.workspace.id, genealogistId: genealogist.userId });
  const base = `/genealogist/cases/${ws.body.workspace.id}/reports`;
  const draft = await h.api<{ report: ReportView }>(genealogist.token, 'POST', base, { title, body: 'Secret draft notes' });
  await h.api(genealogist.token, 'POST', `${base}/${draft.body.report.id}/submit`);
  return { customer, admin, genealogist, reportId: draft.body.report.id, workspaceId: ws.body.workspace.id };
}

const inbox = (token: string) => h.api<{ notifications: NotificationView[]; unread: number; nextBefore: string | null }>(token, 'GET', '/notifications');

test('releasing a report creates one in-app notification for the owner, with released information only', { skip }, async () => {
  const { customer, admin, reportId } = await submittedReport();
  assert.deepEqual((await inbox(customer.token)).body.notifications, [], 'nothing before release (AS-GEN-07)');
  assert.equal((await h.api(admin.token, 'POST', `/admin/reports/${reportId}/release`)).status, 200);
  const after = await inbox(customer.token);
  assert.equal(after.body.unread, 1);
  assert.equal(after.body.notifications.length, 1);
  const [n] = after.body.notifications;
  assert.equal(n!.eventKey, 'report.released');
  assert.match(n!.body, /Origins of the family/);
  assert.ok(!JSON.stringify(after.body).includes('Secret draft notes'), 'no report content in the notification');
  assert.equal(n!.link, '/dashboard/research');
  assert.deepEqual((await h.api(customer.token, 'GET', '/notifications/unread-count')).body, { unread: 1 });
  // Releasing again (already released) does not create a second record (AS-NOT-02).
  await h.api(admin.token, 'POST', `/admin/reports/${reportId}/release`);
  assert.equal((await inbox(customer.token)).body.notifications.length, 1);
});

test('concurrent releases still produce exactly one notification', { skip }, async () => {
  const { customer, admin, reportId } = await submittedReport();
  await Promise.all([1, 2, 3].map(() => h.api(admin.token, 'POST', `/admin/reports/${reportId}/release`)));
  assert.equal(await h.db.prisma.notification.count({ where: { recipientUserId: customer.userId, sourceId: reportId } }), 1);
});

test('returning a report, or leaving it submitted, notifies no one', { skip }, async () => {
  const { customer, admin, reportId } = await submittedReport();
  await h.api(admin.token, 'POST', `/admin/reports/${reportId}/return`, { reason: 'More sources' });
  assert.equal(await h.db.prisma.notification.count({ where: { recipientUserId: customer.userId } }), 0);
});

test('privacy: another customer sees nothing and cannot mark it read; staff cannot use the inbox', { skip }, async () => {
  const { customer, admin, genealogist, reportId } = await submittedReport();
  await h.api(admin.token, 'POST', `/admin/reports/${reportId}/release`);
  const [mine] = (await inbox(customer.token)).body.notifications;
  const stranger = await h.customer();
  assert.deepEqual((await inbox(stranger.token)).body.notifications, []);
  assert.equal((await h.api(stranger.token, 'POST', `/notifications/${mine!.id}/read`)).status, 404);
  assert.equal((await h.api(stranger.token, 'POST', '/notifications/read-all')).status, 200);
  assert.equal((await inbox(customer.token)).body.unread, 1, 'stranger read-all touched nothing of ours');
  for (const token of [admin.token, genealogist.token]) {
    assert.equal((await h.api(token, 'GET', '/notifications')).status, 403);
  }
  assert.equal((await h.api(undefined, 'GET', '/notifications')).status, 401);
  // Marking read is idempotent; read-all clears the rest.
  assert.equal((await h.api(customer.token, 'POST', `/notifications/${mine!.id}/read`)).status, 204);
  assert.equal((await h.api(customer.token, 'POST', `/notifications/${mine!.id}/read`)).status, 204);
  assert.equal((await inbox(customer.token)).body.unread, 0);
  assert.equal((await h.api(customer.token, 'GET', '/notifications?before=not-a-uuid')).status, 400);
});

test('transactional: a rolled-back trigger leaves no notification', { skip }, async () => {
  const customer = await h.customer();
  const sourceId = crypto.randomUUID();
  await assert.rejects(
    h.db.prisma.$transaction(async (tx) => {
      await writeNotifications(tx, {
        eventKey: 'report.released',
        sourceType: 'report',
        sourceId,
        recipientUserId: customer.userId,
        title: 'Should vanish',
        body: 'Rolled back',
        channels: ['in_app'],
      });
      throw new Error('triggering change failed');
    }),
  );
  assert.equal(await h.db.prisma.notification.count({ where: { sourceId } }), 0);
});

test('pagination: newest first with a cursor bounded to the recipient’s own records', { skip }, async () => {
  const customer = await h.customer();
  for (let i = 0; i < 5; i += 1) {
    await h.db.prisma.$transaction((tx) =>
      writeNotifications(tx, {
        eventKey: 'report.released',
        sourceType: 'report',
        sourceId: crypto.randomUUID(),
        recipientUserId: customer.userId,
        title: `N${i}`,
        body: 'x',
        channels: ['in_app'],
      }),
    );
  }
  const first = await h.api<{ notifications: NotificationView[]; nextBefore: string }>(customer.token, 'GET', '/notifications?limit=3');
  assert.equal(first.body.notifications.length, 3);
  const second = await h.api<{ notifications: NotificationView[]; nextBefore: null }>(customer.token, 'GET', `/notifications?limit=3&before=${first.body.nextBefore}`);
  assert.equal(second.body.notifications.length, 2);
  assert.equal(second.body.nextBefore, null);
  assert.equal(new Set([...first.body.notifications, ...second.body.notifications].map((n) => n.id)).size, 5);
});

// ---- Outbox dispatcher (email/SMS channels; no real provider is configured) ----

class FakeSms implements NotificationSender {
  readonly channel = 'sms' as const;
  readonly sent: string[] = [];
  readonly outcomes: SendOutcome[];
  constructor(outcomes: SendOutcome[]) {
    this.outcomes = outcomes;
  }
  async send(message: { dedupeKey: string }): Promise<SendOutcome> {
    this.sent.push(message.dedupeKey);
    return this.outcomes.shift() ?? { kind: 'accepted', providerMessageId: 'fake-1' };
  }
}

async function queuedSms() {
  const customer = await h.customer();
  const sourceId = crypto.randomUUID();
  await h.db.prisma.$transaction((tx) =>
    writeNotifications(tx, { eventKey: 'report.released', sourceType: 'report', sourceId, recipientUserId: customer.userId, title: 'T', body: 'B', channels: ['sms'] }),
  );
  return h.db.prisma.notification.findFirstOrThrow({ where: { sourceId } });
}

const options = { batchSize: 50, leaseSeconds: 60, maxAttempts: 2, backoffBaseSeconds: 0, sendTimeoutMs: 2000 };

test('dispatcher: accepted → sent; transient → retried then failed; permanent → failed; attempts logged', { skip }, async () => {
  const ok = await queuedSms();
  assert.equal(ok.status, 'queued');
  assert.match(ok.recipientAddress ?? '', /^\+91\d{10}$/);
  const sender = new FakeSms([]);
  await dispatchOnce(h.db.prisma, [sender], h.captured.logger, options);
  const sent = await h.db.prisma.notification.findUniqueOrThrow({ where: { id: ok.id }, include: { attempts: true } });
  assert.deepEqual([sent.status, sent.providerMessageId, sent.leaseToken, sent.attempts.length, sent.attempts[0]!.outcome], ['sent', 'fake-1', null, 1, 'accepted']);

  const flaky = await queuedSms();
  const failing = new FakeSms([{ kind: 'transient', responseCode: '503' }, { kind: 'transient', responseCode: '503' }]);
  await dispatchOnce(h.db.prisma, [failing], h.captured.logger, options);
  assert.equal((await h.db.prisma.notification.findUniqueOrThrow({ where: { id: flaky.id } })).status, 'queued');
  await dispatchOnce(h.db.prisma, [failing], h.captured.logger, options);
  const final = await h.db.prisma.notification.findUniqueOrThrow({ where: { id: flaky.id }, include: { attempts: true } });
  assert.deepEqual([final.status, final.attemptCount, final.attempts.length, final.lastErrorCode], ['failed', 2, 2, '503']);

  const bad = await queuedSms();
  await dispatchOnce(h.db.prisma, [new FakeSms([{ kind: 'permanent', responseCode: 'invalid_number' }])], h.captured.logger, options);
  assert.equal((await h.db.prisma.notification.findUniqueOrThrow({ where: { id: bad.id } })).status, 'failed');
  assert.ok(h.captured.lines.some((l) => l.msg === 'notification delivery failed'));
});

test('dispatcher: an expired lease returns to queued (AS-NOT-04); a stale run cannot complete a re-leased record', { skip }, async () => {
  const record = await queuedSms();
  await h.db.prisma.$executeRaw`UPDATE notification SET status = 'sending', lease_token = gen_random_uuid(), lease_expires_at = now() - interval '1 minute'
    WHERE id = ${record.id}::uuid`;
  assert.ok((await recoverExpiredLeases(h.db.prisma)) >= 1);
  assert.equal((await h.db.prisma.notification.findUniqueOrThrow({ where: { id: record.id } })).status, 'queued');

  // A sender that, mid-send, sees its record re-leased to someone else: its completion is fenced off.
  const stale: NotificationSender = {
    channel: 'sms',
    async send() {
      await h.db.prisma.$executeRaw`UPDATE notification SET lease_token = gen_random_uuid() WHERE id = ${record.id}::uuid`;
      return { kind: 'accepted' };
    },
  };
  await dispatchOnce(h.db.prisma, [stale], h.captured.logger, options);
  const after = await h.db.prisma.notification.findUniqueOrThrow({ where: { id: record.id }, include: { attempts: { orderBy: { attemptNo: 'asc' } } } });
  assert.equal(after.status, 'sending', 'the stale completion did not mark it sent');
  assert.equal(after.attempts.at(-1)!.outcome, 'lease_expired');
});

test('dispatcher: two runs in parallel never send the same record twice (SKIP LOCKED)', { skip }, async () => {
  const records = await Promise.all([1, 2, 3, 4].map(() => queuedSms()));
  const a = new FakeSms([]);
  const b = new FakeSms([]);
  await Promise.all([dispatchOnce(h.db.prisma, [a], h.captured.logger, options), dispatchOnce(h.db.prisma, [b], h.captured.logger, options)]);
  const ids = new Set(records.map((r) => r.dedupeKey));
  const sentHere = [...a.sent, ...b.sent].filter((k) => ids.has(k));
  assert.equal(sentHere.length, 4);
  assert.equal(new Set(sentHere).size, 4);
});
