# TASK-03 — Repository & Governance Foundation (M0)

| Item | Value |
|---|---|
| Task ID | TASK-03 (milestone M0) |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Final status | **Completed with follow-up items**: §11 lists deviations, defects found and fixed during validation, and open decisions. **Awaiting review.** |
| Commits | `15dd95b3fa61382ec60e8bc3120589068743866a` (initial M0 foundation), `e83562484d0495ec836b9eb896c8f7dfefd6927c` (web port fix, found during validation) |
| Remote | **Not configured.** The private GitHub remote is pending (§9). |

The report is evidence of what was done. It does not prove that the architecture is correct.

> **Errata (added in TASK-03A, 2026-10-24).** Three narrative statements were corrected; the evidence appendix is unchanged. Details and verification are in `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`.
> 1. **§3.2, release age:** the original text said every package was "at least 9 days" old. The minimum was in fact **8.02 days**, for `next` and `eslint-config-next` 16.4.2.
> 2. **§3.2, `next` 16.4.3:** this was published about **7.7 hours** before installation, not "one day".
> 3. **§6, cross-reference:** "§12" should have pointed to the evidence appendix.
>
> **Other notes:**
> - In E7, the line labelled `powershell: stop the API process tree` was actually `taskkill`, run from Git Bash. The label is left as recorded.
> - The status of `apps/web/AGENTS.md` (§2.2, §7 check 13, §11 F4) is as at the time of TASK-03. It was resolved in TASK-03A with `agentRules: false`.
> - The root `start:api` script was re-verified on the post-F1 build in TASK-03A.
> - **Evidence fidelity:** when the raw logs were embedded into this appendix, Git Bash's `awk` dropped their carriage-return bytes. The raw logs contained 45 `\r` bytes from Windows tools. The visible text is identical (verified in TASK-03A); only those invisible bytes differ from the raw logs.

> **Errata (privacy redaction, added in TASK-04F, 2026-10-24).** The owner's personal Git email address was replaced with `<owner-git-email>` in three places: §9 "Initialisation" (narrative), and the `git config` and `git log` output in the evidence appendix (original lines 256, 446 and 1750, before this note was added). Nothing else was changed. The address remains in the author metadata of commits `15dd95b` and `e835624`, which were not rewritten.

---

## 1. Objective and final status

**Objective:** establish the version-controlled M0 foundation:
- an npm workspaces monorepo (`apps/web`, `apps/api`, `packages/shared`)
- a Node.js 24 pin
- minimal Next.js and Express shells
- Git governance
- documentation

**Final status:** done, and validated locally on Windows. Summary:

| Item | Result |
|---|---|
| Git repository | Initialised on `main`, with 2 local commits |
| Clean install | `npm ci` from the committed lockfile is reproducible. A following `npm install` changes nothing (lockfile MD5 `90c261c42994f3f3d83a1157ec18ce8e`). |
| Quality checks | Type-check, lint and production build pass for all workspaces |
| API | Starts; `GET /health` returns 200 and reports the database as `not_configured`; unknown routes return a JSON 404 |
| Web | Production server returns the placeholder page with real HTML, and a true 404 for unknown routes |
| Protected documents | Byte-identical before and after |
| Secret scan | No credentials found |
| Dependency audit | `npm audit` reports 0 vulnerabilities |

**Validation found two defects in my own M0 code. Both were fixed and re-verified** (§11, F1 and F2). **It also found two tooling issues** that need a decision (§11, F3 and F4).

---

## 2. Repository inventories

### 2.1 Initial (preflight, before any change)

The repository matched the TASK-02 inventory exactly (evidence E1, P1–P3):

```
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
```

There were no hidden files, no `.git`, no manifests and no code.

### 2.2 Final (tracked by Git, plus untracked)

**Tracked (30 files; evidence E10, E12):**
- **Root:** `.gitattributes`, `.gitignore`, `.nvmrc`, `README.md`, `eslint.config.mjs`, `package.json`, `package-lock.json`, `tsconfig.base.json`
- **`apps/api`:** `.env.example`, `package.json`, `tsconfig.json`, `src/app.ts`, `src/config.ts`, `src/server.ts`
- **`apps/web`:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- **`packages/shared`:** `package.json`, `tsconfig.json`, `src/index.ts`
- **`docs`:** the four specifications and the TASK-01 and TASK-02 reports, **unchanged**

**Untracked (not committed):**
- `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`: this report, left for review before committing
- `apps/web/AGENTS.md`: **generated by `next dev`**, not written by me (§11, F4)

