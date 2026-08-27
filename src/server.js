import http from "node:http";
import crypto from "node:crypto";
import { config, isProd, isTest, productionPreconditions } from "./config.js";
import { deadline } from "./lib/deadline.js";
import { isSolanaAddress } from "./lib/base58.js";
import { vetUrl } from "./lib/net.js";
import { screen, publicBadge } from "./agents/screener.js";
import { moderate } from "./agents/moderator.js";
import { writeTape } from "./agents/tape.js";
import { compose, probeDraft, monthlyDraft } from "./agents/poster.js";
import { shortlist, postWorth, oneADay, prospects, mergeProspects, outreachDraft } from "./agents/scout.js";
import { refusalPage, refusalGonePage, refusalMissingPage, sitemap } from "./pages.js";
import { report } from "./agents/reporter.js";
import { gatherFacts } from "./facts.js";
import { progress, reinstate } from "./graduation.js";
import { audit, queueForHuman, agentsEnabled, guardOutput } from "./guardrails.js";
import * as db from "./storage.js";
import * as wall from "./wall.js";
import * as pay from "./payments.js";
import { store, recentPosts } from "./notify.js";
import { json, text, serveStatic, readJson, secretEquals, bearer, clientIp, throttle } from "./http.js";

/* ------------------------------------------------------------------ *
 * Two shapes of work, deliberately separated.
 *
 * BLOCKING  — runs inside checkout. Has a budget, and fails closed.
 * SCHEDULED — runs on a clock, can fail silently and retry next tick.
 *
 * Never let a scheduled agent block a payment, and never let a blocking
 * agent do anything slow enough to need a queue.
 * ------------------------------------------------------------------ */

/* ---- BLOCKING: the checkout gate ---------------------------------- */

/**
 * The gate. Facts are gathered HERE, from the chain, using the mint the
 * buyer named. They are never read from a request body on the selling
 * path — a gate that accepts the facts it is meant to check is not a
 * gate. `facts` is accepted only by the internal probe endpoint, which
 * cannot sell anything.
 */
export async function checkoutGate({ fields, facts, via = "gate", record = true }) {
  const dl = deadline(config.gateBudgetMs);

  const gathered = facts || await gatherFacts(
    { mint: fields?.mint, link: fields?.link, ticker: fields?.ticker, isTickerTaken: wall.isTickerTaken },
    { deadline: dl }
  );

  // Held, not refused. We read nothing, so we say nothing about the
  // token — and the panel must not print the pessimistic placeholders
  // as though they were measurements.
  if (gathered?.gatherError) {
    await audit("gate", "incomplete_no_facts", { ticker: fields?.ticker, err: gathered.gatherError });
    return {
      allow: false, retryable: true, factsUnread: true,
      reason: "The contract checks could not run just now. Nothing was charged, and nothing was recorded about this token — try again in a few minutes.",
      detail: [], facts: gathered,
    };
  }

  const [mod, scr] = await Promise.all([moderate(fields), screen(gathered)]);

  if (mod.decision === "refuse") {
    await audit("gate", "refused_moderation", { ticker: fields?.ticker, category: mod.category });
    return { allow: false, reason: "This entry can't go on the wall.", detail: [mod.note].filter(Boolean), facts: gathered };
  }
  // A check that could not run is held, not refused: nothing is sold,
  // nothing is recorded, and the buyer is invited back rather than told
  // their contract failed something.
  if (scr.verdict === "incomplete") {
    await audit("gate", "incomplete", { ticker: fields?.ticker, ruleIds: scr.ruleIds });
    return {
      allow: false, retryable: true,
      reason: "Some checks could not run just now. Nothing was charged — try again in a few minutes.",
      detail: scr.reasons, ruleIds: scr.ruleIds, facts: gathered,
    };
  }

  if (scr.verdict === "refused" && !scr.escalate) {
    await audit("gate", "refused_screener", { ticker: fields?.ticker, ruleIds: scr.ruleIds });
    // Published, unlike a moderation refusal: these are measurements of
    // a contract, and the ledger of what we turned away is the only
    // evidence that the badge on a sold seat means anything.
    //
    // But ONLY when the facts were read off the chain here. A refusal
    // computed from facts handed to this function measures nothing —
    // it is the caller's own fixture coming back as a verdict. The
    // preflight probes are exactly that, and they must never reach a
    // public ledger.
    if (!facts && record) {
      await db.recordRefusal({
        ticker: fields?.ticker, mint: fields?.mint, reasons: scr.reasons, ruleIds: scr.ruleIds, source: via,
        vol24Usd: gathered?.vol24Usd ?? null,
      }).catch(() => {});
    }
    return { allow: false, reason: "Contract check failed.", detail: scr.reasons, ruleIds: scr.ruleIds, facts: gathered };
  }

  if (mod.decision === "escalate" || scr.escalate) {
    /* A contract nobody submitted must never queue work for a human.
     * The review queue is where a BUYER waits for an answer; filling it
     * with tickers the round happened to look at makes the one queue
     * that needs to be trustworthy the one nobody reads. Same rule as
     * the ledger: looking is not recording. */
    const row = record ? await queueForHuman("gate", "manual_review", { fields, facts: gathered, mod, scr }) : null;
    await audit("gate", "escalated", { ticker: fields?.ticker, id: row?.id || null, queued: Boolean(row) });
    return {
      allow: false, pending: true, reviewId: row?.id || null,
      reason: "Held for a manual check. Usually under an hour.",
      detail: [mod.note].filter(Boolean),
      facts: gathered,
    };
  }

  // Both "clear" and "flagged" are sellable — the public badge differs.
  return {
    allow: true,
    verdict: scr.verdict,
    badge: publicBadge(scr.verdict),
    publicReasons: scr.reasons,
    publicSummary: scr.summary,
    // Which flags, not just how many. The seat shows the reasons; the
    // scout has to know whether a flag is a property of the contract or
    // a description of the market before it drafts anything.
    ruleIds: scr.ruleIds,
    facts: gathered,
  };
}

