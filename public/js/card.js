/* ==================================================================
   The card a buyer posts.

   Drawn here, from the seat as the server describes it — never from
   anything the buyer uploads. A picture they supply would ride behind
   a validated ticker without passing any of the checks that made the
   ticker worth something, and every guardrail on this site reads text.

   The wall is quiet on purpose. This is not the wall — it is what
   leaves it, into a feed that is already shouting. So the ticker is
   enormous, the accent is vermilion, and the badge is a filled stamp
   that survives being shrunk to a thumbnail.
   ================================================================== */

const W = 1200;
const H = 630;
const PAD = 76;

const INK = {
  ground: "#0C0A07",
  text: "#F3EEE3",
  muted: "#9C9384",
  faint: "#6B6559",
  line: "#2E2921",
  brass: "#C99B3C",
  accent: "#FF4D1C",
  ok: "#5FA97E",
  warn: "#D9673A",
};

const seatLabel = (n) => "№" + String(n).padStart(2, "0");
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");

const mono = (size, weight = 600) => `${weight} ${size}px "IBM Plex Mono", ui-monospace, monospace`;
const sans = (size, weight = 400) => `${weight} ${size}px "IBM Plex Sans", system-ui, sans-serif`;
const display = (size) => `800 ${size}px "Bodoni Moda", Georgia, serif`;

/** Shrink until it fits. The ticker decides its own size. */
function fitMono(g, text, max, start, floor = 44) {
  let size = start;
  for (;;) {
    g.font = mono(size);
    if (g.measureText(text).width <= max || size <= floor) return size;
    size -= 4;
  }
}

function ellipsis(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}

/** The mark: № inside a brass rule box. */
function drawGlyph(g, x, y, size) {
  const s = size;
  g.strokeStyle = INK.brass;
  g.lineWidth = Math.max(2, s * 0.06);
  g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
  g.fillStyle = INK.text;
  g.font = display(s * 0.66);
  g.textAlign = "center";
  g.fillText("№", x + s / 2, y + s * 0.74);
  g.textAlign = "left";
}

