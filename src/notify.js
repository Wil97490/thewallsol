import { audit } from "./guardrails.js";
import { getState, setState } from "./storage.js";
import { config, mailConfigured } from "./config.js";

/* ------------------------------------------------------------------ *
 * OUTBOUND — the two things the site says out loud.
 *
 * Both are deliberately thin. Posts are kept in storage and served by
 * the site itself, so there is no third party in the path of the tape.
 *
 * Email needs a provider. The rule that governs this file: it never
 * pretends. If the key is missing it says the key is missing; if the
 * provider answers 422 it records 422; if the network hangs it gives
 * up on a timer rather than holding a request open. Every outcome is
 * written to the audit log with the address it concerned, because the
 * one question worth being able to answer later is "did the buyer
 * actually get their receipt", and a boolean returned to a caller that
 * ignores it answers nothing.
 * ------------------------------------------------------------------ */

const POSTS_KEY = "tape_posts";
const MAX_POSTS = 200;

export async function publishPost(text) {
  const posts = (await getState(POSTS_KEY)) || [];
  posts.unshift({ at: new Date().toISOString(), text });
  await setState(POSTS_KEY, posts.slice(0, MAX_POSTS));
  await audit("tape", "post_stored", { text });
  return text;
}

export async function recentPosts(limit = 20) {
  const posts = (await getState(POSTS_KEY)) || [];
  return posts.slice(0, limit);
}

/* A deliberately dull address test. It rejects what would make the
 * provider return an error, and nothing more: the rules for what is a
 * deliverable mailbox are not knowable from the string, and a stricter
 * pattern here would silently drop real addresses. */
const looksLikeEmail = (s) =>
  typeof s === "string" && s.length <= 254 && /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(s.trim());

/**
 * Send one message. Never throws — the callers are payment paths and
 * cron jobs, and neither should fall over because a mail provider is
 * having an afternoon.
 *
 * Returns { sent, id?, reason? }. A false `sent` is a fact about this
 * attempt, not about the address.
 */
export async function sendEmail(to, subject, body, { tag = "reporter" } = {}) {
  const address = String(to || "").trim();

  if (!looksLikeEmail(address)) {
    await audit(tag, "email_invalid_recipient", { to: address, subject });
    return { sent: false, reason: "recipient is not an address" };
  }
  if (!mailConfigured()) {
    // Recorded, not swallowed: this is the line that tells you why a
    // buyer never heard from you, three weeks after the fact.
    await audit(tag, "email_not_configured", {
      to: address, subject,
      missing: [!config.mail.key && "RESEND_API_KEY", !config.mail.from && "MAIL_FROM"].filter(Boolean),
    });
    return { sent: false, reason: "mail is not configured" };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), config.mail.timeoutMs);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${config.mail.key}` },
      body: JSON.stringify({
        from: config.mail.from,
        to: [address],
        reply_to: config.mail.replyTo || undefined,
        subject,
        text: body,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The provider's own message is the useful half. Keeping it is
      // the difference between "email_failed" and knowing the sending
      // domain was never verified.
      const detail = payload?.message || payload?.error || `HTTP ${res.status}`;
      await audit(tag, "email_rejected", { to: address, subject, status: res.status, detail: String(detail) });
      return { sent: false, reason: String(detail), status: res.status };
    }

    await audit(tag, "email_sent", { to: address, subject, id: payload?.id || null });
    return { sent: true, id: payload?.id || null };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    const reason = aborted ? `timed out after ${config.mail.timeoutMs}ms` : String(err?.message || err);
    await audit(tag, "email_failed", { to: address, subject, err: reason });
    return { sent: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * THE RECEIPT.
 *
 * The one message this site owes anybody. It goes out the moment a
 * payment is confirmed on chain, and it exists so the buyer holds a
 * record that does not depend on this site staying up: the signature
 * in it can be looked up on any explorer forever.
 *
 * It is written here rather than by the reporter agent on purpose. A
 * receipt is not a report — nothing about it should be phrased by a
 * model, nothing about it may vary run to run, and it must go out even
 * when every agent on the account is switched off.
 * ------------------------------------------------------------------ */

const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const seatNo = (n) => "No " + String(n).padStart(2, "0");

export function receiptText(order = {}) {
  const base = (config.publicBaseUrl || "").replace(/\/+$/, "");
  const sol = order.amountSol != null ? `${Number(order.amountSol).toFixed(4)} SOL` : null;
  const lines = [
    `${seatNo(order.seatNo)} on The Wall — $${String(order.ticker || "").replace(/^\$/, "").toUpperCase()}`,
    ``,
    `Paid: ${usd(order.priceUsd)}${sol ? ` (${sol})` : ""}`,
  ];
  if (order.signature) {
    lines.push(
      `Transaction: ${order.signature}`,
      `Verify it yourself: https://solscan.io/tx/${order.signature}`,
    );
  }
  lines.push(
    ``,
    `Your seat is live now and stays yours until someone pays more for it.`,
    `The current takeover price is published under the seat at all times.`,
    ``,
    `The checks we ran before selling you this seat, and the exact call`,
    `behind each one, are at ${base}/checks — including what each check`,
    `does not establish.`,
    ``,
    `This receipt is the record. We do not hold an account for you and`,
    `there is no password to lose. To have your email address or your`,
    `submitted text removed, write to ${config.publisher.contact}.`,
    ``,
    `The Wall — ${base || "thewallsol.com"}`,
  );
  return lines.join("\n");
}

/**
 * Fire-and-record. Returns the send result; the caller logs it and
 * carries on, because a seat that is paid for is awarded whether or
 * not a mail provider cooperated.
 */
export async function sendReceipt(order = {}) {
  if (!order?.contact) {
    await audit("payments", "receipt_no_contact", { id: order.id || null, seatNo: order.seatNo ?? null });
    return { sent: false, reason: "no contact on file" };
  }
  const subject = `${seatNo(order.seatNo)} — $${String(order.ticker || "").replace(/^\$/, "").toUpperCase()} — receipt`;
  const out = await sendEmail(order.contact, subject, receiptText(order), { tag: "payments" });
  await audit("payments", out.sent ? "receipt_sent" : "receipt_failed", {
    id: order.id || null, seatNo: order.seatNo ?? null, reason: out.reason || null,
  });
  return out;
}

/** What the preflight and the ops page ask. No secrets in the answer. */
export function mailStatus() {
  return {
    configured: mailConfigured(),
    from: config.mail.from || null,
    replyTo: config.mail.replyTo || null,
    provider: "resend",
    missing: [
      !config.mail.key && "RESEND_API_KEY",
      !config.mail.from && "MAIL_FROM",
    ].filter(Boolean),
  };
}

export const store = { publishPost, sendEmail, sendReceipt };
