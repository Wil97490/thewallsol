# SPEC-001 — Token percentage correction (9.39% vs 9.35%)

**Author:** Claude Code (from a read-only audit + user arbitration)
**Date:** 2026-08-31
**Status:** draft
**Branch:** `spec/001-workflow-automation`

---

## 1. Objective

After this work, no public page presents **9.39%** as the amount of `$Wall`
currently locked. Every public figure for the locked share reads **9.35%**;
the 9.39% figure, where it still appears, is unambiguously labelled as the
pre-fee holding, never as what is locked.

## 2. Context

`docs/THE_WALL_MASTER_CONTEXT_V2.md` §13 — 🔴 TO CORRECT:

> The canonical figure is 9.35% of the amount actually locked after fees. Do
> not describe 9.39% as the final locked allocation.

`docs/THE_WALL_MASTER_CONTEXT_V2.md` §29 (CURRENT PRIORITIES, P0) and §32
(MASTER STATUS, 🔴 TO CORRECT) both list this inconsistency. `docs/DECISIONS.md`
already records the canonical fact (2026-08-28 row: "9.35% of supply locked …
🟢") — that decision is not new, only the site text has not caught up to it.

Measured, not assumed (read-only audit, 2026-08-31):

- `public/index.html:124` — footer states *"The team holds 9.39% of it,
  locked until 28 November 2026"* — presents 9.39% as the locked figure. 🔴
- `public/rules.html:176` — *"holds 9.39% of the supply — all of it now
  locked on chain"* — same conflation: 9.39% described as what is locked. 🔴
- `public/rules.html:196` and `:198` — already canonical, already correct:
  *"93,478,448 $Wall — 9.35% of the supply — locked …"* and *"the locked
  figure is 9.35% and not 9.39%"*. These two paragraphs are the site's only
  existing explanation of the gap and are the source of truth for this SPEC.
  🟢
- `test/routes.test.js:149` — asserts `/9\.39%/` against the homepage. This
  test currently **enforces the bug**: it fails if the homepage stops saying
  9.39%. 🔴 blocking.
- `DEPLOY.md:607` — historical changelog entry using 9.39%, dated before the
  lock existed. **Arbitration (user, 2026-08-31): historical, not to be
  modified.**

Arithmetic verified independently against the two numbers already on the
page: 93,478,448 / 1,000,000,000 = 9.3478% (locked); pre-fee amount =
93,478,448 / 0.995 ≈ 93,948,189 → 9.3948% (≈ 9.39%, the pre-lock holding);
fee ≈ 469,741 tokens ≈ 0.5% of the team's holding. The three figures are
consistent with each other and with `rules.html:198`'s own explanation.

## 3. Scope

- `public/index.html` — footer sentence naming the token percentage.
- `public/rules.html` — the sentence at line 176 only. Lines 196 and 198 are
  explicitly **preserved**, not rewritten (see §8).
- `test/routes.test.js` — the assertion at line 149, and only that
  assertion; the surrounding test and its companion test (lines 133–140,
  contract address / team wallet / date / non-cancelable quote) are
  unchanged.
- `scripts/drift.sh` — **optional**, only if a structural check ("no public
  file asserts 9.39% as a locked amount without the word 'before' or
  'fee(s)' nearby") can be added without touching anything outside this
  scope. If it cannot be expressed cleanly as a read-only text check, it is
  dropped rather than forced.

## 4. Out of scope

- Anything in `src/`.
- Any V4.54 mechanic (seat pricing, takeover formula, holder-concentration
  check, moderation gate).
- Any economic parameter (lock amount, lock date, fee percentage).
- `DEPLOY.md` (arbitration: historical record, not modified).
- `rules.html:196` and `:198` — the canonical explanation, preserved
  verbatim.
- Any other page or asset not listed in §3 (e.g. `/checks`, refusal pages,
  `docs/DECISIONS.md`, which is already correct).
- Merge, push, deploy.

## 5. Files concerned

| File | Expected change |
|---|---|
| `public/index.html` | Footer sentence about the token replaced so it names the *locked* share as 9.35%, using the exact wording specified in §6. |
| `public/rules.html` | Line 176 reworded so the pre-fee holding (9.39%) is no longer described as "locked" — the locked figure stays exclusively in the paragraphs at lines 196/198, which are untouched. |
| `test/routes.test.js` | Line 149 assertion changed from `/9\.39%/` to `/9\.35%/`; the existing `locked until 28 November 2026` assertion on the same test kept as-is. |
| `scripts/drift.sh` | Optional: read-only structural check added, only if it fits cleanly inside this scope (see §3). |

Anything not in this table is out of scope. If implementation finds it needs
another file, implementation stops and the SPEC is amended first.

## 6. Expected behaviour

**`public/index.html` footer** — the sentence naming the token must read,
verbatim (user arbitration, 2026-08-31):

> The team's share — 9.35% of the supply — is locked until 28 November 2026.

This replaces the current *"The team holds 9.39% of it, locked until 28
November 2026"*. The rest of the footer sentence (lead-in "There is a $Wall
token." and the trailing link to `/rules#token`) is preserved; only the
percentage clause changes.

**`public/rules.html:176`** — the sentence must still say the team created
the token on 26 August 2026 and must still give the contract address
immediately after, unchanged. It must stop presenting 9.39% as the *locked*
amount. Acceptable in spirit (exact wording is an implementation choice,
not dictated by this SPEC, since the user did not prescribe literal text
here): describe 9.39% as what the team originally held, and point to the
locked figure below (9.35%) rather than asserting the two are the same
number. No specific string is mandated beyond: the word "locked" must not
be directly bound to "9.39%" anywhere left in the file after this change.

**`test/routes.test.js`** — the homepage-disclosure test keeps its intent
(the homepage must not omit the token percentage) but checks the correct
figure: it must find `9.35%`, not `9.39%`, and must still find `locked
until 28 November 2026`.

**`rules.html:196–198`** — byte-for-byte unchanged. This is the only
explanation of the 9.39%→9.35% gap on the site and remains the canonical
source both pages point back to.

## 7. Acceptance criteria

1. `grep -c "9.39%" public/index.html` — the footer sentence in
   `public/index.html` does not contain `9.39%` at all; it contains `9.35%`
   and the exact string `is locked until 28 November 2026`.
2. `public/rules.html` still contains, byte-for-byte, the two sentences
   currently at lines 196 and 198 (the `93,478,448 … 9.35% …` paragraph and
   the `… 9.35% and not 9.39% …` paragraph).
3. `public/rules.html:176` no longer asserts that 9.39% is "locked"; the
   file still discloses the contract address and the 26 August 2026 launch
   date on that same paragraph, unchanged.
4. `test/routes.test.js` asserts `/9\.35%/` (not `/9\.39%/`) against the
   homepage response, and still asserts `locked until 28 November 2026`.
5. The pre-existing `/rules` test (contract address, team wallet,
   28 November 2026, "neither be canceled nor transferred") is unmodified
   and still passes.
6. `DEPLOY.md:607` is byte-for-byte unchanged.
7. Nothing under `src/` is modified — `git diff --name-only` for this work
   contains only files listed in §5.
8. Full suite is green: `npm test` reports the same pass count as before
   this SPEC plus any tests added under §10, 0 failures.
9. `scripts/drift.sh` still exits with its pre-existing, already-known
   `TAKEOVER_MULTIPLIER` drift signal and nothing new — unless the optional
   structural check in §3 is added, in which case it must pass (no new
   9.39%-as-locked instance found) rather than fail.

## 8. Invariants that must not move

None of `CLAUDE.md §9`'s invariants (seat count, takeover formula, bid
ceiling, hold/protect minutes, previous-holder-gets-nothing, LP floor/
ceiling) are touched — this SPEC has no `src/` change.

The one project-specific invariant this SPEC must hold is textual, not
economic: `rules.html:196` and `:198` — the canonical 9.39%→9.35% Streamflow-
fee explanation — must survive verbatim. It is the only place on the site
that explains *why* two numbers exist; removing or rewording it while fixing
the other two locations would trade one inconsistency for an unexplained
one.

## 9. Risks

- **Rewording `rules.html:176` accidentally removes or changes the contract
  address, the launch date, or the "all of it now locked on chain" meaning**
  in a way that contradicts `:196`. Mitigated by acceptance criterion 3 and
  by never touching the address string itself.
- **Fixing the homepage assertion without checking `/rules` still discloses
  the gap** would leave a reader of only the homepage with a bare "9.35%"
  and no explanation of why it isn't 9.39%. Mitigated by criterion 2 (the
  canonical paragraphs are the explanation, and they are provably
  unchanged) and the fact that `index.html`'s link already points to
  `/rules#token`.
