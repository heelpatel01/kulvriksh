'use server';

import { revalidatePath } from 'next/cache';
import type { ResearchRecordKind } from '@kulvriksh/shared';
import type { ApiResult } from '@/lib/api/client';
import { failureMessage, staffApi } from '@/lib/api/session-api';

// Genealogist Server Actions. The API checks the genealogist's role and current assignment on
// every call; if the assignment was removed, the call fails with not_found and nothing is saved.

export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fields?: Record<string, string> };

const casePath = (workspaceId: string) => `/api/v1/genealogist/cases/${encodeURIComponent(String(workspaceId))}`;

function outcome(result: ApiResult<unknown>, success: string, workspaceId: string): ActionResult {
  if (result.kind === 'ok') {
    revalidatePath(`/genealogist/cases/${workspaceId}`);
    revalidatePath('/genealogist/cases');
    revalidatePath('/genealogist');
    return { ok: true, message: success };
  }
  return { ok: false, message: failureMessage(result), ...(result.kind === 'invalid' ? { fields: result.fields } : {}) };
}

export async function addRecordAction(input: { workspaceId: string; kind: ResearchRecordKind; body: string }): Promise<ActionResult> {
  const result = await staffApi(`${casePath(input.workspaceId)}/records`, {
    method: 'POST',
    body: { kind: String(input.kind), body: String(input.body ?? '') },
  });
  return outcome(result, input.kind === 'source' ? 'Source saved.' : 'Note saved.', input.workspaceId);
}

export async function updateRecordAction(input: { workspaceId: string; id: string; body: string; version: number }): Promise<ActionResult> {
  const result = await staffApi(`${casePath(input.workspaceId)}/records/${encodeURIComponent(String(input.id))}`, {
    method: 'PATCH',
    body: { body: String(input.body ?? ''), version: Number(input.version) },
  });
  return outcome(result, 'Record updated.', input.workspaceId);
}

export async function createReportAction(input: { workspaceId: string; title: string }): Promise<ActionResult> {
  const result = await staffApi(`${casePath(input.workspaceId)}/reports`, { method: 'POST', body: { title: String(input.title ?? '') } });
  return outcome(result, 'Draft report created.', input.workspaceId);
}

export async function saveReportAction(input: { workspaceId: string; id: string; title: string; body: string; version: number }): Promise<ActionResult> {
  const result = await staffApi(`${casePath(input.workspaceId)}/reports/${encodeURIComponent(String(input.id))}`, {
    method: 'PATCH',
    body: { title: String(input.title ?? ''), body: String(input.body ?? ''), version: Number(input.version) },
  });
  return outcome(result, 'Report saved.', input.workspaceId);
}

export async function submitReportAction(input: { workspaceId: string; id: string }): Promise<ActionResult> {
  const result = await staffApi(`${casePath(input.workspaceId)}/reports/${encodeURIComponent(String(input.id))}/submit`, { method: 'POST' });
  return outcome(result, 'Report submitted for review.', input.workspaceId);
}
