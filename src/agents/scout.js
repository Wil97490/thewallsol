import { getJson } from "../solana/rpc.js";
import { isSolanaAddress } from "../lib/base58.js";

/* ------------------------------------------------------------------ *
 * SCOUT — who to check today.
 *
 * The wall's only distribution asset is the refusal ledger. Nobody else
 * publishes theirs, and a refusal is the one piece of content that
 * arrives with an audience already attached: the ticker's own holders.
 *
 * But that only works if the ticker HAS holders. A measured refusal of
 * a token nobody trades is correct and reaches nobody. So this file
 * answers one question — which contracts are worth the gate's time —
 * and it answers it with the same discipline as the screener: on
 * measurements, and never by asserting what it has not established.
 *
 * WHERE THE CANDIDATES COME FROM
 *
 * Every source here is a list of projects that are ALREADY BUYING
 * ATTENTION: DexScreener boosts and ads are paid placements, token
 * profiles are claimed listings, trending metas are the narratives
 * money is chasing this week. That is not incidental — it is the wall's
 * actual addressable market. A project paying for a boost is a project
 * that would pay for a seat, and checking it before it asks is the
 * whole pitch.
 *
 * WHAT THIS FILE MUST NEVER DO
 *
 *   1. Decide anything. It proposes contracts; screener.js judges them.
 *      Nothing here may look like a verdict, a rating, or a score
 *      published next to a ticker.
 *   2. Trust a shape. Every source is undocumented and can change
 *      without notice. A source that breaks contributes zero candidates
 *      and says so — it never throws, and it never sinks the run.
 *   3. Reach for a key. All of this is public and unauthenticated. The
 *      day it needs a key is the day the daily post stops happening.
 * ------------------------------------------------------------------ */

const API = "https://api.dexscreener.com";

/* ---- sources -------------------------------------------------------
 * Each one is: a URL, and a function that digs mints out of whatever
 * comes back. `pick` runs inside a try/catch — write it optimistically,
 * it cannot break the run.
 * ------------------------------------------------------------------ */

const rows = (j) => (Array.isArray(j) ? j : Array.isArray(j?.pairs) ? j.pairs : []);

export const SOURCES = [
  {
    id: "boost_top",
    url: `${API}/token-boosts/top/v1`,
    // Projects that have spent the most on DexScreener visibility.
    // The heaviest advertisers on Solana, ranked by spend.
    note: "top boost spend",
    pick: (j) => rows(j).map((b) => ({ mint: b.tokenAddress, chain: b.chainId, weight: Number(b.totalAmount || b.amount || 0) })),
  },
  {
    id: "boost_new",
    url: `${API}/token-boosts/latest/v1`,
    note: "boost bought just now",
    pick: (j) => rows(j).map((b) => ({ mint: b.tokenAddress, chain: b.chainId, weight: Number(b.amount || 0) })),
  },
  {
    id: "ads",
    url: `${API}/ads/latest/v1`,
    // Literally an advertising buy. The closest thing on the internet
    // to a list of people who want what the wall sells.
    note: "running an ad right now",
    pick: (j) => rows(j).map((a) => ({ mint: a.tokenAddress, chain: a.chainId, weight: Number(a.impressions || 0) })),
  },
  {
    id: "profiles",
    url: `${API}/token-profiles/latest/v1`,
    note: "just claimed its listing",
    pick: (j) => rows(j).map((p) => ({ mint: p.tokenAddress, chain: p.chainId, weight: 0 })),
  },
];

/**
 * Pull every source. Never throws: a dead source is reported, not fatal.
 * @returns {{candidates: Array, sources: Array}} provenance included, because
 *          "where did this come from" is the first thing you ask at 7am.
 */
export async function discover({ ms = 6000, chain = "solana", get = getJson } = {}) {
  const settled = await Promise.allSettled(
    SOURCES.map(async (s) => ({ s, picked: s.pick(await get(s.url, ms)) }))
  );

  const seen = new Map();
  const report = [];

  settled.forEach((r, i) => {
    const s = SOURCES[i];
    if (r.status !== "fulfilled") {
      report.push({ id: s.id, ok: false, found: 0, error: String(r.reason?.message || r.reason).slice(0, 160) });
      return;
    }
    let kept = 0;
    for (const c of r.value.picked || []) {
      if (!c?.mint || c.chain !== chain || !isSolanaAddress(c.mint)) continue;
      kept += 1;
      const prev = seen.get(c.mint);
      if (prev) {
        // Appearing on two paid lists at once is itself a signal.
        if (!prev.via.includes(s.id)) prev.via.push(s.id);
        prev.weight = Math.max(prev.weight, c.weight || 0);
        continue;
      }
      seen.set(c.mint, { mint: c.mint, via: [s.id], weight: c.weight || 0 });
    }
    report.push({ id: s.id, ok: true, found: kept, note: s.note });
  });

  return { candidates: [...seen.values()], sources: report };
}

