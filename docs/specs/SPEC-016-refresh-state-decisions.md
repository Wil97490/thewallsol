# SPEC-016 — Documentation state / decisions refresh

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-02
**Status:** validated
**Branch:** `spec/016-refresh-state-decisions`

---

## 1. Objective

`docs/STATE.md` and `docs/DECISIONS.md` reflect the measured reality of
`origin/master` after PR #15 through #20 and the production deployment
that followed, instead of a snapshot frozen at PR #15's own refresh.

## 2. Context

`docs/STATE.md`'s own header still read "base commit `1da86e891`" — the
commit *before* PR #15 (its own refresh pass) merged. Measured
discrepancies found before writing anything: test count (413 documented
vs 429 real), the live Cloud Run revision (`wall-00115-ref` documented vs
`wall-00123-dag` real, measured via `gcloud run services describe`), and
the PR table stopping at #14 while five more PRs (#15, #16, #18, #19,
#20) have since merged. One documented claim is now flatly wrong, not
just stale: the PR #12 paragraph states "both theme variants still load
on every visit; no lazy-loading by active theme has been built" —
PR #16 (SPEC-013B) built exactly that, verified in this session, in a
real browser, against production.

PR #17 (`spec/013c-state-decisions-refresh-v2`, its own attempt at this
exact refresh, scoped to PR #15-16 only) is still **OPEN**, never merged,
and is not touched, closed, or presented as merged by this SPEC — it is
recorded as a fact (superseded, abandoned mid-air) so a future session
does not mistake it for live work.

## 3. Scope

- Rewrite `docs/STATE.md`'s facts to match `origin/master` at
  `74647b42d5b3e2f1e7308ad3bc99cb358d9f4beb` and live-measured production
  state (tests, deployment, recent PR integrations, the Firebase Hosting
  incident and its resolution, commercial state).
- Append new rows to `docs/DECISIONS.md` for decisions made since its
  last entry (2026-09-01), preserving its existing table structure and
  vocabulary — append-only, no row deleted or rewritten.
- Add this SPEC and its REPORT.

## 4. Out of scope

- No code change. No file outside `docs/STATE.md`, `docs/DECISIONS.md`,
  this SPEC, and its REPORT.
- No correction to seat №10's `$1` price or any other Firestore data —
  its resolution remains an open, operator-only decision, only
  *reconfirmed* as still open and still unchanged here.
- No rewriting of any existing `SPEC-0NN`/`REPORT-0NN` document, merged
  or not.
- PR #17 is not closed, merged, edited, or otherwise touched by this
  SPEC — recording its status is not the same as acting on it.

## 5. Files concerned

| File | Expected change |
|---|---|
| `docs/STATE.md` | Rewritten to current, measured facts |
| `docs/DECISIONS.md` | New rows appended, nothing removed |
| `docs/specs/SPEC-016-refresh-state-decisions.md` | New |
| `docs/reports/REPORT-016-refresh-state-decisions.md` | New |

## 6. Expected behaviour

No observable change to the running application. This is documentation
only — `npm test` / `npm run check` continue to pass unchanged, since no
application file is touched.

## 7. Acceptance criteria

1. `docs/STATE.md`'s "Last updated" line names the correct master SHA.
2. `docs/STATE.md`'s test count matches a real `npm test` run on
   `origin/master`.
3. Every PR from #15 to #20 is listed with its real title, branch, and
   merge date, sourced from `gh pr view` — #17 correctly excluded from
   the merged table and its OPEN status recorded in prose instead.
4. The corrected hero-loading claim states what SPEC-013B actually built
   and what this session actually re-verified live in production, not a
   restatement of the old, now-false claim.
5. The Firebase Hosting conditional-cache incident (found, root-caused,
   fixed across PR #19 and PR #20, verified live against
   `https://thewallsol.com` after the final deploy) is recorded with its
   evidence, distinguishing what was merged from what was measured in
   production.
6. Production state (revision, traffic percentage) matches a live
   `gcloud run services describe` read at the time of writing.
7. `docs/DECISIONS.md`'s existing rows are byte-identical to before; only
   new rows are appended.
8. `npm test`, `npm run check`, `git diff --check` all pass on the
   resulting branch.
9. Any fact that could not be established from the repository, PRs, or
   reports is named as such in the REPORT — never guessed.

## 8. Invariants that must not move

None — this SPEC touches no application code, so no `CLAUDE.md §9`
invariant is near this work.

## 9. Risks

A documentation file that presents a merged change as a production fact
without the production evidence behind it (or vice versa — a real
production measurement presented as if it were merely "the code says
so") would itself become the kind of unmeasured claim the project's own
Method decisions forbid. Mitigated by citing the exact evidence, its
source (git/gh vs a live HTTP request), and its timestamp throughout.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `npm test` | no application code was touched, so the suite behaves exactly as on `origin/master` | no — this SPEC changes no code path |
| `npm run check` | no syntax error introduced anywhere (defensive; only `.md` files change) | no |
| `git diff --check` | no whitespace errors in the new/changed `.md` files | no |

## 11. Human validation required

PR review and merge — left to the operator, per the standing workflow.
