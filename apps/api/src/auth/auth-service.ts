import { randomUUID } from 'node:crypto';
import type { AuditEntry, AuditWriter } from '../audit/audit.ts';
import type { Logger } from '../logger.ts';
import type { AuthSettings } from './auth-config.ts';
import { digestsMatch, generateOtp, hashOtp, hashSessionToken, newSessionToken, subjectKey } from './auth-crypto.ts';
import type { ActiveSession, AuthStore, CustomerRecord, RevokeReason } from './auth-store.ts';
import { maskMobileNumber, normaliseMobileNumber } from './mobile.ts';
import type { OtpSender } from './otp-delivery.ts';

// Customer sign-in (Product Flows F-AUTH-01 to F-AUTH-05) and session checks for every role.
// Audit: sign-in success is written in the session's transaction; failures, lockouts and
// provider failures in their own short transaction (DM §9.4). Codes, tokens and full numbers are
// never logged or audited; the number appears only as its last four digits.

export type OtpRequestResult =
  | { kind: 'accepted'; expiresInSeconds: number; resendAfterSeconds: number }
  | { kind: 'invalid_number' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'delivery_failed' }
  /** No delivery channel is configured (no SMS provider; development outbox off). */
  | { kind: 'delivery_unavailable' };

export type OtpVerifyResult =
  | { kind: 'signed_in'; token: string; expiresAt: Date; customer: CustomerRecord }
  | { kind: 'invalid_input'; fields: Record<string, string> }
  /** Wrong, expired, used or unknown code: one generic answer for all (AS-AUTH-01, -05, -06). */
  | { kind: 'invalid_code' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'account_unavailable' };

export interface RequestContext {
  ip: string;
  requestId?: string;
}

export interface AuthService {
  requestOtp(input: { mobileNumber: unknown } & RequestContext): Promise<OtpRequestResult>;
  verifyOtp(input: { mobileNumber: unknown; code: unknown } & RequestContext): Promise<OtpVerifyResult>;
  authenticate(token: string): Promise<ActiveSession | undefined>;
  logout(token: string, requestId?: string): Promise<void>;
  logoutAll(userId: string, requestId?: string): Promise<number>;
}

export interface AuthServiceOptions {
  store: AuthStore;
  /** Absent: code requests answer 503, while sessions (customer and staff) keep working. */
  sender?: OtpSender;
  settings: AuthSettings;
  otpHmacKey: string;
  rateLimitHmacKey: string;
  logger: Logger;
  audit?: AuditWriter;
}

const PURPOSE = {
  requestByNumber: 'otp_request:number',
  requestByIp: 'otp_request:ip',
  verifyByIp: 'otp_verify:ip',
  verifyFailByNumber: 'otp_verify_fail:number',
  lockout: 'lockout:otp_verify_fail',
} as const;

