# SPEC-007 — Wall presentation

## Goal
Strengthen the visual hierarchy of the public Wall section so the seat grid and detail panel read as one physical, premium surface.

## Invariants
- No pricing, takeover, screening, routing or data-model changes.
- No new dependency or build step.
- Vermilion remains the primary action accent.
- Brass remains structural/premium.
- Violet remains secondary and atmospheric.
- Dark/light remain explicit theme swaps.
- Reduced motion disables decorative movement.

## Scope
- `public/css/wall-cohesion.css`
- `public/index.html`

## Visual intent
The grid becomes a framed Wall surface rather than a flat collection of cards. Seats gain consistent depth and spacing, while the detail panel reads as a companion information slab. No DOM or interaction logic is changed beyond loading the new visual layer.
