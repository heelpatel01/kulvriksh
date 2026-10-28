import type { AdminCustomerDetail, AdminCustomerSummary, AdminOverviewView, GenealogistProfileView, NotificationOverviewView, OrderView, PaymentStatusView } from '@kulvriksh/shared';
import type { NotificationConfig } from '../notifications/notification-events.ts';
import { maskMobileNumber } from '../auth/mobile.ts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.ts';
import type { PlanSnapshot } from '../payments/payment-store.ts';

// Read models for the admin overview, customer management (F-ADM-01, read only: status actions
// are TBC, R35) and the genealogist's own profile. Every list is bounded and paginated; counts are
// aggregate queries, never row scans in application code.

type ReportCounts = Record<'draft' | 'submitted' | 'returned' | 'released', number>;
const emptyReports = (): ReportCounts => ({ draft: 0, submitted: 0, returned: 0, released: 0 });

export interface AdminStore {
  overview(payments: PaymentStatusView): Promise<AdminOverviewView>;
  customers(input: { limit: number; before?: string; search?: string }): Promise<{ customers: AdminCustomerSummary[]; nextBefore: string | null }>;
  customer(id: string): Promise<AdminCustomerDetail | undefined>;
  genealogistProfile(userId: string): Promise<GenealogistProfileView | undefined>;
  notificationOverview(config: NotificationConfig): Promise<NotificationOverviewView>;
}

/**
 * The candidate events of Flows §11.1. Only "report released" (in-app) is implemented, because it
 * was explicitly requested (TASK-10); the others wait for the confirmed event list (R36) and for
 * delivery providers (R37). Nothing here invents message content.
 */
const CANDIDATE_EVENTS = [
  { eventKey: 'enquiry.received', trigger: 'Enquiry submitted (F-PUB-04)', recipient: 'Admin' },
  { eventKey: 'order.paid', trigger: 'Payment confirmed (F-ORD-03)', recipient: 'Customer' },
  { eventKey: 'assignment.created', trigger: 'Genealogist assigned (F-ADM-03)', recipient: 'Genealogist' },
  { eventKey: 'report.submitted', trigger: 'Report submitted (F-GEN-04)', recipient: 'Admin/approver' },
  { eventKey: 'report.returned', trigger: 'Report returned (F-REP-02)', recipient: 'Genealogist' },
] as const;

const customerSelect = {
  id: true,
  status: true,
  createdAt: true,
  customerProfile: { select: { mobileNumber: true, displayName: true } },
  workspace: { select: { id: true, name: true, _count: { select: { members: true } } } },
  sessions: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' }, take: 1 },
  _count: { select: { orders: { where: { status: 'paid' } } } },
} as const;

type CustomerRow = Prisma.AppUserGetPayload<{ select: typeof customerSelect }>;

const toSummary = (row: CustomerRow): AdminCustomerSummary => ({
  id: row.id,
  mobileMasked: row.customerProfile ? maskMobileNumber(row.customerProfile.mobileNumber) : '',
  displayName: row.customerProfile?.displayName ?? null,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  lastSeenAt: row.sessions[0]?.lastSeenAt.toISOString() ?? null,
  workspace: row.workspace ? { id: row.workspace.id, name: row.workspace.name, memberCount: row.workspace._count.members } : null,
  paidOrders: row._count.orders,
});

async function reportCounts(prisma: PrismaClient, where: Prisma.ReportWhereInput): Promise<ReportCounts> {
  const groups = await prisma.report.groupBy({ by: ['status'], where, _count: { _all: true } });
  const out = emptyReports();
  for (const g of groups) {
    out[g.status] = g._count._all;
  }
  return out;
}

