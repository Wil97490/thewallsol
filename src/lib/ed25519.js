/* ------------------------------------------------------------------ *
 * Is this address a person, or a program?
 *
 * On Solana the difference is arithmetic, not conventional. A wallet's
 * public key is a real point on the ed25519 curve — someone holds the
 * matching private key. A program-derived address is deliberately
 * chosen to be OFF the curve, precisely so that nobody can ever hold a
 * key for it: it is signed for by a program.
 *
 * That distinction is the only reliable way to tell a liquidity pool's
 * vault from a whale. Asking the chain whether the account "looks like"
 * a wallet does not work — a pool authority often has no account of its
 * own at all, and every heuristic built on that mistakes half the
 * healthy tokens on Solana for a rug.
 *
 * Point decompression, per RFC 8032 §5.1.3. No dependency.
 * ------------------------------------------------------------------ */

const P = (2n ** 255n) - 19n;

function mod(a) { const r = a % P; return r < 0n ? r + P : r; }

function powMod(base, exp) {
  let result = 1n, b = mod(base), e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

const D = mod(-121665n * powMod(121666n, P - 2n));

/**
 * @param {Uint8Array} key 32 bytes, a compressed ed25519 point
 * @returns {boolean} true for a wallet, false for a program-derived address
 */
export function isOnCurve(key) {
  if (!key || key.length !== 32) return false;

  // Little-endian, with the sign bit of x stripped from the top.
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(i === 31 ? key[i] & 0x7f : key[i]);
  if (y >= P) return false;

  // Solve x² = (y² − 1) / (d·y² + 1). A solution exists only for points
  // that are actually on the curve.
  const y2 = (y * y) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);

  const v3 = (((v * v) % P) * v) % P;
  const v7 = (((v3 * v3) % P) * v) % P;
  const x = (((u * v3) % P) * powMod((u * v7) % P, (P - 5n) / 8n)) % P;

  const vxx = (((v * x) % P) * x) % P;
  return vxx === u || vxx === mod(-u);
}
