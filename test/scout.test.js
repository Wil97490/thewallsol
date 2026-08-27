import "./_helpers.js";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  SOURCES, EXCLUDED_MINTS, ELIGIBILITY,
  eligible, audience, postWorth, rank, oneADay,
  mergeProspects, NOT_ABOUT_THEM, PROSPECT_MAX,
} from "../src/agents/scout.js";
import { probeDraft, fit } from "../src/agents/poster.js";
import { guardOutput } from "../src/guardrails.js";

const MINT = "So11111111111111111111111111111111111111112";
const OTHER = "9nP2Xx3Yy4Zz5Aa6Bb7Cc8Dd9Ee1Ff2Gg3Hh4Jj5Kk6L";

const loud = (over = {}) => ({
  mint: OTHER, ticker: "MOGGO", dexId: "raydium",
  lpUsd: 180_000, fdvUsd: 9_000_000, vol24Usd: 2_400_000, txns24: 9_400,
  change24: 40, ageHours: 30, link: "https://example.com", via: ["boost_top"],
  ...over,
});

/* ---- sources are shape-tolerant ----------------------------------- */

test("every source survives a shape it did not expect", () => {
  for (const s of SOURCES) {
    for (const junk of [null, undefined, {}, [], { pairs: null }, [{}], [{ tokenAddress: null }]]) {
      const out = s.pick(junk);
      assert.ok(Array.isArray(out), `${s.id} returned a non-array for ${JSON.stringify(junk)}`);
    }
  }
});

test("sources read the field names the endpoints actually return", () => {
  const byId = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
  assert.deepEqual(
    byId.boost_top.pick([{ tokenAddress: OTHER, chainId: "solana", totalAmount: 500 }]),
    [{ mint: OTHER, chain: "solana", weight: 500 }]
  );
  assert.deepEqual(
    byId.ads.pick([{ tokenAddress: OTHER, chainId: "solana", impressions: 120_000 }]),
    [{ mint: OTHER, chain: "solana", weight: 120_000 }]
  );
});

/* ---- eligibility --------------------------------------------------- */

test("majors and stables are excluded by address, whatever they trade", () => {
  for (const mint of EXCLUDED_MINTS) {
    const e = eligible(loud({ mint }));
    assert.equal(e.ok, false, `${mint} slipped through`);
    assert.match(e.why, /major|stable/);
  }
});

test("USDC specifically can never be shortlisted again", () => {
  assert.ok(EXCLUDED_MINTS.has("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"));
});

test("a contract nobody trades is not a candidate", () => {
  assert.equal(eligible(loud({ vol24Usd: 900 })).ok, false);
  assert.equal(eligible(loud({ txns24: 12 })).ok, false);
});

test("volume without trades is one wallet, not an audience", () => {
  const e = eligible(loud({ vol24Usd: 5_000_000, txns24: 20 }));
  assert.equal(e.ok, false);
  assert.match(e.why, /trades in 24h/);
});

test("infrastructure-sized tokens are out", () => {
  assert.equal(eligible(loud({ fdvUsd: 9_000_000_000 })).ok, false);
});

test("a four-month-old pool is not news", () => {
  assert.equal(eligible(loud({ ageHours: 24 * 200 })).ok, false);
  assert.equal(eligible(loud({ ageHours: null })).ok, true, "unknown age must not disqualify");
});

test("a loud young memecoin is a candidate", () => {
  assert.deepEqual(eligible(loud()), { ok: true, kind: null, why: null });
});

/* ---- reach --------------------------------------------------------- */

test("audience rises with volume and never with price", () => {
  const quiet = audience(loud({ vol24Usd: 30_000, txns24: 200, change24: 0 }));
  const busy = audience(loud({ vol24Usd: 3_000_000, txns24: 9_000, change24: 0 }));
  assert.ok(busy > quiet);
  // A token that doubled is not a better candidate than one that halved.
  assert.equal(
    audience(loud({ change24: 60 })),
    audience(loud({ change24: -60 }))
  );
});

test("rank puts the loudest first", () => {
  const out = rank([loud({ ticker: "A", vol24Usd: 50_000, txns24: 300 }), loud({ ticker: "B", vol24Usd: 5_000_000, txns24: 9000 })]);
  assert.equal(out[0].ticker, "B");
});

/* ---- what may be published -----------------------------------------
 * This block is the point of the whole file. Everything else can be
 * wrong and cost a wasted morning; these can put a sentence about a
 * real project on a public account.
 * ------------------------------------------------------------------ */

