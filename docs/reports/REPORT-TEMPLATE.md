# REPORT — SPEC-NNN

**SPEC executed:**
**Branch:**
**Starting commit:**
**Final commit:** (or: none — see §11)
**Date:**

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

One of: complete · partial · blocked · abandoned. Then one sentence.

## 2. Summary

What was done, in plain terms, in a short paragraph.

## 3. Files created

| File | Purpose |
|---|---|

## 4. Files modified

| File | Change | Lines |
|---|---|---|

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | | tests / pass / fail |

New tests: were they seen failing before the fix? Say which, and how.

## 6. Audit

`./scripts/audit.sh` — output attached or summarised. Differences from the
previous audit.

## 7. Drift check

`./scripts/drift.sh` — divergences found, and for each one: fixed, or
escalated, and why.

## 8. Invariants added

Which, and their canonical source. Any invariant deliberately **not** frozen
because it is insufficiently documented — list them; do not invent them.

## 9. Gaps

Where the result differs from the SPEC's acceptance criteria, and why.

## 10. Risks

What this leaves fragile, and what would reveal it.

## 11. Requires human validation

Explicit list. Deploy, push, merge, payment, publication, credentials, legal.
Nothing here was done by Claude.

## 12. Still manual

What this work did not automate, and what it would take to.

## 13. Recommended next step

One. The most useful one.
