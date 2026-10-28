import { createServer } from 'node:http';
import { createPrismaAdminStore } from './admin/admin-store.ts';
import { createApp } from './app.ts';
import { createAuditReader, createAuditWriter } from './audit/audit.ts';
import { createAuthService, type AuthService } from './auth/auth-service.ts';
import { createPrismaAuthStore } from './auth/auth-store.ts';
import { DevelopmentOtpOutbox } from './auth/otp-delivery.ts';
import { ConfigError, loadConfig, type ApiConfig } from './config.ts';
import { createPrismaProfileStore } from './customers/profile.ts';
import { createDatabase } from './db.ts';
import { createExportService } from './export/export-service.ts';
import { createPaymentService } from './payments/payment-service.ts';
import { createPrismaPaymentStore } from './payments/payment-store.ts';
import { DevelopmentProvider, RazorpayProvider } from './payments/provider.ts';
import { createPrismaExportStore } from './export/export-store.ts';
import { createPrismaFamilyStore } from './family/family-store.ts';
import { createLogger } from './logger.ts';
import { createPrismaResearchStore } from './research/research-store.ts';
import { createPrismaServiceRepository } from './services/service-repository.ts';
import { createFileService } from './files/file-service.ts';
import { createPrismaFileStore } from './files/file-store.ts';
import { createPrismaNotificationStore } from './notifications/notification-store.ts';
import { DevelopmentStaffOutbox } from './staff/staff-delivery.ts';
import { createPrismaStaffLifecycleStore } from './staff/staff-lifecycle-store.ts';
import { createStaffAuthService, type StaffAuthService } from './staff/staff-service.ts';
import { LocalDiskStorage } from './storage/storage.ts';
import { createPrismaStaffStore } from './staff/staff-store.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function readConfig(): ApiConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      createLogger({ level: 'error' }).error('configuration error', { issues: err.issues });
      process.exit(1);
    }
    throw err;
  }
}

const config = readConfig();
const logger = createLogger({ level: config.logLevel, bindings: { service: 'kulvriksh-api' } });

// One shared database client per process. It connects lazily: startup succeeds while
// PostgreSQL is down, and /ready reports the database state.
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
if (!database) {
  logger.warn('DATABASE_URL is not set: database-backed routes answer 503');
}

// Sessions (customer and staff) need the database and both HMAC keys. Customer code requests also
// need a delivery channel: no SMS provider is configured yet, so outside local development they
// answer 503 instead of pretending to send. Staff sign-in does not depend on it.
const { auth: authConfig } = config;
const devOtpOutbox = authConfig.otpDelivery === 'development' ? new DevelopmentOtpOutbox() : undefined;
const audit = database ? createAuditWriter(database.prisma, logger) : undefined;
let auth: AuthService | undefined;
let staffAuth: StaffAuthService | undefined;
const staffStore = database ? createPrismaStaffStore(database.prisma) : undefined;
const staffLifecycle = database ? createPrismaStaffLifecycleStore(database.prisma) : undefined;
// Development only (OTP_DELIVERY=development is refused outside development): reset links stay in memory.
const devStaffOutbox = devOtpOutbox ? new DevelopmentStaffOutbox() : undefined;
if (database && staffStore && staffLifecycle && authConfig.otpHmacKey && authConfig.rateLimitHmacKey) {
  const authStore = createPrismaAuthStore(database.prisma);
  auth = createAuthService({
    store: authStore,
    sender: devOtpOutbox,
    settings: authConfig.settings,
    otpHmacKey: authConfig.otpHmacKey,
    rateLimitHmacKey: authConfig.rateLimitHmacKey,
    logger,
    audit,
  });
  staffAuth = createStaffAuthService({
    authStore,
    staffStore,
    lifecycle: staffLifecycle,
    settings: authConfig.settings,
    rateLimitHmacKey: authConfig.rateLimitHmacKey,
    ...(authConfig.staffMfaKey ? { mfaKey: authConfig.staffMfaKey } : {}),
    ...(devStaffOutbox ? { sender: devStaffOutbox } : {}),
    logger,
    audit,
  });
  // R34 (admin second factor) is open; say plainly when admins can sign in with a password alone.
  if (!staffAuth.mfaRequiredFor('admin')) {
    logger.warn('admin sign-in does not require a second factor (STAFF_MFA); decision R34 is open', { policy: authConfig.settings.staffMfaPolicy, keyConfigured: Boolean(authConfig.staffMfaKey) });
  }
  if (devOtpOutbox) {
    logger.warn('customer sign-in uses the DEVELOPMENT outbox: codes are not sent by SMS');
  } else {
    logger.warn('customer code requests are disabled: no delivery channel (OTP_DELIVERY) is configured');
  }
} else {
  logger.warn('sign-in is disabled (needs DATABASE_URL, OTP_HMAC_KEY and RATE_LIMIT_HMAC_KEY)');
}

