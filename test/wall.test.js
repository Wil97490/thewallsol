import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { _resetMemory, getSeat, saveSeat } from "../src/storage.js";
import * as wall from "../src/wall.js";
import { matchPayment, STEP, quoteLamports, readTransfer } from "../src/payments.js";

beforeEach(async () => { _resetMemory(); await wall.ensureSeats(); });

describe("seats", () => {
  test("an empty seat costs the floor", async () => {
    assert.equal(wall.minimumBid(await getSeat(1)), 50);
  });

  test("a takeover must beat the sitting price", async () => {
    await wall.awardSeat(1, { id: "o1", ticker: "FROG", mint: "m", link: "https://a.example", pitch: "p", badge: "SCREENED", priceUsd: 100 });
    const s = await getSeat(1);
    assert.equal(s.occupant.ticker, "FROG");
    assert.equal(wall.minimumBid(s), 110);       // +10% beats +$5 here
  });

  test("a takeover displaces the sitting tenant and keeps the history", async () => {
    await wall.awardSeat(1, { id: "o1", ticker: "FROG", priceUsd: 100, badge: "SCREENED" });
    const out = await wall.awardSeat(1, { id: "o2", ticker: "DOGG", priceUsd: 115, badge: "SCREENED" });
    assert.equal(out.displaced, "FROG");
    const s = await getSeat(1);
    assert.equal(s.occupant.ticker, "DOGG");
    assert.equal(s.history.length, 1);
    assert.equal(s.history[0].ticker, "FROG");
  });

  test("two buyers cannot hold the same seat", async () => {
    assert.equal((await wall.holdSeat(2, "order-a")).ok, true);
    const second = await wall.holdSeat(2, "order-b");
    assert.equal(second.ok, false, "the seat was sold twice");
    assert.match(second.reason, /paying for this seat/i);
  });

  test("releasing a hold puts the seat back on the market", async () => {
    await wall.holdSeat(3, "order-a");
    await wall.releaseSeat(3, "order-a");
    assert.equal((await wall.holdSeat(3, "order-b")).ok, true);
  });

  test("a ticker cannot sit on the wall twice", async () => {
    await wall.awardSeat(1, { id: "o1", ticker: "FROG", priceUsd: 100, badge: "SCREENED" });
    assert.equal(await wall.isTickerTaken("frog"), true);
    assert.equal(await wall.isTickerTaken("$FROG"), true);
    assert.equal(await wall.isTickerTaken("DOGG"), false);
  });

  test("the public view never leaks the buyer's contact", async () => {
    await wall.awardSeat(1, { id: "o1", ticker: "FROG", priceUsd: 100, badge: "SCREENED", contact: "someone@example.com" });
    const view = wall.publicSeat(await getSeat(1));
    assert.equal(JSON.stringify(view).includes("example.com"), false, "an email address reached the public wall");
  });
});

describe("the hourly window", () => {
  test("counts only what was actually paid for in the window", () => {
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 5 * 3600_000).toISOString();
    const w = wall.windowFromOrders([
      { status: "paid", priceUsd: 2400, paidAt: now, ticker: "FROG", displaced: "DOGG", seatNo: 1, chain: "sol" },
      { status: "paid", priceUsd: 180, paidAt: now, ticker: "YETI", seatNo: 12, chain: "sol" },
      { status: "paid", priceUsd: 9999, paidAt: old, ticker: "OLD", seatNo: 3, chain: "sol" },
      { status: "refused", priceUsd: 50, createdAt: now, ticker: "BAD", seatNo: 4 },
    ], 1);
    assert.equal(w.seatsSold, 2);
    assert.equal(w.totalUsd, 2580);
    assert.equal(w.takeovers.length, 1);
    assert.equal(w.refused, 1);
  });
});

describe("matching a payment by its exact amount", () => {
  const base = { blockTime: Math.floor(Date.now() / 1000) };
  test("an exact match is the payment", () => {
    const hit = matchPayment([{ ...base, signature: "sigA", delta: 10230 }], { lamports: 10230 });
    assert.equal(hit.signature, "sigA");
  });
  test("close is not a match — the amount IS the identifier", () => {
    assert.equal(matchPayment([{ ...base, signature: "sigA", delta: 10229 }], { lamports: 10230 }), null);
    assert.equal(matchPayment([{ ...base, signature: "sigA", delta: 11900 }], { lamports: 10230 }), null);
  });
  test("a signature already spent on another seat is never reused", () => {
    const cands = [{ ...base, signature: "sigA", delta: 10230 }];
    assert.equal(matchPayment(cands, { lamports: 10230, claimed: ["sigA"] }), null);
  });
  test("a failed transaction never pays", () => {
    assert.equal(matchPayment([{ ...base, signature: "sigA", delta: 10230, err: {} }], { lamports: 10230 }), null);
  });
  test("a transfer from well before the order does not pay for it", () => {
    const old = { signature: "sigOld", delta: 10230, blockTime: Math.floor((Date.now() - 3600_000) / 1000) };
    assert.equal(matchPayment([old], { lamports: 10230, notBefore: Date.now() }), null);
  });
  test("the right one is picked out of a crowd", () => {
    const hit = matchPayment([
      { ...base, signature: "s1", delta: 500 },
      { ...base, signature: "s2", delta: 10231 },
      { ...base, signature: "s3", delta: 10230 },
    ], { lamports: 10230 });
    assert.equal(hit.signature, "s3");
  });
});