/* ---- enrichment ----------------------------------------------------
 * The one DexScreener shape this file depends on for FIELDS is the same
 * one pool.js has been reading in production since day one. Everything
 * above only has to yield an address.
 * ------------------------------------------------------------------ */

const CHUNK = 25;                                 // the endpoint takes a comma list; keep the URL sane

/** Deepest Solana pair per mint, with the numbers eligibility reads. */
export async function enrich(mints, { ms = 6000, get = getJson } = {}) {
  const out = [];
  for (let i = 0; i < mints.length; i += CHUNK) {
    const batch = mints.slice(i, i + CHUNK);
    let j;
    try {
      j = await get(`${API}/latest/dex/tokens/${batch.map(encodeURIComponent).join(",")}`, ms);
    } catch {
      continue;                                   // this batch is simply unknown, not wrong
    }
    const byMint = new Map();
    for (const p of j?.pairs || []) {
      if (p.chainId !== "solana") continue;
      const mint = p.baseToken?.address;
      if (!mint) continue;
      const cur = byMint.get(mint);
      if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) byMint.set(mint, p);
    }
    for (const [mint, p] of byMint) out.push(market(mint, p));
  }
  return out;
}

function market(mint, p) {
  return {
    mint,
    ticker: String(p.baseToken?.symbol || "").replace(/^\$/, "").toUpperCase().slice(0, 16),
    name: p.baseToken?.name || null,
    dexId: (p.dexId || "").toLowerCase(),
    pair: p.pairAddress || null,
    priceUsd: Number(p.priceUsd || 0),
    lpUsd: Math.round(p.liquidity?.usd || 0),
    fdvUsd: Math.round(p.fdv || p.marketCap || 0),
    vol24Usd: Math.round(p.volume?.h24 || 0),
    vol6Usd: Math.round(p.volume?.h6 || 0),
    txns24: Number(p.txns?.h24?.buys || 0) + Number(p.txns?.h24?.sells || 0),
    change24: Number(p.priceChange?.h24 || 0),
    ageHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : null,
    // The site the project points its own buyers at. It is what the
    // gate's link check would read, so the probe checks a real
    // destination rather than nothing.
    link: firstLink(p.info),
    // Every published way to reach them. Not for the gate — for the half
    // of this file that finds people to sell a seat to.
    links: contacts(p.info),
  };
}

