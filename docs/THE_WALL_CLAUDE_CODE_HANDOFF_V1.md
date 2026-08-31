# THE WALL — CLAUDE CODE HANDOFF V1

**Purpose:** single operational handoff for the next Claude Code session.
**Important:** The existing technical base was built under **Claude Code + Google Cloud Console**. Do not rebuild the foundation blindly. Inspect the existing repository and deployed Google Cloud resources first.

---

# 1. WORKING RULE

## Source of truth

The current Master Context and existing codebase are the sources of truth.

**Do not restart from zero.**
**Do not redesign already validated mechanics unless a contradiction or implementation blocker is found.**

Before modifying anything:

1. Inspect the repository.
2. Identify current branch/commit and existing architecture.
3. Inspect Google Cloud resources currently used by the project.
4. Identify deployed services, databases, auth configuration, secrets/configuration and environments.
5. Compare implementation against the validated product rules below.
6. Produce a short gap report before making destructive or architectural changes.

## Existing foundation

- Development: Claude Code
- Cloud platform: Google Cloud Console
- Existing application/backend infrastructure: **inspect first**
- Existing authentication/database/deployment: **inspect first**
- Do not assume the exact framework, services or schema until verified from the repository and GCP.

---

# 2. VALIDATED PRODUCT — DO NOT REINVENT

## The Wall

- **24 permanent positions**
- A project occupies a position.
- The current position price is the amount relevant to a challenge.
- Takeover minimum:
  **max(previous price × 1.10, previous price + $5)**
- Existing observed ceiling:
  **$100,000**
- New position price becomes the price paid for that position under the existing V4.54 model.
- The Wall should remain the primary product surface.

The exact already-implemented V4.54 contract must be inspected in code before changing it.

---

# 3. ECONOMIC MODEL V4.54 / CONSOLIDATED

For every **$100 of net locked revenue**:

| Destination | % |
|---|---:|
| Treasury / Product | 30% |
| Developers / Core Team | 15% |
| `$WALL` Ecosystem / Flywheel | 15% |
| Wall Rewards | 15% |
| Ecosystem / Growth | 15% |
| Protocol Reserve | 10% |
| Previous holder | 0% |

## Flywheel

The 15% Ecosystem/Flywheel allocation is a pool, not an automatic buyback.

Buyback gate:
- only when reserves cover at least 6 months of operating expenses;
- required liquidity/reserve conditions must remain satisfied;
- periodic buyback gate must be satisfied.

If a buyback occurs:
- maximum 50% of the available Flywheel Pool may be used;
- purchased `$WALL`: 70% burn / 30% Rewards Vault.

At maximum buyback:
- 5.25% of net locked revenue → burn
- 2.25% → Rewards Vault
- 7.50% remains in Flywheel Pool
- plus 15% independent Wall Rewards
- maximum potential Rewards Vault inflow = **17.25%**
- maximum burn = **5.25%**

Do not make buybacks a guaranteed constant action.

---

# 4. WALL POINTS VS COMMUNITY POINTS

These are deliberately separate.

## Wall Points

Economic/product participation:
- linked to actual Wall activity;
- feed the Rewards Vault according to the existing V4.54 rewards model;
- existing rewards logic must be preserved and inspected before modification.

## Community Points

Community contribution:
- X Quests
- referrals
- predictions
- art/community participation

Community Points do **not** automatically mint, transfer or promise `$WALL`.

There is **no public airdrop promise**.

---

# 5. COMMUNITY POINTS V1 — VALIDATED

## X Quests

Maximum:
**300 Community Points / Season**

Only meaningful/qualifying quests.

Do not create unlimited rewards for raw likes, follows, replies or spam.

## Referrals

- Signup alone = **0**
- Qualified activation = **+50 CP**
- First meaningful Wall action = **+25 CP**
- Maximum **10 qualifying referrals / Season**
- Maximum referral contribution = **750 CP / Season**
- Use pending status + confirmation window.
- Anti-Sybil controls required.

## Predictions

- Correct official prediction = **+100 CP**
- Incorrect = 0
- Maximum 5 scored predictions / Season
- Maximum = **500 CP / Season**
- Locked at cutoff
- Objective resolution preferred
- No `$WALL` wagering

## Art Challenge

Community Points:
- participation = 100
- finalist = 250
- 3rd = 400
- 2nd = 600
- 1st = 800

Art winner may separately receive `$WALL` and Gallery exposure if that budget is approved.

---

# 6. X IDENTITY / REWARDS INFRASTRUCTURE

Recommended architecture:

The Wall Account
→ X OAuth 2.0 + PKCE
→ X Identity
→ Community Points Ledger
→ Quest Engine
→ Verification
→ Rewards

## Identity

Recommended:

### users
- id
- created_at
- status
- primary_x_identity_id
- referral_code
- risk_status

### x_identities
- id
- user_id
- x_user_id
- username_snapshot
- display_name_snapshot
- avatar_url_snapshot
- connected_at
- last_verified_at
- revoked_at

