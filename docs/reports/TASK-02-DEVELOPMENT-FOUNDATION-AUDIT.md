# TASK-02 — Development Foundation Audit

| Item | Value |
|---|---|
| Task ID | TASK-02 |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Type | Audit and planning only. No application code, configuration, dependency, migration or specification change. |
| Files changed | This report only (created) |
| Status | Completed. **Awaiting review.** Nothing in this report is approved until reviewed. |

---

## 1. Summary

1. **The repository contains no application code.** It holds five Markdown files only:
   - four specifications
   - the TASK-01 report

   It has no frontend, backend, package manifest, lockfile, `node_modules`, configuration, environment file, Prisma schema, migration, test or design asset (evidence §10.1, I1–I4).
2. **The project folder is not a Git repository.** Git 2.52.0 is installed, but `git status` fails. There is no history and no revert path (I5).
3. **Local tooling:**
   - **Available:** Node v24.13.0, npm 11.6.2 and Corepack 0.34.5
   - **Not available:** pnpm, Yarn, PostgreSQL (`psql`, `postgres`, `pg_ctl`) and Docker (I6, I7)
   - **Consequence:** local database development cannot start until a PostgreSQL installation method is chosen (AC-7).
4. **No document is approved.**
   - The roadmap, flows and data model are marked "Draft for review". The data model also says "Not approved for schema implementation".
   - The performance standard is "Proposed".
   - TASK-01 is "Awaiting review" (evidence §10.2, D1).
5. **The documented stack is internally consistent:** Next.js + TypeScript, Express + TypeScript, PostgreSQL, Prisma, Razorpay, VPS-local media through a storage abstraction. Nothing points to MongoDB or another frontend. **But the Next.js decision itself is recorded as "pending client review"** (AC-1).
6. **Main conflict:** this task's milestone list puts the public website near the end, while the roadmap schedules it in Phase 3 (Weeks 2–3, CP3). Reordering is a timeline change that needs approval (AC-2).
7. **The homepage design selection is not in any register** (AC-3). **The "supplied homepage references" were not found** in the repository or in the task message. Only the written direction (ivory, forest green, restrained terracotta, refined typography) is available.
8. **Safe to start once approved:**
   - Milestone M0 (repository and governance)
   - the non-domain parts of M1 (API foundation) and M2 (web foundation and design-system base)

   Everything that creates domain tables waits for the data-model and CP2 approvals.

---

## 2. Repository findings

| Area | Finding | Evidence |
|---|---|---|
| Files | `docs/00-ROADMAP.md`, `docs/01-PRODUCT-FLOWS.md`, `docs/02-DATA-MODEL.md`, `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md`, `docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md`. Nothing else. | I1, I2 |
| Application code (frontend, backend, shared) | **None** | I3 |
| Package manifests and lockfiles | None | I3 |
| `node_modules` / installed project dependencies | None | I3 |
| Environment files (`.env*`) | None (and so no secrets in the repository) | I3 |
| Prisma schema, SQL or migrations | None | I3 |
| Config (`tsconfig`, `*.config.*`, Docker, CI YAML) | None | I3 |
| Design assets (images, PDF, Figma, HTML) | None, so the homepage references are not in the repository | I4 |
| Git | Git 2.52.0 is installed; **the folder is not a repository** | I5 |
| Runtime | Node v24.13.0; npm 11.6.2; Corepack 0.34.5; no pnpm or Yarn | I6 |
| Database and containers | No PostgreSQL client or server; no Docker | I7 |
| OS | Windows 11 (MINGW64/MSYS shell used for the commands) | I8 |
| Specification integrity | Checksums match the post-TASK-01 values. The roadmap and performance standard are unchanged since their last authorised edits. | I9 |

**Implementation status:** nothing is implemented. No service or workflow exists or has been tested.

---

## 3. Specification status

| Document | Stated status | What is still draft or unresolved |
|---|---|---|
| `00-ROADMAP.md` | Draft for review (line 6) | Client sign-off (CP1) not recorded. 48 TBC items (R1–R48). Change log #1 (the Next.js decision) is "Recorded — pending client review" (line 697). Staging is TBC (line 72). |
| `01-PRODUCT-FLOWS.md` r3 | Draft for review (line 6) | 27 open questions (FQ-1–FQ-27), not in the roadmap register. Every "Proposed" engineering default awaits CP2. |
| `02-DATA-MODEL.md` r2 | Draft; **not approved for schema implementation** (line 6) | Placeholders tied to R4, R8, R9, R12–R14, R17–R19, R21, R28, R31, R32, FQ-9, FQ-23, FQ-24 and others. DQ-1–DQ-7. Every Proposed design awaits CP2 (§15.2–§15.3). |
| `PERFORMANCE-AND-NAVIGATION-STANDARDS.md` | "Proposed engineering standard for roadmap review" (line 4) | It says to use Next.js "subject to approval in `docs/00-ROADMAP.md`" (line 16). Its targets are proposals (R46–R48). |
| `reports/TASK-01-…` | Completed, awaiting review (line 11) | TASK-01's changes have not yet been accepted. |

