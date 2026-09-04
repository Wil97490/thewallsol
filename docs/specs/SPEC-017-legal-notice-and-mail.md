# SPEC-017 — Legal notice from config, and the receipt a buyer never got

**Author:** Claude (written after implementation — see §12)
**Date:** 2026-09-03
**Status:** draft — révision 3, après deux NO-GO (2026-09-03, 2026-09-04)
**Branch:** `spec/017-legal-notice-and-mail`

---

## 1. Objective

The site says who publishes it without ever asserting a fact it does not have,
sends the buyer a receipt, and records — at the moment of each sale — anything
that was still missing.

## 2. Context

Two defects, both measured on production today (2026-09-03):

1. **`/terms` publishes a placeholder.** `curl -s https://thewallsol.com/terms
   | grep -c 'to be completed'` returns `1`. The string sits under the heading
   "Who publishes this site", on a public page, in front of the one person who
   is deciding whether to send money to a stranger. The file's own comment says
   the field was left out rather than filled with a falsehood — correct
   reasoning, but the marker still ships.

2. **A buyer can pay and receive nothing.** `sendEmail()` exists in
   `src/notify.js` and is called from exactly one place: `src/agents/
   reporter.js:76`, reached only when the reporter agent is enabled *and*
   `isAutonomous("reporter")` is true. There is no transactional mail on the
   payment path. `grep -rn "sendEmail" src/` confirms the single caller.
   `RESEND_API_KEY` appears in no `.env.example`, no `deploy.env`, and no
   `--set-secrets` list, so it was never going to be set in production either.

Master Context labels: the legal-notice requirement is 🟢 VALIDATED (a
commercial site must identify its publisher); the *content* of the identity is
operator-supplied and is not frozen anywhere in this work.

## 3. Scope

- Publisher identity moves into `config`, and `/terms` renders it server-side.
- An incomplete identity is **recorded, not enforced** (operator decision,
  2026-09-03 — see §11): a seat sold while something is missing writes
  `sold_with_gaps` to the audit log with what was missing that day.
- The strict behaviour — an incomplete identity closing the checkout — is
  built, tested, and behind `SALES_REQUIRE_PUBLISHER=true`.
- A deterministic receipt is sent when a payment is confirmed on chain.
- `sendEmail()` gains a timeout, recipient validation, and provider-error
  capture.
- Deploy plumbing carries the new variables, and `DEPLOY.md` documents them.

## 4. Out of scope

- Screening rules, thresholds, pricing, takeover logic, the gate: untouched.
- The reporter agent's daily note: unchanged.
- CGV, refund policy, privacy text: unchanged prose on `/terms`.
- Choosing what the publisher's identity actually *is*. Operator's call (§11).
- Creating the Resend account or handling its API key. Operator's call (§11).

## 5. Files concerned

| File | Expected change |
|---|---|
| `src/config.js` | `publisher` + `mail` blocks; `requirePublisherForSales`; `sirenLooksValid`, `publisherGaps`, `publisherComplete`, `mailConfigured`, `salesGaps`, `salesPreconditions`, `salesOpen` |
| `src/notify.js` | hardened `sendEmail`; new `receiptText`, `sendReceipt`, `mailStatus` |
| `src/pages.js` | new `publisherBlock()` — renders only established fields |
| `src/http.js` | new `serveHtml()` — static HTML with marker substitution |
| `src/sales.js` | **new** — `recordSeatAward()`: the award line, the gap line, the receipt. Extracted so the payment path is reachable by a test |
| `src/server.js` | `/terms` rendered; checkout gated by policy; `sold_with_gaps` at award; receipt sent on confirmed payment; `sales`/`mail` on `/api/admin/ops` |
| `public/terms.html` | publisher block replaced by `<!--PUBLISHER_IDENTITY-->` |
| `scripts/deploy.sh` | `^\|^` env delimiter; conditional `resend-api-key` secret |
| `deploy.env`, `.env.example` | new variables, no secrets |
| `DEPLOY.md` | §2.6 Resend, §8 rewritten |
| `test/legal-mail.test.js` | new |
| `test/sales-trace.test.js` | **new** — runs the award path and reads the real audit log; hits `/api/admin/ops` over real HTTP |
| `package.json` | `0.54.0` → `0.55.0` |

## 6. Expected behaviour

- `/terms` prints the publisher fields that are set, and **no line at all** for
  those that are not. No placeholder, no empty label, no "N/A".
- With the identity incomplete and the default policy, a sale proceeds
  normally and `sold_with_gaps` is written at the moment the seat is awarded.
  `GET /api/admin/ops` reports `sales.gaps` continuously.