/** @returns {Promise<HTMLCanvasElement>} */
export async function drawCard(seat, origin) {
  try { await document.fonts.ready; } catch { /* system faces will do */ }

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.textBaseline = "alphabetic";

  g.fillStyle = INK.ground;
  g.fillRect(0, 0, W, H);

  // The rail. Sixteen pixels of vermilion is what reads at thumbnail size.
  g.fillStyle = INK.accent;
  g.fillRect(0, 0, 16, H);

  /* ---- header ---------------------------------------------------- */
  drawGlyph(g, PAD, 48, 44);
  g.fillStyle = INK.text;
  g.font = display(34);
  g.fillText("THE WALL", PAD + 60, 82);

  // Seat number, as a filled tag on the right.
  const tag = seatLabel(seat.no);
  g.font = mono(22, 500);
  const tagW = g.measureText(tag).width + 34;
  g.fillStyle = INK.accent;
  g.fillRect(W - PAD - tagW, 48, tagW, 44);
  g.fillStyle = INK.ground;
  g.textAlign = "center";
  g.fillText(tag, W - PAD - tagW / 2, 78);
  g.textAlign = "left";

  /* ---- the ticker, as big as the canvas allows -------------------- */
  const ticker = String(seat.ticker || "").slice(0, 12).toUpperCase();
  const full = "$" + ticker;
  const size = fitMono(g, full, W - PAD * 2, 176);
  g.font = mono(size);
  g.fillStyle = INK.accent;
  g.fillText("$", PAD, 296);
  const dollarW = g.measureText("$").width;
  g.fillStyle = INK.text;
  g.fillText(ticker, PAD + dollarW, 296);

  /* ---- badge and money, one band --------------------------------- */
  const badge = String(seat.badge || "").toUpperCase();
  if (badge) {
    const colour = badge === "SCREENED" ? INK.ok : INK.warn;
    g.font = mono(21, 600);
    const label = " " + badge + " ";
    const bw = g.measureText(label).width + 26;
    g.fillStyle = colour;
    g.fillRect(PAD, 336, bw, 42);
    g.fillStyle = INK.ground;
    g.fillText(label, PAD + 13, 365);
  }

  g.textAlign = "right";
  g.fillStyle = INK.text;
  g.font = mono(52);
  g.fillText(money(seat.priceUsd), W - PAD, 372);
  g.textAlign = "left";

  /* ---- what was checked ------------------------------------------ */
  const reasons = (seat.reasons || []).slice(0, 2);
  g.font = sans(20);
  g.fillStyle = INK.muted;
  reasons.forEach((r, i) => {
    g.fillText(ellipsis(g, String(r), W - PAD * 2), PAD, 432 + i * 32);
  });

  /* ---- footer ----------------------------------------------------- */
  g.strokeStyle = INK.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(PAD, H - 104);
  g.lineTo(W - PAD, H - 104);
  g.stroke();

  g.fillStyle = INK.text;
  g.font = mono(20, 500);
  g.fillText(String(origin || "").replace(/^https?:\/\//, "").replace(/\/$/, ""), PAD, H - 62);

  g.textAlign = "right";
  g.font = mono(19, 500);
  g.fillStyle = INK.accent;
  const take = "take it — " + money(seat.takeoverUsd);
  g.fillText(take, W - PAD, H - 62);
  g.textAlign = "left";

  return c;
}

export async function downloadCard(seat, origin) {
  const c = await drawCard(seat, origin);
  const url = c.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `the-wall-${String(seat.no).padStart(2, "0")}-${seat.ticker}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ==================================================================
   The card a REFUSAL posts.

   Same house, different errand. The sale card sells a seat: it carries
   a price and an invitation to take it. This one carries neither,
   because there is nothing on offer — it is a receipt.

   Two things it must never do. It must not look like a warning label
   somebody paid us to print, so there is no skull, no red cross, no
   siren: the same quiet vermilion rail as everything else, and the
   measurement doing the work. And it must not blur the two ways a
   contract reaches this card — a buyer turned away, or a contract
   nobody submitted — because those are different claims and only one
   of them involves money.
   ================================================================== */

const REFUSAL_SOURCE = {
  probe: "nobody asked — we checked anyway",
  gate: "submitted, and turned away",
};

/** @returns {Promise<HTMLCanvasElement>} */
export async function drawRefusalCard(row, origin) {
  try { await document.fonts.ready; } catch { /* system faces will do */ }

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.textBaseline = "alphabetic";

  g.fillStyle = INK.ground;
  g.fillRect(0, 0, W, H);
  g.fillStyle = INK.accent;
  g.fillRect(0, 0, 16, H);

  /* ---- header ---------------------------------------------------- */
  drawGlyph(g, PAD, 48, 44);
  g.fillStyle = INK.text;
  g.font = display(34);
  g.fillText("THE WALL", PAD + 60, 82);

  const tag = "NOT SELLABLE";
  g.font = mono(22, 500);
  const tagW = g.measureText(tag).width + 34;
  g.fillStyle = INK.accent;
  g.fillRect(W - PAD - tagW, 48, tagW, 44);
  g.fillStyle = INK.ground;
  g.textAlign = "center";
  g.fillText(tag, W - PAD - tagW / 2, 78);
  g.textAlign = "left";

  /* ---- the ticker ------------------------------------------------- */
  const ticker = String(row.ticker || "").replace(/^\$/, "").slice(0, 12).toUpperCase();
  const size = fitMono(g, "$" + ticker, W - PAD * 2, 176);
  g.font = mono(size);
  g.fillStyle = INK.accent;
  g.fillText("$", PAD, 278);
  const dollarW = g.measureText("$").width;
  g.fillStyle = INK.text;
  g.fillText(ticker, PAD + dollarW, 286);

  /* ---- the number that makes the finding land --------------------
   * Only when it was measured. A card printing "$0 traded" for a
   * contract whose market we failed to read would be the same lie as a
   * panel printing $0 for a pool it never opened. */
  const vol = Number(row.vol24Usd);
  let y = 396;
  if (Number.isFinite(vol) && vol > 0) {
    // Clear of the dollar sign's descender at full ticker size. The two
    // touching read as one broken word at thumbnail scale.
    g.font = mono(40);
    g.fillStyle = INK.brass;
    g.fillText(compact(vol) + " traded in 24h", PAD, 374);
    y = 446;
  }

  /* ---- what was measured ------------------------------------------ */
  g.font = sans(21);
  g.fillStyle = INK.muted;
  (row.reasons || []).slice(0, 2).forEach((r, i) => {
    g.fillText(ellipsis(g, String(r), W - PAD * 2), PAD, y + i * 34);
  });

  /* ---- footer ------------------------------------------------------ */
  g.strokeStyle = INK.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(PAD, H - 104);
  g.lineTo(W - PAD, H - 104);
  g.stroke();

  g.fillStyle = INK.text;
  g.font = mono(20, 500);
  const host = String(origin || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  g.fillText(host + "/refused", PAD, H - 62);

  g.textAlign = "right";
  g.font = mono(19, 500);
  g.fillStyle = INK.faint;
  g.fillText(REFUSAL_SOURCE[row.source] || REFUSAL_SOURCE.gate, W - PAD, H - 62);
  g.textAlign = "left";

  return c;
}

/** Compact, and never inventing a digit it did not measure. */
function compact(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "k";
  return "$" + Math.round(v);
}

export async function downloadRefusalCard(row, origin) {
  const c = await drawRefusalCard(row, origin);
  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `the-wall-refused-${String(row.ticker || "token").replace(/^\$/, "").toLowerCase()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
