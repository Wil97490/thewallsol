import { writeAudit, writeQueue, bumpCounter } from "./storage.js";
import { isAutonomous, demote } from "./graduation.js";
import { config } from "./config.js";

/* ------------------------------------------------------------------ *
 * Guardrails: the part that has to work when the agents don't.
 * Nothing an agent produces reaches a user or a chain without passing
 * through here first.
 * ------------------------------------------------------------------ */

export const agentsEnabled = () => config.agentsEnabled();
export const agentEnabled = (name) => config.agentEnabled(name);

/**
 * Append-only record of every agent decision.
 * Returns the promise: callers on the checkout path MUST await it, or
 * the response ends and Cloud Run can freeze the process mid-write.
 */
export function audit(agent, action, payload = {}) {
  return writeAudit({ agent, action, ...payload }).catch((err) => {
    console.error(JSON.stringify({ severity: "ERROR", kind: "audit_failed", err: String(err) }));
  });
}

/* ---- output guard -------------------------------------------------
 * Anything an agent publishes is something the site said. These are the
 * sentences the site must never be caught saying about a token.
 * ------------------------------------------------------------------ */

export const BANNED = [
  /\b(safe|legit|solid|trustworthy|not a (rug|scam))\b/i,
  /\b(will|gonna|going to)\s+(pump|moon|10x|100x|rip)\b/i,
  /\b(ape|get in|don'?t miss|last chance|early)\b/i,
  /\bbuy\b(?!ers?\b)/i,                     // "buy" is a call to action; "buyers" is a noun
  /\b(guaranteed|risk[- ]free|sure thing)\b/i,
  /\b(we (recommend|endorse|back|vouch))\b/i,
  /\bnot financial advice\b/i,              // if you need the disclaimer, the sentence is wrong
  /\b(price target|market ?cap will|undervalued)\b/i,
];

/**
 * Fail closed: a violation means the text is dropped and queued for a
 * human, never "cleaned up" automatically. A guard hit also demotes the
 * agent out of autonomy immediately.
 *
 * Sync by design so it can be called from anywhere; the demotion write
 * is fired off and awaited by callers that care (see guardAndQueue).
 */
export function guardOutput(text, agent) {
  const s = String(text ?? "");
  const violations = BANNED.filter((re) => re.test(s)).map((re) => re.source);
  return { ok: violations.length === 0, violations };
}

/** The version to use when an agent is about to publish. */
export async function guardAndQueue(text, agent, context = {}) {
  const res = guardOutput(text, agent);
  if (!res.ok) {
    await demote(agent, "output_guard");
    await queueForHuman(agent, "output_guard", { text, violations: res.violations, ...context });
  }
  return res;
}

/* ---- rate limiting ------------------------------------------------
 * Shared through storage, so a looping agent cannot spend your money
 * twice by being scheduled onto two instances.
 * ------------------------------------------------------------------ */

export async function withinRate(key, max, windowMs) {
  try {
    const n = await bumpCounter(key, windowMs);
    return n <= max;
  } catch {
    return false;                              // can't count → don't spend
  }
}

export const withinModelBudget = () =>
  withinRate("model_calls", config.modelCallsPerHour, 3_600_000);

/* ---- human queue -------------------------------------------------- */

export function queueForHuman(agent, reason, payload = {}) {
  return writeQueue({ agent, reason, ...payload });
}

/**
 * Autonomy is earned, not configured. See graduation.js — an agent goes
 * unsupervised once its reviewed track record clears the thresholds, and
 * drops back the moment the output guard fires.
 */
export const autonomous = isAutonomous;
