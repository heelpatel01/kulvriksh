# TASK-04D — Final Commit-Readiness Audit

| Item | Value |
|---|---|
| Task ID | TASK-04D |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Type | Audit only. The repository was inspected directly; earlier reports were not relied on. |
| Files changed | **None** |
| File created | This report. It is the only working-tree change. |
| Status | **Ready to stage once approved, subject to three owner decisions (§6).** Nothing was staged, and the index file is byte-identical to its state before the audit. |

---

## 1. Summary

1. **State (§2).**
   - Branch `main`, HEAD `e83562484d0495ec836b9eb896c8f7dfefd6927c`, no remote, no stash, empty index.
   - 9 modified tracked files and 20 untracked files, plus this report.
   - **Unchanged since TASK-04C:** every file matches its expected checksum. The four TASK-04C files are at their approved checksums.
   - **No unexpected changes:** no protected specification, roadmap, data model, lockfile or dependency manifest has changed.
2. **Commit plan (§4).** Three commits:
   - **Commit 1:** 3 files
   - **Commit 2:** 20 files
   - **Commit 3:** 5 files, including this report

   **Checks on the plan:**
   - No path appears in two commits.
   - Every changed or untracked path is in exactly one commit, except the two SVG files, which are excluded on purpose.
   - `git add --dry-run` accepts every existing planned file.
3. **Validation (§5).** `npm run check` passed: exit 0, **62 tests, 62 pass, 0 fail**, and the production build succeeded.
4. **Discrepancies to resolve before staging (§6):**
   - **(A) Wording mismatch.** The task calls TASK-03A "the approved web-port fix", but the web-port fix is **already committed** (`e835624`). TASK-03A's uncommitted change is `agentRules: false`.
   - **(B) CRLF normalisation.** Three earlier reports contain CRLF line endings inside embedded evidence. Under `* text=auto eol=lf`, Git will store them with LF, so the committed bytes, and any fresh clone, will **not** match the md5 values recorded for those reports.
   - **(C) Personal data in protected reports.** Two protected reports contain a **personal email address**, the Git `user.email`, together with local Windows paths and the username. The address already appears as the author email of both existing commits.

---

## 2. Repository state (E1)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `e83562484d0495ec836b9eb896c8f7dfefd6927c`, "fix(web): let PORT choose the web port instead of hard-coding 3000" |
| Earlier commit | `15dd95b3fa61382ec60e8bc3120589068743866a`, "chore: initialise M0 repository and governance foundation" |
| Remotes | None |
| Stash | Empty |
| Staged | Nothing. `git diff --cached` is empty, and the `.git/index` md5 was `5c83ef19…` before the audit, after the dry runs, after `npm run check`, and at the end. |
| Ignored (generated, never commit) | `apps/api/dist/`, `apps/web/.next/`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`, `node_modules/` |

### 2.1 Modified tracked files (9). The full `git diff` is in E2.

| File | +/− | Origin | Change |
|---|---|---|---|
| `apps/web/next.config.ts` | +3/−0 | TASK-03A | `agentRules: false`, so `next dev` stops writing `AGENTS.md` |
| `README.md` | +23/−3 | TASK-04 | M1 description, the `test` script, the `NODE_ENV`/`LOG_LEVEL` settings, and notes on logging, request IDs and the error envelope |
| `apps/api/.env.example` | +8/−0 | TASK-04 | `NODE_ENV` and `LOG_LEVEL` placeholders (no values that matter) |
| `apps/api/package.json` | +3/−2 | TASK-04 | `build` uses `tsconfig.build.json`; a `test` script. **No dependency change.** |
| `apps/api/src/app.ts` | +15/−31 | TASK-04 | Middleware wiring, `/health`, the error handlers |
| `apps/api/src/config.ts` | +54/−7 | TASK-04 | Validation of `NODE_ENV` and `LOG_LEVEL`; every issue reported at once |
| `apps/api/src/server.ts` | +23/−11 | TASK-04 | Structured config error, logger, graceful shutdown |
| `package.json` | +2/−1 | TASK-04 | A root `test` script, and `check` now includes `test`. **No dependency change.** |
| `packages/shared/src/index.ts` | +6/−1 | TASK-04 | `requestId` added to `ApiErrorBody` |

### 2.2 Untracked files (20). Source contents are in E3.

| File | md5 | Bytes | Origin |
|---|---|---|---|
| `apps/api/src/errors.ts` | `fde68094…` | 1,912 | TASK-04 |
| `apps/api/src/middleware.ts` | `2000979f…` | 2,507 | TASK-04 |
| `apps/api/src/logger.ts` | `67d53875…` | 4,895 | TASK-04, TASK-04A, **TASK-04C** |
| `apps/api/src/redaction.ts` | `8f5c43ce…` | 5,208 | TASK-04A, **TASK-04C** |
| `apps/api/src/testing/helpers.ts` | `390e19bc…` | 1,509 | TASK-04 |
| `apps/api/tsconfig.build.json` | `12b87c98…` | 209 | TASK-04 |
| `apps/api/src/app.test.ts` | `d7ad83a9…` | 4,207 | TASK-04, TASK-04A |
| `apps/api/src/config.test.ts` | `efd84bb2…` | 2,022 | TASK-04 |
| `apps/api/src/errors.test.ts` | `da9651e8…` | 4,853 | TASK-04, TASK-04A |
| `apps/api/src/logger.test.ts` | `68b3f359…` | 7,801 | TASK-04, TASK-04A, **TASK-04C** |
| `apps/api/src/redaction.test.ts` | `fc26d311…` | 8,418 | TASK-04A, **TASK-04C** |
| `apps/api/src/server.test.ts` | `8927ce39…` | 4,206 | TASK-04, TASK-04A |
| `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | `ccd78b65…` | 85,786 | Report |
| `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | `4194bdfd…` | 44,182 | Report |
| `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md` | `f99d8052…` | 41,774 | Report |
| `docs/reports/TASK-04A-LOGGING-REVIEW.md` | `663cf6af…` | 50,556 | Report |
| `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md` | `f1009c48…` | 81,159 | Report |
| `docs/reports/TASK-04C-LOGGING-FIX.md` | `e9e83170…` | 58,416 | Report |
| `Kulvriksh-V3-Desktop-1440.svg` | `22bdff56…` | 6,754,869 | **Excluded** (§3) |
| `Kulvriksh-V3-Mobile-390.svg` | `309f3a1a…` | 3,264,415 | **Excluded** (§3) |

The reports are listed by path, size and checksum rather than reproduced here. Each one is a file in the repository, readable as it stands.

### 2.3 TASK-04C introduced only its approved changes (E5)

- **The four approved files** are at the checksums recorded at the end of TASK-04C:
  - `redaction.ts` `8f5c43ce…`
  - `logger.ts` `67d53875…`
  - `redaction.test.ts` `fc26d311…`
  - `logger.test.ts` `68b3f359…`
- **Every other source and configuration file** (20 files) matches the TASK-04C **starting** checksums: `md5sum -c`, 20 of 20 OK.
- **The only other addition** is the TASK-04C report, `e9e83170…`.

### 2.4 No unexpected change to protected or dependency files (E1, E5)

| File | Check | Result |
|---|---|---|
| `docs/00-ROADMAP.md`, `docs/01-PRODUCT-FLOWS.md`, `docs/02-DATA-MODEL.md`, `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md` | md5 and `git diff --quiet HEAD` | Identical |
| TASK-01 and TASK-02 reports (already committed) | md5 and `git diff --quiet HEAD` | Identical |
| TASK-03 to TASK-04C reports (untracked) | md5 against their recorded values | Identical |
| `package-lock.json` | md5 `90c261c4…` and `git diff --quiet HEAD` | Identical |
| `apps/web/package.json`, `packages/shared/package.json`, `apps/web/tsconfig.json`, `apps/api/tsconfig.json` | `git diff --quiet HEAD` | Identical to HEAD |
| `package.json`, `apps/api/package.json` | md5 against the TASK-04 values; diff in E2 | Script-only changes from TASK-04. No dependency was added, removed or changed. |

---

## 3. Mandatory exclusions (confirmed)

| Item | How it is excluded |
|---|---|
| `Kulvriksh-V3-Desktop-1440.svg`, `Kulvriksh-V3-Mobile-390.svg` | Not in any commit. They were not staged, modified or deleted; both md5 OK (E5). They wait for ownership and licensing to be confirmed. |
| `.env` files | None exist, other than the tracked `apps/api/.env.example` (E5). `.gitignore` also blocks `.env` and `.env.*`. |
| Scratchpad files and probes | They live outside the repository in the session scratchpad, so none can be staged. |
| Generated output | Ignored by `.gitignore`: `dist/`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `node_modules/` |

---

## 4. Proposed commit plan

The plan was reconciled against the TASK-04B §6 proposal and the actual repository:

| Commit | TASK-04B proposed | Actual | Correction |
|---|---|---|---|
| 1 | 3 files | **3 files** | None |
| 2 | 20 files | **20 files** | None to the count. TASK-04C changed the contents of four of them, and the expected test count of 62 is now confirmed. |
| 3 | 3 reports, plus TASK-04C "once it exists" | **5 reports** | Adds the TASK-04C report, which now exists, and this TASK-04D report |

**Order:** 1 → 2 → 3. Commit 3 depends on commit 2, so the reports describe committed code. Commits 1 and 2 are independent in content; the order is only for readability.

### Commit 1 — TASK-03A: stop `next dev` writing `AGENTS.md`, with its reports

| # | File | Purpose |
|---|---|---|
| 1 | `apps/web/next.config.ts` | `agentRules: false` (the TASK-03A decision) |
| 2 | `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | The TASK-03 report, including the TASK-03A errata. Its code was committed in `15dd95b` and `e835624`, but the report itself never was. |
| 3 | `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | The TASK-03A report |

**Message:**
```
chore(web): stop next dev writing AGENTS.md; add TASK-03 and TASK-03A reports

Set agentRules: false in next.config.ts (TASK-03A decision).
Add the TASK-03 repository governance report (with TASK-03A errata)
and the TASK-03A review follow-up report.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Commit 2 — M1 API foundation (TASK-04, TASK-04A and TASK-04C)

| # | File | Purpose |
|---|---|---|
| 1 | `README.md` | Documents the M1 foundation, `npm run test`, configuration and logging |
| 2 | `apps/api/.env.example` | `NODE_ENV` and `LOG_LEVEL` placeholders |
| 3 | `apps/api/package.json` | `build` via `tsconfig.build.json`; `test` script |
| 4 | `package.json` | Root `test` script; `check` includes tests |
| 5 | `packages/shared/src/index.ts` | `requestId` in the shared `ApiErrorBody` contract |
| 6 | `apps/api/src/config.ts` | Validated configuration |
| 7 | `apps/api/src/app.ts` | App composition: middleware, `/health`, error handlers |
| 8 | `apps/api/src/server.ts` | Explicit `http.Server`, structured startup errors, graceful shutdown |
| 9 | `apps/api/src/errors.ts` | JSON error envelope; generic 4xx/5xx; safe error logging |
| 10 | `apps/api/src/middleware.ts` | Request IDs, security headers, query-free access log |
| 11 | `apps/api/src/logger.ts` | Structured JSON logger with key redaction, string scrubbing, binary summarising (D2) and `msg` scrubbing (D3) |
| 12 | `apps/api/src/redaction.ts` | `scrubText` (with the bounded rule, D1) and `serializeError` |
| 13 | `apps/api/src/testing/helpers.ts` | Test helpers: log capture, ephemeral server |
| 14 | `apps/api/tsconfig.build.json` | Excludes tests from the production build |
| 15 | `apps/api/src/app.test.ts` | HTTP behaviour, headers, request IDs, access log |
| 16 | `apps/api/src/config.test.ts` | Configuration validation |
| 17 | `apps/api/src/errors.test.ts` | Error responses and safe error logging |
| 18 | `apps/api/src/logger.test.ts` | Logger behaviour, plus the D2 and D3 regression tests |
| 19 | `apps/api/src/redaction.test.ts` | Scrubbing and error serialisation, plus the D1 regression tests |
| 20 | `apps/api/src/server.test.ts` | Process-level startup, `/health` and the EADDRINUSE regression |