/** Where a human could actually write to this project. */
function contacts(info) {
  const out = { website: null, twitter: null, telegram: null, other: [] };
  for (const w of info?.websites || []) {
    if (w?.url && !out.website) out.website = w.url;
  }
  for (const s of info?.socials || []) {
    const url = s?.url;
    if (!url) continue;
    const kind = String(s.type || s.platform || "").toLowerCase();
    if (!out.twitter && (kind.includes("twitter") || kind === "x" || /(?:^|\/\/)(?:www\.)?(?:x|twitter)\.com\//i.test(url))) out.twitter = url;
    else if (!out.telegram && (kind.includes("telegram") || /t\.me\//i.test(url))) out.telegram = url;
    else if (out.other.length < 3) out.other.push(url);
  }
  return out;
}

function firstLink(info) {
  const web = (info?.websites || []).map((w) => w?.url).filter(Boolean);
  if (web.length) return web[0];
  const soc = (info?.socials || []).map((s) => s?.url).filter(Boolean);
  return soc[0] || null;
}

/* ---- who is off limits ---------------------------------------------
 * Refusing USDC was a good post once, because the finding was about
 * OUR limits and we said so. Doing it weekly is a bit, and a bit is not
 * a ledger. Majors, stables and liquid-staking tokens are excluded by
 * address; everything else is excluded by measurement below.
 * ------------------------------------------------------------------ */

export const EXCLUDED_MINTS = new Set([
  "So11111111111111111111111111111111111111112",  // wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",  // mSOL
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", // stSOL
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", // jitoSOL
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  // JUP
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4", // JLP
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF

  /* Our own token.
   *
   * The team launched $Wall on 26 August 2026 and holds part of the
   * supply — see /rules#token. It must therefore never be a candidate:
   * not in a round, not in a draft, not on the wall. A screening tool
   * that grades the thing its operator holds is not a screening tool,
   * whatever the verdict happens to be. Excluded here rather than
   * remembered, because "we would never" is not a mechanism. */
  "8nbF1nKD5uuVuMSZBGeRCGcihabcYvkvogq8QihVpump", // $Wall — ours
]);

/* ---- eligibility ---------------------------------------------------
 * Two questions only, both measured:
 *   does anyone trade it   → a refusal nobody reads is not content
 *   is it a memecoin       → the wall's market, not infrastructure
 * ------------------------------------------------------------------ */

export const ELIGIBILITY = {
  /* $25k was a guess, and the first real rounds priced it: of 81 boosted
   * Solana contracts, exactly one cleared it. The boosted population is
   * mostly small, and a cluster of genuinely traded tokens sits between
   * $10k and $23k — the band the guess was cutting off.
   *
   * The floor comes down to $10k, and the trade floor stays where it is
   * and does the real work. Dollars are the easy half to fake; 150
   * separate trades in a day is a crowd, small but real. Keeping both is
   * what stops this from becoming "anything with a chart". */
  minVol24Usd: 10_000,
  minTxns24: 150,           // volume without trades is one wallet moving size
  minLpUsd: 1_000,          // under the gate's own floor is a foregone refusal
  maxFdvUsd: 2_000_000_000, // above this it is infrastructure, not a memecoin
  maxAgeHours: 24 * 120,    // a four-month-old chart is not news
};

/**
 * @returns {{ok: boolean, why: string|null}} — `why` is for the operator's
 *          console, never for publication.
 */
export function eligible(m, limits = ELIGIBILITY) {
  const no = (kind, why) => ({ ok: false, kind, why });
  if (!m || !m.mint) return no("no_mint", "no mint");
  if (EXCLUDED_MINTS.has(m.mint)) return no("excluded", "major or stable — excluded by address");
  if (!m.ticker) return no("no_ticker", "no ticker");
  if (m.vol24Usd < limits.minVol24Usd) return no("no_volume", `24h volume $${m.vol24Usd.toLocaleString("en-US")} — no audience`);
  if (m.txns24 < limits.minTxns24) return no("no_trades", `${m.txns24} trades in 24h — no audience`);
  if (m.lpUsd < limits.minLpUsd) return no("no_pool", `pool $${m.lpUsd.toLocaleString("en-US")} — nothing to check`);
  if (m.fdvUsd > limits.maxFdvUsd) return no("too_large", "too large — infrastructure, not a memecoin");
  if (m.ageHours !== null && m.ageHours > limits.maxAgeHours) return no("too_old", "pool older than four months");
  return { ok: true, kind: null, why: null };
}

/* ---- how loud is the room ------------------------------------------
 * Reach, not quality. A high score means a refusal would be SEEN; it
 * says nothing whatsoever about the token, and it is never published.
 * ------------------------------------------------------------------ */

const log10 = (n) => Math.log10(Math.max(1, Number(n) || 0));

export function audience(m) {
  const traded = log10(m.vol24Usd) * 2;            // the dominant term, on purpose
  const people = log10(m.txns24);
  const heat = Math.min(2, Math.abs(Number(m.change24) || 0) / 50);
  // On two paid lists at once: spending on attention from two directions.
  const paid = Math.min(2, (m.via?.length || 1) - 1);
  return Number((traded + people + heat + paid).toFixed(2));
}

/* ---- is the outcome worth a post -----------------------------------
 * The gate has already spoken by the time this runs. This only asks
 * whether what it said can be published honestly.
 * ------------------------------------------------------------------ */

/** Rules whose failure is a fact about US or about the wall — never publishable
 *  as a finding against a project that never submitted anything. */
export const NOT_ABOUT_THEM = new Set([
  "ticker_taken",        // about our wall's occupancy
  "screener_disabled",   // about our switches
  "no_facts",            // about our plumbing
  "lp_unproven",
  "pool_unread",
  "holders_unread",
  "link_uncheckable",
  "holders_unmeasurable",
  "lp_lock_unverifiable",
]);

/** Findings that turn on the project's own link, probed at an address
 *  they never handed us for this purpose. Weak, and easily unfair. */
const WEAK_FOR_PROBE = new Set(["link_dead", "link_threat", "link_unverified", "link_no_answer", "redirect"]);

/** True of an entire launchpad's output, so it says nothing about the
 *  project whose name would be in the post.
 *
 *  `lp_burn_only` fires on every pump.fun migration there has ever been.
 *  Saying it once is an observation about a venue — and that post is
 *  already out. Saying it daily under a different ticker is repeating one
 *  sentence while changing the name of whoever is standing under it.
 *  It stays under a SOLD seat, where a buyer paid for the detail; it
 *  stops being a reason to name a stranger. */
const VENUE_PROPERTY = new Set(["lp_burn_only"]);

/**
 * Score an outcome for publication, and say plainly when it must not be
 * published at all.
 *
 * The rule that matters: a probe NEVER publishes a clean pass. "We
 * checked a token nobody asked about and it is fine" is an endorsement
 * of a financial asset, signed by us, about a project we have no
 * relationship with. The account does not do that — see the first
 * paragraph of poster.js. Refusals and flags are findings; a pass is an
 * opinion.
 */
export function postWorth({ verdict, ruleIds = [], market: m = {} }) {
  const reach = audience(m);

  if (verdict === "incomplete") {
    return { post: false, score: 0, why: "a check could not run — nothing was established" };
  }
  if (verdict === "pending") {
    return { post: false, score: 0, why: "held for a human check — not a verdict on the contract" };
  }
  if (verdict === "clear") {
    return { post: false, score: 0, why: "passed — the wall does not vouch for tokens nobody submitted" };
  }

  const ids = ruleIds.filter((id) => !NOT_ABOUT_THEM.has(id));
  if (!ids.length) {
    return { post: false, score: 0, why: "the only findings are about our own checks" };
  }

  const substantive = ids.filter((id) => !WEAK_FOR_PROBE.has(id));
  if (verdict === "refused" && !substantive.length) {
    return { post: false, score: 0, why: "refused only on the link — unfair to publish against an unsubmitted contract" };
  }

  // A refusal is the strongest thing the account can say. A flag is
  // worth saying when the flag is a contract property; a flag that is
  // only "young and thin" describes half of Solana.
  const kind = verdict === "refused" ? 3 : 1;
  const contentful = substantive.filter((id) => !VENUE_PROPERTY.has(id)).some((id) =>
    ["mint_authority", "freeze_authority", "lp_unlocked", "whale", "no_pool", "lp_thin", "concentrated"].includes(id));

  if (verdict === "flagged" && !contentful) {
    return { post: false, score: 0, why: "flags describe the venue or the market, not this contract" };
  }

  return { post: true, score: Number((reach * kind).toFixed(2)), why: null, ruleIds: ids };
}

/** Best first. Reach decides, because every candidate here already passed eligibility. */
export function rank(markets) {
  return [...markets]
    .map((m) => ({ ...m, audience: audience(m) }))
    .sort((a, b) => b.audience - a.audience);
}

/**
 * The whole selection step, in one call: pull, enrich, filter, rank.
 * Returns the rejected ones too — an empty shortlist with no explanation
 * is the kind of thing you stop trusting after a week.
 */
export async function shortlist({ ms = 6000, limit = 8, skip = new Set(), limits = ELIGIBILITY, get = getJson } = {}) {
  const { candidates, sources } = await discover({ ms, get });
  const fresh = candidates.filter((c) => !skip.has(c.mint));

  const markets = await enrich(fresh.map((c) => c.mint), { ms, get });
  const byMint = new Map(fresh.map((c) => [c.mint, c]));
  const joined = markets.map((m) => ({ ...m, via: byMint.get(m.mint)?.via || [] }));

  const kept = [];
  const dropped = [];
  /* Counted separately from the sample below, and never truncated.
   * `dropped` is capped so a round does not carry eighty rows nobody
   * reads — but a cap you cannot see is how "we discarded most of the
   * market" comes to look like "the market was quiet". The tally is the
   * honest number; the list is only a sample of it. */
  const why = {};
  for (const m of joined) {
    const e = eligible(m, limits);
    if (e.ok) { kept.push(m); continue; }
    why[e.kind] = (why[e.kind] || 0) + 1;
    dropped.push({ mint: m.mint, ticker: m.ticker, kind: e.kind, why: e.why });
  }

  return {
    sources,
    seen: candidates.length,
    alreadyKnown: candidates.length - fresh.length,
    priced: joined.length,
    droppedCount: dropped.length,
    droppedWhy: why,
    dropped: dropped.slice(0, 40),
    shortlist: rank(kept).slice(0, limit),
  };
}

/* ---- one a day ------------------------------------------------------
 * A ledger of refusals is worth reading because the answer is not always
 * yes. Publish four findings a day and it stops being a filter and
 * becomes a feed — and naming four projects a day is not a registrar, it
 * is a campaign against half the market you are trying to sell to.
 *
 * The rest stay in the back office, greyed, with the reason shown. The
 * restraint is a decision you can see rather than one you have to
 * remember to exercise every morning.
 * ------------------------------------------------------------------ */

export function oneADay(checked, why = "un constat par jour — celui du haut est plus fort aujourd'hui") {
  let taken = false;
  return checked.map((c) => {
    if (!c.post) return c;
    if (taken) return { ...c, post: false, draft: null, why };
    taken = true;
    return c;
  });
}


/* ------------------------------------------------------------------ *
 * PROSPECTS — the other half, and the one that pays for the first.
 *
 * The round already measures which contracts WOULD get a seat. Those
 * are dropped from the posting queue, correctly: publishing "we checked
 * this token nobody submitted and it is fine" is an endorsement, and
 * the account does not make those.
 *
 * But commercially they are the most qualified list the site will ever
 * assemble. A project that clears our checks, has real volume, and is
 * already paying DexScreener for visibility is, by definition, someone
 * who buys advertising and could buy ours. Throwing that away and then
 * wondering why nobody has bought a seat is not caution, it is waste.
 *
 * THE CONFLICT, NAMED SO IT CAN BE WATCHED
 *
 * The moment passing the gate produces a lead, there is a structural
 * interest in more contracts passing. The screener is deterministic and
 * published, so that interest cannot reach a verdict — but it can reach
 * whoever edits the thresholds. The rule, and it is tested:
 *
 *   THRESHOLDS NEVER MOVE IN THE DIRECTION THAT LENGTHENS THIS LIST.
 *
 * Loosening a rule to widen the funnel is the one change that would
 * make the whole site worthless, and it would feel like growth on the
 * day it was made.
 *
 * Nothing here is published, posted or automated. It is a list a person
 * reads, and messages a person sends.
 * ------------------------------------------------------------------ */

/** Sellable outcomes only, best reach first, with a way to reach them. */
export function prospects(checked, { contacted = new Set() } = {}) {
  return checked
    .filter((c) => c && (c.verdict === "clear" || c.verdict === "flagged"))
    .filter((c) => !contacted.has(c.mint))
    // No contact route means no outreach — a row you cannot act on is
    // clutter in a list whose whole value is that it is short.
    .filter((c) => c.links && (c.links.twitter || c.links.telegram || c.links.website))
    .sort((a, b) => (b.audience || 0) - (a.audience || 0));
}

/**
 * The message, written for a person to send by hand.
 *
 * It leads with the work already done rather than with the ask, and it
 * states the flag before they find it themselves — a seat that turns up
 * carrying a line they were not warned about is a refund conversation.
 *
 * It says nothing about the token beyond what our own checks decided.
 * "It passes" is a fact about our door; "it looks good" would be a claim
 * about their asset, and we do not make those in public or in private.
 */
export function outreachDraft({ ticker, verdict, reasons = [], seatUsd }) {
  const t = "$" + String(ticker || "").replace(/^\$/, "").toUpperCase();
  const price = Number.isFinite(Number(seatUsd)) ? `$${Math.round(Number(seatUsd))}` : null;
  if (!ticker) return null;

  const flag = verdict === "flagged" ? (reasons || [])[0] : null;

  const lines = [
    `We ran ${t} through our contract checks this morning. It clears them.`,
    flag
      ? `One thing would be printed on the seat, publicly, for as long as it is up: ${flag}`
      : null,
    `The Wall is twenty-four advertising seats on one page, and nothing goes up without passing those checks first. ${price ? `A seat starts at ${price}.` : ""}`.trim(),
    `Every contract we turn away is published too, with the measurement. thewallsol.com/refused`,
    `Nobody asked us to look at ${t} — we check contracts that are already buying attention elsewhere. If that is not of interest, no follow-up.`,
  ].filter(Boolean);

  return lines.join("\n\n");
}
