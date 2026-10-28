// Server-side only. Typed reads for the customer, genealogist and admin areas. Each call carries
// the signed-in user's own session, and the API decides what that user may see.
import type {
  AdminCustomerDetail,
  AdminCustomerSummary,
  AdminOrderDetail,
  AdminOrderView,
  AdminOverviewView,
  AdminService,
  AdminWorkspaceView,
  AssignmentView,
  AuditEventView,
  CaseSummary,
  CheckoutView,
  CustomerProfileView,
  EntitlementView,
  ExportJobView,
  FamilyMemberView,
  FamilyTreeView,
  GenealogistProfileView,
  GenealogistSummary,
  NotificationOverviewView,
  MediaItemView,
  NotificationView,
  OrderView,
  PaymentStatusView,
  PermissionMatrixView,
  PlanView,
  RelationshipView,
  ReportStatus,
  ReportView,
  ResearchRecordView,
  StaffAccountView,
  SystemStatusView,
  WebhookEventView,
} from '@kulvriksh/shared';
import { customerApi, staffApi } from './session-api';

// ---- Customer ----

export const getMyProfile = () => customerApi<{ profile: CustomerProfileView }>('/api/v1/me/profile');

/** The whole tree, or kind 'not_found' when the customer has not created a workspace yet. */
export const getMyFamilyTree = () => customerApi<FamilyTreeView>('/api/v1/family/tree');

export const getMyExports = () => customerApi<{ jobs: ExportJobView[] }>('/api/v1/family/exports?limit=5');

export const getMyReleasedReports = () => customerApi<{ reports: ReportView[] }>('/api/v1/reports');

// ---- Genealogist ----

export interface CaseDetail {
  workspaceId: string;
  workspaceName: string;
  assignedAt: string;
  members: FamilyMemberView[];
  relationships: RelationshipView[];
}

export const getMyCases = () => staffApi<{ cases: CaseSummary[] }>('/api/v1/genealogist/cases');
export const getCase = (workspaceId: string) => staffApi<{ case: CaseDetail }>(`/api/v1/genealogist/cases/${encodeURIComponent(workspaceId)}`);
export const getCaseRecords = (workspaceId: string) =>
  staffApi<{ records: ResearchRecordView[] }>(`/api/v1/genealogist/cases/${encodeURIComponent(workspaceId)}/records`);
export const getCaseReports = (workspaceId: string) =>
  staffApi<{ reports: ReportView[] }>(`/api/v1/genealogist/cases/${encodeURIComponent(workspaceId)}/reports`);

// ---- Admin ----

export const getWorkspacesForAdmin = () => staffApi<{ workspaces: AdminWorkspaceView[] }>('/api/v1/admin/workspaces?limit=200');
export const getGenealogistsForAdmin = () => staffApi<{ genealogists: GenealogistSummary[] }>('/api/v1/admin/genealogists');
export const getAssignmentsForAdmin = (status: 'active' | 'removed') =>
  staffApi<{ assignments: AssignmentView[] }>(`/api/v1/admin/assignments?status=${status}&limit=200`);
export const getReportsForReview = (status: ReportStatus) => staffApi<{ reports: ReportView[] }>(`/api/v1/admin/reports?status=${status}`);
export const getAuditEvents = (before?: string) =>
  staffApi<{ events: AuditEventView[]; nextBefore: string | null }>(
    `/api/v1/admin/audit?limit=50${before && /^\d+$/.test(before) ? `&before=${before}` : ''}`,
  );

// ---- TASK-10: staff accounts, notifications, media ----

export const getMyStaffMfa = () => staffApi<{ enabled: boolean; required: boolean; available: boolean; policy: string }>('/api/v1/staff/me/mfa');
export const getStaffAccounts = () => staffApi<{ staff: StaffAccountView[]; adminsMayManageAdmins: boolean }>('/api/v1/admin/staff');

export const getMyNotifications = (before?: string) =>
  customerApi<{ notifications: NotificationView[]; nextBefore: string | null; unread: number }>(
    `/api/v1/notifications?limit=20${before && /^[0-9a-f-]{36}$/i.test(before) ? `&before=${before}` : ''}`,
  );
