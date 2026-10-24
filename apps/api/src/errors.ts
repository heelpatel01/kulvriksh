import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@kulvriksh/shared';
import type { Logger } from './logger.ts';
import { getRequestId } from './middleware.ts';

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, requestId } };
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  const candidate = 'status' in err ? err.status : 'statusCode' in err ? err.statusCode : undefined;
  return typeof candidate === 'number' ? candidate : undefined;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
};

/** Final error handler. Clients get a generic message and the request ID; details go only to the log. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express recognises error handlers by their four parameters, so `next` must stay.
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = getRequestId(res);
    const status = statusOf(err);
    if (status !== undefined && status >= 400 && status < 500) {
      logger.warn('client error', { requestId, status, err });
      res
        .status(status)
        .json(errorBody(CLIENT_ERROR_CODES[status] ?? 'CLIENT_ERROR', 'The request could not be processed', requestId));
      return;
    }
    logger.error('unhandled error', { requestId, err });
    res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error', requestId));
  };
}
