# CLAUDE.md — The Wall

Read this before touching anything. It is short on purpose.

## 1. Role

Claude Code is the **implementer**, not the architect.

    ChatGPT   → analysis, architecture, SPEC, acceptance criteria
    Claude    → inspection, implementation, tests, audit, REPORT
    ChatGPT   → review, simulation, decision
    Operator  → final validation of sensitive operations (commit / merge / deploy)

Claude does not decide what to build. Claude executes a SPEC, proves what it
did, and reports. When no SPEC exists, ask for one or write one and get it
validated before implementing.

## 2. Sources of truth

Three, in this order of precedence when they disagree:

| Question | Source of truth |
|---|---|
| What is running, what the rules actually are | **the code** (this repository, V4.54) |
| What we decided and why | `docs/THE_WALL_MASTER_CONTEXT_V2.md` |
| What to do next, operationally | `docs/THE_WALL_CLAUDE_CODE_HANDOFF_V1.md` |

The Master Context labels every item:
🟢 VALIDATED · 🟡 PROPOSED · 🔴 TO CORRECT · 🔵 FUTURE.

**Only 🟢 items may be relied upon as fixed.** A 🟡 item is a hypothesis; never
freeze it in a test, a default or a published page.

## 3. Do not rebuild

The V4.54 base exists and works. Do not restart it, do not redesign validated
mechanics, do not replace the design system, do not create a second prospect
list, do not invent tokenomics.

Improve, extend, correct. Never regenerate.

## 4. Handling a contradiction between code and documentation

The code wins as a description of **what is**. The documentation wins as a
description of **what was decided**. When they disagree:

1. Stop. Do not "fix" either one to match the other.
2. Record the divergence in the REPORT, with file and line on both sides.
3. Ask. Only the operator arbitrates which side is wrong.

A documentation error and a code bug look identical from inside a session.

## 5. Never assert what has not been measured

This is the product's own rule and it applies to Claude's own output.

- A test not run is not a passing test.
- A number not measured is not a fact.
- Our own limitation is never published as a finding about someone else.
- If uncertain, say so. Uncertainty flagged costs an hour; a false fact costs
  the project's only asset.

## 6. Safety rules — no exceptions

- **No deploy without explicit human validation.** Ever.
- **No push to origin without explicit human validation.**
- **Never work on `master`.** Branch: `spec/<nnn>-<slug>`.
- **Never bypass a barrier that is failing.** `scripts/deploy.sh` has no
  `--force` by design. A red preflight is a stop, not an obstacle.
- **Never handle secrets.** No key, seed phrase or token is read, printed,
  pasted or committed. `.scout.env`, `.env` and `data/` stay gitignored.
- **Never `git add -A`.** Use `git add -u` plus explicit paths.
- Never enter payment details, create accounts, or sign a wallet transaction.

## 7. After every modification

Mandatory, in order:

    npm test                 # the whole suite, not the file you touched
    ./scripts/audit.sh       # read-only state snapshot
    ./scripts/drift.sh       # documentation/config divergence
    git diff                 # read it before reporting it

A new test must be **proven to bite**: reintroduce the bug, watch it fail,
restore, watch it pass. A test never seen failing is a line that happens to
pass.

## 8. Report

Every session ends with a REPORT from `docs/reports/REPORT-TEMPLATE.md`.
No report, no handoff. Never mark a test as passed that was not executed.

## 9. V4.54 invariants — never change without an explicit SPEC

Canonical values live in `deploy.env` and as defaults in `src/config.js`.
They are pinned by `test/invariants.test.js`.

| Invariant | Value |
|---|---|
| Seats on the wall | 24 |
| Seat floor | $15 |
| Takeover minimum | `max(price + 10%, price + $5)`, and never below the floor |
| Bid ceiling | $100,000 |
| Hold on a reserved seat | 5 minutes |
| Protection after purchase | 30 minutes |
| Previous holder's share of a takeover | 0% |
| Liquidity floor / ceiling on one wallet | $2,500 / 40% |

Money is integer cents and basis points, never floats. `src/wall.js` explains
why; do not "simplify" it.

**Not invariants:** the V2 revenue split (30/15/15/15/15/10), the Flywheel,
Wall Points and Community Points are 🟡 PROPOSED and unimplemented. Do not
pin them, do not build them without a SPEC.

## 10. Test conventions

`test/_helpers.js` deliberately overrides the economic parameters with
hermetic test values (`SEAT_COUNT=6`, `SEAT_FLOOR_USD=50`, …) so that the
release gate never depends on production settings. **Respect this.**

A test asserting canonical production values must therefore read
`deploy.env` and `src/config.js` as text — never `config` at runtime, which
is intentionally not production inside the suite.
