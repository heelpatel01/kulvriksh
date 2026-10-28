import type { NotificationView } from '@kulvriksh/shared';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import { TEMPLATE_VERSION, type Channel } from './notification-events.ts';

// Notification records (DM §9.3). Writes happen inside the triggering transaction, so a
// notification exists only for a change that committed (F-NOT-01 step 1). The dedupe key makes a
// repeated trigger produce one record per recipient and channel (AS-NOT-02).

type Tx = Prisma.TransactionClient;

export interface NotificationInput {
  eventKey: string;
  sourceType: string;
  sourceId: string;
  workspaceId?: string;
  recipientUserId: string;
  title: string;
  body: string;
  channels: readonly Channel[];
}

/** Writes one record per channel; returns how many were new (0 on a repeated trigger). */
export async function writeNotifications(tx: Tx, input: NotificationInput): Promise<number> {
  let created = 0;
  for (const channel of input.channels) {
    let address: string | null = null;
    if (channel === 'sms') {
      // Customers' only contact detail is their sign-in number. Email addresses are not collected (R8).
      address = (await tx.customerProfile.findUnique({ where: { userId: input.recipientUserId }, select: { mobileNumber: true } }))?.mobileNumber ?? null;
      if (!address) {
        continue;
      }
    } else if (channel === 'email') {
      continue;
    }
    const dedupeKey = `${input.eventKey}:${input.sourceType}:${input.sourceId}:${input.recipientUserId}:${channel}`;
    // In-app records are delivered by being stored: they start as sent. Others wait for dispatch.
    created += await tx.$executeRaw`
      INSERT INTO notification (event_key, channel, template_version, recipient_user_id, recipient_address, title, rendered_body,
                                source_type, source_id, workspace_id, dedupe_key, status, sent_at)
      VALUES (${input.eventKey}, ${channel}::notification_channel, ${TEMPLATE_VERSION}, ${input.recipientUserId}::uuid, ${address},
              ${input.title}, ${input.body}, ${input.sourceType}, ${input.sourceId}::uuid, ${input.workspaceId ?? null}::uuid, ${dedupeKey},
              ${channel === 'in_app' ? 'sent' : 'queued'}::notification_status, ${channel === 'in_app' ? new Date() : null})
      ON CONFLICT (dedupe_key) DO NOTHING`;
  }
  return created;
}

export interface NotificationPage {
  notifications: NotificationView[];
  nextBefore: string | null;
  unread: number;
}

export interface NotificationStore {
  /** The recipient's own in-app notifications, newest first, keyset-paginated. */
  list(userId: string, page: { limit: number; before?: string }): Promise<NotificationPage>;
  unreadCount(userId: string): Promise<number>;
  /** Marks one of the recipient's own notifications read. False when it is not theirs or unknown. */
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;
}

const toView = (row: { id: string; eventKey: string; title: string; renderedBody: string; sourceType: string; sourceId: string; readAt: Date | null; createdAt: Date }): NotificationView => ({
  id: row.id,
  eventKey: row.eventKey,
  title: row.title,
  body: row.renderedBody,
  link: row.eventKey === 'report.released' ? '/dashboard/research' : null,
  readAt: row.readAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export function createPrismaNotificationStore(prisma: PrismaClient): NotificationStore {
  const unreadCount = (userId: string) => prisma.notification.count({ where: { recipientUserId: userId, channel: 'in_app', readAt: null } });
  return {
    unreadCount,

    async list(userId, { limit, before }) {
      // The cursor is a notification ID; it is resolved only within the caller's own records.
      const cursor = before
        ? await prisma.notification.findFirst({ where: { id: before, recipientUserId: userId, channel: 'in_app' }, select: { id: true, createdAt: true } })
        : null;
      const rows = await prisma.notification.findMany({
        where: {
          recipientUserId: userId,
          channel: 'in_app',
          ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
        },
        select: { id: true, eventKey: true, title: true, renderedBody: true, sourceType: true, sourceId: true, readAt: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      return { notifications: page.map(toView), nextBefore: rows.length > limit ? page[page.length - 1]!.id : null, unread: await unreadCount(userId) };
    },

    async markRead(userId, id) {
      // Idempotent: marking an already-read notification keeps its first read time.
      const updated = await prisma.$executeRaw`
        UPDATE notification SET read_at = coalesce(read_at, now()), updated_at = now()
        WHERE id = ${id}::uuid AND recipient_user_id = ${userId}::uuid AND channel = 'in_app'`;
      return updated === 1;
    },

    async markAllRead(userId) {
      const updated = await prisma.notification.updateMany({ where: { recipientUserId: userId, channel: 'in_app', readAt: null }, data: { readAt: new Date() } });
      return updated.count;
    },
  };
}
