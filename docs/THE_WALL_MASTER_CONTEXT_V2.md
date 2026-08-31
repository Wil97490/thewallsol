# THE WALL — MASTER CONTEXT
## Source of Truth — V2 / Project Continuity

**Document status:** Living master document — v0.2 continuity update  
**Created:** 2026-08-31  
**Purpose:** Preserve the project's history, validated decisions, open questions, implementation context and strategic direction so work can resume without losing prior decisions.

---

# 0. HOW TO USE THIS DOCUMENT

This document is the source of truth for The Wall.

### Status labels
- 🟢 **VALIDATED** — decided; do not reopen unless explicitly requested.
- 🟡 **PROPOSED** — current recommendation; still subject to validation.
- 🔴 **TO CORRECT** — known inconsistency, bug or issue.
- 🔵 **FUTURE** — interesting idea, not part of the immediate implementation.

### Continuity rules
1. Never present a previously validated decision as a new idea.
2. Never reopen a validated decision without an explicit request.
3. Distinguish clearly between what exists in V4.54, what is planned for V2, and what is merely an idea.
4. Never turn an economic hypothesis into an immutable implementation rule before final validation.
5. Preserve historical context when handing work to Claude or another developer.
6. When uncertain, flag the uncertainty instead of inventing a fact.

---

# 1. PROJECT FOUNDATIONS

## 1.1 The Wall

The Wall is a limited on-chain visibility market built around **24 positions**.

Core concept:

> **24 positions. One Wall. Compete for your place.**

The Wall is not intended to be perceived as a conventional advertising banner marketplace. Its differentiator is the combination of:

- limited inventory;
- public positions;
- market-discovered value;
- competition;
- challenges/takeovers;
- historical status;
- on-chain transparency.

Current positioning direction:

> **The on-chain visibility market for projects that want to be seen — and stay seen.**

Core product philosophy:

> **Visibility + Competition + Status**

---

# 2. CURRENT PRODUCT / V4.54

## 2.1 Existing product

The project has an existing V4.54 implementation.

🟢 **ECONOMIC BASELINE ALREADY SIMULATED**

A simulation using the real V4.54 parameters was already performed during the earlier project work. This simulation is a baseline and must NOT be treated as a new task or repeated from scratch unless a changed parameter requires a delta analysis.

Important current mechanics identified during review:

- 24 permanent positions.
- A new buyer can name a price above the applicable floor.
- For a takeover/challenge, the minimum price is based on the previous price plus the configured increment rule.
- Current challenge logic observed: the required price is the greater of **previous price + 10%** and **previous price + $5**.
- Current ceiling observed: **$100,000**.
- Positions have a protection period before becoming challengeable.
- The price paid by the new holder becomes the new price of the position.
- Position history is an important existing/product direction and should be strengthened in V2.

### Important principle
Do not casually replace the existing pricing/competition mechanism. V2 should improve presentation, transparency and economics without breaking the core competitive mechanic.

---

# 3. V2 — VALIDATED DESIGN DIRECTION

## 3.1 Status

🟢 **VALIDATED**

The visual direction for V2 has already been worked through and approved.

Do NOT recreate the design system from scratch unless explicitly requested.

Already validated/discussed:

- overall V2 art direction;
- color distribution/palette;
- homepage direction;
- complete Wall direction;
- visual treatment of the 24 positions;
- animations/micro-interactions;
- Apply flow;
- Claim flow;
- competitive visual language;
- visual hierarchy.

The user explicitly approved the first visual direction and considers the color distribution appropriate.

### Important continuity note
A previous assistant response incorrectly suggested rebuilding the Design System. That was an oversight. The Design System / visual direction had already been established and approved.

---

# 4. V2 PRODUCT EXPERIENCE

## 4.1 The Wall

The Wall should feel like a live market rather than a static advertising grid.

Each position should communicate:

- position number;
- current project;
- current value;
- protection status;
- challenge status;
- time held;
- historical context;
- ability to inspect the position.

Desired statuses:

- 🛡️ **PROTECTED**
- ⚔️ **OPEN TO CHALLENGE**

Potential position detail:

- Current holder
- Current value
- Held for
- Previous holder
- Previous price
- Number of challenges
- Highest historical price
- Full position history

---

# 5. WALL HISTORY / LEDGER

🟡 **PROPOSED / STRATEGIC DIRECTION**

Position history should become a visible feature rather than hidden backend data.

Potential public data:

- acquisitions;
- challenges;
- prices;
- timestamps;
- position changes;
- reward allocations;
- buybacks;
- burns.

Conceptual public message:

> **Verify it yourself.**

Potential feature:

## WALL LEDGER

A transparent view of important Wall events and economic flows.

---

# 6. WALL METRICS

🟡 **PROPOSED**

Potential top-level Wall metrics:

- **24 POSITIONS**
- **CURRENT WALL VALUE**
- number of challenges;
- number of projects;
- number of days of Wall history;
- other meaningful activity metrics.

### Current Wall Value
Concept:

> Total value currently committed across the 24 positions.

This is NOT market cap and NOT token value.

It is simply the aggregate current value of the positions.

---

# 7. CHALLENGE ECONOMICS

## 7.1 Current mechanic

🟢 **CURRENT / PRESERVE UNLESS CHANGED**

The existing challenge mechanic is based on the previous position price and an increment rule.

Observed current rule:

> **max(previous price + 10%, previous price + $5)**

with the current ceiling observed at $100,000.

The new buyer's payment becomes the new position price.

## 7.2 Previous holder

🟢 **VALIDATED DIRECTION**

**No direct percentage of the new payment should go to the previous holder.**

