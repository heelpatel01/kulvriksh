# TASK-11 — Core Product Completion Sprint

Date: 2026-10-25. Starting point: HEAD `af44621`, with the uncommitted work of TASK-05 to TASK-10. All of that work is preserved. **Nothing was committed, pushed, staged, stashed, reset or discarded.**

## 1. Features implemented

| Area | What now works | Main files |
|---|---|---|
| **P0 Family tree PDF export** | A complete, vector PDF of the family tree in three modes: one page, poster, and printable sheets. Generated in a worker thread with progress, cancellation, time, memory and page limits. Stored privately with expiry, and downloaded only through an access check. Details in §2. | `apps/api/src/export/*`, `apps/web/app/dashboard/family/export-panel.tsx`, `apps/web/app/api/files/exports/[id]/route.ts` |
| **P0 Plans, orders, payments, entitlements** | Admin plan management. Customer plan list, order creation (idempotent) and a checkout page. A Razorpay adapter: orders and payments over REST, plus checkout and webhook signature checks. A development-only simulated gateway. Confirm and Grant as two separate transactions. Atomic, replay-safe webhooks. Leased reconciliation and grant recovery. Server-side entitlement gates. Admin transactions, order detail and attention queue. Details in §3. | `apps/api/src/payments/*`, `apps/web/app/dashboard/plans/**`, `apps/web/app/admin/{plans,transactions}/**` |
| **P1 Real admin screens** | Overview metrics; customer list (search, pagination) and detail; roles & access generated from the API's own permission table; plans; transactions. | `apps/api/src/admin/*`, `apps/web/app/admin/{page.tsx,customers/**,access/*}` |
| **P1 Genealogist profile** | Real profile and workload. Availability is shown as "not designed yet" instead of a fake form. | `apps/web/app/genealogist/settings/*` |
| **Test infrastructure** | A local Razorpay test double; a synthetic family generator; an export benchmark (`npm run bench:export -w @kulvriksh/api`). The DB test harness now includes exports, payments, admin read models, unique per-harness IPs and payment cleanup. | `src/testing/fake-razorpay.ts`, `src/export/synthetic-tree.ts`, `src/tools/export-bench.ts`, `src/testing/sprint-harness.ts` |

**Defects found and fixed during the sprint:**
- **Expired exports left `stored_file` rows behind.** Expiry deleted the bytes but kept the row in `pending_deletion`. It now removes both, and a DB test proves it.
- **Married couples could be drawn far apart.** Each spouse was pulled towards their own relatives, leaving very long spouse lines. Spouse groups are now rigid blocks in the x-placement.
- **The edge-crossing metric over-counted.** It counted children sharing a family bus as crossings (for example 780 for one couple with 40 children). It now counts what is actually drawn.
- **Webhook unique conflicts could be misread.** A unique conflict caused by a concurrent verify was treated as a duplicate event. It is now told apart from a true redelivery, and is retried.
- **Two existing DB test suites could collide on per-IP rate limits.** They picked random client IPs that could repeat. Each harness now gets a distinct IP. This caused the one flaky failure seen in this sprint, in `AS-AUTH-02`.
- **An export could be incomplete or fail after the family limit was lowered.** The export loaded the family cut at the current `FAMILY_MAX_MEMBERS`, so a lowered limit gave an incomplete tree or a failed job. It now always loads the whole family, up to the configuration's absolute bounds, and a DB test proves it.
- **The customer-area banner was out of date.** It still said "workspace content is still sample data". The genealogist navigation also still said "Profile & availability". Both are corrected.

## 2. PDF export

### Modes

| Mode | What it produces | Readability handling |
|---|---|---|
| **Single page** (`single`) | The whole tree on one sheet: A4, A3, A2, A1, A0, Letter, Legal, Tabloid, or a custom size (100–5000 mm). Orientation is portrait, landscape, or "best fit", which picks the larger scale. Small trees are enlarged at most 2×. | The printed name size is computed. Below 6 pt the warning is `labels_small`; below 3.5 pt it is `labels_unreadable`, and the UI suggests a poster or sheets. |
| **Poster** (`poster`) | One page sized from the actual layout at the chosen scale (25–400%), plus margins. | If the page would exceed the 200 × 200 inch PDF viewer limit, it is reduced to fit and marked `poster_reduced`. |
| **Printable sheets** (`tiled`) | Sheets at one constant scale. Page 1 is an assembly overview: a miniature of the whole tree with the numbered sheet grid and instructions. Each sheet has: a 10 mm overlap with each neighbour; dashed alignment guides through the middle of every overlap; crosshair registration marks on the guides (the same point of the drawing on both sheets); corner trim marks; neighbour hints ("Left: sheet 3"); "sheet n of N (row, column)"; and "Page p of P". | Lines are drawn from the same geometry on every sheet and clipped, so a line that crosses a sheet edge continues exactly on the next sheet. The orientation that needs fewer sheets is chosen automatically. |

