# TASK-04F — Privacy Redaction, M1 Commits and Closeout

| Item | Value |
|---|---|
| Task ID | TASK-04F |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Approved decisions | **A:** commit 1 = `agentRules: false` plus the TASK-03 and TASK-03A reports. **B:** accept LF normalisation; `.gitattributes` unchanged. **C:** redact the personal Git email on the five documented lines, with an errata note; no history rewrite; usernames and paths left unchanged. |
| Files edited | `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`, `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md` (redaction and errata only) |
| File created | This report. It is the redaction errata record and is committed in commit 3. |
| Commits | **1** `877c4c523ce27fc06f0abbc33f3349d41651654f`, **2** `c480d090c0cb0a9f629b9561117b01d8dce3ccc1`, **3** reports, including this file. Commit 3's hash cannot appear in its own content, so it is given in the final task summary. |
| Remote / push | None. Nothing pushed. |

---

## 1. Privacy redaction (decision C)

| File | Original line | Content | Change |
|---|---|---|---|
| `TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 256 | §9 "Initialisation" narrative (Git identity) | email → `<owner-git-email>` |
| `TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 446 | `git config --global` output (`user.email=`) | email → `<owner-git-email>` |
| `TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md` | 1750 | `git log` "Author:" line | email → `<owner-git-email>` |
| `TASK-03A-M0-REVIEW-FOLLOWUP.md` | 188 | `git log` output | email → `<owner-git-email>` |
| `TASK-03A-M0-REVIEW-FOLLOWUP.md` | 189 | `git log` output | email → `<owner-git-email>` |

**Method** (E1):
- A Node script read the address from Git metadata through an environment variable, so it was never printed.
- Before changing anything, it asserted exactly one occurrence on each of the five lines and exactly five occurrences in total.
- It replaced only those occurrences, preserving each line's existing line ending.
- It inserted one errata blockquote per report, following the existing errata convention at the top of each report:
  - **TASK-03:** directly after the TASK-03A errata
  - **TASK-03A:** after the opening statement

**Correction during the task:** my first errata text in TASK-03 referred to "§2 'Initialisation'". The line sits under "## 9. Git initialisation, …", so the reference was corrected to §9 before commit (E1).

**Verification** (E1):

| Check | Result |
|---|---|
| Exact address | **0** occurrences in both reports |
| The address's local part, case-insensitive | **0** |
| `@`+domain | **0** |
| Other non-synthetic email addresses | **0** |
| Diff against the pre-redaction copies: TASK-03 | 3 lines changed and 2 added (errata plus a blank line); nothing else |
| Diff against the pre-redaction copies: TASK-03A | 2 lines changed and 2 added; nothing else |
| Carriage-return bytes | Unchanged: TASK-03 has 0, TASK-03A has 67 |
| Staged content of commit 1 | **0** occurrences |

**Disclosure:** Git Bash `grep -i -F` **aborted** (exit 134) on these files, so its case-insensitive counts printed blank. The counts above come from Node and are authoritative.

**Not changed, as instructed:**
- usernames and local paths
- all other evidence and wording
- Git history and author metadata: commits `15dd95b` and `e835624`, and the new commits, are authored by the existing Git identity, which still carries the address

---

## 2. Commits

### Pre-commit verification (E2)

- Branch `main`; HEAD `e835624…`; no remote; no stash; nothing staged.
- Every unchanged file matched its recorded checksum (16 listed, plus 20 source and configuration files).
- All 23 files for commits 1 and 2 were present.
- `npm run check` passed: **62 tests, 62 pass, 0 fail**, exit 0.

### Commit 1 — `877c4c523ce27fc06f0abbc33f3349d41651654f` (E3, E4)

`chore(web): stop next dev writing AGENTS.md; add TASK-03 and TASK-03A reports`

**Files (3):**
- `apps/web/next.config.ts`
- `docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md`
- `docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md`

