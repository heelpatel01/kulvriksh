import express, { type Express } from 'express';
import type { HealthResponse, ReadinessResponse, SystemStatusView } from '@kulvriksh/shared';
import { adminRoutes } from './admin/admin-routes.ts';
import type { AdminStore } from './admin/admin-store.ts';
import type { AuditReader } from './audit/audit.ts';
import { authRoutes } from './auth/auth-routes.ts';
import type { AuthSettings } from './auth/auth-config.ts';
import type { AuthService } from './auth/auth-service.ts';
import type { DevelopmentOtpOutbox } from './auth/otp-delivery.ts';
import { PROFILE_FIELDS, profileRoutes, type ProfileField, type ProfileStore } from './customers/profile.ts';
import { createErrorHandler, notFoundHandler } from './errors.ts';
import { exportRoutes } from './export/export-routes.ts';
import { readExportConfig, type ExportConfig } from './export/export-config.ts';
import type { ExportService } from './export/export-service.ts';
import type { ExportStore } from './export/export-store.ts';
import { familyRoutes } from './family/family-routes.ts';
import { fileRoutes } from './files/file-routes.ts';
import type { FileService } from './files/file-service.ts';
import type { FileStore } from './files/file-store.ts';
import type { FamilyStore } from './family/family-store.ts';
import type { Logger } from './logger.ts';
import { accessLog, requestId, securityHeaders } from './middleware.ts';
import { notificationRoutes } from './notifications/notification-routes.ts';
import { paymentRoutes, paymentWebhookRoutes } from './payments/payment-routes.ts';
import type { PaymentService } from './payments/payment-service.ts';
import type { PaymentStore } from './payments/payment-store.ts';
import { DEFAULT_NOTIFICATION_CONFIG, type NotificationConfig } from './notifications/notification-events.ts';
import type { NotificationStore } from './notifications/notification-store.ts';
import { checkDatabase, type DatabaseProbe } from './readiness.ts';
import { researchRoutes } from './research/research-routes.ts';
import type { ResearchStore } from './research/research-store.ts';
import type { ServiceRepository } from './services/service-repository.ts';
import { serviceRoutes } from './services/service-routes.ts';
import type { DevelopmentStaffOutbox } from './staff/staff-delivery.ts';
import type { StaffLifecycleStore } from './staff/staff-lifecycle-store.ts';
import { staffRoutes } from './staff/staff-routes.ts';
import type { StaffAuthService } from './staff/staff-service.ts';
import type { StaffStore } from './staff/staff-store.ts';

export interface AppDependencies {
  logger: Logger;
  /** Database readiness probe. Absent when DATABASE_URL is not configured. */
  database?: DatabaseProbe;
  readinessTimeoutMs?: number;
  services?: ServiceRepository;
  /** Development-only shared secret; opens only the development OTP outbox (see admin-preview.ts). */
  adminPreviewToken?: string;
  /** Sessions for every role, and customer OTP sign-in. Absent: protected routes answer 503. */
  auth?: AuthService;
  /** Development outbox (OTP_DELIVERY=development only). */
  devOtpOutbox?: DevelopmentOtpOutbox;
  staffAuth?: StaffAuthService;
  staffStore?: StaffStore;
  profiles?: ProfileStore;
  profileFields?: readonly ProfileField[];
  family?: FamilyStore;
  research?: ResearchStore;
  auditReader?: AuditReader;
  /** Staff lifecycle (TASK-10): accounts, links, MFA. */
  staffLifecycle?: StaffLifecycleStore;
  authSettings?: AuthSettings;
  /** Development only, like the OTP outbox. */
  devStaffOutbox?: DevelopmentStaffOutbox;
  notifications?: NotificationStore;
  files?: FileService;
  fileStore?: FileStore;
  /** Family tree PDF export (TASK-11). */
  exports?: ExportService;
  exportStore?: ExportStore;
  exportConfig?: ExportConfig;
  /** Plans, orders and payments (TASK-11). */
  payments?: PaymentService;
  paymentStore?: PaymentStore;
  /** Admin overview, customers and the genealogist profile (TASK-11). */
  adminStore?: AdminStore;
  /** Notification channels per event (for the admin overview). */
  notificationConfig?: NotificationConfig;
  nodeEnv?: 'development' | 'test' | 'production';
}