**Options, in every mode:**
- name size (5–24 pt)
- reference numbers in each box
- generation labels
- an alphabetical **member index**, which lists every member with their number and where to find them (sheet and page for tiled output)
- the **whole tree by default**, or an explicitly chosen subtree: the descendants of one person (with their spouses) or their ancestors

The PDF title states the scope, for example "Descendants of Asha".

### How it works

**Layout** (`tree-layout.ts`, pure and synchronous):
- **Generations:**
  - Each person's generation is the longest path over `parent_of`.
  - Parentless ancestors are placed directly above their children.
  - Spouses are aligned onto one row. If an alignment conflicts (a spouse who is also an ancestor), it is abandoned and drawn as a dashed connector instead of looping.
- **Long lines:** a dummy point is added for every skipped generation, so no line runs through a box.
- **Ordering:**
  - Depth-first seed order.
  - Barycentre sweeps that keep spouse groups together, with each couple oriented towards each partner's relatives.
  - The ordering with the fewest crossings is kept, counted with a Fenwick tree.
- **Horizontal placement:** weighted isotonic regression (pool-adjacent-violators), with spouse groups as rigid blocks. Downward and upward passes are followed by balanced passes.
- **Lines:**
  - Children of the same parents share one bus line.
  - Buses and arcs between non-adjacent spouses get their own tracks, and the gap between rows grows to fit them.
  - Spouses are joined by a double line.
- **Disconnected families** and people without relationships are shelf-packed.

**Renderer and writer:**
- `tree-render.ts` draws the chosen mode onto the writer's pages.
- `pdf-writer.ts` is a minimal, dependency-free PDF 1.7 writer:
  - vector text in Helvetica and Helvetica-Bold, which every reader has, so no font is embedded
  - vector lines and boxes
  - Flate-compressed content streams
  - an exact cross-reference table
  - UTF-16 Info metadata (Title, Subject, Producer, Creator, CreationDate)

  No screenshots and no browser rendering are involved.

**Jobs:**
- **Request:**
  - `POST /family/exports` creates a job, or returns the requester's open job, so repeated clicks make one job (AS-FAM-12).
  - A partial unique index enforces that at most one open job exists per requester.
- **Scheduling:**
  - An in-process scheduler claims queued jobs with `FOR UPDATE SKIP LOCKED`, up to `EXPORT_CONCURRENCY`.
  - Each claim gets a fresh lease token, and the lease times use the database clock.
- **Running:**
  - Each job runs in its own `worker_threads` worker, with a heap limit, a timeout and an abort.
  - Progress is written to the job row through fenced heartbeats.
  - If a heartbeat finds the lease lost (the job was cancelled, or recovered after a restart), the worker stops.
- **Storing:** the PDF is written through the storage abstraction: temporary area, then commit under a server-generated key, then a `stored_file` row of kind `export_pdf`. If the lease was lost by then, the file row rolls back and the bytes are deleted.
- **Restart and shutdown:** a running job whose lease expired is marked `failed` with `interrupted`. A graceful shutdown aborts running workers and marks their jobs `interrupted` immediately.
- **Expiry:** finished files expire after `EXPORT_RETENTION_HOURS` (default 24, FQ-11). Both the bytes and the row are deleted. The maintenance also runs in `npm run db:cleanup`.
- **Busy:** when `EXPORT_QUEUE_LIMIT` open jobs exist, a new request gets **429** `EXPORT_BUSY` with `Retry-After`.

**Data loaded:** only member ids and names, and relationship ids, types and ends, for the requester's workspace. Research records, reports, media and contact details are never read by the export (a test proves it with a research note).

### Authorization

**Customers:**
- Routes are `/family/exports`.
- The workspace always comes from the session; no route takes a workspace id from a customer.
- Another customer's job id is **404** for status, cancel and download.
- A subtree rooted at another family's member is refused (**422**) without revealing anything.

**Genealogists:**
- Routes are `/genealogist/cases/:workspaceId/exports`, **off by default** (`EXPORT_GENEALOGIST_ACCESS=off`, R28/FQ-25).
- When set to `assigned`, the path's workspace id is never trusted. Every request re-checks a *current* active assignment in the same query that reads the job.
- After the assignment is removed, list, status, download and new requests are all **404**.

**Admins:** no export route (FQ-14). Calls to the customer routes are **403**.

**Downloads and logs:**
- Files are streamed with `Cache-Control: private, no-store`, `Content-Disposition: attachment` and a sandbox CSP.
- The web proxy maps every failure to the same 404.
- Storage keys and paths never contain ids or names.
- Logs and errors carry only job ids, counts and error codes; no names.

### Limitations (honest)

