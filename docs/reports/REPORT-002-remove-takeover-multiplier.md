# REPORT — SPEC-002

**SPEC executed:** `docs/specs/SPEC-002-remove-takeover-multiplier.md` — Remove
TAKEOVER_MULTIPLIER (dead configuration)
**Branch:** `spec/002-remove-takeover-multiplier`
**Starting commit:** `9beae16` (master, working tree clean)
**Final commit:** none — nothing was committed. The work is in the working
tree, awaiting review (§11).
**Date:** 2026-08-31

Rule: nothing in this report is written that was not run.

---

## 1. Overall result

**Complete.** `TAKEOVER_MULTIPLIER` no longer exists anywhere on the
configuration surface, `./scripts/drift.sh` exits 0 for the first time in the
project's recorded history, and four tests — each seen failing before being
accepted — prevent the variable from coming back, in `src/` as well as on the
configuration surface.

## 2. Summary

`TAKEOVER_MULTIPLIER=1.15` was a leftover of an older takeover rule. It was
set in two live places (`.env.example`, `test/_helpers.js`) and read by
nothing: the rule actually implemented is `max(price + 10%, price + $5)`,
never below the floor, computed in `src/wall.js` from `MIN_INCREMENT_PCT` and
`MIN_INCREMENT_USD`. Both settings were deleted, a stale comment in
`src/wall.js` that still promised "the multiplier" was corrected to describe
the rule the file actually applies, both drift detectors were kept and
sharpened rather than removed, and a guard was added to
`test/invariants.test.js`.

No behaviour changed anywhere, which was the SPEC's central prediction: a
variable nothing reads cannot alter a price, a refusal or a page. The 409
pre-existing tests all still pass; not one was modified. The single deleted
line in `test/invariants.test.js` is its `import` statement, which gained
`readdirSync` — verified with `git diff | grep '^-'`, which returns that one
line and nothing else.

A final review pass, run before any commit, found two defects in the first
implementation and both were corrected — a miscount in the SPEC itself, and a
guard that covered 2 of the 25 files in `src/` while claiming to prevent the
variable from coming back. Both are recorded in §9.

**Procedural note, stated plainly:** no `SPEC-002` existed when this session
started — `docs/specs/` held only SPEC-000, SPEC-001 and the template. Per
`CLAUDE.md §1` the SPEC was written first, from a read-only inspection, and
is part of this diff. **It has not been validated by the operator.** Until it
is, this report describes work performed against a SPEC Claude Code authored
for itself, which is a weaker guarantee than the method intends.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-002-remove-takeover-multiplier.md` | The SPEC, written before implementation, amended twice during it (§9) |
| `docs/reports/REPORT-002-remove-takeover-multiplier.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `.env.example` | `TAKEOVER_MULTIPLIER=1.15` deleted | −1 |
| `test/_helpers.js` | `process.env.TAKEOVER_MULTIPLIER = "1.15";` deleted | −1 |
| `src/wall.js` | header comment: "beat the current price by the multiplier" → the `max(+10%, +$5)`, never-below-floor rule. **Comment only; no executable line touched** | +4 −2 |
| `scripts/drift.sh` | dead-config check also searches `.env.example`; a mention anywhere in `src/`, or an assignment outside it, is reported as a comeback instead of an `ok` | +14 −4 |
| `scripts/audit.sh` | drift-signal block reports absence as the correct state and names the offending files on reappearance; same asymmetric rule | +13 −6 |
| `test/invariants.test.js` | new `describe` "configuration morte", 4 cases; `import` gained `readdirSync` | +50 −1 |

