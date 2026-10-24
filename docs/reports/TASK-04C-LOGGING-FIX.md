# TASK-04C — Fix Logging ReDoS, Binary Disclosure and Message Scrubbing

| Item | Value |
|---|---|
| Task ID | TASK-04C |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Approved scope | Fix D1, D2 and D3 from TASK-04B only |
| Source files changed | `apps/api/src/redaction.ts`, `apps/api/src/logger.ts` |
| Test files changed | `apps/api/src/redaction.test.ts`, `apps/api/src/logger.test.ts` |
| File created | This report |
| Status | **Completed. Awaiting technical review.** `npm run check` passes: exit 0, **62 tests, 62 pass, 0 fail**. Nothing was staged or committed. |

---

## 1. Summary

| Defect | Fix | Result |
|---|---|---|
| **D1** — ReDoS in the key-value redaction rule | In the rule's pattern, `[A-Za-z0-9_-]*` became `{0,32}` and `\s*` became `\s{0,10}` | The worst crafted input fell from **4,603.9 ms to 7.7 ms** (E8), and 298 crafted 2,000-character inputs all took **≤ 6.04 ms** (E2). <br>End to end, with the server in its own process, `/health` during an attack now takes **1.1–1.6 ms**, against **2,488 ms** before (E5). |
| **D2** — binary values logged byte by byte | `ArrayBuffer` and any `ArrayBufferView` (Buffer, typed arrays, DataView) are logged as `[binary N bytes]`, before generic traversal | The logged value is a string, so **the original bytes cannot be rebuilt from the log** (E8 P2, plus the regression test). |
| **D3** — `msg` not scrubbed | `msg: scrubText(msg)` | `login failed for 9876543210 password=hunter2` becomes `login failed for [REDACTED_NUMBER] password=[REDACTED]`. Ordinary messages are unchanged (E8 P3, plus the test). |

The fix is exactly the patch reviewed in TASK-04B §3.3, plus two explanatory comment lines.

**Two things went wrong along the way. Both are disclosed below:**
- One new test I wrote failed at first. Its expectation was wrong; the fix was not at fault (§4.3, E2 and E3).
- My end-to-end probe script failed twice before it worked: a path bug, then a shell quoting bug (§5.2, E6).

---

## 2. Starting state (E1)

| Item | Value |
|---|---|
| HEAD | `e83562484d0495ec836b9eb896c8f7dfefd6927c` on `main` |
| Remote | None |
| Stash | Empty |
| Staged | Nothing |
| Working tree | Identical to the end of TASK-04B. 9 modified, plus 19 untracked: the TASK-04B report and the two SVG files are now untracked too. |
| `redaction.ts` | `1701804d…` (the TASK-04B baseline) |
| `logger.ts` | `296f693b…` |
| `redaction.test.ts` | `659e9fd2…` |
| `logger.test.ts` | `a5b3bc08…` |

---

## 3. The patch (exact diff in E9)

### 3.1 `apps/api/src/redaction.ts` (D1)

```diff
-  // key=value, key: value and "key":"value" where the key looks sensitive
+  // key=value, key: value and "key":"value" where the key looks sensitive.
+  // Quantifiers are bounded: unbounded runs around the keyword backtrack catastrophically (ReDoS).
   [
-    new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]*)\\1(\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+\\4`, 'gi'),
+    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
```

**Why this removes the ReDoS.** The keyword alternation sits between two `[A-Za-z0-9_-]` runs. With unbounded runs, every start position could try every split point of a long keyword run, roughly cubic work in total. With each run capped at 32 characters, the work at each start position is bounded by a constant, so the total is linear in the input length. The input length is already capped at 2,000 characters by `scrubText`.

### 3.2 `apps/api/src/logger.ts` (D2, D3)

```diff
   if (depth >= MAX_DEPTH) {
     return '[Truncated]';
   }
