import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { slugify } from "./pages.js";

/* ------------------------------------------------------------------ *
 * STORAGE — three backends behind one interface.
 *
 *   memory    tests only
 *   file      local dev only. On Cloud Run this disk vanishes at every
 *             scale-to-zero, and an audit log that evaporates is worse
 *             than none: it makes you believe you have a record.
 *   firestore production
 *
 * Everything the system must not lose lives here: the audit trail, the
 * review queue, the seats, the orders, and the agent state that used to
 * sit in process.env (and therefore only ever applied to one instance).
 * ------------------------------------------------------------------ */

const BACKEND = config.storageBackend;
const mem = { audit: [], queue: [], seats: new Map(), orders: new Map(), state: new Map(), unclaimed: new Map(), refusals: [] };

let firestore = null;
async function db() {
  if (firestore) return firestore;
  const { Firestore } = await import("@google-cloud/firestore"); // lazy: repo stays dependency-free
  /* ignoreUndefinedProperties, because the alternative is what actually
   * happened: ONE field that nobody had set (`audience`, missing from a
   * projection) made Firestore reject the ENTIRE document, the write was
   * wrapped in a silent catch, and the prospect list read as empty for
   * days while the round cheerfully reported finding six leads a night.
   *
   * A missing field should cost you that field, not the record. */
  firestore = new Firestore({ ignoreUndefinedProperties: true });
  return firestore;
}

/* ---- file helpers -------------------------------------------------- */
const filePath = (name) => path.join(config.dataPath, `${name}.json`);
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath(name), "utf8")); } catch { return fallback; }
}
function writeJson(name, value) {
  fs.mkdirSync(config.dataPath, { recursive: true });
  const tmp = filePath(name) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, filePath(name));           // atomic-ish: never a half file
}
function appendLine(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + "\n");
}
function readLines(file) {
  try {
    return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

export const newId = () => crypto.randomUUID();

/* ================================================================== *
 * AUDIT — append only. Never throws: a failed audit write must not
 * take down a checkout. It must be loud, because you are now blind.
 * ================================================================== */

export async function writeAudit(row) {
  const rec = { at: new Date().toISOString(), ...row };
  try {
    if (BACKEND === "firestore") await (await db()).collection("agent_audit").add(rec);
    else if (BACKEND === "logging") console.log(JSON.stringify({ severity: "INFO", kind: "agent_audit", ...rec }));
    else if (BACKEND === "memory") mem.audit.push(rec);
    else appendLine(config.auditPath, rec);
  } catch (err) {
    console.error(JSON.stringify({ severity: "ERROR", kind: "audit_write_failed", err: String(err), row: rec }));
  }
  return rec;
}

export async function recentAudit(limit = 200) {
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("agent_audit").orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => d.data());
  }
  const rows = BACKEND === "memory" ? mem.audit : readLines(config.auditPath);
  return rows.slice(-limit).reverse();
}

/* ================================================================== *
 * REVIEW QUEUE — what a human still has to look at, and the record
 * that lets an agent graduate. Rows carry a status a reviewer changes.
 * ================================================================== */

export async function writeQueue(row) {
  const rec = { id: newId(), at: new Date().toISOString(), status: "pending", ...row };
  try {
    if (BACKEND === "firestore") await (await db()).collection("review_queue").doc(rec.id).set(rec);
    else if (BACKEND === "memory") mem.queue.push(rec);
    else appendLine(config.queuePath, rec);
  } catch (err) {
    console.error(JSON.stringify({ severity: "ERROR", kind: "queue_write_failed", err: String(err), row: rec }));
  }
  return rec;
}

async function allQueue() {
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("review_queue").orderBy("at", "desc").limit(1000).get();
    return snap.docs.map((d) => d.data());          // newest first
  }
  const rows = BACKEND === "memory" ? mem.queue : readLines(config.queuePath);
  return [...rows].reverse();                        // newest first, same as Firestore
}

/**
 * Newest-first, capped. The ordering is part of the contract: the
 * graduation gate reads a *recent* window, and a backend that returned
 * oldest-first would silently make it read ancient history.
 */
export async function recentQueue(agent, limit = 500) {
  const rows = await allQueue();
  return rows.filter((r) => !agent || r.agent === agent).slice(0, limit);
}

