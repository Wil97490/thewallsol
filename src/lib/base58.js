/* Minimal base58 (Bitcoin alphabet) — Solana addresses, no dependency. */
const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MAP = new Map([...A].map((c, i) => [c, i]));

export function encodeBase58(bytes) {
  const b = [...bytes];
  let zeros = 0;
  while (zeros < b.length && b[zeros] === 0) zeros++;
  const out = [];
  let start = zeros;
  while (start < b.length) {
    let carry = 0, allZero = true;
    for (let i = start; i < b.length; i++) {
      const v = (carry << 8) + b[i];
      b[i] = Math.floor(v / 58);
      if (b[i] !== 0) allZero = false; else if (allZero && i === start) start++;
      carry = v % 58;
    }
    out.push(carry);
  }
  return "1".repeat(zeros) + out.reverse().map((i) => A[i]).join("");
}

export function decodeBase58(str) {
  if (typeof str !== "string" || str.length === 0) throw new Error("base58: empty");
  const bytes = [0];
  for (const ch of str) {
    const v = MAP.get(ch);
    if (v === undefined) throw new Error(`base58: bad character "${ch}"`);
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i] * 58 + carry;
      bytes[i] = x & 0xff;
      carry = x >> 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of str) { if (ch === "1") bytes.push(0); else break; }
  return Uint8Array.from(bytes.reverse());
}

/** A Solana address is 32 bytes, base58. Anything else is not one. */
export function isSolanaAddress(s) {
  if (typeof s !== "string" || s.length < 32 || s.length > 44) return false;
  try { return decodeBase58(s).length === 32; } catch { return false; }
}
