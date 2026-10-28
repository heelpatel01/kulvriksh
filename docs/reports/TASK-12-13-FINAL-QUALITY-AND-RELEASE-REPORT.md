# TASK-12/13 — Final Quality, PDF Export and Release Sprint

**Date:** 2026-10-26 · **Branch:** `main` at `af44621` · **Nothing committed, pushed, staged or stashed.**

**In short:**
- Family tree PDFs now render **Gujarati, Devanagari and Latin (with accents)** correctly. Text is shaped by HarfBuzz and drawn with embedded, OFL-licensed Noto font subsets. Every text element in the PDF goes through the shaper. Characters outside the fonts are reported, never replaced silently.
- All three PDF modes were rendered and inspected visually. Five layout defects were found and fixed.
- The export form now shows an estimate before the PDF is created:
  - the printed name size, with a readability rating
  - the sheet layout and the page count
  - a target number of sheets, with guidance when the page limit would be exceeded
- The form also remembers the last-used settings and handles cancel, retry, expiry and failure.
- The admin notification and system screens are now real, and obsolete mock code is removed.
- Two defects found by the test runs were fixed:
  - an OTP request race that could send two codes inside the cooldown
  - an export estimate that went stale after people were added
- Results:
  - `npm run check`: pass
  - `npm run test:db`: 99/99
  - six browser suites: 60/60
- A backup was **restored and verified** (32 tables, 247 rows matched).
- A live Razorpay test remains **blocked**: no credentials are configured.

---

## 1. Features delivered

| Area | What changed |
|---|---|
| **Unicode PDF text (P0)** | HarfBuzz shaping (`harfbuzzjs`) for every text element: titles, names, index, footers, overview labels and instructions. Fonts are embedded as Type0/CIDFontType2 subsets with Identity-H, `/W` widths, a ToUnicode CMap and `/ActualText` spans, so copy-and-paste and search return the exact name, even for reordered Indic glyphs. |
| **Script itemisation** | Text is split into runs per script: Gujarati → Noto Sans Gujarati, Devanagari → Noto Sans Devanagari, everything else → Noto Sans. Punctuation, digits and spaces stay in the surrounding run's font when it has the glyph. A character no font covers (for example Tamil) is drawn as an empty box, counted, and reported as the warning `unsupported_characters`. It is never replaced with "?". |
| **Wrapping** | Names wrap between words. An over-long word breaks after a hyphen if possible, otherwise between grapheme clusters, so a vowel sign or virama is never separated from its consonant. Beyond four lines the name is cut with "…". Lines with Indic text are taller (1.5×) so that matras do not collide. |
| **Printable sheets** | The overlap between sheets is now at least one box plus 3 mm, so every person appears whole on at least one sheet, and the index points to that sheet. The drawing is centred in the sheet grid. The assembly page has sheet-number tabs, and its instructions state the real overlap in mm. |
| **Target sheets** | In the *Printable sheets* mode, the customer can choose "Number of sheets". The API then searches for the largest scale (25–400%) that fits. If the target cannot be reached, it warns `target_sheets_unreachable` and uses the fewest sheets possible. |
| **Export estimate** | `POST /api/v1/family/exports/preview` (customer; genealogist only when export is enabled for them). It runs the same planner as the renderer in a worker, with at most 2 at once (429 `PREVIEW_BUSY`) and a 20 s limit, and creates no job. It returns the page count and limit, the sheet grid, the effective printed name size (pt), the scale and any warnings. |
| **Export panel (web)** | See §7. |
| **Admin › Notifications** | `GET /admin/notifications` (`notifications.read`, admin only). It shows the candidate events (Flows §11.1) with their status ("Active" or "Awaiting decision (R36)"), delivery totals by event, channel and status, and the 25 most recent notifications. It never shows titles, bodies or addresses. |
| **Admin › System & integrations** | `GET /admin/system` (`system.read`, admin only). It shows the real status of 8 integrations, read from this server's configuration: database, storage, payments, OTP SMS, email, SMS notifications, text-to-speech and PDF. It has no editable fields and shows no secrets. The fake settings form is deleted. |
| **Landing page** | The services teaser shows the real active catalogue (up to four), with the same cache tag as `/services`, so admin changes appear on the next request. |
| **Mock code removed** | Deleted: `lib/repositories/customer.ts`, `lib/repositories/genealogist.ts`, `lib/sample-data/{customer,admin,research,catalogue}.ts`, `notifications-admin.tsx` and `system-settings-form.tsx`. Only the surname sample data (R2) remains, labelled. |
| **Backups** | `npm run db:backup` (`pg_dump -Fc` into the git-ignored `.data/backups/`) and `npm run db:restore-check`. The restore check restores into a temporary database, compares every table's row count with the source, then drops the temporary database. |
| **Fixes** | The OTP race (§10). The estimate refreshing after family edits (§5). |