test("a probe NEVER publishes a pass", () => {
  const w = postWorth({ verdict: "clear", ruleIds: [], market: loud() });
  assert.equal(w.post, false);
  assert.match(w.why, /does not vouch/);
  assert.equal(probeDraft({ ticker: "MOGGO", verdict: "clear", reasons: ["all good"] }), null);
});

test("a held check publishes nothing — it established nothing", () => {
  assert.equal(postWorth({ verdict: "incomplete", ruleIds: ["pool_unread"], market: loud() }).post, false);
});

test("a refusal that is only about OUR checks is never published", () => {
  for (const id of ["ticker_taken", "screener_disabled", "no_facts", "lp_unproven", "holders_unmeasurable", "lp_lock_unverifiable"]) {
    const w = postWorth({ verdict: "refused", ruleIds: [id], market: loud() });
    assert.equal(w.post, false, `${id} would have been published as a finding`);
  }
});

test("USDC's real outcome would not have produced a post", () => {
  // The mint that is too large to sample: flagged, sellable, and the
  // only flag is a limit of ours.
  const w = postWorth({ verdict: "flagged", ruleIds: ["holders_unmeasurable"], market: loud() });
  assert.equal(w.post, false);
});

test("refusing an unsubmitted contract on its link alone is not published", () => {
  assert.equal(postWorth({ verdict: "refused", ruleIds: ["link_dead"], market: loud() }).post, false);
  assert.equal(postWorth({ verdict: "refused", ruleIds: ["link_threat"], market: loud() }).post, false);
  // …but a link finding riding along with a contract finding is fine.
  assert.equal(postWorth({ verdict: "refused", ruleIds: ["link_dead", "mint_authority"], market: loud() }).post, true);
});

test("flags that merely describe the market are not a post", () => {
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["young", "thin_pool"], market: loud() }).post, false);
});

test("a contract property is a post", () => {
  for (const id of ["mint_authority", "freeze_authority", "lp_unlocked", "whale", "no_pool"]) {
    assert.equal(postWorth({ verdict: "refused", ruleIds: [id], market: loud() }).post, true, id);
  }
});

test("a property of the launchpad is not a post about the project", () => {
  // lp_burn_only fires on every pump.fun migration there has ever been.
  // Publishing it daily under a different ticker repeats one sentence and
  // changes the name of whoever is standing under it.
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["lp_burn_only"], market: loud() }).post, false);
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["young", "lp_burn_only"], market: loud() }).post, false);
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["young", "redirect", "lp_burn_only"], market: loud() }).post, false);
  // It still rides along when the contract itself has something to answer for.
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["lp_burn_only", "concentrated"], market: loud() }).post, true);
});

test("a redirect on a link we went and found ourselves is not a post", () => {
  assert.equal(postWorth({ verdict: "flagged", ruleIds: ["redirect"], market: loud() }).post, false);
});

test("held for a human is not a verdict on anyone", () => {
  const w = postWorth({ verdict: "pending", ruleIds: [], market: loud() });
  assert.equal(w.post, false);
  assert.match(w.why, /human/);
});

test("the four flagged rounds that started this would now publish nothing", () => {
  // Real output, 26/08/2026: four boosted pump.fun launches, one escalation.
  const live = [
    { verdict: "flagged", ruleIds: ["young", "lp_burn_only"] },
    { verdict: "flagged", ruleIds: ["young", "lp_burn_only"] },
    { verdict: "flagged", ruleIds: ["young", "redirect", "lp_burn_only"] },
    { verdict: "flagged", ruleIds: ["young", "redirect", "lp_burn_only"] },
    { verdict: "pending", ruleIds: [] },
  ];
  assert.equal(live.filter((r) => postWorth({ ...r, market: loud() }).post).length, 0);
});

test("a refusal outranks a flag on the same reach", () => {
  const m = loud();
  const refused = postWorth({ verdict: "refused", ruleIds: ["whale"], market: m });
  const flagged = postWorth({ verdict: "flagged", ruleIds: ["lp_burn_only"], market: m });
  assert.ok(refused.score > flagged.score);
});

/* ---- the drafts ---------------------------------------------------- */

test("a probe draft never claims a buyer that did not exist", () => {
  const d = probeDraft({ ticker: "MOGGO", verdict: "refused", reasons: ["Mint authority is still open."] });
  assert.match(d, /Not submitted/);
  assert.doesNotMatch(d, /Refused at the gate|not taken/);
});

