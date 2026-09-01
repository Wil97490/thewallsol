# REPORT — SPEC-010

**SPEC executed:** SPEC-010-monolith-asset-integration
**Branch:** `spec/010-monolith-asset-integration`
**Starting commit:** `01e399a` (master)
**Date:** 2026-09-01

---

## 1. Overall result

**Complete.** Integration done with zero CSS changes — the existing
class-based theme toggle, animations, object-fit and reduced-motion
guards all apply to the new assets unchanged, by design.

## 2. Summary

Replaced the two provisional SVG monolith images with the supplied
production WebP pair. Only `public/index.html` (2 `<img>` tags) and the
`public/` asset files changed. The `-reference.png` files were reviewed
locally (identical 767×1024 pixels, 8–10× the byte weight — clearly
review references, not deployable assets) and were deliberately not
copied into the repository.

A genuine, quantified performance trade-off was found and is reported
rather than silently accepted or silently fixed (§9/§10).

## 3. Files created

| File | Purpose |
|---|---|
| `public/monolith-dark.webp` | Production dark-theme hero asset (126,286 bytes) |
| `public/monolith-light.webp` | Production light-theme hero asset (180,736 bytes) |
| `docs/specs/SPEC-010-monolith-asset-integration.md` | This pass's SPEC |
| `docs/reports/REPORT-010-monolith-asset-integration.md` | This report |

## 4. Files modified

| File | Change |
|---|---|
| `public/index.html` | Two `<img src>` repointed to the new WebP files; `width`/`height` corrected from `720×860` to the assets' real `767×1024` |

## 5. Files removed

| File | Why |
|---|---|
| `public/hero-monolith.svg` | No longer referenced anywhere (confirmed by repo-wide grep before removal) |
| `public/hero-monolith-light.svg` | Same |

## 6. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 413 / 413 / 0 fail |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

## 7. Manual verification (real, in-browser)

Local dev server, isolated data directory. Verified per acceptance
criterion:

- **Theme swap (unstamped + explicit)**: in the historically fragile
  scenario (system light, no saved preference), confirmed via
  `getComputedStyle`/`currentSrc`: dark image `display:none`, light
  image `display:block`, `currentSrc` pointing at `monolith-light.webp`,
  `naturalWidth:767` (decoded correctly, not broken). Screenshotted in
  both dark and light.
- **Double-glow check**: toggled `.hero-art-glow`'s `display` live
  (on/off) and compared screenshots. The CSS glow blends into the
  asset's own baked-in base glow without producing a visible double-ring
  artefact — but the CSS layer's own contribution is now largely
  redundant, since the asset already supplies a strong glow at the base.
  Not a defect; not "fixed" either, since that would mean touching CSS
  beyond what SPEC-010 authorized and the mission's own instruction not
  to redesign. Reported as an observation (§9).
- **Responsive**: 1280/1024/900/720/390/320px, no horizontal overflow at
  any width (`scrollWidth === clientWidth`). Full-frame screenshots
  (not partial mid-scroll views, which were initially misleading) show
  the beam tip and the base/steps both fully visible with margin at
  every width tested — the vignette (`.hero-art-frame::before`) softens
  the crop at all breakpoints, including the `object-fit:cover` mobile
  cases. No destructive crop found.
- **Distortion**: `object-fit:contain` (desktop) and `object-fit:cover`
  (≤960px) never stretch an image by definition — confirmed via computed
  style, no stretching observed at any width.
- **`prefers-reduced-motion`**: confirmed via CSSOM on the actually
  served page — `.hero-monolith, .hero-art-glow { animation: none }`
  still matches the new `<img>` elements (same class names reused), so
  `hero-breathe`/`hero-glow` are disabled while the static image itself
  remains fully visible.
- **Accessibility**: `aria-hidden="true"` on `.hero-art`, `alt=""` on
  both images — unchanged, confirmed in the diff.

## 8. Audit

No other file references the removed SVGs or the new WebP filenames
outside `public/index.html` — confirmed by repo-wide grep before and
after the change.

## 9. Observations (not defects, reported for the operator)

**Visual direction shift.** The supplied assets are photorealistic 3D
renders (rock face, multiple lightning bolts, a glowing ritual base)
rather than the abstract, minimal vector shape previously in place. This
is a significant stylistic departure from the quiet, editorial direction
reinforced across this session's prior visual PRs. Not my call to make —
implemented exactly as supplied, silhouette untouched, per instruction.

**`.hero-art-glow` is now largely redundant** for this asset (see §7) —
not broken, just doing less work than before. Left untouched since
SPEC-010 scoped this pass to asset swap only, not a CSS redesign.

## 10. Risks / performance trade-off

**Asset weight increased roughly 38×**: the previous SVG pair totalled
~8 KB; the new WebP pair totals 307,022 bytes (126,286 + 180,736),
confirmed by direct transfer measurement. Both files still load
unconditionally on every visit regardless of active theme — a
pre-existing architectural pattern (already noted in the very first
visual-PR audit for the SVGs), whose absolute cost is now far more
material because photographic WebP is inherently heavier than vector
line art. Not fixed here: lazy-loading only the active theme's image
would touch the loading strategy, which is beyond "technical
integration" as scoped. Flagged as a fact for the operator to weigh,
not a blocker.

## 11. Requires human validation

Push (done — see PR), review, merge, deploy — all left to the operator,
including the two observations above.

## 12. Recommended next step

If the ~300 KB hero weight is a concern, the next SPEC could load only
the theme actually in use (e.g. swap `src` via the existing `theme.js`
toggle instead of shipping both images to every visitor) — a loading
change, not a visual one, so it would need its own SPEC and explicit
sign-off rather than being folded into this asset swap.
