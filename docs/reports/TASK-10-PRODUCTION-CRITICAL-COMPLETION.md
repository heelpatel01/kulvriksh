# TASK-10 — Production-Critical Backend Completion

Date: 2026-10-25. Starting point: HEAD `af44621` with the uncommitted work of TASK-05 to TASK-09; all of it is preserved. **Nothing was committed, pushed, staged, stashed, reset or discarded.**

## 1. Implemented features and files

| Area | What now works | Main files |
|---|---|---|
| Staff account lifecycle | Admins create staff accounts with **no password**: the person sets one through a one-time link. Admin-issued reset, self-service reset request, password change, deactivation and reactivation | `apps/api/src/staff/{staff-lifecycle-store,staff-service,staff-routes,staff-delivery}.ts`, `apps/web/app/admin/staff/*`, `app/(public)/staff/{setup,reset}/*` |
| Second factor (TOTP) | Enrolment, sign-in code step, replay protection, attempt limit, admin reset of a lost factor, and a policy setting (`STAFF_MFA`). Built on `node:crypto`, verified against the RFC 6238 test vectors | `staff/totp.ts`, `components/portal/staff-account.tsx`, `app/{admin,genealogist}/account/page.tsx` |
| Production bootstrap | `npm run bootstrap:admin -- --email … --name … --confirm` creates the **first** admin with a one-time setup link (1 hour) | `src/tools/bootstrap-admin.ts` |
| Notifications | An in-app notification is written **in the release transaction**. Customers get a list, an unread count, mark-read and mark-all-read. An email/SMS outbox dispatcher with leases sits behind a provider interface; no provider is configured | `src/notifications/*`, `app/dashboard/notifications/*` |
| Files | Storage abstraction plus a **local private-disk adapter**. Customer media (photo, PDF, voice). Report PDFs for genealogists, which customers can download only after release. Cleanup of abandoned uploads | `src/storage/*`, `src/files/*`, `app/api/files/**`, `app/dashboard/media/*` |
| Member search and relationships | Trigram index for name search. Relationship rules table (symmetric or ancestry) drives canonical ordering and the cycle check | `family/family-validation.ts`, `family/family-store.ts` |
| Cleanup | `npm run db:cleanup` now also removes expired staff tokens, abandoned temporary uploads, and files whose byte removal failed earlier | `maintenance/cleanup.ts`, `tools/cleanup.ts` |

**Bug found and fixed:** the drift check showed that Prisma would have dropped the trigram index in a future generated migration. It is now declared in the schema, and the re-check is clean.

## 2. Migration `20261025074814_staff_lifecycle_notifications_files`

**New tables:**
- `staff_token`: one-time links and MFA challenges. Only a SHA-256 hash is stored, and at most one open token exists per user and purpose.
- `staff_mfa`: TOTP secret, AES-256-GCM encrypted, plus the last used time step.
- `notification`: dedupe key unique; checks that keep channel, address, read state and lease consistent; partial indexes for unread items, dispatch-due items and lease expiry.
- `notification_attempt`.
- `stored_file`: size, checksum, key, backend and content-type checks; a pending-deletion index.
- `media_item`: composite foreign key to `stored_file(id, workspace_id)`.

**Changes to existing tables:**
- `report.report_file_id`: composite foreign key to the same workspace's file.
- `staff_credential.password_hash` is now nullable, so new accounts can exist before the person sets a password.
- `member`: the `pg_trgm` GIN index.

**Permissions and integrity:**
- The runtime role is still INSERT and SELECT only on `audit_event`; verified on both databases.
- The migration was applied to the dev and test databases with `npm run db:migrate`.
- Nothing was dropped or reset, and no existing data changed.

**Data-model deviations (documented, reversible):**
- Templates are defined in code (version 1) instead of the `notification_template` table. That table waits for R36.
- An `in_app` channel was added to the outbox model for the customer inbox.
- Media items link to the workspace only (FQ-9 option a).

## 3. Endpoints (under `/api/v1`) and screens on real data

**Staff (public, rate-limited, generic answers):**
- `POST /staff/auth/sign-in`, which returns a session, or `{mfa: required | enrolment_required, challengeToken}`
- `POST /staff/auth/mfa`
- `POST /staff/auth/mfa/enrol/start`, `POST /staff/auth/mfa/enrol/confirm`
- `POST /staff/auth/password/complete`
- `POST /staff/auth/password/reset-request`

**Staff, signed in:**
- `POST /staff/me/password`
- `GET /staff/me/mfa`
- `POST /staff/me/mfa/start`, `POST /staff/me/mfa/confirm`, `POST /staff/me/mfa/disable`

**Admin:**
- `GET`, `POST /admin/staff`
- `POST /admin/staff/:id/password-link`, `POST /admin/staff/:id/deactivate`, `POST /admin/staff/:id/reactivate`, `POST /admin/staff/:id/mfa/reset`
- `GET /admin/reports/:id/file`

