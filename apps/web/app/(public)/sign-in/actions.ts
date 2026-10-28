'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { OtpRequestAccepted, SignInResponse } from '@kulvriksh/shared';
import { apiRequest } from '@/lib/api/client';
import { SESSION_COOKIE, safeReturnPath, sessionCookieOptions } from '@/lib/auth/cookie';
import { clientIp, sessionToken } from '@/lib/auth/session';

// Customer sign-in (F-AUTH-01/02). These run on the Next.js server, which calls the API
// server-to-server; the browser never sees the API or the session token. Next.js checks the
// request origin for every Server Action.

export type RequestCodeState =
  | { step: 'number'; error?: string; mobileNumber?: string }
  | {
      step: 'code';
      /** New for every code issued, so the code step starts fresh after a resend. */
      issueId: string;
      mobileNumber: string;
      expiresInSeconds: number;
      resendAfterSeconds: number;
      /** Local development only: the code from the API's development outbox (never in production). */
      devCode?: string;
      notice?: string;
    };

export type VerifyCodeState = { error?: string; fields?: Record<string, string> };

const waitMessage = (seconds: number) =>
  `Too many attempts. Please try again in ${seconds < 120 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}.`;

/**
 * Development outbox (OTP_DELIVERY=development). The API registers this route only in development
 * and only answers the local web server's preview token, so in any other environment this is
 * always undefined.
 */
async function developmentCode(mobileNumber: string): Promise<string | undefined> {
  if (!process.env.ADMIN_PREVIEW_TOKEN) {
    return undefined;
  }
  const result = await apiRequest<{ code: string }>(`/api/v1/dev/otp-outbox?mobileNumber=${encodeURIComponent(mobileNumber)}`, {
    admin: true,
  });
  return result.kind === 'ok' ? result.data.code : undefined;
}

export async function requestCodeAction(_previous: RequestCodeState, formData: FormData): Promise<RequestCodeState> {
  const mobileNumber = String(formData.get('mobileNumber') ?? '').trim();
  const result = await apiRequest<OtpRequestAccepted>('/api/v1/auth/otp/request', {
    method: 'POST',
    body: { mobileNumber },
    clientIp: await clientIp(),
  });
  switch (result.kind) {
    case 'ok':
      return {
        step: 'code',
        issueId: crypto.randomUUID(),
        mobileNumber,
        expiresInSeconds: result.data.expiresInSeconds,
        resendAfterSeconds: result.data.resendAfterSeconds,
        devCode: await developmentCode(mobileNumber),
        notice: formData.get('resend') ? 'A new code was requested. Earlier codes no longer work.' : undefined,
      };
    case 'invalid':
      return { step: 'number', mobileNumber, error: result.fields.mobileNumber ?? 'Enter a 10-digit Indian mobile number.' };
    case 'rate_limited':
      return { step: 'number', mobileNumber, error: waitMessage(result.retryAfterSeconds) };
    case 'unavailable':
      return { step: 'number', mobileNumber, error: 'We could not send a code right now. Please try again.' };
    default:
      return { step: 'number', mobileNumber, error: 'Sign-in is not available right now. Please try again later.' };
  }
}

export async function verifyCodeAction(_previous: VerifyCodeState, formData: FormData): Promise<VerifyCodeState> {
  const mobileNumber = String(formData.get('mobileNumber') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const result = await apiRequest<SignInResponse>('/api/v1/auth/otp/verify', {
    method: 'POST',
    body: { mobileNumber, code },
    clientIp: await clientIp(),
  });
  switch (result.kind) {
    case 'ok':
      break;
    case 'invalid':
      return result.fields.code
        ? { fields: { code: result.fields.code } }
        : { error: 'The code is incorrect or has expired. Check it, or request a new code.' };
    case 'rate_limited':
      return { error: `${waitMessage(result.retryAfterSeconds)} You can request a new code once the wait is over.` };
    case 'unauthorized':
      return { error: 'This account cannot sign in. Please contact support.' };
    default:
      return { error: 'Sign-in is not available right now. Please try again.' };
  }

  // Rotate: a session that was already in this browser is ended before the new one is stored.
  const previous = await sessionToken();
  if (previous) {
    await apiRequest('/api/v1/auth/logout', { method: 'POST', token: previous });
  }
  const { token, expiresAt } = result.data.session;
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(new Date(expiresAt)));
  redirect(safeReturnPath(formData.get('next')));
}

/** Expires the cookie with the same attributes it was set with (a __Host- cookie needs Secure). */
async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, '', { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
}

/** Ends this session server-side and clears the cookie. The caller then reloads the document. */
export async function signOutAction(): Promise<void> {
  const token = await sessionToken();
  if (token) {
    await apiRequest('/api/v1/auth/logout', { method: 'POST', token });
  }
  await clearSessionCookie();
}

/** Ends every session of this customer (all devices), then clears this browser's cookie. */
export async function signOutEverywhereAction(): Promise<{ ok: boolean }> {
  const token = await sessionToken();
  const result = token ? await apiRequest('/api/v1/auth/logout-all', { method: 'POST', token }) : undefined;
  await clearSessionCookie();
  return { ok: result?.kind === 'ok' };
}
