# Kulvriksh Digital Platform

Monorepo for the Kulvriksh Digital Platform, developed by Cortax IT Solutions for Kulvriksh Private Limited.

## Current status

**Milestone M0 — repository and governance foundation.** It contains only:

- `apps/web`: the Next.js web app. Milestone M2 (TASK-05, under review) adds a **local UI preview with sample data** for:
  - the public website: `/`, `/services`, `/surnames`, `/enquiry`, `/sign-in`
  - the customer dashboard: `/dashboard`
  - the genealogist portal: `/genealogist`
  - the admin panel: `/admin`

  The preview has **no real sign-in, access control, persistence, payments or provider calls**. Forms and actions change local state only and say so. Sample data lives in `apps/web/lib/sample-data`, behind mock adapters in `apps/web/lib/repositories`.
- `apps/api`: a minimal Express API with a health endpoint. Its foundation (M1, TASK-04, under review) adds:
  - validated configuration
  - structured JSON logging with secret redaction
  - request IDs
  - security headers
  - a consistent error envelope
  - tests
- `packages/shared`: shared TypeScript contracts (type-only)

**Since then (TASK-07 to TASK-09):** a local PostgreSQL database with Prisma migrations, the service catalogue, customer sign-in by one-time code, customer profiles, family workspaces (people and relationships), staff sign-in with role-based permissions, assignments, research notes and reports with review and release, and a persistent audit log. See [Local database](#local-database) and the sign-in notes under [Getting started](#getting-started).

**TASK-10 and TASK-11** added:
- staff account management with two-step sign-in
- in-app notifications
- private media and report files
- **family tree PDF export**: one page, poster or printable sheets, generated in worker threads (see [Tree export and payments](#tree-export-and-payments))
- **plans, orders, payments and entitlements**, with a Razorpay adapter and a development-only simulated gateway
- real admin screens for the overview, customers, plans, transactions and roles & access
- the genealogist profile

**TASK-12/13** added:
- PDF text in **Gujarati, Devanagari and Latin** (with accents), shaped by HarfBuzz and drawn with embedded Noto font subsets
- an export estimate (printed name size, sheets, pages) before the PDF is created, a target number of sheets, and the last-used settings remembered
- real admin notification and system-status screens
- `db:backup` and `db:restore-check`

**Not implemented yet:**
- an SMS or email provider. Codes are shown only in local development.
- a live, verified Razorpay connection. No credentials are configured, and the adapter is tested against a local test double only.
- voice recording and text-to-speech
- surname pages (labelled sample data, R2) and editable notification templates (R36/R37)
- deployment

The specifications in `docs/` are **drafts awaiting review**, and the data model is not approved for schema work. Each completed task is recorded in `docs/reports/`.

## Repository structure

```
apps/
  api/        Express + TypeScript API (port 4000)
  web/        Next.js + React + TypeScript web app (port 3000)
packages/
  shared/     Types and contracts shared by the API and the web app
docs/         Roadmap, product flows, data model, standards and task reports
```

## Prerequisites (Windows)

- **Node.js 24** (see `.nvmrc`). Verify with `node -v`.
- **npm 11** (bundled with Node.js 24). Use npm only; pnpm and Yarn are not used.
- **Git**.
- **PostgreSQL 18:** a project-local copy, with no installer, no Windows service and no admin rights. See [Local database](#local-database).

## Getting started

Run these from the repository root, in PowerShell, Command Prompt or Git Bash.

```bash
# Install exactly the versions in package-lock.json
npm ci

# Optional: local API settings (placeholders only; never commit .env files)
# PowerShell:  Copy-Item apps/api/.env.example apps/api/.env
# Git Bash:    cp apps/api/.env.example apps/api/.env
```

**Start the apps, each in its own terminal:**

```bash
npm run dev:api    # http://127.0.0.1:4000/health
npm run dev:web    # http://localhost:3000
```

**Check the API:**

```bash
curl http://127.0.0.1:4000/health
# {"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}
```

The health endpoint only reports that the API process is running. It does **not** check a database; none is connected yet.

`GET /ready` is the readiness check:
- `200` when the API can serve requests.
- `503` when a configured dependency is down. Failure details are logged, never returned.
- With `DATABASE_URL` set, it runs a real `SELECT 1` with a 2-second limit, and returns `503` (database `down`) if PostgreSQL is unavailable.
- Without `DATABASE_URL`, it reports the database as `not_configured`.
- `DATABASE_URL` must be a loopback host outside production, and is never logged.

**Services API (first persistent resource):**
- `GET /api/v1/services` returns active services only.
- `GET`, `POST` and `PATCH /api/v1/admin/services` manage them.

The admin routes accept only a **development-only** `ADMIN_PREVIEW_TOKEN`, sent by the web server, never the browser. It is refused outside development. It is **not** authentication; real admin sign-in is milestone M4.

**Customer sign-in (one-time code by mobile number):**
- `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/auth/session`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/logout-all`, and the customer route `GET /api/v1/me`.
- Sessions are server-side rows checked on every request. The web server keeps the token in an HttpOnly cookie (`__Host-kv_session` in production) and sends it to the API as a Bearer header; browser scripts never see it.
- **No SMS provider is configured.** Locally, `OTP_DELIVERY=development` keeps codes in API memory, and the sign-in page shows them in a "Development inbox" box. The API refuses that setting unless `NODE_ENV=development`. Without a delivery channel, sign-in answers `503`.
- OTP length, lifetimes, limits and session timeouts are **provisional** settings (decisions FQ-1 to FQ-4). They are listed in `apps/api/.env.example`.
- For an `apps/api/.env` created before sign-in existed, run `npm run db:secrets` and then `npm run db:migrate`. The first command adds the two HMAC keys and the development delivery setting without printing them.
- Try it at `http://localhost:3105/sign-in`. The customer area `/dashboard` requires sign-in.

**Customer data (TASK-09):** `GET`/`PATCH /api/v1/me/profile`; the family workspace under `/api/v1/family` (workspace, `members`, `relationships`, `tree`); released reports at `GET /api/v1/reports`. The workspace is always the session customer's own; no customer or workspace ID is accepted from the request. Field lists are provisional (R8, R17, R18).

**Staff sign-in (provisional, R9):** genealogists and admins sign in at `/staff/sign-in` with an email and password (scrypt). They use a separate cookie (`__Host-kv_staff` in production) and shorter sessions. Every admin and genealogist API checks a named permission (`apps/api/src/auth/authorize.ts`); anything not listed is denied. No public route creates staff accounts. To create **local test** staff accounts:

```powershell
# Development only: also add DEV_STAFF_PROVISIONING=1 to apps/api/.env (refused outside development).
npm run dev:staff -- --role genealogist --email asha.g@example.test --name "Asha (test genealogist)"
npm run dev:staff -- --role admin --email admin@example.test --name "Local admin"
```

The password is printed once (or taken from `DEV_STAFF_PASSWORD`). The command is excluded from the production build.

**Staff accounts (TASK-10):** admins create genealogist accounts at `/admin/staff`. A new account has **no password**; the admin passes on a one-time setup link (`/staff/setup#token=…`, valid 72 h), shown once. "Reset password" issues a new link and immediately stops the old password and every session. Staff change their own password and turn on two-step sign-in (TOTP authenticator app) at `/admin/account` or `/genealogist/account`. `STAFF_MFA=required_admins` makes it mandatory for admins (decision R34). No route changes a role, and admins cannot act on themselves or, by default, on other admins (R33).

**First administrator in a new deployment:**

```bash
npm run bootstrap:admin -- --email owner@example.com --name "Owner" --confirm
# production build:  node --env-file=.env dist/tools/bootstrap-admin.js --email … --name … --confirm
```

It refuses to run while any active admin exists, sets no password, and prints a one-time setup link (valid 1 hour) to the terminal only.

**Notifications:** releasing a report writes an in-app notification for the family in the same transaction (`GET /api/v1/notifications`, `/unread-count`, `POST /notifications/:id/read`, `/read-all`). Email and SMS go through a provider interface and an outbox dispatcher, but **no provider is configured**, so those channels are refused in configuration.

**Files:** customers upload photos, PDFs and voice recordings at `/dashboard/media`; genealogists attach a PDF to a report. Types are detected from file content, sizes and the family quota are enforced, and every download re-checks access (a customer can fetch a report file only after release). Bytes are kept by a **local private-disk adapter** (`STORAGE_LOCAL_DIR`, development default `.data/storage`); **no cloud storage is configured**. `npm run db:cleanup` also removes abandoned uploads and expired one-time staff links.

**Research:** admins assign one genealogist per family (`/api/v1/admin/assignments`). The genealogist sees only currently assigned families (`/api/v1/genealogist/cases`), records notes and sources, and submits reports. Admins return or release reports (`/api/v1/admin/reports`). Removing an assignment ends access on the next request. The audit log (`GET /api/v1/admin/audit`) is append-only: the runtime database role cannot update or delete it.

**Cleanup of expired sign-in records:** `npm run db:cleanup` deletes expired OTP challenges, rate-limit buckets, lockouts, and expired or revoked sessions, in bounded batches (options `--batch-size`, `--max-batches`, `--grace-hours`, default 24 h). It never runs on a request. In production, schedule the built command once an hour with the server's own scheduler (a systemd timer or cron entry running `node --env-file=.env dist/tools/cleanup.js` in `apps/api`). No job queue is needed.

To show live API status on the admin "System & integrations" page, set `API_INTERNAL_URL` in `apps/web/.env.local` (see `apps/web/.env.example`). Run the API on a free port, for example `API_PORT=4100`.

## Local database

The API stores data in a **project-local PostgreSQL 18**. It lives in `.data/postgres` (git-ignored) and listens on **127.0.0.1:5434 only**. Port 5433 belongs to another project on the development machine and is never used.

**One-time setup (PowerShell):**

1. Download the PostgreSQL 18 Windows x64 binaries zip from EnterpriseDB and extract it, so that `.data\postgres\pgsql\bin\pg_ctl.exe` exists:
   ```powershell
   New-Item -ItemType Directory -Force .data\postgres\download
   curl.exe -L -o .data\postgres\download\pg18.zip https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip
   tar -xf .data\postgres\download\pg18.zip -C .data\postgres
   ```
2. Initialise the database:
   ```powershell
   npm run db:init
   ```
   This creates the cluster and two roles:
   - `kulvriksh_owner`: runs migrations
   - `kulvriksh_app`: the API's least-privilege runtime role, with no DDL rights

   It also creates three databases (`kulvriksh`, `kulvriksh_test`, `kulvriksh_shadow`), generates random passwords, writes them only to the git-ignored `apps/api/.env` and `apps/web/.env.local`, and applies the migrations. It never overwrites existing files or data.

**Every day:**

```powershell
npm run db:start      # start PostgreSQL (db:stop to stop it, db:status to check)
npm run dev:api       # API on http://127.0.0.1:4100 (from apps/api/.env)
$env:PORT=3105; npm run dev:web
```

Then open `http://localhost:3105/admin/services`. This is the first screen backed by the database.

**Schema changes:** edit `apps/api/prisma/schema.prisma`, then:
- `npm run migrate:create -w @kulvriksh/api -- --name <change>` writes the migration SQL for review.
- `npm run db:migrate` applies it to the development and test databases.

Never use `prisma db push`.

**Database tests:** `npm run test:db` runs the integration tests against `kulvriksh_test`. `npm run check` skips them, so it never needs a database.

## Scripts (run from the root)

| Script | What it does |
|---|---|
| `npm run dev:web` / `npm run dev:api` | Start the web app or the API in development mode |
| `npm run build` | Build all workspaces: compile the API to `apps/api/dist`, and run a production build of the web app |
| `npm run start:web` / `npm run start:api` | Run the production builds (run `npm run build` first) |
| `npm run typecheck` | Type-check every workspace |
| `npm run lint` | Lint every workspace with ESLint |
| `npm run test` | Run the tests: the API uses Node's built-in test runner on its `src/**/*.test.ts` files |
| `npm run check` | Type-check, lint, test and build |
| `npm run test:db` | Database integration tests against `kulvriksh_test` (needs `npm run db:start`) |
| `npm run db:secrets` | Add sign-in settings introduced after `db:init` to `apps/api/.env` (values not printed) |
| `npm run db:cleanup` | Delete expired OTP challenges, rate-limit buckets, lockouts and sessions (bounded batches) |
| `npm run dev:staff` | Development only: create a test genealogist or admin account |
| `npm run bootstrap:admin` | Create the first administrator of a deployment (one-time setup link, no password) |
| `npm run bench:export -w @kulvriksh/api` | Measure tree PDF export time and peak memory on synthetic families (no database); add `-- indic` for Gujarati/Devanagari/Latin names |
| `npm run db:backup` | Write a `pg_dump` custom-format backup of `kulvriksh` to `.data/backups/` (git-ignored) |
| `npm run db:restore-check` | Restore the newest backup into a temporary database, compare every table's row count with `kulvriksh`, then drop it |

## Tree export and payments

**Family tree PDF:** on the family page, *Download as PDF*. There are three layouts:
- **One page:** the whole tree is fitted to one sheet, with a warning when names get too small to read.
- **Poster:** one large page sized to the tree.
- **Printable sheets:** a constant scale, with an assembly overview, numbered sheets, overlap guides and registration marks.

Options cover the page size, orientation, name size, scale (or, for printable sheets, a target number of sheets), reference numbers, generations, an alphabetical index, and an explicit subtree (the descendants or ancestors of one person). While the options change, the page shows the API's estimate (`POST /api/v1/family/exports/preview`): the printed name size with a readability rating, the sheets and the page count, and it disables *Create PDF* when the page limit would be exceeded.

**Scripts and fonts:** names are shaped with HarfBuzz (`harfbuzzjs`, MIT) and drawn with subsets of Noto Sans, Noto Sans Gujarati and Noto Sans Devanagari, which are embedded in each PDF. The fonts and their SIL Open Font License texts are in `apps/api/assets/fonts/`, and **must be deployed with the API** (they are read from `apps/api/assets`, next to `dist`). Characters outside these fonts are drawn as an empty box and reported in the export's warnings; they are never replaced silently.

The PDF is generated in a worker thread. The browser only polls its progress, and the finished file is stored privately and downloaded through an access check. Limits and retention are in `apps/api/.env.example` (`EXPORT_*`).

Only the workspace owner can export by default. Genealogist export (`EXPORT_GENEALOGIST_ACCESS=assigned`) and admin export wait for decisions R28/FQ-25 and FQ-14.

**Payments:** `PAYMENT_PROVIDER` is one of:
- `none` (default): ordering answers 503.
- `development`: a simulated gateway, local development only. No money moves.
- `razorpay`: needs `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Only test keys are accepted outside production. The webhook URL is `/api/v1/payments/webhooks/razorpay`.

How a payment completes:
- An order becomes paid only from a payment the API has read back from the provider, or one it received in a signed webhook, with a matching amount and currency.
- Entitlements are granted exactly once.
- Reconciliation and grant recovery run inside the API.

Which features need an entitlement is set by `ENTITLEMENT_GATES` (empty by default, R14).

## Configuration

**API** (`apps/api/.env`, optional; see `apps/api/.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `API_HOST` | `127.0.0.1` | |
| `API_PORT` | `4000` | |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

Any invalid value stops the API at startup with one structured error that lists every problem.

**API logs:**
- **Format:** one JSON object per line. `warn` and `error` go to stderr; everything else goes to stdout.
- **Redaction:** values of fields whose names look sensitive (password, secret, token, cookie, authorization, signature, OTP and similar) are replaced with `[REDACTED]`.
- **Access log:** one line per request, with the path but never the query string.

**Request IDs and errors:**
- Every response carries a server-generated `X-Request-Id` header.
- Error responses use `{"error":{"code","message","requestId"}}`. The `requestId` is the reference to quote when reporting a problem.

**Web:** no application settings are needed yet. The web app listens on port `3000` by default. To use another port, set `PORT` before starting it:

```bash
# PowerShell:  $env:PORT=3001; npm run dev:web
# Git Bash:    PORT=3001 npm run dev:web
```

Extra arguments after `--` are not forwarded by the root scripts, so use `PORT` (web) or `API_PORT` (API) instead.

**Next.js telemetry:** Next.js sends anonymous usage telemetry by default. To opt out on your machine, set `NEXT_TELEMETRY_DISABLED=1` in your environment, or run `npx next telemetry disable` in `apps/web`. That changes only your local Next.js settings.

## Rules for contributors

- **Never commit secrets:** no `.env` files, credentials, keys or client data. `.gitignore` excludes `.env*` except `.env.example`.
- **Local runtime data** (uploads, exports, backups) belongs under `.data/`, which is git-ignored.
- **Text files** use LF line endings (`.gitattributes`).
- **Scope:** do not start a milestone or change a specification without approval. See `docs/00-ROADMAP.md` and the latest report in `docs/reports/`.
