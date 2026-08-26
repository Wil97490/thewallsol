import { config } from "./config.js";
import { listSeats, getSeat, saveSeat } from "./storage.js";

/* ------------------------------------------------------------------ *
 * THE WALL — seats, prices, takeovers.
 *
 * A seat is a number. Someone holds it until someone else pays more.
 * The only rules that matter here:
 *   - a seat can be held by exactly one order at a time
 *   - a hold expires on its own, so an abandoned checkout frees the seat
 *   - a takeover must beat the current price by the multiplier, and the
 *     price is fixed when the order is created, not when it is paid
 * ------------------------------------------------------------------ */

/**
 * A seat bought within the settling period cannot be taken at any
 * price. Returns when it frees, or null if it is already takeable.
 */
export function settledUntil(seat) {
  if (!seat?.occupant?.since) return null;
  const until = new Date(seat.occupant.since).getTime() + config.seatProtectMinutes * 60_000;
  return until > Date.now() ? new Date(until).toISOString() : null;
}

export const seatIsSettled = (seat) => Boolean(settledUntil(seat));

/**
 * The least you may pay for this seat.
 *
 * An empty seat costs the floor. An occupied one costs enough more than
 * the sitting tenant that taking it means something: ten percent, or
 * five dollars, whichever is larger. The five dollars is what stops a
 * cheap seat being traded back and forth a cent at a time; the ten
 * percent is what keeps an expensive one from being taken for pocket
 * change.
 *
 * Above that, the buyer names their price.
 */
export function minimumBid(seat) {
  if (!seat?.occupant) return config.seatFloorUsd;

  /* Integer arithmetic on cents and basis points, deliberately: in
   * floating point 100 * 1.10 is 110.00000000000001, and rounding that
   * up asks a buyer for $111 to beat $100. Money is not a float. */
  const cents = Math.round(Number(seat.priceUsd || config.seatFloorUsd) * 100);
  const bp = Math.round(config.minIncrementPct * 10000);
  const byPct = Math.ceil((cents * (10000 + bp)) / 10000);
  const byFlat = cents + Math.round(config.minIncrementUsd * 100);

  /* The floor is a floor for every seat, taken or not. Without this a
   * seat sitting below it — sold under an older setting, or through a
   * path that has since been closed — stays cheaper than the empty
   * seats beside it, and the wall advertises "from $15" above a row
   * anyone can take for $6. */
  const floor = Math.round(config.seatFloorUsd * 100);
  return Math.ceil(Math.max(byPct, byFlat, floor) / 100);
}

/** Kept as the old name so nothing that reads a seat has to change. */
export const takeoverPrice = minimumBid;

/**
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function checkBid(seat, amountUsd) {
  const settled = settledUntil(seat);
  if (settled) {
    const mins = Math.max(1, Math.ceil((new Date(settled).getTime() - Date.now()) / 60_000));
    return {
      ok: false,
      settled,
      reason: `$${seat.occupant.ticker} just took this seat. It can't be taken for another ${mins} minute${mins > 1 ? "s" : ""} — at any price.`,
    };
  }

  const amount = Number(amountUsd);
  const floor = minimumBid(seat);
  if (!Number.isFinite(amount)) return { ok: false, reason: "Enter an amount." };
  if (Math.round(amount * 100) !== amount * 100) return { ok: false, reason: "Amounts go to the cent, no further." };
  if (amount < floor) {
    return {
      ok: false,
      reason: seat?.occupant
        ? `Taking this seat costs at least $${floor} — $${Number(seat.priceUsd)} is sitting on it.`
        : `The floor is $${floor}.`,
    };
  }
  if (amount > config.maxBidUsd) return { ok: false, reason: `The most one seat takes is $${config.maxBidUsd.toLocaleString("en-US")}.` };
  return { ok: true, amount };
}

export function seatIsHeld(seat) {
  return Boolean(seat?.holdUntil && new Date(seat.holdUntil).getTime() > Date.now());
}

/** Idempotent. Creates any seat that does not exist yet. */
export async function ensureSeats() {
  const existing = await listSeats();
  const have = new Set(existing.map((s) => s.no));
  for (let n = 1; n <= config.seatCount; n++) {
    if (have.has(n)) continue;
    await saveSeat({ no: n, occupant: null, priceUsd: 0, history: [], holdUntil: null, holdBy: null });
  }
  return listSeats();
}

/** What the public sees. Nothing here was not checked. */
export function publicSeat(seat) {
  const held = seatIsHeld(seat);
  return {
    no: seat.no,
    // A held seat frees itself at this instant — the clock in the page
    // is the same clock the server enforces, so nobody has to guess
    // whether a seat is really taken or just parked.
    heldUntil: held ? seat.holdUntil : null,
    ticker: seat.occupant?.ticker || null,
    pitch: seat.occupant?.pitch || null,
    link: seat.occupant?.link || null,
    mint: seat.occupant?.mint || null,
    badge: seat.occupant?.badge || null,
    reasons: seat.occupant?.reasons || [],
    screenedAt: seat.occupant?.screenedAt || null,
    since: seat.occupant?.since || null,
    priceUsd: Number(seat.priceUsd || 0),
    takeoverUsd: minimumBid(seat),
    settledUntil: settledUntil(seat),
    status: seat.occupant ? "taken" : held ? "held" : "open",
    turnover: (seat.history || []).length,
  };
}

