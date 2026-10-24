# TASK-04A — Logging Security Review and M2 Readiness

| Item | Value |
|---|---|
| Task ID | TASK-04A (review and fix of TASK-04; M2 readiness checklist only) |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Status | Completed. **Nothing committed.** M2 has not been started. |
| HEAD | `e83562484d0495ec836b9eb896c8f7dfefd6927c` (unchanged) |

The report is evidence of what was done. It does not prove that the design is correct.

---

## 1. Summary

| Item | Result |
|---|---|
| Logging leak (TASK-04 risk 1) | **Confirmed, and worse than TASK-04 reported.** A demonstration against the TASK-04 logger leaked **7 of 8** secret values, through error messages, the stack header line, non-Error rejection strings and raw provider objects. The `cause` chain was also lost (E2). |
| Fix | A safe, allowlisted error representation, plus pattern-based scrubbing of every logged string (§2). After the fix: **8 of 8 absent**, and the cause chain is kept and scrubbed (E3). |
| Regression tests | **+20 tests.** The suite went from **38 to 58; all 58 pass** (E6, E7). |
| Security headers | Reviewed for a JSON-only API: **consistent, no change needed**. A test was added that error responses carry the same headers (§3). |
| `npm run check` | **PASS** on the final state: type-check, lint, **58/58** tests, both production builds (E6). An earlier full run (E5) passed with 57/57, before one more logger test was added to close a coverage gap the coverage report revealed (E4). |
| Lockfile, dependencies, protected documents | **Unchanged.** The lockfile is identical to HEAD (E4, E7, E8). No dependency lines changed (E4). All 9 protected documents pass `md5sum -c` (E4, E8). |
| M2 | **Not started.** Decision checklist for DS-1, DS-2 and AC-14 in §5. No options selected. |

---

## 2. The logging problem and the fix

### 2.1 What was wrong

In TASK-04, the logger turned any `Error` into `{ name, message, stack }` and otherwise redacted only by **key name**. Free text therefore went straight to the logs:
- **`message`** went in verbatim, for example `connect failed: postgres://app:db-pass-77@…`, `password=hunter2` or `OTP 482913 … +919876543210`.
- **`stack`** went in verbatim, and its first line repeats the message.
- **Non-Error values** were logged raw. A rejection reason string such as `token=abc123tok` was logged as is. A provider object like `{response:{data:{mobile,email}}}` had only its key names checked, so its personal data was kept.
- **`cause` chains** were dropped, losing diagnostics.

The demonstration script (E2) logged five representative cases and checked eight values. **Seven leaked.** The eighth (`sk_live_…`) was absent only because it sat in an error property that the TASK-04 logger happened not to serialise.

### 2.2 The fix

**New module: `apps/api/src/redaction.ts`**
- `serializeError(value)` produces an **allowlisted** structure:
  - `name` and `message`, both scrubbed; the message is capped at 500 characters
  - `code`, only if it matches `^[A-Za-z0-9_.-]{1,64}$` or is a number
  - `status` or `statusCode`, if a number
  - `syscall`, if it is a short lowercase word
  - `stack`, keeping **only the `at …` frames** (the header line that repeats the message is dropped), at most 15 frames, each scrubbed
  - `cause`, recursive and scrubbed, at most 3 levels
  - `errors` for an `AggregateError`, at most 5
- **Arbitrary properties are never copied**, for example `config`, `headers`, `request`, `response`, `data` or `body`, because libraries and providers attach raw request and response data to errors.
- **Non-Error values:**
  - a string becomes a scrubbed `message`
  - a primitive becomes its string form
  - an object or array becomes `[non-Error object omitted]`
- `scrubText(text)` replaces only the sensitive part of the text and keeps the context. It handles:
  - credentials embedded in URLs (`scheme://user:pass@`)
  - **all** query-string values
  - `Bearer`, `Basic`, `Digest` and `Token` credentials
  - `key=value`, `key: value` and `"key":"value"` where the key contains password, secret, token, API key, authorisation, cookie, signature, private key, OTP or session ID
  - JWTs
  - email addresses
  - OTP and PIN codes after a keyword
  - digit runs of 10–19 digits (phone and card-like numbers)
  - long tokens of 32 or more characters mixing letters and digits (API keys, hex digests). Slashes and dashes are excluded, so **file paths and UUIDs survive**.

  Text is capped at 2,000 characters.

**`apps/api/src/logger.ts`:**
- Every `Error`, wherever it appears in a log entry, goes through `serializeError`.
- Any value under `err`, `error`, `reason` or `cause` goes through `serializeError` even when it is not an `Error`, so a rejection reason object can never be dumped.
- Every string value goes through `scrubText`.
- The existing key-name redaction is unchanged.

**Not changed:** `errors.ts`, `server.ts` and `middleware.ts` already pass errors to the logger under `err`, so they now get the safe form without edits. Responses are unchanged: still generic, with the request ID.

### 2.3 Diagnostics that are kept

After the fix (E3), a log entry still shows:
- the error name, such as `SyntaxError`
- the non-sensitive parts of the message (`connect failed`, the host and database name, `rejected for`)
- system error `code` and `syscall`, for example `EADDRINUSE` / `listen`, which the server test asserts
- the HTTP status
- stack frames with file:line:column
- the inner `cause`, scrubbed
- the request ID