+  // Binary data (Buffer, typed arrays, ArrayBuffer) is summarised, never walked byte by byte.
+  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
+    return `[binary ${value.byteLength} bytes]`;
+  }
   if (value instanceof Date) {
...
-    const record: Record<string, unknown> = { time: now().toISOString(), level, msg };
+    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
```

**Notes:**
- **Where the binary check sits.** It runs before the `Date` check, the circular-reference check and generic object traversal, so binary data is never walked.
- **Binary values under sensitive keys.** A binary value under a sensitive key is still replaced by `[REDACTED]` first, because the key check happens before the value is examined.
- **Binary values under error keys.** Under `err`/`error`/`reason`/`cause`, a binary value takes the existing `serializeError` path, which produces `[non-Error object omitted]`.
- **Message length.** `scrubText` caps `msg` at 2,000 characters, the same limit as string fields. Message text over that length is now truncated with `…[truncated]`.

---

## 4. Tests

### 4.1 Regression tests added (4)

| File | Test | Covers |
|---|---|---|
| `redaction.test.ts` | `scrubText stays fast on adversarial inputs (ReDoS regression)` | D1. Seven crafted inputs: `otp` ×666, the request path `/` + `otp` ×666, `tokenx` ×333, `token` ×400, `password` ×250, `secret_` ×285, and `token` + 50 spaces ×36. Each must finish in **< 50 ms**. |
| `redaction.test.ts` | `scrubText still redacts long sensitive key names after the quantifiers were bounded` | D1, no loss of redaction for reasonable keys. A 35-character key (`x_razorpay_webhook_signature_header`), `MY_APP_DATABASE_PASSWORD_PRIMARY`, and a key with 40 characters before `_PASSWORD`: all their values are removed, and the key names are kept. |
| `logger.test.ts` | `binary values are summarised by size and their bytes never reach output` | D2. `Buffer`, `Uint8Array`, `Float64Array`, `DataView`, `ArrayBuffer`, and a `Buffer` nested inside an object and an array. Each must produce exactly `[binary N bytes]`. The whole output must contain no `482913`, no byte-indexed key (`"0":`) and no byte sequence (`123,34`). |
| `logger.test.ts` | `the msg text is scrubbed, keeping its useful context` | D3. The exact scrubbed output is asserted, and an ordinary message (`request completed`) must stay unchanged. |

### 4.2 The tests detect the defects (E4)

I ran the same two test files against **byte-exact reconstructions of the pre-fix source files**. The reconstructed `logger.ts` has md5 `296f693b…`, and the rebuilt `redaction.ts` has md5 `1701804d…` (E9). Against those files:

- **28 pass, 3 fail:**
  - D1: `"otp" x666 took 1385.5 ms`
  - D2: an assertion failure
  - D3: an assertion failure
- Against the fixed repository code: **31 of 31 pass.**

### 4.3 Disclosed: one new test failed at first (E2, E3)

My first version of the long-key test also asserted that the key name `x_razorpay_webhook_signature_header_v2` survives. It did not survive; the output was `[REDACTED][REDACTED]`.

**Cause:** a separate, pre-existing rule redacts any token of 32 or more `[A-Za-z0-9_+]` characters that mixes letters and digits. A 38-character name ending in `v2` matches that rule.

**Proof that the fix is not involved (E3):** the same input gives the **same output under the original, unbounded rule**. The reconstructed original rule line is byte-identical to the one recorded in TASK-04B E7. The secret was removed in both cases.

**Action taken:**
- I corrected the test's expectation: it now uses a long key name without a digit, with a comment explaining why.
- The fix itself was not changed.
- The over-redaction is recorded as residual risk R-6.

### 4.4 Full suite

`npm run check` (E7): typecheck **PASS**, lint **PASS**, test **PASS (62 tests, 62 pass, 0 fail)**, build **PASS** (API `tsc` and `next build`). Exit 0. That is 58 earlier tests plus the 4 new ones.

---

## 5. Timings and method

### 5.1 Unit level

**Method:** `scrubText` is called directly, in a dedicated Node process, with no HTTP server running. Time is measured with `process.hrtime.bigint()` around each call.

| Input (2,000 characters) | Before (TASK-04B E2) | After (E8, the same probe re-run) | After (E2, min–max of 5 runs) |
|---|---|---|---|
| `otp` ×666 | 4,603.9 ms | 7.7 ms | 5.37–5.96 ms |
| `tokenx` ×333 | 3,846.8 ms | 5.1 ms | 3.91–4.88 ms |
| `token` ×400 | 1,043.9 ms | 5.9 ms | 3.91–4.85 ms |
| `password` ×250 | 532.2 ms | 5.1 ms | 3.12–4.16 ms |
| `/` + `otp` ×666 (as a request path) | ≈ 1,976 ms in-process (TASK-04B E3) | — | 5.19–6.02 ms |

**Wider sweep (E2):**
- **Inputs:** 298 crafted 2,000-character inputs. These are every sensitive keyword (17 spellings) repeated with each of 17 separators (`''`, `x`, `_`, `-`, `=`, `:`, space, quotes, `= `, `: `, `=x`, `"=`, ` = `, `/`, `?`, `&`), plus nine crafted inputs aimed at the other rules.
- **Result:** the worst was **6.04 ms** (`otp-` repeated). None exceeded the 20 ms reporting threshold.

**Test threshold of 50 ms.** That is about 6–10 times the measured worst case, which leaves headroom on a slower CI machine. It is also 10–90 times below the pre-fix timings, so a regression is still caught.

### 5.2 End to end, without sharing the server's event loop (E5)

**Method:**
- The server is the real `createApp` with a real info-level logger whose output is discarded (`t4b-server.mjs`). It runs as a **child process**.
- The client runs in the parent process, so the two never share an event loop. This avoids the invalid in-process measurement disclosed in TASK-04B.
- The parent started and stopped its own child process.
- Port 4199 was free before and after the run.

| Measurement | Before (TASK-04B E4) | After (E5) |
|---|---|---|
| `/health` sent shortly after one crafted request (path length 1,999) | **2,488 ms** | **1.1–1.6 ms** over 5 runs |
| The crafted request itself | 404 in 3 ms | 404 in 1.0–2.9 ms |
| `/health` during a burst of 20 concurrent crafted requests | not measured | **94.1 ms**; the slowest crafted request took 109.8 ms |

The burst figure is roughly 20 × 5 ms of bounded scrubbing. That is the residual cost noted as R-5: bounded, but not zero.

**Probe-script failures, disclosed (E6):**
- **Attempt 1:** a path-conversion bug in my script (`%7E` in a Windows path) meant the server child never started.
- **Attempt 2:** a `sed` quoting error in the masking pipe lost all of the run's output, and no measurement was recorded. Afterwards I confirmed that no probe process was left running and that port 4199 was free.
- **Attempt 3:** succeeded, with the server script path passed as an argument and no pipe. Those are the results above.

---

## 6. Binary content cannot be reconstructed

- **Probe (E8 P2):** the unchanged TASK-04B probe now logs `"chunk":"[binary 16 bytes]"`, and its decode step reports `(not an object)`. Before the fix, it decoded `{"otp":"482913"}` exactly.
- **Regression test:** the test asserts the summary string for all six binary forms. It also asserts that the full serialised output contains neither the secret, nor any byte-indexed key, nor the byte sequence.
- **What remains in the log:** only the byte length, which reveals nothing about the content.

---

## 7. Residual risks

**R-1 to R-5 from TASK-04B §3.4 still apply, unchanged:**
- R-1: phone numbers with spaces or dashes are not redacted
- R-2: a bare secret after a word, with no `=`/`:`, is not redacted
- R-3: names and addresses cannot be detected
- R-4: the heuristics need review when providers are added
- R-5: scrubbing has a bounded synchronous cost

**New:**

| ID | Risk | Evidence | Assessment and suggested handling |
|---|---|---|---|
| R-6 | A key name of 32 or more characters that mixes letters and digits is itself redacted by the long-token rule. | E3 | **Pre-existing, unchanged by this fix.** It over-redacts, so it is safe, but it hides the key name in diagnostics. No action proposed. |
| R-7 | **Coverage trade-off of the bound.** In free text, a sensitive keyword followed by **more than 32** key characters before `=`/`:`, or a separator followed by **more than 10** whitespace characters before the value, is no longer redacted. The original unbounded rule redacted both. A long **prefix** before the keyword is still covered, because the match can start later in the name. | E10 | This is the expected cost of bounding, and it is narrow: such keys and spacing are unusual. **Named log fields are unaffected**, because they are redacted by field name (`isSensitiveKey`) before any text scrubbing. **Decision for the reviewer:** accept as is, or raise the suffix bound (for example to `{0,64}`) in a separately approved change. That would need re-measuring. **I did not change it**, because it is outside the reviewed fix. |
| R-8 | `SharedArrayBuffer` is not matched by `instanceof ArrayBuffer`. | By inspection | `Object.entries` of a `SharedArrayBuffer` is empty, so it is logged as `{}` and no bytes leak. Nothing in the API uses it. No action proposed. |

**No other security issue was found** in the course of this task.

---

## 8. Validation summary

| Check | Result | Evidence |
|---|---|---|
| `npm run check`: typecheck, lint, test, build | **PASS.** Exit 0; 62 tests, 62 pass, 0 fail. | E7 |
| D1 regression tests, ReDoS and long keys | **PASS** on the fixed code; **FAIL** on the pre-fix code, as expected | E4 |
| D2 regression test, binary data | **PASS** on the fixed code; **FAIL** on the pre-fix code | E4 |
| D3 regression test, `msg` | **PASS** on the fixed code; **FAIL** on the pre-fix code | E4 |
| Adversarial sweep (298 inputs) | **PASS.** Worst 6.04 ms. | E2 |
| End to end with the server in a separate process | **PASS.** `/health` 1.1–1.6 ms during an attack. | E5 |
| Binary content not reconstructable | **PASS** | E8, the test |
| Lockfile unchanged | **PASS.** `90c261c4…`, identical to the committed version. | E11 |
| Dependencies unchanged | **PASS.** Every `package.json` is unchanged since the start of the task (root, `apps/api`, `apps/web` md5 OK; `packages/shared/package.json` not modified per `git status`). Nothing was installed. | E11 |
| Protected specifications and every earlier report, including TASK-04B, byte-identical | **PASS.** 12 of 12 `md5sum -c` OK. | E11 |
| SVG files untouched | **PASS.** Both md5 OK. | E11 |
| Every other source and configuration file unchanged | **PASS.** 20 of 20 `md5sum -c` OK. | E11 |
| Exactly 4 source and test files changed | **PASS.** See the diffs in E9 and the new checksums in E11. | E9, E11 |
| Secret scan (private keys, AWS keys, Razorpay live and test keys) | **PASS.** No matches. The SVGs were excluded this time; they were scanned with no matches in TASK-04B E12 and are byte-identical since. | E11 |
| `.env` files | **PASS.** None, other than `.env.example`. | E11 |
| Nothing staged; HEAD unchanged | **PASS** | E11 |
| Stray processes | **PASS.** No probe or repository `node.exe` is running. Ports 3000 and 4000 are held only by the other projects' PIDs 7668 and 19480. Port 4199 is free. | E5, E11 |

**One disclosure about E11:** the heading of the dependency step shows a `grep … | md5sum` that was **not executed**. Only the `md5sum` of the `package.json` files ran, and that is the result relied on above.

### Final `git status` (E11)

It is unchanged from the start of the task. The four changed files were already untracked from TASK-04 and TASK-04A, so they still show as `??`; their contents changed, as the checksums show. This report adds one more untracked file.

| File | md5 before | md5 after |
|---|---|---|
| `apps/api/src/redaction.ts` | `1701804d2d6d60e30cfbba84ccaa83b8` | `8f5c43ceb3f00f2acffcd99449bcf588` |
| `apps/api/src/logger.ts` | `296f693bec3e76ee941a007879043ce5` | `67d53875651dbd23e372a39847be6f36` |
| `apps/api/src/redaction.test.ts` | `659e9fd2f8ad4055595c2b363ab34623` | `fc26d311a60630a353d314a51c2c1bd5` |
| `apps/api/src/logger.test.ts` | `a5b3bc082916dd3f9df724c5537699cc` | `68b3f35965f20834573b0efd6cef91a6` |

---

## 9. Confirmations

- **Nothing was staged, committed, pushed, stashed, reset or rewritten.** HEAD is still `e83562484d0495ec836b9eb896c8f7dfefd6927c`, with no remote.
- **No packages were installed, and the lockfile, dependencies and configuration are unchanged.**
- **Only the four files listed above were changed, plus this report.** All TASK-03A, TASK-04 and TASK-04A changes are preserved.
- **The protected specifications, the roadmap, the data model and every earlier report are byte-identical.**
- **Neither SVG file was touched.**
- **The commit plan was not executed.** M2, styling, React Aria, routing and database work were not started.
- All values in tests and evidence (`hunter2`, `482913`, `9876543210`, …) are synthetic.

## 10. Next approval required

1. **Technical review of this fix**, including the R-7 coverage trade-off: accept the bounds as they are, or approve a separate change.
2. Then the TASK-04B decisions that are still pending: the commit plan (§6 of TASK-04B), DS-1, DS-2, AC-14, the SVG files, the TASK-01 outcome and CP2.

I am waiting for technical review before proceeding.

---

## Appendix — Evidence (raw command output)

Paths under the session scratchpad are shown as `<scratchpad>`. Outputs are embedded byte for byte by a Node script. One exception is left unmasked on purpose: the E6 error line shows the `%7E`-encoded temporary path, because that encoding is the bug being disclosed. It is a local temporary directory, not a secret.

### E1 Starting state (Git, checksums)

````text
$ git rev-parse HEAD; git remote -v; git stash list; git diff --cached --name-only
e83562484d0495ec836b9eb896c8f7dfefd6927c
(end: no remote, no stash, nothing staged if nothing listed after HEAD)

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

$ md5sum (start of TASK-04C)
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
f1009c483b1e558ccf506a7207557e73 *docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
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
22bdff56e07c7bba6f9becbc4b38cfba *Kulvriksh-V3-Desktop-1440.svg
309f3a1a0c18e4203f456e92e85447f0 *Kulvriksh-V3-Mobile-390.svg
[exit=0]
````


### E2 First run of the new tests (1 FAILED: wrong expectation, see §4.3) and the adversarial sweep

````text
$ node --test src/redaction.test.ts src/logger.test.ts   (apps/api, repository files after the fix)
✔ writes one JSON object per line with time, level, msg and fields (18.8633ms)
✔ filters below the configured level (0.1845ms)
✔ silent emits nothing (0.1066ms)
✔ passes the level to the sink so warn/error can go to stderr (0.7736ms)
✔ redacts sensitive keys at any depth, case-insensitively (1.2348ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (2.0987ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.9842ms)
✔ ordinary string fields are scrubbed too (0.1765ms)
✔ binary values are summarised by size and their bytes never reach output (0.3409ms)
✔ the msg text is scrubbed, keeping its useful context (0.247ms)
✔ serialises errors with name, message and stack (0.2515ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.6803ms)
✔ fields cannot overwrite time, level or msg (0.1537ms)
✔ child loggers add bindings, and call fields take precedence (0.1264ms)
✔ scrubText removes database URL credentials and query values (3.8384ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.1207ms)
✔ scrubText removes Authorization header values and JWTs (1.2529ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.3067ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.1125ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.2321ms)
✔ scrubText stays fast on adversarial inputs (ReDoS regression) (28.5713ms)
✖ scrubText still redacts long sensitive key names after the quantifiers were bounded (1.1771ms)
✔ scrubText caps very long text (2.9602ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.0221ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.2536ms)
✔ serializeError limits stack frames (0.1692ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.3872ms)
✔ serializeError includes scrubbed cause messages (0.2426ms)
✔ serializeError summarises AggregateError members (at most 5) (0.608ms)
✔ serializeError handles non-Error values without dumping objects (0.5637ms)
✔ serializeError rejects unsafe code values (0.3346ms)
ℹ tests 31
ℹ pass 30
ℹ fail 1
✖ failing tests:
✖ scrubText still redacts long sensitive key names after the quantifiers were bounded (1.1771ms)
  AssertionError [ERR_ASSERTION]: [REDACTED][REDACTED] MY_APP_DATABASE_PASSWORD_PRIMARY: [REDACTED] AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_PASSWORD=[REDACTED]
[exit=1]

$ node <scratchpad>/t4c-sweep.mjs apps/api/src/redaction.ts   (separate process, no server)
inputs: 298 (each 2000 chars, the scrubText cap); worst: "otp-" repeated 6.04 ms; threshold for "SLOW" lines: 20 ms

reference timings (same inputs as TASK-04B E2):
"otp" x666           min 5.37 ms  max 5.96 ms  (5 runs)
"tokenx" x333        min 3.91 ms  max 4.88 ms  (5 runs)
"token" x400         min 3.91 ms  max 4.85 ms  (5 runs)
"password" x250      min 3.12 ms  max 4.16 ms  (5 runs)
"/" + "otp" x666     min 5.19 ms  max 6.02 ms  (5 runs)
[exit=0]
````


### E3 Key-name check: reconstructed ORIGINAL rule vs FIXED rule (the reconstructed file differs from 1701804d only by the new comment; rule line proven identical)

````text
$ md5sum + diff: reconstructed ORIGINAL rule vs the TASK-04B baseline (must match 1701804d...)
f57da874526efc558ab109206548c8fb *<scratchpad>/t4c-original/redaction.ts

$ node <scratchpad>/t4c-keycheck.mjs <original> <fixed>
"x_razorpay_webhook_signature_header_v2=abcd1234"
  original: "[REDACTED][REDACTED]"
  fixed:    "[REDACTED][REDACTED]"
"x_razorpay_webhook_signature_header=abcd1234"
  original: "x_razorpay_webhook_signature_header=[REDACTED]"
  fixed:    "x_razorpay_webhook_signature_header=[REDACTED]"
"MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t"
  original: "MY_APP_DATABASE_PASSWORD_PRIMARY: [REDACTED]"
  fixed:    "MY_APP_DATABASE_PASSWORD_PRIMARY: [REDACTED]"
"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_PASSWORD=pw40long"
  original: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_PASSWORD=[REDACTED]"
  fixed:    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_PASSWORD=[REDACTED]"
[exit=0]
$ diff <scratchpad>/t4c-original/redaction.ts apps/api/src/redaction.ts   (only the rule line may differ)
31c31
<     new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]*)\\1(\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+\\4`, 'gi'),
---
>     new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),

$ reconstructed rule line == TASK-04B E7 original line 30?
IDENTICAL to the original line recorded in TASK-04B E7
````


### E4 New tests vs byte-exact PRE-FIX code (must fail) and vs the FIXED repository code (must pass)

````text
$ md5sum <scratchpad>/t4c-original/logger.ts   (reconstructed pre-fix logger; TASK-04B baseline was 296f693b...)
296f693bec3e76ee941a007879043ce5 *<scratchpad>/t4c-original/logger.ts

$ (cd <scratchpad>/t4c-original && node --test redaction.test.ts logger.test.ts)   NEW tests vs PRE-FIX code: must FAIL on D1, D2, D3
✖ binary values are summarised by size and their bytes never reach output (2.0774ms)
✖ the msg text is scrubbed, keeping its useful context (0.4111ms)
✖ scrubText stays fast on adversarial inputs (ReDoS regression) (1386.1052ms)
ℹ tests 31
ℹ pass 28
ℹ fail 3
✖ failing tests:
✖ binary values are summarised by size and their bytes never reach output (2.0774ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
✖ the msg text is scrubbed, keeping its useful context (0.4111ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
✖ scrubText stays fast on adversarial inputs (ReDoS regression) (1386.1052ms)
  AssertionError [ERR_ASSERTION]: "otp" x666 took 1385.5 ms
[exit=0]

$ (cd apps/api && node --test src/redaction.test.ts src/logger.test.ts)   NEW tests vs the FIXED repository code
✔ writes one JSON object per line with time, level, msg and fields (3.9548ms)
✔ filters below the configured level (0.5088ms)
✔ silent emits nothing (0.2429ms)
✔ passes the level to the sink so warn/error can go to stderr (1.2613ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.4198ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (0.7901ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.3731ms)
✔ ordinary string fields are scrubbed too (0.12ms)
✔ binary values are summarised by size and their bytes never reach output (0.2788ms)
✔ the msg text is scrubbed, keeping its useful context (0.1742ms)
✔ serialises errors with name, message and stack (0.1993ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.1831ms)
✔ fields cannot overwrite time, level or msg (0.1054ms)
✔ child loggers add bindings, and call fields take precedence (0.0948ms)
✔ scrubText removes database URL credentials and query values (1.1203ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.1502ms)
✔ scrubText removes Authorization header values and JWTs (0.0765ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.8209ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.1083ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.1941ms)
✔ scrubText stays fast on adversarial inputs (ReDoS regression) (28.5273ms)
✔ scrubText still redacts long sensitive key names after the quantifiers were bounded (0.201ms)
✔ scrubText caps very long text (2.5004ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.0193ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.2426ms)
✔ serializeError limits stack frames (0.1883ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.388ms)
✔ serializeError includes scrubbed cause messages (0.2381ms)
✔ serializeError summarises AggregateError members (at most 5) (0.5744ms)
✔ serializeError handles non-Error values without dumping objects (0.112ms)
✔ serializeError rejects unsafe code values (0.168ms)
ℹ tests 31
ℹ pass 31
ℹ fail 0
[exit=0]
````


### E5 End-to-end: server in a child process, client in the parent (attempt 3, valid)

````text
$ netstat -ano | grep LISTENING | grep ":4199 " || echo "port 4199 free"
port 4199 free

$ node <scratchpad>/t4c-e2e.mjs 4199 <scratchpad>\t4b-server.mjs   (attempt 3; server in a child process, client in this process)
server child PID 35596 listening on 127.0.0.1:4199
baseline /health: 200 in 32.0 ms
run 1: crafted path (len 1999) 404 in 2.9 ms; /health sent 20 ms later 200 in 1.6 ms
run 2: crafted path (len 1999) 404 in 1.1 ms; /health sent 20 ms later 200 in 1.6 ms
run 3: crafted path (len 1999) 404 in 1.1 ms; /health sent 20 ms later 200 in 1.5 ms
run 4: crafted path (len 1999) 404 in 1.2 ms; /health sent 20 ms later 200 in 1.3 ms
run 5: crafted path (len 1999) 404 in 1.0 ms; /health sent 20 ms later 200 in 1.1 ms
burst: 20 concurrent crafted requests (all 404), slowest 109.8 ms; /health during burst 200 in 94.1 ms
server child exited (killed=true)
[exit=0]

$ netstat -ano | grep LISTENING | grep ":4199 " || echo "port 4199 free"
port 4199 free
````


### E6 End-to-end attempt 1 FAILED (path bug in the probe script; server never started). Attempt 2 produced no output (sed quoting error) and is not shown

````text
$ netstat -ano | grep LISTENING | grep ":4199 " || echo "port 4199 free"
port 4199 free

$ node <scratchpad>/t4c-e2e.mjs 4199   (server in a child process; client in this process)
node:internal/modules/cjs/loader:1424
  throw err;
  ^

Error: Cannot find module 'C:\Users\HEELPA%7E1\AppData\Local\Temp\claude\c--Users-HEEL-PATEL-Desktop-KulVriksh\188cd3b6-033b-41f3-9501-bcff2902bb56\scratchpad\t4b-server.mjs'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1421:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1059:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1064:22)
    at Module._load (node:internal/modules/cjs/loader:1227:37)
    at TracingChannel.traceSync (node:diagnostics_channel:328:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:245:24)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v24.13.0
<scratchpad>/t4c-e2e.mjs:9
  child.on('exit', (c) => reject(new Error(`server exited early (${c})`)));
                                 ^

Error: server exited early (1)
    at ChildProcess.<anonymous> (<scratchpad>/t4c-e2e.mjs:9:34)
    at ChildProcess.emit (node:events:508:28)
    at ChildProcess._handle.onexit (node:internal/child_process:294:12)

Node.js v24.13.0
[exit=1]

$ netstat -ano | grep LISTENING | grep ":4199 " || echo "port 4199 free"
port 4199 free
````


### E7 npm run check (repository with the fix)

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

✔ GET /health returns 200 and reports the database as not configured (24.1897ms)
✔ responses carry security headers and are not cacheable (5.2968ms)
✔ every response gets a new server-generated request ID; client-supplied IDs are ignored (6.0214ms)
✔ unknown routes return the JSON error envelope with the request ID (3.6469ms)
✔ error responses carry the same security headers as successful ones (5.6025ms)
✔ unsupported methods on known paths are not found (4.9541ms)
✔ the access log records path and status but never the query string (60.8504ms)
✔ health checks are logged at debug level only (67.7507ms)
✔ uses safe defaults when nothing is configured (1.4588ms)
✔ accepts valid explicit values (whitespace trimmed) (0.1681ms)
✔ treats empty values as unset (0.0909ms)
✔ rejects non-integer API_PORT "abc" (0.4952ms)
✔ rejects non-integer API_PORT "12.5" (0.1127ms)
✔ rejects non-integer API_PORT "-1" (0.0999ms)
✔ rejects non-integer API_PORT "4000x" (0.0762ms)
✔ rejects out-of-range API_PORT 0 (0.9326ms)
✔ rejects out-of-range API_PORT 65536 (0.1261ms)
✔ rejects out-of-range API_PORT 70000 (0.1346ms)
✔ rejects an unknown NODE_ENV and lists the allowed values (0.165ms)
✔ rejects an unknown LOG_LEVEL (0.1528ms)
✔ reports every problem at once (0.2225ms)
✔ unexpected errors return a generic 500 without internal details (30.5187ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (4.7782ms)
✔ client errors carrying a raw request body are logged without the body (2.7815ms)
✔ rejected promises in async handlers are caught (Express 5) and return 500 (2.6768ms)
✔ client errors keep their status with a generic message (11.2132ms)
✔ client errors are logged at warn, not error (2.572ms)
✔ non-Error values passed to next() are treated as 500 (1.6348ms)
✔ writes one JSON object per line with time, level, msg and fields (3.1171ms)
✔ filters below the configured level (0.2271ms)
✔ silent emits nothing (0.118ms)
✔ passes the level to the sink so warn/error can go to stderr (0.2568ms)
✔ redacts sensitive keys at any depth, case-insensitively (0.4684ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (0.9669ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.4257ms)
✔ ordinary string fields are scrubbed too (0.1964ms)
✔ binary values are summarised by size and their bytes never reach output (0.515ms)
✔ the msg text is scrubbed, keeping its useful context (0.3391ms)
✔ serialises errors with name, message and stack (0.4107ms)
✔ handles circular references, bigint, dates, undefined and deep nesting (0.3802ms)
✔ fields cannot overwrite time, level or msg (0.2131ms)
✔ child loggers add bindings, and call fields take precedence (0.2243ms)
✔ scrubText removes database URL credentials and query values (2.1359ms)
✔ scrubText removes key=value, key: value and JSON pairs with sensitive keys (0.2232ms)
✔ scrubText removes Authorization header values and JWTs (0.2624ms)
✔ scrubText removes OTP codes, phone numbers and email addresses (0.2579ms)
✔ scrubText removes Razorpay-style signatures, webhook secrets and long hex digests (0.1884ms)
✔ scrubText leaves ordinary diagnostic text unchanged (0.1949ms)
✔ scrubText stays fast on adversarial inputs (ReDoS regression) (33.1142ms)
✔ scrubText still redacts long sensitive key names after the quantifiers were bounded (0.1996ms)
✔ scrubText caps very long text (3.2545ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (1.3084ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.344ms)
✔ serializeError limits stack frames (0.2164ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.4237ms)
✔ serializeError includes scrubbed cause messages (0.3519ms)
✔ serializeError summarises AggregateError members (at most 5) (1.2376ms)
✔ serializeError handles non-Error values without dumping objects (0.2393ms)
✔ serializeError rejects unsafe code values (0.3413ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (210.1892ms)
✔ starts, logs a structured "listening" line and serves /health (310.8052ms)
✔ regression (TASK-03 F1): a busy port fails with EADDRINUSE and never logs "listening" (304.7574ms)
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1038.0428

> kulvriksh-platform@0.0.0 build
> npm run build --workspaces --if-present


> @kulvriksh/api@0.0.0 build
> tsc -p tsconfig.build.json


> @kulvriksh/web@0.0.0 build
> next build

▲ Next.js 16.4.2 (Turbopack)
✓ Running next.config.ts took 75ms

  Creating an optimized production build ...
✓ Compiled successfully in 759ms
  Running TypeScript ...
  Finished TypeScript in 1612ms ...
  Collecting page data using 4 workers ...
  Generating static pages using 4 workers (0/3) ...
✓ Generating static pages using 4 workers (3/3) in 697ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content

[exit=0]
````


### E8 The unchanged TASK-04B probe re-run against the FIXED code

````text
$ node <scratchpad>/t4b-probe.mjs   (the unchanged TASK-04B probe, now against the FIXED repository code)
## P1 scrubText timing on adversarial inputs (input is capped at 2000 chars before the rules run)
plain a x2000                           6.9 ms
"token" x400 (2000 chars)               5.9 ms
"password" x250 (2000 chars)            5.1 ms
"/token" path x333                      0.1 ms
"otp" x666                              7.7 ms
"tokenx" x333                           5.1 ms
"token " x333 (spaces)                  0.2 ms
normal path                             0.0 ms

## P2 binary data (Buffer) logged under an ordinary key
{"time":"2026-10-23T23:47:44.589Z","level":"info","msg":"upload","chunk":"[binary 16 bytes]"}
decoded back from the log line: (not an object)

## P3 msg field
{"time":"2026-10-23T23:47:44.636Z","level":"error","msg":"login failed for [REDACTED_NUMBER] password=[REDACTED]"}
[exit=0]

````


### E9 Byte-exact baselines rebuilt and the exact diff of the 4 changed files

````text
$ md5sum <scratchpad>/t4c-baseline/*   (must equal the TASK-04B/TASK-04C start checksums: redaction.ts 1701804d, logger.ts 296f693b, redaction.test.ts 659e9fd2, logger.test.ts a5b3bc08)
1701804d2d6d60e30cfbba84ccaa83b8 *<scratchpad>/t4c-baseline/redaction.ts
296f693bec3e76ee941a007879043ce5 *<scratchpad>/t4c-baseline/logger.ts
659e9fd2f8ad4055595c2b363ab34623 *<scratchpad>/t4c-baseline/redaction.test.ts
a5b3bc082916dd3f9df724c5537699cc *<scratchpad>/t4c-baseline/logger.test.ts

$ diff -u <baseline>/redaction.ts apps/api/src/redaction.ts
--- <baseline>/redaction.ts	2026-10-24 05:17:05.980985500 +0530
+++ apps/api/src/redaction.ts	2026-10-24 05:13:10.217288500 +0530
@@ -25,9 +25,10 @@
   [/([?&][^=\s&#]+)=[^&\s#]*/g, `$1=${REDACTED}`],
   // HTTP authorisation schemes
   [/\b(Bearer|Basic|Digest|Token)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
-  // key=value, key: value and "key":"value" where the key looks sensitive
+  // key=value, key: value and "key":"value" where the key looks sensitive.
+  // Quantifiers are bounded: unbounded runs around the keyword backtrack catastrophically (ReDoS).
   [
-    new RegExp(`(["']?)([A-Za-z0-9_-]*(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]*)\\1(\\s*[:=]\\s*)(["']?)[^\\s"',;&}]+\\4`, 'gi'),
+    new RegExp(`(["']?)([A-Za-z0-9_-]{0,32}(?:${SENSITIVE_WORDS})[A-Za-z0-9_-]{0,32})\\1(\\s{0,10}[:=]\\s{0,10})(["']?)[^\\s"',;&}]+\\4`, 'gi'),
     `$1$2$1$3$4${REDACTED}$4`,
   ],
   // JSON Web Tokens

$ diff -u <baseline>/logger.ts apps/api/src/logger.ts
--- <baseline>/logger.ts	2026-10-24 05:17:06.051337200 +0530
+++ apps/api/src/logger.ts	2026-10-24 05:13:12.587274900 +0530
@@ -70,6 +70,10 @@
   if (depth >= MAX_DEPTH) {
     return '[Truncated]';
   }
+  // Binary data (Buffer, typed arrays, ArrayBuffer) is summarised, never walked byte by byte.
+  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
+    return `[binary ${value.byteLength} bytes]`;
+  }
   if (value instanceof Date) {
     return value.toISOString();
   }
@@ -119,7 +123,7 @@
     if (LEVEL_RANK[level] < threshold) {
       return;
     }
-    const record: Record<string, unknown> = { time: now().toISOString(), level, msg };
+    const record: Record<string, unknown> = { time: now().toISOString(), level, msg: scrubText(msg) };
     const extra = sanitiseObject({ ...bindings, ...fields }, 0, new WeakSet());
     for (const [key, val] of Object.entries(extra)) {
       // Fields can never overwrite the core time/level/msg keys.

$ diff -u <baseline>/redaction.test.ts apps/api/src/redaction.test.ts
--- <baseline>/redaction.test.ts	2026-10-24 05:17:06.096003100 +0530
+++ apps/api/src/redaction.test.ts	2026-10-24 05:14:41.033150100 +0530
@@ -65,6 +65,44 @@
   }
 });
 
+// Regression (TASK-04C, D1): inputs that took 0.5–4.6 s each before the key-value rule
+// was bounded (TASK-04B E2). scrubText is called directly, so no server shares the timing.
+const ADVERSARIAL: ReadonlyArray<readonly [string, string]> = [
+  ['"otp" x666', 'otp'.repeat(666)],
+  ['request path "/" + "otp" x666', '/' + 'otp'.repeat(666)],
+  ['"tokenx" x333', 'tokenx'.repeat(333)],
+  ['"token" x400', 'token'.repeat(400)],
+  ['"password" x250', 'password'.repeat(250)],
+  ['"secret_" x285', 'secret_'.repeat(285)],
+  ['"token" + 50 spaces x36', `token${' '.repeat(50)}`.repeat(36)],
+];
+const ADVERSARIAL_LIMIT_MS = 50;
+
+test('scrubText stays fast on adversarial inputs (ReDoS regression)', () => {
+  for (const [name, input] of ADVERSARIAL) {
+    const started = process.hrtime.bigint();
+    scrubText(input);
+    const ms = Number(process.hrtime.bigint() - started) / 1e6;
+    assert.ok(ms < ADVERSARIAL_LIMIT_MS, `${name} took ${ms.toFixed(1)} ms`);
+  }
+});
+
+test('scrubText still redacts long sensitive key names after the quantifiers were bounded', () => {
+  // Key names here have no digits: a 32+ character name that mixes letters and digits is
+  // itself replaced by the long-token rule (over-redaction, unchanged by this fix).
+  const input = [
+    'x_razorpay_webhook_signature_header=abcd1234',
+    'MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t',
+    `${'A'.repeat(40)}_PASSWORD=pw40long`,
+  ].join(' ');
+  const out = scrubText(input);
+  for (const secret of ['abcd1234', 's3cr3t', 'pw40long']) {
+    assert.ok(!out.includes(secret), `secret "${secret}" survived: ${out}`);
+  }
+  assert.ok(out.includes('x_razorpay_webhook_signature_header='), out);
+  assert.ok(out.includes('MY_APP_DATABASE_PASSWORD_PRIMARY:'), out);
+});
+
 test('scrubText caps very long text', () => {
   const out = scrubText('a'.repeat(5000));
   assert.ok(out.length < 2100);

$ diff -u <baseline>/logger.test.ts apps/api/src/logger.test.ts
--- <baseline>/logger.test.ts	2026-10-24 05:17:06.096791900 +0530
+++ apps/api/src/logger.test.ts	2026-10-24 05:13:30.207071700 +0530
@@ -117,6 +117,37 @@
   assert.equal(lines[0]?.path, '/health');
 });
 
+test('binary values are summarised by size and their bytes never reach output', () => {
+  const { logger, lines } = collect();
+  const secret = '{"otp":"482913"}';
+  logger.info('upload', {
+    chunk: Buffer.from(secret),
+    view: new Uint8Array(Buffer.from(secret)),
+    floats: new Float64Array(2),
+    data: new DataView(new ArrayBuffer(3)),
+    raw: new ArrayBuffer(8),
+    nested: { parts: [Buffer.from(secret)] },
+  });
+  const line = lines[0] ?? {};
+  assert.equal(line.chunk, '[binary 16 bytes]');
+  assert.equal(line.view, '[binary 16 bytes]');
+  assert.equal(line.floats, '[binary 16 bytes]');
+  assert.equal(line.data, '[binary 3 bytes]');
+  assert.equal(line.raw, '[binary 8 bytes]');
+  assert.deepEqual(line.nested, { parts: ['[binary 16 bytes]'] });
+  // No byte-indexed map ("0":123,...) or decoded content that could rebuild the original.
+  const out = JSON.stringify(lines);
+  assert.doesNotMatch(out, /482913|"0":|123,34/);
+});
+
+test('the msg text is scrubbed, keeping its useful context', () => {
+  const { logger, lines } = collect();
+  logger.error('login failed for 9876543210 password=hunter2');
+  logger.info('request completed');
+  assert.equal(lines[0]?.msg, 'login failed for [REDACTED_NUMBER] password=[REDACTED]');
+  assert.equal(lines[1]?.msg, 'request completed');
+});
+
 test('serialises errors with name, message and stack', () => {
   const { logger, lines } = collect();
   logger.error('failed', { err: new TypeError('bad input') });

````


### E10 Coverage at and beyond the new bounds (original vs fixed)

````text
$ node <scratchpad>/t4c-coverage.mjs <original redaction.ts> <fixed redaction.ts>
suffix 32 chars after keyword      original: redacted      fixed: redacted
suffix 40 chars after keyword      original: redacted      fixed: NOT redacted
prefix 40 chars before keyword     original: redacted      fixed: redacted
10 spaces before "="               original: redacted      fixed: redacted
11 spaces before "="               original: redacted      fixed: redacted
11 spaces after ":"                original: redacted      fixed: NOT redacted
[exit=0]
````


### E11 Final Git state, lockfile, package.json, protected and source checksums, secret scan, .env scan, ports, processes

````text
$ git rev-parse HEAD; git log --oneline; git remote -v; git stash list
e83562484d0495ec836b9eb896c8f7dfefd6927c
e835624 fix(web): let PORT choose the web port instead of hard-coding 3000
15dd95b chore: initialise M0 repository and governance foundation
(end: no remote and no stash if nothing listed after the log)

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

$ git diff --cached --name-only; echo "(staged files end)"
(staged files end)

$ md5sum package-lock.json; git diff --quiet HEAD -- package-lock.json && echo lockfile identical to committed version
90c261c42994f3f3d83a1157ec18ce8e *package-lock.json
lockfile identical to committed version
[exit=0]

$ grep -A3 "\"dependencies\"\|\"devDependencies\"" package.json apps/*/package.json packages/*/package.json | md5sum; md5sum package.json apps/*/package.json packages/*/package.json
21479ab49362e80774f48a74e9fd1fc3 *package.json
c69d04c1d356fb8c00c2a6109e0125d5 *apps/api/package.json
2f25bbf3c6119c76f91053a7e59dc5f3 *apps/web/package.json
03e58878eebb1e1ece894973405eab7b *packages/shared/package.json

$ md5sum -c   (protected specifications, all earlier reports incl. TASK-04B, lockfile, SVGs)
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
package-lock.json: OK
Kulvriksh-V3-Desktop-1440.svg: OK
Kulvriksh-V3-Mobile-390.svg: OK
[exit=0]

$ md5sum -c   (every other source/config file: must equal the TASK-04C start checksums; the 4 changed files are excluded)
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

$ md5sum apps/api/src/redaction.ts apps/api/src/logger.ts apps/api/src/redaction.test.ts apps/api/src/logger.test.ts   (the 4 changed files, new checksums)
8f5c43ceb3f00f2acffcd99449bcf588 *apps/api/src/redaction.ts
67d53875651dbd23e372a39847be6f36 *apps/api/src/logger.ts
fc26d311a60630a353d314a51c2c1bd5 *apps/api/src/redaction.test.ts
68b3f35965f20834573b0efd6cef91a6 *apps/api/src/logger.test.ts

$ git grep -n -I -E -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' -e 'AKIA[0-9A-Z]{16}' -e 'rzp_live_[A-Za-z0-9]{8,}' -e 'rzp_test_[A-Za-z0-9]{8,}' --untracked -- . ':!package-lock.json' ':!*.svg'
(end high-confidence secret matches)

$ find . -name ".env*" -not -path "./node_modules/*" -not -name ".env.example"
(end .env files)

$ netstat -ano | grep LISTENING | grep -E ":(3000|3100|4000|4199) "
  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       7668
  TCP    0.0.0.0:4000           0.0.0.0:0              LISTENING       19480
  TCP    [::]:4000              [::]:0                 LISTENING       19480
(end listening ports of interest)

$ Get-CimInstance Win32_Process node.exe | CommandLine matching KulVriksh|t4b-|t4c-
(end node processes from this repository / scratchpad)
````


### E12 Script sources (scratchpad)

The pre-fix copies in `<scratchpad>/t4c-original/` were made with inline `node -e` edits (reverting the bounds in a copy of the fixed `redaction.ts`, and removing the D2 block and `scrubText(msg)` from a copy of the fixed `logger.ts`). The resulting `logger.ts` is byte-identical to the baseline (E4), and `t4c-rebuild.mjs` restores the original comment so `redaction.ts` is byte-identical too (E9).

<scratchpad>/t4c-sweep.mjs

````text
// TASK-04C adversarial sweep (scratchpad script, read-only import of the repository's redaction.ts).
// Runs scrubText directly in its own process: no HTTP server shares this event loop.
const { scrubText } = await import(process.argv[2]);
const words = ['password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'api_key', 'api-key', 'authorization', 'authorisation', 'cookie', 'signature', 'privatekey', 'private_key', 'otp', 'sessionid', 'session_id'];
const joins = ['', 'x', '_', '-', '=', ':', ' ', '"', "'", '= ', ': ', '=x', '"=', ' = ', '/', '?', '&'];
const extras = { 'a://a:': 'a://' + 'a:'.repeat(998), '?a=': '?a='.repeat(666), 'Bearer ': 'Bearer '.repeat(285), 'eyJ.': 'eyJa.'.repeat(400), 'a.a@': 'a.a@'.repeat(500), 'otp 1': 'otp 1'.repeat(400), '+1': '+1'.repeat(1000), 'a1_': 'a1_'.repeat(666), 'spaces then =': 'token' + ' '.repeat(1990) + '=x' };
let n = 0, worst = { ms: 0, name: '' };
const runs = [];
for (const w of words) for (const j of joins) runs.push([`"${w}${j}" repeated`, (w + j).repeat(Math.ceil(2000 / (w + j).length)).slice(0, 2000)]);
for (const [k, v] of Object.entries(extras)) runs.push([k + ' repeated', v]);
for (const [name, input] of runs) {
  const t0 = process.hrtime.bigint(); scrubText(input); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  n++; if (ms > worst.ms) worst = { ms, name };
  if (ms > 20) console.log(`SLOW ${name}: ${ms.toFixed(2)} ms`);
}
console.log(`inputs: ${n} (each 2000 chars, the scrubText cap); worst: ${worst.name} ${worst.ms.toFixed(2)} ms; threshold for "SLOW" lines: 20 ms`);
console.log('\nreference timings (same inputs as TASK-04B E2):');
for (const [name, input] of [['"otp" x666', 'otp'.repeat(666)], ['"tokenx" x333', 'tokenx'.repeat(333)], ['"token" x400', 'token'.repeat(400)], ['"password" x250', 'password'.repeat(250)], ['"/" + "otp" x666', '/' + 'otp'.repeat(666)]]) {
  const samples = [];
  for (let i = 0; i < 5; i++) { const t0 = process.hrtime.bigint(); scrubText(input); samples.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  console.log(`${name.padEnd(20)} min ${Math.min(...samples).toFixed(2)} ms  max ${Math.max(...samples).toFixed(2)} ms  (5 runs)`);
}
````

<scratchpad>/t4c-keycheck.mjs

````text
// Compares one input against the ORIGINAL (unbounded, reconstructed) and FIXED key-value rule.
const original = await import(process.argv[2]);
const fixed = await import(process.argv[3]);
for (const s of ['x_razorpay_webhook_signature_header_v2=abcd1234', 'x_razorpay_webhook_signature_header=abcd1234', 'MY_APP_DATABASE_PASSWORD_PRIMARY: s3cr3t', 'A'.repeat(40) + '_PASSWORD=pw40long']) {
  console.log(JSON.stringify(s));
  console.log('  original:', JSON.stringify(original.scrubText(s)));
  console.log('  fixed:   ', JSON.stringify(fixed.scrubText(s)));
}
````

<scratchpad>/t4c-rebuild.mjs

````text
// Rebuilds the exact pre-fix redaction.ts from the reconstructed copy by restoring the original comment line.
import { readFileSync, writeFileSync } from 'node:fs';
const [from, to] = process.argv.slice(2);
const newComment = '  // key=value, key: value and "key":"value" where the key looks sensitive.\n  // Quantifiers are bounded: unbounded runs around the keyword backtrack catastrophically (ReDoS).\n';
const oldComment = '  // key=value, key: value and "key":"value" where the key looks sensitive\n';
const src = readFileSync(from, 'utf8');
if (!src.includes(newComment)) throw new Error('comment not found');
writeFileSync(to, src.replace(newComment, oldComment));
````

<scratchpad>/t4c-e2e.mjs

````text
// TASK-04C end-to-end check. The server (real createApp + real info logger, output discarded)
// runs in a CHILD process, so the client below never shares the server's event loop.
// The child is owned by this script and is stopped by it at the end.
import { spawn } from 'node:child_process';
const port = Number(process.argv[2]);
const child = spawn(process.execPath, [process.argv[3], String(port)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve, reject) => {
  child.stdout.on('data', (d) => String(d).includes('listening') && resolve());
  child.on('exit', (c) => reject(new Error(`server exited early (${c})`)));
});
console.log(`server child PID ${child.pid} listening on 127.0.0.1:${port}`);
const url = (p) => `http://127.0.0.1:${port}${p}`;
async function timed(p) { const t0 = performance.now(); const r = await fetch(url(p)); await r.arrayBuffer(); return [r.status, performance.now() - t0]; }
const attack = '/' + 'otp'.repeat(666);
const fmt = ([s, ms]) => `${s} in ${ms.toFixed(1)} ms`;
console.log('baseline /health:', fmt(await timed('/health')));
for (let i = 1; i <= 5; i++) {
  const a = timed(attack);
  await new Promise((r) => setTimeout(r, 20));
  const h = await timed('/health');
  console.log(`run ${i}: crafted path (len ${attack.length}) ${fmt(await a)}; /health sent 20 ms later ${fmt(h)}`);
}
const burst = Array.from({ length: 20 }, () => timed(attack));
await new Promise((r) => setTimeout(r, 20));
const h = await timed('/health');
const results = await Promise.all(burst);
console.log(`burst: 20 concurrent crafted requests (all ${[...new Set(results.map((r) => r[0]))].join('/')}), slowest ${Math.max(...results.map((r) => r[1])).toFixed(1)} ms; /health during burst ${fmt(h)}`);
child.kill();
await new Promise((r) => child.on('exit', r));
console.log(`server child exited (killed=${child.killed})`);
````

<scratchpad>/t4c-coverage.mjs

````text
// Coverage comparison: inputs at and beyond the new bounds, ORIGINAL vs FIXED rule (synthetic values).
const original = await import(process.argv[2]);
const fixed = await import(process.argv[3]);
const cases = {
  'suffix 32 chars after keyword': 'password_' + 'x'.repeat(31) + '=val1',
  'suffix 40 chars after keyword': 'password_' + 'x'.repeat(39) + '=val2',
  'prefix 40 chars before keyword': 'x'.repeat(40) + '_password=val3',
  '10 spaces before "="': 'token' + ' '.repeat(10) + '=val4',
  '11 spaces before "="': 'token' + ' '.repeat(11) + '=val5',
  '11 spaces after ":"': 'secret:' + ' '.repeat(11) + 'val6',
};
for (const [name, s] of Object.entries(cases)) {
  const o = original.scrubText(s).includes('val') ? 'NOT redacted' : 'redacted';
  const f = fixed.scrubText(s).includes('val') ? 'NOT redacted' : 'redacted';
  console.log(`${name.padEnd(34)} original: ${o.padEnd(13)} fixed: ${f}`);
}
````

The server script `t4b-server.mjs` and the probe `t4b-probe.mjs` are unchanged; their sources are in TASK-04B E13.