// Versioned API prefix. Where the browser reaches it (same-origin /api via the reverse proxy)
// is still decision AC-14; keeping the prefix inside Express makes either choice a config change.
export const API_PREFIX = '/api/v1';

/** Used when no export configuration is passed (tests): genealogist export stays off. */
const DEFAULT_EXPORT_CONFIG = readExportConfig({}, []);

/** Settings that shape access, shown read-only to admins with the decision each one waits for. */
function accessPolicies(deps: AppDependencies) {
  const settings = deps.authSettings;
  const exportConfig = deps.exportConfig ?? DEFAULT_EXPORT_CONFIG;
  const gates = Object.entries(deps.payments?.status.gates ?? {});
  return [
    { name: 'Staff second factor (STAFF_MFA)', value: settings?.staffMfaPolicy ?? 'optional', decision: 'R34' },
    { name: 'Admins may manage other admins', value: settings?.staffAdminsMayManageAdmins ? 'yes' : 'no', decision: 'R33' },
    { name: 'Genealogist tree export (EXPORT_GENEALOGIST_ACCESS)', value: exportConfig.genealogistAccess, decision: 'R28, FQ-25' },
    { name: 'Admin tree export', value: 'denied', decision: 'FQ-14' },
    { name: 'Export file retention', value: `${exportConfig.retentionHours} hours`, decision: 'FQ-11' },
    { name: 'Payment provider', value: deps.payments?.status.provider ?? 'none', decision: 'Phase 5' },
    { name: 'Entitlement-gated features', value: gates.length ? gates.map(([f, k]) => `${f} needs ${k}`).join(', ') : 'none', decision: 'R14' },
    { name: 'Customer status actions', value: 'none (read only)', decision: 'R35' },
  ];
}

/** Integration status from this server's own configuration (no secrets, nothing guessed). */
async function systemStatus(deps: AppDependencies): Promise<SystemStatusView> {
  const database = await checkDatabase(deps.database, deps.logger, deps.readinessTimeoutMs);
  const payments = deps.payments?.status;
  const integration = (id: string, name: string, purpose: string, status: SystemStatusView['integrations'][number]['status'], detail: string) => ({ id, name, purpose, status, detail });
  return {
    environment: deps.nodeEnv ?? 'development',
    database,
    integrations: [
      integration('db', 'PostgreSQL', 'Persistent data', database === 'up' ? 'connected' : 'not_configured', database === 'up' ? 'Reachable now.' : 'Not reachable or not configured.'),
      integration('storage', 'File storage', 'Private media, reports and PDF exports', deps.files ? 'connected' : 'not_configured', deps.files ? 'Local private disk (no cloud storage provider is configured).' : 'STORAGE_LOCAL_DIR is not set: uploads and exports answer 503.'),
      integration(
        'payments',
        'Payments',
        'Plans and orders',
        !payments || payments.provider === 'none' ? 'not_configured' : payments.provider === 'development' ? 'development_only' : 'connected',
        !payments || payments.provider === 'none'
          ? 'No provider (PAYMENT_PROVIDER=none): ordering is off.'
          : payments.provider === 'development'
            ? 'Simulated gateway for local development; no money moves.'
            : `Razorpay, ${payments.mode} mode. Configuration accepted; a live payment run is not verified by this check.`,
      ),
      integration('otp', 'SMS for sign-in codes', 'Customer sign-in', deps.devOtpOutbox ? 'development_only' : 'not_configured', deps.devOtpOutbox ? 'Development outbox: codes are shown on screen, not sent.' : 'No SMS provider (R37): code requests answer 503.'),
      integration('email', 'Email', 'Notifications and staff links', 'not_configured', 'No provider (R37). Staff links are handed over by admins.'),
      integration('sms', 'SMS notifications', 'Notifications', 'not_configured', 'No provider (R37). Only in-app notifications are delivered.'),
      integration('tts', 'Text-to-speech', 'Narrated audio', 'not_configured', 'Provider, languages and voices TBC (R25).'),
      integration('pdf', 'Family tree PDF', 'Exports', deps.exports ? 'connected' : 'not_configured', deps.exports ? 'Built in: HarfBuzz shaping with embedded Noto fonts (Latin, Gujarati, Devanagari).' : 'Needs the database and file storage.'),
    ],
  };
}