describe("a quoted amount must survive the trip through a wallet", () => {
  test("every quote is a whole number of 0.000001 SOL", () => {
    for (const usd of [1, 5, 25, 95, 250]) {
      for (const rate of [98, 182.4, 43.7]) {
        const lamports = quoteLamports(usd, rate);
        assert.equal(lamports % STEP, 0, `${usd}$ at ${rate} → ${lamports} is finer than a wallet can send`);
        const shown = Number((lamports / 1e9).toFixed(6));
        assert.equal(Math.round(shown * 1e9), lamports, `${shown} does not survive six decimals`);
      }
    }
  });

  test("a quote always covers the asking price", () => {
    for (const usd of [1, 25, 95]) {
      const lamports = quoteLamports(usd, 98);
      assert.ok(lamports / 1e9 * 98 >= usd, "a quote must never ask for less than the seat costs");
    }
  });

  test("two live orders never share an amount", () => {
    const taken = [];
    for (let i = 0; i < 24; i++) {
      const l = quoteLamports(25, 98, taken);
      assert.equal(taken.includes(l), false, "two seats quoted the same number");
      taken.push(l);
    }
  });

  test("the noise costs a couple of cents at most", () => {
    const base = Math.ceil((25 / 98) * 1e9 / STEP) * STEP;
    for (let i = 0; i < 50; i++) {
      const extra = (quoteLamports(25, 98) - base) / 1e9 * 98;
      assert.ok(extra > 0 && extra < 0.06, `the identifier costs ${extra}$, which is no longer noise`);
    }
  });
});

describe("reading a transfer — who sent it, and how much arrived", () => {
  const T = "TREASURY";
  const tx = (keys, pre, post) => ({
    transaction: { message: { accountKeys: keys.map((pubkey) => ({ pubkey })) } },
    meta: { preBalances: pre, postBalances: post },
    blockTime: 1700000000,
  });

  test("a plain transfer names the sender and the amount", () => {
    const r = readTransfer(tx(["ALICE", T], [1000000, 0], [989000, 10000]), T);
    assert.equal(r.delta, 10000);
    assert.equal(r.from, "ALICE");
  });

  test("the sender is who lost the most, not who paid the fee", () => {
    // BOB paid the fee, ALICE sent the money.
    const r = readTransfer(tx(["BOB", "ALICE", T], [50000, 900000, 0], [45000, 400000, 500000]), T);
    assert.equal(r.delta, 500000);
    assert.equal(r.from, "ALICE");
  });

  test("an outgoing transfer reads as negative and is never a payment", () => {
    const r = readTransfer(tx([T, "ALICE"], [500000, 0], [400000, 99000]), T);
    assert.ok(r.delta < 0);
  });

  test("a transaction the treasury is not part of moves nothing for us", () => {
    const r = readTransfer(tx(["ALICE", "BOB"], [100, 200], [50, 250]), T);
    assert.equal(r.delta, 0);
  });

  test("a malformed transaction is refused rather than guessed at", () => {
    assert.equal(readTransfer(null, T), null);
    assert.equal(readTransfer({ transaction: { message: { accountKeys: ["A"] } }, meta: {} }, T), null);
  });
});

describe("a hold frees itself on the clock, not on a cron", () => {
  test("an expired hold no longer blocks the next buyer", async () => {
    const seat = await getSeat(4);
    seat.holdBy = "someone-else";
    seat.holdUntil = new Date(Date.now() - 1000).toISOString();   // one second ago
    await saveSeat(seat);

    assert.equal(wall.seatIsHeld(await getSeat(4)), false, "an expired hold still counted as held");
    const taken = await wall.holdSeat(4, "a-new-buyer");
    assert.equal(taken.ok, true, "a seat stayed blocked past its own deadline");
  });

  test("a live hold does block, and says until when", async () => {
    await wall.holdSeat(5, "first-buyer");
    const view = wall.publicSeat(await getSeat(5));
    assert.equal(view.status, "held");
    assert.ok(view.heldUntil, "the page cannot show a countdown without a deadline");
    assert.ok(new Date(view.heldUntil).getTime() > Date.now());
    assert.equal((await wall.holdSeat(5, "second-buyer")).ok, false);
  });

  test("an open seat advertises no deadline", async () => {
    assert.equal(wall.publicSeat(await getSeat(6)).heldUntil, null);
  });
});