Reason:

The product should reward participation in The Wall, not create a direct royalty/resale mechanism that could make the product feel like a financial marketplace.

A previous holder can still benefit through participation-based rewards, history, points or status.

Desired philosophy:

> You are not rewarded because you lost your position.
> You are rewarded because you participated in The Wall.

---

# 8. FOUNDING 24

🟢 **VALIDATED / ACTIVE STRATEGY**

The launch includes a **Founding 24** concept.

The first 24 qualifying projects are positioned as the founding generation of The Wall.

Important principle:

**Founding status should persist historically even if a project later loses its position.**

Potential presentation:

> **FOUNDING #07**

The Founding status is about being part of the founding generation, not permanent ownership of a specific seat.

Current commercial work:

- Founding 24 outreach;
- first 50 prospects;
- prospect tracking;
- X communication;
- partnership outreach.

---

# 9. X / COMMUNITY / LAUNCH CONTEXT

The X account is still very early, launched roughly a few days before this document was created.

A V2 announcement direction was prepared:

> **THE WALL IS EVOLVING. 🧱**
>
> Over the past weeks, we've been listening.
>
> Your feedback gave us a lot to rethink.
>
> So we're building **The Wall V2**.
>
> Same 24 positions.
>
> A completely new experience.
>
> More visual.  
> More competitive.  
> More transparent.
>
> And yes — some of the ideas came directly from you.
>
> **We're just getting started.**
>
> ↓ More soon.

The positioning is intentionally framed as an evolution influenced by community feedback.

---

# 10. PROSPECTING / PARTNERSHIPS

Current strategic work includes:

- Founding 24;
- 50 first prospects;
- partnership outreach;
- Astra / Astra Labs partnership direction;
- email outreach.

Email context:

- `contact@thewallsol.com` exists on Porkbun.
- It was initially configured for forwarding to Gmail.
- Sending from Porkbun is being used.
- Gmail/Porkbun POP3-related setup can wait for now.
- Some contact channels (including DMs on certain accounts) may be closed, so outreach should use available public/contact channels rather than assuming DMs are possible.

Do not repeatedly suggest DM outreach where it has already been established that DMs are unavailable.

---

# 11. EMAIL / ASTRA

A partnership outreach direction toward Astra was being explored.

A working contact identified during the process:

> partners@astralab.io

The email setup itself is functional enough for current outreach.

The user is sending from Porkbun for now.

---

# 12. TOKEN / $WALL

## 12.1 Philosophy

🟡 **PROPOSED / TO BE FINALLY VALIDATED**

Core principle:

> **The Wall creates the token's utility. The token does not create The Wall's value.**

$WALL should not be made artificially mandatory for the basic Wall transaction.

Potential utilities discussed:

1. fee discounts;
2. Wall Points multipliers;
3. selected premium ecosystem features;
4. Seasons/rewards;
5. light/secondary governance;
6. buyback/burn flywheel.

Avoid promising token price appreciation.

Communication should emphasize utility and ecosystem mechanics, not investment returns.

---

# 13. 9.35% / 9.39% CORRECTION

🔴 **IMPORTANT — MUST BE CORRECTED / CONSISTENT EVERYWHERE**

The project previously contained an inconsistency between **9.39%** and **9.35%**.

The agreed rule is:

> **9.35% of the amount actually locked after fees.**

The 9.39% figure refers to the pre-fee / pre-deduction allocation context and must not be presented as the final effectively locked percentage.

Current known context:

- 93,478,448 $WALL is associated with the 9.35% effectively locked figure.
- The team lock was reported as extending to **28 November 2026**.
- The discrepancy is associated with fees (including Streamflow fees).

### Claude instruction
When Claude is available again, explicitly instruct:

> Correct the 9.39% / 9.35% inconsistency everywhere. The canonical figure is **9.35% of the amount actually locked after fees**. Do not describe 9.39% as the final locked allocation.

This is a high-priority consistency correction.

---

# 14. PROPOSED V2 REVENUE MODEL

🟡 **PROPOSED — NOT YET CODE-FINAL**

**Continuity note:** the underlying V4.54 economic simulation has already been completed. The task now is to reconcile the already-worked V2 allocation architecture with those results, not to restart the simulation.

Current candidate allocation of the **amount actually locked after applicable fees**:

| Destination | % |
|---|---:|
| Treasury / Product | 30% |
| Developers / Core Team | 15% |
| $WALL Ecosystem / Flywheel | 15% |
| Wall Rewards | 15% |
| Ecosystem / Growth | 15% |
| Protocol Reserve | 10% |
| Previous holder | 0% |
| **Total** | **100%** |

This is a working economic architecture, not yet immutable.

---

# 15. DEVELOPER ALLOCATION

🟡 **PROPOSED**

The development team should have an explicit share rather than being hidden inside Treasury.

Current proposal:

> **15% of net locked revenue → Developers / Core Team**

Important distinction:

- This is a revenue allocation.
- It is NOT automatically 15% of $WALL supply.
- It should not necessarily be paid in $WALL.
- Operational developer compensation can be handled in the revenue currency.
- Any token/team allocation should have separate vesting/multisig rules if introduced.

Reasoning:

The protocol needs a sustainable mechanism to pay people who build and maintain it.

---

# 16. $WALL FLYWHEEL

🟡 **PROPOSED**

Current candidate:

> **15% of net locked revenue → $WALL ecosystem**

Within this:

- **10% of total revenue → buyback**
- **5% of total revenue → Rewards Vault**

On purchased $WALL:

- **70% → burn**
- **30% → Rewards Vault**

This should be treated as a proposed model until full numerical simulation confirms it is sustainable.