**Checks:**
- Staged set is an **exact match**; the email is 0 times in the staged diff.
- Git warned `CRLF will be replaced by LF` for TASK-03A, as accepted under decision B.
- **`git diff --cached --check` reported trailing whitespace on 11 lines** (3 in TASK-03, 8 in TASK-03A). All of them are inside the reports' verbatim evidence blocks: blank output lines, `diff` markers, and one process command line. They were committed unchanged, because changing them would alter recorded evidence.
- After the commit, the three paths are clean in `git status`.

### Commit 2 — `c480d090c0cb0a9f629b9561117b01d8dce3ccc1` (E5, E6)

`feat(api): M1 safe API foundation`

**Files (20):**
- `README.md`, `apps/api/.env.example`, `apps/api/package.json`, `package.json`, `packages/shared/src/index.ts`
- `apps/api/src/app.ts`, `config.ts`, `server.ts`, `errors.ts`, `middleware.ts`, `logger.ts`, `redaction.ts`, `testing/helpers.ts`
- `apps/api/tsconfig.build.json`
- `apps/api/src/app.test.ts`, `config.test.ts`, `errors.test.ts`, `logger.test.ts`, `redaction.test.ts`, `server.test.ts`

**Checks:**
- Staged set is an **exact match** (20 files).
- The staged diff is clean on every scan: `--check` reports no whitespace errors, and there is no email, no non-example `.env` file, no CR byte and no secret pattern.
- **`npm run check` after commit 2:** **62 tests, 62 pass, 0 fail**; typecheck, lint and build all pass; exit 0.

### Commit 3 — reports

**Files (7):**
- `docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md`
- `docs/reports/TASK-04A-LOGGING-REVIEW.md`
- `docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md`
- `docs/reports/TASK-04C-LOGGING-FIX.md`
- `docs/reports/TASK-04D-COMMIT-READINESS.md`
- `docs/reports/TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md`
- this report

The TASK-04 and TASK-04B reports contain CRLF inside their evidence; LF normalisation was accepted under decision B.

**Excluded from all commits:** `Kulvriksh-V3-Desktop-1440.svg` and `Kulvriksh-V3-Mobile-390.svg`. They were not inspected, staged, moved or modified.

---

## 3. M1 status

- **M1 core is committed** (commit 2): validated configuration, structured logging with redaction (including the D1–D3 fixes), request IDs, security headers, the error envelope, graceful shutdown handling and 62 tests.
- **Still outstanding:**
  - the **storage abstraction** and the **SMS, email and TTS stubs**, deferred as BLOCKED in TASK-04
  - the **Linux SIGTERM shutdown test**, which has not been run (procedure in TASK-04E §5)

## 4. Remaining blockers (unchanged from TASK-04E §9, apart from the commits)

1. The TASK-01 review outcome
2. The DS-1, DS-2 and AC-14 decisions, plus approval of the DS-2 trial install
3. A CP1 record and the CP2 review
4. Database prerequisites: AC-7 and PostgreSQL 18, VPS OS confirmation, Prisma approval
5. The Linux SIGTERM test
6. SVG ownership and licensing
7. A GitHub remote URL; optionally a noreply email for future commits

## 5. Confirmations

- No remote was configured and nothing was pushed. No history was rewritten, amended or reset; nothing was stashed.
- `.gitattributes`, specifications, the lockfile and dependencies are unchanged. Nothing was installed. M2 was not started, and no schema or authentication work was done.
- The only edits to existing files are the five redactions and the two errata notes.

---

## Appendix — Evidence (raw command output)

Paths under the session scratchpad are shown as `<scratchpad>`. Embedded by a Node script. CR bytes are removed, and any personal email address is replaced with `[personal email redacted]`. The redaction script never printed the address.

### E1 Redaction verification (address masked as [EMAIL]; never printed by the redaction script)

````text
$ grep -c -F "<original address>" (both reports; address not printed)
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: 0
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: 0