test("a flagged probe says the seat carries the flag, not that the token is fine", () => {
  const d = probeDraft({ ticker: "MOGGO", verdict: "flagged", reasons: ["Liquidity is locked by the launchpad's own migration."] });
  assert.match(d, /would get a seat, with that printed on it/);
});

test("probe drafts fit X and pass the output guard", () => {
  const long = "Liquidity is not locked (12.4% of LP supply is burned). One wallet holds 61.3% of supply — over the 40% ceiling.";
  for (const verdict of ["refused", "flagged"]) {
    const d = probeDraft({ ticker: "LONGTICKER", verdict, reasons: [long, long] });
    assert.ok(d.length <= 280, `${verdict} draft was ${d.length}`);
    assert.equal(guardOutput(d, "poster").ok, true);
  }
});

test("a draft with nothing to say is no draft", () => {
  assert.equal(probeDraft({ ticker: "X", verdict: "refused", reasons: [] }), null);
  assert.equal(probeDraft({ ticker: "", verdict: "refused", reasons: ["something"] }), null);
});

test("fit never cuts a percentage in half", () => {
  const d = fit("Refused. One wallet holds 61.3% of supply. " + "x".repeat(400));
  assert.doesNotMatch(d, /61\.$|61$/);
});

/* ---- the knobs are the strict end --------------------------------- */

test("eligibility thresholds are the ones the module documents", () => {
  assert.equal(ELIGIBILITY.minVol24Usd, 10_000);
  assert.equal(ELIGIBILITY.minTxns24, 150);
  assert.ok(ELIGIBILITY.maxFdvUsd <= 2_000_000_000);
});

test("the band the first real rounds were cutting off is now in", () => {
  // Measured 26/08/2026: genuinely traded contracts sat at $10k-$23k and
  // every one of them was discarded by a threshold picked out of the air.
  for (const v of [10_418, 13_738, 18_727, 21_428, 22_975]) {
    assert.equal(eligible(loud({ vol24Usd: v })).ok, true, `$${v} still dropped`);
  }
  // …and the trade floor still does its job on the dollars-only cases.
  assert.equal(eligible(loud({ vol24Usd: 500_000, txns24: 30 })).ok, false);
});

test("every rejection carries a countable kind, not just prose", () => {
  const kinds = new Set();
  for (const m of [
    loud({ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }),
    loud({ vol24Usd: 100 }),
    loud({ txns24: 3 }),
    loud({ lpUsd: 10 }),
    loud({ fdvUsd: 9e9 }),
    loud({ ageHours: 24 * 400 }),
  ]) {
    const e = eligible(m);
    assert.equal(e.ok, false);
    assert.ok(e.kind, "a rejection with no kind cannot be counted, only read");
    kinds.add(e.kind);
  }
  assert.equal(kinds.size, 6, "two different rejections share a kind — the tally would lie");
});

test("wSOL is excluded — the fixture mint must never be shortlisted", () => {
  assert.ok(EXCLUDED_MINTS.has(MINT));
});

/* ------------------------------------------------------------------ *
 * The whole selection path, against payloads shaped like the real
 * endpoints. No network: `get` is injected.
 *
 * This is the test that would have caught the boring failures — a mint
 * counted twice, provenance lost between discovery and enrichment, a
 * batch of 30 silently truncated.
 * ------------------------------------------------------------------ */

import { discover, enrich, shortlist } from "../src/agents/scout.js";
import { encodeBase58, isSolanaAddress } from "../src/lib/base58.js";

/* Real 32-byte base58, because discovery validates addresses before it
 * counts them — a fixture of plausible-looking gibberish would make
 * every one of these tests pass for the wrong reason. */
const ADDR = (n) => {
  const b = new Uint8Array(32);
  b[0] = 7; b[1] = n & 0xff; b[2] = (n >> 8) & 0xff;
  for (let i = 3; i < 32; i++) b[i] = (i * 37 + n) & 0xff;
  return encodeBase58(b);
};

const pair = (mint, over = {}) => ({
  chainId: "solana", dexId: "raydium", pairAddress: "Pair" + mint.slice(4, 12),
  baseToken: { address: mint, symbol: "T" + mint.slice(4, 8), name: "Token" },
  quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
  priceUsd: "0.0004", liquidity: { usd: 90_000 }, fdv: 4_000_000,
  volume: { h24: 900_000, h6: 200_000 }, txns: { h24: { buys: 2100, sells: 1900 } },
  priceChange: { h24: 22 }, pairCreatedAt: Date.now() - 40 * 3_600_000,
  info: { websites: [{ url: "https://project.example" }], socials: [{ url: "https://x.com/p" }] },
  ...over,
});

