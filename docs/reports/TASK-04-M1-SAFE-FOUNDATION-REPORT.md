# TASK-04 — Safe M1 Foundation Work

| Item | Value |
|---|---|
| Task ID | TASK-04 (milestone M1, safe subset only) |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Status | Completed. **Nothing committed.** All changes are left for review. |
| HEAD at start and end | `e83562484d0495ec836b9eb896c8f7dfefd6927c` (no commits made) |

The report is evidence of what was done. It does not prove that the design is correct.

---

## 1. Initial state (evidence E1)

- **HEAD:** `e83562484d0495ec836b9eb896c8f7dfefd6927c` "fix(web): let PORT choose the web port instead of hard-coding 3000". Two commits in total; no remote.
- **Initial `git status`:** TASK-03A's **uncommitted** work, untouched by this task:
  - ` M apps/web/next.config.ts` (`agentRules: false`)
  - `?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`
  - `?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`
- **Instruction files:** no `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` or `.github/` exists in the repository. The generated `apps/web/AGENTS.md` was removed by Next.js in TASK-03A.
- **Tests:** none existed before this task.
- **Review artefacts:** **no TASK-01 review report and no CP2 technical-review document exist.** Neither TASK-01 nor CP2 is treated as approved.
- **Runtime:** Node 24.13.0 provides the built-in `node:test` runner and TypeScript type stripping (`process.features.typescript = "strip"`). That made test infrastructure possible **without any new dependency**.

---

## 2. Classification of candidate work

| Candidate | Classification | Reason |
|---|---|---|
| Fail-fast config validation (host, port) | **ALREADY COMPLETE** (TASK-03) | It existed. It is extended below with `NODE_ENV`, `LOG_LEVEL` and all-issues reporting. |
| `GET /health` (process liveness only; database `not_configured`) | **ALREADY COMPLETE** (TASK-03) | Kept unchanged in behaviour. No readiness check is added, because there is nothing real to check yet. |
| Explicit `http.Server` (F1 fix), graceful shutdown on SIGTERM/SIGINT | **ALREADY COMPLETE** (TASK-03) | Kept. A regression test for F1 was added. |
| `NODE_ENV` and `LOG_LEVEL` validation; report **every** config issue at once | **SAFE NOW**, done | No business decision is involved. Staging stays TBC (R11), so it is **not** an allowed `NODE_ENV` value. |
| Structured JSON logging with secret redaction | **SAFE NOW**, done | Roadmap Phase 2 "structured logging that excludes sensitive data". Dependency-free, so no lockfile change. |
| Server-generated request ID (`X-Request-Id`), also in error bodies | **SAFE NOW**, done | Flows §12.1: errors carry "a reference ID for support". |
| Access log (method, path **without query string**, status, duration) | **SAFE NOW**, done | Supports operations without logging tokens or personal data in query strings. |
| Security headers and `Cache-Control: no-store` on API responses | **SAFE NOW**, done | Roadmap §11 security headers; private data must never be shared-cached (Roadmap §12). HSTS is left to the HTTPS proxy (M12). |
| Consistent error envelope with `requestId`; 4xx mapping; generic 500 | **SAFE NOW**, done (extended) | It existed. `requestId` was added and the logging is structured. |
| Logged handling of `uncaughtException` and `unhandledRejection` | **SAFE NOW**, done | Fail visibly, then shut down with exit code 1. |
| Test infrastructure (`node:test`) and focused tests | **SAFE NOW**, done | No new dependency. |
| Root `test` script; `check` includes tests | **SAFE NOW**, done | |
| Production build excludes tests | **SAFE NOW**, done | `tsconfig.build.json` |
| README and `.env.example` updates | **SAFE NOW**, done | Documentation of the new settings and behaviour |
| PostgreSQL connection, owner/runtime role split, Prisma setup | **BLOCKED** | PostgreSQL is not installed and its production version is TBC. TASK-01 and CP2 are not approved. The task forbids Prisma and schema work. |
| `background_task_state`, `audit_event` or any table | **BLOCKED** | These need the database, schema approval and CP2 |
| Storage abstraction (local implementation) | **BLOCKED** | Its lifecycle (temporary area, commit, token-keyed temporary output) is a **Proposed** design in DM §7.4 and §10.3, awaiting CP2. It is also security-sensitive (path handling), so it should follow the review. |
| SMS, email and TTS provider interfaces or stubs | **BLOCKED** | The interface shape depends on providers R25 and R37. A stub now would be a speculative abstraction. |
| Request body parsing (`express.json` with limits) | **Not needed yet** | No endpoint accepts a body. Add it with the first such endpoint. |
| `trust proxy` setting, and accepting a proxy-supplied request ID | **BLOCKED** | It depends on the deployment topology: the NGINX design and AC-14 (M12). Until then, client-supplied request IDs are ignored. |
| CORS | **BLOCKED** | It depends on the AC-14 routing decision (same-origin is proposed) |
| CI pipeline | **BLOCKED** | Owner decision AC-9 (a third-party service) |
| Web (Next.js) security headers and CSP | **Deferred to M2** | A CSP needs design work with Next.js's inline scripts. It is not an M1 API item. |
| Formatter (e.g. Prettier) | **Not done** | It would add a dependency and change the lockfile; not necessary for M1 |
| Authentication, sessions, OTP, payments, entitlements, workflows | **BLOCKED** | Out of scope, and dependent on CP2 and client decisions |