**Message:**
```
feat(api): M1 safe API foundation

- validated configuration (NODE_ENV, API_HOST, API_PORT, LOG_LEVEL), all issues reported at once
- structured JSON logging with key redaction, string scrubbing and a safe error form
- server-generated request IDs, baseline security headers, query-free access log
- JSON error envelope with requestId; generic client and server errors
- explicit http.Server with graceful SIGTERM/SIGINT shutdown
- node:test suite (unit and process-level) wired into npm run check
- bounded redaction patterns (no ReDoS), binary values summarised, msg scrubbed

See reports TASK-04, TASK-04A, TASK-04B and TASK-04C (committed separately).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

### Commit 3 — Task reports

| # | File | Purpose |
|---|---|---|
| 1 | `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md` | M1 foundation report |
| 2 | `docs/reports/TASK-04A-LOGGING-REVIEW.md` | Logging security review |
| 3 | `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md` | Architecture proposals and the D1–D3 findings |
| 4 | `docs/reports/TASK-04C-LOGGING-FIX.md` | The D1–D3 fix |
| 5 | `docs/reports/TASK-04D-COMMIT-READINESS.md` | This audit. Optional: drop it if the owner prefers not to commit audit-only reports. |

**Message:**
```
docs(reports): add TASK-04, TASK-04A, TASK-04B, TASK-04C and TASK-04D reports

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

**After all three commits,** `git status` should show only the two SVG files as untracked.

### Per-commit validation, to run when approved

| Step | Check |
|---|---|
| Before each commit | `git diff --cached --name-only` lists **exactly** that commit's files, and nothing else is staged. |
| Before each commit | `git diff --cached --check` shows no whitespace errors. Any `CRLF will be replaced by LF` warning applies only to the three reports in §6 B. |
| After each commit | `git show --stat HEAD` matches the file table above. |
| After commit 2 | `npm run check` passes with 62 tests. The tree after commit 2 equals today's tree minus files that don't affect the build (reports, SVGs), so today's result in E4 is representative. |
| After commit 3 | Only the SVGs remain untracked. The lockfile md5 is still `90c261c4…`. |
| Commit 1 on its own | Validated **by inspection only**. An isolated `npm run check` of HEAD plus `next.config.ts` would need a temporary `git worktree` and `npm ci`, which is not approved. |

---

## 5. Validation results

| Check | Result | Evidence |
|---|---|---|
| `npm run check` on the current repository: typecheck, lint, test, build | **PASS.** Exit 0; 62 tests, 62 pass, 0 fail; `next build` compiled. | E4 |
| Every planned commit file exists | **PASS.** 27 of 27; the 28th is this report, created now. | E6 |
| No file appears in more than one commit | **PASS.** No duplicates. | E6 |
| Every changed or untracked file is planned | **PASS.** Only the two SVGs are unplanned, as required. | E6 |
| `git add --dry-run` for each group | **PASS.** All files accepted; none ignored. The index was not written. | E6 |
| Staged index empty | **PASS.** `git diff --cached` is empty, and the `.git/index` md5 is unchanged at `5c83ef19…`. | E1, E6, E4 |
| Lockfile and dependency manifests unchanged | **PASS** | E1, E5 |
| Protected specifications and every report byte-identical | **PASS.** 19 of 19 `md5sum -c` OK, covering the specifications, all reports, the lockfile, the SVGs and the four TASK-04C files. | E5 |
| Secret scan over every candidate file (private keys, AWS, Razorpay live/test, `sk_live_` patterns) | **PASS.** No matches. | E7 |
| `.env` files | **PASS.** None. | E5 |
| Line endings | **FLAGGED** (§6 B) | E7, E8 |
| Personal data in candidate files | **FLAGGED** (§6 C) | E7, E9 |
| Stray processes and ports | **PASS.** No repository or probe `node.exe`. Ports 3000 and 4000 are held only by other projects (PIDs 7668 and 19480). | E5 |

---

## 6. Discrepancies and items to resolve before staging

### A. "Web-port fix" wording (clarification only)

The TASK-04D prompt describes commit 1 as "TASK-03A — the approved web-port fix". **The web-port fix (`PORT` instead of a hard-coded 3000) is already committed** as `e835624`; `apps/web/package.json` is identical to HEAD.

TASK-03A's only uncommitted code change is `agentRules: false` in `apps/web/next.config.ts`. Commit 1 therefore contains that change and the TASK-03 and TASK-03A reports. **Please confirm this is the intended content.**

### B. CRLF line endings in three reports (decision needed)

`docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`, `TASK-04-M1-SAFE-FOUNDATION-REPORT.md` and `TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md` contain 67, 37 and 17 CRLF pairs, and no lone CR. They all sit inside evidence copied byte for byte from Windows command output, such as `netstat` and `tasklist`.

With `* text=auto eol=lf`, Git normalises these files on staging. `git hash-object` shows the stored blob would differ from the raw bytes (E8). As a result:
- the committed content, and any fresh clone, will be LF-only;
- the md5 values recorded for these three reports in later reports (`4194bdfd…`, `f99d8052…`, `f1009c48…`) will **not** match a fresh checkout;
- the visible text does not change, because only the line terminators inside the evidence blocks do.

**Options:**
1. **Recommended:** accept the normalisation. Record that, for these three reports, the authoritative identity after commit is the Git blob ID (the "filtered" IDs in E8), not the working-tree md5. Nothing needs editing.
2. Keep the bytes exact by adding `docs/reports/*.md -text` to `.gitattributes`, which turns off line-ending conversion for reports. That is a configuration change, which needs separate approval.

The other reports, including TASK-04C and this one, have no CR bytes. In this report, CR bytes in embedded command output were removed so that it stays LF-only (see the appendix note).

### C. Personal data in protected reports (decision needed)

