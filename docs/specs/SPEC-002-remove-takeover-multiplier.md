# SPEC-002 — Remove TAKEOVER_MULTIPLIER (dead configuration)

**Author:** Claude Code (from a read-only inspection + user instruction, 2026-08-31)
**Date:** 2026-08-31
**Status:** draft — awaiting operator validation
**Branch:** `spec/002-remove-takeover-multiplier`

> **Provenance note.** The operator asked for "SPEC-002: remove
> TAKEOVER_MULTIPLIER". No `docs/specs/SPEC-002-*.md` existed in the
> repository at the time (verified: `docs/specs/` contained only
> SPEC-000, SPEC-001 and SPEC-TEMPLATE). Per `CLAUDE.md §1`, this SPEC was
> written from the inspection below rather than assumed. Every figure in
> §2 was measured, not recalled.
>
> **Branch numbering caveat.** A branch named `spec/002-token-percentage-
> correction` already exists on `origin`; it carried *SPEC-001*. The
> numbering of branches and SPECs diverged before this session. This work
> uses `spec/002-remove-takeover-multiplier`, matching its SPEC number.

---

## 1. Objective

After this work, the identifier `TAKEOVER_MULTIPLIER` exists nowhere in the
configuration surface of the repository, `scripts/drift.sh` exits 0, and a
test prevents the variable from being reintroduced.

## 2. Context

`TAKEOVER_MULTIPLIER` is a leftover of an older takeover rule (a flat ×1.15
on the sitting price). The rule actually implemented in V4.54 is the one
pinned by `CLAUDE.md §9`:

> Takeover minimum: `max(price + 10%, price + $5)`, and never below the floor

That rule reads `MIN_INCREMENT_PCT` and `MIN_INCREMENT_USD`
(`src/config.js:64-65`), computed in `src/wall.js:39-58` (`minimumBid`).
`TAKEOVER_MULTIPLIER` is read by nothing.

Measured, read-only, 2026-08-31 (`grep -rn TAKEOVER_MULTIPLIER`, excluding
`node_modules/` and `.git/`) — **7 files, 10 lines, 11 occurrences of the
string**, `scripts/audit.sh:69` carrying the name twice on one line:

> An earlier draft of this SPEC said "9 occurrences", a number matching
> neither the lines nor the string instances. Recounted on `master`
> (`git grep -c` → 10 lines, `git grep -o` → 11 instances, `git grep -l` → 7
> files) and corrected in final review, before any commit. `CLAUDE.md §5`
> applies to this document as much as to the product.

| Location | Nature | Disposition |
|---|---|---|
| `.env.example:26` — `TAKEOVER_MULTIPLIER=1.15` | live config surface, read by nothing | 🔴 remove |
| `test/_helpers.js:26` — `process.env.TAKEOVER_MULTIPLIER = "1.15";` | live test setup, consumed by nothing | 🔴 remove |
| `scripts/drift.sh:63` | the detector that reports the dead variable | 🟢 keep as a guard, extend coverage |
| `scripts/audit.sh:69-73` | second detector, same variable | 🟢 keep as a guard, correct its wording |
| `src/wall.js:11` — *"a takeover must beat the current price by the multiplier"* | header comment describing a rule that no longer exists | 🔴 correct |
| `docs/specs/SPEC-000-workflow-simulation.md:52` | historical acceptance criterion of a past session | 🟢 do not touch |
| `docs/specs/SPEC-001-token-percentage-correction.md:146` | historical acceptance criterion of a past session | 🟢 do not touch |
| `docs/reports/REPORT-000-workflow-simulation.md:141,166` | historical measurement of a past session | 🟢 do not touch |

The precedent for leaving the four documentation hits alone is the operator's
own arbitration on `DEPLOY.md:607` under SPEC-001: *"historical, not to be
modified."* A SPEC and a REPORT record what was measured on a given day.
Rewriting them to match today's state would destroy the audit trail this
project's method depends on.

Baseline measured before any change, on `master` at `9beae16`:

- `npm test` → **409 tests, 409 pass, 0 fail**
- `./scripts/drift.sh` → exit **1**, one signal:
  `DRIFT TAKEOVER_MULTIPLIER  set outside src/ but read nowhere in src/`
