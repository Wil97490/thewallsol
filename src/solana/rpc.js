import { config } from "../config.js";
import { withTimeout } from "../lib/deadline.js";

/* ------------------------------------------------------------------ *
 * JSON-RPC client. One retry on a transient failure, never on a
 * business error, and never longer than the slice of budget it is given.
 * ------------------------------------------------------------------ */

export class RpcError extends Error {}

export async function rpc(method, params, { ms = config.rpcTimeoutMs, retries = 1 } = {}) {
  if (!config.rpcUrl) throw new RpcError("SOLANA_RPC_URL not set");
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(async (signal) => {
        const res = await fetch(config.rpcUrl, {
          method: "POST", signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        if (res.status === 429 || res.status >= 500) throw new RpcError(`rpc ${method}: HTTP ${res.status}`);
        if (!res.ok) throw new RpcError(`rpc ${method}: HTTP ${res.status}`);
        const j = await res.json();
        if (j.error) throw new RpcError(`rpc ${method}: ${j.error.message}`);
        return j.result;
      }, ms, `rpc ${method}`);
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new RpcError(String(lastErr));
}

/** Plain GET against a host we control the identity of (not buyer input). */
export async function getJson(url, ms) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    return res.json();
  }, ms, `GET ${new URL(url).host}`);
}
