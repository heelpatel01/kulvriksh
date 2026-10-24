# TASK-04E — M1 Closeout and M2 Readiness

| Item | Value |
|---|---|
| Task ID | TASK-04E |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Type | Audit only |
| Files changed | **None** |
| File created | This report, the only working-tree change |
| Status | **Verified and green. Staging and commits are blocked on owner decisions A, B and C (§6).** Nothing was staged or committed. |

---

## 1. Summary

1. **State (§2).**
   - Branch `main`, HEAD `e83562484d0495ec836b9eb896c8f7dfefd6927c`, no remote, no stash, empty index.
   - The working tree is identical to the end of TASK-04D, plus this report.
2. **Checks (§3).** `npm run check` passed: exit 0; **62 tests, 62 pass, 0 fail**; typecheck, lint and production build all passed.
3. **The TASK-04C fixes are present in the source.** All four regression tests exist and pass.
4. **README versus implementation (§4).** Every README claim about the API is backed by code and a test. Two gaps:
   - **M1 is only partly complete against its TASK-02 definition.** The storage abstraction and the SMS, email and TTS stubs were deferred in TASK-04 as **BLOCKED**. The README does not claim them, so it is not wrong.
   - The README status line ("M1, TASK-04, under review") will go stale once the work is committed.
5. **Blockers (§9).** In priority order:
   1. owner decisions A, B and C, to unblock the commits
   2. the TASK-01 review outcome
   3. the DS-1, DS-2 and AC-14 decisions, for M2
   4. the CP1 record and the CP2 review
   5. the database prerequisites, for M3
   6. the Linux SIGTERM test

---

## 2. Repository state (E1)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `e83562484d0495ec836b9eb896c8f7dfefd6927c` |
| History | `e835624` "fix(web): let PORT choose the web port…" and `15dd95b` "chore: initialise M0…" |
| Remotes, stash, staged | None, none, none. The `.git/index` md5 `5c83ef19…` is unchanged from TASK-04D. |
| Modified tracked files | 9: TASK-03A `next.config.ts`, plus 8 TASK-04 files |
| Untracked files | 12 API source, test and config files; 7 reports (TASK-03 to TASK-04D); the 2 root SVGs; and this report |
| Integrity | Specifications, all reports up to TASK-04C, the lockfile and the 4 TASK-04C files: **17 of 17 md5 OK**. The other 20 source and configuration files: **all OK**. Lockfile, specifications, `.gitattributes`, `.gitignore` and the web/shared manifests are **identical to HEAD**. |
| TASK-04D report | md5 `5f1d539972b9eb2703f9dcf4e40ba7a2` |
| SVG files | Listed by name in `git status` only. **Not opened, checksummed, staged, moved or modified** in this task. |

---

## 3. Verification

### 3.1 `npm run check` (E2)

| Stage | Command | Result |
|---|---|---|
| Type-check | `npm run typecheck`: `tsc` for shared and api; `next typegen && tsc --noEmit` for web | **PASS** |
| Lint | `npm run lint`: ESLint in each workspace | **PASS** |
| Test | `npm run test`, which runs `node --test "src/**/*.test.ts"` | **PASS: 62 tests, 62 pass, 0 fail**, in 1,190 ms |
| Build | `npm run build`: API `tsc -p tsconfig.build.json`; web `next build` | **PASS.** Next.js 16.4.2 compiled; routes `/` and `/_not-found` are static. |
| Overall | `npm run check` | **exit 0** |

### 3.2 The TASK-04C fixes in the source (E1)

| Defect | Where (current source) | Regression test | Result |
|---|---|---|---|
| D1, ReDoS | `apps/api/src/redaction.ts:31`, the bounded `{0,32}` and `\s{0,10}` | `redaction.test.ts:81`, "scrubText stays fast on adversarial inputs (ReDoS regression)" and `:90`, "…still redacts long sensitive key names…" | PASS |
| D2, binary data | `apps/api/src/logger.ts:74`, `ArrayBuffer` / `ArrayBuffer.isView` → `[binary N bytes]` | `logger.test.ts:120`: Buffer, Uint8Array, Float64Array, DataView, ArrayBuffer and a nested Buffer | PASS |
| D3, `msg` | `apps/api/src/logger.ts:126`, `msg: scrubText(msg)` | `logger.test.ts:143`, "the msg text is scrubbed, keeping its useful context" | PASS |

