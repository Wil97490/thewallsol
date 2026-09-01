# SPEC-013A — Documentation state / decisions refresh

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-01
**Status:** validated
**Branch:** `spec/013a-state-decisions-refresh`

---

## 1. Objective

`docs/STATE.md` and `docs/DECISIONS.md` reflect the measured reality of
`origin/master` after PR #2 through #14, instead of a snapshot dated
2026-08-31 that predates all of them.

## 2. Context

`docs/STATE.md`'s own header read "base commit `5f5ed4c` · branch
`spec/001-workflow-automation`" — before PR #2's merge. Measured
discrepancies found before writing anything: test count (389 documented vs
413 real), the Anthropic credit blocker (documented as active; live
evidence shows it resolved, with a caveat), Cloud Run traffic (documented
as an unpromoted `pre` candidate; live state is 100% on the latest
revision), and commercial state (documented as 0 seats sold and two
refusals; live state is 1 seat taken and three refusals).

## 3. Scope

- Rewrite `docs/STATE.md`'s facts to match `origin/master` at
  `1da86e891` and live-measured production state (tests, deployment,
  recent PR integrations, known blockers, commercial state).
- Append new rows to `docs/DECISIONS.md` for decisions made since its last
  entry (2026-08-30), preserving its existing table structure and
  vocabulary — append-only, no row deleted or rewritten.
- Add this SPEC and its REPORT.

## 4. Out of scope

- No code change. No file outside `docs/STATE.md`, `docs/DECISIONS.md`,
  this SPEC, and its REPORT.
- No correction to seat №10's `$1` price or any other Firestore data —
  its resolution remains an open, operator-only decision, only *recorded*
  as open here.
- No rewriting of existing `SPEC-0NN`/`REPORT-0NN` documents, even where
  a numbering inconsistency was found (see REPORT §9).
- No new SPEC-013A implementation of the Anthropic-credit or hero
  lazy-loading follow-ups mentioned in STATE.md — those remain unspecced.

## 5. Files concerned

| File | Expected change |
|---|---|
| `docs/STATE.md` | Rewritten to current, measured facts |
| `docs/DECISIONS.md` | New rows appended, nothing removed |
| `docs/specs/SPEC-013A-state-decisions-refresh.md` | New |
| `docs/reports/REPORT-013A-state-decisions-refresh.md` | New |

## 6. Expected behaviour

No observable change to the running application. This is documentation
only — `npm test` / `npm run check` continue to pass unchanged, since no
application file is touched.

## 7. Acceptance criteria

1. `docs/STATE.md`'s "Last updated" line names the correct master SHA and
   branch.
2. `docs/STATE.md`'s test count matches a real `npm test` run on
   `origin/master`.
3. Every PR from #2 to #14 (inclusive, merged ones only — #3 and #6 are
   not merged) is listed with its real title, branch, and merge date,
   sourced from `gh pr list`.
4. The Anthropic credit blocker section is evidence-based: it states what
   was measured, when, and does not claim more certainty than the evidence
   supports.
5. Commercial state (seats sold, refusals published) matches a live read
   of `/api/wall` and `/api/refused` at the time of writing.
6. `docs/DECISIONS.md`'s existing rows are byte-identical to before; only
   new rows are appended.
7. `npm test`, `npm run check`, `git diff --check` all pass on the
   resulting branch.
8. Any fact that could not be established from the repository, PRs, or
   reports is named as such in the REPORT — never guessed.

## 8. Invariants that must not move

None — this SPEC touches no application code, so no `CLAUDE.md §9`
invariant is near this work.

## 9. Risks

A documentation file that overstates certainty (e.g. claiming the
Anthropic blocker is *fully* reconfirmed by a real sale, when no seat has
sold since the fix) would itself become the kind of unmeasured claim the
project's own Method decisions forbid. Mitigated by citing the exact
evidence and its timestamp, and stating the gap explicitly.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `npm test` | no application code was touched, so the suite behaves exactly as on `origin/master` | no — this SPEC changes no code path, there is nothing to see fail |
| `npm run check` | no syntax error introduced anywhere (defensive; only `.md` files change) | no |
| `git diff --check` | no trailing whitespace / no whitespace errors in the new/changed `.md` files | no |

## 11. Human validation required

PR review and merge — left to the operator, per the standing workflow.