**Git-ignored, generated locally:** `node_modules/`, `apps/web/.next/`, `apps/api/dist/`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`.

The final listing is in evidence E14.

---

## 3. Runtime and selected dependency versions

### 3.1 Runtime

| Tool | Version | Policy |
|---|---|---|
| Node.js | 24.13.0 (win32 x64) | `.nvmrc` = `24`; `engines.node` = `>=24.0.0 <25.0.0` |
| npm | 11.6.2 | `engines.npm` = `>=11.0.0`; `packageManager` = `npm@11.6.2`. npm only (pnpm and Yarn are absent and not installed). |
| Git | 2.52.0.windows.1 | — |
| Corepack | 0.34.5 | Not used |

### 3.2 Packages (exact versions in the manifests; resolved and deduplicated per the lockfile, E5)

| Package | Version | Published | Why it was chosen and why it is compatible |
|---|---|---|---|
| `next` | 16.4.2 | 2026-10-15 | Current 16.x line. `engines.node >=20.9.0` (Node 24 OK); peer `react ^19`. The newer 16.4.3 was published 2026-10-23T13:40Z, about 7.7 hours before installation began, so it was deliberately skipped (see the release-age note below). |
| `react`, `react-dom` | 19.3.1 | 2026-10-14 | Current stable. Satisfies Next's peer `^19.0.0`. |
| `@types/react`, `@types/react-dom` | 19.3.0 | 2026-09-09 | Matches React 19.3 |
| `express` | 5.3.0 | 2026-10-09 | Current stable. `engines.node >= 18`. |
| `@types/express` | 5.0.6 | 2025-12-01 | Express 5 types |
| `@types/node` | 24.19.2 | 2026-10-09 | **Node 24 line**, rather than the latest 26.x, so the types match the runtime |
| `typescript` | 6.0.3 | 2026-04-16 | **Not TypeScript 7.0.2** (the latest). `typescript-eslint` 8.71/8.72 requires `typescript >=4.8.4 <6.1.0`. TS 6.0.3 also satisfies `eslint-config-next` (`>=3.3.1`). |
| `typescript-eslint` | 8.71.2 | 2026-10-12 | Supports ESLint 9 and 10 and TS below 6.1. Also used (deduplicated) by `eslint-config-next`. |
| `eslint`, `@eslint/js` | 9.39.5 | 2026-07-10 | **Not ESLint 10.** `eslint-config-next` 16.4.x depends on `eslint-plugin-react` (peer ESLint up to `^9.7`), `eslint-plugin-import` (up to `^9`) and `eslint-plugin-jsx-a11y` (up to `^9`). **npm marks 9.39.5 as deprecated / "no longer supported"** (§11, F3). |
| `eslint-config-next` | 16.4.2 | 2026-10-15 | Matches `next` |

**Release-age rule applied (proposed):** prefer stable releases that are at least about a week old, to reduce supply-chain risk from newly published versions. Every selected package was published at least 8 days before installation. The youngest were `next` and `eslint-config-next` 16.4.2, at 8.02 days (corrected in TASK-03A). **No prerelease versions are used.** Release dates are from `npm view … time` (E2).

---

## 4. Workspace structure and files

| File | Purpose |
|---|---|
| `package.json` (root) | Private workspace root: workspaces, root scripts, the Node and npm engine policy, and shared dev tools (TypeScript, ESLint) |
| `package-lock.json` | npm lockfile, pinning every package version and its integrity hash |
| `.nvmrc` | Node major version `24` |
| `.gitignore` | Excludes env files (keeps `.env.example`), dependencies, build output and caches, logs, local private data and editor/OS artefacts (verified in E9) |
| `.gitattributes` | `* text=auto eol=lf` (reason in §5) |
| `tsconfig.base.json` | Shared strict TypeScript options. Each workspace extends it. |
| `eslint.config.mjs` (root) | ESLint flat config for the API and shared packages (`@eslint/js` recommended plus `typescript-eslint` recommended). Ignores `apps/web`. |
| `README.md` | Status, structure, Windows prerequisites and setup, scripts, configuration, contributor rules |
| **`apps/api/`** | |
| `package.json` | `@kulvriksh/api` (ESM). Scripts: `dev` (Node `--watch` with built-in type stripping), `build` (tsc to `dist`), `start` (runs `dist`), `typecheck`, `lint`. Express is the only runtime dependency. |
| `tsconfig.json` | NodeNext modules. Uses `.ts` import extensions, which the build rewrites to `.js` (`rewriteRelativeImportExtensions`), and `erasableSyntaxOnly`, so the same source runs under Node type stripping. |
| `src/config.ts` | Reads `API_HOST` (default `127.0.0.1`) and `API_PORT` (default `4000`). An invalid port throws `ConfigError`, which stops startup. |
| `src/app.ts` | Express app. `x-powered-by` disabled. `GET /health` (no-store). JSON 404. Error handler that returns a generic 500 without internal details. |
| `src/server.ts` | Explicit `http.Server`. Server errors exit with code 1. SIGTERM/SIGINT close the server, with a 10-second forced-exit timeout. |
| `.env.example` | Placeholder `API_HOST` and `API_PORT`, plus a list of settings that are intentionally **not** implemented yet |
| **`apps/web/`** | |
| `package.json` | `@kulvriksh/web`. Scripts: `dev`, `build`, `start` (the port comes from `PORT`; default 3000), `typecheck` (`next typegen && tsc --noEmit`), `lint`. |
| `tsconfig.json` | Next.js App Router settings (bundler resolution, `react-jsx`, the `next` plugin). **Not modified by `next build`** (checked). |
| `next.config.ts` | `reactStrictMode: true`, `poweredByHeader: false` |
| `eslint.config.mjs` | `eslint-config-next` core-web-vitals and TypeScript configs |
| `app/layout.tsx` | Root layout. Metadata includes `robots: noindex, nofollow`, because it is a placeholder. `lang="en"` is a placeholder pending R3. |
| `app/page.tsx` | Placeholder page: skip link, header with the wordmark (`next/link`), `main` with an `h1`, a status note and a footer. No images, animation or UI libraries. |
| `app/globals.css` | **Provisional** design tokens (CSS custom properties: colours, system font stacks, type and space scales), a visible `:focus-visible` outline, skip-link styling, and a responsive container |
| **`packages/shared/`** | |
| `package.json` | `@kulvriksh/shared`. Type-only, with no runtime code. Exports `src/index.ts`. |
| `src/index.ts` | `ApiErrorBody` and `HealthResponse` contracts |
| `tsconfig.json` | Type-check only (`noEmit`) |

**How the shared package is used:** the API imports `ApiErrorBody` and `HealthResponse` with `import type`. That import is erased at runtime, so the compiled API has no runtime dependency on the package (E6 shows `dist` imports only `./app.js`, `./config.js` and `express`). The web app does not consume it yet. It is listed as an API **dev** dependency because it is only needed at compile time.

**Provisional colour contrast (WCAG 2.x, E3):**

| Pair | Ratio | Result |
|---|---|---|
| Text on the ivory background | 15.75:1 | Passes AA and AAA |
| Muted text | 7.16:1 | Passes AA and AAA |
| Forest green (links, `h1`, wordmark, focus ring) on ivory | 8.93:1 | Passes AA and AAA |
| Terracotta accent | 5.68:1 | Used only as a decorative border, not for text |

**Not created:** no Prisma, database driver, auth, domain modules, empty feature folders, mock data, UI library, external fonts or images, Docker, Redis, queues or CI.

---

## 5. Additional configuration files and why

| File | Why it was needed |
|---|---|
| `.gitattributes` | Git on this machine has `core.autocrlf=true` (system config, E1 P6). Production is Linux. Without the attribute, line endings would depend on each developer's settings. `eol=lf` makes the index and checkouts LF everywhere. **All 30 indexed files are `i/lf` (E10, S7).** The existing documents were already LF, so their bytes are unchanged. |
| `tsconfig.base.json` | Avoids duplicating strict compiler options across three workspaces |
| `apps/web/eslint.config.mjs` and root `eslint.config.mjs` | The web app needs Next's rules; the API and shared packages need plain TypeScript rules. Two small configs are simpler than one config with scoped Next plugins. |
| `apps/api/.env.example` | Documents the API's only settings, with placeholders only |

---

## 6. Commands executed

Every command, with its output and exit code, is in the evidence appendix at the end of this report (E1–E14). Main sequence:

1. **Preflight** (read-only): inventory, checksums, versions, Git config, GitHub CLI and PostgreSQL detection, npm registry reachability (E1)
2. **Compatibility research:** `npm view` dist-tags, engines, peer dependencies and publish times (E2), plus a contrast calculation (E3)
3. **Write files**, then `npm install` (E4)
4. **Checks:** workspace resolution and version listing, `npm run typecheck`, `npm run lint` (E5), `npm run build` (E6)
5. **API runtime tests** (E7): start, `/health`, 404, port conflict, invalid ports, simulated SIGTERM, dev mode. **F1 was found and fixed here.**
6. **Web runtime test** on a production build (E8)
7. **Git:** `git init -b main` and ignore-rule tests (E9)
8. **Lockfile reproducibility:** `npm ci`, then repeated `npm install` (E11). **F3b was found here; the lockfile converged and was re-verified with a clean `npm ci`.**
9. **Pre-commit review:** stage, allowlist check, secret scan, line endings (E10), then commit 1 (E12)
10. **Root web scripts** (E13): **F2 was found here, fixed, re-verified and committed as commit 2.** **F4 (`AGENTS.md`) was also found here.**
11. **Final `npm run check`** and post-report verification (E14)

---

## 7. Build, type-check, lint and health results

| # | Check (task §10) | Status | Evidence |
|---|---|---|---|
| 1 | Node 24.13.0 and npm 11.6.2 match the policy | **PASS** | E1 P5, E5 |
| 2 | Workspace configuration resolves (3 workspaces; links to `apps/*` and `packages/shared`) | **PASS** | E5 |
| 3 | Clean dependency install succeeds and the lockfile is reproducible | **PASS, after one correction:** the first generated lockfile changed on later `npm install` runs (F3b). It converged on the third run and stayed unchanged on runs 4–6. A fresh `npm ci` plus `npm install` from the committed lockfile leaves it unchanged. | E4, E11 |
| 4 | Web production build | **PASS**: `next build` compiled; `/` and `/_not-found` were statically prerendered | E6, E14 |
| 5 | API type-checks and starts | **PASS** after the F1 fix | E5, E7 |
| 6 | `GET /health` returns the expected response | **PASS**: `200`, `Cache-Control: no-store`, body `{"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}`. It does **not** claim a database is healthy. | E7 |
| 7 | Root scripts work as documented | See the breakdown below | E5–E8, E13, E14 |
| 8 | `.gitignore` excludes env, dependency, build and private-data paths | **PASS**: all 24 sample paths are ignored; source files, the lockfile, docs and `.env.example` are not | E9 |
| 9 | Secret scan finds no credentials | **PASS**: no high-confidence matches. One generic match is a false positive (§10). | E10 |
| 10 | Staged files are only authorised files | **PASS**: the allowlist check printed nothing, and no generated or env paths were staged | E10 |
| 11 | Protected document checksums match the preflight | **PASS**: `md5sum -c` OK for all six, before the commit and after the report (E10 S2, E14) | E10, E14 |
| 12 | The report's inventory matches the final repository | **PASS** | E14 |
| 13 | Git status and commit status reported accurately | **PASS**: 2 commits, no remote. The only untracked files are this report and the generated `apps/web/AGENTS.md`. | E12, E13, E14 |

**Root scripts (check 7):**
- **PASS:**
  - `typecheck`, `lint`, `build` and `check`
  - `start:api` and `dev:api` (both serve `/health`)
  - `dev:web` and `start:web` with a `PORT` override (both 200), after F2
- **Not run through the root script:** `start:web` and `dev:web` on the default port 3000. That port is used by another project on this machine. The web app was therefore tested on ports 3100–3102.

**Additional API checks (E7):**
- **PASS:** unknown route → `404 {"error":{"code":"NOT_FOUND",…}}`
- **PASS:** `X-Powered-By` header absent
- **PASS:** `API_PORT=abc` and `API_PORT=70000` → configuration error, exit 1
- **PASS:** a second instance on the same port → `EADDRINUSE` only, exit 1 (after F1)
- **PASS:** dev mode (Node type stripping) serves `/health`
- **Graceful shutdown: PARTIAL.** The handler path was exercised with a simulated `process.emit('SIGTERM')` (clean exit 0). **A real OS signal could not be delivered on Windows from this shell**, so real SIGTERM handling must be verified on Linux (M12).

**Additional web checks (E8):**
- **PASS:** the initial HTML contains the title, `noindex, nofollow`, the skip link and the `<h1>`
- **PASS:** an unknown route returns HTTP 404
- **PASS:** no `X-Powered-By` header

**Dependency audit:** `npm audit` reports **0 vulnerabilities** (E4, E11).

---

## 8. Protected documentation checksums

| File | Preflight MD5 (E1 P2) | Final MD5 (E14) | Result |
|---|---|---|---|
| `docs/00-ROADMAP.md` | `17c2b0b2799092ef34ab56c1d4ee404a` | (see E14 `md5sum -c`) | Unchanged |
| `docs/01-PRODUCT-FLOWS.md` | `14c727e7834a4fe9685e779c870c6862` | (see E14) | Unchanged |
| `docs/02-DATA-MODEL.md` | `8afabdcabb87bc6df2d7541b8e40aafc` | (see E14) | Unchanged |
| `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md` | `4408f9afb25628949c61852a32e9b729` | (see E14) | Unchanged |
| `docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md` | `2dcb5aad1f1e6e8e1a0e2d8ded1c3472` | (see E14) | Unchanged |
| `docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md` | `8df13430d2c6af881313229a56d82360` | (see E14) | Unchanged |

The "Unchanged" result is backed by the `md5sum -c` output in E10 (before the commit) and E14 (after this report was written).

---

## 9. Git initialisation, staging review, commits and remote

- **Safety check before `git init`:** no `.git` existed, no hidden files existed, and the inventory matched TASK-02 (E1, E9).
- **Initialisation:** `git init -b main`. **No Git configuration was changed.** The machine's existing global identity (`Heel Patel <<owner-git-email>>`, E1 P6) was used as the commit author.
- **Staged review (E10):**
  - `git status`
  - the full staged list (30 files, all additions)
  - the authorised-path allowlist check, which printed nothing
  - the generated, env and local-data path check, which printed nothing
  - the secret scan (§10)
  - the protected-document `md5sum -c` (all OK)
  - index line endings (30 × `i/lf`)
- **Existing documents in the commit:** the four specifications and the TASK-01 and TASK-02 reports were added **unchanged**, so the project's specifications are under version control. They were not modified.
- **Commit 1:** `15dd95b3fa61382ec60e8bc3120589068743866a`, "chore: initialise M0 repository and governance foundation". 30 files, 12,952 insertions (E12).
- **Commit 2:** `e83562484d0495ec836b9eb896c8f7dfefd6927c`, "fix(web): let PORT choose the web port instead of hard-coding 3000". 2 files, `apps/web/package.json` and `README.md` (E13). It is a separate commit, not an amend.
- **This report is not committed.** It is left untracked for review first. If it is accepted, it can be committed in a docs commit.
- **Remote: PENDING.**
  - The GitHub CLI (`gh`) is not installed.
  - No GitHub authentication was checked or used, no repository was created and nothing was pushed.
  - `git remote -v` is empty (E12).
  - The GitHub probe showed that github.com is reachable (E1 P7). It proves nothing about access.
  - **Creating the private repository and adding the remote is an owner action** (§13).

---

## 10. Secret scan method and result

**Method** (E10, S6), run on the **staged content** with `git grep --cached -I`:
1. **High-confidence patterns:**
   - private-key PEM headers
   - AWS access key IDs
   - GitHub tokens (`ghp_`… and `github_pat_`…)
   - Razorpay keys (`rzp_live_` and `rzp_test_`)
   - Stripe live keys
   - Slack tokens
   - database URLs with embedded credentials
2. **Generic assignments:** `password`, `secret`, `token`, `api_key`, `access_key` or `private_key` followed by `:`/`=` and a value of 12 or more characters (excluding the lockfile).
3. **Key-file names:** `.pem`, `.key`, `.p12`, `.pfx`, `.crt`, `.jks`, keystores, `id_rsa`, `id_ed25519` and `credentials`.

**Result:**
- (1) and (3): no matches.
- (2): one match, `docs/02-DATA-MODEL.md:1296`, which is `SET run_lease_owner = $owner, run_lease_token = gen_random_uuid(),`. That is SQL specification text, not a credential. **False positive.**
- **Conclusion:** no credentials in the staged files.
- The scan was repeated on commit 2's two files, with no matches (E13).

**Limit:** this is pattern-based. It cannot prove that no secret exists, but no real credentials were ever created in this task.

---

## 11. Failures, workarounds, deviations and unresolved decisions

### Defects found by validation (fixed and re-verified)

| ID | Defect | Fix | Evidence |
|---|---|---|---|
| **F1** | Started on a busy port, the API first printed `[api] listening on …` and *then* failed with `EADDRINUSE`. In Express 5, `app.listen()`'s callback is also called when listening fails, so the success message was wrong. | `server.ts` now creates an explicit `http.Server`. `server.listen` calls its callback only on success, and errors go to the `error` handler (exit 1). Rebuilt and re-tested: the busy port now reports only the error. | E7 (both runs) |
| **F2** | The web `dev`/`start` scripts hard-coded `--port 3000`, and the root scripts cannot forward arguments through the nested `npm run … -w` call. `npm run dev:web -- --port 3101` became `next dev --port 3000 3101`, which Next.js read as a directory. The web app could not run when port 3000 was in use. | The scripts now use plain `next dev` and `next start`, which default to 3000 and honour `PORT`. The README documents `PORT` and `API_PORT`. Re-verified: `PORT=3101 npm run dev:web` and `PORT=3102 npm run start:web` both return 200. Committed as `e835624`. | E13 |

### Tooling issues (decisions needed)

| ID | Issue | Current state | Decision needed |
|---|---|---|---|
| **F3** | **ESLint 9.39.5 is marked by npm as "no longer supported".** ESLint 10 cannot be used while `eslint-config-next` 16.4 depends on plugins that cap ESLint at 9 (§3.2). | ESLint 9.39.5 is a **development-only** tool; it is not shipped to production. Linting passes. | **Accept ESLint 9 until `eslint-config-next`'s plugins support ESLint 10, or drop `eslint-config-next`?** Dropping it means using ESLint 10 with `typescript-eslint` and `eslint-plugin-react-hooks`, and losing the Next, React-import and jsx-a11y rules. Recommendation: accept it for now and re-check at each milestone. |
| **F3b** | **The first lockfile was unstable.** The second and third `npm install` added or removed nested optional WebAssembly fallback packages (`@emnapi/*`, `@img/sharp-wasm32`, used by Next.js's optional `sharp`). It converged on the third run. | The committed lockfile is stable under `npm ci` and `npm install` (E11). `npm ls` still labels `@img/sharp-wasm32` (an optional WASM fallback) as "extraneous". It is harmless: the native `@img/sharp-win32-x64` and `@img/sharp-linux-x64` binaries are in the lockfile. | **None now.** Watch lockfile diffs for similar churn after dependency updates. npm 12.2.1 exists, but upgrading npm was not in scope. |
| **F4** | **`apps/web/AGENTS.md` was generated by `next dev`.** Next.js 16.3+ writes this managed block when it detects an AI coding agent running `next dev` (`agentRules`, enabled by default; `node_modules/next/dist/server/lib/generate-agent-files.js`). Its text tells agents to commit it. | **Not committed and not deleted**, because it is outside the authorised file list. It is left untracked. It will be re-created on every agent-run `next dev`. | **Choose one:** (a) set `agentRules: false` in `apps/web/next.config.ts` (Next.js then removes the file on the next `next dev`); (b) commit `AGENTS.md`; (c) git-ignore it. Recommendation: (a), which keeps the tree clean and avoids tool-written instructions in the repository. |

### Deviations and environment notes

- **Port overlap on this machine:** another project listens on `0.0.0.0:3000` (PID 7668) and `0.0.0.0:4000` (PID 19480).
  - The API binds `127.0.0.1:4000`, which Windows allowed. The API responses were confirmed to come from this API by their bodies (`"service":"kulvriksh-api"`).
  - The web app was tested on ports 3100–3102.
  - **Other projects' processes were never touched.** Only process trees started by this task were stopped, each after tracing its parent chain (E7, E13).
- **Real SIGTERM on Windows** could not be delivered (§7). It needs verification on Linux.
- **Next.js telemetry:** commands in this task ran with `NEXT_TELEMETRY_DISABLED=1`. The project does not change anyone's global telemetry setting; the README documents the opt-out. Whether to disable telemetry project-wide is an owner choice.
- **Formatting:** no formatter (e.g. Prettier) was added, to keep M0 minimal. It is low-cost to add later if the reviewer wants it.
- **GitHub remote:** pending (§9).
- **PostgreSQL:** not installed and not configured, as instructed (E1 P8). No database dependency, connection string or schema exists.

---

## 12. Confirmation of scope

- **No domain schema, Prisma schema, migration or SQL file** was created.
- **No database dependency or connection** exists.
- **Not implemented:** authentication, sessions, OTP, payments, Razorpay, workspaces, members, relationships, tree, media, TTS, PDF, research, admin or genealogist functionality.
- **No deployment, hosting, domain or DNS** change.
- **No protected specification or report** was modified (§8).
- **No secrets or `.env` files** were created or committed. Only `apps/api/.env.example` exists, with placeholders.
- **No Docker, Redis, queue, cloud service, CI or paid service** was added.
- **No global Git configuration** was changed. **No global Next.js telemetry setting** was changed.

---

## 13. Next approval needed

1. **Review and accept M0**, including fixes F1 and F2, and commits `15dd95b` and `e835624`.
2. **Decide F4** (`AGENTS.md`). Recommendation: `agentRules: false`.
3. **Decide F3** (ESLint 9). Recommendation: accept it for now.
4. **Authorise committing this report** (a docs-only commit).
5. **Owner action:** create the private GitHub repository and provide the remote, or add it yourselves. **No token should be shared with the agent.** Pushing happens only after explicit approval.
6. **Still outstanding from earlier tasks:**
   - the TASK-01 review outcome
   - CP2 review before M3 and M4
   - confirming the production PostgreSQL major version before M3

**I have not started M1, M2, M3 or any further task.**

---

## Appendix — Evidence (raw command output)

Commands were run in Git Bash on Windows, from the repository root unless stated otherwise. `<scratchpad>` is the agent's session scratchpad, outside the repository, where logs and test-only helper scripts were kept. Output is unedited, except where explicitly marked as truncated: one very long HTML line in E8, and the dist-tag listing in E2, which is a filtered excerpt.


### E1 Preflight (read-only)

Script: `<scratchpad>/t3-preflight.sh`, run from the repository root.

~~~text
### P1 Working directory and full inventory (including hidden files)
$ pwd
/c/Users/HEEL PATEL/Desktop/KulVriksh
[exit=0]

$ find . | sort
.
./docs
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
[exit=0]

$ find . -name '.*' -not -name '.' | sort; echo '(end hidden)'
(end hidden)
[exit=0]

### P2 Checksums of all existing Markdown documents (preflight baseline)
$ find . -type f -name '*.md' | sort | xargs md5sum
17c2b0b2799092ef34ab56c1d4ee404a *./docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *./docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *./docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
[exit=0]

### P3 Compare with the TASK-02 final inventory (6 files expected)
$ find . -type f | sort | diff - <(printf '%s\n' ./docs/00-ROADMAP.md ./docs/01-PRODUCT-FLOWS.md ./docs/02-DATA-MODEL.md ./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md ./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md ./docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md) && echo 'MATCHES TASK-02 inventory'
MATCHES TASK-02 inventory
[exit=0]

### P4 Line endings of existing documents
$ file docs/*.md docs/reports/*.md
docs/00-ROADMAP.md:                                   Unicode text, UTF-8 text, with very long lines (720)
docs/01-PRODUCT-FLOWS.md:                             Unicode text, UTF-8 text, with very long lines (482)
docs/02-DATA-MODEL.md:                                Unicode text, UTF-8 text, with very long lines (363)
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md:         Unicode text, UTF-8 text
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md:   Unicode text, UTF-8 text, with very long lines (410)
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: Unicode text, UTF-8 text, with very long lines (574)
[exit=0]

### P5 Runtime and tooling
$ node -v
v24.13.0
[exit=0]

$ npm -v
11.6.2
[exit=0]

$ corepack --version
0.34.5
[exit=0]

$ git --version
git version 2.52.0.windows.1
[exit=0]

$ node -p 'process.versions.node + " " + process.platform + " " + process.arch'
24.13.0 win32 x64
[exit=0]

### P6 Git state and configuration (no changes made)
$ git rev-parse --is-inside-work-tree
fatal: not a git repository (or any of the parent directories): .git
[exit=128]

$ git config --global --list --show-origin | grep -E 'user\.|init\.defaultBranch|core\.autocrlf|core\.eol' ; echo '(end selected global config)'
file:C:/Users/HEEL PATEL/.gitconfig	user.name=Heel Patel
file:C:/Users/HEEL PATEL/.gitconfig	user.email=<owner-git-email>
(end selected global config)
[exit=0]

$ git config --system --list --show-origin 2>/dev/null | grep -E 'init\.defaultBranch|core\.autocrlf|core\.eol|credential' ; echo '(end selected system config)'
file:C:/Program Files/Git/etc/gitconfig	core.autocrlf=true
file:C:/Program Files/Git/etc/gitconfig	credential.helper=manager
file:C:/Program Files/Git/etc/gitconfig	credential.https://dev.azure.com.usehttppath=true
(end selected system config)
[exit=0]

### P7 GitHub access (no repository is created)
$ gh --version
bash: line 1: gh: command not found
[exit=127]

$ gh auth status
bash: line 1: gh: command not found
[exit=127]

$ git ls-remote https://github.com/ 2>&1 | head -2; echo '(github reachability probe only)'
fatal: repository 'https://github.com/' not found
(github reachability probe only)
[exit=0]

### P8 PostgreSQL availability
$ psql --version
bash: line 1: psql: command not found
[exit=127]

$ postgres --version
bash: line 1: postgres: command not found
[exit=127]

$ ls -d '/c/Program Files/PostgreSQL'/* 2>&1
ls: cannot access '/c/Program Files/PostgreSQL/*': No such file or directory
[exit=2]

$ sc.exe query state= all 2>/dev/null | grep -i -A1 'postgres' ; echo '(end service search)'
(end service search)
[exit=0]

### P9 npm registry reachability and npm config relevant to installs
$ npm config get registry
https://registry.npmjs.org/
[exit=0]

$ npm ping
npm notice PING https://registry.npmjs.org/
npm notice PONG 372ms
[exit=0]

~~~

### E2 Compatibility research (npm registry metadata)

~~~text
$ for p in next react react-dom express typescript @types/node @types/react @types/react-dom @types/express eslint @eslint/js typescript-eslint eslint-config-next; do npm view "$p" dist-tags --json; done
# EXCERPT: filtered with grep -E '^\$|"latest"|"backport"|exit=' (the full output lists every dist-tag)
$ npm view next dist-tags --json
  "backport": "15.5.28",
  "latest": "16.4.3",
[exit=0]
$ npm view react dist-tags --json
  "latest": "19.3.1",
  "backport": "19.1.10",
[exit=0]
$ npm view react-dom dist-tags --json
  "latest": "19.3.1",
  "backport": "19.1.10",
[exit=0]
$ npm view express dist-tags --json
  "latest": "5.3.0",
[exit=0]
$ npm view typescript dist-tags --json
  "latest": "7.0.2",
[exit=0]
$ npm view @types/node dist-tags --json
  "latest": "26.6.5",
[exit=0]
$ npm view @types/react dist-tags --json
  "latest": "19.3.0",
[exit=0]
$ npm view @types/react-dom dist-tags --json
  "latest": "19.3.0",
[exit=0]
$ npm view @types/express dist-tags --json
  "latest": "5.0.6",
[exit=0]
$ npm view eslint dist-tags --json
  "latest": "10.13.0"
[exit=0]
$ npm view @eslint/js dist-tags --json
  "latest": "10.0.1",
[exit=0]
$ npm view typescript-eslint dist-tags --json
  "latest": "8.72.0",
[exit=0]
$ npm view eslint-config-next dist-tags --json
  "backport": "15.5.28",
  "latest": "16.4.3",
[exit=0]

$ npm view next@16.4.3 engines peerDependencies time.modified --json
{
  "engines": {
    "node": ">=20.9.0"
  },
  "peerDependencies": {
    "sass": "^1.3.0",
    "react": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
    "react-dom": "^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0",
    "@playwright/test": "^1.51.1",
    "@opentelemetry/api": "^1.1.0",
    "babel-plugin-react-compiler": "*"
  },
  "time.modified": "2026-10-23T13:40:25.420Z"
}
[exit=0]

  "16.3.0": "2026-08-03T20:34:17.082Z",
  "16.3.1": "2026-08-13T22:45:02.025Z",
  "16.3.2": "2026-08-21T09:54:02.099Z",
  "16.3.3": "2026-08-25T15:32:19.558Z",
  "16.3.4": "2026-08-31T20:00:51.381Z",
  "16.3.5": "2026-09-11T17:26:46.049Z",
  "16.3.6": "2026-09-22T16:19:00.458Z",
  "16.3.7": "2026-09-29T09:04:19.157Z",
  "16.3.8": "2026-09-30T16:07:21.198Z",
  "16.4.0": "2026-10-06T18:35:31.699Z",
  "16.4.1": "2026-10-14T17:43:55.246Z",
  "16.4.2": "2026-10-15T20:57:24.007Z",
  "16.4.3": "2026-10-23T13:40:24.922Z"
$ npm view eslint-config-next@16.4.3 peerDependencies dependencies --json
{
  "peerDependencies": {
    "eslint": ">=9.0.0",
    "typescript": ">=3.3.1"
  },
  "dependencies": {
    "globals": "16.4.0",
    "typescript-eslint": "^8.56.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-import": "^2.32.0",
    "eslint-plugin-jsx-a11y": "^6.10.0",
    "@next/eslint-plugin-next": "16.4.3",
    "eslint-plugin-react-hooks": "^7.1.0",
    "eslint-import-resolver-node": "^0.3.6",
    "eslint-import-resolver-typescript": "^3.5.2"
  }
}
[exit=0]

$ npm view typescript-eslint@8.72.0 peerDependencies engines --json
{
  "peerDependencies": {
    "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
    "typescript": ">=4.8.4 <6.1.0"
  },
  "engines": {
    "node": "^18.18.0 || ^20.9.0 || >=21.1.0"
  }
}
[exit=0]

  "5.9.2": "2025-07-31T17:54:06.216Z",
  "5.9.3": "2025-09-30T21:19:38.784Z",
  "6.0.2": "2026-03-23T16:14:45.521Z",
  "6.0.3": "2026-04-16T23:38:27.905Z",
  "7.0.2": "2026-07-08T15:55:18.431Z",
$ npm view express@5.3.0 engines time --json
  "engines": {
    "node": ">= 18"
    "5.0.0": "2024-09-10T04:40:34.348Z",
    "5.0.1": "2024-10-08T19:42:44.129Z",
    "5.1.0": "2025-03-31T14:01:22.509Z",
    "5.2.0": "2025-12-01T16:23:57.541Z",
    "5.2.1": "2025-12-01T20:49:43.268Z",
    "5.3.0": "2026-10-09T12:56:54.505Z"
$ npm view react@19.3.1 time.modified
2026-10-23T16:30:48.610Z
[exit=0]

$ npm view @types/node@24 version --json
[
  "24.0.0",
  "24.0.1",
  "24.0.2",
  "24.0.3",
  "24.0.4",
  "24.0.5",
  "24.0.6",
  "24.0.7",
  "24.0.8",
  "24.0.9",
  "24.0.10",
  "24.0.11",
  "24.0.12",
  "24.0.13",
  "24.0.14",
  "24.0.15",
  "24.1.0",
  "24.2.0",
  "24.2.1",
  "24.3.0",
  "24.3.1",
  "24.3.2",
  "24.3.3",
  "24.4.0",
  "24.5.0",
  "24.5.1",
  "24.5.2",
  "24.6.0",
  "24.6.1",
  "24.6.2",
  "24.7.0",
  "24.7.1",
  "24.7.2",
  "24.8.0",
  "24.8.1",
  "24.9.0",
  "24.9.1",
  "24.9.2",
  "24.10.0",
  "24.10.1",
  "24.10.2",
  "24.10.3",
  "24.10.4",
  "24.10.5",
  "24.10.6",
  "24.10.7",
  "24.10.8",
  "24.10.9",
  "24.10.10",
  "24.10.11",
  "24.10.12",
  "24.10.13",
  "24.10.14",
  "24.10.15",
  "24.11.0",
  "24.11.1",
  "24.11.2",
  "24.12.0",
  "24.12.1",
  "24.12.2",
  "24.12.3",
  "24.12.4",
  "24.13.0",
  "24.13.1",
  "24.13.2",
  "24.13.3",
  "24.13.4",
  "24.13.5",
  "24.13.6",
  "24.19.0",
  "24.19.1",
  "24.19.2"
]
[exit=0]

$ npm view eslint@10.13.0 engines peerDependencies --json
{
  "engines": {
    "node": "^20.19.0 || ^22.13.0 || >=24"
  },
  "peerDependencies": {
    "jiti": "*"
  }
}
[exit=0]

$ npm view @eslint/js@10.0.1 peerDependencies --json
{
  "eslint": "^10.0.0"
}
[exit=0]

# Second query (each command was "npm view <pkg> time --json | grep <versions>", so its header lines were filtered by the same grep; the lines below are the raw grep output in query order: react, react-dom, @types/react, @types/react-dom, @types/node, @types/express, eslint@9 versions, eslint 9 times, @eslint/js 9 times, typescript-eslint times, eslint-config-next times, then plugin peers)
  "19.2.0": "2025-10-01T21:38:32.757Z",
  "19.2.1": "2025-12-03T15:28:21.493Z",
  "19.2.2": "2025-12-11T20:02:00.544Z",
  "19.2.3": "2025-12-11T22:55:28.598Z",
  "19.2.4": "2026-01-26T18:23:10.244Z",
  "19.2.5": "2026-04-08T18:39:24.455Z",
  "19.2.6": "2026-05-06T16:16:47.653Z",
  "19.2.7": "2026-06-01T18:00:48.323Z",
  "19.2.8": "2026-07-21T15:41:28.716Z",
  "19.3.0": "2026-09-09T17:21:30.071Z",
  "19.3.1": "2026-10-14T16:47:15.290Z",
  "19.2.9": "2026-10-14T16:54:43.794Z",
  "19.2.0": "2025-10-01T21:38:42.388Z",
  "19.2.1": "2025-12-03T15:28:29.636Z",
  "19.2.2": "2025-12-11T20:02:08.367Z",
  "19.2.3": "2025-12-11T22:55:37.826Z",
  "19.2.4": "2026-01-26T18:23:18.598Z",
  "19.2.5": "2026-04-08T18:39:31.423Z",
  "19.2.6": "2026-05-06T16:16:56.080Z",
  "19.2.7": "2026-06-01T18:01:02.438Z",
  "19.2.8": "2026-07-21T15:41:41.267Z",
  "19.3.0": "2026-09-09T17:17:39.744Z",
  "19.3.1": "2026-10-14T16:49:10.081Z",
  "19.2.9": "2026-10-14T16:49:51.523Z",
  "19.2.16": "2026-06-01T18:00:27.791Z",
  "19.2.17": "2026-06-05T20:10:24.692Z",
  "19.2.18": "2026-07-30T21:54:03.456Z",
  "19.3.0": "2026-09-09T18:08:49.750Z"
  "19.2.5": "2026-08-23T21:05:23.671Z",
  "19.2.6": "2026-09-03T09:39:48.462Z",
  "19.2.7": "2026-09-03T11:04:47.516Z",
  "19.3.0": "2026-09-09T18:07:51.886Z"
  "24.13.0": "2026-06-04T07:01:50.238Z",
  "24.13.1": "2026-06-05T22:33:32.207Z",
  "24.13.2": "2026-06-10T22:15:29.361Z",
  "24.13.3": "2026-07-08T06:48:03.261Z",
  "24.13.4": "2026-09-09T18:10:47.240Z",
  "24.13.5": "2026-09-15T20:37:51.965Z",
  "24.13.6": "2026-09-19T00:12:26.120Z",
  "24.19.0": "2026-09-25T22:09:25.850Z",
  "24.19.1": "2026-10-01T22:38:02.894Z",
  "24.19.2": "2026-10-09T18:44:25.189Z",
  "5.0.0": "2024-09-25T19:20:29.866Z",
  "5.0.1": "2025-03-19T19:32:13.062Z",
  "5.0.2": "2025-05-16T23:34:15.854Z",
  "5.0.3": "2025-06-07T02:19:15.168Z",
  "5.0.4": "2025-10-24T04:36:03.951Z",
  "5.0.5": "2025-10-27T20:35:59.999Z",
  "5.0.6": "2025-12-01T20:35:51.488Z"
]
[exit=0]

  "9.39.3": "2026-02-20T13:52:09.866Z",
  "9.39.4": "2026-03-06T21:46:46.521Z",
  "9.39.5": "2026-07-10T20:41:47.507Z",
  "9.39.4": "2026-03-06T21:21:15.041Z",
  "9.39.5": "2026-07-10T20:16:17.272Z"
  "8.70.0": "2026-09-07T18:18:09.654Z",
  "8.70.1": "2026-09-21T17:07:55.524Z",
  "8.71.0": "2026-09-28T17:12:00.356Z",
  "8.71.1": "2026-10-05T17:08:41.691Z",
  "8.71.2": "2026-10-12T17:10:00.963Z",
  "8.72.0": "2026-10-19T17:08:09.147Z",
  "16.4.0": "2026-10-06T18:26:44.970Z",
  "16.4.1": "2026-10-14T17:31:42.399Z",
  "16.4.2": "2026-10-15T20:46:42.598Z",
  "16.4.3": "2026-10-23T13:28:48.128Z"
$ npm view eslint-plugin-react peerDependencies --json
{
  "eslint": "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7"
}
[exit=0]

$ npm view eslint-plugin-import peerDependencies --json
{
  "eslint": "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9"
}
[exit=0]

$ npm view eslint-plugin-jsx-a11y peerDependencies --json
{
  "eslint": "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9"
}
[exit=0]

$ npm view eslint-plugin-react-hooks peerDependencies --json
{
  "eslint": "^3.0.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0-0 || ^9.0.0 || ^10.0.0"
}
[exit=0]

~~~

### E3 Provisional token contrast (WCAG 2.x)

Script: `<scratchpad>/contrast.mjs` (computes the WCAG relative-luminance contrast ratio).

~~~text
text on bg                                   #1f1c17 on #faf6ee  15.75:1  AA-text pass  AAA-text pass
text-muted on bg                             #595247 on #faf6ee  7.16:1  AA-text pass  AAA-text pass
text-muted on surface                        #595247 on #fffdf8  7.59:1  AA-text pass  AAA-text pass
primary (links, h1, wordmark) on bg          #1f4d3a on #faf6ee  8.93:1  AA-text pass  AAA-text pass
primary on surface                           #1f4d3a on #fffdf8  9.47:1  AA-text pass  AAA-text pass
primary-contrast on primary (skip link)      #faf6ee on #1f4d3a  8.93:1  AA-text pass  AAA-text pass
accent on bg (border accent; non-text)       #9c4a2c on #faf6ee  5.68:1  AA-text pass  AAA-text fail
focus outline vs bg (non-text, needs >=3)    #1f4d3a on #faf6ee  8.93:1  AA-text pass  AAA-text pass
~~~

### E4 First install (generates the lockfile)

~~~text
$ npm install
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 405 packages, and audited 409 packages in 6m

160 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
[exit=0]
~~~

### E5 Workspaces, resolved versions, typecheck, lint

~~~text
$ node -v && npm -v
v24.13.0
11.6.2
[exit=0]

$ npm query .workspace | node -e "const w=JSON.parse(require('fs').readFileSync(0,'utf8'));for(const p of w)console.log(p.name,p.version,p.location)"
@kulvriksh/api 0.0.0 apps/api
@kulvriksh/web 0.0.0 apps/web
@kulvriksh/shared 0.0.0 packages/shared
[exit=0]

$ npm ls --workspaces --depth=0
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
+-- @emnapi/runtime@1.11.3 extraneous
+-- @img/sharp-wasm32@0.35.5 extraneous
+-- @kulvriksh/api@0.0.0 -> .\apps\api
| +-- @kulvriksh/shared@0.0.0 deduped -> .\packages\shared
| +-- @types/express@5.0.6
| +-- @types/node@24.19.2
| `-- express@5.3.0
+-- @kulvriksh/shared@0.0.0 -> .\packages\shared
`-- @kulvriksh/web@0.0.0 -> .\apps\web
  +-- @types/node@24.19.2 deduped
  +-- @types/react-dom@19.3.0
  +-- @types/react@19.3.0
  +-- eslint-config-next@16.4.2
  +-- next@16.4.2
  +-- react-dom@19.3.1
  `-- react@19.3.1

[exit=0]

$ npm ls next react react-dom express typescript eslint @eslint/js typescript-eslint eslint-config-next @types/node @types/react @types/react-dom @types/express --depth=0 --workspaces --include-workspace-root
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
+-- @eslint/js@9.39.5
+-- @kulvriksh/api@0.0.0 -> .\apps\api
| +-- @types/express@5.0.6
| +-- @types/node@24.19.2
| `-- express@5.3.0
+-- @kulvriksh/web@0.0.0 -> .\apps\web
| +-- @types/node@24.19.2 deduped
| +-- @types/react-dom@19.3.0
| +-- @types/react@19.3.0
| +-- eslint-config-next@16.4.2
| +-- next@16.4.2
| +-- react-dom@19.3.1
| `-- react@19.3.1
+-- eslint@9.39.5
+-- typescript-eslint@8.71.2
`-- typescript@6.0.3

[exit=0]

$ npm ls typescript-eslint typescript eslint --all | grep -E 'typescript-eslint@|typescript@|eslint@' | sort | uniq -c
      1 +-- eslint@9.39.5
      1 +-- typescript-eslint@8.71.2
      1 `-- typescript@6.0.3
      1 |   +-- eslint-import-resolver-typescript@3.10.1
      1 |   +-- eslint@9.39.5 deduped
      1 |   +-- typescript-eslint@8.71.2 deduped
      1 |   `-- eslint@9.39.5 deduped
      1 |   `-- typescript@6.0.3 deduped
      1 |   |   `-- eslint@9.39.5 deduped
      5 |   | `-- eslint@9.39.5 deduped
      1 | +-- eslint@9.39.5 deduped
      1 | `-- typescript@6.0.3 deduped
      3 | | +-- eslint@9.39.5 deduped
      4 | | `-- typescript@6.0.3 deduped
      1 | | | +-- eslint@9.39.5 deduped
      4 | | | `-- typescript@6.0.3 deduped
[exit=0]

$ npm run typecheck

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
[exit=0]

$ npm run lint

> kulvriksh-platform@0.0.0 lint
> npm run lint --workspaces --if-present


> @kulvriksh/shared@0.0.0 lint
> eslint .


> @kulvriksh/api@0.0.0 lint
> eslint .


> @kulvriksh/web@0.0.0 lint
> eslint .

[exit=0]

~~~

### E6 Production build

~~~text
$ NEXT_TELEMETRY_DISABLED=1 npm run build

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 82ms

  Creating an optimized production build ...
✓ Compiled successfully in 5.7s
  Running TypeScript ...
  Finished TypeScript in 3.4s ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 830ms
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
apps/api/dist/server.js
apps/api/dist/server.js.map

$ grep -n "import" apps/api/dist/server.js apps/api/dist/app.js
apps/api/dist/server.js:1:import { createApp } from "./app.js";
apps/api/dist/server.js:2:import { ConfigError, loadConfig } from "./config.js";
apps/api/dist/app.js:1:import express, {} from 'express';
~~~

### E7 API runtime tests

~~~text
# Run 1, before the F1 fix
$ npm run start:api  (background; log captured below)

> kulvriksh-platform@0.0.0 start:api
> npm run start -w @kulvriksh/api


> @kulvriksh/api@0.0.0 start
> node --env-file-if-exists=.env dist/server.js

.env not found. Continuing without it.
[api] listening on http://127.0.0.1:4000

$ curl -s -i http://127.0.0.1:4000/health
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
Content-Length: 86
ETag: W/"56-RpTa2Qbykk1YPbjc2U8f5wFtClU"
Date: Fri, 23 Oct 2026 21:30:04 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}
[exit=0]

$ curl -s -i http://127.0.0.1:4000/does-not-exist
HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
Content-Length: 61
ETag: W/"3d-+VewX+Kouz/oZglYPA0wd7HvBRk"
Date: Fri, 23 Oct 2026 21:30:04 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"error":{"code":"NOT_FOUND","message":"Resource not found"}}
[exit=0]

$ curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4000/health
404

$ API_PORT=4000 node apps/api/dist/server.js   (second instance on the same port: expect a clean failure)
[api] listening on http://127.0.0.1:4000
[api] server error: listen EADDRINUSE: address already in use 127.0.0.1:4000
[exit=1]

$ API_PORT=abc node apps/api/dist/server.js
[api] configuration error: API_PORT must be an integer, got "abc"
[exit=1]

$ API_PORT=70000 node apps/api/dist/server.js
[api] configuration error: API_PORT must be between 1 and 65535, got 70000
[exit=1]

$ powershell: stop the API process tree (Windows has no SIGTERM delivery from this shell)
listening PID: 35712
SUCCESS: The process with PID 35712 has been terminated.
[exit=0]

$ api-start.log after stop

> kulvriksh-platform@0.0.0 start:api
> npm run start -w @kulvriksh/api


> @kulvriksh/api@0.0.0 start
> node --env-file-if-exists=.env dist/server.js

.env not found. Continuing without it.
[api] listening on http://127.0.0.1:4000
npm error Lifecycle script `start` failed with error:
npm error code 1
npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\api
npm error workspace @kulvriksh/api@0.0.0
npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\api
npm error command failed
npm error command C:\WINDOWS\system32\cmd.exe /d /s /c node --env-file-if-exists=.env dist/server.js

# Run 2, after the F1 fix, plus the leftover dev-process clean-up
$ npm run build -w @kulvriksh/api && npm run typecheck -w @kulvriksh/api && npm run lint -w @kulvriksh/api

> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.json


> @kulvriksh/api@0.0.0 typecheck
> tsc -p tsconfig.json --noEmit


> @kulvriksh/api@0.0.0 lint
> eslint .

[exit=0]

$ node apps/api/dist/server.js   (instance A, background)
[api] listening on http://127.0.0.1:4000

$ curl -s http://127.0.0.1:4000/health
{"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}

$ node apps/api/dist/server.js   (instance B on the same port: expect only an error)
[api] server error: listen EADDRINUSE: address already in use 127.0.0.1:4000
[exit=1]

$ taskkill //PID 16204 //F   (stop instance A)
SUCCESS: The process with PID 16204 has been terminated.

$ node --import ./<scratchpad>/emit-sigterm.mjs apps/api/dist/server.js   (simulated SIGTERM via process.emit)
[api] listening on http://127.0.0.1:4000
[api] SIGTERM received, closing server
[exit=0]

$ node --watch src/server.ts  (dev mode via npm run dev:api, background, Node type stripping)

> kulvriksh-platform@0.0.0 dev:api
> npm run dev -w @kulvriksh/api


> @kulvriksh/api@0.0.0 dev
> node --env-file-if-exists=.env --watch src/server.ts

.env not found. Continuing without it.
.env not found. Continuing without it.
[api] listening on http://127.0.0.1:4000

$ curl -s http://127.0.0.1:4000/health   (dev mode)
{"status":"ok","service":"kulvriksh-api","dependencies":{"database":"not_configured"}}

$ taskkill //PID 37444 //T //F   (stop dev server tree)
SUCCESS: The process with PID 37444 (child process of PID 35472) has been terminated.

$ netstat check port 4000 free
port 4000 not listening
$ taskkill //PID 18296 //T //F   (stop leftover dev:api tree started by this task)
SUCCESS: The process with PID 35472 (child process of PID 32108) has been terminated.
SUCCESS: The process with PID 32108 (child process of PID 18296) has been terminated.
SUCCESS: The process with PID 18296 (child process of PID 5884) has been terminated.
[exit=0]
~~~

### E8 Web production server test (port 3100)

~~~text
$ (apps/web) node ../../node_modules/next/dist/bin/next start --port 3100   (background; port 3000 is used by another project on this machine)
▲ Next.js 16.4.2
- Local:         http://localhost:3100
- Network:       http://192.168.1.3:3100
✓ Ready in 632ms

$ curl -s -i http://localhost:3100/ | head -20
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
x-nextjs-cache: HIT
x-nextjs-prerender: 1
x-nextjs-prerender: 1
x-nextjs-stale-time: 300
Cache-Control: s-maxage=31536000
ETag: "iy1wsgsrwd5hf"
Content-Type: text/html; charset=utf-8
Content-Length: 7107
Date: Fri, 23 Oct 2026 21:31:58 GMT
Connection: keep-alive
Keep-Alive: timeout=5

<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/chunks/018s6itxdnsah.css" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/1x6obpmlu1_c2.js"/><script src="/_next/static/chunks/2r4s4h5xul1n-.js" async=""></script><script src="/_next/static/chunks/2khxl0v1q4i6n.js" async=""></script><script src="/_next/static/chunks/2e268anpfvdoc.js" async=""></script><script src="/_next/static/chunks/turbopack-3-ry682tkyiqk.js" async="" …[TRUNCATED: line was 7107 characters]
$ curl -s http://localhost:3100/ | grep -o "<html lang=\"[a-z]*\"\|<h1>[^<]*</h1>\|<meta name=\"robots\" content=\"[^\"]*\"\|Skip to main content\|<title>[^<]*</title>"
<html lang="en"
<title>Kulvriksh</title>
<meta name="robots" content="noindex, nofollow"
Skip to main content
<h1>Kulvriksh</h1>
Skip to main content

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/no-such-page
404

$ curl -s -I http://localhost:3100/ | grep -i "x-powered-by" || echo "no X-Powered-By header"
no X-Powered-By header

$ taskkill //PID 17896 //T //F   (stop this task's next start process)
SUCCESS: The process with PID 17896 (child process of PID 31860) has been terminated.
port 3100 not listening
~~~

### E9 git init and ignore rules

~~~text
$ test -e .git && echo ".git EXISTS - stop" || echo "no .git present"
no .git present

$ git init -b main
Initialized empty Git repository in C:/Users/HEEL PATEL/Desktop/KulVriksh/.git/
[exit=0]

$ git config --get core.autocrlf; git check-attr eol text -- package.json docs/00-ROADMAP.md
true
package.json: eol: lf
package.json: text: auto
docs/00-ROADMAP.md: eol: lf
docs/00-ROADMAP.md: text: auto

$ git check-ignore -v --no-index <sample paths>   (each line = ignored, with the matching rule)
.gitignore:6:.env	.env
.gitignore:7:.env.*	.env.local
.gitignore:7:.env.*	.env.production
.gitignore:6:.env	apps/api/.env
.gitignore:7:.env.*	apps/web/.env.local
.gitignore:2:node_modules/	node_modules/x.js
.gitignore:11:.next/	apps/web/.next/build-manifest.json
.gitignore:13:dist/	apps/api/dist/server.js
.gitignore:20:next-env.d.ts	apps/web/next-env.d.ts
.gitignore:16:*.tsbuildinfo	apps/web/tsconfig.tsbuildinfo
.gitignore:15:coverage/	coverage/lcov.info
.gitignore:23:logs/	logs/api.log
.gitignore:25:npm-debug.log*	npm-debug.log.1
.gitignore:29:.data/	.data/uploads/photo.jpg
.gitignore:30:/uploads/	uploads/a.png
.gitignore:31:/private-media/	private-media/a.mp3
.gitignore:32:/exports/	exports/tree.pdf
.gitignore:33:/backups/	backups/db.dump
.gitignore:35:apps/*/uploads/	apps/api/uploads/x.pdf
.gitignore:37:*.dump	db.dump
.gitignore:40:*.sql.gz	x.sql.gz
.gitignore:43:.vscode/	.vscode/settings.json
.gitignore:46:.DS_Store	.DS_Store
.gitignore:47:Thumbs.db	Thumbs.db
[exit=0]