| Report | Content |
|---|---|
| `TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | One **personal email address** (the Git `user.email`, at line 446), the Git user name, and absolute local paths containing the Windows username |
| `TASK-03A-M0-REVIEW-FOLLOWUP.md` | The same email address (two occurrences of its local part), process command lines with local paths, and the username |
| `TASK-04A`, `TASK-04B`, `TASK-04C` reports | The Windows username, in local paths and `ls` owner columns. No email address. |

**Context:**
- That email address **is already the author email of both existing commits** (E9), so committing the reports adds no new exposure inside this repository.
- It would, however, appear in searchable file content once the repository is pushed.
- These reports are protected, so I have not edited them. I have deliberately not reproduced the address in this report.

**Options:**
1. Accept, since the repository is private and the address is already in the commit metadata.
2. Approve a redaction task for those reports before commit 1 or commit 3. That changes their recorded checksums.
3. Hold the affected reports out of the commits.

### D. Other notes (no action required)

- `README.md` describes the M1 foundation as "(M1, TASK-04, under review)". That wording will be out of date once it is committed and approved. Leave it, or update it in a later approved task.
- TASK-01 is **not** marked approved. Its review outcome remains unresolved, as do the CP2 questions. Nothing in this plan changes either.
- The TASK-04B commit messages are reused unchanged. The commit 3 message now names all five reports.

---

## 7. Outstanding blockers

| # | Blocker | Blocks |
|---|---|---|
| 1 | **Owner approval to stage and commit** (this plan) | All commits |
| 2 | Decision on §6 B, CRLF normalisation | Commits 1 and 3 (the affected reports) |
| 3 | Decision on §6 C, personal data in the protected reports | Commits 1 and 3 |
| 4 | Confirmation of §6 A, commit 1's content | Commit 1 |
| 5 | SVG ownership and licensing | The SVGs only; they stay excluded |
| 6 | TASK-01 review outcome, CP2, a GitHub remote URL | Not this plan. They block later milestones and any push. |

---

## 8. Final Git status (E10)

The status is unchanged from the start of the audit, apart from this report, which is new and untracked:

```
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
```

## 9. Confirmations

- **Nothing was staged, committed, pushed, stashed, reset, amended or rewritten. No remote was created.** The index md5 is unchanged.
- **No file was modified or deleted.** The only working-tree change is this new report.
- **No packages were installed.** M2 was not started. No specification was changed, and no CP2 question was resolved. TASK-01 is not marked approved.
- **The SVG files were not touched.**

I am waiting for explicit approval before staging or committing anything.

---

## Appendix — Evidence (raw command output)

Paths under the session scratchpad are shown as `<scratchpad>`. Outputs are embedded by a Node script. **Carriage-return bytes from Windows command output were removed during embedding**, so that this report is LF-only and its committed bytes equal its working-tree bytes (§6 B). No other change was made.

### E1 Git state, ignore rules, untracked inventory, protected/manifest checksums

````text
$ git branch --show-current; git rev-parse HEAD; git log --format="%H %s"
main
e83562484d0495ec836b9eb896c8f7dfefd6927c
e83562484d0495ec836b9eb896c8f7dfefd6927c fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b3fa61382ec60e8bc3120589068743866a chore: initialise M0 repository and governance foundation

$ git remote -v; echo "(remotes end)"; git stash list; echo "(stash end)"; git diff --cached --name-only; echo "(staged end)"
(remotes end)
(stash end)
(staged end)

$ md5sum .git/index
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

$ git status --short --ignored | grep "^!!"
!! apps/api/dist/
!! apps/web/.next/
!! apps/web/next-env.d.ts
!! apps/web/tsconfig.tsbuildinfo
!! node_modules/

$ cat .gitignore .gitattributes
# Dependencies
node_modules/

# Environment files: never commit real configuration or secrets.
# Only documented placeholder examples are tracked.
.env
.env.*
!.env.example

# Build output and generated caches
.next/
out/
dist/
build/
coverage/
*.tsbuildinfo
.eslintcache
.cache/
# Generated by Next.js (`next dev`, `next build`, `next typegen`)
next-env.d.ts

# Logs
logs/
*.log
npm-debug.log*

# Local private runtime data: uploads, media, exports, temporary files and backups.
# Runtime data must live under .data/ (see README); the anchored names below are a safety net.
.data/
/uploads/
/private-media/
/exports/
/backups/
/tmp/
apps/*/uploads/
apps/*/.data/
*.dump
*.backup
*.bak
*.sql.gz

# Editor and operating-system artifacts
.vscode/
.idea/
*.swp
.DS_Store
Thumbs.db
desktop.ini
--- .gitattributes
# Store and check out text files with LF line endings on every platform.
# The project is developed on Windows (where Git is configured with core.autocrlf=true)
# and will run on a Linux VPS; this keeps line endings consistent regardless of local Git settings.
* text=auto eol=lf

$ git diff --stat; git diff --numstat
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
23	3	README.md
8	0	apps/api/.env.example
3	2	apps/api/package.json
15	31	apps/api/src/app.ts
54	7	apps/api/src/config.ts
23	11	apps/api/src/server.ts
3	0	apps/web/next.config.ts
2	1	package.json
6	1	packages/shared/src/index.ts

$ git ls-files --others --exclude-standard | while read f; do printf "%s  %s bytes  %s lines\n" "$(md5sum < "$f" | cut -c1-32)" "$(wc -c < "$f")" "$(wc -l < "$f")"; done
22bdff56e07c7bba6f9becbc4b38cfba    6754869 bytes       6 lines  Kulvriksh-V3-Desktop-1440.svg
309f3a1a0c18e4203f456e92e85447f0    3264415 bytes       4 lines  Kulvriksh-V3-Mobile-390.svg
d7ad83a9c31102924baa4c2401bf6eab       4207 bytes     101 lines  apps/api/src/app.test.ts
efd84bb2a3b36fc8913505f804343637       2022 bytes      54 lines  apps/api/src/config.test.ts
da9651e8bb6be26adeed8bbe588117b6       4853 bytes     114 lines  apps/api/src/errors.test.ts
fde680946aa4b17ae6dceaa4bcf6ba1c       1912 bytes      50 lines  apps/api/src/errors.ts
68b3f35965f20834573b0efd6cef91a6       7801 bytes     191 lines  apps/api/src/logger.test.ts
67d53875651dbd23e372a39847be6f36       4895 bytes     144 lines  apps/api/src/logger.ts
2000979ffaa9678e8c5f5e1c3219e564       2507 bytes      69 lines  apps/api/src/middleware.ts
fc26d311a60630a353d314a51c2c1bd5       8418 bytes     195 lines  apps/api/src/redaction.test.ts
8f5c43ceb3f00f2acffcd99449bcf588       5208 bytes     133 lines  apps/api/src/redaction.ts
8927ce3975776ba45b34e2b05bbbd3c4       4206 bytes      99 lines  apps/api/src/server.test.ts
390e19bc3025cc62dc7e719b143f2f9a       1509 bytes      46 lines  apps/api/src/testing/helpers.ts
12b87c9898ed7a4b541ebdfd438c27ac        209 bytes       6 lines  apps/api/tsconfig.build.json
ccd78b6570346ab82788c84f2aab646b      85786 bytes    2178 lines  docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
4194bdfd5d9371a3b026edbfdf75057b      44182 bytes     966 lines  docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
f99d805210481297c663be15200ab902      41774 bytes     799 lines  docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
663cf6af556d08dea5d305e3dbd89557      50556 bytes     920 lines  docs/reports/TASK-04A-LOGGING-REVIEW.md
f1009c483b1e558ccf506a7207557e73      81159 bytes    1357 lines  docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
e9e83170a82ef8a566ef4bcf118158d9      58416 bytes    1123 lines  docs/reports/TASK-04C-LOGGING-FIX.md

$ md5sum (tracked modified files + protected files + lockfile + manifests)
daf6b700671972ce7da0cf9d94802619 *README.md
6bddb878ca58153328038e0ffb93f4dd *apps/api/.env.example
c69d04c1d356fb8c00c2a6109e0125d5 *apps/api/package.json
5df42c2f7f0f54891cece12a2335c188 *apps/api/src/app.ts
c3b9ac0f843e89f9615a86f8ac6d6454 *apps/api/src/config.ts
3d111ea9733b7f86e956db8c81699adb *apps/api/src/server.ts
c300b5724be7c30f2a666a077438696c *apps/web/next.config.ts
21479ab49362e80774f48a74e9fd1fc3 *package.json
a6be31e094621cfde21ca43a13a56995 *packages/shared/src/index.ts
03e58878eebb1e1ece894973405eab7b *packages/shared/package.json
2f25bbf3c6119c76f91053a7e59dc5f3 *apps/web/package.json
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md

$ git diff --quiet HEAD -- package-lock.json docs/00-ROADMAP.md docs/01-PRODUCT-FLOWS.md docs/02-DATA-MODEL.md docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md packages/shared/package.json apps/web/package.json apps/web/tsconfig.json apps/api/tsconfig.json && echo "all identical to HEAD"
all identical to HEAD
[exit=0]
````


### E2 Full git diff of the 9 modified tracked files

````text
$ git diff   (all 9 modified tracked files)
diff --git a/README.md b/README.md
index bc47fd4..cd5a613 100644
--- a/README.md
+++ b/README.md
@@ -7,7 +7,13 @@ Monorepo for the Kulvriksh Digital Platform, developed by Cortax IT Solutions fo
 **Milestone M0 — repository and governance foundation.** It contains only:
 
 - `apps/web`: a minimal Next.js placeholder page with provisional design tokens
-- `apps/api`: a minimal Express API with a health endpoint
+- `apps/api`: a minimal Express API with a health endpoint. Its foundation (M1, TASK-04, under review) adds:
+  - validated configuration
+  - structured JSON logging with secret redaction
+  - request IDs
+  - security headers
+  - a consistent error envelope
+  - tests
 - `packages/shared`: shared TypeScript contracts (type-only)
 
 **Not implemented yet:** database, Prisma schema and migrations, authentication, OTP, payments, family workspaces and tree, media, research, notifications, the admin and genealogist portals, the public website, and deployment.
@@ -70,7 +76,8 @@ The health endpoint only reports that the API process is running. It does **not*
 | `npm run start:web` / `npm run start:api` | Run the production builds (run `npm run build` first) |
 | `npm run typecheck` | Type-check every workspace |
 | `npm run lint` | Lint every workspace with ESLint |
-| `npm run check` | Type-check, lint and build |
+| `npm run test` | Run the tests: the API uses Node's built-in test runner on its `src/**/*.test.ts` files |
+| `npm run check` | Type-check, lint, test and build |
 
 ## Configuration
 
@@ -78,8 +85,21 @@ The health endpoint only reports that the API process is running. It does **not*
 
 | Variable | Default | Notes |
 |---|---|---|
+| `NODE_ENV` | `development` | `development`, `test` or `production` |
 | `API_HOST` | `127.0.0.1` | |
-| `API_PORT` | `4000` | An invalid value stops the API at startup |
+| `API_PORT` | `4000` | |
+| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |
+
+Any invalid value stops the API at startup with one structured error that lists every problem.
+
+**API logs:**
+- **Format:** one JSON object per line. `warn` and `error` go to stderr; everything else goes to stdout.
+- **Redaction:** values of fields whose names look sensitive (password, secret, token, cookie, authorization, signature, OTP and similar) are replaced with `[REDACTED]`.
+- **Access log:** one line per request, with the path but never the query string.
+
+**Request IDs and errors:**
+- Every response carries a server-generated `X-Request-Id` header.
+- Error responses use `{"error":{"code","message","requestId"}}`. The `requestId` is the reference to quote when reporting a problem.
 
 **Web:** no application settings are needed yet. The web app listens on port `3000` by default. To use another port, set `PORT` before starting it:
 
diff --git a/apps/api/.env.example b/apps/api/.env.example
index 121747f..57dba2c 100644
--- a/apps/api/.env.example
+++ b/apps/api/.env.example
@@ -1,10 +1,18 @@
 # Example configuration for the Kulvriksh API. Placeholder values only.
 # Copy to apps/api/.env for local development. .env files are git-ignored and must never be committed.
 
+# Runtime environment: development | test | production. Default: development.
+# (A separate staging environment is not decided; see roadmap R11.)
+NODE_ENV=development
+
 # Address and port the API listens on. Defaults: 127.0.0.1 and 4000.
 API_HOST=127.0.0.1
 API_PORT=4000
 
+# Log level: debug | info | warn | error | silent. Default: info.
+# Logs are JSON lines; warn and error go to stderr, everything else to stdout.
+LOG_LEVEL=info
+
 # Not yet implemented, and intentionally absent until their milestones are approved:
 # - Database connection (M3, after PostgreSQL setup and data-model approval)
 # - Session and OTP secrets (M4)
diff --git a/apps/api/package.json b/apps/api/package.json
index a642426..142f064 100644
--- a/apps/api/package.json
+++ b/apps/api/package.json
@@ -6,10 +6,11 @@
   "type": "module",
   "scripts": {
     "dev": "node --env-file-if-exists=.env --watch src/server.ts",
-    "build": "tsc -p tsconfig.json",
+    "build": "tsc -p tsconfig.build.json",
     "start": "node --env-file-if-exists=.env dist/server.js",
     "typecheck": "tsc -p tsconfig.json --noEmit",
-    "lint": "eslint ."
+    "lint": "eslint .",
+    "test": "node --test \"src/**/*.test.ts\""
   },
   "dependencies": {
     "express": "5.3.0"
diff --git a/apps/api/src/app.ts b/apps/api/src/app.ts
index 94c9bf8..b6617db 100644
--- a/apps/api/src/app.ts
+++ b/apps/api/src/app.ts
@@ -1,47 +1,31 @@
-import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
-import type { ApiErrorBody, HealthResponse } from '@kulvriksh/shared';
+import express, { type Express } from 'express';
+import type { HealthResponse } from '@kulvriksh/shared';
+import { createErrorHandler, notFoundHandler } from './errors.ts';
+import type { Logger } from './logger.ts';
+import { accessLog, requestId, securityHeaders } from './middleware.ts';
 
-function errorBody(code: string, message: string): ApiErrorBody {
-  return { error: { code, message } };
+export interface AppDependencies {
+  logger: Logger;
 }
 
-const notFound: RequestHandler = (_req, res) => {
-  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found'));
-};
-
-// Express recognises error handlers by their four parameters, so `_next` must stay.
-const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
-  if (res.headersSent) {
-    next(err);
-    return;
-  }
-  const status =
-    typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number'
-      ? err.status
-      : 500;
-  if (status >= 400 && status < 500) {
-    res.status(status).json(errorBody('BAD_REQUEST', 'The request could not be processed'));
-    return;
-  }
-  // Never send internal details to the client.
-  console.error('[api] unhandled error:', err instanceof Error ? err.message : err);
-  res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error'));
-};
-
-export function createApp(): Express {
+export function createApp({ logger }: AppDependencies): Express {
   const app = express();
   app.disable('x-powered-by');
 
+  app.use(requestId);
+  app.use(securityHeaders);
+  app.use(accessLog(logger));
+
   app.get('/health', (_req, res) => {
     const body: HealthResponse = {
       status: 'ok',
       service: 'kulvriksh-api',
       dependencies: { database: 'not_configured' },
     };
-    res.set('Cache-Control', 'no-store').json(body);
+    res.json(body);
   });
 
-  app.use(notFound);
-  app.use(errorHandler);
+  app.use(notFoundHandler);
+  app.use(createErrorHandler(logger));
   return app;
 }
diff --git a/apps/api/src/config.ts b/apps/api/src/config.ts
index 0cbc696..a17f58a 100644
--- a/apps/api/src/config.ts
+++ b/apps/api/src/config.ts
@@ -1,34 +1,81 @@
+export const NODE_ENVS = ['development', 'test', 'production'] as const;
+export type NodeEnv = (typeof NODE_ENVS)[number];
+
+export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
+export type LogLevel = (typeof LOG_LEVELS)[number];
+
 export interface ApiConfig {
+  readonly nodeEnv: NodeEnv;
   readonly host: string;
   readonly port: number;
+  readonly logLevel: LogLevel;
 }
 
+/** Thrown when configuration is invalid. Lists every problem so they can all be fixed at once. */
 export class ConfigError extends Error {
-  constructor(message: string) {
-    super(message);
+  readonly issues: readonly string[];
+
+  constructor(issues: readonly string[]) {
+    super(`Invalid configuration: ${issues.join('; ')}`);
     this.name = 'ConfigError';
+    this.issues = issues;
   }
 }
 
 const DEFAULT_HOST = '127.0.0.1';
 const DEFAULT_PORT = 4000;
+const DEFAULT_NODE_ENV: NodeEnv = 'development';
+const DEFAULT_LOG_LEVEL: LogLevel = 'info';
 
-function parsePort(raw: string | undefined): number {
+function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
+  return (values as readonly string[]).includes(value);
+}
+
+function readEnum<T extends string>(
+  name: string,
+  raw: string | undefined,
+  values: readonly T[],
+  fallback: T,
+  issues: string[],
+): T {
+  if (raw === undefined || raw.trim() === '') {
+    return fallback;
+  }
+  const value = raw.trim();
+  if (isOneOf(values, value)) {
+    return value;
+  }
+  issues.push(`${name} must be one of ${values.join(', ')}, got "${raw}"`);
+  return fallback;
+}
+
+function readPort(raw: string | undefined, issues: string[]): number {
   if (raw === undefined || raw.trim() === '') {
     return DEFAULT_PORT;
   }
   if (!/^\d+$/.test(raw.trim())) {
-    throw new ConfigError(`API_PORT must be an integer, got "${raw}"`);
+    issues.push(`API_PORT must be an integer, got "${raw}"`);
+    return DEFAULT_PORT;
   }
   const port = Number(raw);
   if (port < 1 || port > 65535) {
-    throw new ConfigError(`API_PORT must be between 1 and 65535, got ${port}`);
+    issues.push(`API_PORT must be between 1 and 65535, got ${port}`);
+    return DEFAULT_PORT;
   }
   return port;
 }
 
 /** Reads and validates configuration; throws ConfigError so startup fails fast. */
 export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
-  const host = env.API_HOST?.trim() || DEFAULT_HOST;
-  return { host, port: parsePort(env.API_PORT) };
+  const issues: string[] = [];
+  const config: ApiConfig = {
+    nodeEnv: readEnum('NODE_ENV', env.NODE_ENV, NODE_ENVS, DEFAULT_NODE_ENV, issues),
+    host: env.API_HOST?.trim() || DEFAULT_HOST,
+    port: readPort(env.API_PORT, issues),
+    logLevel: readEnum('LOG_LEVEL', env.LOG_LEVEL, LOG_LEVELS, DEFAULT_LOG_LEVEL, issues),
+  };
+  if (issues.length > 0) {
+    throw new ConfigError(issues);
+  }
+  return config;
 }
diff --git a/apps/api/src/server.ts b/apps/api/src/server.ts
index 2d045b4..8cefa64 100644
--- a/apps/api/src/server.ts
+++ b/apps/api/src/server.ts
@@ -1,6 +1,7 @@
 import { createServer } from 'node:http';
 import { createApp } from './app.ts';
 import { ConfigError, loadConfig, type ApiConfig } from './config.ts';
+import { createLogger } from './logger.ts';
 
 const SHUTDOWN_TIMEOUT_MS = 10_000;
 
@@ -9,7 +10,7 @@ function readConfig(): ApiConfig {
     return loadConfig();
   } catch (err) {
     if (err instanceof ConfigError) {
-      console.error(`[api] configuration error: ${err.message}`);
+      createLogger({ level: 'error' }).error('configuration error', { issues: err.issues });
       process.exit(1);
     }
     throw err;
@@ -17,44 +18,55 @@ function readConfig(): ApiConfig {
 }
 
 const config = readConfig();
+const logger = createLogger({ level: config.logLevel, bindings: { service: 'kulvriksh-api' } });
 
 // An explicit http.Server is used because Express 5's app.listen() also calls its callback
 // on failure (e.g. EADDRINUSE). server.listen() calls it only once listening has succeeded.
-const server = createServer(createApp());
+const server = createServer(createApp({ logger }));
 
 server.on('error', (err) => {
-  console.error(`[api] server error: ${err.message}`);
+  logger.error('server error', { err });
   process.exit(1);
 });
 
 server.listen(config.port, config.host, () => {
-  console.log(`[api] listening on http://${config.host}:${config.port}`);
+  logger.info('listening', { url: `http://${config.host}:${config.port}`, nodeEnv: config.nodeEnv });
 });
 
 let shuttingDown = false;
 
