import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isDatabaseUnavailable } from './db-errors.ts';
import { errorBody } from './errors.ts';
import type { Logger } from './logger.ts';
import { getRequestId } from './middleware.ts';

// Small response helpers shared by the resource routers, so every module answers errors the same way.

export function unavailable(res: Response, message = 'The service is temporarily unavailable. Please try again.') {
  res.status(503).json(errorBody('SERVICE_UNAVAILABLE', message, getRequestId(res)));
}

export function notFound(res: Response) {
  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
}

export function validationFailed(res: Response, fields: Record<string, string>) {
  res.status(400).json(errorBody('VALIDATION_FAILED', 'Some fields are invalid', getRequestId(res), fields));
}

export function conflict(res: Response, code: string, message: string) {
  res.status(409).json(errorBody(code, message, getRequestId(res)));
}

/** 422: the request is well-formed but breaks a rule (F-FAM-03: e.g. a cycle in ancestry). */
export function rejected(res: Response, code: string, message: string) {
  res.status(422).json(errorBody(code, message, getRequestId(res)));
}

/** Writes must be JSON: rejects form posts and other content types (also a CSRF safeguard). */
export const requireJson: RequestHandler = (req, res, next) => {
  if (!req.is('application/json')) {
    res.status(415).json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Send the request body as application/json', getRequestId(res)));
    return;
  }
  next();
};

/**
 * Wraps an async handler: a missing dependency or an unreachable database answers a retryable 503
 * (details only in the log); anything else goes to the generic error handler.
 */
export function handle<D>(
  dependency: D | undefined,
  logger: Logger,
  handler: (dependency: D, req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (dependency === undefined) {
      unavailable(res);
      return;
    }
    try {
      await handler(dependency, req, res);
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

/** Bounded list size from `?limit=`: default and maximum per list (Product Flows §14.2). */
export function limitParam(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === 'string' && /^\d{1,4}$/.test(raw) ? Number(raw) : fallback;
  return Math.min(Math.max(n, 1), max);
}
