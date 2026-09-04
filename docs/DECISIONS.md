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
| 2026-09-02 | The hero loads exactly one WebP (dark or light) per visit, matching the active theme, instead of both | ~307 KB unconditionally fetched for a single visible image was pure waste; the visible image is fully determined by CSS at parse time, so a browser can be made to fetch only that one | 🟢 | `SPEC-013B`, `public/css/visual.css:.hero-monolith` |

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
| 2026-09-02 | CSS/JS/MJS carry a content-hash `ETag` and `mtime`-based `Last-Modified`, revalidated under `Cache-Control: no-cache` (never a stale serving window) | a byte-identical redeploy still resets `mtime` (`Dockerfile`'s `COPY`), so a validator makes revalidation cheap without weakening the freshness guarantee `no-cache` already gave | 🟢 | `SPEC-014`, `src/http.js:serveStatic` |
| 2026-09-02 | `npm run deploy` also publishes `firebase.json` to Firebase Hosting (`firebase deploy --only hosting`), after the Cloud Run traffic switch | Firebase Hosting does not forward a client's conditional headers to the Cloud Run origin by default, and nothing republished `firebase.json`'s own edge-cache rule on its own — measured directly: the public domain returned `200`/`no-cache` where the origin correctly returned `304`, until this step existed | 🟢 | `SPEC-014A`, `SPEC-015`, `scripts/deploy.sh` |
| 2026-09-03 | The publisher's identity is read from config and rendered server-side; a field that is not set produces no line at all | a `[to be completed]` printed on a public page, under "Who publishes this site", tells the one person hesitating to send money that the page is unfinished — an unset field is less damaging absent than displayed | 🟢 | `SPEC-017`, `src/pages.js:publisherBlock`, `public/terms.html` |
| 2026-09-03 | An incomplete publisher identity, or mail that cannot be sent, does **NOT** stop a sale. It is recorded, not enforced | the operator decided that payment is validated while the identity is being completed. The exposure is his and he takes it knowingly; the engineering duty is to make it a choice with a trace rather than an accident, not to overrule it | 🟢 | `SPEC-017`, `src/config.js:salesPreconditions` (returns `[]` unless `SALES_REQUIRE_PUBLISHER=true`) |
| 2026-09-03 | Every seat awarded while anything is missing writes `sold_with_gaps` to the audit log, carrying the list **as it stood at that moment** | "were the notices complete when this seat was sold?" is asked afterwards, and an answer rebuilt from the config of the day it is asked would be a guess about the past. The current state (`sales.gaps`) and the historical trace are two different facts and are stored as two different things | 🟢 | `SPEC-017`, `src/sales.js:recordSeatAward`, `/api/admin/ops` |
| 2026-09-03 | The strict behaviour — the checkout refusing while the identity is incomplete — is kept built and tested behind `SALES_REQUIRE_PUBLISHER=true`, default `false` | reverting a policy should be a variable, not a re-implementation. Deleting the mechanism would mean rebuilding and re-reviewing it the day the answer changes | 🟢 | `SPEC-017`, `src/config.js:requirePublisherForSales` |
| 2026-09-03 | **When the till is closed** (`SALES_REQUIRE_PUBLISHER=true`), it returns `503` **before** the chain is read, worded so the buyer knows the cause is us | reading the chain first would hand them a refusal that reads as a verdict on their contract when it is a fact about our paperwork — the site's own `NOT_ABOUT_THEM` rule applied to itself | 🟢 | `SPEC-017`, `src/server.js:handleCheckout` |
| 2026-09-03 | `/terms` names the identity as the cause of a closed till only when the identity is the cause | under `SALES_REQUIRE_PUBLISHER=true` the till also closes on unsendable mail; printing "the identity above is incomplete" under a complete notice would be a confident wrong sentence on a public page | 🟢 | `SPEC-017`, `src/pages.js:publisherBlock` |
| 2026-09-03 | A confirmed payment sends a deterministic receipt, written in code and never phrased by a model, carrying the signature and a Solscan link | a buyer who pays and hears nothing has been taken money from; the receipt must survive every agent being switched off, and must stay verifiable if this site disappears | 🟢 | `SPEC-017`, `src/notify.js:receiptText`, `sendReceipt` |
| 2026-09-03 | `PUBLISHER_SIREN` is checked against its Luhn checksum at boot | the same move as the ed25519 curve test in the holder check: arithmetic, checkable without trusting anyone, cheap. It establishes the number is well-formed — **not** that it belongs to this publisher, and nothing printed from it claims that | 🟢 | `SPEC-017`, `src/config.js:sirenLooksValid` |

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
- Legal entity and address. The earlier wording of this line said "required
  before any real sale" and, after `SPEC-017`, that an incomplete identity
  closed the checkout. **Both are superseded by the operator's decision of
  2026-09-03** recorded in Method above: selling continues, the gaps are
  recorded per sale, and nothing blocks unless `SALES_REQUIRE_PUBLISHER=true`.
  What remains undecided is the content — `PUBLISHER_SIREN` and
  `PUBLISHER_DIRECTOR` are unset, and the operator chose "address communicated
  on request". That choice carries a flagged legal doubt: the LCEN exemption
  from publishing an identity appears to cover *non-professional* publishers,
  which a registered micro-entreprise selling advertising space is not.
  Recorded in `DEPLOY.md` §8; needs a lawyer, not a session — and it weighs
  more now that nothing mechanical stands between an incomplete notice and a
  sale.
- The Resend sending domain is not verified and `resend-api-key` does not
  exist in Secret Manager. **This does not stop a sale**: the seat is awarded,
  the buyer simply receives no receipt, and the failure is written to the audit
  log as `email_not_configured` while the sale itself is marked
  `sold_with_gaps`. Steps to close it in `DEPLOY.md` §2.6.
- Seat №10 shows `priceUsd: 1` (since 2026-08-25). Flagged early in this
  engagement as needing an operator decision — leave it, correct it in the
  database, or another resolution. No decision has been made; the seat is
  untouched.