function fakeApi({ boosted = [], ads = [], profiles = [], pairs = [], dead = [] } = {}) {
  return async (url) => {
    for (const d of dead) if (url.includes(d)) throw new Error("HTTP 503");
    if (url.includes("/token-boosts/top/")) return boosted;
    if (url.includes("/token-boosts/latest/")) return boosted.slice(0, 1);
    if (url.includes("/ads/latest/")) return ads;
    if (url.includes("/token-profiles/latest/")) return profiles;
    if (url.includes("/latest/dex/tokens/")) {
      const asked = decodeURIComponent(url.split("/tokens/")[1]).split(",");
      return { pairs: pairs.filter((p) => asked.includes(p.baseToken.address)) };
    }
    throw new Error("unexpected url " + url);
  };
}

test("a mint on two paid lists is one candidate carrying both", async () => {
  const m = ADDR(1);
  const get = fakeApi({
    boosted: [{ tokenAddress: m, chainId: "solana", totalAmount: 900 }],
    ads: [{ tokenAddress: m, chainId: "solana", impressions: 50_000 }],
  });
  const { candidates } = await discover({ get });
  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].via.sort(), ["ads", "boost_new", "boost_top"]);
});

test("other chains are dropped at the door", async () => {
  const get = fakeApi({ boosted: [{ tokenAddress: "0xabc", chainId: "ethereum", totalAmount: 9 }] });
  const { candidates } = await discover({ get });
  assert.equal(candidates.length, 0);
});

test("one dead source does not take the round down", async () => {
  const get = fakeApi({
    boosted: [{ tokenAddress: ADDR(2), chainId: "solana", totalAmount: 10 }],
    dead: ["/ads/latest/"],
  });
  const { candidates, sources } = await discover({ get });
  assert.equal(candidates.length, 1);
  const ads = sources.find((s) => s.id === "ads");
  assert.equal(ads.ok, false);
  assert.match(ads.error, /503/);
  assert.equal(sources.filter((s) => s.ok).length, 3);
});

test("enrichment keeps the deepest pair per mint", async () => {
  const m = ADDR(3);
  const get = fakeApi({ pairs: [pair(m, { liquidity: { usd: 10_000 } }), pair(m, { liquidity: { usd: 250_000 }, dexId: "meteora" })] });
  const [row] = await enrich([m], { get });
  assert.equal(row.lpUsd, 250_000);
  assert.equal(row.dexId, "meteora");
});

test("enrichment batches past the chunk size and loses nobody", async () => {
  const mints = Array.from({ length: 60 }, (_, i) => ADDR(100 + i));
  const get = fakeApi({ pairs: mints.map((m) => pair(m)) });
  const rowsOut = await enrich(mints, { get });
  assert.equal(rowsOut.length, 60);
});

test("the project's own website becomes the link the gate would check", async () => {
  const m = ADDR(4);
  const get = fakeApi({ pairs: [pair(m)] });
  const [row] = await enrich([m], { get });
  assert.equal(row.link, "https://project.example");
});

test("a shortlist joins provenance, filters the quiet ones, and ranks", async () => {
  const loudMint = ADDR(5), quietMint = ADDR(6), knownMint = ADDR(7);
  const get = fakeApi({
    boosted: [
      { tokenAddress: loudMint, chainId: "solana", totalAmount: 500 },
      { tokenAddress: quietMint, chainId: "solana", totalAmount: 500 },
      { tokenAddress: knownMint, chainId: "solana", totalAmount: 500 },
    ],
    pairs: [
      pair(loudMint, { volume: { h24: 4_000_000 }, txns: { h24: { buys: 8000, sells: 7000 } } }),
      pair(quietMint, { volume: { h24: 300 }, txns: { h24: { buys: 4, sells: 2 } } }),
      pair(knownMint),
    ],
  });

  const out = await shortlist({ get, skip: new Set([knownMint]) });
  assert.equal(out.alreadyKnown, 1, "a mint already in the ledger is not proposed again");
  assert.equal(out.shortlist.length, 1);
  assert.equal(out.shortlist[0].mint, loudMint);
  assert.ok(out.shortlist[0].via.includes("boost_top"), "provenance survived the join");
  assert.ok(out.dropped.some((d) => d.mint === quietMint && /audience/.test(d.why)));
});