**Register gap (carried forward):** FQ-1–FQ-27, DQ-1–DQ-7, and now AC-3 (the homepage design), are not in the roadmap's TBC register. Updating the register needs an authorised roadmap edit.

---

## 4. Architecture reconciliation

### 4.1 Documented stack: consistency check

| Layer | Roadmap §2 | Flows §1.6 | Data model | Performance standard | Project owner direction | Consistent? |
|---|---|---|---|---|---|---|
| Frontend | Next.js (React), TypeScript where appropriate | Next.js | Next.js never connects to the database (§9.7) | Next.js, "subject to approval" | Next.js + TypeScript | Yes, but the **approval status differs** (AC-1) |
| Backend | Node.js, Express, TypeScript | Express is the authoritative API | Express API | — | Express + TypeScript | Yes |
| Database | PostgreSQL | PostgreSQL via Prisma | PostgreSQL via Prisma | PostgreSQL | PostgreSQL | Yes |
| ORM | Prisma | Prisma | Prisma | One PrismaClient per process | Prisma | Yes |
| Payments | Razorpay | Razorpay, server-verified | Razorpay tables | — | Razorpay | Yes |
| Media | VPS NVMe through a storage abstraction | Same | `stored_file.storage_backend = local` | — | Same | Yes |
| Hosting | Hostinger VPS, 1 vCPU / 4 GB / 50 GB shared | Same | Same | Same | Same | Yes |
| Background work | No queue or Redis | In-process, PostgreSQL state | Run and item leases | No Redis by assumption | PostgreSQL-backed | Yes |

**No silent changes were made.** Nothing in the documents or the repository suggests MongoDB, another frontend framework or extra infrastructure.

### 4.2 Conflicts and decisions requiring approval

| ID | Issue | Type | Effect if left undecided | Proposed handling |
|---|---|---|---|---|
| **AC-1** | The Next.js decision is "pending client review" (roadmap line 697; performance standard line 16), but it is the project owner's required direction | Client confirmation | Low risk for local foundation work; risk of rework if the client rejects it | The owner confirms they accept the risk of proceeding locally. Record client confirmation at the next checkpoint. |
| **AC-2** | **Milestone order.** The roadmap schedules the public website in Phase 3 (Weeks 2–3, lines 122 and 596, CP3). This task lists it 10th of 11. Data model §15.3 follows the owner's order (public site third). | Owner/client decision (timeline change) | CP3 cannot be met as written if the public site moves late | **Split the public site:** build the technical SEO foundation (surname page template, metadata, sitemap, real 404s, enquiry mechanics) early in M11a, and do the homepage visual design late in M11b. Any CP3 change goes through roadmap change control. |
| **AC-3** | **The homepage design selection is not registered anywhere.** The provisional references were not found. | Client decision; register gap | The homepage cannot be finished. Design tokens stay provisional. | Add it to the roadmap register at the next authorised update. Ask the owner to place the reference files in the repository (e.g. `docs/design/references/`) in a later, authorised task. |
| **AC-4** | Repository structure is undecided (roadmap Phase 2 task) | Technical | Blocks M0 | **Proposed:** one Git repository using npm workspaces: `apps/web` (Next.js), `apps/api` (Express, Prisma), and `packages/shared` (shared types, validation schemas, error codes). Alternatives: two repositories (harder to share contracts), or pnpm workspaces (needs Corepack activation, not currently installed). |
| **AC-5** | **No Git repository; no remote decided** | Owner decision | No history, review or revert. Violates the "small, revertible changes" rule. | Run `git init` and add a `.gitignore` (covering `.env*`, `node_modules`, build output and uploads) as the first M0 step. The choice of remote host (a third-party service) and its access is the owner's decision. |
| **AC-6** | Runtime versions not pinned. Local Node is 24.13.0; the VPS Node and PostgreSQL versions are unknown. | Technical | "Works on my machine" drift | Pin the Node major version (`engines` and `.nvmrc`) and the package versions in M0. Check the current LTS status and the Next.js and Prisma compatibility at that point. **Do not assume them now.** |
| **AC-7** | **No local PostgreSQL** | Owner/technical | Blocks M3 and everything after it | **Options:** (a) native PostgreSQL for Windows; (b) PostgreSQL in WSL2; (c) Docker Desktop (not installed; licensing must be checked for commercial use). Use the same PostgreSQL major version as the VPS (TBC). The choice is the owner's. |
| **AC-8** | Staging environment TBC (R11) | Client/owner | Affects the deployment pipeline and where API performance is measured | Proceed with local development, plus production at Phase 10, as documented. Revisit at CP2. |
| **AC-9** | **Build location.** `next build` is CPU- and memory-heavy, and building on the 1 vCPU / 4 GB production VPS competes with live traffic | Technical/owner (CI is a third-party service) | Risk of out-of-memory failures or slowdowns during deployments | **Proposed:** build off the VPS (locally or in CI), then ship the built artefacts. A CI provider is a separate owner decision. |
| **AC-10** | **PDF generation technology.** A headless-browser approach (e.g. Chromium) can use hundreds of MB per instance | Technical (Milestone M7) | A risk to memory on the shared VPS | Prefer a non-browser PDF library, unless R20 (layout) requires browser rendering. Decide in M7 with a measured prototype. Not decided here. |
| **AC-11** | The data model is not approved, so no domain migrations are possible | Process | Blocks M3 onwards for domain tables | M3 delivers connectivity, the role split and the migration workflow **without domain models**. The first tables (e.g. `background_task_state`, `audit_event`, sessions) follow only after CP2 approves their designs. |
| **AC-12** | Library choices are undecided: validation, logging, test runner, HTTP security middleware, CSS approach, UI primitives, tree visualisation, PDF | Technical (dependency rule) | Blocks the respective milestones | Each one is proposed with its benefit, cost and alternatives in the task that introduces it. **None are chosen in this audit.** |
| **AC-13** | **Website languages (R3)** affect typography and fonts (e.g. Gujarati or Devanagari support) and TTS (R25) | Client | The design-system font choice could need rework | Keep the font-family tokens swappable. Confirm R3 before finalising typography. |
| **AC-14** | Session cookie and routing between Next.js server rendering and Express (roadmap Phase 2) | Technical | Affects auth (M4) and all authenticated pages | Design it in M1/M2. The proposed default is same-origin routing through the reverse proxy (`/api` → Express), mirrored locally. Decide before M4. |
| **AC-15** | TASK-01 has not been reviewed. The flows and data model it revised are the inputs to M3 and M4. | Process | Building auth on unreviewed specifications | Complete the TASK-01 review before M3/M4. |

