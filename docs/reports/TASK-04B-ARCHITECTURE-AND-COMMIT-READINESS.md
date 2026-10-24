# TASK-04B — Foundation Review, Architecture Decisions and Commit Readiness

| Item | Value |
|---|---|
| Task ID | TASK-04B |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Type | Inspection and planning only |
| Files created | This report only |
| Files edited | **None.** Source, configuration, lockfile, protected specifications and earlier reports are byte-identical to the start of the task (§8, E12). |
| Status | **Blocked on one serious defect (D1)** found in the uncommitted TASK-04A code. A fix is proposed and validated on scratchpad copies only, and awaits separate approval (§3). Everything else is a recommendation awaiting the owner's decision. |

---

## 1. Summary

1. **Starting state (§2).** HEAD is `e83562484d0495ec836b9eb896c8f7dfefd6927c` on `main`. There are 2 commits, no remote and no stash. 9 files are modified and 16 untracked, all from TASK-03A, TASK-04 and TASK-04A, and nothing is staged.
2. **Code review of TASK-04A (§3):**
   - **D1 (serious): regular-expression denial of service (ReDoS) in the access log.** One unauthenticated `GET` with a crafted 2,000-character path freezes the API's only event loop. Measured in a separate process, a concurrent `/health` took **2.49 s instead of 0.013 s**. Repeating the request is a trivial denial of service.
   - **D2 (medium).** `Buffer`/typed-array values are logged byte by byte, and the original data can be decoded back from the log.
   - **D3 (low/medium).** The log `msg` text is not scrubbed.
   - **Fix.** A three-line fix is proposed. On scratchpad copies it passes 31/31 tests, including 4 new regression tests, and brings the worst adversarial input from 4,604 ms to 5.7 ms. **It is not applied to the repository.**
3. **Security headers (§4).** These are kept provisionally, unchanged. CORP `same-origin` is correct only if AC-14 keeps the API same-origin. It must be reconsidered if a separate API origin is ever chosen.
4. **Proposed decisions (§5), for owner approval:**
   - **DS-1:** CSS Modules plus CSS custom properties.
   - **DS-2:** React Aria Components. Only registry metadata was checked; the bundle-size, compatibility and assistive-technology checks still need an approved spike before installation.
   - **AC-14:** same-origin path-based routing, with NGINX sending `/api/*` to Express and everything else to Next.js. Detailed decisions are in §5.3.
5. **Commit plan (§6).** Three commits are planned. The TASK-04 and TASK-04A code must be committed **together**, and **only after** D1–D3 are fixed. Two unexplained SVG design files appeared during the task, and they are held back.
6. **Gates (§7).**
   - **TASK-01 and CP2:** no recorded review outcome exists for the TASK-01 specification fixes, and no CP2 review exists.
   - **PostgreSQL:** PostgreSQL **18** is recommended. Version 19 is still a release candidate, with general availability planned for 19 Nov 2026.
   - **Linux shutdown:** the exact pass/fail test is defined.
7. **Validation (§8).** `npm run check` passed (exit 0, 58/58 tests). The lockfile and protected files are unchanged. No secrets or `.env` files were found, and no stray processes were left running.

---

