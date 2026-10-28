import { Router, type Request, type Response } from 'express';
import type { ReportStatus } from '@kulvriksh/shared';
import type { AuditReader } from '../audit/audit.ts';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer, requireStaff } from '../auth/authorize.ts';
import { conflict, handle, isUuid, limitParam, notFound, rejected, requireJson, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import type { ResearchStore } from './research-store.ts';
import {
  validateAssignment,
  validateRecordCreate,
  validateRecordUpdate,
  validateReportCreate,
  validateReportUpdate,
  validateReturn,
} from './research-validation.ts';

// Research workflow (Flows §8–§10). Admin routes need an admin permission; genealogist routes need
// `case.work` AND an active assignment for the workspace, checked in the store's transaction.
// Anything outside the caller's scope is 404, so IDs of other families reveal nothing (AS-GEN-04).

const REPORT_STATUSES: readonly ReportStatus[] = ['draft', 'submitted', 'returned', 'released'];

/** Path IDs must be UUIDs; anything else is a plain 404. */
function ids(req: Request, res: Response, ...names: string[]): string[] | undefined {
  const values = names.map((name) => String(req.params[name]).toLowerCase());
  if (!values.every(isUuid)) {
    notFound(res);
    return undefined;
  }
  return values;
}

export interface ResearchRouteOptions {
  auth?: AuthService;
  store?: ResearchStore;
  audit?: AuditReader;
  logger: Logger;
}

export function researchRoutes({ auth, store, audit, logger }: ResearchRouteOptions): Router {
  const router = Router();
  const admin = (permission: Parameters<typeof requireStaff>[2]) => requireStaff(auth, logger, permission);
  const genealogist = requireStaff(auth, logger, 'case.work');
  const me = (res: Response) => actorOf(res).userId;

  // ---- Admin ----

  router.get(
    '/admin/workspaces',
    admin('workspace.read_any'),
    handle(store, logger, async (s, req, res) => {
      const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
      res.json({ workspaces: await s.listWorkspaces({ limit: limitParam(req.query.limit, 50, 200), ...(search ? { search } : {}) }) });
    }),
  );

  router.get(
    '/admin/assignments',
    admin('assignment.manage'),
    handle(store, logger, async (s, req, res) => {
      const active = req.query.status !== 'removed';
      res.json({ assignments: await s.listAssignments({ active, limit: limitParam(req.query.limit, 100, 200) }) });
    }),
  );

  router.post(
    '/admin/assignments',
    admin('assignment.manage'),
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const input = validateAssignment(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.assign({ ...input.value, actorUserId: me(res), requestId: getRequestId(res) });
      if (!result.ok) {
        if (result.reason === 'workspace_not_found') {
          rejected(res, 'INVALID_WORKSPACE', 'This family does not exist.');
        } else if (result.reason === 'genealogist_unavailable') {
          rejected(res, 'INVALID_GENEALOGIST', 'Choose an active genealogist.');
        } else {
          conflict(res, 'ALREADY_ASSIGNED', 'This family already has a genealogist. Remove that assignment first.');
        }
        return;
      }
      res.status(201).json({ assignment: result.value });
    }),
  );

  router.post(
    '/admin/assignments/:id/remove',
    admin('assignment.manage'),
    handle(store, logger, async (s, req, res) => {
      const [id] = ids(req, res, 'id') ?? [];
      if (!id) {
        return;
      }
      const result = await s.removeAssignment({ assignmentId: id, actorUserId: me(res), requestId: getRequestId(res) });
      if (!result.ok) {
        notFound(res);
        return;
      }
      res.json({ assignment: result.value });
    }),
  );

  router.get(
    '/admin/reports',
    admin('report.review'),
    handle(store, logger, async (s, req, res) => {
      const status = (REPORT_STATUSES as readonly unknown[]).includes(req.query.status) ? (req.query.status as ReportStatus) : 'submitted';
      res.json({ reports: await s.listReportsForReview({ status, limit: limitParam(req.query.limit, 50, 200) }) });
    }),
  );

  router.get(
    '/admin/reports/:id',
    admin('report.review'),
    handle(store, logger, async (s, req, res) => {
      const [id] = ids(req, res, 'id') ?? [];
      if (!id) {
        return;
      }
      const report = await s.getReportForAdmin(id);
      if (!report) {
        notFound(res);
        return;
      }
      res.json({ report });
    }),
  );

  router.post(
    '/admin/reports/:id/return',
    admin('report.review'),
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const [id] = ids(req, res, 'id') ?? [];
      if (!id) {
        return;
      }
      const input = validateReturn(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.returnReport({ reportId: id, reason: input.value.reason, actorUserId: me(res), requestId: getRequestId(res) });
      if (!result.ok) {
        if (result.reason === 'not_found') {
          notFound(res);
        } else {
          conflict(res, 'INVALID_STATE', 'Only a submitted report can be returned.');
        }
        return;
      }
      res.json({ report: result.value });
    }),
  );

  router.post(
    '/admin/reports/:id/release',
    admin('report.review'),
    handle(store, logger, async (s, req, res) => {
      const [id] = ids(req, res, 'id') ?? [];
      if (!id) {
        return;
      }
      const result = await s.releaseReport({ reportId: id, actorUserId: me(res), requestId: getRequestId(res) });
      if (!result.ok) {
        if (result.reason === 'not_found') {
          notFound(res);
        } else {
          conflict(res, 'INVALID_STATE', 'Only a submitted report can be released.');
        }
        return;
      }
      res.json({ report: result.value });
    }),
  );

  router.get(
    '/admin/audit',
    admin('audit.read'),
    handle(audit, logger, async (reader, req, res) => {
      const before = typeof req.query.before === 'string' && /^\d{1,19}$/.test(req.query.before) ? BigInt(req.query.before) : undefined;
      const action = typeof req.query.action === 'string' && /^[a-z_.]{1,80}$/.test(req.query.action) ? req.query.action : undefined;
      const limit = limitParam(req.query.limit, 50, 100);
      const events = await reader.list({ limit, ...(before ? { before } : {}), ...(action ? { actionPrefix: action } : {}) });
      res.json({ events, nextBefore: events.length === limit ? events[events.length - 1]!.id : null });
    }),
  );

  // ---- Genealogist ----

  router.get(
    '/genealogist/cases',
    genealogist,
    handle(store, logger, async (s, _req, res) => {
      res.json({ cases: await s.listCases(me(res)) });
    }),
  );

  router.get(
    '/genealogist/cases/:workspaceId',
    genealogist,
    handle(store, logger, async (s, req, res) => {
      const [ws] = ids(req, res, 'workspaceId') ?? [];
      if (!ws) {
        return;
      }
      const found = await s.getCase(me(res), ws);
      if (!found) {
        notFound(res);
        return;
      }
      res.json({ case: found });
    }),
  );

  router.get(
    '/genealogist/cases/:workspaceId/records',
    genealogist,
    handle(store, logger, async (s, req, res) => {
      const [ws] = ids(req, res, 'workspaceId') ?? [];
      if (!ws) {
        return;
      }
      const records = await s.listRecords(me(res), ws);
      if (!records) {
        notFound(res);
        return;
      }
      res.json({ records });
    }),
  );

  router.post(
    '/genealogist/cases/:workspaceId/records',
    genealogist,
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const [ws] = ids(req, res, 'workspaceId') ?? [];
      if (!ws) {
        return;
      }
      const input = validateRecordCreate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.createRecord(me(res), ws, input.value, getRequestId(res));
      if (!result.ok) {
        notFound(res);
        return;
      }
      res.status(201).json({ record: result.value });
    }),
  );

  router.patch(
    '/genealogist/cases/:workspaceId/records/:id',
    genealogist,
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const [ws, id] = ids(req, res, 'workspaceId', 'id') ?? [];
      if (!ws || !id) {
        return;
      }
      const input = validateRecordUpdate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.updateRecord(me(res), ws, id, input.value, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'version_conflict') {
          conflict(res, 'VERSION_CONFLICT', 'This record was changed elsewhere. Reload and try again.');
        } else {
          notFound(res);
        }
        return;
      }
      res.json({ record: result.value });
    }),
  );

  router.get(
    '/genealogist/cases/:workspaceId/reports',
    genealogist,
    handle(store, logger, async (s, req, res) => {
      const [ws] = ids(req, res, 'workspaceId') ?? [];
      if (!ws) {
        return;
      }
      const reports = await s.listCaseReports(me(res), ws);
      if (!reports) {
        notFound(res);
        return;
      }
      res.json({ reports });
    }),
  );

  router.post(
    '/genealogist/cases/:workspaceId/reports',
    genealogist,
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const [ws] = ids(req, res, 'workspaceId') ?? [];
      if (!ws) {
        return;
      }
      const input = validateReportCreate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.createReport(me(res), ws, input.value, getRequestId(res));
      if (!result.ok) {
        notFound(res);
        return;
      }
      res.status(201).json({ report: result.value });
    }),
  );

  router.patch(
    '/genealogist/cases/:workspaceId/reports/:id',
    genealogist,
    requireJson,
    handle(store, logger, async (s, req, res) => {
      const [ws, id] = ids(req, res, 'workspaceId', 'id') ?? [];
      if (!ws || !id) {
        return;
      }
      const input = validateReportUpdate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await s.updateReport(me(res), ws, id, input.value, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'version_conflict') {
          conflict(res, 'VERSION_CONFLICT', 'This report was changed elsewhere. Reload and try again.');
        } else if (result.reason === 'not_editable') {
          conflict(res, 'NOT_EDITABLE', 'A submitted or released report cannot be edited.');
        } else {
          notFound(res);
        }
        return;
      }
      res.json({ report: result.value });
    }),
  );

  router.post(
    '/genealogist/cases/:workspaceId/reports/:id/submit',
    genealogist,
    handle(store, logger, async (s, req, res) => {
      const [ws, id] = ids(req, res, 'workspaceId', 'id') ?? [];
      if (!ws || !id) {
        return;
      }
      const result = await s.submitReport(me(res), ws, id, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'invalid_state') {
          conflict(res, 'INVALID_STATE', 'A released report cannot be submitted again.');
        } else if (result.reason === 'incomplete') {
          rejected(res, 'REPORT_INCOMPLETE', 'Write the report before submitting it.');
        } else {
          notFound(res);
        }
        return;
      }
      res.json({ report: result.value.report, changed: result.value.changed });
    }),
  );

  // ---- Customer: released reports of their own workspace only (D4, F-REP-03). ----

  router.get(
    '/reports',
    requireCustomer(auth, logger),
    handle(store, logger, async (s, _req, res) => {
      res.json({ reports: await s.listReleasedReports(me(res)) });
    }),
  );

  return router;
}