- `./scripts/audit.sh` → prints
  `--   TAKEOVER_MULTIPLIER set in test/ but read nowhere in src/`

## 3. Scope

- `.env.example` — delete the `TAKEOVER_MULTIPLIER` line, and only that line.
- `test/_helpers.js` — delete the `TAKEOVER_MULTIPLIER` line, and only that
  line. Every other hermetic override in that block is preserved
  (`CLAUDE.md §10`).
- `src/wall.js` — the header comment at line 11 only. No executable
  statement in this file is touched.
- `scripts/drift.sh` — the dead-configuration check keeps its subject and
  gains `.env.example` in the set of files it searches (see §6, blind spot).
- `scripts/audit.sh` — the drift-signal block reworded so it reports the
  variable's *absence* as the correct state.
- `test/invariants.test.js` — one new test, the regression guard.

## 4. Out of scope

- Any economic value. Nothing in `deploy.env` changes; no invariant moves.
- Any executable line in `src/`. `minimumBid`, `checkBid`, `takeoverPrice`
  and every caller are untouched.
- The four historical documentation hits listed in §2.
- `docs/STATE.md` — it is stale on two independent counts (it says 389
  tests where 409 are measured; it names branch `spec/001-workflow-
  automation` and base commit `5f5ed4c`). That is a real divergence, but it
  predates this work and is not caused by it. It is **reported, not
  silently corrected** (`CLAUDE.md §4`).
- The other `.env.example` divergences noticed in passing —
  `SEAT_FLOOR_USD=50` vs `deploy.env`'s `15`, `SEAT_HOLD_MINUTES=20` vs `5`,
  `GATE_BUDGET_MS=2000` vs the `5000` default in `src/config.js`. These are
  a separate question (is `.env.example` a local-development sample or a
  production template?) and need their own arbitration. **Reported, not
  touched.**
- Commit, merge, push, deploy. None of these is authorized by this SPEC.

## 5. Files concerned

| File | Expected change |
|---|---|
| `.env.example` | Line `TAKEOVER_MULTIPLIER=1.15` removed. |
| `test/_helpers.js` | Line `process.env.TAKEOVER_MULTIPLIER = "1.15";` removed. |
| `src/wall.js` | Header comment line 11 restated in terms of the rule that is actually implemented; no code change. |
| `scripts/drift.sh` | Dead-config check also searches `.env.example`; a mention anywhere in `src/` or an assignment outside it is reported as a comeback, not as an `ok` (§6). |
| `scripts/audit.sh` | Drift-signal block reports absence as correct and names the offending files on a comeback; same src/-mention vs outside-assignment rule. |
| `test/invariants.test.js` | New `describe` block, four cases: one per configuration-surface file (`.env.example`, `deploy.env`, `test/_helpers.js`), plus one that walks **all of `src/`** recursively. |
| `docs/specs/SPEC-002-remove-takeover-multiplier.md` | This file (new). |
| `docs/reports/REPORT-002-remove-takeover-multiplier.md` | Session report (new). |

Anything not in this table is out of scope. If the work needs another file,
implementation stops and this SPEC is amended first.

## 6. Expected behaviour

**No behavioural change is expected anywhere.** This is the defining property
of the work: the variable is read by nothing, so removing it cannot alter a
price, a refusal or a page. If any test that is not the new guard changes its
result, the premise of this SPEC is wrong and the work stops.

**`src/wall.js:11`** — the comment must describe the implemented rule. It
currently promises a multiplier the file does not apply; a reader trusting it
would look for a `×1.15` in `minimumBid` and not find one. It must name the
`max(+%, +$)` rule and stop using the word "multiplier".

**`scripts/drift.sh` blind spot** — the check at line 63 searches `src/`,
`test/` and `deploy.env`. It does **not** search `.env.example`, which is
where one of the two live occurrences lives. Removing only `test/_helpers.js`
would therefore turn the check green while the variable was still on the
config surface. `.env.example` is added to the searched set so that the guard
covers the ground it claims to cover.