export async function listQueue({ status, limit = 100 } = {}) {
  const rows = await allQueue();
  return rows.filter((r) => !status || r.status === status).slice(0, limit);
}

export async function updateQueueStatus(id, status, reviewer) {
  const patch = { status, reviewedAt: new Date().toISOString(), reviewer: reviewer || "admin" };
  if (BACKEND === "firestore") {
    await (await db()).collection("review_queue").doc(id).set(patch, { merge: true });
    const doc = await (await db()).collection("review_queue").doc(id).get();
    return doc.data();
  }
  if (BACKEND === "memory") {
    const row = mem.queue.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
    return row || null;
  }
  const rows = readLines(config.queuePath);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  fs.writeFileSync(config.queuePath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return row;
}

/* ================================================================== *
 * SEATS — the wall itself.
 * ================================================================== */

export async function listSeats() {
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("seats").get();
    return snap.docs.map((d) => d.data()).sort((a, b) => a.no - b.no);
  }
  if (BACKEND === "memory") return [...mem.seats.values()].sort((a, b) => a.no - b.no);
  return readJson("seats", []).sort((a, b) => a.no - b.no);
}

export async function getSeat(no) {
  const n = Number(no);
  if (BACKEND === "firestore") {
    const doc = await (await db()).collection("seats").doc(String(n)).get();
    return doc.exists ? doc.data() : null;
  }
  if (BACKEND === "memory") return mem.seats.get(n) || null;
  return readJson("seats", []).find((s) => s.no === n) || null;
}

export async function saveSeat(seat) {
  if (BACKEND === "firestore") {
    await (await db()).collection("seats").doc(String(seat.no)).set(seat);
    return seat;
  }
  if (BACKEND === "memory") { mem.seats.set(seat.no, seat); return seat; }
  const rows = readJson("seats", []).filter((s) => s.no !== seat.no);
  rows.push(seat);
  writeJson("seats", rows);
  return seat;
}

/* ================================================================== *
 * ORDERS — one per attempt to take a seat, screened before payment.
 * ================================================================== */

export async function createOrder(order) {
  const rec = { id: newId(), createdAt: new Date().toISOString(), ...order };
  if (BACKEND === "firestore") await (await db()).collection("orders").doc(rec.id).set(rec);
  else if (BACKEND === "memory") mem.orders.set(rec.id, rec);
  else { const rows = readJson("orders", []); rows.push(rec); writeJson("orders", rows); }
  return rec;
}

export async function getOrder(id) {
  if (BACKEND === "firestore") {
    const doc = await (await db()).collection("orders").doc(String(id)).get();
    return doc.exists ? doc.data() : null;
  }
  if (BACKEND === "memory") return mem.orders.get(id) || null;
  return readJson("orders", []).find((o) => o.id === id) || null;
}