### 4.3 VPS implications (planning estimates — **not measurements**)

The roadmap requires measurement in Phase 10. The figures below are rough planning assumptions to be replaced by measured values.

| Component on the 1 vCPU / 4 GB VPS | Indicative memory | Notes |
|---|---|---|
| OS, SSH, NGINX, monitoring agent | ~0.3–0.5 GB | |
| PostgreSQL | ~0.5–1 GB | Tune `shared_buffers` and `work_mem` conservatively, and limit connections (the Prisma pool size times the processes) |
| Next.js server (`next start`) | ~0.2–0.4 GB | Server rendering of authenticated pages uses CPU on every request. Static public pages are cheap. |
| Express API | ~0.15–0.3 GB | Plus background tasks in-process |
| Bursts: PDF, TTS handling, uploads | Variable | Must be bounded (data model §10.3). Browser-based PDF would be the largest risk (AC-10). |
| Headroom and page cache | Remainder | **Proposed:** a modest swap file as an out-of-memory safety net, not as capacity |

**Other constraints**
- **CPU:** the single vCPU is shared by server rendering, the API, PostgreSQL and background work. Expect contention under load, so the Phase 10 load test is essential.
- **Disk** (50 GB shared), approximate:
  - OS: ~5–10 GB
  - runtimes and application builds: ~2–4 GB (more if building on the server)
  - PostgreSQL data and WAL
  - rotated logs
  - local backup staging (off-server copies are required, R39)
  - media, which gets what remains

  A **disk budget**, including the media quota (R23) and the disk-full guard threshold, is needed before M7.
- **Process management:** two Node processes plus PostgreSQL behind NGINX, restarting on crash, with memory caps per process (roadmap Phase 10).

---

## 5. Proposed milestone sequence

Ordering is by dependency. Each milestone will get its own task, with scope, files, acceptance criteria, tests and a report, before work starts. **"Ready" means it can start once the listed approvals are given. It does not mean the work is approved.**