$ git check-ignore -v --no-index <paths that must NOT be ignored>   (expect no output, exit 1)
.gitignore:8:!.env.example	apps/api/.env.example
[exit=0]

$ git check-ignore --no-index apps/api/.env.example; echo "[exit=$?]   (exit 1 = not ignored)"
[exit=1]   (exit 1 = not ignored)
~~~

### E10 Pre-commit staging review and secret scan

Script: `<scratchpad>/t3-stage.sh`.

~~~text
### S1 Working tree before staging (untracked, excluding ignored)
$ git status --short --untracked-files=all
?? .gitattributes
?? .gitignore
?? .nvmrc
?? README.md
?? apps/api/.env.example
?? apps/api/package.json
?? apps/api/src/app.ts
?? apps/api/src/config.ts
?? apps/api/src/server.ts
?? apps/api/tsconfig.json
?? apps/web/app/globals.css
?? apps/web/app/layout.tsx
?? apps/web/app/page.tsx
?? apps/web/eslint.config.mjs
?? apps/web/next.config.ts
?? apps/web/package.json
?? apps/web/tsconfig.json
?? docs/00-ROADMAP.md
?? docs/01-PRODUCT-FLOWS.md
?? docs/02-DATA-MODEL.md
?? docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
?? docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
?? docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
?? eslint.config.mjs
?? package-lock.json
?? package.json
?? packages/shared/package.json
?? packages/shared/src/index.ts
?? packages/shared/tsconfig.json
?? tsconfig.base.json
[exit=0]

