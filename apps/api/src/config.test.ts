import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_AUTH_SETTINGS } from './auth/auth-config.ts';
import { ConfigError, loadConfig } from './config.ts';
import { readExportConfig } from './export/export-config.ts';
import { DEFAULT_NOTIFICATION_CONFIG } from './notifications/notification-events.ts';
import { readPaymentConfig } from './payments/payment-config.ts';
import { readStorageConfig } from './storage/storage-config.ts';

// Defaults shared by every configuration that sets no sign-in, profile, family, file, export or payment values.
const NO_AUTH = { settings: DEFAULT_AUTH_SETTINGS, otpDelivery: 'none' };
const DEFAULTS = (nodeEnv: 'development' | 'production') => ({
  auth: NO_AUTH,
  profileFields: ['displayName'],
  family: { maxMembers: 500, maxRelationships: 2000 },
  storage: readStorageConfig({}, nodeEnv, []),
  notifications: DEFAULT_NOTIFICATION_CONFIG,
  export: readExportConfig({}, []),
  payments: readPaymentConfig({}, nodeEnv, []),
});

test('uses safe defaults when nothing is configured', () => {
  assert.deepEqual(loadConfig({}), { nodeEnv: 'development', host: '127.0.0.1', port: 4000, logLevel: 'info', ...DEFAULTS('development') });
});

test('accepts valid explicit values (whitespace trimmed)', () => {
  const config = loadConfig({ NODE_ENV: 'production', API_HOST: ' 0.0.0.0 ', API_PORT: ' 5000 ', LOG_LEVEL: 'warn' });
  assert.deepEqual(config, { nodeEnv: 'production', host: '0.0.0.0', port: 5000, logLevel: 'warn', ...DEFAULTS('production') });
  // Production has no default storage directory: file features stay off until it is set.
  assert.equal(config.storage.localDir, undefined);
});

test('treats empty values as unset', () => {
  assert.deepEqual(loadConfig({ NODE_ENV: '', API_HOST: '  ', API_PORT: '', LOG_LEVEL: '' }), loadConfig({}));
});

for (const bad of ['abc', '12.5', '-1', '4000x']) {
  test(`rejects non-integer API_PORT "${bad}"`, () => {
    assert.throws(() => loadConfig({ API_PORT: bad }), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.issues[0] ?? '', /API_PORT must be an integer/);
      return true;
    });
  });
}

for (const bad of ['0', '65536', '70000']) {
  test(`rejects out-of-range API_PORT ${bad}`, () => {
    assert.throws(() => loadConfig({ API_PORT: bad }), /API_PORT must be between 1 and 65535/);
  });
}

test('rejects an unknown NODE_ENV and lists the allowed values', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'staging' }),
    /NODE_ENV must be one of development, test, production, got "staging"/,
  );
});

test('rejects an unknown LOG_LEVEL', () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), /LOG_LEVEL must be one of debug, info, warn, error, silent/);
});

const SAMPLE_PASSWORD = 'sample-pw-not-real';

test('DATABASE_URL is optional and omitted from the config when unset or empty', () => {
  assert.equal('databaseUrl' in loadConfig({}), false);
  assert.equal('databaseUrl' in loadConfig({ DATABASE_URL: '  ' }), false);
});

test('accepts a loopback PostgreSQL URL in development', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const url = `postgresql://kulvriksh_app:${SAMPLE_PASSWORD}@${host}:5434/kulvriksh`;
    assert.equal(loadConfig({ DATABASE_URL: url }).databaseUrl, url);
  }
});

for (const [label, value, pattern] of [
  ['an invalid URL', 'not a url', /DATABASE_URL is not a valid URL/],
  ['a non-PostgreSQL scheme', `mysql://u:${SAMPLE_PASSWORD}@127.0.0.1/kulvriksh`, /postgresql:\/\/ scheme/],
  ['a URL without a database name', `postgresql://u:${SAMPLE_PASSWORD}@127.0.0.1:5434`, /must name a database/],
  ['a non-loopback host in development', `postgresql://u:${SAMPLE_PASSWORD}@db.example.com:5432/kulvriksh`, /loopback host/],
] as const) {
  test(`rejects ${label} without echoing the value`, () => {
    assert.throws(
      () => loadConfig({ DATABASE_URL: value }),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.match(err.message, pattern);
        assert.doesNotMatch(err.message, new RegExp(SAMPLE_PASSWORD));
        assert.doesNotMatch(err.message, /not a url|db\.example\.com/);
        return true;
      },
    );
  });
}

test('a non-loopback database host is allowed in production', () => {
  const url = `postgresql://u:${SAMPLE_PASSWORD}@10.0.0.5:5432/kulvriksh`;
  assert.equal(loadConfig({ NODE_ENV: 'production', DATABASE_URL: url }).databaseUrl, url);
});

test('ADMIN_PREVIEW_TOKEN is accepted only in development and only when long enough, never echoed', () => {
  const token = 'dev-preview-token-0123456789abcdefghij';
  assert.equal(loadConfig({ NODE_ENV: 'development', ADMIN_PREVIEW_TOKEN: token }).adminPreviewToken, token);
  for (const nodeEnv of ['test', 'production']) {
    assert.throws(
      () => loadConfig({ NODE_ENV: nodeEnv, ADMIN_PREVIEW_TOKEN: token }),
      (err: unknown) => err instanceof ConfigError && /development-only/.test(err.message) && !err.message.includes(token),
    );
  }
  assert.throws(() => loadConfig({ ADMIN_PREVIEW_TOKEN: 'short' }), /at least 32 characters/);
});

test('reports every problem at once', () => {
  try {
    loadConfig({ NODE_ENV: 'prod', API_PORT: 'abc', LOG_LEVEL: 'loud' });
    assert.fail('expected ConfigError');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.issues.length, 3);
    assert.equal(err.name, 'ConfigError');
  }
});

test('export and payment defaults are the safe ones: genealogist export off, no payment provider, nothing gated', () => {
  const config = loadConfig({});
  assert.deepEqual([config.export.genealogistAccess, config.export.concurrency, config.export.retentionHours], ['off', 1, 24]);
  assert.deepEqual([config.payments.provider, config.payments.currency, config.payments.gates], ['none', 'INR', {}]);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'development' }), /development-only/);
  assert.throws(() => loadConfig({ EXPORT_GENEALOGIST_ACCESS: 'all' }), /EXPORT_GENEALOGIST_ACCESS must be off or assigned/);
  assert.throws(() => loadConfig({ EXPORT_CONCURRENCY: '64' }), /EXPORT_CONCURRENCY must be an integer from 1 to 4/);
});
