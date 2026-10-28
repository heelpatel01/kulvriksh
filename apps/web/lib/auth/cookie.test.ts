import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SESSION_COOKIE, STAFF_SESSION_COOKIE, safeReturnPath, safeStaffReturnPath, sessionCookieOptions } from './cookie.ts';

test('staff return paths: only inside the signed-in role’s own area', () => {
  assert.equal(safeStaffReturnPath('/admin/cases', 'admin'), '/admin/cases');
  assert.equal(safeStaffReturnPath('/genealogist/cases/abc', 'genealogist'), '/genealogist/cases/abc');
  assert.equal(safeStaffReturnPath('/admin/cases', 'genealogist'), '/genealogist', 'a genealogist is never sent into /admin');
  assert.equal(safeStaffReturnPath('/genealogist', 'admin'), '/admin');
  for (const bad of ['//evil.example', 'https://evil.example/admin', '/admin/../dashboard', '/dashboard', undefined]) {
    assert.equal(safeStaffReturnPath(bad, 'admin'), '/admin', String(bad));
  }
  assert.notEqual(STAFF_SESSION_COOKIE, SESSION_COOKIE, 'staff and customer sessions use different cookies');
});

test('return paths: only customer-area paths are accepted (no open redirect)', () => {
  for (const ok of ['/dashboard', '/dashboard/', '/dashboard/family', '/dashboard/research/report-1']) {
    assert.equal(safeReturnPath(ok), ok);
  }
  for (const bad of [
    'https://evil.example/dashboard',
    '//evil.example',
    '/\evil.example',
    '/dashboard//evil.example',
    '/dashboard/../admin',
    '/dashboardx',
    '/admin',
    '/dashboard?next=//evil',
    'javascript:alert(1)',
    '',
    undefined,
    ['/dashboard'],
  ]) {
    assert.equal(safeReturnPath(bad), '/dashboard', String(bad));
  }
});

test('session cookie: HttpOnly and SameSite=Lax; Secure and __Host- only in production', () => {
  const options = sessionCookieOptions(new Date('2026-11-01T00:00:00Z'));
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, 'lax');
  assert.equal(options.path, '/');
  // Tests run with NODE_ENV unset or "test".
  assert.equal(options.secure, false);
  assert.equal(SESSION_COOKIE, 'kv_session');
});
