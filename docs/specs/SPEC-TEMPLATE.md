# SPEC-NNN — <title>

**Author:** <who wrote this SPEC>
**Date:**
**Status:** draft | validated | implemented | abandoned
**Branch:** `spec/NNN-<slug>`

A SPEC is written *before* implementation and validated *before* Claude Code
starts. If a section cannot be filled, the SPEC is not ready.

---

## 1. Objective

One sentence. What is true after this work that is not true now.

## 2. Context

Why now. Link the Master Context section or the REPORT that raised it.
State the label: 🟢 VALIDATED / 🟡 PROPOSED. **A 🟡 item may not be frozen.**

## 3. Scope

What is being changed. Be concrete and small.

## 4. Out of scope

What is explicitly *not* being touched. This section is the one that keeps
a session bounded — write it before the scope if it helps.

## 5. Files concerned

| File | Expected change |
|---|---|
| | |

Anything not in this table is out of scope. If the work needs another file,
stop and amend the SPEC.

## 6. Expected behaviour

Observable, in the terms a user or a caller would see. Not implementation.

## 7. Acceptance criteria

Numbered, each one independently checkable. A criterion that cannot be
tested or measured is not a criterion.

1.
2.

## 8. Invariants that must not move

Which V4.54 invariants this work comes near. `CLAUDE.md §9` is the list.

## 9. Risks

What could break, and what would tell us it broke.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| | | yes |

## 11. Human validation required

Anything needing the operator: deploy, push, payment, a public post, a
credential, a legal question.
