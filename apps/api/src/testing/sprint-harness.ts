// Test-only: the whole API wired to the real test database (kulvriksh_test) as the runtime role,
// for the TASK-09 integration tests. Every user, workspace and key it creates is tracked and
// deleted by cleanup(). Audit rows can only be deleted through the owner connection, because the
// runtime role is append-only on audit_event by design.
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaAdminStore } from '../admin/admin-store.ts';
import { createApp } from '../app.ts';
import { createAuditReader, createAuditWriter } from '../audit/audit.ts';
import { DEFAULT_AUTH_SETTINGS, type AuthSettings } from '../auth/auth-config.ts';
import { hashSessionToken, newSessionToken, subjectKey } from '../auth/auth-crypto.ts';
import { createAuthService } from '../auth/auth-service.ts';
import { createPrismaAuthStore } from '../auth/auth-store.ts';
import { createPrismaProfileStore } from '../customers/profile.ts';
import { createDatabase, type Database } from '../db.ts';
import { readExportConfig, type ExportConfig } from '../export/export-config.ts';
import { createExportService, type EntitlementCheck, type ExportService } from '../export/export-service.ts';
import { createPrismaExportStore } from '../export/export-store.ts';
import { createPrismaFamilyStore, type FamilyLimits } from '../family/family-store.ts';
import { readPaymentConfig, type PaymentConfig } from '../payments/payment-config.ts';
import { createPaymentService, type PaymentService } from '../payments/payment-service.ts';
import { createPrismaPaymentStore, type PaymentFaults, type PaymentStore } from '../payments/payment-store.ts';
import type { PaymentProvider } from '../payments/provider.ts';
import { createFileService } from '../files/file-service.ts';
import { createPrismaFileStore } from '../files/file-store.ts';
import { DEFAULT_NOTIFICATION_CONFIG } from '../notifications/notification-events.ts';
import { createPrismaNotificationStore } from '../notifications/notification-store.ts';
import { createPrismaResearchStore } from '../research/research-store.ts';
import { createPrismaServiceRepository } from '../services/service-repository.ts';
import { hashPassword } from '../staff/password.ts';
import { DevelopmentStaffOutbox } from '../staff/staff-delivery.ts';
import { createPrismaStaffLifecycleStore } from '../staff/staff-lifecycle-store.ts';
import { createStaffAuthService } from '../staff/staff-service.ts';
import { readStorageConfig, type StorageConfig } from '../storage/storage-config.ts';
import { LocalDiskStorage } from '../storage/storage.ts';
import { createPrismaStaffStore } from '../staff/staff-store.ts';
import { captureLogger, startServer, type CapturedLogger, type RunningServer } from './helpers.ts';

export const TEST_URL = process.env.TEST_DATABASE_URL;
export const OWNER_URL = process.env.TEST_MIGRATION_DATABASE_URL;
export const skip = TEST_URL && OWNER_URL ? false : 'TEST_DATABASE_URL / TEST_MIGRATION_DATABASE_URL not set (run `npm run test:db`)';

const OTP_KEY = `otp-${randomUUID()}-${randomUUID()}`;
const RATE_KEY = `rate-${randomUUID()}-${randomUUID()}`;
export const MFA_KEY = `mfa-${randomUUID()}-${randomUUID()}`;
export const STAFF_PASSWORD = 'correct horse battery staple';

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

export interface Harness {
  db: Database;
  base: string;
  captured: CapturedLogger;
  ip: string;
  /** A signed-in customer created directly in the database, with a live session token. */
  customer(): Promise<{ userId: string; token: string }>;
  /** A staff account (scrypt password) signed in through the real API. */
  staff(role: 'genealogist' | 'admin', options?: { signIn?: boolean }): Promise<{ userId: string; email: string; token: string }>;
  api<T = Record<string, unknown>>(token: string | undefined, method: string, path: string, body?: unknown): Promise<ApiResult<T>>;
  /** Raw upload (application/octet-stream) and raw download, for file routes. */
  upload<T = Record<string, unknown>>(token: string, path: string, bytes: Buffer, filename?: string): Promise<ApiResult<T>>;
  raw(token: string | undefined, path: string): Promise<Response>;
  /** This harness's private storage directory (removed by close()). */
  storageDir: string;
  staffOutbox: DevelopmentStaffOutbox;
  storage: StorageConfig;
  exports: ExportService;
  payments: PaymentService;
  paymentStore: PaymentStore;
  close(): Promise<void>;
}