**Scripts other than Latin:**
- Text uses WinAnsi encoding.
- Accented Latin letters print correctly, or approximated (ā → a, counted and warned as `approximated_characters`).
- **Devanagari, Gujarati and other non-Latin scripts cannot be printed yet.** They appear as "?" and are warned as `unsupported_characters`.
- Supporting them needs an embedded Unicode font **and** a text-shaping engine. That is a product decision with a dependency choice (§9).

**Other limits:**
- **Long names:** names longer than 4 lines in a box are shortened with "…" (`labels_truncated`). The index always lists the full name.
- **Very wide families:** real family trees are much wider than deep (the bottom generation is the largest).
  - On one sheet, names become unreadable beyond about 8–10 people in the widest generation (A4) or about 35 (A0 at 6 pt).
  - A poster holds about 100 people per row at 9 pt before the 200-inch limit.
  - Printable sheets have no width limit, but the sheet count grows. A 1000-person synthetic family needs 107 A4 sheets at 100%; a 5000-person one needs 1108, which is over the default 300-page limit (`too_many_pages`, with advice to lower the scale or use a larger sheet).
- **Line routing:** lines that skip a generation bend diagonally between rows. The crossing count is minimised by a heuristic, not proven minimal.
- **Spouses in different generations** are joined with a dashed line, and the legend explains it.

### Performance (measured)

`npm run bench:export -w @kulvriksh/api`.
- **Setup:** Node 24.13.0 on Windows. Each case runs in a fresh process; peak memory is the process's maximum resident set. Synthetic families from a fixed seed, about 2% people without relationships.

| Members | Relationships | Mode | Time ms (layout) | Pages | PDF KB | Printed name size | Peak RSS MB (above the 70 MB baseline) |
|---|---|---|---|---|---|---|---|
| 100 | 164 | single A3 | 24 (15) | 2 | 7 | 1.6 pt | 75 (+5) |
| 100 | 164 | poster | 32 (18) | 2 | 7 | 9 pt | 73 (+3) |
| 100 | 164 | tiled A4 | 27 (12) | 11 | 20 | 9 pt | 73 (+3) |
| 500 | 817 | single A3 | 63 (43) | 4 | 27 | 0.37 pt | 78 (+8) |
| 500 | 817 | tiled A4 | 87 (34) | 60 | 119 | 9 pt | 80 (+10) |
| 1000 | 1642 | poster | 99 (51) | 10 | 56 | 2.62 pt | 84 (+14) |
| 1000 | 1642 | tiled A4 | 167 (56) | 107 | 244 | 9 pt | 96 (+26) |
| 2000 | 3270 | tiled A4 | 412 (81) | 312 | 705 | 9 pt | 118 (+48) |
| 5000 | 8062 | single A3 | 281 (168) | 31 | 237 | 0.04 pt | 141 (+71) |
| 5000 | 8062 | poster | 248 (140) | 46 | 260 | 0.48 pt | 142 (+72) |
| 5000 | 8062 | tiled A4 | 1357 (119) | 1108 | 3693 | 9 pt | 171 (+101) |

The page counts include the member index.

**Realistic limits:** computation is not the constraint. The largest allowed family (5000 members, `FAMILY_MAX_MEMBERS` maximum) exports in about 1.4 s and about 100 MB on this machine, well inside the 120 s timeout and the 512 MB worker heap limit. The constraint is printed legibility, as above.

**What was checked independently:**
- The DB-backed export of a 6-person family ran end to end in the browser test, including the worker, storage and download.
- **Xpdf `pdftotext` 4.00** opened every sample (`deep25-single`, `random300-tiled`, `wide40-poster`, `random5000-single`) with **0 errors** and extracted the names and every "Page n of N" footer.
- **pdf.js 3.11** rendered them. Screenshots of the poster, a sheet with its guides and marks, the assembly overview and an index page were reviewed visually during development.

### Example usage

1. **Customer:** open *Family tree & members*, then *Download as PDF*. Choose a layout, page size and options, then *Create PDF*. A progress bar follows, then *Download PDF*.
2. **API:**

   ```http
   POST /api/v1/family/exports
   {"mode":"tiled","pageSize":"A3","orientation":"auto","labelSize":9,"scalePercent":80,"includeIndex":true,"scope":{"kind":"descendants","memberId":"<uuid>"}}
   ```

   The response is 202 `{job}`. Poll `GET /api/v1/family/exports/<id>` until `status` is `ready`, then download `GET /api/v1/family/exports/<id>/file`.

## 3. Payment lifecycle and entitlement enforcement