-function shutdown(signal: NodeJS.Signals): void {
+function shutdown(reason: string, exitCode: number): void {
   if (shuttingDown) {
     return;
   }
   shuttingDown = true;
-  console.log(`[api] ${signal} received, closing server`);
+  logger.info('shutting down', { reason });
 
   const forceExit = setTimeout(() => {
-    console.error('[api] shutdown timed out, exiting');
+    logger.error('shutdown timed out, exiting');
     process.exit(1);
   }, SHUTDOWN_TIMEOUT_MS);
   forceExit.unref();
 
   server.close((err) => {
     if (err) {
-      console.error(`[api] error while closing: ${err.message}`);
+      logger.error('error while closing', { err });
       process.exit(1);
     }
-    process.exit(0);
+    process.exit(exitCode);
   });
   server.closeIdleConnections();
 }
 
-process.on('SIGTERM', shutdown);
-process.on('SIGINT', shutdown);
+process.on('SIGTERM', () => shutdown('SIGTERM', 0));
+process.on('SIGINT', () => shutdown('SIGINT', 0));
+
+// After an unexpected error the process state is unknown: log it, stop accepting work, exit non-zero.
+process.on('uncaughtException', (err) => {
+  logger.error('uncaught exception', { err });
+  shutdown('uncaughtException', 1);
+});
+process.on('unhandledRejection', (reason) => {
+  logger.error('unhandled promise rejection', { err: reason });
+  shutdown('unhandledRejection', 1);
+});
diff --git a/apps/web/next.config.ts b/apps/web/next.config.ts
index ddf578e..6dfac61 100644
--- a/apps/web/next.config.ts
+++ b/apps/web/next.config.ts
@@ -3,6 +3,9 @@ import type { NextConfig } from 'next';
 const nextConfig: NextConfig = {
   reactStrictMode: true,
   poweredByHeader: false,
+  // Stop `next dev` from writing managed AI-agent instructions into AGENTS.md
+  // (enabled by default since Next.js 16.3). Decision recorded in TASK-03A.
+  agentRules: false,
 };
 
 export default nextConfig;
diff --git a/package.json b/package.json
index 5c84789..ba8aaf1 100644
--- a/package.json
+++ b/package.json
@@ -21,7 +21,8 @@
     "start:api": "npm run start -w @kulvriksh/api",
     "typecheck": "npm run typecheck --workspaces --if-present",
     "lint": "npm run lint --workspaces --if-present",
-    "check": "npm run typecheck && npm run lint && npm run build"
+    "test": "npm run test --workspaces --if-present",
+    "check": "npm run typecheck && npm run lint && npm run test && npm run build"
   },
   "devDependencies": {
     "@eslint/js": "9.39.5",
diff --git a/packages/shared/src/index.ts b/packages/shared/src/index.ts
index 21b85c7..b679ec2 100644
--- a/packages/shared/src/index.ts
+++ b/packages/shared/src/index.ts
@@ -1,11 +1,16 @@
 // Cross-application contracts shared by the API and the web app.
 // Keep this package limited to types and contracts that both applications genuinely use.
 
-/** Error response body returned by every API error (404, 500, ...). */
+/**
+ * Error response body returned by every API error (404, 500, ...).
+ * `requestId` matches the X-Request-Id response header and the server logs,
+ * so it can be quoted to support as a reference.
+ */
 export interface ApiErrorBody {
   error: {
     code: string;
     message: string;
+    requestId: string;
   };
 }
 
````


### E3 Exact contents of the 12 untracked source, test and config files

````text
===== apps/api/src/errors.ts =====
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@kulvriksh/shared';
import type { Logger } from './logger.ts';
import { getRequestId } from './middleware.ts';

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

export function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
  return { error: { code, message, requestId } };
}

function statusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  const candidate = 'status' in err ? err.status : 'statusCode' in err ? err.statusCode : undefined;
  return typeof candidate === 'number' ? candidate : undefined;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
};

/** Final error handler. Clients get a generic message and the request ID; details go only to the log. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express recognises error handlers by their four parameters, so `next` must stay.
  return (err: unknown, _req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const requestId = getRequestId(res);
    const status = statusOf(err);
    if (status !== undefined && status >= 400 && status < 500) {
      logger.warn('client error', { requestId, status, err });
      res
        .status(status)
        .json(errorBody(CLIENT_ERROR_CODES[status] ?? 'CLIENT_ERROR', 'The request could not be processed', requestId));
      return;
    }
    logger.error('unhandled error', { requestId, err });
    res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error', requestId));
  };
}

===== apps/api/src/middleware.ts =====
import { randomUUID } from 'node:crypto';
import type { RequestHandler, Response } from 'express';
import type { Logger } from './logger.ts';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Returns the request ID assigned by `requestId`, or "unknown" if it is missing. */
export function getRequestId(res: Response): string {
  const id: unknown = res.locals.requestId;
  return typeof id === 'string' ? id : 'unknown';
}

/**
 * Assigns a server-generated ID to every request and returns it in the X-Request-Id header.
 * Client-supplied IDs are ignored on purpose: whether a trusted reverse proxy may set one
 * is a deployment decision that has not been made yet.
 */
export const requestId: RequestHandler = (_req, res, next) => {
  const id = randomUUID();
  res.locals.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
};

/**
 * Baseline headers for a JSON-only API. Responses are never cacheable by shared caches,
 * because later endpoints will return private data. HSTS is left to the HTTPS reverse proxy.
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  next();
};

/**
 * Logs one line per request when the response completes. Only the path is logged:
 * query strings are dropped because they may carry tokens or personal data.
 */
export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    const path = req.originalUrl.split('?')[0] ?? '';
    const fields = () => ({
      requestId: getRequestId(res),
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
    });
    res.on('finish', () => {
      // Health probes run frequently; keep them out of the info-level log.
      if (path === '/health') {
        logger.debug('request completed', fields());
      } else {
        logger.info('request completed', fields());
      }
    });
    res.on('close', () => {
      if (!res.writableFinished) {
        logger.warn('request closed before the response finished', fields());
      }
    });
    next();
  };
}

===== apps/api/src/logger.ts =====
import type { LogLevel } from './config.ts';
import { REDACTED, scrubText, serializeError } from './redaction.ts';

export { REDACTED };

// Minimal structured logger: one JSON object per line, with secret redaction.
// Deliberately dependency-free; it can be replaced by a logging library later
// without changing call sites, because callers depend only on the Logger interface.

export type LogFields = Record<string, unknown>;
type EmitLevel = Exclude<LogLevel, 'silent'>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export type LogSink = (line: string, level: EmitLevel) => void;

export interface LoggerOptions {
  level: LogLevel;
  sink?: LogSink;
  bindings?: LogFields;
  now?: () => Date;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

// A field is redacted when its normalised name contains any of these fragments.
// Over-redaction is preferred to leaking a credential.
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'signature',
  'privatekey',
  'otp',
];
const RESERVED_KEYS = new Set(['time', 'level', 'msg']);
// Values under these keys are always serialised as errors, even when they are not Error
// instances (e.g. a rejection reason), so raw objects never reach the log.
const ERROR_KEYS = new Set(['err', 'error', 'reason', 'cause']);
const MAX_DEPTH = 6;

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

