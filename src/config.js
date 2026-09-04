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

  /* ── Who publishes this site ──────────────────────────────────────
   * A site that takes money has to say who is behind it. In France
   * that is the LCEN, and what it asks for depends on the publisher:
   * a registered micro-entreprise names itself, its legal form, its
   * SIREN and its address; the host is named in every case.
   *
   * The identity lives here, in config, for the same reason every
   * threshold does — so the page cannot drift from the truth. And
   * nothing here has a default. A field that is not set is not
   * printed: the terms page renders the lines it has and omits the
   * rest, because an empty "[to be completed]" on a public page is a
   * worse signal than a missing line to the one person who matters,
   * the one hesitating to send money.
   *
   * Setting these does not make the notice correct. It makes it
   * printable. Whether it satisfies the law is a question for someone
   * who practises it. */
  publisher: {
    /* The one identity field with a default, because it is the one
     * that is already established: the publisher is called The Wall,
     * it says so on every page, and printing it asserts nothing that
     * is not already true. Everything under it has to be earned. */
    name: (process.env.PUBLISHER_NAME || "The Wall").trim(),
    legalForm: (process.env.PUBLISHER_LEGAL_FORM || "").trim(),
    siren: (process.env.PUBLISHER_SIREN || "").replace(/[^0-9]/g, ""),
    director: (process.env.PUBLISHER_DIRECTOR || "").trim(),
    address: (process.env.PUBLISHER_ADDRESS || "").trim(),
    /* An address given on request rather than printed. It is what the
     * operator asked for, and it is recorded here as a deliberate
     * choice rather than an omission — so the page can say so in
     * words instead of leaving a hole the reader has to interpret. */
    addressOnRequest: bool(process.env.PUBLISHER_ADDRESS_ON_REQUEST, false),
    vat: (process.env.PUBLISHER_VAT || "").trim(),
    host: (process.env.PUBLISHER_HOST || "Google Cloud EMEA Limited, Velasco, Clanwilliam Place, Dublin 2, Ireland").trim(),
    contact: (process.env.PUBLISHER_CONTACT || "contact@thewallsol.com").trim(),
  },

  /* ── Mail ─────────────────────────────────────────────────────────
   * One provider, one sender, one reply-to.
   *
   * Optional everywhere, by default. Unset, a buyer still gets their
   * seat — a payment confirmed on chain does not depend on an email —
   * and the missing receipt is written to the audit log as
   * `email_not_configured` rather than swallowed. It also shows up in
   * `salesGaps()`, so a seat sold without it is marked `sold_with_gaps`.
   *
   * It becomes a condition of selling only under
   * `SALES_REQUIRE_PUBLISHER=true`. That is the operator's switch, not
   * this file's opinion. */
  mail: {
    key: (process.env.RESEND_API_KEY || "").trim(),
    from: (process.env.MAIL_FROM || "").trim(),
    replyTo: (process.env.MAIL_REPLY_TO || "contact@thewallsol.com").trim(),
    timeoutMs: num(process.env.MAIL_TIMEOUT_MS, 6000),
  },

  /* Does an incomplete publisher identity close the checkout?
   *
   * Default **false**, by the operator's decision of 2026-09-03: seats stay
   * sellable while the identity is being completed. That is a business risk
   * the operator carries knowingly, and it is his to carry — but it must not
   * be silent, so a seat awarded while anything is missing writes a
   * `sold_with_gaps` line to the audit log naming what was missing at the
   * moment of the sale, and `/api/admin/ops` reports the gaps continuously.
   *
   * Set to true and the checkout refuses instead, with the honest 503. The
   * machinery for that is built, tested and one variable away. */
  requirePublisherForSales: bool(process.env.SALES_REQUIRE_PUBLISHER, false),

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
  // How many contracts the nightly round checks. Each one is a full
  // gate run against the RPC, so this is a cost dial, not a quality
  // dial — raising it lengthens the prospect list, it does not loosen
  // a single threshold.
  scoutRoundLimit: num(process.env.SCOUT_ROUND_LIMIT, 24),

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

/* ------------------------------------------------------------------ *
 * WHAT IS STILL MISSING — AND, SEPARATELY, WHAT WE REFUSE TO SELL OVER.
 *
 * Three different questions, deliberately kept apart.
 *
 * productionPreconditions() above answers "may this process run at
 * all" — no chain access, an open admin endpoint, an audit log that
 * dies at scale-to-zero. Those exit the process, because a server that
 * boots without them is dangerous.
 *
 * salesGaps() answers "what is not in place yet". It is a measurement.
 * It is reported whatever the policy, it is copied into the audit log
 * at the moment of every sale made under it, and it never exits.
 *
 * salesPreconditions() answers "what stops a sale today". That is a
 * policy, and by the operator's decision of 2026-09-03 it is EMPTY by
 * default: an incomplete identity does not close the till. Selling
 * continues, each affected sale is marked, and the refusal behaviour
 * waits behind SALES_REQUIRE_PUBLISHER=true.
 *
 * Collapsing the second into the third is how a policy change quietly
 * becomes a measurement change — which is why they are two functions
 * and not one with a flag inside it.
 * ------------------------------------------------------------------ */

/**
 * SIREN is nine digits with a Luhn checksum. Verifying it here is the
 * same move as the ed25519 curve test in the holder check: an
 * arithmetic fact, checkable without trusting anyone, and cheap.
 *
 * It establishes that the number is well-formed. It does not establish
 * that it belongs to this publisher, and nothing printed from it may
 * claim that it does.
 */
export function sirenLooksValid(siren) {
  const d = String(siren || "").replace(/[^0-9]/g, "");
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[8 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

/** Identity fields that are not established yet. Empty means printable. */
export function publisherGaps() {
  const p = config.publisher;
  const gaps = [];
  if (!p.name) gaps.push("PUBLISHER_NAME — the notice cannot name its publisher");
  if (!p.legalForm) gaps.push("PUBLISHER_LEGAL_FORM — e.g. \"Entreprise individuelle (micro-entreprise)\"");
  if (!p.siren) gaps.push("PUBLISHER_SIREN — a registered business must print its number");
  else if (!sirenLooksValid(p.siren)) gaps.push("PUBLISHER_SIREN — nine digits, and this one fails its checksum");
  if (!p.address && !p.addressOnRequest) {
    gaps.push("PUBLISHER_ADDRESS — set it, or set PUBLISHER_ADDRESS_ON_REQUEST=true and answer the requests");
  }
  if (!p.host) gaps.push("PUBLISHER_HOST — the host has to be named");
  return gaps;
}

export const publisherComplete = () => publisherGaps().length === 0;

/** True when a message can actually leave the building. */
export const mailConfigured = () => Boolean(config.mail.key && config.mail.from);

/**
 * Everything that is not in place yet — whether or not it closes the till.
 * This is the honest list, and it is reported even when selling continues.
 */
export function salesGaps() {
  const gaps = publisherGaps();
  if (!mailConfigured()) {
    gaps.push("RESEND_API_KEY / MAIL_FROM — a buyer would pay and hear nothing back");
  }
  return gaps;
}

/**
 * Of those, the ones that actually stop a sale. Empty unless the operator
 * has asked for the strict behaviour with SALES_REQUIRE_PUBLISHER=true.
 *
 * Kept separate from salesGaps() on purpose: "what is missing" and "what we
 * refuse to sell over" are two different questions, and collapsing them is
 * how a policy change quietly becomes a measurement change.
 */
export function salesPreconditions() {
  return config.requirePublisherForSales ? salesGaps() : [];
}

export const salesOpen = () => salesPreconditions().length === 0;
