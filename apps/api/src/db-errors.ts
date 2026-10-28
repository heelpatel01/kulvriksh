// Classifies database errors from Prisma 7 with the PostgreSQL driver adapter. The codes were
// observed against the local PostgreSQL 18 instance (TASK-07): P1001 unreachable, P1000 bad
// credentials, P2025 record not found, P2039 database constraint (for example a CHECK).

/** Codes meaning the database cannot serve requests right now: answer 503, never 500. */
const UNAVAILABLE_CODES = new Set([
  'P1000', // authentication failed (server misconfiguration)
  'P1001', // server not reachable
  'P1002', // server reached but timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // timed out waiting for a pooled connection
]);

// Raw queries ($queryRaw) report driver failures as P2010 with the adapter's error kind instead
// (observed in TASK-08: an unreachable server gives kind DatabaseNotReachable).
const UNAVAILABLE_KINDS = new Set([
  'DatabaseNotReachable',
  'AuthenticationFailed',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
  'TlsConnectionError',
  'DatabaseDoesNotExist',
  'DatabaseAccessDenied',
]);

/** The driver adapter's error kind, when Prisma passes one through. */
function adapterKindOf(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('meta' in err)) {
    return undefined;
  }
  const meta = err.meta as { driverAdapterError?: { cause?: { kind?: unknown } } } | undefined;
  const kind = meta?.driverAdapterError?.cause?.kind;
  return typeof kind === 'string' ? kind : undefined;
}

function codeOf(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'string') {
    return err.code;
  }
  return undefined;
}

export function isDatabaseUnavailable(err: unknown): boolean {
  const code = codeOf(err);
  if (code !== undefined && UNAVAILABLE_CODES.has(code)) {
    return true;
  }
  const kind = adapterKindOf(err);
  return kind !== undefined && UNAVAILABLE_KINDS.has(kind);
}

/** A unique index rejected the row: P2002 from model queries, the adapter kind from raw ones. */
export function isUniqueViolation(err: unknown): boolean {
  return codeOf(err) === 'P2002' || adapterKindOf(err) === 'UniqueConstraintViolation';
}

export function isRecordNotFound(err: unknown): boolean {
  return codeOf(err) === 'P2025';
}