`deploy.env` is byte-for-byte unchanged (`git diff --exit-code deploy.env`
→ clean). No economic value moved.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` (baseline, on `master` before any change) | pass | **409 tests / 409 pass / 0 fail** |
| `npm test` (final) | pass | **413 tests / 413 pass / 0 fail**, 64 suites |
| `node --check test/invariants.test.js` | pass | syntax ok |
| `bash -n scripts/drift.sh`, `bash -n scripts/audit.sh` | pass | both parse |

**Were the new tests seen failing before being accepted? Yes — each one
deliberately, and the output was read, not assumed.** All three bite tests
were re-run after the guard was restructured, not carried over from the
earlier version.

1. Line `TAKEOVER_MULTIPLIER=1.15` appended back to `.env.example` →
   `✖ TAKEOVER_MULTIPLIER est absent de .env.example`, **413 tests, 412 pass,
   1 fail**; `drift.sh` exit 1. Line removed → passes, exit 0.
2. Line `process.env.TAKEOVER_MULTIPLIER = "1.15";` appended back to
   `test/_helpers.js` → `✖ TAKEOVER_MULTIPLIER est absent de
   test/_helpers.js`, **413 tests, 412 pass, 1 fail**; `drift.sh` exit 1.
   Line removed → passes, exit 0.
3. `const _m = Number(process.env.TAKEOVER_MULTIPLIER || 1.15);` appended to
   `src/server.js` — a **read**, in a file the first guard did not cover →
   `✖ aucun fichier de src/ ne référence TAKEOVER_MULTIPLIER`, **413 tests,
   412 pass, 1 fail**. `drift.sh` exit 1 printing `src/server.js`; `audit.sh`
   printing `TAKEOVER_MULTIPLIER is back … src/server.js`. File restored from
   a copy, `git diff src/server.js` empty.

Case 3 is the one that matters: against the *first* implementation the same
line was caught by nothing at all (§9). The remaining surface file
(`deploy.env`) shares its code path with cases 1 and 2 — the same
`readFileSync(...).includes(...)` in the same loop — and was not separately
polluted. Stated as a limit, not glossed as a fourth proof.

The two invariant tests that pin the takeover rule — "la reprise domine les
trois termes, jamais moins" and "l'argent est en centimes entiers, pas en
flottants" — were **not modified** and still pass. That is the evidence the
takeover minimum did not move.

## 6. Audit

Measured the way `audit.sh`'s own header prescribes — two audits, diffed. A
detached worktree was created at `master` (`9beae16`) and audited, then the
working tree was audited, and the two outputs compared. The complete
difference, nothing omitted:

    branch          HEAD → spec/002-remove-takeover-multiplier
    working tree    clean → dirty (the 6 modified files of §4,
                    plus the untracked SPEC and REPORT)
    docs/specs/     3 files → 4        (SPEC-002 added)
    docs/reports/   2 files → 3        (this report added)
    test() declared 301 → 303          (static count: the guard's two
                                        `test()` calls, one of which runs
                                        three times)
    invariants.test.js  10 → 12        (declared test() calls in that file)
    drift signals   --  TAKEOVER_MULTIPLIER set in test/ but read nowhere in src/
                 →  ok  TAKEOVER_MULTIPLIER    absent (removed, SPEC-002)

Nothing else moved. `files with TODO/FIXME/XXX` does not appear in the diff,
so it is unchanged at 3 — measured by its absence from the comparison, not
assumed. The worktree was removed afterwards.

Note for a reader comparing counts: `audit.sh` counts `test()` **declared**
statically (303), while `npm test` counts tests **executed** (413). The guard
declares two `test()` calls — one inside a `for` loop over three
configuration files, one walking `src/` — so it declares 2 and executes 4.
The two numbers measure different things and neither is wrong.

## 7. Drift check

`./scripts/drift.sh` — **exit 1 → exit 0. "no drift."**

    before:  DRIFT TAKEOVER_MULTIPLIER    set outside src/ but read nowhere in src/
    after:   ok    TAKEOVER_MULTIPLIER    absent everywhere

The single divergence this project had been carrying is **fixed**, not
escalated: it was dead configuration, not a contradiction between code and
documentation, so `CLAUDE.md §4` did not apply — there was no decision to
arbitrate, only a variable nothing read.

Two defects in the detectors were found and fixed while doing it:

- **Blind spot.** The check searched `src/`, `test/` and `deploy.env` — not
  `.env.example`, where one of the two live occurrences sat. Removing only
  the `test/` line would have turned the check green while the variable
  remained on the config surface. Measured on an isolated tree: with the
  variable present *only* in `.env.example`, the original search set matches
  **0** files, the patched set matches **1**.
- **False positive.** A test that forbids the variable must spell its name.
  With the removal done and the guard added, the unmodified `drift.sh` exited
  **1** and `audit.sh` printed `TAKEOVER_MULTIPLIER is back …
  test/invariants.test.js` — both pointing at the very test proving it was
  gone. Outside `src/` the detectors now match
  `TAKEOVER_MULTIPLIER[[:space:]]*=` (an assignment) instead of any mention.
  Inside `src/` the search is still a plain mention, because there, reading
  the variable is exactly what having a consumer means.

- **Wrong verdict on the case that mattered.** The check's `in_src` branch
  printed `ok TAKEOVER_MULTIPLIER read by src/` and raised no drift. That was
  correct while the subject was *dead configuration* — a variable read by
  `src/` is not dead. After SPEC-002 the variable must not exist at all, so a
  read in `src/` is the worst comeback, not an `ok`. Measured on the first
  implementation: a read added to `src/server.js` produced `drift.sh` exit 0,
  `audit.sh` reporting absence, and a green suite — the reintroduction passed
  all three guards. Both detectors now treat any mention under `src/` as a
  comeback and name the file.

Both detectors were re-verified afterwards: green when clean; exit 1 with the
offending filename printed when the line is reintroduced into `.env.example`,
`test/_helpers.js`, or as a read in `src/server.js`; green again once
removed.

## 8. Invariants added

One, and it is a *hygiene* invariant, not an economic one, stated in two
halves because they need different rules: **`TAKEOVER_MULTIPLIER` is assigned
nowhere on the configuration surface (`.env.example`, `deploy.env`,
`test/_helpers.js`), and mentioned nowhere at all under `src/` — all 25
files, walked recursively, not a named subset.**

The asymmetry is deliberate. Outside `src/`, matching a bare mention would
flag the guard test itself, which has to spell the name in order to forbid
it. Inside `src/`, matching only an assignment would miss
`num(process.env.TAKEOVER_MULTIPLIER, 1.15)` — a read, carrying no `=`, and
the exact shape that resurrects a setting without anyone writing it in a
configuration file.

Canonical source: `CLAUDE.md §9`, which states the takeover minimum as
`max(price + 10%, price + $5)` and never names a multiplier — the variable
contradicted the invariant table by its mere existence.

Read as **text**, never through `config` at runtime, per `CLAUDE.md §10`:
`test/_helpers.js` deliberately makes `config` non-production inside the
suite, so a runtime read would prove nothing about the repository's contents.

**Deliberately not frozen:** nothing. No 🟡 PROPOSED item was pinned. No new
economic value was written into a test.

## 9. Gaps

None against the SPEC's final acceptance criteria — all nine verified
mechanically, output read.

The SPEC was **amended four times** rather than silently diverged from. Each
amendment is marked in the SPEC itself. Two during implementation:

1. Criterion 5 said `410 tests`. The real count is **413**.
2. Criterion 1 required that `grep TAKEOVER_MULTIPLIER` return nothing. That
   is impossible and was wrong: the guard test must contain the string to
   forbid it. Tightened to "no *assignment* survives".

And two more in **final review, before any commit** — these are the serious
ones, because both were defects in work already reported as complete:

3. **The count in §2 was wrong.** The SPEC said "7 files, 9 occurrences". A
   number that matched nothing: recounted on `master`, it is **7 files, 10
   lines, 11 string instances** (`scripts/audit.sh:69` carries the name
   twice on one line). A wrong count in the document whose subject is a
   variable's occurrences is not a typo — it is the exact failure
   `CLAUDE.md §5` names, committed in the SPEC that quotes §5.
4. **The guard did not guard.** It listed five files, two of them in `src/`,
   out of 25 — and the SPEC and this report both claimed it "prevents the
   variable from coming back". Measured: a read in `src/server.js` was
   caught by none of the three checks. Now one test walks all of `src/`
   recursively and both detectors treat any mention there as a comeback;
   proven by bite test 3 in §5.

Item 4 is worth stating plainly rather than burying: between the first report
and this one, the claim "the variable cannot come back" was **false as
written**. It held for the two files where the variable had been, and failed
for the 23 files where it could return.

One assertion in the SPEC's first draft was written before being measured —
that `grep 'process.env\['` in `src/` found "one site". Run, it finds **two**
(`src/config.js:94`, `src/graduation.js:32`), both building
`AGENT_<NAME>_<SUFFIX>` keys, neither able to produce `TAKEOVER_MULTIPLIER`.
The SPEC was corrected to the measured fact before implementation continued.
Recorded here because `CLAUDE.md §5` applies to Claude's own output.

## 10. Risks

- **A consumer reached the variable by a path `grep` cannot see.** Checked:
  the only two computed `process.env[...]` accesses in `src/` build
  `AGENT_*` keys. Residual risk low; the full suite is the detector, and it
  is green.
- **`.env.example` was a template someone copies into a real `.env`.** They
  lose a knob — an inert one. A value nothing reads buys nothing but false
  confidence, which is the argument for removal, not against it.
- **The `src/wall.js` comment is now the only prose describing the takeover
  rule in that file, and prose drifts.** What would reveal it: the rule
  itself is pinned by two invariant tests, so a drift would be a wrong
  comment above right code — the same class of defect this SPEC just
  removed, one level down.
- **The guard walks `src/` but not `scripts/`, `public/` or `test/` beyond
  `_helpers.js`.** A reintroduction in a shell script would be missed by the
  test, though `audit.sh` and `drift.sh` search `test/` and would catch an
  assignment there. This is a bounded, known limit, stated rather than
  discovered later — the same mistake as item 4 of §9 would be to claim
  coverage that is not there.
- **The `src/` walk reads all 25 files on every run of the suite.** Measured
  cost: the whole suite still runs in well under a second. Not a concern at
  this size; it would become one if `src/` grew by an order of magnitude.
- **This SPEC was self-authored.** The strongest guarantee in this method is
  that someone other than the implementer decides what gets built. That
  guarantee is not present here (§11).

## 11. Requires human validation

Nothing below was done by Claude Code.

1. **Validation of SPEC-002 itself**, which Claude Code wrote rather than
   received. This is the first item for a reason.
2. **Review of the diff** — 6 files modified, 2 created. Nothing is
   committed; the working tree holds the work.
3. **Commit, and its message.** Not done, per instruction: the session was
   asked to stop before any commit.
4. **Merge, push, deploy.** None authorized, none attempted. `deploy.sh` was
   not run and could not pass anyway — `docs/STATE.md` records the Anthropic
   credit balance as exhausted, which fails four preflight probes.
5. **Confirmation that the four historical documentation hits are to be left
   alone** (SPEC-000:52, SPEC-001:146, REPORT-000:141 and :166). They were
   not touched, following the operator's own `DEPLOY.md:607` arbitration
   under SPEC-001: a SPEC and a REPORT record what was true on a given day,
   and rewriting them to match today destroys the audit trail.
6. **A decision on two divergences found in passing and deliberately not
   touched** (§12).

## 12. Still manual

Two divergences were **measured and reported, not corrected**, because
neither is caused by this work and both need an arbitration this SPEC does
not have:

- **`docs/STATE.md` is stale.** It records "389 tests, 389 pass"; the
  measured baseline on `master` was **409**. It also names branch
  `spec/001-workflow-automation` and base commit `5f5ed4c`, while `master`
  is at `9beae16`. Fixing it is a one-line edit; deciding what STATE.md
  should say at the end of an *uncommitted* session is not Claude's call.
- **`.env.example` disagrees with `deploy.env` on three live values:**
  `SEAT_FLOOR_USD=50` vs `15`, `SEAT_HOLD_MINUTES=20` vs `5`, and
  `GATE_BUDGET_MS=2000` vs the `5000` default in `src/config.js`. These are
  *not* dead — they are read. The question underneath is whether
  `.env.example` is a local-development sample (in which case the divergence
  is intentional and should be commented as such) or a production template
  (in which case it is drift, and `drift.sh` should be checking it the way
  it checks `deploy.env`). That question is architecture, and the method
  says Claude does not answer it.

Neither is automated by this work. `drift.sh` now covers `.env.example` for
dead configuration only, not for value divergence.

## 13. Recommended next step

**Validate or reject SPEC-002, then decide the `.env.example` question.**

The second one is the one that pays: `drift.sh` currently proves `deploy.env`
agrees with `CLAUDE.md` on five invariants, and proves nothing at all about
`.env.example`, which is what a new contributor copies. One arbitration —
sample or template — turns three silent divergences into either a documented
intention or a sixth checked invariant.
