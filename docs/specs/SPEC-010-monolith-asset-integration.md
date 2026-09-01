# SPEC-010 — Final monolith asset integration

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-01
**Status:** validated
**Branch:** `spec/010-monolith-asset-integration`

---

## 1. Objective

The hero's provisional SVG monolith is replaced by the final production
asset pack (`monolith-dark.webp`, `monolith-light.webp`), with zero
change to hero structure, theming logic, or business behaviour.

## 2. Context

Operator supplied a 4-file pack: two production `.webp` images and two
`-reference.png` files at identical pixel dimensions (767×1024), clearly
higher-fidelity references for visual comparison rather than assets
meant for the live site (10× the byte weight for the same pixels,
lossless PNG vs the deployable lossy WebP pair).

## 3. Scope

- Add `public/monolith-dark.webp`, `public/monolith-light.webp`.
- Update the two `<img>` tags in `public/index.html`'s hero to point at
  the new files, with corrected `width`/`height` (767×1024, the assets'
  real intrinsic size) to avoid layout shift.
- Remove `public/hero-monolith.svg` and `public/hero-monolith-light.svg`
  once confirmed unused anywhere else.
- Do not touch CSS unless a genuine defect is found empirically (not
  assumed) — the existing `.hero-monolith-dark`/`.hero-monolith-light`
  class-based dark/light toggle, `object-fit`, animations and
  reduced-motion guards are reused unchanged by keeping the same class
  names on the new `<img>` elements.

## 4. Out of scope

- The two `-reference.png` files — not copied into `public/`, kept only
  as local review references.
- Any redesign of the monolith silhouette, the hero layout, or the
  `.hero-art-glow` / `.hero-art-frame::after` decorative overlays.
- Pricing, takeover, screening, data, routes, sale logic — untouched by
  construction (only `public/index.html` markup and two binary assets
  changed).

## 5. Files concerned

| File | Expected change |
|---|---|
| `public/index.html` | Two `<img src>` + `width`/`height` updated |
| `public/monolith-dark.webp` | New file |
| `public/monolith-light.webp` | New file |
| `public/hero-monolith.svg` | Removed (no longer referenced anywhere) |
| `public/hero-monolith-light.svg` | Removed (no longer referenced anywhere) |

## 6. Acceptance criteria

1. `npm test` — 413/413, `npm run check` — syntax ok, `git diff --check` — clean.
2. Dark shows `monolith-dark.webp`, light shows `monolith-light.webp`,
   verified in the unstamped (`prefers-color-scheme`, no saved
   preference) and explicit `data-theme` states.
3. No double beam/halo/lightning artefact from stacking the CSS
   `.hero-art-glow` over the asset's own baked-in glow — checked by
   toggling the CSS element on/off live and comparing.
4. No horizontal overflow and no destructive crop of the image's key
   content (beam tip, base) at 1280/1024/900/720/390/320px.
5. No distortion — `object-fit` values (`contain` desktop, `cover`
   mobile) never stretch, only crop or letterbox.
6. `prefers-reduced-motion` still disables `hero-breathe`/`hero-glow`
   without hiding the underlying static image.
7. Decorative accessibility markup (`aria-hidden`, `alt=""`) preserved
   unchanged.

## 7. Human validation required

Push, PR review, merge, deploy — left to the operator. The
performance trade-off (asset weight, both themes always fetched) is
reported as a fact for the operator to weigh, not resolved unilaterally.
