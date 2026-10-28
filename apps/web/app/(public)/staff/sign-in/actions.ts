'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { StaffMfaChallenge, StaffMfaEnrolment, StaffSignInResponse } from '@kulvriksh/shared';
import { apiRequest } from '@/lib/api/client';
import { STAFF_SESSION_COOKIE, safeStaffReturnPath, sessionCookieOptions } from '@/lib/auth/cookie';
import { clientIp } from '@/lib/auth/session';
import { staffToken } from '@/lib/auth/staff-session';

// Staff sign-in (provisional method, R9: email and password, plus TOTP when enrolled or required,
// R34). Runs on the Next.js server; the password and codes go only to the API, the session token
// only into an HttpOnly cookie.

export type StaffSignInState =
  | { step: 'password'; error?: string; fields?: Record<string, string>; email?: string }
  /** Password accepted; a TOTP code is needed. The challenge is short-lived and single-use. */
  | { step: 'code'; challengeToken: string; error?: string }
  /** Password accepted, but this role must enrol a second factor before its first session. */
  | { step: 'enrol'; challengeToken: string; enrolment?: StaffMfaEnrolment; error?: string };

async function clearStaffCookie() {
  (await cookies()).set(STAFF_SESSION_COOKIE, '', { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}

/** Stores the new session (ending any previous one in this browser) and goes to the area. */
async function finish(result: StaffSignInResponse, next: FormDataEntryValue | null): Promise<never> {
  const previous = await staffToken();
  if (previous) {
    await apiRequest('/api/v1/auth/logout', { method: 'POST', token: previous });
  }
  (await cookies()).set(STAFF_SESSION_COOKIE, result.session.token, sessionCookieOptions(new Date(result.session.expiresAt)));
  redirect(safeStaffReturnPath(next, result.user.role));
}

export async function staffSignInAction(previous: StaffSignInState, formData: FormData): Promise<StaffSignInState> {
  const step = String(formData.get('step') ?? 'password');
  if (step === 'code' || step === 'enrol-confirm') {
    const challengeToken = String(formData.get('challengeToken') ?? '');
    const code = String(formData.get('code') ?? '').replace(/\s/g, '');
    const path = step === 'code' ? '/api/v1/staff/auth/mfa' : '/api/v1/staff/auth/mfa/enrol/confirm';
    const result = await apiRequest<StaffSignInResponse>(path, { method: 'POST', body: { challengeToken, code }, clientIp: await clientIp() });
    if (result.kind === 'ok') {
      return finish(result.data, formData.get('next'));
    }
    const error =
      result.kind === 'rate_limited' ? 'Too many attempts. Sign in again in a while.' : 'The code is incorrect or has expired. Try the current code, or sign in again.';
    return step === 'code'
      ? { step: 'code', challengeToken, error }
      : { step: 'enrol', challengeToken, ...(previous.step === 'enrol' && previous.enrolment ? { enrolment: previous.enrolment } : {}), error };
  }
  if (step === 'enrol-start') {
    const challengeToken = String(formData.get('challengeToken') ?? '');
    const result = await apiRequest<{ enrolment: StaffMfaEnrolment }>('/api/v1/staff/auth/mfa/enrol/start', {
      method: 'POST',
      body: { challengeToken },
      clientIp: await clientIp(),
    });
    return result.kind === 'ok'
      ? { step: 'enrol', challengeToken, enrolment: result.data.enrolment }
      : { step: 'password', error: 'Your sign-in expired. Please sign in again.' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const result = await apiRequest<StaffSignInResponse | StaffMfaChallenge>('/api/v1/staff/auth/sign-in', {
    method: 'POST',
    body: { email, password },
    clientIp: await clientIp(),
  });
  switch (result.kind) {
    case 'ok':
      if ('mfa' in result.data) {
        return { step: result.data.mfa === 'required' ? 'code' : 'enrol', challengeToken: result.data.challengeToken };
      }
      return finish(result.data, formData.get('next'));
    case 'invalid':
      return result.code === 'INVALID_CREDENTIALS'
        ? { step: 'password', email, error: 'The email or password is incorrect.' }
        : { step: 'password', email, fields: result.fields };
    case 'rate_limited':
      return { step: 'password', email, error: `Too many attempts. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minutes.` };
    case 'unauthorized':
      return { step: 'password', email, error: 'This account cannot sign in. Contact an administrator.' };
    default:
      return { step: 'password', email, error: 'Sign-in is not available right now. Please try again.' };
  }
}

/** Ends the staff session on the server and clears the cookie. The caller reloads the document. */
export async function staffSignOutAction(): Promise<void> {
  const token = await staffToken();
  if (token) {
    await apiRequest('/api/v1/auth/logout', { method: 'POST', token });
  }
  await clearStaffCookie();
}

export type LinkState = { done?: boolean; error?: string; fields?: Record<string, string> };

/** Completes a one-time setup or reset link with the person's new password. */
export async function completePasswordLinkAction(_previous: LinkState, formData: FormData): Promise<LinkState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password !== String(formData.get('confirm') ?? '')) {
    return { fields: { confirm: 'The passwords do not match.' } };
  }
  const result = await apiRequest('/api/v1/staff/auth/password/complete', { method: 'POST', body: { token, password }, clientIp: await clientIp() });
  if (result.kind === 'ok') {
    return { done: true };
  }
  if (result.kind === 'invalid' && result.code !== 'INVALID_LINK') {
    return { fields: result.fields };
  }
  return { error: 'This link is invalid, already used or expired. Ask an administrator for a new one.' };
}

export type ResetRequestState = { sent?: boolean; error?: string };

/** Self-service reset: the same answer whether or not the email has an account. */
export async function requestPasswordResetAction(_previous: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get('email') ?? '').trim();
  const result = await apiRequest('/api/v1/staff/auth/password/reset-request', { method: 'POST', body: { email }, clientIp: await clientIp() });
  if (result.kind === 'rate_limited') {
    return { error: 'Too many requests. Please try again later.' };
  }
  return result.kind === 'ok' ? { sent: true } : { error: 'This is not available right now. Please try again.' };
}