### 2.4 Limitations (honest residual risk)

1. **Pattern-based scrubbing is a second line of defence.** It cannot recognise every secret, for example a short password in prose with no keyword ("pw is hunter2"), or a base64 token containing `/`, which is split into short pieces. Code review must still keep secrets out of error messages.
2. **Phone numbers with spaces** (`+91 98765 43210`) are not caught; only contiguous runs of 10–19 digits are.
3. **Over-redaction is deliberate:** all query values, any 10+ digit run (including some timestamps or IDs) and long mixed tokens (including SHA-256 digests) are masked. Fields whose names contain `token` or `otp` remain fully redacted (TASK-04 risk 2).
4. **Stack frames still contain file paths** from the server, for example `C:/Users/<name>/…` in development. They are not credentials, but they reveal the deployment layout, so log access must be restricted (M12).
5. **Personal data in path segments** of the access log is not scrubbed unless it matches a pattern. Future routes must avoid personal data in paths (TASK-04 risk 6).

---

## 3. Security headers review (JSON-only API)

| Header | Value | Assessment |
|---|---|---|
| `Cache-Control` | `no-store` | **Correct.** API responses will carry private data; nothing should be cached by shared or browser caches. |
| `X-Content-Type-Options` | `nosniff` | **Correct and important:** stops a browser treating JSON as HTML or script |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | **Correct for JSON.** If a response were ever rendered as a document, nothing would load and it could not be framed. |
| `X-Frame-Options` | `DENY` | Redundant with `frame-ancestors`, but harmless for older browsers. Keep. |
| `Referrer-Policy` | `no-referrer` | Correct |
| `Cross-Origin-Resource-Policy` | `same-origin` | Correct for the **proposed** same-origin routing. **Must be revisited if AC-14 chooses a separate API origin** (it would then need `same-site` or explicit handling; §5.3). |
| `Content-Type` | `application/json; charset=utf-8` | Set on success **and** error responses. The new test checks 404s. |
| `X-Powered-By` | absent | Correct |

**Deliberately not added, with reasons:**
- **HSTS:** set at the HTTPS reverse proxy (M12)
- **COOP, COEP, Permissions-Policy:** they govern documents, not JSON responses
- **`X-XSS-Protection`:** deprecated, and should not be set
- **`X-Permitted-Cross-Domain-Policies`:** a legacy Flash/Acrobat header with negligible value here; optional if the reviewer wants parity with common middleware defaults
- **CORS headers:** depend on AC-14

**ETag:** Express adds weak ETags to JSON responses. With `no-store` they are harmless. Disabling them is optional and not done.

**Conclusion:** consistent, no change needed. **Added:** a test that a 404 carries exactly the same security headers and JSON content type as a 200 (part of the 58 passing tests in E6).

---

## 4. Files changed in TASK-04A

| File | Change |
|---|---|
| `apps/api/src/redaction.ts` | **New:** `scrubText`, `serializeError`, `SafeError` type, `REDACTED` |
| `apps/api/src/redaction.test.ts` | **New:** 15 tests: 5 secret-bearing scrub cases, unchanged ordinary text, length cap, property allowlist, stack header dropped, frame limit, cause depth, scrubbed cause, AggregateError, non-Error values, unsafe `code` |
| `apps/api/src/logger.ts` | Uses `serializeError` for errors and error-keyed values, and `scrubText` for strings. `REDACTED` is now re-exported from `redaction.ts`. |
| `apps/api/src/logger.test.ts` | **+3 tests:** secrets in message, cause and properties; non-Error reason and error values; Errors under other keys and inside arrays; scrubbing of ordinary string fields (the first and third cover two cases each) |
| `apps/api/src/errors.test.ts` | The 500-log assertion changed: the message is now scrubbed, and `hunter2` must be absent from **every** log line. **+1 test:** a body-parser-style 400 carrying a raw request body is logged without the body. |
| `apps/api/src/app.test.ts` | **+1 test:** error responses carry the same security headers |
| `apps/api/src/server.test.ts` | The F1 test now also asserts the safe error form keeps `code: EADDRINUSE` and `syscall: listen` |

**Not changed:**
- `errors.ts`, `server.ts`, `middleware.ts`, `app.ts`, `config.ts` (checksums in E6)
- package manifests' dependencies and the lockfile
- the web app
- product flows, the data model, Prisma, authentication and payments
- all protected documents
- the TASK-03A and TASK-04 changes, other than the files listed above

**Test count:**
- TASK-04 had 38 tests. TASK-04A adds 20: 15 in redaction, 3 in the logger, 1 in errors and 1 in app. The total is **58**.
- `server.test.ts` gained assertions but no new test.

---

## 5. M2 readiness — decision checklist (no options selected)

These need **owner decisions** before M2 adds dependencies or connects the web app to the API. The options below are viable approaches. Specific package versions are **not** verified here; they would be checked against the registry when a choice is made.

### 5.1 DS-1 — Styling approach

