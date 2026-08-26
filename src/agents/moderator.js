import { agentEnabled, agentsEnabled, audit } from "../guardrails.js";
import { askJson, ModelUnavailable, moderationMayBeSkipped, MODEL_FAST } from "./claude.js";

/* ------------------------------------------------------------------ *
 * MODERATOR — the only agent in the checkout path that uses the model,
 * and it never decides whether a token is good. It reads the free text
 * the buyer wrote and answers one question: can the site print this?
 *
 * Three decisions:
 *   allow     print it as written
 *   refuse    do not print it, and say so plainly
 *   escalate  a human looks at it. Nothing is sold in the meantime.
 *
 * Everything that is not a confident allow ends in escalate. A model
 * that times out, errors, hits the budget, or answers in a shape we did
 * not ask for is not an approval.
 * ------------------------------------------------------------------ */

const SYSTEM = `You moderate short text submitted to a public wall of memecoin listings.
You are NOT judging whether the token is a good investment — that is decided elsewhere by on-chain rules.
You decide only whether this text can be printed on a public site.

Refuse text that: impersonates a real person, company, exchange or public figure; claims an endorsement, audit,
partnership or listing that would need proof; promises returns, prices or outcomes; targets a private individual;
contains slurs, sexual content involving minors, or incitement to violence; or advertises a giveaway, airdrop
claim, wallet connection or "verification" flow (these are how drainers get clicks).

Escalate — do not decide — when the text is ambiguous, references a real brand in a way you cannot verify,
or reads like a claim of fact you cannot check.

Allow ordinary memecoin nonsense: jokes, mascots, absurd lore, self-deprecation, community talk.

Answer with JSON only: {"decision":"allow"|"refuse"|"escalate","category":"<short slug>","note":"<one sentence, plain, for the submitter>"}`;

function fieldsToText(fields = {}) {
  return [
    `TICKER: ${fields.ticker || ""}`,
    `PITCH: ${fields.pitch || ""}`,
    `LINK: ${fields.link || ""}`,
  ].join("\n");
}

/** Cheap, deterministic pre-pass. Catches the obvious before spending a call. */
const HARD_TEXT_RULES = [
  { re: /\b(connect|verify|validate|sync)\s+(your\s+)?wallet\b/i, category: "wallet_drainer_pattern" },
  { re: /\b(airdrop|giveaway)\b.*\b(claim|verify|connect)\b/i, category: "wallet_drainer_pattern" },
  { re: /\bseed\s?phrase|private\s?key|recovery\s?phrase\b/i, category: "credential_phishing" },
  { re: /\b(guaranteed|risk[- ]free)\s+(returns?|profits?|gains?)\b/i, category: "promised_returns" },
  { re: /\b(official|partnered|backed|audited)\s+by\s+\w+/i, category: "unverifiable_claim", escalate: true },
];

export async function moderate(fields) {
  if (!agentsEnabled() || !agentEnabled("moderator")) {
    if (moderationMayBeSkipped()) {
      return { decision: "allow", category: "moderation_skipped_dev", note: "Moderation is off in this environment." };
    }
    return { decision: "escalate", category: "moderator_disabled", note: "Text review is paused; a human will look at this." };
  }

  const text = fieldsToText(fields);

  for (const rule of HARD_TEXT_RULES) {
    if (rule.re.test(text)) {
      await audit("moderator", rule.escalate ? "escalated_pattern" : "refused_pattern", { category: rule.category, ticker: fields?.ticker });
      return rule.escalate
        ? { decision: "escalate", category: rule.category, note: "This mentions a claim we need to check by hand." }
        : { decision: "refuse", category: rule.category, note: "This text can't go on a public wall." };
    }
  }

  try {
    const out = await askJson({
      system: SYSTEM,
      prompt: text,
      maxTokens: 200,
      model: MODEL_FAST,
    });
    const decision = ["allow", "refuse", "escalate"].includes(out?.decision) ? out.decision : "escalate";
    return {
      decision,
      category: String(out?.category || "unspecified").slice(0, 40),
      note: String(out?.note || "").slice(0, 300),
    };
  } catch (err) {
    // Unavailable, slow, over budget, or off-shape. None of those is a yes.
    await audit("moderator", "unavailable", { err: String(err?.message || err), ticker: fields?.ticker });
    return {
      decision: "escalate",
      category: err instanceof ModelUnavailable ? "model_unavailable" : "moderator_error",
      note: "We couldn't review the text automatically; a human will.",
    };
  }
}
