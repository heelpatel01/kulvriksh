// Shared by the proxy, Server Components and Server Actions. No secrets here.

/**
 * In production the cookie uses the __Host- prefix: the browser then accepts it only with
 * Secure, Path=/ and no Domain, so a sibling subdomain cannot set or overwrite it.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-kv_session' : 'kv_session';

/** Staff (genealogist and admin) sessions use a separate cookie from customer sessions. */
export const STAFF_SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-kv_staff' : 'kv_staff';

/** HttpOnly so page scripts can never read the token; SameSite=Lax blocks cross-site POSTs (AS-AUTH-08). */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

const RETURN_PATH = /^\/dashboard(?:\/[A-Za-z0-9_-]+)*\/?$/;

/**
 * Where to go after sign-in. Only customer-area paths are accepted, so a crafted `next`
 * parameter cannot send the user to another site or an unrelated page (open redirect).
 */
export function safeReturnPath(raw: unknown): string {
  return typeof raw === 'string' && RETURN_PATH.test(raw) ? raw : '/dashboard';
}

const STAFF_RETURN_PATH = /^\/(admin|genealogist)(?:\/[A-Za-z0-9_-]+)*\/?$/;

/** After staff sign-in: only a path inside the area of the signed-in role is accepted. */
export function safeStaffReturnPath(raw: unknown, role: 'admin' | 'genealogist'): string {
  const home = `/${role}`;
  return typeof raw === 'string' && STAFF_RETURN_PATH.test(raw) && raw.startsWith(home) ? raw : home;
}
