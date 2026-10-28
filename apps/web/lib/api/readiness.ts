// Server-side only. Calls the Express API's readiness endpoint over the internal address in
// API_INTERNAL_URL (a server setting, not exposed to the browser). How the browser reaches the
// API is still decision AC-14; this server-to-server call does not depend on it.

/** Mirrors ReadinessResponse in packages/shared (kept local to avoid a new web dependency). */
interface ReadinessBody {
  status: 'ready' | 'not_ready';
  service: 'kulvriksh-api';
  dependencies: { database: 'up' | 'down' | 'not_configured' };
}

export type ApiReadiness =
  | { state: 'not_configured' }
  | { state: 'misconfigured' }
  | { state: 'unreachable' }
  | { state: 'unexpected'; httpStatus: number }
  | { state: 'ready' | 'not_ready'; database: ReadinessBody['dependencies']['database'] };

const TIMEOUT_MS = 2000;

function isReadinessBody(value: unknown): value is ReadinessBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as Partial<ReadinessBody>;
  return (
    body.service === 'kulvriksh-api' &&
    (body.status === 'ready' || body.status === 'not_ready') &&
    typeof body.dependencies?.database === 'string'
  );
}

export async function getApiReadiness(): Promise<ApiReadiness> {
  const base = process.env.API_INTERNAL_URL?.trim();
  if (!base) {
    return { state: 'not_configured' };
  }
  let url: URL;
  try {
    url = new URL('/ready', base);
  } catch {
    return { state: 'misconfigured' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { state: 'misconfigured' };
  }
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    const body: unknown = await res.json().catch(() => null);
    // Only trust a response that identifies itself as the Kulvriksh API: another local
    // service may be listening on the configured port.
    if (!isReadinessBody(body)) {
      return { state: 'unexpected', httpStatus: res.status };
    }
    return { state: body.status, database: body.dependencies.database };
  } catch {
    return { state: 'unreachable' };
  }
}