Potential operational rule:

Do not necessarily execute a buyback on every individual transaction.

Instead:

- accumulate the buyback allocation;
- execute periodically (e.g. weekly) or after a minimum threshold;
- publish/record the action transparently.

This can reduce unnecessary transaction costs and market noise.

---

# 17. WALL REWARDS

🟡 **PROPOSED**

15% of net locked revenue is allocated to Wall Rewards.

Rewards should be based on meaningful participation rather than passive token holding alone.

Potential reward categories:

- time held;
- position quality/value;
- successful defenses;
- challenge participation;
- verified project activity;
- Seasons;
- Founding participation;
- community contributions.

Avoid trivial farming.

---

# 18. WALL POINTS

🟡 **PROPOSED**

**Wall Points are NOT $WALL.**

They are non-transferable participation/accounting points.

Potential uses:

- leaderboards;
- rewards;
- Seasons;
- badges;
- access;
- multipliers.

Conceptual scoring:

> **Position × Time × Activity**

Exact formula still requires design and anti-farming validation.

The objective is to reward meaningful participation, not automated low-value activity.

---

# 19. WALL SEASONS

🟡 **PROPOSED**

Potential periodic competition layer.

Example:

> **THE WALL — SEASON 01**
> 90 DAYS

Potential awards:

- Top Project
- Best Defender
- Most Challenged
- Biggest Rise
- Community Pick

Rewards would come from the Wall Rewards allocation.

Important distinction:

Seasons can use Wall Points and rewards without creating constant token inflation.

---

# 20. TREASURY / PRODUCT

🟡 **PROPOSED**

30% of net locked revenue.

Potential uses:

- product development;
- infrastructure;
- backend;
- frontend;
- security;
- operations;
- tooling;
- future product expansion.

Treasury should ideally use transparent, identifiable wallets and appropriate multisig controls.

---

# 21. ECOSYSTEM / GROWTH

🟡 **PROPOSED**

15% of net locked revenue.

Potential uses:

- partnerships;
- acquisition;
- campaigns;
- grants;
- ecosystem integrations;
- Founding 24 growth;
- creator/community initiatives.

No automatic or opaque distribution.

---

# 22. PROTOCOL RESERVE

🟡 **PROPOSED**

10% of net locked revenue.

Potential uses:

- security incidents;
- exceptional refunds;
- audits;
- infrastructure emergencies;
- legal/operational contingencies;
- migration or recovery.

Purpose: avoid using the core Treasury every time an exceptional event occurs.

---

# 23. ACCOUNTING FLOW

🟢 **VALIDATED PRINCIPLE**

All future revenue logic must use an explicit flow:

> **Gross payment → applicable fees → net amount actually locked → allocation**

Do not calculate the revenue allocation from an amount that has not yet had applicable fees deducted.

This principle is particularly important because it mirrors the agreed 9.35% rule.

---

# 24. WALL VALUE VS $WALL VALUE

Important conceptual distinction:

### Current Wall Value
The aggregate current value of the 24 positions.

### $WALL
The ecosystem token.

These must never be conflated.

Wall Value is a product metric.

$WALL is an ecosystem utility layer.

---

# 25. KEY PRODUCT NARRATIVE

Current strongest narrative direction:

> **24 POSITIONS.  
> ONE WALL.  
> COMPETE FOR YOUR PLACE.**

Supporting message:

> **The on-chain visibility market for projects that want to be seen — and stay seen.**

Economic/product philosophy:

> **The token doesn't create the Wall's value. The Wall creates the token's utility.**

Competitive loop:

> **POSITION → TIME → PARTICIPATION → REWARDS**

rather than:

> POSITION → LOSS → REFUND

---

# 26. VISUAL / UX PRINCIPLES

🟢 **VALIDATED DIRECTION**

The Wall should communicate:

- scarcity;
- competition;
- premium status;
- movement;
- transparency;
- live market energy.

The interface should make it visually obvious:

- who occupies each position;
- what it is worth;
- whether it is protected;
- whether it is challengeable;
- what changed;
- what the user can do next.

Existing approved visual work should be preserved rather than redesigned without request.

---

# 27. HOMEPAGE

🟢 **VALIDATED DIRECTION**

The homepage should lead with the Wall itself and make the 24-position scarcity immediately understandable.

The visual direction already approved should be used as the reference.

Potential content hierarchy:

1. Hero / Wall visual
2. Current Wall / live state
3. How it works
4. Competition / challenge explanation
5. History / transparency
6. Founding 24
7. $WALL ecosystem
8. Apply / claim CTA

Do not replace the approved visual language with a generic crypto landing page.

---

# 28. IMPLEMENTATION STRATEGY WITH CLAUDE

## Principle

Do not ask Claude to "implement V2" without context.

Use one master implementation brief containing:

1. What currently exists in V4.54.
2. What must remain unchanged.
3. What is validated for V2.
4. What is proposed but not yet final.
5. Exact economic rules once validated.
6. Exact 9.35% correction.
7. Required tests.
8. Security/atomicity constraints.
9. UX acceptance criteria.
10. Rollback/no-regression expectations.

### Claude must not:
- redesign the already-approved visual direction;
- invent new tokenomics;
- silently change the challenge formula;
- treat 9.39% as the final locked figure;
- send a percentage of the new payment to the previous holder;
- conflate Wall Value and $WALL;
- implement unvalidated economic proposals as irreversible rules;
- break existing V4.54 functionality while adding V2 features.

---

# 29. CURRENT PRIORITIES

### Historical work already completed

🟢 **V4.54 economic simulation — already completed.**

