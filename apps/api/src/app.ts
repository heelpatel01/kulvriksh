import express, { type Express } from 'express';
import type { HealthResponse } from '@kulvriksh/shared';
import { createErrorHandler, notFoundHandler } from './errors.ts';
import type { Logger } from './logger.ts';
import { accessLog, requestId, securityHeaders } from './middleware.ts';

export interface AppDependencies {
  logger: Logger;
}

export function createApp({ logger }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(securityHeaders);
  app.use(accessLog(logger));

  app.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      service: 'kulvriksh-api',
      dependencies: { database: 'not_configured' },
    };
    res.json(body);
  });

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