export async function publicWall() {
  const seats = await ensureSeats();
  return seats.map(publicSeat);
}

export async function isTickerTaken(ticker) {
  if (!ticker) return false;
  const seats = await listSeats();
  const t = String(ticker).replace(/^\$/, "").toUpperCase();
  return seats.some((s) => s.occupant?.ticker?.toUpperCase() === t);
}

/**
 * Take the seat off the market while an order is paid for.
 * @returns {{ok:true, seat}|{ok:false, reason:string}}
 */
export async function holdSeat(no, orderId) {
  const seat = await getSeat(no);
  if (!seat) return { ok: false, reason: "no such seat" };
  if (seatIsHeld(seat) && seat.holdBy !== orderId) {
    return { ok: false, reason: "Someone is paying for this seat right now. Try again in a few minutes." };
  }
  seat.holdUntil = new Date(Date.now() + config.seatHoldMinutes * 60_000).toISOString();
  seat.holdBy = orderId;
  await saveSeat(seat);
  return { ok: true, seat };
}

export async function releaseSeat(no, orderId) {
  const seat = await getSeat(no);
  if (!seat || (orderId && seat.holdBy !== orderId)) return null;
  seat.holdUntil = null;
  seat.holdBy = null;
  return saveSeat(seat);
}

/**
 * Payment cleared. The seat changes hands, and the previous occupant is
 * recorded rather than deleted — the wall's history is the only proof
 * that a takeover happened at the price it claims.
 */
export async function awardSeat(no, order) {
  const seat = await getSeat(no);
  if (!seat) throw new Error(`seat ${no} does not exist`);

  const previous = seat.occupant;
  if (previous) {
    seat.history = [
      ...(seat.history || []),
      { ticker: previous.ticker, from: previous.since, to: new Date().toISOString(), priceUsd: Number(seat.priceUsd || 0) },
    ].slice(-50);
  }

  seat.occupant = {
    ticker: order.ticker,
    mint: order.mint,
    link: order.link,
    pitch: order.pitch,
    badge: order.badge,
    reasons: order.publicReasons || [],
    screenedAt: order.screenedAt,
    since: new Date().toISOString(),
    orderId: order.id,
    contact: order.contact || null,
  };
  seat.priceUsd = Number(order.priceUsd || 0);
  seat.holdUntil = null;
  seat.holdBy = null;
  await saveSeat(seat);

  return { seat, displaced: previous ? previous.ticker : null };
}

/** The window the hourly tape reports on. */
export function windowFromOrders(orders, hours = 1) {
  const since = Date.now() - hours * 3_600_000;
  const paid = orders.filter((o) => o.status === "paid" && new Date(o.paidAt || o.createdAt).getTime() >= since);
  const totalUsd = paid.reduce((s, o) => s + Number(o.priceUsd || 0), 0);
  const byCount = {};
  for (const o of paid) byCount[o.chain || "sol"] = (byCount[o.chain || "sol"] || 0) + 1;
  const byChain = {};
  for (const [k, v] of Object.entries(byCount)) byChain[k] = paid.length ? v / paid.length : 0;

  return {
    hours,
    totalUsd,
    seatsSold: paid.length,
    byChain,
    takeovers: paid
      .filter((o) => o.displaced)
      .map((o) => ({ ticker: o.ticker, from: o.displaced, seatNo: o.seatNo, usd: Number(o.priceUsd || 0) })),
    refused: orders.filter((o) => o.status === "refused" && new Date(o.createdAt).getTime() >= since).length,
  };
}

/**
 * Seats that changed hands, most recent first, with how long the
 * displaced tenant actually held theirs.
 *
 * This exists for one decision and one only: whether to refund someone
 * who was displaced sooner than felt fair. A number nobody can see is
 * a promise nobody can keep.
 */
export function recentTakeovers(seats, limit = 40) {
  const rows = [];
  for (const seat of seats) {
    for (const h of seat.history || []) {
      const from = new Date(h.from).getTime();
      const to = new Date(h.to).getTime();
      rows.push({
        seatNo: seat.no,
        ticker: h.ticker,
        paidUsd: Number(h.priceUsd || 0),
        heldMinutes: Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 60_000) : null,
        displacedAt: h.to,
        displacedBy: seat.occupant?.ticker || null,
      });
    }
  }
  return rows.sort((a, b) => (a.displacedAt < b.displacedAt ? 1 : -1)).slice(0, limit);
}
