'use server';

import { revalidatePath } from 'next/cache';
import type { StaffLinkIssued } from '@kulvriksh/shared';
import type { ApiResult } from '@/lib/api/client';
import { failureMessage, staffApi } from '@/lib/api/session-api';

// Admin Server Actions. Each call carries the admin's own session; the API checks the admin
// permission, validates input and writes the audit event in the same transaction as the change.

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fields?: Record<string, string> };

function outcome(result: ApiResult<unknown>, success: string, paths: string[]): ActionResult {
  if (result.kind === 'ok') {
    for (const path of paths) {
      revalidatePath(path);
    }
    return { ok: true, message: success };
  }
  return { ok: false, message: failureMessage(result), ...(result.kind === 'invalid' ? { fields: result.fields } : {}) };
}

const id = (value: string) => encodeURIComponent(String(value));

export async function assignAction(input: { workspaceId: string; genealogistId: string }): Promise<ActionResult> {
  const result = await staffApi('/api/v1/admin/assignments', {
    method: 'POST',
    body: { workspaceId: String(input.workspaceId), genealogistId: String(input.genealogistId) },
  });
  return outcome(result, 'Genealogist assigned.', ['/admin/cases', '/admin/genealogists']);
}

export async function removeAssignmentAction(input: { assignmentId: string }): Promise<ActionResult> {
  const result = await staffApi(`/api/v1/admin/assignments/${id(input.assignmentId)}/remove`, { method: 'POST' });
  return outcome(result, 'Assignment removed. The genealogist lost access immediately.', ['/admin/cases', '/admin/genealogists']);
}

export async function returnReportAction(input: { reportId: string; reason: string }): Promise<ActionResult> {
  const result = await staffApi(`/api/v1/admin/reports/${id(input.reportId)}/return`, { method: 'POST', body: { reason: String(input.reason ?? '') } });
  return outcome(result, 'Report returned to the genealogist.', ['/admin/cases']);
}

export async function releaseReportAction(input: { reportId: string }): Promise<ActionResult> {
  const result = await staffApi(`/api/v1/admin/reports/${id(input.reportId)}/release`, { method: 'POST' });
  return outcome(result, 'Report released to the family.', ['/admin/cases']);
}

export async function setGenealogistStatusAction(input: { genealogistId: string; active: boolean }): Promise<ActionResult> {
  const path = input.active ? 'reactivate' : 'deactivate';
  const result = await staffApi(`/api/v1/admin/genealogists/${id(input.genealogistId)}/${path}`, { method: 'POST' });
  return outcome(result, input.active ? 'Genealogist reactivated.' : 'Genealogist deactivated and signed out.', ['/admin/genealogists', '/admin/cases']);
}

// ---- Staff accounts (TASK-10) ----

export type LinkActionResult =
  | { ok: true; message: string; link?: { token: string; expiresAt: string } }
  | { ok: false; message: string; fields?: Record<string, string> };

function linkOutcome(result: ApiResult<{ link?: StaffLinkIssued }>, success: string): LinkActionResult {
  if (result.kind === 'ok') {
    revalidatePath('/admin/staff');
    const link = result.data?.link;
    return { ok: true, message: success, ...(link ? { link: { token: link.token, expiresAt: link.expiresAt } } : {}) };
  }
  if (result.kind === 'unauthorized') {
    return { ok: false, message: 'Not allowed: your own account and other administrators cannot be changed here (or your session has ended).' };
  }
  return { ok: false, message: failureMessage(result), ...(result.kind === 'invalid' ? { fields: result.fields } : {}) };
}

export async function createStaffAction(input: { email: string; displayName: string; role: 'genealogist' | 'admin' }): Promise<LinkActionResult> {
  const result = await staffApi<{ link: StaffLinkIssued }>('/api/v1/admin/staff', {
    method: 'POST',
    body: { email: String(input.email ?? ''), displayName: String(input.displayName ?? ''), role: String(input.role) },
  });
  return linkOutcome(result, 'Account created. Send the setup link below to the person through a trusted channel.');
}

export async function issueStaffLinkAction(input: { userId: string }): Promise<LinkActionResult> {
  const result = await staffApi<{ link: StaffLinkIssued }>(`/api/v1/admin/staff/${id(input.userId)}/password-link`, { method: 'POST' });
  return linkOutcome(result, 'New link issued. Any previous password and sessions of this person no longer work.');
}

export async function setStaffStatusAction(input: { userId: string; active: boolean }): Promise<LinkActionResult> {
  const result = await staffApi<{ link?: StaffLinkIssued }>(`/api/v1/admin/staff/${id(input.userId)}/${input.active ? 'reactivate' : 'deactivate'}`, { method: 'POST' });
  return linkOutcome(result, input.active ? 'Account reactivated.' : 'Account deactivated and signed out everywhere.');
}

export async function resetStaffMfaAction(input: { userId: string }): Promise<LinkActionResult> {
  const result = await staffApi<{ link?: StaffLinkIssued }>(`/api/v1/admin/staff/${id(input.userId)}/mfa/reset`, { method: 'POST' });
  return linkOutcome(result, 'Two-step sign-in removed. The person sets it up again at the next sign-in if required.');
}

// ---- TASK-11: plans (F-ADM-04) and orders (F-ADM-05) ----

export async function createPlanAction(input: { serviceId: string; name: string; description: string; priceMinor: number; entitlementKeys: string[] }): Promise<ActionResult> {
  const result = await staffApi('/api/v1/admin/plans', {
    method: 'POST',
    body: {
      serviceId: String(input.serviceId),
      name: String(input.name ?? ''),
      description: String(input.description ?? ''),
      priceMinor: Number(input.priceMinor),
      entitlementKeys: Array.isArray(input.entitlementKeys) ? input.entitlementKeys.map(String) : [],
    },
  });
  return outcome(result, 'Plan created. It stays hidden until you activate it.', ['/admin/plans']);
}

export async function updatePlanAction(input: {
  id: string;
  name?: string;
  description?: string;
  priceMinor?: number;
  status?: 'active' | 'inactive';
  entitlementKeys?: string[];
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = String(input.name);
  if (input.description !== undefined) body.description = String(input.description);
  if (input.priceMinor !== undefined) body.priceMinor = Number(input.priceMinor);
  if (input.status !== undefined) body.status = input.status === 'active' ? 'active' : 'inactive';
  if (input.entitlementKeys !== undefined) body.entitlementKeys = input.entitlementKeys.map(String);
  const result = await staffApi(`/api/v1/admin/plans/${id(input.id)}`, { method: 'PATCH', body });
  const message = input.status === 'active' ? 'Plan activated.' : input.status === 'inactive' ? 'Plan deactivated. Existing orders keep their price.' : 'Plan saved. Existing orders keep their price.';
  return outcome(result, message, ['/admin/plans']);
}

export async function regrantAction(input: { orderId: string }): Promise<ActionResult> {
  const result = await staffApi(`/api/v1/admin/orders/${id(input.orderId)}/regrant`, { method: 'POST' });
  return outcome(result, 'Grant re-run. An order that was already granted is unchanged.', ['/admin/transactions', `/admin/transactions/${id(input.orderId)}`]);
}
