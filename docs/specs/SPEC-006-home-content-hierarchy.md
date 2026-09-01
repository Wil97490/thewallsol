# SPEC-006 — Home content hierarchy

## Goal
Refine the approved visual language on the public home page so the hero, proof film, wall, podium, seats and detail panel read as one deliberate composition.

## Invariants
- No pricing, takeover, screening, routing or data-model changes.
- No new dependency or build step.
- Vermilion remains the primary action accent.
- Brass remains structural/premium.
- Violet remains secondary and atmospheric.
- Dark/light remain explicit theme swaps.
- Reduced motion disables decorative movement.

## Scope
- `public/css/home-cohesion.css`
- `public/index.html`

The new stylesheet is an intentionally small home-only visual layer loaded after the existing public visual stylesheet. It changes hierarchy, spacing, media framing, seat depth and section cadence without altering interaction code.
