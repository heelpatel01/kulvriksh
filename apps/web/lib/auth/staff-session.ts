// Server-side only. Staff (genealogist and admin) sessions, validated with the API on every
// request. A staff page is never authorised by the cookie, the URL or the layout alone: the API
// checks the role and permission again on every data request.
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import type { StaffIdentity, StaffRole, StaffSessionResponse } from '@kulvriksh/shared';
import { apiRequest } from '@/lib/api/client';
import { STAFF_SESSION_COOKIE, safeStaffReturnPath } from './cookie';

export type StaffSession = { kind: 'signed_in'; user: StaffIdentity } | { kind: 'signed_out' } | { kind: 'unavailable' };

export async function staffToken(): Promise<string | undefined> {
  return (await cookies()).get(STAFF_SESSION_COOKIE)?.value;
}

export const getStaffSession = cache(async (): Promise<StaffSession> => {
  const token = await staffToken();
  if (!token) {
    return { kind: 'signed_out' };
  }
  const result = await apiRequest<StaffSessionResponse>('/api/v1/staff/auth/session', { token });
  switch (result.kind) {
    case 'ok':
      return { kind: 'signed_in', user: result.data.user };
    case 'unauthorized':
      return { kind: 'signed_out' };
    default:
      return { kind: 'unavailable' };
  }
});

/**
 * For staff pages: the signed-in staff member with `role`. Signed out → one redirect to staff
 * sign-in; another role → 404 (the area does not exist for them); unavailable → the area's error
 * boundary, never private content.
 */
export async function requireStaff(role: StaffRole): Promise<StaffIdentity> {
  const session = await getStaffSession();
  if (session.kind === 'signed_in') {
    if (session.user.role !== role) {
      notFound();
    }
    return session.user;
  }
  if (session.kind === 'signed_out') {
    const path = (await headers()).get('x-kv-pathname');
    redirect(`/staff/sign-in?next=${encodeURIComponent(safeStaffReturnPath(path, role))}`);
  }
  throw new Error('The sign-in service is unavailable');
}
