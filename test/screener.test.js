import { test, describe } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { OK_FACTS } from "./_helpers.js";
import { screen, publicBadge } from "../src/agents/screener.js";

/* ------------------------------------------------------------------ *
 * The release gate, as code. Run with: npm test
 *
 * These are not unit tests, they are the thing that decides whether a
 * build may ship. Every one asserts the system REFUSES something. If
 * they pass for the wrong reason you sell a top seat to a drainer, so
 * each test also asserts WHY the refusal happened.
 *
 * No API key is needed: every refusal must be decided before the model
 * is ever called. That is the point.
 * ------------------------------------------------------------------ */

describe("hard gate — these must refuse without any model", () => {
  const cases = [
    ["open mint authority",    { mintAuthority: true },      /inflated/i],
    ["open freeze authority",  { freezeAuthority: true },    /frozen/i],
    ["measured unlocked liquidity", { lpProof: "not_burned", lpLocked: false, lpDetail: "12.0% of LP supply is burned" }, /not locked/i],
    ["no pool at all",         { lpProof: "no_pool", lpLocked: false }, /no Solana pool/i],
    ["dust pool",              { lpUsd: 100 },               /floor/i],
    ["whale holder",           { topHolderPct: 55 },         /40%/],
    ["dead link",              { linkStatus: 404 },          /resolve/i],
    ["gone link",              { linkStatus: 410 },          /resolve/i],
    ["broken destination",     { linkStatus: 503 },          /resolve/i],

    ["flagged link",           { linkThreat: "malware" },    /malicious/i],
    ["blocked link target",    { linkThreat: "private_address" }, /malicious/i],
    ["ticker already on wall", { tickerTaken: true },        /already on the wall/i],
  ];

  for (const [name, override, why] of cases) {
    test(`refuses: ${name}`, async () => {
      const out = await screen({ ...OK_FACTS, ...override });
      assert.equal(out.verdict, "refused", `${name} was not refused`);
      assert.ok(out.reasons.some((r) => why.test(r)), `refused, but not for the expected reason: ${out.reasons}`);
    });
  }
});

describe("soft flags — sellable, but the badge says so", () => {
  const cases = [
    ["thin pool",       { lpUsd: 9000 },        /thin liquidity/i],
    ["young pool",      { ageHours: 5 },        /hours old/i],
    ["concentrated",    { topHolderPct: 31 },   /31\.0%/],
    ["redirecting link",{ linkRedirected: true, finalUrl: "https://elsewhere.example/x" }, /redirects/i],
    ["bot-filtered link", { linkStatus: 403 },  /could not confirm/i],
    ["rate-limited link", { linkStatus: 429 },  /could not confirm/i],
  ];
  for (const [name, override, why] of cases) {
    test(`flags: ${name}`, async () => {
      const out = await screen({ ...OK_FACTS, ...override });
      assert.equal(out.verdict, "flagged", `${name} should be sellable with a flag`);
      assert.ok(out.reasons.some((r) => why.test(r)), `flagged, but not for the expected reason: ${out.reasons}`);
    });
  }
});

test("a clean token clears", async () => {
  const out = await screen(OK_FACTS);
  assert.equal(out.verdict, "clear");
  assert.equal(out.escalate, false);
});

test("no facts is held, not refused — we established nothing, so we assert nothing", async () => {
  const out = await screen({ gatherError: "rpc timeout" });
  assert.equal(out.verdict, "incomplete");
  assert.match(out.reasons[0], /could not run/i);
});

describe("our failures never become their refusal", () => {
  const held = [
    ["the pool could not be read",  { lpProof: "unavailable", lpLocked: false, lpUsd: 0 }, /pool could not be read/i],
    ["holders could not be read",   { holdersSampled: 0, topHolderPct: 100 },              /holder distribution/i],
    ["safe browsing did not answer",{ linkThreat: "unchecked" },                           /safety check/i],
  ];

  for (const [name, override, why] of held) {
    test(`held, not refused: ${name}`, async () => {
      const out = await screen({ ...OK_FACTS, ...override });
      assert.equal(out.verdict, "incomplete", `${name} must not be a verdict on the token`);
      assert.match(out.reasons.join(" "), why);
    });
  }

  test("an unread pool never publishes a dollar figure it did not measure", async () => {
    const out = await screen({ ...OK_FACTS, lpProof: "unavailable", lpUsd: 0 });
    assert.ok(!/\$0/.test(out.reasons.join(" ")), "must not claim the pool holds $0");
  });

  test("unsampled holders never publish a percentage", async () => {
    const out = await screen({ ...OK_FACTS, holdersSampled: 0, topHolderPct: 100 });
    const text = out.reasons.join(" ");
    assert.ok(!/100\.0%/.test(text), "must not claim one wallet holds 100%");
    assert.ok(!/NaN/.test(text), "must never print NaN to the public");
  });
});

describe("a mint too large to sample is a gap, not a verdict", () => {
  // The RPC refuses getTokenLargestAccounts past ~10M accounts. No
  // budget and no retry fixes that, so it must not be held forever —
  // and it certainly must not be read as "one wallet holds 100%".
  const facts = { ...OK_FACTS, holdersProof: "too_many_accounts", holdersSampled: 0, topHolderPct: null };

  test("it is sellable rather than held or refused", async () => {
    const out = await screen(facts);
    assert.equal(out.verdict, "flagged");
  });

  test("it never earns the SCREENED badge", async () => {
    assert.equal(publicBadge((await screen(facts)).verdict), "FLAGS FOUND");
  });

  test("it never publishes a concentration it did not measure", async () => {
    const text = (await screen(facts)).reasons.join(" ");
    assert.ok(!/100\.0%/.test(text));
    assert.ok(!/NaN/.test(text));
    assert.match(text, /could not be measured/i);
    assert.match(text, /not a finding that the supply is concentrated/i);
  });
});

