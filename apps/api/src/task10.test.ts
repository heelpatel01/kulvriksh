// Unit tests for TASK-10 building blocks that need no database: TOTP, secret encryption, file
// signatures, file names, the local storage adapter, and configuration guards.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { readNotificationConfig, renderReportReleased } from './notifications/notification-events.ts';
import { decryptSecret, encryptSecret, base32Decode, base32Encode, matchingStep, totpAt } from './staff/totp.ts';
import { detectType, sanitiseFilename } from './storage/file-types.ts';
import { LocalDiskStorage, newStorageKey, UploadTooLargeError } from './storage/storage.ts';
import { captureLogger, fakeAuth, startServer, testToken } from './testing/helpers.ts';

test('TOTP matches the RFC 6238 SHA-1 test vectors (6-digit tail)', () => {
  // RFC 6238 appendix B: secret "12345678901234567890", T0 = 0, step 30 s.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  for (const [seconds, expected] of [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ] as const) {
    assert.equal(totpAt(secret, Math.floor(seconds / 30)), expected, String(seconds));
  }
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
});

test('TOTP verification allows ±1 step of drift only, and rejects malformed codes', () => {
  const secret = base32Encode(Buffer.from('another shared secret'));
  const now = 1_800_000_000_000;
  const step = Math.floor(now / 30_000);
  assert.equal(matchingStep(secret, totpAt(secret, step), now), step);
  assert.equal(matchingStep(secret, totpAt(secret, step - 1), now), step - 1);
  assert.equal(matchingStep(secret, totpAt(secret, step + 2), now), undefined);
  for (const bad of ['', '12345', '1234567', 'abcdef']) {
    assert.equal(matchingStep(secret, bad, now), undefined);
  }
});

test('MFA secrets are encrypted (AES-256-GCM): wrong key or tampering fails', () => {
  const stored = encryptSecret('JBSWY3DPEHPK3PXP', 'k'.repeat(40));
  assert.match(stored, /^v1:/);
  assert.ok(!stored.includes('JBSWY3DPEHPK3PXP'));
  assert.equal(decryptSecret(stored, 'k'.repeat(40)), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptSecret(stored, 'x'.repeat(40)));
  const parts = stored.split(':');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptSecret(parts.join(':'), 'k'.repeat(40)));
});