### S2 Protected documents unchanged (compare with preflight P2)
$ md5sum docs/00-ROADMAP.md docs/01-PRODUCT-FLOWS.md docs/02-DATA-MODEL.md docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
[exit=0]

$ printf '%s\n' '17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md' '14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md' '8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md' '4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md' '2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md' '8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md' | md5sum -c -
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
[exit=0]

### S3 Stage everything that is not ignored
$ git add -A
[exit=0]

$ git status --short
A  .gitattributes
A  .gitignore
A  .nvmrc
A  README.md
A  apps/api/.env.example
A  apps/api/package.json
A  apps/api/src/app.ts
A  apps/api/src/config.ts
A  apps/api/src/server.ts
A  apps/api/tsconfig.json
A  apps/web/app/globals.css
A  apps/web/app/layout.tsx
A  apps/web/app/page.tsx
A  apps/web/eslint.config.mjs
A  apps/web/next.config.ts
A  apps/web/package.json
A  apps/web/tsconfig.json
A  docs/00-ROADMAP.md
A  docs/01-PRODUCT-FLOWS.md
A  docs/02-DATA-MODEL.md
A  docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
A  docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
A  docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
A  eslint.config.mjs
A  package-lock.json
A  package.json
A  packages/shared/package.json
A  packages/shared/src/index.ts
A  packages/shared/tsconfig.json
A  tsconfig.base.json
[exit=0]