function sanitise(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return scrubText(value);
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (depth >= MAX_DEPTH) {
    return '[Truncated]';
  }
  // Binary data (Buffer, typed arrays, ArrayBuffer) is summarised, never walked byte by byte.
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return `[binary ${value.byteLength} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    if (value instanceof Error) {
      // Allowlisted, scrubbed representation; never the error's arbitrary properties.
      return serializeError(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => sanitise(item, depth + 1, seen));
    }
    return sanitiseObject(value as Record<string, unknown>, depth, seen);
  }
  return String(value);
}

function sanitiseObject(obj: Record<string, unknown>, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
    } else if (ERROR_KEYS.has(key)) {
      out[key] = serializeError(val);
    } else {
      out[key] = sanitise(val, depth + 1, seen);
    }
  }
  return out;
}

const defaultSink: LogSink = (line, level) => {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

export function createLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? defaultSink;
  const now = options.now ?? (() => new Date());
  const threshold = LEVEL_RANK[options.level];
  const bindings = options.bindings ?? {};

  const write = (level: EmitLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_RANK[level] < threshold) {
      return;
    }
    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
    const extra = sanitiseObject({ ...bindings, ...fields }, 0, new WeakSet());
    for (const [key, val] of Object.entries(extra)) {
      // Fields can never overwrite the core time/level/msg keys.
      if (!RESERVED_KEYS.has(key) && val !== undefined) {
        record[key] = val;
      }
    }
    sink(JSON.stringify(record), level);
  };

  return {
    debug: (msg, fields) => write('debug', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (childBindings) => createLogger({ ...options, bindings: { ...bindings, ...childBindings } }),
  };
}

===== apps/api/src/redaction.ts =====
// Log-safety helpers: scrub credentials and personal data out of free text, and turn
// arbitrary error values into a bounded, allowlisted structure. Used by the logger.
//
// Pattern-based scrubbing is a second line of defence. It cannot recognise every
// possible secret, so code must still avoid putting secrets in messages.

export const REDACTED = '[REDACTED]';

const MAX_STRING_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_FRAMES = 15;
const MAX_CAUSE_DEPTH = 3;
const MAX_AGGREGATE_ERRORS = 5;

const SENSITIVE_WORDS =
  'password|passwd|pwd|secret|token|api[_-]?key|authori[sz]ation|cookie|signature|private[_-]?key|otp|session[_-]?id';

type Replacement = string | ((match: string, ...groups: string[]) => string);

// Applied in order. Each rule replaces only the sensitive part and keeps the surrounding text.
const RULES: ReadonlyArray<readonly [RegExp, Replacement]> = [
  // Credentials embedded in URLs: scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi, `$1${REDACTED}@`],
  // Query-string values (they often carry tokens or personal data)
  [/([?&][^=\s&#]+)=[^&\s#]*/g, `$1=${REDACTED}`],
  // HTTP authorisation schemes
  [/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // key=value, key: value and "key":"value" where the key looks sensitive.
  // Quantifiers are bounded: unbounded runs around the keyword backtrack catastrophically (ReDoS).
  [
    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
    `$1$2$1$3$4${REDACTED}$4`,
  ],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, REDACTED],
  // Email addresses
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
  // One-time codes that follow a keyword, e.g. "OTP 482913"
  [/\b(otp|pin|passcode|verification code)(\W{1,3})\d{4,8}\b/gi, `$1$2${REDACTED}`],
  // Long digit runs: phone numbers, card-like numbers
  [/(?<![\w.])\+?\d{10,19}(?![\w.])/g, '[REDACTED_NUMBER]'],
  // Long token-like strings mixing letters and digits (API keys, hex digests).
  // Slashes and dashes are excluded so file paths and UUIDs survive.
  [/[A-Za-z0-9_+]{32,}={0,2}/g, (match) => (/\d/.test(match) && /[A-Za-z]/.test(match) ? REDACTED : match)],
];

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/** Removes credentials and personal data from free text and caps its length. */
export function scrubText(text: string, max = MAX_STRING_LENGTH): string {
  let out = truncate(text, max);
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement as string);
  }
  return out;
}

export interface SafeError {
  name: string;
  message: string;
  code?: string | number;
  status?: number;
  syscall?: string;
  stack?: string;
  cause?: SafeError;
  errors?: SafeError[];
}

function prop(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

/**
 * Converts any thrown value into a bounded, allowlisted structure.
 * Never includes arbitrary own properties (request config, headers, response bodies,
 * raw request bodies), because providers and libraries attach those to errors.
 */
export function serializeError(value: unknown, depth = 0): SafeError {
  if (!(value instanceof Error)) {
    let message: string;
    if (typeof value === 'string') {
      message = scrubText(value, MAX_MESSAGE_LENGTH);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
      message = String(value);
    } else {
      message = `[non-Error ${Array.isArray(value) ? 'array' : typeof value} omitted]`;
    }
    return { name: 'NonError', message };
  }

  const safe: SafeError = {
    name: scrubText(String(value.name), 100),
    message: scrubText(value.message, MAX_MESSAGE_LENGTH),
  };

  const code = prop(value, 'code');
  if (typeof code === 'number' || (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code))) {
    safe.code = code;
  }
  const status = prop(value, 'status') ?? prop(value, 'statusCode');
  if (typeof status === 'number') {
    safe.status = status;
  }
  const syscall = prop(value, 'syscall');
  if (typeof syscall === 'string' && /^[a-z_]{1,32}$/.test(syscall)) {
    safe.syscall = syscall;
  }

  // Keep only the "at ..." frames: the stack's first line repeats the (unscrubbed) message.
  if (typeof value.stack === 'string') {
    const frames = value.stack
      .split('\n')
      .filter((line) => /^\s+at\s/.test(line))
      .slice(0, MAX_STACK_FRAMES)
      .map((line) => scrubText(line.trim(), MAX_MESSAGE_LENGTH));
    if (frames.length > 0) {
      safe.stack = frames.join('\n');
    }
  }

  if (depth < MAX_CAUSE_DEPTH) {
    if ('cause' in value && value.cause !== undefined) {
      safe.cause = serializeError(value.cause, depth + 1);
    }
    const nested = prop(value, 'errors');
    if (Array.isArray(nested)) {
      safe.errors = nested.slice(0, MAX_AGGREGATE_ERRORS).map((item) => serializeError(item, depth + 1));
    }
  }
  return safe;
}

===== apps/api/src/testing/helpers.ts =====
// Test-only helpers. Excluded from the production build (tsconfig.build.json).
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger, type Logger } from '../logger.ts';

export interface CapturedLogger {
  logger: Logger;
  lines: Record<string, unknown>[];
  raw: string[];
}

/** A logger that records every emitted line (at debug level) instead of writing to stdout. */
export function captureLogger(): CapturedLogger {
  const lines: Record<string, unknown>[] = [];
  const raw: string[] = [];
  const logger = createLogger({
    level: 'debug',
    sink: (line) => {
      raw.push(line);
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });
  return { logger, lines, raw };
}

export interface RunningServer {
  baseUrl: string;
  close(): Promise<void>;
}

/** Starts a handler on an ephemeral localhost port. */
export async function startServer(handler: RequestListener): Promise<RunningServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

===== apps/api/tsconfig.build.json =====
{
  // Production build: compile the API without tests or test helpers.
  // Type-checking (tsconfig.json) still covers them.
  "extends": "./tsconfig.json",
  "exclude": ["src/**/*.test.ts", "src/testing"]
}

===== apps/api/src/app.test.ts =====
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from './app.ts';
import { captureLogger, startServer, UUID_PATTERN, type RunningServer } from './testing/helpers.ts';

const captured = captureLogger();
let server: RunningServer;

before(async () => {
  server = await startServer(createApp({ logger: captured.logger }));
});

after(async () => {
  await server.close();
});

test('GET /health returns 200 and reports the database as not configured', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'ok',
    service: 'kulvriksh-api',
    dependencies: { database: 'not_configured' },
  });
});

test('responses carry security headers and are not cacheable', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('every response gets a new server-generated request ID; client-supplied IDs are ignored', async () => {
  const a = await fetch(`${server.baseUrl}/health`, { headers: { 'X-Request-Id': 'attacker-chosen-id' } });
  const b = await fetch(`${server.baseUrl}/health`);
  const idA = a.headers.get('x-request-id') ?? '';
  const idB = b.headers.get('x-request-id') ?? '';
  assert.match(idA, UUID_PATTERN);
  assert.match(idB, UUID_PATTERN);
  assert.notEqual(idA, 'attacker-chosen-id');
  assert.notEqual(idA, idB);
});

test('unknown routes return the JSON error envelope with the request ID', async () => {
  const res = await fetch(`${server.baseUrl}/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: res.headers.get('x-request-id') },
  });
});

test('error responses carry the same security headers as successful ones', async () => {
  const ok = await fetch(`${server.baseUrl}/health`);
  const notFound = await fetch(`${server.baseUrl}/does-not-exist`);
  for (const name of [
    'cache-control',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'cross-origin-resource-policy',
    'content-security-policy',
  ]) {
    assert.equal(notFound.headers.get(name), ok.headers.get(name), name);
  }
  assert.match(notFound.headers.get('content-type') ?? '', /^application\/json/);
});

test('unsupported methods on known paths are not found', async () => {
  const res = await fetch(`${server.baseUrl}/health`, { method: 'POST' });
  assert.equal(res.status, 404);
});

test('the access log records path and status but never the query string', async () => {
  const res = await fetch(`${server.baseUrl}/missing?token=secret-value-123&mobile=9999999999`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  // The 'finish' event can fire just after the client receives the response.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const entry = captured.lines.find((l) => l.msg === 'request completed' && l.requestId === id);
  assert.ok(entry, 'expected an access log entry');
  assert.equal(entry.method, 'GET');
  assert.equal(entry.path, '/missing');
  assert.equal(entry.status, 404);
  assert.equal(entry.level, 'info');
  assert.equal(typeof entry.durationMs, 'number');
  assert.doesNotMatch(captured.raw.join('\n'), /secret-value-123|9999999999/);
});

test('health checks are logged at debug level only', async () => {
  const res = await fetch(`${server.baseUrl}/health`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'debug');
});

===== apps/api/src/config.test.ts =====
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfigError, loadConfig } from './config.ts';

test('uses safe defaults when nothing is configured', () => {
  assert.deepEqual(loadConfig({}), { nodeEnv: 'development', host: '127.0.0.1', port: 4000, logLevel: 'info' });
});

test('accepts valid explicit values (whitespace trimmed)', () => {
  const config = loadConfig({ NODE_ENV: 'production', API_HOST: ' 0.0.0.0 ', API_PORT: ' 5000 ', LOG_LEVEL: 'warn' });
  assert.deepEqual(config, { nodeEnv: 'production', host: '0.0.0.0', port: 5000, logLevel: 'warn' });
});

test('treats empty values as unset', () => {
  assert.deepEqual(loadConfig({ NODE_ENV: '', API_HOST: '  ', API_PORT: '', LOG_LEVEL: '' }), loadConfig({}));
});

for (const bad of ['abc', '12.5', '-1', '4000x']) {
  test(`rejects non-integer API_PORT "${bad}"`, () => {
    assert.throws(() => loadConfig({ API_PORT: bad }), (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.issues[0] ?? '', /API_PORT must be an integer/);
      return true;
    });
  });
}

for (const bad of ['0', '65536', '70000']) {
  test(`rejects out-of-range API_PORT ${bad}`, () => {
    assert.throws(() => loadConfig({ API_PORT: bad }), /API_PORT must be between 1 and 65535/);
  });
}

test('rejects an unknown NODE_ENV and lists the allowed values', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'staging' }),
    /NODE_ENV must be one of development, test, production, got "staging"/,
  );
});

test('rejects an unknown LOG_LEVEL', () => {
  assert.throws(() => loadConfig({ LOG_LEVEL: 'verbose' }), /LOG_LEVEL must be one of debug, info, warn, error, silent/);
});

test('reports every problem at once', () => {
  try {
    loadConfig({ NODE_ENV: 'prod', API_PORT: 'abc', LOG_LEVEL: 'loud' });
    assert.fail('expected ConfigError');
  } catch (err) {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.issues.length, 3);
    assert.equal(err.name, 'ConfigError');
  }
});

===== apps/api/src/errors.test.ts =====
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { createErrorHandler, notFoundHandler } from './errors.ts';
import { requestId } from './middleware.ts';
import { captureLogger, startServer, type RunningServer } from './testing/helpers.ts';

// A test-only app exercising the real error handlers with routes that fail in different ways.
const captured = captureLogger();
let server: RunningServer;

before(async () => {
  const app = express();
  app.use(requestId);
  app.get('/boom', () => {
    throw new Error('database password=hunter2 at /srv/internal/path');
  });
  app.get('/async-boom', async () => {
    throw new Error('async failure detail');
  });
  app.get('/bad-request', (_req, _res, next) => next(Object.assign(new Error('parse detail'), { status: 400 })));
  app.get('/too-large', (_req, _res, next) => next(Object.assign(new Error('size detail'), { statusCode: 413 })));
  app.get('/teapot', (_req, _res, next) => next(Object.assign(new Error('teapot'), { status: 418 })));
  app.get('/not-an-error', (_req, _res, next) => next('a plain string'));
  // Shaped like a body-parser JSON error, which carries the raw request body.
  app.get('/bad-json', (_req, _res, next) =>
    next(
      Object.assign(new SyntaxError('Unexpected token } in JSON at position 30'), {
        status: 400,
        type: 'entity.parse.failed',
        body: '{"otp":"482913","mobile":"9876543210"}',
      }),
    ),
  );
  app.use(notFoundHandler);
  app.use(createErrorHandler(captured.logger));
  server = await startServer(app);
});

after(async () => {
  await server.close();
});

test('unexpected errors return a generic 500 without internal details', async () => {
  const res = await fetch(`${server.baseUrl}/boom`);
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.deepEqual(JSON.parse(text), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: res.headers.get('x-request-id') },
  });
  assert.doesNotMatch(text, /hunter2|\/srv\/internal|stack|Error:/);
});

test('the 500 is logged with the request ID and a scrubbed error message (no secret in any log line)', async () => {
  const res = await fetch(`${server.baseUrl}/boom`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  const entry = captured.lines.find((l) => l.msg === 'unhandled error' && l.requestId === id);
  assert.ok(entry, 'expected an error log entry');
  assert.equal(entry.level, 'error');
  assert.equal((entry.err as Record<string, unknown>).message, 'database password=[REDACTED] at /srv/internal/path');
  assert.doesNotMatch(captured.raw.join('\n'), /hunter2/);
});

test('client errors carrying a raw request body are logged without the body', async () => {
  const res = await fetch(`${server.baseUrl}/bad-json`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  assert.equal(res.status, 400);
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'warn');
  const err = entry?.err as Record<string, unknown>;
  assert.equal(err.name, 'SyntaxError');
  assert.equal('body' in err, false);
  assert.doesNotMatch(captured.raw.join('\n'), /482913|9876543210/);
});

test('rejected promises in async handlers are caught (Express 5) and return 500', async () => {
  const res = await fetch(`${server.baseUrl}/async-boom`);
  assert.equal(res.status, 500);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INTERNAL_ERROR');
});

test('client errors keep their status with a generic message', async () => {
  const bad = await fetch(`${server.baseUrl}/bad-request`);
  assert.equal(bad.status, 400);
  assert.deepEqual(((await bad.json()) as { error: object }).error, {
    code: 'BAD_REQUEST',
    message: 'The request could not be processed',
    requestId: bad.headers.get('x-request-id'),
  });

  const large = await fetch(`${server.baseUrl}/too-large`);
  assert.equal(large.status, 413);
  assert.equal(((await large.json()) as { error: { code: string } }).error.code, 'PAYLOAD_TOO_LARGE');

  const teapot = await fetch(`${server.baseUrl}/teapot`);
  assert.equal(teapot.status, 418);
  assert.equal(((await teapot.json()) as { error: { code: string } }).error.code, 'CLIENT_ERROR');
});

test('client errors are logged at warn, not error', async () => {
  const res = await fetch(`${server.baseUrl}/bad-request`);
  const id = res.headers.get('x-request-id');
  await res.arrayBuffer();
  const entry = captured.lines.find((l) => l.requestId === id);
  assert.equal(entry?.level, 'warn');
  assert.equal(entry?.status, 400);
});

test('non-Error values passed to next() are treated as 500', async () => {
  const res = await fetch(`${server.baseUrl}/not-an-error`);
  assert.equal(res.status, 500);
});

===== apps/api/src/logger.test.ts =====
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogger, REDACTED } from './logger.ts';

