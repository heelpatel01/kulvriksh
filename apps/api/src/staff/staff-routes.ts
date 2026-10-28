import { Router, type Response } from 'express';
import type { StaffIdentity, StaffLinkIssued, StaffMfaChallenge, StaffSessionResponse, StaffSignInResponse } from '@kulvriksh/shared';
import { requireAdminPreview } from '../admin-preview.ts';
import type { AuthSettings } from '../auth/auth-config.ts';
import { hashSessionToken, newSessionToken } from '../auth/auth-crypto.ts';
import { rateLimited } from '../auth/auth-routes.ts';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireAnyStaff, requireStaff, sessionOf, type StaffRole } from '../auth/authorize.ts';
import { errorBody } from '../errors.ts';
import { handle, isUuid, notFound, requireJson, unavailable, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import { normaliseEmail } from './password.ts';
import type { DevelopmentStaffOutbox } from './staff-delivery.ts';
import type { StaffLifecycleStore } from './staff-lifecycle-store.ts';
import type { MfaResult, StaffAuthService } from './staff-service.ts';
import type { StaffStore } from './staff-store.ts';

export interface StaffRouteOptions {
  auth?: AuthService;
  staffAuth?: StaffAuthService;
  staffStore?: StaffStore;
  lifecycle?: StaffLifecycleStore;
  settings?: AuthSettings;
  devOutbox?: DevelopmentStaffOutbox;
  adminPreviewToken?: string;
  logger: Logger;
}

const ROLES: readonly StaffRole[] = ['genealogist', 'admin'];

function forbidden(res: Response, message = 'You do not have access to this resource') {
  res.status(403).json(errorBody('FORBIDDEN', message, getRequestId(res)));
}

function invalidCode(res: Response) {
  res.status(400).json(errorBody('INVALID_CODE', 'The code is incorrect or has expired. Sign in again if this keeps happening.', getRequestId(res)));
}

function sendSignedIn(res: Response, result: Extract<MfaResult, { kind: 'signed_in' }>) {
  const body: StaffSignInResponse = { session: { token: result.token, expiresAt: result.expiresAt.toISOString() }, user: result.staff };
  res.json(body);
}

function sendMfaResult(res: Response, result: MfaResult) {
  switch (result.kind) {
    case 'signed_in':
      sendSignedIn(res, result);
      return;
    case 'rate_limited':
      rateLimited(res, result.retryAfterSeconds);
      return;
    case 'unavailable':
      unavailable(res, 'Two-step sign-in is not available right now.');
      return;
    default:
      invalidCode(res);
  }
}

function validateNewStaff(raw: unknown): { ok: true; value: { email: string; displayName: string; role: StaffRole } } | { ok: false; fields: Record<string, string> } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, fields: { body: 'Send a JSON object.' } };
  }
  const body = raw as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!['email', 'displayName', 'role'].includes(key)) {
      fields[key] = 'This field is not accepted.';
    }
  }
  const email = normaliseEmail(body.email);
  if (!email) {
    fields.email = 'Enter a work email address.';
  }
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (displayName === '' || displayName.length > 120) {
    fields.displayName = 'Enter a name of at most 120 characters.';
  }
  if (!(ROLES as readonly unknown[]).includes(body.role)) {
    fields.role = 'Choose genealogist or admin.';
  }
  return Object.keys(fields).length > 0 || !email
    ? { ok: false, fields }
    : { ok: true, value: { email, displayName, role: body.role as StaffRole } };
}