// File storage: the local private-disk adapter only (no object-storage provider is configured).
const storage = config.storage.localDir ? new LocalDiskStorage(config.storage.localDir) : undefined;
const fileStore = database && storage ? createPrismaFileStore(database.prisma) : undefined;
const files = storage && fileStore ? createFileService({ storage, store: fileStore, config: config.storage, logger }) : undefined;
if (!files) {
  logger.warn('file storage is not configured (STORAGE_LOCAL_DIR): uploads and downloads answer 503');
}

// Payments: the provider is whatever PAYMENT_PROVIDER names; with none, ordering answers 503 and
// nothing pretends to take payments. Razorpay credentials are never logged.
const { payments: paymentConfig } = config;
const paymentProvider =
  paymentConfig.provider === 'razorpay' && paymentConfig.razorpay
    ? new RazorpayProvider(paymentConfig.razorpay, paymentConfig.providerTimeoutMs)
    : paymentConfig.provider === 'development'
      ? new DevelopmentProvider()
      : undefined;
const paymentStore = database ? createPrismaPaymentStore(database.prisma) : undefined;
const payments = paymentStore ? createPaymentService({ store: paymentStore, provider: paymentProvider, config: paymentConfig, logger }) : undefined;
payments?.start();
if (!paymentProvider) {
  logger.warn('payments are not configured (PAYMENT_PROVIDER=none): plans can be managed, but ordering answers 503');
} else {
  logger.info('payments configured', { provider: paymentProvider.name, mode: paymentProvider.mode, currency: paymentConfig.currency });
  if (paymentProvider.mode === 'development') {
    logger.warn('payments use the DEVELOPMENT simulated gateway: no real money moves');
  }
}

// Family tree PDF export: in-process jobs in worker threads, files through the same storage.
const exportStore = database && storage ? createPrismaExportStore(database.prisma) : undefined;
const exportGate = payments?.gate('tree_export');
const exports =
  exportStore && storage
    ? createExportService({ store: exportStore, storage, config: config.export, logger, ...(exportGate ? { entitlement: exportGate } : {}) })
    : undefined;
exports?.start();

// An explicit http.Server is used because Express 5's app.listen() also calls its callback
// on failure (e.g. EADDRINUSE). server.listen() calls it only once listening has succeeded.
const server = createServer(
  createApp({
    logger,
    database: database?.probe,
    services: database ? createPrismaServiceRepository(database.prisma) : undefined,
    adminPreviewToken: config.adminPreviewToken,
    auth,
    devOtpOutbox,
    staffAuth,
    staffStore,
    profiles: database ? createPrismaProfileStore(database.prisma) : undefined,
    profileFields: config.profileFields,
    family: database ? createPrismaFamilyStore(database.prisma, config.family) : undefined,
    research: database ? createPrismaResearchStore(database.prisma, config.notifications) : undefined,
    auditReader: database ? createAuditReader(database.prisma) : undefined,
    staffLifecycle,
    authSettings: authConfig.settings,
    devStaffOutbox,
    notifications: database ? createPrismaNotificationStore(database.prisma) : undefined,
    files,
    fileStore,
    exports,
    exportStore,
    exportConfig: config.export,
    payments,
    paymentStore,
    adminStore: database ? createPrismaAdminStore(database.prisma) : undefined,
    notificationConfig: config.notifications,
    nodeEnv: config.nodeEnv,
  }),
);

server.on('error', (err) => {
  logger.error('server error', { err });
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  logger.info('listening', { url: `http://${config.host}:${config.port}`, nodeEnv: config.nodeEnv });
});

let shuttingDown = false;

function shutdown(reason: string, exitCode: number): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info('shutting down', { reason });

  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out, exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error('error while closing', { err });
      process.exit(1);
    }
    // In-flight requests have finished; stop running exports (marked interrupted), then release
    // the database connections last.
    payments?.stop();
    (exports ? exports.stop() : Promise.resolve())
      .then(() => (database ? database.disconnect() : undefined))
      .then(
        () => process.exit(exitCode),
        (disconnectError: unknown) => {
          logger.error('error while disconnecting from the database', { err: disconnectError });
          process.exit(1);
        },
      );
  });
  server.closeIdleConnections();
}

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// After an unexpected error the process state is unknown: log it, stop accepting work, exit non-zero.
process.on('uncaughtException', (err) => {
  logger.error('uncaught exception', { err });
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', { err: reason });
  shutdown('unhandledRejection', 1);
});