$ git diff --cached --name-status
A	.gitattributes
A	.gitignore
A	.nvmrc
A	README.md
A	apps/api/.env.example
A	apps/api/package.json
A	apps/api/src/app.ts
A	apps/api/src/config.ts
A	apps/api/src/server.ts
A	apps/api/tsconfig.json
A	apps/web/app/globals.css
A	apps/web/app/layout.tsx
A	apps/web/app/page.tsx
A	apps/web/eslint.config.mjs
A	apps/web/next.config.ts
A	apps/web/package.json
A	apps/web/tsconfig.json
A	docs/00-ROADMAP.md
A	docs/01-PRODUCT-FLOWS.md
A	docs/02-DATA-MODEL.md
A	docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
A	docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
A	docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
A	eslint.config.mjs
A	package-lock.json
A	package.json
A	packages/shared/package.json
A	packages/shared/src/index.ts
A	packages/shared/tsconfig.json
A	tsconfig.base.json
[exit=0]

$ git diff --cached --shortstat
 30 files changed, 12952 insertions(+)
[exit=0]

### S4 Staged paths vs authorised list (any line printed = NOT authorised)
$ git diff --cached --name-only | grep -v -E '^(package\.json|package-lock\.json|\.gitignore|\.gitattributes|\.nvmrc|tsconfig\.base\.json|eslint\.config\.mjs|README\.md|apps/web/(package\.json|tsconfig\.json|next\.config\.ts|eslint\.config\.mjs|app/(layout\.tsx|page\.tsx|globals\.css))|apps/api/(package\.json|tsconfig\.json|\.env\.example|src/(app|config|server)\.ts)|packages/shared/(package\.json|tsconfig\.json|src/index\.ts)|docs/(00-ROADMAP|01-PRODUCT-FLOWS|02-DATA-MODEL|PERFORMANCE-AND-NAVIGATION-STANDARDS)\.md|docs/reports/TASK-0[12]-[A-Z-]+\.md)$' ; echo '(end of unauthorised list)'
(end of unauthorised list)
[exit=0]

