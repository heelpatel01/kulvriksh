import type { LogLevel } from './config.ts';
import { REDACTED, scrubText, serializeError } from './redaction.ts';

export { REDACTED };

// Minimal structured logger: one JSON object per line, with secret redaction.
// Deliberately dependency-free; it can be replaced by a logging library later
// without changing call sites, because callers depend only on the Logger interface.

export type LogFields = Record<string, unknown>;
type EmitLevel = Exclude<LogLevel, 'silent'>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export type LogSink = (line: string, level: EmitLevel) => void;

export interface LoggerOptions {
  level: LogLevel;
  sink?: LogSink;
  bindings?: LogFields;
  now?: () => Date;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// A field is redacted when its normalised name contains any of these fragments.
// Over-redaction is preferred to leaking a credential.
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'signature',
  'privatekey',
  'otp',
];
const RESERVED_KEYS = new Set(['time', 'level', 'msg']);
// Values under these keys are always serialised as errors, even when they are not Error
// instances (e.g. a rejection reason), so raw objects never reach the log.
const ERROR_KEYS = new Set(['err', 'error', 'reason', 'cause']);
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

function sanitise(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return scrubText(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }
  // Binary data (Buffer, typed arrays, ArrayBuffer) is summarised, never walked byte by byte.
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return `[binary ${value.byteLength} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    if (value instanceof Error) {
      // Allowlisted, scrubbed representation; never the error's arbitrary properties.
      return serializeError(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitise(item, depth + 1, seen));
    }
    return sanitiseObject(value as Record<string, unknown>, depth, seen);
  }
  return String(value);
}

function sanitiseObject(obj: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else if (ERROR_KEYS.has(key)) {
      out[key] = serializeError(val);
    } else {
      out[key] = sanitise(val, depth + 1, seen);
    }
  }
  return out;
}

const defaultSink: LogSink = (line, level) => {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_RANK[options.level];
  const bindings = options.bindings ?? {};

  const write = (level: EmitLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_RANK[level] < threshold) {
      return;
    }
    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
    const extra = sanitiseObject({ ...bindings, ...fields }, 0, new WeakSet());
    for (const [key, val] of Object.entries(extra)) {
      // Fields can never overwrite the core time/level/msg keys.
      if (!RESERVED_KEYS.has(key) && val !== undefined) {
        record[key] = val;
      }
    }
    sink(JSON.stringify(record), level);
  };

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (childBindings) => createLogger({ ...options, bindings: { ...bindings, ...childBindings } }),
  };
}