🟢 **Revenue-flow analysis — already completed.**

🟢 **Previous-holder payout question — already analyzed; current direction is 0%.**

🟢 **Developer allocation question — already analyzed; an explicit developer share was added to the working architecture.**

🟢 **50-prospect work and tracking — already completed/worked.**

🟢 **V2 visual/design direction — already worked and validated.**

### P0
- Preserve security and transaction integrity.
- Preserve existing Wall mechanics unless explicitly changed.
- Correct the 9.39% / 9.35% inconsistency.
- Ensure gross/fees/net locked accounting is explicit.

### P1
- V2 homepage / Wall implementation using approved visuals.
- Improved position states and history.
- Founding 24 presentation.
- Transparent Wall Ledger.
- Product analytics/metrics.

### P1/P2
- Reconcile/finalize the already-worked V2 tokenomics against the completed V4.54 simulation; **do not restart the simulation unless a specific changed assumption requires it**.
- Finalize $WALL flywheel.
- Finalize Wall Points.
- Finalize Seasons.

### Growth
- Founding 24.
- 50 initial prospects.
- X/community growth.
- Partnerships (including Astra direction).
- Outreach infrastructure.

---

# 30. OPEN QUESTIONS

These remain open until explicitly validated:

- Exact Wall Points formula.
- Exact Season duration.
- Exact reward formula.
- Exact $WALL buyback cadence/threshold.
- Exact liquidity/burn execution architecture.
- Whether governance is needed at launch.
- Exact fee discount tiers.
- Exact $WALL staking/locking requirements, if any.
- Exact Founding 24 benefits.
- Final revenue percentages after simulation.
- Exact wallet/multisig architecture.

---

# 31. DO NOT DO

1. Do not restart the visual design.
2. Do not assume every discussed idea is approved.
3. Do not invent missing numbers.
4. Do not pay previous holders a percentage of takeover payments unless explicitly re-approved.
5. Do not make $WALL artificially mandatory for the core Wall transaction.
6. Do not promise token appreciation.
7. Do not use 9.39% as the canonical final locked figure.
8. Do not calculate allocations before applicable fees are deducted.
9. Do not sacrifice product sustainability for aggressive buybacks.
10. Do not confuse the Wall's product value with $WALL's token value.

---

# 32. MASTER STATUS

### 🟢 VALIDATED
- 24-position Wall concept.
- Core competitive positioning.
- Existing challenge concept should be preserved.
- V2 visual direction.
- Homepage / Wall visual direction.
- Founding 24 strategy.
- No direct previous-holder payout.
- 9.35% effectively locked after fees.
- Gross → fees → net locked accounting principle.
- Need for a single master implementation brief before Claude.

### 🟡 PROPOSED
- 30/15/15/15/15/10 revenue allocation **as the current working architecture, subject to reconciliation with the already-completed V4.54 simulation**.
- $WALL buyback/burn structure.
- Wall Points.
- Seasons.
- Wall Ledger.
- Wall Value / activity metrics.
- Exact $WALL utilities.
- Exact developer payment mechanics.

### 🔴 TO CORRECT
- Any remaining 9.39% references.
- Any accounting logic that allocates from gross rather than net locked funds.
- Any documentation that contradicts the canonical 9.35% figure.

### 🔵 FUTURE
- Advanced governance.
- Expanded ecosystem features.
- Additional Wall products/seasons beyond initial V2 scope.

---

# 33. NEXT HANDOFF TO CLAUDE

When Claude is available again, provide:

**THE WALL V2 — MASTER IMPLEMENTATION BRIEF**

based on this document.

The handoff should explicitly say:

> The visual direction is already approved. Do not redesign it.
>
> The current V4.54 implementation is the baseline.
>
> Preserve existing functionality unless explicitly changed.
>
> The economic model in this document is proposed until the final numerical simulation is approved.
>
> Correct all 9.39% references to the canonical rule:
>
> **9.35% of the amount actually locked after fees.**
>
> Do not interpret or invent additional economics.

---

# 34. CONTINUITY / DO-NOT-REPEAT REGISTER

The following items are explicitly recorded as **already worked** and should not be proposed again as fresh work without a concrete reason:

- V4.54 technical audit/review.
- V4.54 economic simulation using the real parameters.
- Revenue-flow analysis.
- Previous-holder payout analysis.
- Developer allocation analysis.
- Initial V2 revenue-flow architecture.
- Founding 24 work.
- First 50 prospects work.
- Prospect tracking table.
- Initial outreach work.
- X launch / early positioning work.
- Astra partnership outreach work.
- Professional email setup work.
- V2 visual direction, colors and design work.
- Hastra animation inspiration discussion.
- Initial Claude implementation prompts.

When a new task is proposed, first check this register and the relevant detailed section.

---



# WALL POINTS / REWARDS V1 — FINAL WORKING DESIGN AFTER SIMULATION

**Status:** 🟢 Recommended V1 architecture; 🟡 parameters remain configurable before code freeze.

## Core principle

> **Money buys a position. Participation earns reputation. Meaningful activity earns rewards.**

Wall Points measure participation in The Wall, not wealth.

## Season

- **30-day Seasons**
- Season points are reset for reward calculation.
- Historical points remain visible as reputation/history.

## Points

### Presence
- **1 point/day**, maximum **30 points/Season**.

### Successful defense
- First qualifying defense: **12**
- Second: **6**
- Third: **3**
- Fourth: **1.5**
- Further defenses: **0**

### Successful challenge
- First qualifying challenge: **8**
- Second: **4**
- Third: **2**
- Fourth: **1**
- Further challenges: **0**

