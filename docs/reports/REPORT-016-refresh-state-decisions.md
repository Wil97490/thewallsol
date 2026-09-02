# REPORT — SPEC-016

**SPEC executed:** SPEC-016-refresh-state-decisions
**Branch:** `spec/016-refresh-state-decisions`
**Starting commit:** `74647b42d5b3e2f1e7308ad3bc99cb358d9f4beb` (`origin/master`)
**Date:** 2026-09-02

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

**Complete.** `docs/STATE.md` and `docs/DECISIONS.md` now match measured
reality through PR #20 and the production deployment that followed; no
application file touched; PR #17 left untouched, its status recorded as
a fact only.

## 2. Summary

Read `origin/master`'s full commit history, `gh pr view` for PR #15
through #20, every `SPEC-013A/013B/014/014A/015` and their REPORTs, a
live `gcloud run services describe` (revision, traffic), a live `npm
test` run, and live `/api/wall` / `/api/refused` reads — before writing
anything. Found the old `STATE.md` header still named the pre-PR#15
commit, the test count and revision both stale, the PR table missing five
merged PRs, and one claim (about the hero loading both theme variants on
every visit) now flatly false rather than merely old — PR #16 fixed
exactly that, and this session re-verified it live against production a
second time. `docs/DECISIONS.md` got three new rows for decisions this
engagement's later PRs actually made; nothing removed or rewritten.

PR #17 (`spec/013c-state-decisions-refresh-v2`) is still OPEN — confirmed
via `gh pr view 17` (`"state":"OPEN","mergedAt":null`) — and is recorded
in `STATE.md` as superseded, not touched, not closed, not merged.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-016-refresh-state-decisions.md` | This pass's SPEC |
| `docs/reports/REPORT-016-refresh-state-decisions.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `docs/STATE.md` | Header, test count, live revision, PR table (+5 rows, PR #17 excluded and explained), corrected hero-loading claim, new production conditional-cache evidence table, Anthropic-blocker paragraph updated to span 5 deploys instead of 1, commercial-state dates reconfirmed | +93 / −22 |
| `docs/DECISIONS.md` | 3 rows appended (1 Product, 2 Method), nothing removed or edited — confirmed via `git diff docs/DECISIONS.md \| grep '^-'` returning empty | +3 / −0 |

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 429 / 429 / 0 fail |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 (both the last commit alone and the full branch diff against `origin/master`) |

No new test needed — this SPEC touches no application code.

## 6. Audit

No `scripts/audit.sh` run — not applicable to a documentation-only
change (nothing it checks is touched), consistent with SPEC-013A's own
precedent for the same class of work.

## 7. Drift check

No `scripts/drift.sh` run — same reason.

## 8. Invariants added

None. No `CLAUDE.md §9` invariant is near this work.

## 9. Gaps

None against SPEC-016's 9 acceptance criteria — all verified as described
in §2 and in the diff itself. One thing this pass deliberately did **not**
attempt: reconciling PR #4/#13's own missing SPEC/REPORT documents (noted
in `STATE.md` since SPEC-013A) — unchanged, out of this SPEC's scope,
same as every prior refresh.

## 10. Risks

None to the running application — no code path is touched. The
documentation risk this class of work carries (see SPEC-016 §9) is
presenting a merged-but-unmeasured claim as production fact, or the
reverse; mitigated the same way SPEC-013A/013B did — every claim in the
new `STATE.md` text is either sourced to `git`/`gh` (merge facts) or to a
specific live HTTP/`gcloud` measurement taken in this session or in the
REPORT it is drawn from, and the two are never blended into one
sentence without saying which is which.

## 11. Requires human validation

Push, PR review, merge — left to the operator. Not done in this pass, per
instruction.

## 12. Still manual

Nothing about this pass is intended to be automated — a documentation
refresh is a point-in-time human-triggered act, not a recurring job, same
conclusion as SPEC-013A.

## 13. Recommended next step

None specific to this SPEC. The one standing open item this refresh
surfaces again (not new) is PR #17 itself: still open, now doubly
superseded (by PR #18-20 and by this SPEC-016). Closing it is an
operator decision outside this SPEC's scope, not proposed as required.
