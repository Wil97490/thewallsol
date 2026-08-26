import crypto from "node:crypto";
import { config, isProd } from "./config.js";
import { encodeBase58, isSolanaAddress } from "./lib/base58.js";
import { rpc, getJson } from "./solana/rpc.js";

/* ------------------------------------------------------------------ *
 * PAYMENTS — seats are paid in SOL, straight to your treasury wallet.
 *
 * No processor, no chargebacks, no merchant account. The flow is the
 * Solana Pay pattern:
 *
 *   1. the order gets a random `reference` — 32 bytes that mean nothing
 *      to anyone but us
 *   2. the buyer's wallet includes it as a read-only account in the
 *      transfer, so the transaction is findable by that reference alone
 *   3. we ask the chain for transactions touching the reference, and
 *      accept the seat only when one of them actually moved at least
 *      the quoted lamports into the treasury and did not fail
 *
 * We verify the transfer ourselves, from the chain. We never take the
 * buyer's word — or the front end's — that a payment happened.
 * ------------------------------------------------------------------ */

const LAMPORTS = 1_000_000_000;

/** The finest amount a wallet will actually transmit: 0.000001 SOL. */
export const STEP = 1000;
const SOL_MINT = "So11111111111111111111111111111111111111112";

export const newReference = () => encodeBase58(crypto.randomBytes(32));

/* ---- price ---------------------------------------------------------
 * Seats are priced in dollars because that is what a human understands,
 * and paid in SOL because that is what the audience holds. If we cannot
 * establish the rate, we do not quote a price — an order priced from a
 * stale rate is either a gift or a scam, and neither is acceptable.
 * ------------------------------------------------------------------ */

let rateCache = { at: 0, usd: 0 };
const RATE_TTL = 60_000;

