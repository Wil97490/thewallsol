# SPEC-013B — Hero theme-aware loading

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-02
**Status:** validated
**Branch:** `spec/013b-hero-theme-aware-loading`

---

## 1. Objective

The hero loads exactly one of `monolith-dark.webp` / `monolith-light.webp`
per visit — the one actually shown — instead of both, on every one of the
existing theme-selection scenarios, with zero visual change.

## 2. Context

Flagged in `REPORT-010` §12 and confirmed in the SPEC-013B read-only
analysis (this session): both hero `<img>` elements are fetched by the
browser regardless of `display:none`/`block`, costing ~307 KB per visit
for a single visible image. `<picture>`+`media` was analysed and
disqualified — it cannot react to the site's `data-theme` attribute
(only real media features), so it cannot honour an explicit theme choice.
CSS `background-image`, gated by the same 3-state selector already
driving the `display` toggle, was chosen: a browser only fetches a
`background-image` for a rule that currently applies.

## 3. Scope

- Replace the two `<img class="hero-monolith-dark/light">` in
  `public/index.html` with one decorative `<div class="hero-monolith">`.
- Retarget `public/css/visual.css`'s `.hero-monolith` rules from
  `<img>`/`object-fit`/`display` to `background-image`/`background-size`,
  reusing the exact same selector triad: bare `:root` (dark default),
  `:root[data-theme="light"]` (explicit, always wins over system), and
  `@media(prefers-color-scheme:light){:root:not([data-theme="dark"])}`
  (system preference, only when no explicit dark override).
- Add a static test locking in the new markup/CSS shape.

## 4. Out of scope

- `public/js/theme.js`, `public/js/wall.js` — untouched. Neither drives
  this change; `wall.js`'s inline theme block (the one actually used by
  the home page) is not modified.
- Pricing, takeover, screening, routing — untouched, no file outside
  `public/index.html`, `public/css/visual.css`, `test/pages.test.js`,
  this SPEC and its REPORT.
- `.hero-art-glow`'s known redundancy (REPORT-010 §9) — not addressed.
- The WebP files themselves and their MIME/cache headers (`SPEC-011`) —
  untouched.
- The pre-existing flash-of-wrong-theme risk for a returning visitor with
  an explicit saved theme (caused by `wall.js` being a deferred module,
  unlike the blocking `theme.js` used on other pages) — documented in the
  read-only analysis as a **pre-existing** condition, neither fixed nor
  worsened here.

## 5. Files concerned

| File | Expected change |
|---|---|
| `public/index.html` | Two `<img>` replaced by one `<div class="hero-monolith">` |
| `public/css/visual.css` | `.hero-monolith` retargeted to `background-image`; `object-fit` → `background-size` at the two existing responsive breakpoints; theme-selection selectors reused unchanged in shape |
| `test/pages.test.js` | Two new static assertions locking the markup/CSS shape |
| `docs/specs/SPEC-013B-hero-theme-aware-loading.md` | This SPEC |
| `docs/reports/REPORT-013B-hero-theme-aware-loading.md` | This report |

## 6. Expected behaviour

Observable from a visitor's side: no change at all — same image, same
crop, same animation, same drop-shadow, same theme swap. The only
difference is invisible to the eye and visible only in DevTools' Network
panel: one `.webp` request instead of two.

## 7. Acceptance criteria

1. `data-theme="dark"` explicit → only `monolith-dark.webp` requested.
2. `data-theme="light"` explicit → only `monolith-light.webp` requested.
3. No `data-theme` + system dark → only `monolith-dark.webp` requested.
4. No `data-theme` + system light → only `monolith-light.webp` requested.
5. `data-theme="dark"` always wins over system preference, in both
   directions.
6. Manual toggle in either direction updates `background-image`
   immediately and correctly; the newly-needed asset is requested (or
   confirmed already cached — no assumption either way, always
   verified).
7. A reload after a theme change re-applies the saved theme and requests
   only the matching asset.
8. `prefers-reduced-motion` still disables `.hero-monolith`'s animation,
   unchanged.
9. A missing/404 asset produces no visible broken element and no JS
   exception.
10. `object-fit:contain` (desktop) / `cover` (≤960px, ≤560px) visually
    reproduced via `background-size`, at 1280/1024/900/720/390/320px, no
    overflow, no destructive crop, matching the pre-existing framing
    exactly.
11. `filter:drop-shadow(...)` and the `hero-breathe` animation are
    visually unchanged.
12. `npm test`, `npm run check`, `git diff --check` all pass.

## 8. Invariants that must not move

None — no `CLAUDE.md §9` invariant is near a purely presentational,
client-side loading change.

## 9. Risks

- CSS `filter:drop-shadow()` applied to a `background-image`-only
  element must still hug the image's actual (non-transparent) pixels the
  same way it did on the `<img>` — verified visually, not assumed.
- The pre-existing flash-of-wrong-theme risk (see §4) could, in theory,
  cause a double-fetch for a visitor whose explicit theme differs from
  their system preference at the exact moment `wall.js` flips
  `data-theme` — this must be checked empirically, not assumed away by
  the CSS mechanism alone.
- `read_network_requests`-style tooling can return stale/buffered
  entries from earlier navigations in the same browser session (already
  documented in this engagement's PR#14 audit) — the Resource Timing API
  (`performance.getEntriesByType('resource')`), scoped correctly to the
  current document, is the authoritative source for "was this exact
  asset requested by this exact page load."

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `npm test` (existing 413 + 2 new) | no regression; new markup/CSS shape locked in | new tests: yes, written against the old two-`<img>` markup first |
| Real browser, Network/Resource-Timing panel, all 10 scenarios | the actual claim of this SPEC — that only one asset is fetched — which no automated test in this codebase can verify (no browser test harness exists here) | yes — verified against the pre-change markup during the read-only analysis, which showed both assets fetched unconditionally |

## 11. Human validation required

PR review and merge — left to the operator, per the standing workflow.