test("a shortlist with every source dead is empty and says so", async () => {
  const get = fakeApi({ dead: ["/token-boosts/", "/ads/", "/token-profiles/"] });
  const out = await shortlist({ get });
  assert.equal(out.shortlist.length, 0);
  assert.equal(out.sources.filter((s) => s.ok).length, 0);
});

test("the address fixture really is a Solana address", () => {
  assert.ok(isSolanaAddress(ADDR(1)));
  assert.notEqual(ADDR(1), ADDR(2));
});

/* ---- one a day ---------------------------------------------------- */

test("a round proposes one publishable contract, never four", () => {
  const out = oneADay([
    { mint: "a", post: true, score: 30, draft: "x" },
    { mint: "b", post: true, score: 20, draft: "y" },
    { mint: "c", post: false, score: 0, why: "passed" },
    { mint: "d", post: true, score: 10, draft: "z" },
  ]);
  const kept = out.filter((c) => c.post);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].mint, "a", "the list arrives sorted; the first publishable is the strongest");
  // The withheld ones stay visible, with their draft removed so nothing
  // can be copied out of a card that says "not today".
  assert.equal(out[1].draft, null);
  assert.match(out[1].why, /un constat par jour/);
  assert.equal(out[2].why, "passed", "an already-rejected row keeps its own reason");
});

test("a round with nothing publishable stays empty", () => {
  const out = oneADay([{ post: false, why: "passed" }, { post: false, why: "held" }]);
  assert.equal(out.filter((c) => c.post).length, 0);
});

test("the discard tally counts everything, even past the sample cap", async () => {
  // Fifty contracts nobody trades: the row list is capped at 40, the
  // count must still say fifty. A cap you cannot see turns "we discarded
  // most of the market" into "the market was quiet".
  const mints = Array.from({ length: 50 }, (_, i) => ADDR(300 + i));
  const get = fakeApi({
    boosted: mints.map((m) => ({ tokenAddress: m, chainId: "solana", totalAmount: 1 })),
    pairs: mints.map((m) => pair(m, { volume: { h24: 12 }, txns: { h24: { buys: 1, sells: 0 } } })),
  });
  const out = await shortlist({ get });
  assert.equal(out.shortlist.length, 0);
  assert.equal(out.dropped.length, 40, "the sample is still capped");
  assert.equal(out.droppedCount, 50, "the tally was capped too — the number lies");
  assert.equal(out.droppedWhy.no_volume, 50);
});

/* ------------------------------------------------------------------ *
 * PROSPECTS — and the conflict of interest they create.
 * ------------------------------------------------------------------ */

import { prospects, outreachDraft } from "../src/agents/scout.js";
import fs from "node:fs";

const lead = (over = {}) => ({
  mint: OTHER, ticker: "MOGGO", verdict: "clear", audience: 10,
  vol24Usd: 900_000, lpUsd: 90_000, reasons: [],
  links: { website: "https://moggo.example", twitter: null, telegram: null, other: [] },
  ...over,
});

test("only sellable outcomes are prospects", () => {
  const out = prospects([
    lead({ verdict: "clear", mint: "a" }),
    lead({ verdict: "flagged", mint: "b" }),
    lead({ verdict: "refused", mint: "c" }),
    lead({ verdict: "incomplete", mint: "d" }),
    lead({ verdict: "pending", mint: "e" }),
  ]);
  assert.deepEqual(out.map((c) => c.mint), ["a", "b"]);
});

test("a prospect with no way to reach them is not a prospect", () => {
  const out = prospects([lead({ links: { website: null, twitter: null, telegram: null, other: [] } })]);
  assert.equal(out.length, 0);
});

test("somebody already contacted drops off the list", () => {
  const out = prospects([lead({ mint: "a" }), lead({ mint: "b" })], { contacted: new Set(["a"]) });
  assert.deepEqual(out.map((c) => c.mint), ["b"]);
});

test("the loudest prospect is first", () => {
  const out = prospects([lead({ mint: "a", audience: 4 }), lead({ mint: "b", audience: 12 })]);
  assert.equal(out[0].mint, "b");
});

test("outreach states our door, never their token", () => {
  const d = outreachDraft({ ticker: "MOGGO", verdict: "clear", seatUsd: 15 });
  // "clears them" was the old wording, and it was sent to FLAGGED
  // projects too — announcing one verdict and then naming the flag of
  // another, three lines apart.
  assert.match(d, /It passed all of them/);
  // "It looks good" is a claim about their asset. We do not make those,
  // in public or in a DM.
  assert.doesNotMatch(d, /\b(safe|legit|solid|good|promising|strong)\b/i);
  assert.match(d, /Nobody asked us to look/);
  assert.match(d, /no follow-up/);
});