**Provider** (`PAYMENT_PROVIDER`):
- `none` (default): plans can be managed; ordering answers 503 "Payments are not available yet".
- `development`: the simulated gateway, refused outside `NODE_ENV=development`.
- `razorpay`: needs all of `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Outside production only `rzp_test_` keys are accepted. Secrets are never logged or echoed.

**No Razorpay credentials exist in this environment, so there is no live or test-mode Razorpay integration claim.** The adapter is contract-tested against a local test double of the Razorpay REST API, using the documented request and response shapes and signature formulas.

**Order** (F-ORD-01):
1. The browser sends `planId` and a client-generated UUID `idempotencyKey`. An amount in the request is refused (400).
2. The same key returns the same order. The same key with another plan is 409. Concurrent requests with one key yield one internal order.
3. The price, currency, entitlement keys and names are snapshotted from the catalogue. The plan and its service must both be active, and the currency must be the configured one.
4. The order id is generated **before** the provider call. The provider order is created outside any transaction, with a timeout and our order id as the receipt.

**Paying** (F-ORD-02):
- The checkout page is the only route that loads `checkout.razorpay.com` (AS-ORD-04). The browser test saw no external requests on any route with the development provider.
- Closing the payment window keeps the order, and "Resume payment" reuses it (AS-ORD-05).
- After the payment page returns, the browser calls verify. If the result is pending it polls a bounded 10 × 3 s, then says "being confirmed".

**Confirm** (transaction A), shared by verify, webhook and reconciliation:
1. Lock the order row.
2. Upsert the attempt by provider payment id. Attempt status only moves forward.
3. A captured payment whose amount and currency **match the snapshot** sets the order to `paid` and creates the `pending` grant.
4. A mismatch sets the attention reason `amount_mismatch` and never pays.
5. A paid order never changes.
6. A payment belonging to another order is refused.

**Grant** (transaction B):
1. Lock the grant row.
2. Create the snapshot's entitlements, unique per (grant, key).
3. Mark the grant `granted`.

A failure rolls back and is recorded separately (attempt count, last error, next attempt). After `GRANT_MAX_ATTEMPTS` the grant becomes `failed` and joins the attention queue. Grant recovery retries due grants under a run lease. An admin can re-run a grant, which is idempotent (AS-ADM-08).

**Verify** (`POST /orders/:id/verify`):
1. The order must be the caller's own; otherwise 404.
2. The provider order id comes from **our** row.
3. The checkout signature is HMAC-SHA256(`order_id|payment_id`, key secret), compared in constant time. A bad signature is 400 and an audited failure.
4. The payment is **read back from the provider** and must belong to this provider order. If the provider is unreachable, the answer is 202 "pending" and nothing changes.
5. Confirm, then Grant, run.

**A frontend success page or callback alone can never grant access.**

**Webhooks** (`POST /api/v1/payments/webhooks/razorpay`, mounted before the JSON parser):
- **Signature first:** HMAC-SHA256 over the **raw body** with the webhook secret. A bad signature is 400, audited, and **nothing is stored**.
- **Atomic:** the event row (unique provider event id) and its Confirm effects commit in one transaction. A redelivery, or a concurrent duplicate, is a unique conflict and answers 2xx with no effect.
- **Statuses:**
  - Refunds and unused event types are stored as `ignored` (D3).
  - An unknown order, an amount mismatch or a payment of another order is `needs_attention`.
- **Grant** runs after the response.
- **Stored data:** only a non-personal excerpt (event, payment id, order id, status, amount, currency). The payer's email and phone from the payload are not stored, as a test checks.

**Reconciliation and recovery:**
- **Run lease:** both tasks take a run lease on `background_task_state`, with the database clock and a fresh token. If another runner holds the lease, the run is skipped.
- **Order selection:** reconciliation picks unpaid orders older than `RECONCILE_MIN_AGE_SECONDS`, inside `RECONCILE_LOOKBACK_DAYS`, oldest-checked first, in bounded batches.
- **Per order:**
  - It reads the order's payments from the provider (with a timeout) and applies Confirm for each attempt, with a captured one last.
  - It records each check. After `RECONCILE_ATTENTION_AFTER_CHECKS` checks, the order is marked `unreconciled`.
  - The lease is renewed per order; a run that lost its lease stops.
- **Schedule:** both tasks run shortly after startup and then on intervals.

**States and expiry:**
- Orders: `created → pending/failed → paid`. Failed is not terminal: a new attempt on the same provider order can still pay.
- Expiry of unpaid orders is **not** implemented; it waits for FQ-18.
- Refunds are not processed (D3).
- Recurring plans are outside the design (R13).

**Entitlement enforcement:**
- `ENTITLEMENT_GATES` maps a feature to an entitlement key, for example `tree_export=family.export`. The default is **none** (R14).
- When the gate is set, `POST /family/exports` checks for an active entitlement **on the server** and answers 403 `ENTITLEMENT_REQUIRED` otherwise (AS-ORD-15).
- The browser test proved the whole sequence: refused, then a failed payment, then a successful payment, then export allowed.

## 4. API endpoints and schema changes

### Migration `20261025110132_payments_entitlements_exports`

Generated with `prisma migrate diff`, with hand-written guards appended. Applied to the dev and test databases with `npm run db:migrate`.

**New tables (9):**
- `plan`, `plan_entitlement`
- `customer_order`, `payment_attempt`, `webhook_event`
- `entitlement_grant`, `entitlement`
- `background_task_state`
- `export_job`

**Changes to existing objects:**
- The enum `stored_file_kind` gains `export_pdf`.
- New relations exist on `service`, `app_user`, `family_workspace` and `stored_file`.

Nothing was dropped or altered destructively, and no existing data changed. The databases now have 31 tables.

**Guards (CHECK constraints and indexes):**
- **Amounts:** prices and amounts are greater than 0, and prices are at most 10¹¹.
- **Formats:** ISO currency `^[A-Z]{3}$`; the idempotency key in UUID format; the entitlement key and task name formats; bounded lengths for names, descriptions and provider ids.
- **Coupled fields:** `paid` ⇔ `paid_at`, captured ⇔ `captured_at`, `needs_attention` ⇔ reason, `granted` ⇔ `granted_at`, `failed` ⇔ `failed_at`.
- **Leases:** lease consistency on grants, task state and export jobs. An export job is `running` ⇔ it has a lease.
- **Export jobs:** `finished_at` is set exactly for ready or failed jobs; `error_code` exactly for failed jobs; progress is between 0 and 100.
- **Partial indexes:**
  - `export_job_one_open_per_requester` (unique, open jobs)
  - `customer_order_open_for_reconciliation`
  - `customer_order_needs_attention`
  - `entitlement_grant_due`
  - `export_job_queued`
  - `export_job_ready_expiry`
- **Composite foreign key:** `export_job(file_id, workspace_id) → stored_file(id, workspace_id)`. An export file can only belong to the export's own workspace.

**Runtime role:** grants come from the existing default privileges. The runtime role still has no UPDATE or DELETE on `audit_event`.

**Media quota:** the quota no longer counts `export_pdf` files.

### New endpoints (`/api/v1`)

| Method and path | Who | Purpose |
|---|---|---|
| `POST /family/exports`, `GET /family/exports`, `GET /family/exports/:id`, `DELETE /family/exports/:id`, `GET /family/exports/:id/file` | customer (own workspace) | Export: request, list, status, cancel, download |
| The same five under `/genealogist/cases/:workspaceId/exports` | genealogist with an active assignment, **only if** `EXPORT_GENEALOGIST_ACCESS=assigned` | Off by default: 403 `EXPORT_NOT_PERMITTED` |
| `GET /plans` | public | Active plans of active services |
| `GET /payments/status` | public | Provider, mode, currency and gates. No secrets. |
| `POST /orders`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/checkout`, `POST /orders/:id/verify`, `GET /me/entitlements` | customer (own) | Ordering and paying |
| `POST /orders/:id/simulate` | customer; **development provider only** (404 otherwise) | The simulated gateway |
| `POST /payments/webhooks/razorpay` | the provider (signature) | Webhooks |
| `GET /admin/plans`, `POST /admin/plans`, `PATCH /admin/plans/:id` | `catalogue.manage` | Plans |
| `GET /admin/orders`, `GET /admin/orders/:id`, `GET /admin/payments/attention`, `GET /admin/payments/webhook-events` | `payments.read` | Transactions |
| `POST /admin/orders/:id/regrant` | `payments.manage` | Re-run a grant (idempotent) |
| `GET /admin/overview`, `GET /admin/customers`, `GET /admin/customers/:id` | `customers.read` | Overview and customers (read only) |
| `GET /admin/access` | `staff.read` | Permission matrix and policy settings |
| `GET /genealogist/profile` | `case.work` | Own profile |