### Progression
Progression is **not an independent reward source in V1**. It is used as context/analytics rather than a farming vector.

### Activity cap
- Total activity points from defense + challenge: **maximum 36/Season**.
- Total points therefore cap at **66/Season** before any future explicitly approved bonus.

## Qualification / anti-farming

A qualifying action must create a genuine state change and satisfy protocol-defined economic significance.

- Same-project / related-wallet self-interaction does not qualify.
- Same target interaction is rate-limited; working parameter: **7 days**.
- A successful challenge/defense must be an economically meaningful protocol event; cosmetic or circular actions do not score.
- Points are attached to the project/entity record, not reset by moving the position between related wallets.
- Eligibility threshold: **10 Season Points**.
- Related-wallet / Sybil clustering can exclude or consolidate rewards.
- Founding 24 status is recognized separately and does not receive a permanent reward multiplier.
- The protocol should never promise that anti-Sybil controls are perfect; the goal is to make farming economically unattractive and cap its upside. Research and current protocol designs commonly combine rate limits, diminishing returns, caps and identity/behavioral clustering rather than relying on one mechanism alone. citeturn0search0turn0search1turn0search4

## Reward conversion

For eligible projects/entities:

**Reward Weight = √(Season Points)**

The Season Rewards Vault is distributed pro-rata by Reward Weight.

This keeps active participants ahead of passive participants without making rewards proportional to capital or raw activity. Sublinear curves are commonly used to reduce concentration; they work best when combined with rate limits and anti-Sybil controls. citeturn0search0turn0search7

## Autonomous stress-test conclusion

A 100-participant synthetic Season was tested across passive whales, normal projects, active small projects, defenders, challengers, balanced participants, farmers and Sybil-like accounts.

Key results under the final candidate:
- **Top 1 participant:** ~1.3% of a $10k illustrative rewards pool.
- **Top 10:** ~12.2%.
- **Top 25:** ~29.5%.
- Average farmer score remained close to a normal participant, which is acceptable only because qualifying challenges are economically meaningful and rate-limited; cheap repetitive actions are explicitly excluded.
- A comparison of sqrt, log and capped-sqrt reward curves showed no need to complicate the V1: **sqrt is retained** because it is easy to explain and sufficiently compresses concentration.

### Important design decision

**Progression points are removed from V1.**

The autonomous tests showed that rewarding too many distinct event types creates unnecessary farming surfaces. Progression remains useful as a metric displayed in analytics and may become a reward source later only after observed real-world behavior justifies it.

## Reward philosophy

Rewards should reinforce behavior that makes The Wall valuable:

1. staying present,
2. defending a meaningful position,
3. challenging meaningfully.

The system intentionally does **not** reward:
- simple wallet activity,
- clicks/views,
- raw transaction count,
- passive `$WALL` holding,
- repeated micro-movements,
- artificial self-interaction.

**V1 conclusion:** this is the recommended baseline to implement and observe in a controlled Season before considering additional point categories.



# COMMUNITY POINTS — WALL PREDICTIONS / WALL GAMES V1

**Status:** 🟢 Recommended V1 after autonomous stress-testing.

## Purpose

Wall Predictions are designed to create recurring engagement around the actual Wall rather than generic social farming.

They reward **accurate conviction and participation**, not capital size.

They are part of **Community Points**, not Wall Points.

## Core mechanic

Each Season can contain a limited number of official Predictions.

Examples:
- Which project will hold Position #1 at the end of the week?
- Which project will enter the Top 3?
- Which position will change hands next?
- Which project will survive a specified challenge window?

A prediction must be submitted **before a published cutoff** and is locked afterwards.

## Scoring

V1 uses fixed, capped points rather than wagering `$WALL`.

- Correct prediction: **+100 Community Points**
- Incorrect prediction: **0**
- No submission: **0**
- Maximum: **5 scored predictions per Season**
- Maximum prediction contribution: **500 Community Points / Season**

There is **no negative score**. This keeps the system accessible and avoids turning Community Points into gambling-like mechanics.

## Anti-farming

- No points for changing a prediction after the cutoff.
- Predictions are limited to official protocol-defined questions.
- Duplicate/spam submissions do not score.
- A user cannot create multiple eligible accounts to multiply prediction rewards; related/Sybil clusters can be consolidated or excluded.
- The protocol does not allow users to buy additional prediction attempts with `$WALL`.
- Prediction questions must resolve objectively from on-chain / protocol state wherever possible.
- Prediction outcomes are recorded and auditable.

## Why no betting / `$WALL` wagering

Do **not** introduce a wager mechanic in V1.

The goal is engagement and information discovery, not gambling or financial speculation. Keeping predictions free also prevents whales from purchasing an advantage.

## Example weekly loop

**Monday:** prediction opens  
**Friday:** cutoff  
**Sunday:** Wall state resolves  
**Next Season:** points and leaderboard update

This creates a recurring reason to return to The Wall and discuss projects on X.

## Relationship to other systems

**Wall Points**
→ real economic participation in The Wall
→ Rewards Vault.

**Community Points**
→ social/community contribution, referrals, art, predictions
→ future ecosystem utility/recognition.

Predictions remain Community Points only.

## Stress-test conclusion

A 100-participant synthetic test with passive users, active users, whales, spammers and Sybil-like clusters showed that fixed rewards plus a hard 5-prediction Season cap prevent prediction volume from dominating the Community Points economy.

A participant who is perfect on all five predictions earns **500 points**, which is intentionally comparable to — but not enough by itself to dominate — other meaningful Community activities.

**Design principle:**

> Predict the Wall. Follow the Wall. Learn the Wall.




