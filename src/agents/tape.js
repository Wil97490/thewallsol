import { agentEnabled, agentsEnabled, audit, guardAndQueue, queueForHuman } from "../guardrails.js";
import { isAutonomous } from "../graduation.js";
import { ask, ModelUnavailable } from "./claude.js";

/* ------------------------------------------------------------------ *
 * TAPE — the hourly line the site posts about itself.
 *
 * It reports what happened. It never characterises a token, never
 * suggests an action, and never says a word about where a price is
 * going. The deterministic line below is the source of truth; the model
 * is only allowed to re-phrase it, and only when the phrasing survives
 * the output guard.
 * ------------------------------------------------------------------ */

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const seatNo = (n) => "№" + String(n).padStart(2, "0");

/** The line the site posts when nothing else is allowed to. Always safe. */
export function baseLine(w = {}) {
  const parts = [];
  const takeovers = w.takeovers || [];

  if (takeovers.length) {
    const t = takeovers[0];
    parts.push(t.from
      ? `$${t.ticker} took ${seatNo(t.seatNo)} from $${t.from} for ${usd(t.usd)}.`
      : `$${t.ticker} entered at ${seatNo(t.seatNo)} for ${usd(t.usd)}.`);
  }

  if (w.seatsSold) {
    parts.push(`${usd(w.totalUsd)} posted in the last hour across ${w.seatsSold} seat${w.seatsSold > 1 ? "s" : ""}.`);
  } else if (!takeovers.length) {
    parts.push(`Quiet hour. No seats changed hands.`);
  }

  const chains = Object.entries(w.byChain || {}).sort((a, b) => b[1] - a[1]);
  if (chains.length && w.seatsSold) {
    const [name, share] = chains[0];
    parts.push(`${name.toUpperCase()} holds ${Math.round(share * 100)}% of the wall.`);
  }

  if (w.refused) parts.push(`${w.refused} refused at the gate.`);

  return parts.join(" ");
}

const SYSTEM = `You rewrite one line of a market tape for a public wall of memecoin listings.
Report only what the facts say. Keep every number exactly as given.
Never characterise a token (no "safe", "solid", "legit"), never predict a price, never suggest anyone buy anything,
never add a disclaimer. Neutral, dry, under 180 characters. Answer with the line only, no quotes.`;

export async function writeTape(window, { store } = {}) {
  if (!agentsEnabled() || !agentEnabled("tape")) {
    return { published: false, skipped: true, reason: "tape agent disabled" };
  }
  if (!window || (!window.seatsSold && !(window.takeovers || []).length)) {
    return { published: false, skipped: true, reason: "nothing happened" };
  }

  const fallback = baseLine(window);
  let post = fallback;
  let source = "deterministic";

  try {
    const line = await ask({ system: SYSTEM, prompt: JSON.stringify(window), maxTokens: 120 });
    if (line && line.length <= 220) { post = line; source = "model"; }
  } catch (err) {
    if (!(err instanceof ModelUnavailable)) await audit("tape", "model_error", { err: String(err.message || err) });
  }

  let guard = await guardAndQueue(post, "tape", { window, source });
  if (!guard.ok && source === "model") {
    // The model's phrasing broke a rule. Fall back, and keep the demotion:
    // the agent still said it, and the record should show that.
    post = fallback;
    source = "deterministic_after_guard";
    guard = await guardAndQueue(post, "tape", { window, source });
  }
  if (!guard.ok) {
    await audit("tape", "blocked", { violations: guard.violations, post });
    return { published: false, blocked: true, violations: guard.violations };
  }

  const auto = await isAutonomous("tape");
  if (!auto) {
    const row = await queueForHuman("tape", "publish_review", { text: post, window, source });
    await audit("tape", "queued", { id: row.id, source });
    return { published: false, queued: true, post, id: row.id, source };
  }

  if (store?.publishPost) await store.publishPost(post);
  await audit("tape", "published", { post, source });
  return { published: true, post, source };
}
