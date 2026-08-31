---
description: Implement a validated SPEC. Cycle SPEC → inspection → implementation → tests → REPORT.
argument-hint: <SPEC file, e.g. docs/specs/SPEC-002-foo.md>
---

Implement the SPEC at $ARGUMENTS. Nothing outside it.

If no SPEC file was given, or the file has empty sections, **stop and say so**.
Do not infer the SPEC from conversation: an inferred SPEC has no acceptance
criteria and no boundary.

## Cycle

**1 — Read.** The SPEC, then `CLAUDE.md`, then the files in the SPEC's
"Files concerned" table. Do not start from memory of a previous session.

**2 — Inspect.** Confirm the current behaviour before changing it. If the
code already does what the SPEC asks, the answer is a REPORT saying so, not
a change.

**3 — Check the boundary.** If the work needs a file not listed in the SPEC,
**stop** and ask for the SPEC to be amended. Scope creep is the failure mode
this whole cycle exists to prevent.

**4 — Implement.** Smallest change satisfying the acceptance criteria. Do not
refactor what you pass by. Do not "improve" adjacent code.

**5 — Test.**
   - Write the tests the SPEC requires.
   - **Prove each new test bites**: reintroduce the defect, run it, watch it
     fail with the right message, restore, watch it pass. Record both.
   - Run the full suite, never just the file you touched.
   - Run `./scripts/audit.sh` and `./scripts/drift.sh`.
   - Read `git diff` in full before reporting on it.

**6 — Report.** Fill `docs/reports/REPORT-TEMPLATE.md` into
`docs/reports/REPORT-NNN-<slug>.md`. Everything measured, nothing assumed.

## Boundaries

- Work on the SPEC's branch. Never `master`.
- **No push. No merge. No deploy.** These belong to the operator, and this
  command never performs them nor asks for permission to.
- A local commit only if the suite, the audit and the drift check are all
  clean. If something blocks it, leave the work uncommitted and say why.
- Never touch an invariant in `CLAUDE.md §9` unless the SPEC names it
  explicitly.
- Never freeze a 🟡 PROPOSED value.