describe("naming your own price", () => {
  const seat = (priceUsd) => (priceUsd ? { no: 1, occupant: { ticker: "SIT" }, priceUsd } : { no: 1, occupant: null, priceUsd: 0 });

  test("the increment is the larger of ten percent and five dollars", () => {
    assert.equal(wall.minimumBid(seat(60)), 66);
    assert.equal(wall.minimumBid(seat(95)), 105);
    assert.equal(wall.minimumBid(seat(1000)), 1100);
  });

  test("no seat is ever cheaper than the floor, taken or not", () => {
    // A seat sold under an older setting used to stay takeable below
    // the floor, while every empty seat beside it asked full price.
    assert.equal(wall.minimumBid(seat(1)), 50);
    assert.equal(wall.minimumBid(seat(15)), 50);
    assert.equal(wall.checkBid(seat(1), 6).ok, false, "$6 must not take a $1 seat under a $50 floor");
    assert.equal(wall.checkBid(seat(1), 50).ok, true);
  });

  test("a cent under the minimum is refused, and says why", () => {
    const r = wall.checkBid(seat(100), 109.99);
    assert.equal(r.ok, false);
    assert.match(r.reason, /at least \$110/);
    assert.match(r.reason, /\$100 is sitting on it/);
  });

  test("the minimum itself is accepted", () => {
    assert.equal(wall.checkBid(seat(100), 110).ok, true);
  });

  test("anything above is accepted — that is the point", () => {
    assert.equal(wall.checkBid(seat(100), 900).ok, true);
    assert.equal(wall.checkBid(seat(100), 110.5).ok, true);
  });

  test("an empty seat only has to clear the floor", () => {
    assert.equal(wall.checkBid(seat(0), 50).ok, true);
    assert.equal(wall.checkBid(seat(0), 49.99).ok, false);
  });

  test("nonsense is refused rather than coerced", () => {
    for (const bad of [NaN, undefined, null, "beaucoup", Infinity, -50]) {
      assert.equal(wall.checkBid(seat(0), bad).ok, false, `${bad} was accepted as an amount`);
    }
  });

  test("fractions of a cent are refused — a typo, not an offer", () => {
    assert.equal(wall.checkBid(seat(0), 50.001).ok, false);
  });

  test("an absurd amount is refused before it reaches a wallet", () => {
    const r = wall.checkBid(seat(0), 5_000_000);
    assert.equal(r.ok, false);
    assert.match(r.reason, /most one seat takes/i);
  });

  test("a ping-pong at one cent is impossible", () => {
    let price = 60;
    for (let i = 0; i < 5; i++) {
      const next = wall.minimumBid(seat(price));
      assert.ok(next >= price + 5, "the increment stopped protecting the wall");
      price = next;
    }
    assert.equal(price, 99);   // 60 → 66 → 73 → 81 → 90 → 99
  });
});

describe("an hour that belongs to the buyer", () => {
  const justBought = (priceUsd, minutesAgo = 0) => ({
    no: 1, priceUsd,
    occupant: { ticker: "SIT", since: new Date(Date.now() - minutesAgo * 60_000).toISOString() },
  });

  test("a seat bought a moment ago cannot be taken at any price", () => {
    const r = wall.checkBid(justBought(15, 0), 10_000);
    assert.equal(r.ok, false, "ten thousand dollars displaced someone who had just paid");
    assert.match(r.reason, /can't be taken/i);
    assert.ok(r.settled, "the refusal must say when the seat frees");
  });

  test("the refusal counts down honestly", () => {
    assert.match(wall.checkBid(justBought(15, 59), 100).reason, /1 minute\b/);
    assert.match(wall.checkBid(justBought(15, 30), 100).reason, /30 minutes/);
  });

  test("once the hour is up, the normal rules apply again", () => {
    const seat = justBought(100, 61);
    assert.equal(wall.settledUntil(seat), null);
    assert.equal(wall.checkBid(seat, 110).ok, true);
    assert.equal(wall.checkBid(seat, 109).ok, false, "the increment must still hold after the hour");
  });

  test("an empty seat is never settled", () => {
    const empty = { no: 2, occupant: null };
    assert.equal(wall.settledUntil(empty), null);
    assert.equal(wall.checkBid(empty, wall.minimumBid(empty)).ok, true);
  });

  test("the wall says when a settled seat frees", () => {
    const view = wall.publicSeat(justBought(15, 10));
    assert.ok(view.settledUntil, "a buyer cannot see their hour without a date");
    assert.ok(new Date(view.settledUntil).getTime() > Date.now());
  });
});

describe("who was displaced, and how fast", () => {
  test("a takeover is reported with the tenure it cut short", () => {
    const seats = [{
      no: 3,
      occupant: { ticker: "NEW" },
      history: [
        { ticker: "OLD", priceUsd: 15, from: "2026-08-25T10:00:00.000Z", to: "2026-08-25T11:05:00.000Z" },
        { ticker: "OLDER", priceUsd: 15, from: "2026-08-25T08:00:00.000Z", to: "2026-08-25T10:00:00.000Z" },
      ],
    }];
    const rows = wall.recentTakeovers(seats);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].ticker, "OLD", "the most recent displacement must come first");
    assert.equal(rows[0].heldMinutes, 65);
    assert.equal(rows[0].displacedBy, "NEW");
    assert.equal(rows[1].heldMinutes, 120);
  });

  test("a wall where nothing changed hands reports nothing", () => {
    assert.deepEqual(wall.recentTakeovers([{ no: 1, history: [] }, { no: 2 }]), []);
  });
});