test("a flagged prospect is told the flag before they find it", () => {
  // A seat that turns up carrying a line nobody warned them about is a
  // refund conversation, and a fair one.
  const d = outreachDraft({
    ticker: "SLOPPY", verdict: "flagged", seatUsd: 15,
    reasons: ["Liquidity is locked by the launchpad's own migration, not by an independent lock."],
  });
  assert.match(d, /passed — with one flag/, "the opening line must carry the real verdict");
  assert.match(d, /printed on the seat publicly/);
  assert.match(d, /launchpad's own migration/);
});

test("outreach passes the same output guard as a public post", () => {
  for (const verdict of ["clear", "flagged"]) {
    const d = outreachDraft({ ticker: "MOGGO", verdict, reasons: ["The pool is 9 hours old."], seatUsd: 15 });
    assert.equal(guardOutput(d, "poster").ok, true, d);
  }
});

/* ---- the rule that keeps this honest -------------------------------
 * The moment passing the gate produces a sales lead, there is a
 * structural interest in more contracts passing. The screener is
 * deterministic and published, so that interest cannot reach a verdict —
 * but it can reach whoever edits the thresholds, and it would feel like
 * growth on the day it was done.
 *
 * So the production thresholds are pinned here. Loosening one to widen
 * the funnel now fails the release gate, which is the only place the
 * temptation can actually be caught.
 * ------------------------------------------------------------------ */

test("production thresholds cannot be loosened to lengthen the prospect list", () => {
  const env = fs.readFileSync(new URL("../deploy.env", import.meta.url), "utf8");
  const val = (k) => {
    const m = env.match(new RegExp(`^export ${k}=(\\S+)`, "m"));
    return m ? Number(m[1]) : null;
  };
  const ceilings = {
    // A rule may only ever get STRICTER than these. If you are changing
    // one of these numbers to make more contracts pass, stop.
    MAX_TOP_HOLDER_PCT: 40,      // one wallet on more than this cannot buy
    FLAG_TOP_HOLDER_PCT: 25,     // over this, the seat says so
    FLAG_AGE_HOURS: 24,          // under this many hours old, the seat says so
  };
  const floors = {
    MIN_LP_USD: 2500,            // a pool under this cannot buy
    FLAG_LP_USD: 15000,          // under this, the seat says so
  };
  for (const [k, max] of Object.entries(ceilings)) {
    const v = val(k);
    if (v === null) continue;    // unset means the strict default in config.js
    assert.ok(v <= max, `${k}=${v} is looser than the published ${max}`);
  }
  for (const [k, min] of Object.entries(floors)) {
    const v = val(k);
    if (v === null) continue;
    assert.ok(v >= min, `${k}=${v} is looser than the published ${min}`);
  }
});

test("the eligibility floor is a reach filter, never a quality one", () => {
  // It decides who is worth the gate's time. It must never be able to
  // decide that something passes — that is screener.js's job alone.
  const src = fs.readFileSync(new URL("../src/agents/scout.js", import.meta.url), "utf8");
  assert.ok(!/verdict\s*[:=]\s*["']clear["']/.test(src), "scout.js hands out a verdict");
  assert.ok(!/lpLocked\s*[:=]\s*true/.test(src), "scout.js asserts a lock");
});

test("notre propre token ne peut jamais être un candidat", () => {
  // L'équipe détient du $Wall (voir /rules#token). Un outil de contrôle
  // qui note la chose que son opérateur détient n'est plus un outil de
  // contrôle, quel que soit le verdict rendu. Exclu dans le code plutôt
  // que retenu de mémoire : « on ne le ferait jamais » n'est pas un
  // mécanisme.
  const OURS = "8nbF1nKD5uuVuMSZBGeRCGcihabcYvkvogq8QihVpump";
  assert.ok(EXCLUDED_MINTS.has(OURS), "le token de l'équipe peut entrer dans une ronde");
  const e = eligible(loud({ mint: OURS }));
  assert.equal(e.ok, false);
  assert.equal(e.kind, "excluded");
});

/* ------------------------------------------------------------------ *
 * THE STANDING PROSPECT LIST
 *
 * prospects() finds leads in one round. Before mergeProspects() existed
 * that was the whole mechanism: the round found two or three qualified
 * projects a night and the next round overwrote them. Twenty nights of
 * work, nothing to show, and the operator's honest summary was
 * "toujours pas de prospect".
 * ------------------------------------------------------------------ */
describe("the prospect list accumulates instead of evaporating", () => {
  const lead = (mint, extra = {}) => ({
    mint, ticker: mint.toUpperCase(), verdict: "flagged", audience: 5,
    vol24Usd: 50_000, links: { twitter: "https://x.com/" + mint }, ...extra,
  });
  const day = (n) => new Date(Date.UTC(2026, 0, n));

  test("a lead found on night one is still there on night two", () => {
    const one = mergeProspects([], [lead("aaa")], { now: day(1) });
    const two = mergeProspects(one, [lead("bbb")], { now: day(2) });
    assert.deepEqual(two.map((r) => r.mint).sort(), ["aaa", "bbb"],
      "night two must not overwrite night one");
  });

  test("re-seeing a lead updates it without duplicating it", () => {
    const one = mergeProspects([], [lead("aaa", { vol24Usd: 90_000 })], { now: day(1) });
    const two = mergeProspects(one, [lead("aaa", { vol24Usd: 10_000 })], { now: day(2) });
    assert.equal(two.length, 1);
    assert.equal(two[0].rounds, 2);
    assert.equal(two[0].firstSeen, day(1).toISOString(), "first sighting is kept");
    assert.equal(two[0].lastSeen, day(2).toISOString());
    assert.equal(two[0].bestVol24Usd, 90_000,
      "a quiet Tuesday must not erase what the project was worth when we found it");
  });

  test("writing to a lead takes it off the list", () => {
    const one = mergeProspects([], [lead("aaa"), lead("bbb")], { now: day(1) });
    const two = mergeProspects(one, [], { contacted: new Set(["aaa"]), now: day(2) });
    assert.deepEqual(two.map((r) => r.mint), ["bbb"]);
  });

  test("a lead nobody has re-seen in three weeks falls off", () => {
    const one = mergeProspects([], [lead("aaa")], { now: day(1) });
    const later = mergeProspects(one, [], { now: new Date(Date.UTC(2026, 1, 20)) });
    assert.equal(later.length, 0, "stale numbers must not be pitched as current");
  });

  test("the list is ranked by audience and bounded", () => {
    const many = Array.from({ length: PROSPECT_MAX + 40 }, (_, i) =>
      lead("m" + i, { audience: i }));
    const out = mergeProspects([], many, { now: day(1) });
    assert.equal(out.length, PROSPECT_MAX);
    assert.ok(out[0].audience > out[out.length - 1].audience, "highest audience first");
  });

  test("an empty round leaves the standing list untouched", () => {
    const one = mergeProspects([], [lead("aaa")], { now: day(1) });
    const two = mergeProspects(one, [], { now: day(2) });
    assert.equal(two.length, 1,
      "a night when discovery finds nothing is not a night that erases the pipeline");
  });
});

describe("a refusal that rests only on a missing link is never publishable", () => {
  test("link_absent is a fact about us", () => {
    assert.ok(NOT_ABOUT_THEM.has("link_absent"));
  });

  test("postWorth withholds it even if it somehow arrives as a refusal", () => {
    const w = postWorth({
      verdict: "refused",
      ruleIds: ["link_absent"],
      market: { vol24Usd: 11_000_000, txns24: 40_000, change24: 5, via: ["ads"] },
    });
    assert.equal(w.post, false,
      "$11M of volume must not buy its way past the restraint");
  });
});

describe("a moderation refusal is not a contract finding", () => {
  test("a refusal with no rule is labelled for what it is", () => {
    const w = postWorth({
      verdict: "refused", ruleIds: [],
      market: { vol24Usd: 12_000_000, txns24: 50_000, change24: 3, via: ["boost_top"] },
    });
    assert.equal(w.post, false);
    assert.match(w.why, /content rules/i,
      "saying 'our own checks' hides that the moderator refused it on its NAME");
    assert.doesNotMatch(w.why, /our own checks/i);
  });

  test("a real contract finding is still publishable", () => {
    const w = postWorth({
      verdict: "refused", ruleIds: ["mint_authority"],
      market: { vol24Usd: 1_000_000, txns24: 8_000, change24: 10, via: ["boost_top"] },
    });
    assert.equal(w.post, true, "the fix must not swallow genuine refusals");
  });
});

/* ------------------------------------------------------------------ *
 * WHAT FIRESTORE WILL AND WILL NOT SWALLOW
 *
 * The standing list is written with db.setState(), which is a Firestore
 * document. Firestore rejects `undefined` outright — and the write was
 * wrapped in a silent catch, so ONE field missing from a projection
 * (`audience`) meant the list never persisted at all, while the round
 * went on reporting "6 on the list, 6 new tonight" every single night.
 *
 * This test is the cheap version of that lesson.
 * ------------------------------------------------------------------ */
describe("every stored prospect row is storable", () => {
  const undef = (obj, path = "") => {
    const bad = [];
    for (const [k, v] of Object.entries(obj)) {
      const here = path ? `${path}.${k}` : k;
      if (v === undefined) bad.push(here);
      else if (v && typeof v === "object" && !Array.isArray(v)) bad.push(...undef(v, here));
    }
    return bad;
  };

  test("a complete lead survives the round trip with no undefined", () => {
    const lead = {
      mint: "abc", ticker: "AAA", verdict: "flagged", reasons: ["r"],
      vol24Usd: 1, lpUsd: 2, fdvUsd: 3, dexId: "raydium", ageHours: 4,
      via: ["ads"], links: { twitter: "u", telegram: null, website: null, other: [] },
      seatUsd: 15, audience: 7, outreach: "hello",
    };
    const [row] = mergeProspects([], [lead], { now: new Date(Date.UTC(2026, 0, 1)) });
    assert.deepEqual(undef(row), [], "Firestore rejects the whole document over any one of these");
  });

  test("a lead missing audience is caught here rather than in production", () => {
    const { audience, ...noAudience } = {
      mint: "abc", ticker: "AAA", verdict: "flagged", reasons: [],
      vol24Usd: 1, lpUsd: 2, fdvUsd: 3, dexId: "d", ageHours: 4,
      via: [], links: {}, seatUsd: 15, audience: 7, outreach: "x",
    };
    const [row] = mergeProspects([], [noAudience], { now: new Date(Date.UTC(2026, 0, 1)) });
    assert.deepEqual(undef(row), ["audience"],
      "this is the exact shape that silently emptied the list in production");
  });
});

describe("the outreach message states the verdict it actually got", () => {
  const flag = "Liquidity is locked by the launchpad's own migration, not by an independent lock.";

  test("a flagged project is not told it cleared", () => {
    const d = outreachDraft({ ticker: "MARTIANS", verdict: "flagged", reasons: [flag], seatUsd: 15 });
    assert.doesNotMatch(d, /clears them/i,
      "'clear' is a different verdict in this system, and the next line names the flag — it contradicted itself in three lines");
    assert.match(d, /passed — with one flag/i);
    assert.ok(d.includes(flag), "the flag itself must survive into the message");
  });

  test("a clear project is told exactly that, with no flag paragraph", () => {
    const d = outreachDraft({ ticker: "AAA", verdict: "clear", reasons: [], seatUsd: 15 });
    assert.match(d, /passed all of them/i);
    assert.doesNotMatch(d, /flag/i, "there is no flag to print, so no sentence about one");
  });

  test("the seat price quoted is the one passed in", () => {
    assert.match(outreachDraft({ ticker: "AAA", verdict: "clear", seatUsd: 40 }), /starts at \$40/);
  });
});

describe("un contrat qui passe reste actionnable", () => {
  test("outreachDraft produit un message pour clear ET pour flagged", () => {
    for (const v of ["clear", "flagged"]) {
      const d = outreachDraft({ ticker: "FONE", verdict: v, seatUsd: 15,
        reasons: ["The pool is 9 hours old."] });
      assert.ok(d && d.length > 60, `${v} doit produire un message, pas une impasse`);
      assert.match(d, /FONE/);
    }
  });

  test("aucun message n'est produit pour un verdict non vendable", () => {
    for (const v of ["refused", "incomplete", "pending", "error", undefined]) {
      assert.equal(outreachDraft({ ticker: "FONE", verdict: v, seatUsd: 15,
        reasons: ["Pool liquidity is $2,300, under the $2,500 floor."] }), null,
        `un ${v} ne doit pas produire un message qui s'ouvre sur « it passed »`);
    }
  });
});

test("le message ne prétend pas savoir quelle heure il est", () => {
  for (const v of ["clear", "flagged"]) {
    const d = outreachDraft({ ticker: "FONE", verdict: v, seatUsd: 15,
      reasons: ["The pool is 8 hours old."] });
    assert.doesNotMatch(d, /this morning|tonight|this afternoon|today/i,
      "un brouillon envoyé le soir affirmait l'avoir mesuré le matin");
  }
});
