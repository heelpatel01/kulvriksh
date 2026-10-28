import type { NodeEnv } from '../config.ts';

/**
 * Customer sign-in settings. Every numeric value is PROVISIONAL: the product decisions are still
 * open (FQ-1 phone format, FQ-2 account creation, FQ-3 OTP and rate-limit values, FQ-4 session
 * lifetime). Defaults are deliberately conservative and each can be overridden by one named
 * environment variable, so a decision becomes a configuration change rather than a code change.
 */
export interface AuthSettings {
  /** FQ-3. Digits in a one-time code. */
  readonly otpLength: number;
  /** FQ-3. How long a code stays valid. */
  readonly otpTtlSeconds: number;
  /** FQ-3. Minimum gap between two codes for the same number. */
  readonly otpResendCooldownSeconds: number;
  /** FQ-3. Wrong guesses allowed on one challenge before it is invalidated. */
  readonly otpMaxAttempts: number;
  /** FQ-3. Wrong guesses per number, across all challenges, before a lockout. */
  readonly verifyFailureLimit: number;
  readonly verifyFailureWindowSeconds: number;
  /** FQ-3. Length of the lockout once the failure limit is reached. */
  readonly lockoutSeconds: number;
  /** FQ-3. Code requests per number and per client IP in one window. */
  readonly otpRequestsPerNumber: number;
  readonly otpRequestsPerIp: number;
  /** FQ-3. Verification attempts per client IP in one window. */
  readonly verifyRequestsPerIp: number;
  /** One window length for all request limits above. */
  readonly rateLimitWindowSeconds: number;
  /** FQ-4. Absolute session lifetime and idle timeout. */
  readonly sessionTtlSeconds: number;
  readonly sessionIdleSeconds: number;
  /** last_seen_at is written at most this often (DM §5.4: avoid a write per request). */
  readonly sessionTouchSeconds: number;
  /** FQ-2. `auto`: first successful verification creates the customer account. `existing`: only known numbers can sign in. */
  readonly customerSignup: 'auto' | 'existing';
  /** R9/R34. Staff sessions are shorter than customer sessions. */
  readonly staffSessionTtlSeconds: number;
  readonly staffSessionIdleSeconds: number;
  /** R9. Staff sign-in attempts per client IP per window, and wrong passwords per account before a lockout. */
  readonly staffSignInPerIp: number;
  readonly staffFailureLimit: number;
  readonly staffFailureWindowSeconds: number;
  readonly staffLockoutSeconds: number;
  /** One-time links: account setup (sent by an admin) and password reset. */
  readonly staffSetupTokenTtlSeconds: number;
  readonly staffResetTokenTtlSeconds: number;
  /** Second sign-in step: lifetime and wrong-code limit of the challenge after the password. */
  readonly staffMfaChallengeTtlSeconds: number;
  readonly staffMfaMaxAttempts: number;
  /**
   * R34 (admin second factor) is open. `optional`: staff may enrol TOTP; `required_admins`: admins
   * must enrol before they get a session; `required_all`: every staff member must; `off`: disabled.
   */
  readonly staffMfaPolicy: StaffMfaPolicy;
  /** R33: whether admins may create (and deactivate) other admins. Default no: only the bootstrap command creates admins. */
  readonly staffAdminsMayManageAdmins: boolean;
}

export const STAFF_MFA_POLICIES = ['off', 'optional', 'required_admins', 'required_all'] as const;
export type StaffMfaPolicy = (typeof STAFF_MFA_POLICIES)[number];

/**
 * How codes are delivered. No SMS provider has been chosen, so the only implemented channel is
 * the development outbox. `none` (the default) means sign-in answers 503: the API never claims a
 * code was sent when nothing could send it.
 */
export type OtpDelivery = 'none' | 'development';

export interface AuthConfig {
  readonly settings: AuthSettings;
  readonly otpDelivery: OtpDelivery;
  /** Secrets (DM §5.5). Separate keys for OTP hashing and rate-limit keys. Never logged. */
  readonly otpHmacKey?: string;
  readonly rateLimitHmacKey?: string;
  /** Encrypts staff TOTP secrets. Required unless STAFF_MFA=off. Never logged. */
  readonly staffMfaKey?: string;
}

