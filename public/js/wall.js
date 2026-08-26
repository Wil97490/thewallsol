import qrcode from "/vendor/qrcode.mjs";
import { downloadCard } from "/js/card.js";

/* ==================================================================
   The wall, client side. No framework, no build step — the page is
   readable in the browser's view-source, which is the least a site
   that asks you to send it money can offer.
   ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const seatLabel = (n) => "№" + String(n).padStart(2, "0");
const countdown = (iso) => {
  const left = new Date(iso).getTime() - Date.now();
  if (!(left > 0)) return null;
  const m = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let CONFIG = { seatCount: 24, floorUsd: 50, holdMinutes: 20, rules: {} };
let SEATS = [];
let selected = 1;
let poll = null;

/* ---- theme ---- */
const root = document.documentElement;
try {
  const saved = localStorage.getItem("wall-theme");
  if (saved) root.setAttribute("data-theme", saved);
} catch { /* private mode: the OS theme is fine */ }
$("#theme").addEventListener("click", () => {
  const cur = root.getAttribute("data-theme")
    || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("wall-theme", next); } catch { /* nothing to do */ }
});

/* ---- data ---- */
async function api(path, opts) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function load() {
  const [cfg, wall, tape] = await Promise.all([api("/api/config"), api("/api/wall"), api("/api/tape")]);
  if (cfg.ok) CONFIG = cfg.body;
  if (wall.ok) SEATS = wall.body.seats;
  $("#seatRange").textContent = `№ 01–${String(CONFIG.seatCount).padStart(2, "0")}`;
  renderStats();
  renderGrid();
  renderTape(tape.ok ? tape.body.posts : []);
  showSeat(selected);
}

function renderTape(posts) {
  if (!posts?.length) return;
  const html = posts.map((p) => `<div class="tape-item">${esc(p.text)}</div>`).join("");
  $("#tapeTrack").innerHTML = html + html;
  $("#tape").hidden = false;
}