/* ---- SCHEDULED ---------------------------------------------------- */

/**
 * LA RONDE — the daily pass over contracts nobody submitted.
 *
 * Runs the identical gate, in dry mode, on the loudest few contracts
 * that are currently buying attention elsewhere. It writes ONE thing:
 * a cached copy of what it saw, so the back office already has the
 * morning's work waiting instead of making you sit through it.
 *
 * It publishes nothing and it records no refusal. Turning "we looked at
 * a dozen projects" into "we named a dozen projects" is a decision a
 * person makes, one contract at a time, in /admin.
 */
export async function scoutRound({ limit = 8, cache = false } = {}) {
  const [ledger, seenState] = await Promise.all([
    db.listRefusals({ limit: 200 }),
    db.getState("scout:seen"),
  ]);
  const skip = new Set([
    ...ledger.map((r) => r.mint).filter(Boolean),
    ...(Array.isArray(seenState) ? seenState.map((x) => x.mint) : []),
  ]);

  const found = await shortlist({ limit, skip, ms: config.rpcTimeoutMs * 3 });

  // Two at a time: fast enough to answer inside one request, gentle
  // enough that the RPC does not start rate-limiting the checkout this
  // shares a key with.
  const checked = [];
  const queue = [...found.shortlist];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      try {
        const out = await checkoutGate({
          fields: { ticker: m.ticker, mint: m.mint, link: m.link, pitch: null, seatNo: null },
          via: "probe",
          record: false,
        });
        /* `pending` is its own thing. It means a human has to look — a
         * state of OURS — and calling it "refused" in the back office is
         * the same mislabelling the whole gate was rebuilt to stop, just
         * one screen further in. */
        const verdict = out.allow ? (out.verdict || "flagged")
          : out.pending ? "pending"
          : out.retryable ? "incomplete"
          : "refused";
        const reasons = out.allow ? (out.publicReasons || []) : (out.detail || []);
        const worth = postWorth({ verdict, ruleIds: out.ruleIds || [], market: m });
        checked.push({
          mint: m.mint, ticker: m.ticker, via: m.via, audience: m.audience,
          vol24Usd: m.vol24Usd, lpUsd: m.lpUsd, fdvUsd: m.fdvUsd, dexId: m.dexId,
          ageHours: m.ageHours === null ? null : Math.round(m.ageHours),
          link: m.link, links: m.links || null,
          verdict, reasons, ruleIds: out.ruleIds || [],
          ...worth,
          draft: worth.post ? guarded(probeDraft({ ticker: m.ticker, verdict, reasons, vol24Usd: out.facts?.vol24Usd ?? m.vol24Usd })) : null,
        });
      } catch (err) {
        checked.push({ mint: m.mint, ticker: m.ticker, verdict: "error", post: false, why: String(err.message || err).slice(0, 160) });
      }
    }
  };
  await Promise.all([worker(), worker()]);
  checked.sort((a, b) => (Number(b.post) - Number(a.post)) || (b.score || 0) - (a.score || 0));

  /* The other half of the round: who would get a seat, and how to write
   * to them. Nothing here is published — see the header of scout.js for
   * the conflict this creates and the rule that contains it. */
  const [contactedState, wallNow, standingState] = await Promise.all([
    db.getState("scout:contacted"),
    wall.publicWall(),
    db.getState("scout:prospects"),
  ]);
  const contacted = new Set(Array.isArray(contactedState) ? contactedState.map((x) => x?.mint) : []);
  const seatUsd = wallNow
    .map((x) => (x.status === "taken" ? wall.minimumBid(x) : config.seatFloorUsd))
    .sort((a, b) => a - b)[0] ?? config.seatFloorUsd;

  const leads = prospects(checked, { contacted }).map((c) => ({
    mint: c.mint, ticker: c.ticker, verdict: c.verdict, reasons: c.reasons,
    vol24Usd: c.vol24Usd, lpUsd: c.lpUsd, fdvUsd: c.fdvUsd, dexId: c.dexId,
    ageHours: c.ageHours, via: c.via, links: c.links, seatUsd,
    // Missing here is what broke the write. It is also what the standing
    // list sorts by, so without it the "best lead first" ordering was
    // quietly comparing undefined to undefined.
    audience: c.audience,
    outreach: outreachDraft({ ticker: c.ticker, verdict: c.verdict, reasons: c.reasons, seatUsd }),
  }));

  /* The leads found tonight are folded into the standing list rather
   * than replacing it. Before this, `leads` WAS the answer — two or
   * three rows that lived until the next round overwrote them. */
  const standing = mergeProspects(standingState, leads, { contacted });
  /* Not silenced. A list that cannot be saved is the single worst thing
   * that can go wrong here — it looks exactly like a quiet market from
   * the outside, and that is precisely how this went unnoticed. */
  let stored = true;
  try {
    await db.setState("scout:prospects", standing);
  } catch (err) {
    stored = false;
    await audit("scout", "prospects_not_saved", { err: String(err.message || err).slice(0, 300) });
  }

  const round = {
    ...found,
    checked: oneADay(checked),
    prospects: standing,
    freshProspects: leads.length,
    prospectsStored: stored,
    at: new Date().toISOString(),
  };
  await audit("scout", "round", {
    seen: found.seen, shortlisted: found.shortlist.length,
    postable: round.checked.filter((c) => c.post).length,
    prospects: standing.length,
    freshProspects: leads.length,
    withheld: checked.filter((c) => c.post).length - round.checked.filter((c) => c.post).length,
    sourcesLive: found.sources.filter((s) => s.ok).length,
    cached: cache,
  });

  // Trim before caching: the shortlist rows are already represented in
  // `checked`, and a state document is not a place to keep a payload
  // growing at whatever size the market feels like today.
  if (cache) {
    try {
      await db.setState("scout:latest", { ...round, shortlist: round.shortlist.length });
    } catch (err) {
      await audit("scout", "round_not_cached", { err: String(err.message || err).slice(0, 300) });
    }
  }
  return round;
}

