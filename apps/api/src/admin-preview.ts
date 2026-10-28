import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { errorBody } from './errors.ts';
import type { Logger } from './logger.ts';
import { getRequestId } from './middleware.ts';

export const ADMIN_PREVIEW_HEADER = 'x-admin-preview-token';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Gate for admin routes until real admin sign-in exists (M4, R9, R34). Server-side only:
 * the local Next.js server sends a shared development secret; browsers never see it.
 * Without a configured token (test and production) every admin request is refused.
 * This identifies no person, so it is NOT authorisation, and it must be replaced in M4.
 */
export function requireAdminPreview(token: string | undefined, logger: Logger): RequestHandler {
  const expected = token ? digest(token) : undefined;
  return (req, res, next) => {
    const requestId = getRequestId(res);
    if (!expected) {
      res.status(403).json(errorBody('FORBIDDEN', 'The admin API is not available', requestId));
      return;
    }
    const supplied = req.get(ADMIN_PREVIEW_HEADER);
    // Compare fixed-length digests in constant time; the supplied value is never logged.
    if (!supplied || !timingSafeEqual(digest(supplied), expected)) {
      logger.warn('admin preview token rejected', { requestId, path: req.path, present: Boolean(supplied) });
      res.status(401).json(errorBody('UNAUTHORIZED', 'Authentication is required', requestId));
      return;
    }
    next();
  };
}
