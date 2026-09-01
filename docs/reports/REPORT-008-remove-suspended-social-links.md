# REPORT — SPEC-008

**SPEC executed:** SPEC-008-remove-suspended-social-links
**Branch:** `spec/008-remove-suspended-social-links`
**Starting commit:** `d79afe2` (master)
**Date:** 2026-09-01

---

## 1. Overall result

**Complete**, with one necessary follow-up flagged, not silently fixed
(see §9/§10).

## 2. Summary

Removed every public reference to the suspended Telegram (`@ThewallSol`)
and X (`@xTheWallx0`) accounts across 5 content files, reformulating each
passage to point to `contact@thewallsol.com` only — no new identity or
URL introduced. Updated the one test that pinned the Telegram link as a
required "second channel" for the refusal-ledger right of reply, so it
now asserts the opposite: the reply mechanism must stay reachable by
email and must never re-offer a dead `t.me/` or `x.com/` link.

## 3. Files modified

| File | Change | Lines |
|---|---|---|
| `public/index.html` | Footer: dropped Telegram, reformulated to email-only | 1 |
| `public/refused.html` | Footer: dropped trailing Telegram link | 1 |
| `public/terms.html` | Dropped dedicated "Telegram:" line; footer: dropped trailing link | 2 |
| `public/rules.html` | "Improvements..." paragraph: dropped X-DM mention; footer: dropped trailing link | 2 |
| `src/pages.js` | Shared footer + refusal right-of-reply paragraph: dropped Telegram mentions | 2 |
| `test/pages.test.js` | Rewrote the "second channel" describe block: email-only assertions + explicit `doesNotMatch` on `t.me/`/`x.com/` | 25 (net +4) |

## 4. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-008-remove-suspended-social-links.md` | This pass's SPEC |
| `docs/reports/REPORT-008-remove-suspended-social-links.md` | This report |

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 413 / 413 / 0 fail (same total: 2 old assertions replaced by 2 new) |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

New/changed tests: the two assertions in `test/pages.test.js` that
required `t.me/ThewallSol` were **seen failing first**, for the expected
reason (`AssertionError: The input did not match /t\.me\/ThewallSol/`),
after the content edits and before the test rewrite — confirming they
were genuinely pinning the removed link, not passing by accident.

## 6. Audit — exhaustive grep, whole repository

```
grep -rn "t\.me/"                          → scripts/preflight.sh:180 only (see §9)
grep -rn "xTheWallx0"                      → test/pages.test.js:378 only (explanatory comment)
grep -rn "@ThewallSol|@TheWallSol"         → test/pages.test.js:378 only (explanatory comment)
```
No public-facing file (`public/`, `src/pages.js` output) contains any
remaining reference to either suspended account.

## 7. Drift check

Not run — `scripts/drift.sh` still does not exist in this repository
(same gap noted in REPORT-005).

## 8. Invariants added

None touching V4.54 (`CLAUDE.md §9`). One product-level test invariant
changed deliberately (see §2): the refusal ledger's right-of-reply no
longer requires two channels — it requires the one that exists to be
real, and forbids a dead one from reappearing.

## 9. Gaps

**Addendum (2026-09-01, same branch, commit `35c80a9`):** the gap below
is closed. With explicit operator sign-off, `scripts/preflight.sh:177-190`
was rewritten to check for the *absence* of `t.me/ThewallSol`,
`t.me/TheWallSol`, `@ThewallSol`, `@TheWallSol`, `x.com/xTheWallx0`, and
`@xTheWallx0` across `/`, `/terms`, `/rules`, `/refused`, `/seen`,
`/checks` — case-sensitive on a capital "S" in "Sol" so it can never
match `contact@thewallsol.com`, verified directly (positive and negative
controls) before wiring it into the script. Re-verified end-to-end by
running the actual `scripts/preflight.sh` (unmodified apart from this
one block) against a local instance serving this branch's content: all
six routes report `ok ... aucun canal social suspendu`. No new social
identity was introduced. The paragraph originally below described the
gap as it stood before this addendum.

---

**`scripts/preflight.sh:180` still probes for the literal string
`t.me/ThewallSol` on every public route.** It was not in the authorized
change list for this pass, and it is the project's own release gate —
changing it without explicit sign-off felt like exactly the kind of
edit `CLAUDE.md §6` warns against ("never bypass a barrier that is
failing"). Left untouched and flagged instead.

**Concrete consequence**: the previous deploy attempt failed this probe
on `/` only (href casing mismatch). Now that the Telegram link is
removed everywhere rather than just corrected, **the next deploy attempt
will fail this same probe on every route** (`/`, `/rules`, `/refused`,
`/terms`, `/seen`, `/checks/*`) instead of one — a wider, but
predictable and equally inert, failure. Production is not at risk
either way: `deploy.sh` has no `--force`, so a failing preflight simply
means traffic never switches, exactly as it did the first time.

## 10. Risks

None to production (nothing here has been deployed). The only open risk
is procedural: if a future session runs `npm run deploy` without reading
this report, it will hit the same "candidate deployed, traffic not
switched" outcome again, for the reason above.

## 11. Requires human validation

- Push (done — see PR).
- PR review and merge.
- **Decision on `scripts/preflight.sh:180`**: either drop the Telegram
  probe entirely (there is no channel to check for anymore), or replace
  it with a probe for whatever new channel is eventually chosen. Not
  done here — content decision, not a technical default I should pick.
- A new official second contact channel, if one is wanted — nothing was
  invented per the operator's explicit instruction.
- Deploy — not attempted.

## 12. Still manual

Choosing/creating a replacement social channel; updating
`scripts/preflight.sh` once that decision is made.

## 13. Recommended next step

Decide on `scripts/preflight.sh:180` before the next deploy attempt —
otherwise it will fail again, on more routes than last time, for a
related but distinct reason.
