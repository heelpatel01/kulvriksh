import { Router, type Response } from 'express';
import type { CustomerIdentity, OtpRequestAccepted, SessionResponse, SignInResponse } from '@kulvriksh/shared';
import { requireAdminPreview } from '../admin-preview.ts';
import { errorBody } from '../errors.ts';
import { handle, requireJson, unavailable } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import type { AuthService } from './auth-service.ts';
import type { CustomerRecord } from './auth-store.ts';
import { bearerToken, requireCustomer, sessionOf } from './authorize.ts';
import { maskMobileNumber, normaliseMobileNumber } from './mobile.ts';
import type { DevelopmentOtpOutbox } from './otp-delivery.ts';

export interface AuthRouteOptions {
  /** Absent when sessions cannot work (no database or no keys): every route answers 503. */
  service?: AuthService;
  /** Present only with OTP_DELIVERY=development (refused by the config outside development). */
  devOutbox?: DevelopmentOtpOutbox;
  adminPreviewToken?: string;
  logger: Logger;
}

const SIGN_IN_UNAVAILABLE = 'Sign-in is temporarily unavailable. Please try again later.';

export function rateLimited(res: Response, retryAfterSeconds: number) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  const body = errorBody('RATE_LIMITED', 'Too many attempts. Please wait and try again.', getRequestId(res));
  res.status(429).json({ error: { ...body.error, retryAfterSeconds } });
}

export function customerIdentity(customer: CustomerRecord): CustomerIdentity {
  return {
    id: customer.id,
    role: 'customer',
    mobileNumberMasked: maskMobileNumber(customer.mobileNumber),
    createdAt: customer.createdAt.toISOString(),
  };
}

const context = (req: { ip?: string }, res: Response) => ({ ip: req.ip ?? 'unknown', requestId: getRequestId(res) });

export function authRoutes({ service, devOutbox, adminPreviewToken, logger }: AuthRouteOptions): Router {
  const router = Router();

  router.post(
    '/auth/otp/request',
    requireJson,
    handle(service, logger, async (svc, req, res) => {
      const result = await svc.requestOtp({ mobileNumber: req.body?.mobileNumber, ...context(req, res) });
      switch (result.kind) {
        case 'invalid_number':
          res
            .status(400)
            .json(errorBody('VALIDATION_FAILED', 'Some fields are invalid', getRequestId(res), {
              mobileNumber: 'Enter a 10-digit Indian mobile number',
            }));
          return;
        case 'rate_limited':
          rateLimited(res, result.retryAfterSeconds);
          return;
        case 'delivery_failed':
          unavailable(res, 'We could not send a code. Please try again.');
          return;
        case 'delivery_unavailable':
          unavailable(res, SIGN_IN_UNAVAILABLE);
          return;
        case 'accepted': {
          const body: OtpRequestAccepted = {
            status: 'accepted',
            expiresInSeconds: result.expiresInSeconds,
            resendAfterSeconds: result.resendAfterSeconds,
          };
          res.status(202).json(body);
        }
      }
    }),
  );

  router.post(
    '/auth/otp/verify',
    requireJson,
    handle(service, logger, async (svc, req, res) => {
      const result = await svc.verifyOtp({ mobileNumber: req.body?.mobileNumber, code: req.body?.code, ...context(req, res) });
      switch (result.kind) {
        case 'invalid_input':
          res.status(400).json(errorBody('VALIDATION_FAILED', 'Some fields are invalid', getRequestId(res), result.fields));
          return;
        case 'invalid_code':
          res.status(400).json(errorBody('INVALID_CODE', 'The code is incorrect or has expired.', getRequestId(res)));
          return;
        case 'rate_limited':
          rateLimited(res, result.retryAfterSeconds);
          return;
        case 'account_unavailable':
          res
            .status(403)
            .json(errorBody('ACCOUNT_UNAVAILABLE', 'This account cannot sign in. Please contact support.', getRequestId(res)));
          return;
        case 'signed_in': {
          const body: SignInResponse = {
            session: { token: result.token, expiresAt: result.expiresAt.toISOString() },
            user: customerIdentity(result.customer),
          };
          res.json(body);
        }
      }
    }),
  );

  const customerOnly = requireCustomer(service, logger);

  router.get('/auth/session', customerOnly, (_req, res) => {
    const session = sessionOf(res);
    const body: SessionResponse = { session: { expiresAt: session.expiresAt.toISOString() }, user: customerIdentity(session.customer!) };
    res.json(body);
  });

  router.get('/me', customerOnly, (_req, res) => {
    res.json({ user: customerIdentity(sessionOf(res).customer!) });
  });

  router.post(
    '/auth/logout-all',
    customerOnly,
    handle(service, logger, async (svc, _req, res) => {
      await svc.logoutAll(sessionOf(res).userId, getRequestId(res));
      res.status(204).end();
    }),
  );

  // Logout is idempotent and works for customer and staff sessions: an unknown or already revoked
  // token still gets 204.
  router.post(
    '/auth/logout',
    handle(service, logger, async (svc, req, res) => {
      const token = bearerToken(req);
      if (token) {
        await svc.logout(token, getRequestId(res));
      }
      res.status(204).end();
    }),
  );

  if (devOutbox) {
    // Development only: stands in for the phone's SMS inbox so the flow can be tried locally.
    // Registered only with OTP_DELIVERY=development, which the config refuses outside
    // NODE_ENV=development, and behind the admin preview token. The code is never logged.
    router.get('/dev/otp-outbox', requireAdminPreview(adminPreviewToken, logger), (req, res) => {
      const mobileNumber = normaliseMobileNumber(req.query.mobileNumber);
      const entry = mobileNumber ? devOutbox.read(mobileNumber) : undefined;
      if (!entry) {
        res.status(404).json(errorBody('NOT_FOUND', 'No code for this number', getRequestId(res)));
        return;
      }
      res.json({ code: entry.code, expiresAt: entry.expiresAt.toISOString() });
    });
  }

  return router;
}
