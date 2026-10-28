import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Staff passwords (provisional sign-in method, R9). scrypt from node:crypto: memory-hard, no new
// dependency. Format: scrypt$<log2 N>$<r>$<p>$<salt>$<hash>, so parameters can be raised later
// and old hashes still verify.

const LOG_N = 15; // N = 32768: about 32 MiB and tens of milliseconds per hash on the target VPS
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: 2 ** logN, r, p, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, LOG_N, R, P);
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const FORMAT = /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{16,64})\$([A-Za-z0-9_-]{32,128})$/;

/** Constant-time check. A malformed or out-of-range stored hash never verifies. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = FORMAT.exec(stored);
  if (!match) {
    return false;
  }
  const [logN, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (logN < 14 || logN > 17 || r < 8 || r > 16 || p < 1 || p > 4) {
    return false;
  }
  const expected = Buffer.from(match[5]!, 'base64url');
  const actual = await derive(password, Buffer.from(match[4]!, 'base64url'), logN, r, p);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Verified against when the email is unknown, so an unknown account costs the same scrypt work
 * as a wrong password and response times do not reveal which emails exist.
 */
export const DUMMY_HASH = await hashPassword(randomBytes(24).toString('base64url'));

export function passwordProblem(password: unknown): string | undefined {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Use at most ${PASSWORD_MAX} characters.`;
  }
  return undefined;
}

const EMAIL = /^[^@\s]+@[^@\s]+$/;

/** Lower-cased and trimmed, matching the database CHECK; undefined when not an email address. */
export function normaliseEmail(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : undefined;
}