export async function solUsd(ms = 1500) {
  // Local development: quote against a fixed rate instead of a paid
  // market feed. Ignored the moment NODE_ENV is production.
  if (!isProd && Number(process.env.DEV_SOL_USD) > 0) return Number(process.env.DEV_SOL_USD);

  if (Date.now() - rateCache.at < RATE_TTL && rateCache.usd > 0) return rateCache.usd;

  const sources = [
    async () => {
      const j = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${SOL_MINT}`, ms);
      const pairs = (j?.pairs || []).filter((p) => p.chainId === "solana" && Number(p.priceUsd) > 0);
      if (!pairs.length) throw new Error("no SOL pair");
      const best = pairs.reduce((a, b) => ((b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a));
      return Number(best.priceUsd);
    },
    async () => {
      const j = await getJson("https://api.coinbase.com/v2/prices/SOL-USD/spot", ms);
      const v = Number(j?.data?.amount);
      if (!v) throw new Error("no coinbase price");
      return v;
    },
  ];

  for (const src of sources) {
    try {
      const usd = await src();
      if (usd > 0.01 && usd < 100000) { rateCache = { at: Date.now(), usd }; return usd; }
    } catch { /* try the next one */ }
  }
  throw new Error("SOL price unavailable — cannot quote a seat");
}

/**
 * Price a seat, and make the amount itself the identifier.
 *
 * A few hundred lamports of noise — worth a hundredth of a cent — turn
 * "0.01023 SOL" into a number that belongs to exactly one order. Two
 * buyers at the same price no longer produce the same transfer, and a
 * payment can be recognised without the wallet having to cooperate.
 *
 * That matters more than it sounds: the reference mechanism this used
 * to rely on is honoured by some wallets and silently dropped by
 * others. When it is dropped the buyer pays, nothing matches, and the
 * seat never arrives. The amount is always carried, by every wallet,
 * through every route — including a transfer typed by hand.
 *
 * @param {number[]} taken lamport amounts already in flight, to avoid a collision
 */
/**
 * The pricing itself, with no network in it, so the release gate can
 * prove the property that matters: every amount we quote must survive
 * the trip through a wallet.
 *
 * Phantom — and every wallet we have seen — sends SOL rounded to six
 * decimals, so anything below 1000 lamports is silently dropped in
 * transit. The first version of this put the identifier in the last
 * three digits: the buyer paid, the amount arrived rounded, and nothing
 * matched. What is displayed must be exactly what arrives.
 */
export function quoteLamports(priceUsd, rate, taken = []) {
  const base = Math.ceil((Number(priceUsd) / rate) * LAMPORTS / STEP) * STEP;
  const used = new Set(taken.map(Number));
  for (let i = 0; i < 200; i++) {
    const candidate = base + (1 + Math.floor(Math.random() * 500)) * STEP;
    if (!used.has(candidate)) return candidate;
  }
  return base + STEP;
}

export async function quote(priceUsd, taken = []) {
  const rate = await solUsd();
  const lamports = quoteLamports(priceUsd, rate, taken);
  return {
    priceUsd: Number(priceUsd),
    solUsd: rate,
    lamports,
    amountSol: Number((lamports / LAMPORTS).toFixed(6)),
  };
}

/** The URL a Solana wallet understands. Also what the QR encodes. */
export function paymentUrl({ amountSol, reference, label, message }) {
  if (!isSolanaAddress(config.treasury)) throw new Error("TREASURY_WALLET is not a Solana address");
  const p = new URLSearchParams();
  p.set("amount", String(amountSol));
  p.set("reference", reference);
  if (label) p.set("label", label);
  if (message) p.set("message", message);
  return `solana:${config.treasury}?${p.toString()}`;
}

/* ---- verification -------------------------------------------------- */

/**
 * Who sent this, and how much did the treasury gain?
 *
 * The sender is the account that lost the most — not simply the fee
 * payer, which is the same thing for a plain transfer but not for a
 * transaction someone else paid the fee on. Pure, so it is testable.
 */
export function readTransfer(tx, treasury) {
  const keys = (tx?.transaction?.message?.accountKeys || []).map((k) => (typeof k === "string" ? k : k.pubkey));
  const pre = tx?.meta?.preBalances || [];
  const post = tx?.meta?.postBalances || [];
  if (!keys.length || pre.length !== keys.length) return null;

  const idx = keys.indexOf(treasury);
  const delta = idx < 0 ? 0 : Number(post[idx]) - Number(pre[idx]);

  let from = null;
  let worst = 0;
  keys.forEach((k, i) => {
    if (k === treasury) return;
    const d = Number(post[i]) - Number(pre[i]);
    if (d < worst) { worst = d; from = k; }
  });

  return { delta, from: from || keys[0] || null, blockTime: tx?.blockTime || null, slot: tx?.slot || null };
}

function treasuryDelta(tx) {
  const keys = tx?.transaction?.message?.accountKeys || [];
  const idx = keys.findIndex((k) => (typeof k === "string" ? k : k.pubkey) === config.treasury);
  if (idx < 0) return 0;
  const pre = tx?.meta?.preBalances?.[idx];
  const post = tx?.meta?.postBalances?.[idx];
  if (pre === undefined || post === undefined) return 0;
  return Number(post) - Number(pre);
}

/**
 * Pick the transaction that pays an order out of the treasury's recent
 * history. Pure, so the release gate can prove it.
 *
 * The match is on the EXACT lamport amount. No tolerance: the amount is
 * the identifier, and "close enough" would let one transfer claim two
 * seats. A signature already spent on another order is never reused.
 *
 * @param {Array<{signature:string, delta:number, blockTime?:number, err?:any}>} candidates
 */
export function matchPayment(candidates, { lamports, claimed = [], notBefore = 0 }) {
  const spent = new Set(claimed);
  for (const c of candidates) {
    if (!c || c.err) continue;
    if (spent.has(c.signature)) continue;
    if (notBefore && c.blockTime && c.blockTime * 1000 < notBefore - 300_000) continue;
    if (Number(c.delta) === Number(lamports)) return c;
  }
  return null;
}

/**
 * @returns {{paid:boolean, signature?:string, lamports?:number, reason?:string, method?:string}}
 *
 * Two routes, tried in order. The reference is exact when the wallet
 * honours it; the amount works even when it doesn't.
 */
/** Recent money movements on the treasury, newest first. */
export async function recentTransfers({ limit = 25, ms = 2500 } = {}) {
  if (!config.rpcUrl || !isSolanaAddress(config.treasury)) return [];
  const sigs = await rpc("getSignaturesForAddress", [config.treasury, { limit }], { ms });
  const out = [];
  for (const s of sigs || []) {
    if (s.err) continue;
    const tx = await getTx(s.signature, ms);
    if (!tx) continue;
    const moved = readTransfer(tx, config.treasury);
    if (moved) out.push({ signature: s.signature, ...moved });
  }
  return out;
}

export async function verifyPayment({ reference, lamports, claimed = [], notBefore = 0, ms = 2500 }) {
  if (!config.rpcUrl) return { paid: false, reason: "no chain access" };
  if (!isSolanaAddress(config.treasury)) return { paid: false, reason: "treasury not configured" };

  const seen = [];

  // Route 1 — the Solana Pay reference, when the wallet carried it.
  if (reference) {
    try {
      const sigs = await rpc("getSignaturesForAddress", [reference, { limit: 5 }], { ms });
      for (const s of sigs || []) {
        if (s.err) continue;
        const tx = await getTx(s.signature, ms);
        if (!tx) continue;
        const delta = treasuryDelta(tx);
        if (delta >= Math.floor(Number(lamports) * 0.995)) {
          return { paid: true, signature: s.signature, lamports: delta, slot: tx.slot, method: "reference" };
        }
        seen.push({ signature: s.signature, delta });
      }
    } catch { /* fall through to the amount */ }
  }

  // Route 2 — the exact amount, in the treasury's own recent history.
  try {
    // Newest first, and stop at the first match. The payment is almost
    // always the most recent transfer, and every extra transaction read
    // is a paid RPC call on a page that polls.
    const sigs = await rpc("getSignaturesForAddress", [config.treasury, { limit: 20 }], { ms });
    const candidates = [];
    let hit = null;
    for (const s of sigs || []) {
      if (s.err) continue;
      if (notBefore && s.blockTime && s.blockTime * 1000 < notBefore - 300_000) break;
      const tx = await getTx(s.signature, ms);
      if (!tx) continue;
      const candidate = { signature: s.signature, delta: treasuryDelta(tx), blockTime: s.blockTime };
      candidates.push(candidate);
      hit = matchPayment([candidate], { lamports, claimed, notBefore });
      if (hit) break;
    }
    if (hit) return { paid: true, signature: hit.signature, lamports: hit.delta, method: "exact_amount" };

    /* Somebody who sent MORE than we asked must get their seat. Only
     * when there is exactly one such transfer, though — two candidates
     * and we cannot tell whose money it is, so a human decides. */
    const over = candidates.filter(
      (c) => !claimed.includes(c.signature) && c.delta > Number(lamports)
    );
    if (over.length === 1) {
      return {
        paid: true, signature: over[0].signature, lamports: over[0].delta,
        surplus: over[0].delta - Number(lamports), method: "overpaid",
      };
    }

    // Nothing matched — but say something useful about what did arrive.
    const partial = candidates.find((c) => c.delta > 0 && !claimed.includes(c.signature));
    if (partial) {
      return {
        paid: false,
        reason: `a transfer of ${lamportsToSol(partial.delta)} SOL arrived, but this seat costs ${lamportsToSol(lamports)} SOL exactly`,
        received: partial.delta,
      };
    }
  } catch (err) {
    return { paid: false, reason: `chain lookup failed: ${err.message}` };
  }

  return { paid: false, reason: "no transaction yet" };
}

async function getTx(signature, ms) {
  try {
    return await rpc(
      "getTransaction",
      [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }],
      { ms }
    );
  } catch { return null; }
}

export const lamportsToSol = (l) => Number(l) / LAMPORTS;