---

## 3. Files changed, and why

**New files (untracked):**

| File | Purpose |
|---|---|
| `apps/api/src/logger.ts` | Dependency-free structured logger: one JSON object per line; `warn`/`error` to stderr; level filtering. **Redacts** values whose key names contain `password`, `passwd`, `secret`, `token`, `authorization`, `cookie`, `apikey`, `signature`, `privatekey` or `otp`, case- and separator-insensitively. Serialises errors (name, message, stack). Safe against circular references and depth. Fields cannot overwrite `time`, `level` or `msg`. Has child loggers. Callers depend only on the `Logger` interface, so a library can replace it later. |
| `apps/api/src/middleware.ts` | `requestId`: always generates a UUID; ignores the client-supplied header (see §6). `securityHeaders`: `no-store`, `nosniff`, `DENY` frames, `no-referrer`, `CORP same-origin`, `CSP default-src 'none'; frame-ancestors 'none'`. `accessLog`: path without the query string; `/health` logged at debug; a warning if the client disconnects before the response finishes. |
| `apps/api/src/errors.ts` | `notFoundHandler` and `createErrorHandler(logger)`. Separated from `app.ts` so the tests exercise the real handlers. 4xx keep their status (400, 404, 405, 413 and 415 have codes; other 4xx get `CLIENT_ERROR`) with a generic message, logged at warn. Anything else is a generic 500, logged at error with the full error and the request ID. |
| `apps/api/src/testing/helpers.ts` | Test-only: a log-capturing logger and an ephemeral-port server. Excluded from the build. |
| `apps/api/src/config.test.ts`, `logger.test.ts`, `app.test.ts`, `errors.test.ts`, `server.test.ts` | 38 focused tests (§5) |
| `apps/api/tsconfig.build.json` | The production build excludes `*.test.ts` and `src/testing`. Type-checking still covers them. |

**Modified files:**

| File | Change |
|---|---|
| `apps/api/src/config.ts` | Adds `nodeEnv` (`development`, `test`, `production`) and `logLevel`. `ConfigError` now carries an `issues` array and reports **all** problems together. The port rules are unchanged. |
| `apps/api/src/app.ts` | `createApp({ logger })` (dependency injection). Wires in the middleware and error handlers from the new modules. Health behaviour is unchanged; `no-store` now comes from the security middleware. |
| `apps/api/src/server.ts` | Uses the structured logger: a configuration error is one JSON error line listing the issues. Same F1-safe `http.Server` listen and shutdown logic. `uncaughtException` and `unhandledRejection` are logged and trigger shutdown with exit code 1. |
| `packages/shared/src/index.ts` | `ApiErrorBody.error` gains `requestId: string` |
| `apps/api/package.json` | **Scripts only:** `build` uses `tsconfig.build.json`; new `test`: `node --test "src/**/*.test.ts"`. **No dependency changes.** |
| `package.json` (root) | **Scripts only:** new `test`; `check` now runs typecheck, lint, test and build |
| `apps/api/.env.example` | Documents `NODE_ENV` and `LOG_LEVEL`, with placeholders only |
| `README.md` | Status line, `test` script, the new configuration variables, log format and redaction, request IDs and the error envelope |

**Not changed:**
- the protected documents
- the TASK-03A change in `apps/web/next.config.ts`
- `package-lock.json`
- the web app
- ESLint and TypeScript configuration other than `tsconfig.build.json`

---

## 4. Commands and results

| Evidence | Command(s) | Result |
|---|---|---|
| E1 | Inspection: Git, instruction files, structure, scripts, tests, review artefacts, checksums, runtime | Recorded (§1) |
| E2 | `npm run typecheck` / `npm run lint` (API, shared); `npm run test -w @kulvriksh/api` | **PASS**: 38/38 tests |
| E3 | `rm -rf apps/api/dist && npm run check` (all workspaces: typecheck, lint, test, build); `dist` listing; coverage run | **PASS**. `dist` holds only runtime modules. Coverage in §5. |
| E4 | Smoke test of the compiled API through the root `start:api` (port 4104): `/health`, `/nope?token=abc123`, log output | **PASS**: headers, request ID, envelope, JSON logs, query value not logged |
| E5 | Process stop (traced to this task); lockfile; `package.json` diff; protected checksums; TASK-03A diff untouched; secret scan; env files | **PASS** |
| E6 | Final `git status`, `git diff --stat`, untracked files, after this report was written | §7 |

