# SPEC-005 — Public pages visual cohesion

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-01
**Status:** validated
**Branch:** `spec/005-public-pages-visual-cohesion`

---

## 1. Objective

Every public page (`/`, `/rules`, `/seen`, `/refused`, `/refused/<slug>`,
`/checks`, `/checks/<slug>`, `/terms`) renders with the same validated
visual family as the home page — not the pre-PR#4 flat/rectangular look.

## 2. Context

PR #4 (merged) introduced `public/css/visual.css` and applied it to `/`
only. PR #5 (merged) extended it to the home podium. PR #6 (rejected —
see audit) claimed to extend it to public pages but shipped an empty
diff: `/rules`, `/seen`, `/refused`, `/checks` still load only `app.css`.
`visual.css` already contains selectors for `.tablewrap`, `.reply`,
`.pledge`, `.refused`, `.checks`, `.seen`, `.reading`, `.thresh`, `.cmd`,
and a `main section:not(.hero-shell)::before` divider rule — all of
which are already present in the markup these pages render. The
stylesheet was authored for this rollout; it was never linked.

## 3. Scope

Load `/css/visual.css` on every public page that does not already have
it:

- `src/pages.js` `shell()` — the single template behind `/seen`,
  `/checks`, `/checks/*`, `/refused/<slug>` (found, gone, missing).
- `public/rules.html`
- `public/refused.html` (the `/refused` ledger index)
- `public/terms.html`

## 4. Out of scope

- `public/admin.html` — back office, not a public page.
- Any HTML structure change: no new sections, no restructuring into
  `.hero-shell` (that is home-page-specific art, not a generic pattern
  to duplicate).
- Any copy, pricing, takeover, threshold, route, or `src/` logic outside
  the one `<link>` line in `shell()`.
- Any new CSS selector, unless verification in §7 finds a genuinely
  unstyled block that visual.css's existing rules don't reach — in
  which case the fix reuses existing tokens only, no new color/radius
  value invented.

## 5. Files concerned

| File | Expected change |
|---|---|
| `src/pages.js` | Add one `<link rel="stylesheet" href="/css/visual.css">` in `shell()`, after the `app.css` link |
| `public/rules.html` | Same addition |
| `public/refused.html` | Same addition |
| `public/terms.html` | Same addition |

## 6. Expected behaviour

Opening `/rules`, `/seen`, `/refused`, `/checks`, `/checks/<slug>`,
`/refused/<slug>`, `/terms` shows rounded, softly-shadowed content
surfaces and the same section-divider rhythm as `/`, in both themes,
with no layout breakage.

## 7. Acceptance criteria

1. `npm test` passes unchanged (413/413).
2. `npm run check` passes.
3. `git diff --check` is clean.
4. Each of the 4 files above loads `visual.css` after `app.css`.
5. `/rules`, `/seen`, `/refused`, one `/refused/<slug>`, `/checks`, one
   `/checks/<slug>`, `/terms` all return 200 and render without a
   horizontal scrollbar at 1280/1024/900/390/320px.
6. No inline script/style introduced (CSP `script-src 'self'` intact).
7. No new external asset host.
8. Focus-visible ring still present on interactive elements on each
   page.

## 8. Invariants that must not move

None of the V4.54 invariants (`CLAUDE.md §9`) are near this work — no
seat, price, or payment code is touched.

## 9. Risks

- `main section:not(.hero-shell)::before` could visually collide with a
  page's own top content if a `<section>` sits flush against the hero.
  Mitigated: verified against the actual markup before implementing —
  every page's hero is a bare `<div class="wrap hero">`, never a
  `<section>`, so it never matches this selector on any of these pages
  (checked for all 4 files plus every `pages.js` template).
- A class used in `pages.js` output but not yet covered by `visual.css`
  could remain visually flat. Checked in advance (§10).

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `npm test` | No regression in existing suite | no — no test exists for stylesheet links yet |
| Manual: `curl` each route, grep for `visual.css` | Stylesheet is actually linked | n/a, new verification |
| Manual: browser responsive pass, 5 breakpoints × 2 themes | No overflow, no broken layout | n/a |

## 11. Human validation required

Push, PR creation, merge, deploy — all left to the operator once this
report is delivered.