function collect(level: Parameters<typeof createLogger>[0]['level'] = 'debug') {
  const lines: Record<string, unknown>[] = [];
  const levels: string[] = [];
  const logger = createLogger({
    level,
    now: () => new Date('2026-01-02T03:04:05.000Z'),
    sink: (line, lvl) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
      levels.push(lvl);
    },
  });
  return { logger, lines, levels };
}

test('writes one JSON object per line with time, level, msg and fields', () => {
  const { logger, lines } = collect();
  logger.info('hello', { requestId: 'r-1', count: 2 });
  assert.deepEqual(lines, [{ time: '2026-01-02T03:04:05.000Z', level: 'info', msg: 'hello', requestId: 'r-1', count: 2 }]);
});

test('filters below the configured level', () => {
  const { logger, lines } = collect('warn');
  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');
  assert.deepEqual(
    lines.map((l) => l.level),
    ['warn', 'error'],
  );
});

test('silent emits nothing', () => {
  const { logger, lines } = collect('silent');
  logger.error('e');
  assert.equal(lines.length, 0);
});

test('passes the level to the sink so warn/error can go to stderr', () => {
  const { logger, levels } = collect();
  logger.info('i');
  logger.error('e');
  assert.deepEqual(levels, ['info', 'error']);
});

test('redacts sensitive keys at any depth, case-insensitively', () => {
  const { logger, lines } = collect();
  logger.info('req', {
    password: 'hunter2',
    apiKey: 'k',
    Authorization: 'Bearer abc',
    webhookSecret: 's',
    sessionToken: 't',
    otpCode: '123456',
    headers: { cookie: 'sid=1', 'set-cookie': 'sid=2', 'x-razorpay-signature': 'sig', accept: 'json' },
    path: '/health',
  });
  const line = lines[0] ?? {};
  for (const key of ['password', 'apiKey', 'Authorization', 'webhookSecret', 'sessionToken', 'otpCode']) {
    assert.equal(line[key], REDACTED, key);
  }
  assert.deepEqual(line.headers, {
    cookie: REDACTED,
    'set-cookie': REDACTED,
    'x-razorpay-signature': REDACTED,
    accept: 'json',
  });
  assert.equal(line.path, '/health');
  assert.doesNotMatch(JSON.stringify(lines), /hunter2|Bearer abc|sid=1|123456/);
});

test('error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output', () => {
  const { logger, lines } = collect();
  const inner = new Error('inner: OTP 482913 for jane@example.com');
  const err = Object.assign(new Error('db login failed password=hunter2', { cause: inner }), {
    config: { headers: { cookie: 'sid=s3ss10n' } },
    response: { data: { mobile: '9876543210' } },
  });
  logger.error('failed', { err, requestId: 'r-9' });
  logger.error('rejection', { reason: 'rejected: token=abc123tok' });
  logger.error('provider', { error: { mobile: '9876543210' } });
  const out = JSON.stringify(lines);
  for (const leaked of ['hunter2', '482913', 'jane@example.com', 's3ss10n', '9876543210', 'abc123tok']) {
    assert.ok(!out.includes(leaked), `leaked ${leaked}`);
  }
  const first = lines[0]?.err as Record<string, unknown>;
  assert.equal(first.message, 'db login failed password=[REDACTED]');
  assert.equal((first.cause as Record<string, unknown>).message, 'inner: OTP [REDACTED] for [REDACTED_EMAIL]');
  assert.equal('config' in first, false);
  assert.equal(lines[0]?.requestId, 'r-9');
  assert.deepEqual(lines[1]?.reason, { name: 'NonError', message: 'rejected: token=[REDACTED]' });
  assert.deepEqual(lines[2]?.error, { name: 'NonError', message: '[non-Error object omitted]' });
});

test('Error instances under other keys or inside arrays also use the safe form', () => {
  const { logger, lines } = collect();
  const failure = Object.assign(new Error('upload failed token=abc123tok'), { response: { data: { mobile: '9876543210' } } });
  logger.warn('x', { failure, attempts: [new Error('attempt 1 password=hunter2')] });
  const out = JSON.stringify(lines);
  for (const leaked of ['abc123tok', '9876543210', 'hunter2']) {
    assert.ok(!out.includes(leaked), `leaked ${leaked}`);
  }
  const failed = lines[0]?.failure as Record<string, unknown>;
  assert.equal(failed.message, 'upload failed token=[REDACTED]');
  assert.equal('response' in failed, false);
  assert.equal(((lines[0]?.attempts as Record<string, unknown>[])[0] ?? {}).message, 'attempt 1 password=[REDACTED]');
});

test('ordinary string fields are scrubbed too', () => {
  const { logger, lines } = collect();
  logger.info('x', { note: 'callback https://user:pw@host/cb?code=99&state=abc', path: '/health' });
  assert.equal(lines[0]?.note, 'callback https://[REDACTED]@host/cb?code=[REDACTED]&state=[REDACTED]');
  assert.equal(lines[0]?.path, '/health');
});

test('binary values are summarised by size and their bytes never reach output', () => {
  const { logger, lines } = collect();
  const secret = '{"otp":"482913"}';
  logger.info('upload', {
    chunk: Buffer.from(secret),
    view: new Uint8Array(Buffer.from(secret)),
    floats: new Float64Array(2),
    data: new DataView(new ArrayBuffer(3)),
    raw: new ArrayBuffer(8),
    nested: { parts: [Buffer.from(secret)] },
  });
  const line = lines[0] ?? {};
  assert.equal(line.chunk, '[binary 16 bytes]');
  assert.equal(line.view, '[binary 16 bytes]');
  assert.equal(line.floats, '[binary 16 bytes]');
  assert.equal(line.data, '[binary 3 bytes]');
  assert.equal(line.raw, '[binary 8 bytes]');
  assert.deepEqual(line.nested, { parts: ['[binary 16 bytes]'] });
  // No byte-indexed map ("0":123,...) or decoded content that could rebuild the original.
  const out = JSON.stringify(lines);
  assert.doesNotMatch(out, /482913|"0":|123,34/);
});

test('the msg text is scrubbed, keeping its useful context', () => {
  const { logger, lines } = collect();
  logger.error('login failed for 9876543210 password=hunter2');
  logger.info('request completed');
  assert.equal(lines[0]?.msg, 'login failed for [REDACTED_NUMBER] password=[REDACTED]');
  assert.equal(lines[1]?.msg, 'request completed');
});

test('serialises errors with name, message and stack', () => {
  const { logger, lines } = collect();
  logger.error('failed', { err: new TypeError('bad input') });
  const err = lines[0]?.err as Record<string, unknown>;
  assert.equal(err.name, 'TypeError');
  assert.equal(err.message, 'bad input');
  assert.equal(typeof err.stack, 'string');
});

test('handles circular references, bigint, dates, undefined and deep nesting', () => {
  const { logger, lines } = collect();
  const circular: Record<string, unknown> = { name: 'loop' };
  circular.self = circular;
  logger.info('x', {
    circular,
    big: 10n,
    when: new Date('2026-01-01T00:00:00.000Z'),
    missing: undefined,
    deep: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } },
  });
  const line = lines[0] ?? {};
  assert.deepEqual(line.circular, { name: 'loop', self: '[Circular]' });
  assert.equal(line.big, '10');
  assert.equal(line.when, '2026-01-01T00:00:00.000Z');
  assert.equal('missing' in line, false);
  assert.match(JSON.stringify(line.deep), /\[Truncated\]/);
});

test('fields cannot overwrite time, level or msg', () => {
  const { logger, lines } = collect();
  logger.info('real message', { time: 'fake', level: 'error', msg: 'forged' });
  assert.deepEqual(lines[0], { time: '2026-01-02T03:04:05.000Z', level: 'info', msg: 'real message' });
});

test('child loggers add bindings, and call fields take precedence', () => {
  const { logger, lines } = collect();
  const child = logger.child({ service: 'api', component: 'a' });
  child.info('x', { component: 'b' });
  assert.equal(lines[0]?.service, 'api');
  assert.equal(lines[0]?.component, 'b');
});

===== apps/api/src/redaction.test.ts =====
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REDACTED, scrubText, serializeError } from './redaction.ts';

// Each case: input text, secrets that must disappear, context that must survive.
const SCRUB_CASES: ReadonlyArray<{ name: string; input: string; secrets: string[]; keep: string[] }> = [
  {
    name: 'database URL credentials and query values',
    input: 'connect failed: postgres://app:db-pass-77@10.0.0.5:5432/kul?sslmode=require&password=x9y8',
    secrets: ['db-pass-77', 'x9y8', 'app:'],
    keep: ['connect failed', '10.0.0.5:5432/kul'],
  },
  {
    name: 'key=value, key: value and JSON pairs with sensitive keys',
    input: 'password=hunter2 api_key: sk_live_51Hx "client_secret":"s3cr3t" sessionToken=abc DB_PASSWORD=pw1',
    secrets: ['hunter2', 'sk_live_51Hx', 's3cr3t', 'sessionToken=abc', 'pw1'],
    keep: ['password=', 'api_key:', '"client_secret":"', 'DB_PASSWORD='],
  },
  {
    name: 'Authorization header values and JWTs',
    input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl; token eyJa.eyJb.cc',
    secrets: ['eyJhbGciOiJIUzI1NiJ9', 'c2lnbmF0dXJl', 'eyJa.eyJb.cc'],
    keep: ['Authorization:'],
  },
  {
    name: 'OTP codes, phone numbers and email addresses',
    input: 'OTP 482913 rejected for +919876543210 / 9876543210 (jane.doe@example.co.in); pin: 1234',
    secrets: ['482913', '9876543210', 'jane.doe@example.co.in', '1234'],
    keep: ['OTP', 'rejected for', 'pin:'],
  },
  {
    name: 'Razorpay-style signatures, webhook secrets and long hex digests',
    input:
      'x-razorpay-signature=3f1c9a0b7e2d4c6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d webhook_secret: whsec_ABC123def456 digest 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    secrets: ['3f1c9a0b7e2d4c6f8a1b3c5d', 'whsec_ABC123def456', '9f86d081884c7d659a2feaa0c55ad015'],
    keep: ['x-razorpay-signature=', 'webhook_secret:', 'digest'],
  },
];

for (const c of SCRUB_CASES) {
  test(`scrubText removes ${c.name}`, () => {
    const out = scrubText(c.input);
    for (const secret of c.secrets) {
      assert.ok(!out.includes(secret), `secret "${secret}" survived: ${out}`);
    }
    for (const kept of c.keep) {
      assert.ok(out.includes(kept), `context "${kept}" was lost: ${out}`);
    }
    assert.ok(out.includes('[REDACTED'), out);
  });
}

test('scrubText leaves ordinary diagnostic text unchanged', () => {
  const ordinary = [
    'listen EADDRINUSE: address already in use 127.0.0.1:4103',
    'request completed GET /health 200 in 12.5ms',
    '5493c663-9fbf-454b-94b1-0bac204970ef',
    'at createErrorHandler (file:///C:/Users/dev/KulVriksh/apps/api/src/errors.ts:33:11)',
    '2026-10-24T03:15:10.000Z',
    'http://127.0.0.1:4104/health',
    'Invalid configuration: API_PORT must be an integer, got "abc"',
  ];
  for (const text of ordinary) {
    assert.equal(scrubText(text), text);
  }
});

