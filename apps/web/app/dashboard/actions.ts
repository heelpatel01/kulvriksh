'use server';

import { revalidatePath } from 'next/cache';
import type { RelationshipType } from '@kulvriksh/shared';
import type { ApiResult } from '@/lib/api/client';
import { customerApi, failureMessage } from '@/lib/api/session-api';

// Customer Server Actions. They run on the Next.js server with the customer's own session; the
// API validates every field and decides ownership. No user or workspace ID is ever sent from here:
// the API takes them from the session.

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

const FAMILY = ['/dashboard/family', '/dashboard'];

export async function updateProfileAction(input: { displayName: string }): Promise<ActionResult> {
  const result = await customerApi('/api/v1/me/profile', { method: 'PATCH', body: { displayName: String(input.displayName ?? '') } });
  return outcome(result, 'Profile saved.', ['/dashboard/settings', '/dashboard']);
}

export async function createWorkspaceAction(input: { name: string }): Promise<ActionResult> {
  const result = await customerApi('/api/v1/family', { method: 'POST', body: { name: String(input.name ?? '') } });
  return outcome(result, 'Your family workspace is ready.', FAMILY);
}

export async function renameWorkspaceAction(input: { name: string }): Promise<ActionResult> {
  const result = await customerApi('/api/v1/family', { method: 'PATCH', body: { name: String(input.name ?? '') } });
  return outcome(result, 'Family name saved.', FAMILY);
}

export async function addMemberAction(input: { displayName: string }): Promise<ActionResult> {
  const result = await customerApi('/api/v1/family/members', { method: 'POST', body: { displayName: String(input.displayName ?? '') } });
  return outcome(result, 'Person added.', FAMILY);
}

export async function renameMemberAction(input: { id: string; displayName: string; version: number }): Promise<ActionResult> {
  const result = await customerApi(`/api/v1/family/members/${encodeURIComponent(String(input.id))}`, {
    method: 'PATCH',
    body: { displayName: String(input.displayName ?? ''), version: Number(input.version) },
  });
  return outcome(result, 'Name saved.', FAMILY);
}

export async function deleteMemberAction(input: { id: string; version: number }): Promise<ActionResult> {
  const result = await customerApi(`/api/v1/family/members/${encodeURIComponent(String(input.id))}`, {
    method: 'DELETE',
    body: { version: Number(input.version) },
  });
  return outcome(result, 'Person removed.', FAMILY);
}

export async function addRelationshipAction(input: { type: RelationshipType; fromMemberId: string; toMemberId: string }): Promise<ActionResult> {
  const result = await customerApi('/api/v1/family/relationships', {
    method: 'POST',
    body: { type: String(input.type), fromMemberId: String(input.fromMemberId), toMemberId: String(input.toMemberId) },
  });
  return outcome(result, 'Relationship added.', FAMILY);
}

export async function deleteRelationshipAction(input: { id: string }): Promise<ActionResult> {
  const result = await customerApi(`/api/v1/family/relationships/${encodeURIComponent(String(input.id))}`, { method: 'DELETE' });
  return outcome(result, 'Relationship removed.', FAMILY);
}

export async function markNotificationReadAction(input: { id: string }): Promise<ActionResult> {
  const result = await customerApi(`/api/v1/notifications/${encodeURIComponent(String(input.id))}/read`, { method: 'POST' });
  return outcome(result, 'Marked as read.', ['/dashboard/notifications', '/dashboard']);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const result = await customerApi('/api/v1/notifications/read-all', { method: 'POST' });
  return outcome(result, 'All notifications marked as read.', ['/dashboard/notifications', '/dashboard']);
}

export async function deleteMediaAction(input: { id: string }): Promise<ActionResult> {
  const result = await customerApi(`/api/v1/family/media/${encodeURIComponent(String(input.id))}`, { method: 'DELETE' });
  return outcome(result, 'File removed.', ['/dashboard/media']);
}