export function createAuthService({
  store,
  sender,
  settings,
  otpHmacKey,
  rateLimitHmacKey,
  logger,
  audit,
}: AuthServiceOptions): AuthService {
  const key = (purpose: string, identifier: string) => subjectKey(rateLimitHmacKey, purpose, identifier);
  const idle = {
    customer: settings.sessionIdleSeconds,
    genealogist: settings.staffSessionIdleSeconds,
    admin: settings.staffSessionIdleSeconds,
  };

  /** Counts the hit and reports whether it is over `limit`. Rejected hits are counted too (DM §5.5). */
  async function overLimit(purpose: string, identifier: string, limit: number, windowSeconds = settings.rateLimitWindowSeconds) {
    const { count, retryAfterSeconds } = await store.hit(key(purpose, identifier), windowSeconds);
    return count > limit ? retryAfterSeconds : 0;
  }

  /** A sign-in subject without the number: a non-reversible key plus the last four digits. */
  function subject(mobileNumber: string, requestId: string | undefined): Omit<AuditEntry, 'action'> {
    return {
      actorRole: 'anonymous',
      targetType: 'sign_in_subject',
      targetId: key('audit:subject', mobileNumber).slice(0, 32),
      details: { numberEnding: mobileNumber.slice(-4) },
      requestId,
    };
  }

  const record = (entry: AuditEntry) => audit?.record(entry) ?? Promise.resolve();

  return {
    async requestOtp({ mobileNumber: raw, ip, requestId }) {
      const mobileNumber = normaliseMobileNumber(raw);
      if (!mobileNumber) {
        return { kind: 'invalid_number' };
      }
      if (!sender) {
        return { kind: 'delivery_unavailable' };
      }
      const masked = maskMobileNumber(mobileNumber);
      const limited =
        (await overLimit(PURPOSE.requestByIp, ip, settings.otpRequestsPerIp)) ||
        (await overLimit(PURPOSE.requestByNumber, mobileNumber, settings.otpRequestsPerNumber)) ||
        (await store.lockedFor(key(PURPOSE.lockout, mobileNumber)));
      if (limited) {
        logger.warn('otp request limited', { mobile: masked });
        await record({ ...subject(mobileNumber, requestId), action: 'auth.otp_request_limited', outcome: 'failure' });
        return { kind: 'rate_limited', retryAfterSeconds: limited };
      }

      const id = randomUUID();
      const code = generateOtp(settings.otpLength);
      const created = await store.createChallenge({
        id,
        mobileNumber,
        codeHash: hashOtp(otpHmacKey, id, code),
        ttlSeconds: settings.otpTtlSeconds,
        cooldownSeconds: settings.otpResendCooldownSeconds,
      });
      if (created.kind === 'cooldown') {
        return { kind: 'rate_limited', retryAfterSeconds: created.retryAfterSeconds };
      }

      // FQ-2 `existing`: unknown numbers get the same answer, but no message is sent. Every limit
      // and the cooldown above applied identically, so the responses cannot be told apart.
      const deliver = settings.customerSignup === 'auto' || (await store.customerExists(mobileNumber));
      if (deliver) {
        try {
          // After commit, outside any transaction (F-AUTH-01 step 2).
          await sender.send(mobileNumber, code, created.expiresAt);
        } catch (err) {
          await store.invalidateChallenge(id);
          // Alertable: provider failures must be noticed (AS-AUTH-04).
          logger.error('otp delivery failed', { mobile: masked, challengeId: id, err });
          await record({ ...subject(mobileNumber, requestId), action: 'auth.otp_delivery_failed', outcome: 'failure' });
          return { kind: 'delivery_failed' };
        }
      }
      logger.info('otp requested', { mobile: masked, challengeId: id });
      await record({ ...subject(mobileNumber, requestId), action: 'auth.otp_requested' });
      return {
        kind: 'accepted',
        expiresInSeconds: settings.otpTtlSeconds,
        resendAfterSeconds: settings.otpResendCooldownSeconds,
      };
    },

    async verifyOtp({ mobileNumber: raw, code, ip, requestId }) {
      const mobileNumber = normaliseMobileNumber(raw);
      const fields: Record<string, string> = {};
      if (!mobileNumber) {
        fields.mobileNumber = 'Enter a 10-digit Indian mobile number';
      }
      if (typeof code !== 'string' || !new RegExp(`^\\d{${settings.otpLength}}$`).test(code)) {
        fields.code = `Enter the ${settings.otpLength}-digit code`;
      }
      if (!mobileNumber || typeof code !== 'string' || Object.keys(fields).length > 0) {
        return { kind: 'invalid_input', fields };
      }
      const masked = maskMobileNumber(mobileNumber);
      const failed = (reason: string) =>
        record({ ...subject(mobileNumber, requestId), action: 'auth.sign_in_failed', outcome: 'failure', details: { reason, numberEnding: mobileNumber.slice(-4) } });

      const limited =
        (await overLimit(PURPOSE.verifyByIp, ip, settings.verifyRequestsPerIp)) ||
        (await store.lockedFor(key(PURPOSE.lockout, mobileNumber)));
      if (limited) {
        logger.warn('sign-in refused: limited or locked', { mobile: masked });
        await failed('limited');
        return { kind: 'rate_limited', retryAfterSeconds: limited };
      }

      // Count the attempt first, so parallel guesses cannot exceed the limit (F-AUTH-02 step 2).
      const attempt = await store.recordAttempt(mobileNumber, settings.otpMaxAttempts);
      if (!attempt) {
        logger.info('sign-in failed', { mobile: masked, reason: 'no_usable_challenge' });
        await failed('no_usable_challenge');
        return { kind: 'invalid_code' };
      }

      if (!digestsMatch(attempt.codeHash, hashOtp(otpHmacKey, attempt.id, code))) {
        // The budget spans challenges: a new code does not reset it (DM §5.5 step 6).
        const failures = await store.hit(key(PURPOSE.verifyFailByNumber, mobileNumber), settings.verifyFailureWindowSeconds);
        if (failures.count >= settings.verifyFailureLimit) {
          await store.lockOut(key(PURPOSE.lockout, mobileNumber), settings.lockoutSeconds, 'otp_verify_fail');
          await store.invalidateOpenChallenge(mobileNumber);
          logger.warn('sign-in lockout applied', { mobile: masked, lockoutSeconds: settings.lockoutSeconds });
          await record({ ...subject(mobileNumber, requestId), action: 'auth.lockout_applied', outcome: 'failure' });
          return { kind: 'rate_limited', retryAfterSeconds: settings.lockoutSeconds };
        }
        if (attempt.attemptCount >= settings.otpMaxAttempts) {
          await store.invalidateChallenge(attempt.id);
        }
        logger.info('sign-in failed', { mobile: masked, challengeId: attempt.id, reason: 'wrong_code' });
        await failed('wrong_code');
        return { kind: 'invalid_code' };
      }

      const token = newSessionToken();
      const result = await store.consumeAndSignIn({
        challengeId: attempt.id,
        mobileNumber,
        createAccount: settings.customerSignup === 'auto',
        tokenHash: hashSessionToken(token),
        sessionTtlSeconds: settings.sessionTtlSeconds,
        requestId,
      });
      switch (result.kind) {
        case 'signed_in':
          logger.info('signed in', { userId: result.customer.id, sessionId: result.sessionId });
          return { kind: 'signed_in', token, expiresAt: result.expiresAt, customer: result.customer };
        case 'account_unavailable':
          logger.warn('sign-in refused: account not active', { mobile: masked });
          await failed('account_unavailable');
          return { kind: 'account_unavailable' };
        default:
          logger.info('sign-in failed', { mobile: masked, reason: result.kind });
          await failed(result.kind);
          return { kind: 'invalid_code' };
      }
    },

    authenticate: (token) => store.findSession(hashSessionToken(token), idle, settings.sessionTouchSeconds),

    async logout(token, requestId) {
      const revoked = await store.revokeSession(hashSessionToken(token), 'logout');
      if (revoked) {
        logger.info('signed out');
        await record({
          actorUserId: revoked.userId,
          actorRole: revoked.role,
          action: 'auth.signed_out',
          targetType: 'user',
          targetId: revoked.userId,
          requestId,
        });
      }
    },

    async logoutAll(userId, requestId) {
      const reason: RevokeReason = 'logout';
      const count = await store.revokeAllSessions(userId, reason);
      logger.info('signed out everywhere', { userId, sessions: count });
      await record({
        actorUserId: userId,
        actorRole: 'customer',
        action: 'auth.signed_out_everywhere',
        targetType: 'user',
        targetId: userId,
        details: { sessions: count },
        requestId,
      });
      return count;
    },
  };
}
