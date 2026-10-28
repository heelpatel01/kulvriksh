import { readAuthConfig, type AuthConfig } from './auth/auth-config.ts';
import { readProfileFields, type ProfileField } from './customers/profile.ts';
import { readNotificationConfig, type NotificationConfig } from './notifications/notification-events.ts';
import { readExportConfig, type ExportConfig } from './export/export-config.ts';
import { readPaymentConfig, type PaymentConfig } from './payments/payment-config.ts';
import { readStorageConfig, type StorageConfig } from './storage/storage-config.ts';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  /**
   * PostgreSQL connection string for the runtime role (DM §9.7). Optional until the database
   * milestone is approved. It contains a credential: never log it or send it to a client.
   */
  readonly databaseUrl?: string;
  /**
   * Development-only shared secret between the local web server and the API. Since TASK-09 it
   * opens only the development OTP outbox; admin routes need a real admin session. It is NOT
   * authentication and is refused outside development.
   */
  readonly adminPreviewToken?: string;
  /** Sign-in and sessions: provisional settings, delivery channel and HMAC keys (see auth/auth-config.ts). */
  readonly auth: AuthConfig;
  /** Customer profile fields accepted in updates (R8 is open; CUSTOMER_PROFILE_FIELDS). */
  readonly profileFields: readonly ProfileField[];
  /** Provisional family size limits (R19). */
  readonly family: { readonly maxMembers: number; readonly maxRelationships: number };
  /** DEV_STAFF_PROVISIONING=1 enables `npm run dev:staff`. Refused unless NODE_ENV=development. */
  readonly devStaffProvisioning?: true;
  /** File storage (local private disk only; see storage/storage-config.ts). */
  readonly storage: StorageConfig;
  /** Notification events and channels (R36; see notifications/notification-events.ts). */
  readonly notifications: NotificationConfig;
  /** Family tree PDF export (see export/export-config.ts). */
  readonly export: ExportConfig;
  /** Plans, orders, payments and entitlement gates (see payments/payment-config.ts). */
  readonly payments: PaymentConfig;
}

/** Thrown when configuration is invalid. Lists every problem so they can all be fixed at once. */
export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join('; ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;
const DEFAULT_NODE_ENV: NodeEnv = 'development';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return (values as readonly string[]).includes(value);
}

function readEnum<T extends string>(
  name: string,
  raw: string | undefined,
  values: readonly T[],
  fallback: T,
  issues: string[],
): T {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = raw.trim();
  if (isOneOf(values, value)) {
    return value;
  }
  issues.push(`${name} must be one of ${values.join(', ')}, got "${raw}"`);
  return fallback;
}

function readPort(raw: string | undefined, issues: string[]): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }
  if (!/^\d+$/.test(raw.trim())) {
    issues.push(`API_PORT must be an integer, got "${raw}"`);
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    issues.push(`API_PORT must be between 1 and 65535, got ${port}`);
    return DEFAULT_PORT;
  }
  return port;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Validates DATABASE_URL without ever echoing it: issue messages describe the problem only,
 * because the value contains a password. Outside production the database must be on loopback,
 * so a development database is never reached over the network.
 */
function readDatabaseUrl(raw: string | undefined, nodeEnv: NodeEnv, issues: string[]): string | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    issues.push('DATABASE_URL is not a valid URL');
    return undefined;
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    issues.push('DATABASE_URL must use the postgresql:// scheme');
    return undefined;
  }
  if (url.pathname.replace(/^\//, '') === '') {
    issues.push('DATABASE_URL must name a database, e.g. postgresql://user:password@127.0.0.1:5434/kulvriksh');
    return undefined;
  }
  if (nodeEnv !== 'production' && !LOOPBACK_HOSTS.has(url.hostname)) {
    issues.push('DATABASE_URL must point to a loopback host (localhost, 127.0.0.1 or ::1) outside production');
    return undefined;
  }
  return raw.trim();
}

