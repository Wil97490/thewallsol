# SPEC-009 — Public evidence cohesion

Extend the validated visual language to the public evidence/ledger surfaces without changing business logic, copy, routes, pricing, screening, or data semantics.

## Scope
- Public pages already loading `visual.css`.
- Refusal ledger, checks index, seen measurements, detail readings, thresholds, reply/pledge blocks, and screen form.
- Visual treatment only: grouping, hierarchy, spacing, depth, rails, and restrained interaction feedback.

## Constraints
- No new dependency or build step.
- Preserve dark/light token model.
- Preserve status colors and CTA semantics.
- `prefers-reduced-motion` must disable new motion.
- No changes to admin surfaces.