**New permissions:** `payments.read`, `payments.manage` and `customers.read`, all for admins only. **No role-changing route exists**, and a test checks that likely paths for one return 404.

## 5. Frontend screens connected to real data

| Screen | State before | Now |
|---|---|---|
| `/dashboard/family`: **Download as PDF** panel | none | Options, request, progress bar (polling 1 s rising to 5 s, at most 15 min), cancel, warnings in plain language, the last 5 exports with download and expiry |
| `/dashboard/plans` | sample | Active plans with Buy, current access, order history (paginated) with Resume payment, and a test- or development-mode banner |
| `/dashboard/plans/checkout/[orderId]` | none | The payment page. Razorpay Checkout loads only here; development mode shows a labelled simulator. Verify, bounded polling, failed and closed states. |
| `/admin` (overview) | sample | Real counts: customers, family, research, orders and revenue per currency, attention, exports, staff. Plus the review queue and recent audit. |
| `/admin/customers` and `/admin/customers/[id]` | sample | Server-side search (name, or at least 3 digits of the mobile number) and pagination. Detail shows contact details, sessions, workspace, assignment, reports, orders, entitlements and recent activity. Read only (R35). |
| `/admin/plans` | sample | Create and edit (price in major units, converted to minor units), entitlement keys, activate and deactivate. The payment setup is shown. |
| `/admin/transactions` and `/admin/transactions/[id]` | sample | Attention summary, filters, pagination, webhook events that need attention. Detail shows attempts, events, grant, entitlements and the regrant action. |
| `/admin/access` | sample | The permission matrix from the API, policy settings with their decision ids, and the real staff list |
| `/genealogist/settings` | sample | Real profile and workload. Availability is shown as not designed. |