**Port note:** another project on this machine listens on `0.0.0.0:3000` and `0.0.0.0:4000`. The smoke test used port 4104. The process tests use free ephemeral ports.

---

## 5. Tests and coverage of new behaviour

**38 tests, 38 passing** (`node --test`, Node 24.13.0, Windows):

| File | Tests | Behaviour covered |
|---|---|---|
| `config.test.ts` | 13 | Defaults; explicit values with trimming; empty treated as unset; non-integer ports (`abc`, `12.5`, `-1`, `4000x`); out-of-range ports (`0`, `65536`, `70000`); unknown `NODE_ENV` (including `staging`); unknown `LOG_LEVEL`; three issues reported together |
| `logger.test.ts` | 9 | JSON shape; level filtering; `silent`; level passed to the sink; redaction at depth, case- and separator-insensitive (e.g. `Authorization`, `set-cookie`, `x-razorpay-signature`, `otpCode`), with no secret text left in output; error serialisation; circular, bigint, date, undefined and depth truncation; reserved keys protected; child bindings |
| `app.test.ts` | 7 | `/health` 200 body; all security headers and no `X-Powered-By`; a unique server-generated UUID request ID, with client-supplied IDs ignored; 404 envelope with the request ID equal to the header; `POST /health` gives 404; the access log has the path without the query and the query values are absent from all log output; `/health` logged at debug |
| `errors.test.ts` | 6 | Generic 500 with **no leakage** of the error message, internal paths or stack; the 500 logged at error with the request ID and the real message; async rejection gives 500 (Express 5); 400, 413 and other 4xx mapping; 4xx logged at warn; a non-Error `next(value)` gives 500 |
| `server.test.ts` | 3 | Runs the **real entry point** (`src/server.ts`) as a child process: invalid config gives exit 1 with one structured error listing 2 issues; normal start gives a structured `listening` line and `/health` 200; **F1 regression:** a busy port gives `EADDRINUSE`, exit 1, and no `listening` line |

**Coverage** (`node --test --experimental-test-coverage`, test files and helpers excluded; E3):

| File | Lines | Branches | Functions | Uncovered |
|---|---|---|---|---|
| `app.ts` | 100% | 100% | 100% | — |
| `config.ts` | 100% | 100% | 100% | — |
| `errors.ts` | 94.0% | 95.2% | 100% | 35–37: the `headersSent` delegation |
| `logger.ts` | 99.2% | 95.8% | 100% | 81: the `String(value)` fallback |
| `middleware.ts` | 97.1% | 78.6% | 100% | 64–65: the client-disconnect warning |
| `server.ts` | 59.7% | 75.0% | 25.0% | Shutdown and crash-handler paths |
| **All files** | **91.8%** | **93.9%** | **86.1%** | |

**Not tested, and why:**
- **Real SIGTERM/SIGINT shutdown and the crash handlers in `server.ts`.** Windows cannot deliver POSIX signals to a child process from here; `child.kill()` terminates it outright. These need a Linux run (M12).
- The `headersSent` branch and the client-disconnect warning are not covered.
- Coverage uses Node's **experimental** coverage flag; the run printed no warning about it.

---

## 6. Security implications and unresolved risks

**Improvements:**
- **Log redaction:** sensitive values are redacted before logging, query strings are never logged, and error details stay out of responses.
- **Uniform headers:** every API response is `no-store`, with `nosniff`, `DENY` framing, no referrer and a deny-all CSP.
- **Traceable errors:** every error response carries a server request ID that matches the logs, without revealing internals.
- **Fail-fast config:** invalid configuration fails fast with every problem listed.

**Risks and limitations:**
1. **Redaction is key-name based.** It does not catch secrets inside free-text values, for example an error message containing a password. The error test shows the *log* still contains the original error message (it must, for diagnosis), while the *response* does not. Developers must not put secrets in error messages; code review and later log-shipping controls should cover this.
2. **Over-redaction:** any field whose name contains `otp` or `token` is redacted, for example `otpChallengeId` or `tokenHash`. This is deliberate (fail safe), but it may hide useful identifiers. Adjust it if it gets in the way.
3. **Client-supplied `X-Request-Id` is ignored.** If NGINX later assigns IDs, the API will not see them until a trusted-proxy rule is designed (with `trust proxy`, AC-14, M12).
4. **`trust proxy` is unset**, so `req.ip` will be the proxy's address behind NGINX. This **must** be decided before IP-based rate limiting (M2/M4).
5. **CORP `same-origin`** suits the proposed same-origin routing (AC-14). If cross-origin browser access is chosen instead, CORS and CORP must be revisited together.
6. **Paths are logged.** Future routes must not put secrets or personal data in path segments (e.g. reset tokens), or the access log must special-case them.
7. **No HSTS.** It is intentionally left to the HTTPS reverse proxy (M12).
8. **Stack traces are written to logs,** never to clients. Log access must be restricted on the VPS (M12).
9. **Crash handling:** after `uncaughtException` the process shuts down gracefully, with a 10-second forced exit. Real-signal behaviour is still unverified on Linux.

