# DECISIONS — the register

One line per decision that a future session must not silently reopen.
Append only. Never delete a row: supersede it with a new one.

Format: date · decision · why · status · where it is enforced.

---

## Product

| Date | Decision | Why | Status | Enforced |
|---|---|---|---|---|
| pre-V4.54 | 24 permanent seats | fixed, scarce, legible | 🟢 | `config.seatCount` |
| pre-V4.54 | Takeover = `max(price+10%, price+$5)` | the $5 stops cent-by-cent ping-pong on cheap seats; the 10% stops an expensive seat being taken for pocket change | 🟢 | `src/wall.js:minimumBid` |
| pre-V4.54 | The floor applies to occupied seats too | otherwise a seat sold under an older setting stays cheaper than the empty seats beside it, and the wall advertises "from $15" above a row anyone can take for $6 | 🟢 | `src/wall.js:minimumBid` |
| pre-V4.54 | Money is integer cents + basis points | `100 × 1.10 = 110.00000000000001` in floats, which asks $111 to beat $100 | 🟢 | `src/wall.js` |
| V4.54 | Previous holder receives **0%** of a takeover | rewards participation, not resale; a royalty would make it a financial marketplace | 🟢 | not implemented — nothing pays the previous holder |
| V4.54 | The token gives no seat, no discount, no claim | anything giving a holder an interest in a screening decision corrodes the ledger | 🟢 | `public/rules.html` |
| 2026-08-28 | 9.35% of supply locked to 2026-11-28, Streamflow, non-cancelable | verifiable without trusting the page | 🟢 | `public/rules.html`, contract `683Jjc…dtryJ` |
| 2026-09-01 | Telegram and X are removed as public contact channels; `contact@thewallsol.com` is the sole channel until a new official one exists | both accounts confirmed suspended by the operator | 🟢 | `SPEC-008`, every public footer, `public/rules.html` |
| 2026-09-01 | The photorealistic WebP monolith (dark/light) is the final hero visual, replacing the provisional abstract SVG | operator validated the direction; the SVG was explicitly provisional | 🟢 | `SPEC-010`, `public/monolith-dark.webp`, `public/monolith-light.webp` |

## Method

| Date | Decision | Why | Status | Enforced |
|---|---|---|---|---|
| — | Never publish a claim not measured | the ledger is the only asset; one false finding ends it | 🟢 | `UNRESOLVED`/`UNVERIFIABLE` rule tiers |
| — | Our own failure is never printed as a fact about someone else | an absence is not a discovery | 🟢 | `NOT_ABOUT_THEM`, `postWorth()` |
| — | 404 ≠ 403 | a dead link is theirs; a bot filter is ours | 🟢 | `link_dead` vs the flag tier |
| — | A test must be seen failing before it is believed | a test never seen failing is a line that happens to pass | 🟢 | practice; `CLAUDE.md §7` |
| — | Deploy is gated on tests + preflight, no `--force` | a barrier that can be bypassed is decoration | 🟢 | `scripts/deploy.sh` |
| — | Tests are hermetic; production values never decide what the release gate tests | otherwise a config change silently changes what is proven | 🟢 | `test/_helpers.js` |
| 2026-08-29 | The concentration ceiling is per wallet, and the page says so | fifteen wallets each under the ceiling hold one position and pass | 🟢 | `src/checks.js`, `test/checks.test.js` |
| 2026-08-30 | Commits are authored `The Wall <contact@thewallsol.com>` | no personal identity in a public history | 🟢 | `git config` per clone |

## Refused, with the reason

| Date | Refused | Why |
|---|---|---|
| 2026-08-28 | Volume bot on `$WALL` | manufactures the exact metric our own screener treats as evidence; the pattern is readable in thirty seconds by any prospect |
| 2026-08-28 | A post blaming a third party for bought engagement | false statement about an identifiable party |
| 2026-08-29 | "We would have caught $GOLD" | we never ran the checks on it; a retroactive claim is the day-1 defect wearing a marketing hat |
| 2026-08-29 | Token utility via discount / revenue share / governance | each gives a holder a financial interest in the wall refusing less |

## Open, undecided

- Token utility limited to gated access to the discarded round data — passes
  the test (a holder gains from *more* checking, not less), still needs a
  legal read under MiCA before anything is written on the site.
- An eighth check clustering addresses by funding source. Feasible with the
  RPC calls already in use; deliberately **not** built — it would be a flag,
  never a refusal, and nothing has been sold yet.
- Legal entity and address, required before any real sale.
- Seat №10 shows `priceUsd: 1` (since 2026-08-25). Flagged early in this
  engagement as needing an operator decision — leave it, correct it in the
  database, or another resolution. No decision has been made; the seat is
  untouched.
