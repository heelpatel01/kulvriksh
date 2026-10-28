import type { AuditWriter } from '../audit/audit.ts';
import type { AuthSettings } from '../auth/auth-config.ts';
import { hashSessionToken, isSessionTokenShape, newSessionToken, subjectKey } from '../auth/auth-crypto.ts';
import type { AuthStore } from '../auth/auth-store.ts';
import type { StaffRole } from '../auth/authorize.ts';
import type { Logger } from '../logger.ts';
import { DUMMY_HASH, PASSWORD_MAX, hashPassword, normaliseEmail, passwordProblem, verifyPassword } from './password.ts';
import type { StaffMessageSender } from './staff-delivery.ts';
import type { StaffLifecycleStore } from './staff-lifecycle-store.ts';
import type { StaffStore } from './staff-store.ts';
import { decryptSecret, encryptSecret, matchingStep, newTotpSecret, otpauthUri } from './totp.ts';

// Staff sign-in (F-GEN-01, F-ADM-00) and the account lifecycle. Separate from customer OTP
// sign-in: different identifier, credential, limits, session lifetime and cookie. No public route
// creates staff accounts (AS-ADM-01), and no route changes a role.
//
// Second factor (R34 open): TOTP. With STAFF_MFA=required_admins (or required_all) a password
// alone never yields a session for the roles concerned; the person must enrol or enter a code.

type StaffIdentity = { id: string; role: StaffRole; displayName: string };
type SignedIn = { kind: 'signed_in'; token: string; expiresAt: Date; staff: StaffIdentity };

export type StaffSignInResult =
  | SignedIn
  | { kind: 'mfa_required' | 'mfa_enrolment_required'; challengeToken: string; expiresAt: Date }
  | { kind: 'invalid_input'; fields: Record<string, string> }
  /** Unknown email, wrong password, no password set yet or a non-staff account: one generic answer. */
  | { kind: 'invalid_credentials' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'account_unavailable' };

export type MfaResult = SignedIn | { kind: 'invalid_code' } | { kind: 'rate_limited'; retryAfterSeconds: number } | { kind: 'unavailable' };

export interface StaffAuthService {
  signIn(input: { email: unknown; password: unknown; ip: string; requestId?: string }): Promise<StaffSignInResult>;
  /** Second step: a TOTP code against the challenge from signIn. */
  verifyMfa(input: { challengeToken: unknown; code: unknown; ip: string; requestId?: string }): Promise<MfaResult>;
  /** Enrolment for someone who must enrol before their first session (challenge from signIn). */
  startChallengeEnrolment(input: { challengeToken: unknown; ip: string }): Promise<{ secret: string; otpauthUri: string } | { kind: 'invalid_code' | 'unavailable' }>;
  confirmChallengeEnrolment(input: { challengeToken: unknown; code: unknown; ip: string; requestId?: string }): Promise<MfaResult>;
  /** Enrolment by a signed-in staff member (policy optional). */
  startEnrolment(userId: string): Promise<{ secret: string; otpauthUri: string } | { kind: 'already_enabled' | 'unavailable' }>;
  confirmEnrolment(userId: string, code: unknown, requestId?: string): Promise<'enabled' | 'invalid_code' | 'unavailable'>;
  /** Turning the factor off needs a current code, and is refused while policy requires it. */
  disableMfa(userId: string, role: StaffRole, code: unknown, requestId?: string): Promise<'removed' | 'invalid_code' | 'required_by_policy' | 'not_enrolled' | 'unavailable'>;
  completePasswordLink(input: { token: unknown; password: unknown; requestId?: string }): Promise<
    { kind: 'done' } | { kind: 'invalid_token' } | { kind: 'invalid_input'; fields: Record<string, string> }
  >;
  changePassword(input: { userId: string; sessionId: string; currentPassword: unknown; newPassword: unknown; requestId?: string }): Promise<
    { kind: 'changed'; revokedSessions: number } | { kind: 'wrong_password' } | { kind: 'invalid_input'; fields: Record<string, string> }
  >;
  /** Self-service reset: always the same answer, whether or not the email exists. */
  requestPasswordReset(input: { email: unknown; ip: string; requestId?: string }): Promise<{ kind: 'accepted' } | { kind: 'rate_limited'; retryAfterSeconds: number }>;
  mfaRequiredFor(role: StaffRole): boolean;
  /** False when STAFF_MFA=off or no STAFF_MFA_KEY is configured. */
  mfaAvailable(): boolean;
}

