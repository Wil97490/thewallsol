# STATE — where the project actually is

Operational snapshot. Facts only, each one measured. Update at the end of a
session; do not let it drift into aspiration.

**Last updated:** 2026-08-31 · base commit `5f5ed4c` · branch `spec/001-workflow-automation`

---

## Code

| | |
|---|---|
| Version | `0.54.0` (V4.54) |
| Test suite | **389 tests, 389 pass, 0 fail** (measured, `npm test`) |
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

Deployment path is `./scripts/deploy.sh` only: tests → build → `--no-traffic
--tag pre` → preflight on the candidate → traffic. There is no `--force`.

## Known blockers

🔴 **The Anthropic API credit balance is exhausted.**
Measured 2026-08-30 against `anthropic-api-key`:
`HTTP 400 — "Your credit balance is too low to access the Anthropic API."`

Consequence: the moderation agent cannot review advertisement text, so every
contract returns `allow:false, pending:true` — *"We couldn't review the text
automatically; a human will."* **No seat can be sold automatically.**
The on-chain screening is unaffected; refusals still publish normally.

This also blocks `scripts/deploy.sh`: four preflight probes that require a
clean contract to be sellable return 409 instead of 200. Production fails the
same four probes, so the candidate is not a regression — but the barrier is
correctly refusing to open the wall.

🟡 A candidate revision is deployed with tag `pre` and no traffic. It carries
the `/checks/holder-concentration` amendment. It has never been promoted.

## Commercial state

- Seats sold: **0** of 24.
- Refusals published: `/refused/apetacio`, `/refused/pinkotc`.
- Prospecting: paused, list is historical, **do not rebuild it**.

## Not built, on purpose

X OAuth · X Quests · Community Points · Wall Points · Referrals ·
Predictions · Art Challenge · the V2 revenue split · the Flywheel.

All 🟡 PROPOSED in the Master Context. None of them has a SPEC yet.
