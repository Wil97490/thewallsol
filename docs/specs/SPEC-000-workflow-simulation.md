# SPEC-000 — Workflow simulation

**Author:** Claude Code (self-test of the scaffolding)
**Date:** 2026-08-31
**Status:** validated
**Branch:** `spec/001-workflow-automation`

Deliberately non-destructive. It exists to prove the cycle runs end to end
before a real SPEC depends on it. It touches no product code.

---

## 1. Objective

Prove that SPEC → inspection → implementation → tests → audit → REPORT can be
executed without reinventing the instructions, and that the barriers refuse
what they are supposed to refuse.

## 2. Context

New scaffolding (`CLAUDE.md`, `.claude/`, `scripts/audit.sh`, `drift.sh`,
`report.sh`, `test/invariants.test.js`). Untested scaffolding is a claim, not
a tool.

## 3. Scope

Run the cycle. Produce a REPORT from real output.

## 4. Out of scope

Any change to `src/`, `public/`, `deploy.env`, or the economic parameters.
No deploy, no push, no merge.

## 5. Files concerned

| File | Expected change |
|---|---|
| `docs/reports/REPORT-000-workflow-simulation.md` | created by `scripts/report.sh` |

Nothing else.

## 6. Expected behaviour

`./scripts/report.sh 000 workflow-simulation` produces a report containing a
real test count, a real audit and a real drift result — no placeholder passing
as a measurement.

## 7. Acceptance criteria

1. `npm test` green, count recorded and matching the report.
2. `audit.sh` runs read-only and leaves the tree unchanged.
3. `drift.sh` reports the known `TAKEOVER_MULTIPLIER` divergence rather than
   hiding it.
4. The generated report contains no test result that was not executed.
5. `git diff -- src/ public/ deploy.env` is empty after the simulation.

## 8. Invariants that must not move

All of `CLAUDE.md §9`. None is in scope.

## 9. Risks

A report generator that fabricates a passing result would be worse than no
generator. Criterion 4 is the one that matters.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `test/invariants.test.js` | the canonical values and shape guarantees | yes — four mutations |

## 11. Human validation required

Commit, push, merge, deploy. None performed here.