All four source and test files are byte-identical to the versions approved in TASK-04C (md5 OK, E1). The full source diff is recorded in TASK-04C E9 and TASK-04D E2/E3, and it has not changed since.

The R-7 bounds are accepted provisionally, as the reviewer decided.

---

## 4. README claims versus the implementation

| README claim | Verified by | Status |
|---|---|---|
| Validated configuration: `NODE_ENV`, `API_HOST`, `API_PORT`, `LOG_LEVEL`; an invalid value stops startup with one structured error | `config.ts`; `config.test.ts` (13 tests); `server.test.ts` "invalid configuration stops startup…" | ✔ |
| Structured JSON logging, one object per line; warn/error to stderr | `logger.ts` `defaultSink`; `logger.test.ts` | ✔ |
| Redaction of sensitive field names | `isSensitiveKey`; test "redacts sensitive keys at any depth" | ✔ The README *under*-describes the protection: text scrubbing, the safe error form, binary summaries and `msg` scrubbing exist but are not mentioned. Not wrong. |
| Access log with the path but never the query string | `middleware.ts` `accessLog`; `app.test.ts` | ✔ |
| A server-generated `X-Request-Id` on every response | `middleware.ts` `requestId`; `app.test.ts` | ✔ |
| Security headers | `middleware.ts` `securityHeaders`; `app.test.ts` (2 tests) | ✔ |
| Error envelope `{"error":{"code","message","requestId"}}` | `errors.ts`; `packages/shared` `ApiErrorBody`; `errors.test.ts` | ✔ |
| Tests; `npm run check` = typecheck, lint, test, build | Root `package.json`; E2 | ✔ |
| `/health` reports `database: not_configured` and checks no database | `app.ts`; `app.test.ts` | ✔ |
| Web uses `PORT`; extra arguments after `--` are not forwarded | Committed in `e835624` (TASK-03) | ✔ (not re-run in this task) |
| "Milestone M0… M1, TASK-04, under review" | — | ⚠ **Stale after commit and approval.** Update it in a later approved task. |

**M1 scope check against the TASK-02 definition** ("…test harness, SMS/email/TTS **stub** interfaces, storage abstraction (local implementation)"):

| M1 item | Status |
|---|---|
| Config validation, logging, error envelope, request ID, health endpoint, security headers, test harness | **Done** (above) |
| Storage abstraction (local implementation) | **Not done.** BLOCKED in TASK-04: its lifecycle is a Proposed design (DM §7.4, §10.3) awaiting CP2, and it is security-sensitive. |
| SMS, email and TTS stub interfaces | **Not done.** BLOCKED in TASK-04: the interface shape depends on providers R25 and R37. |
| Graceful SIGTERM shutdown | Implemented in `server.ts`, but **never exercised** (§5) |

**Conclusion:** M1 can be closed as "M1 core done", with two explicitly deferred items. It must **not** be reported as M1 complete.

---

## 5. Outstanding: Linux SIGTERM test (NOT RUN)

This test was defined in TASK-04B §7 and is unchanged. It cannot be proven on Windows, because `child.kill()` there terminates the process without delivering SIGTERM.

**Procedure.** Run on Ubuntu (the VPS or WSL2) with Node 24.13.0, from `apps/api`, on a free port (e.g. 4199):

1. `API_PORT=4199 LOG_LEVEL=info node src/server.ts > /tmp/kv.log 2>&1 & PID=$!`
2. Wait until `/tmp/kv.log` contains `"msg":"listening"`, then run `curl -fsS http://127.0.0.1:4199/health`.
3. Open an idle keep-alive connection and leave it open, with a small Node `net` client that sends one `GET /health` with HTTP/1.1 keep-alive.
4. `kill -TERM $PID; time wait $PID; echo exit=$?`
5. Repeat steps 1–4 with `kill -INT`. Later, repeat under systemd (`KillSignal=SIGTERM`, `TimeoutStopSec=15`).

**Pass criteria:**
- exit code 0
- `"msg":"shutting down"` with the right `"reason"` (`SIGTERM` or `SIGINT`)
- **no** `"shutdown timed out, exiting"` line
- the process exits well under 10 s, with the idle connection closed
- the port is free afterwards (`ss -ltn`)
- under systemd, a clean stop with no `SIGKILL`

