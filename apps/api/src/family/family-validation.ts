import type { RelationshipType } from '@kulvriksh/shared';
import { isUuid } from '../http.ts';

// Input rules for family data (F-FAM-01 to F-FAM-03). Field lists are provisional: R17 (member
// fields) and R18 (relationship types) are open, so only a name and two types exist. Limits match
// the CHECK constraints in the sprint1 migration.

export const WORKSPACE_NAME_MAX = 120;
export const MEMBER_NAME_MAX = 120;
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = ['parent_of', 'spouse_of'];

/**
 * What each type means for the graph. Adding a type (R18) is one entry here plus the
 * relationship_type_check constraint: canonical ordering and the cycle check follow from it.
 * `ancestry` types must stay acyclic (no one may become their own ancestor, F-FAM-03).
 */
export const RELATIONSHIP_RULES: Readonly<Record<RelationshipType, { symmetric: boolean; ancestry: boolean }>> = {
  parent_of: { symmetric: false, ancestry: true },
  spouse_of: { symmetric: true, ancestry: false },
};

export const ANCESTRY_TYPES = RELATIONSHIP_TYPES.filter((t) => RELATIONSHIP_RULES[t].ancestry);

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };

type Body = Record<string, unknown>;

function asBody(body: unknown): Body | undefined {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Body) : undefined;
}

function rejectUnknown(body: Body, allowed: readonly string[], fields: Record<string, string>) {
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
}

function readName(body: Body, key: string, max: number, label: string, fields: Record<string, string>) {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    fields[key] = `${label} is required.`;
    return undefined;
  }
  if (value.trim().length > max) {
    fields[key] = `Use at most ${max} characters.`;
    return undefined;
  }
  return value.trim();
}

function readVersion(body: Body, fields: Record<string, string>) {
  const value = body.version;
  if (!Number.isInteger(value) || (value as number) < 1) {
    fields.version = 'Reload and try again.';
    return undefined;
  }
  return value as number;
}

function done<T>(fields: Record<string, string>, value: T | undefined): Validation<T> {
  return Object.keys(fields).length > 0 || value === undefined ? { ok: false, fields } : { ok: true, value };
}

export function validateWorkspace(raw: unknown): Validation<{ name: string }> {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, ['name'], fields);
  const name = readName(body, 'name', WORKSPACE_NAME_MAX, 'A family name', fields);
  return done(fields, name === undefined ? undefined : { name });
}

export function validateMemberCreate(raw: unknown): Validation<{ displayName: string }> {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, ['displayName'], fields);
  const displayName = readName(body, 'displayName', MEMBER_NAME_MAX, 'A name', fields);
  return done(fields, displayName === undefined ? undefined : { displayName });
}

export function validateMemberUpdate(raw: unknown): Validation<{ displayName: string; version: number }> {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, ['displayName', 'version'], fields);
  const displayName = readName(body, 'displayName', MEMBER_NAME_MAX, 'A name', fields);
  const version = readVersion(body, fields);
  return done(fields, displayName === undefined || version === undefined ? undefined : { displayName, version });
}

export function validateVersion(raw: unknown): Validation<{ version: number }> {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, ['version'], fields);
  const version = readVersion(body, fields);
  return done(fields, version === undefined ? undefined : { version });
}

export interface RelationshipInput {
  type: RelationshipType;
  fromMemberId: string;
  toMemberId: string;
}

export function validateRelationship(raw: unknown): Validation<RelationshipInput> {
  const body = asBody(raw);
  if (!body) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const fields: Record<string, string> = {};
  rejectUnknown(body, ['type', 'fromMemberId', 'toMemberId'], fields);
  const type = body.type;
  if (typeof type !== 'string' || !(RELATIONSHIP_TYPES as readonly string[]).includes(type)) {
    fields.type = `Choose one of: ${RELATIONSHIP_TYPES.join(', ')}.`;
  }
  for (const key of ['fromMemberId', 'toMemberId'] as const) {
    if (!isUuid(body[key])) {
      fields[key] = 'Choose a family member.';
    }
  }
  // Lower-case IDs: PostgreSQL orders UUIDs by bytes, which matches string order only in lower case.
  const fromMemberId = String(body.fromMemberId).toLowerCase();
  const toMemberId = String(body.toMemberId).toLowerCase();
  if (Object.keys(fields).length === 0 && fromMemberId === toMemberId) {
    fields.toMemberId = 'A person cannot be related to themselves.';
  }
  return done(fields, Object.keys(fields).length > 0 ? undefined : { type: type as RelationshipType, fromMemberId, toMemberId });
}

/** Symmetric types are stored in canonical order, so A–B and B–A are the same relationship. */
export function canonical(input: RelationshipInput): { a: string; b: string } {
  if (RELATIONSHIP_RULES[input.type].symmetric && input.fromMemberId > input.toMemberId) {
    return { a: input.toMemberId, b: input.fromMemberId };
  }
  return { a: input.fromMemberId, b: input.toMemberId };
}
