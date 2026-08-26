/* ------------------------------------------------------------------ *
 * DEADLINE — the gate runs inside a checkout. It gets a budget, and
 * every call it makes shares that budget. Chaining three 2.5s timeouts
 * inside a "2 second" gate is how a checkout quietly becomes a 8s wait.
 * ------------------------------------------------------------------ */

export function deadline(budgetMs) {
  const end = Date.now() + budgetMs;
  return {
    end,
    remaining() { return Math.max(0, end - Date.now()); },
    expired() { return Date.now() >= end; },
    /** ms for the next call: never more than what is left, never more than cap. */
    slice(capMs) { return Math.max(0, Math.min(capMs, this.remaining())); },
  };
}

/** Runs fn(signal) with a hard timeout. Rejects with a named error. */
export async function withTimeout(fn, ms, label = "operation") {
  if (ms <= 0) throw new Error(`${label}: no time left in the gate budget`);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error(`${label}: timed out after ${ms}ms`)), ms);
  try {
    return await fn(ctl.signal);
  } catch (err) {
    if (ctl.signal.aborted) throw new Error(`${label}: timed out after ${ms}ms`);
    throw err;
  } finally {
    clearTimeout(t);
  }
}
