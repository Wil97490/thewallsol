# STATE — where the project actually is

Operational snapshot. Facts only, each one measured. Update at the end of a
session; do not let it drift into aspiration.

**Last updated:** 2026-09-02 · base commit `74647b42d5b3e2f1e7308ad3bc99cb358d9f4beb` · branch `master`

---

## Code

| | |
|---|---|
| Version | `0.54.0` (V4.54) |
| Test suite | **429 tests, 429 pass, 0 fail** (measured, `npm test` on `origin/master` at `74647b42d5b3e2f1e7308ad3bc99cb358d9f4beb`) |
| Runtime | Node ≥ 20, ESM, no mandatory runtime dependency (`firebase-tools` is a `devDependency`, deploy-time only — see below) |
| Storage | Firestore in production, memory/file locally |

## Deployment

| | |
|---|---|
| GCP project | `project-3104b4c3-08fc-4468-848` |
| Cloud Run service | `wall`, region `europe-west1` |
| Firebase Hosting site | `thewallsol` (same GCP project) |
| Service account | `wall-agents@…iam.gserviceaccount.com` |
| Public URL | https://thewallsol.com (Firebase Hosting in front of Cloud Run) |
| Secrets | Secret Manager: `gate-token`, `admin-token`, `anthropic-api-key`, `solana-rpc-url`, `safe-browsing-key` |
| GCP credits | expire **2026-11-24** |
| Live revision | `wall-00123-dag`, **100% of traffic** (measured `gcloud run services describe wall`, 2026-09-02) |

Deployment path is `./scripts/deploy.sh` only: tests → Cloud Run build →
`--no-traffic --tag pre` → preflight on the candidate → Cloud Run traffic
switch → **Firebase Hosting deploy** (`firebase deploy --only hosting`,
added by SPEC-015 — see Decisions). There is no `--force`. A one-time
`firebase login` (or an equivalent non-interactive credential) is required
on whichever machine runs this, per `DEPLOY.md`.

## Recent integrations — PR #2 through #20 (merged into `master`)

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
| #15 | docs: refresh STATE and DECISIONS after PR #2-14 | `spec/013a-state-decisions-refresh` | 2026-09-02 |
| #16 | perf: hero theme-aware loading (one WebP per visit, not two) | `spec/013b-hero-theme-aware-loading` | 2026-09-02 |
| #18 | perf: conditional revalidation (ETag + Last-Modified) for CSS/JS | `spec/014-conditional-static-assets-cache` | 2026-09-02 |
| #19 | fix: enable Firebase edge revalidation for static assets | `spec/014a-firebase-conditional-cache-edge` | 2026-09-02 |
| #20 | fix: publish firebase.json to Firebase Hosting during deploy | `spec/015-firebase-hosting-deploy` | 2026-09-02 |

**PR #17** (`spec/013c-state-decisions-refresh-v2`, "docs: refresh STATE and
DECISIONS after PR #15-16") is **still OPEN, never merged** — its own scope
(PR #15-16 only) has since been overtaken by PR #18-20, and this SPEC-016
refresh supersedes it. Not closed, not merged, not edited by this pass —
recorded here so a future session does not mistake it for live work.

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
  combined). At the time of this PR, both theme variants loaded on every
  visit — **corrected by #16, below; this is no longer current
  behaviour.**
