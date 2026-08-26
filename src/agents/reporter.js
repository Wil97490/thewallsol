import { agentEnabled, agentsEnabled, audit, guardAndQueue, queueForHuman } from "../guardrails.js";
import { isAutonomous } from "../graduation.js";
import { ask, ModelUnavailable } from "./claude.js";

/* ------------------------------------------------------------------ *
 * REPORTER — the daily note to someone who bought a seat.
 *
 * It tells them what happened to their seat. It does not congratulate
 * them, does not tell them to defend their position, and does not
 * suggest they spend more. If the only honest thing to say is "nothing
 * happened", it says that and stops.
 * ------------------------------------------------------------------ */

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const seatNo = (n) => "№" + String(n).padStart(2, "0");

export function baseReport(b = {}) {
  const lines = [
    `Seat ${seatNo(b.seatNo)} — $${b.ticker}`,
    ``,
    `Held for ${Math.max(1, Math.round(Number(b.hoursHeld || 0)))} hours.`,
    `Current takeover price: ${usd(b.takeoverPrice)}.`,
  ];
  if (b.takeoverAttempts) lines.push(`${b.takeoverAttempts} takeover attempt${b.takeoverAttempts > 1 ? "s" : ""} were refused at the gate.`);
  if (b.views) lines.push(`${Number(b.views).toLocaleString("en-US")} views on the wall.`);
  if (b.badge === "FLAGS FOUND" && b.flags?.length) {
    lines.push(``, `Your seat still shows these flags publicly:`, ...b.flags.map((f) => `  - ${f}`));
  }
  if (b.displaced) lines.push(``, `Your seat was taken by $${b.displaced} at ${usd(b.displacedFor)}.`);
  lines.push(``, `Manage your seat: ${b.manageUrl || ""}`);
  return lines.join("\n");
}

const SYSTEM = `You write one short factual email to someone who bought a numbered seat on a public wall.
Report only the facts given. Keep every number exactly as given.
Never congratulate, never encourage them to spend more, never suggest defending or reclaiming a seat,
never characterise any token, never predict anything, never add a disclaimer.
Plain text, under 120 words. Answer with the email body only.`;

export async function report(buyer, { store } = {}) {
  if (!agentsEnabled() || !agentEnabled("reporter")) {
    return { sent: false, skipped: true, reason: "reporter agent disabled" };
  }
  if (!buyer?.contact) return { sent: false, skipped: true, reason: "no contact on file" };

  const fallback = baseReport(buyer);
  let body = fallback;
  let source = "deterministic";

  try {
    const text = await ask({ system: SYSTEM, prompt: JSON.stringify(buyer), maxTokens: 400 });
    if (text) { body = text; source = "model"; }
  } catch (err) {
    if (!(err instanceof ModelUnavailable)) await audit("reporter", "model_error", { err: String(err.message || err) });
  }

  let guard = await guardAndQueue(body, "reporter", { ticker: buyer.ticker, source });
  if (!guard.ok && source === "model") {
    body = fallback;
    source = "deterministic_after_guard";
    guard = await guardAndQueue(body, "reporter", { ticker: buyer.ticker, source });
  }
  if (!guard.ok) {
    await audit("reporter", "blocked", { ticker: buyer.ticker, violations: guard.violations });
    return { sent: false, blocked: true, violations: guard.violations };
  }

  const subject = `${seatNo(buyer.seatNo)} — $${buyer.ticker} — daily`;
  const auto = await isAutonomous("reporter");
  if (!auto) {
    const row = await queueForHuman("reporter", "send_review", { text: body, subject, ticker: buyer.ticker, contact: buyer.contact, source });
    await audit("reporter", "queued", { id: row.id, ticker: buyer.ticker });
    return { sent: false, queued: true, subject, body, id: row.id };
  }

  if (store?.sendEmail) await store.sendEmail(buyer.contact, subject, body);
  await audit("reporter", "sent", { ticker: buyer.ticker, seatNo: buyer.seatNo });
  return { sent: true, subject, body, source };
}
