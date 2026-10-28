# TASK-09 — Backend Completion Sprint 1

Date: 2026-10-25. **Nothing was committed, pushed, staged, stashed or reset.** HEAD is still `af44621`.

## 1. Outcome

| Increment | Status |
|---|---|
| 1. Customer profile persistence | Done. API, database and browser tested |
| 2. Family workspace, members and relationships | Done. API, database and browser tested |
| 3. Staff sign-in and role-based authorisation | Done. Provisional method (R9) |
| 4. Assignments, research records and reports with review | Done |
| 5. Persistent audit events | Done. Append-only for the runtime role |
| 6. Expired-record cleanup | Done. `npm run db:cleanup` |
| 7. UI connected to the backend | Done for the screens in §4. Other screens show labelled sample data |

**Bug found and fixed:** Prisma's PostgreSQL adapter sends dates without a UTC offset. The local cluster runs in Asia/Kolkata, so every timestamp Prisma wrote was 5.5 hours early. This also affected TASK-07 and TASK-08 rows; those tables were empty, so no data needed repair. API connections now set `TimeZone=UTC` (`db.ts`), and a regression test was added.

## 2. Endpoints (all under `/api/v1`)

**Customer** (live customer session; the workspace and profile always come from the session, never from the request):
- `GET`, `PATCH /me/profile`
- `GET`, `POST`, `PATCH /family`
- `GET /family/tree`
- `GET`, `POST /family/members` (bounded pages, `?after=&limit=&q=`)
- `PATCH`, `DELETE /family/members/:id` (version required)
- `GET`, `POST /family/relationships`; `DELETE /family/relationships/:id`
- `GET /reports` (released reports only)

**Staff:**
- `POST /staff/auth/sign-in`
- `GET /staff/auth/session`
- `POST /auth/logout` (works for both customer and staff sessions)

**Admin** (each route requires a named permission):

| Routes | Permission |
|---|---|
| `GET /admin/workspaces` | `workspace.read_any` |
| `GET /admin/genealogists` | `staff.read` |
| `POST /admin/genealogists/:id/deactivate`, `POST /admin/genealogists/:id/reactivate` | `staff.manage` |
| `GET`, `POST /admin/assignments`; `POST /admin/assignments/:id/remove` | `assignment.manage` |
| `GET /admin/reports?status=`, `GET /admin/reports/:id`; `POST /admin/reports/:id/return`, `POST /admin/reports/:id/release` | `report.review` |
| `GET /admin/audit?before=&action=&limit=` | `audit.read` |
| `/admin/services` | `catalogue.manage` (now a real admin session, no longer the preview token) |

**Genealogist** (`case.work`, plus an active assignment checked in the same transaction):
- `GET /genealogist/cases`
- `GET /genealogist/cases/:workspaceId`
- `GET`, `POST /genealogist/cases/:workspaceId/records`; `PATCH /genealogist/cases/:workspaceId/records/:id`
- `GET`, `POST /genealogist/cases/:workspaceId/reports`; `PATCH /genealogist/cases/:workspaceId/reports/:id`; `POST /genealogist/cases/:workspaceId/reports/:id/submit`

**Error responses:**
- 400 validation failure, with fields
- 401 no session; 403 wrong role
- 404 outside the caller's scope (also when guessing IDs)
- 409 version conflict, duplicate or invalid state
- 422 rule violation (ancestry cycle, other-family member, limit)
- 429 rate limit
- 503 database down

The JSON body limit is 64 kB, and every list is bounded.

## 3. Migration `20261024212500_sprint1_family_research_audit`

**Tables:**
- `staff_profile`
- `staff_credential` (lower-case email; `scrypt$` hash check)
- `family_workspace` (unique owner)
- `member` (version)
- `relationship`
- `assignment`
- `research_record`
- `report` (`report_status`)
- `audit_event` (`audit_outcome`)
- also adds `customer_profile.display_name`

**Guards:**
- **Composite foreign keys** from `relationship` to `member(id, workspace_id)`, so both members of a relationship must be in the same workspace.
- **Relationships:** no self-relationships, only the provisional types, and canonical order for spouses, so the same relationship cannot be stored twice.
- **One active assignment per workspace:** partial unique index.
- **Release consistency:** `released_at` is set if and only if the status is `released`; returned reports must have a reason.
- **Lengths and versions:** CHECK constraints on text length and version.
- **Cleanup:** an index on `session.revoked_at`.
- **Audit permissions:** UPDATE, DELETE and TRUNCATE on `audit_event` are revoked from `kulvriksh_app`. Verified: the role holds only INSERT and SELECT.

