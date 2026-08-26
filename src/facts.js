import { config, SYSTEM_HOLDERS, isProd } from "./config.js";
import { deadline, withTimeout } from "./lib/deadline.js";
import { safeGet, vetUrl, UnsafeUrlError } from "./lib/net.js";
import { isSolanaAddress, decodeBase58 } from "./lib/base58.js";
import { isOnCurve } from "./lib/ed25519.js";
import { rpc } from "./solana/rpc.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
import { poolFacts, systemHolders } from "./solana/pool.js";

/* ------------------------------------------------------------------ *
 * FACTS — everything the screener's hard rules read.
 *
 * This is infrastructure, not a model. Get it right and the rest of the
 * gate works; get it wrong and you have a screener grading fiction.
 *
 * Two properties this file must never lose:
 *   1. It fails LOUD. A fact that cannot be established comes back as
 *      the value that trips the hard rule, never a default that passes.
 *   2. It is the ONLY source of facts. The gate does not accept facts
 *      from a request body — see server.js. Otherwise the buyer grades
 *      their own homework.
 * ------------------------------------------------------------------ */

/** Every value here refuses. Used whenever gathering breaks down. */
export function refusingFacts(extra = {}) {
  return {
    mintAuthority: true, freezeAuthority: true,
    lpLocked: false, lpUsd: 0, vol24Usd: 0, lpMethod: "unknown", lpProof: "unavailable", lpDetail: "not established",
    topHolderPct: 100, holdersSampled: 0,
    ageHours: 0, tickerTaken: false,
    linkStatus: 0, linkThreat: "unchecked", finalUrl: null,
    gatherError: null,
    ...extra,
  };
}

/* ---- mint authorities --------------------------------------------- */

async function mintFacts(mint, ms) {
  const info = await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }], { ms });
  const p = info?.value?.data?.parsed?.info;
  if (!p) throw new Error("mint account not parseable — is this an SPL mint?");
  return {
    mintAuthority: p.mintAuthority !== null && p.mintAuthority !== undefined, // true = supply can be inflated
    freezeAuthority: p.freezeAuthority !== null && p.freezeAuthority !== undefined, // true = holders can be frozen
    decimals: Number(p.decimals ?? 0),
    supply: Number(p.supply || 0),
  };
}

/* ---- holder concentration ------------------------------------------
 * getTokenLargestAccounts returns the top 20 — enough to catch a single
 * wallet sitting on the float, which is what the hard rule tests.
 *
 * Pool vaults and the incinerator are excluded first: an LP vault
 * holding 60% is not the same signal as a person holding 60%, and
 * failing to exclude them refuses honest tokens all day.
 * ------------------------------------------------------------------ */

/** The RPC refuses this call outright past a certain size — no budget
 *  fixes it, and no retry will either. It is a limit of the method,
 *  not a fact about the token. */
const TOO_MANY_ACCOUNTS = /too many accounts|narrow down results/i;

async function holderFacts(mint, supply, poolAddress, ms) {
  let largest;
  try {
    largest = await rpc("getTokenLargestAccounts", [mint], { ms });
  } catch (err) {
    if (TOO_MANY_ACCOUNTS.test(String(err?.message || err))) {
      // A mint with more holder accounts than the method will return is
      // not a concentrated mint — it is an unmeasurable one. Say that,
      // and let the screener decide; do not sink the whole gather.
      return {
        topHolderPct: null, holdersSampled: 0, topHolderAddress: null,
        vaultsSkipped: 0, ownersResolved: false,
        holdersProof: "too_many_accounts",
      };
    }
    throw err;
  }
  const accounts = (largest?.value || []).slice(0, 20);
  if (!accounts.length) return { topHolderPct: 100, holdersSampled: 0, topHolderAddress: null, vaultsSkipped: 0 };

  // getTokenLargestAccounts returns token accounts, not people. Ask who
  // owns each one.
  /* This call gets a floor of its own rather than whatever is left of
   * the gate budget. Starve it and it fails silently, no owner is
   * resolved, no pool is excluded — and the wall accuses a liquidity
   * pool of being a whale. That is exactly what happened the first two
   * times this ran against a real token. */
  let owners = [];
  let ownersResolved = false;
  try {
    const infos = await rpc(
      "getMultipleAccounts",
      [accounts.map((a) => a.address), { encoding: "jsonParsed" }],
      { ms: Math.max(1500, ms) }
    );
    owners = (infos?.value || []).map((v) => v?.data?.parsed?.info?.owner || null);
    ownersResolved = owners.some(Boolean);
  } catch {
    owners = [];
    ownersResolved = false;
  }

  /* An owner that is OFF the ed25519 curve is a program-derived address:
   * a pool vault, an escrow, a locker. Nobody holds its private key, so
   * it cannot be a whale — and on a healthy Solana token, half the
   * supply sits in exactly such an account by design.
   *
   * The first version of this asked the chain whether the owner "looked
   * like" a wallet. It doesn't work: a pool authority frequently has no
   * account of its own, and the fallback counted every liquidity pool on
   * Solana as a single wallet holding half the float. The curve test has
   * no such gap — it is arithmetic, not a heuristic. */
  const excluded = systemHolders([poolAddress, ...SYSTEM_HOLDERS].filter(Boolean));

  let top = 0;
  let topAddress = null;
  let vaultsSkipped = 0;

  accounts.forEach((a, i) => {
    const owner = owners[i];
    if (excluded.has(a.address) || (owner && excluded.has(owner))) return;
    if (owner && !isWalletAddress(owner)) { vaultsSkipped += 1; return; }
    const amount = Number(a.amount || 0);
    if (amount > top) { top = amount; topAddress = a.address; }
  });

  return {
    topHolderPct: supply > 0 ? (top / supply) * 100 : 100,
    holdersSampled: accounts.length,
    topHolderAddress: topAddress,
    vaultsSkipped,
    ownersResolved,
  };
}