function renderStats() {
  const taken = SEATS.filter((s) => s.status === "taken");
  const cheapest = SEATS.reduce((min, s) => Math.min(min, s.takeoverUsd), Infinity);
  const flagged = taken.filter((s) => s.badge === "FLAGS FOUND").length;
  const turnover = SEATS.reduce((n, s) => n + s.turnover, 0);
  $("#stats").innerHTML = [
    ["Seats taken", `${taken.length}<small>/ ${SEATS.length}</small>`],
    ["Cheapest seat", Number.isFinite(cheapest) ? money(cheapest) : "—"],
    ["Showing flags", String(flagged)],
    ["Times a seat changed hands", String(turnover)],
  ].map(([k, v]) => `<div class="stat"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
}

function badgeHtml(badge) {
  if (badge === "SCREENED") return `<span class="badge b-ok"><i></i>Screened</span>`;
  if (badge === "FLAGS FOUND") return `<span class="badge b-warn"><i></i>Flags found</span>`;
  return "";
}

/* The three most expensive seats get the room. Paying more does not
   only buy a lower number — it buys physical space on the screen, so
   the wall shows its own economics without anyone explaining them. */
function renderBanners() {
  const box = $("#banners");
  const top = SEATS.filter((s) => s.status === "taken")
    .sort((a, b) => b.priceUsd - a.priceUsd)
    .slice(0, 3);

  box.innerHTML = "";
  if (!top.length) return;

  /* The banner IS the thing a buyer pays more for. Hiding it until two
   * seats are sold means the first visitors never learn the reward
   * exists. With a single seat there is no ranking to show, so the
   * rank number goes and the seat number stays. */
  const ranked = top.length > 1;

  top.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "banner";
    b.setAttribute("aria-pressed", String(s.no === selected));
    b.setAttribute("aria-label", ranked
      ? `Rank ${i + 1}, seat ${s.no}, ${s.ticker}`
      : `Seat ${s.no}, ${s.ticker}, the only seat taken`);
    b.innerHTML = `
      <div class="rank">${ranked ? i + 1 : "&#8470;"}<small>${ranked ? seatLabel(s.no) : String(s.no).padStart(2, "0")}</small></div>
      <div class="who">
        <div class="tick">$${esc(s.ticker)} ${badgeHtml(s.badge)}</div>
        <div class="say">${esc(s.pitch || "")}</div>
      </div>
      <div class="cash"><b>${money(s.priceUsd)}</b><span>take it from ${money(s.takeoverUsd)}</span></div>`;
    b.addEventListener("click", () => { selected = s.no; renderGrid(); showSeat(s.no); });
    box.appendChild(b);
  });
}

function renderGrid() {
  renderBanners();
  const grid = $("#grid");
  grid.innerHTML = "";
  for (const s of SEATS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "seat" + (s.status === "taken" ? "" : " open");
    b.setAttribute("aria-pressed", String(s.no === selected));
    b.setAttribute("aria-label", s.ticker ? `Seat ${s.no}, ${s.ticker}` : `Seat ${s.no}, open`);
    b.innerHTML = s.status === "taken"
      ? `<div class="seat-no"><span>${seatLabel(s.no)}</span><span class="chip">SOL</span></div>
         <div class="seat-ticker">$${esc(s.ticker)}</div>
         ${badgeHtml(s.badge)}
         <div class="seat-price">${money(s.priceUsd)} · ${countdown(s.settledUntil)
           ? "settled " + countdown(s.settledUntil)
           : "take " + money(s.takeoverUsd)}</div>`
      : `<div class="seat-no"><span>${seatLabel(s.no)}</span></div>
         <div class="seat-ticker">${s.status === "held" ? "on hold" : "open"}</div>
         <div class="seat-price">${s.status === "held" && countdown(s.heldUntil)
           ? "free in " + countdown(s.heldUntil)
           : "from " + money(s.takeoverUsd)}</div>`;
    b.addEventListener("click", () => { selected = s.no; renderGrid(); showSeat(s.no); });
    grid.appendChild(b);
  }
}

/* ---- panel: the seat as it stands ---- */
function showSeat(no) {
  stopPolling();
  const s = SEATS.find((x) => x.no === no);
  if (!s) return;
  const p = $("#panel");

  const reasons = (s.reasons || []).map((r) =>
    `<li class="${s.badge === "FLAGS FOUND" ? "r-warn" : "r-ok"}">${esc(r)}</li>`).join("");

  p.innerHTML = `
    <div class="panel-head">
      <div class="row">
        <h3>${s.ticker ? "$" + esc(s.ticker) : seatLabel(s.no)}</h3>
        ${s.ticker ? badgeHtml(s.badge) : `<span class="no">${s.status === "held" ? "on hold" : "open"}</span>`}
      </div>
      <div class="row" style="margin-top:6px">
        <span class="no">${seatLabel(s.no)}</span>
        <span class="no">${s.status === "taken" ? money(s.priceUsd) + " · take " + money(s.takeoverUsd) : "from " + money(s.takeoverUsd)}</span>
      </div>
    </div>
    ${s.ticker ? `<div class="panel-body"><p class="pitch">${esc(s.pitch)}<a href="${esc(s.link)}" rel="nofollow noopener noreferrer external" target="_blank">${esc(s.link)}</a></p></div>` : ""}
    ${reasons ? `<div class="panel-body"><h4 class="sub">What was checked${s.screenedAt ? " · " + new Date(s.screenedAt).toLocaleDateString() : ""}</h4><ul class="reasons">${reasons}</ul></div>` : ""}
    ${s.status === "taken" ? `<div class="panel-body">
      <button class="btn ghost" id="share">Save a card to post</button>
      <p class="note" style="font-size:12px;margin-top:8px">An image of this seat — ticker, number, badge and what was checked — for X or anywhere else.</p>
    </div>` : ""}
    <div class="panel-body">
      <button class="btn" id="take" ${countdown(s.settledUntil) ? "disabled" : ""}>${
        countdown(s.settledUntil)
          ? `Settled for another ${countdown(s.settledUntil)}`
          : s.status === "taken" ? `Take ${seatLabel(s.no)} from $${esc(s.ticker)}` : `Take ${seatLabel(s.no)}`
      }</button>
      <p class="note" style="font-size:12.5px;margin-top:10px">${countdown(s.settledUntil)
        ? `Whoever buys a seat keeps it for ${CONFIG.protectMinutes} minutes, whatever anyone else offers. This one is not for sale until then — and neither will yours be.`
        : (s.status === "taken"
            ? `From ${money(s.takeoverUsd)}. You name the price above that.`
            : `From ${money(s.takeoverUsd)}. You name the price.`) + ` You'll see the result of every check before you pay anything.`}</p>
    </div>`;

  $("#take").addEventListener("click", () => showForm(s));
  if (s.settledUntil) {
    const t = setInterval(() => {
      const btn = $("#take");
      if (!btn) return clearInterval(t);
      const left = countdown(s.settledUntil);
      if (!left) { clearInterval(t); showSeat(s.no); return; }
      btn.textContent = `Settled for another ${left}`;
    }, 1000);
  }
  const share = $("#share");
  if (share) {
    share.addEventListener("click", async () => {
      share.disabled = true;
      share.textContent = "Drawing…";
      try { await downloadCard(s, location.origin); share.textContent = "Saved"; }
      catch { share.textContent = "Couldn't draw it"; }
      setTimeout(() => { share.disabled = false; share.textContent = "Save a card to post"; }, 2000);
    });
  }
}

/* ---- panel: the entry form ---- */
function showForm(s) {
  const p = $("#panel");
  p.innerHTML = `
    <div class="panel-head">
      <div class="row"><h3>${seatLabel(s.no)}</h3><span class="no">${money(s.takeoverUsd)}</span></div>
      <div class="row" style="margin-top:6px"><span class="no">${s.status === "taken" ? "taking it from $" + esc(s.ticker) : "open seat"}</span></div>
    </div>
    <div class="panel-body">
      <form id="entry" novalidate>
        <div class="field">
          <label for="ticker">Ticker</label>
          <input id="ticker" name="ticker" maxlength="11" autocomplete="off" placeholder="FROG" required>
          <span class="hint">The name shown on the seat. Letters and digits only.</span>
        </div>
        <div class="field">
          <label for="mint">Token address</label>
          <input id="mint" name="mint" autocomplete="off" spellcheck="false" placeholder="Solana mint address" required>
          <span class="hint">The token we read on chain. Not the pool, not the website — this is what every check is run against.</span>
        </div>
        <div class="field">
          <label for="link">Where the seat sends people</label>
          <input id="link" name="link" type="url" autocomplete="off" placeholder="https://…" required>
          <span class="hint">Clicking your ticker on the wall opens this. Your site, your X profile, your launch page — wherever you want the traffic. https only; we follow it and check where it really lands.</span>
        </div>
        <div class="field">
          <label for="pitch">One line</label>
          <textarea id="pitch" name="pitch" maxlength="160" placeholder="What is it?" required></textarea>
          <span class="hint">Printed under your ticker, for anyone looking at the wall.</span>
        </div>
        <div class="field">
          <label for="amount">What you pay</label>
          <div class="bidrow">
            <span class="cur">$</span>
            <input id="amount" name="amount" type="number" inputmode="decimal" step="0.01"
                   min="${s.takeoverUsd}" value="${s.takeoverUsd}" required>
          </div>
          <div class="bidquick">
            <button type="button" data-bid="${s.takeoverUsd}">min $${s.takeoverUsd}</button>
            <button type="button" data-bid="${Math.ceil(s.takeoverUsd * 1.5)}">$${Math.ceil(s.takeoverUsd * 1.5)}</button>
            <button type="button" data-bid="${s.takeoverUsd * 2}">$${s.takeoverUsd * 2}</button>
          </div>
          <span class="hint">${s.status === "taken"
            ? `$${money(s.priceUsd).slice(1)} is sitting on this seat. Taking it costs $${s.takeoverUsd} or more — pay more and it costs more to take from you.`
            : `The floor is $${s.takeoverUsd}. Pay more and the seat is harder to take from you.`}</span>
        </div>
        <div class="field">
          <label for="contact">Email (optional)</label>
          <input id="contact" name="contact" type="email" autocomplete="email" placeholder="only used for your daily seat report">
          <span class="hint">Never shown on the wall, never passed on.</span>
        </div>
        <button class="btn" type="submit" id="run">Run the checks</button>
        <button class="btn ghost" type="button" id="cancel" style="margin-top:8px">Back to the seat</button>
        <div class="err" id="formErr" hidden></div>
      </form>
    </div>`;

  $("#cancel").addEventListener("click", () => showSeat(s.no));
  for (const b of p.querySelectorAll("[data-bid]")) {
    b.addEventListener("click", () => { $("#amount").value = b.dataset.bid; });
  }
  $("#entry").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#run");
    const err = $("#formErr");
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Reading the chain…";

    const payload = {
      seatNo: s.no,
      amountUsd: Number($("#amount").value),
      ticker: $("#ticker").value.trim(),
      mint: $("#mint").value.trim(),
      link: $("#link").value.trim(),
      pitch: $("#pitch").value.trim(),
      contact: $("#contact").value.trim(),
    };

    const res = await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    btn.disabled = false;
    btn.textContent = "Run the checks";

    if (res.status === 400) {
      err.hidden = false;
      err.innerHTML = (res.body.detail || ["Check the form."]).map(esc).join("<br>");
      return;
    }
    if (res.status === 429 || res.status === 503) {
      err.hidden = false;
      err.textContent = res.body.error || "Try again shortly.";
      return;
    }
    if (!res.body.allow) return showVerdict(s, res.body);
    showPayment(s, res.body, payload.ticker.replace(/^\$/, "").toUpperCase());
  });
}

/* ---- panel: refused, held, or simply not checked yet ----
   Three different things, and telling them apart matters: being told
   your contract failed is not the same as being told our checker was
   down. Only the first is your problem. */
function showVerdict(s, body) {
  const held = body.pending;
  const own = body.ownHold;
  const retry = body.retryable;
  const head = own ? "Your seat is waiting" : retry ? "Not checked" : held ? "Held" : "Refused";
  const chip = own ? "one at a time" : retry ? "try again" : held ? "manual check" : "not sellable";
  const cls  = retry ? "b-hold" : held ? "b-hold" : "b-bad";
  const item = retry || held ? "r-warn" : "r-bad";
  const p = $("#panel");
  p.innerHTML = `
    <div class="panel-head">
      <div class="row">
        <h3>${head}</h3>
        <span class="badge ${cls}"><i></i>${chip}</span>
      </div>
      <div class="row" style="margin-top:6px"><span class="no">${own ? "nothing was charged" : seatLabel(s.no) + " · nothing was charged"}</span></div>
    </div>
    <div class="panel-body">
      <p class="pitch">${esc(body.reason || body.error || "The checkout could not continue.")}</p>
      ${(body.detail || []).length ? `<ul class="reasons" style="margin-top:12px">${body.detail.map((d) => `<li class="${item}">${esc(d)}</li>`).join("")}</ul>` : ""}
    </div>
    ${body.facts ? factsBlock(body.facts, body.factsUnread) : ""}
    <div class="panel-body">
      <button class="btn" id="again">${retry ? "Try this seat again" : "Back to the wall"}</button>
      <p class="note" style="font-size:12.5px;margin-top:10px">${own
        ? "Nothing here is about this contract — we simply hold one seat per person at a time."
        : retry
        ? "This is our side, not yours — a check we could not run. Nothing about your contract failed, and nothing was recorded against it."
        : held
        ? "Someone will look at this by hand. If it clears, the seat is still yours to take."
        : `These are the published rules — <a href="/rules">all of them</a>. Fix the contract and come back.`}</p>
    </div>`;
  $("#again").addEventListener("click", () => showSeat(s.no));
}

/* When nothing could be read, the pessimistic defaults ($0, 100%, 0h)
   are not measurements and must never be shown as if they were. */
function unreadBlock() {
  const row = (k) => `<div class="fact"><span class="k">${k}</span><span class="v v-warn">not checked</span></div>`;
  return `<div class="panel-body">
    <h4 class="sub">What the chain says</h4>
    ${["Mint authority", "Freeze authority", "Liquidity", "Pool depth", "Largest wallet", "Pool age", "Link", "Link safety"].map(row).join("")}
    <p class="note" style="font-size:12.5px;margin-top:12px">None of these were read. This is a gap on our side, not a finding about the contract.</p>
  </div>`;
}

function factsBlock(f, unread) {
  if (unread) return unreadBlock();
  const row = (k, v, cls) => `<div class="fact"><span class="k">${k}</span><span class="v ${cls || ""}">${esc(v)}</span></div>`;
  const lock = f.lpLocked ? ["locked", "v-ok"]
    : f.lpProof === "dex_unmodelled" ? ["not verified (" + (f.dexId || "this DEX") + ")", "v-warn"]
    : f.lpProof === "unavailable" ? ["not checked", "v-warn"]
    : ["not locked", "v-bad"];
  return `<div class="panel-body">
    <h4 class="sub">What the chain says</h4>
    ${row("Mint authority", f.mintAuthority ? "open" : "revoked", f.mintAuthority ? "v-bad" : "v-ok")}
    ${row("Freeze authority", f.freezeAuthority ? "open" : "revoked", f.freezeAuthority ? "v-bad" : "v-ok")}
    ${row("Liquidity", lock[0], lock[1])}
    ${row("Pool depth", money(f.lpUsd), f.lpUsd < 15000 ? "v-warn" : "v-ok")}
    ${f.holdersProof === "too_many_accounts"
        ? row("Largest wallet", "not measurable (too many holders)", "v-warn")
        : f.topHolderPct === null || f.topHolderPct === undefined ? ""
        : row("Largest wallet", f.topHolderPct.toFixed(1) + "%", f.topHolderPct > 40 ? "v-bad" : f.topHolderPct > 25 ? "v-warn" : "v-ok")}
    ${f.ageHours === null ? "" : row("Pool age", f.ageHours < 48 ? f.ageHours + " h" : Math.round(f.ageHours / 24) + " d", f.ageHours < 24 ? "v-warn" : "")}
    ${row("Link", f.linkStatus === 200 ? "resolves" : "does not resolve (" + (f.linkStatus || "no response") + ")", f.linkStatus === 200 ? "v-ok" : "v-bad")}
    ${row("Link safety", f.linkThreat === "none" ? "no threat found" : f.linkThreat, f.linkThreat === "none" ? "v-ok" : "v-bad")}
    ${f.linkError ? row("Check failed with", f.linkError, "v-bad") : ""}
    ${f.vaultsSkipped ? row("Pool accounts excluded", String(f.vaultsSkipped), "v-ok") : ""}
    ${f.ownersResolved === false ? row("Holder owners", "could not be resolved", "v-warn") : ""}
  </div>`;
}

/* ---- panel: pay ---- */
function showPayment(s, body, ticker) {
  const pay = body.payment;
  const p = $("#panel");
  p.innerHTML = `
    <div class="panel-head">
      <div class="row"><h3>$${esc(ticker)}</h3>${badgeHtml(body.badge)}</div>
      <div class="row" style="margin-top:6px"><span class="no">${seatLabel(s.no)} · ${esc(body.publicSummary || "")}</span></div>
    </div>
    <div class="panel-body">
      <div class="pay">
        <div class="qr" id="qr"></div>
        <div class="amount">${pay.amountSol} SOL<small>${money(pay.priceUsd)} at ${money(pay.solUsd)}/SOL</small></div>
        <a class="btn" href="${esc(pay.url)}">Open in a wallet</a>
        <div class="copy">
          <input id="amt" readonly value="${pay.amountSol}" aria-label="Amount in SOL">
          <button class="btn ghost" id="copyAmt" type="button">Copy amount</button>
        </div>
        <div class="copy">
          <input id="addr" readonly value="${esc(pay.treasury)}" aria-label="Treasury address">
          <button class="btn ghost" id="copy" type="button">Copy address</button>
        </div>
        <p class="status" id="status" role="status"><span>Waiting for the transfer…</span></p>
        <p class="status" id="clock" aria-live="off"></p>
        <p class="note" style="font-size:12px"><strong>Send this amount exactly</strong> — the last digits identify your order, and they are how the seat finds its way back to you. Scan the code, open your wallet, or copy the two fields above and send by hand; all three work.<br><br>The seat is held for ${CONFIG.holdMinutes} minutes. If the transfer doesn't land, nothing is charged and the seat goes back on the wall.</p>
      </div>
    </div>
    ${body.facts ? factsBlock(body.facts) : ""}`;

  try {
    const qr = qrcode(0, "M");
    qr.addData(pay.url);
    qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const svg = $("#qr svg");
    if (svg) { svg.setAttribute("width", "180"); svg.setAttribute("height", "180"); }
  } catch {
    $("#qr").remove();
  }

  const copier = (btnId, inputId, value, label) => {
    $(btnId).addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(value); $(btnId).textContent = "Copied"; }
      catch { $(inputId).select(); }
      setTimeout(() => { $(btnId).textContent = label; }, 1600);
    });
  };
  copier("#copy", "#addr", pay.treasury, "Copy address");
  copier("#copyAmt", "#amt", String(pay.amountSol), "Copy amount");

  const tick = () => {
    const el = $("#clock");
    if (!el) return clearInterval(clockTimer);
    const left = countdown(pay.expiresAt);
    el.textContent = left ? `Seat held for another ${left}` : "The hold has run out.";
    el.style.color = left ? "" : "var(--bad)";
  };
  const clockTimer = setInterval(tick, 1000);
  tick();

  startPolling(body.orderId, s.no);
}

function startPolling(orderId, seatNo) {
  stopPolling();
  let tries = 0;

  /* Backing off matters: every poll is an RPC call you pay for. A
     transfer that lands, lands in the first minute; after that we are
     waiting on a human, and a human does not need four-second news. */
  const wait = (n) => (n < 8 ? 4000 : n < 20 ? 8000 : 15000);

  const tick = async () => {
    tries += 1;
    const res = await api(`/api/order/${encodeURIComponent(orderId)}`);
    const st = $("#status");
    if (!st) return stopPolling();

    if (res.body.status === "paid") {
      stopPolling();
      st.className = "status ok";
      st.innerHTML = `<span>Paid. ${seatLabel(seatNo)} is yours.</span>`;
      const wall = await api("/api/wall");
      if (wall.ok) { SEATS = wall.body.seats; renderStats(); renderGrid(); }
      setTimeout(() => showSeat(seatNo), 2500);
      return;
    }
    if (res.body.status === "expired") {
      stopPolling();
      st.className = "status bad";
      st.textContent = "The hold ran out. Nothing was charged.";
      return;
    }

    if (res.body.reason && /arrived/.test(res.body.reason)) {
      st.className = "status bad";
      st.textContent = res.body.reason;
    } else {
      st.className = "status";
      st.textContent = tries > 8 ? "Still waiting — this page updates on its own." : "Waiting for the transfer…";
    }
    poll = setTimeout(tick, wait(tries));
  };

  poll = setTimeout(tick, 4000);
}

function stopPolling() { if (poll) { clearTimeout(poll); poll = null; } }

load();

/* The wall re-reads itself every half minute: a hold that runs out
   should disappear on its own, not when the visitor thinks to reload. */
setInterval(async () => {
  if (poll) return;                      // a payment is in flight; leave the panel alone
  const wall = await api("/api/wall");
  if (!wall.ok) return;
  SEATS = wall.body.seats;
  renderStats();
  renderGrid();
}, 30000);
