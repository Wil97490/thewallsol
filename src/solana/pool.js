import { rpc, getJson } from "./rpc.js";
import { config } from "../config.js";

/* ------------------------------------------------------------------ *
 * POOL READER — the piece that used to return false and 0 in hard, and
 * therefore refused every entry ever submitted.
 *
 * Two questions, answered separately because they fail differently:
 *
 *   lpUsd     how deep is the pool        → market data (DexScreener)
 *   lpLocked  can the deployer pull it    → on-chain, and only "true"
 *                                           when we can PROVE it
 *
 * "Locked" is proven one of two ways:
 *   protocol_burn — the pool lives on a DEX that burns LP at migration
 *                   (pump.fun's AMM), so there is nothing to pull
 *   lp_burn       — the LP mint's supply sits at the incinerator
 *
 * Anything else — a third-party locker, a vesting contract, a DEX we
 * have not modelled — comes back `unknown`, which refuses. That is the
 * right default: "we could not prove it" and "it is safe" are not the
 * same sentence, and only one of them can be printed next to a price.
 * ------------------------------------------------------------------ */

const INCINERATOR = "1nc1nerator11111111111111111111111111111111";
const PROTOCOL_BURN_DEXES = new Set(["pumpswap", "pumpfun", "moonshot"]);
const DEXSCREENER = "https://api.dexscreener.com/latest/dex/tokens/";
const RAYDIUM_POOL = "https://api-v3.raydium.io/pools/info/ids?ids=";

/** Deepest Solana pair for a mint, plus what the market data tells us. */
export async function marketFacts(mint, ms) {
  const j = await getJson(DEXSCREENER + encodeURIComponent(mint), ms);
  const pairs = (j?.pairs || []).filter((p) => p.chainId === "solana");
  if (!pairs.length) return { pair: null, lpUsd: 0, vol24Usd: 0, priceUsd: 0, dexId: null, pairAgeHours: null };
  const best = pairs.reduce((a, b) => ((b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a));
  return {
    pair: best.pairAddress || null,
    dexId: (best.dexId || "").toLowerCase(),
    lpUsd: Math.round(best.liquidity?.usd || 0),
    // Read off the same response as the depth. What makes a thin pool
    // worth a sentence is usually what is being pushed through it.
    vol24Usd: Math.round(best.volume?.h24 || 0),
    priceUsd: Number(best.priceUsd || 0),
    fdvUsd: Math.round(best.fdv || 0),
    pairAgeHours: best.pairCreatedAt ? (Date.now() - best.pairCreatedAt) / 3_600_000 : null,
  };
}

/** Share of an SPL mint's supply parked at the incinerator, 0..1. */
async function burnedShare(lpMint, ms) {
  const [info, largest] = await Promise.all([
    rpc("getAccountInfo", [lpMint, { encoding: "jsonParsed" }], { ms }),
    rpc("getTokenLargestAccounts", [lpMint], { ms }),
  ]);
  const supply = Number(info?.value?.data?.parsed?.info?.supply || 0);
  if (!supply) return 1;                       // no LP tokens exist at all → nothing to pull
  const accounts = largest?.value || [];
  let burned = 0;
  for (const a of accounts) {
    if (a.address === INCINERATOR || a.owner === INCINERATOR) burned += Number(a.amount || 0);
  }
  return burned / supply;
}

async function raydiumLpMint(pairAddress, ms) {
  const j = await getJson(RAYDIUM_POOL + encodeURIComponent(pairAddress), ms);
  const p = Array.isArray(j?.data) ? j.data[0] : null;
  return p?.lpMint?.address || p?.lpMint || null;
}

/**
 * @returns { lpLocked, lpUsd, lpMethod, lpDetail, dexId, pairAgeHours }
 * Never throws — a failure is reported as not-locked with a reason.
 */
export async function poolFacts(mint, ms) {
  let market;
  try {
    market = await marketFacts(mint, ms);
  } catch (err) {
    return { lpLocked: false, lpUsd: 0, vol24Usd: 0, lpMethod: "unknown", lpProof: "unavailable", lpDetail: `market data unavailable: ${err.message}`, dexId: null, pairAgeHours: null };
  }

  if (!market.pair) {
    return { ...market, lpLocked: false, lpMethod: "no_pool", lpProof: "no_pool", lpDetail: "no Solana pool found for this mint" };
  }

  if (PROTOCOL_BURN_DEXES.has(market.dexId)) {
    return { ...market, lpLocked: true, lpMethod: "protocol_burn", lpProof: "protocol", lpDetail: `${market.dexId} burns LP at migration` };
  }

  if (market.dexId.startsWith("raydium")) {
    try {
      const lpMint = await raydiumLpMint(market.pair, ms);
      if (!lpMint) throw new Error("LP mint not returned by the pool API");
      const share = await burnedShare(lpMint, ms);
      const locked = share >= 0.9;
      return {
        ...market, lpLocked: locked, lpMethod: "lp_burn",
        lpProof: locked ? "burned" : "not_burned",
        lpDetail: `${(share * 100).toFixed(1)}% of LP supply is burned`,
      };
    } catch (err) {
      return { ...market, lpLocked: false, lpMethod: "unknown", lpProof: "unavailable", lpDetail: `LP burn check failed: ${err.message}` };
    }
  }

  // Not a verdict on the token: a gap in what we can read. The screener
  // must never publish this as though the liquidity were unlocked.
  return { ...market, lpLocked: false, lpMethod: "unknown", lpProof: "dex_unmodelled", lpDetail: `${market.dexId || "this DEX"} is not modelled by our checks` };
}

/** Excluded from holder concentration: burn, pools, and whatever you list. */
export function systemHolders(extra = []) {
  return new Set([INCINERATOR, "11111111111111111111111111111111", ...config.excludedHolders, ...extra]);
}