- With `SALES_REQUIRE_PUBLISHER=true`, `POST /api/checkout` returns `503`
  carrying `salesClosed: true` and a reason that says the cause is us,
  **before** the chain is read — so no buyer is handed a refusal that reads as
  a verdict on their contract. `/refused`, `/checks`, `/seen` and the nightly
  round are unaffected either way.
- `/terms` states that seats are not on sale only when they actually are not,
  and names the identity as the cause **only when the identity is the cause**.
- On a confirmed payment, the buyer receives a receipt carrying the seat, the
  price, the signature and a Solscan link. The seat is awarded whether or not
  the mail provider cooperates.
- `GET /api/admin/ops` reports `sales.open`, `sales.blocking[]`, `sales.gaps[]`,
  `sales.requirePublisher` and `mail`, with no secret in the response.

## 7. Acceptance criteria

1. `publisherBlock()` never emits `to be completed`, `[…]`, `undefined`,
   `null` or `N/A`, for any combination of set and unset fields.
2. A field that is not set produces no line.
3. `sirenLooksValid()` accepts a nine-digit number passing Luhn, rejects a
   wrong length and a failed checksum.
4. A SIREN failing its checksum appears in `publisherGaps()`.
5. No address **and** no `PUBLISHER_ADDRESS_ON_REQUEST` is a gap; either one
   alone closes it.
6. With `salesClosed` and a complete identity, the notice does **not** say the
   identity is incomplete.
7. `sendEmail()` rejects a non-address before any network call.
8. `sendEmail()` reports the missing key rather than returning success.
9. `receiptText()` contains the signature and the Solscan URL, and contains no
   congratulation, prediction, or invitation to spend more.
10. `mailStatus()` names what is missing and contains no secret value.
11. `/terms` as served contains no `<!--PUBLISHER_IDENTITY-->` and no
    placeholder text.
12. `scripts/deploy.sh` passes env vars with a non-comma delimiter, and looks
    up `resend-api-key` before referencing it.
13. `deploy.env` contains no secret value.
14. The existing invariant test "les mentions légales nomment un éditeur"
    still passes.
15. With the default policy, an incomplete identity leaves `salesGaps()`
    non-empty and `salesPreconditions()` empty — the gap is visible and the
    till is open.
16. With `SALES_REQUIRE_PUBLISHER=true`, the same incomplete identity closes
    the till, and a complete one opens it.
17. `salesGaps()` returns the same list under either policy — a policy change
    must not change a measurement.
18. `recordSeatAward()` on an order sold with gaps writes exactly one
    `sold_with_gaps` line to the **real** audit log, carrying the order id, the
    seat, the ticker and the gap list as it stood at that moment.
19. With nothing missing, no `sold_with_gaps` line is written, and
    `seat_awarded` still is.
20. Completing the identity afterwards does not alter the stored trace: the old
    line still carries the old gaps while `salesGaps()` is empty.
21. `GET /api/admin/ops`, over real HTTP, exposes `sales.gaps`,
    `sales.requirePublisher` and `sales.blocking`, and leaks no secret.
22. On the real URL, the default leaves `open: true` and `blocking: []` despite
    gaps; `SALES_REQUIRE_PUBLISHER=true` closes it and `POST /api/checkout`
    returns `503` with `salesClosed: true`.

## 8. Invariants that must not move

- **Never publish a claim the system has not established.** This work is an
  application of it, not an exception: the notice prints only measured fields,
  and the closed-till sentence names a cause only when that cause is the
  actual one.
- **A tooling limitation is never printed as a finding about someone's token.**
  The `503` is worded so the buyer knows the refusal is about us.
- The gate, its thresholds and the screening path are not touched.

## 9. Risks

| Risk | What would tell us |
|---|---|
| A postal address containing a comma splits the gcloud env list | The variable after `PUBLISHER_ADDRESS` holds a fragment of the address. Mitigated by the `^\|^` delimiter and a test. |
| Referencing a non-existent `resend-api-key` secret | The Cloud Run revision fails to start. Mitigated by `gcloud secrets describe` before use, and a test. |
| The till closes and nobody notices | `/api/admin/ops` reports `sales.blocking[]`, and `/terms` says it in public. |
| **Seats are sold while the legal notice is incomplete** — the accepted risk under the default policy | Nothing *tells* us: it is the intended behaviour. What it leaves is evidence — a `sold_with_gaps` line per affected sale, naming what was missing that day, and `sales.gaps[]` on the ops endpoint. The exposure is the operator's, is documented in `DEPLOY.md` §8, and is reversible only forward: a sale already made cannot be un-made by completing the notice later. |
| An unverified Resend domain | Every send returns 403, recorded as `email_rejected` in the audit log. Documented in `DEPLOY.md` §2.6 step 2. |

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `test/legal-mail.test.js` — SIREN | criteria 3, 4 | yes |
| — publisher gaps | criteria 4, 5 | yes |
| — the legal notice | criteria 1, 2, 6 | yes |
| — the receipt | criterion 9 | yes |
| — sending | criteria 7, 8, 10 | yes |
| — `/terms` as served | criterion 11 | yes |
| — deploy wiring | criteria 12, 13 | yes |
| `test/routes.test.js` (existing) | criterion 14 | already existed |

