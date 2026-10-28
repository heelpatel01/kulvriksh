import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** A code of `length` uniformly distributed digits from the CSPRNG (DM §5.5 step 1). */
export function generateOtp(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += String(randomInt(10));
  }
  return code;
}

/**
 * HMAC-SHA-256(key, challenge id ‖ code), hex. The challenge ID makes every hash unique, so a
 * database leak alone cannot be reversed by enumerating the 10^n possible codes (DM §5.5 step 2).
 */
export function hashOtp(key: string, challengeId: string, code: string): string {
  return createHmac('sha256', key).update(`${challengeId}:${code}`).digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function digestsMatch(expectedHex: string, actualHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

/** Rate-limit and lockout keys: no raw IP address or mobile number is stored (DM §5.5). */
export function subjectKey(key: string, purpose: string, identifier: string): string {
  return createHmac('sha256', key).update(`${purpose}:${identifier}`).digest('hex');
}

/** 256-bit random session token for the cookie. Only its hash is stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isSessionTokenShape(token: string): boolean {
  return SESSION_TOKEN.test(token);
}

/**
 * The token already carries 256 bits of entropy, so an unkeyed SHA-256 cannot be reversed or
 * brute-forced; it only stops a database reader from replaying cookies.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
