# REPORT — SPEC-005

**SPEC executed:** SPEC-005-public-pages-visual-cohesion
**Branch:** `spec/005-public-pages-visual-cohesion`
**Starting commit:** `c7ecc8d` (current `master`)
**Final commit:** (see git log on this branch)
**Date:** 2026-09-01

---

## 1. Overall result

**Complete.** Every public page now loads `visual.css` and renders the
same surface language as the home page. One additional one-line CSS fix
was made beyond the SPEC's literal scope, justified below.

## 2. Summary

`visual.css` existed since PR #4 but was linked only on `/`. Its
selectors (`.tablewrap`, `.reply`, `.pledge`, `.refused`, `.checks`,
`.seen`, `.reading`, `.thresh`, `.cmd`, and the `main
section:not(.hero-shell)::before` divider) were already written for
every page these terms appear on — they were simply never loaded there.
This pass links the stylesheet in the one shared server-rendered shell
(`src/pages.js`) and in the three remaining static public pages
(`rules.html`, `refused.html`, `terms.html`).

While verifying `/refused` with real (seeded) data, a second,
pre-existing defect surfaced: `app.css`'s `.refused` grid used
`grid-template-columns:repeat(auto-fill,minmax(300px,1fr))`, which
reserves empty grid tracks when there are fewer refusals than tracks fit
in the row — with today's production count (2), this leaves a visible
dead grey block filling most of the row width, which is a direct
instance of "the old isolated rectangular register" the operator asked
to eliminate. Fixed by switching to `auto-fit`, which collapses fully
empty tracks and lets the `1fr` unit redistribute their space to real
content. `auto-fit` and `auto-fill` are behaviorally identical once the
row is full, so this cannot regress the layout at any refusal count.

A second grid with the same `auto-fill` pattern, `.checks` (7 items,
4-column grid, last row short by one), was investigated and
**deliberately left unchanged**: its empty cell is a normal short last
row in a densely packed grid (every column has content in some row), not
a collapsible empty track — `auto-fit` has no visible effect there, and
changing it would have been diff without benefit.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-005-public-pages-visual-cohesion.md` | The SPEC this report executes, written from the operator's direct instruction |
| `docs/reports/REPORT-005-public-pages-visual-cohesion.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `src/pages.js` | Added `<link rel="stylesheet" href="/css/visual.css">` to the shared `shell()` template, after `app.css` | +1 |
| `public/rules.html` | Same addition | +1 |
| `public/refused.html` | Same addition | +1 |
| `public/terms.html` | Same addition | +1 |
| `public/css/app.css` | `.refused` grid: `auto-fill` → `auto-fit` (removes the dead-track gap when the ledger has fewer entries than fit in one row) | 1 changed |

`public/admin.html` — deliberately **not** touched: back office, not a
public page, out of the SPEC's scope.
`public/index.html` — already had `visual.css` since PR #4, untouched.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `git status --short --branch` | clean except the files above | — |
| `git diff --check` | clean | exit 0 |
| `npm test` | pass | 413 tests / 413 pass / 0 fail |
| `npm run check` | pass | `syntax ok` |

New tests: none added — this is a presentational change with no new
observable contract to pin. The existing 413 tests re-ran unchanged and
stayed green, confirming no `src/` business logic moved.

## 6. Manual verification (real, in-browser — not assumed)

Local dev server, `STORAGE_BACKEND=file`, data directory isolated to a
scratch path outside the repository. One real refusal row seeded via
`storage.js`'s own `recordRefusal()` (not hand-crafted JSON) to test
`/refused` and `/refused/<slug>` against real data shapes.

| Route | 1280px | 1024px | 900px | 390px | 320px | Light | Dark |
|---|---|---|---|---|---|---|---|
| `/rules` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/seen` | ✓ | — | — | ✓ | ✓ | ✓ | — |
| `/refused` (N=1, N=2) | ✓ | — | — | ✓ | ✓ | ✓ | — |
| `/refused/testcoin` | ✓ | — | — | — | ✓ | ✓ | — |
| `/checks` | ✓ | — | — | — | — | ✓ | — |
| `/checks/destination-link` | ✓ | — | — | — | ✓ | — | ✓ |
| `/terms` | ✓ | — | — | — | ✓ | ✓ | — |

`—` marks a combination not independently reshot because the mechanism
(same shell, same stylesheet, same tokens) was already proven on
`/rules`, which received the full 5-breakpoint × 2-theme sweep. No
horizontal overflow found on any route/width tested
(`scrollWidth === clientWidth` checked programmatically, not eyeballed).

Additional checks, all on `/rules` and cross-checked on at least one
other page:
- Heading order: `H1 → H2…`, no skipped level, on every page.
- `:focus-visible` ring present and correctly colored per theme on nav
  links, in-page links, and the theme toggle.
- CSS custom properties used by the newly-linked rules
  (`--sunk`, `--line-soft`, `--surface`, `--line`) resolved to real
  values in both themes — none of these pages touch the home-page-only
  `--accent2`/`--glass` tokens, so the WARN-1 class of bug (undefined
  token in the unstamped-light state) cannot occur here; verified by
  reading computed style, not by assumption.
- No inline `<script>` besides the pre-existing `application/ld+json`
  blocks, on any of the 7 routes checked via `curl` + grep.
- CSP header unchanged (`http.js` not touched): `script-src 'self'`
  intact.
- `og:*`, `twitter:*`, `canonical`, `robots`, JSON-LD present and
  unchanged in content on every route (only the stylesheet `<link>`
  moved).

## 7. Drift check

Not run — `scripts/drift.sh` does not exist yet in this repository
(only referenced in `CLAUDE.md`; the branch that would have created it
was never merged with that script present). Noted as a gap, not
fabricated as passed.

## 8. Invariants added

None. This work does not touch any V4.54 invariant surface
(`CLAUDE.md §9`) — no seat, price, hold, or payment code was read or
written.

## 9. Gaps

- `.checks`'s short-last-row was investigated and correctly left alone
  (see §2) — not a gap, a deliberate non-change, recorded so a future
  session does not "fix" it again.
- The `auto-fill` → `auto-fit` fix on `.refused` goes one file beyond
  the SPEC's literal file list (`§5` listed only the four stylesheet
  links). It stayed within the SPEC's stated constraint — CSS-only,
  reuses existing tokens, no `src/` change, no new selector — and
  directly serves the SPEC's own objective ("not the old isolated
  rectangular register"), so it is reported here rather than silently
  added or silently omitted.

## 10. Risks

- `main section:not(.hero-shell)::before` now draws a hairline divider
  above every top-level `<section>` on these pages. Checked against
  every page's actual markup (§9 of the SPEC) — none of their heroes are
  `<section>` elements, so none are exempted or double-divided. If a
  future page adds a new top-level `<section>` immediately after its
  hero `<div>`, the same check should be repeated.
- `public/admin.html` still does not load `visual.css` — intentional,
  but flagged so nobody mistakes the back office for a regression later.

## 11. Requires human validation

- `git push` of this branch.
- Opening the PR against `master` (done in this session per explicit
  instruction — see the PR itself for the link).
- Merge and deploy — **not done**, explicitly withheld per instruction.

## 12. Still manual

- No automated test pins "every public page links visual.css" or "no
  page shows a `grid-template-columns` track with zero items." Both are
  mechanically checkable; worth a small test if this class of drift
  (stylesheet silently unlinked on a new page) recurs.

## 13. Recommended next step

Merge this PR once reviewed, then treat `/admin` (back office) as a
separate, deliberate decision — it was excluded here because it is not
a public page, not because it was overlooked.
