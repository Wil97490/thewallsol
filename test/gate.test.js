import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { OK_FACTS, FIELDS } from "./_helpers.js";
import { checkoutGate } from "../src/server.js";
import { _resetMemory, listQueue } from "../src/storage.js";
import { gatherFacts } from "../src/facts.js";

beforeEach(() => _resetMemory());

describe("gate response shape", () => {
  test("a clean token is sellable and carries a badge", async () => {
    const out = await checkoutGate({ fields: FIELDS, facts: OK_FACTS });
    assert.equal(out.allow, true);
    assert.equal(out.badge, "SCREENED");
  });

  test("a flagged token is sellable, and the flags are public", async () => {
    const out = await checkoutGate({ fields: FIELDS, facts: { ...OK_FACTS, lpUsd: 9000 } });
    assert.equal(out.allow, true);
    assert.equal(out.badge, "FLAGS FOUND");
    assert.ok(out.publicReasons.length, "a flagged seat with no public reasons is a lie by omission");
  });

  test("refused contract returns allow:false through the full gate", async () => {
    const out = await checkoutGate({ fields: FIELDS, facts: { ...OK_FACTS, mintAuthority: true } });
    assert.equal(out.allow, false);
    assert.ok(out.detail.some((d) => /inflated/i.test(d)));
  });

  test("unestablished facts refuse rather than pass", async () => {
    const out = await checkoutGate({ fields: FIELDS, facts: { gatherError: "rpc timeout" } });
    assert.equal(out.allow, false, "a facts failure must never allow a sale");
  });

  test("a paused screener holds the seat instead of selling it", async () => {
    process.env.AGENTS_ENABLED = "false";
    const out = await checkoutGate({ fields: FIELDS, facts: OK_FACTS });
    process.env.AGENTS_ENABLED = "true";
    assert.equal(out.allow, false);
    assert.equal(out.pending, true, "a paused gate must hold, not refuse outright");
    const queued = await listQueue({ status: "pending" });
    assert.ok(queued.length, "an escalation that reaches no human is a dropped sale");
  });
});

describe("facts layer fails closed", () => {
  test("no RPC configured refuses every value it returns", async () => {
    const before = process.env.SOLANA_RPC_URL;
    delete process.env.SOLANA_RPC_URL;
    const f = await gatherFacts({ mint: "So11111111111111111111111111111111111111112", link: "https://example.com", ticker: "X" });
    if (before) process.env.SOLANA_RPC_URL = before;

    assert.ok(f.gatherError, "should report why it failed");
    assert.equal(f.mintAuthority, true);
    assert.equal(f.lpLocked, false);
    assert.equal(f.topHolderPct, 100);
    assert.equal(f.linkThreat, "unchecked");

    const out = await checkoutGate({ fields: FIELDS, facts: f });
    assert.equal(out.allow, false, "half-gathered facts must refuse");
  });

  test("a mint that is not an address never reaches the chain", async () => {
    const f = await gatherFacts({ mint: "0xnot-solana", link: "https://example.com", ticker: "X" });
    assert.match(f.gatherError, /not a Solana address/i);
  });
});

describe("the gate does not take the buyer's word for anything", () => {
  test("checkoutGate gathers facts itself when none are injected", async () => {
    const before = process.env.SOLANA_RPC_URL;
    delete process.env.SOLANA_RPC_URL;
    // With no chain access nothing can be sold — proving the gate went
    // and looked instead of trusting the request. But it is held, not
    // refused: we read nothing, so we assert nothing about the token.
    const out = await checkoutGate({ fields: { ...FIELDS, mint: "So11111111111111111111111111111111111111112" } });
    if (before) process.env.SOLANA_RPC_URL = before;
    assert.equal(out.allow, false);
    assert.equal(out.retryable, true);
    assert.match(out.reason, /could not run/i);
  });
});

describe("facts we could not gather never become a verdict", () => {
  test("the gate holds the sale instead of refusing it", async () => {
    const out = await checkoutGate({
      fields: FIELDS,
      facts: { ...OK_FACTS, gatherError: "rpc timeout" },
    });
    assert.equal(out.allow, false);
    assert.equal(out.retryable, true, "an unread contract must be retryable, not refused");
    assert.equal(out.factsUnread, true, "the panel must be told not to print placeholders");
    assert.match(out.reason, /nothing was recorded/i);
  });

  test("the public facts carry the lock proof, or the page cannot tell the difference", async () => {
    const out = await checkoutGate({
      fields: FIELDS,
      facts: { ...OK_FACTS, lpLocked: false, lpProof: "dex_unmodelled", dexId: "meteora" },
    });
    const { publicFacts } = await import("../src/server.js");
    const pub = publicFacts(out.facts);
    assert.equal(pub.lpProof, "dex_unmodelled", "without this the page prints \"not locked\"");
    assert.equal(pub.dexId, "meteora");
  });

  test("nothing is written to the public refusal ledger", async () => {
    await checkoutGate({ fields: FIELDS, facts: { ...OK_FACTS, gatherError: "rpc timeout" } });
    const { listRefusals } = await import("../src/storage.js");
    assert.equal((await listRefusals({})).length, 0);
  });
});

describe("a probe is not work for a human", () => {
  /* Escalation is forced through the screener switch, which is the one
   * path that escalates without a model. Both halves are asserted: a
   * buyer still reaches a human, a probe never does. If only the first
   * were checked the test would pass on a gate that queues nothing at
   * all. */
  const escalating = async (opts) => {
    process.env.AGENT_SCREENER_ENABLED = "false";
    try {
      return await checkoutGate({
        fields: { ticker: "PROBE", mint: OK_FACTS.mint, link: "https://example.com", pitch: null, seatNo: null },
        facts: OK_FACTS,
        ...opts,
      });
    } finally { delete process.env.AGENT_SCREENER_ENABLED; }
  };

  test("a buyer whose entry needs a human reaches one", async () => {
    const before = (await listQueue({ limit: 500 })).length;
    const out = await escalating({ via: "gate", record: true });
    assert.equal(out.pending, true);
    assert.ok(out.reviewId, "the buyer got no review id — nobody is coming");
    assert.equal((await listQueue({ limit: 500 })).length, before + 1);
  });

  test("a dry probe never queues a review row", async () => {
    const before = (await listQueue({ limit: 500 })).length;
    const out = await escalating({ via: "probe", record: false });
    assert.equal(out.pending, true);
    assert.equal(out.reviewId, null);
    assert.equal((await listQueue({ limit: 500 })).length, before,
      "a contract nobody submitted put a buyer's review queue to work");
  });
});