export const getMyUnreadCount = () => customerApi<{ unread: number }>('/api/v1/notifications/unread-count');

export const getMyMedia = (before?: string) =>
  customerApi<{ items: MediaItemView[]; nextBefore: string | null; usedBytes: number }>(
    `/api/v1/family/media?limit=30${before && /^[0-9a-f-]{36}$/i.test(before) ? `&before=${before}` : ''}`,
  );

// ---- TASK-11: plans, orders, payments; admin overview, customers, access; genealogist profile ----

const CURSOR = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z_[0-9a-f-]{36}$/;
const cursor = (before?: string) => (before && CURSOR.test(before) ? `&before=${encodeURIComponent(before)}` : '');
const segment = (id: string) => encodeURIComponent(id);

export const getPlans = () => customerApi<{ plans: PlanView[] }>('/api/v1/plans');
export const getPaymentStatus = () => customerApi<{ payments: PaymentStatusView }>('/api/v1/payments/status');
export const getMyEntitlements = () => customerApi<{ entitlements: EntitlementView[] }>('/api/v1/me/entitlements');
export const getMyOrders = (before?: string) => customerApi<{ orders: OrderView[]; nextBefore: string | null }>(`/api/v1/orders?limit=20${cursor(before)}`);
export const getMyOrder = (id: string) => customerApi<{ order: OrderView }>(`/api/v1/orders/${segment(id)}`);
/** The payment page for an unpaid order. No state changes; POST because it must never be cached. */
export const getCheckout = (id: string) => customerApi<{ order: OrderView; checkout: CheckoutView }>(`/api/v1/orders/${segment(id)}/checkout`, { method: 'POST' });

export const getAdminPlans = () => staffApi<{ plans: PlanView[]; payments: PaymentStatusView | null }>('/api/v1/admin/plans');
export const getAdminServices = () => staffApi<{ services: AdminService[] }>('/api/v1/admin/services');
export const getAdminOrders = (filter: { status?: string; attention?: boolean; before?: string }) => {
  const status = filter.status && /^(created|pending|paid|failed)$/.test(filter.status) ? `&status=${filter.status}` : '';
  return staffApi<{ orders: AdminOrderView[]; nextBefore: string | null }>(`/api/v1/admin/orders?limit=25${status}${filter.attention ? '&attention=1' : ''}${cursor(filter.before)}`);
};
export const getAdminOrder = (id: string) => staffApi<{ order: AdminOrderDetail }>(`/api/v1/admin/orders/${segment(id)}`);
export const getPaymentAttention = () =>
  staffApi<{
    summary: { amountMismatch: number; unreconciled: number; grantsFailed: number; grantsStuck: number; webhookAttention: number };
    orders: AdminOrderView[];
    webhookEvents: WebhookEventView[];
  }>('/api/v1/admin/payments/attention');
export const getAdminOverviewData = () => staffApi<{ overview: AdminOverviewView }>('/api/v1/admin/overview');
export const getAdminCustomers = (q?: string, before?: string) =>
  staffApi<{ customers: AdminCustomerSummary[]; nextBefore: string | null }>(`/api/v1/admin/customers?limit=25${q ? `&q=${encodeURIComponent(q.slice(0, 60))}` : ''}${cursor(before)}`);
export const getAdminCustomer = (id: string) => staffApi<{ customer: AdminCustomerDetail }>(`/api/v1/admin/customers/${segment(id)}`);
export const getAccessMatrix = () => staffApi<{ access: PermissionMatrixView }>('/api/v1/admin/access');
export const getMyGenealogistProfile = () => staffApi<{ profile: GenealogistProfileView }>('/api/v1/genealogist/profile');
export const getNotificationOverview = () => staffApi<{ notifications: NotificationOverviewView }>('/api/v1/admin/notifications');
export const getSystemStatus = () => staffApi<{ system: SystemStatusView }>('/api/v1/admin/system');