describe("an unproven lock can never be sold as SCREENED", () => {
  // The preflight caught this: lpLocked:false with no proof field at all
  // used to fall through every rule and earn a SCREENED badge, while the
  // public copy claimed "Liquidity is locked (verified on chain)".
  const holes = [
    ["no proof field at all",   { lpLocked: false }],
    ["an unrecognised proof",   { lpLocked: false, lpProof: "something_new" }],
    ["proof missing entirely",  { lpLocked: false, lpProof: undefined }],
    ["a null proof",            { lpLocked: false, lpProof: null }],
  ];

  for (const [name, override] of holes) {
    test(`never clear: ${name}`, async () => {
      const out = await screen({ ...OK_FACTS, ...override });
      assert.notEqual(out.verdict, "clear", "an unproven lock must never be SCREENED");
      assert.equal(publicBadge(out.verdict), null);
      assert.ok(
        !/Liquidity is locked/i.test(out.reasons.join(" ")),
        "must never claim a lock it did not prove",
      );
    });
  }
});

describe("a DEX we cannot model is a gap, not a verdict", () => {
  const facts = { ...OK_FACTS, lpProof: "dex_unmodelled", lpLocked: false, dexId: "meteora" };

  test("it is sellable rather than refused", async () => {
    const out = await screen(facts);
    assert.equal(out.verdict, "flagged");
  });

  test("it never earns the SCREENED badge", async () => {
    const out = await screen(facts);
    assert.equal(publicBadge(out.verdict), "FLAGS FOUND");
  });

  test("it says whose limitation it is, and does not accuse the token", async () => {
    const out = await screen(facts);
    const text = out.reasons.join(" ");
    assert.match(text, /could not be verified/i);
    assert.match(text, /meteora/i);
    assert.match(text, /not a finding that the liquidity is unlocked/i);
  });
});

describe("kill switches", () => {
  test("AGENTS_ENABLED=false pauses seats instead of selling unchecked", async () => {
    process.env.AGENTS_ENABLED = "false";
    const out = await screen(OK_FACTS);
    process.env.AGENTS_ENABLED = "true";
    assert.equal(out.verdict, "refused");
    assert.equal(out.escalate, true, "a disabled screener must escalate, not fail silently");
  });
});

test("a mint with no pool is refused for having no pool, and nothing else", async () => {
  const out = await screen({
    ...OK_FACTS, lpLocked: false, lpUsd: 0, lpMethod: "no_pool", lpProof: "no_pool",
    lpDetail: "no Solana pool found for this mint",
  });
  assert.equal(out.verdict, "refused");
  assert.deepEqual(out.ruleIds, ["no_pool"]);
  // "Pool liquidity is $0, under the $2,500 floor" is a measurement of a
  // shallow pool. There is no pool. Published alone — and the poster
  // only takes the first two reasons — it is the wrong finding.
  assert.ok(!out.reasons.some((r) => /under the \$/.test(r)), out.reasons.join(" | "));
});

/* ------------------------------------------------------------------ *
 * THE $PISTACIO REGRESSION
 *
 * A round picked up a contract with $11M of daily volume that nobody
 * had submitted. DexScreener had no profile URL for it, so the probe
 * ran with link=null, facts.js set linkThreat="missing", and that
 * value was tested by `link_threat` — a HARD rule — sitting next to
 * "flagged malicious". The system refused the contract and produced a
 * finished post whose stated finding was:
 *
 *     "No destination link was supplied."
 *
 * Nobody had supplied anything. We published our own empty field as a
 * measurement of somebody else's token.
 *
 * An absence is not a discovery. These tests pin that.
 * ------------------------------------------------------------------ */
describe("a missing link is a fact about us, never about them", () => {
  const noLink = { ...OK_FACTS, linkThreat: "missing", linkStatus: 0, finalUrl: null };

  test("no link means the check did not run — incomplete, not refused", async () => {
    const r = await screen(noLink);
    assert.equal(r.verdict, "incomplete",
      "a contract must never be refused for a link WE failed to bring");
    assert.ok(r.ruleIds.includes("link_absent"), `expected link_absent, got ${r.ruleIds}`);
    assert.ok(!r.ruleIds.includes("link_threat"),
      "an absent link must not be reported as a security finding");
  });

  test("nothing in the reasons claims the project supplied anything", async () => {
    const r = await screen(noLink);
    const text = r.reasons.join(" ");
    assert.ok(!/supplied/i.test(text),
      `the exact sentence that shipped: ${JSON.stringify(text)}`);
    assert.ok(!/malicious/i.test(text),
      "a missing link must never borrow the wording of a real threat");
  });

  test("a link that IS flagged still refuses — the fix must not blunt the rule", async () => {
    const r = await screen({ ...OK_FACTS, linkThreat: "SOCIAL_ENGINEERING" });
    assert.equal(r.verdict, "refused");
    assert.ok(r.ruleIds.includes("link_threat"));
    assert.match(r.reasons.join(" "), /malicious/i);
  });

  test("an unchecked link is still held, not refused", async () => {
    const r = await screen({ ...OK_FACTS, linkThreat: "unchecked" });
    assert.equal(r.verdict, "incomplete");
    assert.ok(r.ruleIds.includes("link_uncheckable"));
  });
});
