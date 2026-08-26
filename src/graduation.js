import { recentQueue, writeAudit, getState, setState } from "./storage.js";

/* ------------------------------------------------------------------ *
 * GRADUATION — how an agent becomes autonomous.
 *
 * A boolean flag says "I have decided to trust this". A graduation gate
 * says "this has earned it, and here is the evidence". The difference
 * matters the day something goes wrong and you have to explain why the
 * thing was posting unsupervised.
 *
 * An agent goes autonomous when ALL hold:
 *   - at least minReviewed of its outputs were reviewed by a human
 *   - approval rate at or above minApproval
 *   - zero output_guard hits in the last guardWindow rows
 *   - no demotion in effect
 *
 * Autonomy is lost faster than it is earned, on purpose. A demotion is
 * written to shared storage, not to process.env — an instance-local
 * demotion is not a demotion at all once Cloud Run scales to two.
 * ------------------------------------------------------------------ */

export const THRESHOLDS = {
  tape:     { minReviewed: 200, minApproval: 0.9,  guardWindow: 100 },
  reporter: { minReviewed: 100, minApproval: 0.95, guardWindow: 50  },
};

const cache = new Map();
const TTL = 60_000;
const demoteKey = (agent) => `demoted:${agent}`;

const forcedSupervised = (agent) =>
  process.env[`AGENT_${agent.toUpperCase()}_SUPERVISED`] === "true";

export async function isDemoted(agent) {
  return Boolean(await getState(demoteKey(agent)));
}

export async function isAutonomous(agent) {
  if (forcedSupervised(agent)) return false;

  const t = THRESHOLDS[agent];
  if (!t) return false;                       // unknown agent never runs unsupervised

  const hit = cache.get(agent);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  let value = false;
  let evidence = {};
  try {
    if (await isDemoted(agent)) {
      evidence = { demoted: true };
    } else {
      const rows = await recentQueue(agent, 600);   // newest first — see storage.js
      const reviewed = rows.filter((r) => r.status === "approved" || r.status === "rejected");
      const approved = reviewed.filter((r) => r.status === "approved");
      const window = rows.slice(0, t.guardWindow);  // the RECENT window, not the oldest
      const guardHits = window.filter((r) => r.reason === "output_guard").length;
      const rate = reviewed.length ? approved.length / reviewed.length : 0;

      evidence = { reviewed: reviewed.length, approvalRate: Number(rate.toFixed(3)), guardHits };
      value = reviewed.length >= t.minReviewed && rate >= t.minApproval && guardHits === 0;
    }
  } catch (err) {
    evidence = { error: String(err) };            // can't read the record → not graduated
    value = false;
  }

  cache.set(agent, { at: Date.now(), value });
  await writeAudit({ agent, action: "graduation_check", autonomous: value, ...evidence });
  return value;
}

/** Called by the output guard. Drops the agent back to supervised at once. */
export async function demote(agent, reason) {
  cache.set(agent, { at: Date.now(), value: false });
  await setState(demoteKey(agent), { at: new Date().toISOString(), reason });
  await writeAudit({ agent, action: "demoted", reason });
}

/** Deliberate act by a human in the back office, never by an agent. */
export async function reinstate(agent, reviewer) {
  cache.delete(agent);
  await setState(demoteKey(agent), null);
  await writeAudit({ agent, action: "reinstated", reviewer });
}

/** For the ops dashboard: how far along an agent is. */
export async function progress(agent) {
  const t = THRESHOLDS[agent];
  if (!t) return null;
  const rows = await recentQueue(agent, 600);
  const reviewed = rows.filter((r) => r.status === "approved" || r.status === "rejected");
  const approved = reviewed.filter((r) => r.status === "approved");
  const guardHits = rows.slice(0, t.guardWindow).filter((r) => r.reason === "output_guard").length;
  return {
    agent,
    reviewed: reviewed.length,
    needed: t.minReviewed,
    approvalRate: reviewed.length ? Number((approved.length / reviewed.length).toFixed(3)) : null,
    needsApproval: t.minApproval,
    guardHits,
    guardWindow: t.guardWindow,
    pending: rows.filter((r) => r.status === "pending").length,
    demoted: await isDemoted(agent),
    autonomous: await isAutonomous(agent),
  };
}
