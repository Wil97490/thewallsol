# REPORT — SPEC-017

**SPEC executed:** `docs/specs/SPEC-017-legal-notice-and-mail.md`
**Branch:** `spec/017-legal-notice-and-mail`
**Starting commit:** `cadbeb4034ff7887e70ab2ee7f8223204df07d19`
**Final commit:** see branch head — nothing merged, nothing deployed
**Date:** 2026-09-03, révisé 2026-09-04 après deux NO-GO de revue

Rule: nothing in this report is written that was not run.

---

## 1. Overall result

**Complete**, with one process defect recorded in §9: the SPEC was written
after the implementation, not before.

## 2. Summary

The publisher identity now lives in `config` and `/terms` is rendered from it,
printing only fields that are set — the string `to be completed`, which is on
the live page today, cannot be produced by the new path for any input. An incomplete
identity does **not** stop a sale — the operator decided on 2026-09-03 that
payment is validated meanwhile — but every seat awarded while something is
missing writes `sold_with_gaps` to the audit log with what was missing that
day, and `/api/admin/ops` lists the gaps continuously. The strict behaviour
is built and tested behind `SALES_REQUIRE_PUBLISHER=true`. A deterministic receipt is
sent when a payment is confirmed on chain, closing the case where a buyer paid
and heard nothing. `sendEmail()` gained a timeout, recipient validation and
provider-error capture. Two latent deploy faults were found and fixed while
wiring the variables through (§10).

## 3. Files created

| File | Purpose |
|---|---|
| `test/legal-mail.test.js` | 34 tests covering SIREN arithmetic, identity gaps, the rendered notice, the receipt, sending, `/terms` as served, the deploy wiring, and the sales policy |
| `test/sales-trace.test.js` | 8 tests running the real award path against the real audit log, and hitting `/api/admin/ops` over real HTTP |
| `src/sales.js` | `recordSeatAward()` — extracted from `handleOrderStatus` so the payment path is reachable by a test |
| `docs/specs/SPEC-017-legal-notice-and-mail.md` | this work's SPEC |
| `docs/reports/REPORT-017-legal-notice-and-mail.md` | this report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `src/config.js` | `publisher` + `mail` blocks; `sirenLooksValid`, `publisherGaps`, `publisherComplete`, `mailConfigured`, `salesPreconditions`, `salesOpen` | +122 |
| `src/notify.js` | hardened `sendEmail`; `receiptText`, `sendReceipt`, `mailStatus` | +169 −24 |
| `src/pages.js` | `publisherBlock()` | +73 |
| `src/http.js` | `serveHtml()` | +33 |
| `src/server.js` | `/terms` rendered; checkout precondition; receipt on payment; ops fields | +53 −5 |
| `public/terms.html` | publisher block → `<!--PUBLISHER_IDENTITY-->` | +6 −22 |
| `scripts/deploy.sh` | `^\|^` delimiter; conditional secret | +34 −2 |
| `deploy.env` | publisher + mail settings, no secrets | +30 |
| `.env.example` | new variables documented | +23 |
| `DEPLOY.md` | §2.6 Resend (7 steps), §8 rewritten | +133 −14 |
| `package.json` | `0.54.0` → `0.55.0` | +1 −1 |