// Regression (TASK-04C, D1): inputs that took 0.5–4.6 s each before the key-value rule
// was bounded (TASK-04B E2). scrubText is called directly, so no server shares the timing.
const ADVERSARIAL: ReadonlyArray<readonly [string, string]> = [
  ['"otp" x666', 'otp'.repeat(666)],
  ['request path "/" + "otp" x666', '/' + 'otp'.repeat(666)],
  ['"tokenx" x333', 'tokenx'.repeat(333)],
  ['"token" x400', 'token'.repeat(400)],
  ['"password" x250', 'password'.repeat(250)],
  ['"secret_" x285', 'secret_'.repeat(285)],
  ['"token" + 50 spaces x36', `token${' '.repeat(50)}`.repeat(36)],
];
const ADVERSARIAL_LIMIT_MS = 50;

test('scrubText stays fast on adversarial inputs (ReDoS regression)', () => {
  for (const [name, input] of ADVERSARIAL) {
    const started = process.hrtime.bigint();
    scrubText(input);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < ADVERSARIAL_LIMIT_MS, `${name} took ${ms.toFixed(1)} ms`);
  }
});

test('scrubText still redacts long sensitive key names after the quantifiers were bounded', () => {
  // Key names here have no digits: a 32+ character name that mixes letters and digits is
  // itself replaced by the long-token rule (over-redaction, unchanged by this fix).
  const input = [
    'x_razorpay_webhook_signature_header=abcd1234',
    'MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t',
    `${'A'.repeat(40)}_PASSWORD=pw40long`,
  ].join(' ');
  const out = scrubText(input);
  for (const secret of ['abcd1234', 's3cr3t', 'pw40long']) {
    assert.ok(!out.includes(secret), `secret "${secret}" survived: ${out}`);
  }
  assert.ok(out.includes('x_razorpay_webhook_signature_header='), out);
  assert.ok(out.includes('MY_APP_DATABASE_PASSWORD_PRIMARY:'), out);
});

test('scrubText caps very long text', () => {
  const out = scrubText('a'.repeat(5000));
  assert.ok(out.length < 2100);
  assert.match(out, /…\[truncated\]$/);
});

test('serializeError keeps allowlisted fields and never copies arbitrary properties', () => {
  const err = Object.assign(new Error('provider call failed: token=abc123tok'), {
    code: 'ECONNRESET',
    status: 502,
    syscall: 'read',
    config: { headers: { Authorization: 'Bearer live-key-1' }, data: '{"otp":"482913"}' },
    request: { path: '/v1/send?mobile=9876543210' },
    response: { data: { mobile: '9876543210', email: 'jane@example.com' } },
    body: '{"password":"hunter2"}',
  });
  const safe = serializeError(err);
  assert.deepEqual(Object.keys(safe).sort(), ['code', 'message', 'name', 'stack', 'status', 'syscall']);
  assert.equal(safe.code, 'ECONNRESET');
  assert.equal(safe.status, 502);
  assert.equal(safe.syscall, 'read');
  assert.equal(safe.message, `provider call failed: token=${REDACTED}`);
  const json = JSON.stringify(safe);
  for (const leaked of ['abc123tok', 'live-key-1', '482913', '9876543210', 'jane@example.com', 'hunter2']) {
    assert.ok(!json.includes(leaked), `leaked ${leaked}`);
  }
});

test('serializeError drops the stack header line, which repeats the unscrubbed message', () => {
  const safe = serializeError(new Error('secret=hunter2'));
  assert.ok(safe.stack, 'expected stack frames');
  assert.doesNotMatch(safe.stack ?? '', /hunter2|^Error:/m);
  assert.ok((safe.stack ?? '').split('\n').every((line) => line.startsWith('at ')));
});

test('serializeError limits stack frames', () => {
  const err = new Error('deep');
  err.stack = ['Error: deep', ...Array.from({ length: 40 }, (_, i) => `    at fn${i} (file.ts:${i}:1)`)].join('\n');
  assert.equal(serializeError(err).stack?.split('\n').length, 15);
});

test('serializeError follows cause chains (scrubbed) to a bounded depth', () => {
  let err: unknown = new Error('root: password=hunter2');
  for (let i = 0; i < 6; i++) {
    err = new Error(`level ${i}`, { cause: err });
  }
  const safe = serializeError(err);
  let depth = 0;
  let node: typeof safe | undefined = safe;
  while (node?.cause) {
    node = node.cause;
    depth++;
  }
  assert.equal(depth, 3);
  assert.doesNotMatch(JSON.stringify(safe), /hunter2/);
});

test('serializeError includes scrubbed cause messages', () => {
  const safe = serializeError(new Error('outer', { cause: new Error('inner token=abc123tok') }));
  assert.equal(safe.cause?.message, `inner token=${REDACTED}`);
});

test('serializeError summarises AggregateError members (at most 5)', () => {
  const agg = new AggregateError(
    Array.from({ length: 8 }, (_, i) => new Error(`member ${i} otp: 48291${i}`)),
    'several failed',
  );
  const safe = serializeError(agg);
  assert.equal(safe.errors?.length, 5);
  assert.doesNotMatch(JSON.stringify(safe), /48291\d/);
});

test('serializeError handles non-Error values without dumping objects', () => {
  assert.deepEqual(serializeError('rejected with token=abc123tok'), {
    name: 'NonError',
    message: `rejected with token=${REDACTED}`,
  });
  assert.deepEqual(serializeError({ response: { data: { mobile: '9876543210' } } }), {
    name: 'NonError',
    message: '[non-Error object omitted]',
  });
  assert.deepEqual(serializeError(['a']), { name: 'NonError', message: '[non-Error array omitted]' });
  assert.deepEqual(serializeError(42), { name: 'NonError', message: '42' });
  assert.deepEqual(serializeError(undefined), { name: 'NonError', message: 'undefined' });
});

test('serializeError rejects unsafe code values', () => {
  const err = Object.assign(new Error('x'), { code: 'not a code; password=hunter2' });
  assert.equal(serializeError(err).code, undefined);
});

===== apps/api/src/server.test.ts =====
// Process-level tests: run the real entry point (src/server.ts) with Node type stripping.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';

const API_DIR = join(import.meta.dirname, '..');
const TIMEOUT_MS = 15_000;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function startApi(env: Record<string, string>): { child: ChildProcess; output: () => RunResult; exited: Promise<RunResult> } {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'info', ...env };
  delete childEnv.API_HOST;
  const child = spawn(process.execPath, ['src/server.ts'], { cwd: API_DIR, env: childEnv, stdio: 'pipe' });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  const output = () => ({ code: child.exitCode, stdout, stderr });
  const exited = new Promise<RunResult>((resolve) => child.on('exit', (code) => resolve({ code, stdout, stderr })));
  return { child, output, exited };
}