$ case-insensitive search for the local part, and for any address at the same domain (counts)
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: local-part , @domain 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: local-part , @domain 

$ heading above TASK-03 original line 256 (now 258)
255: ## 9. Git initialisation, staging review, commits and remote

$ diff <original>/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md   (address masked as [EMAIL])
25a26,27
> > **Errata (privacy redaction, added in TASK-04F, 2026-10-24).** The owner's personal Git email address was replaced with `<owner-git-email>` in three places: §2 "Initialisation" (narrative), and the `git config` and `git log` output in the evidence appendi
> 
256c258
< - **Initialisation:** `git init -b main`. **No Git configuration was changed.** The machine's existing global identity (`Heel Patel <[EMAIL]>`, E1 P6) was used as the commit author.
---
> - **Initialisation:** `git init -b main`. **No Git configuration was changed.** The machine's existing global identity (`Heel Patel <<owner-git-email>>`, E1 P6) was used as the commit author.
446c448
< file:C:/Users/HEEL PATEL/.gitconfig	user.email=[EMAIL]
---
> file:C:/Users/HEEL PATEL/.gitconfig	user.email=<owner-git-email>
1750c1752
< Author: Heel Patel <[EMAIL]>
---
> Author: Heel Patel <<owner-git-email>>
[diff exit=1]

$ diff <original>/TASK-03A-M0-REVIEW-FOLLOWUP.md docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md   (address masked as [EMAIL])
13a14,15
> > **Errata (privacy redaction, added in TASK-04F, 2026-10-24).** The owner's personal Git email address was replaced with `<owner-git-email>` in two `git log` output lines in the evidence appendix (original lines 188 and 189, before this note was added). Not
> 
188,189c190,191
< e83562484d0495ec836b9eb896c8f7dfefd6927c Heel Patel <[EMAIL]> 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port instead of hard-coding 3000
< 15dd95b3fa61382ec60e8bc3120589068743866a Heel Patel <[EMAIL]> 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and governance foundation
---
> e83562484d0495ec836b9eb896c8f7dfefd6927c Heel Patel <<owner-git-email>> 2026-10-24 03:15:10 +0530 fix(web): let PORT choose the web port instead of hard-coding 3000
> 15dd95b3fa61382ec60e8bc3120589068743866a Heel Patel <<owner-git-email>> 2026-10-24 03:11:28 +0530 chore: initialise M0 repository and governance foundation
[diff exit=1]

$ diff --stat-like summary: changed-line counts
TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: 3 lines removed, 5 lines added
TASK-03A-M0-REVIEW-FOLLOWUP.md: 2 lines removed, 4 lines added

$ CR bytes before/after (line endings of existing lines preserved)
TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: before 0, after 0
TASK-03A-M0-REVIEW-FOLLOWUP.md: before 67, after 67

$ md5sum (new)
ea126008714bfec0710715b00c7e52d3 *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
2653d076f1dd0581fe129f337e578de9 *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
$ errata section reference fix (TASK-03 report): "§2 \"Initialisation\"" -> "§9 \"Initialisation\"" (line 255 heading is "## 9. Git initialisation, ...")
26:§9 "Initialisation" (narrative)

$ re-run: counts of the exact address, its local part (case-insensitive) and "@<domain>" in both reports
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: exact=0 local-part= @domain=
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: exact=0 local-part= @domain=
(local part length: 12; domain length: 9)

$ full diff vs originals after the fix, changed-line counts
TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: 3 removed, 5 added
TASK-03A-M0-REVIEW-FOLLOWUP.md: 2 removed, 4 added

$ md5sum (final)
ccae0ea80ab60e85b4cac2af8ba14a0b *docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
2653d076f1dd0581fe129f337e578de9 *docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
$ node count (case-insensitive) of the exact address, its local part and "@<domain>" in both reports, plus a generic scan for any non-synthetic email address
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md: exact=0 local-part=0 @domain=0 other-non-synthetic-addresses=0
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md: exact=0 local-part=0 @domain=0 other-non-synthetic-addresses=0
````