| Option | Advantages | Disadvantages |
|---|---|---|
| **A. CSS Modules + CSS custom properties** (built into Next.js; the provisional tokens already exist in `globals.css`) | **No new dependency.** Works with Server Components. Scoped styles. Tokens already in place. No runtime cost. | More hand-written CSS. Consistency relies on conventions and review. No utility shortcuts. |
| **B. Utility-first CSS** (e.g. Tailwind CSS) | Fast, consistent spacing and colour from a central config. No runtime cost. Unused styles are removed. Large ecosystem. | **New dependencies** (the framework and its build integration). Verbose markup. Its config must be kept in sync with the existing CSS variables. Team learning curve. |
| **C. Zero-runtime CSS-in-TypeScript** (e.g. vanilla-extract, Panda CSS) | Type-safe tokens and styles. No runtime cost. | **New dependencies plus build integration.** Compatibility with Next.js 16's default Turbopack bundler **must be verified** before choosing. A smaller ecosystem. |
| **D. Runtime CSS-in-JS** (e.g. styled-components, Emotion) | Familiar to many React developers | **Conflicts with the performance standard:** it needs Client Components or special server-rendering setup, and adds client JavaScript. Not recommended. Listed only for completeness. |

**Decision questions:**
- Is a new styling dependency acceptable under the change-control and dependency rules?
- Which approach does the team already know?
- How should design tokens be shared with DS-2 components?
- How much rework is acceptable when the homepage design (AC-3) is chosen?

### 5.2 DS-2 — Accessible interactive primitives

| Option | Advantages | Disadvantages |
|---|---|---|
| **A. Native HTML plus small hand-built components** (`<dialog>`, `<details>`, native form controls) | **No dependency.** Least client JavaScript. Full control. | **Higher accessibility risk** for complex widgets: combobox/autocomplete (member search), menus, tabs, date input (R17), toasts. More test effort. |
| **B. Unstyled primitives library** (e.g. Radix UI Primitives) | Well-tested keyboard and ARIA behaviour for dialogs, menus, popovers and tabs. Unstyled, so it fits DS-1. Per-component packages. | **New dependencies.** The components are Client Components, adding client JavaScript where used. Combobox and date picker coverage must be checked. |
| **C. Hooks or components with strong i18n and accessibility** (e.g. React Aria / React Aria Components) | Very thorough accessibility. **Locale, RTL and date handling**, relevant if R3 brings Indic languages. Wide widget coverage, including combobox and date pickers. | **New dependency**, and generally a larger client footprint. API learning curve. |
| **D. Other headless libraries** (e.g. Ark UI, Base UI) | Similar benefits to B and C | Maturity, maintenance and licence need evaluating at decision time |

**Decision questions:**
- Which complex widgets does M2–M9 actually need? At least: dialog, menu, tabs, combobox for search, toast and possibly a date input.
- Does R3 (languages) require locale-aware components?
- What client-JavaScript budget is acceptable under the performance standard?
- Is a styled component library ruled out? (It would conflict with DS-1 and the provisional tokens.)

### 5.3 AC-14 — Request routing between Next.js and Express

| Option | Advantages | Disadvantages |
|---|---|---|
| **A. Same origin, path-based** (NGINX sends `/api/*` to Express and everything else to Next.js; locally, Next.js `rewrites` or a dev proxy to Express) | First-party HttpOnly cookies with `SameSite=Lax/Strict`. **No CORS.** CSP `connect-src 'self'`. Matches the current `CORP same-origin` and the roadmap's proposed default. Simple for the browser. | Dev rewrites and production NGINX differ, so they must be kept equivalent. **Server Components calling the API** need an internal URL (e.g. `127.0.0.1:4000`) and must **forward the session cookie** and request ID explicitly. Needs `trust proxy` and request-ID propagation designed with NGINX. |
| **B. Separate API origin** (e.g. an `api.` subdomain, with CORS) | Clear separation. Independent deployment and scaling later. | CORS configuration with credentials. Cookie `Domain` and `SameSite` design. **More CSRF considerations.** CORP must change. Extra DNS and TLS. More moving parts on one VPS. |
| **C. Next.js as backend-for-frontend** (the browser only calls Next.js route handlers or server actions, which call Express server-side) | A single public surface; Express is not exposed to browsers | **An extra hop on the 1 vCPU VPS.** A duplicated route layer. **Risk of business logic drifting into Next.js**, against the roadmap rule that Express is authoritative. Uploads and downloads (M7) pass through two processes. **Razorpay webhooks must still reach Express directly.** |

**Decision questions:**
- How do sessions and cookies work for both browser calls and server-rendered pages (M4)?
- How is CSRF protected?
- How do large uploads and downloads stream (M7)?
- What is the webhook path?
- How is the client IP derived behind the proxy (`trust proxy`), which rate limiting needs?
- Can the same topology be reproduced locally?
- What is the CPU budget on the VPS?

**Dependent items that AC-14 settles:** `trust proxy`, CORS and CORP, acceptance of a proxy-supplied request ID, CSP `connect-src`, and cookie attributes.

---

## 6. Final Git status (E8)

- **Tracked modifications:** the same 9 files as at the end of TASK-04, including TASK-03A's `apps/web/next.config.ts`. TASK-04A edited none of the tracked files: all its changes are in files that were already untracked or are new.
- **Untracked:** all TASK-04 files, plus:
  - **new:** `apps/api/src/redaction.ts`, `apps/api/src/redaction.test.ts`, this report
  - **modified (still untracked):** `logger.ts`, `logger.test.ts`, `errors.test.ts`, `app.test.ts`, `server.test.ts`