# CONSOLIDATED V2.1 ECONOMIC RECONCILIATION — AFTER AUTONOMOUS SIMULATION

**Status:** 🟢 Recommended architecture; parameterized simulation completed.  
**Continuity:** This is a reconciliation/delta analysis around the already-completed V4.54 economic baseline, not a replacement for that historical simulation.

## Canonical revenue flow

> **Gross payment → applicable fees → net amount actually locked → 100% allocation**

For every $100 of net locked revenue:

| Destination | % | $ |
|---|---:|---:|
| Treasury / Product | 30% | $30 |
| Developers / Core Team | 15% | $15 |
| $WALL Ecosystem / Flywheel | 15% | $15 |
| Wall Rewards | 15% | $15 |
| Ecosystem / Growth | 15% | $15 |
| Protocol Reserve | 10% | $10 |
| Previous holder | 0% | $0 |

## $WALL flywheel

The 15% Ecosystem / Flywheel allocation is a pool, not an automatic buyback.

A buyback is allowed only when:
- projected reserves cover at least **6 months** of operating expenses;
- the pool retains its required liquidity;
- the periodic buyback gate is satisfied.

At a buyback event:
- **maximum 50% of the available Ecosystem/Flywheel Pool** may be used;
- purchased `$WALL`: **70% burn / 30% Rewards Vault**.

Therefore, if the maximum 50% buyback is used:
- **5.25% of net locked revenue** is burned;
- **2.25%** of net locked revenue is added to the Rewards Vault from the flywheel;
- plus the independent **15% Wall Rewards** allocation;
- total potential Rewards Vault inflow = **17.25% of net locked revenue**;
- the remaining **7.50%** of net locked revenue stays in the Ecosystem/Flywheel Pool.

If the buyback gate is not satisfied, the full 15% remains in the Ecosystem/Flywheel Pool and no burn occurs.

## Challenge economics used in the delta simulation

Existing V4.54 mechanics remain the baseline:
- **24 permanent positions**;
- takeover minimum = **max(previous price + 10%, previous price + $5)**;
- observed ceiling = **$100,000**;
- the new holder's payment becomes the new position price.

The challenge payment is therefore modeled as the new position price, subject to the existing ceiling.

## Parametric monthly stress test

Because the detailed historical V4.54 scenario inputs are not fully reproduced in this Master Context, the reconciliation uses the actual V4.54 challenge rule and tests ranges of challenge frequency and average previous-position price rather than inventing a new "official" forecast.

Illustrative net-locked revenue and allocations:

| Avg previous price | 12 challenges | 24 challenges | 48 challenges |
|---:|---:|---:|---:|
| $500 | $6,600 | $13,200 | $26,400 |
| $1,000 | $13,200 | $26,400 | $52,800 |
| $5,000 | $66,000 | $132,000 | $264,000 |

These figures use the challenge payment `max(previous × 1.10, previous + $5)` and assume the average price is below the $100k ceiling.

At the maximum buyback condition, total Rewards Vault inflow is **17.25%** of net locked revenue. For example:
- $13,200 net locked → **$2,277** Rewards Vault; **$693** burned.
- $26,400 net locked → **$4,554** Rewards Vault; **$1,386** burned.
- $132,000 net locked → **$22,770** Rewards Vault; **$6,930** burned.
- $264,000 net locked → **$45,540** Rewards Vault; **$13,860** burned.

## Economic conclusions

1. **The 15% developer allocation is sustainable only when revenue is sufficient; it should be treated as compensation for real work, not a token emission.**
2. **The previous holder remains at 0%.** This preserves The Wall's competitive/product identity and avoids turning it into a royalty resale market.
3. **The buyback is deliberately variable.** It is a consequence of economic health, not a guaranteed constant drain on revenue.
4. **The Rewards Vault has a strong upper-bound rule:** 17.25% of net locked revenue in a maximum-buyback period.
5. **The burn is also bounded:** maximum 5.25% of net locked revenue per period under the current rules.
6. **Treasury + Developers + Growth + Reserve receive 70% of net locked revenue regardless of whether a buyback occurs.** This gives the operating system a much stronger base than a token-centric design.
7. **The 15% Wall Rewards allocation is independent of the flywheel.** This prevents user rewards from disappearing whenever the buyback gate is closed.
8. **No economic forecast should be presented as fact until actual V4.54 historical inputs are restored.** The table above is a stress-test grid, not a revenue prediction.

## Recommended accounting dashboard

The product should expose, at minimum:
- Gross payments;
- fees;
- net locked revenue;
- Treasury allocation;
- Developer allocation;
- Ecosystem/Flywheel balance;
- Rewards allocation;
- Growth allocation;
- Reserve balance;
- buyback events;
- `$WALL` purchased;
- `$WALL` burned;
- Rewards Vault balance;
- Season rewards distributed.

This makes the economic system auditable rather than narrative.






# THE WALL — X IDENTITY + COMMUNITY REWARDS SPEC V1

**Status:** 🟢 Recommended V1 architecture  
**Purpose:** Authentication, X-linked identity, Quest verification, Community Points ledger and anti-farming controls.

## 1. Product principle

> One human-facing The Wall account → one primary X identity → one auditable Community Points ledger.

Community Points are not Wall Points.

- **Community Points:** X quests, referrals, predictions, art/community contributions.
- **Wall Points:** economically meaningful participation in The Wall.

No Community Points promise or guarantee an airdrop.

## 2. Sign-up flow

