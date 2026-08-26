import { test, describe } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { guardOutput } from "../src/guardrails.js";
import { baseLine } from "../src/agents/tape.js";
import { baseReport } from "../src/agents/reporter.js";

describe("output guard", () => {
  const forbidden = [
    "$FROG is safe, we checked the contract",
    "$FROG will moon this week",
    "buy $FROG before it's too late",
    "we recommend $FROG",
    "$FROG is undervalued at this market cap",
    "guaranteed returns on $FROG",
    "not financial advice",
    "get in early on $FROG",
  ];
  for (const t of forbidden) {
    test(`blocks: "${t.slice(0, 34)}…"`, () => {
      assert.equal(guardOutput(t).ok, false, "this reached the public timeline");
    });
  }

  const allowed = [
    "$FROG took №01 from $DOGG for $2,400. SOL holds 61% of the wall.",
    "$4,120 posted in the last hour across 7 seats. BASE up to 22%.",
    "Quiet hour. $180 across 2 seats.",
    "12 buyers held their seat through the hour.",
    "3 refused at the gate.",
  ];
  for (const t of allowed) {
    test(`allows: "${t.slice(0, 34)}…"`, () => {
      assert.equal(guardOutput(t).ok, true, `false positive on: ${t}`);
    });
  }
});

describe("the deterministic lines are always publishable", () => {
  test("tape fallback survives its own guard", () => {
    const w = { totalUsd: 4120, seatsSold: 7, byChain: { sol: 0.61 }, hours: 1, refused: 3,
      takeovers: [{ ticker: "FROG", from: "DOGG", seatNo: 1, usd: 2400 }] };
    const line = baseLine(w);
    assert.match(line, /№01/);
    assert.equal(guardOutput(line).ok, true, `the fallback line is not publishable: ${line}`);
  });

  test("report fallback survives its own guard", () => {
    const body = baseReport({ ticker: "FROG", seatNo: 1, hoursHeld: 26, takeoverPrice: 2760,
      takeoverAttempts: 2, views: 18400, badge: "FLAGS FOUND", flags: ["Thin liquidity: $9,000 in the pool."],
      manageUrl: "https://thewall.example/seat/1" });
    assert.equal(guardOutput(body).ok, true, `the fallback report is not sendable: ${body}`);
  });
});