/**
 * The month, counted rather than characterised.
 *
 * Runs on the last day of the month and leaves a draft in the back
 * office. `checked` counts every contract the gate actually measured —
 * rounds, probes and checkouts — which is the number that makes the
 * refusal count mean something. Four refusals out of six contracts is a
 * different sentence from four out of two hundred.
 */
export async function monthlyRecap({ now = new Date(), cache = true } = {}) {
  const end = new Date(now);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)).toISOString();

  const [rows, seats, log] = await Promise.all([
    db.listRefusals({ limit: 500 }),
    db.listSeats(),
    db.recentAudit(2000),
  ]);

  const inMonth = (iso) => typeof iso === "string" && iso >= start;
  const refused = rows.filter((r) => !r.hidden && inMonth(r.at)).length;
  const checked = log.filter((a) =>
    inMonth(a.at) && (a.action === "screened" || a.action === "refused_screener" || a.action === "public")).length;
  const sold = seats.filter((x) => x.occupant && inMonth(x.occupant.since)).length;
  const takeovers = wall.recentTakeovers(seats, 200).filter((t) => inMonth(t.displacedAt)).length;

  const draft = {
    kind: "monthly",
    at: end.toISOString(),
    month: `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`,
    text: monthlyDraft({
      monthIndex: end.getUTCMonth(), year: end.getUTCFullYear(),
      checked, refused, sold, takeovers, seats: config.seatCount,
    }),
    counts: { checked, refused, sold, takeovers },
  };
  draft.chars = draft.text.length;

  if (!guardOutput(draft.text, "poster").ok) {
    await audit("poster", "monthly_guard_blocked", { month: draft.month });
    return { skipped: true, reason: "output guard" };
  }
  if (cache) await db.setState("recap:latest", draft).catch(() => {});
  await audit("poster", "monthly_recap", draft.counts);
  return draft;
}

export async function hourlyTape() {
  const orders = await db.listOrders({ limit: 500 });
  const window = wall.windowFromOrders(orders, 1);
  const out = await writeTape(window, { store });
  return out || { skipped: true };
}

export async function dailyReports() {
  const seats = await db.listSeats();
  const due = seats.filter((s) => s.occupant?.contact);
  const results = [];
  for (const s of due) {
    const r = await report({
      ticker: s.occupant.ticker,
      seatNo: s.no,
      contact: s.occupant.contact,
      hoursHeld: (Date.now() - new Date(s.occupant.since).getTime()) / 3_600_000,
      takeoverPrice: wall.takeoverPrice(s),
      badge: s.occupant.badge,
      flags: s.occupant.reasons,
      manageUrl: `${config.publicBaseUrl}/seat/${s.no}`,
    }, { store });
    results.push({ ticker: s.occupant.ticker, sent: Boolean(r?.sent), queued: Boolean(r?.queued) });
  }
  return { processed: results.length, results };
}

/**
 * Money that arrived and belongs to nobody.
 *
 * Runs on a clock rather than on a page view, because the buyer whose
 * transfer landed after their hold expired has already closed the tab.
 * Every incoming transfer that no paid order claims is written down
 * with its sender, so it can be refunded by hand from the back office.
 */
export async function sweepUnclaimed() {
  if (!config.treasury) return { recorded: 0, skipped: "no treasury" };

  let transfers;
  try { transfers = await pay.recentTransfers({ limit: 25 }); }
  catch (err) { return { recorded: 0, error: String(err.message || err) }; }

  const paid = await db.listOrders({ status: "paid", limit: 200 });
  const spent = new Set(paid.map((o) => o.signature).filter(Boolean));

  let recorded = 0;
  for (const t of transfers) {
    if (t.delta <= 0) continue;            // outgoing, or fees only
    if (spent.has(t.signature)) continue;  // this one bought a seat
    const row = await db.recordUnclaimed({
      signature: t.signature,
      lamports: t.delta,
      amountSol: pay.lamportsToSol(t.delta),
      from: t.from,
      blockTime: t.blockTime || null,
    });
    if (row) {
      recorded += 1;
      await audit("payments", "unclaimed_recorded", { signature: t.signature, lamports: t.delta, from: t.from });
    }
  }
  return { recorded, scanned: transfers.length };
}

/** A hold that was never paid for goes back on the market. */
export async function expireHolds() {
  const orders = await db.listOrders({ status: "awaiting_payment", limit: 200 });
  let freed = 0;
  for (const o of orders) {
    if (new Date(o.expiresAt).getTime() > Date.now()) continue;
    await db.updateOrder(o.id, { status: "expired" });
    await wall.releaseSeat(o.seatNo, o.id);
    freed++;
  }
  return { freed };
}

