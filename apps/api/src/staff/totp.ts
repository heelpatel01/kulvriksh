import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Time-based one-time passwords (RFC 6238, HMAC-SHA-1, 6 digits, 30-second steps) for the staff
// second factor. Provisional method (R34 open). Built on node:crypto: no new dependency. Secrets
// are stored encrypted (AES-256-GCM, key from STAFF_MFA_KEY) because they must be recoverable to
// verify codes; a database leak alone does not reveal them.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error('invalid base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, as base32 for authenticator apps. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpAt(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(binary).padStart(DIGITS, '0');
}

/**
 * The time step a code matches, allowing one step of clock drift either side, or undefined.
 * The caller must also reject steps at or below the last one used (replay protection).
 */
export function matchingStep(secretBase32: string, code: string, now = Date.now()): number | undefined {
  if (!/^\d{6}$/.test(code)) {
    return undefined;
  }
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = Buffer.from(totpAt(secretBase32, candidate));
    if (timingSafeEqual(expected, Buffer.from(code))) {
      return candidate;
    }
  }
  return undefined;
}

/** The otpauth:// URI that authenticator apps import (shown once during enrolment). */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Kulvriksh'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

const keyFrom = (secret: string) => createHash('sha256').update(`kulvriksh-staff-mfa:${secret}`).digest();

/** `v1:<iv>:<tag>:<ciphertext>`, all base64url. */
export function encryptSecret(plain: string, keySecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keySecret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(':');
}

export function decryptSecret(stored: string, keySecret: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !data) {
    throw new Error('unsupported MFA secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keySecret), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
