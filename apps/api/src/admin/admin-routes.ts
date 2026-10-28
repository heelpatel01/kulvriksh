import { Router } from 'express';
import type { PaymentStatusView, PermissionMatrixView, SystemStatusView } from '@kulvriksh/shared';
import type { AuthService } from '../auth/auth-service.ts';
import { actorOf, PERMISSIONS, requireStaff, type Permission } from '../auth/authorize.ts';
import { handle, isUuid, limitParam, notFound } from '../http.ts';
import type { Logger } from '../logger.ts';
import type { NotificationConfig } from '../notifications/notification-events.ts';
import type { AdminStore } from './admin-store.ts';

// Admin overview, customers (read only until R35 decides status actions), the real permission
// matrix, and the genealogist's own profile. Nothing here changes roles: roles are set only when
// an account is created, and no route edits them.

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'catalogue.manage': 'Create and change services and plans, including prices and activation',
  'staff.read': 'See staff accounts and the roles and access page',
  'staff.manage': 'Create staff accounts, send password links, deactivate and reactivate staff',
  'workspace.read_any': 'See every family workspace (for assigning cases)',
  'assignment.manage': 'Assign and unassign genealogists',
  'report.review': 'Review, return and release research reports',
  'audit.read': 'Read the audit log',
  'payments.read': 'See orders, payment attempts, webhook events and the attention queue',
  'payments.manage': 'Re-run entitlement grants for paid orders',
  'customers.read': 'See customers, their contact details, orders and activity',
  'notifications.read': 'See notification events and delivery status (no message content)',
  'system.read': 'See which integrations are connected on this server (no secrets)',
  'case.work': 'Research the families of their own active assignments',
};

export interface AdminRouteOptions {
  auth?: AuthService;
  store?: AdminStore;
  /** Policy settings shown read-only on the access page (no secrets). */
  policies: () => PermissionMatrixView['policies'];
  payments: () => PaymentStatusView;
  notificationConfig: NotificationConfig;
  /** Connection status built from the server's own configuration. */
  system: () => Promise<SystemStatusView>;
  logger: Logger;
}

export function adminRoutes({ auth, store, policies, payments, notificationConfig, system, logger }: AdminRouteOptions): Router {
  const router = Router();
  const customers = requireStaff(auth, logger, 'customers.read');
  const staffRead = requireStaff(auth, logger, 'staff.read');
  const genealogist = requireStaff(auth, logger, 'case.work');
  const notificationsRead = requireStaff(auth, logger, 'notifications.read');
  const systemRead = requireStaff(auth, logger, 'system.read');

  router.get('/admin/system', systemRead, async (_req, res, next) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ system: await system() });
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/admin/notifications',
    notificationsRead,
    handle(store, logger, async (s, _req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ notifications: await s.notificationOverview(notificationConfig) });
    }),
  );

  router.get(
    '/admin/overview',
    customers,
    handle(store, logger, async (s, _req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ overview: await s.overview(payments()) });
    }),
  );

  router.get(
    '/admin/customers',
    customers,
    handle(store, logger, async (s, req, res) => {
      const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
      const before = typeof req.query.before === 'string' ? req.query.before.slice(0, 80) : undefined;
      res.json(await s.customers({ limit: limitParam(req.query.limit, 25, 100), ...(before ? { before } : {}), ...(search ? { search } : {}) }));
    }),
  );

  router.get(
    '/admin/customers/:id',
    customers,
    handle(store, logger, async (s, req, res) => {
      const id = String(req.params.id).toLowerCase();
      const customer = isUuid(id) ? await s.customer(id) : undefined;
      if (!customer) {
        notFound(res);
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ customer });
    }),
  );

  // The matrix the API actually enforces, generated from PERMISSIONS, so this page cannot drift.
  router.get('/admin/access', staffRead, (_req, res) => {
    const matrix: PermissionMatrixView = {
      roles: ['admin', 'genealogist', 'customer'],
      permissions: (Object.keys(PERMISSIONS) as Permission[]).map((key) => ({ key, description: PERMISSION_DESCRIPTIONS[key], roles: [...PERMISSIONS[key]] })),
      policies: policies(),
    };
    res.json({ access: matrix });
  });

  router.get(
    '/genealogist/profile',
    genealogist,
    handle(store, logger, async (s, _req, res) => {
      const profile = await s.genealogistProfile(actorOf(res).userId);
      if (!profile) {
        notFound(res);
        return;
      }
      res.json({ profile });
    }),
  );

  return router;
}
