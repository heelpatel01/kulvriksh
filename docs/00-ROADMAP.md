# Kulvriksh Digital Platform — Implementation Roadmap

| Item | Value |
|---|---|
| Document | `docs/00-ROADMAP.md` |
| Status | Draft for review |
| Delivery window | 8–10 weeks (subject to dependencies and confirmation) |
| Post-launch support | 30-day bug-fix support |
| Related documents | [`docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md`](PERFORMANCE-AND-NAVIGATION-STANDARDS.md) — detailed performance specification |
| Last updated | 2026-10-21 (see [change log](#change-log)) |

This roadmap converts the approved product scope into ten delivery phases. It does not add requirements. Any business decision that is not yet confirmed is marked **TBC** and listed in [Section 9](#9-unconfirmed-requirements-tbc).

---

## Contents

1. [Purpose and principles](#1-purpose-and-principles)
2. [Technology stack and environments](#2-technology-stack-and-environments)
3. [Approved scope](#3-approved-scope)
4. [Confirmed decisions](#4-confirmed-decisions)
5. [Indicative timeline](#5-indicative-timeline)
6. [Phase plans](#6-phase-plans)
7. [Cross-phase dependencies](#7-cross-phase-dependencies)
8. [Delivery checkpoints](#8-delivery-checkpoints)
9. [Unconfirmed requirements (TBC)](#9-unconfirmed-requirements-tbc)
10. [Change control](#10-change-control)
11. [Cross-cutting standards](#11-cross-cutting-standards)
12. [Performance and navigation requirements](#12-performance-and-navigation-requirements)

---

## 1. Purpose and principles

- **Purpose:** to give a single, ordered plan for building, testing and deploying the Kulvriksh Digital Platform within the agreed scope.
- **Scope discipline:** only the items in [Section 3](#3-approved-scope) are in scope. New or changed requests go through [change control](#10-change-control).
- **Local first:** every feature is built and tested locally. The production VPS is configured only after local development and testing are complete.
- **Private by default:** customer family data, media and research reports are visible only to authorised parties.
- **Server-side authority:** all authorisation, pricing, payment verification and entitlement checks happen on the backend. The frontend is never trusted.
- **Scalable foundations:** the storage, notification and TTS integrations sit behind interfaces so providers can be changed without rewriting business logic.
- **Measured performance:** performance is built and tested in every phase, not left until launch. Targets are confirmed by measurement, never assumed. See [Section 12](#12-performance-and-navigation-requirements).

---

## 2. Technology stack and environments

| Layer | Choice |
|---|---|
| Frontend | Next.js (React-based), TypeScript where appropriate |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Payments | Razorpay |
| Media storage (initial production) | VPS NVMe, accessed through the storage abstraction for future object-storage migration |

### Frontend architecture

- **One frontend application.** Next.js serves the public website, the 25 SEO-friendly surname pages, and the authenticated customer, genealogist and admin interfaces. A different frontend approach for any area requires a documented technical reason and goes through [change control](#10-change-control).
- **Rendering:**
  - Public pages use static generation or server rendering so that meaningful content is present in the initial HTML.
  - Authenticated pages are rendered per request and are never cached in a way that could be shared between users.
  - Server Components are the default. Client Components are used only where interactivity or browser APIs require them, for example the interactive family tree, Razorpay checkout and voice recording.
  - The exact Next.js version and router conventions are fixed in Phase 2 after checking current stable releases.
- **Business logic stays in Express.** The Express API remains the single place for business rules, authorisation, pricing, payment verification and entitlements. Next.js server code calls the API and does not bypass or duplicate these checks.
- **Request routing:** how the browser reaches Next.js and the Express API (for example same-origin routing through the reverse proxy, so session cookies work for both) is designed in Phase 2 and mirrored locally.
- **Performance:** client-side navigation, stable shared layouts, route-level code splitting and minimal client JavaScript are required. See [Section 12](#12-performance-and-navigation-requirements).

| Environment | Purpose | Timing |
|---|---|---|
| Local development | Building and testing every feature | Phases 2–9 |
| Production (Hostinger VPS) | Live platform | Configured in Phase 10 after local testing |
| Staging | **TBC.** No separate staging environment has been agreed. | — |

**Production VPS capacity:** 1 vCPU, 4 GB RAM, 50 GB NVMe. The 50 GB is **shared** by the OS, application, PostgreSQL, logs, local backup copies and media. It is not dedicated media space. This affects media limits (Phase 7), backup strategy (Phase 10) and monitoring (Phase 10).

**Effect of the Next.js decision on the VPS:** production runs two Node.js processes, the Next.js server and the Express API, alongside PostgreSQL on the same 1 vCPU / 4 GB server. Memory and CPU use of both processes is measured during development and in the Phase 10 load check. No extra hosting or infrastructure is assumed (see [Section 12](#12-performance-and-navigation-requirements)).

---

## 3. Approved scope

1. Public website, 25 SEO-friendly surname pages, enquiries and analytics.
2. Customer mobile OTP authentication and profiles.
3. Services, plans, orders, Razorpay payments, signature verification, idempotent webhooks and purchase entitlements.
4. Customer-owned family workspaces, member records, relationships, interactive family trees and PDF exports.
5. Private photographs, PDFs, documents, voice records and text-to-speech.
6. Genealogist/Vahivancha portal with admin-assigned family access.
7. Research records and reports requiring approval before customer access.
8. Configurable SMS and email notifications.
9. Admin panel for customers, genealogists, families, services, orders, payments, enquiries and research.
10. Validation, authorisation, security, testing, backups, monitoring, deployment and 30-day post-launch bug-fix support.

### Explicitly excluded from the initial release

- Refund processing, unless separately agreed through change control.
- The migration to object storage itself. Only the storage abstraction that enables it is in scope.

---

## 4. Confirmed decisions

| # | Decision | Effect on delivery |
|---|---|---|
| D1 | Family workspaces are private to their owning customer by default. | Every family query is scoped to the owner, an assigned genealogist or an admin. |
| D2 | Admin assignment grants genealogist access, limited to the assigned scope. | Genealogists cannot see unassigned families. Access ends when the assignment is removed. |
| D3 | Refund processing is excluded from the initial release. | There is no refund API, UI or webhook handling for refunds. Refunds are handled manually outside the platform (process TBC). |
| D4 | Research reports require approval/release before customers can view or download them. | Report state controls visibility and file download authorisation. |
| D5 | The VPS has 1 vCPU, 4 GB RAM and 50 GB of shared NVMe. | Requires media quotas, disk monitoring and off-server backups. |
| D6 | Develop and test locally before production deployment. | The VPS is configured in Phase 10. |
| D7 | The 8–10 week delivery window is preserved, subject to dependencies and confirmation. | See the [indicative timeline](#5-indicative-timeline) and [checkpoints](#8-delivery-checkpoints). |

---

## 5. Indicative timeline

The week allocation is indicative. It is confirmed at the end of Phase 1 and depends on the client inputs in [Section 9](#9-unconfirmed-requirements-tbc) arriving on time. Phases overlap where dependencies allow.

| Phase | Name | Indicative weeks |
|---|---|---|
| 1 | Discovery and scope confirmation | Week 1 |
| 2 | Architecture and local development foundation | Weeks 1–2 |
| 3 | Public website and lead generation | Weeks 2–3 |
| 4 | Authentication and authorisation | Week 3 |
| 5 | Services, orders and payments | Weeks 4–5 |
| 6 | Family workspaces and graphical tree | Weeks 5–6 |
| 7 | Media, voice and text-to-speech | Weeks 6–7 |
| 8 | Genealogist portal and research | Weeks 7–8 |
| 9 | Admin panel and notifications | Weeks 8–9. Admin screens for each module are built alongside that module. This phase consolidates them. |
| 10 | QA, deployment and handover | Weeks 9–10, followed by 30-day bug-fix support |

An 8-week delivery requires all Phase 1 inputs to be confirmed in Week 1 and no change requests. The 10-week ceiling assumes normal feedback cycles. Delays in client inputs or third-party approvals, such as Razorpay account activation and SMS sender/template registration, move the timeline and are recorded through change control.

The Next.js decision and the performance requirements do not change this allocation. Performance work is part of each phase's tasks and acceptance criteria, not a separate phase. If measurements show that a target cannot be met without extra infrastructure or effort, the impact is documented and handled through change control.

---

## 6. Phase plans

### Phase 1 — Discovery and scope confirmation

**Scope and key tasks**
- Walk through the approved scope and confirmed decisions with the client, and record sign-off.
- Resolve or assign owners and dates to every TBC item in [Section 9](#9-unconfirmed-requirements-tbc).
- Collect client inputs: the list of 25 surnames and their content, branding/design assets, legal page content, service and plan definitions with pricing, and notification events and templates.
- Confirm third-party accounts and owners: Razorpay, SMS provider, email provider, TTS provider, analytics, domain/DNS and the Hostinger VPS.
- Define user roles (customer, genealogist/Vahivancha, admin) and a permission matrix covering every resource in scope.
- Confirm the indicative timeline and checkpoint dates.
- Collect inputs that performance testing needs: representative data volumes, such as the largest expected family tree and typical list sizes (TBC). Raise the engineering clarifications in [Section 9](#9-unconfirmed-requirements-tbc).

**Dependencies**
- Client availability for workshops and sign-off.
- Client ownership of third-party accounts. Accounts should be registered in the client's name.

**Acceptance criteria / exit conditions**
- The scope, confirmed decisions and permission matrix are signed off by the client.
- Every TBC item has a decision, or an owner and target date, with its impact on the timeline noted.
- Checkpoint dates are agreed.

**Security and failure cases**
- Third-party credentials are shared through a secure channel, never by email or chat in plain text.
- Risk: late inputs (surname content, pricing, provider accounts) block later phases. Mitigation: record target dates and handle slippage through change control.

---

### Phase 2 — Architecture and local development foundation

**Scope and key tasks**
- Repository structure for the Next.js frontend and the Express/TypeScript backend.
- **Next.js foundation:**
  - fix the Next.js version and router conventions
  - route groups for the public site, customer, genealogist and admin areas, each with a stable shared layout and navigation
  - client-side navigation (`next/link`) for internal routes
  - accessible loading and error states for routes
  - a documented rendering and caching strategy for each route type: static, revalidated, or per-request
- **Frontend–API integration:**
  - request routing between Next.js and Express, with a matching local setup
  - session cookie handling that works for both server-rendered pages and browser requests
  - an API client with timeouts, cancellation, request deduplication, and no automatic retry of non-idempotent requests
- Local PostgreSQL and Prisma setup, initial schema and migration workflow.
- **Database conventions:** one shared PrismaClient per process, standard pagination and limits for list endpoints, an indexing approach for lookups and searches, and slow-query logging in development.
- Core data model drafts: users, roles, customer profiles, services, plans, orders, payments, entitlements, families, members, relationships, media, research records, reports, assignments, enquiries, notification templates/logs and audit logs.
- Cross-cutting backend modules:
  - configuration loading with environment validation and no secrets in the repository
  - request validation layer
  - central error handling with consistent error responses
  - structured logging that excludes sensitive data
  - authentication middleware skeleton and role/ownership authorisation helpers
- **Storage abstraction** (interface for put/get/delete/signed access) with a local-disk implementation, designed so an object-storage implementation can be added later.
- Provider interfaces for SMS, email and TTS, with local/test stubs.
- Audit log foundation for sensitive actions.
- Testing setup (unit and integration), linting, formatting and type checks.
- Seed data for local development and tests, including a representative-volume data set for performance testing. Volumes are based on the Phase 1 inputs; until those are confirmed, the assumptions are documented.
- **Performance testing foundation:**
  - a procedure for testing the production build locally
  - an agreed test profile: device, network, browser, and warm/cold cache
  - Lighthouse or equivalent lab checks
  - bundle-size inspection
  - a results record for baselines, regressions and fixes

**Dependencies**
- Phase 1 sign-off on roles, permission matrix and core entities.
- Representative data volumes from Phase 1 (TBC). Documented assumptions are used until they are confirmed.

**Acceptance criteria / exit conditions**
- A new developer can run the frontend, backend and database locally from documented steps.
- Migrations apply cleanly on an empty database, and seed data loads.
- Validation, error handling, logging and authorisation helpers are in place and covered by tests.
- The storage abstraction stores and retrieves files locally through its interface only. No module writes to disk directly.
- Tests, lint and type checks pass.
- The production build runs locally. Navigating between the skeleton routes of each area uses client-side navigation: no full-document reload, and the shared layout does not remount.
- The rendering and caching strategy, test profile and results record are documented. A first baseline is recorded for the skeleton routes.

**Security and failure cases**
- Secrets are loaded from environment variables. Example environment files contain placeholders only.
- Logs never contain OTPs, tokens, payment secrets or private file paths.
- Error responses do not leak stack traces or internal details.
- Storage paths are generated server-side and are not guessable. Users never supply filesystem paths, which prevents path traversal.
- Failure case: invalid configuration stops the application at startup instead of failing at runtime.
- Personalised routes and API responses are never stored in shared caches. This covers the Next.js server caches and HTTP caching; such responses are marked private or no-store. An automated test confirms that one user's server-rendered page or data is never served to another user.
- Server-only secrets and API keys never reach client-side bundles.
- Failure case: if the API is slow or unavailable, routes show an accessible loading or error state rather than a blank or frozen screen.

---

### Phase 3 — Public website and lead generation

**Scope and key tasks**
- Public pages (page list TBC) using approved branding, built in Next.js with Server Components by default.
- 25 SEO-friendly surname pages:
  - clean URLs and structured content with a correct heading hierarchy
  - statically generated, with explicit revalidation when content changes
  - unique titles, meta descriptions and canonical URLs through Next.js metadata
  - sitemap and robots configuration
- Correct HTTP 404 responses for unknown routes and unknown surnames.
- **Efficient assets:**
  - Next.js image optimisation for public images, with defined dimensions
  - lazy loading below the fold, but not for the main above-the-fold image
  - efficient font loading with only the weights needed
- Analytics and other non-essential scripts are deferred so they do not block rendering.
- Accessibility is preserved: semantic HTML, keyboard navigation, visible focus, alt text, and normal browser link behaviour (new tab, back/forward). The target accessibility level is TBC.
- Enquiry form with server-side validation, spam protection (method TBC), storage and admin visibility.
- Analytics integration (tool TBC).
- Responsive layout (browser/device support matrix TBC).

**Dependencies**
- Phase 2 foundation, including the rendering/caching strategy and performance test profile.
- Client content for the 25 surname pages and other public pages, branding, legal pages and the analytics account.

**Acceptance criteria / exit conditions**
- All 25 surname pages are reachable at SEO-friendly URLs with unique metadata and appear in the sitemap.
- The initial HTML of each public page contains its meaningful content. This is checked by fetching the page without running JavaScript.
- Unknown surname and page URLs return an HTTP 404 status, checked by an automated test.
- Routine navigation between public pages is client-side: no full-document reload, a stable navbar/layout, and no duplicate requests. This is checked in the production build.
- Lab Core Web Vitals (LCP, CLS) and the INP proxy (e.g. Total Blocking Time) are recorded for the homepage and a representative surname page in the production build, against the [proposed targets](#12-performance-and-navigation-requirements). Missed targets are investigated and either fixed or documented.
- Enquiries are validated, stored and visible to admins. A notification is sent if this is configured in Phase 9.
- Analytics records page views (subject to consent requirements, TBC).
- The pages work on the agreed browsers and devices.
- The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met, and results are recorded.

**Security and failure cases**
- The enquiry form is protected against spam and abuse through rate limiting and the agreed anti-spam method.
- All enquiry input is validated and output-encoded to prevent XSS. Free text is never rendered as raw HTML.
- Security headers (e.g. CSP, HSTS in production) are applied.
- Failure case: the analytics script failing to load must not break the page.
- Failure case: unknown surname URLs return a proper 404 response, not a soft 404.
- Public pages must not read session or other per-user data during rendering. Doing so would make them dynamic, slower and harder to cache safely.

---

### Phase 4 — Authentication and authorisation

**Scope and key tasks**
- Customer mobile OTP login: request OTP, verify OTP, create a session, log out.
- Customer profile: view and update (fields TBC).
- Authentication for genealogists and admins (method TBC).
- Role-based and ownership-based authorisation enforced on every protected endpoint.
- Session/token management, including expiry and revocation.
- Audit logging for logins and sensitive account changes.
- Protected Next.js routes check the session without redirect chains or unnecessary extra round trips on routine navigation. The Express API still enforces authorisation on every request.

**Dependencies**
- Phase 2 authorisation helpers and frontend–API session integration.
- SMS provider account and approved OTP template (sender ID/template registration may be required, TBC).

**Acceptance criteria / exit conditions**
- A customer can sign in with mobile OTP, keep a session and sign out.
- OTPs are single-use, expire after a short period and are rate-limited.
- Every protected endpoint rejects unauthenticated and unauthorised requests, verified by automated tests.
- Customers can view and update only their own profile.
- Signing in and moving between authenticated pages causes no redirect loops or avoidable full-page reloads. The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met.

**Security and failure cases**
- OTPs are stored hashed and never logged or returned in API responses.
- Rate limits apply per mobile number and per IP for OTP requests and verification attempts. Repeated wrong attempts trigger a lockout.
- Responses do not reveal whether a mobile number is registered (prevents enumeration).
- Sessions/tokens are invalidated on logout. Cookies, if used, are HttpOnly, Secure and SameSite, with CSRF protection where applicable.
- Insecure direct object references (IDOR) are prevented. IDs in URLs are always checked against the caller's ownership or role.
- Failure case: if the SMS provider is unavailable, the user gets a clear, retryable error and the failure is logged and alerted.
- Failure case: if a session expires during navigation, the user is sent to sign-in once, with no loop. No private page content is shown from a cache.
- Frontend route protection is for user experience only. It is never treated as an authorisation control.

---

### Phase 5 — Services, orders and payments

**Scope and key tasks**
- Service and plan catalogue managed by admins. Definitions, pricing and entitlement rules are TBC.
- Order creation with server-side price calculation.
- Razorpay order creation and checkout integration.
- **Payment signature verification** on the backend for checkout callbacks.
- **Webhook endpoint** with signature verification and **idempotent processing**, so duplicate or out-of-order events do not double-grant.
- Order and payment state machine (e.g. created → pending → paid / failed). The exact states are confirmed in Phase 1/2.
- **Purchase entitlements:** granted only after verified payment, and checked by features that require a purchase. The mapping between plans and the features they unlock is TBC.
- Customer order history, paginated and indexed. Receipt/invoice requirements are TBC.
- Reconciliation for payments where the callback was missed but the webhook arrived, or the other way round.
- The Razorpay checkout script is loaded only on the routes that need it, never site-wide. Payment-status checks after checkout are bounded and do not block the interface.

**Dependencies**
- Phase 4 authentication.
- Razorpay account activation and test/live keys, webhook secret.
- Client confirmation of services, plans, pricing and entitlement rules.

**Acceptance criteria / exit conditions**
- A customer can buy a plan in Razorpay test mode. The payment is verified and the entitlement is granted exactly once.
- Replaying the same webhook event has no extra effect, verified by automated tests.
- Payloads with invalid signatures are rejected and logged.
- Failed or abandoned payments do not grant entitlements.
- Admins can see orders and payments with their current status.
- The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met for the catalogue, checkout and order-history routes.

**Security and failure cases**
- Prices and amounts always come from the server. Client-supplied amounts are ignored.
- Order creation and payment actions are never retried automatically, and double submission is prevented. This avoids duplicate orders. Performance optimisations must not weaken signature verification or idempotency.
- Razorpay key secret and webhook secret are server-only and never sent to the frontend.
- Webhooks are verified against the raw request body before any processing.
- Race condition between the callback and the webhook: processing is atomic and idempotent, using a unique event/payment reference and database transactions.
- Failure case: if the webhook is delayed or lost, a reconciliation path updates the order status.
- Failure case: if payment succeeds but entitlement granting fails, the order is flagged for admin attention and logged.
- Refunds are out of scope (D3). Refund-related webhook events, if received, are logged and not acted on automatically.

---

### Phase 6 — Family workspaces and graphical tree

**Scope and key tasks**
- Customer-owned family workspace creation and management. Whether creation requires a purchase entitlement is TBC.
- Member records: create, read, update and delete. Member fields are TBC.
- Relationships between members (relationship types TBC), with validation against impossible structures, such as a person being their own ancestor.
- Interactive family tree: view, navigate, zoom/pan, select a member.
- The tree is a Client Component loaded only on the tree route, so its code does not enlarge other routes.
- Tree and member data load in a bounded number of queries using only the fields needed, with no N+1 queries. Member lists are paginated.
- PDF export of the family tree and/or member details. Layout and branding are TBC.
- Workspace privacy enforced as owner-only by default (D1). Assigned genealogists and admins get access as defined in Phases 8 and 9.

**Dependencies**
- Phase 4 authorisation.
- Phase 5 entitlements, if workspace features are gated by purchase.
- Client confirmation of member fields, relationship types and the PDF layout.
- Expected maximum family size (TBC) for the representative performance data set.

**Acceptance criteria / exit conditions**
- A customer can create a workspace, add members and relationships, and see them in the interactive tree.
- Relationship validation rejects invalid structures with clear messages.
- The tree renders and stays usable at the agreed maximum family size (TBC). Load time and interaction responsiveness are measured with the representative data set and recorded.
- Query counts for loading the tree and member lists are checked, with no N+1 patterns.
- The PDF export produces a correct, readable document for a representative family. Its time and memory use are measured.
- Another customer cannot access the workspace, verified by automated tests.
- The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met.

**Security and failure cases**
- Every workspace, member and relationship query is scoped to authorised users (no IDOR).
- Input validation and output encoding for all member text fields.
- PDF generation is bounded by size and time limits so a single export cannot exhaust the single-vCPU server. Exports run with limited in-process concurrency so they do not block ordinary API requests. A separate queue service is added only if measurements justify it, through change control.
- Generated PDFs are served through authorised access only, never through public URLs.
- Failure case: if a member with relationships is deleted, the relationship data stays consistent. Deletion behaviour (cascade vs block) is TBC.

---

### Phase 7 — Media, voice and text-to-speech

**Scope and key tasks**
- Private upload, storage, viewing and download of photographs, PDFs and documents, linked to a family or member (exact linkage TBC).
- Voice record upload and/or in-browser recording (TBC) and playback.
- Text-to-speech generation (provider, languages and voices TBC), with generated audio stored through the storage abstraction.
- All files are stored through the Phase 2 storage abstraction on VPS NVMe.
- File type allow-list, size limits, per-customer/workspace quotas and image handling such as thumbnails (TBC).
- Authorised file delivery through short-lived or access-checked URLs.
- **Efficient delivery:**
  - files are streamed, not loaded fully into memory
  - audio playback supports seeking (range requests)
  - galleries use thumbnails (if confirmed), are paginated or lazy-loaded, and reserve space to avoid layout shift
- Uploads and TTS generation have timeouts and limited concurrency, so they do not block ordinary requests.

**Dependencies**
- Phase 2 storage abstraction.
- Phase 6 workspaces and members.
- TTS provider account and confirmation of languages.
- Confirmation of allowed file types, size limits and quotas. These must fit within the shared 50 GB disk.

**Acceptance criteria / exit conditions**
- Authorised users can upload, list, view and download private files. Unauthorised users cannot, including by guessing URLs.
- Disallowed file types and oversized files are rejected server-side.
- Quotas are enforced, and admins can see storage usage.
- Voice records play back correctly in the supported browsers.
- TTS produces audio for the agreed languages and stores it privately.
- Switching the storage implementation needs no changes to feature code (shown by interface tests).
- Memory use during large uploads, downloads and TTS generation is measured and stays bounded. The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met for the media routes.

**Security and failure cases**
- Files are validated by content type/signature, not only by extension. Stored filenames are generated server-side.
- Media is never served from a public directory. Access is checked on every request.
- Private images are never passed through a shared or public image-optimisation cache. Any resizing or optimisation of private media keeps the same access checks.
- Image metadata (e.g. EXIF location) is stripped. Whether to do this is TBC.
- Malware scanning for uploads is TBC. It is not in the approved scope and needs a decision.
- Upload size and concurrency limits protect the 1 vCPU / 4 GB server from exhaustion.
- Failure case: if the disk is nearly full, uploads are rejected gracefully before the disk fills, and an alert is raised (Phase 10 monitoring).
- Failure case: if the TTS provider fails or times out, the user sees a retryable error and no partial file is stored.
- Failure case: if an upload is interrupted, the database record and the file never get out of sync (no orphaned records or files).

---

### Phase 8 — Genealogist portal and research

**Scope and key tasks**
- Genealogist/Vahivancha portal with its own sign-in (method from Phase 4).
- Access only to families assigned by an admin (D2). Assignment scope (whole family vs specific parts) is TBC.
- Research records: create and update on assigned families. Fields and attachments are TBC.
- Research reports with an approval workflow: draft → submitted → approved/released (or returned). The exact states and approver role are TBC. Only released reports are visible to and downloadable by customers (D4).
- Whether genealogists can edit customer member records or only add research is TBC.
- Audit trail of genealogist actions.
- Assigned-family and research lists are paginated, with indexes that support assignment-scoped queries. Report files are streamed.

**Dependencies**
- Phase 4 authorisation, Phase 6 workspaces, Phase 7 storage (for report files and attachments).
- Admin assignment management (built here and surfaced in Phase 9).
- Client confirmation of the research record fields, report format and approval workflow.

**Acceptance criteria / exit conditions**
- A genealogist sees only assigned families. Removing the assignment removes access immediately.
- Customers cannot view or download a report before it is released, including through direct file URLs.
- A released report is visible to the owning customer.
- All genealogist create/update actions are audit-logged.
- The phase gate in [Section 12](#12-performance-and-navigation-requirements) is met for the portal routes, using representative data volumes.

**Security and failure cases**
- Assignment checks run on every request, not only at sign-in.
- Unreleased report files are protected at the file-delivery layer as well as the API.
- Customer notification of a released report is sent only after the release succeeds (Phase 9).
- Failure case: if a report is released and then withdrawn (whether this is allowed is TBC), customer access is revoked consistently.
- Failure case: if two genealogists are assigned to one family (whether this is allowed is TBC), concurrent edits do not silently overwrite each other.

---

### Phase 9 — Admin panel and notifications

**Scope and key tasks**
- Admin management for:
  - **Customers:** view, search, status changes (actions TBC)
  - **Genealogists:** create, deactivate, manage assignments
  - **Families:** view, assign genealogists
  - **Services and plans:** create, update, activate/deactivate
  - **Orders and payments:** view, filter, reconciliation status
  - **Enquiries:** view and follow-up status
  - **Research:** review and approve/release reports
- Admin roles: a single admin role, or several admin roles, is TBC.
- Configurable SMS and email notifications: event list, templates, enable/disable per event (events TBC).
- Notification delivery log with status, and retry for transient failures.
- Admin audit log view (scope TBC).
- Admin tables use server-side pagination, filtering and search backed by indexes, with no N+1 queries and only the fields each table needs.
- Notifications are sent in-process, outside the user's request. A separate queue service is not assumed (see [Section 12](#12-performance-and-navigation-requirements)).

**Dependencies**
- Phases 3–8, whose data the admin panel manages.
- SMS and email provider accounts, sender registration and approved templates.

**Acceptance criteria / exit conditions**
- An admin can perform every in-scope management task without database access.
- Notification templates and event toggles can be changed by admins without a code change.
- Notifications are sent for the configured events, and failures are logged and retried.
- Non-admin users cannot reach any admin endpoint, verified by automated tests.
- Admin list routes stay responsive with representative data volumes (TBC). Results are recorded, and the phase gate in [Section 12](#12-performance-and-navigation-requirements) is met.

**Security and failure cases**
- Admin access requires stronger protection. Additional measures, such as 2FA or an IP allow-list, are TBC.
- All admin changes to sensitive data (assignments, report release, service pricing, customer status) are audit-logged.
- Template variables are escaped to prevent injection into emails or SMS.
- Notification sending is decoupled from the main request, so a provider outage does not fail the user's action.
- Unsubscribe/opt-out requirements for non-transactional messages are TBC.
- Failure case: when the provider rate-limits or is down, messages are retried with backoff and marked failed after a set number of attempts.

---

### Phase 10 — QA, deployment and handover

**Scope and key tasks**
- **Testing:**
  - unit and integration tests for critical paths: auth, payments, entitlements, authorisation, report release
  - end-to-end tests for the main customer, genealogist and admin journeys
  - an authorisation test matrix covering every role and resource
- **Performance regression and VPS checks** (details in [Section 12](#12-performance-and-navigation-requirements)):
  - re-run the production-build checks for the critical journeys and compare them with the recorded baselines
  - check internal navigation for full-document reloads, duplicate requests, layout remounts, console errors and layout shift
  - record lab Core Web Vitals for representative public pages
  - run a basic load test on the actual Hostinger VPS, covering both Node.js processes and PostgreSQL, within the agreed scope
  - document bottlenecks, limitations and any recommendations, with their scope and cost
- **Security review:** dependency audit, configuration review, header checks, secret handling, and checks for common web vulnerabilities (OWASP Top 10).
- **Production setup on the Hostinger VPS:**
  - OS hardening, firewall, SSH key access
  - reverse proxy and TLS certificate
  - process manager for the Next.js server and the Express API, with restart on crash
  - PostgreSQL with restricted access
  - environment configuration
- **Backups:**
  - automated database and media backups
  - off-server backup copy (target TBC; the shared 50 GB disk is not enough on its own)
  - a tested restore procedure
- **Monitoring:**
  - uptime checks
  - disk, CPU and memory alerts, with the disk alert set well before the 50 GB is full
  - error logging and log rotation
  - process restarts, API error rates and response latency
  - tools: free/self-hosted or client-approved (TBC). Paid monitoring is not assumed.
- Switch Razorpay to live keys, register the production webhook URL and run a controlled live test transaction.
- Production DNS, domain and email sending configuration (SPF/DKIM).
- **Handover:** credentials transfer, deployment and operations notes, admin user guide. The handover document format is TBC.
- Launch, followed by **30-day post-launch bug-fix support**.

**Dependencies**
- All feature phases complete and accepted locally.
- Hostinger VPS access, domain/DNS access, live Razorpay keys, production SMS/email/TTS credentials.
- Off-server backup destination (TBC).

**Acceptance criteria / exit conditions**
- All critical-path tests pass. No open critical or high-severity defects.
- The production deployment is reproducible from documented steps.
- A backup has been successfully restored in a test.
- Monitoring and alerts are active and have been triggered in a test.
- The live payment test completes end-to-end, including webhook processing.
- Performance results are documented: production-build results compared with baselines, lab Core Web Vitals for representative public pages, and the VPS load test. No target is reported as met without a measurement. Missed targets are listed, with options for the client to decide on.
- Critical journeys show no avoidable full-page reloads, duplicate requests or uncaught JavaScript errors.
- The client signs off the launch, and the 30-day support period starts on the agreed launch date.

**Security and failure cases**
- Only ports 80/443 and SSH (key-only) are open publicly. The database is not exposed.
- Production secrets differ from development secrets and are stored only on the server.
- Dependencies are audited for known vulnerabilities before launch.
- Failure case: disk exhaustion on the shared 50 GB NVMe. Mitigations are quotas, log rotation, backup pruning and alerts.
- Failure case: memory pressure on 4 GB RAM, which is now shared by two Node.js processes and PostgreSQL. Mitigations are memory limits for each process, tuned PostgreSQL settings, limited concurrency for PDF/TTS jobs, and process restart on crash.
- Failure case: a failed deployment. There is a rollback procedure, and database migrations are reviewed for safety before running.
- 30-day support covers defects in delivered scope. New features or changes follow [change control](#10-change-control).

---

## 7. Cross-phase dependencies

| Dependency | Required by | Notes |
|---|---|---|
| Phase 1 sign-off (scope, roles, permission matrix) | All phases | Blocks schema and authorisation design. |
| Phase 2 foundation (validation, errors, logging, authz helpers) | Phases 3–10 | Every feature builds on it. |
| Storage abstraction (Phase 2) | Phases 6, 7, 8 | PDF exports, media, TTS audio and report files. |
| Provider interfaces (Phase 2) | Phases 4, 7, 9 | SMS (OTP and notifications), email, TTS. |
| Authentication and authorisation (Phase 4) | Phases 5–9 | All protected features. |
| Orders and entitlements (Phase 5) | Phases 6, 7, 8 (where gated) | Which features are gated is TBC. |
| Family workspaces (Phase 6) | Phases 7, 8, 9 | Media, research and admin family views depend on it. |
| Research and report release (Phase 8) | Phase 9 | Admin approval and release notifications. |
| Notification engine (Phase 9) | Phases 3, 5, 8 events | Events are wired as each module is completed. |
| Next.js foundation: layouts, rendering/caching strategy, API client (Phase 2) | Phases 3–9 | All interfaces build on the shared layouts and navigation. |
| Frontend–API session integration (Phase 2) | Phases 4–9 | Server-rendered authenticated pages depend on it. |
| Performance test profile, results record and first baseline (Phase 2) | Phases 3–10 | Each phase gate compares against it. Phase 10 regression testing depends on the recorded baselines. |
| Representative data volumes (Phase 1, TBC) | Phases 6, 8, 9, 10 | Needed for tree, list and load testing. Documented assumptions are used until confirmed. |
| All features accepted locally | Phase 10 | Production setup starts after local acceptance (D6). |

**External dependencies**

| External dependency | Needed by | Owner |
|---|---|---|
| Razorpay account activation, test and live keys | Phase 5 (test), Phase 10 (live) | Client |
| SMS provider, sender ID and template approval | Phase 4 (OTP), Phase 9 | Client (provider TBC) |
| Email provider and sending domain | Phase 9, Phase 10 | Client (provider TBC) |
| TTS provider account | Phase 7 | Client (provider TBC) |
| Analytics account | Phase 3 | Client (tool TBC) |
| Surname page content, branding, legal content | Phase 3 | Client |
| Hostinger VPS, domain and DNS access | Phase 10 | Client |
| Off-server backup destination | Phase 10 | TBC |

---

## 8. Delivery checkpoints

Each checkpoint ends with a client review. The next dependent phase starts once the checkpoint is accepted or its open items are logged. From CP2 onwards, each review includes that phase's recorded performance results (see [Section 12](#12-performance-and-navigation-requirements)).

| Checkpoint | After phase | What is reviewed | Indicative timing |
|---|---|---|---|
| CP1 — Scope locked | 1 | Signed scope, permission matrix, TBC resolutions, confirmed timeline, representative data volumes or documented assumptions | End of Week 1 |
| CP2 — Foundation ready | 2 | Local setup, Next.js foundation and shared layouts, schema draft, storage and provider abstractions, rendering/caching strategy, performance test profile and first baseline | Week 2 |
| CP3 — Public site and login | 3, 4 | Public pages, 25 surname pages (initial HTML, metadata, sitemap, 404s), enquiries, analytics, OTP login, lab Core Web Vitals for representative public pages | Week 3 |
| CP4 — Commerce | 5 | Test-mode purchase, verified payment, webhook idempotency, entitlements, checkout navigation results | Week 5 |
| CP5 — Family core | 6, 7 | Workspaces, tree, PDF export, private media, voice, TTS; tree and media measurements with representative data | Week 7 |
| CP6 — Portal and admin | 8, 9 | Genealogist portal, report approval, admin panel, notifications; list and query performance results | Week 9 |
| CP7 — Launch readiness | 10 | Test results, performance regression results, VPS load test, security review, VPS setup, backup restore test, monitoring | Week 10 |
| CP8 — Support close | +30 days | Closure of the 30-day bug-fix support period | Launch + 30 days |

---

## 9. Unconfirmed requirements (TBC)

These items need a client decision. None of them has been assumed into scope. Each must be resolved, or given an owner and date, at CP1.

### Public website and SEO
1. Full list of public pages beyond the 25 surname pages.
2. The 25 surnames and the source/ownership of their page content.
3. Website language(s).
4. Enquiry form fields and the anti-spam method.
5. Analytics tool, and whether cookie/consent handling is required.
6. Browser and device support matrix.
7. Legal pages (privacy policy, terms): content provider.

### Authentication and accounts
8. Customer profile fields.
9. Sign-in method for genealogists and admins.
10. Account deletion and data deletion/retention policy.
11. Whether a separate staging environment is required. Without one, API performance targets are measured locally with representative data and checked by the Phase 10 VPS load test.

### Services, orders and payments
12. Service and plan definitions, pricing and taxes.
13. Whether plans are one-time purchases, time-limited or recurring.
14. Mapping of plans to entitlements, i.e. which features each plan unlocks.
15. Receipt/invoice requirements.
16. The manual process for refund requests while refunds are out of scope (D3).

### Family workspaces and tree
17. Member record fields.
18. Supported relationship types.
19. Expected maximum family size the tree must handle.
20. PDF export content, layout and branding.
21. Behaviour when a member with relationships is deleted.
22. Whether a customer can share a workspace with other people. Workspaces are private by default (D1); sharing is not in the approved scope.

### Media, voice and TTS
23. Allowed file types, maximum file sizes and per-customer/workspace storage quotas.
24. Voice records: upload only, in-browser recording, or both, plus the maximum duration.
25. TTS provider, languages and voices.
26. Whether image metadata (e.g. EXIF location) should be stripped.
27. Whether malware scanning of uploads is required.

### Genealogist portal and research
28. Assignment scope (whole family or specific parts).
29. Whether multiple genealogists can be assigned to one family.
30. Whether genealogists can edit customer member records or only add research.
31. Research record fields and report format.
32. Approval workflow: states, approver role, and whether released reports can be withdrawn.

### Admin and notifications
33. A single admin role or multiple admin roles/permissions.
34. Admin account protection (e.g. 2FA, IP allow-list).
35. Customer status actions available to admins (e.g. suspend).
36. The list of notification events, channels per event, and template content.
37. SMS and email providers, sender IDs and template registration.
38. Opt-out requirements for non-transactional messages.

### Operations and handover
39. Off-server backup destination, frequency and retention period.
40. Monitoring/alerting tool and who receives alerts, including production performance monitoring. Paid tools need client approval.
41. Domain, DNS and email sending domain ownership.
42. Handover documentation format and training expectations.
43. Whether any existing family/customer data must be migrated in.
44. Support hours and response expectations during the 30-day bug-fix period.

### Accessibility

45. Target accessibility level (e.g. a specific WCAG level), if any. Accessibility is preserved in every case.

### Performance (engineering clarifications)

These are engineering clarifications from [`PERFORMANCE-AND-NAVIGATION-STANDARDS.md`](PERFORMANCE-AND-NAVIGATION-STANDARDS.md). They are not new client-facing features.

46. Whether the proposed 300 ms warm-navigation target is accepted, and which test profile defines p75 (device, network, browser, cache state).
47. Performance measurement tools for development and lab testing (e.g. Lighthouse or equivalent), and whether real-user Core Web Vitals will be collected after launch.
48. Representative data volumes for research lists and admin tables. Family tree size is item 19.

---

## 10. Change control

1. **Request:** any addition to or change of the approved scope, confirmed decisions or resolved TBC items is submitted in writing.
2. **Assess:** the impact on scope, timeline, VPS capacity and cost is assessed and shared with the client.
3. **Approve:** work starts only after written client approval. Approved changes are recorded in this roadmap under a change log.
4. **Schedule:** approved changes are slotted into a phase or deferred to a later release. The delivery window is adjusted where needed.
5. **Not change requests:** defects in delivered scope, which are fixed under normal QA or the 30-day support.
6. **Change requests:** items already listed as excluded, such as refund processing and object-storage migration, need this process to be brought in.
7. **Late TBC decisions:** a TBC decision made after its target date may change the timeline. Its impact is recorded the same way.

### Change log

| # | Date | Change | Requested by | Impact | Status |
|---|---|---|---|---|---|
| 1 | 2026-10-21 | **Frontend confirmed as Next.js** (React-based, TypeScript where appropriate) for the public website, the surname pages and the customer, genealogist and admin interfaces, replacing "React.js". **Performance and navigation requirements added** as cross-cutting acceptance criteria ([Section 12](#12-performance-and-navigation-requirements)), based on `PERFORMANCE-AND-NAVIGATION-STANDARDS.md`. | Project owner | No change to approved scope, exclusions, pricing or the 8–10 week window. Adds performance tasks and gates within existing phases. Production runs two Node.js processes on the same VPS, so memory is measured. No new infrastructure. New TBC items 45–48. | Recorded — pending client review |

---

## 11. Cross-cutting standards

These apply to every phase. They are part of the approved scope (item 10).

- **Validation:** all input is validated server-side against explicit schemas. Client-side validation is for usability only.
- **Authorisation:** deny by default. Every endpoint checks role and ownership/assignment. Authorisation tests are maintained per role and resource.
- **Security:**
  - HTTPS in production and security headers
  - rate limiting on public and auth endpoints
  - parameterised queries through Prisma
  - output encoding
  - secrets kept out of the repository
  - dependency auditing
- **Privacy:** customer family data, media and unreleased reports are private by default and are never exposed through public URLs.
- **Auditability:** sensitive actions (authentication, payments, assignments, report release, admin changes) are logged with actor and timestamp.
- **Resilience:** third-party failures (Razorpay, SMS, email, TTS) are handled gracefully, logged and retried where safe.
- **Resource awareness:** design decisions respect the 1 vCPU / 4 GB RAM / 50 GB shared NVMe limits, especially for PDF generation, TTS, uploads and backups.
- **Performance and navigation:**
  - client-side internal navigation with stable shared layouts
  - minimal client JavaScript
  - safe caching, with pagination and indexed queries
  - measured results at every phase gate
  - see [Section 12](#12-performance-and-navigation-requirements)
- **Testing:** each phase leaves automated tests for its critical paths. Phase 10 runs the full regression, including performance regression against the recorded baselines.
- **Portability:** storage and messaging/TTS providers are accessed through interfaces to allow future migration without feature rewrites.

---

## 12. Performance and navigation requirements

The detailed specification is [`docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md`](PERFORMANCE-AND-NAVIGATION-STANDARDS.md). This section summarises what the roadmap requires and how it is accepted. Where the two documents differ, the standards document gives the detail, and this roadmap governs scope, infrastructure and cost.

Performance is a cross-cutting requirement for every phase that delivers user-facing routes or APIs (Phases 2–10). It is not postponed until launch. Choosing Next.js alone is not treated as evidence of performance.

### Required practices

| Area | Requirement | Main phases |
|---|---|---|
| Navigation | Client-side navigation between internal routes, without avoidable full-page reloads. Normal browser behaviour (new tab, back/forward, keyboard, focus) is preserved. No redirect chains on routine navigation. | 2–9 |
| Layouts | Shared layouts and navigation stay mounted and stable across navigation. | 2–9 |
| JavaScript | Route-level code splitting and minimal client JavaScript. Large components, such as the family tree and checkout, load only where needed. Bundle size is reviewed. | 2, 3, 5, 6 |
| Rendering | Server Components by default, Client Components only where needed. Static generation for public and surname pages; per-request rendering for private pages. | 2, 3, 4–9 |
| Assets | Optimised, correctly sized public images. The main image is not lazy-loaded; below-the-fold media is. Efficient font loading, reserved dimensions to avoid layout shift, and deferred non-essential scripts. | 3, 7 |
| Data fetching | Only the data each view needs. Independent requests run in parallel and duplicate requests are removed. Caching is explicit and safe: public content only, never private data. API requests have timeouts and cancellation, and non-idempotent writes are never retried automatically. | 2–9 |
| Database | Pagination and limits on lists and exports, suitable indexes, no N+1 queries, only the required fields, one shared PrismaClient per process, and slow-query inspection. | 2, 5–9 |
| Expensive work | Limited concurrency, timeouts and memory limits for PDF generation, TTS, uploads and large file transfers, so they do not block ordinary requests. | 6, 7, 10 |
| Loading states | Immediate, accessible feedback on navigation. No blank or frozen screens. Slow or failed requests are handled gracefully. Loading indicators never hide consistently slow requests. | 2–9 |
| Testing | Production-build testing during development, a baseline per phase, and regression testing before release. | 2–10 |
| Monitoring and load | CPU, memory, disk, process restarts, API errors and latency are monitored. A basic load test runs on the actual 1 vCPU / 4 GB / 50 GB shared NVMe VPS. | 10 |

### Proposed targets

> **These are proposed targets, not guaranteed results.** They need measurement and confirmation (TBC items 46–48). Instant navigation is not guaranteed on every device or network, and third-party provider latency is reported separately. A target is reported as met only when a recorded measurement supports it.

| Metric / scenario | Proposed target | Measurement basis |
|---|---|---|
| Largest Contentful Paint (LCP) | ≤ 2.5 s | p75 field data when available; lab tests as an early warning until then |
| Interaction to Next Paint (INP) | ≤ 200 ms | p75 field data when available; lab proxy until then |
| Cumulative Layout Shift (CLS) | ≤ 0.1 | p75 field data when available; lab tests until then |
| Warm-cache internal navigation between ordinary pages | Main content usable within 300 ms at p75 | Agreed test profile (TBC item 46) |
| Navigation that needs network/API work | Immediate feedback; the available shell/content renders without waiting for unrelated work | Production-build manual and automated checks |
| Typical indexed API read | ≤ 300 ms server response at p75 | Local tests with representative data (staging is TBC item 11); checked on the VPS in Phase 10 |
| Route change | No unintended full reload, lost shared-layout state or duplicate requests for the same data | Browser tooling and automated checks |
| JavaScript errors | No uncaught errors in the tested critical journeys | Browser console during tests |

Every measurement records the device, network profile, browser, route, cache state (warm or cold) and build type. Development-server timings are not acceptance evidence.

### Phase gate (applies to Phases 2–9)

A phase is accepted only when all of the following hold for its routes, in the production build:
- No avoidable full-page reload on routine internal navigation.
- No blank or frozen state during route transitions.
- No duplicate requests or repeated expensive work, unless there is a documented reason.
- No critical console errors in the tested journeys.
- Performance regressions introduced by the phase are investigated, then fixed or explicitly documented and approved.
- Public SEO pages still deliver meaningful initial HTML and keep their SEO requirements.
- Results are recorded in the performance results record against the baseline.

### Launch gate (Phase 10)

- Production-build performance tests are run for the critical journeys and compared with the baselines.
- Lab Core Web Vitals are recorded for representative public pages.
- A basic VPS load test is run, and its bottlenecks and limitations are documented.
- Monitoring for errors and server resource pressure is confirmed to be working.

### Infrastructure and scope controls

- Redis, a queue service, a CDN, paid monitoring, extra hosting or any other new infrastructure is **not** added automatically. One is recommended only when measurements justify it, with its scope, cost and timeline impact documented and approved through [change control](#10-change-control).
- If a target cannot reasonably be met on the agreed VPS, the measured bottleneck is documented and options are proposed. Cost or infrastructure is never added silently.
- Performance work never weakens privacy, authorisation, SEO, accessibility or payment security. Private data is never cached in a way that could expose it to another user, and frontend caching is never used as a security control.