export function staffRoutes({ auth, staffAuth, staffStore, lifecycle, settings, devOutbox, adminPreviewToken, logger }: StaffRouteOptions): Router {
  const router = Router();
  const ip = (req: { ip?: string }) => req.ip ?? 'unknown';

  // ---- Sign-in (public) ----

  router.post(
    '/staff/auth/sign-in',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const result = await svc.signIn({ email: req.body?.email, password: req.body?.password, ip: ip(req), requestId: getRequestId(res) });
      switch (result.kind) {
        case 'invalid_input':
          validationFailed(res, result.fields);
          return;
        case 'invalid_credentials':
          res.status(400).json(errorBody('INVALID_CREDENTIALS', 'The email or password is incorrect.', getRequestId(res)));
          return;
        case 'rate_limited':
          rateLimited(res, result.retryAfterSeconds);
          return;
        case 'account_unavailable':
          res.status(403).json(errorBody('ACCOUNT_UNAVAILABLE', 'This account cannot sign in. Contact an administrator.', getRequestId(res)));
          return;
        case 'mfa_required':
        case 'mfa_enrolment_required': {
          // No session yet: the password alone is not enough for this account.
          const body: StaffMfaChallenge = {
            mfa: result.kind === 'mfa_required' ? 'required' : 'enrolment_required',
            challengeToken: result.challengeToken,
            expiresAt: result.expiresAt.toISOString(),
          };
          res.json(body);
          return;
        }
        case 'signed_in':
          sendSignedIn(res, result);
      }
    }),
  );

  router.post(
    '/staff/auth/mfa',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      sendMfaResult(res, await svc.verifyMfa({ challengeToken: req.body?.challengeToken, code: req.body?.code, ip: ip(req), requestId: getRequestId(res) }));
    }),
  );

  router.post(
    '/staff/auth/mfa/enrol/start',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const result = await svc.startChallengeEnrolment({ challengeToken: req.body?.challengeToken, ip: ip(req) });
      if ('kind' in result) {
        if (result.kind === 'unavailable') {
          unavailable(res, 'Two-step sign-in is not available right now.');
        } else {
          invalidCode(res);
        }
        return;
      }
      res.json({ enrolment: result });
    }),
  );

  router.post(
    '/staff/auth/mfa/enrol/confirm',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      sendMfaResult(
        res,
        await svc.confirmChallengeEnrolment({ challengeToken: req.body?.challengeToken, code: req.body?.code, ip: ip(req), requestId: getRequestId(res) }),
      );
    }),
  );

  // Setup and reset links: the token is the only credential; it is single-use and short-lived.
  router.post(
    '/staff/auth/password/complete',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const result = await svc.completePasswordLink({ token: req.body?.token, password: req.body?.password, requestId: getRequestId(res) });
      if (result.kind === 'invalid_input') {
        validationFailed(res, result.fields);
      } else if (result.kind === 'invalid_token') {
        res.status(400).json(errorBody('INVALID_LINK', 'This link is invalid, already used or expired. Ask an administrator for a new one.', getRequestId(res)));
      } else {
        res.status(204).end();
      }
    }),
  );

  router.post(
    '/staff/auth/password/reset-request',
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const result = await svc.requestPasswordReset({ email: req.body?.email, ip: ip(req), requestId: getRequestId(res) });
      if (result.kind === 'rate_limited') {
        rateLimited(res, result.retryAfterSeconds);
        return;
      }
      // Same answer whether or not the email belongs to a staff account.
      res.status(202).json({ status: 'accepted' });
    }),
  );

  if (devOutbox) {
    // Development only (same guards as the OTP outbox): the latest reset link per email.
    router.get('/dev/staff-outbox', requireAdminPreview(adminPreviewToken, logger), (req, res) => {
      const email = normaliseEmail(req.query.email);
      const entry = email ? devOutbox.read(email) : undefined;
      if (!entry) {
        notFound(res);
        return;
      }
      res.json({ token: entry.token, expiresAt: entry.expiresAt.toISOString() });
    });
  }

  // ---- Signed-in staff: own session, password and second factor ----

  const anyStaff = requireAnyStaff(auth, logger);

  router.get('/staff/auth/session', anyStaff, (_req, res) => {
    const session = sessionOf(res);
    const user: StaffIdentity = { id: session.userId, role: session.role as StaffRole, displayName: session.staff!.displayName };
    const body: StaffSessionResponse = { session: { expiresAt: session.expiresAt.toISOString() }, user };
    res.json(body);
  });

  router.post(
    '/staff/me/password',
    anyStaff,
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const actor = actorOf(res);
      const result = await svc.changePassword({
        userId: actor.userId,
        sessionId: actor.sessionId,
        currentPassword: req.body?.currentPassword,
        newPassword: req.body?.newPassword,
        requestId: getRequestId(res),
      });
      if (result.kind === 'invalid_input') {
        validationFailed(res, result.fields);
      } else if (result.kind === 'wrong_password') {
        validationFailed(res, { currentPassword: 'The current password is incorrect.' });
      } else {
        res.json({ revokedSessions: result.revokedSessions });
      }
    }),
  );

  router.get(
    '/staff/me/mfa',
    anyStaff,
    handle(lifecycle, logger, async (store, _req, res) => {
      const actor = actorOf(res);
      const mfa = await store.getMfa(actor.userId);
      res.json({
        enabled: Boolean(mfa?.enabledAt),
        required: staffAuth?.mfaRequiredFor(actor.role as StaffRole) ?? false,
        available: staffAuth?.mfaAvailable() ?? false,
        policy: settings?.staffMfaPolicy ?? 'off',
      });
    }),
  );

  router.post(
    '/staff/me/mfa/start',
    anyStaff,
    handle(staffAuth, logger, async (svc, _req, res) => {
      const result = await svc.startEnrolment(actorOf(res).userId);
      if ('kind' in result) {
        if (result.kind === 'already_enabled') {
          res.status(409).json(errorBody('ALREADY_ENABLED', 'Two-step sign-in is already on.', getRequestId(res)));
        } else {
          unavailable(res, 'Two-step sign-in is not available on this server.');
        }
        return;
      }
      res.json({ enrolment: result });
    }),
  );

  router.post(
    '/staff/me/mfa/confirm',
    anyStaff,
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const result = await svc.confirmEnrolment(actorOf(res).userId, req.body?.code, getRequestId(res));
      if (result === 'enabled') {
        res.json({ enabled: true });
      } else if (result === 'unavailable') {
        unavailable(res, 'Two-step sign-in is not available on this server.');
      } else {
        invalidCode(res);
      }
    }),
  );

  router.post(
    '/staff/me/mfa/disable',
    anyStaff,
    requireJson,
    handle(staffAuth, logger, async (svc, req, res) => {
      const actor = actorOf(res);
      const result = await svc.disableMfa(actor.userId, actor.role as StaffRole, req.body?.code, getRequestId(res));
      if (result === 'removed') {
        res.json({ enabled: false });
      } else if (result === 'required_by_policy') {
        forbidden(res, 'Two-step sign-in is required for your role and cannot be turned off.');
      } else if (result === 'unavailable') {
        unavailable(res, 'Two-step sign-in is not available on this server.');
      } else if (result === 'not_enrolled') {
        res.status(409).json(errorBody('NOT_ENROLLED', 'Two-step sign-in is not on.', getRequestId(res)));
      } else {
        invalidCode(res);
      }
    }),
  );

  // ---- Admin: staff accounts ----

  /**
   * Who an admin may act on: never themselves (no self-escalation or self-lockout), genealogists
   * always, other admins only when STAFF_ADMINS_MAY_MANAGE_ADMINS=true (R33).
   */
  const mayManage = (actorId: string, target: { id: string; role: StaffRole }) =>
    target.id !== actorId && (target.role === 'genealogist' || Boolean(settings?.staffAdminsMayManageAdmins));

  const issueLink = async (store: StaffLifecycleStore, userId: string, passwordSet: boolean, res: Response): Promise<StaffLinkIssued | undefined> => {
    const token = newSessionToken();
    const issued = await store.issueToken({
      userId,
      purpose: passwordSet ? 'reset' : 'setup',
      tokenHash: hashSessionToken(token),
      ttlSeconds: passwordSet ? settings!.staffResetTokenTtlSeconds : settings!.staffSetupTokenTtlSeconds,
      clearPassword: passwordSet,
      actor: { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) },
    });
    return issued ? { userId, token, expiresAt: issued.expiresAt.toISOString() } : undefined;
  };

  router.get(
    '/admin/staff',
    requireStaff(auth, logger, 'staff.read'),
    handle(lifecycle, logger, async (store, _req, res) => {
      res.json({ staff: await store.listStaff(), adminsMayManageAdmins: Boolean(settings?.staffAdminsMayManageAdmins) });
    }),
  );

  router.post(
    '/admin/staff',
    requireStaff(auth, logger, 'staff.manage'),
    requireJson,
    handle(lifecycle, logger, async (store, req, res) => {
      const input = validateNewStaff(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      if (input.value.role === 'admin' && !settings?.staffAdminsMayManageAdmins) {
        forbidden(res, 'Creating administrators is not enabled (R33). Use the bootstrap command.');
        return;
      }
      const token = newSessionToken();
      const result = await store.createAccount({
        ...input.value,
        tokenHash: hashSessionToken(token),
        ttlSeconds: settings!.staffSetupTokenTtlSeconds,
        actor: { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) },
      });
      if (!result.ok) {
        res.status(409).json(errorBody('EMAIL_TAKEN', 'An account with this email already exists.', getRequestId(res)));
        return;
      }
      const link: StaffLinkIssued = { userId: result.userId, token, expiresAt: result.expiresAt.toISOString() };
      res.status(201).json({ account: await store.getStaff(result.userId), link });
    }),
  );

  router.post(
    '/admin/staff/:id/password-link',
    requireStaff(auth, logger, 'staff.manage'),
    handle(lifecycle, logger, async (store, req, res) => {
      const id = String(req.params.id).toLowerCase();
      const target = isUuid(id) ? await store.getStaff(id) : undefined;
      if (!target) {
        notFound(res);
        return;
      }
      if (!mayManage(actorOf(res).userId, target)) {
        forbidden(res);
        return;
      }
      if (target.status !== 'active') {
        res.status(409).json(errorBody('INVALID_STATE', 'Reactivate the account before issuing a link.', getRequestId(res)));
        return;
      }
      // A person who already has a password gets a reset: the old password and sessions stop now.
      res.json({ link: await issueLink(store, id, target.passwordSet, res), cleared: target.passwordSet });
    }),
  );

  for (const [path, status] of [
    ['deactivate', 'deactivated'],
    ['reactivate', 'active'],
  ] as const) {
    router.post(
      `/admin/staff/:id/${path}`,
      requireStaff(auth, logger, 'staff.manage'),
      handle(lifecycle, logger, async (store, req, res) => {
        const id = String(req.params.id).toLowerCase();
        const target = isUuid(id) ? await store.getStaff(id) : undefined;
        if (!target) {
          notFound(res);
          return;
        }
        if (!mayManage(actorOf(res).userId, target)) {
          forbidden(res);
          return;
        }
        const result = await store.setStatus({ userId: id, status, roles: [...ROLES], actor: { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) } });
        res.json({ account: { id, status: result!.status }, revokedSessions: result!.revokedSessions });
      }),
    );
  }

  router.post(
    '/admin/staff/:id/mfa/reset',
    requireStaff(auth, logger, 'staff.manage'),
    handle(lifecycle, logger, async (store, req, res) => {
      const id = String(req.params.id).toLowerCase();
      const target = isUuid(id) ? await store.getStaff(id) : undefined;
      if (!target) {
        notFound(res);
        return;
      }
      if (!mayManage(actorOf(res).userId, target)) {
        forbidden(res);
        return;
      }
      // For a lost device: the person enrols again on the next sign-in (if policy requires it).
      const removed = await store.removeMfa(id, { userId: actorOf(res).userId, role: 'admin', requestId: getRequestId(res) });
      res.json({ removed });
    }),
  );

  // ---- Admin: genealogists (TASK-09 contract, kept) ----

  router.get(
    '/admin/genealogists',
    requireStaff(auth, logger, 'staff.read'),
    handle(staffStore, logger, async (store, _req, res) => {
      res.json({ genealogists: await store.listGenealogists() });
    }),
  );

  for (const [path, status] of [
    ['deactivate', 'deactivated'],
    ['reactivate', 'active'],
  ] as const) {
    router.post(
      `/admin/genealogists/:id/${path}`,
      requireStaff(auth, logger, 'staff.manage'),
      handle(staffStore, logger, async (store, req, res) => {
        const id = String(req.params.id);
        if (!isUuid(id)) {
          notFound(res);
          return;
        }
        const result = await store.setGenealogistStatus({ userId: id, status, actorUserId: actorOf(res).userId, requestId: getRequestId(res) });
        if (!result) {
          notFound(res);
          return;
        }
        res.json({ genealogist: { id, status: result.status }, revokedSessions: result.revokedSessions });
      }),
    );
  }

  return router;
}