---

## 7. Final Git status and diff summary (E6)

**Tracked changes (`git diff --stat`):** see E6. In summary:
- **This task:** `README.md`, `apps/api/.env.example`, `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/server.ts`, `package.json`, `packages/shared/src/index.ts`
- **TASK-03A (pending, not modified by this task):** `apps/web/next.config.ts`

**Untracked:**
- **This task:**
  - `apps/api/src/{logger,middleware,errors}.ts`
  - `apps/api/src/*.test.ts` (5 files)
  - `apps/api/src/testing/helpers.ts`
  - `apps/api/tsconfig.build.json`
  - this report
- **Earlier tasks:** the TASK-03 and TASK-03A reports

**Unchanged:**
- `package-lock.json` (identical to the committed version)
- all eight protected documents (byte-identical)
- HEAD and the commit history

**Suggested commit split, for the reviewer:**
1. TASK-03A (next.config.ts and the two reports)
2. TASK-04 (everything listed above as "this task")

---

## 8. Recommended next task and dependencies

**Recommended next: M2, the web foundation and design-system base.** It is the largest remaining body of work that does not depend on client decisions.
- **Scope:**
  - route groups and stable layouts for public, customer, genealogist and admin
  - client-side navigation
  - accessible loading, error and empty patterns
  - the provisional tokens
  - core components
  - the first production-build performance baseline
  - security headers and CSP for the web app
- **No homepage design work.**
- **Dependencies:**
  - review of this task
  - decisions DS-1 (styling approach) and DS-2 (accessible primitives), because each would add a dependency
  - AC-14 (request routing between Next.js and Express) **before** any page calls the API

**In parallel, these are needed before M3/M4:**
1. the TASK-01 review outcome
2. the **CP2 technical review** of the Proposed designs
3. the **production PostgreSQL major version**, then a local native PostgreSQL install (AC-7)
4. the `trust proxy` and reverse-proxy design, before rate limiting
5. an authorised roadmap register update (FQ-1–FQ-27, DQ-1–DQ-7, AC-3)

**Still open:**
- GitHub remote: an owner action
- ESLint 9: re-check later
- real-signal shutdown verification on Linux (M12)

**I have not committed, pushed, started schema work or begun another milestone.**

---

## Appendix — Evidence (raw command output)

Commands were run in Git Bash on Windows, from the repository root. `<scratchpad>` is the agent's session scratchpad, outside the repository. These logs were embedded with Node.js, which preserves bytes. Long command echoes appear exactly as executed. The process-trace output (E5) is reproduced from the PowerShell tool result.

### E1 Inspection (before any change)

~~~text
### I1 Git
$ git status --short --branch --untracked-files=all
## main
 M apps/web/next.config.ts
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
[exit=0]

$ git log --format='%H %ad %s' --date=iso
e83562484d0495ec836b9eb896c8f7dfefd6927c 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b3fa61382ec60e8bc3120589068743866a 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and governance foundation
[exit=0]

$ git rev-parse HEAD
e83562484d0495ec836b9eb896c8f7dfefd6927c
[exit=0]

$ git diff --stat
 apps/web/next.config.ts | 3 +++
 1 file changed, 3 insertions(+)
[exit=0]

### I2 Agent / repository instruction files
$ find . -path ./node_modules -prune -o \( -iname 'AGENTS.md' -o -iname 'CLAUDE.md' -o -iname 'CONTRIBUTING.md' -o -iname '.cursorrules' -o -path '*/.github/*' \) -print; echo '(end instruction files)'
(end instruction files)
[exit=0]

### I3 Workspace structure (excluding node_modules, .git, build output)
$ find . -path ./node_modules -prune -o -path ./.git -prune -o -path ./apps/web/.next -prune -o -path ./apps/api/dist -prune -o -type f -print | sort
./.gitattributes
./.gitignore
./.nvmrc
./README.md
./apps/api/.env.example
./apps/api/package.json
./apps/api/src/app.ts
./apps/api/src/config.ts
./apps/api/src/server.ts
./apps/api/tsconfig.json
./apps/web/app/globals.css
./apps/web/app/layout.tsx
./apps/web/app/page.tsx
./apps/web/eslint.config.mjs
./apps/web/next-env.d.ts
./apps/web/next.config.ts
./apps/web/package.json
./apps/web/tsconfig.json
./apps/web/tsconfig.tsbuildinfo
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
./docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
./docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
./eslint.config.mjs
./package-lock.json
./package.json
./packages/shared/package.json
./packages/shared/src/index.ts
./packages/shared/tsconfig.json
./tsconfig.base.json
[exit=0]

