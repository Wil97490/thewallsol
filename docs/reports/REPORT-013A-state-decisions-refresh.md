# REPORT — SPEC-013A

**SPEC executed:** SPEC-013A-state-decisions-refresh
**Branch:** `spec/013a-state-decisions-refresh`
**Starting commit:** `1da86e891` (`origin/master`)
**Final commit:** (not yet committed at time of writing — see §11)
**Date:** 2026-09-01

---

## 1. Overall result

**Complete.** `docs/STATE.md` and `docs/DECISIONS.md` now match measured
reality; no application file touched.

## 2. Summary

Read `origin/master`'s full commit history, all 14 PRs (`gh pr list`),
every `SPEC-0NN`/`REPORT-0NN` pair, and live-measured the running
production system (Cloud Run traffic split, Firestore `agent_audit` log,
`/api/wall`, `/api/refused`) before writing anything. Two facts in the
old `STATE.md` turned out to be stale in ways the operator's brief did not
anticipate — the commercial-state seat count and refusal count — and are
corrected below with the evidence. `docs/DECISIONS.md` got two new rows
for decisions this engagement actually made, plus one new "open,
undecided" row for the seat №10 price question that has been outstanding
since before this engagement started.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-013A-state-decisions-refresh.md` | This pass's SPEC |
| `docs/reports/REPORT-013A-state-decisions-refresh.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `docs/STATE.md` | Full rewrite of facts (see §9 for what changed and why) | +91 / −20 |
| `docs/DECISIONS.md` | 3 rows appended, nothing removed or edited | +6 / −0 |

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 413 / 413 / 0 fail |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

No new test was needed — this SPEC touches no application code.

## 6. Audit

No `scripts/audit.sh` run — not applicable to a documentation-only change
(nothing it checks is touched).

## 7. Drift check

No `scripts/drift.sh` run — same reason.

## 8. Invariants added

None. No `CLAUDE.md §9` invariant is near this work.

## 9. What was found and corrected (the actual audit trail)

**PR #2–14 role table.** Built from `gh pr list --state merged` (title,
`headRefName`, `mergedAt`) cross-checked against `git log` merge commits.
All 11 merged PRs in the #2–14 range are listed (PR #3 and #6 are not
merged, correctly excluded).

**Test count.** `npm test` on `origin/master` at `1da86e891`: **413**, not
the 389 the old `STATE.md` recorded.

**Anthropic credit blocker — resolved, with a caveat, not a flat claim.**
The old blocker's own text described its symptom precisely: four preflight
probes returning 409 instead of 200 because the moderator can't be
reached. I read `/tmp/deploy-run-3.log` (the deploy that produced the
currently-live revision `wall-00115-ref`, created
`2026-09-01T12:08:01Z` per `gcloud run revisions list`) and found the
exact probe: `ok clean token sells 200` — previously 409. `gcloud run
services describe wall` confirms 100% of traffic is on that revision now.
That is real, positive, measured evidence the credit issue is resolved.

But I did not stop there: I also read the live Firestore `agent_audit`
collection (`moderator` agent entries) and found its most recent entry —
`2026-09-01T11:54:18Z`, action `unavailable`, error field containing the
exact same `"Your credit balance is too low..."` HTTP 400 — which is
**before** the resolving deploy (`12:08:01Z`), from an earlier redeploy
attempt. No moderator call has been logged since, because no seat has
been listed for sale since the fix. STATE.md states both facts and their
timestamps rather than picking the more convenient one.

The 🟡 "candidate revision on `pre`, never promoted" line no longer
applies — traffic is 100% on the latest revision, measured directly.

**Commercial state — corrected beyond the operator's bullet list.** The
brief didn't ask me to touch this, but STATE.md's own stated purpose is
"facts only, each one measured," and both figures were directly
falsifiable:
- `/api/wall` (live): seat №10 is `status: taken`, `priceUsd: 1`, `since:
  2026-08-25T17:50:46.366Z` — one seat sold, not zero. The date predates
  every PR in this engagement's #2–14 range; this is not new activity,
  it is a pre-existing fact the old `STATE.md` had simply gotten wrong
  (or never updated).
- `/api/refused` (live): three entries — `pinkotc`, `apetacio`,
  `pisstacio` — not two. `pisstacio` (2026-08-27) was missing from the
  old record.

I did not correct the seat №10 price itself (explicitly out of scope, and
this exact question was raised and left undecided earlier in this
engagement) — only recorded that it exists, is unresolved, and is now
also logged in `docs/DECISIONS.md`'s "Open, undecided" section so a
future session sees it without having to rediscover it.

**Two PRs without a paired SPEC/REPORT document.** Confirmed by listing
`docs/specs/` and `docs/reports/` on `origin/master`:
- **PR #4** (`spec/003-visual-refactor-final`, merged): the repository
  has `docs/specs/SPEC-003-visual-refactor.md` (no `-final` suffix) and
  no `docs/reports/REPORT-003-*.md` at all.
- **PR #13** (`spec/011-hero-asset-cache`, merged): no
  `docs/specs/SPEC-011-*.md` or `docs/reports/REPORT-011-*.md` exists —
  this PR was implemented directly from an audit finding, outside the
  SPEC-first flow.

Not corrected — out of this SPEC's scope, and rewriting a historical
SPEC/REPORT pair (or fabricating one that was never written) is exactly
the kind of invention this SPEC's own rule forbids. Recorded here and in
`STATE.md` so a future session does not go looking for a document that
does not exist.

**`docs/DECISIONS.md` additions.** I looked for decision-worthy content
in every PR #2–14, not just the two I added:
- PR #2 (token percentage) implements a decision `DECISIONS.md` already
  recorded (2026-08-28, "9.35% of supply locked...") — adding a second
  row for the same decision would be redundant, not new information. Not
  added.
- PR #10 (suspended social links) and PR #12 (final monolith asset) each
  state an explicit decision in their own SPEC / in this session's own
  record (the operator's exact words validating the visual direction).
  Added, sourced precisely (see the rows themselves).
- PR #5, #7, #8, #9, #11 (visual cohesion passes) and PR #14
  (micro-interactions) are presentation work executing an
  already-approved direction — no new product or method decision found
  in their SPEC/REPORT text. Not added.
- PR #13 (MIME/cache fix) is a bug fix restoring existing policy
  (1-year immutable cache already applied to `.jpg`/`.mp4`/`.webm`/
  `.png`) to a file type that had been missed — not a new decision. Not
  added.

## 10. Risks

None to the running application — no code path is touched. The main risk
in a task like this is a *documentation* one: overstating certainty (see
§9's Anthropic-blocker handling) or silently dropping a fact that turns
out to be inconvenient. Mitigated by citing exact sources and timestamps
throughout, and by this section itself.

## 11. Requires human validation

Push, PR review, merge — left to the operator. Not done in this pass, per
instruction.

## 12. Still manual

Nothing about this pass is intended to be automated — a documentation
refresh is a point-in-time human-triggered act, not a recurring job.

## 13. Recommended next step

If the Anthropic-blocker caveat in §9 is unsatisfying (no post-fix
successful moderator call logged), the cleanest way to close it fully
would be a real end-to-end listing attempt once the operator is ready to
test a real sale — not something to force just to tidy a document.
