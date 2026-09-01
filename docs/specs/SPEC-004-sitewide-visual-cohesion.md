# SPEC-004 — Site-wide visual cohesion

## Intent
Extend the approved THE WALL visual language from the home hero to the server-rendered public pages without changing product semantics.

## Invariants
- No pricing, takeover, seat-state, screening, or payment logic changes.
- No new runtime dependency or build step.
- Existing dark/light token model remains authoritative.
- Vermilion remains the primary interaction accent; violet remains secondary.
- Public pages remain server-rendered and indexable.
- Accessibility and reduced-motion behavior must not regress.

## Scope
- Reuse the approved visual layer stylesheet on the server-rendered shell.
- Give server-rendered pages the same architectural hero rhythm, card elevation, rounded surfaces, and spacing language as the home page.
- Improve navigation state clarity without changing routes.
- Keep copy and factual claims unchanged.

## Validation
Claude Code must run the full existing test/check suite and browser checks for representative public routes in dark/light themes before merge.