export function createApp(deps: AppDependencies): Express {
  const { logger, database, readinessTimeoutMs, auth } = deps;
  const app = express();
  app.disable('x-powered-by');
  // Only the local Next.js server (loopback) may state the client address in X-Forwarded-For;
  // it is used for per-IP rate limits. The production proxy chain is decision AC-14.
  app.set('trust proxy', 'loopback');

  app.use(requestId);
  app.use(securityHeaders);
  app.use(accessLog(logger));

  // Liveness: the process is running. It never touches dependencies.
  app.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'kulvriksh-api',
      dependencies: { database: 'not_configured' },
    };
    res.json(body);
  });

  // Readiness: dependencies needed to serve requests are reachable. 503 when one is down.
  app.get('/ready', async (_req, res) => {
    const databaseState = await checkDatabase(database, logger, readinessTimeoutMs);
    const ready = databaseState !== 'down';
    const body: ReadinessResponse = {
      status: ready ? 'ready' : 'not_ready',
      service: 'kulvriksh-api',
      dependencies: { database: databaseState },
    };
    res.status(ready ? 200 : 503).json(body);
  });

  // The payment webhook is signed over its raw bytes, so it is mounted before the JSON parser.
  app.use(API_PREFIX, paymentWebhookRoutes({ service: deps.payments, logger }));

  // JSON bodies only, small limit (the largest field is a 20,000-character report); malformed JSON
  // becomes a generic 400 via the error handler.
  app.use(
    API_PREFIX,
    express.json({ limit: '64kb' }),
    serviceRoutes({ repository: deps.services, auth, logger }),
    authRoutes({ service: auth, devOutbox: deps.devOtpOutbox, adminPreviewToken: deps.adminPreviewToken, logger }),
    staffRoutes({
      auth,
      staffAuth: deps.staffAuth,
      staffStore: deps.staffStore,
      lifecycle: deps.staffLifecycle,
      settings: deps.authSettings,
      devOutbox: deps.devStaffOutbox,
      adminPreviewToken: deps.adminPreviewToken,
      logger,
    }),
    profileRoutes({ auth, store: deps.profiles, editableFields: deps.profileFields ?? PROFILE_FIELDS, logger }),
    // Before the family router, so /family/media is not authorised twice.
    fileRoutes({ auth, files: deps.files, store: deps.fileStore, logger }),
    // Before the family router, so /family/exports is not authorised twice.
    exportRoutes({ auth, service: deps.exports, store: deps.exportStore, config: deps.exportConfig ?? DEFAULT_EXPORT_CONFIG, logger }),
    familyRoutes({ auth, store: deps.family, logger }),
    notificationRoutes({ auth, store: deps.notifications, logger }),
    paymentRoutes({ auth, service: deps.payments, store: deps.paymentStore, logger }),
    adminRoutes({
      auth,
      store: deps.adminStore,
      payments: () => deps.payments?.status ?? { provider: 'none', mode: null, currency: 'INR', gates: {} },
      policies: () => accessPolicies(deps),
      notificationConfig: deps.notificationConfig ?? DEFAULT_NOTIFICATION_CONFIG,
      system: () => systemStatus(deps),
      logger,
    }),
    researchRoutes({ auth, store: deps.research, audit: deps.auditReader, logger }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
