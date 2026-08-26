import { config, isProd } from "../config.js";
import { withTimeout } from "../lib/deadline.js";
import { withinModelBudget } from "../guardrails.js";

/* ------------------------------------------------------------------ *
 * The one place the model is called. Everything else in this repo is
 * deterministic — that is deliberate, and it is why the release gate
 * can run in CI without a key.
 *
 * Three rules:
 *   - a shared hourly call budget, so a looping agent cannot spend the
 *     account dry across two instances
 *   - a hard timeout: no agent may hold a checkout open
 *   - no retries on the checkout path; a slow model is a refusal
 * ------------------------------------------------------------------ */

const API = "https://api.anthropic.com/v1/messages";
// Checked against the model list in August 2026. The moderator sits in
// the checkout path, so it gets the fast model; the writing agents run
// on a clock and can afford the better one.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-4-5-20251001";

export class ModelUnavailable extends Error {}

export function modelConfigured() {
  return Boolean(config.anthropicKey);
}

/** @returns {Promise<string>} the model's text, or throws ModelUnavailable. */
export async function ask({ system, prompt, maxTokens = 300, ms = config.modelTimeoutMs, model = MODEL }) {
  if (!config.anthropicKey) throw new ModelUnavailable("ANTHROPIC_API_KEY not set");
  if (!(await withinModelBudget())) throw new ModelUnavailable("hourly model call budget reached");

  return withTimeout(async (signal) => {
    const res = await fetch(API, {
      method: "POST", signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": config.anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ModelUnavailable(`anthropic ${res.status}: ${body.slice(0, 200)}`);
    }
    const j = await res.json();
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    if (!text) throw new ModelUnavailable("empty response");
    return text;
  }, ms, "model call");
}

/** Ask for JSON and refuse anything that is not the shape we asked for. */
export async function askJson(opts) {
  const text = await ask(opts);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new ModelUnavailable("no JSON in response");
  try { return JSON.parse(match[0]); }
  catch { throw new ModelUnavailable("malformed JSON in response"); }
}

/** Dev convenience only — never true in production. */
export const moderationMayBeSkipped = () => !isProd && !config.anthropicKey;