## 2. Dependencies, versions, font licences and rationale

| Item | Version | Licence | Why |
|---|---|---|---|
| `harfbuzzjs` (API) | **1.6.3** (exact pin) | MIT; 0 dependencies; about 1.3 MB | HarfBuzz is the reference OpenType shaper (used by Chrome, Firefox and Android). Gujarati and Devanagari need GSUB/GPOS shaping (conjuncts, reph, pre-base matras, mark positioning), which no PDF library does correctly with plain text drawing. It ships as WebAssembly: no native build step and no platform binaries. Its standalone subsetter (`harfbuzz-subset.wasm`) cuts each font down to the glyphs actually used. |
| Noto Sans Regular | 2.015 | SIL OFL 1.1 | Latin, with full accent coverage (á, é, Ā, Ś…) and general punctuation |
| Noto Sans Gujarati Regular | 2.106 | SIL OFL 1.1 | Gujarati |
| Noto Sans Devanagari Regular | 2.007 | SIL OFL 1.1 | Devanagari |

Font notes:
- The fonts are in `apps/api/assets/fonts/`, together with their three OFL licence texts (`OFL-NotoSans.txt`, `OFL-NotoSansGujarati.txt` and `OFL-NotoSansDevanagari.txt`).
- The OFL allows embedding and subsetting in documents.
- The fonts are static (no variation axes) and share one design, so mixed-script names look consistent.
- Bold titles use a stroke over the regular weight, which avoids shipping three more fonts.
- No other dependency was added.

## 3. Scripts verified and sample names

**Required names**, all rendered, inspected and checked in the PDF text:
- હીર પટેલ, જયેશભાઈ પટેલ, વડોદરા
- हीर पटेल, राजेश कुमार, परिवार वृक्ष
- Heel Patel, José Álvarez, Ānand

**Also checked:**
- **conjuncts:** ક્ષ, ત્ર, श्र, क्ष
- **reph and pre-base vowel signs:** the ि in परिवार is drawn before र
- **combining marks:** vowel signs and anusvara, placed with offsets
- **mixed scripts in one name:** "Mixed नाम ગુજરાતી 42", "Heel જયેશભાઈ पटेल Álvarez-Ānandakrishnan"
- **punctuation:** O'Brien-Smith, Jr. (Ravi) — "Dada"
- **long names:** wrapping and the four-line cap
- **an unsupported script (Tamil):** counted and warned about, drawn as boxes

**How it was verified:**

| Check | Evidence |
|---|---|
| **Unit tests** (`tree-export.test.ts`, "text shaping" suite) | Shaped glyph sequences: conjuncts form ligatures; the Devanagari ि is reordered; mark offsets; fallback per run; missing-character counting; grapheme-safe and hyphen wrapping. |
| **DB test** (`export.db.test.ts`) | A Unicode family is exported through the real worker. The PDF's ActualText contains every name, and the three fonts are embedded. |
| **Browser test** (§12) | Names are typed into the UI, the PDF is downloaded, and its text and fonts are checked. |
| **Visual check** (§4) | pdf.js renders of every mode, zoomed in on the Indic text. |
| **Text extraction** | `pdftotext -enc UTF-8` (Xpdf 4.00) returns the exact names. |

