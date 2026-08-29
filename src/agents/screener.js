import { config } from "../config.js";
import { agentEnabled, agentsEnabled } from "../guardrails.js";

/* ------------------------------------------------------------------ *
 * SCREENER — deterministic. No model, ever.
 *
 * Every refusal on this site is decided here, by rules you can read,
 * test, and defend to someone whose seat you just refused. The model
 * never gets a vote on whether a token can be sold; it only reads the
 * free text (see moderator.js).
 *
 * Four verdicts:
 *   incomplete  a check could not run. NOT a verdict on the token —
 *               nothing is sold, nothing is published, come back later.
 *   refused     a hard rule failed on an established fact. Not sellable
 *               at any price, and publishable as a finding.
 *   flagged     sellable, badge says FLAGS FOUND, reasons ride along.
 *   clear       nothing hard, nothing soft. Badge SCREENED.
 *
 * THE DISTINCTION THAT MATTERS
 *
 * "We read the pool and the liquidity is not locked" is a fact about
 * the token. "We cannot read this DEX" is a fact about us. Both used to
 * refuse, in the same words, and the refusal ledger published the
 * second as though it were the first — asserting something about a
 * named project that had never been established.
 *
 * So: a check that could not run never produces a refusal, and never
 * prints a number that was not measured. Either the sale is held until
 * the check can run, or the gap is sold with the gap stated on the
 * seat.
 *
 * The wording of the reasons is public copy: it is printed under the
 * seat. Write it for the person reading the wall, not for the log.
 * ------------------------------------------------------------------ */

const pct = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : null);
const usd = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString("en-US") : null);

/* ------------------------------------------------------------------ *
 * UNRESOLVED — a check did not run. Sale held, nothing published.
 *
 * These are our failures, not theirs. Retrying can fix them, so the
 * buyer is told to come back rather than told no.
 * ------------------------------------------------------------------ */
export const UNRESOLVED_RULES = [
  {
    // Fail closed by construction: if the lock is not proven, the only
    // question left is WHICH outcome — refuse, hold, or flag. A missing
    // or unrecognised proof is never permission to sell, because a
    // fact set that predates this field, or comes from a caller we did
    // not anticipate, must not be read as "fine".
    id: "pool_unread",
    test: (f) => f.lpProof === "unavailable"
      || (f.lpLocked !== true && !["not_burned", "no_pool", "dex_unmodelled"].includes(f.lpProof)),
    reason: (f) => f.lpProof === "unavailable"
      ? "The pool could not be read just now, so its liquidity was not checked."
      : "The liquidity lock was not established, and we could not determine why.",
  },
  {
    id: "holders_unread",
    test: (f) => f.holdersProof !== "too_many_accounts" && Number(f.holdersSampled ?? 0) <= 0,
    reason: () => "Holder distribution could not be read just now.",
  },
  {
    // A link we could not submit to Safe Browsing is unchecked, not
    // malicious.
    id: "link_uncheckable",
    test: (f) => f.linkThreat === "unchecked",
    reason: () => "The destination link could not be submitted for a safety check just now.",
  },
  {
    /* No link at all. This used to live in `link_threat` below, next to
     * "flagged malicious", and it produced the worst sentence this site
     * has ever generated: a REFUSAL against a token with $11M of daily
     * volume, whose stated finding was "No destination link was
     * supplied." Nobody had supplied anything — it was an unsubmitted
     * contract the round had picked up, and DexScreener simply had no
     * profile URL for it. We published our own empty field as a finding
     * about them.
     *
     * An absence is not a discovery. The link check did not run, so it
     * belongs here with the other checks that did not run: nothing is
     * asserted, nothing is recorded, nothing is publishable.
     *
     * The checkout path never reaches this rule — validateEntry() turns
     * a missing link into a 400 long before the gate is called — so
     * this cannot be used to buy a seat without a destination. */
    id: "link_absent",
    test: (f) => f.linkThreat === "missing",
    reason: () => "No destination link was available, so the link was not checked.",
  },
];

/* ------------------------------------------------------------------ *
 * UNVERIFIABLE — a structural gap. Retrying will not help.
 *
 * Sellable, because refusing would punish a project for our blind
 * spot. Never SCREENED, because we did not verify it.
 * ------------------------------------------------------------------ */
export const UNVERIFIABLE_RULES = [
  {
    // Same shape as the unmodelled DEX: retrying will not help, and
    // refusing would punish a mint for being larger than the method we
    // use to read it.
    id: "holders_unmeasurable",
    test: (f) => f.holdersProof === "too_many_accounts",
    reason: () =>
      "Holder concentration could not be measured: this mint has more holder accounts than the chain call will return. It is not a finding that the supply is concentrated.",
  },
  {
    id: "lp_lock_unverifiable",
    test: (f) => f.lpProof === "dex_unmodelled",
    reason: (f) =>
      `The liquidity lock could not be verified: this pool is on ${f.dexId || "a DEX"}, which our checks do not model yet. It is not a finding that the liquidity is unlocked.`,
  },
];

