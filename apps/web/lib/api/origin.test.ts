import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSameOrigin } from './origin.ts';

const req = (headers: Record<string, string>) => new Request('http://127.0.0.1:3105/api/files/media', { method: 'POST', headers });

test('uploads are accepted only from the same site', () => {
  assert.equal(isSameOrigin(req({ origin: 'http://127.0.0.1:3105', host: '127.0.0.1:3105', 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(isSameOrigin(req({ origin: 'http://127.0.0.1:3105', host: '127.0.0.1:3105' })), true, 'older browsers without Sec-Fetch-Site');
  assert.equal(isSameOrigin(req({ origin: 'https://evil.example', host: '127.0.0.1:3105' })), false);
  assert.equal(isSameOrigin(req({ origin: 'http://127.0.0.1:3105', host: '127.0.0.1:3105', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isSameOrigin(req({ host: '127.0.0.1:3105' })), false, 'no Origin header');
  assert.equal(isSameOrigin(req({ origin: 'null', host: '127.0.0.1:3105' })), false);
});