## 4. Modes inspected visually

PDFs were rendered with pdf.js 3.11.174 in headless Chrome and the screenshots inspected:

| PDF | What was looked at |
|---|---|
| Small family, one A4 page, portrait and landscape | Layout, title block, legend, index page |
| Deep family (15 generations), poster | Vertical spacing, connectors |
| Wide family (25 siblings), printable A4 sheets | Assembly page, an interior sheet (5), the last sheet, overlap guides, registration marks |
| 150 people: one A2 page, and A3 sheets at 80% | Sheet 3, the assembly page, index references |
| 400 people, poster at 60% | Overall readability |
| 3000-person stress test, A3 sheets at 50% | Assembly page, index pages |
| Unicode samples in all three modes | Names in all three scripts, zoomed |
| The browser-test PDF (8 names, A3 + index) | Both pages |

The review found no unsupported characters, and every name shaped correctly.

One thing looked like a defect but was not: a faint grey line at the left sheet guide, visible only in pdf.js. The content stream shows a single 0.3 pt guide line, so it is an anti-aliasing artefact.

## 5. Visual and UX defects found and fixed

1. **People cut in half at sheet edges.** The overlap was smaller than a box, so a person could be split across two sheets with neither showing them whole. **Fix:** the overlap is now at least one box plus 3 mm, and the index points to the sheet that shows the person whole. Unit test: "every person appears whole on the sheet the index names".
2. **Tree not centred on its sheets.** **Fix:** the drawing is centred in the sheet grid (`offsetX` and `offsetY`). Unit test added.
3. **Assembly page: sheet numbers covered the miniature, and the instructions overflowed.** **Fix:** the numbers are now tabs at each cell's top-left corner on a white backing, and the instruction text wraps automatically and gives the actual overlap in mm.
4. **A long hyphenated name left one letter alone** ("…Ānandakrishna / n"), seen in the browser-test PDF. **Fix:** an over-long word now breaks after its last hyphen that fits ("Álvarez-" / "Ānandakrishnan"). Re-rendered and checked; unit test added.
5. **The estimate went stale after adding people.** The browser test showed "5 people" for an 8-person family, because the estimate refreshed only when the options changed. **Fix:** the estimate also refreshes whenever the family re-renders. The browser test now asserts the full count.

## 6. Performance: before and after

`npm run bench:export -w @kulvriksh/api` on the Windows development machine (Node 24.13.0). Synthetic families, with no database. Times include layout, drawing, shaping, subsetting and compression.

| Members | Mode | TASK-11 (Latin only, no shaping) | TASK-12 (Latin names) | TASK-12 (Gujarati, Devanagari and Latin names) |
|---|---|---|---|---|
| 1000 | single A3 | 74 ms, 51 KB, +15 MB | 155 ms, 79 KB, +50 MB | 230 ms, 117 KB, +56 MB |
| 1000 | tiled A4 | 167 ms, 107 pages, +26 MB | 254 ms, 127 pages, +61 MB | 445 ms, 162 pages, +67 MB |
| 2000 | tiled A4 | 412 ms, 312 pages | 524 ms, 350 pages, +109 MB | — |
| 5000 | single A3 | 281 ms, 237 KB, +71 MB | 568 ms, 353 KB, +131 MB | 604 ms, 451 KB, +187 MB |
| 5000 | poster | 248 ms | 502 ms | 749 ms |
| 5000 | tiled A4 | 1357 ms, 1108 pages, 3.6 MB, +101 MB | 2015 ms, 1262 pages, 4.3 MB, +247 MB | 2690 ms, 1674 pages, 5.4 MB, +256 MB |

What changed:
- **Cost:** correct shaping and embedded fonts roughly double the time and memory. The worst case is still about 2.7 s for 5000 people over 1674 pages. That is well within the 120 s worker timeout and the 512 MB worker memory limit.
- **Optimisations:** per-glyph advances are cached, and shaping results are cached per string (up to 20,000).
- **More sheets for tiled exports:** the wider overlap from §5 means more pages, but no person is ever cut.
- **Benchmark variation:** the 5000-member tiled time varied between 1.8 and 2.0 s across runs.

