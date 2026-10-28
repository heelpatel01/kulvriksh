// Server-side only: calls the Express API over API_INTERNAL_URL. The admin preview token
// (ADMIN_PREVIEW_TOKEN, development only) is attached here on the server and never reaches
// the browser; it is not user authentication. A customer's session token travels only from the
// HttpOnly cookie to this server and on to the API as a Bearer header.

export type ApiResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not_configured' }
  | { kind: 'unreachable' }
  | { kind: 'unavailable' }
  | { kind: 'unauthorized'; code?: string }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'not_found' }
  | { kind: 'invalid'; message: string; fields: Record<string, string>; code?: string }
  /** 409: e.g. a stale version or a duplicate. The message is the API's safe, user-facing text. */
  | { kind: 'conflict'; code: string; message: string }
  /** 422: the request breaks a rule (e.g. an ancestry cycle). */
  | { kind: 'rejected'; code: string; message: string }
  | { kind: 'error'; status: number };

const TIMEOUT_MS = 3000;

interface ErrorEnvelope {
  error?: { code?: string; message?: string; fields?: Record<string, string>; retryAfterSeconds?: number };
}

export async function apiRequest<T>(
  path: string,
  {
    method = 'GET',
    body,
    admin = false,
    token,
    clientIp,
  }: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    admin?: boolean;
    /** Customer or staff session token (from an HttpOnly cookie), sent as a Bearer header. */
    token?: string;
    /** The visitor's address, for the API's per-IP rate limits. */
    clientIp?: string;
  } = {},
): Promise<ApiResult<T>> {
  const base = process.env.API_INTERNAL_URL?.trim();
  if (!base || (admin && !process.env.ADMIN_PREVIEW_TOKEN)) {
    return { kind: 'not_configured' };
  }
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(admin ? { 'x-admin-preview-token': process.env.ADMIN_PREVIEW_TOKEN ?? '' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(clientIp ? { 'x-forwarded-for': clientIp } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { kind: 'unreachable' };
  }
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return { kind: 'ok', data: (response.status === 204 ? null : payload) as T };
  }
  const error = (payload as ErrorEnvelope | null)?.error;
  switch (response.status) {
    case 400:
      return {
        kind: 'invalid',
        message: error?.message ?? 'Some fields are invalid',
        fields: error?.fields ?? {},
        ...(error?.code ? { code: error.code } : {}),
      };
    case 409:
      return { kind: 'conflict', code: error?.code ?? 'CONFLICT', message: error?.message ?? 'This was changed elsewhere. Reload and try again.' };
    case 422:
      return { kind: 'rejected', code: error?.code ?? 'REJECTED', message: error?.message ?? 'This change is not allowed.' };
    case 401:
    case 403:
      return { kind: 'unauthorized', ...(error?.code ? { code: error.code } : {}) };
    case 429:
      return { kind: 'rate_limited', retryAfterSeconds: Number(error?.retryAfterSeconds ?? response.headers.get('retry-after')) || 60 };
    case 404:
      return { kind: 'not_found' };
    case 503:
      return { kind: 'unavailable' };
    default:
      return { kind: 'error', status: response.status };
  }
}