**Needs:** owner approval, plus access to WSL2 or the VPS.

---

## 6. Commit decisions required (staging blocked until they are answered)

| Decision | Question | Recommended option | Affected files |
|---|---|---|---|
| **A** | Commit 1 = `agentRules: false` plus the TASK-03 and TASK-03A reports. The web-port fix is already committed in `e835624`. Is that the intended content? | **Confirm.** | `apps/web/next.config.ts`, `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`, `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` |
| **B** | Three reports contain CRLF inside embedded evidence (67, 37 and 17 pairs). `* text=auto eol=lf` will store them with LF, so their recorded md5 values won't match a fresh clone. | **Accept the normalisation.** The Git blob ID becomes the authoritative identity: `7cc0c411…`, `5bb9991e…`, `38281e9a…` (TASK-04D E8). `.gitattributes` stays unchanged. | `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`, `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md`, `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md` |
| **C** | Personal data in protected reports (details below) | **Narrow redaction of the personal email, done before any push, as its own approved task.** Leave the username and paths, which are lower risk and also appear in Git author metadata. | See below |

### C. Narrowly scoped redaction proposal (E3). Not applied; awaiting approval.

**Required before any push.** Replace the personal Git email address with `<owner-git-email>` on exactly **5 lines**:

| File | Lines | What is on the line |
|---|---|---|
| `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 256 | A narrative sentence naming the global Git identity |
| `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 446 | `git config --global` output (`user.email=…`) |
| `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 1750 | `git log` "Author:" line |
| `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | 188 | `git log --format=…%ae…` output |
| `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | 189 | `git log --format=…%ae…` output |

**Effect of the redaction:**
- The two reports' md5 values change, and the change would be recorded in an errata note.
- **Commit-metadata caveat:** the existing commits `15dd95b` and `e835624` carry the same address as their **author email**. Redacting the reports does not remove it from Git history. Removing it would need history rewriting, which is **not proposed**.
- Before a public or shared push, the owner may instead prefer a GitHub "noreply" address for future commits.

**Optional, lower priority.** Replace local paths containing the Windows username (`C:\Users\HEEL PATEL\…`, `/c/Users/HEEL PATEL/…`, `ls` owner columns, the `HEELPA~1` temporary paths):

| File | Approximate number of lines |
|---|---|
| TASK-03 | 20 |
| TASK-03A | 9 |
| TASK-04A | 1 |
| TASK-04B | 2 |
| TASK-04C | 1 |

The TASK-03 lines 451–453 show system Git configuration (`credential.helper=manager`). They contain **no credential values**, so no action is needed for them.

---

## 7. Exact files that would be committed (unchanged from TASK-04D, plus this report)

| Commit | Files | Privacy or line-ending risk |
|---|---|---|
| **1** (3) | `apps/web/next.config.ts`; `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`; `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | **C:** both reports contain the email. **B:** TASK-03A has CRLF. |
| **2** (20) | `README.md`, `apps/api/.env.example`, `apps/api/package.json`, `package.json`, `packages/shared/src/index.ts`, `apps/api/src/{config,app,server,errors,middleware,logger,redaction}.ts`, `apps/api/src/testing/helpers.ts`, `apps/api/tsconfig.build.json`, `apps/api/src/{app,config,errors,logger,redaction,server}.test.ts` | None. No CR bytes, no username or email, secret scan clean (TASK-04D E7). Test values are synthetic. |
| **3** (6) | `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md`, `TASK-04A-LOGGING-REVIEW.md`, `TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md`, `TASK-04C-LOGGING-FIX.md`, `TASK-04D-COMMIT-READINESS.md` (optional), `TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md` (optional) | **B:** TASK-04 and TASK-04B have CRLF. Username in paths in 04A, 04B and 04C (optional redaction). No email. TASK-04D and this report are LF-only, with the email redacted. |
| **Never** | `Kulvriksh-V3-Desktop-1440.svg`, `Kulvriksh-V3-Mobile-390.svg`, `.env*`, `dist/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `node_modules/`, scratchpad files | — |

**Order and dependencies:** if C is approved, run the redaction task first. Then commits 1 → 2 → 3.

**Per-commit checks** (from TASK-04D §4): `git diff --cached --name-only` lists exactly that commit's files; then `git show --stat HEAD`; and `npm run check` after commit 2.

---

## 8. TASK-01, CP1, CP2, database and M2

### 8.1 TASK-01 review questions (unresolved; TASK-01 is not approved)

The TASK-01 report §9 lists these for the reviewer:

| # | Question |
|---|---|
| 1 | DM §10.1: the run-lease claim, heartbeat and release, and dropping session advisory locks |
| 2 | DM §10.3: fencing rules 3–7. Is attaching output only inside the fenced completion feasible with the storage abstraction? |
| 3 | DM §10.4: the transition tables, especially `customer_order` `failed` → `pending`/`paid`, `payment_attempt` `failed` as terminal, and `entitlement_grant` `failed` → `granted` |
| 4 | DM §5.5: the OTP verify sequence (attempt increment before comparison, atomic consume, cross-challenge budget, HMAC input, key rotation) |
| 5 | DM §5.5: rate-limit upsert semantics (window reset, counting rejected requests, fail-closed) |
| 6 | DM §9.4 and §9.7: the role model, the identity-sequence privilege, the audit transaction rule |
| 7 | DM §6.2: the creation protocol versus reserve-first. **A CP2 decision.** |
| 8 | DM §15.3: the accuracy of the blocker-to-milestone mapping |
| 9 | Scope: is the F-AUTH-03 edit acceptable? |
| 10 | Consistency: F-NOT-01 and F-PUB-04 are less detailed than the data model |

Also open from TASK-01:
- the "nine versus ten corrections" count (TASK-01 §1.2)
- next approval (b): the roadmap §9 register update for FQ-1–FQ-27 and DQ-1–DQ-7, which was **never done**
- AC-15 (TASK-02): the TASK-01 review must be completed **before M3 and M4**

### 8.2 CP1 and CP2 (unresolved)

- **CP1 ("Scope locked")** has **no recorded outcome** (TASK-02 audit: "Client sign-off (CP1) not recorded"). It covers signed scope, the permission matrix, TBC resolutions, the timeline and data volumes. The 48 roadmap TBCs (R1–R48) remain open.

- **CP2 ("Foundation ready")** has **no review**. Its scope, from roadmap §8, and current status:

| CP2 item | Status |
|---|---|
| Local setup | Partial: Node and the monorepo are done; PostgreSQL is not installed |
| Next.js foundation and shared layouts | Not started (M2) |
| Schema draft | `02-DATA-MODEL.md` r2 is a draft and not approved for schema work |
| Storage and provider abstractions | Blocked (§4) |
| Rendering and caching strategy | Not started |
| Performance test profile and first baseline | Not started (M2 exit) |

- **Technical decisions open for CP2:**
  - every "Proposed" design in the data model and the flows
  - DM §6.2 reserve-first
  - DQ-3 (row-level security), DQ-4 (triggers), DQ-5 (search approach), DQ-7 (audit tamper-evidence)
  - the TASK-04B proposals: DS-1, DS-2, AC-14, PostgreSQL 18
  - R-7, accepted provisionally
- **Client decisions open for CP2:**
  - DQ-1 (multiple roles per account)
  - DQ-2 (currency)
  - DQ-6 (report review history, with R32)

### 8.3 Database prerequisites (M3; nothing installed)

| # | Prerequisite | Status |
|---|---|---|
| 1 | M1 core | Done (§4) |
| 2 | **TASK-01 review completed** (AC-15) | Open |
| 3 | **AC-7: local PostgreSQL installation method.** README plans native Windows. TASK-04B recommends PostgreSQL 18, latest minor; 19 is a release candidate, with general availability planned for 19 Nov 2026. | Owner approval needed |
| 4 | Production version and OS confirmed: Hostinger VPS image (Ubuntu LTS assumed), with PostgreSQL 18 from the PGDG apt repository | Owner to confirm |
| 5 | Approval of the DM §9.7 role split (owner, migration, runtime) and `scram-sha-256` | CP2 / TASK-01 item 6 |
| 6 | AC-12 dependency approval for Prisma: the exact version, compatible with Node 24 and TypeScript 6.0.3, at least 14 days old | Not requested yet |
| 7 | M3 scope stays **without domain models** until CP2 approves the designs | Rule |

### 8.4 M2 entry and exit criteria

**Entry criteria.** From TASK-02 (M2: "M0; AC-12 (CSS and UI approach, DS-1)") and TASK-04B:

| # | Criterion | Status |
|---|---|---|
| 1 | M0 complete | ✔ committed |
| 2 | Committed M1 baseline (commits 1–3) | **Blocked on A, B and C** |
| 3 | **DS-1** styling decision. Proposed: CSS Modules plus custom properties. | Owner decision |
| 4 | **DS-2** accessible primitives. Proposed: React Aria Components, after an approved spike (install, bundle, keyboard, screen reader, locale). | Owner decision, then the spike |
| 5 | **AC-14** routing. Proposed: same-origin NGINX `/api`; a development-only Next.js rewrite; page CSP. | Owner decision |
| 6 | Website languages (roadmap item 3) and accessibility target (item 45) | TBC. They don't block the shell, but they affect fonts, tokens and test claims. |

**Exit criteria (TASK-02):**
- production build
- route groups and stable layouts for public, customer, genealogist and admin, with no homepage
- client-side navigation with no full reloads between shell routes
- loading, error and empty patterns
- a recorded production-build performance baseline
- an accessibility check of the components

---

## 9. Prioritised blocker list

| Priority | Blocker | Owner | Unblocks |
|---|---|---|---|
| 1 | Decisions **A, B, C** (§6). If C is approved, a 5-line email-redaction task. | Owner | Commits 1–3, the committed M1 baseline |
| 2 | **TASK-01 review outcome** (§8.1) | ChatGPT reviewer, then owner | M3 and M4 (AC-15) |
| 3 | **DS-1, DS-2, AC-14** decisions, plus approval of the DS-2 spike | Owner | M2 |
| 4 | **CP1 record** and the **CP2 review** plan (§8.2) | Owner and client | Proposed designs, domain tables, M4 and M8 |
| 5 | **AC-7 and PostgreSQL 18**, VPS OS confirmation, Prisma approval (§8.3) | Owner | M3 |
| 6 | **Linux SIGTERM test** (§5) | Owner (environment) | Confirms shutdown before deployment |
| 7 | SVG ownership and licensing | Owner | The SVGs only; they stay excluded |
| 8 | A GitHub remote URL, and a noreply email for future commits | Owner | Push |

---

## 10. Confirmations

- **Nothing was staged, committed, pushed, stashed, reset, amended or rewritten. No remote was created.** The index md5 is unchanged.
- **No file was modified or deleted.** The only change is this new report.
- **No dependencies were installed.** No Prisma schema, migration, authentication or feature was added. M2 was not started. No specification or decision was changed. TASK-01 is not marked approved.
- **The SVG files were not inspected, staged, moved, modified or deleted.**

**Decisions needed:** A, B and C (§6). I am waiting for them before staging anything.

---

## Appendix — Evidence (raw command output)

Paths under the session scratchpad are shown as `<scratchpad>`. Embedded by a Node script. CR bytes are removed, and any personal email address is replaced with `[personal email masked]` or `[personal email redacted]`.

### E1 Git state, integrity checksums (SVGs excluded), regression tests and fixes present in source

````text
$ git branch --show-current; git rev-parse HEAD; git log --format="%H %s"; git remote -v; git stash list; git diff --cached --name-only
main
e83562484d0495ec836b9eb896c8f7dfefd6927c
e83562484d0495ec836b9eb896c8f7dfefd6927c fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b3fa61382ec60e8bc3120589068743866a chore: initialise M0 repository and governance foundation
(remotes end)
(stash end)
(staged end)
5c83ef19e4ba7071317703a1d135ca63 *.git/index

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
?? Kulvriksh-V3-Desktop-1440.svg
?? Kulvriksh-V3-Mobile-390.svg
?? apps/api/src/app.test.ts
?? apps/api/src/config.test.ts
?? apps/api/src/errors.test.ts
?? apps/api/src/errors.ts
?? apps/api/src/logger.test.ts
?? apps/api/src/logger.ts
?? apps/api/src/middleware.ts
?? apps/api/src/redaction.test.ts
?? apps/api/src/redaction.ts
?? apps/api/src/server.test.ts
?? apps/api/src/testing/helpers.ts
?? apps/api/tsconfig.build.json
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
?? docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
?? docs/reports/TASK-04A-LOGGING-REVIEW.md
?? docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
?? docs/reports/TASK-04C-LOGGING-FIX.md
?? docs/reports/TASK-04D-COMMIT-READINESS.md

$ md5sum -c (all non-SVG files vs TASK-04D-verified values; SVGs deliberately not read)
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: OK
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: OK
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: OK
docs/reports/TASK-04A-LOGGING-REVIEW.md: OK
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md: OK
docs/reports/TASK-04C-LOGGING-FIX.md: OK
package-lock.json: OK
apps/api/src/redaction.ts: OK
apps/api/src/logger.ts: OK
apps/api/src/redaction.test.ts: OK
apps/api/src/logger.test.ts: OK
[exit=0]
(other 20 source/config files: only non-OK lines shown above) [exit=0]
5f1d539972b9eb2703f9dcf4e40ba7a2 *docs/reports/TASK-04D-COMMIT-READINESS.md

$ git diff --quiet HEAD -- package-lock.json docs/*.md docs/reports/TASK-01*.md docs/reports/TASK-02*.md apps/web/package.json packages/shared/package.json .gitattributes .gitignore && echo identical to HEAD
identical to HEAD

$ grep regression tests present in the repository
apps/api/src/logger.test.ts:120:test('binary values are summarised by size and their bytes never reach output', () => {
apps/api/src/logger.test.ts:143:test('the msg text is scrubbed, keeping its useful context', () => {
apps/api/src/redaction.test.ts:81:test('scrubText stays fast on adversarial inputs (ReDoS regression)', () => {
apps/api/src/redaction.test.ts:90:test('scrubText still redacts long sensitive key names after the quantifiers were bounded', () => {

$ grep the three fixes in source
31:    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
74:  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
126:    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
````


### E2 npm run check

````text
$ npm run check

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

✔ GET /health returns 200 and reports the database as not configured (45.9588ms)
✔ responses carry security headers and are not cacheable (8.1912ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (8.4673ms)
✔ unknown routes return the JSON error envelope with the request ID (7.6734ms)
✔ error responses carry the same security headers as successful ones (11.8248ms)
✔ unsupported methods on known paths are not found (5.0552ms)
✔ the access log records path and status but never the query string (58.8492ms)
✔ health checks are logged at debug level only (52.7706ms)
✔ uses safe defaults when nothing is configured (3.8045ms)
✔ accepts valid explicit values (whitespace trimmed) (0.2465ms)
✔ treats empty values as unset (0.1333ms)
✔ rejects non-integer API_PORT "abc" (1.2998ms)
✔ rejects non-integer API_PORT "12.5" (0.1862ms)
✔ rejects non-integer API_PORT "-1" (0.2759ms)
✔ rejects non-integer API_PORT "4000x" (0.1408ms)
✔ rejects out-of-range API_PORT 0 (1.3208ms)
✔ rejects out-of-range API_PORT 65536 (0.3068ms)
✔ rejects out-of-range API_PORT 70000 (0.4026ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.2455ms)
✔ rejects an unknown LOG_LEVEL (0.1744ms)
✔ reports every problem at once (0.2897ms)
✔ unexpected errors return a generic 500 without internal details (45.5176ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (6.0768ms)
✔ client errors carrying a raw request body are logged without the body (5.0625ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (5.2596ms)
✔ client errors keep their status with a generic message (20.3222ms)
✔ client errors are logged at warn, not error (5.7003ms)
✔ non-Error values passed to next() are treated as 500 (3.3827ms)
✔ writes one JSON object per line with time, level, msg and fields (4.9692ms)
✔ filters below the configured level (0.4984ms)
✔ silent emits nothing (0.2482ms)
✔ passes the level to the sink so warn/error can go to stderr (1.5613ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.7704ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (3.7874ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.6926ms)
✔ ordinary string fields are scrubbed too (0.2485ms)
✔ binary values are summarised by size and their bytes never reach output (0.5813ms)
✔ the msg text is scrubbed, keeping its useful context (0.3655ms)
✔ serialises errors with name, message and stack (0.3085ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.8206ms)
✔ fields cannot overwrite time, level or msg (0.1768ms)
✔ child loggers add bindings, and call fields take precedence (0.1443ms)
✔ scrubText removes database URL credentials and query values (4.9021ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.3052ms)
✔ scrubText removes Authorization header values and JWTs (0.1896ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.2616ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.2423ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.3997ms)
✔ scrubText stays fast on adversarial inputs (ReDoS regression) (41.0483ms)
✔ scrubText still redacts long sensitive key names after the quantifiers were bounded (0.3299ms)
✔ scrubText caps very long text (3.3156ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.4126ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.3476ms)
✔ serializeError limits stack frames (0.2735ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.5093ms)
✔ serializeError includes scrubbed cause messages (0.2872ms)
✔ serializeError summarises AggregateError members (at most 5) (0.8455ms)
✔ serializeError handles non-Error values without dumping objects (0.1926ms)
✔ serializeError rejects unsafe code values (0.2529ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (250.3766ms)
✔ starts, logs a structured "listening" line and serves /health (376.7415ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (252.8217ms)
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1189.8106

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 261ms

  Creating an optimized production build ...
✓ Compiled successfully in 542ms
  Running TypeScript ...
  Finished TypeScript in 1862ms ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 885ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]
````


### E3 Privacy: exact redaction-candidate lines (email masked at capture)

````text
$ redaction-candidate lines per report (email masked; lines cut to 150 chars)
-- docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
256:- **Initialisation:** `git init -b main`. **No Git configuration was changed.** The machine's existing global identity (`Heel Patel <[personal ema
374:/c/Users/HEEL PATEL/Desktop/KulVriksh
445:file:C:/Users/HEEL PATEL/.gitconfig	user.name=Heel Patel
446:file:C:/Users/HEEL PATEL/.gitconfig	user.email=[personal email masked]
451:file:C:/Program Files/Git/etc/gitconfig	core.autocrlf=true
452:file:C:/Program Files/Git/etc/gitconfig	credential.helper=manager
453:file:C:/Program Files/Git/etc/gitconfig	credential.https://dev.azure.com.usehttppath=true
862:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
883:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
1090:npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\api
1092:npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\api
1209:Initialized empty Git repository in C:/Users/HEEL PATEL/Desktop/KulVriksh/.git/
1439:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
1507:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
1593:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
1699:npm error extraneous: @img/sharp-wasm32@0.35.5 C:\Users\HEEL PATEL\Desktop\KulVriksh\node_modules\@img\sharp-wasm32
1702:kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
1750:Author: Heel Patel <[personal email masked]>
1819:Invalid project directory provided, no such directory: C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web\3101
1822:npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
1824:npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
1842:Invalid project directory provided, no such directory: C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web\3102
1845:npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
1847:npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
1972:-rw-r--r-- 1 HEEL PATEL 197121 679 2026-10-24 03:14:19.822630400 +0530 apps/web/AGENTS.md
-- docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
188:e83562484d0495ec836b9eb896c8f7dfefd6927c Heel Patel <[personal email masked]> 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port ins
189:15dd95b3fa61382ec60e8bc3120589068743866a Heel Patel <[personal email masked]> 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and govern
215:-rw-r--r-- 1 HEEL PATEL 197121 679 2026-10-24 03:14:19.822630400 +0530 apps/web/AGENTS.md
547:21960 <- parent 1980 : "C:\Program Files\OUR SOFTWARES\node.exe" "C:\Users\HEEL PATEL\Desktop\KulVriksh\node_modules\next\dist\server\lib\start-se
548:1980 <- parent 25636 : "C:\Program Files\OUR SOFTWARES\node.exe" ../../node_modules/next/dist/bin/next dev
549:25636 <- parent 27244 : "C:\Program Files\Git\bin\..\usr\bin\bash.exe" -c "source '/c/Users/HEEL PATEL/.claude/shell-snapshots/... (this task's sh
553:24872 <- parent 4080 : "C:\Program Files\OUR SOFTWARES\node.exe" "C:\Users\HEEL PATEL\Desktop\KulVriksh\node_modules\next\dist\server\lib\start-se
554:4080 <- parent 26040 : "C:\Program Files\OUR SOFTWARES\node.exe" ../../node_modules/next/dist/bin/next dev
555:26040 <- parent 18212 : "C:\Program Files\Git\bin\..\usr\bin\bash.exe" -c "source '/c/Users/HEEL PATEL/.claude/shell-snapshots/snapshot-bash-17927
561:13968 <- parent 12104 : "C:\Program Files\OUR SOFTWARES\node.exe"  "C:\Program Files\OUR SOFTWARES\node_modules\npm\bin\npm-cli.js" run start 
563:26000 <- parent 38720 : "C:\Program Files\OUR SOFTWARES\node.exe" "C:\Program Files\OUR SOFTWARES/node_modules/npm/bin/npm-cli.js" run start:api
-- docs/reports/TASK-04A-LOGGING-REVIEW.md
340:{"time":"2026-10-23T23:02:37.383Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://app:db-pass-77@10.0.0.5/
342:{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"e3","err":{"name":"Error","message":"outer wrapper","stack":"Error: outer wrapper\n    a
362:{"time":"2026-10-23T23:03:26.786Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://[REDACTED]@10.0.0.5/kul?
363:{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"e2","err":{"name":"Error","message":"OTP [REDACTED] rejected for [REDACTED_NUMBER] ([RED
364:{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"e3","err":{"name":"Error","message":"outer wrapper","stack":"at file:///C:/Users/HEELPA%
-- docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
459:e83562484d0495ec836b9eb896c8f7dfefd6927c Heel Patel 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port instead of hard-coding 3000
460:15dd95b3fa61382ec60e8bc3120589068743866a Heel Patel 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and governance foundation
1030:-rw-r--r-- 1 HEEL PATEL 197121 6754869 2026-10-24 04:51:47.325508000 +0530 Kulvriksh-V3-Desktop-1440.svg
1031:-rw-r--r-- 1 HEEL PATEL 197121 3264415 2026-10-24 04:51:58.342363900 +0530 Kulvriksh-V3-Mobile-390.svg
-- docs/reports/TASK-04C-LOGGING-FIX.md
524:Error: Cannot find module 'C:\Users\HEELPA%7E1\AppData\Local\Temp\claude\c--Users-HEEL-PATEL-Desktop-KulVriksh\188cd3b6-033b-41f3-9501-bcff2902bb5

$ TASK-03 report lines 440-452 (git config listing context, email masked)
$ git rev-parse --is-inside-work-tree
fatal: not a git repository (or any of the parent directories): .git
[exit=128]

$ git config --global --list --show-origin | grep -E 'user\.|init\.defaultBranch|core\.autocrlf|core\.eol' ; echo '(end selected global config)'
file:C:/Users/HEEL PATEL/.gitconfig	user.name=Heel Patel
file:C:/Users/HEEL PATEL/.gitconfig	user.email=[personal email masked]
(end selected global config)
[exit=0]

$ git config --system --list --show-origin 2>/dev/null | grep -E 'init\.defaultBranch|core\.autocrlf|core\.eol|credential' ; echo '(end selected syste
file:C:/Program Files/Git/etc/gitconfig	core.autocrlf=true
file:C:/Program Files/Git/etc/gitconfig	credential.helper=manager
````


### E4 Final git status, staged list, index and lockfile checksums, processes (after this report was created)

````text
$ git status --short --branch --untracked-files=all; git diff --cached --name-only; md5sum .git/index package-lock.json
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
?? Kulvriksh-V3-Desktop-1440.svg
?? Kulvriksh-V3-Mobile-390.svg
?? apps/api/src/app.test.ts
?? apps/api/src/config.test.ts
?? apps/api/src/errors.test.ts
?? apps/api/src/errors.ts
?? apps/api/src/logger.test.ts
?? apps/api/src/logger.ts
?? apps/api/src/middleware.ts
?? apps/api/src/redaction.test.ts
?? apps/api/src/redaction.ts
?? apps/api/src/server.test.ts
?? apps/api/src/testing/helpers.ts
?? apps/api/tsconfig.build.json
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
?? docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
?? docs/reports/TASK-04A-LOGGING-REVIEW.md
?? docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
?? docs/reports/TASK-04C-LOGGING-FIX.md
?? docs/reports/TASK-04D-COMMIT-READINESS.md
?? docs/reports/TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md
(staged end)
5c83ef19e4ba7071317703a1d135ca63 *.git/index
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ node.exe processes from this repository / scratchpad
(end processes)
````