**Load test** (test database, 4 customers with 2000 members each, `EXPORT_CONCURRENCY=1`):

| Measure | Result |
|---|---|
| 3 exports | Ran one at a time, finishing at 1.1 s, 2.9 s and 4.4 s. A queued export was cancelled (204). |
| `/health` during the exports | p50 2 ms, p99 14 ms, max 14 ms: the API stays responsive because exports run in workers |
| 20 concurrent orders with one idempotency key | **1 order** (200/201, 516 ms) |
| Queue full | The 429 is covered by a DB test |

`EXPORT_CONCURRENCY` stays at **1**. Raising it needs measurements on the production hardware (§15).

## 7. Export UX

**Mode explanations.** Each mode has a one-line hint. For example, *Printable sheets*: "The tree at one constant size, split over ordinary sheets you print at home and join…".

**Printed-size estimate.** It appears 600 ms after the options stop changing. It shows:
- **the printed name size** in pt, rated *easy to read* (≥ 6 pt), *small* (≥ 3.5 pt) or *too small to read*
- **the sheet layout:** for example "2 sheets (2 × 1), each 297 × 210 mm, at 180.8%"
- **pages in the PDF**, and how many people they show

**Readability and sheet count.** Choose *Scale* or *Number of sheets*. The hint explains the trade-off: "More sheets means bigger, easier-to-read names; fewer sheets means smaller names." Warnings appear for small names, unreadable names and an unreachable target.

**Over the limit.** A "Too many pages" notice gives the page count and the limit, and lists the ways out: a smaller scale or fewer sheets, a larger sheet size, part of the tree, or turning off the index. *Create PDF* is disabled. The server enforces the same limit.

**Last-used settings.** The form starts from the customer's most recent export: mode, page size, orientation, name size, scale or sheets, toggles and scope. A subtree person who has since been removed falls back to the whole tree.

**Progress, cancel, retry, expiry and failure:**
- *Waiting* and *Preparing* show a progress bar.
- *Cancel* is available for queued or running exports.
- A failed export shows the reason, with *Try again* using the same options.
- A ready export shows its expiry time; after it expires, *Create again* is offered.
- Repeated clicks create one job, which the server enforces.

## 8. Screens and workflows completed

| Screen or workflow | Status |
|---|---|
| Family › Download as PDF | Real: estimate, target sheets, Unicode output |
| Admin › Notifications | Real (read-only delivery view) |
| Admin › System & integrations | Real status |
| Admin › Roles & access | Shows `notifications.read` and `system.read` |
| Landing page › services teaser | Real catalogue |
| Mock repositories | Removed, except surname pages (R2) |

These remain as specified or blocked, with no invented behaviour:
- **R2, surname pages:** no content model exists, so the screen stays sample and labelled.
- **R36/R37, notification templates and email/SMS:** no event list, wording or provider is agreed.
- **R35/R10, customer status changes:** stay read-only.
- **R17/FQ-9, member fields and media linking:** still TBC.
- **Genealogist availability:** not designed.

## 9. Still sample, blocked or awaiting decisions

- **Surname pages** (R2): sample data, labelled.
- **Notification templates and per-event switches** (R36), and **email and SMS providers** (R37).
- **Customer status management** (R35, R10).
- **Extra member fields and media-to-member links** (R17, FQ-9).
- **Genealogist availability**: no design.
- **Live Razorpay** (§14).
- **Admin MFA requirement** (R34). Staging (R11). Hosting (D6).
- **Genealogist and admin export** (R28/FQ-25, FQ-14): off by default.
- **Entitlement gates** (R14): empty by default.

## 10. Security findings

| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | **OTP request race.** Two concurrent code requests for one number could both succeed: B's cooldown check ran before A committed, then B invalidated A's code and issued a second one. Two SMS codes would go out inside the cooldown, which weakens per-number rate limiting. Found by the existing DB test, which failed once in this sprint. | Medium | **Fixed:** a per-number transaction advisory lock (`pg_advisory_xact_lock`) serialises the check and the insert. The test passed 5 times in a row, then in the full suite. |
| S2 | **PDF content injection.** Names reach the PDF only as glyph IDs (hex) and UTF-16 ActualText (hex), never as literal strings. | — | No issue |
| S3 | **New admin endpoints** (`/admin/notifications`, `/admin/system`). Both are admin only. They return no message bodies, addresses or credentials; integration details are fixed text. The browser test confirmed the page has no form fields. | — | No issue |
| S4 | **Preview endpoint.** It requires a session, validates options with the same schema as export, runs in a worker with a 20 s timeout and the worker memory limit, and allows 2 at once. | Low (residual) | A single customer could keep the 2 slots busy, making previews answer 429 for others. Exports are unaffected. Before production, add a per-user rate limit. |
| S5 | **Backups.** Passwords are passed only in `PGPASSWORD`, never on the command line or in logs. The dump contains personal data and credential hashes, and is unencrypted on local disk (git-ignored). | Production item | §15: encrypt, store off-site, limit access, set retention. |
| S6 | **Secrets scan** of the working tree, excluding `node_modules`, builds and data. | — | No real secrets. The only matches are `CHANGE_ME` placeholders and deliberately fake test strings. `.env`, `.data` and `dist` are git-ignored. The generated test-staff password exists only in the session scratchpad. |
| S7 | **Fonts and WASM** load from fixed paths inside the package, never from user input. Font subsetting uses only glyph IDs. | — | No issue |

Earlier controls were re-verified by the regression suites (§12):
- session cookie flags
- server-side authorisation
- 404 for other customers' files
- private, no-store downloads
- MFA
- one-time staff links
- CSRF refusal of cross-site uploads
- no external requests

## 11. Exact commands and results

| Command | Result |
|---|---|
| `npm run check` | **exit 0**. API: 264 tests, 165 pass, 0 fail, 99 skipped (the DB tests, which run under `test:db`). Web: 10/10. Typecheck, lint and both builds pass. |
| `npm run test:db` | **exit 0**: 99 tests, 99 pass, 0 fail. The first run in this sprint failed 1 test (S1). It was fixed and rerun, not skipped. |
| `npm run bench:export -w @kulvriksh/api` | exit 0 (table in §6) |
| `npm run bench:export -w @kulvriksh/api -- indic` | exit 0 (table in §6) |
| `npm run build -w @kulvriksh/web` | exit 0, no warnings |
| `npm run db:backup` | `kulvriksh-…dump` (128,186 bytes), taken while the browser-test data existed |
| `npm run db:restore-check` | "restored … into kulvriksh_restore_check: 32 tables, 247 rows" → "**restore check passed: every table and row count matches kulvriksh**" → "temporary database kulvriksh_restore_check dropped". An earlier run on the nearly empty database also passed (32 tables, 5 rows). |
| `node --test src/export/tree-export.test.ts` (in `apps/api`) | 29/29 |
| `node --env-file=.env --test src/auth/auth.db.test.ts` × 5 | 18/18 each time |
| Built `dist` worker smoke test | `runExportInWorker` from `apps/api/dist`: ok, 14,543 bytes, fonts NotoSans, NotoSansGujarati and NotoSansDevanagari (proves the fonts resolve from the build output) |

## 12. Browser regression

The setup:
- the production web build (`next start`) on :3105, and a "dead API" dev server on :3107
- the real API on :4100, with PostgreSQL 18 on :5434 and local storage
- headless Chrome, with a fresh profile per suite
- staff accounts created with the development-only tool and a generated password

**Final run, after the last code change:**

