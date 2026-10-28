import { Router } from 'express';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, requireCustomer } from '../auth/authorize.ts';
import { handle, isUuid, limitParam, notFound, validationFailed } from '../http.ts';
import type { Logger } from '../logger.ts';
import type { NotificationStore } from './notification-store.ts';

// The signed-in customer's own in-app notifications. The recipient is always the session user:
// another person's notification ID simply returns 404.
export function notificationRoutes({ auth, store, logger }: { auth?: AuthService; store?: NotificationStore; logger: Logger }): Router {
  const router = Router();
  const customer = requireCustomer(auth, logger);

  router.get(
    '/notifications',
    customer,
    handle(store, logger, async (s, req, res) => {
      const before = req.query.before;
      if (before !== undefined && !isUuid(before)) {
        validationFailed(res, { before: 'Invalid page cursor.' });
        return;
      }
      res.json(await s.list(actorOf(res).userId, { limit: limitParam(req.query.limit, 20, 50), ...(before ? { before: String(before).toLowerCase() } : {}) }));
    }),
  );

  router.get(
    '/notifications/unread-count',
    customer,
    handle(store, logger, async (s, _req, res) => {
      res.json({ unread: await s.unreadCount(actorOf(res).userId) });
    }),
  );

  router.post(
    '/notifications/read-all',
    customer,
    handle(store, logger, async (s, _req, res) => {
      res.json({ marked: await s.markAllRead(actorOf(res).userId) });
    }),
  );

  router.post(
    '/notifications/:id/read',
    customer,
    handle(store, logger, async (s, req, res) => {
      const id = String(req.params.id).toLowerCase();
      if (!isUuid(id) || !(await s.markRead(actorOf(res).userId, id))) {
        notFound(res);
        return;
      }
      res.status(204).end();
    }),
  );

  return router;
}