/* ---- input validation --------------------------------------------- */

const TICKER = /^[A-Z0-9]{2,10}$/;

export function validateEntry(body) {
  const errors = [];
  const ticker = String(body?.ticker || "").replace(/^\$/, "").trim().toUpperCase();
  const mint = String(body?.mint || "").trim();
  const link = String(body?.link || "").trim();
  const pitch = String(body?.pitch || "").trim();
  const contact = String(body?.contact || "").trim();
  const seatNo = Number(body?.seatNo);
  const amountUsd = Number(body?.amountUsd);

  if (!TICKER.test(ticker)) errors.push("Ticker must be 2–10 letters or digits.");
  if (!isSolanaAddress(mint)) errors.push("Mint must be a Solana token address.");
  try { vetUrl(link); } catch { errors.push("Link must be a plain https:// address on port 443."); }
  if (pitch.length < 3) errors.push("Say something about the token — one line is enough.");
  if (pitch.length > 160) errors.push("Keep the pitch under 160 characters.");
  if (contact && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) errors.push("That email address doesn't look right.");
  if (!Number.isInteger(seatNo) || seatNo < 1 || seatNo > config.seatCount) errors.push("Pick a seat on the wall.");

  return { ok: errors.length === 0, errors, value: { ticker, mint, link, pitch, contact, seatNo, amountUsd } };
}

/* ---- routes -------------------------------------------------------- */

/**
 * One live hold per visitor. Not for accounting — so that nobody can
 * park all 24 seats at the floor price and freeze the wall.
 *
 * The address is hashed with a server-side secret and never stored in
 * the clear: we need to recognise a repeat, not to know who it is.
 */
function visitorKey(req) {
  return crypto.createHash("sha256")
    .update(clientIp(req) + "|" + (config.gateToken || "wall"))
    .digest("hex").slice(0, 32);
}

const internalOk = (req) => secretEquals(bearer(req), config.gateToken) || (!config.gateToken && !isProd);
const adminOk = (req) => secretEquals(bearer(req), config.adminToken) || (!config.adminToken && !isProd);

async function handleCheckout(req, res) {
  const ip = clientIp(req);
  if (!throttle(`checkout:${ip}`, 10, 10 * 60_000)) {
    return json(res, 429, { error: "Too many attempts. Give it ten minutes." });
  }

  const body = await readJson(req);
  const v = validateEntry(body);
  if (!v.ok) return json(res, 400, { error: "invalid", detail: v.errors });

  const seat = await db.getSeat(v.value.seatNo);
  if (!seat) return json(res, 404, { error: "No such seat." });
  if (wall.seatIsHeld(seat)) return json(res, 409, { error: "Someone is paying for this seat right now. Try again in a few minutes." });

  const bid = wall.checkBid(seat, v.value.amountUsd);
  if (!bid.ok) {
    // A settled seat is refused before the chain is read at all: there
    // is no price to quote, so there is nothing to look up.
    return json(res, bid.settled ? 409 : 400, {
      error: bid.settled ? bid.reason : "invalid",
      detail: [bid.reason],
      settledUntil: bid.settled || null,
    });
  }
  const priceUsd = bid.amount;

  // One seat at a time per visitor.
  const visitor = visitorKey(req);
  const live = await db.listOrders({ status: "awaiting_payment", limit: 100 });
  const alreadyHolding = live.find(
    (o) => o.visitor === visitor && new Date(o.expiresAt).getTime() > Date.now()
  );
  if (alreadyHolding) {
    // Nothing to do with the contract: it is a rule about the buyer.
    // It must not render as a verdict on the token, and it must carry
    // a reason the page can actually print.
    const no = String(alreadyHolding.seatNo).padStart(2, "0");
    return json(res, 409, {
      allow: false, retryable: true, factsUnread: true, ownHold: true,
      reason: `You already have seat №${no} on hold. Pay for it, or wait for it to expire — then this seat is yours to try.`,
      detail: [],
      error: `You already have seat №${no} on hold.`,
    });
  }

  const gate = await checkoutGate({ fields: v.value });

  if (!gate.allow) {
    await db.createOrder({
      ...v.value, priceUsd, status: gate.pending ? "held_for_review" : "refused",
      reason: gate.reason, detail: gate.detail || [], reviewId: gate.reviewId || null,
    });
    return json(res, gate.pending ? 202 : 409, {
      allow: false, pending: Boolean(gate.pending),
      // Without these two the page prints "Refused / not sellable" over
      // a check that never ran, and shows the pessimistic placeholders
      // as though they were measurements.
      retryable: Boolean(gate.retryable),
      factsUnread: Boolean(gate.factsUnread),
      reason: gate.reason, detail: gate.detail || [],
      facts: publicFacts(gate.facts),
    });
  }

  // Price it and take the seat off the market while they pay.
  // Amounts already in flight, so no two live orders share a number.
  const inFlight = live.map((o) => o.lamports);

  let priced;
  try { priced = await pay.quote(priceUsd, inFlight); }
  catch (err) { return json(res, 503, { error: "Prices are unavailable right now — nothing was charged.", detail: [String(err.message)] }); }

  const reference = pay.newReference();
  const order = await db.createOrder({
    ...v.value,
    chain: "sol",
    status: "awaiting_payment",
    priceUsd,
    amountSol: priced.amountSol,
    lamports: priced.lamports,
    solUsd: priced.solUsd,
    reference,
    badge: gate.badge,
    publicReasons: gate.publicReasons,
    screenedAt: new Date().toISOString(),
    visitor,
    expiresAt: new Date(Date.now() + config.seatHoldMinutes * 60_000).toISOString(),
    displaced: seat.occupant?.ticker || null,
  });

  const held = await wall.holdSeat(v.value.seatNo, order.id);
  if (!held.ok) {
    await db.updateOrder(order.id, { status: "expired" });
    return json(res, 409, { error: held.reason });
  }

  await audit("gate", "order_created", { id: order.id, ticker: order.ticker, seatNo: order.seatNo, badge: order.badge });

  return json(res, 200, {
    allow: true,
    orderId: order.id,
    badge: gate.badge,
    publicReasons: gate.publicReasons,
    publicSummary: gate.publicSummary,
    facts: publicFacts(gate.facts),
    payment: {
      treasury: config.treasury,
      amountSol: priced.amountSol,
      priceUsd,
      solUsd: priced.solUsd,
      reference,
      url: pay.paymentUrl({
        amountSol: priced.amountSol, reference,
        label: "The Wall", message: `Seat ${order.seatNo} — $${order.ticker}`,
      }),
      expiresAt: order.expiresAt,
    },
  });
}