export function createPrismaAdminStore(prisma: PrismaClient): AdminStore {
  return {
    async overview(payments) {
      const day = 86_400_000;
      const since30 = new Date(Date.now() - 30 * day);
      const since7 = new Date(Date.now() - 7 * day);
      const [
        customersByStatus,
        withWorkspace,
        newCustomers,
        workspaces,
        members,
        relationships,
        activeAssignments,
        unassigned,
        reports,
        ordersByStatus,
        paidRecent,
        revenue,
        amountMismatch,
        unreconciled,
        grantsFailed,
        grantsStuck,
        webhookAttention,
        exportsByStatus,
        exportsReady7,
        exportsFailed7,
        staffByRole,
        staffDeactivated,
      ] = await Promise.all([
        prisma.appUser.groupBy({ by: ['status'], where: { role: 'customer' }, _count: { _all: true } }),
        prisma.familyWorkspace.count(),
        prisma.appUser.count({ where: { role: 'customer', createdAt: { gte: since30 } } }),
        prisma.familyWorkspace.count(),
        prisma.familyMember.count(),
        prisma.relationship.count(),
        prisma.assignment.count({ where: { removedAt: null } }),
        prisma.familyWorkspace.count({ where: { assignments: { none: { removedAt: null } } } }),
        reportCounts(prisma, {}),
        prisma.customerOrder.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.customerOrder.count({ where: { status: 'paid', paidAt: { gte: since30 } } }),
        prisma.customerOrder.groupBy({ by: ['currency'], where: { status: 'paid' }, _sum: { amountMinor: true } }),
        prisma.customerOrder.count({ where: { attentionReason: 'amount_mismatch' } }),
        prisma.customerOrder.count({ where: { attentionReason: 'unreconciled', status: { not: 'paid' } } }),
        prisma.entitlementGrant.count({ where: { status: 'failed' } }),
        prisma.entitlementGrant.count({ where: { status: 'pending', createdAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
        prisma.webhookEvent.count({ where: { status: 'needs_attention' } }),
        prisma.exportJob.groupBy({ by: ['status'], where: { status: { in: ['queued', 'running'] } }, _count: { _all: true } }),
        prisma.exportJob.count({ where: { status: 'ready', finishedAt: { gte: since7 } } }),
        prisma.exportJob.count({ where: { status: 'failed', finishedAt: { gte: since7 } } }),
        prisma.appUser.groupBy({ by: ['role'], where: { role: { in: ['admin', 'genealogist'] }, status: 'active' }, _count: { _all: true } }),
        prisma.appUser.count({ where: { role: { in: ['admin', 'genealogist'] }, status: 'deactivated' } }),
      ]);
      const byStatus = (s: string) => customersByStatus.find((g) => g.status === s)?._count._all ?? 0;
      const orders = (s: string) => ordersByStatus.find((g) => g.status === s)?._count._all ?? 0;
      const exportsOf = (s: string) => exportsByStatus.find((g) => g.status === s)?._count._all ?? 0;
      const staff = (r: string) => staffByRole.find((g) => g.role === r)?._count._all ?? 0;
      return {
        generatedAt: new Date().toISOString(),
        customers: { total: byStatus('active') + byStatus('deactivated'), active: byStatus('active'), deactivated: byStatus('deactivated'), withWorkspace, newLast30Days: newCustomers },
        family: { workspaces, members, relationships },
        research: { activeAssignments, unassignedWorkspaces: unassigned, reports },
        orders: {
          created: orders('created'),
          pending: orders('pending'),
          paid: orders('paid'),
          failed: orders('failed'),
          paidLast30Days: paidRecent,
          revenue: revenue.map((r) => ({ currency: r.currency, amountMinor: Number(r._sum.amountMinor ?? 0n) })),
        },
        attention: { amountMismatch, unreconciled, grantsFailed, grantsStuck, webhookAttention, reportsAwaitingReview: reports.submitted },
        exports: { queued: exportsOf('queued'), running: exportsOf('running'), readyLast7Days: exportsReady7, failedLast7Days: exportsFailed7 },
        staff: { admins: staff('admin'), genealogists: staff('genealogist'), deactivated: staffDeactivated },
        payments,
      };
    },

    async customers({ limit, before, search }) {
      const cursor = before ? /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/.exec(before) : null;
      const digits = search?.replace(/\D/g, '') ?? '';
      const rows = await prisma.appUser.findMany({
        where: {
          role: 'customer',
          ...(search
            ? {
                customerProfile: {
                  is: digits.length >= 3 ? { OR: [{ mobileNumber: { contains: digits } }, { displayName: { contains: search, mode: 'insensitive' } }] } : { displayName: { contains: search, mode: 'insensitive' } },
                },
              }
            : {}),
          ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor[1]!) } }, { createdAt: new Date(cursor[1]!), id: { lt: cursor[2]! } }] } : {}),
        },
        select: customerSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return { customers: page.map(toSummary), nextBefore: rows.length > limit && last ? `${last.createdAt.toISOString()}_${last.id}` : null };
    },

    async customer(id) {
      const row = await prisma.appUser.findFirst({ where: { id, role: 'customer' }, select: customerSelect });
      if (!row?.customerProfile) {
        return undefined;
      }
      const now = new Date();
      const [activeSessions, assignment, reports, orders, entitlements, activity] = await Promise.all([
        prisma.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: now } } }),
        row.workspace
          ? prisma.assignment.findFirst({
              where: { workspaceId: row.workspace.id, removedAt: null },
              select: { assignedAt: true, genealogist: { select: { staffProfile: { select: { displayName: true } } } } },
            })
          : null,
        row.workspace ? reportCounts(prisma, { workspaceId: row.workspace.id }) : emptyReports(),
        prisma.customerOrder.findMany({
          where: { customerUserId: id },
          select: { id: true, status: true, planId: true, planSnapshot: true, amountMinor: true, currency: true, provider: true, createdAt: true, paidAt: true, attentionReason: true, grant: { select: { status: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
        }),
        prisma.entitlement.findMany({
          where: { customerUserId: id, OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
          select: { entitlementKey: true, validFrom: true, validUntil: true, grant: { select: { orderId: true } } },
          take: 100,
        }),
        prisma.auditEvent.findMany({
          where: { actorUserId: id },
          select: { occurredAt: true, action: true, outcome: true },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 15,
        }),
      ]);
      return {
        ...toSummary(row),
        mobileNumber: row.customerProfile.mobileNumber,
        activeSessions,
        assignment: assignment ? { genealogistName: assignment.genealogist.staffProfile?.displayName ?? 'Genealogist', assignedAt: assignment.assignedAt.toISOString() } : null,
        reports,
        orders: orders.map(
          (o): OrderView => ({
            id: o.id,
            status: o.status,
            planId: o.planId,
            planName: (o.planSnapshot as unknown as PlanSnapshot).planName,
            serviceName: (o.planSnapshot as unknown as PlanSnapshot).serviceName,
            amountMinor: Number(o.amountMinor),
            currency: o.currency,
            provider: o.provider,
            createdAt: o.createdAt.toISOString(),
            paidAt: o.paidAt?.toISOString() ?? null,
            grantStatus: o.grant?.status ?? null,
            attentionReason: o.attentionReason,
          }),
        ),
        entitlements: entitlements.map((e) => ({ key: e.entitlementKey, validFrom: e.validFrom.toISOString(), validUntil: e.validUntil?.toISOString() ?? null, orderId: e.grant.orderId })),
        recentActivity: activity.map((a) => ({ occurredAt: a.occurredAt.toISOString(), action: a.action, outcome: a.outcome })),
      };
    },

    async notificationOverview(config) {
      const [groups, recent] = await Promise.all([
        prisma.notification.groupBy({ by: ['eventKey', 'channel', 'status'], _count: { _all: true } }),
        prisma.notification.findMany({
          select: { id: true, eventKey: true, channel: true, status: true, attemptCount: true, lastErrorCode: true, createdAt: true, sentAt: true, readAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 25,
        }),
      ]);
      return {
        events: [
          {
            eventKey: 'report.released',
            trigger: 'Report released (F-REP-01)',
            recipient: 'Customer',
            status: config.reportReleasedChannels.length > 0 ? 'active' : 'awaiting_decision',
            channels: [...config.reportReleasedChannels],
          },
          ...CANDIDATE_EVENTS.map((e) => ({ ...e, status: 'awaiting_decision' as const, channels: [] })),
        ],
        providers: { email: 'none', sms: 'none' },
        counts: groups.map((g) => ({ eventKey: g.eventKey, channel: g.channel, status: g.status, count: g._count._all })),
        recent: recent.map((n) => ({
          id: n.id,
          eventKey: n.eventKey,
          channel: n.channel,
          status: n.status,
          attemptCount: n.attemptCount,
          lastErrorCode: n.lastErrorCode,
          createdAt: n.createdAt.toISOString(),
          sentAt: n.sentAt?.toISOString() ?? null,
          readAt: n.readAt?.toISOString() ?? null,
        })),
      };
    },

    async genealogistProfile(userId) {
      const row = await prisma.appUser.findFirst({
        where: { id: userId, role: 'genealogist' },
        select: { createdAt: true, staffProfile: { select: { displayName: true } }, staffCredential: { select: { email: true } }, staffMfa: { select: { enabledAt: true } } },
      });
      if (!row?.staffProfile || !row.staffCredential) {
        return undefined;
      }
      const [activeAssignments, reports] = await Promise.all([
        prisma.assignment.count({ where: { genealogistUserId: userId, removedAt: null } }),
        reportCounts(prisma, { authorUserId: userId }),
      ]);
      return {
        displayName: row.staffProfile.displayName,
        email: row.staffCredential.email,
        createdAt: row.createdAt.toISOString(),
        mfaEnabled: Boolean(row.staffMfa?.enabledAt),
        activeAssignments,
        reports,
      };
    },
  };
}