**Customer:**
- `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read-all`, `POST /notifications/:id/read`
- `GET`, `POST /family/media`; `GET /family/media/:id/content`; `DELETE /family/media/:id`
- `GET /reports/:id/file`

**Genealogist:**
- `GET`, `POST /genealogist/cases/:workspaceId/reports/:id/file`

**Development only:** `GET /dev/staff-outbox`, under the same guards as the OTP outbox.

**Unchanged:** all TASK-07 to TASK-09 contracts. `ReportView` only gained a `file` field.

**Screens on real data:**

| Screen | What is real |
|---|---|
| `/staff/sign-in` | Code step and forced enrolment |
| `/staff/setup` | The token is read from the URL fragment and removed from the address bar |
| `/staff/reset` | |
| `/admin/staff` | |
| `/admin/account`, `/genealogist/account` | |
| `/dashboard/notifications`, plus the unread count in the navigation | |
| `/dashboard/media` | Replaces the sample screen |
| Report PDF controls | In the genealogist case screen, the admin review dialog and the customer research page |

**How the browser reaches files:** only through same-origin Next.js route handlers (`/api/files/**`). Uploads must pass a same-origin check, as CSRF protection.

## 4. Security controls and tests

**Staff accounts:**
- **No default passwords:** an account is unusable until its single-use link is completed. Links expire: 72 h for setup, 1 h for reset and for the bootstrap.
- **Reset:** an admin-issued reset immediately clears the password and revokes every session.
- **Privilege escalation:**
  - no route changes a role
  - unknown fields such as `permissions` are rejected
  - admins never act on themselves
  - creating or managing other admins needs `STAFF_ADMINS_MAY_MANAGE_ADMINS=true` (R33; off by default)
- **TOTP:**
  - secrets are encrypted at rest
  - each code works once (time-step replay check)
  - five attempts per challenge
  - with `required_admins`, a password alone never yields an admin session, and the factor cannot be turned off
- **What is never logged or audited:** passwords, hashes, tokens, codes and full numbers. A log scan of the browser runs found none.

**Files:**
- The type is detected from the content signature; a disguised executable or HTML file returns 422.
- Size limits are enforced while streaming (413), and the per-family quota is re-checked under a row lock.
- Keys are server-generated, and paths are confined to the store.
- Responses are `private, no-store`, `nosniff` and CSP `sandbox`.
- Every download re-checks access. Customers get 404 for an unreleased report's file; unassigned genealogists get 404.

