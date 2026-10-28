'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { PUBLIC_SERVICES_TAG } from '@/lib/api/public-services';
import { createService, updateService, type ServiceInput, type ServiceStatus } from '@/lib/api/services';
import type { ApiResult } from '@/lib/api/client';

/** Admin changes refresh this screen and expire the public catalogue (AS-ADM-07). */
function refreshAfterChange() {
  revalidatePath('/admin/services');
  updateTag(PUBLIC_SERVICES_TAG);
}

// Server Actions for the admin services screen. They run on the Next.js server, which calls the
// API server-to-server; the API validates and persists. Next.js checks the request origin.
export type ActionResult = { ok: true; message: string } | { ok: false; message: string; fields?: Record<string, string> };

function failure(result: Exclude<ApiResult<unknown>, { kind: 'ok' }>): ActionResult {
  switch (result.kind) {
    case 'invalid':
      return { ok: false, message: 'Please correct the highlighted fields.', fields: result.fields };
    case 'not_found':
      return { ok: false, message: 'This service no longer exists. Reload the page.' };
    case 'unauthorized':
      return { ok: false, message: 'Your admin session has ended or lacks permission. Sign in again.' };
    case 'not_configured':
      return { ok: false, message: 'The API is not connected. Set API_INTERNAL_URL.' };
    case 'unreachable':
    case 'unavailable':
      return { ok: false, message: 'The service is temporarily unavailable. Nothing was saved; please try again.' };
    default:
      return { ok: false, message: 'Something went wrong. Nothing was saved.' };
  }
}

const isStatus = (value: unknown): value is ServiceStatus => value === 'active' || value === 'inactive';

export async function createServiceAction(input: ServiceInput): Promise<ActionResult> {
  if (!isStatus(input.status)) {
    return { ok: false, message: 'Choose a status.' };
  }
  const result = await createService({ name: String(input.name), description: String(input.description), status: input.status });
  if (result.kind !== 'ok') {
    return failure(result);
  }
  refreshAfterChange();
  return { ok: true, message: `“${result.data.service.name}” was saved.` };
}

export async function updateServiceAction(id: string, patch: Partial<ServiceInput>): Promise<ActionResult> {
  if (patch.status !== undefined && !isStatus(patch.status)) {
    return { ok: false, message: 'Choose a status.' };
  }
  const result = await updateService(String(id), patch);
  if (result.kind !== 'ok') {
    return failure(result);
  }
  refreshAfterChange();
  return { ok: true, message: `“${result.data.service.name}” was updated.` };
}
