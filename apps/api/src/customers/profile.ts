import { Router } from 'express';
import type { CustomerProfileView } from '@kulvriksh/shared';
import { auditInTransaction } from '../audit/audit.ts';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer } from '../auth/authorize.ts';
import { maskMobileNumber } from '../auth/mobile.ts';
import type { PrismaClient } from '../generated/prisma/client.ts';
import { handle, notFound, requireJson, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';

// Customer profile (F-PRO-01). The fields are TBC (R8). Only `displayName` exists, it is optional,
// and which fields are editable is configuration (CUSTOMER_PROFILE_FIELDS), so no personal data
// becomes mandatory by accident. The mobile number is read-only (FQ-6). The profile is always the
// session customer's own: no ID is ever taken from the URL or body (AS-PRO-01).

export const PROFILE_FIELDS = ['displayName'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const DISPLAY_NAME_MAX = 80;

export interface ProfilePatch {
  displayName?: string | null;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; fields: Record<string, string> };

export function validateProfilePatch(body: unknown, editable: readonly ProfileField[]): Validation<ProfilePatch> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const input = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (!(editable as readonly string[]).includes(key)) {
      fields[key] = 'This field cannot be changed.';
    }
  }
  const patch: ProfilePatch = {};
  if ('displayName' in input && editable.includes('displayName')) {
    const value = input.displayName;
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      patch.displayName = null; // clearing an optional field is allowed
    } else if (typeof value !== 'string') {
      fields.displayName = 'Enter a name, or leave it empty.';
    } else if (value.trim().length > DISPLAY_NAME_MAX) {
      fields.displayName = `Use at most ${DISPLAY_NAME_MAX} characters.`;
    } else {
      patch.displayName = value.trim();
    }
  }
  if (Object.keys(fields).length === 0 && Object.keys(patch).length === 0) {
    fields.body = 'Send at least one field to change.';
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, value: patch };
}

export function readProfileFields(raw: string | undefined, issues: string[]): readonly ProfileField[] {
  if (raw === undefined || raw.trim() === '') {
    return PROFILE_FIELDS;
  }
  if (raw.trim() === 'none') {
    return [];
  }
  const names = raw.split(',').map((name) => name.trim());
  const unknown = names.filter((name) => !(PROFILE_FIELDS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    issues.push(`CUSTOMER_PROFILE_FIELDS may list only ${PROFILE_FIELDS.join(', ')} (or none)`);
    return PROFILE_FIELDS;
  }
  return names as ProfileField[];
}

export interface ProfileStore {
  get(userId: string): Promise<{ mobileNumber: string; displayName: string | null; createdAt: Date } | undefined>;
  update(userId: string, patch: ProfilePatch, requestId?: string): Promise<{ mobileNumber: string; displayName: string | null; createdAt: Date } | undefined>;
}

export function createPrismaProfileStore(prisma: PrismaClient): ProfileStore {
  const select = { mobileNumber: true, displayName: true, createdAt: true } as const;
  return {
    get: async (userId) => (await prisma.customerProfile.findUnique({ where: { userId }, select })) ?? undefined,
    async update(userId, patch, requestId) {
      return prisma.$transaction(async (tx) => {
        const updated = await tx.customerProfile.updateMany({ where: { userId }, data: patch });
        if (updated.count !== 1) {
          return undefined;
        }
        // Only the names of changed fields are audited, never their values.
        await auditInTransaction(tx, {
          actorUserId: userId,
          actorRole: 'customer',
          action: 'profile.updated',
          targetType: 'customer_profile',
          targetId: userId,
          details: { fields: Object.keys(patch).join(',') },
          requestId,
        });
        return (await tx.customerProfile.findUnique({ where: { userId }, select })) ?? undefined;
      });
    },
  };
}

export function profileRoutes({
  auth,
  store,
  editableFields,
  logger,
}: {
  auth?: AuthService;
  store?: ProfileStore;
  editableFields: readonly ProfileField[];
  logger: Logger;
}): Router {
  const router = Router();
  const customerOnly = requireCustomer(auth, logger);
  const view = (row: { mobileNumber: string; displayName: string | null; createdAt: Date }): CustomerProfileView => ({
    mobileNumberMasked: maskMobileNumber(row.mobileNumber),
    displayName: row.displayName,
    memberSince: row.createdAt.toISOString(),
    editableFields: [...editableFields],
  });

  router.get(
    '/me/profile',
    customerOnly,
    handle(store, logger, async (profiles, _req, res) => {
      const row = await profiles.get(actorOf(res).userId);
      if (!row) {
        notFound(res);
        return;
      }
      res.json({ profile: view(row) });
    }),
  );

  router.patch(
    '/me/profile',
    customerOnly,
    requireJson,
    handle(store, logger, async (profiles, req, res) => {
      const result = validateProfilePatch(req.body, editableFields);
      if (!result.ok) {
        validationFailed(res, result.fields);
        return;
      }
      const row = await profiles.update(actorOf(res).userId, result.value, getRequestId(res));
      if (!row) {
        notFound(res);
        return;
      }
      res.json({ profile: view(row) });
    }),
  );

  return router;
}