**Unchanged and still labelled sample:**
- `/admin/content`: surname pages, R2
- `/admin/notifications`: templates, R36

Every connected screen has a loading state (the existing `loading.tsx`), an empty state, an error state with retry (`LoadError`), and success notices. Authorization is enforced by the API on every call.

## 6. Security controls and tests

**What is enforced:**
- **Workspace scope** always comes from the session (customer) or a re-checked current assignment (genealogist). No browser-supplied workspace id is trusted.
- **Downloads** are checked on every request. They are private and no-store, and the web proxy answers the same 404 for "missing" and "not yours".
- **Exports never read research or reports.** A test puts a confidential research note in the workspace and proves it is absent from the PDF.
- **Paid access** only after a provider-confirmed capture with matching amount and currency. Signatures are compared in constant time.
- **Webhooks:** invalid signatures are never stored. Events are atomic and idempotent, and no personal payment data is kept.
- **Provider calls** never run inside a transaction and always have a timeout.
- **Bounds:** limits on lists (`limit` ≤ 50, 100 or 200), body sizes (64 KB JSON, 256 KB webhook), export pages, bytes, time and memory, the export queue, reconciliation batches, and polling.
- **Development-only features** (the simulated gateway and `/orders/:id/simulate`) are refused by configuration outside development.
- **Secrets:** no secrets exist in source, reports or bundles. The Razorpay key id is public by design; the secrets are server-only.

**Security tests (DB):**
- cross-customer export access (status, cancel, download, subtree)
- admin and genealogist refusal; genealogist export off by default, then allowed only while assigned and refused after removal
- research records absent from the PDF
- busy (429), cancellation, stale leases, restart recovery, expiry
- AS-ORD-01 to 03, 07 to 23; AS-ADM-06 and 08
- customer and genealogist refused on admin routes; the permission matrix equals the enforced table; no role-change route

**Browser tests:**
- another customer gets 404 for the export file and "not found" for the checkout page
- no external requests

## 7. Exact test results

**Final runs, after all changes:**

| Command | Result |
|---|---|
| `npm run check` | **exit 0**. Typecheck and lint are clean in all workspaces, and both builds succeed. API: **256 tests, 160 pass, 0 fail, 96 skipped** (the DB tests, which need `test:db`). Web: **10 tests, 10 pass**. |
| `npm run test:db` | **exit 0**: **96 tests, 96 pass, 0 fail** (26.6 s) |

**Before TASK-11** the counts were: `check` 195 API tests (118 pass, 77 skipped), web 10/10; `test:db` 77/77.

**Added in this task:**
- **42 unit tests:**
  - 24 for the tree export: PDF validity, layout invariants, every mode, sheet-boundary lines, page numbers, limits, options, and a 3000-member stress test in every mode
  - 4 for the worker: off the main thread, page limit, timeout, cancellation
  - 13 for payments: adapter, signatures, configuration, plan validation
  - 1 for configuration
- **19 DB tests:** 7 for exports, 8 for payments, 4 for admin.

**What the export tests assert, independently of the renderer:**
- the PDF parses with exact xref offsets and stream lengths
- every member is drawn exactly once and every relationship is drawn
- no two boxes overlap, and every box is inside the drawing
- a child is always below its parents and spouses share a row
- parent lines never pass through another box
- every sheet is numbered, "Page n of N" appears on every page, and the index lists every member

**Stress test (in `npm run check`):** a 3000-member family in all three modes takes 0.45 s in total.

**Database cleanliness:** after every run, the dev (`kulvriksh`) and test (`kulvriksh_test`) databases on 127.0.0.1:5434 each have 31 tables and **0 rows**, and `.data/storage` holds **0 files**. The runtime role still has only INSERT and SELECT on `audit_event`. Port 5433 was never used.

**Browser suites** (production web build on :3105; API on :4100; fresh Chrome profile per suite):

| Suite | Result |
|---|---|
| **TASK-11** (new; API with `PAYMENT_PROVIDER=development`, `ENTITLEMENT_GATES=tree_export=family.export`) | **9/9 pass**, browser errors: none |
| TASK-08A sign-in (regression) | **12/12 pass** |
| TASK-08A services (regression) | **4/4 pass** |
| TASK-09 (regression) | **15/15 pass** |
| TASK-10 (regression) | **10/10 pass** |

