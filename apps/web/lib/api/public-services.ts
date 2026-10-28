// Fetches the public service catalogue (active services only) from the Express API.
// Dependency-free so it can be unit-tested with Node's test runner (public-services.test.ts).
// Server-side only: API_INTERNAL_URL is a server setting.

export interface PublicService {
  id: string;
  name: string;
  description: string;
}

export type PublicServicesResult =
  | { kind: 'ok'; services: PublicService[] }
  | { kind: 'not_configured' }
  | { kind: 'unavailable'; reason: 'unreachable' | 'status' | 'invalid_response' };

/** Cache tag for the catalogue. Admin changes call updateTag(PUBLIC_SERVICES_TAG). */
export const PUBLIC_SERVICES_TAG = 'public-services';

function isService(value: unknown): value is PublicService {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const s = value as Record<string, unknown>;
  return typeof s.id === 'string' && typeof s.name === 'string' && typeof s.description === 'string';
}

export async function fetchPublicServices({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 3000,
  init = {},
}: {
  baseUrl: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Extra fetch options, e.g. Next.js `next: { revalidate, tags }`. */
  init?: RequestInit & Record<string, unknown>;
}): Promise<PublicServicesResult> {
  if (!baseUrl?.trim()) {
    return { kind: 'not_configured' };
  }
  let response: Response;
  try {
    response = await fetchImpl(new URL('/api/v1/services', baseUrl), {
      ...init,
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: 'unavailable', reason: 'unreachable' };
  }
  if (!response.ok) {
    return { kind: 'unavailable', reason: 'status' };
  }
  const body: unknown = await response.json().catch(() => null);
  const services = (body as { services?: unknown } | null)?.services;
  if (!Array.isArray(services) || !services.every(isService)) {
    return { kind: 'unavailable', reason: 'invalid_response' };
  }
  return { kind: 'ok', services: services.map(({ id, name, description }) => ({ id, name, description })) };
}
