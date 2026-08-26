import { config } from "../config.js";
import { agentEnabled, agentsEnabled, audit, guardOutput } from "../guardrails.js";
import { ask, ModelUnavailable } from "./claude.js";

/* ------------------------------------------------------------------ *
 * POSTER — what the account says out loud.
 *
 * Three rules, and they are the whole design:
 *
 *   1. It never promotes. A wall that filters cannot also be a hype
 *      account: the first ticker that goes to zero an hour after we
 *      cheered for it takes the promise down with it. So the voice is
 *      a registrar's — it records what happened and what was refused.
 *
 *   2. The facts come from the screener, never from the model. A model
 *      allowed to write freely about a token will eventually produce a
 *      judgement about a financial asset, signed by us. The templates
 *      below are filled from measurements; the model may only rephrase
 *      a finished line, and only if the guard still passes afterwards.
 *
 *   3. No link in the body. A link costs ~13x more to publish through
 *      the API and the algorithm buries the post carrying it. The link
 *      belongs in the profile.
 * ------------------------------------------------------------------ */

const LIMIT = 280;

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

/** Compact, for a line that has to share 280 characters with a finding. */
export function short(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "k";
  return "$" + Math.round(v);
}
const seatNo = (n) => "№" + String(n).padStart(2, "0");
const tick = (t) => "$" + String(t || "").replace(/^\$/, "").toUpperCase();

/** Hours, then days — never "a while ago". */
export function heldFor(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1) return null;
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 48) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

/**
 * Trim to the character limit on a sentence boundary. Never mid-number:
 * a truncated figure is a wrong figure, and this account's only asset
 * is that its figures are right.
 */
export function fit(text, limit = LIMIT) {
  const s = String(text || "").trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"), cut.lastIndexOf("\n\n"));
  if (stop > limit * 0.5) return cut.slice(0, stop + 1).trim();
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/* ---- the three things worth saying -------------------------------- */

/**
 * A refusal.
 *
 * Two shapes, and conflating them would be a lie. "Refused at the gate"
 * means a buyer arrived and was turned away — we declined the money.
 * A contract we screened on our own initiative was never submitted by
 * anyone, and saying otherwise invents a customer. It is the same
 * measurement; it is not the same claim.
 */
export function refusalDraft(r, { floorUsd = config.seatFloorUsd } = {}) {
  const reasons = (r.reasons || []).slice(0, 2).join(" ");
  if (r.source === "probe") return probeDraft({ ticker: r.ticker, verdict: "refused", reasons: r.reasons, vol24Usd: r.vol24Usd });
  return fit(
    `Refused at the gate.\n\n${tick(r.ticker)} — ${reasons}\n\n${usd(floorUsd)} not taken.`
  );
}

/**
 * A contract we checked on our own initiative — see agents/scout.js.
 *
 * THE LINE THIS FUNCTION HOLDS: a probe publishes findings, never a
 * pass. "We checked a token nobody asked about and it is fine" is an
 * endorsement of a financial asset, signed by an account that also
 * sells advertising to that asset's competitors. There is no wording
 * that makes it safe, so `clear` returns null and the account stays
 * quiet.
 *
 * A flag can be published, because a flag is a named property of the
 * contract and it ships with its own caveat. Note the tail: it says the
 * seat would carry the flag, not that the token is good.
 */
export function probeDraft({ ticker, verdict, reasons = [], vol24Usd = null }) {
  const why = (reasons || []).slice(0, 2).join(" ");
  if (!ticker || !why) return null;

  if (verdict === "refused") {
    /* The traded volume, and ONLY on a refusal.
     *
     * A finding lands or not depending on what it sits next to: "$2,057
     * in the pool" is a small number about a small thing, while "$1.3M
     * traded in 24h through a $2,057 pool" is the same measurement doing
     * all of its work. Both figures come off the same DexScreener
     * response the depth was read from — no new claim, no new call.
     *
     * It is withheld from a flagged draft on purpose. There the seat WOULD
     * sell, and "traded $1.3M in 24h" next to a mild reservation stops
     * being context and starts being free advertising for a token nobody
     * submitted. Volume sharpens a refusal; it flatters everything else. */
    const traded = short(vol24Usd);
    const lead = traded ? `${traded} traded in 24h. ` : "";
    return fit(`Not submitted — we ran the checks anyway.\n\n${tick(ticker)} — ${lead}${why}\n\nIt would not get a seat.`);
  }

  if (verdict === "flagged") {
    return fit(`Not submitted — we ran the checks anyway.\n\n${tick(ticker)} — ${why}\n\nIt would get a seat, with that printed on it.`);
  }
  return null;
}

/** A seat sold. A registry entry, not an announcement. */
export function saleDraft(seat) {
  const checked = (seat.reasons || []).slice(0, 2).join(" ");
  const head = `${seatNo(seat.no)} — ${tick(seat.ticker)}.`;
  const body = checked ? `\n\nChecked before it went up: ${checked}` : "";
  const tail = `\n\n${usd(seat.priceUsd)}. Anyone can take it from ${usd(seat.takeoverUsd)}.`;
  return fit(head + body + tail);
}

/** A displacement. The most watchable thing the wall does. */
export function takeoverDraft(t) {
  const held = heldFor(t.heldMinutes);
  const head = `${seatNo(t.seatNo)} changed hands.`;
  const body = t.displacedBy
    ? `\n\n${tick(t.displacedBy)} took it from ${tick(t.ticker)}.`
    : `\n\n${tick(t.ticker)} lost it.`;
  const tail = held ? `\n\n${tick(t.ticker)} held it ${held}.` : "";
  return fit(head + body + tail);
}

/* ---- the month, in numbers -----------------------------------------
 * A registrar's rhythm. It gives somebody the daily post did not
 * convince a reason to follow, and it costs nothing to produce because
 * the numbers already exist.
 *
 * Every figure is a count of something that happened. There is no
 * "great month" and no "excited to announce": if the month was quiet,
 * the post says the month was quiet, and that is the version worth
 * publishing — an account that only reports good months is reporting
 * nothing.
 * ------------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function monthlyDraft({ monthIndex, year, checked = 0, refused = 0, sold = 0, takeovers = 0, seats = 24 }) {
  const name = MONTHS[monthIndex] || "";
  const head = `${name} on the wall.`;

  /* The count of contracts checked comes off the audit log, which is
   * capped and rotates. When the window did not cover the whole month it
   * comes back smaller than the things it is supposed to contain — and
   * "0 contracts checked, 12 refused" is a visible lie in a post whose
   * only asset is that its numbers are right. So the line is dropped
   * rather than fudged: a missing figure is honest, a wrong one is not. */
  const coherent = Number(checked) >= Number(refused) + Number(sold);
  const lines = [
    ...(coherent ? [`${checked} contracts checked`] : []),
    `${refused} refused and published`,
    `${sold} ${sold === 1 ? "seat" : "seats"} sold of ${seats}`,
  ];
  if (takeovers > 0) lines.push(`${takeovers} ${takeovers === 1 ? "seat" : "seats"} changed hands`);

  // The one editorial judgement allowed here, and it only ever points
  // downward: an empty month gets said out loud rather than dressed up.
  const tail = refused === 0 && sold === 0
    ? "Nothing was turned away and nothing was sold. Both numbers are published either way."
    : "Every refusal is on the site, with what was measured.";

  return fit(`${head}\n\n${lines.join("\n")}\n\n${tail}`);
}