**What the TASK-11 browser run covered:**
- a three-generation family built in the UI
- export refused by the gate
- admin creates a service and a plan (inactive), then activates it
- admin overview, customer search and detail, roles & access
- customer buys: a failed payment, then a successful one; paid, granted and access shown
- printable-sheets export, where three rapid clicks made one job; the PDF downloaded (200 `application/pdf`, private no-store, `%PDF-1.7`)
- another customer gets 404 for the export file and "not found" for the checkout page
- admin transaction detail: two attempts via checkout verification, grant Granted
- genealogist profile
- no request left the site

**Problems met while running the browser suites** (all fixed in the test setup; none is a product defect):
- **Account names:** my test accounts were first created through `npm run` on Windows, whose cmd.exe added `^` characters to the `--name` value. The two test accounts' names were corrected and t9 was rerun.
- **ISR cache:** the services suite's empty-state check runs against an ISR page that was 60 s stale after my direct database cleanup. Rerunning after the documented 60 s window passed.
- **TASK-11 browser test:** the first runs exposed test-script issues: the OTP resend cooldown on a second sign-in, a check on a streamed 404's HTTP status, and a server re-render after payment. They were fixed in the script. The checkout page's paid state was retitled "Payment confirmed".

## 8. Remaining sample data

- **`/admin/content` (surname pages):** waiting for R2. The surname content model and its sources are undecided.
- **`/admin/notifications` (templates and events):** waiting for R36 and R37.
- **The public pages:** they keep their existing TASK-05 content, outside this task's screens.
- **The admin shell banner** still says "Some screens in this area still show sample data; they are labelled", which is accurate. The customer and genealogist banners no longer mention sample data.
- **`apps/web/lib/repositories/admin.ts` and `customer.ts`** keep sample functions that the two sample screens and older code still import. The functions for the replaced screens are no longer used, and can be deleted once those screens are reviewed.

## 9. Missing credentials and unresolved product-owner decisions

**Missing credentials:**
- **Razorpay:** test-mode keys and a webhook secret are needed for a real test-mode run. Then configure the webhook URL in the Razorpay dashboard.
- **SMS and email providers** (R37): still missing; unchanged.

**Decisions needed:**

| Id | Decision | Current behaviour |
|---|---|---|
| R12 | Plans, prices, taxes | Admins enter them; nothing is invented |
| R13 | One-time, time-limited or recurring plans | One-time only; `entitlement.valid_until` exists but is unused |
| R14 | Which features are gated, and by which keys | `ENTITLEMENT_GATES` is empty by default; `tree_export` can be gated |
| DQ-2 | Currency | `PAYMENT_CURRENCY=INR`, provisional |
| FQ-18 | Expiry of unpaid orders; reconciliation timings | No expiry; timings configurable |
| R15, R16, D3 | Receipts and invoices; manual refund process | Not implemented; refund events ignored |
| FQ-24 | Final order states | Working set `created`/`pending`/`paid`/`failed` |
| — | Notification on "payment successful" | Not sent; no event defined (R36) |
| FQ-11 | Export retention, or generation on demand | 24 h retention, configurable |
| R28, FQ-25 | Genealogist export | Off; `assigned` mode exists behind the setting |
| FQ-14 | Admin export or download of family data | Denied |
| **New: export scripts** | Support for Devanagari, Gujarati and other scripts in PDFs. Needs an embedded Unicode font (licence choice) and a shaping engine, which is a dependency decision. | Latin-1 only; other characters are "?" with a warning |
| R35 | Customer status actions (suspend, delete) | Read only |
| R17, FQ-9 | More member fields; linking media to members | Unchanged: name only; media linked to the family. The schema accepts additions without breaking existing data. |
| R18 | More relationship types | Unchanged: `parent_of` and `spouse_of`. The rules table makes adding one a single-entry change. |
| — | Genealogist availability | Not designed; not offered |
| R2, R36 | Surname pages; notification templates | Still sample |
| — | Phase 10 measurement of export concurrency on the 1 vCPU / 4 GB server | Default `EXPORT_CONCURRENCY=1` |

## 10. Ranked remaining tasks for TASK-12 and TASK-13

**TASK-12:**
1. **Razorpay test-mode run with real test keys.** End-to-end Checkout, verify, webhook (including a dashboard redelivery), reconciliation and a failed payment. Then document the dashboard webhook settings. This needs credentials.
2. **Non-Latin names in PDFs.** After the font and shaping decision, embed a subset font and shape text, with tests for Devanagari and Gujarati.
3. **Product decisions R12–R14 and FQ-18 applied.** Real plans and gates, expiry of unpaid orders, and the "payment successful" notification (with R36).
4. **Export UX.** A preview of the printed name size per option before generating, a scale-to-N-pages option for sheets, and a remembered last choice.
5. **Rate limits** on order creation and export requests per customer. The current bounds are the idempotency key and the open-job and queue limits.