const created = { users: new Set<string>(), emails: new Set<string>(), ips: new Set<string>(), services: new Set<string>() };

/** Registers a catalogue service a test created (its plans are deleted with it). */
export function trackService(serviceId: string): string {
  created.services.add(serviceId);
  return serviceId;
}

/** Registers an account a test created through the API (e.g. POST /admin/staff), for cleanup. */
export function trackUser(userId: string, email?: string): string {
  created.users.add(userId);
  if (email) {
    created.emails.add(email);
  }
  return userId;
}

/** Registers an email that a test signs in with without creating it, so its rows are cleaned up too. */
export function trackEmail(email: string): string {
  created.emails.add(email);
  return email;
}

export async function harness(
  options: {
    settings?: Partial<AuthSettings>;
    limits?: FamilyLimits;
    storage?: Partial<StorageConfig>;
    mfa?: boolean;
    export?: Partial<ExportConfig>;
    exportEntitlement?: EntitlementCheck;
    payments?: { provider?: PaymentProvider; config?: Partial<PaymentConfig>; faults?: PaymentFaults; gateExportWith?: string };
  } = {},
): Promise<Harness> {
  const db = createDatabase(TEST_URL ?? '');
  const storageDir = mkdtempSync(join(tmpdir(), 'kulvriksh-itest-storage-'));
  const storageConfig: StorageConfig = { ...readStorageConfig({}, 'test', []), localDir: storageDir, ...options.storage };
  const staffOutbox = new DevelopmentStaffOutbox();
  const captured = captureLogger();
  const settings = { ...DEFAULT_AUTH_SETTINGS, ...options.settings };
  const audit = createAuditWriter(db.prisma, captured.logger);
  const authStore = createPrismaAuthStore(db.prisma);
  const staffStore = createPrismaStaffStore(db.prisma);
  const auth = createAuthService({ store: authStore, settings, otpHmacKey: OTP_KEY, rateLimitHmacKey: RATE_KEY, logger: captured.logger, audit });
  const lifecycle = createPrismaStaffLifecycleStore(db.prisma);
  const staffAuth = createStaffAuthService({
    authStore,
    staffStore,
    lifecycle,
    settings,
    rateLimitHmacKey: RATE_KEY,
    ...(options.mfa === false ? {} : { mfaKey: MFA_KEY }),
    sender: staffOutbox,
    logger: captured.logger,
    audit,
  });
  const fileStore = createPrismaFileStore(db.prisma);
  const diskStorage = new LocalDiskStorage(storageDir);
  const files = createFileService({ storage: diskStorage, store: fileStore, config: storageConfig, logger: captured.logger });
  const familyLimits = options.limits ?? { maxMembers: 500, maxRelationships: 2000 };
  const gateKey = options.payments?.gateExportWith;
  const paymentConfig: PaymentConfig = { ...readPaymentConfig({}, 'test', []), ...options.payments?.config, ...(gateKey ? { gates: { tree_export: gateKey } } : {}) };
  const paymentStore = createPrismaPaymentStore(db.prisma, options.payments?.faults);
  const payments = createPaymentService({ store: paymentStore, provider: options.payments?.provider, config: paymentConfig, logger: captured.logger });
  // Same wiring as server.ts: the export gate comes from the payment configuration.
  const exportEntitlement = payments.gate('tree_export') ?? options.exportEntitlement;
  const exportConfig: ExportConfig = { ...readExportConfig({}, []), ...options.export };
  const exportStore = createPrismaExportStore(db.prisma);
  const exports = createExportService({
    store: exportStore,
    storage: diskStorage,
    config: exportConfig,
    logger: captured.logger,
    ...(exportEntitlement ? { entitlement: exportEntitlement } : {}),
  });
  const server: RunningServer = await startServer(
    createApp({
      logger: captured.logger,
      database: db.probe,
      auth,
      staffAuth,
      staffStore,
      profiles: createPrismaProfileStore(db.prisma),
      family: createPrismaFamilyStore(db.prisma, familyLimits),
      research: createPrismaResearchStore(db.prisma, DEFAULT_NOTIFICATION_CONFIG),
      auditReader: createAuditReader(db.prisma),
      services: createPrismaServiceRepository(db.prisma),
      staffLifecycle: lifecycle,
      authSettings: settings,
      notifications: createPrismaNotificationStore(db.prisma),
      files,
      fileStore,
      exports,
      exportStore,
      exportConfig,
      payments,
      paymentStore,
      adminStore: createPrismaAdminStore(db.prisma),
    }),
  );
  // A distinct address per harness in this process, so per-IP rate limits never collide.
  let ip: string;
  do {
    ip = `203.0.113.${randomInt(1, 255)}`;
  } while (created.ips.has(ip));
  created.ips.add(ip);

  const api: Harness['api'] = async (token, method, path, body) => {
    const res = await fetch(`${server.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        'x-forwarded-for': ip,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as never };
  };

  return {
    db,
    base: server.baseUrl,
    storageDir,
    staffOutbox,
    storage: storageConfig,
    exports,
    payments,
    paymentStore,
    async upload(token, path, bytes, filename) {
      const res = await fetch(`${server.baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: {
          'x-forwarded-for': ip,
          'content-type': 'application/octet-stream',
          authorization: `Bearer ${token}`,
          ...(filename ? { 'x-file-name': encodeURIComponent(filename) } : {}),
        },
        body: bytes,
      });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : {}) as never };
    },
    raw: (token, path) => fetch(`${server.baseUrl}/api/v1${path}`, { headers: { 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) } }),
    captured,
    ip,
    api,
    async customer() {
      const mobileNumber = `+919${String(randomInt(0, 1e9)).padStart(9, '0')}`;
      const user = await db.prisma.appUser.create({ data: { role: 'customer', customerProfile: { create: { mobileNumber } } } });
      created.users.add(user.id);
      const token = newSessionToken();
      await db.prisma.session.create({
        data: { userId: user.id, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      return { userId: user.id, token };
    },
    async staff(role, { signIn = true } = {}) {
      const email = `itest-${randomUUID().slice(0, 8)}@example.test`;
      created.emails.add(email);
      const userId = await staffStore.createStaff({
        role,
        email,
        displayName: `Test ${role} ${email.slice(6, 10)}`,
        passwordHash: await hashPassword(STAFF_PASSWORD),
      });
      created.users.add(userId);
      if (!signIn) {
        return { userId, email, token: '' };
      }
      const res = await api<{ session: { token: string } }>(undefined, 'POST', '/staff/auth/sign-in', { email, password: STAFF_PASSWORD });
      if (res.status !== 200) {
        throw new Error(`staff sign-in failed: ${res.status}`);
      }
      return { userId, email, token: res.body.session.token };
    },
    async close() {
      payments.stop();
      await exports.stop();
      await server.close();
      await db.disconnect();
      rmSync(storageDir, { recursive: true, force: true });
    },
  };
}

/** Deletes every row the harnesses created, children first. */
export async function cleanup(): Promise<void> {
  if (!TEST_URL || !OWNER_URL) {
    return;
  }
  const owner = createDatabase(OWNER_URL);
  const p = owner.prisma;
  const users = [...created.users];
  try {
    const workspaces = (await p.familyWorkspace.findMany({ where: { ownerUserId: { in: users } }, select: { id: true } })).map((w) => w.id);
    await p.auditEvent.deleteMany({
      where: { OR: [{ actorUserId: { in: users } }, { workspaceId: { in: workspaces } }, { targetId: { in: users } }] },
    });
    // Failure events of anonymous sign-in attempts are keyed by subject, not by user.
    const subjects = [...created.emails].map((e) => subjectKey(RATE_KEY, 'audit:staff_subject', e).slice(0, 32));
    await p.auditEvent.deleteMany({ where: { targetId: { in: subjects } } });
    await p.notificationAttempt.deleteMany({ where: { notification: { recipientUserId: { in: users } } } });
    await p.notification.deleteMany({ where: { recipientUserId: { in: users } } });
    await p.mediaItem.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.report.updateMany({ where: { workspaceId: { in: workspaces } }, data: { reportFileId: null } });
    await p.exportJob.deleteMany({ where: { OR: [{ workspaceId: { in: workspaces } }, { requestedByUserId: { in: users } }] } });
    // Payments: everything hangs off the test customers' orders and the test services' plans.
    const services = [...created.services];
    const orders = (await p.customerOrder.findMany({ where: { OR: [{ customerUserId: { in: users } }, { plan: { serviceId: { in: services } } }] }, select: { id: true } })).map((o) => o.id);
    await p.auditEvent.deleteMany({ where: { targetId: { in: [...orders, ...services, 'webhook'] } } });
    const plans = (await p.plan.findMany({ where: { serviceId: { in: services } }, select: { id: true } })).map((x) => x.id);
    await p.auditEvent.deleteMany({ where: { targetId: { in: plans } } });
    await p.entitlement.deleteMany({ where: { OR: [{ customerUserId: { in: users } }, { grant: { orderId: { in: orders } } }] } });
    await p.entitlementGrant.deleteMany({ where: { orderId: { in: orders } } });
    await p.paymentAttempt.deleteMany({ where: { orderId: { in: orders } } });
    await p.webhookEvent.deleteMany({ where: { OR: [{ relatedOrderId: { in: orders } }, { providerEventId: { startsWith: 'evt_itest_' } }] } });
    await p.customerOrder.deleteMany({ where: { id: { in: orders } } });
    await p.planEntitlement.deleteMany({ where: { planId: { in: plans } } });
    await p.plan.deleteMany({ where: { id: { in: plans } } });
    await p.service.deleteMany({ where: { id: { in: services } } });
    // Task leases exist in the test database only because the payment tests ran them.
    await p.backgroundTaskState.deleteMany({ where: { taskName: { in: ['payment_reconciliation', 'grant_recovery'] } } });
    await p.storedFile.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.staffToken.deleteMany({ where: { userId: { in: users } } });
    await p.staffMfa.deleteMany({ where: { userId: { in: users } } });
    await p.relationship.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.familyMember.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.researchRecord.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.report.deleteMany({ where: { workspaceId: { in: workspaces } } });
    await p.assignment.deleteMany({ where: { OR: [{ workspaceId: { in: workspaces } }, { genealogistUserId: { in: users } }] } });
    await p.familyWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await p.session.deleteMany({ where: { userId: { in: users } } });
    await p.staffCredential.deleteMany({ where: { userId: { in: users } } });
    await p.staffProfile.deleteMany({ where: { userId: { in: users } } });
    await p.customerProfile.deleteMany({ where: { userId: { in: users } } });
    await p.appUser.deleteMany({ where: { id: { in: users } } });
    const keys = [
      ...[...created.emails].flatMap((e) =>
        ['staff_sign_in_fail:account', 'lockout:staff_sign_in', 'staff_reset:account'].map((purpose) => subjectKey(RATE_KEY, purpose, e)),
      ),
      ...[...created.ips].flatMap((ip) => ['staff_sign_in:ip', 'staff_reset:ip', 'staff_mfa:ip'].map((purpose) => subjectKey(RATE_KEY, purpose, ip))),
    ];
    await p.rateLimitBucket.deleteMany({ where: { bucketKey: { in: keys } } });
    await p.authLockout.deleteMany({ where: { subjectKey: { in: keys } } });
  } finally {
    await owner.disconnect();
  }
}
