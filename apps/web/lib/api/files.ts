// Server-side only. Streams files between the browser and the API: the browser talks only to this
// Next.js server (same origin); the session cookie becomes a Bearer header here. The API performs
// every access check and validation; nothing here grants access.
import { sessionToken } from '@/lib/auth/session';
import { staffToken } from '@/lib/auth/staff-session';
import { isSameOrigin } from './origin';

const PASS_HEADERS = ['content-type', 'content-length', 'content-disposition', 'cache-control', 'content-security-policy', 'x-content-type-options'];
const UPLOAD_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

type Who = 'customer' | 'staff';

const tokenFor = (who: Who) => (who === 'customer' ? sessionToken() : staffToken());

function json(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function proxyDownload(who: Who, apiPath: string): Promise<Response> {
  const base = process.env.API_INTERNAL_URL?.trim();
  const token = await tokenFor(who);
  if (!base) {
    return json(503, 'NOT_CONFIGURED', 'The service is not connected.');
  }
  if (!token) {
    return json(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }
  let res: Response;
  try {
    res = await fetch(new URL(apiPath, base), { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  } catch {
    return json(503, 'UNAVAILABLE', 'The file could not be loaded. Please try again.');
  }
  if (!res.ok || !res.body) {
    // Same answer for "missing" and "not yours" (AS-REP-01).
    return res.status === 401 || res.status === 403 ? json(res.status, 'UNAUTHORIZED', 'Sign in to continue.') : json(404, 'NOT_FOUND', 'File not found.');
  }
  const headers = new Headers({ 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
  for (const name of PASS_HEADERS) {
    const value = res.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(res.body, { status: 200, headers });
}

export async function proxyUpload(who: Who, request: Request, apiPath: string): Promise<Response> {
  if (!isSameOrigin(request)) {
    return json(403, 'FORBIDDEN', 'Uploads must come from this site.');
  }
  const base = process.env.API_INTERNAL_URL?.trim();
  const token = await tokenFor(who);
  if (!base) {
    return json(503, 'NOT_CONFIGURED', 'The service is not connected.');
  }
  if (!token) {
    return json(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream' };
  const length = request.headers.get('content-length');
  if (length && /^\d{1,15}$/.test(length)) {
    headers['content-length'] = length;
  }
  const name = request.headers.get('x-file-name');
  if (name && name.length <= 1024) {
    headers['x-file-name'] = name;
  }
  try {
    const res = await fetch(new URL(apiPath, base), {
      method: 'POST',
      headers,
      body: request.body,
      // Stream the body through without buffering it in memory.
      duplex: 'half',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    } as RequestInit & { duplex: 'half' });
    const text = await res.text();
    return new Response(text || null, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return json(503, 'UNAVAILABLE', 'The upload could not be completed. Please try again.');
  }
}