- **Unchanged:** HEAD, the lockfile and the protected documents.

---

## 7. Next approval required

1. **Review the logging fix** (§2), including the residual risks (§2.4).
2. **Accept the header review** (§3), or ask for the optional `X-Permitted-Cross-Domain-Policies` or ETag change.
3. **Owner decisions DS-1, DS-2 and AC-14** (§5). They are needed before M2 adds dependencies or any page calls the API.
4. **Commit plan** (no commits made yet): TASK-03A, TASK-04 and TASK-04A, in that order, or as the reviewer prefers.
5. **Still outstanding:**
   - the TASK-01 review
   - the CP2 technical review
   - the production PostgreSQL version and the local install
   - the GitHub remote
   - real-signal shutdown testing on Linux

**I have not started M2, built UI pages, connected the web app to the API, or committed anything.**

---

## Appendix — Evidence (raw command output)

Run in Git Bash on Windows from the repository root. `<scratchpad>` is the agent's session scratchpad, outside the repository. Embedded with Node.js, which preserves bytes. **E4 contains one failed command**: a comparison where I left a literal `<scratchpad>` placeholder, so it compared against nothing. The corrected comparison is the first block of E6. In E2 and E3, lines longer than 400 characters were cut **by the demonstration script itself, for display**. The leak verdicts at the end of each block were computed on the full, uncut output.

### E1 Baseline (Git, checksums, current error logging code)

~~~text
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

$ git rev-parse HEAD
e83562484d0495ec836b9eb896c8f7dfefd6927c
[exit=0]

