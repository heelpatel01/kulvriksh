import { Router, type Request, type Response } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer, requireStaff } from '../auth/authorize.ts';
import { errorBody } from '../errors.ts';
import { conflict, handle, isUuid, limitParam, notFound, rejected, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import { sanitiseFilename } from '../storage/file-types.ts';
import type { FileContent, FileStore } from './file-store.ts';
import type { FileService, UploadResult } from './file-service.ts';

// File endpoints (Flows §7.1, §7.2). Uploads are raw `application/octet-stream` bodies (no
// multipart parser is needed); the original file name travels URI-encoded in `X-File-Name` and is
// display-only. Every download re-checks access and is served privately.

function declaredLength(req: Request): number | undefined {
  const raw = req.get('content-length');
  return raw && /^\d{1,15}$/.test(raw) ? Number(raw) : undefined;
}

function requireOctetStream(req: Request, res: Response): boolean {
  if (!req.is('application/octet-stream')) {
    res.status(415).json(errorBody('UNSUPPORTED_MEDIA_TYPE', 'Send the file as application/octet-stream', getRequestId(res)));
    return false;
  }
  return true;
}

function sendUploadFailure(res: Response, result: Exclude<UploadResult<unknown>, { kind: 'ok' }>) {
  switch (result.kind) {
    case 'too_large':
      res.status(413).json(errorBody('FILE_TOO_LARGE', `The file is larger than ${Math.floor(result.limit / (1024 * 1024))} MB.`, getRequestId(res)));
      return;
    case 'unsupported_type':
      rejected(res, 'UNSUPPORTED_FILE_TYPE', 'This kind of file is not accepted.');
      return;
    case 'quota_exceeded':
      rejected(res, 'QUOTA_EXCEEDED', 'Your family’s storage is full. Remove files to make room.');
      return;
    case 'not_editable':
      conflict(res, 'NOT_EDITABLE', 'A submitted or released report cannot be changed.');
      return;
    case 'no_workspace':
      res.status(404).json(errorBody('NO_WORKSPACE', 'Create your family workspace first.', getRequestId(res)));
      return;
    default:
      notFound(res);
  }
}

/** Streams a checked file. Private, never cached, never sniffed, sandboxed if opened directly. */
export async function sendFile(files: Pick<FileService, 'open'>, content: FileContent | undefined, res: Response, disposition: 'inline' | 'attachment') {
  if (!content) {
    notFound(res);
    return;
  }
  const { stream, byteSize } = await files.open(content);
  const name = (content.filename ?? 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  res.setHeader('Content-Type', content.contentType);
  res.setHeader('Content-Length', String(byteSize));
  res.setHeader('Content-Disposition', `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(content.filename ?? 'file')}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

export interface FileRouteOptions {
  auth?: AuthService;
  files?: FileService;
  store?: FileStore;
  logger: Logger;
}

export function fileRoutes({ auth, files, store, logger }: FileRouteOptions): Router {
  const router = Router();
  const customer = requireCustomer(auth, logger);
  const genealogist = requireStaff(auth, logger, 'case.work');
  const reviewer = requireStaff(auth, logger, 'report.review');
  const both = files && store ? { files, store } : undefined;
  const me = (res: Response) => actorOf(res).userId;

  // ---- Customer media (private to the workspace owner) ----

  router.get(
    '/family/media',
    customer,
    handle(both, logger, async ({ store: s }, req, res) => {
      const before = req.query.before;
      if (before !== undefined && !isUuid(before)) {
        validationFailed(res, { before: 'Invalid page cursor.' });
        return;
      }
      const page = await s.listMedia(me(res), { limit: limitParam(req.query.limit, 30, 100), ...(before ? { before: String(before).toLowerCase() } : {}) });
      if (!page) {
        res.status(404).json(errorBody('NO_WORKSPACE', 'Create your family workspace first.', getRequestId(res)));
        return;
      }
      res.json(page);
    }),
  );

  router.post(
    '/family/media',
    customer,
    handle(both, logger, async ({ files: f }, req, res) => {
      if (!requireOctetStream(req, res)) {
        return;
      }
      const result = await f.uploadMedia({
        ownerId: me(res),
        body: req,
        declaredBytes: declaredLength(req),
        filename: sanitiseFilename(req.get('x-file-name')),
        requestId: getRequestId(res),
      });
      if (result.kind !== 'ok') {
        sendUploadFailure(res, result);
        return;
      }
      res.status(201).json({ item: result.value });
    }),
  );

  router.get(
    '/family/media/:id/content',
    customer,
    handle(both, logger, async ({ files: f, store: s }, req, res) => {
      const id = String(req.params.id).toLowerCase();
      await sendFile(f, isUuid(id) ? await s.mediaContent(me(res), id) : undefined, res, 'inline');
    }),
  );

  router.delete(
    '/family/media/:id',
    customer,
    handle(both, logger, async ({ files: f }, req, res) => {
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(id) || !(await f.deleteMedia(me(res), id, getRequestId(res)))) {
        notFound(res);
        return;
      }
      res.status(204).end();
    }),
  );

  // ---- Report files ----

  router.post(
    '/genealogist/cases/:workspaceId/reports/:id/file',
    genealogist,
    handle(both, logger, async ({ files: f }, req, res) => {
      const ws = String(req.params.workspaceId).toLowerCase();
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(ws) || !isUuid(id)) {
        notFound(res);
        return;
      }
      if (!requireOctetStream(req, res)) {
        return;
      }
      const result = await f.uploadReportFile({ genealogistId: me(res), workspaceId: ws, reportId: id, body: req, declaredBytes: declaredLength(req), requestId: getRequestId(res) });
      if (result.kind !== 'ok') {
        sendUploadFailure(res, result);
        return;
      }
      res.status(204).end();
    }),
  );

  router.get(
    '/genealogist/cases/:workspaceId/reports/:id/file',
    genealogist,
    handle(both, logger, async ({ files: f, store: s }, req, res) => {
      const ws = String(req.params.workspaceId).toLowerCase();
      const id = String(req.params.id).toLowerCase();
      await sendFile(f, isUuid(ws) && isUuid(id) ? await s.reportFileForGenealogist(me(res), ws, id) : undefined, res, 'attachment');
    }),
  );

  router.get(
    '/admin/reports/:id/file',
    reviewer,
    handle(both, logger, async ({ files: f, store: s }, req, res) => {
      const id = String(req.params.id).toLowerCase();
      await sendFile(f, isUuid(id) ? await s.reportFileForAdmin(id) : undefined, res, 'attachment');
    }),
  );

  // Customers: released reports of their own family only; anything else is 404 (AS-REP-01).
  router.get(
    '/reports/:id/file',
    customer,
    handle(both, logger, async ({ files: f, store: s }, req, res) => {
      const id = String(req.params.id).toLowerCase();
      await sendFile(f, isUuid(id) ? await s.reportFileForCustomer(me(res), id) : undefined, res, 'attachment');
    }),
  );

  // Without configured storage, `handle` answers 503 on every route above: uploads are refused,
  // never silently discarded.
  return router;
}