### S5 No dependency, build, env or local-data paths staged (any line printed = problem)
$ git diff --cached --name-only | grep -E '(^|/)(node_modules|\.next|dist|build|out|coverage|\.data|uploads|backups|exports)/|(^|/)\.env($|\.)|next-env\.d\.ts|\.tsbuildinfo$|\.log$' | grep -v '\.env\.example$' ; echo '(end of problem list)'
(end of problem list)
[exit=0]

### S6 Secret scan of staged content (git grep --cached; any match is listed for review)
$ git grep --cached -n -I -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' -e 'gh[pousr]_[A-Za-z0-9]{36,}' -e 'github_pat_[A-Za-z0-9_]{20,}' -e 'rzp_(live|test)_[A-Za-z0-9]{8,}' -e 'sk_live_[A-Za-z0-9]{10,}' -e 'xox[baprs]-[A-Za-z0-9-]{10,}' -e '(postgres|postgresql|mysql|mongodb(\+srv)?)://[^[:space:]:@/]+:[^[:space:]@/]+@' ; echo '(end of high-confidence matches)'
(end of high-confidence matches)
[exit=0]

$ git grep --cached -n -I -i -E '(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)["'\'']?[[:space:]]*[:=][[:space:]]*["'\'']?[A-Za-z0-9/+_.-]{12,}' -- ':!package-lock.json' ; echo '(end of generic assignment matches)'
docs/02-DATA-MODEL.md:1296:SET run_lease_owner = $owner, run_lease_token = gen_random_uuid(),
(end of generic assignment matches)
[exit=0]

$ git diff --cached --name-only | grep -i -E '\.(pem|key|p12|pfx|crt|jks|keystore)$|id_rsa|id_ed25519|credentials' ; echo '(end of key-file names)'
(end of key-file names)
[exit=0]

### S7 Line endings in the index
$ git ls-files --eol | awk '{print $1}' | sort | uniq -c
     30 i/lf
[exit=0]

~~~

### E11 Lockfile reproducibility (npm ci / npm install)

~~~text
# Second install (lockfile changed: F3b)
$ md5sum package-lock.json   (before npm ci)
5e3748711112ffe8d86a6f09264202fa *package-lock.json

$ npm ci
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 405 packages, and audited 409 packages in 3m

160 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
[exit=0]

$ md5sum package-lock.json   (after npm ci)
5e3748711112ffe8d86a6f09264202fa *package-lock.json

$ npm ls --workspaces --depth=0
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
+-- @emnapi/runtime@1.11.3 extraneous
+-- @img/sharp-wasm32@0.35.5 extraneous
+-- @kulvriksh/api@0.0.0 -> .\apps\api
| +-- @kulvriksh/shared@0.0.0 deduped -> .\packages\shared
| +-- @types/express@5.0.6
| +-- @types/node@24.19.2
| `-- express@5.3.0
+-- @kulvriksh/shared@0.0.0 -> .\packages\shared
`-- @kulvriksh/web@0.0.0 -> .\apps\web
  +-- @types/node@24.19.2 deduped
  +-- @types/react-dom@19.3.0
  +-- @types/react@19.3.0
  +-- eslint-config-next@16.4.2
  +-- next@16.4.2
  +-- react-dom@19.3.1
  `-- react@19.3.1

[exit=0]

$ npm install   (second run: lockfile must not change)

added 1 package, removed 1 package, and audited 409 packages in 2s

160 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
[exit=0]

$ md5sum package-lock.json   (after second npm install)
78e2bd0478d1bbb6233ef614e44b80b3 *package-lock.json

$ npm audit
found 0 vulnerabilities
[exit=0]

# Investigation and third install
$ grep -n -A12 "node_modules/@img/sharp-wasm32\"\|node_modules/@emnapi/runtime\"" package-lock.json | head -60
944:    "node_modules/@img/sharp-wasm32": {
945-      "version": "0.35.5",
946-      "resolved": "https://registry.npmjs.org/@img/sharp-wasm32/-/sharp-wasm32-0.35.5.tgz",
947-      "integrity": "sha512-Ptsga1su4tQx+LLF1ECS9U6nz5kmrXKo6XVbtR48Ke3ZRxxgaWBu7IDtEe1quo8hiupwm6WFqxVlXaSf7IINGQ==",
948-      "license": "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
949-      "optional": true,
950-      "dependencies": {
951-        "@emnapi/runtime": "^1.11.3"
952-      },
953-      "engines": {
954-        "node": ">=20.9.0"
955-      },
956-      "funding": {
--
2066:    "node_modules/@unrs/resolver-binding-wasm32-wasi/node_modules/@emnapi/runtime": {
2067-      "version": "1.10.0",
2068-      "resolved": "https://registry.npmjs.org/@emnapi/runtime/-/runtime-1.10.0.tgz",
2069-      "integrity": "sha512-ewvYlk86xUoGI0zQRNq/mC+16R1QeDlKQy21Ki3oSYXNgLb45GV1P6A0M+/s6nyCuNDqe5VpaY84BzXGwVbwFA==",
2070-      "dev": true,
2071-      "license": "MIT",
2072-      "optional": true,
2073-      "dependencies": {
2074-        "tslib": "^2.4.0"
2075-      }
2076-    },
2077-    "node_modules/@unrs/resolver-binding-win32-arm64-msvc": {
2078-      "version": "1.12.2",

$ npm ls @img/sharp-wasm32 @emnapi/runtime --all
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
`-- @img/sharp-wasm32@0.35.5 extraneous

[exit=0]

$ npm install   (third run)

removed 1 package, and audited 408 packages in 2s

  run `npm fund` for details

found 0 vulnerabilities
[exit=0]

$ md5sum package-lock.json; diff <scratchpad>/lock-B.json package-lock.json && echo "lockfile unchanged by third install"
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
314,324d313
<     "node_modules/@emnapi/wasi-threads": {
<       "version": "1.2.1",
<       "resolved": "https://registry.npmjs.org/@emnapi/wasi-threads/-/wasi-threads-1.2.1.tgz",
<       "integrity": "sha512-uTII7OYF+/Mes/MrcIOYp5yOtSMLBWSIoLPpcgwipoiKbli6k322tcoFsxoIIxPDqW01SQGAgko4EzZi2BNv2w==",
<       "dev": true,
<       "license": "MIT",
<       "optional": true,
<       "dependencies": {
<         "tslib": "^2.4.0"
<       }
<     },

# Convergence check (runs 4-6) and platform binaries
$ npm install   (run 4)
up to date, audited 408 packages in 2s
$ md5sum package-lock.json
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ npm install   (run 5)
up to date, audited 408 packages in 3s
$ md5sum package-lock.json
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ npm install   (run 6)
up to date, audited 408 packages in 1s
$ md5sum package-lock.json
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ grep -c "\"node_modules/@next/swc-linux-x64-gnu\"\|\"node_modules/@img/sharp-linux-x64\"\|\"node_modules/@next/swc-win32-x64-msvc\"" package-lock.json
      1 "node_modules/@img/sharp-linux-x64"
      1 "node_modules/@img/sharp-win32-x64"
      1 "node_modules/@next/swc-linux-x64-gnu"
      1 "node_modules/@next/swc-win32-x64-msvc"

$ npm --version; npm view npm dist-tags.latest
11.6.2
12.2.1

# Clean npm ci from the converged lockfile, npm install, audit, full check
$ rm -rf apps/web/.next apps/api/dist apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo   (remove generated output only)
[exit=0]

$ md5sum package-lock.json   (converged lockfile)
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ npm ci
npm warn deprecated eslint@9.39.5: This version is no longer supported. Please see https://eslint.org/version-support for other options.

added 404 packages, and audited 408 packages in 3m


found 0 vulnerabilities
[exit=0]

$ md5sum package-lock.json   (after npm ci)
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ npm install   (must leave lockfile and tree unchanged)

up to date, audited 408 packages in 4s


found 0 vulnerabilities
[exit=0]

$ md5sum package-lock.json   (after npm install)
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ npm ls --workspaces --depth=0
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
+-- @img/sharp-wasm32@0.35.5 extraneous
+-- @kulvriksh/api@0.0.0 -> .\apps\api
| +-- @kulvriksh/shared@0.0.0 deduped -> .\packages\shared
| +-- @types/express@5.0.6
| +-- @types/node@24.19.2
| `-- express@5.3.0
+-- @kulvriksh/shared@0.0.0 -> .\packages\shared
`-- @kulvriksh/web@0.0.0 -> .\apps\web
  +-- @types/node@24.19.2 deduped
  +-- @types/react-dom@19.3.0
  +-- @types/react@19.3.0
  +-- eslint-config-next@16.4.2
  +-- next@16.4.2
  +-- react-dom@19.3.1
  `-- react@19.3.1

[exit=0]

$ npm ls --all 2>&1 | grep -c extraneous
2

$ npm audit
found 0 vulnerabilities
[exit=0]

$ npm run check   (typecheck + lint + build on the clean tree)

> kulvriksh-platform@0.0.0 check
> npm run typecheck && npm run lint && npm run build


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


> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 124ms

  Creating an optimized production build ...
✓ Compiled successfully in 9.8s
  Running TypeScript ...
  Finished TypeScript in 4.4s ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 1294ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]

# Extraneous package explanation
$ npm explain @img/sharp-wasm32
@img/sharp-wasm32@0.35.5 extraneous
node_modules/@img/sharp-wasm32
[exit=0]

$ npm ls --all 2>&1 | grep extraneous
+-- @img/sharp-wasm32@0.35.5 extraneous
npm error extraneous: @img/sharp-wasm32@0.35.5 C:\Users\HEEL PATEL\Desktop\KulVriksh\node_modules\@img\sharp-wasm32

$ npm ls sharp --all
kulvriksh-platform@0.0.0 C:\Users\HEEL PATEL\Desktop\KulVriksh
`-- @kulvriksh/web@0.0.0 -> .\apps\web
  `-- next@16.4.2
    `-- sharp@0.35.5

[exit=0]
~~~

### E12 Commit 1

~~~text
$ git commit -F <message>
[main (root-commit) 15dd95b] chore: initialise M0 repository and governance foundation
 30 files changed, 12952 insertions(+)
 create mode 100644 .gitattributes
 create mode 100644 .gitignore
 create mode 100644 .nvmrc
 create mode 100644 README.md
 create mode 100644 apps/api/.env.example
 create mode 100644 apps/api/package.json
 create mode 100644 apps/api/src/app.ts
 create mode 100644 apps/api/src/config.ts
 create mode 100644 apps/api/src/server.ts
 create mode 100644 apps/api/tsconfig.json
 create mode 100644 apps/web/app/globals.css
 create mode 100644 apps/web/app/layout.tsx
 create mode 100644 apps/web/app/page.tsx
 create mode 100644 apps/web/eslint.config.mjs
 create mode 100644 apps/web/next.config.ts
 create mode 100644 apps/web/package.json
 create mode 100644 apps/web/tsconfig.json
 create mode 100644 docs/00-ROADMAP.md
 create mode 100644 docs/01-PRODUCT-FLOWS.md
 create mode 100644 docs/02-DATA-MODEL.md
 create mode 100644 docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
 create mode 100644 docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
 create mode 100644 docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
 create mode 100644 eslint.config.mjs
 create mode 100644 package-lock.json
 create mode 100644 package.json
 create mode 100644 packages/shared/package.json
 create mode 100644 packages/shared/src/index.ts
 create mode 100644 packages/shared/tsconfig.json
 create mode 100644 tsconfig.base.json
[exit=0]

$ git log --stat --format="commit %H%nAuthor: %an <%ae>%nDate:   %ad%n%n%B" -1 | head -60
commit 15dd95b3fa61382ec60e8bc3120589068743866a
Author: Heel Patel <<owner-git-email>>
Date:   Sat Oct 24 03:11:28 2026 +0530

chore: initialise M0 repository and governance foundation

- npm workspaces monorepo: apps/web (Next.js 16.4.2, React 19.3.1),
  apps/api (Express 5.3.0), packages/shared (type-only contracts)
- Node.js 24 runtime pin (.nvmrc, engines); TypeScript 6.0.3; ESLint 9.39.5
- Minimal web placeholder with provisional design tokens; API health
  endpoint (no database), JSON error envelope, fail-fast config, shutdown
- .gitignore, .gitattributes (LF), README with Windows setup
- Existing specifications and TASK-01/TASK-02 reports added unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>


 .gitattributes                                     |    4 +
 .gitignore                                         |   48 +
 .nvmrc                                             |    1 +
 README.md                                          |   93 +
 apps/api/.env.example                              |   12 +
 apps/api/package.json                              |   22 +
 apps/api/src/app.ts                                |   47 +
 apps/api/src/config.ts                             |   34 +
 apps/api/src/server.ts                             |   60 +
 apps/api/tsconfig.json                             |   18 +
 apps/web/app/globals.css                           |  154 +
 apps/web/app/layout.tsx                            |   19 +
 apps/web/app/page.tsx                              |   32 +
 apps/web/eslint.config.mjs                         |    9 +
 apps/web/next.config.ts                            |    8 +
 apps/web/package.json                              |   24 +
 apps/web/tsconfig.json                             |   15 +
 docs/00-ROADMAP.md                                 |  790 +++
 docs/01-PRODUCT-FLOWS.md                           | 1639 +++++
 docs/02-DATA-MODEL.md                              | 1771 +++++
 docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md       |  143 +
 docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md |  547 ++
 .../TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md        |  530 ++
 eslint.config.mjs                                  |   11 +
 package-lock.json                                  | 6822 ++++++++++++++++++++
 package.json                                       |   32 +
 packages/shared/package.json                       |   17 +
 packages/shared/src/index.ts                       |   23 +
 packages/shared/tsconfig.json                      |   10 +
 tsconfig.base.json                                 |   17 +
 30 files changed, 12952 insertions(+)

$ git status --short --branch
## main

$ git remote -v; echo "(remotes listed above; none = no remote)"
(remotes listed above; none = no remote)
~~~

### E13 Root web scripts, the F2 fix, commit 2 and the AGENTS.md finding

~~~text
$ npm run dev:web -- --port 3101   (background; port 3000 is used by another project on this machine)

> kulvriksh-platform@0.0.0 dev:web
> npm run dev -w @kulvriksh/web --port 3101

npm warn "3101" is being parsed as a normal command line argument.
npm warn Unknown cli config "--port". This will stop working in the next major version of npm.

> @kulvriksh/web@0.0.0 dev
> next dev --port 3000 3101

Invalid project directory provided, no such directory: C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web\3101
npm error Lifecycle script `dev` failed with error:
npm error code 1
npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
npm error workspace @kulvriksh/web@0.0.0
npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
npm error command failed
npm error command C:\WINDOWS\system32\cmd.exe /d /s /c next dev --port 3000 3101

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/
000

$ npm run start:web -- --port 3102   (background, production build)

> kulvriksh-platform@0.0.0 start:web
> npm run start -w @kulvriksh/web --port 3102

npm warn "3102" is being parsed as a normal command line argument.
npm warn Unknown cli config "--port". This will stop working in the next major version of npm.

> @kulvriksh/web@0.0.0 start
> next start --port 3000 3102

Invalid project directory provided, no such directory: C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web\3102
npm error Lifecycle script `start` failed with error:
npm error code 1
npm error path C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
npm error workspace @kulvriksh/web@0.0.0
npm error location C:\Users\HEEL PATEL\Desktop\KulVriksh\apps\web
npm error command failed
npm error command C:\WINDOWS\system32\cmd.exe /d /s /c next start --port 3000 3102

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3102/
000

### After fix: web scripts no longer hard-code the port
$ PORT=3101 npm run dev:web   (background)

> kulvriksh-platform@0.0.0 dev:web
> npm run dev -w @kulvriksh/web


> @kulvriksh/web@0.0.0 dev
> next dev

▲ Next.js 16.4.2 (Turbopack)
- Local:         http://localhost:3101
- Network:       http://192.168.1.3:3101
✓ Ready in 1473ms

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3101/
200

$ PORT=3102 npm run start:web   (background, production build)

> kulvriksh-platform@0.0.0 start:web
> npm run start -w @kulvriksh/web


> @kulvriksh/web@0.0.0 start
> next start

▲ Next.js 16.4.2
- Local:         http://localhost:3102
- Network:       http://192.168.1.3:3102
✓ Ready in 679ms
✓ Running next.config.ts took 82ms

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3102/
200

$ taskkill //PID 27132 //T //F; taskkill //PID 38624 //T //F   (stop this task's dev:web and start:web trees)
SUCCESS: The process with PID 26284 (child process of PID 30880) has been terminated.
SUCCESS: The process with PID 30880 (child process of PID 28532) has been terminated.
SUCCESS: The process with PID 28532 (child process of PID 24316) has been terminated.
SUCCESS: The process with PID 24316 (child process of PID 32840) has been terminated.
SUCCESS: The process with PID 32840 (child process of PID 27132) has been terminated.
SUCCESS: The process with PID 27132 (child process of PID 34632) has been terminated.
SUCCESS: The process with PID 9640 (child process of PID 28716) has been terminated.
SUCCESS: The process with PID 28716 (child process of PID 16632) has been terminated.
SUCCESS: The process with PID 16632 (child process of PID 32048) has been terminated.
SUCCESS: The process with PID 32048 (child process of PID 38624) has been terminated.
SUCCESS: The process with PID 38624 (child process of PID 6472) has been terminated.
ports 3101/3102 not listening

# Commit 2 (F2 fix)
$ git status --short
 M README.md
 M apps/web/package.json
?? apps/web/AGENTS.md

$ git add apps/web/package.json README.md && git diff --cached
diff --git a/README.md b/README.md
index 931dd99..bc47fd4 100644
--- a/README.md
+++ b/README.md
@@ -81,7 +81,14 @@ The health endpoint only reports that the API process is running. It does **not*
 | `API_HOST` | `127.0.0.1` | |
 | `API_PORT` | `4000` | An invalid value stops the API at startup |
 
-**Web:** no environment variables are needed yet.
+**Web:** no application settings are needed yet. The web app listens on port `3000` by default. To use another port, set `PORT` before starting it:
+
+```bash
+# PowerShell:  $env:PORT=3001; npm run dev:web
+# Git Bash:    PORT=3001 npm run dev:web
+```
+
+Extra arguments after `--` are not forwarded by the root scripts, so use `PORT` (web) or `API_PORT` (API) instead.
 
 **Next.js telemetry:** Next.js sends anonymous usage telemetry by default. To opt out on your machine, set `NEXT_TELEMETRY_DISABLED=1` in your environment, or run `npx next telemetry disable` in `apps/web`. That changes only your local Next.js settings.
 
diff --git a/apps/web/package.json b/apps/web/package.json
index ec7e25c..e475740 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -4,9 +4,9 @@
   "private": true,
   "description": "Kulvriksh Next.js web app (foundation shell: placeholder page only).",
   "scripts": {
-    "dev": "next dev --port 3000",
+    "dev": "next dev",
     "build": "next build",
-    "start": "next start --port 3000",
+    "start": "next start",
     "typecheck": "next typegen && tsc --noEmit",
     "lint": "eslint ."
   },

$ md5sum package-lock.json   (unchanged: script edits do not affect the lockfile)
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json

$ git grep --cached -n -I -E -e "-----BEGIN [A-Z ]*PRIVATE KEY-----" -e "rzp_(live|test)_" -e "://[^[:space:]:@/]+:[^[:space:]@/]+@" -- apps/web/package.json README.md; echo "(end matches)"
(end matches)

$ git commit -F <message>
[main e835624] fix(web): let PORT choose the web port instead of hard-coding 3000
 2 files changed, 10 insertions(+), 3 deletions(-)
[exit=0]

$ git log --oneline
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation

$ git status --short --branch
## main
?? apps/web/AGENTS.md

# F4: generated AGENTS.md
$ git status --short
?? apps/web/AGENTS.md

$ ls -la --time-style=full-iso apps/web/AGENTS.md
-rw-r--r-- 1 HEEL PATEL 197121 679 2026-10-24 03:14:19.822630400 +0530 apps/web/AGENTS.md

$ cat apps/web/AGENTS.md
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

$ sed -n "128,133p" node_modules/next/dist/server/lib/app-info-log.js
async function syncAgentRulesForDev(dir, enabled) {
    if (!enabled) return (0, _generateagentfiles.removeAgentRulesFiles)(dir);
    if (await (0, _agentname.getAgentName)() === null) return null;
    if ((0, _generateagentfiles.hasCurrentAgentRules)(dir)) return null;
    return (0, _generateagentfiles.writeAgentFiles)(dir);
}

$ grep -n "agentRules" node_modules/next/dist/server/config-schema.js
545:        agentRules: _zod.z.boolean().optional(),
~~~

### E14 Final check and post-report verification

~~~text
# Final full check on the committed state
$ git log --oneline; git status --short --branch
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation
## main
?? apps/web/AGENTS.md

$ npm run check   (final committed state)

> kulvriksh-platform@0.0.0 check
> npm run typecheck && npm run lint && npm run build


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


> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 318ms

  Creating an optimized production build ...
✓ Compiled successfully in 764ms
  Running TypeScript ...
  Finished TypeScript in 3.2s ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 2.9s
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]