/** Only what was actually checked, never the internals. */
/** Never hand out a draft the output guard would refuse. A reason string
 *  is public copy written by us, but it travels through a ticker's name
 *  and a DEX's name, and those we did not write. */
function guarded(text) {
  if (!text) return null;
  return guardOutput(text, "poster").ok ? text : null;
}

export function publicFacts(f = {}) {
  if (!f) return null;
  return {
    mintAuthority: f.mintAuthority, freezeAuthority: f.freezeAuthority,
    lpLocked: f.lpLocked, lpProof: f.lpProof || null, lpUsd: f.lpUsd, vol24Usd: f.vol24Usd ?? null, lpDetail: f.lpDetail, dexId: f.dexId,
    topHolderPct: f.topHolderPct === undefined || f.topHolderPct === null ? null : Number(Number(f.topHolderPct).toFixed(2)),
    holdersProof: f.holdersProof || null, holdersSampled: f.holdersSampled ?? null,
    ageHours: f.ageHours === undefined ? null : Math.round(Number(f.ageHours)),
    linkStatus: f.linkStatus, linkThreat: f.linkThreat, linkRedirected: f.linkRedirected,
    linkError: f.linkError || null, vaultsSkipped: f.vaultsSkipped ?? null,
    ownersResolved: f.ownersResolved ?? null,
    checkedAt: f.gatheredAt || null,
  };
}

async function handleOrderStatus(req, res, id) {
  const order = await db.getOrder(id);
  if (!order) return json(res, 404, { error: "No such order." });

  if (order.status === "awaiting_payment") {
    if (new Date(order.expiresAt).getTime() < Date.now()) {
      await db.updateOrder(order.id, { status: "expired" });
      await wall.releaseSeat(order.seatNo, order.id);
      return json(res, 200, { status: "expired", reason: "The hold ran out. Nothing was charged." });
    }
    const paidOrders = await db.listOrders({ status: "paid", limit: 100 });
    const check = await pay.verifyPayment({
      reference: order.reference,
      lamports: order.lamports,
      claimed: paidOrders.map((o) => o.signature).filter(Boolean),
      notBefore: new Date(order.createdAt).getTime(),
    });
    if (check.paid) {
      const awarded = await wall.awardSeat(order.seatNo, order);
      await db.updateOrder(order.id, {
        status: "paid", paidAt: new Date().toISOString(),
        signature: check.signature, displaced: awarded.displaced,
        surplus: check.surplus || 0, paymentMethod: check.method,
      });
      if (check.surplus > 0) {
        await audit("payments", "overpaid", {
          id: order.id, surplus: check.surplus, signature: check.signature,
        });
      }
      await audit("gate", "seat_awarded", { id: order.id, seatNo: order.seatNo, ticker: order.ticker, signature: check.signature, method: check.method });
      return json(res, 200, { status: "paid", seatNo: order.seatNo, signature: check.signature });
    }
    return json(res, 200, {
      status: "awaiting_payment", reason: check.reason,
      received: check.received || null, expiresAt: order.expiresAt,
    });
  }

  return json(res, 200, { status: order.status, seatNo: order.seatNo, signature: order.signature || null });
}

