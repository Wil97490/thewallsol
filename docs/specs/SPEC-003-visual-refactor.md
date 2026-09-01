# SPEC-003 — Visual refactor / The Wall

## Status
Validated direction from the operator. Visual implementation only; no economic or business-rule changes.

## Objective
Bring the public site closer to the validated visual direction: editorial, premium, architectural, dark-first, with the monolith/beam visual language as the hero anchor. Preserve the existing product, copy meaning, navigation, seat mechanics, verification claims, and V4.54 invariants.

## Scope
- Recompose the home hero into copy + visual art panel on desktop, stacked cleanly on mobile.
- Introduce a reusable hero-art treatment that can use a raster monolith when available and remains credible without one.
- Use violet as a secondary visual effect only; keep vermilion `#FF4D1C` as the primary CTA/semantic accent.
- Improve hierarchy, spacing, buttons, stats, section transitions and responsive behavior.
- Preserve the full light-theme swap and make visual effects theme-aware.
- Respect `prefers-reduced-motion`.
- Do not invent tokenomics, alter seat economics, payment logic, verification logic, or publish/deploy.

## Explicit visual constraints
- Do not use the generic token-ranking/dashboard content shown in earlier moodboards.
- Do not replace validated product copy with crypto-gaming marketing copy.
- Do not hard-code generated artwork into business logic.
- If no production monolith raster exists, use a restrained CSS/SVG architectural placeholder rather than claiming a raster is production-ready.
- No wallet/payment/security behavior changes in this pass.

## Acceptance criteria
1. Home page retains all existing functional sections and links.
2. Desktop hero has a deliberate two-column composition with clear visual focus.
3. Mobile hero has no horizontal overflow and preserves readable copy/action hierarchy.
4. Dark/light themes remain full swaps; vermilion remains the primary semantic accent.
5. Decorative visual motion is disabled under `prefers-reduced-motion`.
6. No economic invariant changes.
7. Existing test suite remains green.
8. Accessibility semantics of controls and navigation are preserved.
9. No deployment or push to origin is performed by this SPEC.
