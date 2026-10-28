import type { ResearchRecordKind } from '@kulvriksh/shared';
import { isUuid } from '../http.ts';

// Input rules for research (F-GEN-03, F-GEN-04, F-REP-01/02). Fields are placeholders (R31): a
// record is a note or a source reference as text; a report is a title and in-platform text.
// Limits match the CHECK constraints in the sprint1 migration.

export const RECORD_BODY_MAX = 5000;
export const REPORT_TITLE_MAX = 200;
export const REPORT_BODY_MAX = 20000;
export const RETURN_REASON_MAX = 1000;
export const RECORD_KINDS: readonly ResearchRecordKind[] = ['note', 'source'];

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };
type Body = Record<string, unknown>;

function parse(raw: unknown, allowed: readonly string[]): { body: Body; fields: Record<string, string> } | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const body = raw as Body;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
  return { body, fields };
}

function text(body: Body, key: string, max: number, required: boolean, fields: Record<string, string>): string | undefined {
  const value = body[key];
  if (typeof value !== 'string' || (required && value.trim() === '')) {
    fields[key] = 'This field is required.';
    return undefined;
  }
  if (value.length > max) {
    fields[key] = `Use at most ${max} characters.`;
    return undefined;
  }
  return required ? value.trim() : value;
}

function version(body: Body, fields: Record<string, string>): number | undefined {
  if (!Number.isInteger(body.version) || (body.version as number) < 1) {
    fields.version = 'Reload and try again.';
    return undefined;
  }
  return body.version as number;
}

const objectError = { ok: false, fields: { body: 'Send a JSON object.' } } as const;
const result = <T>(fields: Record<string, string>, value: T): Validation<T> =>
  Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value };

export function validateRecordCreate(raw: unknown): Validation<{ kind: ResearchRecordKind; body: string }> {
  const parsed = parse(raw, ['kind', 'body']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  if (typeof body.kind !== 'string' || !(RECORD_KINDS as readonly string[]).includes(body.kind)) {
    fields.kind = 'Choose a note or a source.';
  }
  const value = text(body, 'body', RECORD_BODY_MAX, true, fields);
  return result(fields, { kind: body.kind as ResearchRecordKind, body: value ?? '' });
}

export function validateRecordUpdate(raw: unknown): Validation<{ body: string; version: number }> {
  const parsed = parse(raw, ['body', 'version']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  const value = text(body, 'body', RECORD_BODY_MAX, true, fields);
  const v = version(body, fields);
  return result(fields, { body: value ?? '', version: v ?? 0 });
}

export function validateReportCreate(raw: unknown): Validation<{ title: string; body: string }> {
  const parsed = parse(raw, ['title', 'body']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  const title = text(body, 'title', REPORT_TITLE_MAX, true, fields);
  const content = body.body === undefined ? '' : text(body, 'body', REPORT_BODY_MAX, false, fields);
  return result(fields, { title: title ?? '', body: content ?? '' });
}

export function validateReportUpdate(raw: unknown): Validation<{ title: string; body: string; version: number }> {
  const parsed = parse(raw, ['title', 'body', 'version']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  const title = text(body, 'title', REPORT_TITLE_MAX, true, fields);
  const content = text(body, 'body', REPORT_BODY_MAX, false, fields);
  const v = version(body, fields);
  return result(fields, { title: title ?? '', body: content ?? '', version: v ?? 0 });
}

export function validateReturn(raw: unknown): Validation<{ reason: string }> {
  const parsed = parse(raw, ['reason']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  // R32 has not decided whether a reason is required. One is required for now, so the genealogist
  // knows what to change; relaxing it later needs only this rule and the report_returned_check.
  const reason = text(body, 'reason', RETURN_REASON_MAX, true, fields);
  return result(fields, { reason: reason ?? '' });
}

export function validateAssignment(raw: unknown): Validation<{ workspaceId: string; genealogistId: string }> {
  const parsed = parse(raw, ['workspaceId', 'genealogistId']);
  if (!parsed) {
    return objectError;
  }
  const { body, fields } = parsed;
  if (!isUuid(body.workspaceId)) {
    fields.workspaceId = 'Choose a family.';
  }
  if (!isUuid(body.genealogistId)) {
    fields.genealogistId = 'Choose a genealogist.';
  }
  return result(fields, {
    workspaceId: String(body.workspaceId).toLowerCase(),
    genealogistId: String(body.genealogistId).toLowerCase(),
  });
}