### I4 Scripts
$ node -e "for (const f of ['package.json','apps/api/package.json','apps/web/package.json','packages/shared/package.json']) { const p=require('./'+f); console.log(f, JSON.stringify(p.scripts)) }"
package.json {"dev:web":"npm run dev -w @kulvriksh/web","dev:api":"npm run dev -w @kulvriksh/api","build":"npm run build --workspaces --if-present","start:web":"npm run start -w @kulvriksh/web","start:api":"npm run start -w @kulvriksh/api","typecheck":"npm run typecheck --workspaces --if-present","lint":"npm run lint --workspaces --if-present","check":"npm run typecheck && npm run lint && npm run build"}
apps/api/package.json {"dev":"node --env-file-if-exists=.env --watch src/server.ts","build":"tsc -p tsconfig.json","start":"node --env-file-if-exists=.env dist/server.js","typecheck":"tsc -p tsconfig.json --noEmit","lint":"eslint ."}
apps/web/package.json {"dev":"next dev","build":"next build","start":"next start","typecheck":"next typegen && tsc --noEmit","lint":"eslint ."}
packages/shared/package.json {"typecheck":"tsc -p tsconfig.json","lint":"eslint ."}
[exit=0]

### I5 Existing tests
$ find . -path ./node_modules -prune -o \( -name '*.test.*' -o -name '*.spec.*' -o -name '__tests__' \) -print; echo '(end tests)'
(end tests)
[exit=0]

### I6 Review artefacts for TASK-01 and CP2
$ ls docs/reports; grep -ril 'CP2' docs/reports | head; grep -l -i 'approved' docs/reports/*.md | head; echo '(no separate TASK-01 review or CP2 review document unless listed above)'
TASK-01-SPECIFICATION-REVIEW-FIXES.md
TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
TASK-03A-M0-REVIEW-FOLLOWUP.md
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
(no separate TASK-01 review or CP2 review document unless listed above)
[exit=0]

### I7 Checksums of protected and other documents (baseline)
$ md5sum docs/*.md docs/reports/*.md package-lock.json
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
[exit=0]

### I8 Runtime
$ node -v && npm -v
v24.13.0
11.6.2
[exit=0]

$ node -e "console.log(typeof require('node:test').test, process.features.typescript ?? 'n/a')"
function strip
[exit=0]

~~~

### E2 Typecheck, lint and tests (API and shared)

~~~text
$ npm run typecheck -w @kulvriksh/api -w @kulvriksh/shared

> @kulvriksh/api@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit


> @kulvriksh/shared@0.0.0 typecheck
> tsc -p tsconfig.json

[exit=0]

$ npm run lint -w @kulvriksh/api -w @kulvriksh/shared

> @kulvriksh/api@0.0.0 lint
> eslint .


> @kulvriksh/shared@0.0.0 lint
> eslint .

[exit=0]

$ npm run test -w @kulvriksh/api

> @kulvriksh/api@0.0.0 test
> node --test "src/**/*.test.ts"