## 11. Human validation required

- **The publisher's identity.** `PUBLISHER_SIREN` and `PUBLISHER_DIRECTOR` are
  operator-supplied. Nothing in this work invents them.
- **Selling while the notice is incomplete.** Decided by the operator on
  2026-09-03: yes, payment is validated meanwhile. This is a business and
  legal risk he carries knowingly. The SPEC's job was to make it a choice
  rather than an accident, and to leave a trace of every sale made under it —
  not to overrule it.
- **The address, and it is a legal question.** The operator chose
  "communicated on request" (`PUBLISHER_ADDRESS_ON_REQUEST=true`). Reading the
  LCEN, the exemption from publishing an identity appears to apply to
  *non-professional* publishers only; a registered micro-entreprise selling
  advertising space is a professional publisher. This is flagged, not decided,
  in `DEPLOY.md` §8 — it needs someone who practises law.
- **The Resend account and its API key.** Operator creates both; `DEPLOY.md`
  §2.6 has the steps.
- **Merge and deploy.**

## 12bis. Review round 1 — NO-GO, and what it changed

The review of 2026-09-03 returned NO-GO on three points. All three were
correct and all three are fixed here:

1. **`DECISIONS.md` contradicted the operator's decision.** A row still read
   "an incomplete publisher identity, or mail that cannot be sent, closes the
   checkout only" — written before the decision of 2026-09-03 and never
   amended after it. The register said the opposite of the code. Replaced by
   three rows saying what actually happens, plus the `503` row now marked as
   conditional on `SALES_REQUIRE_PUBLISHER`.
2. **The traceability mechanism was asserted, not proved.** The tests covered
   `salesGaps()` and `salesPreconditions()` — the arithmetic beside the path,
   never the path. `sold_with_gaps` was behind `verifyPayment()` and therefore
   unreachable. The award side-effects moved to `src/sales.js`, and
   `test/sales-trace.test.js` now runs them against the real storage and reads
   the real audit log back.
3. **`sales.gaps` was never exercised over HTTP.** Three tests now boot a real
   server and hit the real endpoint, including the distinction the review
   asked for between current state and the historical trace of a past sale.

## 12ter. Review round 2 — NO-GO, documentary only

The second review confirmed the functional mechanism and returned NO-GO on
two residual documentary contradictions. Both were mine, and both had the same
shape: I added correct new text on 2026-09-03 without removing the older text
that said the opposite. Adding a true sentence does not retire a false one.

1. **The `Legal entity and address` open item still read "required before any
   real sale"**, and still described an incomplete identity as closing the
   checkout. Rewritten to say what supersedes it and why, rather than being
   quietly deleted — the register is append-only in spirit, so the correction
   names the old wording it replaces.
2. **The `mail` block comment in `src/config.js` said the mail settings were
   "required before a seat can be sold".** False by default. Rewritten:
   optional, the seat is awarded without it, the failure is logged, and it
   becomes a condition of selling only under `SALES_REQUIRE_PUBLISHER=true`.

Three more of the same kind were found by sweeping rather than by spot-check,
and fixed in the same pass: the section banner in `src/config.js` ("WHAT IS
MISSING BEFORE A SEAT CAN BE SOLD" and "an incomplete identity closes the
till"), the `publisherBlock()` header comment in `src/pages.js`, and the
`DECISIONS.md` row that stated "the till also closes on unsendable mail"
without its condition.

The method changed too, and that is the durable part: a `grep` over the whole
repository for every blocking formulation, rather than fixing the two lines a
reviewer happened to name.

## 12. Process deviation — recorded, not hidden

`CLAUDE.md` §1 says a SPEC is written and validated *before* implementation.
This one was not: the work was implemented first, at the operator's direct
request and without an existing SPEC, and this document was written afterwards
to bring it back into the workflow. The code, the tests and the measurements
below are real; the ordering was wrong. Recorded here so a reader does not
mistake this SPEC for a validated-then-executed one, and so the deviation is
visible at review rather than discovered later.
