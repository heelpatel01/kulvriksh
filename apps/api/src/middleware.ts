import { randomUUID } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import type { Logger } from './logger.ts';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Returns the request ID assigned by `requestId`, or "unknown" if it is missing. */
export function getRequestId(res: Response): string {
  const id: unknown = res.locals.requestId;
  return typeof id === 'string' ? id : 'unknown';
}

/**
 * Assigns a server-generated ID to every request and returns it in the X-Request-Id header.
 * Client-supplied IDs are ignored on purpose: whether a trusted reverse proxy may set one
 * is a deployment decision that has not been made yet.
 */
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};

/**
 * Baseline headers for a JSON-only API. Responses are never cacheable by shared caches,
 * because later endpoints will return private data. HSTS is left to the HTTPS reverse proxy.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
};

/**
 * Logs one line per request when the response completes. Only the path is logged:
 * query strings are dropped because they may carry tokens or personal data.
 */
export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    const path = req.originalUrl.split('?')[0] ?? '';
    const fields = () => ({
      requestId: getRequestId(res),
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
    });
    res.on('finish', () => {
      // Health probes run frequently; keep them out of the info-level log.
      if (path === '/health') {
        logger.debug('request completed', fields());
      } else {
        logger.info('request completed', fields());
      }
    });
    res.on('close', () => {
      if (!res.writableFinished) {
        logger.warn('request closed before the response finished', fields());
      }
    });
    next();
  };
}
