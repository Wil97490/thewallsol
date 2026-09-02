# REPORT — SPEC-013C

**SPEC executed:** SPEC-013C-state-decisions-refresh-v2
**Branch:** `spec/013c-state-decisions-refresh-v2`
**Starting commit:** `3331ac741` (`origin/master`)
**Date:** 2026-09-02

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

**Complete.** `docs/STATE.md` and `docs/DECISIONS.md` now match measured
reality after PR #15 and PR #16; no application file touched.

## 2. Summary

Read the current `docs/STATE.md`/`docs/DECISIONS.md` in full before
editing, re-measured every fact this SPEC's brief asked for directly
against `git`/`gh`/`gcloud`/the live site rather than trusting the
read-only audit's numbers as given, and corrected `STATE.md` in place —
preserving its structure and section order exactly. One row was appended
to `DECISIONS.md` for the CSS-`background-image`-over-`<picture>`
decision from SPEC-013B; every existing row is untouched.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-013C-state-decisions-refresh-v2.md` | This pass's SPEC |
| `docs/reports/REPORT-013C-state-decisions-refresh-v2.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `docs/STATE.md` | Header, test count, live revision, PR table + narrative extended through #16, hero-loading claim corrected, Anthropic-blocker evidence extended, commercial state re-dated | +73 / −25 |
| `docs/DECISIONS.md` | 1 row appended to Method, nothing removed or edited | +1 / −0 |

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 415 / 415 / 0 fail |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

No application code was touched, so no test could have failed as a
result of this pass.

## 6. Verifications executed — the actual audit trail

**PR #15/#16 metadata** — pulled fresh via `gh pr view 15/16` at the
start of this pass, not carried over from the earlier read-only audit:
titles, branches, `mergedAt` dates confirmed exactly as now written in
`STATE.md`.

**Test count** — `npm test` run twice during this pass (once on the
fresh branch before any edit, once after): **415** both times, on
`origin/master` at `3331ac741`.

**Live revision / traffic** — `gcloud run services describe wall
--region europe-west1` re-run during this pass: `wall-00117-wew`, 100%.
`gcloud run revisions describe wall-00117-wew` for its exact creation
timestamp (`2026-09-02T04:20:39Z`), used in the Known-blockers section.

**The corrected hero-loading claim** — the old text ("Both theme
variants still load on every visit; no lazy-loading by active theme has
been built") was removed. This isn't a new measurement in this pass —
it restates what `REPORT-013B` §6/§7 and the subsequent production smoke
test already measured (Resource Timing API, both on a local dev server
and live on `https://thewallsol.com`): exactly one `.webp` per visit,
matching the active theme. Cited as already-established, not re-derived
here.

**Anthropic-blocker re-confirmation** — re-read `/tmp/deploy-run-pr16.log`
(the deploy that produced `wall-00117-wew`) and found the same `ok clean
token sells 200` line the original `wall-00115-ref` deploy had, at
line 600. Re-queried the Firestore `agent_audit` collection (most recent
10 entries): no `moderator` entry at all since the `wall-00117-wew`
deploy (only `scout`/`gate` background-scan activity at 04:21–04:22),
confirming the same caveat as before still holds — no real listing has
exercised the moderator since the fix, on either deploy.

**Commercial state** — re-queried live today (not carried over from
yesterday's figures): `curl https://thewallsol.com/api/wall` → 1 seat
taken (№10); `curl https://thewallsol.com/api/refused` → 3 rows
(`pinkotc`, `apetacio`, `pisstacio`). Identical to the figures already in
`STATE.md`, so only the date changed, not the numbers — stated as such,
not presented as a new finding.

**Stale-value search** — `grep` for `413`, `wall-00115-ref` (as a *live*
claim), `1da86e891`, `"PR #2 through #14"`, and the old hero-loading
sentence across the new `STATE.md`: all gone except one intentional,
historically-correct mention of `wall-00115-ref` inside the
Anthropic-blocker paragraph (identifying it as the *first* of two
deploys that re-confirmed the fix — not a claim that it's still live).

## 7. Audit

No `scripts/audit.sh` run — not applicable to a documentation-only
change.

## 8. Drift check

No `scripts/drift.sh` run — same reason.

## 9. Invariants added

None.

## 10. Documentation accuracy

Every figure now in `STATE.md` traces to a measurement taken either in
this pass (test count, revision, commercial state, deploy-log
cross-check) or in an already-published, cited report (`REPORT-013B`'s
network-loading verification, referenced rather than re-run, since
re-running it would not add new information beyond what production's own
smoke test already confirmed). No number in this report or in the edited
documents was invented.

## 11. Documentation consistency

`docs/DECISIONS.md`'s existing 35 lines are byte-identical to before this
pass (confirmed via `git diff` — only `+1` line, no `-` outside the diff
context). The new row's wording is drawn directly from `SPEC-013B`'s own
§2 reasoning, not reworded speculatively.

## 12. Gaps

None against this SPEC's 10 acceptance criteria.

## 13. Risks

Same as `SPEC-013A`: a documentation pass that overstates certainty would
itself become the kind of unmeasured claim this project's Method
decisions forbid. Mitigated by re-measuring live wherever cheap (it was,
throughout this pass) and by citing exact sources for anything not
re-measured today.

## 14. Requires human validation

Push, PR review, merge — left to the operator. Not done in this pass
beyond what this SPEC's own workflow calls for (see §15).

## 15. Reserves still outstanding (unchanged by this pass)

- The Anthropic-blocker caveat remains open: no real customer listing has
  exercised the moderator since the fix, across either deploy.
- PR #4 and PR #13 still have no paired `SPEC-0NN`/`REPORT-0NN` document —
  unchanged, out of scope here as before.
- Seat №10's `$1` price remains an unresolved operator decision — not
  touched.
- PR #6, branch cleanup, and the `ETag`/`Last-Modified` idea flagged in
  the read-only audit are explicitly not part of this pass, per
  instruction — they remain open, awaiting a separate GO.

## 16. Recommended next step

None specific to this pass — the outstanding items are already tracked
in §15 and in `docs/DECISIONS.md`'s "Open, undecided" section; no new one
is proposed here.