export const HARD_RULES = [
  {
    id: "mint_authority",
    test: (f) => f.mintAuthority === true,
    reason: () => "Mint authority is still open — the supply can be inflated at any time.",
  },
  {
    id: "freeze_authority",
    test: (f) => f.freezeAuthority === true,
    reason: () => "Freeze authority is still open — holders can be frozen out of their own tokens.",
  },
  {
    id: "no_pool",
    test: (f) => f.lpProof === "no_pool",
    reason: () => "No Solana pool was found for this mint — there is nothing to trade against.",
  },
  {
    // Only when the burn was actually measured and came up short.
    id: "lp_unlocked",
    test: (f) => f.lpProof === "not_burned",
    reason: (f) => `Liquidity is not locked${f.lpDetail ? ` (${f.lpDetail})` : ""}.`,
  },
  {
    /* Depth is only a finding when the pool was read — and only when
     * there IS a pool. "Pool liquidity is $0, under the $2,500 floor"
     * next to "no Solana pool was found" reads as a measurement of a
     * shallow pool rather than the absence of one, and published alone
     * it is simply the wrong finding. no_pool already refuses; this
     * rule has nothing to add to it. */
    id: "lp_thin",
    test: (f) => usd(f.lpUsd) !== null && f.lpProof !== "unavailable" && f.lpProof !== "no_pool"
      && Number(f.lpUsd) < config.minLpUsd,
    reason: (f) => `Pool liquidity is $${usd(f.lpUsd)}, under the $${usd(config.minLpUsd)} floor.`,
  },
  {
    // Concentration is only a finding when holders were sampled.
    id: "whale",
    test: (f) => Number(f.holdersSampled ?? 0) > 0 && pct(f.topHolderPct) !== null
      && Number(f.topHolderPct) > config.maxTopHolderPct,
    reason: (f) => `One wallet holds ${pct(f.topHolderPct)}% of supply — over the ${config.maxTopHolderPct}% ceiling.`,
  },
  {
    // A link that answers nothing, is gone, or is broken is a dead ad.
    // A link that answers "not for you" is a different thing entirely —
    // half the legitimate web sits behind a bot filter. That case is a
    // flag, further down, not a refusal.
    id: "link_dead",
    test: (f) => {
      const s = Number(f.linkStatus);
      // Status 0 is "we never got an answer", which can be their host
      // or our egress. It is a flag further down, not a refusal —
      // unless the threat rule caught something on its own.
      return s === 404 || s === 410 || s >= 500;
    },
    reason: (f) => `The destination link does not resolve (${f.linkStatus}).`,
  },
  {
    // "unchecked" and "missing" both moved out: one is our checker
    // failing, the other is our not having a link at all. Neither is a
    // finding about their destination. What is left here is something
    // Safe Browsing or our own SSRF guard actually found.
    id: "link_threat",
    test: (f) => f.linkThreat !== "none" && f.linkThreat !== "unchecked" && f.linkThreat !== "missing",
    reason: (f) => `The destination link is flagged malicious (${f.linkThreat}).`,
  },
  {
    id: "ticker_taken",
    test: (f) => f.tickerTaken === true,
    reason: (f) => `$${f.ticker || "this ticker"} is already on the wall.`,
  },
];

export const SOFT_RULES = [
  {
    id: "thin_pool",
    test: (f) => f.lpProof !== "no_pool" && Number(f.lpUsd || 0) < config.flagLpUsd,
    reason: (f) => `Thin liquidity: $${Math.round(f.lpUsd || 0).toLocaleString("en-US")} in the pool.`,
  },
  {
    id: "young",
    test: (f) => Number(f.ageHours ?? 0) < config.flagAgeHours,
    reason: (f) => `The pool is ${Math.max(0, Math.round(Number(f.ageHours || 0)))} hours old.`,
  },
  {
    id: "concentrated",
    test: (f) => Number(f.topHolderPct ?? 0) > config.flagTopHolderPct,
    reason: (f) => `Largest wallet holds ${Number(f.topHolderPct).toFixed(1)}% of supply.`,
  },
  {
    id: "link_no_answer",
    test: (f) => Number(f.linkStatus) === 0 && f.linkThreat === "none",
    reason: () => "The destination never answered our check, so we could not confirm where it lands.",
  },
  {
    id: "link_unverified",
    test: (f) => {
      const s = Number(f.linkStatus);
      return s >= 400 && s < 500 && s !== 404 && s !== 410;
    },
    reason: (f) => `The destination answered ${f.linkStatus} to our check, so we could not confirm where it lands.`,
  },
  {
    /* `linkRedirected` testait « il y a eu un saut ». Un lien qui part
     * de c4t.cat et arrive sur c4t.cat en avait fait un, selon nous, et
     * la ligne partait sous leur siège. Ce qui vaut d'être dit, c'est
     * qu'un lien n'atterrit pas là où il annonce — donc un saut qui
     * CHANGE de domaine. Le reste est notre plomberie. */
    id: "redirect",
    test: (f) => f.linkOffsite === true,
    reason: (f) => `The link redirects before it lands${f.finalUrl ? ` (ends at ${safeHost(f.finalUrl)})` : ""}.`,
  },
  {
    id: "lp_burn_only",
    test: (f) => f.lpMethod === "protocol_burn",
    reason: () => "Liquidity is locked by the launchpad's own migration, not by an independent lock.",
  },
];

