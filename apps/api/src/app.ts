import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import type { ApiErrorBody, HealthResponse } from '@kulvriksh/shared';

function errorBody(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found'));
};

// Express recognises error handlers by their four parameters, so `_next` must stay.
const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
      ? err.status
      : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json(errorBody('BAD_REQUEST', 'The request could not be processed'));
    return;
  }
  // Never send internal details to the client.
  console.error('[api] unhandled error:', err instanceof Error ? err.message : err);
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error'));
};

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'kulvriksh-api',
      dependencies: { database: 'not_configured' },
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
