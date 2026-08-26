/* ------------------------------------------------------------------ *
 * CONFIG — one place for every knob.
 *
 * Rule of the house: a missing value must never widen what the gate
 * accepts. Every default here is the strict end of the range, and the
 * production check below refuses to boot without the secrets.
 *
 * Every secret is trimmed. A secret stored with a trailing newline —
 * `openssl rand -hex 32 | gcloud secrets versions add` does exactly
 * that — otherwise produces an authentication that fails for a reason
 * nothing in the logs will ever show you.
 * ------------------------------------------------------------------ */

const num = (v, d) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === "" ? d : v !== "false");

export const env = process.env.NODE_ENV || "development";
export const isProd = env === "production";
export const isTest = env === "test";

export const config = {
  port: num(process.env.PORT, 8080),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "http://localhost:8080",

  rpcUrl: (process.env.SOLANA_RPC_URL || "").trim(),
  safeBrowsingKey: (process.env.SAFE_BROWSING_KEY || "").trim(),
  anthropicKey: (process.env.ANTHROPIC_API_KEY || "").trim(),
  gateToken: (process.env.GATE_TOKEN || "").trim(),
  adminToken: (process.env.ADMIN_TOKEN || "").trim(),
  treasury: (process.env.TREASURY_WALLET || "").trim(),

  storageBackend: process.env.STORAGE_BACKEND || (isTest ? "memory" : "file"),
  auditPath: process.env.AUDIT_LOG || "./data/audit.jsonl",
  queuePath: process.env.REVIEW_QUEUE || "./data/review-queue.jsonl",
  dataPath: process.env.DATA_DIR || "./data",

  // The wall
  seatCount: num(process.env.SEAT_COUNT, 24),

  /* The buyer names their own price above a floor. What sits under a
   * seat is then what somebody actually paid, not a formula — which is
   * both more honest and more interesting to look at.
   *
   * The minimum increment is what keeps it playable: without it two
   * buyers trade a seat back and forth a cent at a time, which earns
   * nothing and floods the hourly tape. */
  seatFloorUsd: num(process.env.SEAT_FLOOR_USD, 15),

  /* A seat you just paid for is yours for this long, whatever anyone
   * offers. Without it, someone pays fifteen dollars, is displaced four
   * minutes later, and has bought nothing at all — which is not an
   * auction, it is a site that took their money.
   *
   * The number is a trade: a wall of 24 seats with a 30 minute promise
   * turns over at most 48 times an hour, and a buyer who arrives during
   * a rush finds locked seats. Read it off "Sièges repris" rather than
   * off intuition. */
  seatProtectMinutes: num(process.env.SEAT_PROTECT_MINUTES, 30),
  minIncrementPct: num(process.env.MIN_INCREMENT_PCT, 0.10),
  minIncrementUsd: num(process.env.MIN_INCREMENT_USD, 5),
  maxBidUsd: num(process.env.MAX_BID_USD, 100000),
  seatHoldMinutes: num(process.env.SEAT_HOLD_MINUTES, 5),

  // Timing. The gate runs inside a checkout; it has a budget, not a wish.
  // The gate runs on a button click with a spinner, not inside a card
  // authorisation. Five seconds of honest checking beats two seconds of
  // timeouts reported as refusals.
  gateBudgetMs: num(process.env.GATE_BUDGET_MS, 5000),
  rpcTimeoutMs: num(process.env.RPC_TIMEOUT_MS, 1800),
  linkTimeoutMs: num(process.env.LINK_TIMEOUT_MS, 2500),
  modelTimeoutMs: num(process.env.MODEL_TIMEOUT_MS, 4000),

  // Hard rules — a token failing any of these cannot be sold.
  maxTopHolderPct: num(process.env.MAX_TOP_HOLDER_PCT, 40),
  minLpUsd: num(process.env.MIN_LP_USD, 2500),

  // Soft flags — sellable, but the badge says so.
  flagLpUsd: num(process.env.FLAG_LP_USD, 15000),
  flagAgeHours: num(process.env.FLAG_AGE_HOURS, 24),
  flagTopHolderPct: num(process.env.FLAG_TOP_HOLDER_PCT, 25),

  modelCallsPerHour: num(process.env.MODEL_CALLS_PER_HOUR, 400),
  excludedHolders: (process.env.EXCLUDED_HOLDERS || "")
    .split(",").map((s) => s.trim()).filter(Boolean),

  agentsEnabled: () => bool(process.env.AGENTS_ENABLED, true),
  agentEnabled: (name) =>
    bool(process.env.AGENTS_ENABLED, true) &&
    bool(process.env[`AGENT_${name.toUpperCase()}_ENABLED`], true),
};

/** Known Solana addresses that hold supply without being a person. */
export const SYSTEM_HOLDERS = new Set([
  "1nc1nerator11111111111111111111111111111111", // burn
  "11111111111111111111111111111111",            // system program
  ...config.excludedHolders,
]);

/**
 * Boot check. Refuses to start a production instance that would sell
 * seats it cannot screen. Returns the list of problems; server.js exits.
 */
export function productionPreconditions() {
  if (!isProd) return [];
  const missing = [];
  if (!config.rpcUrl) missing.push("SOLANA_RPC_URL — no chain access, every entry would be refused");
  if (!config.gateToken) missing.push("GATE_TOKEN — internal endpoints would be open");
  if (!config.adminToken) missing.push("ADMIN_TOKEN — the review queue would be open");
  if (!config.treasury) missing.push("TREASURY_WALLET — nothing could be paid for");
  if (config.storageBackend === "file") missing.push("STORAGE_BACKEND=file on Cloud Run — the audit log dies at every scale-to-zero");
  if (!config.safeBrowsingKey) missing.push("SAFE_BROWSING_KEY — every link would count as unchecked and be refused");
  return missing;
}
