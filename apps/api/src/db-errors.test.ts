import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDatabaseUnavailable, isRecordNotFound, isUniqueViolation } from './db-errors.ts';

// Shapes observed from Prisma 7.10 with @prisma/adapter-pg against PostgreSQL 18 (TASK-07, TASK-08).
const adapter = (code: string, kind: string) => ({ code, meta: { driverAdapterError: { name: 'DriverAdapterError', cause: { kind } } } });

test('model queries: connection codes mean unavailable', () => {
  assert.equal(isDatabaseUnavailable({ code: 'P1001' }), true);
  assert.equal(isDatabaseUnavailable({ code: 'P2024' }), true);
  assert.equal(isDatabaseUnavailable({ code: 'P2025' }), false);
  assert.equal(isRecordNotFound({ code: 'P2025' }), true);
});

test('raw queries: P2010 is classified by the driver adapter error kind', () => {
  assert.equal(isDatabaseUnavailable(adapter('P2010', 'DatabaseNotReachable')), true);
  assert.equal(isDatabaseUnavailable(adapter('P2010', 'AuthenticationFailed')), true);
  assert.equal(isDatabaseUnavailable(adapter('P2010', 'UniqueConstraintViolation')), false);
  assert.equal(isUniqueViolation(adapter('P2010', 'UniqueConstraintViolation')), true);
  assert.equal(isUniqueViolation({ code: 'P2002' }), true);
  assert.equal(isUniqueViolation(adapter('P2010', 'NullConstraintViolation')), false);
});

test('anything else is not classified', () => {
  for (const value of [undefined, null, 'P1001', new Error('x'), { meta: 'odd' }, { code: 42 }]) {
    assert.equal(isDatabaseUnavailable(value), false);
    assert.equal(isUniqueViolation(value), false);
  }
});
