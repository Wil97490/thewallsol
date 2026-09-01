# SPEC-007 — Wall surface

## Goal
Strengthen the public Wall section so the 24-seat grid and its detail panel read as one physical, premium surface.

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

## Visual intent
The seat grid becomes a framed Wall surface rather than a flat collection of cards. Seats gain restrained depth and consistent spacing, while the detail panel reads as a companion information slab. The pass is CSS-only and preserves existing DOM, data and interactions.