# Post-report verification
$ git ls-files
.gitattributes
.gitignore
.nvmrc
README.md
apps/api/.env.example
apps/api/package.json
apps/api/src/app.ts
apps/api/src/config.ts
apps/api/src/server.ts
apps/api/tsconfig.json
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/eslint.config.mjs
apps/web/next.config.ts
apps/web/package.json
apps/web/tsconfig.json
docs/00-ROADMAP.md
docs/01-PRODUCT-FLOWS.md
docs/02-DATA-MODEL.md
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
eslint.config.mjs
package-lock.json
package.json
packages/shared/package.json
packages/shared/src/index.ts
packages/shared/tsconfig.json
tsconfig.base.json

$ git status --short --branch --untracked-files=all
## main
?? apps/web/AGENTS.md
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md

$ git log --format="%H %s"
e83562484d0495ec836b9eb896c8f7dfefd6927c fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b3fa61382ec60e8bc3120589068743866a chore: initialise M0 repository and governance foundation

$ git remote -v; echo "(none listed = no remote)"
(none listed = no remote)

$ find . -path ./node_modules -prune -o -path ./.git -prune -o -path ./apps/web/.next -prune -o -type f -print | sort
./.gitattributes
./.gitignore
./.nvmrc
./README.md
./apps/api/.env.example
./apps/api/dist/app.js
./apps/api/dist/app.js.map
./apps/api/dist/config.js
./apps/api/dist/config.js.map
./apps/api/dist/server.js
./apps/api/dist/server.js.map
./apps/api/package.json
./apps/api/src/app.ts
./apps/api/src/config.ts
./apps/api/src/server.ts
./apps/api/tsconfig.json
./apps/web/AGENTS.md
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
./eslint.config.mjs
./package-lock.json
./package.json
./packages/shared/package.json
./packages/shared/src/index.ts
./packages/shared/tsconfig.json
./tsconfig.base.json

$ md5sum -c <preflight checksums of the six protected documents>
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
[exit=0]

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo "lockfile identical to committed version"
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
~~~