/** A person can hold a key for this address; a program cannot. */
function isWalletAddress(address) {
  try { return isOnCurve(decodeBase58(address)); }
  catch { return true; }   // unparseable → count it, the strict reading
}

/* ---- link safety ---------------------------------------------------
 * The seat's destination link is the highest-risk field on the whole
 * site. A drainer here, with your traffic behind it, is not a moderation
 * incident — it is the end of the site.
 *
 * The fetch goes through safeGet: private ranges and the cloud metadata
 * endpoint are unreachable, and every redirect hop is re-checked.
 * ------------------------------------------------------------------ */

async function safeBrowsing(urls, ms) {
  if (!config.safeBrowsingKey) return "unchecked";
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(config.safeBrowsingKey)}`,
        {
          method: "POST", signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            client: { clientId: "thewall", clientVersion: "1.0" },
            threatInfo: {
              threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
              platformTypes: ["ANY_PLATFORM"],
              threatEntryTypes: ["URL"],
              threatEntries: [...new Set(urls.filter(Boolean))].map((url) => ({ url })),
            },
          }),
        }
      );
      if (!res.ok) return "unchecked";
      const j = await res.json();
      return j.matches?.length ? String(j.matches[0].threatType).toLowerCase() : "none";
    }, ms, "safe browsing");
  } catch {
    return "unchecked";                        // trips the hard rule — never silently "none"
  }
}

export async function linkFacts(link, ms) {
  if (!link) return { linkStatus: 0, linkThreat: "missing", finalUrl: null, linkHops: 0 };
  try { vetUrl(link); }
  catch (e) {
    const why = e instanceof UnsafeUrlError ? e.message : "malformed";
    return { linkStatus: 0, linkThreat: why, finalUrl: null, linkHops: 0 };
  }

  let reached;
  try {
    reached = await safeGet(link, { timeoutMs: Math.max(500, Math.floor(ms * 0.7)) });
  } catch (e) {
    // Keep the real reason. "unreachable" with nothing behind it turns
    // every network problem into an accusation against the buyer.
    const why = e instanceof UnsafeUrlError ? e.message : "unreachable";
    return {
      linkStatus: 0, linkThreat: why, finalUrl: null, linkHops: 0,
      linkError: String(e?.code || e?.message || e).slice(0, 200),
    };
  }

  const threat = await safeBrowsing([link, reached.finalUrl], Math.max(300, Math.floor(ms * 0.4)));
  return {
    linkStatus: reached.status,
    linkThreat: threat,
    finalUrl: reached.finalUrl,
    linkHops: reached.hops,
    linkRedirected: reached.finalUrl !== link,
  };
}

/* ---- local development only ----------------------------------------
 * You cannot build a checkout screen against a gate that refuses
 * everything, and you should not need a paid RPC key to move a button.
 * This fixture exists for that, and it is inert the moment NODE_ENV is
 * production — see fixtureAllowed(), which is tested.
 * ------------------------------------------------------------------ */

export function fixtureAllowed(nodeEnv, flag) {
  return nodeEnv !== "production" && flag === "1";
}

const FIXTURE = {
  mintAuthority: false, freezeAuthority: false,
  lpLocked: true, lpUsd: 41200, vol24Usd: 380000, lpMethod: "lp_burn", lpProof: "burned", lpDetail: "99.4% of LP supply is burned",
  dexId: "raydium", priceUsd: 0.0000412,
  topHolderPct: 8.4, holdersSampled: 20, topHolderAddress: null,
  ageHours: 96, tickerTaken: false,
  linkStatus: 200, linkThreat: "none", finalUrl: null, linkHops: 0, linkRedirected: false,
  gatherError: null,
};

/* ---- assembly ------------------------------------------------------ */

/**
 * The only way facts are produced. Shares one budget across every call
 * so the gate answers inside the checkout instead of whenever it feels
 * like it.
 *
 * @returns facts shaped exactly as screener.js reads them.
 */
export async function gatherFacts({ mint, link, ticker, isTickerTaken }, opts = {}) {
  const dl = opts.deadline || deadline(config.gateBudgetMs);
  const base = { ticker: ticker || null, mint: mint || null };

  if (fixtureAllowed(process.env.NODE_ENV, process.env.DEV_FACTS_FIXTURE)) {
    return {
      ...FIXTURE, ...base,
      tickerTaken: Boolean(await isTickerTaken?.(ticker)),   // still real, so the UI can be exercised
      gatheredAt: new Date().toISOString(), fixture: true,
    };
  }

  // Cheapest check first: a malformed mint never reaches the chain.
  if (!isSolanaAddress(mint)) return refusingFacts({ ...base, gatherError: "mint is not a Solana address" });
  if (!config.rpcUrl) return refusingFacts({ ...base, gatherError: "SOLANA_RPC_URL not set" });

  const rpcMs = dl.slice(config.rpcTimeoutMs);
  const linkMs = dl.slice(config.linkTimeoutMs);

  const [mintRes, poolRes, linkRes, takenRes] = await Promise.allSettled([
    mintFacts(mint, rpcMs),
    poolFacts(mint, rpcMs),
    linkFacts(link, linkMs),
    Promise.resolve(isTickerTaken ? isTickerTaken(ticker) : false),
  ]);

  if (mintRes.status === "rejected") {
    return refusingFacts({ ...base, gatherError: `mint: ${mintRes.reason?.message || mintRes.reason}` });
  }

  const m = mintRes.value;
  const pool = poolRes.status === "fulfilled"
    ? poolRes.value
    : { lpLocked: false, lpUsd: 0, vol24Usd: 0, lpMethod: "unknown", lpProof: "unavailable", lpDetail: "pool check failed", dexId: null, pairAgeHours: null, pair: null };

  let holders;
  try {
    holders = await holderFacts(mint, m.supply, pool.pair, dl.slice(config.rpcTimeoutMs));
  } catch (err) {
    return refusingFacts({ ...base, gatherError: `holders: ${err.message}` });
  }

  const l = linkRes.status === "fulfilled"
    ? linkRes.value
    : { linkStatus: 0, linkThreat: "unchecked", finalUrl: null, linkHops: 0 };

  return {
    ...base,
    mintAuthority: m.mintAuthority,
    freezeAuthority: m.freezeAuthority,
    decimals: m.decimals,
    supply: m.supply,
    lpLocked: pool.lpLocked,
    lpUsd: pool.lpUsd,
    vol24Usd: pool.vol24Usd || 0,
    lpMethod: pool.lpMethod,
    lpProof: pool.lpProof || "unavailable",
    lpDetail: pool.lpDetail,
    dexId: pool.dexId,
    priceUsd: pool.priceUsd || 0,
    topHolderPct: holders.topHolderPct,
    holdersSampled: holders.holdersSampled,
    holdersProof: holders.holdersProof || null,
    topHolderAddress: holders.topHolderAddress,
    vaultsSkipped: holders.vaultsSkipped,
    ownersResolved: holders.ownersResolved,
    // The pool's own creation time is a better age than anything the
    // buyer can type into a form.
    ageHours: pool.pairAgeHours ?? 0,
    tickerTaken: takenRes.status === "fulfilled" ? Boolean(takenRes.value) : false,
    linkStatus: l.linkStatus,
    linkThreat: l.linkThreat,
    linkError: l.linkError || null,
    finalUrl: l.finalUrl,
    linkHops: l.linkHops || 0,
    linkRedirected: Boolean(l.linkRedirected),
    gatherError: null,
    gatheredAt: new Date().toISOString(),
    budgetLeftMs: dl.remaining(),
  };
}