## 2. Starting Git state (evidence E1)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `e83562484d0495ec836b9eb896c8f7dfefd6927c`, "fix(web): let PORT choose the web port instead of hard-coding 3000" |
| Earlier commit | `15dd95b3fa61382ec60e8bc3120589068743866a`, "chore: initialise M0 repository and governance foundation" |
| Remote | None |
| Stash | Empty |
| Staged | Nothing |
| Modified (9) | `README.md`, `apps/api/.env.example`, `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/server.ts`, `apps/web/next.config.ts`, `package.json`, `packages/shared/src/index.ts` |
| Untracked (16) | 12 API files (source, tests, `tsconfig.build.json`) and 4 reports (TASK-03, TASK-03A, TASK-04, TASK-04A) |
| Ignored (generated) | `apps/api/dist/`, `apps/web/.next/`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`, `node_modules/` |

**A change during the task:** two untracked files appeared at the repository root while this task was running. They are `Kulvriksh-V3-Desktop-1440.svg` and `Kulvriksh-V3-Mobile-390.svg`, both written at 04:51 local time. I did not create them; see §6.4 and E11.

---

## 3. TASK-04A code review: findings and residual risks

### 3.1 What passed review

| Area | Result | Basis |
|---|---|---|
| Error values under `err`/`error`/`reason`/`cause`, and any `Error` instance | **PASS** | They use the allowlisted safe form. Arbitrary properties (`config`, `response`, ...) are never copied. Existing tests assert this against the full raw log output. |
| Stack traces | **PASS** | Frames only, at most 15. The header line, which repeats the unscrubbed message, is dropped. |
| Cause chains and `AggregateError` | **PASS** | Depth is limited to 3 and members to 5. |
| Response bodies | **PASS** | 4xx responses get generic messages and 5xx responses a generic 500. Internal details never reach the client. |
| Query strings | **PASS** | Never logged by the access log. |
| Request IDs | **PASS** | Server-generated UUIDs. Client-supplied values are ignored. |
| Other `scrubText` rules (URL credentials, query, bearer, quoted keys, JWT, email, OTP, phone, long-token) | **PASS** | Crafted 2,000-character inputs ran in ≤ 8.5 ms each (E3). |

### 3.2 Defects found

#### D1 — Serious: ReDoS in the key-value rule, reachable without authentication

- **Where:** [apps/api/src/redaction.ts:30](../../apps/api/src/redaction.ts#L30). This is the key-value rule `([A-Za-z0-9_-]*(?:SENSITIVE_WORDS)[A-Za-z0-9_-]*)…(\s*[:=]\s*)`.
- **Cause:** the two unbounded `[A-Za-z0-9_-]*` runs surround an alternation of keywords. On a long run of repeated keywords with no `=`/`:` (for example `otpotpotp…`), the engine retries every split point at every start position. Backtracking is roughly cubic, and the 2,000-character input cap only bounds the worst case; it does not prevent it.
- **How it is reached:**
  1. The access log scrubs every string field, including the request path.
  2. It logs on the response's `finish` event, synchronously, on the shared event loop.
  3. So the attacker's own 404 returns quickly, and every other client then waits.
- **Evidence:**

  | Measurement | Result | Evidence |
  |---|---|---|
  | `scrubText` on `otp` ×666 | **4,603.9 ms** | E2 |
  | `scrubText` on `tokenx` ×333 | **3,846.8 ms** | E2 |
  | `scrubText` on `token` ×400 | **1,043.9 ms** | E2 |
  | Separate-process server (real `createApp`, info logger), baseline `/health` | 200 in **0.013 s** | E4 |
  | Same server: crafted `GET /otpotp…` (1,999 characters) | 404 in 0.003 s | E4 |
  | Same server: `/health` sent 0.2 s after the crafted request | 200 in **2.488 s** | E4 |

- **Invalid measurements, disclosed:**
  - **E3 P5:** an in-process run reported `/health` at 3 ms during the attack. That number is invalid, because the test client shared the server's event loop. Only the separate-process run in E4 is valid.
  - **E4, last line ("after: 000"):** the final `/health` call ran after the probe server had already been stopped, so it is not a result.
  - **E5:** the probe server (PID 32448, confirmed by its command line) was stopped, and port 4199 was confirmed free.
- **Severity:** this is serious. A single client sending a few such requests per second keeps the API unavailable. That will matter once login, OTP and payment endpoints exist.

#### D2 — Medium: binary data is logged reversibly

`sanitise` walks a `Buffer` with `Object.entries`, so each byte becomes a numbered field. In E2, the logged `Buffer` of `{"otp":"482913"}` decoded back exactly. Key-name redaction does not help here, because the field name (`chunk`) is innocuous. The risk is a webhook raw body or an upload chunk that a developer logs by mistake.

#### D3 — Low/medium: `msg` is not scrubbed

The record builds `msg` from the raw text, so `logger.error(\`login failed for ${mobile} password=${pw}\`)` writes both values in clear (E2 P3). Fields are scrubbed, but message text is not, which is inconsistent and easy to misuse.

### 3.3 Proposed smallest fix (NOT applied — awaiting separate approval)

| Defect | File | Change |
|---|---|---|
| D1 | `apps/api/src/redaction.ts:30` | Bound the quantifiers: both `[A-Za-z0-9_-]*` become `[A-Za-z0-9_-]{0,32}`, and both `\\s*` become `\\s{0,10}`. Keys of up to 32 characters either side of the keyword are still redacted. |
| D2 | `apps/api/src/logger.ts`, in `sanitise` before the `Date` check | Add `if (value instanceof ArrayBuffer \|\| ArrayBuffer.isView(value)) { return \`[binary ${value.byteLength} bytes]\`; }` |
| D3 | `apps/api/src/logger.ts`, record construction | Change `msg` to `msg: scrubText(msg)` |
| Tests | `redaction.test.ts` and `logger.test.ts` | Add the four regression tests from the scratchpad `proposed-fix.test.ts` (source in E14). |

The exact diff of the scratchpad copies against the repository is in E7.

**Validation on scratchpad copies only:**

| Check | Before the fix (E6) | After the fix (E7) |
|---|---|---|
| Test suite | 31 tests: 28 pass, **3 fail**. D1 took 1,816 ms, and D2 and D3 leaked. This shows the new tests detect the defects. | **31/31 pass** |
| Adversarial `scrubText` timings | — | All ≤ 5.7 ms (`otp` ×666: 5.68 ms; path variant: 5.34 ms) |
| Repository `redaction.ts`, `logger.ts` | — | Unchanged: `1701804d…` and `296f693b…` |

E6 records the first attempt. The patch script failed with "pattern not found", so it ran the tests against the **unfixed** copies. Its output stops after the md5sum command heading.

**Not yet validated:** the full `npm run check` with the fix applied in the repository. That runs only after approval, as part of the fix task.

**Proposed approval:** apply exactly the changes above in a TASK-04C, run `npm run check`, and report. Nothing more.

### 3.4 Residual risks that remain after the fix (no change proposed now)

| ID | Risk | Evidence | Suggested handling |
|---|---|---|---|
| R-1 | Phone numbers written with spaces or dashes (`+91 98765 43210`, `98765-43210`) are not redacted from free text. Contiguous digits are. | E8 | Add a spaced-number rule in M4, when phone handling exists. Meanwhile, never interpolate phone numbers into log text. |
| R-2 | A bare secret that follows a word with no `=`/`:` (`secret AbCd…`) and is under 32 characters is not redacted. | E8 | Key-name redaction for structured fields is the primary control; scrubbing is defence in depth. |
| R-3 | Names, addresses and family data cannot be detected by pattern. | E8 | Rule: never log request or response bodies, or personal fields. Enforce it in code review and in the M4 and M5 tests. |
| R-4 | Scrubbing is heuristic. New provider token formats (SMS, TTS) may not match. | By inspection | Review the rules whenever a provider integration is added. |
| R-5 | `scrubText` is synchronous on the event loop. After the fix its cost is bounded (≤ ~6 ms per 2,000-character field), but it is not zero. | E7 | Acceptable at current scale. Re-measure in the CP2 performance baseline. |

---

## 4. Security-header review (no change)

Express currently sends the following headers on every response, success and error alike. This is verified by `app.test.ts`, which is part of the 58 passing tests in E10.

| Header | Value | Assessment for a JSON-only API |
|---|---|---|
| `Cache-Control` | `no-store` | Correct. Later endpoints return private data, and shared caches must never store it. |
| `X-Content-Type-Options` | `nosniff` | Correct |
| `X-Frame-Options` | `DENY` | Correct. Kept for older browsers, alongside `frame-ancestors`. |
| `Referrer-Policy` | `no-referrer` | Correct |
| `Cross-Origin-Resource-Policy` | `same-origin` | Correct **only under same-origin routing (AC-14 recommendation)**. If a separate API origin (e.g. `api.example`) is chosen, this would block legitimate cross-origin reads from the web origin. CORP would then need to become `same-site`, or be scoped per route, and an explicit CORS allowlist with credentials would have to be designed. **That must be revisited if AC-14 changes.** |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | Correct for JSON. It must **not** be copied to Next.js pages. Pages need their own CSP (nonce- or hash-based) in M2, applied by Next.js middleware or by NGINX for non-`/api` paths. |
| `X-Powered-By` | Removed | Correct |
| `Strict-Transport-Security` | Not set by Express | Intentional: set it once at NGINX, for both apps. The `max-age` and preload decision is made at deployment. |

**Decision: keep the current headers provisionally, unchanged.**

---

## 5. Proposed decision record (for owner approval; not written into protected documents)

Each decision below is **Proposed — awaiting owner approval**. If approved, the owner decides where to record it, for example in a roadmap revision. I have not edited any protected document.

### 5.1 DS-1 — Styling approach

**Recommendation:** use **CSS Modules plus CSS custom properties** (design tokens).

| Aspect | Reason |
|---|---|
| Dependencies | None. CSS Modules are built into Next.js, so nothing is installed and the lockfile does not change. |
| Runtime cost | Zero runtime. CSS is extracted at build time, which helps the LCP ≤ 2.5 s and INP ≤ 200 ms targets in the performance standard. |
| Server Components | Works with React Server Components, because there is no client-side style injection. |
| Tokens | Colour, spacing, type scale, radii and motion live as custom properties on `:root`. Theming and per-script font stacks (Latin and Indic) change in one place. The existing provisional tokens in `apps/web` map onto this directly. |
| Scoping | Class names are scoped per module, so pages and components don't collide. |

**Conventions to adopt in M2, subject to approval:**
- one global stylesheet for tokens and a minimal reset
- one `*.module.css` file per component
- no global class names beyond the reset and utility helpers
- logical properties (`margin-inline`, …)
- `prefers-reduced-motion` respected

**Alternatives (not recommended):**

| Option | Status | Why not the default |
|---|---|---|
| Tailwind CSS | Alternative | Adds a dependency and a PostCSS pipeline. Long class strings make components harder to review. Acceptable if the team strongly prefers it. |
| Zero-runtime CSS-in-TypeScript (e.g. vanilla-extract) | Alternative | Adds a bundler plugin, and its Next.js 16 Turbopack support would need separate verification. The gain over typed token constants is small. |
| Runtime CSS-in-JS (styled-components, Emotion) | **Rejected** | Runtime cost, client-only style injection, and friction with Server Components |

### 5.2 DS-2 — Accessible interactive primitives

**Recommendation:** use **React Aria Components**, but only for complex widgets, and only after a minimal validation spike passes. **Nothing is installed by this task.**

**Checked in this task (registry metadata only, E9):**

| Fact | Value | Meaning |
|---|---|---|
| Latest version | `react-aria-components@1.22.1` (registry metadata modified 2026-10-09) | Pin an exact version at least 14 days old when installing. |
| React peer range | `^16.8.0 \|\| ^17 \|\| ^18 \|\| ^19.0.0-rc.1` | Covers the installed React 19.3.1 on paper. **This is not a runtime compatibility check.** |
| Dependencies | `react-aria`, `react-stately`, `@internationalized/date`, `@internationalized/string`, `client-only`, `@swc/helpers`, `use-sync-external-store`, `@react-types/shared` | The `client-only` dependency means **every component is a Client Component** and adds client JavaScript. |
| Unpacked size | 6.9 MB | Package size on disk. This is **not** bundle size; real cost depends on tree-shaking (see spike). |

**Spike required before adoption.** It needs an approved, separate task, because installing changes the lockfile. Do it on a throwaway branch or worktree, and keep it out of `main` unless it is approved.

| # | Check | Pass criterion |
|---|---|---|
| 1 | Install one exact version at least 14 days old, then run `npm run check` | Typecheck, lint, test and build pass with Next.js 16.4.2 and React 19.3.1. No peer-dependency warnings are accepted without review. |
| 2 | Build one Dialog, one Menu and one ComboBox in a Server Component page (as client islands) | The page stays a Server Component, and only the widget files are `'use client'`. |
| 3 | Client JavaScript cost | Record the first-load JS of a page with no widgets, then with each widget, from `next build` output. The owner accepts the delta per widget. There is no numeric budget in the performance standard yet, so this is a recorded baseline, not a pass/fail threshold. |
| 4 | Keyboard | Full operation without a mouse: Tab and Shift+Tab, arrows, Escape, Enter and Space. Focus is visible, trapped in dialogs and returned on close. |
| 5 | Screen reader | NVDA with Chrome (Windows) and TalkBack with Chrome (Android): roles, names, states and announcements are correct. Use VoiceOver as well if an Apple device is available. |
| 6 | Locale | With `I18nProvider` set to at least `en-IN` and one Indic locale, typing an Indic script into a ComboBox filters correctly. If a date picker is needed, dates format correctly. **The website language(s) are TBC (roadmap item 3)**, so the actual locales follow that decision. |
| 7 | Accessibility target | **TBC (roadmap item 45).** The spike records findings without claiming a WCAG level. |

**Per-widget rule:**
- **Native HTML first:**
  - links and buttons
  - text inputs and textareas
  - checkboxes, radios and fieldsets
  - simple `<select>`
  - `<details>`/`<summary>` disclosure
  - the native form validation attributes
- **React Aria Components only where native HTML is inadequate.** Likely candidates are comboboxes or autocomplete (e.g. surname search), menus, modal dialogs with complex content, tabs, and a date picker if a product flow needs one. Each use is justified per screen in M2.

**Alternatives:** Radix UI primitives (similar model, less internationalisation and date support), or hand-built widgets (highest accessibility risk). These are not recommended unless the spike fails.

### 5.3 AC-14 — Routing between Next.js and Express

**Recommendation:** use **same-origin, path-based routing.** NGINX terminates TLS, sends `/api/*` to Express and everything else to Next.js. **Express remains the authoritative API.** Razorpay webhooks reach Express directly through NGINX and never pass through Next.js.

```
Browser ──HTTPS──► NGINX (443, TLS, HSTS, X-Forwarded-For, X-Request-Id)
                     ├── /api/*            ──► Express  127.0.0.1:<API_PORT>   (authoritative)
                     │     └── /api/webhooks/razorpay  (raw body, signature-verified, no session)
                     └── everything else    ──► Next.js  127.0.0.1:<WEB_PORT>
                                                  └── server-side fetch ──► Express via API_INTERNAL_URL (loopback)
```

| # | Topic | Proposed decision | Depends on |
|---|---|---|---|
| 1 | Path layout | Express mounts its public routes under `/api` itself (e.g. `/api/v1/...`). NGINX passes the path through unchanged, with no rewrite, so paths are identical in development, tests and production. | — |
| 2 | Local development parity | Use a development-only Next.js `rewrites()` rule from `/api/:path*` to `http://127.0.0.1:<API_PORT>/api/:path*`, so the browser sees one origin locally. The rule must be off in production builds, where NGINX does the routing. It must be enabled in the M2 `next.config.ts` change, which needs approval. **Limitation:** the Next.js proxy does not behave exactly like NGINX (buffering, header handling). Run a pre-release check against the real NGINX configuration on the VPS; a staging environment is TBC (AC-8/R11). Local ports avoid the other projects on 3000 and 4000, for example 3100 and 4100. | AC-8 |
| 3 | `trust proxy` | Use `app.set('trust proxy', 'loopback')` in every environment, **never `true`**. Only NGINX (and the Next.js server-side fetches) connect from 127.0.0.1. NGINX is the edge, so it **overwrites** `X-Forwarded-For` with `$remote_addr` rather than appending, which means a client cannot inject addresses. If a CDN or another proxy is ever added (not approved), this must be revisited. | — |
| 4 | Request IDs | NGINX sets `X-Request-Id: $request_id`, overwriting any client value, and logs it. Express accepts an inbound ID **only** when the connection comes from the trusted proxy and the value matches a strict format (32 hex characters or a UUID); otherwise it generates one, as it does today. Next.js server-side fetches send their own ID. **The current "ignore all client IDs" behaviour stays until NGINX exists.** | — |
| 5 | Session cookie | The cookie is set only by Express, with the name `__Host-kv_session` in production: `HttpOnly`, `Secure`, `Path=/`, no `Domain` (required by `__Host-`), and `SameSite=Lax`. Lax lets users arrive logged in from external links and payment redirects; Strict would break that. Locally the name is unprefixed. **Lifetime, idle timeout, rotation and separate admin/genealogist sessions are TBC** (product flows / CP2 auth design). | FQ auth items, CP2 |
| 6 | CSRF | Rely on same-origin and `SameSite=Lax`, **plus**: <br>• every state-changing endpoint uses a non-GET method <br>• Express rejects unsafe methods whose `Origin` (fallback `Sec-Fetch-Site`) is not the configured public origin <br>• JSON endpoints require `Content-Type: application/json` <br>• any non-JSON form or multipart upload also carries a synchronizer token <br>The webhook route is exempt, because it is authenticated by the Razorpay signature and carries no cookie. **The final design belongs to the CP2 auth review.** | CP2 |
| 7 | Client IP for rate limiting | `req.ip`, derived through `trust proxy` (#3). Next.js server-side fetches forward the `X-Forwarded-For` value that NGINX gave them, and Express trusts it because the call is from loopback. Only local processes can connect on loopback, because both apps bind to 127.0.0.1 and the firewall allows only 22, 80 and 443. The rate-limit keys (IP, mobile number, account) and windows follow the Proposed atomic rate-limit design in the data model. | CP2 (DM rate-limit design) |
| 8 | Session forwarding for server-side rendering | Server Components read the session cookie and call Express at `API_INTERNAL_URL` (server-only, e.g. `http://127.0.0.1:<API_PORT>`). They forward **only** the session cookie (not all cookies), plus `X-Request-Id` and `X-Forwarded-For`, and use `cache: 'no-store'`. Server Components cannot set cookies, so **login, logout and session refresh go from the browser directly to `/api`**, and Express sets `Set-Cookie`. Server-side rendering only reads. Private responses are never cached in Next.js (performance standard: "frontend caching is never used as a security control"). | M4 |
| 9 | Upload streaming | Uploads go to `/api/...` (Express), never through Next.js. NGINX sets `client_max_body_size` per location and `proxy_request_buffering off` on upload routes, so bodies stream to Express and then on to storage. **Size limits, file types and the storage abstraction are TBC** (storage is blocked until its milestone). | Product flows, storage milestone |
| 10 | Download streaming | Express authorises each download, then either streams it (`Content-Disposition: attachment`, exact `Content-Type`, `Cache-Control: private, no-store`, `nosniff`) or, for files on local disk, returns `X-Accel-Redirect` to an NGINX `internal` location. That saves CPU on the single vCPU. **Entitlement rules are TBC** (M8). | M8, storage milestone |
| 11 | Webhooks | `/api/webhooks/razorpay` uses `express.raw()` on that route only, so the signature is checked over the exact bytes. It has a small body limit, no session and no CSRF check, and is idempotent per event ID (data model design). The raw body is **never logged**, which D2 makes safer. | CP2 payment design, R12–R16 |
| 12 | Health checks and internal addresses | Express `/health` stays at the root, outside `/api`, on loopback only. NGINX does **not** expose it publicly, so the process manager (systemd) and NGINX probe it locally. Next.js has no public health route unless one is needed. Express binds to `127.0.0.1:<API_PORT>` and Next.js to `127.0.0.1:<WEB_PORT>`; production defaults are 4000 and 3000, configurable. | — |
| 13 | Headers per surface | `/api/*` uses the current Express headers (§4). Pages get their own CSP from Next.js, plus HSTS, `nosniff` and `Referrer-Policy` from NGINX, all designed in M2. | M2 |

**Details explicitly left open (not decided here):**
- session lifetime and rotation
- separate admin/genealogist cookies, and whether the admin portal needs its own subdomain
- the CSRF token mechanism for forms
- rate-limit keys and values
- upload limits and types
- download entitlements
- webhook path versioning
- the staging environment

---

## 6. Commit plan (nothing staged; requires owner approval to execute)

### 6.1 Classification of every changed or untracked file

| File | Status | Origin |
|---|---|---|
| `apps/web/next.config.ts` | M | TASK-03A (`agentRules: false`) |
| `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | ?? | Report (TASK-03, with TASK-03A errata) |
| `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` | ?? | Report (TASK-03A) |
| `README.md` | M | TASK-04 (M1 description, test script, configuration and logging notes; diff inspected) |
| `apps/api/.env.example` | M | TASK-04 (`NODE_ENV`, `LOG_LEVEL`; placeholders only) |
| `apps/api/package.json` | M | TASK-04 (`build` uses `tsconfig.build.json`; `test` script) |
| `apps/api/src/app.ts` | M | TASK-04 |
| `apps/api/src/config.ts` | M | TASK-04 |
| `apps/api/src/server.ts` | M | TASK-04 |
| `package.json` | M | TASK-04 (`test`, and `check` now includes `test`) |
| `packages/shared/src/index.ts` | M | TASK-04 (`requestId` in `ApiErrorBody`) |
| `apps/api/src/errors.ts` | ?? | TASK-04 |
| `apps/api/src/middleware.ts` | ?? | TASK-04 |
| `apps/api/src/testing/helpers.ts` | ?? | TASK-04 |
| `apps/api/tsconfig.build.json` | ?? | TASK-04 |
| `apps/api/src/config.test.ts` | ?? | TASK-04 |
| `apps/api/src/logger.ts` | ?? | TASK-04, then **modified by TASK-04A** (safe error form, string scrubbing) |
| `apps/api/src/app.test.ts`, `errors.test.ts`, `logger.test.ts`, `server.test.ts` | ?? | TASK-04, then **modified by TASK-04A** |
| `apps/api/src/redaction.ts`, `redaction.test.ts` | ?? | TASK-04A (contains D1) |
| `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md` | ?? | Report (TASK-04) |
| `docs/reports/TASK-04A-LOGGING-REVIEW.md` | ?? | Report (TASK-04A) |
| `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md` | ?? (new) | Report (this task) |
| `Kulvriksh-V3-Desktop-1440.svg`, `Kulvriksh-V3-Mobile-390.svg` | ?? | **Unexplained.** These appeared during this task and were not created by the agent (§6.4). |
| `apps/api/dist/`, `apps/web/.next/`, `apps/web/next-env.d.ts`, `apps/web/tsconfig.tsbuildinfo`, `node_modules/` | Ignored | Generated. **Never commit.** |

**Why TASK-04 and TASK-04A cannot be split into separate commits.** TASK-04A edited `logger.ts` and four test files that were never committed after TASK-04. The TASK-04-only version of those files no longer exists on disk, and was never tested as a standalone tree after TASK-04A. Splitting by hunks would create a commit nobody has validated. They are therefore committed as **one** commit, together with the approved D1–D3 fix.

### 6.2 Proposed commits, in dependency order

**Commit 1 — TASK-03A** (it depends only on HEAD `e835624`):

- **Files (exactly 3):**
  - `apps/web/next.config.ts`
  - `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`
  - `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`
- **Message:**
  ```
  chore(web): stop next dev writing AGENTS.md; add TASK-03 and TASK-03A reports

  Set agentRules: false in next.config.ts (TASK-03A decision).
  Add the TASK-03 repository governance report (with TASK-03A errata)
  and the TASK-03A review follow-up report.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **Required validation:**
  - Before committing:
    - `git diff --cached --name-only` lists exactly these 3 files.
    - `md5sum` confirms `next.config.ts` is `c300b572…`, the TASK-03 report `ccd78b65…` and the TASK-03A report `4194bdfd…`.
  - After committing:
    - `git show --stat HEAD`.
  - An isolated `npm run check` on just this commit would need a temporary `git worktree` plus `npm ci`, which needs owner approval. Without one, this commit is validated by inspection; the final tree is validated in full after commit 2.

**Commit 2 — M1 API foundation (TASK-04 + TASK-04A + the approved D1–D3 fix).** It depends on commit 1 for ordering only (the code is independent). It is **blocked until the D1–D3 fix is approved, applied and `npm run check` passes.**

- **Files (exactly 20):**
  - Modified (8): `README.md`, `apps/api/.env.example`, `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/config.ts`, `apps/api/src/server.ts`, `package.json`, `packages/shared/src/index.ts`
  - New (12): `apps/api/src/errors.ts`, `apps/api/src/middleware.ts`, `apps/api/src/logger.ts`, `apps/api/src/redaction.ts`, `apps/api/src/testing/helpers.ts`, `apps/api/tsconfig.build.json`, `apps/api/src/app.test.ts`, `apps/api/src/config.test.ts`, `apps/api/src/errors.test.ts`, `apps/api/src/logger.test.ts`, `apps/api/src/redaction.test.ts`, `apps/api/src/server.test.ts`
- **Message:**
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
- **Required validation:**
  - `npm run check` passes, with the test count reported (expected 62 = 58 + 4).
  - The lockfile md5 is still `90c261c4…`.
  - The secret scan is clean.
  - `git diff --cached --name-only` lists exactly these 20 files.
  - No `.env` file and no generated output is staged.

**Commit 3 — Reports** (it depends on commit 2, so the reports describe committed code):

- **Files:**
  - `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md`
  - `docs/reports/TASK-04A-LOGGING-REVIEW.md`
  - `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md`
  - the TASK-04C fix report, once it exists
- **Message:**
  ```
  docs(reports): add TASK-04, TASK-04A, TASK-04B and TASK-04C reports

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **Required validation:** the protected reports' md5 values are unchanged, and `git diff --cached --name-only` lists only the report files.

### 6.3 Never staged

- `.env` files: none exist (E12).
- Every ignored or generated path in §6.1.
- The two SVG files (§6.4) until the owner decides.

### 6.4 Unexplained files: held back

| File | Size | Written | md5 | Content (first bytes and tag count only, E11) |
|---|---|---|---|---|
| `Kulvriksh-V3-Desktop-1440.svg` | 6,754,869 B | 2026-10-24 04:51:47 +0530 | `22bdff56e07c7bba6f9becbc4b38cfba` | A `dom-to-svg` export of a 1440 px page, with 24 embedded image references and no `<script>` |
| `Kulvriksh-V3-Mobile-390.svg` | 3,264,415 B | 2026-10-24 04:51:58 +0530 | `309f3a1a0c18e4203f456e92e85447f0` | A `dom-to-svg` export of a 390 px page, with 18 embedded image references and no `<script>` |

These look like owner-supplied design mock-ups ("V3", desktop and mobile). I did not open their full content or check them for personal data. **Owner decision needed:**
- Keep them outside the repository (recommended: about 9.6 MB of embedded raster data bloats Git history), or
- Move them to an agreed `docs/design/` location, either with Git LFS or after confirming they contain no personal data or licensed images.

They are excluded from every commit above, and I have not moved or modified them.

---

## 7. Outstanding gates

| Gate | Current status (evidence) | What closes it |
|---|---|---|
| **TASK-01** | `docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md` states "Completed. **Awaiting review.** This report is evidence of what was done, not proof that the design is correct." The repository contains **no recorded review outcome**: no acceptance and no requested changes. That report records the fixes applied, and must not be read as the review outcome. Its own open questions are also unanswered: the "nine versus ten corrections" count, and the F-AUTH-03 scope note. | The reviewer or owner records the outcome (accepted, accepted with changes, or rejected), together with answers to those two questions. |
| **CP2** (roadmap: "Foundation ready", Week 2) | **Outstanding. No CP2 review exists.** Every design in the data model and product flows remains "Proposed (pending CP2 technical review)". The CP2 scope includes things not yet built: schema draft, storage and provider abstractions, rendering and caching strategy, performance test profile and first baseline. | Complete M2 and the M3 groundwork, then hold the CP2 client and technical review. Until then, M4 (auth), M8 (payments) and any domain table stay blocked. |
| **PostgreSQL** | Not installed (no change). **The PostgreSQL project's RC 1 announcement gives 19 Nov 2026 as the planned general-availability date for 19**, so 19 is not yet released; PostgreSQL 14 reaches end of life on 12 Nov 2026. | **Recommendation:** use **PostgreSQL 18, latest minor release**, for production and local development. Do not adopt 19.0 for an 8–10 week delivery; reconsider at 19.1 or later. <br>**Production (VPS, Ubuntu LTS assumed; confirm the Hostinger image):** use the official PGDG apt repository, because the distribution archive ships an older major. Bind to localhost only, use the separate owner, migration and application roles from the data model's role design, and enable `scram-sha-256` authentication. Size memory settings conservatively for 4 GB RAM shared with Node, and measure them in the CP2 baseline rather than fixing them now. <br>**Local (Windows):** the native PostgreSQL 18 installer, bound to localhost, with the same roles and a non-default port if one clashes. <br>**Install only in M3, after approval.** |
| **GitHub** | No remote (E1, E12). `gh` is not installed. | The owner creates the private repository and supplies its URL. After approval: `git remote add origin <url>`, a first push of the approved commits, then branch protection and secret scanning on GitHub. |
| **Linux shutdown testing** | **NOT RUN.** It cannot be proven on Windows: `child.kill()` there terminates the process without delivering SIGTERM, so the `SIGTERM` handler has never been exercised. | Run on Ubuntu (VPS or WSL2) with Node 24.13.0, from `apps/api`, using a port free on that host (e.g. 4199): <br>1. `API_PORT=4199 LOG_LEVEL=info node src/server.ts > /tmp/kv.log 2>&1 & PID=$!` <br>2. Wait until `/tmp/kv.log` contains `"msg":"listening"`. Run `curl -fsS http://127.0.0.1:4199/health`. <br>3. Open an idle keep-alive connection and leave it open: `node -e "const s=require('net').connect(4199,'127.0.0.1',()=>s.write('GET /health HTTP/1.1\r\nHost: t\r\n\r\n'));s.resume();s.on('close',()=>console.log('idle conn closed'))" & C=$!` <br>4. `kill -TERM $PID; time wait $PID; echo exit=$?` <br>5. Repeat steps 1–4 with `kill -INT`. <br>6. Under systemd later: `systemctl stop` with `KillSignal=SIGTERM` and `TimeoutStopSec=15`. <br>**Pass when all of these hold:** <br>• exit code 0 <br>• the log has `"msg":"shutting down"` with `"reason":"SIGTERM"` (or `SIGINT`) <br>• there is **no** `"shutdown timed out, exiting"` line <br>• the process exits in well under 10 s (the forced-exit timer), even with the idle connection from step 3 open, and that client prints `idle conn closed` <br>• `ss -ltn \| grep 4199` is empty afterwards <br>• under systemd, `systemctl status` shows a clean stop, not `SIGKILL` |
| **M2 readiness** | **Not started.** It needs DS-1, DS-2 and AC-14 approved (§5), and it should start from a committed baseline (§6). | **Can proceed safely after approval:** <br>(a) the TASK-04C D1–D3 fix <br>(b) commits 1–3 <br>(c) the DS-2 spike on a throwaway branch <br>(d) M2 web foundation work that does not depend on blocked items: route groups and layouts, tokens, loading, error and empty patterns, page CSP, and the development `/api` rewrite <br>(e) the Linux shutdown test <br>(f) M3 PostgreSQL installation and the role design, without domain tables <br>**Must still wait:** Prisma and domain schema (data model approval and CP2), auth and sessions (M4, CP2), payments (M8), and any business feature. |

---

## 8. Validation

| Check | Result | Evidence |
|---|---|---|
| `npm run check` (typecheck, lint, test, build), on the unchanged repository | **PASS.** Exit 0; 58 tests, 58 pass, 0 fail; `next build` succeeded. | E10 |
| Proposed fix on scratchpad copies (31 tests, including 4 new) | **PASS (scratchpad only)** | E7 |
| Proposed fix applied to the repository, with `npm run check` | **NOT RUN.** It awaits approval. | — |
| Lockfile unchanged | **PASS.** md5 `90c261c42994f3f3d83a1157ec18ce8e`, identical to the committed version. | E12 |
| Protected specifications and earlier reports byte-identical | **PASS.** 11 of 11 `md5sum -c` OK. | E12 |
| All source and configuration files unchanged since the task started | **PASS.** 24 of 24 `md5sum -c` OK against the starting checksums. | E12 |
| Nothing staged | **PASS.** `git diff --cached --name-only` is empty. | E12 |
| High-confidence secret scan (private keys, AWS keys, Razorpay live and test keys) over tracked and untracked files | **PASS.** No matches. | E12 |
| `.env` files present | **PASS.** None, other than `.env.example`. | E12 |
| Unexpected files | **FLAGGED.** The two SVG files (§6.4) | E11, E12 |
| Stray processes | **PASS.** No `node.exe` process from this repository or the scratchpad is running. Ports 3000 and 4000 are held only by the other projects' PIDs 7668 and 19480, as at the start. The probe server PID 32448 was stopped after it was identified, and port 4199 is free. | E5, E12 |
| React Aria Components runtime, bundle and assistive-technology compatibility | **NOT RUN.** Only registry metadata was read. | E9 |
| Linux SIGTERM shutdown | **NOT RUN** (§7) | — |

---

## 9. Confirmations

- **Nothing was committed, amended, reset, rebased, stashed or pushed. No remote was added or changed. Nothing was staged.** HEAD is still `e83562484d0495ec836b9eb896c8f7dfefd6927c`.
- **No dependencies were installed or upgraded, and the lockfile is unchanged.** `npm view` only read registry metadata.
- **M2 was not started.** No UI pages, Prisma, schema, migrations, authentication, sessions, payments or business features were added.
- **No protected specification, architecture document or earlier report was edited.**
- **No source file was modified.** D1 is a serious defect, so, as instructed, I stopped, validated the smallest fix on scratchpad copies only, and am reporting it for separate approval.
- No secrets, credentials, environment values or real personal data appear in this report. All test values (`hunter2`, `482913`, `9876543210`, etc.) are synthetic.

## 10. Next approval required

1. **Approve the D1–D3 fix (§3.3)** as a TASK-04C: exactly those three changes plus four tests, then `npm run check`, then a report.
2. **Decide DS-1, DS-2 and AC-14 (§5).** Approve, amend or reject each one, and say where the decisions should be recorded.
3. **Approve the commit plan (§6)**, including the combined TASK-04 and TASK-04A commit, and **decide what to do with the two SVG files.**
4. **Record the TASK-01 review outcome** and **schedule CP2** (§7).
5. Optionally approve the DS-2 spike, the Linux shutdown test and the PostgreSQL 18 recommendation.

I am waiting for the owner's review before making any further change.

---

## Appendix — Evidence (raw command output)

Paths under the session scratchpad are shown as `<scratchpad>`. Outputs are embedded byte for byte by a Node script.

### E1 Starting state (Git, checksums, listening ports)

````text
$ git rev-parse HEAD; test "$(git rev-parse HEAD)" = e83562484d0495ec836b9eb896c8f7dfefd6927c && echo 'HEAD matches expected value'
e83562484d0495ec836b9eb896c8f7dfefd6927c
HEAD matches expected value
[exit=0]

$ git log --format='%H %an %ad %s' --date=iso
e83562484d0495ec836b9eb896c8f7dfefd6927c Heel Patel 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b3fa61382ec60e8bc3120589068743866a Heel Patel 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and governance foundation
[exit=0]

$ git remote -v; echo '(none listed = no remote)'
(none listed = no remote)
[exit=0]

$ git stash list; echo '(stash list end)'
(stash list end)
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

$ git status --short --ignored | grep '^!!'
!! apps/api/dist/
!! apps/web/.next/
!! apps/web/next-env.d.ts
!! apps/web/tsconfig.tsbuildinfo
!! node_modules/
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

$ md5sum docs/*.md docs/reports/*.md package-lock.json apps/api/src/*.ts apps/api/src/testing/*.ts apps/api/*.json apps/web/*.ts apps/web/*.json package.json packages/shared/src/*.ts README.md apps/api/.env.example
17c2b0b2799092ef34ab56c1d4ee404a *docs/00-ROADMAP.md
14c727e7834a4fe9685e779c870c6862 *docs/01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *docs/02-DATA-MODEL.md
4408f9afb25628949c61852a32e9b729 *docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
2dcb5aad1f1e6e8e1a0e2d8ded1c3472 *docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md
8df13430d2c6af881313229a56d82360 *docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md
ccd78b6570346ab82788c84f2aab646b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
4194bdfd5d9371a3b026edbfdf75057b *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
f99d805210481297c663be15200ab902 *docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
663cf6af556d08dea5d305e3dbd89557 *docs/reports/TASK-04A-LOGGING-REVIEW.md
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
d7ad83a9c31102924baa4c2401bf6eab *apps/api/src/app.test.ts
5df42c2f7f0f54891cece12a2335c188 *apps/api/src/app.ts
efd84bb2a3b36fc8913505f804343637 *apps/api/src/config.test.ts
c3b9ac0f843e89f9615a86f8ac6d6454 *apps/api/src/config.ts
da9651e8bb6be26adeed8bbe588117b6 *apps/api/src/errors.test.ts
fde680946aa4b17ae6dceaa4bcf6ba1c *apps/api/src/errors.ts
a5b3bc082916dd3f9df724c5537699cc *apps/api/src/logger.test.ts
296f693bec3e76ee941a007879043ce5 *apps/api/src/logger.ts
2000979ffaa9678e8c5f5e1c3219e564 *apps/api/src/middleware.ts
659e9fd2f8ad4055595c2b363ab34623 *apps/api/src/redaction.test.ts
1701804d2d6d60e30cfbba84ccaa83b8 *apps/api/src/redaction.ts
8927ce3975776ba45b34e2b05bbbd3c4 *apps/api/src/server.test.ts
3d111ea9733b7f86e956db8c81699adb *apps/api/src/server.ts
390e19bc3025cc62dc7e719b143f2f9a *apps/api/src/testing/helpers.ts
c69d04c1d356fb8c00c2a6109e0125d5 *apps/api/package.json
12b87c9898ed7a4b541ebdfd438c27ac *apps/api/tsconfig.build.json
80527213bab1a0cd952566405ea33618 *apps/api/tsconfig.json
0e4a65e8b2b9aa3ed0f8957b9406bd41 *apps/web/next-env.d.ts
c300b5724be7c30f2a666a077438696c *apps/web/next.config.ts
2f25bbf3c6119c76f91053a7e59dc5f3 *apps/web/package.json
9221d977b0804a268fce86e179037e03 *apps/web/tsconfig.json
21479ab49362e80774f48a74e9fd1fc3 *package.json
a6be31e094621cfde21ca43a13a56995 *packages/shared/src/index.ts
daf6b700671972ce7da0cf9d94802619 *README.md
6bddb878ca58153328038e0ffb93f4dd *apps/api/.env.example
[exit=0]

$ netstat -ano | grep LISTENING | grep -E ':(3000|3100|3101|3102|3103|4000|4103|4104) ' ; echo '(listening ports of interest)'
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       7668
  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       19480
  TCP    [::]:4000              [::]:0                 LISTENING       19480
(listening ports of interest)
[exit=0]

````


### E2 D1/D2/D3 probe: scrubText timings, Buffer logging, msg logging

````text
$ node <scratchpad>/t4b-probe.mjs
## P1 scrubText timing on adversarial inputs (input is capped at 2000 chars before the rules run)
plain a x2000                          18.7 ms
"token" x400 (2000 chars)            1043.9 ms
"password" x250 (2000 chars)          532.2 ms
"/token" path x333                      0.1 ms
"otp" x666                           4603.9 ms
"tokenx" x333                        3846.8 ms
"token " x333 (spaces)                  0.3 ms
normal path                             0.0 ms

## P2 binary data (Buffer) logged under an ordinary key
{"time":"2026-10-23T23:21:13.279Z","level":"info","msg":"upload","chunk":{"0":123,"1":34,"2":111,"3":116,"4":112,"5":34,"6":58,"7":34,"8":52,"9":56,"10":50,"11":57,"12":49,"13":51,"14":34,"15":125}}
decoded back from the log line: {"otp":"482913"}

## P3 msg field
{"time":"2026-10-23T23:21:13.305Z","level":"error","msg":"login failed for 9876543210 password=hunter2"}
[exit=0]
````


### E3 Per-rule timings and in-process end-to-end run (P5 concurrent /health figure INVALID: shared event loop)

````text
$ node <scratchpad>/t4b-probe2.mjs
## P4 per-rule crafted inputs (each 2000 chars or capped to 2000)
url-cred: "a://" + "a:" x998                     0.7 ms
url-cred: "a://" x500                            0.1 ms
query: "?a" x1000                                1.2 ms
query: "?" x2000                                 2.4 ms
bearer: "Bearer " x285                           0.2 ms
kv-quotes: "'token" x333                         0.1 ms
kv-quotes: "\"otp" x500                          0.1 ms
kv: "token:" x333                                0.0 ms
jwt: "eyJ" x666                                  8.5 ms
email: "a" x1000 + "@" + "a." x499               4.7 ms
email: "a@" x1000                                0.0 ms
email: "a.a@a" x400                              0.1 ms
otp-rule: "otp " x500                            0.1 ms
phone: "1" x2000                                 5.2 ms
phone: "1a" x1000                                4.8 ms
long-token: "a1" x1000                           6.3 ms

## P5 end-to-end: unauthenticated GET with a crafted path, then a /health request
baseline GET /health                             status 200      86 ms
attack path length: 1999
GET /<"otp" x666> (crafted path, 404)            status 404    1976 ms
GET /health sent ~20 ms after the attack         status 200       3 ms
[exit=0]
````


### E4 Separate-process proof of D1 (last "after" line INVALID: server already stopped)

````text
$ netstat check port 4199
port 4199 free
$ node <scratchpad>/t4b-server.mjs 4199 &   (separate process)
probe server listening
$ curl -s -o /dev/null -w "baseline /health: %{http_code} in %{time_total}s\n" http://127.0.0.1:4199/health
baseline /health: 200 in 0.013187s
$ (curl crafted path: '/' + 'otp' x666, length 1999) &  then 0.2 s later: curl /health
concurrent /health (sent 0.2 s after the attack): 200 in 2.488353s
attack request:   404 in 0.003239s
$ curl -s -o /dev/null -w "after: %{http_code} in %{time_total}s\n" http://127.0.0.1:4199/health
after /health: 000 in 2.066774s
probe server PID: 
````


### E5 Stopping the probe server (PID traced to t4b-server.mjs 4199)

````text

$ taskkill //PID 32448 //F   (stop the scratchpad probe server; confirmed by its command line)
SUCCESS: The process with PID 32448 has been terminated.
port 4199 free
````


### E6 Proposed-fix attempt 1: patch script FAILED, tests ran on UNFIXED copies (output ends at the md5sum heading)

````text
$ node <scratchpad>/t4b-proposed/apply-fix.mjs <scratchpad>/t4b-proposed   (edits the COPIES only)
<scratchpad>/t4b-proposed/apply-fix.mjs:6
  if (!src.includes(from)) throw new Error(`pattern not found in ${file}: ${from.slice(0, 60)}`);
                                 ^

Error: pattern not found in redaction.ts: new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Z
    at edit (<scratchpad>/t4b-proposed/apply-fix.mjs:6:34)
    at <scratchpad>/t4b-proposed/apply-fix.mjs:11:1
    at ModuleJob.run (node:internal/modules/esm/module_job:413:25)
    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:660:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:5)

Node.js v24.13.0
[exit=1]

$ (cd <scratchpad>/t4b-proposed && node --test redaction.test.ts logger.test.ts proposed-fix.test.ts)
✔ writes one JSON object per line with time, level, msg and fields (9.6894ms)
✔ filters below the configured level (0.2187ms)
✔ silent emits nothing (0.1322ms)
✔ passes the level to the sink so warn/error can go to stderr (0.1137ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.9341ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.0189ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.5037ms)
✔ ordinary string fields are scrubbed too (0.1645ms)
✔ serialises errors with name, message and stack (0.5127ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.869ms)
✔ fields cannot overwrite time, level or msg (0.1663ms)
✔ child loggers add bindings, and call fields take precedence (0.1529ms)
✖ D1: scrubText stays fast on adversarial inputs (< 50 ms each) (1818.1368ms)
✔ D1: long sensitive keys (up to 32 chars either side of the keyword) are still redacted (0.9456ms)
✖ D2: binary values are summarised, never logged byte by byte (4.6321ms)
✖ D3: the msg field is scrubbed (3.3848ms)
✔ scrubText removes database URL credentials and query values (2.4783ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.1323ms)
✔ scrubText removes Authorization header values and JWTs (0.1915ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.2052ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (1.0454ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.3201ms)
✔ scrubText caps very long text (9.573ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.272ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.3888ms)
✔ serializeError limits stack frames (0.3183ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.5157ms)
✔ serializeError includes scrubbed cause messages (0.3189ms)
✔ serializeError summarises AggregateError members (at most 5) (1.0442ms)
✔ serializeError handles non-Error values without dumping objects (0.1799ms)
✔ serializeError rejects unsafe code values (0.2445ms)
ℹ tests 31
ℹ pass 28
ℹ fail 3
✖ failing tests:
✖ D1: scrubText stays fast on adversarial inputs (< 50 ms each) (1818.1368ms)
  AssertionError [ERR_ASSERTION]: otpotpotpotp… took 1816.4 ms
✖ D2: binary values are summarised, never logged byte by byte (4.6321ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
✖ D3: the msg field is scrubbed (3.3848ms)
  AssertionError [ERR_ASSERTION]: The input was expected to not match the regular expression /9876543210|hunter2/. Input:
[exit=0]

$ md5sum apps/api/src/redaction.ts apps/api/src/logger.ts   (repository files: must be unchanged)
1701804d2d6d60e30cfbba84ccaa83b8 *apps/api/src/redaction.ts
296f693bec3e76ee941a007879043ce5 *apps/api/src/logger.ts
````


### E7 Proposed fix applied to scratchpad copies: tests, timings, repository checksums, diff

````text
$ node <scratchpad>/t4b-proposed/apply-fix.mjs <scratchpad>/t4b-proposed   (edits the COPIES only; attempt 2, line-based)
--- redaction.ts:30
- new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]*)\\1(\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+\\4`, 'gi'),
+ new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),

--- logger.ts:73
- if (value instanceof Date) {
+ if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return `[binary ${value.byteLength} bytes]`;
  }
  if (value instanceof Date) {

--- logger.ts:125
- const record: Record<string, unknown> = { time: now().toISOString(), level, msg };
+ const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };

[exit=0]

$ (cd <scratchpad>/t4b-proposed && node --test redaction.test.ts logger.test.ts proposed-fix.test.ts)
✔ writes one JSON object per line with time, level, msg and fields (3.6864ms)
✔ filters below the configured level (0.2821ms)
✔ silent emits nothing (0.124ms)
✔ passes the level to the sink so warn/error can go to stderr (0.1435ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.7967ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.3667ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.5363ms)
✔ ordinary string fields are scrubbed too (0.1401ms)
✔ serialises errors with name, message and stack (0.2339ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.2924ms)
✔ fields cannot overwrite time, level or msg (0.2174ms)
✔ child loggers add bindings, and call fields take precedence (0.1683ms)
✔ D1: scrubText stays fast on adversarial inputs (< 50 ms each) (33.7547ms)
✔ D1: long sensitive keys (up to 32 chars either side of the keyword) are still redacted (0.2954ms)
✔ D2: binary values are summarised, never logged byte by byte (3.5387ms)
✔ D3: the msg field is scrubbed (0.2269ms)
✔ scrubText removes database URL credentials and query values (1.5708ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.2417ms)
✔ scrubText removes Authorization header values and JWTs (0.1048ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.1784ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.1711ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.2531ms)
✔ scrubText caps very long text (4.0249ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.579ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.9482ms)
✔ serializeError limits stack frames (0.8609ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.67ms)
✔ serializeError includes scrubbed cause messages (0.3921ms)
✔ serializeError summarises AggregateError members (at most 5) (1.0015ms)
✔ serializeError handles non-Error values without dumping objects (0.1682ms)
✔ serializeError rejects unsafe code values (0.2193ms)
ℹ tests 31
ℹ pass 31
ℹ fail 0
[exit=0]

$ (cd <scratchpad>/t4b-proposed && node timing.mjs)   (adversarial timings, proposed copy)
otp x666                     5.68 ms
tokenx x333                  3.78 ms
token x400                   3.80 ms
password x250                3.10 ms
/otp x666 (path)             5.34 ms
secret_ x285                 3.67 ms
token + 50 spaces x36        0.03 ms
[exit=0]

$ md5sum apps/api/src/redaction.ts apps/api/src/logger.ts   (repository files: must be unchanged)
1701804d2d6d60e30cfbba84ccaa83b8 *apps/api/src/redaction.ts
296f693bec3e76ee941a007879043ce5 *apps/api/src/logger.ts

$ diff -u apps/api/src/redaction.ts <scratchpad>/t4b-proposed/redaction.ts; diff -u apps/api/src/logger.ts <scratchpad>/t4b-proposed/logger.ts
--- apps/api/src/redaction.ts	2026-10-24 04:33:00.059724600 +0530
+++ <scratchpad>/t4b-proposed/redaction.ts	2026-10-24 04:56:40.845101400 +0530
@@ -27,7 +27,7 @@
   [/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
   // key=value, key: value and "key":"value" where the key looks sensitive
   [
-    new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]*)\\1(\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+\\4`, 'gi'),
+    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
     `$1$2$1$3$4${REDACTED}$4`,
   ],
   // JSON Web Tokens
--- apps/api/src/logger.ts	2026-10-24 04:33:19.789480400 +0530
+++ <scratchpad>/t4b-proposed/logger.ts	2026-10-24 04:56:40.849097200 +0530
@@ -70,6 +70,9 @@
   if (depth >= MAX_DEPTH) {
     return '[Truncated]';
   }
+  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
+    return `[binary ${value.byteLength} bytes]`;
+  }
   if (value instanceof Date) {
     return value.toISOString();
   }
@@ -119,7 +122,7 @@
     if (LEVEL_RANK[level] < threshold) {
       return;
     }
-    const record: Record<string, unknown> = { time: now().toISOString(), level, msg };
+    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
     const extra = sanitiseObject({ ...bindings, ...fields }, 0, new WeakSet());
     for (const [key, val] of Object.entries(extra)) {
       // Fields can never overwrite the core time/level/msg keys.
````


### E8 Residual heuristic gaps (repository redaction.ts, read-only, synthetic values)

````text
$ node <scratchpad>/t4b-residual.mjs apps/api/src/redaction.ts   (repository file, read-only; synthetic inputs)
"call +91 98765 43210 now"                   -> "call +91 98765 43210 now"
"call 98765-43210 now"                       -> "call 98765-43210 now"
"call +919876543210 now"                     -> "call [REDACTED_NUMBER] now"
"key_secret=AbCdEf1234567890XyZ12345"        -> "key_secret=[REDACTED]"
"secret AbCdEf1234567890XyZ12345"            -> "secret AbCdEf1234567890XyZ12345"
"name Ramesh Patel, village Example"         -> "name Ramesh Patel, village Example"
[exit=0]
````


### E9 react-aria-components registry metadata (nothing installed)

````text
$ npm view react-aria-components version peerDependencies time.modified --json   (registry metadata only; nothing installed)
{
  "version": "1.22.1",
  "peerDependencies": {
    "react": "^16.8.0 || ^17.0.0-rc.1 || ^18.0.0 || ^19.0.0-rc.1",
    "react-dom": "^16.8.0 || ^17.0.0-rc.1 || ^18.0.0 || ^19.0.0-rc.1"
  },
  "time.modified": "2026-10-09T20:23:50.090Z"
}
[exit=0]

$ npm view react-aria-components dist.unpackedSize dependencies --json
{
  "dist.unpackedSize": 6935582,
  "dependencies": {
    "react-aria": "3.53.1",
    "client-only": "^0.0.1",
    "@swc/helpers": "^0.5.0",
    "react-stately": "3.51.0",
    "@react-types/shared": "^3.37.0",
    "@internationalized/date": "^3.12.4",
    "use-sync-external-store": "^1.6.0",
    "@internationalized/string": "^3.2.10"
  }
}
[exit=0]
````


### E10 npm run check (repository unchanged)

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

✔ GET /health returns 200 and reports the database as not configured (63.0962ms)
✔ responses carry security headers and are not cacheable (6.2821ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (8.0825ms)
✔ unknown routes return the JSON error envelope with the request ID (4.255ms)
✔ error responses carry the same security headers as successful ones (9.7833ms)
✔ unsupported methods on known paths are not found (9.0625ms)
✔ the access log records path and status but never the query string (55.4369ms)
✔ health checks are logged at debug level only (69.7952ms)
✔ uses safe defaults when nothing is configured (1.5291ms)
✔ accepts valid explicit values (whitespace trimmed) (0.2893ms)
✔ treats empty values as unset (0.1654ms)
✔ rejects non-integer API_PORT "abc" (0.611ms)
✔ rejects non-integer API_PORT "12.5" (0.1931ms)
✔ rejects non-integer API_PORT "-1" (0.1733ms)
✔ rejects non-integer API_PORT "4000x" (0.1296ms)
✔ rejects out-of-range API_PORT 0 (1.2011ms)
✔ rejects out-of-range API_PORT 65536 (0.1635ms)
✔ rejects out-of-range API_PORT 70000 (0.1558ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.1602ms)
✔ rejects an unknown LOG_LEVEL (0.1023ms)
✔ reports every problem at once (0.2078ms)
✔ unexpected errors return a generic 500 without internal details (60.7339ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (7.8073ms)
✔ client errors carrying a raw request body are logged without the body (7.9452ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (7.5413ms)
✔ client errors keep their status with a generic message (17.4461ms)
✔ client errors are logged at warn, not error (2.6402ms)
✔ non-Error values passed to next() are treated as 500 (3.0763ms)
✔ writes one JSON object per line with time, level, msg and fields (3.2652ms)
✔ filters below the configured level (0.2044ms)
✔ silent emits nothing (0.1348ms)
✔ passes the level to the sink so warn/error can go to stderr (0.8265ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.5084ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (0.8888ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.4293ms)
✔ ordinary string fields are scrubbed too (0.1603ms)
✔ serialises errors with name, message and stack (0.2353ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.3507ms)
✔ fields cannot overwrite time, level or msg (0.1451ms)
✔ child loggers add bindings, and call fields take precedence (0.1287ms)
✔ scrubText removes database URL credentials and query values (1.7257ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.2425ms)
✔ scrubText removes Authorization header values and JWTs (0.1089ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.0902ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (1.1319ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.2687ms)
✔ scrubText caps very long text (7.8116ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.299ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.4141ms)
✔ serializeError limits stack frames (0.8096ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.9907ms)
✔ serializeError includes scrubbed cause messages (0.5052ms)
✔ serializeError summarises AggregateError members (at most 5) (1.1452ms)
✔ serializeError handles non-Error values without dumping objects (0.2383ms)
✔ serializeError rejects unsafe code values (0.3175ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (1210.2723ms)
✔ starts, logs a structured "listening" line and serves /health (639.8567ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (354.2251ms)
ℹ tests 58
ℹ suites 0
ℹ pass 58
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2573.8672

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 85ms

  Creating an optimized production build ...
✓ Compiled successfully in 2.2s
  Running TypeScript ...
  Finished TypeScript in 2.5s ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 1092ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]
````


### E11 Unexplained SVG files: metadata and first bytes only

````text
$ ls -la --time-style=full-iso Kulvriksh-V3-*.svg; md5sum Kulvriksh-V3-*.svg
-rw-r--r-- 1 HEEL PATEL 197121 6754869 2026-10-24 04:51:47.325508000 +0530 Kulvriksh-V3-Desktop-1440.svg
-rw-r--r-- 1 HEEL PATEL 197121 3264415 2026-10-24 04:51:58.342363900 +0530 Kulvriksh-V3-Mobile-390.svg
22bdff56e07c7bba6f9becbc4b38cfba *Kulvriksh-V3-Desktop-1440.svg
309f3a1a0c18e4203f456e92e85447f0 *Kulvriksh-V3-Mobile-390.svg

$ head -c 300 each (first bytes only, to identify the file type)
-- Kulvriksh-V3-Desktop-1440.svg
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-stacking-context="true" aria-owns="body1" width="1440" height="2189.234375" viewBox="0 0 1440 2189.234375"><!-- Generated by dom-to-svg from file:///tmp/claude-0/-home-claude/00fb623e-846a-532b-98c7-21a8df96c7f6/
-- Kulvriksh-V3-Mobile-390.svg
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-stacking-context="true" aria-owns="body1" width="390" height="2445.46875" viewBox="0 0 390 2445.46875"><!-- Generated by dom-to-svg from file:///tmp/claude-0/-home-claude/00fb623e-846a-532b-98c7-21a8df96c7f6/scra

$ grep -c "<image\|data:image\|<script" each
Kulvriksh-V3-Desktop-1440.svg: image/data-uri tags=24 script tags=0
Kulvriksh-V3-Mobile-390.svg: image/data-uri tags=18 script tags=0
````


### E12 Final Git state, lockfile, protected and source checksums, secret scan, .env scan, ports, processes

````text
$ git rev-parse HEAD; git log --oneline; git remote -v; git stash list
e83562484d0495ec836b9eb896c8f7dfefd6927c
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation
(no remote, no stash if nothing listed above after the log)
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
[exit=0]

$ git diff --cached --name-only; echo "(staged files end)"
(staged files end)

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo lockfile identical to committed version
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ md5sum -c   (protected specifications, earlier reports, lockfile)
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
package-lock.json: OK
[exit=0]

$ md5sum -c   (all source/config files: must equal the TASK-04B starting checksums)
apps/api/src/app.test.ts: OK
apps/api/src/app.ts: OK
apps/api/src/config.test.ts: OK
apps/api/src/config.ts: OK
apps/api/src/errors.test.ts: OK
apps/api/src/errors.ts: OK
apps/api/src/logger.test.ts: OK
apps/api/src/logger.ts: OK
apps/api/src/middleware.ts: OK
apps/api/src/redaction.test.ts: OK
apps/api/src/redaction.ts: OK
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

$ git grep -n -I -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' -e 'rzp_live_[A-Za-z0-9]{8,}' -e 'rzp_test_[A-Za-z0-9]{8,}' --untracked -- . ':!package-lock.json'
(end high-confidence secret matches)

$ git ls-files --others --exclude-standard | grep -E "(^|/)\.env($|\.)" | grep -v "\.env\.example$"; find . -name ".env*" -not -path "./node_modules/*" -not -name ".env.example"
(end .env files)

$ netstat -ano | grep LISTENING | grep -E ":(3000|3100|3101|4000|4103|4104|4199) "
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       7668
  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       19480
  TCP    [::]:4000              [::]:0                 LISTENING       19480
(end listening ports of interest)

$ wmic process where "name='node.exe'" get ProcessId,CommandLine | grep -i kulvriksh   (node processes from this repository)
(end node processes from this repository / scratchpad)
````


### E13 Probe script sources

<scratchpad>/t4b-probe.mjs

````text
// Review probe (scratchpad only; repository files are not modified).
const base = 'file:///C:/Users/HEEL%20PATEL/Desktop/KulVriksh/apps/api/src/';
const { scrubText } = await import(base + 'redaction.ts');
const { createLogger } = await import(base + 'logger.ts');

console.log('## P1 scrubText timing on adversarial inputs (input is capped at 2000 chars before the rules run)');
const inputs = {
  'plain a x2000': 'a'.repeat(2000),
  '"token" x400 (2000 chars)': 'token'.repeat(400),
  '"password" x250 (2000 chars)': 'password'.repeat(250),
  '"/token" path x333': '/token'.repeat(333),
  '"otp" x666': 'otp'.repeat(666),
  '"tokenx" x333': 'tokenx'.repeat(333),
  '"token " x333 (spaces)': 'token '.repeat(333),
  'normal path': '/workspaces/5493c663-9fbf-454b-94b1-0bac204970ef/tree',
};
for (const [name, text] of Object.entries(inputs)) {
  const t0 = process.hrtime.bigint();
  scrubText(text);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${name.padEnd(32)} ${ms.toFixed(1).padStart(10)} ms`);
}

console.log('\n## P2 binary data (Buffer) logged under an ordinary key');
const lines = [];
const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
logger.info('upload', { chunk: Buffer.from('{"otp":"482913"}') });
console.log(lines[0]?.slice(0, 300));
const bytes = JSON.parse(lines[0] ?? '{}').chunk;
const decoded = bytes && typeof bytes === 'object' ? Buffer.from(Object.values(bytes)).toString() : '(not an object)';
console.log('decoded back from the log line:', decoded);

console.log('\n## P3 msg field');
lines.length = 0;
logger.error('login failed for 9876543210 password=hunter2');
console.log(lines[0]);
````

<scratchpad>/t4b-probe2.mjs

````text
// Review probe 2 (scratchpad only): every scrub rule against crafted inputs, then end-to-end reachability.
const base = 'file:///C:/Users/HEEL%20PATEL/Desktop/KulVriksh/apps/api/src/';
const { scrubText } = await import(base + 'redaction.ts');
const { createApp } = await import(base + 'app.ts');
const { createLogger } = await import(base + 'logger.ts');
const { createServer } = await import('node:http');

console.log('## P4 per-rule crafted inputs (each 2000 chars or capped to 2000)');
const crafted = {
  'url-cred: "a://" + "a:" x998': 'a://' + 'a:'.repeat(998),
  'url-cred: "a://" x500': 'a://'.repeat(500),
  'query: "?a" x1000': '?a'.repeat(1000),
  'query: "?" x2000': '?'.repeat(2000),
  'bearer: "Bearer " x285': 'Bearer '.repeat(285),
  'kv-quotes: "\'token" x333': "'token".repeat(333),
  'kv-quotes: "\\"otp" x500': '"otp'.repeat(500),
  'kv: "token:" x333': 'token:'.repeat(333),
  'jwt: "eyJ" x666': 'eyJ'.repeat(666),
  'email: "a" x1000 + "@" + "a." x499': 'a'.repeat(1000) + '@' + 'a.'.repeat(499),
  'email: "a@" x1000': 'a@'.repeat(1000),
  'email: "a.a@a" x400': 'a.a@a'.repeat(400),
  'otp-rule: "otp " x500': 'otp '.repeat(500),
  'phone: "1" x2000': '1'.repeat(2000),
  'phone: "1a" x1000': '1a'.repeat(1000),
  'long-token: "a1" x1000': 'a1'.repeat(1000),
};
for (const [name, text] of Object.entries(crafted)) {
  const t0 = process.hrtime.bigint();
  scrubText(text);
  console.log(`${name.padEnd(42)} ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1).padStart(9)} ms`);
}

console.log('\n## P5 end-to-end: unauthenticated GET with a crafted path, then a /health request');
const logger = createLogger({ level: 'info', sink: () => {} });
const server = createServer(createApp({ logger }));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const url = (p) => `http://127.0.0.1:${port}${p}`;
const timed = async (label, p) => {
  const t0 = Date.now();
  const res = await fetch(url(p));
  await res.arrayBuffer();
  console.log(`${label.padEnd(48)} status ${res.status}  ${String(Date.now() - t0).padStart(6)} ms`);
};
await timed('baseline GET /health', '/health');
const attack = '/' + 'otp'.repeat(666);
console.log('attack path length:', attack.length);
const attackDone = timed('GET /<"otp" x666> (crafted path, 404)', attack);
await new Promise((r) => setTimeout(r, 20));
await timed('GET /health sent ~20 ms after the attack', '/health');
await attackDone;
server.closeAllConnections();
await new Promise((r) => server.close(r));
````

<scratchpad>/t4b-server.mjs

````text
// Scratchpad-only server: the real createApp with an info-level logger discarding output.
const base = 'file:///C:/Users/HEEL%20PATEL/Desktop/KulVriksh/apps/api/src/';
const { createApp } = await import(base + 'app.ts');
const { createLogger } = await import(base + 'logger.ts');
const { createServer } = await import('node:http');
const server = createServer(createApp({ logger: createLogger({ level: 'info', sink: () => {} }) }));
server.listen(Number(process.argv[2]), '127.0.0.1', () => console.log('probe server listening'));
````

<scratchpad>/t4b-residual.mjs

````text
// Read-only probe of the repository's scrubText for known heuristic gaps (synthetic values only).
const { scrubText } = await import(process.argv[2]);
for (const s of ['call +91 98765 43210 now', 'call 98765-43210 now', 'call +919876543210 now', 'key_secret=AbCdEf1234567890XyZ12345', 'secret AbCdEf1234567890XyZ12345', 'name Ramesh Patel, village Example']) {
  console.log(JSON.stringify(s).padEnd(44), '->', JSON.stringify(scrubText(s)));
}
````

<scratchpad>/t4b-proposed/apply-fix.mjs

````text
// Applies the PROPOSED fix to the scratchpad copies only (line-based, no complex escaping).
import { readFileSync, writeFileSync } from 'node:fs';
const dir = process.argv[2];
function editLine(file, marker, transform) {
  const lines = readFileSync(`${dir}/${file}`, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.includes(marker));
  if (i < 0) throw new Error(`marker not found in ${file}: ${marker}`);
  const before = lines[i];
  lines[i] = transform(before);
  if (lines[i] === before) throw new Error(`no change made in ${file} at line ${i + 1}`);
  writeFileSync(`${dir}/${file}`, lines.join('\n'));
  console.log(`--- ${file}:${i + 1}\n- ${before.trim()}\n+ ${lines[i].trim()}\n`);
}
// D1: bound the quantifiers around the sensitive-word alternation and the separator whitespace.
editLine('redaction.ts', 'SENSITIVE_WORDS})', (l) =>
  l.split('[A-Za-z0-9_-]*').join('[A-Za-z0-9_-]{0,32}').split('\\s*').join('\\s{0,10}'));
// D2: summarise binary data instead of walking it byte by byte.
editLine('logger.ts', 'if (value instanceof Date) {', (l) =>
  "  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {\n    return `[binary ${value.byteLength} bytes]`;\n  }\n" + l);
// D3: scrub the message text as well.
editLine('logger.ts', 'level, msg };', (l) => l.replace('level, msg };', 'level, msg: scrubText(msg) };'));
````

<scratchpad>/t4b-proposed/timing.mjs

````text
const { scrubText } = await import(new URL('./redaction.ts', import.meta.url));
for (const [n, t] of Object.entries({ 'otp x666': 'otp'.repeat(666), 'tokenx x333': 'tokenx'.repeat(333), 'token x400': 'token'.repeat(400), 'password x250': 'password'.repeat(250), '/otp x666 (path)': '/' + 'otp'.repeat(666), 'secret_ x285': 'secret_'.repeat(285), 'token + 50 spaces x36': ('token' + ' '.repeat(50)).repeat(36) })) {
  const t0 = process.hrtime.bigint(); scrubText(t); console.log(`${n.padEnd(24)} ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(2).padStart(8)} ms`);
}
````


### E14 Proposed regression tests (scratchpad t4b-proposed/proposed-fix.test.ts)

<scratchpad>/t4b-proposed/proposed-fix.test.ts

````text
// Tests for the proposed fix (scratchpad only).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrubText } from './redaction.ts';
import { createLogger } from './logger.ts';

const ADVERSARIAL = ['otp'.repeat(666), 'tokenx'.repeat(333), 'token'.repeat(400), 'password'.repeat(250), '/' + 'otp'.repeat(666), 'secret_'.repeat(285)];

test('D1: scrubText stays fast on adversarial inputs (< 50 ms each)', () => {
  for (const input of ADVERSARIAL) {
    const t0 = process.hrtime.bigint();
    scrubText(input);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 50, `${input.slice(0, 12)}… took ${ms.toFixed(1)} ms`);
  }
});

test('D1: long sensitive keys (up to 32 chars either side of the keyword) are still redacted', () => {
  const out = scrubText('x_razorpay_webhook_signature_header_v2=abcd1234 MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t');
  assert.doesNotMatch(out, /abcd1234|s3cr3t/);
});

test('D2: binary values are summarised, never logged byte by byte', () => {
  const lines: string[] = [];
  const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
  logger.info('upload', { chunk: Buffer.from('{"otp":"482913"}'), view: new Uint8Array(4), raw: new ArrayBuffer(8) });
  const line = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
  assert.equal(line.chunk, '[binary 16 bytes]');
  assert.equal(line.view, '[binary 4 bytes]');
  assert.equal(line.raw, '[binary 8 bytes]');
});

test('D3: the msg field is scrubbed', () => {
  const lines: string[] = [];
  const logger = createLogger({ level: 'debug', sink: (l) => lines.push(l) });
  logger.error('login failed for 9876543210 password=hunter2');
  assert.doesNotMatch(lines[0] ?? '', /9876543210|hunter2/);
});
````