**`scripts/audit.sh`** — after removal, both branches of its current block
are wrong: the `if` branch would print `ok TAKEOVER_MULTIPLIER has a
consumer in src/` if the variable ever came back into `src/`, which is a
reintroduction, not an `ok`. The block must report absence as the correct
state.

**A read inside `src/` is the reintroduction that matters, and it is the one
the first implementation missed.** Found in final review, before any commit.
The danger is not `TAKEOVER_MULTIPLIER=1.15` in a `.env` — it is
`num(process.env.TAKEOVER_MULTIPLIER, 1.15)` appearing in `src/`, which
resurrects the setting without writing it in any configuration file. Measured
on the first implementation: a read added to `src/server.js` was missed by
all three guards at once — the test covered only 2 of the 25 files in `src/`,
`audit.sh` matched an assignment and a read carries no `=`, and `drift.sh`
reported `ok TAKEOVER_MULTIPLIER read by src/`, treating the comeback as
correct. The rule is therefore asymmetric and must stay so: **inside `src/`
any mention counts; outside `src/` only an assignment counts.**

**Both detectors must match an assignment outside `src/`, not a mention.** This was found
during implementation, not anticipated when this SPEC was first drafted, and
it is recorded here rather than fixed silently. The guard test of §10 has to
spell `TAKEOVER_MULTIPLIER` in order to forbid it — so a detector that greps
for any occurrence of the name flags the very test that proves the variable
is gone. Measured on the working tree: with the removal done, the unmodified
`drift.sh` exited **1** and `audit.sh` printed `TAKEOVER_MULTIPLIER is back
… test/invariants.test.js`, both pointing at the guard. Outside `src/` the
detectors therefore search for `TAKEOVER_MULTIPLIER[[:space:]]*=`, which
matches `TAKEOVER_MULTIPLIER=1.15` and `process.env.TAKEOVER_MULTIPLIER =
"1.15"` and does not match a test asserting absence. Inside `src/` the search
stays a plain mention: there, reading the variable is exactly what "has a
consumer" means.

**Exit codes** — `./scripts/drift.sh` must exit **0** after this work
(baseline: 1). This is the single observable outcome of the SPEC.

## 7. Acceptance criteria

1. No **assignment** of the variable survives:
   `grep -rnE 'TAKEOVER_MULTIPLIER[[:space:]]*=' .env.example test/ src/ deploy.env`
   returns nothing (exit 1). The only occurrences left in that set are the
   guard test's own assertions in `test/invariants.test.js`, which name the
   variable in order to forbid it — see §6. (This criterion was tightened
   during implementation: as first written it grepped for any mention, which
   the guard itself necessarily matches.)
2. `grep -rln TAKEOVER_MULTIPLIER docs/` still returns exactly the four
   historical files listed in §2, byte-for-byte unchanged
   (`git diff --stat docs/` shows no modification to them).
3. `./scripts/drift.sh` exits **0** and prints
   `ok   TAKEOVER_MULTIPLIER    absent everywhere`.
4. `./scripts/audit.sh` prints no `TAKEOVER_MULTIPLIER` warning line.
5. `npm test` reports **413 tests, 413 pass, 0 fail** — the 409 of the
   baseline plus the four guard cases added under §10: three naming a
   configuration-surface file each, so that a failure names the file, and one
   walking all of `src/` and listing every offender it finds. Not one test
   fewer.
6. `git diff --name-only` lists only the files in §5.
7. `deploy.env` is byte-for-byte unchanged — verified by
   `git diff --exit-code deploy.env`.
8. No executable line of `src/` is modified: `git diff src/` shows only
   comment lines.
9. The remaining hermetic overrides in `test/_helpers.js` — `SEAT_FLOOR_USD`,
   `SEAT_HOLD_MINUTES`, `SEAT_PROTECT_MINUTES`, `MIN_INCREMENT_PCT`,
   `MIN_INCREMENT_USD`, `MAX_BID_USD`, `MAX_TOP_HOLDER_PCT`, `MIN_LP_USD`,
   `FLAG_LP_USD`, `FLAG_AGE_HOURS`, `FLAG_TOP_HOLDER_PCT` — are all still
   present and unchanged (`CLAUDE.md §10`).

## 8. Invariants that must not move

