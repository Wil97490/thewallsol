import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { _resetMemory, recordRefusal, listRefusals, markRefusalPosted, hideRefusal } from "../src/storage.js";
import {
  fit, heldFor, refusalDraft, saleDraft, takeoverDraft, draftPosts, probeDraft, short,
} from "../src/agents/poster.js";

const REFUSAL = {
  id: "r1", at: "2026-08-25T10:00:00.000Z", ticker: "FROG", posted: false,
  reasons: ["Mint authority is still active.", "41% of supply sits in one wallet."],
  ruleIds: ["mint_authority", "top_holder"],
};

const SEAT = {
  no: 7, status: "taken", ticker: "RIPE", since: "2026-08-25T09:00:00.000Z",
  priceUsd: 420, takeoverUsd: 462,
  reasons: ["Mint and freeze authority revoked.", "LP burned."],
};

const TAKEOVER = {
  seatNo: 3, ticker: "OLD", displacedBy: "NEW", paidUsd: 600,
  heldMinutes: 245, displacedAt: "2026-08-25T11:00:00.000Z",
};

describe("length discipline", () => {
  test("a short post is left alone", () => {
    assert.equal(fit("Refused at the gate."), "Refused at the gate.");
  });

  test("a long post is cut on a sentence, not mid-number", () => {
    const long = "№07 — $FROG. " + "Checked before it went up. ".repeat(20) + "$1,250.";
    const out = fit(long);
    assert.ok(out.length <= 280);
    assert.ok(out.endsWith("."), "should end on a sentence boundary");
    assert.ok(!/\$[\d,]*$/.test(out.replace(/\.$/, "")), "must not end mid-figure");
  });

  test("every draft fits in a post", () => {
    const drafts = draftPosts({ refusals: [REFUSAL], seats: [SEAT], takeovers: [TAKEOVER] });
    assert.equal(drafts.length, 3);
    for (const d of drafts) assert.ok(d.chars <= 280, `${d.kind} is ${d.chars} chars`);
  });
});

describe("held for", () => {
  test("minutes, hours, then days", () => {
    assert.equal(heldFor(31), "31 min");
    assert.equal(heldFor(245), "4 h");
    assert.equal(heldFor(60 * 72), "3 days");
  });
  test("nothing rather than a lie", () => {
    assert.equal(heldFor(null), null);
    assert.equal(heldFor(0), null);
  });
});

