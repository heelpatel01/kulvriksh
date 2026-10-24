import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from './config.ts';

test('uses safe defaults when nothing is configured', () => {
  assert.deepEqual(loadConfig({}), { nodeEnv: 'development', host: '127.0.0.1', port: 4000, logLevel: 'info' });
});

test('accepts valid explicit values (whitespace trimmed)', () => {
  const config = loadConfig({ NODE_ENV: 'production', API_HOST: ' 0.0.0.0 ', API_PORT: ' 5000 ', LOG_LEVEL: 'warn' });
  assert.deepEqual(config, { nodeEnv: 'production', host: '0.0.0.0', port: 5000, logLevel: 'warn' });
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