### E2 Pre-commit verification

````text
$ git branch --show-current; git rev-parse HEAD; git remote -v; git stash list; git diff --cached --name-only
main
e83562484d0495ec836b9eb896c8f7dfefd6927c
(remotes end)
(stash end)
(staged end)

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
?? docs/reports/TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md

$ md5sum -c (unchanged files since TASK-04E; the 2 redacted reports excluded)
docs/00-ROADMAP.md: OK
docs/01-PRODUCT-FLOWS.md: OK
docs/02-DATA-MODEL.md: OK
docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md: OK
docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md: OK
docs/reports/TASK-02-DEVELOPMENT-FOUNDATION-AUDIT.md: OK
docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md: OK
docs/reports/TASK-04A-LOGGING-REVIEW.md: OK
docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md: OK
docs/reports/TASK-04C-LOGGING-FIX.md: OK
docs/reports/TASK-04D-COMMIT-READINESS.md: OK
package-lock.json: OK
apps/api/src/redaction.ts: OK
apps/api/src/logger.ts: OK
apps/api/src/redaction.test.ts: OK
apps/api/src/logger.test.ts: OK
[exit=0]
other source/config files OK: 20
40f00fa5059a03c07120411903e8ed48 *docs/reports/TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md

$ every planned commit-1/2 file exists
(checked 23 files)