export const DEFAULT_AUTH_SETTINGS: AuthSettings = {
  otpLength: 6,
  otpTtlSeconds: 300,
  otpResendCooldownSeconds: 60,
  otpMaxAttempts: 5,
  verifyFailureLimit: 10,
  verifyFailureWindowSeconds: 3600,
  lockoutSeconds: 1800,
  otpRequestsPerNumber: 5,
  otpRequestsPerIp: 20,
  verifyRequestsPerIp: 60,
  rateLimitWindowSeconds: 3600,
  sessionTtlSeconds: 7 * 24 * 3600,
  sessionIdleSeconds: 24 * 3600,
  sessionTouchSeconds: 300,
  customerSignup: 'auto',
  staffSessionTtlSeconds: 8 * 3600,
  staffSessionIdleSeconds: 3600,
  staffSignInPerIp: 30,
  staffFailureLimit: 5,
  staffFailureWindowSeconds: 900,
  staffLockoutSeconds: 900,
  staffSetupTokenTtlSeconds: 72 * 3600,
  staffResetTokenTtlSeconds: 3600,
  staffMfaChallengeTtlSeconds: 300,
  staffMfaMaxAttempts: 5,
  staffMfaPolicy: 'optional',
  staffAdminsMayManageAdmins: false,
};

// Environment variable, setting, and the allowed range (a typo cannot weaken security silently).
const NUMERIC: Array<[string, keyof AuthSettings, number, number]> = [
  ['AUTH_OTP_LENGTH', 'otpLength', 6, 8],
  ['AUTH_OTP_TTL_SECONDS', 'otpTtlSeconds', 60, 900],
  ['AUTH_OTP_RESEND_COOLDOWN_SECONDS', 'otpResendCooldownSeconds', 1, 600],
  ['AUTH_OTP_MAX_ATTEMPTS', 'otpMaxAttempts', 1, 10],
  ['AUTH_VERIFY_FAILURE_LIMIT', 'verifyFailureLimit', 1, 50],
  ['AUTH_VERIFY_FAILURE_WINDOW_SECONDS', 'verifyFailureWindowSeconds', 60, 86_400],
  ['AUTH_LOCKOUT_SECONDS', 'lockoutSeconds', 60, 86_400],
  ['AUTH_OTP_REQUESTS_PER_NUMBER', 'otpRequestsPerNumber', 1, 50],
  ['AUTH_OTP_REQUESTS_PER_IP', 'otpRequestsPerIp', 1, 1000],
  ['AUTH_VERIFY_REQUESTS_PER_IP', 'verifyRequestsPerIp', 1, 1000],
  ['AUTH_RATE_LIMIT_WINDOW_SECONDS', 'rateLimitWindowSeconds', 60, 86_400],
  ['AUTH_SESSION_TTL_SECONDS', 'sessionTtlSeconds', 300, 90 * 86_400],
  ['AUTH_SESSION_IDLE_SECONDS', 'sessionIdleSeconds', 300, 90 * 86_400],
  ['AUTH_SESSION_TOUCH_SECONDS', 'sessionTouchSeconds', 10, 3600],
  ['AUTH_STAFF_SESSION_TTL_SECONDS', 'staffSessionTtlSeconds', 300, 7 * 86_400],
  ['AUTH_STAFF_SESSION_IDLE_SECONDS', 'staffSessionIdleSeconds', 300, 86_400],
  ['AUTH_STAFF_SIGN_IN_PER_IP', 'staffSignInPerIp', 1, 1000],
  ['AUTH_STAFF_FAILURE_LIMIT', 'staffFailureLimit', 1, 20],
  ['AUTH_STAFF_FAILURE_WINDOW_SECONDS', 'staffFailureWindowSeconds', 60, 86_400],
  ['AUTH_STAFF_LOCKOUT_SECONDS', 'staffLockoutSeconds', 60, 86_400],
  ['AUTH_STAFF_SETUP_TOKEN_TTL_SECONDS', 'staffSetupTokenTtlSeconds', 600, 7 * 86_400],
  ['AUTH_STAFF_RESET_TOKEN_TTL_SECONDS', 'staffResetTokenTtlSeconds', 300, 86_400],
  ['AUTH_STAFF_MFA_CHALLENGE_TTL_SECONDS', 'staffMfaChallengeTtlSeconds', 60, 900],
  ['AUTH_STAFF_MFA_MAX_ATTEMPTS', 'staffMfaMaxAttempts', 1, 10],
];

const MIN_KEY_LENGTH = 32;