describe("what the posts say", () => {
  test("a refusal names the measurement and the money not taken", () => {
    const t = refusalDraft(REFUSAL);
    assert.match(t, /Refused at the gate/);
    assert.match(t, /\$FROG/);
    assert.match(t, /Mint authority is still active/);
    assert.match(t, /\$50 not taken/);          // the floor pinned in _helpers
  });

  test("a sale reads as a registry entry, with the takeover price", () => {
    const t = saleDraft(SEAT);
    assert.match(t, /№07 — \$RIPE\./);
    assert.match(t, /Checked before it went up/);
    assert.match(t, /\$420\./);
    assert.match(t, /take it from \$462/i);
  });

  test("a takeover names both sides and how long it lasted", () => {
    const t = takeoverDraft(TAKEOVER);
    assert.match(t, /№03 changed hands/);
    assert.match(t, /\$NEW took it from \$OLD/);
    assert.match(t, /held it 4 h/);
  });

  test("a contract nobody submitted is never described as refused at the gate", () => {
    const t = refusalDraft({ ...REFUSAL, source: "probe" });
    assert.ok(!/Refused at the gate/.test(t), "inventing a buyer is the one lie this ledger cannot tell");
    assert.match(t, /Not submitted/);
    assert.match(t, /would not get a seat/i);
    assert.ok(!/not taken/.test(t), "no money was declined — nobody offered any");
  });

  test("a real refusal still says money was turned down", () => {
    const t = refusalDraft({ ...REFUSAL, source: "gate" });
    assert.match(t, /Refused at the gate/);
    assert.match(t, /\$50 not taken/);
  });

  test("no post carries a link or a hashtag", () => {
    for (const t of [refusalDraft(REFUSAL), saleDraft(SEAT), takeoverDraft(TAKEOVER)]) {
      assert.ok(!/https?:\/\//.test(t), "a link costs 13x and gets buried");
      assert.ok(!/#\w/.test(t));
    }
  });
});

describe("what never goes out", () => {
  test("a draft that trips the output guard is dropped, not cleaned up", () => {
    const shill = { ...REFUSAL, id: "r2", reasons: ["This one is safe and will pump."] };
    const drafts = draftPosts({ refusals: [shill] });
    assert.equal(drafts.length, 0);
  });

  test("an already-posted refusal is never offered twice", () => {
    const drafts = draftPosts({ refusals: [{ ...REFUSAL, posted: true }] });
    assert.equal(drafts.length, 0);
  });

  test("a row taken out of the ledger stops being drafted", () => {
    assert.equal(draftPosts({ refusals: [{ ...REFUSAL, hidden: true }] }).length, 0);
  });

  test("a refusal with no stated reason is not publishable", () => {
    const drafts = draftPosts({ refusals: [{ ...REFUSAL, reasons: [] }] });
    assert.equal(drafts.length, 0);
  });

  test("an open seat is not a sale", () => {
    const drafts = draftPosts({ seats: [{ no: 2, status: "open", ticker: null }] });
    assert.equal(drafts.length, 0);
  });
});

describe("order of the day", () => {
  test("displacement first, refusals next, sales last", () => {
    const drafts = draftPosts({ refusals: [REFUSAL], seats: [SEAT], takeovers: [TAKEOVER] });
    assert.deepEqual(drafts.map((d) => d.kind), ["takeover", "refusal", "sale"]);
  });

  test("the list is capped", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ ...REFUSAL, id: "r" + i, at: `2026-08-25T10:${String(i).padStart(2, "0")}:00.000Z` }));
    assert.equal(draftPosts({ refusals: many, max: 5 }).length, 5);
  });
});

describe("the refusal ledger", () => {
  beforeEach(() => _resetMemory());

  test("a refusal is recorded and comes back newest first", async () => {
    await recordRefusal({ ticker: "AAA", mint: "m1", reasons: ["one"], ruleIds: ["r"] });
    await recordRefusal({ ticker: "BBB", mint: "m2", reasons: ["two"], ruleIds: ["r"] });
    const rows = await listRefusals({});
    assert.equal(rows.length, 2);
    assert.equal(rows[0].ticker, "BBB");
    assert.equal(rows[0].posted, false);
  });

  test("marking one posted keeps it out of the next batch of drafts", async () => {
    const rec = await recordRefusal({ ticker: "AAA", mint: "m1", reasons: ["Mint authority is still active."], ruleIds: ["r"] });
    assert.equal(draftPosts({ refusals: await listRefusals({}) }).length, 1);
    await markRefusalPosted(rec.id);
    assert.equal(draftPosts({ refusals: await listRefusals({}) }).length, 0);
  });

  test("hiding a row keeps it in the ledger but out of the drafts", async () => {
    const rec = await recordRefusal({ ticker: "AAA", reasons: ["Mint authority is still active."], ruleIds: [] });
    await hideRefusal(rec.id);
    const rows = await listRefusals({});
    assert.equal(rows.length, 1, "the row is not erased");
    assert.equal(rows[0].hidden, true);
    assert.equal(draftPosts({ refusals: rows }).length, 0);
  });

  test("a hidden row can be put back — retiring is never deleting", async () => {
    const { unhideRefusal } = await import("../src/storage.js");
    const rec = await recordRefusal({ ticker: "AAA", reasons: ["Mint authority is still active."], ruleIds: [] });
    await hideRefusal(rec.id);
    assert.equal((await listRefusals({}))[0].hidden, true);
    await unhideRefusal(rec.id);
    const back = (await listRefusals({}))[0];
    assert.equal(back.hidden, false);
    assert.equal(back.ticker, "AAA", "the row itself was never touched");
  });

  test("provenance is recorded, and defaults to the gate", async () => {
    const a = await recordRefusal({ ticker: "AAA", reasons: ["x"], ruleIds: [] });
    const b = await recordRefusal({ ticker: "BBB", reasons: ["x"], ruleIds: [], source: "probe" });
    const c = await recordRefusal({ ticker: "CCC", reasons: ["x"], ruleIds: [], source: "nonsense" });
    assert.equal(a.source, "gate");
    assert.equal(b.source, "probe");
    assert.equal(c.source, "gate", "an unknown provenance must not become a probe");
  });

  test("long reasons are clipped before they are ever stored", async () => {
    const rec = await recordRefusal({ ticker: "AAA", reasons: ["x".repeat(500)], ruleIds: [] });
    assert.equal(rec.reasons[0].length, 200);
  });
});