1. User clicks **Continue with X**.
2. The Wall starts X OAuth 2.0 Authorization Code Flow with PKCE.
3. User authorizes the minimum required scopes.
4. The Wall backend exchanges the authorization code.
5. Backend retrieves the X identity.
6. The Wall creates/links the local account.
7. A server-side `x_identity` record is created.
8. User lands on the Community dashboard.

X documents OAuth 2.0 Authorization Code + PKCE specifically for user-facing apps and fine-grained scopes.

## 3. Identity model

Recommended records:

### users
- `id`
- `created_at`
- `status`
- `primary_x_identity_id`
- `referral_code`
- `risk_status`

### x_identities
- `id`
- `user_id`
- `x_user_id`
- `username_snapshot`
- `display_name_snapshot`
- `avatar_url_snapshot`
- `connected_at`
- `last_verified_at`
- `revoked_at`

**Unique constraint:** one active `x_user_id` can belong to only one The Wall account.

The stable X user ID is the identity key; username/display name are snapshots and can change.

## 4. Token handling

Access/refresh tokens are server-side only.

- Never expose X tokens to the browser after OAuth callback.
- Encrypt tokens at rest.
- Keep scopes minimal.
- Support disconnect/revoke.
- If long-lived verification is required, use the appropriate refresh-token flow; X documents `offline.access` as the scope that enables a refresh token.

## 5. Quest engine

Every Community Quest is a versioned object:

- `quest_id`
- `season_id`
- `type`
- `description`
- `points`
- `max_completions`
- `start_at`
- `end_at`
- `verification_method`
- `cooldown`
- `status`

Quest states:

`available → pending → verified/rejected → locked`

Never award points directly from the client.

## 6. Verification tiers

### Tier A — API-verifiable
Examples:
- X identity linked
- follow official account
- existence/ownership of a public post
- post author
- post timestamp
- required mention/URL/hashtag

### Tier B — API + rule validation
Examples:
- qualifying repost/quote/reply where the available API data supports verification
- post content satisfying a deterministic rule

### Tier C — human/moderation review
Examples:
- quality of an original thread
- artwork
- creative contribution
- nuanced community contribution

Do not pretend an API can objectively measure artistic quality.

## 7. Community Points ledger

Use an append-only ledger rather than a mutable balance-only model.

### point_events
- `id`
- `user_id`
- `season_id`
- `source_type`
- `source_id`
- `points`
- `status`
- `evidence_ref`
- `created_at`
- `verified_at`
- `reversal_of`
- `metadata_hash`

Balance is derived from verified events.

This makes every point auditable and allows reversals without deleting history.

## 8. X Quest examples

### Follow The Wall
- one-time
- 25 CP
- verify following relationship

### Official Quest / repost
- 25 CP
- one completion per campaign
- verify against the specific campaign post

### Original Wall post
- 100 CP
- submit X post URL
- verify author, timestamp and campaign requirements
- optional moderation

### X season cap
- **300 CP / Season maximum from X Quests**

Do not award points for raw likes/follows/replies at unlimited volume.

## 9. Referral flow

A referral becomes qualifying only when the referred account:
1. links a unique X identity,
2. passes the activation condition,
3. completes the first meaningful Wall action.

Candidate reward:
- +50 CP when activation is confirmed
- +25 CP after first meaningful Wall action
- max 10 qualifying referrals / Season = 750 CP

Signup alone = 0 CP.

Use pending status and a confirmation window before finalizing the reward.

## 10. Predictions

- +100 CP for a correct official prediction
- 0 for incorrect
- max 5 scored predictions / Season
- 500 CP maximum / Season
- prediction locked after cutoff
- objective resolution preferred
- no `$WALL` wager

## 11. Art Challenge

Community Points:
- participation: +100
- finalist: +250
- 3rd: +400
- 2nd: +600
- 1st: +800

The artistic winner can separately receive `$WALL` and Gallery exposure if that reward budget is approved.

## 12. Anti-Sybil / anti-farming

V1 should combine:
- unique X identity constraint
- one primary X account per The Wall account
- no signup rewards
- season caps
- quest cooldowns
- referral confirmation windows
- related-wallet / related-account clustering
- duplicate evidence detection
- suspicious velocity detection
- manual review for high-value creative rewards
- point reversals when verified evidence becomes invalid

Important: do not promise perfect Sybil resistance.

## 13. X API architecture

Use a server-side integration.

- OAuth callback: backend
- token storage: backend
- verification jobs: backend worker
- point ledger: backend database
- client: requests verification and displays status

Use X API endpoints according to current access/plan availability. X currently documents user follows, post lookup, post search and OAuth 2.0 PKCE as available API capabilities, with endpoint/plan requirements subject to change.

## 14. Graceful degradation

If X API access or a required endpoint becomes unavailable:
- do not silently award points;
- put affected quests into `verification_unavailable`;
- preserve submitted evidence;
- allow manual review where appropriate;
- never reset existing verified points.

## 15. Security

- CSRF/state protection in OAuth flow
- PKCE verifier/challenge
- encrypted token storage
- secure HTTP-only session cookies
- rate limiting
- replay protection for quest evidence
- server-side authorization checks
- audit logs
- minimal personal data retention

## 16. UX

Community dashboard should show:

**X Connected ✓**

**Community Points**
- Season total
- lifetime total
- rank
- source breakdown

**Quests**
- Available
- Pending
- Completed
- Expired

**Referral**
- referral link
- qualified referrals
- pending referrals

**Predictions**
- open
- locked
- resolved

**Art**
- current competition
- submission status
- Gallery

## 17. Important boundary

Community Points must never automatically mint, transfer or promise `$WALL`.

They are an internal accounting/reputation layer until a future governance/product decision explicitly assigns additional utility.






# THE WALL — USER JOURNEY / UX V1