Applied with `npm run db:migrate`. A drift check against the schema produced an empty migration.

## 4. UI screens on real data

| Area | Screen | Notes |
|---|---|---|
| Customer | Overview | Real counts and greeting |
| Customer | Family tree & members | Create, rename, add and remove people; add and remove relationships; generations computed from relationships |
| Customer | Profile & settings | Display name; mobile number read-only |
| Customer | Research & reports | Released reports only |
| Staff | `/staff/sign-in` | |
| Genealogist | Overview | |
| Genealogist | Assigned families | |
| Genealogist | Family workspace | Members read-only; notes and sources; reports from draft to submitted |
| Admin | Cases & assignments | Assign and unassign; review queue (release or return) |
| Admin | Genealogists | Deactivate and reactivate |
| Admin | Audit log | |
| Admin | Services | |

**Access changes:**
- Every admin and genealogist page now checks the staff session and role on the server.
- `proxy.ts` gates `/admin` and `/genealogist`.
- The cross-area switcher and the "staff preview" links are removed.
- Each control shows pending and error states and refreshes the page after saving.

## 5. Tests (actual results)

| Command or test | Result |
|---|---|
| `npm run check` | **Exit 0.** API 159 tests: 109 pass, 0 fail, 50 database tests skipped by design. Web 9 of 9 |
| `npm run test:db` | **50 of 50 pass:** auth 18, services 7, profile and family 13, staff, research and audit 11, cleanup 1. Afterwards every table in `kulvriksh_test` is empty |
| TASK-09 browser test (`next start` + API + PostgreSQL) | **15 of 15 pass** |
| TASK-08 sign-in browser test (regression) | **12 of 12 pass** |
| Public services browser test (regression, now with admin sign-in) | **4 of 4 pass** |

**Security and authorisation covered by tests:**
- **Anonymous and wrong-role access:** every admin and genealogist route returns 401 to anonymous callers and 403 to customers. Admin routes return 403 to genealogists, and genealogist routes 403 to admins. Staff tokens get 403 on customer routes. The preview token no longer opens admin routes.
- **Generic sign-in failures:** an unknown email and a wrong password get the same response. Staff lockout works after repeated failures, and even the right password then fails.
- **Revocation:** a revoked session gets 401 on the next request. Deactivating a genealogist revokes their sessions and blocks both sign-in and new assignment.
- **Cross-customer isolation:** guessed member and relationship IDs return 404. A relationship to another family's member is refused by the API (422) and by the composite foreign key. User IDs in the body or query are ignored.
- **Cycles and concurrency:**
  - cycle rejection, including two conflicting inserts at once
  - the family size limit under 16 parallel creates
  - two parallel assigns give one 201 and one 409
  - two parallel record edits give one 200 and one 409
  - two parallel submits give one transition
  - two parallel releases give one audit event
- **Assignment revocation:** after an assignment is removed, reads and writes return 404; the records stay.
- **Customer visibility:** customers see only released reports, never research records.
- **Audit:** the runtime role gets "permission denied" on UPDATE and DELETE. No password, hash or full mobile number appears in audit details or logs.
- **Database down:** routes return 503 without internal details.

**Fixes made during testing:**
- The timezone bug described in §1.
- `can()` threw on an unknown permission; it now denies.
- A test leak in the harness (an untracked email).

**Cleanup after the browser tests:** test-created rows were deleted as the owner role. Every dev-database table is back to 0 rows, as before the task.

## 6. Run locally

```powershell
npm run db:start; npm run db:migrate
# once, development only: add DEV_STAFF_PROVISIONING=1 to apps/api/.env, then
npm run dev:staff -- --role admin --email admin@example.test --name "Local admin"
npm run dev:staff -- --role genealogist --email g@example.test --name "Test genealogist"
npm run dev:api
$env:PORT=3105; npm run dev:web     # customers: /sign-in   staff: /staff/sign-in
npm run check; npm run test:db; npm run db:cleanup
```

In production, schedule the built cleanup (`node --env-file=.env dist/tools/cleanup.js`) hourly with a systemd timer or cron entry. It deletes in bounded batches and needs no queue.

## 7. Still mocked (labelled "Sample data" on screen)

