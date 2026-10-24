// Log-safety helpers: scrub credentials and personal data out of free text, and turn
// arbitrary error values into a bounded, allowlisted structure. Used by the logger.
//
// Pattern-based scrubbing is a second line of defence. It cannot recognise every
// possible secret, so code must still avoid putting secrets in messages.

export const REDACTED = '[REDACTED]';

const MAX_STRING_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_FRAMES = 15;
const MAX_CAUSE_DEPTH = 3;
const MAX_AGGREGATE_ERRORS = 5;

const SENSITIVE_WORDS =
  'password|passwd|pwd|secret|token|api[_-]?key|authori[sz]ation|cookie|signature|private[_-]?key|otp|session[_-]?id';

type Replacement = string | ((match: string, ...groups: string[]) => string);

// Applied in order. Each rule replaces only the sensitive part and keeps the surrounding text.
const RULES: ReadonlyArray<readonly [RegExp, Replacement]> = [
  // Credentials embedded in URLs: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi, `$1${REDACTED}@`],
  // Query-string values (they often carry tokens or personal data)
  [/([?&][^=\s&#]+)=[^&\s#]*/g, `$1=${REDACTED}`],
  // HTTP authorisation schemes
  [/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // key=value, key: value and "key":"value" where the key looks sensitive.
  // Quantifiers are bounded: unbounded runs around the keyword backtrack catastrophically (ReDoS).
  [
    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
    `$1$2$1$3$4${REDACTED}$4`,
  ],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
  // One-time codes that follow a keyword, e.g. "OTP 482913"
  [/\b(otp|pin|passcode|verification code)(\W{1,3})\d{4,8}\b/gi, `$1$2${REDACTED}`],
  // Long digit runs: phone numbers, card-like numbers
  [/(?<![\w.])\+?\d{10,19}(?![\w.])/g, '[REDACTED_NUMBER]'],
  // Long token-like strings mixing letters and digits (API keys, hex digests).
  // Slashes and dashes are excluded so file paths and UUIDs survive.
  [/[A-Za-z0-9_+]{32,}={0,2}/g, (match) => (/\d/.test(match) && /[A-Za-z]/.test(match) ? REDACTED : match)],
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/** Removes credentials and personal data from free text and caps its length. */
export function scrubText(text: string, max = MAX_STRING_LENGTH): string {
  let out = truncate(text, max);
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement as string);
  }
  return out;
}

export interface SafeError {
  name: string;
  message: string;
  code?: string | number;
  status?: number;
  syscall?: string;
  stack?: string;
  cause?: SafeError;
  errors?: SafeError[];
}

function prop(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

/**
 * Converts any thrown value into a bounded, allowlisted structure.
 * Never includes arbitrary own properties (request config, headers, response bodies,
 * raw request bodies), because providers and libraries attach those to errors.
 */
export function serializeError(value: unknown, depth = 0): SafeError {
  if (!(value instanceof Error)) {
    let message: string;
    if (typeof value === 'string') {
      message = scrubText(value, MAX_MESSAGE_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
      message = String(value);
    } else {
      message = `[non-Error ${Array.isArray(value) ? 'array' : typeof value} omitted]`;
    }
    return { name: 'NonError', message };
  }

  const safe: SafeError = {
    name: scrubText(String(value.name), 100),
    message: scrubText(value.message, MAX_MESSAGE_LENGTH),
  };

  const code = prop(value, 'code');
  if (typeof code === 'number' || (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code))) {
    safe.code = code;
  }
  const status = prop(value, 'status') ?? prop(value, 'statusCode');
  if (typeof status === 'number') {
    safe.status = status;
  }
  const syscall = prop(value, 'syscall');
  if (typeof syscall === 'string' && /^[a-z_]{1,32}$/.test(syscall)) {
    safe.syscall = syscall;
  }

  // Keep only the "at ..." frames: the stack's first line repeats the (unscrubbed) message.
  if (typeof value.stack === 'string') {
    const frames = value.stack
      .split('\n')
      .filter((line) => /^\s+at\s/.test(line))
      .slice(0, MAX_STACK_FRAMES)
      .map((line) => scrubText(line.trim(), MAX_MESSAGE_LENGTH));
    if (frames.length > 0) {
      safe.stack = frames.join('\n');
    }
  }

  if (depth < MAX_CAUSE_DEPTH) {
    if ('cause' in value && value.cause !== undefined) {
      safe.cause = serializeError(value.cause, depth + 1);
    }
    const nested = prop(value, 'errors');
    if (Array.isArray(nested)) {
      safe.errors = nested.slice(0, MAX_AGGREGATE_ERRORS).map((item) => serializeError(item, depth + 1));
    }
  }
  return safe;
}