describe("what the traded volume is allowed to do", () => {
  test("a refusal carries the volume the pool was compared against", () => {
    const d = probeDraft({
      ticker: "SNIPY", verdict: "refused", vol24Usd: 1_284_000,
      reasons: ["Pool liquidity is $2,057, under the $2,500 floor."],
    });
    assert.match(d, /\$1\.3M traded in 24h/);
    assert.match(d, /\$2,057/);
    assert.ok(d.length <= 280);
  });

  test("a flagged probe never carries it", () => {
    // The seat would sell. "Traded $1.3M in 24h" next to a mild
    // reservation stops being context and becomes free advertising for a
    // token nobody submitted.
    const d = probeDraft({
      ticker: "SNIPY", verdict: "flagged", vol24Usd: 1_284_000,
      reasons: ["The pool is 9 hours old."],
    });
    assert.doesNotMatch(d, /traded in 24h/);
  });

  test("an unmeasured volume prints nothing at all", () => {
    for (const v of [null, undefined, 0, NaN, "n/a"]) {
      const d = probeDraft({ ticker: "X", verdict: "refused", vol24Usd: v, reasons: ["Mint authority is still open."] });
      assert.doesNotMatch(d, /traded|\$0|NaN|null|undefined/);
    }
  });

  test("the compact figure never invents precision", () => {
    assert.equal(short(1_284_000), "$1.3M");
    assert.equal(short(12_840_000), "$13M");
    assert.equal(short(412_000), "$412k");
    assert.equal(short(2_057), "$2k");
    assert.equal(short(0), null);
    assert.equal(short(-5), null);
  });
});

test("a refusal rebuilt from the ledger says what the round said", async () => {
  _resetMemory();
  const row = await recordRefusal({
    ticker: "SNIPY", mint: "So11111111111111111111111111111111111111112",
    reasons: ["Pool liquidity is $2,057, under the $2,500 floor."],
    ruleIds: ["lp_thin"], source: "probe", vol24Usd: 1_284_000,
  });
  assert.equal(row.vol24Usd, 1_284_000, "the ledger dropped the figure the draft needs");
  // This is the copy the operator actually posts: the card in the round
  // is a preview, the ledger row is what "Posts prêts" rebuilds from.
  assert.match(refusalDraft(row), /\$1\.3M traded in 24h/);
});

test("a ledger row with no volume rebuilds cleanly", async () => {
  _resetMemory();
  const row = await recordRefusal({
    ticker: "OLD", mint: "So11111111111111111111111111111111111111112",
    reasons: ["Mint authority is still open."], ruleIds: ["mint_authority"], source: "probe",
  });
  assert.equal(row.vol24Usd, null);
  assert.doesNotMatch(refusalDraft(row), /traded|null|NaN/);
});