✔ GET /health returns 200 and reports the database as not configured (80.5959ms)
✔ responses carry security headers and are not cacheable (19.2279ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (19.7304ms)
✔ unknown routes return the JSON error envelope with the request ID (11.4831ms)
✔ unsupported methods on known paths are not found (10.3356ms)
✔ the access log records path and status but never the query string (64.1865ms)
✔ health checks are logged at debug level only (65.5629ms)
✔ uses safe defaults when nothing is configured (4.809ms)
✔ accepts valid explicit values (whitespace trimmed) (0.6154ms)
✔ treats empty values as unset (0.4439ms)
✔ rejects non-integer API_PORT "abc" (1.8809ms)
✔ rejects non-integer API_PORT "12.5" (0.4232ms)
✔ rejects non-integer API_PORT "-1" (0.3988ms)
✔ rejects non-integer API_PORT "4000x" (0.299ms)
✔ rejects out-of-range API_PORT 0 (2.4528ms)
✔ rejects out-of-range API_PORT 65536 (0.3896ms)
✔ rejects out-of-range API_PORT 70000 (0.5102ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.491ms)
✔ rejects an unknown LOG_LEVEL (0.4195ms)
✔ reports every problem at once (0.5951ms)
✔ unexpected errors return a generic 500 without internal details (74.7164ms)
✔ the 500 is logged with the request ID and the real error message (15.0567ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (8.7192ms)
✔ client errors keep their status with a generic message (26.8317ms)
✔ client errors are logged at warn, not error (7.9126ms)
✔ non-Error values passed to next() are treated as 500 (12.6065ms)
✔ writes one JSON object per line with time, level, msg and fields (9.5366ms)
✔ filters below the configured level (1.9899ms)
✔ silent emits nothing (0.6973ms)
✔ passes the level to the sink so warn/error can go to stderr (1.2623ms)
✔ redacts sensitive keys at any depth, case-insensitively (3.7518ms)
✔ serialises errors with name, message and stack (1.0834ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (1.0094ms)
✔ fields cannot overwrite time, level or msg (1.0441ms)
✔ child loggers add bindings, and call fields take precedence (1.3662ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (579.5884ms)
✔ starts, logs a structured "listening" line and serves /health (658.645ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (406.3293ms)
ℹ tests 38
ℹ suites 0
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2070.0948
[exit=0]

~~~

### E3 Full check (all workspaces), dist contents, coverage

~~~text
$ rm -rf apps/api/dist && npm run check

> kulvriksh-platform@0.0.0 check
> npm run typecheck && npm run lint && npm run test && npm run build


> kulvriksh-platform@0.0.0 typecheck
> npm run typecheck --workspaces --if-present


> @kulvriksh/shared@0.0.0 typecheck
> tsc -p tsconfig.json


> @kulvriksh/api@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit


> @kulvriksh/web@0.0.0 typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully

> kulvriksh-platform@0.0.0 lint
> npm run lint --workspaces --if-present


> @kulvriksh/shared@0.0.0 lint
> eslint .


> @kulvriksh/api@0.0.0 lint
> eslint .


> @kulvriksh/web@0.0.0 lint
> eslint .


> kulvriksh-platform@0.0.0 test
> npm run test --workspaces --if-present


> @kulvriksh/api@0.0.0 test
> node --test "src/**/*.test.ts"

✔ GET /health returns 200 and reports the database as not configured (49.1699ms)
✔ responses carry security headers and are not cacheable (7.2881ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (7.2767ms)
✔ unknown routes return the JSON error envelope with the request ID (7.3872ms)
✔ unsupported methods on known paths are not found (5.49ms)
✔ the access log records path and status but never the query string (73.022ms)
✔ health checks are logged at debug level only (68.4314ms)
✔ uses safe defaults when nothing is configured (2.2084ms)
✔ accepts valid explicit values (whitespace trimmed) (0.2811ms)
✔ treats empty values as unset (0.1568ms)
✔ rejects non-integer API_PORT "abc" (1.0675ms)
✔ rejects non-integer API_PORT "12.5" (0.2525ms)
✔ rejects non-integer API_PORT "-1" (0.2618ms)
✔ rejects non-integer API_PORT "4000x" (0.2424ms)
✔ rejects out-of-range API_PORT 0 (1.625ms)
✔ rejects out-of-range API_PORT 65536 (0.3211ms)
✔ rejects out-of-range API_PORT 70000 (0.4207ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.2895ms)
✔ rejects an unknown LOG_LEVEL (0.2454ms)
✔ reports every problem at once (0.6354ms)
✔ unexpected errors return a generic 500 without internal details (60.7135ms)
✔ the 500 is logged with the request ID and the real error message (10.7624ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (6.7549ms)
✔ client errors keep their status with a generic message (37.4462ms)
✔ client errors are logged at warn, not error (16.0634ms)
✔ non-Error values passed to next() are treated as 500 (6.5388ms)
✔ writes one JSON object per line with time, level, msg and fields (5.2858ms)
✔ filters below the configured level (0.3234ms)
✔ silent emits nothing (0.2092ms)
✔ passes the level to the sink so warn/error can go to stderr (0.2114ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.7137ms)
✔ serialises errors with name, message and stack (0.4675ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (1.602ms)
✔ fields cannot overwrite time, level or msg (0.2919ms)
✔ child loggers add bindings, and call fields take precedence (0.2747ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (697.0724ms)
✔ starts, logs a structured "listening" line and serves /health (689.701ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (549.0071ms)
ℹ tests 38
ℹ suites 0
ℹ pass 38
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2431.3092

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 132ms

  Creating an optimized production build ...
✓ Compiled successfully in 2.4s
  Running TypeScript ...
  Finished TypeScript in 4.1s ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 2.4s
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]

$ find apps/api/dist -type f | sort
apps/api/dist/app.js
apps/api/dist/app.js.map
apps/api/dist/config.js
apps/api/dist/config.js.map
apps/api/dist/errors.js
apps/api/dist/errors.js.map
apps/api/dist/logger.js
apps/api/dist/logger.js.map
apps/api/dist/middleware.js
apps/api/dist/middleware.js.map
apps/api/dist/server.js
apps/api/dist/server.js.map
[exit=0]

$ cd apps/api && node --test --experimental-test-coverage --test-coverage-exclude='src/**/*.test.ts' --test-coverage-exclude='src/testing/**' 'src/**/*.test.ts' 2>&1 | sed -n '/start of coverage report/,/end of coverage report/p'
ℹ start of coverage report
ℹ --------------------------------------------------------------------------
ℹ file           | line % | branch % | funcs % | uncovered lines
ℹ --------------------------------------------------------------------------
ℹ src            |        |          |         | 
ℹ  app.ts        | 100.00 |   100.00 |  100.00 | 
ℹ  config.ts     | 100.00 |   100.00 |  100.00 | 
ℹ  errors.ts     |  94.00 |    95.24 |  100.00 | 35-37
ℹ  logger.ts     |  99.20 |    95.83 |  100.00 | 81
ℹ  middleware.ts |  97.10 |    78.57 |  100.00 | 64-65
ℹ  server.ts     |  59.72 |    75.00 |   25.00 | 16-17 33 38-59 66-67 70-71
ℹ --------------------------------------------------------------------------
ℹ all files      |  91.82 |    93.91 |   86.05 | 
ℹ --------------------------------------------------------------------------
ℹ end of coverage report
[exit=0]

~~~

### E4 Smoke test of the compiled API through the root start:api script

~~~text
$ netstat -ano | grep -E ":4104 .*LISTENING" || echo "port 4104 free"
port 4104 free

$ API_PORT=4104 npm run start:api > <scratchpad>/t4-api.log 2>&1 &   (compiled dist build)
$ curl -s -i http://127.0.0.1:4104/health
HTTP/1.1 200 OK
X-Request-Id: 5493c663-9fbf-454b-94b1-0bac204970ef
Cache-Control: no-store
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Content-Type: application/json; charset=utf-8
Content-Length: 86
ETag: W/"56-RpTa2Qbykk1YPbjc2U8f5wFtClU"
Date: Fri, 23 Oct 2026 22:44:21 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}

$ curl -s -i "http://127.0.0.1:4104/nope?token=abc123"
HTTP/1.1 404 Not Found
X-Request-Id: 52dfc4c0-6647-4293-b108-abf484e33c17
Cache-Control: no-store
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Cross-Origin-Resource-Policy: same-origin
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
Content-Type: application/json; charset=utf-8
Content-Length: 112
ETag: W/"70-WDVuLfd4RsK76i098Yu8HxccNjk"
Date: Fri, 23 Oct 2026 22:44:21 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"NOT_FOUND","message":"Resource not found","requestId":"52dfc4c0-6647-4293-b108-abf484e33c17"}}

$ cat <scratchpad>/t4-api.log

> kulvriksh-platform@0.0.0 start:api
> npm run start -w @kulvriksh/api


> @kulvriksh/api@0.0.0 start
> node --env-file-if-exists=.env dist/server.js

.env not found. Continuing without it.
{"time":"2026-10-23T22:44:20.570Z","level":"info","msg":"listening","service":"kulvriksh-api","url":"http://127.0.0.1:4104","nodeEnv":"development"}
{"time":"2026-10-23T22:44:21.506Z","level":"info","msg":"request completed","service":"kulvriksh-api","requestId":"52dfc4c0-6647-4293-b108-abf484e33c17","method":"GET","path":"/nope","status":404,"durationMs":14.4}

$ grep -c "abc123" <scratchpad>/t4-api.log   (query value must not be logged)
0

listening PID: 2312
~~~

### E5 Process trace and stop, lockfile, package.json diff, protected checksums, TASK-03A diff, secret scan

~~~text
# EXCERPT reproduced from the PowerShell tool result (not written to a log at the time).
# Parent-chain walk from the listening PID 2312 (command lines truncated to 120 characters by the query):
2312 <- parent 24172 : node  --env-file-if-exists=.env dist/server.js
24172 <- parent 15624 : C:\WINDOWS\system32\cmd.exe /d /s /c node --env-file-if-exists=.env dist/server.js
15624 <- parent 15864 : "C:\Program Files\OUR SOFTWARES\node.exe"  "C:\Program Files\OUR SOFTWARES\node_modules\npm\bin\npm-cli.js" run start 
15864 <- parent 24412 : C:\WINDOWS\system32\cmd.exe /d /s /c npm run start -w @kulvriksh/api
24412 <- parent 9768 : "C:\Program Files\OUR SOFTWARES\node.exe" "C:\Program Files\OUR SOFTWARES/node_modules/npm/bin/npm-cli.js" run start:api
9768 <- parent 29496 : "C:\Program Files\Git\usr\bin\bash.exe" "/c/Program Files/OUR SOFTWARES/npm" run start:api
=> stopped with: taskkill //PID 24412 //T //F (output in E5)

$ taskkill //PID 24412 //T //F   (stop this task's npm run start:api tree, traced via parent chain)
SUCCESS: The process with PID 2312 (child process of PID 24172) has been terminated.
SUCCESS: The process with PID 24172 (child process of PID 15624) has been terminated.
SUCCESS: The process with PID 15624 (child process of PID 15864) has been terminated.
SUCCESS: The process with PID 15864 (child process of PID 24412) has been terminated.
SUCCESS: The process with PID 24412 (child process of PID 9768) has been terminated.
port 4104 free

### F1 Lockfile and dependencies unchanged
$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo 'lockfile identical to committed version'
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ git diff -- package.json apps/api/package.json | grep -E '^[+-] ' ; echo '(only script lines changed above; no dependency entries)'
-    "build": "tsc -p tsconfig.json",
+    "build": "tsc -p tsconfig.build.json",
-    "lint": "eslint ."
+    "lint": "eslint .",
+    "test": "node --test \"src/**/*.test.ts\""
-    "check": "npm run typecheck && npm run lint && npm run build"
+    "test": "npm run test --workspaces --if-present",
+    "check": "npm run typecheck && npm run lint && npm run test && npm run build"
(only script lines changed above; no dependency entries)
[exit=0]

### F2 Protected documents byte-identical to the TASK-04 baseline (I7)
$ printf '%s\n' '17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md' '14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md' '8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md' '4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md' '2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md' '8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md' 'ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md' '4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md' | md5sum -c -
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: OK
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: OK
[exit=0]

### F3 TASK-03A pending change untouched
$ git diff -- apps/web/next.config.ts | grep -E '^[+-] '
+  // Stop `next dev` from writing managed AI-agent instructions into AGENTS.md
+  // (enabled by default since Next.js 16.3). Decision recorded in TASK-03A.
+  agentRules: false,
[exit=0]

### F4 Secret scan of new and changed files
$ git grep -n -I -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' -e 'gh[pousr]_[A-Za-z0-9]{36,}' -e 'rzp_(live|test)_[A-Za-z0-9]{8,}' -e '(postgres|postgresql)://[^[:space:]:@/]+:[^[:space:]@/]+@' --untracked -- apps packages README.md package.json; echo '(end high-confidence matches)'
(end high-confidence matches)
[exit=0]

$ find apps packages -name '.env' -o -name '.env.*' ! -name '.env.example' | grep -v node_modules; echo '(end env files)'
(end env files)
[exit=0]

~~~

### E6 Coverage-warning check and final Git status (after this report was written)

~~~text
$ cd apps/api && node --test --experimental-test-coverage --test-coverage-exclude='src/**/*.test.ts' --test-coverage-exclude='src/testing/**' 'src/**/*.test.ts' 2>&1 | grep -i -E 'warning|experimental'; echo "grep exit=$? (1 = no warning lines)"
grep exit=1 (1 = no warning lines)
[exit=0]

$ git status --short --branch --untracked-files=all
## main
 M README.md
 M apps/api/.env.example
 M apps/api/package.json
 M apps/api/src/app.ts
 M apps/api/src/config.ts
 M apps/api/src/server.ts
 M apps/web/next.config.ts
 M package.json
 M packages/shared/src/index.ts
?? apps/api/src/app.test.ts
?? apps/api/src/config.test.ts
?? apps/api/src/errors.test.ts
?? apps/api/src/errors.ts
?? apps/api/src/logger.test.ts
?? apps/api/src/logger.ts
?? apps/api/src/middleware.ts
?? apps/api/src/server.test.ts
?? apps/api/src/testing/helpers.ts
?? apps/api/tsconfig.build.json
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
?? docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
[exit=0]

$ git diff --stat
 README.md                    | 26 ++++++++++++++++---
 apps/api/.env.example        |  8 ++++++
 apps/api/package.json        |  5 ++--
 apps/api/src/app.ts          | 46 +++++++++++----------------------
 apps/api/src/config.ts       | 61 +++++++++++++++++++++++++++++++++++++++-----
 apps/api/src/server.ts       | 34 ++++++++++++++++--------
 apps/web/next.config.ts      |  3 +++
 package.json                 |  3 ++-
 packages/shared/src/index.ts |  7 ++++-
 9 files changed, 137 insertions(+), 56 deletions(-)
[exit=0]

$ git log --oneline
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation
[exit=0]

$ git rev-parse HEAD
e83562484d0495ec836b9eb896c8f7dfefd6927c
[exit=0]

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo 'lockfile identical to committed version'
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ printf '%s\n' '17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md' '14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md' '8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md' '4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md' '2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md' '8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md' 'ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md' '4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md' | md5sum -c -
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: OK
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: OK
[exit=0]

$ netstat -ano | grep -E ':4104 .*LISTENING' || echo 'port 4104 free (no processes left running by this task)'
port 4104 free (no processes left running by this task)
[exit=0]

~~~
