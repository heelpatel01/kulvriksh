import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer, requireStaff } from '../auth/authorize.ts';
import { errorBody } from '../errors.ts';
import { sendFile } from '../files/file-routes.ts';
import { conflict, handle, isUuid, limitParam, notFound, rejected, requireJson, unavailable, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import type { ExportConfig } from './export-config.ts';
import { validateExportOptions } from './export-options.ts';
import type { ExportRequestResult, ExportService } from './export-service.ts';
import type { ExportAccess, ExportStore } from './export-store.ts';

// Family tree PDF export (F-FAM-05).
//   Customers: /family/exports — always their own workspace, taken from the session.
//   Genealogists: /genealogist/cases/:workspaceId/exports — only when EXPORT_GENEALOGIST_ACCESS is
//     'assigned' (R28/FQ-25 open, off by default), and only while the assignment is active; the
//     path's workspace id is never trusted, it is re-checked against the assignment on every request.
//   Admins: no route. Export or download by admins is denied until FQ-14 is decided.
// Jobs and files outside the caller's scope answer 404 (AS-FAM-11).

export interface ExportRouteOptions {
  auth?: AuthService;
  service?: ExportService;
  store?: ExportStore;
  config: ExportConfig;
  logger: Logger;
}

function sendRequestResult(res: Response, result: ExportRequestResult) {
  switch (result.kind) {
    case 'created':
      res.status(202).json({ job: result.job });
      return;
    case 'existing':
      res.status(200).json({ job: result.job });
      return;
    case 'busy':
      res.setHeader('Retry-After', '30');
      res.status(429).json(errorBody('EXPORT_BUSY', 'Many exports are being prepared right now. Please try again shortly.', getRequestId(res)));
      return;
    case 'no_workspace':
      res.status(404).json(errorBody('NO_WORKSPACE', 'Create your family workspace first.', getRequestId(res)));
      return;
    case 'scope_not_found':
      rejected(res, 'SCOPE_MEMBER_NOT_FOUND', 'Choose a member of this family tree for the subtree.');
      return;
    case 'entitlement_required':
      res.status(403).json(errorBody('ENTITLEMENT_REQUIRED', 'Your plan does not include tree export.', getRequestId(res)));
      return;
  }
}

export function exportRoutes({ auth, service, store, config, logger }: ExportRouteOptions): Router {
  const router = Router();
  const customer = requireCustomer(auth, logger);
  const genealogist = requireStaff(auth, logger, 'case.work');
  const both = service && store ? { service, store } : undefined;

  /** Registers the export endpoints (preview, create, list, status, cancel, download) under `base`, with `access` deciding whose jobs they are. */
  function mount(base: string, guard: ReturnType<typeof requireCustomer>, access: (req: Request, res: Response) => ExportAccess | undefined) {
    // Registered before the job routes: what the options would produce, without creating a job.
    router.post(
      `${base}/preview`,
      guard,
      requireJson,
      handle(both, logger, async ({ service: s }, req, res) => {
        const who = access(req, res);
        if (!who) {
          return;
        }
        const options = validateExportOptions(req.body);
        if (!options.ok) {
          validationFailed(res, options.fields);
          return;
        }
        const result = await s.preview(who, options.value);
        res.setHeader('Cache-Control', 'no-store');
        if (result.kind === 'ok') {
          res.json({ preview: result.preview });
        } else if (result.kind === 'busy') {
          res.setHeader('Retry-After', '2');
          res.status(429).json(errorBody('PREVIEW_BUSY', 'Please wait a moment and try again.', getRequestId(res)));
        } else if (result.kind === 'scope_not_found') {
          rejected(res, 'SCOPE_MEMBER_NOT_FOUND', 'Choose a member of this family tree for the subtree.');
        } else if (result.kind === 'no_workspace') {
          notFound(res);
        } else {
          unavailable(res, 'The preview could not be prepared. Please try again.');
        }
      }),
    );

    router.post(
      base,
      guard,
      requireJson,
      handle(both, logger, async ({ service: s }, req, res) => {
        const who = access(req, res);
        if (!who) {
          return;
        }
        const options = validateExportOptions(req.body);
        if (!options.ok) {
          validationFailed(res, options.fields);
          return;
        }
        const result = await s.request(who, options.value, getRequestId(res));
        if (result.kind === 'no_workspace' && who.kind === 'genealogist') {
          notFound(res);
          return;
        }
        sendRequestResult(res, result);
      }),
    );

    router.get(
      base,
      guard,
      handle(both, logger, async ({ store: s }, req, res) => {
        const who = access(req, res);
        if (!who) {
          return;
        }
        const jobs = await s.list(who, limitParam(req.query.limit, 10, 50));
        if (!jobs) {
          notFound(res);
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ jobs });
      }),
    );

    router.get(
      `${base}/:id`,
      guard,
      handle(both, logger, async ({ store: s }, req, res) => {
        const who = access(req, res);
        const id = String(req.params.id).toLowerCase();
        if (!who) {
          return;
        }
        const job = isUuid(id) ? await s.get(who, id) : undefined;
        if (!job) {
          notFound(res);
          return;
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ job });
      }),
    );

    router.delete(
      `${base}/:id`,
      guard,
      handle(both, logger, async ({ store: s }, req, res) => {
        const who = access(req, res);
        const id = String(req.params.id).toLowerCase();
        if (!who) {
          return;
        }
        const result = isUuid(id) ? await s.cancel(who, id, getRequestId(res)) : 'not_found';
        if (result === 'not_found') {
          notFound(res);
        } else if (result === 'not_open') {
          conflict(res, 'EXPORT_FINISHED', 'This export has already finished.');
        } else {
          res.status(204).end();
        }
      }),
    );

    router.get(
      `${base}/:id/file`,
      guard,
      handle(both, logger, async ({ service: s, store: st }, req, res) => {
        const who = access(req, res);
        const id = String(req.params.id).toLowerCase();
        if (!who) {
          return;
        }
        await sendFile(s, isUuid(id) ? await st.download(who, id) : undefined, res, 'attachment');
      }),
    );
  }

  mount('/family/exports', customer, (_req, res) => ({ kind: 'owner', userId: actorOf(res).userId }));

  mount('/genealogist/cases/:workspaceId/exports', genealogist, (req, res) => {
    if (config.genealogistAccess !== 'assigned') {
      res.status(403).json(errorBody('EXPORT_NOT_PERMITTED', 'Tree export by genealogists is not enabled.', getRequestId(res)));
      return undefined;
    }
    const ws = String(req.params.workspaceId).toLowerCase();
    if (!isUuid(ws)) {
      notFound(res);
      return undefined;
    }
    return { kind: 'genealogist', userId: actorOf(res).userId, workspaceId: ws };
  });

  return router;
}