/* ---- server -------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  try {
    // Health is unauthenticated so the platform can probe it.
    if (req.method === "GET" && p === "/health") {
      return json(res, 200, { ok: true, agentsEnabled: agentsEnabled(), seats: config.seatCount });
    }

    /* ---- public API ---- */
    if (req.method === "GET" && p === "/api/wall") return json(res, 200, { seats: await wall.publicWall() });
    if (req.method === "GET" && p === "/api/tape") return json(res, 200, { posts: await recentPosts(20) });
    if (req.method === "GET" && p === "/api/refused") {
      const rows = (await db.listRefusals({ limit: 80 })).filter((r) => !r.hidden);
      /* The mint IS republished, and it used to not be. The old reason
       * was that a ledger should not hand anyone a contract address to
       * go buy — a fair instinct, and the wrong call.
       *
       * Withholding it stops the good use and not the bad one: anyone
       * who wants to buy the token finds it on a chart site in ten
       * seconds, while nobody can check that our finding is about the
       * contract we say it is. And a ticker is not an identity — the
       * evening this changed, a search for one refused ticker returned
       * a dozen live tokens wearing the same name across four chains.
       * A refusal published against a name rather than an address is an
       * accusation smeared over every project that shares it.
       *
       * Printed, never linked — the same rule the site already applies
       * to its own token on /rules. */
      return json(res, 200, {
        rows: rows.map((r) => ({ at: r.at, ticker: r.ticker, mint: r.mint || null, reasons: r.reasons, ruleIds: r.ruleIds, source: r.source || "gate", slug: r.slug || null })),
      });
    }
    if (req.method === "GET" && p === "/api/config") {
      return json(res, 200, {
        seatCount: config.seatCount, floorUsd: config.seatFloorUsd,
        minIncrementPct: config.minIncrementPct, minIncrementUsd: config.minIncrementUsd,
        maxBidUsd: config.maxBidUsd, holdMinutes: config.seatHoldMinutes,
        protectMinutes: config.seatProtectMinutes,
        rules: {
          maxTopHolderPct: config.maxTopHolderPct, minLpUsd: config.minLpUsd,
          flagLpUsd: config.flagLpUsd, flagAgeHours: config.flagAgeHours, flagTopHolderPct: config.flagTopHolderPct,
        },
      });
    }
    if (req.method === "POST" && p === "/api/checkout") return handleCheckout(req, res);
    if (req.method === "GET" && p.startsWith("/api/order/")) return handleOrderStatus(req, res, p.slice("/api/order/".length));

    /* ---- internal ---- */
    if (p === "/gate" || p.startsWith("/cron/") || p.startsWith("/ops/") || p.startsWith("/api/admin/")) {
      const ok = p.startsWith("/api/admin/") ? adminOk(req) : internalOk(req);
      if (!ok) return json(res, 401, { error: "unauthorized" });
    }

    if (req.method === "POST" && p === "/gate") {
      // Probe endpoint. Accepts facts so preflight can prove the deployed
      // rules refuse what they must — and sells nothing, ever.
      const body = await readJson(req);
      const out = await checkoutGate({ fields: body.fields, facts: body.facts, via: "probe" });
      return json(res, out.allow ? 200 : 409, { ...out, probe: true, facts: publicFacts(out.facts) });
    }

    if (req.method === "POST" && p === "/cron/scout") {
      // Cloud Scheduler wakes the instance, the round runs, the result
      // waits in /admin. Nothing is published and nothing is recorded —
      // see scoutRound().
      try {
        /* 8 was chosen to be gentle on the RPC key this shares with the
         * checkout. That was the right worry and the wrong number: it
         * capped the funnel at eight contracts a day for a wall with
         * twenty-four seats to fill. The round runs at night, when the
         * checkout is not competing for the key. */
        const r = await scoutRound({ limit: config.scoutRoundLimit, cache: true });
        return json(res, 200, {
          at: r.at, seen: r.seen, shortlisted: r.shortlist.length,
          postable: r.checked.filter((c) => c.post).length,
          // Reported because it was not, and so nobody ever learned that
          // the round had been finding leads and dropping them.
          prospects: r.prospects.length,
          freshProspects: r.freshProspects,
          sourcesLive: r.sources.filter((s) => s.ok).length,
        });
      } catch (err) {
        await audit("scout", "round_failed", { err: String(err.message || err).slice(0, 200) });
        return json(res, 502, { error: "the round could not run", detail: String(err.message || err).slice(0, 200) });
      }
    }
    if (req.method === "POST" && p === "/cron/recap") {
      // Fires daily; does the work only on the last day of the month, so
      // the schedule is one line instead of twelve.
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 3600_000);
      if (tomorrow.getUTCMonth() === now.getUTCMonth()) {
        return json(res, 200, { skipped: true, reason: "not the last day of the month" });
      }
      return json(res, 200, await monthlyRecap({ now }));
    }
    if (req.method === "POST" && p === "/cron/tape") return json(res, 200, await hourlyTape());
    if (req.method === "POST" && p === "/cron/reports") return json(res, 200, await dailyReports());
    if (req.method === "POST" && p === "/cron/expire") {
      const freed = await expireHolds();
      const swept = await sweepUnclaimed();
      return json(res, 200, { ...freed, unclaimed: swept });
    }

    if (req.method === "GET" && p === "/ops/graduation") {
      return json(res, 200, { tape: await progress("tape"), reporter: await progress("reporter") });
    }

    /* ---- back office ---- */
    if (req.method === "GET" && p === "/api/admin/queue") {
      return json(res, 200, { rows: await db.listQueue({ status: url.searchParams.get("status") || undefined, limit: 100 }) });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/queue/")) {
      const id = p.slice("/api/admin/queue/".length);
      const body = await readJson(req);
      if (!["approved", "rejected"].includes(body.status)) return json(res, 400, { error: "status must be approved or rejected" });
      const row = await db.updateQueueStatus(id, body.status, body.reviewer);
      if (!row) return json(res, 404, { error: "not found" });
      await audit("admin", "queue_reviewed", { id, status: body.status });
      return json(res, 200, { row });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/reinstate/")) {
      const agent = p.slice("/api/admin/reinstate/".length);
      await reinstate(agent, "admin");
      return json(res, 200, { agent, demoted: false });
    }
    if (req.method === "GET" && p === "/api/admin/unclaimed") {
      return json(res, 200, { rows: await db.listUnclaimed({ status: url.searchParams.get("status") || undefined }) });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/unclaimed/")) {
      const sig = p.slice("/api/admin/unclaimed/".length);
      const body = await readJson(req);
      if (!["refunded", "ignored", "unclaimed"].includes(body.status)) {
        return json(res, 400, { error: "status must be refunded, ignored or unclaimed" });
      }
      const row = await db.settleUnclaimed(sig, body.status, body.note);
      if (!row) return json(res, 404, { error: "not found" });
      await audit("admin", "unclaimed_settled", { signature: sig, status: body.status });
      return json(res, 200, { row });
    }
    if (req.method === "POST" && p === "/api/admin/screen") {
      // Run the real checks on a contract nobody submitted. It sells
      // nothing and holds nothing — it exists so the ledger can be fed
      // honestly before anyone has asked for a seat.
      const body = await readJson(req);
      const mint = String(body.mint || "").trim();
      const ticker = String(body.ticker || "").trim();
      if (!isSolanaAddress(mint)) return json(res, 400, { error: "mint is not a Solana address" });
      if (!ticker) return json(res, 400, { error: "ticker is required" });
      // `dry` runs the identical checks and records nothing. The scout
      // uses it to look at a dozen contracts a day without turning the
      // public ledger into a firehose — the ledger is a record of what
      // we decided to publish, not of every query we ever ran.
      /* record:false always, on purpose. The ledger entry is written
       * further down instead — but only once postWorth() has agreed the
       * finding is publishable. The ledger IS the published page: every
       * row becomes /refused/<ticker>. Recording first and asking about
       * publishability afterwards would mean a token could get a public
       * refusal page carrying a finding we had already judged too weak
       * to post. */
      const out = await checkoutGate({
        fields: { ticker, mint, link: body.link || null, pitch: null, seatNo: null },
        via: "probe",
        record: false,
      });
      if (body.dry !== true) {
        // A contract is checked once. Without this the loudest token on
        // Solana comes back at the top of the shortlist every morning.
        const seen = (await db.getState("scout:seen")) || [];
        const next = [{ mint, at: new Date().toISOString() }, ...seen.filter((x) => x?.mint !== mint)].slice(0, 500);
        await db.setState("scout:seen", next).catch(() => {});
      }
      await audit("admin", "screened", { ticker, refused: !out.allow, dry: body.dry === true });
      const verdict = out.allow ? (out.verdict || "flagged")
        : out.pending ? "pending" : out.retryable ? "incomplete" : "refused";
      const reasons = out.allow ? (out.publicReasons || []) : (out.detail || []);
      /* The round decides what is worth publishing with postWorth(), and
       * for a long time this route did not — it handed back a finished
       * draft for any outcome at all. That is how a refusal whose only
       * finding was our own missing link came back as a post about a
       * token with $11M of daily volume. Restraint that lives on one
       * path and not the other is not restraint; it is a coin toss over
       * which entry point you happened to use.
       *
       * So both paths now ask the same question, and this one says why
       * it declined rather than silently returning nothing. */
      const worth = postWorth({
        verdict,
        ruleIds: out.ruleIds || [],
        market: {
          vol24Usd: out.facts?.vol24Usd ?? 0,
          txns24: out.facts?.txns24 ?? 0,
          change24: out.facts?.change24 ?? 0,
          via: [],
        },
      });
      /* Now, and only now, the ledger. A refusal that is not publishable
       * is still a real refusal — it just is not evidence we are willing
       * to put a named project's ticker next to. */
      let recorded = false;
      if (body.dry !== true && verdict === "refused" && worth.post) {
        await db.recordRefusal({
          ticker, mint, reasons, ruleIds: out.ruleIds || [], source: "probe",
          vol24Usd: out.facts?.vol24Usd ?? null,
        }).catch(() => {});
        recorded = true;
      }

      return json(res, 200, {
        allow: Boolean(out.allow), badge: out.badge || null, verdict,
        reasons,
        post: worth.post,
        recorded,
        withheld: worth.post ? null : worth.why,
        // Built here rather than by the caller. A CLI that rebuilds the
        // post itself drifts from the back office within a week, and then
        // the wording depends on which one you happened to use.
        draft: worth.post
          ? guarded(probeDraft({ ticker, verdict, reasons, vol24Usd: out.facts?.vol24Usd ?? null }))
          : null,
        facts: publicFacts(out.facts),
      });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/contacted/")) {
      // A prospect you have written to drops off the list. There is no
      // CRM here and there should not be one — this is a strike-through,
      // not a pipeline.
      const mint = decodeURIComponent(p.slice("/api/admin/contacted/".length));
      if (!isSolanaAddress(mint)) return json(res, 400, { error: "mint is not a Solana address" });
      const prev = (await db.getState("scout:contacted")) || [];
      const next = [{ mint, at: new Date().toISOString() }, ...prev.filter((x) => x?.mint !== mint)].slice(0, 500);
      await db.setState("scout:contacted", next);
      // And strike it off the standing list now, rather than leaving it
      // there looking un-actioned until the next round happens to run.
      const standing = (await db.getState("scout:prospects")) || [];
      const left = standing.filter((r) => r?.mint !== mint);
      if (left.length !== standing.length) {
        await db.setState("scout:prospects", left).catch(() => {});
      }
      await audit("scout", "contacted", { mint });
      return json(res, 200, { mint, contacted: true, remaining: left.length });
    }
    if (req.method === "GET" && p === "/api/admin/recap") {
      return json(res, 200, { recap: (await db.getState("recap:latest")) || null });
    }
    if (req.method === "POST" && p === "/api/admin/recap") {
      // On demand, for any month you want to look at — the schedule is a
      // convenience, not the only way in.
      return json(res, 200, await monthlyRecap({ now: new Date() }));
    }
    if (req.method === "GET" && p === "/api/admin/scout") {
      // The round Cloud Scheduler already ran this morning. Opening the
      // back office should not mean waiting thirty seconds for work that
      // was done at seven.
      //
      // The standing list is read separately rather than taken from the
      // cached round: it outlives any single round, and it is the one
      // thing here that must still be correct after a night when
      // discovery found nothing at all.
      const [cached, standing] = await Promise.all([
        db.getState("scout:latest"),
        db.getState("scout:prospects"),
      ]);
      return json(res, 200, {
        round: cached || null,
        prospects: Array.isArray(standing) ? standing : [],
      });
    }
    if (req.method === "POST" && p === "/api/admin/scout") {
      const body = await readJson(req).catch(() => ({}));
      // Was capped at 10. The cap existed to protect the RPC key, but it
      // also silently truncated any larger number you asked for, so a
      // round you thought was checking 30 contracts was checking ten.
      const limit = Math.min(60, Math.max(1, Number(body.limit) || config.scoutRoundLimit));
      try {
        return json(res, 200, await scoutRound({ limit, cache: true }));
      } catch (err) {
        await audit("scout", "discovery_failed", { err: String(err.message || err).slice(0, 200) });
        return json(res, 502, { error: "candidate discovery failed", detail: String(err.message || err).slice(0, 200) });
      }
    }
    if (req.method === "GET" && p === "/api/admin/posts") {
      const [refusals, seats] = await Promise.all([
        db.listRefusals({ limit: 40 }),
        db.listSeats(),
      ]);
      const drafts = await compose({
        refusals,
        seats: (await wall.publicWall()),
        takeovers: wall.recentTakeovers(seats, 10),
      });
      return json(res, 200, { drafts });
    }
    if (req.method === "GET" && p === "/api/admin/refusals") {
      // The whole ledger, including rows already broadcast or already
      // hidden. Without this there is no way to take back a line the
      // old rules published — which is exactly what happened.
      const rows = await db.listRefusals({ limit: 200 });
      return json(res, 200, { rows });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/unhide/")) {
      const ok = await db.unhideRefusal(p.slice("/api/admin/unhide/".length));
      if (!ok) return json(res, 404, { error: "not found" });
      await audit("admin", "refusal_unhidden", { id: p.slice("/api/admin/unhide/".length) });
      return json(res, 200, { hidden: false });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/hide/")) {
      // Hidden, not deleted. A ledger you can erase is not a ledger:
      // the row stays readable in the back office, it just stops being
      // published.
      const id = p.slice("/api/admin/hide/".length);
      const ok = await db.hideRefusal(id);
      if (!ok) return json(res, 404, { error: "not found" });
      await audit("admin", "refusal_hidden", { id });
      return json(res, 200, { id, hidden: true });
    }
    if (req.method === "POST" && p.startsWith("/api/admin/posted/")) {
      const id = p.slice("/api/admin/posted/".length);
      const ok = await db.markRefusalPosted(id);
      if (!ok) return json(res, 404, { error: "not found" });
      await audit("poster", "marked_posted", { id });
      return json(res, 200, { id, posted: true });
    }
    if (req.method === "POST" && p === "/api/admin/sweep") {
      return json(res, 200, await sweepUnclaimed());
    }

    if (req.method === "GET" && p === "/api/admin/ops") {
      return json(res, 200, {
        graduation: { tape: await progress("tape"), reporter: await progress("reporter") },
        orders: await db.listOrders({ limit: 50 }),
        takeovers: wall.recentTakeovers(await db.listSeats(), 30),
        audit: await db.recentAudit(50),
        agentsEnabled: agentsEnabled(),
      });
    }

    /* ---- static ---- */
    if (req.method === "GET") {
      if (p === "/" ) return serveStatic(res, "index.html");
      if (p === "/admin") return serveStatic(res, "admin.html");
      if (p === "/refused") return serveStatic(res, "refused.html");
      if (p === "/robots.txt") return serveStatic(res, "robots.txt");
      if (p === "/sitemap.xml") {
        const rows = (await db.listRefusals({ limit: 400 })).filter((r) => !r.hidden && r.slug);
        return text(res, 200, sitemap(rows), "application/xml; charset=utf-8");
      }
      if (p === "/terms") return serveStatic(res, "terms.html");
      if (p.startsWith("/refused/")) {
        /* Server-rendered, complete on the first response. A page that
         * has to exist in a search index the moment it is written cannot
         * be a shell that fetches itself. */
        const slug = decodeURIComponent(p.slice("/refused/".length)).replace(/\/+$/, "");
        const row = slug ? await db.getRefusalBySlug(slug) : null;
        if (!row) return text(res, 404, refusalMissingPage(slug), "text/html; charset=utf-8");
        // 410, not 404: it was published here, and it was withdrawn. A
        // ledger you can quietly erase is not a ledger.
        if (row.hidden) return text(res, 410, refusalGonePage(slug), "text/html; charset=utf-8");
        return text(res, 200, refusalPage(row), "text/html; charset=utf-8");
      }
      if (p.startsWith("/seat/")) return serveStatic(res, "index.html");
      if (p === "/rules") return serveStatic(res, "rules.html");
      return serveStatic(res, p);
    }

    return json(res, 404, { error: "not found" });
  } catch (err) {
    await audit("gate", "crash", { path: p, err: String(err?.message || err) });
    // Fail closed. A crashed gate must not sell a seat.
    return json(res, 503, { allow: false, reason: "Checks unavailable — try again shortly." });
  }
});

if (!isTest) {
  const problems = productionPreconditions();
  if (problems.length) {
    console.error("refusing to start:\n" + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }
  await wall.ensureSeats();
  server.listen(config.port, () => console.log(`the wall listening on ${config.port} (${config.storageBackend})`));
}

export default server;
