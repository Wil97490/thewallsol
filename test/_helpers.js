process.env.NODE_ENV = "test";
process.env.STORAGE_BACKEND = "memory";
process.env.AGENT_MODERATOR_ENABLED = "false";   // no model in the release gate, on purpose
process.env.TREASURY_WALLET = process.env.TREASURY_WALLET || "So11111111111111111111111111111111111111112";
process.env.SEAT_COUNT = "6";

export const OK_FACTS = {
  ticker: "TEST", mint: "So11111111111111111111111111111111111111112",
  mintAuthority: false, freezeAuthority: false,
  lpLocked: true, lpUsd: 40000, lpMethod: "lp_burn", lpProof: "burned", lpDetail: "99.9% of LP supply is burned",
  topHolderPct: 9, holdersSampled: 20,
  ageHours: 72, tickerTaken: false,
  linkStatus: 200, linkThreat: "none", linkRedirected: false,
  gatherError: null,
};

export const FIELDS = {
  ticker: "TEST", mint: "So11111111111111111111111111111111111111112",
  pitch: "a coin", link: "https://example.com", seatNo: 1,
};

// Tests hermetiques : deploy.sh charge deploy.env avant de les lancer.
// Vos reglages de production ne doivent jamais decider de ce que teste
// le gate de release.
process.env.SEAT_FLOOR_USD = "50";
process.env.TAKEOVER_MULTIPLIER = "1.15";
process.env.SEAT_HOLD_MINUTES = "20";
process.env.SEAT_PROTECT_MINUTES = "60";
process.env.MIN_INCREMENT_PCT = "0.10";
process.env.MIN_INCREMENT_USD = "5";
process.env.MAX_BID_USD = "100000";
process.env.MAX_TOP_HOLDER_PCT = "40";
process.env.MIN_LP_USD = "2500";
process.env.FLAG_LP_USD = "15000";
process.env.FLAG_AGE_HOURS = "24";
process.env.FLAG_TOP_HOLDER_PCT = "25";