- **WebP MIME/cache fix (#13):** `.webp` was missing from the static file
  server's MIME table and its 1-year-immutable cache list — it was served
  as `application/octet-stream` with a 1-day cache. Now served as
  `image/webp`, cached `public, max-age=31536000, immutable`, matching the
  other media types.
- **Micro-interaction polish (#14):** hover/active/focus-visible feedback
  on the hero CTAs, podium, seat grid and panel CTA; `prefers-reduced-motion`
  neutralizes the added transforms. Visual only, no business logic touched.
- **STATE/DECISIONS refresh (#15):** the previous pass of this same
  documentation-only exercise, covering PR #2-14.
- **Hero theme-aware loading (#16):** the two `<img>` hero elements
  replaced by one CSS `background-image`-driven element, gated by the
  same 3-state theme selector already used for the `display` toggle. The
  browser now fetches only the visible variant. **Verified twice, live in
  a real browser against production:** once immediately after PR #16's
  own deploy, and again in this session after the final PR #20 deploy —
  both times, a fresh navigation with `prefers-color-scheme: dark` loaded
  only `monolith-dark.webp`, and with `prefers-color-scheme: light`,
  only `monolith-light.webp`.
- **Conditional static-asset caching (#18):** `.css`/`.js`/`.mjs`
  responses now carry a content-hash `ETag` and `mtime`-based
  `Last-Modified`, computed once per file and cached in memory.
  `Cache-Control: no-cache` is unchanged — the validator makes
  revalidation cheap, it does not weaken the freshness guarantee. HTML
  and out-of-scope assets (svg/png/jpg/mp4/webm/webp) are unaffected.
- **Firebase edge revalidation fix, part 1 (#19):** discovered — by a
  direct production comparison, not inference — that Firebase Hosting
  does not forward a client's `If-None-Match` to the Cloud Run origin by
  default: the origin correctly returned `304`, the public domain always
  returned `200`. `firebase.json` gained a Hosting `headers` rule
  (`Cache-Control: public, max-age=0, must-revalidate` for
  `**/*.@(css|js|mjs)`) intended to make Firebase's own edge revalidate.
- **Firebase Hosting deploy, part 2 (#20):** PR #19's rule alone was not
  enough — `scripts/deploy.sh` never ran `firebase deploy`, so
  `firebase.json` was never actually published to Firebase Hosting by
  anything in this repository. Added a `firebase deploy --only hosting`
  step after the existing Cloud Run traffic switch, and pinned
  `firebase-tools` as a `devDependency` (`^15.28.2` — tested first,
  chosen because it carries no critical/high `npm audit` finding, unlike
  `^13.x`; never installed in the Cloud Run image, `Dockerfile` runs
  `npm install --omit=dev`).

**Firebase Hosting conditional-cache — now confirmed working in
production**, measured directly against `https://thewallsol.com/css/app.css`
after the PR #20 deploy (master `74647b42d5b3e2f1e7308ad3bc99cb358d9f4beb`,
revision `wall-00123-dag`), 2026-09-02:

| Request | Result |
|---|---|
| Unconditional | `200`, `ETag` and `Last-Modified` present, `Cache-Control: public, max-age=0, must-revalidate` |
| `If-None-Match` with the real `ETag` | `304`, empty body, same `ETag` |
| `If-None-Match` with a wrong `ETag` | `200`, full body |
| `If-Modified-Since`, valid (after `Last-Modified`) | `304` |
| `If-Modified-Since`, old (before `Last-Modified`) | `200` |

This closes the gap PR #18/#19 could not close alone — SPEC-014 →
SPEC-014A → SPEC-015 is complete and verified end to end, origin and
edge both.

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
deploy that produced revision `wall-00115-ref` (2026-09-01T12:08:01Z) ran
the real `clean token sells` preflight probe against a real Anthropic call
and got **200** (previously 409) — recorded in that deploy's own log.
Every deploy since (through PR #16, #18, #19, #20 — revisions
`wall-00117-wew` through the current `wall-00123-dag`) has re-run the same
preflight probe as part of `scripts/deploy.sh`'s release gate and gone
green each time; this is not a one-off result, it has held across five
subsequent deploys.

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
  reconfirmed 2026-09-02, unchanged since first measured 2026-09-01).
  `ticker: PUMP`, `priceUsd: 1`, since `2026-08-25T17:50:46Z` — predates
  this engagement's SPEC-002 through SPEC-015 work entirely. The $1 price
  was flagged early in this engagement as needing an operator decision
  (leave it / correct it in the database / some other resolution) and
  **remains undecided.** Not touched here — out of scope for a
  documentation-only pass, and doing so would be a data change this SPEC
  explicitly excludes.
- Refusals published: `/refused/apetacio`, `/refused/pinkotc`,
  `/refused/pisstacio` — three, measured live via `/api/refused`,
  reconfirmed 2026-09-02, unchanged since first measured 2026-09-01.
- Prospecting: paused, list is historical, **do not rebuild it**.

## Not built, on purpose

X OAuth · X Quests · Community Points · Wall Points · Referrals ·
Predictions · Art Challenge · the V2 revenue split · the Flywheel.

All 🟡 PROPOSED in the Master Context. None of them has a SPEC yet.
