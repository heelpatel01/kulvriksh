# TASK-01 — Specification Review Fixes

| Item | Value |
|---|---|
| Task ID | TASK-01 |
| Date | 2026-10-24 |
| Executed by | Local coding agent (Claude Code) |
| Intended reviewer | ChatGPT (technical lead review), then the project owner |
| Files edited | `docs/02-DATA-MODEL.md` (r1 → r2), `docs/01-PRODUCT-FLOWS.md` (r2 → r3) |
| File created | This report |
| Status | Completed. **Awaiting review.** This report is evidence of what was done, not proof that the design is correct. |

---

## 1. Task summary

### 1.1 What was requested

The task revised the data model and the product flows to address the data-model review findings:
1. task-level locking that is unsafe with connection pooling
2. missing lease fencing
3. state-machine invariants
4. OTP hashing and verification security
5. atomic database-backed rate limiting
6. audit-event immutability and database roles
7. concurrent Razorpay order creation and idempotency
8. blockers mapped to implementation milestones
9. housekeeping (revision rows, checklist, cross-references)

Every new design had to be labelled **Proposed (pending CP2 technical review)**. No client decision could be invented. Only the two specification files could be edited, plus this report.

### 1.2 What was completed

All nine lettered change groups (A–I) in the task prompt were applied. The validation checks in the prompt were run, and their raw output is in [§5](#5-validation-evidence).

**Note on the count of corrections:** the reporting instruction refers to "10 required corrections". The task prompt contains **nine** lettered change groups (A–I) plus a validation section. This report covers A–I one by one, and covers validation in §5. I did not invent a tenth correction. If a tenth was intended, please name it.

**Scope note:** the prompt authorised edits to F-AUTH-01 and F-AUTH-02 in the flows, but change group D also required the cross-challenge behaviour in **F-AUTH-03**. I made the minimal F-AUTH-03 change (one bullet), so I edited one flow section beyond the explicit list in order to satisfy D. Please confirm this is acceptable.

---

## 2. Decision-by-decision results

### A. Task-level locking (run leases replace session-level advisory locks)

**Changes**
- `background_task_state` no longer has `advisory_lock_key`. It now has `run_lease_owner`, `run_lease_token` and `run_lease_expires_at`.
- A run is claimed with one conditional `UPDATE … WHERE run_lease_expires_at IS NULL OR < now() RETURNING`, using the database clock.
- A fenced heartbeat and a fenced release were added, and the lease expires on a crash.
- `last_status` values changed to `skipped_lease_held` and `lease_lost`.
- The document explains why session-level `pg_try_advisory_lock` is unsafe with Prisma's connection pool.
- Advisory locks are allowed only as `pg_try_advisory_xact_lock`, inside short transactions with no network calls. No current design uses one.

**Sections affected**
- **Data model:** §10.1 (rewritten), §10.2 (Reconciliation, Cleanup and the new Consistency-check row), §10.5 (renamed from §10.3, first row), §4.3 (a new `background_task_state` check), §15.1 item 6, §15.2.
- **Flows:** F-ORD-05 ("Overlap prevention" and "Restart" rows), §12.4 rule 2.

**Remaining concerns**
- Lease durations and heartbeat intervals are configuration values that must be measured in Phase 10.
- A run that loses its lease mid-batch depends on per-item idempotency and fencing. That holds for the documented tasks, but every new task must keep it true.

### B. Lease fencing

**Changes**
- `lease_token uuid` was added to `entitlement_grant`, `notification`, `export_job` and `tts_job`.
- New §10.3 "Item leases and fencing" covers:
  - claiming in a short transaction with `SKIP LOCKED` and no network calls
  - completion fenced on `status` and `lease_token`; zero rows means discard the result and clean up
  - output attached only inside the fenced completion, from a temporary key that includes the token
  - a fenced heartbeat for long jobs
  - lease duration at least the longest timeout plus a margin, with heartbeats at most a third of the lease
  - recovery conditional on the expired token
  - all comparisons on the database clock
- The remaining at-least-once duplicate window for notifications is stated.
- §4.3 check constraints now require the three lease columns to be all set or all null, and tie `running`/`sending` to `lease_token`.
- In §6.5, the recovery task's bookkeeping is fenced. *Grant* itself stays a single short transaction under a row lock with a compare-and-set update.

**Sections affected**
- **Data model:** §6.5 (field table and the transaction mapping table), §7.6 (`export_job` and `tts_job` lease rows), §9.3 (`notification` lease row), §4.3, §10.2 (grant-recovery claim column), new §10.3, §10.5.
- **Flows:** §12.4 rule 3.

**Remaining concerns**
- Flows F-NOT-01 was **not** edited (not authorised). It still describes leases without mentioning tokens. Flows §12.4 rule 3 now applies fencing to every task, including the dispatcher, so the behaviour is specified, but F-NOT-01's own wording is less detailed than the data model.

### C. State-machine invariants

**Changes:** new §10.4 containing:
- the compare-and-set rule (`WHERE id AND status IN (allowed predecessors) [AND lease_token] RETURNING`; zero rows means reload, then a no-op or 409, even under a row lock)
- transition tables for `customer_order`, `payment_attempt`, `entitlement_grant`, `notification`, `export_job`/`tts_job`, `report` (working set) and `assignment`, plus short lifecycles for `stored_file`, `session` and `otp_challenge`
- `webhook_event` defined as insert-only
- six monitoring-only consistency checks, run by a `consistency_check` task, with no automatic repair

§4.3 now states that the database alone does not enforce forward-only transitions.

**Sections affected:** data model §4.3, new §10.4, §10.1 (`consistency_check` task name), §10.2 (new row), §15.1 item 4.

**Remaining concerns**
- `payment_attempt` treats `failed` as terminal. This matches Razorpay's documented payment lifecycle as I understand it, but **it must be confirmed against Razorpay's documentation in Phase 5**.
- The `report` and `customer_order` tables are working sets that depend on R32, FQ-24 and FQ-18.

### D. OTP security

**Changes**
- **Generation:** a cryptographically secure random generator.
- **`code_hash`:** HMAC-SHA-256 with a server-side configuration key, over the challenge ID and the code. The document explains why an unkeyed hash of a short code is insufficient.
- **Key rotation:** old challenges simply fail. A `key_version` column is listed as a CP2 alternative.
- **Comparison:** constant-time.
- **Attempt accounting:** an atomic conditional `UPDATE … attempt_count + 1 … WHERE … attempt_count < $max RETURNING`, run **before** the comparison.
- **Consumption:** an atomic conditional `UPDATE … SET consumed_at` in the success transaction. Only the request that consumes the challenge creates a session.
- **Failures across challenges:** a per-number failure count (rate-limit purpose `otp_verify_fail`) with an upsert of `auth_lockout` using `greatest()`. **A new code does not reset the guessing budget.**
- **Failure audits** are written in their own transaction.
- All values remain FQ-3.

**Sections affected**
- **Data model:** §5.5 (the `otp_challenge` table and a new "OTP generation and verification" block).
- **Flows:**
  - F-AUTH-01: the "Data changed" row and the step 2 bullets
  - F-AUTH-02: steps 2–5 (renumbered) and the "Too many attempts" row
  - F-AUTH-03: one bullet (see the scope note in §1.2)

**Remaining concerns**
- Whether a successful sign-in resets the per-number failure count is left as configuration (FQ-3). It is not decided.
- Under the chosen design, concurrent OTP requests for the same number collide on the partial unique index, and the loser is treated as rate-limited. CP2 should confirm this user experience is acceptable.

### E. Atomic database-backed rate limiting

**Changes**
- `rate_limit_bucket` now has a full field table.
- A **fixed-window** algorithm is specified as one `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, labelled as a specification sketch, not a migration.
- Rejected requests are counted, and there is no read-then-write.
- `bucket_key` is an HMAC of the purpose and identifier, so no raw IP address or number is stored.
- Purposes are listed.
- OTP and enquiry endpoints **fail closed** with a retryable 503 if the database is unavailable.
- Volume and cleanup are covered.
- Sliding-window alternatives are described and not proposed. The 2× burst at a window boundary is acknowledged.
- `auth_lockout` now has a field table, with keys stored as HMACs.
- New §4.3 checks were added for `rate_limit_bucket`.

**Sections affected:** data model §5.5 and §4.3; flows F-AUTH-01 step 2.

**Remaining concerns**
- Window lengths and limits are TBC (FQ-3).
- Rate limiting for enquiries (F-PUB-04) uses the same engine, but the flows text for F-PUB-04 was not edited (not authorised). It still just says "rate limit", which is consistent but less specific.

### F. Audit immutability and database roles

**Changes**
- §9.4 was rewritten:
  - the runtime role has only `INSERT` and `SELECT` on `audit_event`, plus the sequence privilege the identity mechanism needs (marked "verify in Phase 2")
  - no `UPDATE`, `DELETE` or `TRUNCATE`, and the runtime role owns nothing
  - an explicit limitation: this protects against the application role, not against the owner, a superuser or anyone with server access
  - purging only through a maintenance role, and only if R10 approves it
  - transaction rules: success events in the same transaction as the change; failure and security events in their own transaction
- New §9.7 "Database roles (proposed)":
  - owner/migration, runtime and optional maintenance roles
  - two connection strings, and no credentials in documents
  - Next.js never connects to PostgreSQL
  - default privileges must re-assert the `audit_event` restriction
  - the superuser is not used by the application
  - the same role split in local development
- §13 item 1 now covers role grants and revokes, and migrations run only with the owner connection.
- New **DQ-7** asks whether tamper-evidence is needed.

**Sections affected:** data model §9.4, new §9.7, §13 item 1, §14.3 (DQ-7), §15.2.

**Remaining concerns**
- **Not verified:** whether a `GENERATED … AS IDENTITY` column needs a separate sequence privilege for an `INSERT`-only role. The document states the uncertainty and defers it to Phase 2 verification, rather than asserting an answer.
- Role names are indicative only.

### G. Razorpay order creation and idempotency

**Changes**
- New "Creation protocol (proposed)" in data model §6.2:
  1. Validate the key format (proposed: a client-generated UUID; otherwise 400).
  2. On a replay, the same plan returns the existing order, and a different plan returns 409 with nothing created.
  3. Check the plan and compute the amount.
  4. Generate the order UUID **in the API, before Razorpay**.
  5. Create the Razorpay order outside any transaction, with the order UUID as the receipt reference. The receipt length limit is to be confirmed in Phase 5.
  6. Insert under that ID. On a conflict, re-read the winner and compare plans. Orphaned Razorpay orders are traceable and ignored by reconciliation.
- A **CP2 alternative, "reserve first"**, is documented with its trade-offs and **not chosen**.
- The `customer_order` field table and the §3.1 primary-key convention note the API-generated ID.
- **Flows F-ORD-01:** the step 3 bullets and the "Concurrent duplicates" rule were updated to match.

**Sections affected:** data model §3.1, §6.2; flows F-ORD-01.

**Remaining concerns**
- The idempotency-key format (UUID) is a proposal.
- Razorpay's receipt field limit, and whether to also use Razorpay "notes", must be confirmed in Phase 5.

### H. Blockers by milestone

**Changes**
- New data model §15.3 maps every blocking R, FQ and DQ item to Stage D milestones 1–9, with what can start without client decisions, subject to CP2 review. This is expected to include Milestone 1 entirely, and the parts of Milestone 2 that do not depend on FQ-1, FQ-2, FQ-4, FQ-6, R8, R9, R34, R35 and DQ-1.
- DQ-7 was added to §14.3.
- §15.2 restates that FQ-1–FQ-27 and DQ-1–DQ-7 are not in the roadmap register.

**Sections affected:** data model §14.3, §15.2, new §15.3.

**Remaining concerns**
- The mapping is my assessment and needs review.
- Milestone 4 is shown as conditional on R13, because recurring plans would change the payment model.

### I. Housekeeping

**Changes**
- Data model header: "Last updated" set to 2026-10-24, and a Revision r2 row linking to this report.
- Flows header: a Revision r3 row.
- Data model §15.1 items 4 and 6 now reference fencing and run leases. Their status changed from "Met" to "Specified … pending CP2 review", to avoid over-claiming.
- Item 12 now references §10.5.
- Cross-references were checked (§5).

**Sections affected:** data model header, §15.1; flows header.

---

## 3. Technical decisions

All of these are **Proposed — pending CP2 technical review**. None is client-approved.

| # | Design | Rationale | Where |
|---|---|---|---|
| T1 | Run leases on `background_task_state` instead of session advisory locks | Session advisory locks leak under connection pooling; a row lease works with any pooled connection | DM §10.1 |
| T2 | Item leases with a per-claim `lease_token`; fenced completion and heartbeat | Stops a worker that lost its lease from overwriting a new owner's state | DM §10.3 |
| T3 | Compare-and-set state transitions, with transition tables | Prevents state regression under concurrency, independent of row locks | DM §10.4 |
| T4 | Monitoring-only consistency checks | Detects invariant breaches without risky automatic repair | DM §10.4 |
| T5 | OTP: secure random generation, HMAC with challenge ID, constant-time compare | A short code's hash is brute-forceable without a key | DM §5.5 |
| T6 | OTP: atomic attempt increment before compare; atomic consume | Prevents parallel guessing beyond the limit and double session creation | DM §5.5; Flows F-AUTH-02 |
| T7 | Per-number failure budget across challenges, with `auth_lockout` upsert using `greatest()` | Stops attackers resetting the budget by requesting new codes | DM §5.5; Flows F-AUTH-02/03 |
| T8 | Fixed-window rate limiter as one atomic upsert; HMAC bucket keys; fail closed | Race-free, no extra infrastructure, no raw identifiers stored | DM §5.5 |
| T9 | Database roles: owner/migration, runtime, optional maintenance | Makes audit append-only meaningful; least privilege | DM §9.7 |
| T10 | Audit transaction rule: success events in-transaction, failure events in their own transaction | Failure evidence survives rollbacks | DM §9.4 |
| T11 | API-generated order ID used as the Razorpay receipt; key and plan mismatch returns 409; key format validation | Traceable orphans; prevents key misuse | DM §6.2; Flows F-ORD-01 |
| T12 | Reserve-first order creation, recorded as an **alternative only** | Left for the CP2 decision | DM §6.2 |

---

## 4. Unresolved items (must not be assumed)

**Client decisions (unchanged; still TBC)**

| Area | Items |
|---|---|
| Public website | R1–R7, R45 |
| Accounts | R8–R10 |
| Commerce | R12–R16 (R13 can change the payment model) |
| Family data | R17–R22 |
| Media | R23–R27 |
| Genealogist and reports | R28–R32 |
| Admin | R33–R35 |
| Notifications | R36–R38 |
| Operations | R39–R44 |
| Performance clarifications | R46–R48 |
| Questions tracked in the flows | FQ-1–FQ-27, including the five unnumbered roadmap TBCs FQ-9, FQ-13, FQ-22, FQ-23 and FQ-24 |
| Data-model questions | DQ-1 (multiple roles per person), DQ-2 (currency), DQ-6 (report review history) |

**Technical questions (CP2):** DQ-3 (row-level security), DQ-4 (triggers), DQ-5 (search approach), DQ-7 (tamper-evidence), and every Proposed design in §3.

**Dependencies and items to verify**
- **Razorpay:** the event-ID header, the receipt length limit, whether `failed` payments are terminal, and the auto-capture setting (Phase 5).
- **PostgreSQL:** the sequence privilege needed for an identity column under an `INSERT`-only role, and the PostgreSQL version (Phase 2).
- **Lease and heartbeat durations:** measured in Phase 10.
- **Register:** FQ-1–FQ-27 and DQ-1–DQ-7 still need an authorised roadmap §9 update.
- **Repository:** it is **not a Git repository**. Git should be initialised before any code is written (Stage C).

---

## 5. Validation evidence

All commands were run in Git Bash on Windows from `C:\Users\HEEL PATEL\Desktop\KulVriksh` (or its `docs` folder), as shown. The output is pasted unedited.

### 5.1 Result summary

| Check | What it verifies | Status |
|---|---|---|
| V1 | Protected files are unchanged (compared with the baseline taken before editing) | **PASS**: both checksums match the baseline |
| V2 | The edited files really changed | **PASS**: the before and after checksums differ for both files |
| V3 | No unexpected files | **PASS**: exactly the four original docs plus this report |
| V4 | Every internal and cross-document link from the flows and data model resolves; no duplicate headings | **PASS**: 129 links, 0 broken |
| V5 | Mermaid fences balanced | **PASS**: flows 4/4, data model 3/3 |
| V6 | ER entities equal the defined entities; every FK source and target is an entity; the data model's links resolve | **PASS on run 2.** Run 1 reported 4 *false positives* caused by the checker (§5.2). The checker was fixed and re-run. |
| V7 | New columns (`lease_token`, `run_lease_*`) appear in their field tables and in §4.3 | **PASS**: hits in §6.5, §7.6 (2 tables), §9.3 and §10.1 field tables, and four §4.3 constraint rows |
| V8 | No session-level advisory lock and no "connection closes" wording remain | **PASS WITH NOTE**: the 2 remaining matches (data model lines 1312 and 1314) are the rationale explaining *why* session locks are not used (§5.2) |
| V9 | All R, FQ and DQ references are defined | **PASS**: 48 R refs, all within R1–R48; FQ 27 used / 27 defined; DQ 7 used / 7 defined |
| V10 | Table column counts are consistent | **PASS**: 0 mismatches in both files |
| V11 | Git availability and diff size | **Git: NOT AVAILABLE** (not a repository). Diff: flows +43/−22 lines; data model +373/−42 lines. |

**Not run:** there are no automated tests, builds or migrations, because no code exists. **The checks above validate document structure and references only. They do not prove the designs are correct.** That needs the CP2 technical review.

### 5.2 Notes on V6 and V8

**V6, run 1 (raw output of the relevant lines, before the checker fix):**

~~~text
Defined but not in ER: removed_at
Defined but not in ER: approved
Defined but not in ER: withdrawn
Defined but not in ER: needs_attention
ER entities 32, defined 36, FK targets 12, in-page links 37, roadmap links 6, flows links 10, mermaid 3/3
~~~

**Cause:** the checker treated *every* backticked word on a bold line starting with `` **`name` `` as an entity definition. The new §10.4 lines (for example "**`assignment`:** active (`removed_at IS NULL`)…") contain state and column names. These are not missing entities.

**Fix:** the checker now takes only the first backticked name on such bold lines (the entity being described). Numbered headings still contribute every backticked name. Run 2 then reported `defined 32`, matching the 32 ER entities. **No document change was made to satisfy this check.**

**V8:** the remaining matches are:
- `02-DATA-MODEL.md:1312: - \`pg_try_advisory_lock\` belongs to one database session.`
- `02-DATA-MODEL.md:1314: … so "released when the connection closes" cannot be relied on.`

Both are the rationale text in data model §10.1, which explains the defect and why it is no longer used. No design step uses a session-level advisory lock. If the reviewer prefers zero literal matches, the rationale can be reworded.

### 5.3 Raw output (run 2, final)

The commands were run from `C:\Users\HEEL PATEL\Desktop\KulVriksh\docs` with:
`bash "<scratchpad>/v.sh" > "<scratchpad>/v.out" 2>&1`
Each command is echoed with a `$ ` prefix before its output. `<scratchpad>` is the agent's session scratchpad directory, outside the repository.

~~~text
### V1 Protected-file checksums (baseline recorded before editing)
baseline: 17c2b0b2799092ef34ab56c1d4ee404a  00-ROADMAP.md
baseline: 4408f9afb25628949c61852a32e9b729  PERFORMANCE-AND-NAVIGATION-STANDARDS.md
$ md5sum 00-ROADMAP.md PERFORMANCE-AND-NAVIGATION-STANDARDS.md
17c2b0b2799092ef34ab56c1d4ee404a *00-ROADMAP.md
4408f9afb25628949c61852a32e9b729 *PERFORMANCE-AND-NAVIGATION-STANDARDS.md

### V2 Edited-file checksums (before -> after)
$ md5sum "/c/Users/HEELPA~1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/before/01-PRODUCT-FLOWS.md" "/c/Users/HEELPA~1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/before/02-DATA-MODEL.md" 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md | sed 's#/c/Users/[^ ]*/scratchpad/#scratchpad/#'
516acb9f0061548d0458d53df9f41ca8 *scratchpad/before/01-PRODUCT-FLOWS.md
4e7978cba493f48b9b619dd79241ace8 *scratchpad/before/02-DATA-MODEL.md
14c727e7834a4fe9685e779c870c6862 *01-PRODUCT-FLOWS.md
8afabdcabb87bc6df2d7541b8e40aafc *02-DATA-MODEL.md

### V3 All files in the repository
$ cd .. && find . -type f | sort
./docs/00-ROADMAP.md
./docs/01-PRODUCT-FLOWS.md
./docs/02-DATA-MODEL.md
./docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md
./docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md

### V4 Internal and cross-document links (01, 02) resolve; duplicate headings
$ awk -f "/c/Users/HEELPA~1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/links.awk" 00-ROADMAP.md 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md
links checked: 129, broken: 0

### V5 Mermaid fences opened vs closed
$ for f in 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md; do awk -v F=$f '/^```mermaid/{o++; m=1; next} /^```$/{ if(m){c++; m=0} } END{print F": mermaid opened " o ", closed " c}' $f; done
01-PRODUCT-FLOWS.md: mermaid opened 4, closed 4
02-DATA-MODEL.md: mermaid opened 3, closed 3

### V6 Data model: ER entities vs definitions; FK sources/targets; DM links
$ awk -f "/c/Users/HEELPA~1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/dm.awk" 00-ROADMAP.md 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md
ER entities 32, defined 32, FK targets 12, in-page links 37, roadmap links 6, flows links 10, mermaid 3/3

### V7 New columns appear in field tables and in constraint sections (section shown per hit)
$ awk '/^#{2,3} /{sec=$0} /lease_token|run_lease_/{ n=split($0,a,/lease_token|run_lease_/); print sec " :: line " NR }' 02-DATA-MODEL.md | sort | uniq -c
      1 ### 10.1 `background_task_state` :: line 1282
      1 ### 10.1 `background_task_state` :: line 1283
      1 ### 10.1 `background_task_state` :: line 1284
      1 ### 10.1 `background_task_state` :: line 1296
      1 ### 10.1 `background_task_state` :: line 1297
      1 ### 10.1 `background_task_state` :: line 1299
      1 ### 10.1 `background_task_state` :: line 1300
      1 ### 10.1 `background_task_state` :: line 1305
      1 ### 10.1 `background_task_state` :: line 1307
      1 ### 10.3 Item leases and fencing :: line 1338
      1 ### 10.3 Item leases and fencing :: line 1344
      1 ### 10.3 Item leases and fencing :: line 1348
      1 ### 10.3 Item leases and fencing :: line 1354
      1 ### 10.3 Item leases and fencing :: line 1359
      1 ### 10.4 State-machine invariants :: line 1370
      1 ### 10.5 Concurrency constraints (summary) :: line 1460
      1 ### 15.1 Data-model acceptance checklist :: line 1694
      1 ### 15.1 Data-model acceptance checklist :: line 1696
      1 ### 15.2 Blockers to final schema approval :: line 1737
      1 ### 4.3 Check constraints :: line 477
      1 ### 4.3 Check constraints :: line 480
      1 ### 4.3 Check constraints :: line 483
      1 ### 4.3 Check constraints :: line 486
      1 ### 6.5 `entitlement_grant` :: line 846
      1 ### 6.5 `entitlement_grant` :: line 858
      1 ### 7.6 `export_job` and `tts_job` :: line 1018
      1 ### 7.6 `export_job` and `tts_job` :: line 1035
      1 ### 9.3 `notification` and `notification_attempt` :: line 1184

### V8 No session-level advisory lock or 'connection closes' wording remains
$ grep -n 'pg_try_advisory_lock' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md | grep -v 'pg_try_advisory_xact_lock' | grep -v 'Why not session-level\|belongs to one database session' ; echo "(matches above, if any)"
(matches above, if any)

$ grep -n 'pg_try_advisory_lock' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md
02-DATA-MODEL.md:1312:- `pg_try_advisory_lock` belongs to one database session.

$ grep -n -i 'connection closes\|advisory_lock_key\|skipped_locked' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md; echo "exit=$? (1 = no matches)"
02-DATA-MODEL.md:1314:- A pooled connection is not closed when a run ends, so "released when the connection closes" cannot be relied on.
exit=0 (1 = no matches)

### V9 R / FQ / DQ references are defined
$ grep -ohE '\bR[0-9]+\b' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md | sort -u -V | awk '{n=substr($0,2)+0; if(n<1||n>48) print "OUT OF RANGE: " $0; c++} END{print c " distinct R refs; allowed R1-R48"}'
48 distinct R refs; allowed R1-R48

$ used=$(grep -ohE 'FQ-[0-9]+' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md | sort -u -V); def=$(grep -oE '^\| FQ-[0-9]+ \|' 01-PRODUCT-FLOWS.md | grep -oE 'FQ-[0-9]+' | sort -u -V); echo "defined: $(echo $def)"; for u in $used; do echo "$def" | grep -qx "$u" || echo "UNDEFINED: $u"; done; echo "used: $(echo $used | wc -w)  defined: $(echo $def | wc -w)"
defined: FQ-1 FQ-2 FQ-3 FQ-4 FQ-5 FQ-6 FQ-7 FQ-8 FQ-9 FQ-10 FQ-11 FQ-12 FQ-13 FQ-14 FQ-15 FQ-16 FQ-17 FQ-18 FQ-19 FQ-20 FQ-21 FQ-22 FQ-23 FQ-24 FQ-25 FQ-26 FQ-27
used: 27  defined: 27

$ used=$(grep -ohE 'DQ-[0-9]+' 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md | sort -u -V); def=$(grep -oE '^\| DQ-[0-9]+ \|' 02-DATA-MODEL.md | grep -oE 'DQ-[0-9]+' | sort -u -V); echo "defined: $(echo $def)"; for u in $used; do echo "$def" | grep -qx "$u" || echo "UNDEFINED: $u"; done; echo "used: $(echo $used | wc -w)  defined: $(echo $def | wc -w)"
defined: DQ-1 DQ-2 DQ-3 DQ-4 DQ-5 DQ-6 DQ-7
used: 7  defined: 7

### V10 Table rows have consistent column counts (outside code fences)
$ for f in 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md; do awk -v F=$f '/^```/{fz=!fz; inT=0; next} fz{next} /^\|/{ n=gsub(/\|/,"|"); if(inT && n!=cols){print F": line " NR ": " n " pipes vs " cols; bad++} if(!inT) cols=n; inT=1; next} {inT=0} END{print F": table column mismatches: " bad+0}' $f; done
01-PRODUCT-FLOWS.md: table column mismatches: 0
02-DATA-MODEL.md: table column mismatches: 0

### V11 Diff size against pre-edit copies (no Git available)
$ git -C .. status 2>&1 | head -1
fatal: not a git repository (or any of the parent directories): .git

$ for f in 01-PRODUCT-FLOWS.md 02-DATA-MODEL.md; do printf '%s: ' $f; diff -u "/c/Users/HEELPA~1/AppData/Local/Temp/claude/c--Users-HEEL-PATEL-Desktop-KulVriksh/188cd3b6-033b-41f3-9501-bcff2902bb56/scratchpad/before/$f" $f | awk '/^\+\+\+|^---/{next} /^\+/{a++} /^-/{d++} END{print a " lines added, " d " lines removed"}'; done
01-PRODUCT-FLOWS.md: 43 lines added, 22 lines removed
02-DATA-MODEL.md: 373 lines added, 42 lines removed

~~~

### 5.4 Checker sources

These are reproduced so the checks can be re-run. They live in the agent's scratchpad, not in the repository.

`links.awk`:

~~~awk
function slug(s){ s=tolower(s); gsub(/[^a-z0-9 _-]/,"",s); gsub(/ /,"-",s); return s }
FNR==1 { fname=FILENAME; sub(/.*\//,"",fname); infence=0; FILES[fname]=1 }
/^```/ { infence = !infence; next }
infence { next }
/^#{1,6} / { h=$0; sub(/^#+ /,"",h); key=fname "#" slug(h); if (key in H) print "DUPLICATE HEADING: " key; H[key]=1 }
fname=="01-PRODUCT-FLOWS.md" || fname=="02-DATA-MODEL.md" {
  line=$0
  while (match(line, /\]\([^)]*\)/)) {
    t=substr(line, RSTART+2, RLENGTH-3); line=substr(line, RSTART+RLENGTH)
    if (t ~ /^https?:/) continue
    if (t ~ /^#/) t = fname t
    L[fname " -> " t]=t
  }
}
END {
  total=0; bad=0
  for (k in L) {
    total++; t=L[k]
    p=index(t,"#")
    if (p) { f=substr(t,1,p-1); a=substr(t,p+1)
      if (!(f in FILES)) { if (system("test -f \"" f "\"")!=0) { print "BROKEN (file missing): " k; bad++ } else { print "UNCHECKED ANCHOR (file not loaded): " k } }
      else if (!((f "#" a) in H)) { print "BROKEN ANCHOR: " k; bad++ } }
    else if (system("test -f \"" t "\"")!=0) { print "BROKEN (file missing): " k; bad++ }
  }
  print "links checked: " total ", broken: " bad
}
~~~

`dm.awk` (final version, used in run 2):

~~~awk
function slug(s){ s=tolower(s); gsub(/[^a-z0-9 _-]/,"",s); gsub(/ /,"-",s); return s }
FNR==1{fi++; inm=0}
# fi: 1=roadmap 2=flows 3=data model
/^#{1,4} / && !inm { h=$0; sub(/^#+ /,"",h); s=slug(h); if(fi==1) R[s]=1; else if(fi==2) FL[s]=1; else { if(s in D) print "DUP heading: " s; D[s]=1 } }
fi==3 && /^```mermaid/ { inm=1; mo++; next }
fi==3 && /^```$/ { if(inm) mc++; inm=0; next }
fi==3 && inm {
  if (match($0, /^  [a-z_]+ \{/)) { e=$0; sub(/^  /,"",e); sub(/ \{.*/,"",e); ER[e]=1 }
  else if (match($0, /^  [a-z_]+ [|}o]/)) { split($0, p, " "); ER[p[1]]=1; ER[p[3]]=1 }
  next
}
fi==3 {
  # Entity definitions: every backticked name in a numbered ### heading; only the FIRST backticked name on a bold definition line.
  if ($0 ~ /^#{3,4} [0-9.]+ `/) { line=$0; while (match(line, /`[a-z_]+`/)) { DEF[substr(line,RSTART+1,RLENGTH-2)]=1; line=substr(line,RSTART+RLENGTH) } }
  else if ($0 ~ /^\*\*`[a-z_]+`/) { match($0, /`[a-z_]+`/); DEF[substr($0,RSTART+1,RLENGTH-2)]=1 }
  if ($0 ~ /^\| `[a-z_]+\./) { line=$0; sub(/^\| `/,"",line); t=line; sub(/\..*/,"",t); FKSRC[t]=1
     n=split($0, c, "|"); tg=c[3]; if (match(tg, /`[a-z_]+\./)) FKT[substr(tg,RSTART+1,RLENGTH-2)]=1 }
  line=$0; while (match(line, /\]\(#[^)]+\)/)) { L[substr(line,RSTART+3,RLENGTH-4)]=1; line=substr(line,RSTART+RLENGTH) }
  line=$0; while (match(line, /\]\(00-ROADMAP\.md#[^)]+\)/)) { RL[substr(line,RSTART+16,RLENGTH-17)]=1; line=substr(line,RSTART+RLENGTH) }
  line=$0; while (match(line, /\]\(01-PRODUCT-FLOWS\.md#[^)]+\)/)) { FLL[substr(line,RSTART+22,RLENGTH-23)]=1; line=substr(line,RSTART+RLENGTH) }
  if ($0 ~ /^\|/) { n=gsub(/\|/,"|"); if (inT && n!=cols) print "TABLE cols line " FNR ": " n " vs " cols; if(!inT) cols=n; inT=1 } else inT=0
}
END{
  for(e in ER) if(!(e in DEF)) print "ER entity without definition: " e
  for(e in DEF) if(!(e in ER)) print "Defined but not in ER: " e
  for(e in FKSRC) if(!(e in ER)) print "FK source not an entity: " e
  for(e in FKT) if(!(e in ER)) print "FK target not an entity: " e
  for(a in L) if(!(a in D)) print "MISSING in-page: " a
  for(a in RL) if(!(a in R)) print "MISSING roadmap: " a
  for(a in FLL) if(!(a in FL)) print "MISSING flows: " a
  print "ER entities " length(ER) ", defined " length(DEF) ", FK targets " length(FKT) ", in-page links " length(L) ", roadmap links " length(RL) ", flows links " length(FLL) ", mermaid " mo "/" mc
}
~~~

---

## 6. Change summary

| File | Change |
|---|---|
| `docs/02-DATA-MODEL.md` | Modified: the A–I changes above (header, §3.1, §4.3, §5.5, §6.2, §6.5, §7.6, §9.3, §9.4, new §9.7, §10.1–§10.5, §13, §14.3, §15.1–§15.3) |
| `docs/01-PRODUCT-FLOWS.md` | Modified: header Revision r3; F-AUTH-01, F-AUTH-02, F-AUTH-03 (one bullet), F-ORD-01, F-ORD-05, §12.4 rules 2–3 |
| `docs/reports/TASK-01-SPECIFICATION-REVIEW-FIXES.md` | Created: this report, plus the `docs/reports/` directory needed to hold it |

**Git:** not available. The project folder is not a Git repository, so there is **no `git diff`**. Instead, pre-edit copies of the two files were saved **outside the repository** (in the agent's session scratchpad), and `diff` statistics against them appear in §5.

---

## 7. Protected-file verification

The before and after checksums are in §5 (checks V1 and V2).
- `docs/00-ROADMAP.md`, before: `17c2b0b2799092ef34ab56c1d4ee404a`
- `docs/PERFORMANCE-AND-NAVIGATION-STANDARDS.md`, before: `4408f9afb25628949c61852a32e9b729`

Whether each is unchanged is shown by the raw output, not asserted here.

---

## 8. Scope verification

- **Not created or modified:** application code, Prisma schema, SQL migration files, package files, configuration files, or any other document. The SQL in data model §5.5 and §10.1 is illustrative specification text inside Markdown, not an executable migration.
- **Directories:** only `docs/reports/` was created, for this report.
- **Flow sections outside the explicit list:** one bullet in F-AUTH-03 (see §1.2).
- **File list:** the full list of repository files after the change is in §5 (check V3).

---

## 9. Reviewer checklist

Before approving the next task, please inspect:

1. **DM §10.1:** is the run-lease claim, heartbeat and release correct, and is dropping session advisory locks justified?
2. **DM §10.3:** fencing rules 3–7. In particular, is attaching output only inside the fenced completion (rule 4) feasible with the storage abstraction?
3. **DM §10.4:** the transition tables. Check `customer_order` (`failed` → `pending`/`paid`), `payment_attempt` (`failed` terminal) and `entitlement_grant` (`failed` → `granted` by admin re-run).
4. **DM §5.5:** the OTP verify sequence. Check that the attempt increment happens before the comparison, the consume is atomic, and the cross-challenge budget works. Check the HMAC input and the key-rotation trade-off.
5. **DM §5.5:** the rate-limit upsert semantics, including window reset when `expires_at <= now()`, counting rejected requests, and failing closed.
6. **DM §9.4 and §9.7:** the role model, the identity-sequence privilege question, and the audit transaction rule.
7. **DM §6.2:** the creation protocol versus reserve-first. A CP2 decision is required.
8. **DM §15.3:** whether the blocker-to-milestone mapping is accurate, especially Milestones 1, 2 and 4.
9. **Scope:** whether the F-AUTH-03 edit is acceptable.
10. **Consistency:** F-NOT-01 and F-PUB-04 were not edited, and are less detailed than the data model.

**Next approval required:**
- (a) review and acceptance of this revision
- (b) whether to authorise the roadmap §9 register update (FQ-1–FQ-27, DQ-1–DQ-7) as the next task (TASK-02)
- (c) the CP2 technical review of the Proposed designs

I have not started any further task.