export async function updateOrder(id, patch) {
  if (BACKEND === "firestore") {
    await (await db()).collection("orders").doc(String(id)).set(patch, { merge: true });
    return getOrder(id);
  }
  if (BACKEND === "memory") {
    const o = mem.orders.get(id);
    if (o) Object.assign(o, patch);
    return o || null;
  }
  const rows = readJson("orders", []);
  const o = rows.find((r) => r.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  writeJson("orders", rows);
  return o;
}

export async function listOrders({ status, limit = 200 } = {}) {
  let rows;
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("orders").orderBy("createdAt", "desc").limit(limit).get();
    rows = snap.docs.map((d) => d.data());
  } else if (BACKEND === "memory") {
    rows = [...mem.orders.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } else {
    rows = readJson("orders", []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  return rows.filter((r) => !status || r.status === status).slice(0, limit);
}

/* ================================================================== *
 * UNCLAIMED — money that arrived and belongs to nobody.
 *
 * A buyer who sends the wrong amount, or sends after the hold ran out,
 * has paid and received nothing. Without this ledger the transfer is
 * simply absorbed into the treasury and forgotten, which from where
 * they stand is indistinguishable from being robbed.
 *
 * Keyed by signature: a transaction can only ever be recorded once.
 * ================================================================== */

export async function recordUnclaimed(row) {
  const rec = { status: "unclaimed", recordedAt: new Date().toISOString(), ...row };
  if (BACKEND === "firestore") {
    const ref = (await db()).collection("unclaimed").doc(rec.signature);
    if ((await ref.get()).exists) return null;
    await ref.set(rec);
    return rec;
  }
  if (BACKEND === "memory") {
    if (mem.unclaimed.has(rec.signature)) return null;
    mem.unclaimed.set(rec.signature, rec);
    return rec;
  }
  const rows = readJson("unclaimed", []);
  if (rows.some((r) => r.signature === rec.signature)) return null;
  rows.push(rec);
  writeJson("unclaimed", rows);
  return rec;
}

export async function listUnclaimed({ status, limit = 200 } = {}) {
  let rows;
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("unclaimed").limit(limit).get();
    rows = snap.docs.map((d) => d.data());
  } else if (BACKEND === "memory") {
    rows = [...mem.unclaimed.values()];
  } else {
    rows = readJson("unclaimed", []);
  }
  return rows
    .filter((r) => !status || r.status === status)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
    .slice(0, limit);
}

export async function settleUnclaimed(signature, status, note) {
  const patch = { status, settledAt: new Date().toISOString(), note: note || null };
  if (BACKEND === "firestore") {
    await (await db()).collection("unclaimed").doc(signature).set(patch, { merge: true });
    const doc = await (await db()).collection("unclaimed").doc(signature).get();
    return doc.exists ? doc.data() : null;
  }
  if (BACKEND === "memory") {
    const row = mem.unclaimed.get(signature);
    if (row) Object.assign(row, patch);
    return row || null;
  }
  const rows = readJson("unclaimed", []);
  const row = rows.find((r) => r.signature === signature);
  if (!row) return null;
  Object.assign(row, patch);
  writeJson("unclaimed", rows);
  return row;
}

/* ================================================================== *
 * REFUSALS — the public ledger of what the gate turned away.
 *
 * Only screener refusals land here: those are measurements of a
 * contract, and a measurement can be published without accusing
 * anyone. Moderation refusals are about what someone wrote, and
 * republishing them would amplify the thing we just declined — those
 * stay in the audit log, where a human can read them and nobody else.
 * ================================================================== */

export async function recordRefusal(row) {
  const rec = {
    id: newId(),
    at: new Date().toISOString(),
    ticker: String(row.ticker || "").slice(0, 16),
    mint: String(row.mint || ""),
    reasons: (row.reasons || []).slice(0, 4).map((r) => String(r).slice(0, 200)),
    ruleIds: (row.ruleIds || []).slice(0, 8),
    // Measured at the moment of the refusal, alongside the depth it is
    // compared against. Kept so the draft rebuilt from this row later
    // says the same thing the round said.
    vol24Usd: Number.isFinite(Number(row.vol24Usd)) ? Math.round(Number(row.vol24Usd)) : null,
    // Who put this contract in front of the gate. "gate" means someone
    // tried to buy a seat and was turned away; "probe" means we ran the
    // checks on a contract nobody submitted. The two must never be
    // published in the same words — see agents/poster.js.
    source: row.source === "probe" ? "probe" : "gate",
    posted: false,
  };
  /* The address this refusal will live at, decided once, at write time.
   * Computing it on read would let a row move house the day somebody
   * edits a ticker — and a URL a search engine has indexed must not
   * change because of a cosmetic edit somewhere else. */
  rec.slug = await freeSlug(slugify(rec.ticker, rec.id), rec.id);
  if (BACKEND === "firestore") {
    await (await db()).collection("refusals").doc(rec.id).set(rec);
    return rec;
  }
  if (BACKEND === "memory") {
    mem.refusals.push(rec);
    return rec;
  }
  appendLine(path.join(config.dataPath, "refusals.log"), rec);
  return rec;
}

/** The same slug twice would silently overwrite a published page. */
async function freeSlug(base, id) {
  const taken = new Set((await listRefusals({ limit: 500 })).map((r) => r.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  const suffixed = `${base}-${String(id).replace(/-/g, "").slice(0, 6)}`;
  return taken.has(suffixed) ? `${base}-${Date.now().toString(36)}` : suffixed;
}

/** One published check, by the address it lives at. Hidden rows come back
 *  too: the route needs to tell "withdrawn" from "never existed". */
export async function getRefusalBySlug(slug) {
  const want = String(slug || "").toLowerCase();
  if (!want) return null;
  const rows = await listRefusals({ limit: 500 });
  return rows.find((r) => r.slug === want) || null;
}

export async function listRefusals({ limit = 100, since } = {}) {
  let rows;
  if (BACKEND === "firestore") {
    const snap = await (await db()).collection("refusals").limit(Math.min(limit * 4, 500)).get();
    rows = snap.docs.map((d) => d.data());
  } else if (BACKEND === "memory") {
    rows = [...mem.refusals];
  } else {
    rows = readLines(path.join(config.dataPath, "refusals.log"));
  }
  return rows
    .filter((r) => !since || r.at >= since)
    // Rows written before slugs existed still need an address, or the
    // ledger links to pages that 404. Derived, never persisted — a
    // stored slug always wins.
    .map((r) => (r.slug ? r : { ...r, slug: slugify(r.ticker, r.id) }))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}

/** Take a row out of the public ledger without erasing it. */
export async function hideRefusal(id) {
  if (BACKEND === "firestore") {
    await (await db()).collection("refusals").doc(id).set({ hidden: true }, { merge: true });
    return true;
  }
  if (BACKEND === "memory") {
    const row = mem.refusals.find((r) => r.id === id);
    if (row) row.hidden = true;
    return Boolean(row);
  }
  const file = path.join(config.dataPath, "refusals.log");
  const rows = readLines(file);
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  row.hidden = true;
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return true;
}

/** Put a hidden row back into the public ledger. */
export async function unhideRefusal(id) {
  if (BACKEND === "firestore") {
    await (await db()).collection("refusals").doc(id).set({ hidden: false }, { merge: true });
    return true;
  }
  if (BACKEND === "memory") {
    const row = mem.refusals.find((r) => r.id === id);
    if (row) row.hidden = false;
    return Boolean(row);
  }
  const file = path.join(config.dataPath, "refusals.log");
  const rows = readLines(file);
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  row.hidden = false;
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return true;
}

/** Mark a refusal as already broadcast, so a draft is never offered twice. */
export async function markRefusalPosted(id) {
  if (BACKEND === "firestore") {
    await (await db()).collection("refusals").doc(id).set({ posted: true }, { merge: true });
    return true;
  }
  if (BACKEND === "memory") {
    const row = mem.refusals.find((r) => r.id === id);
    if (row) row.posted = true;
    return Boolean(row);
  }
  const file = path.join(config.dataPath, "refusals.log");
  const rows = readLines(file);
  const row = rows.find((r) => r.id === id);
  if (!row) return false;
  row.posted = true;
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return true;
}

/* ================================================================== *
 * STATE — small shared values that must outlive one instance:
 * agent demotions, rate-limit windows, cursors.
 * ================================================================== */

export async function getState(key) {
  if (BACKEND === "firestore") {
    const doc = await (await db()).collection("state").doc(key).get();
    return doc.exists ? doc.data().value : null;
  }
  if (BACKEND === "memory") return mem.state.has(key) ? mem.state.get(key) : null;
  const all = readJson("state", {});
  return key in all ? all[key] : null;
}

export async function setState(key, value) {
  if (BACKEND === "firestore") { await (await db()).collection("state").doc(key).set({ value }); return value; }
  if (BACKEND === "memory") { mem.state.set(key, value); return value; }
  const all = readJson("state", {});
  all[key] = value;
  writeJson("state", all);
  return value;
}

/**
 * Shared fixed-window counter. Firestore does this atomically; the dev
 * backends do not, and that is fine — they run one process.
 */
export async function bumpCounter(key, windowMs) {
  const bucket = Math.floor(Date.now() / windowMs);
  const k = `counter:${key}:${bucket}`;
  if (BACKEND === "firestore") {
    const { FieldValue } = await import("@google-cloud/firestore");
    const ref = (await db()).collection("state").doc(k);
    await ref.set({ value: FieldValue.increment(1), expiresAt: new Date(Date.now() + windowMs * 2) }, { merge: true });
    const doc = await ref.get();
    return doc.data().value;
  }
  const n = (await getState(k)) || 0;
  await setState(k, n + 1);
  return n + 1;
}

/** Tests only. */
export function _resetMemory() {
  mem.audit.length = 0; mem.queue.length = 0;
  mem.seats.clear(); mem.orders.clear(); mem.state.clear(); mem.unclaimed.clear();
  mem.refusals.length = 0;
}