| Suite | API settings | Result |
|---|---|---|
| TASK-08A sign-in | default | **12/12** |
| TASK-09 | default | **15/15** |
| TASK-08A services | default | **4/4** |
| TASK-11 | `PAYMENT_PROVIDER=development`, `ENTITLEMENT_GATES=tree_export=family.export` | **9/9** |
| **TASK-12 (new)** | `EXPORT_MAX_PAGES=2` (to show the over-limit guidance with a small family) | **10/10** |
| TASK-10 | default | **10/10** |

There were no browser errors and no external requests in any suite.

**The new TASK-12 suite checks:**
1. A family named in all three scripts (8 people, a mixed-script workspace name) is saved and listed exactly.
2. The first estimate shows the printed name size with a rating, the page size, and "2 pages · **8 people**".
3. Printable sheets with "Number of sheets" = 2 shows "2 sheets (2 × 1) … at 180.8%". With 4 pages against a limit of 2, the "Too many pages" guidance appears and *Create PDF* is disabled.
4. One A3 page with the index:
   - the PDF is created and downloaded as `application/pdf`, private and no-store, 20,816 bytes
   - its ActualText contains all 8 names and the workspace name, with no replacement characters
   - Noto Sans, Noto Sans Gujarati and Noto Sans Devanagari are embedded
5. Reopening the page restores the mode (one page), page size (A3) and index setting.
6. Admin › Notifications shows the 6 candidate events and "not connected" for email and SMS, with no sample text.
7. Admin › System shows 8 integrations with status and no form fields.
8. Roles & access lists `notifications.read` and `system.read`.
9. A newly activated service appears in the landing-page teaser.
10. No request leaves the site.

**Problems in the first run.** These were test-setup issues, not product defects:
- My staff accounts lacked the name suffix that the TASK-09 script expects.
- TASK-10 enrols the shared admin in two-step sign-in, so TASK-11 could not sign in after it. The order was changed to run TASK-10 last.

Both were corrected and the full set rerun.

## 13. Database and storage cleanup

- Every test row was deleted by a cleanup that targets only the test customers' numbers, the tagged `e2e-*` staff, and the services and orders those tests created. It ran three times, once after each browser run.
- **Final state:**
  - `kulvriksh`: 31 tables, **0 rows**
  - `kulvriksh_test`: 31 tables, **0 rows**
  - `kulvriksh_restore_check`: **dropped**
  - `.data/storage`: **0 files**
  - `.data/backups`: **empty** (my two backup files were deleted)
- The DB-test and load-test harnesses clean up after themselves.
- Port 5433 (SkillSure) was never used.
- No customer data existed before the runs, and none was changed.
- No servers or Chrome instances from this task are left running.
- Test scripts, logs, PDFs and screenshots live in the session scratchpad, not in the repository.

## 14. Razorpay status

- **Verified locally:**
  - the adapter against the local Razorpay test double: orders, checkout verification, signed webhooks, amount and currency checks, idempotency, reconciliation and grant recovery (DB tests)
  - the concurrent idempotent order burst (§6)
  - the full purchase flow in the browser with the development simulator (TASK-11 suite: a failed payment, then a successful one, then access granted)
- **Not verified: a live Razorpay test-mode payment.** `apps/api/.env` has no `RAZORPAY_*` settings and `PAYMENT_PROVIDER` is unset. The test is **blocked on credentials**.
- No credentials were invented, and the simulator is not claimed as Razorpay verification.
- To run it:
  1. Add the test keys and webhook secret to `apps/api/.env` with `PAYMENT_PROVIDER=razorpay`.
  2. Expose `/api/v1/payments/webhooks/razorpay` over HTTPS.
  3. Run one successful and one failed test payment.

## 15. Production deployment requirements

**Code and files to deploy:**
- Deploy `apps/api/dist`, **`apps/api/assets/fonts`** (fonts and OFL texts), and the production `node_modules`, including `harfbuzzjs` with its `.wasm` files.
- Node 24.

**Database:**
- PostgreSQL 18 with the migration and runtime roles separated, as in development.

**Backups:**
- Schedule backups.
- **Encrypt them and keep them off-site** with limited access and a retention period.
- Run `restore-check`-style restores regularly.