Constraint:
**one active X user ID → one The Wall account**

Use stable X user ID, not username, as identity key.

## Tokens

- server-side only
- encrypted at rest
- minimal scopes
- revoke/disconnect supported
- use refresh flow only where needed

## Point ledger

Prefer append-only events:

### point_events
- id
- user_id
- season_id
- source_type
- source_id
- points
- status
- evidence_ref
- created_at
- verified_at
- reversal_of
- metadata_hash

Do not make a mutable balance the sole source of truth.

---

# 7. USER JOURNEY V1

Primary path:

**See Wall → understand competition → act → visible result**

### Landing

Public Wall visible without account.

Primary CTA:
**Enter The Wall**

Secondary:
**How it works**

### Authentication

**Continue with X**

After success:

> You're in.

Then:
- Community Points
- Wall Points
- current Season
- Explore The Wall

### Discovery

Explain only:
- Position
- Price
- Challenge

Contextually, not through a forced long tutorial.

### First action

Can be:
- explore a project
- Community Quest
- prediction
- share a position
- inspect leaderboard

### First economic action

Confirmation must show:
- position
- current price
- required payment
- resulting position
- applicable fees/allocation
- confirmation

### After acquisition

> You're on The Wall.

Then:
- position
- project
- price
- timestamp
- Wall Points if applicable
- next challenge/defense state
- Share your position

---

# 8. NAVIGATION V1

Primary:
**The Wall | Community | Leaderboard | Gallery | How it works**

Authenticated:
**Profile | My Position(s) | Points | Referrals | Settings**

The Wall remains the primary surface.

---

# 9. GTM STATUS

Prospecting is **ON PAUSE / ALREADY STARTED**.

Do not rebuild the prospect list.

Historical Founding 24 / prospect tracker is the source of truth.

Existing work included:
- OnRe
- Hastra
- Hylo
- Exponent
- Play.fun
- Doppler
- Axiom
- Neutral Trade
- Raiku
- Mayan
- Fitted
- Captcha
- TryCallShot
- Umbra
- Flash Trade
- Agentic RTS
- Pload
- Horse Ski Jump
- Capybara Simulator
- Skaterus

Some outreach emails have already started.

Do not change messaging strategy while live replies are being collected unless there is evidence that it needs changing.

---

# 10. WHAT CLAUDE SHOULD DO NEXT

## Phase A — Audit, not rebuild

Return a concise report:

### Repository
- architecture
- frontend
- backend
- database
- auth
- deployment
- tests
- environment/config
- current branch/commit

### Google Cloud
- active project/resources
- Cloud Run/services if present
- database
- storage
- secrets
- domains
- IAM/service accounts relevant to app
- current deployment state

### Product implementation
Mark each:
- implemented
- partially implemented
- missing
- inconsistent with Master

### Security
Check:
- OAuth state/PKCE
- secrets exposure
- auth/session handling
- database access
- admin permissions
- replay protection
- rate limits
- webhook/API verification

## Phase B — Fix highest-risk gaps

Priority order:

1. Security/auth/data integrity
2. Wall core rules
3. Payment/economic accounting
4. Position/challenge correctness
5. Point ledger integrity
6. X verification
7. UX polish
8. Analytics/observability

Do not polish UI while core accounting is uncertain.

## Phase C — Tests

Build/execute deterministic tests for:

- challenge minimum
- +10% vs +$5 rule
- $100k ceiling
- 24-position integrity
- payment allocation totals = 100%
- previous holder = 0%
- buyback gate
- 50% flywheel maximum
- 70/30 burn/rewards split
- Wall Points accounting
- Community Points caps
- referral confirmation
- prediction cutoff
- X identity uniqueness
- duplicate evidence
- point reversal
- season boundaries

## Phase D — Report

Return:

1. What already works.
2. What is missing.
3. What was changed.
4. Tests passed/failed.
5. Deployment status.
6. Remaining blockers.
7. Exact next recommended step.

---

# 11. DO NOT DO

- Do not rebuild the application from scratch.
- Do not replace the existing GCP architecture without evidence.
- Do not invent a new tokenomics model.
- Do not reintroduce a reward to the previous holder.
- Do not promise an airdrop.
- Do not merge Wall Points and Community Points.
- Do not turn Community Points into `$WALL` automatically.
- Do not create unlimited X farming.
- Do not add betting/wagering to Predictions V1.
- Do not add unnecessary token utility merely for narrative.
- Do not overwrite historical decisions in the Master Context.
- Do not create a second competing prospect list.

---

# 12. DEFINITION OF DONE FOR THIS SESSION

Claude's first useful deliverable is **not another concept document**.

It is:

> **A verified gap analysis between the existing Claude Code + Google Cloud implementation and the validated V4.54 product specification, followed by the smallest safe set of fixes.**

After that, produce a clean implementation/status report for the next session.
