import { audit } from "./guardrails.js";
import { salesGaps } from "./config.js";
import { sendReceipt } from "./notify.js";

/* ------------------------------------------------------------------ *
 * WHAT HAPPENS THE MOMENT A SEAT IS PAID FOR.
 *
 * This lives in its own file for one reason: it is the part of the
 * payment path that has to be provable. Inside `handleOrderStatus` it
 * sat behind `pay.verifyPayment()`, which reads the chain — so the only
 * tests that could reach it were tests of the arithmetic beside it, not
 * of the path itself. A reviewer said so, and was right: the trace was
 * asserted by reading the source, which is not a test.
 *
 * Extracted here, the same code the server runs can be run by a test
 * against the real storage and the real audit log. Nothing is stubbed
 * and nothing is re-implemented for the test's benefit — server.js
 * calls this function and nothing else.
 * ------------------------------------------------------------------ */

/**
 * Record a seat that has just been paid for, and send the receipt.
 *
 * Order matters. The award is written first, because it is the fact.
 * The gap line is written second, because it is a note about the
 * conditions the fact happened under. The receipt goes last, because a
 * mail provider having an afternoon must not sit between a confirmed
 * payment and its record.
 *
 * Never throws: the seat is already awarded and paid for on chain by
 * the time this runs, and nothing here may undo either.
 *
 * @returns {{gaps: string[], receipt: object}}
 */
export async function recordSeatAward(order = {}, check = {}) {
  const base = {
    id: order.id ?? null,
    seatNo: order.seatNo ?? null,
    ticker: order.ticker ?? null,
  };

  await audit("gate", "seat_awarded", {
    ...base, signature: check.signature ?? null, method: check.method ?? null,
  });

  /* The gaps as they stood AT THIS MOMENT — not a reference to config,
   * a copy of the list. "Were the notices complete when this seat was
   * sold?" is asked afterwards, and an answer rebuilt from the config
   * of the day it is asked would be a guess about the past. */
  const gaps = salesGaps();
  if (gaps.length) {
    await audit("gate", "sold_with_gaps", { ...base, gaps });
  }

  let receipt = { sent: false, reason: "not attempted" };
  try {
    receipt = await sendReceipt({ ...order, signature: check.signature });
  } catch (err) {
    /* sendReceipt is written not to throw. If it ever does, the sale
     * still stands and the failure is recorded rather than raised. */
    await audit("payments", "receipt_threw", { ...base, err: String(err?.message || err) });
  }

  return { gaps, receipt };
}