$ npm run check (before committing)
✓ Types generated successfully
✔ unknown routes return the JSON error envelope with the request ID (4.0178ms)
✔ error responses carry the same security headers as successful ones (10.4156ms)
✔ unexpected errors return a generic 500 without internal details (32.7998ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (4.8742ms)
✔ client errors carrying a raw request body are logged without the body (6.0354ms)
✔ client errors keep their status with a generic message (16.3695ms)
✔ client errors are logged at warn, not error (7.4603ms)
✔ non-Error values passed to next() are treated as 500 (3.1601ms)
✔ passes the level to the sink so warn/error can go to stderr (0.2886ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.2558ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.5163ms)
✔ serialises errors with name, message and stack (0.3737ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (2.809ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.5129ms)
✔ serializeError limits stack frames (0.5128ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (1.041ms)
✔ serializeError includes scrubbed cause messages (1.0086ms)
✔ serializeError summarises AggregateError members (at most 5) (1.3707ms)
✔ serializeError handles non-Error values without dumping objects (0.5545ms)
✔ serializeError rejects unsafe code values (0.4143ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (390.15ms)
ℹ tests 62
ℹ pass 62
ℹ fail 0
✓ Compiled successfully in 764ms
[npm run check exit=0]
````


### E3 Commit 1 staging and staged-diff inspection

````text
$ git add -- apps/web/next.config.ts docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
warning: in the working copy of 'docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md', CRLF will be replaced by LF the next time Git touches it
[exit=0]

$ git diff --cached --name-only
apps/web/next.config.ts
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md

$ git diff --cached --stat
 apps/web/next.config.ts                            |    3 +
 .../TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md    | 2180 ++++++++++++++++++++
 docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md        |  968 +++++++++
 3 files changed, 3151 insertions(+)

$ git diff --cached -- apps/web/next.config.ts
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

$ git diff --cached --check; echo "[check exit=$?]"
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md:1920: trailing whitespace.
+ 
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md:1930: trailing whitespace.
+ 
docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md:1932: trailing whitespace.
+ 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:366: trailing whitespace.
+ 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:563: trailing whitespace.
+13968 <- parent 12104 : "C:\Program Files\OUR SOFTWARES\node.exe"  "C:\Program Files\OUR SOFTWARES\node_modules\npm\bin\npm-cli.js" run start 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:676: trailing whitespace.
+< 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:698: trailing whitespace.
+< 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:708: trailing whitespace.
+> 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:717: trailing whitespace.
+< 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:726: trailing whitespace.
+> 
docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md:844: trailing whitespace.
+ 
[check exit=2]

$ occurrences of the original email in the staged diff (address not printed)
0

$ staged == expected?
EXACT MATCH: 3 expected files staged, nothing else
````


### E4 Commit 1 created

````text
$ git commit -F <scratchpad>/t4f-msg1.txt
[main 877c4c5] chore(web): stop next dev writing AGENTS.md; add TASK-03 and TASK-03A reports
 3 files changed, 3151 insertions(+)
 create mode 100644 docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
 create mode 100644 docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
[exit=0]

$ git show --stat --format="%H%n%an%n%s" HEAD
877c4c523ce27fc06f0abbc33f3349d41651654f
Heel Patel
chore(web): stop next dev writing AGENTS.md; add TASK-03 and TASK-03A reports

 apps/web/next.config.ts                            |    3 +
 .../TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md    | 2180 ++++++++++++++++++++
 docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md        |  968 +++++++++
 3 files changed, 3151 insertions(+)

$ git diff --cached --name-only; echo "(staged end)"
(staged end)

$ git status --short -- docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md apps/web/next.config.ts; echo "(end: nothing listed = clean)"
(end: nothing listed = clean)

$ git ls-tree HEAD -- (blob IDs of the committed files)
100644 blob 6dfac615ff87bae5e186ac19ea0fdfb160418dd3	apps/web/next.config.ts
100644 blob 080104112664c7aab09e1da852d0f64af9135c10	docs/reports/TASK-03-REPOSITORY-GOVERNANCE-FOUNDATION.md
100644 blob 5906524f69f51ae762b924f032d8185b31d17581	docs/reports/TASK-03A-M0-REVIEW-FOLLOWUP.md
````


### E5 Commit 2 staging and staged-diff inspection

````text
$ git diff --cached --name-only (must be empty before staging)
(staged end)

$ git add -- <20 files from <scratchpad>/t4d-groups.txt group 2>
[exit=0]

$ git diff --cached --name-only
README.md
apps/api/.env.example
apps/api/package.json
apps/api/src/app.test.ts
apps/api/src/app.ts
apps/api/src/config.test.ts
apps/api/src/config.ts
apps/api/src/errors.test.ts
apps/api/src/errors.ts
apps/api/src/logger.test.ts
apps/api/src/logger.ts
apps/api/src/middleware.ts
apps/api/src/redaction.test.ts
apps/api/src/redaction.ts
apps/api/src/server.test.ts
apps/api/src/server.ts
apps/api/src/testing/helpers.ts
apps/api/tsconfig.build.json
package.json
packages/shared/src/index.ts

$ git diff --cached --stat
 README.md                       |  26 +++++-
 apps/api/.env.example           |   8 ++
 apps/api/package.json           |   5 +-
 apps/api/src/app.test.ts        | 101 +++++++++++++++++++++
 apps/api/src/app.ts             |  46 ++++------
 apps/api/src/config.test.ts     |  54 +++++++++++
 apps/api/src/config.ts          |  61 +++++++++++--
 apps/api/src/errors.test.ts     | 114 +++++++++++++++++++++++
 apps/api/src/errors.ts          |  50 +++++++++++
 apps/api/src/logger.test.ts     | 191 +++++++++++++++++++++++++++++++++++++++
 apps/api/src/logger.ts          | 144 +++++++++++++++++++++++++++++
 apps/api/src/middleware.ts      |  69 ++++++++++++++
 apps/api/src/redaction.test.ts  | 195 ++++++++++++++++++++++++++++++++++++++++
 apps/api/src/redaction.ts       | 133 +++++++++++++++++++++++++++
 apps/api/src/server.test.ts     |  99 ++++++++++++++++++++
 apps/api/src/server.ts          |  34 ++++---
 apps/api/src/testing/helpers.ts |  46 ++++++++++
 apps/api/tsconfig.build.json    |   6 ++
 package.json                    |   3 +-
 packages/shared/src/index.ts    |   7 +-
 20 files changed, 1336 insertions(+), 56 deletions(-)

$ git diff --cached --check; echo "[check exit=$?]"
[check exit=0]

$ staged diff scans: original email count, .env (non-example) paths, CR bytes, high-confidence secrets
email: 0
env files staged (other than .env.example): 0
CR bytes in staged diff: 0
secret patterns: 0

$ staged == expected?
EXACT MATCH: 20 expected files staged, nothing else
````


### E6 Commit 2 created, npm run check after commit 2, status

````text
$ git commit -F <scratchpad>/t4f-msg2.txt
[main c480d09] feat(api): M1 safe API foundation
 20 files changed, 1336 insertions(+), 56 deletions(-)
 create mode 100644 apps/api/src/app.test.ts
[exit=0]

$ git show --stat --format="%H%n%an%n%s" HEAD | tail -4
c480d090c0cb0a9f629b9561117b01d8dce3ccc1
Heel Patel
feat(api): M1 safe API foundation
 20 files changed, 1336 insertions(+), 56 deletions(-)

$ git diff --cached --name-only; echo "(staged end)"
(staged end)

$ npm run check (after commit 2)
✓ Types generated successfully
✔ unknown routes return the JSON error envelope with the request ID (5.54ms)
✔ error responses carry the same security headers as successful ones (9.4395ms)
✔ unexpected errors return a generic 500 without internal details (67.2152ms)
✔ the 500 is logged with the request ID and a scrubbed error message (no secret in any log line) (10.6069ms)
✔ client errors carrying a raw request body are logged without the body (6.9186ms)
✔ client errors keep their status with a generic message (25.3035ms)
✔ client errors are logged at warn, not error (14.7848ms)
✔ non-Error values passed to next() are treated as 500 (6.3932ms)
✔ passes the level to the sink so warn/error can go to stderr (0.5077ms)
✔ error values are logged in the safe form: secrets in messages, stacks, causes and properties never reach output (1.7243ms)
✔ Error instances under other keys or inside arrays also use the safe form (0.7387ms)
✔ serialises errors with name, message and stack (0.5456ms)
✔ serializeError keeps allowlisted fields and never copies arbitrary properties (2.081ms)
✔ serializeError drops the stack header line, which repeats the unscrubbed message (0.503ms)
✔ serializeError limits stack frames (0.3969ms)
✔ serializeError follows cause chains (scrubbed) to a bounded depth (0.7811ms)
✔ serializeError includes scrubbed cause messages (0.4237ms)
✔ serializeError summarises AggregateError members (at most 5) (1.1963ms)
✔ serializeError handles non-Error values without dumping objects (0.2386ms)
✔ serializeError rejects unsafe code values (0.3667ms)
✔ invalid configuration stops startup with exit code 1 and a structured error listing every issue (689.286ms)
ℹ tests 62
ℹ pass 62
ℹ fail 0
ℹ duration_ms 4940.2143
✓ Compiled successfully in 4.5s
[npm run check exit=0]

$ git status --short --untracked-files=all
?? Kulvriksh-V3-Desktop-1440.svg
?? Kulvriksh-V3-Mobile-390.svg
?? docs/reports/TASK-04-M1-SAFE-FOUNDATION-REPORT.md
?? docs/reports/TASK-04A-LOGGING-REVIEW.md
?? docs/reports/TASK-04B-ARCHITECTURE-AND-COMMIT-READINESS.md
?? docs/reports/TASK-04C-LOGGING-FIX.md
?? docs/reports/TASK-04D-COMMIT-READINESS.md
?? docs/reports/TASK-04E-M1-CLOSEOUT-AND-M2-READINESS.md
````

