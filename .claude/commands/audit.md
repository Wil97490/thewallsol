---
description: Read-only audit of the repository and its state. Changes nothing.
---

Run a reproducible, **read-only** audit. You modify no file, create no branch,
run no deploy. If you find yourself wanting to fix something, write it down
instead — the output of an audit is a finding, not a patch.

## Steps

1. Read `CLAUDE.md`, then `docs/STATE.md`, then `docs/DECISIONS.md`.
2. Run `./scripts/audit.sh` and read the whole output.
3. Run `./scripts/drift.sh`.
4. Run `npm test` and record the exact measured counts.
5. Read `git status --short` in full — never truncate it and conclude from
   the first lines.
6. Compare what the code does against the 🟢 VALIDATED items of
   `docs/THE_WALL_MASTER_CONTEXT_V2.md`. Ignore 🟡 items: they are not
   supposed to exist yet, so their absence is not a gap.

## Output

A short report, in this order:

- **State** — branch, commit, tree clean or not, measured test counts.
- **Divergences** — code vs documentation. For each: file and line on both
  sides, and which one you believe is wrong, *without changing either*.
- **Risks** — ordered: security/data integrity, then wall rules, then
  accounting, then the rest.
- **Not measurable from here** — what would need production, a credential or
  the operator. Say so rather than guessing.
- **Recommended next step** — one.

Never report a check as passed if it did not run. If a command fails, that
is the finding.