function readSecret(name: string, raw: string | undefined, issues: string[]): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length < MIN_KEY_LENGTH) {
    issues.push(`${name} must be at least ${MIN_KEY_LENGTH} characters`);
    return undefined;
  }
  return value;
}

export function readAuthConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv, issues: string[]): AuthConfig {
  const settings: Record<string, unknown> = { ...DEFAULT_AUTH_SETTINGS };
  for (const [name, key, min, max] of NUMERIC) {
    const raw = env[name]?.trim();
    if (!raw) {
      continue;
    }
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) {
      issues.push(`${name} must be an integer from ${min} to ${max}`);
      continue;
    }
    settings[key] = value;
  }
  const signup = env.AUTH_CUSTOMER_SIGNUP?.trim();
  if (signup) {
    if (signup === 'auto' || signup === 'existing') {
      settings.customerSignup = signup;
    } else {
      issues.push('AUTH_CUSTOMER_SIGNUP must be auto or existing');
    }
  }
  if ((settings.sessionIdleSeconds as number) > (settings.sessionTtlSeconds as number)) {
    issues.push('AUTH_SESSION_IDLE_SECONDS must not exceed AUTH_SESSION_TTL_SECONDS');
  }
  if ((settings.staffSessionIdleSeconds as number) > (settings.staffSessionTtlSeconds as number)) {
    issues.push('AUTH_STAFF_SESSION_IDLE_SECONDS must not exceed AUTH_STAFF_SESSION_TTL_SECONDS');
  }

  let otpDelivery: OtpDelivery = 'none';
  const delivery = env.OTP_DELIVERY?.trim();
  if (delivery === 'development') {
    // The development outbox shows codes to the local developer. It must never exist anywhere else.
    if (nodeEnv === 'development') {
      otpDelivery = 'development';
    } else {
      issues.push('OTP_DELIVERY=development is allowed only when NODE_ENV=development');
    }
  } else if (delivery && delivery !== 'none') {
    issues.push('OTP_DELIVERY must be none or development (no SMS provider is configured yet)');
  }

  const otpHmacKey = readSecret('OTP_HMAC_KEY', env.OTP_HMAC_KEY, issues);
  const rateLimitHmacKey = readSecret('RATE_LIMIT_HMAC_KEY', env.RATE_LIMIT_HMAC_KEY, issues);
  if (otpHmacKey && rateLimitHmacKey && otpHmacKey === rateLimitHmacKey) {
    issues.push('OTP_HMAC_KEY and RATE_LIMIT_HMAC_KEY must be different');
  }
  if (otpDelivery !== 'none' && (!otpHmacKey || !rateLimitHmacKey)) {
    issues.push('OTP_DELIVERY needs OTP_HMAC_KEY and RATE_LIMIT_HMAC_KEY');
  }

  const mfa = env.STAFF_MFA?.trim();
  if (mfa) {
    if ((STAFF_MFA_POLICIES as readonly string[]).includes(mfa)) {
      settings.staffMfaPolicy = mfa;
    } else {
      issues.push(`STAFF_MFA must be one of ${STAFF_MFA_POLICIES.join(', ')}`);
    }
  }
  const manageAdmins = env.STAFF_ADMINS_MAY_MANAGE_ADMINS?.trim();
  if (manageAdmins) {
    if (manageAdmins === 'true' || manageAdmins === 'false') {
      settings.staffAdminsMayManageAdmins = manageAdmins === 'true';
    } else {
      issues.push('STAFF_ADMINS_MAY_MANAGE_ADMINS must be true or false');
    }
  }
  const staffMfaKey = readSecret('STAFF_MFA_KEY', env.STAFF_MFA_KEY, issues);
  if (String(settings.staffMfaPolicy).startsWith('required') && !staffMfaKey) {
    issues.push('STAFF_MFA=required_* needs STAFF_MFA_KEY');
  }
  for (const [name, value] of [['OTP_HMAC_KEY', otpHmacKey], ['RATE_LIMIT_HMAC_KEY', rateLimitHmacKey]] as const) {
    if (staffMfaKey && value && staffMfaKey === value) {
      issues.push(`STAFF_MFA_KEY must differ from ${name}`);
    }
  }

  return {
    settings: settings as unknown as AuthSettings,
    otpDelivery,
    ...(otpHmacKey ? { otpHmacKey } : {}),
    ...(rateLimitHmacKey ? { rateLimitHmacKey } : {}),
    ...(staffMfaKey ? { staffMfaKey } : {}),
  };
}