The work comes near the **takeover minimum** invariant
(`max(price + 10%, price + $5)`, never below the floor) because it deletes a
variable whose *name* claims to govern it. It does not move it: the invariant
is implemented by `MIN_INCREMENT_PCT` / `MIN_INCREMENT_USD`, neither of which
is touched, and it is already pinned by `test/invariants.test.js`
("la reprise domine les trois termes, jamais moins", "l'argent est en
centimes entiers"). Those tests must stay green without modification — that
is the proof the invariant did not move.

The hygiene invariant this SPEC *adds* is stated deliberately in two halves,
because they need different rules: `TAKEOVER_MULTIPLIER` is **assigned
nowhere** on the configuration surface (`.env.example`, `deploy.env`,
`test/_helpers.js`) and **mentioned nowhere at all** under `src/` — every
file, recursively, not a named subset.

No other `CLAUDE.md §9` invariant is approached. Nothing 🟡 PROPOSED is
frozen by this SPEC.

## 9. Risks

- **A hidden consumer exists that `grep` missed** — e.g. the name built by
  string concatenation, or read through a `process.env[...]` computed key.
  Measured: `grep -rn 'process\.env\[' src/ scripts/` finds exactly two
  sites — `src/config.js:94` (`AGENT_${name}_ENABLED`) and
  `src/graduation.js:32` (`AGENT_${agent}_SUPERVISED`). Both build a key of
  the form `AGENT_<NAME>_<SUFFIX>`; neither can ever produce
  `TAKEOVER_MULTIPLIER`. Residual risk is low and the full suite is the
  detector.
- **`.env.example` is a production template for someone**, and deleting a
  line from it removes a knob an operator relies on. The knob is inert — a
  value nothing reads cannot be relied on for anything but false confidence.
  This is precisely the risk that justifies removal rather than the risk
  against it.
- **Removing the drift check along with the variable** would leave nothing to
  catch a reintroduction. Mitigated by keeping both detectors and adding the
  test in §10 — the SPEC deliberately removes the *variable*, not its guard.
- **The new guard is written so loosely it can never fail** (e.g. scanning a
  directory that will always be clean). Mitigated by §10's requirement that
  it be *seen* failing against a deliberately reintroduced line before being
  accepted.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `test/invariants.test.js` — new `describe` "configuration morte", 4 cases | the variable is assigned nowhere in `.env.example`, `deploy.env`, `test/_helpers.js`, and mentioned nowhere under `src/` (all 25 files, walked recursively) | **yes** — reintroduce the line in `.env.example`, watch it fail; restore, watch it pass. Repeat for `test/_helpers.js`. For the `src/` case, add a *read* to `src/server.js` — the exact shape the first implementation let through — watch it fail, restore, watch it pass. |
| `scripts/drift.sh` blind spot | the original check, searching only `test/` and `deploy.env`, reports "absent everywhere" while the variable still sits in `.env.example` | **yes** — demonstrated on an isolated tree: original search set matches 0 files, patched set matches 1 |
| `test/invariants.test.js` — existing, unmodified: "la reprise domine les trois termes" | the takeover minimum did not move | no — already passing, re-run as the regression proof |
| `test/invariants.test.js` — existing, unmodified: "l'argent est en centimes entiers" | the integer-cents arithmetic is intact | no — already passing, re-run |
| `npm test` full suite | nothing else regressed; count goes 409 → 413 | no — baseline measured before the change |
| `./scripts/drift.sh` | exit 1 → exit 0 | the exit-code change *is* the observation |

The new test reads the files as **text**, never through `config` at runtime —
`test/_helpers.js` deliberately makes `config` non-production inside the
suite (`CLAUDE.md §10`), so a runtime read would prove nothing.

## 11. Human validation required

- **Validation of this SPEC itself**, which was authored by Claude Code
  rather than supplied. Nothing here may be treated as validated until the
  operator says so.
- Confirmation that the four historical documentation hits (§2) are indeed
  to be left alone, consistent with the `DEPLOY.md:607` arbitration.
- Review of the diff before any commit. This SPEC authorizes no commit, no
  merge, no push and no deploy.
- A decision, separately, on the `.env.example` divergences reported in §4.
