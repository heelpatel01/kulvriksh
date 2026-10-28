import type { ServiceStatus } from '@kulvriksh/shared';

// Limits match the CHECK constraints in the create_service migration. They are provisional
// until the descriptive fields are confirmed (R12).
export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 2000;
const STATUSES: readonly ServiceStatus[] = ['active', 'inactive'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ServiceInput {
  name: string;
  description: string;
  status: ServiceStatus;
}

export type ServicePatch = Partial<ServiceInput>;

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };

export const isUuid = (value: string) => UUID.test(value);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(body: Record<string, unknown>, key: 'name' | 'description', max: number, fields: Record<string, string>) {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fields[key] = `${key === 'name' ? 'Name' : 'Description'} is required.`;
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    fields[key] = `Use at most ${max} characters.`;
    return undefined;
  }
  return trimmed;
}

function readStatus(body: Record<string, unknown>, fields: Record<string, string>) {
  const value = body.status;
  if (typeof value !== 'string' || !(STATUSES as readonly string[]).includes(value)) {
    fields.status = 'Status must be "active" or "inactive".';
    return undefined;
  }
  return value as ServiceStatus;
}

function rejectUnknown(body: Record<string, unknown>, fields: Record<string, string>) {
  for (const key of Object.keys(body)) {
    if (!['name', 'description', 'status'].includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
}

export function validateCreate(body: unknown): Validation<ServiceInput> {
  if (!isRecord(body)) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, fields);
  const name = readText(body, 'name', NAME_MAX, fields);
  const description = readText(body, 'description', DESCRIPTION_MAX, fields);
  // New services start inactive, so nothing appears publicly until an admin activates it.
  const status = body.status === undefined ? 'inactive' : readStatus(body, fields);
  if (Object.keys(fields).length > 0 || !name || !description || !status) {
    return { ok: false, fields };
  }
  return { ok: true, value: { name, description, status } };
}

export function validateUpdate(body: unknown): Validation<ServicePatch> {
  if (!isRecord(body)) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, fields);
  const patch: ServicePatch = {};
  if (body.name !== undefined) {
    patch.name = readText(body, 'name', NAME_MAX, fields);
  }
  if (body.description !== undefined) {
    patch.description = readText(body, 'description', DESCRIPTION_MAX, fields);
  }
  if (body.status !== undefined) {
    patch.status = readStatus(body, fields);
  }
  if (Object.keys(fields).length === 0 && Object.keys(patch).length === 0) {
    fields.body = 'Send at least one of name, description or status.';
  }
  if (Object.keys(fields).length > 0) {
    return { ok: false, fields };
  }
  return { ok: true, value: patch };
}