**Status:** 🟢 Recommended V1  
**Objective:** Make the first useful experience understandable without forcing a long tutorial.

## UX principle

The user should see the Wall before being asked to understand the whole system.

Research on onboarding consistently favors reducing unnecessary setup and using short, contextual guidance instead of forcing users through long tutorials. citeturn0search1turn0search4turn0search11

## Primary journey

### 0. Landing / public Wall

The visitor immediately sees:

- The Wall
- 24 positions
- current holders/projects
- current position prices
- countdown / Season information where relevant
- one clear CTA: **Enter The Wall**

Secondary CTA:
**How it works**

No account required to explore the public Wall.

### 1. Connect

CTA:

> **Continue with X**

Supporting text:

> Connect your X account to create your Wall identity and unlock Community features.

Do not explain the entire points system here.

### 2. Account created

Show a compact confirmation:

> **You're in.**

Then immediately show:

- X connected
- Community Points: 0
- Wall Points: 0
- current Season

CTA:

> **Explore The Wall**

Optional secondary:
> **Earn your first Community Points**

### 3. First discovery

The Wall interface should explain only three concepts contextually:

**Position**
> A project occupies a place on The Wall.

**Price**
> The current position price is the amount required to challenge it.

**Challenge**
> Beat the current position price according to the protocol rules and take the position.

Avoid a full tutorial.

### 4. First action

The ideal first action is not necessarily buying.

Give the user a low-friction action:

- inspect a project;
- vote/predict;
- complete a Community Quest;
- share a position;
- view the current top position.

Then progressively expose deeper mechanics.

### 5. First economic interaction

When the user is ready to acquire/challenge a position, show a confirmation screen with:

- current position
- current price
- required payment
- resulting position
- applicable protocol fee(s)
- destination/allocation summary
- confirmation

No hidden economics.

### 6. Post-action moment

After a successful position acquisition:

> **You're on The Wall.**

Show:

- position number
- project
- price
- timestamp
- Wall Points earned, if applicable
- next possible challenge/defense state

Then invite the user to share the achievement.

CTA:
> **Share your position**

### 7. Community loop

Dashboard:

**Community Points**
- Season total
- rank
- source breakdown

**Wall Points**
- Season total
- activity breakdown

**Quests**
- available
- pending
- completed

**Predictions**
- open
- locked
- resolved

**Referrals**
- qualified
- pending

**Art**
- active competition
- submission
- Gallery

### 8. Return loop

The product should give users reasons to return:

- position changes
- challenges
- defenses
- prediction resolution
- new quests
- Season progress
- leaderboard changes
- art competition
- referral status

The home/dashboard should prioritize meaningful changes rather than notification spam.

## Three persona tests

### Persona A — Crypto newcomer

Goal:
Understand what The Wall is in <60 seconds.

Success criteria:
- can explain a position in their own words;
- can identify what a challenge does;
- knows where to start;
- does not need a glossary before acting.

Main risk:
The product sounds like a token/DeFi dashboard instead of a simple competitive Wall.

Fix:
Use plain language first; reveal protocol terminology contextually.

### Persona B — Crypto-native

Goal:
Reach the mechanics quickly.

Success criteria:
- sees positions/prices immediately;
- can inspect protocol rules;
- can connect X in one step;
- can reach challenge flow without forced education.

Main risk:
Too much onboarding.

Fix:
Skip tutorial; expose **How it works / Economics / Rules** as accessible secondary paths.

### Persona C — Project / whale

Goal:
Understand why occupying a position matters.

Success criteria:
- understands position visibility;
- understands challenge mechanics;
- sees price and permanence clearly;
- can estimate the economic consequence before confirming.

Main risk:
Only seeing a speculative token layer.

Fix:
Emphasize status, visibility, competition and the permanent Wall record.

## Navigation V1

Recommended top navigation:

**The Wall | Community | Leaderboard | Gallery | How it works**

Authenticated user menu:

**Profile | My Position(s) | Points | Referrals | Settings**

Keep the primary product surface focused on The Wall.

## Empty / error states

Every failure must say:
1. what happened,
2. whether anything changed,
3. what the user can do next.

Examples:

> **Challenge not completed.**
> Your payment was not accepted. Your current position is unchanged.

> **X verification unavailable.**
> Your submission was saved. We couldn't verify it right now. No points were lost.

Avoid generic:
> Something went wrong.

## Activation metrics

Track:

- landing → Wall view
- Wall view → X connect
- X connect → first meaningful action
- first action → first return
- first economic interaction
- first Community Quest
- first referral
- first prediction
- first art submission
- Day 1 / Day 7 / Day 30 retention
- conversion by persona/source

The key north-star onboarding metric should be:

> **% of new accounts reaching one meaningful Wall action within the first session.**

Do not optimize for account creation alone.

## UX conclusion

The Wall should be understandable by observation before explanation.

The first session should feel like:

> **See the Wall → understand the competition → choose what interests you → act → get a visible result.**

Not:

> Sign up → read tutorial → learn tokenomics → configure profile → find the product.





# CLAUDE CODE HANDOFF V1

See the companion file `THE_WALL_CLAUDE_CODE_HANDOFF_V1.md` for the operational handoff. The existing Claude Code + Google Cloud implementation must be audited before any rebuild or architectural change.

# 35. DOCUMENT MAINTENANCE

Whenever a major decision is made:

1. Update this document.
2. Change the status label.
3. Add the date.
4. Record what changed and why.
5. Do not delete historical context that explains an important decision.
6. Keep the Claude handoff aligned with the latest validated state.

**This file is the continuity anchor for The Wall.**