- **`scripts/drift.sh` structural check turns into a broad content-linting
  pass** and drifts outside this SPEC's file list. Mitigated by making it
  optional and by §3's instruction to drop it rather than force it.
- **A future edit reintroduces 9.39%-as-locked language** without anyone
  noticing. Mitigated by the new `test/routes.test.js` assertion (criterion
  4) acting as a permanent regression guard on the homepage, plus criterion
  9 if the optional drift check is implemented.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `test/routes.test.js:149` (modified) | homepage never presents 9.39% as the locked share; 9.35% is the figure shown | yes — must fail against the *current* `index.html` before the fix, pass after |
| `test/routes.test.js:133–140` (unmodified, re-run) | `/rules` still discloses contract address, team wallet, unlock date, non-cancelable quote | no — already passing, re-run only to prove no regression |
| new assertion on `/rules` response (added under this SPEC) | `rules.html` still contains the canonical `93,478,448 … 9.35% …` and `… 9.35% and not 9.39% …` sentences verbatim | yes — must fail if either canonical sentence is altered or removed |
| new assertion on `/rules` response (added under this SPEC) | line-176-equivalent sentence no longer binds "locked" to "9.39%" | yes — must fail against the *current* `rules.html` before the fix, pass after |
| `npm test` (full suite) | nothing else regressed | no — existing baseline, re-run for the final count |

## 11. Human validation required

- Confirmation that the exact footer wording in §6 is final (already
  supplied by the user, 2026-08-31 — recorded here for traceability, no
  further validation needed on that point).
- Review of the implementation diff before any commit lands on a branch
  intended for push (this SPEC does not authorize push, merge, or deploy —
  none of those actions are in scope).
- A decision on whether this work happens on the existing
  `spec/001-workflow-automation` branch or a new `spec/002-…` branch is
  still open and is not settled by this SPEC; CLAUDE.md's own convention
  (one `spec/<nnn>-<slug>` branch per chantier) suggests a new branch, but
  no branch has been created and none will be without explicit instruction.