export interface StaffAuthOptions {
  authStore: AuthStore;
  staffStore: StaffStore;
  lifecycle: StaffLifecycleStore;
  settings: AuthSettings;
  rateLimitHmacKey: string;
  /** Absent: TOTP is unavailable (enrolment answers 503) and STAFF_MFA must not require it. */
  mfaKey?: string;
  /** Absent: reset links are issued but not delivered (no email provider). */
  sender?: StaffMessageSender;
  logger: Logger;
  audit?: AuditWriter;
}

export function createStaffAuthService(options: StaffAuthOptions): StaffAuthService {
  const { authStore, staffStore, lifecycle, settings, rateLimitHmacKey, mfaKey, sender, logger, audit } = options;
  const key = (purpose: string, identifier: string) => subjectKey(rateLimitHmacKey, purpose, identifier);
  const mfaAvailable = settings.staffMfaPolicy !== 'off' && Boolean(mfaKey);
  const mfaRequiredFor = (role: StaffRole) =>
    mfaAvailable && (settings.staffMfaPolicy === 'required_all' || (settings.staffMfaPolicy === 'required_admins' && role === 'admin'));

  async function limited(purpose: string, identifier: string, limit: number) {
    const hit = await authStore.hit(key(purpose, identifier), settings.rateLimitWindowSeconds);
    return hit.count > limit ? hit.retryAfterSeconds : 0;
  }

  async function session(staff: StaffIdentity, method: string, requestId?: string): Promise<SignedIn> {
    const token = newSessionToken();
    const created = await staffStore.createSession({
      userId: staff.id,
      tokenHash: hashSessionToken(token),
      ttlSeconds: settings.staffSessionTtlSeconds,
      audit: { actorUserId: staff.id, actorRole: staff.role, action: 'auth.staff_signed_in', targetType: 'session', details: { method }, requestId },
    });
    logger.info('staff signed in', { userId: staff.id, role: staff.role, sessionId: created.sessionId });
    return { kind: 'signed_in', token, expiresAt: created.expiresAt, staff };
  }

  /** Who a staff user is, for the session (role and name from the database, never the request). */
  async function identity(userId: string): Promise<StaffIdentity | undefined> {
    const account = await lifecycle.getStaff(userId);
    return account && account.status === 'active' ? { id: account.id, role: account.role, displayName: account.displayName } : undefined;
  }

  async function challenge(userId: string): Promise<{ challengeToken: string; expiresAt: Date }> {
    const token = newSessionToken();
    const issued = await lifecycle.issueToken({ userId, purpose: 'mfa_challenge', tokenHash: hashSessionToken(token), ttlSeconds: settings.staffMfaChallengeTtlSeconds });
    return { challengeToken: token, expiresAt: issued!.expiresAt };
  }

  /** Counts the attempt on the challenge first (parallel guesses cannot exceed the limit). */
  async function challengeUser(raw: unknown, ip: string): Promise<{ userId: string; tokenHash: string } | 'limited' | undefined> {
    if (await limited('staff_mfa:ip', ip, settings.staffSignInPerIp)) {
      return 'limited';
    }
    if (typeof raw !== 'string' || !isSessionTokenShape(raw)) {
      return undefined;
    }
    const tokenHash = hashSessionToken(raw);
    const attempt = await lifecycle.attemptMfaChallenge(tokenHash, settings.staffMfaMaxAttempts);
    return attempt ? { userId: attempt.userId, tokenHash } : undefined;
  }

  const secretOf = (ciphertext: string) => decryptSecret(ciphertext, mfaKey!);

  return {
    mfaRequiredFor,
    mfaAvailable: () => mfaAvailable,

    async signIn({ email: rawEmail, password, ip, requestId }) {
      const email = normaliseEmail(rawEmail);
      const fields: Record<string, string> = {};
      if (!email) {
        fields.email = 'Enter your work email address.';
      }
      if (typeof password !== 'string' || password.length === 0 || password.length > PASSWORD_MAX) {
        fields.password = 'Enter your password.';
      }
      if (!email || typeof password !== 'string' || Object.keys(fields).length > 0) {
        return { kind: 'invalid_input', fields };
      }
      const subject = key('audit:staff_subject', email).slice(0, 32);
      const fail = (reason: string) =>
        audit?.record({
          actorRole: 'anonymous',
          action: 'auth.staff_sign_in_failed',
          targetType: 'staff_sign_in_subject',
          targetId: subject,
          outcome: 'failure',
          details: { reason },
          requestId,
        });

      const ipHit = await authStore.hit(key('staff_sign_in:ip', ip), settings.rateLimitWindowSeconds);
      const locked = await authStore.lockedFor(key('lockout:staff_sign_in', email));
      if (ipHit.count > settings.staffSignInPerIp || locked) {
        await fail('limited');
        return { kind: 'rate_limited', retryAfterSeconds: locked || ipHit.retryAfterSeconds };
      }

      const credential = await staffStore.findCredential(email);
      // Always run scrypt, so unknown emails and unset passwords take as long as wrong passwords.
      const passwordOk = await verifyPassword(password, credential?.passwordHash ?? DUMMY_HASH);
      if (!credential || !credential.passwordHash || !passwordOk) {
        const failures = await authStore.hit(key('staff_sign_in_fail:account', email), settings.staffFailureWindowSeconds);
        if (failures.count >= settings.staffFailureLimit) {
          await authStore.lockOut(key('lockout:staff_sign_in', email), settings.staffLockoutSeconds, 'staff_sign_in_fail');
          logger.warn('staff sign-in lockout applied', { lockoutSeconds: settings.staffLockoutSeconds });
          await fail('lockout_applied');
          return { kind: 'rate_limited', retryAfterSeconds: settings.staffLockoutSeconds };
        }
        logger.info('staff sign-in failed');
        await fail('invalid_credentials');
        return { kind: 'invalid_credentials' };
      }
      if (credential.role === 'customer' || !credential.displayName) {
        await fail('not_staff');
        return { kind: 'invalid_credentials' };
      }
      if (credential.status !== 'active') {
        await fail('account_unavailable');
        return { kind: 'account_unavailable' };
      }
      const staff: StaffIdentity = { id: credential.userId, role: credential.role, displayName: credential.displayName };
      if (mfaAvailable) {
        const mfa = await lifecycle.getMfa(staff.id);
        if (mfa?.enabledAt) {
          return { kind: 'mfa_required', ...(await challenge(staff.id)) };
        }
        if (mfaRequiredFor(staff.role)) {
          return { kind: 'mfa_enrolment_required', ...(await challenge(staff.id)) };
        }
      }
      return session(staff, 'password', requestId);
    },

    async verifyMfa({ challengeToken, code, ip, requestId }) {
      if (!mfaAvailable) {
        return { kind: 'unavailable' };
      }
      const user = await challengeUser(challengeToken, ip);
      if (user === 'limited') {
        return { kind: 'rate_limited', retryAfterSeconds: settings.rateLimitWindowSeconds };
      }
      if (!user || typeof code !== 'string') {
        return { kind: 'invalid_code' };
      }
      const mfa = await lifecycle.getMfa(user.userId);
      const step = mfa?.enabledAt ? matchingStep(secretOf(mfa.secretCiphertext), code.trim()) : undefined;
      // A code is accepted once: its time step must be newer than the last one used.
      if (step === undefined || !(await lifecycle.useMfaStep(user.userId, step))) {
        await audit?.record({ actorUserId: user.userId, actorRole: 'anonymous', action: 'auth.staff_mfa_failed', targetType: 'user', targetId: user.userId, outcome: 'failure', requestId });
        return { kind: 'invalid_code' };
      }
      const staff = await identity(user.userId);
      if (!staff || !(await lifecycle.consumeMfaChallenge(user.tokenHash))) {
        return { kind: 'invalid_code' };
      }
      return session(staff, 'password+totp', requestId);
    },

    async startChallengeEnrolment({ challengeToken, ip }) {
      if (!mfaAvailable) {
        return { kind: 'unavailable' };
      }
      const user = await challengeUser(challengeToken, ip);
      if (!user || user === 'limited') {
        return { kind: 'invalid_code' };
      }
      const account = await lifecycle.getStaff(user.userId);
      const secret = newTotpSecret();
      if (!account || (await lifecycle.startMfa(user.userId, encryptSecret(secret, mfaKey!))) === 'already_enabled') {
        return { kind: 'invalid_code' };
      }
      return { secret, otpauthUri: otpauthUri(secret, account.email) };
    },

    async confirmChallengeEnrolment({ challengeToken, code, ip, requestId }) {
      if (!mfaAvailable) {
        return { kind: 'unavailable' };
      }
      const user = await challengeUser(challengeToken, ip);
      if (user === 'limited') {
        return { kind: 'rate_limited', retryAfterSeconds: settings.rateLimitWindowSeconds };
      }
      if (!user || typeof code !== 'string') {
        return { kind: 'invalid_code' };
      }
      const mfa = await lifecycle.getMfa(user.userId);
      const step = mfa && !mfa.enabledAt ? matchingStep(secretOf(mfa.secretCiphertext), code.trim()) : undefined;
      if (step === undefined || !(await lifecycle.confirmMfa(user.userId, step, requestId))) {
        return { kind: 'invalid_code' };
      }
      const staff = await identity(user.userId);
      if (!staff || !(await lifecycle.consumeMfaChallenge(user.tokenHash))) {
        return { kind: 'invalid_code' };
      }
      return session(staff, 'password+totp', requestId);
    },

    async startEnrolment(userId) {
      if (!mfaAvailable) {
        return { kind: 'unavailable' };
      }
      const account = await lifecycle.getStaff(userId);
      const secret = newTotpSecret();
      if (!account) {
        return { kind: 'unavailable' };
      }
      if ((await lifecycle.startMfa(userId, encryptSecret(secret, mfaKey!))) === 'already_enabled') {
        return { kind: 'already_enabled' };
      }
      return { secret, otpauthUri: otpauthUri(secret, account.email) };
    },

    async confirmEnrolment(userId, code, requestId) {
      if (!mfaAvailable) {
        return 'unavailable';
      }
      const mfa = await lifecycle.getMfa(userId);
      const step = mfa && !mfa.enabledAt && typeof code === 'string' ? matchingStep(secretOf(mfa.secretCiphertext), code.trim()) : undefined;
      return step !== undefined && (await lifecycle.confirmMfa(userId, step, requestId)) ? 'enabled' : 'invalid_code';
    },

    async disableMfa(userId, role, code, requestId) {
      if (!mfaAvailable) {
        return 'unavailable';
      }
      if (mfaRequiredFor(role)) {
        return 'required_by_policy';
      }
      const mfa = await lifecycle.getMfa(userId);
      if (!mfa?.enabledAt) {
        return 'not_enrolled';
      }
      const step = typeof code === 'string' ? matchingStep(secretOf(mfa.secretCiphertext), code.trim()) : undefined;
      if (step === undefined || !(await lifecycle.useMfaStep(userId, step))) {
        return 'invalid_code';
      }
      await lifecycle.removeMfa(userId, { userId, role, requestId });
      return 'removed';
    },

    async completePasswordLink({ token, password, requestId }) {
      const problem = passwordProblem(password);
      if (problem) {
        return { kind: 'invalid_input', fields: { password: problem } };
      }
      if (typeof token !== 'string' || !isSessionTokenShape(token)) {
        return { kind: 'invalid_token' };
      }
      const result = await lifecycle.completeToken({ tokenHash: hashSessionToken(token), passwordHash: await hashPassword(password as string), requestId });
      return result.ok ? { kind: 'done' } : { kind: 'invalid_token' };
    },

    async changePassword({ userId, sessionId, currentPassword, newPassword, requestId }) {
      const problem = passwordProblem(newPassword);
      if (problem) {
        return { kind: 'invalid_input', fields: { newPassword: problem } };
      }
      if (newPassword === currentPassword) {
        return { kind: 'invalid_input', fields: { newPassword: 'Choose a password different from the current one.' } };
      }
      const account = await lifecycle.getStaff(userId);
      const credential = account ? await staffStore.findCredential(account.email) : undefined;
      const ok = typeof currentPassword === 'string' && (await verifyPassword(currentPassword, credential?.passwordHash ?? DUMMY_HASH));
      if (!credential?.passwordHash || !ok) {
        await audit?.record({ actorUserId: userId, actorRole: account?.role ?? 'anonymous', action: 'staff.password_change_failed', targetType: 'user', targetId: userId, outcome: 'failure', requestId });
        return { kind: 'wrong_password' };
      }
      const revokedSessions = await lifecycle.changePassword({ userId, passwordHash: await hashPassword(newPassword as string), keepSessionId: sessionId, requestId });
      return { kind: 'changed', revokedSessions };
    },

    async requestPasswordReset({ email: rawEmail, ip, requestId }) {
      const email = normaliseEmail(rawEmail);
      const wait =
        (await limited('staff_reset:ip', ip, settings.staffSignInPerIp)) ||
        (email ? await limited('staff_reset:account', email, settings.staffFailureLimit) : 0);
      if (wait) {
        return { kind: 'rate_limited', retryAfterSeconds: wait };
      }
      const credential = email ? await staffStore.findCredential(email) : undefined;
      if (email && credential && credential.role !== 'customer' && credential.status === 'active') {
        const token = newSessionToken();
        const issued = await lifecycle.issueToken({
          userId: credential.userId,
          purpose: 'reset',
          tokenHash: hashSessionToken(token),
          ttlSeconds: settings.staffResetTokenTtlSeconds,
          actor: { userId: credential.userId, role: 'anonymous', requestId },
        });
        if (sender && issued) {
          await sender.sendPasswordReset(email, token, issued.expiresAt);
        } else {
          // No email provider (R37): the link exists but cannot be delivered. An admin can issue
          // one instead. The token itself is never logged.
          logger.warn('staff password reset requested but no delivery channel is configured');
        }
      }
      return { kind: 'accepted' };
    },
  };
}