function safeHost(url) {
  try { return new URL(url).host; } catch { return "another domain"; }
}

/**
 * @param {object} facts produced by facts.js — never by a request body
 * @returns {{verdict:'clear'|'flagged'|'refused', reasons:string[], flags:string[], ruleIds:string[], summary:string, escalate:boolean}}
 */
export async function screen(facts) {
  // A screener that cannot run must stop the sale, not wave it through.
  if (!agentsEnabled() || !agentEnabled("screener")) {
    return {
      verdict: "refused",
      reasons: ["Contract checks are paused. Nothing can be sold while they are off."],
      flags: [], ruleIds: ["screener_disabled"],
      summary: "Screening paused.",
      escalate: true,
    };
  }

  // Not a refusal: we established nothing, so we assert nothing.
  if (!facts || facts.gatherError) {
    return {
      verdict: "incomplete",
      reasons: ["The contract checks could not run, so nothing about this token was verified."],
      flags: [], ruleIds: ["no_facts"],
      summary: "Checks unavailable.",
      escalate: false,
      detail: facts?.gatherError || "no facts supplied",
    };
  }

  // A check that did not run is our problem, not the token's. Hold the
  // sale, publish nothing, invite them back.
  const unresolved = UNRESOLVED_RULES.filter((r) => r.test(facts));
  if (unresolved.length) {
    return {
      verdict: "incomplete",
      reasons: unresolved.map((r) => r.reason(facts)),
      flags: [], ruleIds: unresolved.map((r) => r.id),
      summary: `${unresolved.length} check${unresolved.length > 1 ? "s" : ""} could not run.`,
      escalate: false,
    };
  }

  const failed = HARD_RULES.filter((r) => r.test(facts));
  if (failed.length) {
    return {
      verdict: "refused",
      reasons: failed.map((r) => r.reason(facts)),
      flags: [], ruleIds: failed.map((r) => r.id),
      summary: `Refused on ${failed.length} contract check${failed.length > 1 ? "s" : ""}.`,
      escalate: false,
    };
  }

  const gaps = UNVERIFIABLE_RULES.filter((r) => r.test(facts));
  const flags = [...gaps, ...SOFT_RULES.filter((r) => r.test(facts))];
  if (flags.length) {
    return {
      verdict: "flagged",
      reasons: flags.map((r) => r.reason(facts)),
      flags: flags.map((r) => r.id), ruleIds: flags.map((r) => r.id),
      summary: `Passed the contract checks with ${flags.length} flag${flags.length > 1 ? "s" : ""} shown publicly.`,
      escalate: false,
    };
  }

  // Nothing below this line may claim a lock that was never proven.
  if (facts.lpLocked !== true) {
    return {
      verdict: "incomplete",
      reasons: ["The liquidity lock was not established."],
      flags: [], ruleIds: ["lp_unproven"],
      summary: "Lock not established.",
      escalate: false,
    };
  }

  return {
    verdict: "clear",
    reasons: [
      "Mint and freeze authorities are revoked.",
      `Liquidity is locked (${facts.lpDetail || "verified on chain"}).`,
      ...(Number(facts.lpUsd) > 0
        ? [`Pool depth $${usd(facts.lpUsd)} across ${facts.holdersSampled} holders sampled.`]
        : []),
      `Largest wallet holds ${Number(facts.topHolderPct || 0).toFixed(1)}% of supply.`,
      "The destination link resolves and is not flagged.",
    ],
    flags: [], ruleIds: [],
    summary: "Passed every contract check run at purchase.",
    escalate: false,
  };
}

/** What the public sees under a seat. Never more than what was checked. */
export function publicBadge(verdict) {
  return verdict === "clear" ? "SCREENED" : verdict === "flagged" ? "FLAGS FOUND" : null;
}
