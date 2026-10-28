import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireStaff } from '../auth/authorize.ts';
import { isDatabaseUnavailable, isRecordNotFound } from '../db-errors.ts';
import { errorBody } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import type { ServiceRepository } from './service-repository.ts';
import { isUuid, validateCreate, validateUpdate } from './service-validation.ts';

function unavailable(res: Response) {
  res.status(503).json(errorBody('SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again.', getRequestId(res)));
}

/**
 * Wraps a handler: no database configured → 503; database unreachable → 503 (details logged in
 * the safe form, never returned); anything else goes to the generic error handler.
 */
function withRepository(
  repository: ServiceRepository | undefined,
  logger: Logger,
  handler: (repo: ServiceRepository, req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!repository) {
      unavailable(res);
      return;
    }
    try {
      await handler(repository, req, res);
    } catch (err) {
      if (isDatabaseUnavailable(err)) {
        logger.warn('database unavailable', { requestId: getRequestId(res), err });
        unavailable(res);
        return;
      }
      next(err);
    }
  };
}

/** Writes must be JSON: rejects form posts and other content types (also a CSRF safeguard). */
const requireJson: RequestHandler = (req, res, next) => {
  if (!req.is('application/json')) {
    res.status(415).json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json', getRequestId(res)));
    return;
  }
  next();
};

function validationFailed(res: Response, fields: Record<string, string>) {
  res.status(400).json(errorBody('VALIDATION_FAILED', 'Some fields are invalid', getRequestId(res), fields));
}

export interface ServiceRouteOptions {
  repository?: ServiceRepository;
  auth?: AuthService;
  logger: Logger;
}

/** Routes for the service catalogue (Product Flows F-PUB-03 read side, F-ADM-04). */
export function serviceRoutes({ repository, auth, logger }: ServiceRouteOptions): Router {
  const router = Router();

  // Public: active services only (AS-PUB-07). No session or per-user data.
  router.get(
    '/services',
    withRepository(repository, logger, async (repo, _req, res) => {
      res.json({ services: await repo.listActive() });
    }),
  );

  // Admin catalogue routes need a signed-in admin session with `catalogue.manage` (TASK-09; the
  // development preview token no longer opens them).
  const admin = Router();
  admin.use(requireStaff(auth, logger, 'catalogue.manage'));

  admin.get(
    '/services',
    withRepository(repository, logger, async (repo, _req, res) => {
      res.json({ services: await repo.listAll() });
    }),
  );

  admin.post(
    '/services',
    requireJson,
    withRepository(repository, logger, async (repo, req, res) => {
      const result = validateCreate(req.body);
      if (!result.ok) {
        validationFailed(res, result.fields);
        return;
      }
      const service = await repo.create(result.value, { actorUserId: actorOf(res).userId, requestId: getRequestId(res) });
      logger.info('service created', { requestId: getRequestId(res), serviceId: service.id, status: service.status });
      res.status(201).json({ service });
    }),
  );

  admin.patch(
    '/services/:id',
    requireJson,
    withRepository(repository, logger, async (repo, req, res) => {
      const id = String(req.params.id);
      if (!isUuid(id)) {
        res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
        return;
      }
      const result = validateUpdate(req.body);
      if (!result.ok) {
        validationFailed(res, result.fields);
        return;
      }
      try {
        // The repository writes the audit event (F-ADM-04) in the same transaction as the change.
        const service = await repo.update(id, result.value, { actorUserId: actorOf(res).userId, requestId: getRequestId(res) });
        logger.info('service updated', { requestId: getRequestId(res), serviceId: id, changed: Object.keys(result.value) });
        res.json({ service });
      } catch (err) {
        if (isRecordNotFound(err)) {
          res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
          return;
        }
        throw err;
      }
    }),
  );

  router.use('/admin', admin);
  return router;
}
