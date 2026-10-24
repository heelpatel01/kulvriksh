# Kulvriksh Digital Platform

Monorepo for the Kulvriksh Digital Platform, developed by Cortax IT Solutions for Kulvriksh Private Limited.

## Current status

**Milestone M0 — repository and governance foundation.** It contains only:

- `apps/web`: a minimal Next.js placeholder page with provisional design tokens
- `apps/api`: a minimal Express API with a health endpoint. Its foundation (M1, TASK-04, under review) adds:
  - validated configuration
  - structured JSON logging with secret redaction
  - request IDs
  - security headers
  - a consistent error envelope
  - tests
- `packages/shared`: shared TypeScript contracts (type-only)

**Not implemented yet:** database, Prisma schema and migrations, authentication, OTP, payments, family workspaces and tree, media, research, notifications, the admin and genealogist portals, the public website, and deployment.

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
- **PostgreSQL:** not needed yet. Native PostgreSQL on Windows is planned for milestone M3. Its major version will be matched to the planned production server first.

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
