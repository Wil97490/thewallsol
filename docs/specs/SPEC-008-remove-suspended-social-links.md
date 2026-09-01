# SPEC-008 — Remove suspended social channels from public contact paths

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-01
**Status:** validated
**Branch:** `spec/008-remove-suspended-social-links`

---

## 1. Objective

No public page references the suspended Telegram (`@ThewallSol` /
`t.me/TheWallSol`) or X (`@xTheWallx0`) accounts. `contact@thewallsol.com`
is the sole public contact channel until a new official channel exists.

## 2. Context

Operator confirmed both accounts suspended (2026-09-01) — Telegram
directly, X independently verified by loading `x.com/xTheWallx0`
("Compte suspendu — X suspends accounts which violate the X Rules"). A
repo-wide search found no other existing, unsuspended social channel.
No new identity may be invented.

## 3. Scope

- Remove the Telegram link/text from every public footer.
- Remove the X-DM mention in `public/rules.html`'s "Improvements..."
  paragraph.
- Reformulate the surrounding sentences to point to
  `contact@thewallsol.com` only, without adding any new identity or URL.
- Update the one test (`test/pages.test.js`) that pinned the now-removed
  Telegram link as a required "second channel", so the suite reflects
  the new, honest single-channel state instead of failing red.

## 4. Out of scope

- `scripts/preflight.sh:180` — still probes for `t.me/ThewallSol` on
  every page. Left untouched: modifying the release gate was not in the
  authorized change list, and it deserves explicit sign-off rather than
  a silent edit. **Flagged in the REPORT — the next deploy attempt will
  fail this probe on every page, not just `/`, until it is addressed.**
- Any new social identity, handle, or URL.
- Pricing, takeover, screening, routes, CSP, business logic — untouched
  by construction (only footer/paragraph text and one test file).

## 5. Files concerned

| File | Change |
|---|---|
| `public/index.html` | Footer: drop Telegram, reformulate to email-only |
| `public/refused.html` | Footer: drop trailing Telegram link |
| `public/terms.html` | Drop dedicated "Telegram:" line; footer: drop trailing Telegram link |
| `public/rules.html` | "Improvements..." paragraph: drop X-DM mention; footer: drop trailing Telegram link |
| `src/pages.js` | Shared footer: drop trailing Telegram link; refusal right-of-reply paragraph: drop Telegram mention |
| `test/pages.test.js` | Rewrite the "second channel" test block to assert email-only and the explicit absence of `t.me/` or `x.com/` |

## 6. Acceptance criteria

1. `npm test` — 413/413, same count as before (2 old assertions replaced by 2 new ones).
2. `npm run check` — syntax ok.
3. `git diff --check` — clean.
4. Repo-wide grep for `t.me/`, `xTheWallx0`, `@ThewallSol`/`@TheWallSol` finds no remaining public-facing reference (only the explanatory test comment and the still-open `preflight.sh` probe, both documented).

## 7. Human validation required

Push, PR review, merge, deploy, and the `preflight.sh` follow-up — all
left to the operator.
