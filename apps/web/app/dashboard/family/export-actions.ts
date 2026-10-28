'use server';

import type { ExportJobView, ExportOptionsView, ExportPreviewView } from '@kulvriksh/shared';
import { customerApi, failureMessage } from '@/lib/api/session-api';

// Tree export actions. The API resolves the workspace from the customer's session; nothing here
// names a workspace. Options are validated again by the API.

export type ExportActionResult = { ok: true; job: ExportJobView } | { ok: false; message: string; fields?: Record<string, string> };

const path = (id: string) => `/api/v1/family/exports/${encodeURIComponent(String(id))}`;

export async function requestExportAction(options: ExportOptionsView): Promise<ExportActionResult> {
  const result = await customerApi<{ job: ExportJobView }>('/api/v1/family/exports', { method: 'POST', body: options });
  if (result.kind === 'ok') {
    return { ok: true, job: result.data.job };
  }
  if (result.kind === 'rate_limited') {
    return { ok: false, message: 'Many exports are being prepared right now. Please try again in a minute.' };
  }
  if (result.kind === 'unauthorized' && result.code === 'ENTITLEMENT_REQUIRED') {
    return { ok: false, message: 'Your plan does not include tree export. See Plans & payments.' };
  }
  return { ok: false, message: failureMessage(result), ...(result.kind === 'invalid' ? { fields: result.fields } : {}) };
}

export async function getExportAction(id: string): Promise<ExportActionResult> {
  const result = await customerApi<{ job: ExportJobView }>(path(id));
  return result.kind === 'ok' ? { ok: true, job: result.data.job } : { ok: false, message: failureMessage(result) };
}

export async function cancelExportAction(id: string): Promise<{ ok: boolean; message: string }> {
  const result = await customerApi(path(id), { method: 'DELETE' });
  return result.kind === 'ok' ? { ok: true, message: 'Export cancelled.' } : { ok: false, message: failureMessage(result) };
}

export type PreviewActionResult = { ok: true; preview: ExportPreviewView } | { ok: false; message: string; busy?: boolean };

/** What the options would produce. Nothing is created; the API runs the real layout in a worker. */
export async function previewExportAction(options: ExportOptionsView): Promise<PreviewActionResult> {
  const result = await customerApi<{ preview: ExportPreviewView }>('/api/v1/family/exports/preview', { method: 'POST', body: options });
  if (result.kind === 'ok') {
    return { ok: true, preview: result.data.preview };
  }
  if (result.kind === 'rate_limited') {
    return { ok: false, busy: true, message: 'Updating the estimate…' };
  }
  return { ok: false, message: result.kind === 'invalid' ? 'Check the options above.' : failureMessage(result) };
}
