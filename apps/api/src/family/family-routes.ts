import { Router, type Response } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer } from '../auth/authorize.ts';
import { conflict, handle, isUuid, limitParam, notFound, rejected, requireJson, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import { getRequestId } from '../middleware.ts';
import type { FamilyStore } from './family-store.ts';
import { validateMemberCreate, validateMemberUpdate, validateRelationship, validateVersion, validateWorkspace } from './family-validation.ts';

// The customer's own family workspace (F-FAM-01 to F-FAM-04). There is no workspace ID in any
// URL: the workspace is always the session customer's. Member and relationship IDs are matched
// together with that workspace, so another family's IDs simply return 404 (AS-FAM-03).

const MEMBER_PAGE_DEFAULT = 50;
const MEMBER_PAGE_MAX = 200;
const SEARCH_MAX = 60;

function noWorkspace(res: Response) {
  res.status(404).json({
    error: { code: 'NO_WORKSPACE', message: 'Create your family workspace first.', requestId: getRequestId(res) },
  });
}

export function familyRoutes({ auth, store, logger }: { auth?: AuthService; store?: FamilyStore; logger: Logger }): Router {
  const router = Router();
  router.use('/family', requireCustomer(auth, logger));
  const owner = (res: Response) => actorOf(res).userId;

  router.get(
    '/family',
    handle(store, logger, async (family, _req, res) => {
      res.json({ workspace: (await family.getWorkspace(owner(res))) ?? null });
    }),
  );

  router.post(
    '/family',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const input = validateWorkspace(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await family.createWorkspace(owner(res), input.value.name, getRequestId(res));
      // A repeated create returns the existing workspace instead of a second one (AS-FAM-02).
      res.status(result.created ? 201 : 200).json({ workspace: result.workspace, created: result.created });
    }),
  );

  router.patch(
    '/family',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const input = validateWorkspace(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const workspace = await family.renameWorkspace(owner(res), input.value.name, getRequestId(res));
      if (!workspace) {
        noWorkspace(res);
        return;
      }
      res.json({ workspace });
    }),
  );

  router.get(
    '/family/tree',
    handle(store, logger, async (family, _req, res) => {
      const tree = await family.getTree(owner(res));
      if (!tree) {
        noWorkspace(res);
        return;
      }
      res.json(tree);
    }),
  );

  router.get(
    '/family/members',
    handle(store, logger, async (family, req, res) => {
      const after = req.query.after;
      const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, SEARCH_MAX) : '';
      if (after !== undefined && !isUuid(after)) {
        validationFailed(res, { after: 'Invalid page cursor.' });
        return;
      }
      const page = await family.listMembers(owner(res), {
        limit: limitParam(req.query.limit, MEMBER_PAGE_DEFAULT, MEMBER_PAGE_MAX),
        ...(after ? { after: String(after).toLowerCase() } : {}),
        ...(search ? { search } : {}),
      });
      if (!page) {
        noWorkspace(res);
        return;
      }
      res.json(page);
    }),
  );

  router.post(
    '/family/members',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const input = validateMemberCreate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await family.createMember(owner(res), input.value.displayName, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'no_workspace') {
          noWorkspace(res);
        } else {
          rejected(res, 'LIMIT_REACHED', 'This family has reached the maximum number of members.');
        }
        return;
      }
      res.status(201).json({ member: result.value });
    }),
  );

  router.patch(
    '/family/members/:id',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(id)) {
        notFound(res);
        return;
      }
      const input = validateMemberUpdate(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await family.updateMember(owner(res), id, input.value, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'not_found') {
          notFound(res);
        } else {
          conflict(res, 'VERSION_CONFLICT', 'This person was changed elsewhere. Reload and try again.');
        }
        return;
      }
      res.json({ member: result.value });
    }),
  );

  // DELETE carries the version in a JSON body, like the other writes.
  router.delete(
    '/family/members/:id',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(id)) {
        notFound(res);
        return;
      }
      const input = validateVersion(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await family.deleteMember(owner(res), id, input.value.version, getRequestId(res));
      if (!result.ok) {
        if (result.reason === 'not_found') {
          notFound(res);
        } else if (result.reason === 'version_conflict') {
          conflict(res, 'VERSION_CONFLICT', 'This person was changed elsewhere. Reload and try again.');
        } else {
          // R21 is undecided, so nothing is cascaded (F-FAM-02).
          conflict(res, 'HAS_RELATIONSHIPS', 'Remove this person’s relationships before deleting them.');
        }
        return;
      }
      res.status(204).end();
    }),
  );

  router.get(
    '/family/relationships',
    handle(store, logger, async (family, _req, res) => {
      const relationships = await family.listRelationships(owner(res));
      if (!relationships) {
        noWorkspace(res);
        return;
      }
      res.json({ relationships });
    }),
  );

  router.post(
    '/family/relationships',
    requireJson,
    handle(store, logger, async (family, req, res) => {
      const input = validateRelationship(req.body);
      if (!input.ok) {
        validationFailed(res, input.fields);
        return;
      }
      const result = await family.createRelationship(owner(res), input.value, getRequestId(res));
      if (!result.ok) {
        switch (result.reason) {
          case 'no_workspace':
            noWorkspace(res);
            return;
          case 'member_not_found':
            // AS-FAM-06: members of another workspace look exactly like members that do not exist.
            rejected(res, 'INVALID_MEMBER', 'Both people must be members of your family.');
            return;
          case 'cycle':
            rejected(res, 'ANCESTRY_CYCLE', 'This would make a person their own ancestor.');
            return;
          case 'duplicate':
            conflict(res, 'DUPLICATE_RELATIONSHIP', 'This relationship already exists.');
            return;
          case 'limit_reached':
            rejected(res, 'LIMIT_REACHED', 'This family has reached the maximum number of relationships.');
            return;
        }
      }
      res.status(201).json({ relationship: result.value });
    }),
  );

  router.delete(
    '/family/relationships/:id',
    handle(store, logger, async (family, req, res) => {
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(id) || !(await family.deleteRelationship(owner(res), id, getRequestId(res)))) {
        notFound(res);
        return;
      }
      res.status(204).end();
    }),
  );

  return router;
}