const MIN_ADMIN_PREVIEW_TOKEN_LENGTH = 32;

function readAdminPreviewToken(raw: string | undefined, nodeEnv: NodeEnv, issues: string[]): string | undefined {
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  if (nodeEnv !== 'development') {
    issues.push('ADMIN_PREVIEW_TOKEN is a development-only setting and must not be set outside development');
    return undefined;
  }
  if (raw.trim().length < MIN_ADMIN_PREVIEW_TOKEN_LENGTH) {
    issues.push(`ADMIN_PREVIEW_TOKEN must be at least ${MIN_ADMIN_PREVIEW_TOKEN_LENGTH} characters`);
    return undefined;
  }
  return raw.trim();
}

function readBounded(name: string, raw: string | undefined, fallback: number, min: number, max: number, issues: string[]): number {
  const value = raw?.trim();
  if (!value) {
    return fallback;
  }
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    issues.push(`${name} must be an integer from ${min} to ${max}`);
    return fallback;
  }
  return Number(value);
}

/** Provisioning test staff accounts is a local-demo tool only; production can never enable it. */
function readDevStaffProvisioning(raw: string | undefined, nodeEnv: NodeEnv, issues: string[]): boolean {
  const value = raw?.trim();
  if (!value || value === '0') {
    return false;
  }
  if (value !== '1') {
    issues.push('DEV_STAFF_PROVISIONING must be 1 or 0');
    return false;
  }
  if (nodeEnv !== 'development') {
    issues.push('DEV_STAFF_PROVISIONING is a development-only setting and must not be set outside development');
    return false;
  }
  return true;
}

// Provisional family size limits (R19 "maximum family size" is open).
export const DEFAULT_FAMILY_LIMITS = { maxMembers: 500, maxRelationships: 2000 } as const;

/** Reads and validates configuration; throws ConfigError so startup fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const issues: string[] = [];
  const nodeEnv = readEnum('NODE_ENV', env.NODE_ENV, NODE_ENVS, DEFAULT_NODE_ENV, issues);
  const databaseUrl = readDatabaseUrl(env.DATABASE_URL, nodeEnv, issues);
  const adminPreviewToken = readAdminPreviewToken(env.ADMIN_PREVIEW_TOKEN, nodeEnv, issues);
  const auth = readAuthConfig(env, nodeEnv, issues);
  const devStaffProvisioning = readDevStaffProvisioning(env.DEV_STAFF_PROVISIONING, nodeEnv, issues);
  const config: ApiConfig = {
    nodeEnv,
    host: env.API_HOST?.trim() || DEFAULT_HOST,
    port: readPort(env.API_PORT, issues),
    logLevel: readEnum('LOG_LEVEL', env.LOG_LEVEL, LOG_LEVELS, DEFAULT_LOG_LEVEL, issues),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(adminPreviewToken ? { adminPreviewToken } : {}),
    auth,
    profileFields: readProfileFields(env.CUSTOMER_PROFILE_FIELDS, issues),
    storage: readStorageConfig(env, nodeEnv, issues),
    notifications: readNotificationConfig(env.NOTIFY_REPORT_RELEASED, issues),
    export: readExportConfig(env, issues),
    payments: readPaymentConfig(env, nodeEnv, issues),
    family: {
      maxMembers: readBounded('FAMILY_MAX_MEMBERS', env.FAMILY_MAX_MEMBERS, DEFAULT_FAMILY_LIMITS.maxMembers, 10, 5000, issues),
      maxRelationships: readBounded(
        'FAMILY_MAX_RELATIONSHIPS',
        env.FAMILY_MAX_RELATIONSHIPS,
        DEFAULT_FAMILY_LIMITS.maxRelationships,
        10,
        20_000,
        issues,
      ),
    },
    ...(devStaffProvisioning ? { devStaffProvisioning: true as const } : {}),
  };
  if (issues.length > 0) {
    throw new ConfigError(issues);
  }
  return config;
}