**TASK-13:**
1. **Customer status actions** (R35), with session revocation, if adopted.
2. **Surname pages** (R2) and **notification templates** (R36), replacing the last sample screens.
3. **Member fields** (R17) and media-to-member linking (FQ-9), then reflecting them in the PDF member details.
4. **Phase 10 measurements:** export and payment concurrency on target hardware; tune `EXPORT_CONCURRENCY` and the worker memory.
5. **Remove the unused sample repository functions.** Consider a cloud storage adapter.

## 11. Exact local run and verification commands

**Setup (from the repository root):**

```bash
npm ci
npm run db:start              # PostgreSQL 18 on 127.0.0.1:5434
npm run db:migrate            # applies 20261025110132_payments_entitlements_exports
npm run check                 # typecheck, lint, unit tests, build
npm run test:db               # integration tests against kulvriksh_test
npm run bench:export -w @kulvriksh/api            # export time and memory table
npm run bench:export -w @kulvriksh/api -- 300 3000   # chosen sizes
```

**Run the product with development payments and the export gate (Git Bash):**

```bash
PAYMENT_PROVIDER=development ENTITLEMENT_GATES=tree_export=family.export \
  node --env-file=apps/api/.env apps/api/src/server.ts          # API on :4100 (API_PORT in apps/api/.env)
npm run build -w @kulvriksh/web
node node_modules/next/dist/bin/next start apps/web -p 3105 -H 127.0.0.1
```

**Create local test staff (development only).** Run the tool with Node directly. On Windows, `npm run` passes arguments through cmd.exe, which can add `^` to quoted values.

```bash
cd apps/api
DEV_STAFF_PROVISIONING=1 node --env-file=.env src/tools/dev-staff.ts --role admin --email admin@example.test --name "Local admin"
```

**Razorpay test mode** (when keys exist): set `PAYMENT_PROVIDER=razorpay` and the three `RAZORPAY_*` values in `apps/api/.env`. Then point the Razorpay test-mode webhook at `https://<host>/api/v1/payments/webhooks/razorpay`, with the events `payment.authorized`, `payment.captured`, `payment.failed` and `order.paid`.

**Cleanup:** `npm run db:cleanup` now also recovers interrupted export jobs and deletes expired export files.

## 12. Git status

**Nothing was committed, pushed, staged, stashed, reset or discarded.**
- HEAD is still `af44621` (`docs(reports): add TASK-04 to TASK-04F reports`).
- 0 files are staged and there are 0 stashes.
- `git status --porcelain` has **69 entries**: 23 tracked files modified or deleted, and 46 untracked paths. At the start of TASK-11 there were 64.

**The 5 new entries:**
- `apps/api/src/admin/`
- `apps/api/src/export/`
- `apps/api/src/payments/`
- `apps/api/src/testing/fake-razorpay.ts`
- `docs/reports/TASK-11-CORE-PRODUCT-COMPLETION.md`

**Changes inside paths that were already modified or untracked:**
- **API:**
  - the migration folder `apps/api/prisma/migrations/20261025110132_payments_entitlements_exports/`
  - `schema.prisma`
  - `app.ts`, `server.ts`, `config.ts`, `config.test.ts`
  - `auth/authorize.ts`, `auth/auth.db.test.ts`
  - `files/file-routes.ts`, `files/file-store.ts`
  - `testing/sprint-harness.ts`
  - `tools/cleanup.ts`, `tools/export-bench.ts`
  - `apps/api/package.json` (`bench:export`)
  - `apps/api/.env.example`
- **Shared and docs:** `packages/shared/src/index.ts`, `README.md`.
- **Web:**
  - `components/ui/button.tsx`
  - `lib/api/portal.ts`, `lib/format.ts`, `lib/status.ts`
  - the dashboard, admin and genealogist pages listed in §5
  - the `dashboard` and `genealogist` layouts

**Prior uncommitted work is intact.** The 23 tracked modifications are the same files as at the start of the task. Every earlier untracked path is still present. The changes listed above extend that work; nothing earlier was removed or reverted.

**Protected files:**
- `docs/00-ROADMAP.md`, `docs/01-PRODUCT-FLOWS.md`, `docs/02-DATA-MODEL.md` and `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md` have **no diff**.
- The earlier reports are unchanged.
- The two root SVGs (`Kulvriksh-V3-Desktop-1440.svg`, `Kulvriksh-V3-Mobile-390.svg`) are untracked, and were not opened, inspected or modified.

**Test-only artifacts:**
- Browser-test scripts, outputs and screenshots live in the session scratchpad, not in the repository.
- The temporary helper scripts copied into `apps/api` to run the database cleanup were deleted after each use.
- All test rows and stored files were removed (see §7).
