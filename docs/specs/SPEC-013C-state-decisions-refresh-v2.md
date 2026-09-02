# SPEC-013C — Documentation state / decisions refresh (v2, post PR #15–16)

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-02
**Status:** validated
**Branch:** `spec/013c-state-decisions-refresh-v2`

---

## 1. Objective

`docs/STATE.md` and `docs/DECISIONS.md` reflect the measured reality of
`origin/master` and of production after PR #15 and PR #16, instead of a
snapshot dated 2026-09-01 that predates both.

## 2. Context

The read-only "prochain chantier" audit run immediately after PR #16's
deploy found `STATE.md` stale again, in the same way SPEC-013A had found
it stale before PR #15 — the exact pattern SPEC-013A was meant to close
recurred after two more merges. Concretely: the test count (413
documented vs 415 real), the live revision (`wall-00115-ref` documented
vs `wall-00117-wew` live), and — the most consequential one — a line
stating the hero still downloads both theme variants on every visit,
which PR #16 had just made false.

## 3. Scope

- Update `docs/STATE.md`'s facts to match `origin/master` at `3331ac741`
  and live-measured production state after PR #16's deploy (tests, live
  revision, recent-integrations table extended through #16, the
  now-corrected hero-loading claim, the Anthropic-blocker evidence
  re-confirmed across two deploys, commercial state re-verified today).
- Append one row to `docs/DECISIONS.md`'s Method table for the technical
  decision made in SPEC-013B (CSS `background-image` over `<picture>`),
  preserving its existing table structure and vocabulary — append-only,
  no row deleted or rewritten.
- Add this SPEC and its REPORT.

## 4. Out of scope

- No code change. No file outside `docs/STATE.md`, `docs/DECISIONS.md`,
  this SPEC, and its REPORT.
- No correction to seat №10's `$1` price or any other Firestore data.
- No rewriting of `SPEC-0NN`/`REPORT-0NN` documents, including the
  already-known gap for PR #4 and PR #13.
- No retrospective correction of earlier `DECISIONS.md` rows.
- Closing PR #6, deleting branches, or the `ETag`/`Last-Modified` idea
  flagged in the same audit — explicitly deferred to a separate GO.

## 5. Files concerned

| File | Expected change |
|---|---|
| `docs/STATE.md` | Facts corrected against `origin/master` at `3331ac741` and live production, per §2 |
| `docs/DECISIONS.md` | One row appended to the Method table, nothing removed |
| `docs/specs/SPEC-013C-state-decisions-refresh-v2.md` | New |
| `docs/reports/REPORT-013C-state-decisions-refresh-v2.md` | New |

## 6. Expected behaviour

No observable change to the running application — documentation only.
`npm test` / `npm run check` continue to pass unchanged.

## 7. Acceptance criteria

1. `docs/STATE.md`'s header names `3331ac741` and today's date.
2. Test count matches a real `npm test` run on this branch.
3. PR #15 and PR #16 appear in the "Recent integrations" table and
   narrative, with real titles/branches/merge dates sourced from
   `gh pr list`.
4. The claim that both hero WebP variants load on every visit is removed
   and replaced with a statement matching PR #16's actual, verified
   behaviour — not a stronger claim than what was measured.
5. The live revision and traffic figures match a fresh
   `gcloud run services describe wall` read.
6. The Anthropic-blocker section states only what has actually been
   re-measured (two deploys' preflight logs), with the same honest
   caveat about no real post-fix listing — not overstated into a full
   resolution confirmation.
7. Commercial state (seats sold, refusals) matches a live read of
   `/api/wall` and `/api/refused` taken today, dated accordingly.
8. `docs/DECISIONS.md`'s existing rows are byte-identical to before;
   only one new row is appended.
9. `npm test`, `npm run check`, `git diff --check` all pass.
10. Nothing is written that was not measured in this pass or already
    established (and cited as such) in an earlier report.

## 8. Invariants that must not move

None — no application code is touched.

## 9. Risks

Same class of risk as SPEC-013A: overstating certainty (e.g. presenting
the Anthropic blocker as fully closed by a real sale, or claiming a
metric was checked today when it was actually carried over from a
slightly earlier report). Mitigated the same way — cite the exact
evidence and its timestamp, and re-measure live wherever the cost of
doing so is low (it was, here).

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `npm test` | no application code touched | no — nothing changes that could fail |
| `npm run check` | no syntax error anywhere (defensive; only `.md` files change) | no |
| `git diff --check` | no whitespace errors in the changed `.md` files | no |

## 11. Human validation required

PR review and merge — left to the operator, per the standing workflow.