**Storage:**
- Private object storage, or a persistent private disk for `STORAGE_LOCAL_DIR`.

**Export settings:**
- Keep `EXPORT_CONCURRENCY=1` until it is measured on the production hardware.
- Each export worker can use up to `EXPORT_WORKER_MEMORY_MB` (512 MB). Size the host for that plus the API (about 330 MB peak RSS was measured for 5000-person tiled exports).

**Providers and network:**
- An SMS provider for sign-in codes (R37). Without one, code requests answer 503 in production.
- Razorpay live keys, and the webhook URL over HTTPS (§14).
- The HTTPS reverse proxy chain and trusted-proxy setting (AC-14). Hosting (D6). Staging (R11).

**Before launch:**
- Add a per-user rate limit on export preview (S4).
- Decide on admin MFA (R34) before launch.

## 16. Release blockers, most severe first

1. **No SMS provider (R37).** Customers cannot sign in outside development.
2. **No live payment verification.** Razorpay credentials are needed (§14).
3. **Hosting, HTTPS, proxy chain and staging** are not decided (D6, AC-14, R11).
4. **Production backups** need scheduling, encryption and off-site storage. The mechanism and the restore are proven locally.
5. **Specifications are unapproved drafts.** Product decisions are still open: R2, R14, R34, R35, R36 and FQ-9/14/25.
6. **Admin MFA policy (R34).** MFA is available but not required.
7. **Per-user rate limit on export preview** (S4, low).

No blocker remains in the PDF export itself.

## 17. Git status

- `HEAD` is `af44621` on `main`.
- **Nothing staged** (`git diff --cached` is empty), **no stashes**, nothing committed or pushed.
- No reset, discard or revert was run.
- All earlier uncommitted and untracked work is preserved.
- The two protected root SVGs were not opened or edited.
- The protected specifications (`docs/00-ROADMAP.md`, `01-PRODUCT-FLOWS.md`, `02-DATA-MODEL.md`, `PERFORMANCE-AND-NAVIGATION-STANDARDS.md`) and earlier reports are unchanged.

**Files changed or added in this sprint:**

API:
- **Added:**
  - `src/export/text-engine.ts`
  - `src/export/font-subset.ts`
  - `assets/fonts/*` (3 fonts and 3 licence texts)
- **Changed:**
  - `src/export/pdf-writer.ts`
  - `src/export/tree-layout.ts`
  - `src/export/tree-render.ts`
  - `src/export/export-options.ts`
  - `src/export/export-service.ts`
  - `src/export/export-routes.ts`
  - `src/export/synthetic-tree.ts`
  - `src/tools/export-bench.ts`
  - `src/admin/admin-store.ts`
  - `src/admin/admin-routes.ts`
  - `src/auth/authorize.ts`
  - `src/auth/auth-store.ts`
  - `src/app.ts`
  - `src/server.ts`
- **Tests changed:**
  - `tree-export.test.ts`
  - `export.db.test.ts`
  - `admin.db.test.ts`
- `package.json`: `harfbuzzjs` added

Web:
- **Changed:**
  - `app/dashboard/family/export-panel.tsx`
  - `export-actions.ts`
  - `app/admin/notifications/page.tsx`
  - `app/admin/settings/page.tsx`
  - `app/(public)/page.tsx`
  - `lib/api/portal.ts`
  - `lib/repositories/admin.ts`
  - `lib/repositories/public.ts`
- **Deleted** (all mock or fake):
  - `lib/repositories/customer.ts`
  - `lib/repositories/genealogist.ts`
  - `lib/sample-data/{customer,admin,research,catalogue}.ts`
  - `app/admin/notifications/notifications-admin.tsx`
  - `app/admin/settings/system-settings-form.tsx`

Shared:
- `packages/shared/src/index.ts`

Root:
- `scripts/local-db.mjs`
- `package.json`: `db:backup` and `db:restore-check`
- `package-lock.json`
- `README.md`
- this report
