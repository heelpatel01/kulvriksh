// Cross-application contracts shared by the API and the web app.
// Keep this package limited to types and contracts that both applications genuinely use.

/**
 * Error response body returned by every API error (404, 500, ...).
 * `requestId` matches the X-Request-Id response header and the server logs,
 * so it can be quoted to support as a reference.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    /** Present only for VALIDATION_FAILED: a message per invalid input field. */
    fields?: Record<string, string>;
    /** Present only for RATE_LIMITED (429): seconds until the request may be retried. */
    retryAfterSeconds?: number;
  };
}

/** Service status (docs/02-DATA-MODEL.md §6.1). Inactive services are hidden publicly. */
export type ServiceStatus = 'active' | 'inactive';

/** Public view of an active service: `GET /api/v1/services`. */
export interface PublicService {
  id: string;
  name: string;
  description: string;
}

/** Admin view of a service: `GET /api/v1/admin/services`. Timestamps are ISO 8601 (UTC). */
export interface AdminService extends PublicService {
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response of `GET /health`. It reports only that the API process is running.
 * External dependencies are not checked until they are integrated, so they are
 * reported as `not_configured` rather than healthy.
 */
/** State of one external dependency in the readiness response. */
export type DependencyState = 'up' | 'down' | 'not_configured';

/**
 * Response of `GET /ready`: whether the API can serve requests that need its dependencies.
 * `ready` with 200, or `not_ready` with 503 when a configured dependency is down. Failure
 * details are never included; they are only logged.
 */
export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: 'kulvriksh-api';
  dependencies: {
    database: DependencyState;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: 'kulvriksh-api';
  dependencies: {
    database: 'not_configured';
  };
}

/** `POST /api/v1/auth/otp/request` (202). The same body is returned whether or not the number has an account. */
export interface OtpRequestAccepted {
  status: 'accepted';
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

/** The signed-in customer as the API describes them. The mobile number is masked. */
export interface CustomerIdentity {
  id: string;
  role: 'customer';
  mobileNumberMasked: string;
  createdAt: string;
}

/**
 * `POST /api/v1/auth/otp/verify` (200). Returned only to the Next.js server, which puts the token
 * in an HttpOnly cookie; the token never reaches browser JavaScript.
 */
export interface SignInResponse {
  session: { token: string; expiresAt: string };
  user: CustomerIdentity;
}

/** `GET /api/v1/auth/session` (200) for a valid Bearer session token. */
export interface SessionResponse {
  session: { expiresAt: string };
  user: CustomerIdentity;
}

// ---- Staff (genealogists and admins). Signed in separately from customers. ----

export type StaffRole = 'genealogist' | 'admin';

export interface StaffIdentity {
  id: string;
  role: StaffRole;
  displayName: string;
}

/** `POST /api/v1/staff/auth/sign-in` (200). The token is for the Next.js server's HttpOnly cookie only. */
export interface StaffSignInResponse {
  session: { token: string; expiresAt: string };
  user: StaffIdentity;
}

/** `GET /api/v1/staff/auth/session` (200). */
export interface StaffSessionResponse {
  session: { expiresAt: string };
  user: StaffIdentity;
}

/** `GET /api/v1/admin/staff`: every staff account. Never includes password hashes or MFA secrets. */
export interface StaffAccountView {
  id: string;
  role: StaffRole;
  displayName: string;
  email: string;
  status: 'active' | 'deactivated';
  /** False until the person completes their one-time setup link. */
  passwordSet: boolean;
  mfaEnabled: boolean;
  activeAssignments: number;
  createdAt: string;
}

/**
 * A one-time setup or reset link, returned ONCE to the admin who issued it (no email provider is
 * configured yet, R9/R37). The admin passes it to the person through a trusted channel.
 */
export interface StaffLinkIssued {
  userId: string;
  token: string;
  expiresAt: string;
}

/** `POST /api/v1/staff/auth/sign-in` when a second factor is needed (200, no session yet). */
export interface StaffMfaChallenge {
  mfa: 'required' | 'enrolment_required';
  challengeToken: string;
  expiresAt: string;
}

/** Enrolment step 1: the secret for the authenticator app, shown once. */
export interface StaffMfaEnrolment {
  secret: string;
  otpauthUri: string;
}

export interface GenealogistSummary {
  id: string;
  displayName: string;
  email: string;
  status: 'active' | 'deactivated';
  activeAssignments: number;
  createdAt: string;
}

// ---- Customer profile. Fields beyond the display name wait for R8. ----

/** `GET`/`PATCH /api/v1/me/profile`. */
export interface CustomerProfileView {
  mobileNumberMasked: string;
  displayName: string | null;
  memberSince: string;
  /** Profile fields this deployment accepts in PATCH (configurable while R8 is open). */
  editableFields: string[];
}

// ---- Family workspace (private to the owning customer). ----

/** Provisional (R18). parent_of: from = parent, to = child. spouse_of: symmetric. */
export type RelationshipType = 'parent_of' | 'spouse_of';

export interface FamilyWorkspaceView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  relationshipCount: number;
  limits: { maxMembers: number; maxRelationships: number };
}

export interface FamilyMemberView {
  id: string;
  displayName: string;
  /** Send back on update and delete; a stale version gets 409 (concurrent edit). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipView {
  id: string;
  type: RelationshipType;
  fromMemberId: string;
  toMemberId: string;
  createdAt: string;
}

/** `GET /api/v1/family/tree`: the whole tree in a bounded number of queries. */
export interface FamilyTreeView {
  workspace: FamilyWorkspaceView;
  members: FamilyMemberView[];
  relationships: RelationshipView[];
}

// ---- Research (assignments, records and reports). ----

export type ResearchRecordKind = 'note' | 'source';
/** Working set (R32): approval and release are one step until decided. */
export type ReportStatus = 'draft' | 'submitted' | 'returned' | 'released';

export interface CaseSummary {
  workspaceId: string;
  workspaceName: string;
  assignedAt: string;
  memberCount: number;
  openReports: number;
}

export interface ResearchRecordView {
  id: string;
  kind: ResearchRecordKind;
  body: string;
  version: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  status: ReportStatus;
  title: string;
  body: string;
  version: number;
  authorName: string;
  submittedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** An uploaded report file (PDF), if any. Its content is served only through an access check. */
  file: { contentType: string; byteSize: number } | null;
}

/** A media item's metadata (`GET /api/v1/family/media`). Content is a separate, checked request. */
export interface MediaItemView {
  id: string;
  mediaType: 'photo' | 'document' | 'voice' | 'tts_audio';
  contentType: string;
  byteSize: number;
  originalFilename: string | null;
  createdAt: string;
}

export interface AssignmentView {
  id: string;
  workspaceId: string;
  workspaceName: string;
  genealogistId: string;
  genealogistName: string;
  assignedAt: string;
  removedAt: string | null;
}

/** Admin view of a customer workspace, used to create assignments. */
export interface AdminWorkspaceView {
  id: string;
  name: string;
  ownerMobileMasked: string;
  memberCount: number;
  createdAt: string;
  activeAssignment: { id: string; genealogistId: string; genealogistName: string; assignedAt: string } | null;
}

/** A customer's in-app notification (`GET /api/v1/notifications`). Contains only released information. */
export interface NotificationView {
  id: string;
  eventKey: string;
  title: string;
  body: string;
  /** Where the customer can see the subject, e.g. /dashboard/research. */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEventView {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId: string | null;
  outcome: 'success' | 'failure';
  details: unknown;
  requestId: string | null;
}

export type ExportJobStatus = 'queued' | 'running' | 'ready' | 'failed';

/** Layout options of a family tree PDF (no personal data). */
export interface ExportOptionsView {
  mode: 'single' | 'poster' | 'tiled';
  pageSize: 'A4' | 'A3' | 'A2' | 'A1' | 'A0' | 'Letter' | 'Legal' | 'Tabloid' | 'custom';
  customWidthMm?: number;
  customHeightMm?: number;
  orientation: 'auto' | 'portrait' | 'landscape';
  labelSize: number;
  scalePercent: number;
  /** Printable sheets only: fit the tree on at most this many sheets (largest readable scale). */
  targetSheets?: number;
  showNumbers: boolean;
  showGeneration: boolean;
  includeIndex: boolean;
  scope: { kind: 'all' } | { kind: 'descendants' | 'ancestors'; memberId: string };
}

/** A family tree PDF export (`/api/v1/family/exports`). The file is a separate, checked download. */
export interface ExportJobView {
  id: string;
  status: ExportJobStatus;
  progress: number;
  options: ExportOptionsView;
  pageCount: number | null;
  memberCount: number | null;
  /** e.g. labels_small, labels_unreadable, labels_truncated, poster_reduced, unsupported_characters. */
  warnings: string[];
  /** e.g. too_many_pages, timeout, cancelled, interrupted, scope_not_found, generation_failed. */
  errorCode: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  /** True while the PDF can still be downloaded. */
  downloadable: boolean;
  byteSize: number | null;
}

// ---- Plans, orders, payments and entitlements (TASK-11) ----

/** A purchasable plan. Amounts are integers in minor units (e.g. paise). */
export interface PlanView {
  id: string;
  serviceId: string;
  serviceName: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  status: 'active' | 'inactive';
  /** Entitlement keys granted when the plan is paid (R14 mapping, per plan). */
  entitlementKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'created' | 'pending' | 'paid' | 'failed';
export type GrantStatus = 'pending' | 'granted' | 'failed';

export interface OrderView {
  id: string;
  status: OrderStatus;
  planId: string;
  /** From the snapshot taken when the order was created. */
  planName: string;
  serviceName: string;
  amountMinor: number;
  currency: string;
  provider: string;
  createdAt: string;
  paidAt: string | null;
  grantStatus: GrantStatus | null;
  /** amount_mismatch | unreconciled: shown to admins; customers see a neutral message. */
  attentionReason: string | null;
}

/** What the browser needs to open the payment page. The key id is public by design. */
export interface CheckoutView {
  provider: 'razorpay' | 'development';
  mode: 'test' | 'live' | 'development';
  keyId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  name: string;
}

export interface PaymentAttemptView {
  id: string;
  providerPaymentId: string;
  status: 'authorised' | 'captured' | 'failed';
  amountMinor: number;
  currency: string;
  capturedAt: string | null;
  failureCode: string | null;
  firstSeenVia: 'verify' | 'webhook' | 'reconciliation';
  createdAt: string;
}

export interface WebhookEventView {
  id: string;
  providerEventId: string;
  eventType: string;
  status: 'processed' | 'ignored' | 'needs_attention';
  attentionReason: string | null;
  relatedOrderId: string | null;
  receivedAt: string;
}

export interface AdminOrderView extends OrderView {
  customerUserId: string;
  customerMobileMasked: string;
  providerOrderId: string;
  reconcileCheckCount: number;
  reconcileLastCheckedAt: string | null;
}

export interface AdminOrderDetail extends AdminOrderView {
  planSnapshot: unknown;
  attempts: PaymentAttemptView[];
  webhookEvents: WebhookEventView[];
  grant: { status: GrantStatus; attemptCount: number; lastError: string | null; grantedAt: string | null; failedAt: string | null } | null;
  entitlements: EntitlementView[];
}

export interface EntitlementView {
  key: string;
  validFrom: string;
  validUntil: string | null;
  orderId: string;
}

/** Payment setup as the browser may see it: no secrets. */
export interface PaymentStatusView {
  provider: 'none' | 'development' | 'razorpay';
  mode: 'test' | 'live' | 'development' | null;
  currency: string;
  /** feature → entitlement key; empty when nothing is gated (R14). */
  gates: Record<string, string>;
}

// ---- Admin overview, customers, roles & access, genealogist profile (TASK-11) ----

export interface AdminOverviewView {
  generatedAt: string;
  customers: { total: number; active: number; deactivated: number; withWorkspace: number; newLast30Days: number };
  family: { workspaces: number; members: number; relationships: number };
  research: { activeAssignments: number; unassignedWorkspaces: number; reports: Record<'draft' | 'submitted' | 'returned' | 'released', number> };
  orders: { created: number; pending: number; paid: number; failed: number; paidLast30Days: number; revenue: Array<{ currency: string; amountMinor: number }> };
  attention: { amountMismatch: number; unreconciled: number; grantsFailed: number; grantsStuck: number; webhookAttention: number; reportsAwaitingReview: number };
  exports: { queued: number; running: number; readyLast7Days: number; failedLast7Days: number };
  staff: { admins: number; genealogists: number; deactivated: number };
  payments: PaymentStatusView;
}

export interface AdminCustomerSummary {
  id: string;
  mobileMasked: string;
  displayName: string | null;
  status: 'active' | 'deactivated';
  createdAt: string;
  lastSeenAt: string | null;
  workspace: { id: string; name: string; memberCount: number } | null;
  paidOrders: number;
}

export interface AdminCustomerDetail extends AdminCustomerSummary {
  /** Contact details are readable by admins (permissions matrix §13). */
  mobileNumber: string;
  activeSessions: number;
  assignment: { genealogistName: string; assignedAt: string } | null;
  reports: Record<'draft' | 'submitted' | 'returned' | 'released', number>;
  orders: OrderView[];
  entitlements: EntitlementView[];
  recentActivity: Array<{ occurredAt: string; action: string; outcome: 'success' | 'failure' }>;
}

export interface PermissionMatrixView {
  roles: string[];
  permissions: Array<{ key: string; description: string; roles: string[] }>;
  policies: Array<{ name: string; value: string; decision: string }>;
}

export interface GenealogistProfileView {
  displayName: string;
  email: string;
  createdAt: string;
  mfaEnabled: boolean;
  activeAssignments: number;
  reports: Record<'draft' | 'submitted' | 'returned' | 'released', number>;
}

/** What the chosen export options would produce (`POST /family/exports/preview`). Nothing is stored. */
export interface ExportPreviewView {
  mode: 'single' | 'poster' | 'tiled';
  /** All pages, including the assembly overview and the member index. */
  pageCount: number;
  maxPages: number;
  withinLimits: boolean;
  memberCount: number;
  pageWidthMm: number;
  pageHeightMm: number;
  sheets: { rows: number; columns: number } | null;
  /** Printed size of names at 100% printing. */
  effectiveLabelPt: number;
  scalePercent: number;
  warnings: string[];
}

/** Notification events and delivery status for admins. No message content or addresses. */
export interface NotificationOverviewView {
  events: Array<{ eventKey: string; trigger: string; recipient: string; status: 'active' | 'awaiting_decision'; channels: string[] }>;
  providers: { email: 'none'; sms: 'none' };
  counts: Array<{ eventKey: string; channel: string; status: string; count: number }>;
  recent: Array<{ id: string; eventKey: string; channel: string; status: string; attemptCount: number; lastErrorCode: string | null; createdAt: string; sentAt: string | null; readAt: string | null }>;
}

/** What is connected on this server, from its own configuration. No secrets. */
export interface SystemStatusView {
  environment: 'development' | 'test' | 'production';
  database: 'up' | 'down' | 'not_configured';
  integrations: Array<{ id: string; name: string; purpose: string; status: 'connected' | 'development_only' | 'not_configured'; detail: string }>;
}
