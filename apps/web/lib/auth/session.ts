// Server-side only. Validates the customer's session with the API on every request: the cookie
// alone proves nothing, because sessions can be revoked or expire server-side (F-AUTH-05).
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { CustomerIdentity, SessionResponse } from '@kulvriksh/shared';
import { apiRequest } from '@/lib/api/client';
import { SESSION_COOKIE, safeReturnPath } from './cookie';

export type CustomerSession =
  | { kind: 'signed_in'; user: CustomerIdentity; expiresAt: string }
  | { kind: 'signed_out' }
  /** The API or database could not answer. Never treated as signed in or as signed out. */
  | { kind: 'unavailable' };

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** One API check per request, however many components ask. */
export const getCustomerSession = cache(async (): Promise<CustomerSession> => {
  const token = await sessionToken();
  if (!token) {
    return { kind: 'signed_out' };
  }
  const result = await apiRequest<SessionResponse>('/api/v1/auth/session', { token });
  switch (result.kind) {
    case 'ok':
      return { kind: 'signed_in', user: result.data.user, expiresAt: result.data.session.expiresAt };
    case 'unauthorized':
      return { kind: 'signed_out' };
    default:
      return { kind: 'unavailable' };
  }
});

/**
 * For customer pages: returns the signed-in customer, or redirects once to sign-in with a
 * validated return path. When the session cannot be checked it throws, so the area's error
 * boundary shows a retryable error instead of private content or a redirect loop.
 */
export async function requireCustomer(): Promise<CustomerIdentity> {
  const session = await getCustomerSession();
  if (session.kind === 'signed_in') {
    return session.user;
  }
  if (session.kind === 'signed_out') {
    const path = (await headers()).get('x-kv-pathname');
    redirect(`/sign-in?next=${encodeURIComponent(safeReturnPath(path))}`);
  }
  throw new Error('The sign-in service is unavailable');
}

/**
 * The visitor's address for the API's per-IP limits: the right-most X-Forwarded-For entry,
 * i.e. the one added by the nearest proxy. Which proxies are trusted in production is AC-14.
 */
export async function clientIp(): Promise<string | undefined> {
  const forwarded = (await headers()).get('x-forwarded-for');
  const last = forwarded?.split(',').pop()?.trim();
  return last && /^[0-9a-fA-F:.]{2,45}$/.test(last) ? last : undefined;
}