| ID | Milestone | Depends on | Status | Key acceptance evidence (summary) |
|---|---|---|---|---|
| **M0** | Repository and governance: Git init, `.gitignore`, workspace layout (AC-4), Node pin (AC-6), TypeScript/lint/format baseline, README with local setup, a secret-free `.env.example` | AC-4, AC-5, AC-6 approvals | **Ready after approval** | A clean `git status`; `npm install` from scratch; typecheck and lint pass; no secrets committed |
| **M1** | API foundation: config validation that fails fast, structured logging that excludes sensitive data, error envelope, request ID, health endpoint, security headers, test harness, SMS/email/TTS **stub** interfaces, storage abstraction (local implementation) | M0; AC-12 library approvals | Ready after M0 | Unit and integration tests; invalid configuration stops startup; no secrets in logs |
| **M2** | Web foundation and design-system base: route groups and stable layouts (public, customer, genealogist, admin), client-side navigation, loading/error/empty patterns, provisional tokens, core components, first production-build performance baseline. **No homepage.** | M0; AC-12 (CSS and UI approach, DS-1) | Ready after M0 | Production build; no full reloads between shell routes; recorded baseline; an accessibility check of components |
| **M3** | Database foundation: local PostgreSQL (AC-7), owner/runtime role split (DM §9.7), Prisma setup, migration workflow, connectivity health check. **No domain models.** | M1; AC-7; TASK-01 review (AC-15) | Ready after AC-7 | Migrations run under the owner role; the API connects as the runtime role; permission test |
| **M4** | Authentication: sessions, atomic rate limits, OTP engine with HMAC and atomic attempts (DM §5.5), **SMS stub only** | M3; **CP2 approval of the auth designs**; AC-14 | **Partially blocked:** FQ-1, FQ-2, FQ-3 (production values), FQ-4, FQ-6, R8, R9, R34, R35, DQ-1; SMS provider R37 | Concurrency tests for attempts, consume and rate limits; revocation tests; no OTP in logs |
| **M5** | Customer workspaces and members: ownership, tenant scoping, member CRUD | M4; data model approval | **Blocked:** R17, R21, FQ-8, FQ-16, R14 (gating) | Isolation (IDOR) tests |
| **M6** | Relationships and interactive tree | M5 | **Blocked:** R18, R19; tree library (AC-12) | Cycle rejection; bounded queries; measured tree performance |
| **M7** | Files, media, voice, TTS, PDF export | M1 storage abstraction, M5 | **Blocked:** R20, R23–R27, FQ-9, FQ-10, FQ-11, FQ-14, FQ-22; AC-10; disk budget (§4.3) | Content-signature validation, separate metadata and content checks, fencing tests |
| **M8** | Services, orders, Razorpay (test mode only), webhooks, grants, entitlements, reconciliation | M4; CP2 payment designs | **Blocked:** R12, **R13** (recurring plans would change the model), R14, R15, R16, FQ-5, FQ-18, FQ-24, DQ-2; Razorpay test account | Duplicate, delayed, invalid, out-of-order and retried webhook tests; crash and recovery tests. **No live keys.** |
| **M9** | Genealogist assignments, research, reports, approval and release | M5, M7 | **Blocked:** R28–R32, FQ-15, FQ-21, FQ-23, FQ-25–FQ-27, DQ-6 | Assignment-scope tests; release gating at both the API and the file layer |
| **M10** | Notifications engine and admin panel. Admin screens grow with each module; the notification outbox and dispatcher can be built early. | M3 (outbox), each module | **Partially blocked:** R33–R38, FQ-13, FQ-17, FQ-20, DQ-7. Templates stay disabled. | Fencing tests for the dispatcher; admin authorisation matrix tests |
| **M11a** | Public site technical foundation: surname page template, metadata, sitemap, real 404s, enquiry mechanics, deferred analytics | M2, M1 | **Partially blocked:** R1, R2, R4, R5, R7, FQ-12, FQ-19; AC-2 | Initial-HTML tests; 404 status tests; lab Core Web Vitals recorded |
| **M11b** | Homepage and public visual design | M11a | **Blocked:** homepage design selection (AC-3), R2 content, R3, R45 | Client sign-off on the design |
| **M12** | Testing, security, deployment and handover. **Runs continuously**, with release activities at the end. | All | **Blocked for VPS work:** VPS, domain and DNS access; R39–R42, R44; AC-8, AC-9 | Restore test, smoke tests, load test, security review |

### 5.1 Can begin now (after this audit is approved)

1. **M0**, once AC-4, AC-5 and AC-6 are approved.
2. **M1** (non-domain API foundation) and **M2** (web shell and design-system base), after M0, with each library choice approved under AC-12.
3. **M3** connectivity and role split, once AC-7 is decided. Only after the TASK-01 review, and with no domain models.
4. **M11a** technical SEO mechanics using placeholder content, after M2, if AC-2 approves early sequencing.

### 5.2 Blocked

| Blocker | Milestones blocked |
|---|---|
| CP2 technical approval of the Proposed designs | M4, M8, M10 and any domain table |
| Data-model approval | M5–M9 |
| Client decisions (§7.1) | M4–M11b (see the table above) |
| External access (Razorpay test account, SMS, email and TTS providers, VPS, domain) | M8, M10 delivery, M12 |