$ md5sum docs/*.md docs/reports/*.md package-lock.json apps/api/src/*.ts apps/api/src/testing/*.ts
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
f99d805210481297c663be15200ab902 *docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
61a6b83897eced82d8982f4da79a355b *apps/api/src/app.test.ts
5df42c2f7f0f54891cece12a2335c188 *apps/api/src/app.ts
efd84bb2a3b36fc8913505f804343637 *apps/api/src/config.test.ts
c3b9ac0f843e89f9615a86f8ac6d6454 *apps/api/src/config.ts
bad84bc9b1fe5d56d8344c33bf606493 *apps/api/src/errors.test.ts
fde680946aa4b17ae6dceaa4bcf6ba1c *apps/api/src/errors.ts
a54cd579fe714ec636b7d9a79c7742d5 *apps/api/src/logger.test.ts
90ff432a4d83ee078f92ffd48ea23668 *apps/api/src/logger.ts
2000979ffaa9678e8c5f5e1c3219e564 *apps/api/src/middleware.ts
d5a36df7d518ce12244352fea82e3ec0 *apps/api/src/server.test.ts
3d111ea9733b7f86e956db8c81699adb *apps/api/src/server.ts
390e19bc3025cc62dc7e719b143f2f9a *apps/api/src/testing/helpers.ts
[exit=0]

$ grep -n 'err' apps/api/src/server.ts apps/api/src/errors.ts | grep -v '^.*://' 
apps/api/src/server.ts:11:  } catch (err) {
apps/api/src/server.ts:12:    if (err instanceof ConfigError) {
apps/api/src/server.ts:13:      createLogger({ level: 'error' }).error('configuration error', { issues: err.issues });
apps/api/src/server.ts:16:    throw err;
apps/api/src/server.ts:27:server.on('error', (err) => {
apps/api/src/server.ts:28:  logger.error('server error', { err });
apps/api/src/server.ts:46:    logger.error('shutdown timed out, exiting');
apps/api/src/server.ts:51:  server.close((err) => {
apps/api/src/server.ts:52:    if (err) {
apps/api/src/server.ts:53:      logger.error('error while closing', { err });
apps/api/src/server.ts:65:process.on('uncaughtException', (err) => {
apps/api/src/server.ts:66:  logger.error('uncaught exception', { err });
apps/api/src/server.ts:70:  logger.error('unhandled promise rejection', { err: reason });
apps/api/src/errors.ts:14:export function errorBody(code: string, message: string, requestId: string): ApiErrorBody {
apps/api/src/errors.ts:15:  return { error: { code, message, requestId } };
apps/api/src/errors.ts:18:function statusOf(err: unknown): number | undefined {
apps/api/src/errors.ts:19:  if (typeof err !== 'object' || err === null) {
apps/api/src/errors.ts:22:  const candidate = 'status' in err ? err.status : 'statusCode' in err ? err.statusCode : undefined;
apps/api/src/errors.ts:27:  res.status(404).json(errorBody('NOT_FOUND', 'Resource not found', getRequestId(res)));
apps/api/src/errors.ts:30:/** Final error handler. Clients get a generic message and the request ID; details go only to the log. */
apps/api/src/errors.ts:32:  // Express recognises error handlers by their four parameters, so `next` must stay.
apps/api/src/errors.ts:33:  return (err: unknown, _req, res, next) => {
apps/api/src/errors.ts:35:      next(err);
apps/api/src/errors.ts:39:    const status = statusOf(err);
apps/api/src/errors.ts:41:      logger.warn('client error', { requestId, status, err });
apps/api/src/errors.ts:44:        .json(errorBody(CLIENT_ERROR_CODES[status] ?? 'CLIENT_ERROR', 'The request could not be processed', requestId));
apps/api/src/errors.ts:47:    logger.error('unhandled error', { requestId, err });
apps/api/src/errors.ts:48:    res.status(500).json(errorBody('INTERNAL_ERROR', 'Internal server error', requestId));
[exit=0]

$ grep -n 'instanceof Error' -A3 apps/api/src/logger.ts
73:    if (value instanceof Error) {
74-      return sanitiseObject({ name: value.name, message: value.message, stack: value.stack }, depth, seen);
75-    }
76-    if (Array.isArray(value)) {
[exit=0]

~~~

### E2 Leak demonstration BEFORE the fix (script: <scratchpad>/t4a-demo.mjs)

~~~text
$ node <scratchpad>/t4a-demo.mjs ./apps/api/src/logger.ts   (BEFORE the fix)
{"time":"2026-10-23T23:02:37.383Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://app:db-pass-77@10.0.0.5/kul?sslmode=require password=hunter2 token=abc123tok","stack":"Error: connect failed: postgres://app:db-pass-77@10.0.0.5/kul?sslmode=require password=hunter2 token=abc123tok\n    at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp/claude/c--Users-HEEL-PATE …[cut at 400 chars for display]
{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"e2","err":{"name":"Error","message":"OTP 482913 rejected for +919876543210 (jane@example.com), Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl","stack":"Error: OTP 482913 rejected for +919876543210 (jane@example.com), Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl\n    at file:///C:/Users/HEE …[cut at 400 chars for display]
{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"e3","err":{"name":"Error","message":"outer wrapper","stack":"Error: outer wrapper\n    at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/t4a-demo.mjs:9:12"}}
{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"rejection string","err":"rejected with token=abc123tok"}
{"time":"2026-10-23T23:02:37.407Z","level":"error","msg":"provider object","err":{"response":{"data":{"mobile":"9876543210","email":"jane@example.com"}}}}
---
LEAKED  hunter2
absent  sk_live_51Hx
LEAKED  eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl
LEAKED  482913
LEAKED  9876543210
LEAKED  jane@example.com
LEAKED  abc123tok
LEAKED  db-pass-77
cause chain logged: false
[exit=0]
~~~

### E3 Leak demonstration AFTER the fix (same script)

~~~text
$ node <scratchpad>/t4a-demo.mjs ./apps/api/src/logger.ts   (AFTER the fix)
{"time":"2026-10-23T23:03:26.786Z","level":"error","msg":"e1","err":{"name":"Error","message":"connect failed: postgres://[REDACTED]@10.0.0.5/kul?sslmode=[REDACTED] password=[REDACTED] token=[REDACTED]","stack":"at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/t4a-demo.mjs:6:12"}}
{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"e2","err":{"name":"Error","message":"OTP [REDACTED] rejected for [REDACTED_NUMBER] ([REDACTED_EMAIL]), Authorization: [REDACTED] [REDACTED]","stack":"at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/t4a-demo.mjs:7:12"}}
{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"e3","err":{"name":"Error","message":"outer wrapper","stack":"at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/t4a-demo.mjs:9:12","cause":{"name":"Error","message":"inner: secret=[REDACTED]","stack":"at file:///C:/Users/HEELPA%7E1/AppData/Local/Temp …[cut at 400 chars for display]
{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"rejection string","err":{"name":"NonError","message":"rejected with token=[REDACTED]"}}
{"time":"2026-10-23T23:03:26.790Z","level":"error","msg":"provider object","err":{"name":"NonError","message":"[non-Error object omitted]"}}
---
absent  hunter2
absent  sk_live_51Hx
absent  eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl
absent  482913
absent  9876543210
absent  jane@example.com
absent  abc123tok
absent  db-pass-77
cause chain logged: true
[exit=0]
~~~

### E4 Coverage (57 tests), dist, lockfile, dependency lines, protected checksums; last command FAILED (literal placeholder)

~~~text
$ cd apps/api && node --test --experimental-test-coverage --test-coverage-exclude='src/**/*.test.ts' --test-coverage-exclude='src/testing/**' 'src/**/*.test.ts' 2>&1 | sed -n '/start of coverage report/,/end of coverage report/p'
ℹ start of coverage report
ℹ --------------------------------------------------------------------------
ℹ file           | line % | branch % | funcs % | uncovered lines
ℹ --------------------------------------------------------------------------
ℹ src            |        |          |         | 
ℹ  app.ts        | 100.00 |   100.00 |  100.00 | 
ℹ  config.ts     | 100.00 |   100.00 |  100.00 | 
ℹ  errors.ts     |  94.00 |    95.24 |  100.00 | 35-37
ℹ  logger.ts     |  97.14 |    94.12 |  100.00 | 82-84 90
ℹ  middleware.ts |  97.10 |    78.57 |  100.00 | 64-65
ℹ  redaction.ts  | 100.00 |    95.12 |  100.00 | 
ℹ  server.ts     |  59.72 |    75.00 |   25.00 | 16-17 33 38-59 66-67 70-71
ℹ --------------------------------------------------------------------------
ℹ all files      |  93.39 |    93.71 |   88.24 | 
ℹ --------------------------------------------------------------------------
ℹ end of coverage report
[exit=0]

$ find apps/api/dist -type f -name '*.js' | sort
apps/api/dist/app.js
apps/api/dist/config.js
apps/api/dist/errors.js
apps/api/dist/logger.js
apps/api/dist/middleware.js
apps/api/dist/redaction.js
apps/api/dist/server.js
[exit=0]

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo 'lockfile identical to committed version'
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ git diff -- package.json apps/api/package.json apps/web/package.json packages/shared/package.json | grep -E '^[+-] ' | grep -i -E 'dependencies|"[@a-z][^"]*": "[0-9^~]' ; echo '(no dependency lines changed if empty)'
(no dependency lines changed if empty)
[exit=0]

$ printf '%s\n' '17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md' '14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md' '8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md' '4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md' '2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md' '8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md' 'ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md' '4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md' 'f99d805210481297c663be15200ab902 *docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md' | md5sum -c -
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: OK
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: OK
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: OK
[exit=0]

$ md5sum apps/api/src/*.ts | diff <(grep -E 'apps/api/src/[a-z.]+\.ts <scratchpad>/t4a-pre.out) - ; echo '(files above: < = baseline, > = now)'
bash: line 1: scratchpad: No such file or directory
0a1,13
> d7ad83a9c31102924baa4c2401bf6eab *apps/api/src/app.test.ts
> 5df42c2f7f0f54891cece12a2335c188 *apps/api/src/app.ts
> efd84bb2a3b36fc8913505f804343637 *apps/api/src/config.test.ts
> c3b9ac0f843e89f9615a86f8ac6d6454 *apps/api/src/config.ts
> da9651e8bb6be26adeed8bbe588117b6 *apps/api/src/errors.test.ts
> fde680946aa4b17ae6dceaa4bcf6ba1c *apps/api/src/errors.ts
> 863aa897d3a19e77ca351c188b506eb3 *apps/api/src/logger.test.ts
> 296f693bec3e76ee941a007879043ce5 *apps/api/src/logger.ts
> 2000979ffaa9678e8c5f5e1c3219e564 *apps/api/src/middleware.ts
> 659e9fd2f8ad4055595c2b363ab34623 *apps/api/src/redaction.test.ts
> 1701804d2d6d60e30cfbba84ccaa83b8 *apps/api/src/redaction.ts
> 8927ce3975776ba45b34e2b05bbbd3c4 *apps/api/src/server.test.ts
> 3d111ea9733b7f86e956db8c81699adb *apps/api/src/server.ts
(files above: < = baseline, > = now)
[exit=0]

~~~

### E5 First full npm run check (57 tests)

~~~text
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

✔ GET /health returns 200 and reports the database as not configured (35.183ms)
✔ responses carry security headers and are not cacheable (8.8363ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (8.3761ms)
✔ unknown routes return the JSON error envelope with the request ID (4.7679ms)
✔ error responses carry the same security headers as successful ones (8.8603ms)
✔ unsupported methods on known paths are not found (9.0821ms)
✔ the access log records path and status but never the query string (67.1928ms)
✔ health checks are logged at debug level only (61.5415ms)
✔ uses safe defaults when nothing is configured (1.4317ms)
✔ accepts valid explicit values (whitespace trimmed) (0.1867ms)
✔ treats empty values as unset (0.0955ms)
✔ rejects non-integer API_PORT "abc" (0.5092ms)
✔ rejects non-integer API_PORT "12.5" (0.1401ms)
✔ rejects non-integer API_PORT "-1" (0.132ms)
✔ rejects non-integer API_PORT "4000x" (0.0713ms)
✔ rejects out-of-range API_PORT 0 (0.9321ms)
✔ rejects out-of-range API_PORT 65536 (0.1406ms)
✔ rejects out-of-range API_PORT 70000 (0.1587ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.225ms)
✔ rejects an unknown LOG_LEVEL (0.1507ms)
✔ reports every problem at once (0.4071ms)
✔ unexpected errors return a generic 500 without internal details (36.8242ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (9.1351ms)
✔ client errors carrying a raw request body are logged without the body (5.6583ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (5.1829ms)
✔ client errors keep their status with a generic message (19.1352ms)
✔ client errors are logged at warn, not error (4.7717ms)
✔ non-Error values passed to next() are treated as 500 (3.4385ms)
✔ writes one JSON object per line with time, level, msg and fields (4.4924ms)
✔ filters below the configured level (0.3107ms)
✔ silent emits nothing (0.1349ms)
✔ passes the level to the sink so warn/error can go to stderr (0.1148ms)
✔ redacts sensitive keys at any depth, case-insensitively (1.6597ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.1289ms)
✔ ordinary string fields are scrubbed too (0.2227ms)
✔ serialises errors with name, message and stack (0.4036ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.4299ms)
✔ fields cannot overwrite time, level or msg (0.3415ms)
✔ child loggers add bindings, and call fields take precedence (0.3004ms)
✔ scrubText removes database URL credentials and query values (2.0942ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.2696ms)
✔ scrubText removes Authorization header values and JWTs (0.1358ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.1169ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.1934ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.2342ms)
✔ scrubText caps very long text (9.8072ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.5347ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.4199ms)
✔ serializeError limits stack frames (0.3183ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.4357ms)
✔ serializeError includes scrubbed cause messages (0.2865ms)
✔ serializeError summarises AggregateError members (at most 5) (0.6701ms)
✔ serializeError handles non-Error values without dumping objects (0.1665ms)
✔ serializeError rejects unsafe code values (0.1927ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (262.7845ms)
✔ starts, logs a structured "listening" line and serves /health (245.7685ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (298.1237ms)
ℹ tests 57
ℹ suites 0
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 997.5391

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 25ms

  Creating an optimized production build ...
✓ Compiled successfully in 469ms
  Running TypeScript ...
  Finished TypeScript in 1561ms ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 730ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]
~~~

### E6 Corrected file comparison and final full npm run check (58 tests)

~~~text
### Corrected file-change comparison (the previous attempt used a literal <scratchpad> placeholder and failed)
$ diff <(grep -E 'apps/api/src/[a-z.]+\.ts <scratchpad>/t4a-pre.out) <(md5sum apps/api/src/*.ts)   (< = TASK-04A baseline, > = now)
1,12c1
<  M apps/api/src/app.ts
<  M apps/api/src/config.ts
<  M apps/api/src/server.ts
< ?? apps/api/src/app.test.ts
< ?? apps/api/src/config.test.ts
< ?? apps/api/src/errors.test.ts
< ?? apps/api/src/errors.ts
< ?? apps/api/src/logger.test.ts
< ?? apps/api/src/logger.ts
< ?? apps/api/src/middleware.ts
< ?? apps/api/src/server.test.ts
< 61a6b83897eced82d8982f4da79a355b *apps/api/src/app.test.ts
---
> d7ad83a9c31102924baa4c2401bf6eab *apps/api/src/app.test.ts
16c5
< bad84bc9b1fe5d56d8344c33bf606493 *apps/api/src/errors.test.ts
---
> da9651e8bb6be26adeed8bbe588117b6 *apps/api/src/errors.test.ts
18,19c7,8
< a54cd579fe714ec636b7d9a79c7742d5 *apps/api/src/logger.test.ts
< 90ff432a4d83ee078f92ffd48ea23668 *apps/api/src/logger.ts
---
> a5b3bc082916dd3f9df724c5537699cc *apps/api/src/logger.test.ts
> 296f693bec3e76ee941a007879043ce5 *apps/api/src/logger.ts
21c10,12
< d5a36df7d518ce12244352fea82e3ec0 *apps/api/src/server.test.ts
---
> 659e9fd2f8ad4055595c2b363ab34623 *apps/api/src/redaction.test.ts
> 1701804d2d6d60e30cfbba84ccaa83b8 *apps/api/src/redaction.ts
> 8927ce3975776ba45b34e2b05bbbd3c4 *apps/api/src/server.test.ts
23d13
< $ grep -n 'instanceof Error' -A3 apps/api/src/logger.ts
[exit=1] (1 = differences listed)

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

✔ GET /health returns 200 and reports the database as not configured (37.0491ms)
✔ responses carry security headers and are not cacheable (9.3809ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (11.4117ms)
✔ unknown routes return the JSON error envelope with the request ID (4.8696ms)
✔ error responses carry the same security headers as successful ones (9.5466ms)
✔ unsupported methods on known paths are not found (6.0393ms)
✔ the access log records path and status but never the query string (55.3344ms)
✔ health checks are logged at debug level only (62.6029ms)
✔ uses safe defaults when nothing is configured (2.1053ms)
✔ accepts valid explicit values (whitespace trimmed) (1.3793ms)
✔ treats empty values as unset (0.2578ms)
✔ rejects non-integer API_PORT "abc" (1.1665ms)
✔ rejects non-integer API_PORT "12.5" (0.2729ms)
✔ rejects non-integer API_PORT "-1" (0.2528ms)
✔ rejects non-integer API_PORT "4000x" (1.4177ms)
✔ rejects out-of-range API_PORT 0 (0.2902ms)
✔ rejects out-of-range API_PORT 65536 (0.2212ms)
✔ rejects out-of-range API_PORT 70000 (0.2424ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.2798ms)
✔ rejects an unknown LOG_LEVEL (0.1781ms)
✔ reports every problem at once (0.2739ms)
✔ unexpected errors return a generic 500 without internal details (28.6827ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (5.6808ms)
✔ client errors carrying a raw request body are logged without the body (5.2475ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (8.7222ms)
✔ client errors keep their status with a generic message (19.8956ms)
✔ client errors are logged at warn, not error (4.2924ms)
✔ non-Error values passed to next() are treated as 500 (3.4183ms)
✔ writes one JSON object per line with time, level, msg and fields (4.293ms)
✔ filters below the configured level (0.3529ms)
✔ silent emits nothing (0.2152ms)
✔ passes the level to the sink so warn/error can go to stderr (0.2129ms)
✔ redacts sensitive keys at any depth, case-insensitively (2.2676ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.5272ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.7007ms)
✔ ordinary string fields are scrubbed too (0.2475ms)
✔ serialises errors with name, message and stack (0.4072ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.5163ms)
✔ fields cannot overwrite time, level or msg (0.2368ms)
✔ child loggers add bindings, and call fields take precedence (0.1908ms)
✔ scrubText removes database URL credentials and query values (1.6901ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.2691ms)
✔ scrubText removes Authorization header values and JWTs (0.1597ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.1385ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (1.3447ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.4233ms)
✔ scrubText caps very long text (12.1464ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.2004ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.3546ms)
✔ serializeError limits stack frames (0.2945ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.4838ms)
✔ serializeError includes scrubbed cause messages (0.2694ms)
✔ serializeError summarises AggregateError members (at most 5) (0.9462ms)
✔ serializeError handles non-Error values without dumping objects (0.1733ms)
✔ serializeError rejects unsafe code values (0.2589ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (309.1224ms)
✔ starts, logs a structured "listening" line and serves /health (555.6291ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (411.1042ms)
ℹ tests 58
ℹ suites 0
ℹ pass 58
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1572.57

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 64ms

  Creating an optimized production build ...
✓ Compiled successfully in 476ms
  Running TypeScript ...
  Finished TypeScript in 1229ms ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 648ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]

~~~

### E7 Final coverage (58 tests) and lockfile

~~~text
$ cd apps/api && node --test --experimental-test-coverage --test-coverage-exclude='src/**/*.test.ts' --test-coverage-exclude='src/testing/**' 'src/**/*.test.ts' 2>&1 | sed -n '/ℹ tests/,/ℹ fail/p;/start of coverage report/,/end of coverage report/p'
ℹ tests 58
ℹ suites 0
ℹ pass 58
ℹ fail 0
ℹ start of coverage report
ℹ --------------------------------------------------------------------------
ℹ file           | line % | branch % | funcs % | uncovered lines
ℹ --------------------------------------------------------------------------
ℹ src            |        |          |         | 
ℹ  app.ts        | 100.00 |   100.00 |  100.00 | 
ℹ  config.ts     | 100.00 |   100.00 |  100.00 | 
ℹ  errors.ts     |  94.00 |    95.24 |  100.00 | 35-37
ℹ  logger.ts     |  99.29 |    96.15 |  100.00 | 90
ℹ  middleware.ts |  97.10 |    78.57 |  100.00 | 64-65
ℹ  redaction.ts  | 100.00 |    95.12 |  100.00 | 
ℹ  server.ts     |  59.72 |    75.00 |   25.00 | 16-17 33 38-59 66-67 70-71
ℹ --------------------------------------------------------------------------
ℹ all files      |  93.91 |    94.38 |   88.24 | 
ℹ --------------------------------------------------------------------------
ℹ end of coverage report
[exit=0]

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo 'lockfile identical to committed version'
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

~~~

### E8 Final Git status, lockfile, protected checksums, secret scan

~~~text
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
?? apps/api/src/redaction.test.ts
?? apps/api/src/redaction.ts
?? apps/api/src/server.test.ts
?? apps/api/src/testing/helpers.ts
?? apps/api/tsconfig.build.json
?? docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
?? docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
?? docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
?? docs/reports/TASK-04A-LOGGING-REVIEW.md
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

$ git rev-parse HEAD; git log --oneline
e83562484d0495ec836b9eb896c8f7dfefd6927c
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation
[exit=0]

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo 'lockfile identical to committed version'
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ printf '%s\n' '17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md' '14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md' '8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md' '4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md' '2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md' '8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md' 'ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md' '4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md' 'f99d805210481297c663be15200ab902 *docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md' | md5sum -c -
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: OK
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: OK
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: OK
[exit=0]

$ git grep -n -I -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' -e 'rzp_live_[A-Za-z0-9]{8,}' --untracked -- apps packages; echo '(end high-confidence secret matches)'
(end high-confidence secret matches)
[exit=0]

~~~

### Demonstration script source (<scratchpad>/t4a-demo.mjs)

~~~text
// Demonstration (scratchpad only): what the logger writes for secret-bearing errors.
const { createLogger } = await import(process.argv[2]);
const lines = [];
const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
const secrets = ['hunter2', 'sk_live_51Hx', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl', '482913', '9876543210', 'jane@example.com', 'abc123tok', 'db-pass-77'];
const e1 = new Error('connect failed: postgres://app:db-pass-77@10.0.0.5/kul?sslmode=require password=hunter2 token=abc123tok');
const e2 = new Error('OTP 482913 rejected for +919876543210 (jane@example.com), Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl');
Object.assign(e2, { config: { headers: { 'X-Api-Key': 'sk_live_51Hx' } }, response: { data: { mobile: '9876543210' } }, body: '{"otp":"482913"}' });
const e3 = new Error('outer wrapper', { cause: new Error('inner: secret=hunter2') });
logger.error('e1', { err: e1 });
logger.error('e2', { err: e2 });
logger.error('e3', { err: e3 });
logger.error('rejection string', { err: 'rejected with token=abc123tok' });
logger.error('provider object', { err: { response: { data: { mobile: '9876543210', email: 'jane@example.com' } } } });
const out = lines.join('\n');
for (const line of lines) console.log(line.length > 400 ? line.slice(0, 400) + ' …[cut at 400 chars for display]' : line);
console.log('---');
for (const s of secrets) console.log(`${out.includes(s) ? 'LEAKED ' : 'absent '} ${s}`);
console.log('cause chain logged:', /inner/.test(out));
~~~