Total, excluding the two documents above: **11 files, +642 −58**.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm run check` | pass | `syntax ok` |
| `npm test` | pass | **471 tests / 471 pass / 0 fail / 0 skipped** |
| `./scripts/audit.sh` | pass | secrets hygiene all `ok`; 3 files carry TODO/FIXME, unchanged from before |
| `./scripts/drift.sh` | pass | `no drift.` |

Baseline for comparison: `docs/STATE.md` records **429/429** at `74647b42`.
429 + 34 + 8 new = 471. The arithmetic matches, which is the check that the new
file was actually collected and that nothing existing was lost.

Measured twice on different machines: once on the operator's working copy,
once on a clean `git clone` of `master` at `cadbeb4` with the patch applied,
in a container that had never seen this code. Same numbers both times.

**Were the new tests seen failing first?** **Ten were, thirty-two were not.**

- `"the shipped file carries no placeholder text anywhere"` failed on its
  first run and caught a real defect — the replacement HTML comment I had
  written into `public/terms.html` still contained the literal string
  `to be completed`, which ships to the browser. Reworded; the test then
  passed. This is the test doing its job on live code, not on a contrivance.
- `"les mentions légales nomment un éditeur"` (pre-existing, `routes.test.js`)
  failed after the first version of the change, because `PUBLISHER_NAME` had
  no default and the block rendered without a publisher. Fixed at the cause:
  `name` is the one identity field with a default, since "The Wall" is already
  established on every page. See `src/config.js`.
- The eight tests in `test/sales-trace.test.js` were written against the
  review's NO-GO, before `src/sales.js` existed. They could not pass at the
  time they were written, because the code they exercise was still buried
  behind `verifyPayment()`. That is the honest version of "seen failing
  first", and it is the reason this round exists.
- The remaining thirty-two were written alongside the implementation and
  passed on first run. They are regression guards, and this report does not
  claim more for them than that.

## 6. Audit

`./scripts/audit.sh` — secrets hygiene entirely `ok`: `.env`, `.env.local`,
`.scout.env` untracked and gitignored, `node_modules/` and `data/` gitignored.
`TAKEOVER_MULTIPLIER` still absent (SPEC-002). The new `PUBLISHER_*` and
`MAIL_*` entries appear in the `deploy.env` listing with empty values for
`PUBLISHER_SIREN`, `PUBLISHER_DIRECTOR`, `PUBLISHER_VAT` and
`PUBLISHER_ADDRESS` — which is the intended state: unset, unprinted, and
**sellable anyway**, with each such sale marked. `RESEND_API_KEY` appears in
no tracked file, and a test asserts it.

Difference from the previous audit: the new variables, nothing else.

## 7. Drift check

`./scripts/drift.sh` — `no drift.` All invariants in the `CLAUDE.md` table
still match `deploy.env` (24 seats, $15 floor, $100,000 ceiling, 5-minute
hold, 30-minute protection). All 🟡 PROPOSED models still correctly
unimplemented. Continuity documents all present.

## 8. Invariants added

- **An unestablished field is never printed.** Frozen by the tests asserting
  that `publisherBlock()` emits no placeholder, no empty label and no `N/A`,
  for every combination of set and unset fields.
- **A cause is named only when it is the cause.** The closed-till sentence on
  `/terms` says "the identity above is incomplete" only when the identity is
  what closed it — mail being unconfigured produces the neutral wording. This
  is the site's own rule applied to the site's own status message.
- **A refusal that is about us does not read as a verdict on a token.** When
  the till is closed at all, the `503` fires before the chain is read and says
  so. Now asserted over real HTTP, not by reading the source.
- **The past is not rewritten by the present.** `sold_with_gaps` stores a copy
  of the gap list, not a reference to config; completing the identity later
  leaves the old trace intact. Frozen by a test that does exactly that.
- **No secret in a versioned file.** Frozen by a test on `deploy.env`.

Deliberately **not** frozen: what a compliant legal notice must contain. That
is a legal question, not an invariant, and §11 escalates it rather than
inventing a threshold for it.

## 9. Gaps

Review round 2 (2026-09-04) returned **NO-GO** on two residual documentary
contradictions, both mine: on 2026-09-03 I added correct new text without
removing the older text that said the opposite. `DECISIONS.md` still carried
"Legal entity and address, required before any real sale", and `src/config.js`
still described the mail settings as "required before a seat can be sold" —
false by default. Fixed, along with three more of the same kind found by
sweeping the repository rather than by spot-check. Detail in SPEC §12ter.

Review round 1 (2026-09-03) returned **NO-GO** on three points, all correct.
What each was and what closed it is in SPEC §12bis. In short: the decision
register contradicted the operator's own decision; the `sold_with_gaps`
mechanism was asserted rather than proved; and `sales.gaps` had never been
exercised over HTTP. The first was a documentation error of mine, the other
two were a real hole in the evidence — the tests measured the arithmetic
beside the path and I reported that as if it covered the path.


All twenty-two acceptance criteria in SPEC-017 §7 are met and tested.

The gap is procedural, not functional: **the SPEC was written after the
implementation**, contrary to `CLAUDE.md` §1. The work was done at the
operator's direct request with no SPEC in existence, and reconstructed into
the workflow afterwards. The code and the measurements are real; the ordering
was wrong, and a reviewer should read this SPEC as a description of what was
built rather than as a brief that was validated first.

## 10. Risks

Two latent faults were found while wiring the variables, both fixed here, both
now guarded by a test:

1. **A comma in a postal address would have corrupted the deploy.**
   `gcloud run deploy --set-env-vars` splits on commas. `PUBLISHER_ADDRESS`
   with a real address ("12 rue X, 97420 Le Port") would have split the list
   mid-address and the following variable would have silently become
   `97420 Le Port`. Now passed with the `^|^` delimiter.
2. **Referencing a missing secret would have taken the site down.** A Cloud
   Run revision that names a non-existent secret fails to start. `resend-api-key`
   does not exist yet, so adding it unconditionally to `--set-secrets` would
   have broken the next deploy entirely — for an email. Now looked up first,
   with a printed warning when absent.

What remains fragile: an unverified Resend sending domain returns 403 on every
send. That surfaces in the audit log as `email_rejected` with the provider's
own message, and in `/api/admin/ops` as `mail.configured` true while receipts
never arrive. `DEPLOY.md` §2.6 step 2 says not to create the key before the
domain reads `Verified`, which is the cheap way to avoid it entirely.

## 11. Requires human validation

Nothing in this list was done by Claude.

- **`PUBLISHER_SIREN` and `PUBLISHER_DIRECTOR`.** Operator-supplied. Not
  invented, not defaulted.
- **Selling while the notice is incomplete.** The operator decided on
  2026-09-03 that payment is validated meanwhile, and the default was changed
  to match. Recorded rather than argued: `sold_with_gaps` names what was
  missing at the moment of each such sale. Reverting is one variable.
- **The address, as a legal question.** The operator chose "communicated on
  request". Reading the LCEN, that exemption appears to cover *non-professional*
  publishers, and a registered micro-entreprise selling advertising space is
  not one. Flagged in `DEPLOY.md` §8 with the two standard ways to avoid
  publishing a home address. This needs a lawyer, not a session.
- **The Resend account and API key.** Account creation and credential handling
  are the operator's, per `CLAUDE.md`. Steps in `DEPLOY.md` §2.6.
- **Merge, and deploy.**

## 12. Still manual

- Setting the identity values, once decided.
- Verifying the sending domain at the registrar.
- `docs/DECISIONS.md` is updated in this branch by hand — six rows appended
  to Method, and the "Legal entity and address" open item amended. Nothing
  generates it.
- `docs/STATE.md` is **deliberately not touched here.** It records what is on
  `master` and in production; this branch is neither. Refreshing it is its own
  pass after merge, as SPEC-013A and SPEC-016 both were.

## 13. Recommended next step

Validate or amend SPEC-017 before merging — it is the artefact the workflow
requires and the one it did not have. Everything else in this branch has been
measured; that is the only thing that has not been reviewed.