---

## 6. Design system and UX plan (proposal for review; nothing built)

### 6.1 Principles
- **One design system** for all four areas (public, customer, genealogist, admin), with area-specific density. The admin area is the most data-dense.
- **Function first:** information architecture, forms, states and navigation take priority over decoration. **No decorative hero animation** work until the core platform exists and the homepage design is chosen.
- **Accessibility:** semantic HTML, keyboard operation, visible focus, labelled form controls, error messages linked to their fields, sufficient contrast (target level R45), and respect for reduced-motion preferences.
- **Performance** ([Roadmap §12](../00-ROADMAP.md)): Server Components by default, minimal client JavaScript, `next/font` with only the weights needed, reserved media dimensions, and client-side navigation.

### 6.2 Tokens (provisional — values not chosen)

| Group | Roles | Provisional direction |
|---|---|---|
| Colour | `bg` (warm ivory), `surface`, `surface-raised`, `text`, `text-muted`, `border`, `primary` (forest green), `primary-contrast`, `accent` (restrained terracotta, used sparingly), plus semantic `success`, `warning`, `danger` and `info` | Exact values are **not chosen** in this audit. They are set in M2 and contrast-checked against R45. They are provisional until the homepage and brand selection (AC-3). |
| Typography | `font-display` (a refined serif for public headings), `font-ui` (a highly legible sans for application UI), a size scale, line heights | Families **not chosen**. They must support the R3 languages (AC-13). |
| Space, radius, elevation, motion | Spacing scale, radius scale, shadow levels, motion durations (all short, respecting reduced motion) | Defined in M2 |
| Layout | Breakpoints, content widths, page gutters | Defined in M2; responsive down to phone width |

**Homepage flexibility:** the public layout consumes tokens only, and the homepage is composed of independent sections. Selecting a different homepage design should change tokens and section composition, not the platform's structure.

### 6.3 Component inventory (built incrementally, with each milestone)

| Category | Components |
|---|---|
| Foundations | Buttons, links, icons, badges (including order, report and job status), typography |
| Forms | Text, number, select, checkbox/radio, date (when R17 requires it), OTP input, file upload with per-file progress, field wrapper with label, help and error, form-level error summary |
| Data | Table with server-side pagination, sorting and filtering; description list; card; empty state; skeleton |
| Feedback | Toast, inline alert, confirmation dialog (focus-trapped), progress indicator, error page (401, 403, 404, 500 patterns from flows §12.1) |
| Navigation | Public header and footer, portal side or top navigation, breadcrumbs, tabs, pagination |
| Domain | Audio player (with seeking), media gallery tile with reserved aspect ratio, tree canvas container (library per AC-12), report status timeline |

### 6.4 Information architecture (from flows §1.6; routes indicative)
- **Public:** home, other public pages (R1), surname pages, service discovery, enquiry, sign-in.
- **Customer portal:** dashboard, workspaces (members, tree, media, reports), orders, profile.
- **Genealogist portal:** assigned families, research, reports.
- **Admin:** customers, genealogists, assignments, families, services and plans, orders and payments with an attention queue, enquiries, report approvals, notifications, audit.

### 6.5 Design-system decisions required (DS)

| ID | Decision | Options | Notes |
|---|---|---|---|
| DS-1 | Styling approach | Utility CSS (e.g. Tailwind CSS), CSS Modules with custom properties, or both | Affects bundle size, consistency and team familiarity. Decide in M2. |
| DS-2 | Accessible primitives | Headless primitives library (e.g. Radix UI) vs hand-built | Headless primitives reduce accessibility risk for dialogs, menus and comboboxes |
| DS-3 | Icon set | An open-source icon set vs custom | Licence and bundle size |
| DS-4 | Font families | After R3 (languages) and AC-3 (homepage design) | Self-hosted through `next/font` |

---

## 7. Blockers and decisions (prioritised)

### 7.1 Client / business decisions

| Priority | Decision | Unblocks |
|---|---|---|
| 1 | Confirm the Next.js decision (AC-1) and the milestone sequencing and CP3 handling (AC-2) | Timeline baseline |
| 2 | FQ-1, FQ-2, FQ-4, FQ-6, R8, R9, R34, R35, DQ-1 | M4 completion |
| 3 | **R13** (plan type), R12, R14, FQ-24, FQ-18 | M8 |
| 4 | R17, R18, R19, R21, FQ-8, FQ-16 | M5, M6 |
| 5 | R23–R27, FQ-9, FQ-10, FQ-11, FQ-14, FQ-22, R20 | M7 |
| 6 | R28–R32 and related FQs | M9 |
| 7 | R36–R38, R33, FQ-13, FQ-17 | M10 |
| 8 | Homepage design (AC-3), R1, R2, R3, R4, R5, R7, R45 | M11a/M11b |
| 9 | R39–R44, R10, R11 | M12 |