**Notifications:**
- written in the triggering transaction (rollback test)
- deduplicated (repeated and concurrent releases produce one record)
- recipient-only (another customer's ID returns 404)
- no report content beyond the released title
- dispatcher completion fenced by the lease; `SKIP LOCKED` prevents double sends

## 5. Test results (actual)

| Command or suite | Result |
|---|---|
| `npm run check` | **Exit 0.** API 195 tests: 118 pass, 0 fail, 77 database tests skipped by design. Web 10 of 10 |
| `npm run test:db` | **77 of 77 pass.** New this task: staff lifecycle 11, notifications 9, files 7. Earlier: auth 18, services 7, family 13, research 11, cleanup 1 |
| Browser: TASK-10 flow | **10 of 10** |
| Browser: TASK-09 flow (regression) | **15 of 15** |
| Browser: TASK-08 sign-in (regression) | **12 of 12** |
| Browser: public services (regression) | **4 of 4** |
| Schema drift check | Empty |
| Database cleanliness | Both databases (22 tables each) have 0 rows. No stored files remain |
| Secret scan | 0 secrets in 269 tracked and untracked files |

The TASK-10 browser flow covered:
- a customer uploads, views and deletes a photo; a disguised `.jpg` is refused
- an admin creates a genealogist, and the setup link is shown once
- the admin enrols TOTP, and the next sign-in needs a code
- the genealogist sets a password from the link (reusing the link is refused), attaches a PDF and submits
- the admin downloads the PDF and releases the report
- the customer sees "Notifications (1)", downloads the PDF and marks all read
- anonymous file access gets 401; a cross-site upload gets 403

**Failures found and fixed during the work:**
- The dev `.env` had no `STAFF_MFA_KEY`, so TOTP was unavailable. `db:secrets` now adds it, and the account page says when TOTP is unavailable.
- The drift issue in §1.
- Three test-only issues, fixed in the tests:
  - a missing `tmp` directory after a refusal based on the declared size
  - re-navigation to the same URL with only a fragment does not reload the page
  - test order: the services test must run before an admin's TOTP enrolment

## 6. Outstanding production dependencies and decisions

| Item | Status | Minimum decision or credential needed |
|---|---|---|
| **R34: admin second factor** | Implemented, but **not enforced by default** (`STAFF_MFA=optional`). The API logs a warning at startup | Confirm TOTP, then set `STAFF_MFA=required_admins` (or `required_all`) and `STAFF_MFA_KEY` in production. This is not complete until that is set |
| **R9/R37: email delivery** for staff links and reset requests | Links are shown once to the issuing admin. The self-service reset request delivers nothing without a provider | Choose an email provider and add credentials; implement `StaffMessageSender` |
| **R36/R37: notification events, channels and providers** | Only "report released → in-app" exists | Confirm events, channels and wording. SMS/email need a provider (`NotificationSender`) and a scheduler for the dispatcher |
| **R33: admin roles** | Admins cannot manage admins unless the setting is enabled | Decide whether admins may create and deactivate other admins |
| **Object storage** | Local private disk only. Production needs `STORAGE_LOCAL_DIR` on persistent, backed-up disk, or uploads answer 503 | Choose a cloud provider and add credentials, then add an adapter (interface ready) |
| R23/R24: media formats, sizes, quota | Provisional settings (20 MB per file, 25 MB per report, 1 GB per family) | Confirm limits and the allowed types |
| R31: report format | Text plus an optional PDF | Confirm |
| FQ-9: media linked to people | Workspace only | Decide |
| R17/R18: member fields and relationship types | Unchanged: a name only; `parent_of` and `spouse_of`. Adding a type is now one rules entry plus a CHECK constraint | Decide the fields and types |
| R27: malware scanning of uploads | Not done; only type signatures are checked | Decide whether scanning is required |
| Bootstrap race | Two simultaneous bootstrap runs could each create an admin | Operational rule: run once. A database lock can be added if needed |

## 7. Still mocked (labelled "Sample data")

- **Customer area:** plans and payments.
- **Admin area:**
  - overview
  - customers
  - surname pages
  - plans
  - transactions
  - notification templates
  - roles and access
  - integration list on the settings page
- **Genealogist area:** profile and availability.
- **Not built:** text-to-speech, PDF export of the tree, thumbnails.

## 8. Ranked next tasks

1. **Before production staff use:**
   - set the R34 policy (`STAFF_MFA=required_admins` plus key)
   - connect an email provider for staff links
   - deploy storage on durable disk, or add a cloud adapter
2. **Orders, payments and entitlements (R12–R14, Razorpay test mode).** This also gates research and workspace features.
3. **Notification provider and scheduler:** run `dispatchOnce` and `recoverExpiredLeases` on a timer; confirm the event list (R36).
4. **Admin customer management and account states (R35, R10).**
5. **Member fields (R17), media-to-member links (FQ-9), thumbnails (FQ-22).**
6. **Tree PDF export, then text-to-speech (M10).**
7. **Audit retention and view scope (FQ-13, DQ-7).**

## 9. Git status

- Branch `main`, HEAD `af44621`. Nothing staged, committed or pushed. 64 entries in `git status`, including this report.
- All prior uncommitted work is intact. The only edits to earlier files are extensions listed in §1–§3.
- **New in this task:**
  - API modules: `apps/api/src/{notifications,storage,files}/`, `src/staff/{totp,staff-lifecycle-store,staff-delivery}.ts`, `src/tools/bootstrap-admin.ts`
  - API tests: `src/task10.test.ts`, three new `*.db.test.ts` files
  - the migration above
  - web: `app/api/files/**`, `app/(public)/staff/{setup,reset}/`, `app/admin/{staff,account}/`, `app/genealogist/account/`, `app/dashboard/notifications/`, `app/dashboard/media/media-library.tsx`, `lib/api/{files,origin}.ts`, `lib/actions/staff-account.ts`, `components/portal/staff-account.tsx`
  - this report
- **Changed:**
  - schema, config, app and server wiring
  - staff service and routes, research store (release → notification), family validation and store, cleanup
  - shared types
  - staff sign-in page, admin and genealogist navigation, case workspace, admin review, customer research and media pages, dashboard layout
  - `scripts/local-db.mjs` (adds `STAFF_MFA_KEY`), `.env.example`, `README.md`, `package.json` scripts
- **Removed (replaced by real screens):** the sample media view (created in TASK-05, never committed).
- **Not touched:**
  - the two root SVGs (timestamps unchanged)
  - protected specifications and earlier reports
  - the SkillSure database on port 5433 (not running during this task; never accessed)
  - dependency versions
- **Secrets:** only in the git-ignored `apps/api/.env` and `apps/web/.env.local`.

## 10. Run locally

```powershell
npm run db:start
npm run db:secrets            # once: adds STAFF_MFA_KEY (values never printed)
npm run db:migrate            # once: applies the TASK-10 migration
npm run dev:api
$env:PORT=3105; npm run dev:web
# test staff (development only): add DEV_STAFF_PROVISIONING=1 to apps/api/.env, then
npm run dev:staff -- --role admin --email admin@example.test --name "Local admin"
# production-style first admin instead:
npm run bootstrap:admin -- --email owner@example.test --name "Owner" --confirm
npm run check; npm run test:db; npm run db:cleanup
```

Pages: customers at `/sign-in`, then `/dashboard/media` and `/dashboard/notifications`. Staff at `/staff/sign-in`, then `/admin/staff` and `/admin/account` (or `/genealogist/account`).
