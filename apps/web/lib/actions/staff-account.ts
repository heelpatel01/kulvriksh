'use server';

import { revalidatePath } from 'next/cache';
import type { StaffMfaEnrolment } from '@kulvriksh/shared';
import { failureMessage, staffApi } from '@/lib/api/session-api';

// Staff self-service: password change and the TOTP second factor. Each call uses the staff
// member's own session; the API checks the current password or a current code.

export type AccountResult = { ok: true; message: string; enrolment?: StaffMfaEnrolment } | { ok: false; message: string; fields?: Record<string, string> };

export async function changeStaffPasswordAction(input: { currentPassword: string; newPassword: string }): Promise<AccountResult> {
  const result = await staffApi<{ revokedSessions: number }>('/api/v1/staff/me/password', {
    method: 'POST',
    body: { currentPassword: String(input.currentPassword ?? ''), newPassword: String(input.newPassword ?? '') },
  });
  if (result.kind === 'ok') {
    return { ok: true, message: `Password changed. ${result.data.revokedSessions} other session(s) were signed out.` };
  }
  return { ok: false, message: failureMessage(result), ...(result.kind === 'invalid' ? { fields: result.fields } : {}) };
}

export async function startMfaAction(): Promise<AccountResult> {
  const result = await staffApi<{ enrolment: StaffMfaEnrolment }>('/api/v1/staff/me/mfa/start', { method: 'POST' });
  return result.kind === 'ok'
    ? { ok: true, message: 'Add the key to your authenticator app, then enter its code.', enrolment: result.data.enrolment }
    : { ok: false, message: failureMessage(result) };
}

export async function confirmMfaAction(input: { code: string }, area: 'admin' | 'genealogist'): Promise<AccountResult> {
  const result = await staffApi('/api/v1/staff/me/mfa/confirm', { method: 'POST', body: { code: String(input.code ?? '').replace(/\s/g, '') } });
  if (result.kind === 'ok') {
    revalidatePath(`/${area === 'admin' ? 'admin' : 'genealogist'}/account`);
    return { ok: true, message: 'Two-step sign-in is on.' };
  }
  return { ok: false, message: result.kind === 'invalid' ? 'The code is incorrect. Use the current code from the app.' : failureMessage(result) };
}

export async function disableMfaAction(input: { code: string }, area: 'admin' | 'genealogist'): Promise<AccountResult> {
  const result = await staffApi('/api/v1/staff/me/mfa/disable', { method: 'POST', body: { code: String(input.code ?? '').replace(/\s/g, '') } });
  if (result.kind === 'ok') {
    revalidatePath(`/${area === 'admin' ? 'admin' : 'genealogist'}/account`);
    return { ok: true, message: 'Two-step sign-in is off.' };
  }
  if (result.kind === 'unauthorized') {
    return { ok: false, message: 'Two-step sign-in is required for your role and cannot be turned off.' };
  }
  return { ok: false, message: result.kind === 'invalid' ? 'The code is incorrect.' : failureMessage(result) };
}