- **Customer area:** media and voices; plans and payments.
- **Admin area:**
  - overview
  - customers
  - surname pages
  - plans
  - transactions
  - notifications
  - roles and access
  - the integration list on the settings page (the live API status card there is real)
- **Genealogist area:** profile and availability.
- **Partial features:**
  - There is no customer notification on report release (R36; the notification tables are not built).
  - Reports are in-platform text only; no file upload (R31).

## 8. Decisions taken as reversible defaults (owner to confirm)

| Decision | Default | How to change |
|---|---|---|
| R9: staff sign-in method | Email and password (scrypt, N=2^15); separate cookie; 8 h absolute and 1 h idle sessions | Replace the `staff_credential` table and the sign-in service |
| R34: admin second factor | None yet | Must be decided before production |
| R8: profile fields | Optional `displayName` only, controlled by `CUSTOMER_PROFILE_FIELDS` | Configuration |
| R17: member fields | Name only | New column plus migration |
| R18: relationship types | `parent_of` (acyclic) and `spouse_of` (symmetric) | CHECK constraint and validation |
| R21: member deletion | Blocked while relationships exist (no cascade) | |
| FQ-8: workspaces per customer | One (unique owner) | Drop the unique index |
| R19: family size limits | 500 people, 2,000 relationships | Configuration |
| R28/R29: assignment scope | One genealogist covering the whole workspace | Drop the partial unique index |
| R30: genealogist edits to the family | Read-only | |
| R32: report states | Approval and release are one step; a return reason is required | |
| FQ-15: records after reassignment | Visible to the current assignee | |
| FQ-26: contact details for genealogists | Never shown to genealogists | |
| DM §9.4: audit retention and tamper evidence | Not decided (R10, DQ-7) | Audit is append-only for the runtime role only, not against the database owner or superuser |
| Staff account creation | Development command only | No admin route creates staff (it depends on R9) |
| AC-14: client IP for per-IP limits | Taken from the right-most `X-Forwarded-For` entry | The production proxy must overwrite that header |

## 9. External dependencies

- An SMS provider and credentials.
- The production reverse proxy (AC-14).
- A host scheduler for the cleanup command.
- In deployment, the role name in the audit `REVOKE`. The migration revokes from `kulvriksh_app` only if that role exists; a differently named runtime role needs the same revoke.

## 10. Remaining work, by priority

1. **Before staff use real data:**
   - decide R9 and R34 (second factor for admins)
   - an admin route to create staff, plus password change and reset
   - a production bootstrap command for the first admin (F-ADM-00)
2. **Customer notifications on release (R36):** tables plus a transactional insert in the release.
3. **Member fields (R17) and relationship types (R18),** then search and indexing.
4. **Orders, payments and entitlements (R12–R14),** including workspace and research gating.
5. **Media and file storage behind an access-checked layer;** report files (R31).
6. **Admin customer management and account states (R35, R10).**
7. **Audit:** retention and view scope (FQ-13); optional tamper evidence (DQ-7).

## 11. Git status

- Branch `main`, HEAD `af44621`. Nothing staged, committed or pushed. 58 entries in `git status`, including this report; all earlier uncommitted work is preserved.
- **New in this task:**
  - API modules: `apps/api/src/{audit,customers,family,research,staff,maintenance,tools}/`, `src/auth/authorize.ts`, `src/http.ts`
  - API tests: `src/sprint1.test.ts`, `src/testing/sprint-harness.ts`, the three new `*.db.test.ts` files
  - the migration above
  - web: `app/(public)/staff/sign-in/`, `app/{admin,dashboard,genealogist}/actions.ts`, the new family, case and admin components, `lib/api/{portal,session-api}.ts`, `lib/auth/staff-session.ts`, `components/portal/{load-error,sample-data-notice}.tsx`
- **Changed:** schema, config, app and server wiring, auth store and service, service routes and repository, `db.ts`, shared types, `proxy.ts`, the portal shell and layouts, `.env.example` files, `README.md`, `package.json` scripts.
- **Removed (replaced by real screens):** these were all created in TASK-05 and never committed:
  - the sample family view
  - the sample case queue
  - the sample audit table
  - the sample report-download button
- **Not touched:**
  - the two root SVGs (timestamps unchanged)
  - the protected specifications and earlier reports
  - the SkillSure database on port 5433 (PID 11756)
  - dependency versions
- **Secrets:** they exist only in the git-ignored env files. A scan of 229 tracked and untracked files found none.