### 7.2 Owner / technical decisions

| Priority | Decision | Unblocks |
|---|---|---|
| 1 | Review and accept TASK-01 (AC-15) | M3, M4 |
| 2 | AC-4 (repository structure), AC-5 (Git and remote), AC-6 (runtime pinning) | M0 |
| 3 | AC-7 (local PostgreSQL method) | M3 |
| 4 | AC-12 and DS-1/DS-2 library and approach choices, proposed per milestone | M1, M2 |
| 5 | CP2 review of the Proposed designs, plus DQ-3, DQ-4, DQ-5, DQ-7 | M4, M8, M10 |
| 6 | AC-9 (build location / CI), AC-10 (PDF technology), AC-14 (routing and sessions) | M12, M7, M4 |
| 7 | An authorised roadmap register update (FQ, DQ, AC-3) | Governance |

---

## 8. Changed files

| File | Change |
|---|---|
| `docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md` | **Created** (this report) |
| Everything else | **Unchanged.** The before and after checksums are in §10.3. |

**Not created:** application code, package files, configuration, environment files, a Prisma schema, migrations, design assets, a Git repository or any other document. **Not installed:** no packages or tools.

---

## 9. Reviewer checklist

1. Is §2 accurate? It says **no application code exists**, and the raw evidence is in §10.1.
2. **AC-2:** is the proposed split of the public site into M11a (early) and M11b (after the design choice) acceptable? How should CP3 be handled under change control?
3. **AC-4:** the proposed npm-workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`).
4. **AC-5 and AC-7:** Git initialisation and remote, and the local PostgreSQL method. These are owner decisions.
5. **AC-9 and AC-10:** the build-location and PDF-technology risks on the VPS.
6. **§5:** milestone dependencies and the ready/blocked classification.
7. **§6:** whether the design-system plan is acceptable, and the DS-1/DS-2 options.
8. **AC-15:** TASK-01 still needs its review result.

**Next approval required:**
- (a) accept this audit
- (b) decide AC-4, AC-5 and AC-6 so that **TASK-03 (M0 Repository and governance foundation)** can be specified
- (c) decide AC-7 before M3
- (d) the TASK-01 review outcome

**I have not started TASK-03 or any implementation.**

---

## 10. Validation evidence

All commands were run in Git Bash (MSYS) on Windows. The output is pasted unedited. `<scratchpad>` is the agent's session scratchpad directory, outside the repository.

### 10.1 Repository and tooling inventory

Run from `C:\Users\HEEL PATEL\Desktop\KulVriksh` with: `bash "<scratchpad>/t2-inventory.sh" > "<scratchpad>/t2-inventory.out" 2>&1`. Each command is echoed with `$ `, and its exit code is shown as `[exit=N]`.

| Check | Status |
|---|---|
| I1–I4 inventory (files, manifests, source, assets) | PASS: ran successfully; shows no application code |
| I5 Git | Ran; **not a repository** (exit 128) |
| I6 Runtime | Ran; Node and npm present; pnpm and Yarn absent |
| I7 Database and containers | Ran; **all absent** (exit 127) |
| I8 OS, I9 checksums | PASS |

~~~text
### I1 Repository root listing (including hidden files)
$ pwd; ls -la
/c/Users/HEEL PATEL/Desktop/KulVriksh
total 16
drwxr-xr-x 1 HEEL PATEL 197121 0 Oct 21 03:40 .
drwxr-xr-x 1 HEEL PATEL 197121 0 Oct 24 02:06 ..
drwxr-xr-x 1 HEEL PATEL 197121 0 Oct 24 01:53 docs
[exit=0]

### I2 Every file and directory (excluding nothing)
$ find . | sort
.
./docs
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
[exit=0]

### I3 Package manifests, lockfiles, env files, config, source code
$ find . -type f \( -name 'package.json' -o -name '*lock*' -o -name '.env*' -o -name '*.config.*' -o -name 'tsconfig*.json' -o -name 'schema.prisma' -o -name 'Dockerfile' -o -name '*.yml' -o -name '*.yaml' \) | sort; echo '(end manifests/config)'
(end manifests/config)
[exit=0]

$ find . -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sql' -o -name '*.prisma' \) | sort; echo '(end source files)'
(end source files)
[exit=0]

$ find . -type d -name node_modules | head; echo '(end node_modules dirs)'
(end node_modules dirs)
[exit=0]

### I4 Homepage reference assets in the repository (images, PDFs, design files)
$ find . -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.svg' -o -iname '*.gif' -o -iname '*.pdf' -o -iname '*.fig' -o -iname '*.psd' -o -iname '*.html' \) | sort; echo '(end assets)'
(end assets)
[exit=0]

### I5 Git
$ git --version
git version 2.52.0.windows.1
[exit=0]

$ git status
fatal: not a git repository (or any of the parent directories): .git
[exit=128]

### I6 Runtime and tooling versions
$ node -v
v24.13.0
[exit=0]

$ npm -v
11.6.2
[exit=0]

$ npx --version
11.6.2
[exit=0]

$ corepack --version
0.34.5
[exit=0]

$ pnpm -v
bash: line 1: pnpm: command not found
[exit=127]

$ yarn -v
bash: line 1: yarn: command not found
[exit=127]

### I7 Database and container tooling
$ psql --version
bash: line 1: psql: command not found
[exit=127]

$ postgres --version
bash: line 1: postgres: command not found
[exit=127]

$ pg_ctl --version
bash: line 1: pg_ctl: command not found
[exit=127]

$ docker --version
bash: line 1: docker: command not found
[exit=127]

### I8 OS
$ uname -a
MINGW64_NT-10.0-26200 LAPTOP-6ACL2ULK 3.6.5-22c95533.x86_64 2025-10-10 12:02 UTC x86_64 Msys
[exit=0]

### I9 Specification checksums and sizes
$ md5sum docs/*.md docs/reports/*.md; wc -l docs/*.md docs/reports/*.md
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
   790 docs/00-ROADMAP.md
  1639 docs/01-PRODUCT-FLOWS.md
  1771 docs/02-DATA-MODEL.md
   143 docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
   547 docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
  4890 total
[exit=0]

~~~

### 10.2 Specification status extraction

Run from `C:\Users\HEEL PATEL\Desktop\KulVriksh\docs`. Each command is shown before its output.

| Check | Status |
|---|---|
| D1 Document status lines, the Next.js approval wording, the stack table, the phase and checkpoint schedule, staging, homepage mentions, VPS process note, PDF technology mentions, languages | PASS: ran; the findings are cited in §3–§4 |

~~~text
$ grep -n "^| Status\|^\*\*Status" 00-ROADMAP.md 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md PERFORMANCE-AND-NAVIGATION-STANDARDS.md reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
00-ROADMAP.md:6:| Status | Draft for review |
01-PRODUCT-FLOWS.md:6:| Status | Draft for review |
01-PRODUCT-FLOWS.md:1199:| Status changes | Actions are TBC (R35). If suspension is adopted, it revokes sessions immediately ([F-PRO-02](#f-pro-02-account-states)). |
02-DATA-MODEL.md:6:| Status | Draft for review. Not approved for schema implementation. |
PERFORMANCE-AND-NAVIGATION-STANDARDS.md:4:**Status:** Proposed engineering standard for roadmap review  
reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md:11:| Status | Completed. **Awaiting review.** This report is evidence of what was done, not proof that the design is correct. |

$ grep -n "Next.js" PERFORMANCE-AND-NAVIGATION-STANDARDS.md | head -3
10:The platform must feel responsive during normal use. Navigation should not trigger a full browser-page reload unless there is a deliberate technical reason. Do not treat choosing Next.js as sufficient proof of performance; implement, measure, and test performance throughout development.
16:- Use **Next.js (React-based)** for the public website and SEO landing pages, subject to approval in `docs/00-ROADMAP.md`.
17:- Use Next.js-supported client-side navigation (`next/link`) for internal routes where appropriate. Avoid ordinary full-document navigation for routine internal page changes.

$ grep -n "^| 1 | 2026-10-21" 00-ROADMAP.md | cut -c1-120; grep -o "Recorded — pending client review" 00-ROADMAP.md
697:| 1 | 2026-10-21 | **Frontend confirmed as Next.js** (React-based, TypeScript where appropriate) for the public webs
Recorded — pending client review

$ grep -n "^| Frontend\|^| Backend\|^| Database\|^| ORM\|^| Payments\|^| Media storage" 00-ROADMAP.md
49:| Frontend | Next.js (React-based), TypeScript where appropriate |
50:| Backend | Node.js, Express.js, TypeScript |
51:| Database | PostgreSQL |
52:| ORM | Prisma |
53:| Payments | Razorpay |
54:| Media storage (initial production) | VPS NVMe, accessed through the storage abstraction for future object-storage migration |
568:| Frontend–API session integration (Phase 2) | Phases 4–9 | Server-rendered authenticated pages depend on it. |
745:| Database | Pagination and limits on lists and exports, suitable indexes, no N+1 queries, only the required fields, one shared PrismaClient per process, and slow-query inspection. | 2, 5–9 |

$ grep -n "^| [0-9]* | .* | Weeks\? \|^| CP[0-9]" 00-ROADMAP.md | cut -c1-110
120:| 1 | Discovery and scope confirmation | Week 1 |
121:| 2 | Architecture and local development foundation | Weeks 1–2 |
122:| 3 | Public website and lead generation | Weeks 2–3 |
123:| 4 | Authentication and authorisation | Week 3 |
124:| 5 | Services, orders and payments | Weeks 4–5 |
125:| 6 | Family workspaces and graphical tree | Weeks 5–6 |
126:| 7 | Media, voice and text-to-speech | Weeks 6–7 |
127:| 8 | Genealogist portal and research | Weeks 7–8 |
128:| 9 | Admin panel and notifications | Weeks 8–9. Admin screens for each module are built alongside that 
129:| 10 | QA, deployment and handover | Weeks 9–10, followed by 30-day bug-fix support |
594:| CP1 — Scope locked | 1 | Signed scope, permission matrix, TBC resolutions, confirmed timeline, represe
595:| CP2 — Foundation ready | 2 | Local setup, Next.js foundation and shared layouts, schema draft, storage
596:| CP3 — Public site and login | 3, 4 | Public pages, 25 surname pages (initial HTML, metadata, sitemap, 
597:| CP4 — Commerce | 5 | Test-mode purchase, verified payment, webhook idempotency, entitlements, checkout
598:| CP5 — Family core | 6, 7 | Workspaces, tree, PDF export, private media, voice, TTS; tree and media mea
599:| CP6 — Portal and admin | 8, 9 | Genealogist portal, report approval, admin panel, notifications; list 
600:| CP7 — Launch readiness | 10 | Test results, performance regression results, VPS load test, security re
601:| CP8 — Support close | +30 days | Closure of the 30-day bug-fix support period | Launch + 30 days |

$ grep -n "Staging\|R11\b" 00-ROADMAP.md | head -4 | cut -c1-140
72:| Staging | **TBC.** No separate staging environment has been agreed. | — |

$ grep -n -i "homepage\|home page\|design selection" 00-ROADMAP.md 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md PERFORMANCE-AND-NAVIGATION-STANDARDS.md | cut -c1-140
00-ROADMAP.md:254:- Lab Core Web Vitals (LCP, CLS) and the INP proxy (e.g. Total Blocking Time) are recorded for the homepage and a represen
PERFORMANCE-AND-NAVIGATION-STANDARDS.md:100:2. Test representative routes: homepage, portfolio/service-style public pages if present, surnam

$ grep -n -i "two Node.js processes" 00-ROADMAP.md | cut -c1-140
76:**Effect of the Next.js decision on the VPS:** production runs two Node.js processes, the Next.js server and the Express API, alongside P
548:- Failure case: memory pressure on 4 GB RAM, which is now shared by two Node.js processes and PostgreSQL. Mitigations are memory limits 
697:| 1 | 2026-10-21 | **Frontend confirmed as Next.js** (React-based, TypeScript where appropriate) for the public website, the surname pag

$ grep -n -i "chromium\|puppeteer\|headless" 00-ROADMAP.md 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md; echo "exit=$?"
exit=1

$ grep -n "3. Website language" 00-ROADMAP.md
612:3. Website language(s).
~~~

### 10.3 Post-write verification

Run from `C:\Users\HEEL PATEL\Desktop\KulVriksh` after this report was written:

| Check | Status |
|---|---|
| Only this report was added (6 files: the 5 pre-existing plus this one) | PASS |
| All 5 pre-existing files are byte-identical to the I9 baseline taken before writing | PASS |
| Still not a Git repository (nothing initialised by this task) | As expected |
| Relative links in this report resolve | PASS |

~~~text
$ find . -type f | sort
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md

$ md5sum docs/00-ROADMAP.md docs/01-PRODUCT-FLOWS.md docs/02-DATA-MODEL.md docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md

$ md5sum docs/00-ROADMAP.md docs/01-PRODUCT-FLOWS.md docs/02-DATA-MODEL.md docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md | diff - <(grep -E "^[0-9a-f]{32} \*docs/" "<scratchpad>/t2-inventory.out") && echo "IDENTICAL to I9 baseline"
IDENTICAL to I9 baseline

$ git status 2>&1 | head -1
fatal: not a git repository (or any of the parent directories): .git

$ cd docs/reports && grep -o "](\.\./[^)#]*" TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md | sed "s/^](//" | sort -u | while read p; do test -f "$p" && echo "OK $p" || echo "MISSING $p"; done
OK ../00-ROADMAP.md
~~~