function jsonLines(text: string): Record<string, unknown>[] {
  return text
    .split('\n')
    .filter((line) => line.trim().startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('invalid configuration stops startup with exit code 1 and a structured error listing every issue', { timeout: TIMEOUT_MS }, async () => {
  const { exited } = startApi({ API_PORT: 'abc', LOG_LEVEL: 'loud' });
  const result = await exited;
  assert.equal(result.code, 1);
  const [entry] = jsonLines(result.stderr);
  assert.equal(entry?.level, 'error');
  assert.equal(entry?.msg, 'configuration error');
  assert.equal((entry?.issues as string[]).length, 2);
  assert.doesNotMatch(result.stdout, /listening/);
});

test('starts, logs a structured "listening" line and serves /health', { timeout: TIMEOUT_MS }, async () => {
  const port = await freePort();
  const { child, output, exited } = startApi({ API_PORT: String(port) });
  try {
    await waitFor(() => /"msg":"listening"/.test(output().stdout), 'the listening log line');
    const listening = jsonLines(output().stdout).find((l) => l.msg === 'listening');
    assert.equal(listening?.service, 'kulvriksh-api');
    assert.equal(listening?.url, `http://127.0.0.1:${port}`);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
  } finally {
    child.kill();
    await exited;
  }
});

test('regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening"', { timeout: TIMEOUT_MS }, async () => {
  const blocker = createNetServer();
  await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  const { port } = blocker.address() as AddressInfo;
  try {
    const result = await startApi({ API_PORT: String(port) }).exited;
    assert.equal(result.code, 1);
    assert.doesNotMatch(result.stdout, /listening/);
    const entry = jsonLines(result.stderr).find((l) => l.msg === 'server error');
    const err = entry?.err as Record<string, unknown>;
    assert.match(String(err?.message), /EADDRINUSE/);
    // Safe error form keeps useful system-error fields.
    assert.equal(err?.code, 'EADDRINUSE');
    assert.equal(err?.syscall, 'listen');
  } finally {
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  }
});

````


### E4 npm run check (current repository)

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

✔ GET /health returns 200 and reports the database as not configured (72.845ms)
✔ responses carry security headers and are not cacheable (24.8519ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (10.0433ms)
✔ unknown routes return the JSON error envelope with the request ID (6.2553ms)
✔ error responses carry the same security headers as successful ones (16.4794ms)
✔ unsupported methods on known paths are not found (10.8778ms)
✔ the access log records path and status but never the query string (66.2078ms)
✔ health checks are logged at debug level only (59.4137ms)
✔ uses safe defaults when nothing is configured (11.8903ms)
✔ accepts valid explicit values (whitespace trimmed) (0.4489ms)
✔ treats empty values as unset (0.2173ms)
✔ rejects non-integer API_PORT "abc" (1.9607ms)
✔ rejects non-integer API_PORT "12.5" (0.4217ms)
✔ rejects non-integer API_PORT "-1" (0.486ms)
✔ rejects non-integer API_PORT "4000x" (0.2903ms)
✔ rejects out-of-range API_PORT 0 (2.1894ms)
✔ rejects out-of-range API_PORT 65536 (0.5568ms)
✔ rejects out-of-range API_PORT 70000 (0.4128ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.4802ms)
✔ rejects an unknown LOG_LEVEL (0.2065ms)
✔ reports every problem at once (0.3302ms)
✔ unexpected errors return a generic 500 without internal details (62.9342ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (22.9737ms)
✔ client errors carrying a raw request body are logged without the body (14.7874ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (11.762ms)
✔ client errors keep their status with a generic message (41.922ms)
✔ client errors are logged at warn, not error (6.5668ms)
✔ non-Error values passed to next() are treated as 500 (5.2622ms)
✔ writes one JSON object per line with time, level, msg and fields (5.3298ms)
✔ filters below the configured level (0.4133ms)
✔ silent emits nothing (0.2302ms)
✔ passes the level to the sink so warn/error can go to stderr (1.48ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.8558ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (3.1499ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.933ms)
✔ ordinary string fields are scrubbed too (0.2902ms)
✔ binary values are summarised by size and their bytes never reach output (0.5922ms)
✔ the msg text is scrubbed, keeping its useful context (1.7361ms)
✔ serialises errors with name, message and stack (0.6889ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.5142ms)
✔ fields cannot overwrite time, level or msg (0.403ms)
✔ child loggers add bindings, and call fields take precedence (13.6405ms)
✔ scrubText removes database URL credentials and query values (9.6086ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.5153ms)
✔ scrubText removes Authorization header values and JWTs (1.885ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (3.5409ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.3044ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.5579ms)
✔ scrubText stays fast on adversarial inputs (ReDoS regression) (73.7102ms)
✔ scrubText still redacts long sensitive key names after the quantifiers were bounded (0.8074ms)
✔ scrubText caps very long text (6.7518ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (5.8698ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (1.1251ms)
✔ serializeError limits stack frames (0.7946ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (1.9689ms)
✔ serializeError includes scrubbed cause messages (0.9846ms)
✔ serializeError summarises AggregateError members (at most 5) (1.7901ms)
✔ serializeError handles non-Error values without dumping objects (0.5134ms)
✔ serializeError rejects unsafe code values (0.5225ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (534.8948ms)
✔ starts, logs a structured "listening" line and serves /health (452.9529ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (339.7291ms)
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1620.3211

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 42ms

  Creating an optimized production build ...
✓ Compiled successfully in 540ms
  Running TypeScript ...
  Finished TypeScript in 1514ms ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 881ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]
````


### E5 Checksums (specs, reports, lockfile, SVGs, TASK-04C files, all other sources), .env scan, ports, processes

````text
$ md5sum -c   (protected specs, every report, lockfile, SVGs, and the 4 TASK-04C files at their approved checksums)
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
Kulvriksh-V3-Desktop-1440.svg: OK
Kulvriksh-V3-Mobile-390.svg: OK
apps/api/src/redaction.ts: OK
apps/api/src/logger.ts: OK
apps/api/src/redaction.test.ts: OK
apps/api/src/logger.test.ts: OK
[exit=0]

$ md5sum -c   (every other source/config file vs the TASK-04C start checksums)
apps/api/src/app.test.ts: OK
apps/api/src/app.ts: OK
apps/api/src/config.test.ts: OK
apps/api/src/config.ts: OK
apps/api/src/errors.test.ts: OK
apps/api/src/errors.ts: OK
apps/api/src/middleware.ts: OK
apps/api/src/server.test.ts: OK
apps/api/src/server.ts: OK
apps/api/src/testing/helpers.ts: OK
apps/api/package.json: OK
apps/api/tsconfig.build.json: OK
apps/api/tsconfig.json: OK
apps/web/next.config.ts: OK
apps/web/package.json: OK
apps/web/tsconfig.json: OK
package.json: OK
packages/shared/src/index.ts: OK
README.md: OK
apps/api/.env.example: OK
[exit=0]

$ find . -name ".env*" -not -path "./node_modules/*" -not -name ".env.example"
(end .env files)

$ netstat -ano | grep LISTENING | grep -E ":(3000|3100|4000|4199) "
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       7668
  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       19480
  TCP    [::]:4000              [::]:0                 LISTENING       19480
(end ports)

$ node.exe processes from this repository / scratchpad
(end processes)
````


### E6 Commit groups: counts, duplicates, missing files, unplanned files, git add --dry-run, index

````text
$ group file list (<scratchpad>/t4d-groups.txt): counts per commit
commit 1: 3 files
commit 2: 20 files
commit 3: 5 files

$ duplicates across groups (path listed more than once)
(end duplicates)

$ planned files that do not exist yet
commit 3: MISSING docs/reports/TASK-04D-COMMIT-READINESS.md
(end missing)

$ changed/untracked files NOT in any group (git status minus the plan)
Kulvriksh-V3-Desktop-1440.svg
Kulvriksh-V3-Mobile-390.svg
(end unplanned)

$ git add --dry-run -- <commit 1 files that exist>   (dry run: index not written)
add 'apps/web/next.config.ts'
add 'docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md'
add 'docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md'
[exit=0]

$ git add --dry-run -- <commit 2 files that exist>   (dry run: index not written)
add 'README.md'
add 'apps/api/.env.example'
add 'apps/api/package.json'
add 'apps/api/src/app.ts'
add 'apps/api/src/config.ts'
add 'apps/api/src/server.ts'
add 'package.json'
add 'packages/shared/src/index.ts'
add 'apps/api/src/app.test.ts'
add 'apps/api/src/config.test.ts'
add 'apps/api/src/errors.test.ts'
add 'apps/api/src/errors.ts'
add 'apps/api/src/logger.test.ts'
add 'apps/api/src/logger.ts'
add 'apps/api/src/middleware.ts'
add 'apps/api/src/redaction.test.ts'
add 'apps/api/src/redaction.ts'
add 'apps/api/src/server.test.ts'
add 'apps/api/src/testing/helpers.ts'
add 'apps/api/tsconfig.build.json'
[exit=0]

$ git add --dry-run -- <commit 3 files that exist>   (dry run: index not written)
add 'docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md'
add 'docs/reports/TASK-04A-LOGGING-REVIEW.md'
add 'docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md'
add 'docs/reports/TASK-04C-LOGGING-FIX.md'
[exit=0]

$ git diff --cached --name-only; echo "(staged end)"; md5sum .git/index
(staged end)
5c83ef19e4ba7071317703a1d135ca63 *.git/index
(index md5 before this audit: 5c83ef19e4ba7071317703a1d135ca63)
````


### E6a The group list used by E6 (<scratchpad>/t4d-groups.txt)

````text
1 apps/web/next.config.ts
1 docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
1 docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
2 README.md
2 apps/api/.env.example
2 apps/api/package.json
2 apps/api/src/app.ts
2 apps/api/src/config.ts
2 apps/api/src/server.ts
2 package.json
2 packages/shared/src/index.ts
2 apps/api/src/errors.ts
2 apps/api/src/middleware.ts
2 apps/api/src/logger.ts
2 apps/api/src/redaction.ts
2 apps/api/src/testing/helpers.ts
2 apps/api/tsconfig.build.json
2 apps/api/src/app.test.ts
2 apps/api/src/config.test.ts
2 apps/api/src/errors.test.ts
2 apps/api/src/logger.test.ts
2 apps/api/src/redaction.test.ts
2 apps/api/src/server.test.ts
3 docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
3 docs/reports/TASK-04A-LOGGING-REVIEW.md
3 docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
3 docs/reports/TASK-04C-LOGGING-FIX.md
3 docs/reports/TASK-04D-COMMIT-READINESS.md
````


### E7 Line-ending count, local identifying strings and secret scan per candidate file

````text
$ CR (\r) count per candidate file   (.gitattributes normalises to LF on staging; non-zero means a CRLF warning at git add)
    0  README.md
    0  apps/api/.env.example
    0  apps/api/package.json
    0  apps/api/src/app.ts
    0  apps/api/src/config.ts
    0  apps/api/src/server.ts
    0  apps/web/next.config.ts
    0  package.json
    0  packages/shared/src/index.ts
    0  apps/api/src/errors.ts
    0  apps/api/src/middleware.ts
    0  apps/api/src/logger.ts
    0  apps/api/src/redaction.ts
    0  apps/api/src/testing/helpers.ts
    0  apps/api/tsconfig.build.json
    0  apps/api/src/app.test.ts
    0  apps/api/src/config.test.ts
    0  apps/api/src/errors.test.ts
    0  apps/api/src/logger.test.ts
    0  apps/api/src/redaction.test.ts
    0  apps/api/src/server.test.ts
    0  docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
   67  docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
   37  docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
    0  docs/reports/TASK-04A-LOGGING-REVIEW.md
   17  docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
    0  docs/reports/TASK-04C-LOGGING-FIX.md

$ grep -c for local identifying strings in candidate files (username / scratchpad path / account email / absolute repo path)
README.md                                                      HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/.env.example                                          HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/package.json                                          HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/app.ts                                            HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/config.ts                                         HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/server.ts                                         HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/web/next.config.ts                                        HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
package.json                                                   HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
packages/shared/src/index.ts                                   HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/errors.ts                                         HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/middleware.ts                                     HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/logger.ts                                         HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/redaction.ts                                      HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/testing/helpers.ts                                HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/tsconfig.build.json                                   HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/app.test.ts                                       HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/config.test.ts                                    HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/errors.test.ts                                    HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/logger.test.ts                                    HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/redaction.test.ts                                 HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
apps/api/src/server.test.ts                                    HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md       HEEL-PATEL/HEELPA:20   Desktop/KulVriksh-abs:17   account-email:0
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md                    HEEL-PATEL/HEELPA:5    Desktop/KulVriksh-abs:2    account-email:0
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md              HEEL-PATEL/HEELPA:0    Desktop/KulVriksh-abs:0    account-email:0
docs/reports/TASK-04A-LOGGING-REVIEW.md                        HEEL-PATEL/HEELPA:5    Desktop/KulVriksh-abs:0    account-email:0
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md     HEEL-PATEL/HEELPA:2    Desktop/KulVriksh-abs:0    account-email:0
docs/reports/TASK-04C-LOGGING-FIX.md                           HEEL-PATEL/HEELPA:1    Desktop/KulVriksh-abs:0    account-email:0

$ git grep secret scan over all candidate files (private keys, AWS, Razorpay live/test keys, generic "sk_live_" strings)
(end matches)
````


### E8 CRLF classification, gitattributes and filtered vs raw blob IDs; sample username lines (email redacted)

````text
$ CR classification per report: CRLF pairs vs lone CR (node, read-only)
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md CRLF: 67 lone CR: 0 on lines: 468,475,476,489,497,498,513,517,518,519,520,521,...
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md CRLF: 37 lone CR: 0 on lines: 339,601,602,603,604,605,606,607,608,609,610,611,...
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md CRLF: 17 lone CR: 0 on lines: 633,635,636,638,648,657,658,659,660,661,662,663,...

$ git check-attr text eol -- (the three reports)
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: text: auto
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: eol: lf
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: text: auto
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: eol: lf
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md: text: auto
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md: eol: lf

$ what git would store: git hash-object (filters applied, nothing written) vs raw blob hash (--no-filters)
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
  filtered: 7cc0c411fd60cfcb2b0357b442f188ba3419e985
  raw:      e58842fcd1c6e32755b8821a02613ac2dbe1832b
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
  filtered: 5bb9991efa28461415440f16b46f6185a6fea1db
  raw:      c39b2ffd9badd4f763a57c4ae24a7966f3a7e5ff
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
  filtered: 38281e9a0a8cc3f8538d234d592a0e1542ccc5ae
  raw:      25b7fd2db971379dc06731328185a06fdb2e4133

$ sample lines containing the username (first 3 per report, cut to 140 chars)
-- docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
374:/c/Users/HEEL PATEL/Desktop/KulVriksh
445:file:C:/Users/HEEL PATEL/.gitconfig	user.name=Heel Patel
446:file:C:/Users/HEEL PATEL/.gitconfig	user.email=[personal email redacted]
-- docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
215:-rw-r--r-- 1 HEEL PATEL 197121 679 2026-10-24 03:14:19.822630400 +0530 apps/web/AGENTS.md
547:21960 <- parent 1980 : "C:\Program Files\OUR SOFTWARES\node.exe" "C:\Users\HEEL PATEL\Desktop\KulVriksh\node_modules\next\dist\server\li
549:25636 <- parent 27244 : "C:\Program Files\Git\bin\..\usr\bin\bash.exe" -c "source '/c/Users/HEEL PATEL/.claude/shell-snapshots/... (this
-- docs/reports/TASK-04A-LOGGING-REVIEW.md
340:{"time":"2026-10-23T23:02:37.383Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://app:db-pass-77
342:{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"e3","err":{"name":"Error","message":"outer wrapper","stack":"Error: outer wrap
362:{"time":"2026-10-23T23:03:26.786Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://[REDACTED]@10.
-- docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
1030:-rw-r--r-- 1 HEEL PATEL 197121 6754869 2026-10-24 04:51:47.325508000 +0530 Kulvriksh-V3-Desktop-1440.svg
1031:-rw-r--r-- 1 HEEL PATEL 197121 3264415 2026-10-24 04:51:58.342363900 +0530 Kulvriksh-V3-Mobile-390.svg
-- docs/reports/TASK-04C-LOGGING-FIX.md
524:Error: Cannot find module 'C:\Users\HEELPA%7E1\AppData\Local\Temp\claude\c--Users-HEEL-PATEL-Desktop-KulVriksh\188cd3b6-033b-41f3-9501-b
````


### E9 Personal email: comparison with commit author metadata (addresses never printed)

````text
$ does the TASK-03 report email equal the author email already in commit metadata? (addresses not printed)
e83562484d0495ec836b9eb896c8f7dfefd6927c: author email SAME as report line 446
15dd95b3fa61382ec60e8bc3120589068743866a: author email SAME as report line 446

$ count of email-address patterns per candidate report (excluding obvious synthetic example domains)
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md       1
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md                    1
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md              0
docs/reports/TASK-04A-LOGGING-REVIEW.md                        0
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md     0
docs/reports/TASK-04C-LOGGING-FIX.md                           0

$ grep -c "heelpatel" per candidate report (local-part only shown as a count)
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md       3
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md                    2
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md              0
docs/reports/TASK-04A-LOGGING-REVIEW.md                        0
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md     0
docs/reports/TASK-04C-LOGGING-FIX.md                           0
````


### E10 Final git status, staged list and index checksum (after this report was created)

````text
$ git status --short --branch --untracked-files=all; git diff --cached --name-only; md5sum .git/index
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
(staged end)
5c83ef19e4ba7071317703a1d135ca63 *.git/index
````