/* ---- what to say today -------------------------------------------- */

/**
 * Rank by what a reader would actually stop for. Displacement first —
 * it is the only event with two named parties. Refusals next, because
 * nobody else publishes theirs. Sales last: they are the least
 * surprising thing a shop can announce.
 */
const WEIGHT = { takeover: 3, refusal: 2, sale: 1 };

export function draftPosts({ refusals = [], seats = [], takeovers = [], max = 12 } = {}) {
  const out = [];

  for (const t of takeovers) {
    if (!t?.ticker || !t?.seatNo) continue;
    out.push({ kind: "takeover", key: `takeover:${t.seatNo}:${t.displacedAt}`, at: t.displacedAt, text: takeoverDraft(t), event: t });
  }
  for (const r of refusals) {
    if (r?.posted || r?.hidden || !r?.ticker || !(r.reasons || []).length) continue;
    out.push({ kind: "refusal", key: `refusal:${r.id}`, at: r.at, text: refusalDraft(r), event: r, card: true });
  }
  for (const s of seats) {
    if (s?.status !== "taken" || !s?.ticker) continue;
    out.push({ kind: "sale", key: `sale:${s.no}:${s.since}`, at: s.since, text: saleDraft(s), event: s, card: true });
  }

  return out
    .filter((d) => d.text && guardOutput(d.text, "poster").ok)
    .sort((a, b) => (WEIGHT[b.kind] - WEIGHT[a.kind]) || (a.at < b.at ? 1 : -1))
    .slice(0, max)
    .map((d) => ({ ...d, chars: d.text.length }));
}

/* ---- the model, on a short leash ---------------------------------- */

const SYSTEM = `You rewrite one short post for the account of a wall that sells numbered
advertising seats to memecoin projects and screens every contract before selling.

Keep every number, ticker and seat number exactly as given. Keep the line breaks.
Report only what the text already says. Never characterise a token (no "safe", "legit", "solid"),
never predict a price, never tell anyone to buy, never add a disclaimer, never add a link
or a hashtag. Dry, flat, factual — a registrar, not a marketer. Under 280 characters.
Answer with the post only, no quotes.`;

/**
 * Optional. With no key, no flag, or any guard violation, the
 * deterministic draft is what you get — which is already publishable.
 * The model can improve a line here; it can never be the reason a
 * wrong one goes out.
 */
export async function polish(draft) {
  if (!agentsEnabled() || !agentEnabled("poster")) return { ...draft, source: "deterministic" };
  try {
    const line = await ask({ system: SYSTEM, prompt: draft.text, maxTokens: 200 });
    if (!line || line.length > LIMIT) return { ...draft, source: "deterministic" };
    if (!guardOutput(line, "poster").ok) {
      await audit("poster", "guard_blocked_model", { kind: draft.kind, key: draft.key });
      return { ...draft, source: "deterministic_after_guard" };
    }
    return { ...draft, text: line, chars: line.length, source: "model" };
  } catch (err) {
    if (!(err instanceof ModelUnavailable)) await audit("poster", "model_error", { err: String(err.message || err) });
    return { ...draft, source: "deterministic" };
  }
}

/** Everything worth posting right now, best first, ready to copy. */
export async function compose(input) {
  const drafts = draftPosts(input);
  return Promise.all(drafts.map(polish));
}
