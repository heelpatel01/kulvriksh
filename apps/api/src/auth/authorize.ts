import type { Request, RequestHandler, Response } from 'express';
import { isDatabaseUnavailable } from '../db-errors.ts';
import { errorBody } from '../errors.ts';
import { unavailable } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import { isSessionTokenShape } from './auth-crypto.ts';
import type { AuthService } from './auth-service.ts';
import type { ActiveSession, UserRole } from './auth-store.ts';

// Central authorisation (Flows §13). Every protected route names one permission; a role gets a
// permission only if it is listed here, so anything not listed is denied. Admin roles are a single
// role until R33 defines finer ones; adding them means extending this table, not the routes.

export type StaffRole = Exclude<UserRole, 'customer'>;

export const PERMISSIONS = {
  'catalogue.manage': ['admin'],
  'staff.read': ['admin'],
  'staff.manage': ['admin'],
  'workspace.read_any': ['admin'],
  'assignment.manage': ['admin'],
  'report.review': ['admin'],
  'audit.read': ['admin'],
  'payments.read': ['admin'],
  'payments.manage': ['admin'],
  'customers.read': ['admin'],
  'notifications.read': ['admin'],
  'system.read': ['admin'],
  // Work on cases is limited further to the genealogist's own active assignments, per request.
  'case.work': ['genealogist'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Unknown permissions (including prototype keys such as "constructor") are denied, never thrown. */
export function can(role: UserRole, permission: Permission): boolean {
  return Object.hasOwn(PERMISSIONS, permission) && (PERMISSIONS[permission] as readonly string[]).includes(role);
}

/** The authenticated caller, from the server-side session. Never from the request body or URL. */
export interface Actor {
  userId: string;
  role: UserRole;
  sessionId: string;
}

export function actorOf(res: Response): Actor {
  return res.locals.actor as Actor;
}

export function sessionOf(res: Response): ActiveSession {
  return res.locals.session as ActiveSession;
}

export function bearerToken(req: Request): string | undefined {
  const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') ?? '');
  return match && isSessionTokenShape(match[1]!) ? match[1] : undefined;
}

function forbidden(res: Response) {
  res.status(403).json(errorBody('FORBIDDEN', 'You do not have access to this resource', getRequestId(res)));
}

/** Resolves the session (revocation and expiry checked on every request), then applies `allow`. */
function guard(
  service: AuthService | undefined,
  logger: Logger,
  allow: (session: ActiveSession) => boolean,
): RequestHandler {
  return async (req, res, next) => {
    if (!service) {
      unavailable(res, 'Sign-in is temporarily unavailable. Please try again later.');
      return;
    }
    let session: ActiveSession | undefined;
    try {
      const token = bearerToken(req);
      session = token ? await service.authenticate(token) : undefined;
    } catch (err) {
      if (isDatabaseUnavailable(err)) {
        logger.warn('database unavailable', { requestId: getRequestId(res), err });
        unavailable(res);
        return;
      }
      next(err);
      return;
    }
    if (!session) {
      res.status(401).json(errorBody('UNAUTHORIZED', 'Sign in to continue', getRequestId(res)));
      return;
    }
    if (!allow(session)) {
      logger.warn('access denied', { requestId: getRequestId(res), role: session.role, path: req.path });
      forbidden(res);
      return;
    }
    res.locals.session = session;
    res.locals.actor = { userId: session.userId, role: session.role, sessionId: session.sessionId } satisfies Actor;
    next();
  };
}

/** Customer routes: a live session of an active customer (F-AUTH-05). */
export function requireCustomer(service: AuthService | undefined, logger: Logger): RequestHandler {
  return guard(service, logger, (s) => s.role === 'customer' && Boolean(s.customer));
}

/** Staff routes: a live staff session whose role holds `permission`. A customer session gets 403. */
export function requireStaff(service: AuthService | undefined, logger: Logger, permission: Permission): RequestHandler {
  return guard(service, logger, (s) => s.role !== 'customer' && Boolean(s.staff) && can(s.role, permission));
}

/** Any live staff session (used only for "who am I" on staff sign-in). */
export function requireAnyStaff(service: AuthService | undefined, logger: Logger): RequestHandler {
  return guard(service, logger, (s) => s.role !== 'customer' && Boolean(s.staff));
}