test('file types come from the content signature, never the name', () => {
  const pad = (b: Buffer) => Buffer.concat([b, Buffer.alloc(32)]);
  assert.deepEqual(detectType(pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))), { type: 'image/jpeg', kind: 'photo' });
  assert.deepEqual(detectType(pad(Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'))), { type: 'image/png', kind: 'photo' });
  assert.deepEqual(detectType(pad(Buffer.from('%PDF-1.7'))), { type: 'application/pdf', kind: 'document' });
  assert.deepEqual(detectType(pad(Buffer.from('OggS'))), { type: 'audio/ogg', kind: 'voice' });
  assert.deepEqual(detectType(pad(Buffer.from('RIFF\0\0\0\0WEBP'))), { type: 'image/webp', kind: 'photo' });
  for (const bad of ['MZ\x90\0', '<html><script>', '#!/bin/sh', 'PK\x03\x04', '']) {
    assert.equal(detectType(pad(Buffer.from(bad, 'latin1'))), undefined, JSON.stringify(bad));
  }
});

test('file names are display-only: no paths, controls or quotes; bounded', () => {
  assert.equal(sanitiseFilename('..%2F..%2Fetc%2Fpasswd'), 'passwd');
  assert.equal(sanitiseFilename('C:\\Users\\x\\photo "1".jpg'), 'photo 1.jpg');
  assert.equal(sanitiseFilename('a\u0000b\u001f.png'), 'ab.png');
  assert.equal(sanitiseFilename('..'), null);
  assert.equal(sanitiseFilename(42), null);
  assert.equal(sanitiseFilename('x'.repeat(300))?.length, 255);
});

test('local storage: size cap aborts mid-stream; commit, open, delete; keys cannot escape the store', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kulvriksh-unit-storage-'));
  try {
    const storage = new LocalDiskStorage(root);
    await assert.rejects(storage.writeTemp(Readable.from([Buffer.alloc(600), Buffer.alloc(600)]), 1000), UploadTooLargeError);
    assert.deepEqual(readdirSync(join(root, 'tmp')), [], 'an aborted upload leaves nothing behind');
    const temp = await storage.writeTemp(Readable.from([Buffer.from('%PDF-1.4 hello')]), 1000);
    assert.equal(temp.byteSize, 14);
    assert.equal(temp.head.toString(), '%PDF-1.4 hello');
    const key = newStorageKey('media');
    await storage.commit(temp, key);
    const opened = await storage.open(key);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
      chunks.push(chunk as Buffer);
    }
    assert.equal(Buffer.concat(chunks).toString(), '%PDF-1.4 hello');
    await storage.delete(key);
    await storage.delete(key); // idempotent
    await assert.rejects(storage.open(key));
    for (const bad of ['../../etc/passwd', 'media/../../x', 'MEDIA/abc', 'a']) {
      await assert.rejects(storage.open(bad), /invalid storage key/);
    }
    // Abandoned temporary uploads are swept by age only.
    const old = join(root, 'tmp', 'a'.repeat(32));
    writeFileSync(old, 'x');
    utimesSync(old, new Date(Date.now() - 7_200_000), new Date(Date.now() - 7_200_000));
    writeFileSync(join(root, 'tmp', 'b'.repeat(32)), 'fresh');
    assert.equal(await storage.sweepTemp(3_600_000), 1);
    assert.deepEqual(readdirSync(join(root, 'tmp')), ['b'.repeat(32)]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('notifications config: in-app by default; email/sms refused until a provider exists (R37)', () => {
  assert.deepEqual(readNotificationConfig(undefined, []).reportReleasedChannels, ['in_app']);
  assert.deepEqual(readNotificationConfig('none', []).reportReleasedChannels, []);
  const issues: string[] = [];
  readNotificationConfig('in_app,sms', issues);
  assert.match(issues[0] ?? '', /need a delivery provider/);
  const text = renderReportReleased({ reportTitle: 'Origins', workspaceName: 'Mehta family' });
  assert.match(text.body, /Origins/);
});

test('staff lifecycle config: MFA policy needs a key; keys must differ; admin management is off by default', () => {
  assert.equal(loadConfig({}).auth.settings.staffMfaPolicy, 'optional');
  assert.equal(loadConfig({}).auth.settings.staffAdminsMayManageAdmins, false);
  assert.throws(() => loadConfig({ STAFF_MFA: 'required_admins' }), /needs STAFF_MFA_KEY/);
  assert.throws(() => loadConfig({ STAFF_MFA: 'sometimes' }), /STAFF_MFA must be one of/);
  const key = 'm'.repeat(40);
  assert.throws(
    () => loadConfig({ STAFF_MFA_KEY: key, RATE_LIMIT_HMAC_KEY: key, OTP_HMAC_KEY: 'o'.repeat(40) }),
    (err: unknown) => err instanceof ConfigError && err.issues.some((i) => /must differ/.test(i)),
  );
  assert.equal(loadConfig({ STAFF_MFA: 'required_admins', STAFF_MFA_KEY: key }).auth.settings.staffMfaPolicy, 'required_admins');
  assert.throws(() => loadConfig({ STAFF_ADMINS_MAY_MANAGE_ADMINS: 'yes' }), /true or false/);
  assert.throws(() => loadConfig({ STORAGE_BACKEND: 's3' }), /must be local/);
  assert.throws(() => loadConfig({ MEDIA_ALLOWED_TYPES: 'text/html' }), /MEDIA_ALLOWED_TYPES/);
});

test('without storage or a notification store, the routes are closed (503/401), never open', async () => {
  const { logger } = captureLogger();
  const token = testToken('customer');
  const server = await startServer(createApp({ logger, auth: fakeAuth({ [token]: { role: 'customer' } }) }));
  try {
    const headers = { authorization: `Bearer ${token}` };
    assert.equal((await fetch(`${server.baseUrl}/api/v1/family/media`, { headers })).status, 503);
    assert.equal((await fetch(`${server.baseUrl}/api/v1/notifications`, { headers })).status, 503);
    assert.equal((await fetch(`${server.baseUrl}/api/v1/family/media`)).status, 401);
    assert.equal((await fetch(`${server.baseUrl}/api/v1/admin/staff`, { headers })).status, 403);
  } finally {
    await server.close();
  }
});
