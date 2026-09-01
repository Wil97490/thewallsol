# STATE — where the project actually is

Operational snapshot. Facts only, each one measured. Update at the end of a
session; do not let it drift into aspiration.

**Last updated:** 2026-09-01 · base commit `1da86e891` · branch `master`

---

## Code

| | |
|---|---|
| Version | `0.54.0` (V4.54) |
| Test suite | **413 tests, 413 pass, 0 fail** (measured, `npm test` on `origin/master` at `1da86e891`) |
| Runtime | Node ≥ 20, ESM, no mandatory dependency |
| Storage | Firestore in production, memory/file locally |

## Deployment

| | |
|---|---|
| GCP project | `project-3104b4c3-08fc-4468-848` |
| Cloud Run service | `wall`, region `europe-west1` |
| Service account | `wall-agents@…iam.gserviceaccount.com` |
| Public URL | https://thewallsol.com (Firebase Hosting in front) |
| Secrets | Secret Manager: `gate-token`, `admin-token`, `anthropic-api-key`, `solana-rpc-url`, `safe-browsing-key` |
| GCP credits | expire **2026-11-24** |
| Live revision | `wall-00115-ref`, **100% of traffic** (measured `gcloud run services describe wall`, 2026-09-01) |

Deployment path is `./scripts/deploy.sh` only: tests → build → `--no-traffic
--tag pre` → preflight on the candidate → traffic. There is no `--force`.

## Recent integrations — PR #2 through #14 (merged into `master`)

| PR | Title | Branch | Merged |
|---|---|---|---|
| #2 | fix: correct locked token percentage disclosure | `spec/002-token-percentage-correction` | 2026-08-31 |
| #4 | feat: complete THE WALL visual direction | `spec/003-visual-refactor-final` | 2026-09-01 |
| #5 | style: stage the top-three podium treatment | `spec/004-sitewide-visual-cohesion` | 2026-09-01 |
| #7 | style: apply the visual layer to every public page | `spec/005-public-pages-visual-cohesion` | 2026-09-01 |
| #8 | style: refine home page composition and hierarchy | `spec/006-home-content-hierarchy` | 2026-09-01 |
| #9 | style: stage the wall as a physical surface | `spec/007-wall-surface` | 2026-09-01 |
| #10 | fix: remove suspended Telegram and X channels from public contact paths | `spec/008-remove-suspended-social-links` | 2026-09-01 |
| #11 | style: refine public evidence surfaces | `spec/009-public-evidence-cohesion-v2` | 2026-09-01 |
| #12 | feat: integrate final monolith asset pack | `spec/010-monolith-asset-integration` | 2026-09-01 |
| #13 | perf: optimize WebP MIME and cache headers | `spec/011-hero-asset-cache` | 2026-09-01 |
| #14 | style: micro-interaction polish (hero, seats, panel, podium) | `spec/012-micro-interactions-final` | 2026-09-01 |

What each carried, in plain terms:

- **Token percentage correction (#2):** the public disclosure now reads the
  canonical **9.35%** (was 9.39%), matching the Product decision below.
- **Public visual cohesion (#4, #5, #7, #8, #9, #11):** the approved visual
  direction (podium treatment for the top three seats, consistent styling
  across every public page, home content hierarchy, the wall staged as a
  physical surface, public evidence pages) applied incrementally, each pass
  audited before merge. No pricing, takeover, or screening logic touched by
  any of these.
- **Suspended social channels removed (#10):** Telegram and X links removed
  from every public page; `contact@thewallsol.com` is the sole public
  contact channel (see Decisions).
- **Final monolith asset (#12):** the placeholder SVG hero monolith is
  replaced by the production photorealistic WebP pair
  (`monolith-dark.webp` / `monolith-light.webp`, 767×1024, ~307 KB
  combined). Both theme variants still load on every visit; no lazy-loading
  by active theme has been built (flagged, not yet specced).
- **WebP MIME/cache fix (#13):** `.webp` was missing from the static file
  server's MIME table and its 1-year-immutable cache list — it was served
  as `application/octet-stream` with a 1-day cache. Now served as
  `image/webp`, cached `public, max-age=31536000, immutable`, matching the
  other media types.
- **Micro-interaction polish (#14):** hover/active/focus-visible feedback
  on the hero CTAs, podium, seat grid and panel CTA; `prefers-reduced-motion`
  neutralizes the added transforms. Visual only, no business logic touched.

Two of these merges have no paired `SPEC-0NN`/`REPORT-0NN` document on
`master`: **PR #4** (`docs/specs/SPEC-003-visual-refactor.md` exists but
without a `-final` counterpart, and there is no `REPORT-003`) and **PR #13**
(no `SPEC-011`/`REPORT-011` at all — it was implemented directly from an
audit finding). Not corrected here — out of this SPEC's scope; recorded so
a future session does not go looking for a document that was never written.

## Known blockers

**The Anthropic API credit exhaustion is resolved.**
Original blocker measured 2026-08-30: `HTTP 400 — "Your credit balance is
too low to access the Anthropic API."` The operator corrected billing; the
deploy that produced the currently-live revision (`wall-00115-ref`,
2026-09-01T12:08:01Z) ran the real `clean token sells` preflight probe
against a real Anthropic call and got **200** (previously 409) — recorded
in that deploy's own log. Cloud Run confirms 100% of traffic is on that
revision now (measured 2026-09-01).

Caveat, so this is not overstated: the Firestore `agent_audit` log's most
recent `moderator: unavailable` entry (with the same credit-exhausted
error) is timestamped `2026-09-01T11:54:18Z` — **before** the resolving
deploy at `12:08:01Z`, from an earlier redeploy attempt. No real customer
submission has reached the moderator since (0 seats have been listed for
sale since the fix), so there is no *post-fix* successful moderator call
logged yet — only the preflight's synthetic probe. Treat as resolved on
measured evidence, not as independently reconfirmed by a real listing.

The previously-recorded 🟡 "candidate revision on `pre`, never promoted"
blocker no longer applies — traffic is 100% on the latest revision (see
above).

## Commercial state

- Seats sold: **1 of 24** (seat №10 — measured live via `/api/wall`,
  2026-09-01). `ticker: PUMP`, `priceUsd: 1`, since `2026-08-25T17:50:46Z`
  — **predates this engagement's SPEC-002 through SPEC-012 work.** The $1
  price was flagged early in this engagement as needing an operator
  decision (leave it / correct it in the database / some other resolution)
  and **remains undecided.** Not touched here — out of scope for a
  documentation-only pass, and doing so would be a data change this SPEC
  explicitly excludes.
- Refusals published: `/refused/apetacio`, `/refused/pinkotc`,
  `/refused/pisstacio` (measured live via `/api/refused`, 2026-09-01 — one
  more than previously recorded here).
- Prospecting: paused, list is historical, **do not rebuild it**.

## Not built, on purpose

X OAuth · X Quests · Community Points · Wall Points · Referrals ·
Predictions · Art Challenge · the V2 revenue split · the Flywheel.

All 🟡 PROPOSED in the Master Context. None of them has a SPEC yet.
