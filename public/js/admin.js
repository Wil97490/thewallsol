/* Back-office. Le jeton vit dans sessionStorage : il disparaît à la
   fermeture de l'onglet, et n'est jamais écrit dans une URL. */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (iso) => { try { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("fr-FR");

const root = document.documentElement;
try { const s = localStorage.getItem("wall-theme"); if (s) root.setAttribute("data-theme", s); } catch {}
$("#theme").addEventListener("click", () => {
  const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("wall-theme", next); } catch {}
});

let token = "";
try { token = sessionStorage.getItem("wall-admin") || ""; } catch {}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

$("#auth").addEventListener("submit", async (e) => {
  e.preventDefault();
  token = $("#token").value;
  const res = await api("/api/admin/ops");
  if (!res.ok) {
    $("#authErr").hidden = false;
    $("#authErr").textContent = res.status === 401 ? "Jeton refusé." : "Le serveur ne répond pas.";
    return;
  }
  try { sessionStorage.setItem("wall-admin", token); } catch {}
  enter(res.body);
});

function enter(ops) {
  $("#gate").hidden = true;
  $("#app").hidden = false;
  render(ops);
  loadDrafts();
  loadLedger();
  loadQueue();
  loadUnclaimed();
  // Une seule fois, à l'ouverture. Le rafraîchissement de 30 s ne touche
  // pas la ronde : il effacerait un brouillon en cours de relecture.
  loadScout();
  loadRecap();
  $("#sweep").addEventListener("click", async () => {
    $("#sweep").disabled = true;
    $("#sweep").textContent = "Recherche…";
    await api("/api/admin/sweep", { method: "POST" });
    await loadUnclaimed();
    $("#sweep").disabled = false;
    $("#sweep").textContent = "Chercher maintenant";
  });
  setInterval(refresh, 30000);
}

async function refresh() {
  const res = await api("/api/admin/ops");
  if (res.ok) render(res.body);
  loadDrafts();
  loadLedger();
  loadQueue();
  loadUnclaimed();
}

function render(ops) {
  const state = $("#agentState");
  state.className = "pill live";
  state.innerHTML = `<i></i>${ops.agentsEnabled ? "agents actifs" : "agents coupés"}`;
  if (!ops.agentsEnabled) state.style.color = "var(--bad)";

  $("#ops").innerHTML = Object.values(ops.graduation).filter(Boolean).map((g) => {
    const pct = Math.min(100, Math.round((g.reviewed / g.needed) * 100));
    return `<div class="op">
      <div class="op-head"><h4>${esc(g.agent)}</h4>
        <span class="state ${g.autonomous ? "auto" : ""}">${g.autonomous ? "autonome" : g.demoted ? "rétrogradé" : "supervisé"}</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <div class="op-legend"><span>${g.reviewed} relus</span><span>seuil ${g.needed}</span></div>
      <div style="margin-top:14px">
        <div class="fact"><span class="k">Taux d'approbation</span><span class="v ${g.approvalRate === null ? "" : g.approvalRate >= g.needsApproval ? "v-ok" : "v-warn"}">${g.approvalRate === null ? "—" : g.approvalRate} · seuil ${g.needsApproval}</span></div>
        <div class="fact"><span class="k">Sorties bloquées (${g.guardWindow})</span><span class="v ${g.guardHits ? "v-bad" : "v-ok"}">${g.guardHits}</span></div>
        <div class="fact"><span class="k">En attente de relecture</span><span class="v">${g.pending}</span></div>
      </div>
      ${g.demoted ? `<button class="btn ghost" style="margin-top:12px" data-reinstate="${esc(g.agent)}">Réhabiliter</button>` : ""}
    </div>`;
  }).join("");

  for (const b of document.querySelectorAll("[data-reinstate]")) {
    b.addEventListener("click", async () => {
      await api(`/api/admin/reinstate/${encodeURIComponent(b.dataset.reinstate)}`, { method: "POST" });
      refresh();
    });
  }

  const hours = (m) => (m === null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
  $("#takeovers").innerHTML = (ops.takeovers || []).map((t) => {
    const brief = t.heldMinutes !== null && t.heldMinutes < 120;
    return `<tr>
      <td class="mono">${when(t.displacedAt)}</td>
      <td class="mono">№${String(t.seatNo).padStart(2, "0")}</td>
      <td class="mono">$${esc(t.ticker)}</td>
      <td class="mono">${money(t.paidUsd)}</td>
      <td class="mono" style="${brief ? "color:var(--warn)" : ""}">${hours(t.heldMinutes)}${brief ? " ⚠" : ""}</td>
      <td class="mono">${t.displacedBy ? "$" + esc(t.displacedBy) : "—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="6" class="mono">aucun siège repris pour l'instant</td></tr>`;

  $("#orders").innerHTML = (ops.orders || []).map((o) => `<tr>
    <td class="mono">${when(o.createdAt)}</td>
    <td class="mono">№${String(o.seatNo).padStart(2, "0")}</td>
    <td class="mono">$${esc(o.ticker)}</td>
    <td class="mono">${esc(o.status)}</td>
    <td class="mono">${o.amountSol ? o.amountSol + " SOL · " + money(o.priceUsd) : money(o.priceUsd)}</td>
    <td>${esc((o.detail || []).join(" · ") || o.reason || "")}</td>
  </tr>`).join("") || `<tr><td colspan="6" class="mono">aucune commande</td></tr>`;

  $("#audit").innerHTML = (ops.audit || []).map((a) => {
    const { at, agent, action, ...rest } = a;
    return `<tr><td class="mono">${when(at)}</td><td class="mono">${esc(agent)}</td><td class="mono">${esc(action)}</td>
      <td class="mono" style="max-width:520px;overflow-wrap:anywhere">${esc(JSON.stringify(rest).slice(0, 300))}</td></tr>`;
  }).join("");
}

async function loadUnclaimed() {
  const res = await api("/api/admin/unclaimed?status=unclaimed");
  if (!res.ok) return;
  const rows = res.body.rows || [];
  $("#unclaimedEmpty").hidden = rows.length > 0;
  $("#unclaimed").innerHTML = rows.map((r) => `<tr>
    <td class="mono">${when(r.blockTime ? new Date(r.blockTime * 1000).toISOString() : r.recordedAt)}</td>
    <td class="mono" style="color:var(--warn)">${esc(String(r.amountSol))} SOL</td>
    <td class="mono" style="overflow-wrap:anywhere;max-width:260px">${esc(r.from || "—")}</td>
    <td class="mono" style="overflow-wrap:anywhere;max-width:260px">${esc((r.signature || "").slice(0, 24))}…</td>
    <td><div class="rowbtns">
      <button class="btn" data-sig="${esc(r.signature)}" data-status="refunded">Remboursé</button>
      <button class="btn ghost" data-sig="${esc(r.signature)}" data-status="ignored">Ignorer</button>
    </div></td>
  </tr>`).join("");

  for (const b of $("#unclaimed").querySelectorAll("[data-sig]")) {
    b.addEventListener("click", async () => {
      if (b.dataset.status === "refunded" &&
          !confirm("Confirmez-vous avoir réellement renvoyé ce montant à l'expéditeur ?")) return;
      b.disabled = true;
      await api(`/api/admin/unclaimed/${encodeURIComponent(b.dataset.sig)}`, {
        method: "POST", body: JSON.stringify({ status: b.dataset.status }),
      });
      loadUnclaimed();
    });
  }
}

async function loadQueue() {
  const res = await api("/api/admin/queue?status=pending");
  if (!res.ok) return;
  const rows = res.body.rows || [];
  $("#queueEmpty").hidden = rows.length > 0;
  $("#queue").innerHTML = rows.map((r) => {
    const content = r.text || (r.fields ? `$${r.fields.ticker} — ${r.fields.pitch}` : "");
    return `<tr>
      <td class="mono">${when(r.at)}</td>
      <td class="mono">${esc(r.agent)}</td>
      <td class="mono">${esc(r.reason)}</td>
      <td style="max-width:460px;overflow-wrap:anywhere">${esc(content)}${r.violations ? `<div class="mono" style="color:var(--bad);font-size:11px;margin-top:6px">${esc(r.violations.join(" · "))}</div>` : ""}</td>
      <td><div class="rowbtns">
        <button class="btn" data-id="${esc(r.id)}" data-status="approved">Approuver</button>
        <button class="btn ghost" data-id="${esc(r.id)}" data-status="rejected">Rejeter</button>
      </div></td>
    </tr>`;
  }).join("");

  for (const b of $("#queue").querySelectorAll("[data-id]")) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`/api/admin/queue/${encodeURIComponent(b.dataset.id)}`, {
        method: "POST", body: JSON.stringify({ status: b.dataset.status }),
      });
      loadQueue();
      refresh();
    });
  }
}

if (token) {
  api("/api/admin/ops").then((res) => { if (res.ok) enter(res.body); });
}


/* ---- posts prêts à coller ----------------------------------------
   Rien ne part d'ici. L'agent rédige, vous décidez, X ne voit que ce
   que vous collez vous-même. C'est aussi ce qui rend la graduation
   honnête : on compte des posts réellement relus.
   ------------------------------------------------------------------ */

const KIND = { takeover: "délogement", refusal: "refus", sale: "vente" };

async function loadDrafts() {
  const res = await api("/api/admin/posts");
  const box = $("#drafts");
  if (!res.ok) { box.innerHTML = `<p class="note mono">Impossible de charger les brouillons.</p>`; return; }

  const drafts = res.body.drafts || [];
  $("#draftsEmpty").hidden = drafts.length > 0;
  box.innerHTML = drafts.map((d, i) => `
    <div class="draft" data-i="${i}">
      <div class="draft-head">
        <span class="draft-kind k-${esc(d.kind)}">${esc(KIND[d.kind] || d.kind)}</span>
        <span class="draft-when">${when(d.at)}</span>
        ${d.source === "model" ? `<span class="draft-when">reformulé par le modèle</span>` : ""}
        <span class="draft-chars ${d.chars > 280 ? "over" : ""}">${d.chars}/280</span>
      </div>
      <textarea id="dt${i}" aria-label="Texte du post">${esc(d.text)}</textarea>
      <div class="draft-acts">
        <button class="btn" data-copy="${i}">Copier</button>
        ${d.card ? `<button class="btn ghost" data-card="${i}">Carte</button>` : ""}
        ${d.kind === "refusal" ? `<button class="btn ghost" data-done="${esc(d.event.id)}">Marquer publié</button>` : ""}
        ${d.kind === "refusal" ? `<button class="btn ghost" data-hide="${esc(d.event.id)}">Retirer du registre</button>` : ""}
      </div>
    </div>`).join("");

  for (const el of box.querySelectorAll("textarea")) {
    el.addEventListener("input", () => {
      const c = el.closest(".draft").querySelector(".draft-chars");
      c.textContent = `${el.value.length}/280`;
      c.classList.toggle("over", el.value.length > 280);
    });
  }

  for (const b of box.querySelectorAll("[data-copy]")) {
    b.addEventListener("click", async () => {
      const text = $("#dt" + b.dataset.copy).value;
      try { await navigator.clipboard.writeText(text); }
      catch { $("#dt" + b.dataset.copy).select(); document.execCommand("copy"); }
      b.textContent = "Copié";
      setTimeout(() => { b.textContent = "Copier"; }, 1600);
    });
  }

  for (const b of box.querySelectorAll("[data-card]")) {
    b.addEventListener("click", async () => {
      const d = drafts[Number(b.dataset.card)];
      b.disabled = true;
      try {
        const card = await import("/js/card.js");
        // Un refus n'est pas une vente : pas de prix, pas d'invitation à
        // reprendre le siège. Deux dessins, jamais un seul paramétré.
        if (d.kind === "refusal") await card.downloadRefusalCard(d.event, location.origin);
        else await card.downloadCard(d.event, location.origin);
      } finally { b.disabled = false; }
    });
  }

  for (const b of box.querySelectorAll("[data-hide]")) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`/api/admin/hide/${encodeURIComponent(b.dataset.hide)}`, { method: "POST" });
      await loadDrafts();
    });
  }

  for (const b of box.querySelectorAll("[data-done]")) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`/api/admin/posted/${encodeURIComponent(b.dataset.done)}`, { method: "POST" });
      await loadDrafts();
    });
  }
}


/* ---- passer un contrat aux checks sans que personne l'ait soumis ----
   Le mur ne vend rien ici et ne retient aucun siège. Le refus produit
   est enregistré comme "probe" : le post dira que personne n'a demandé
   de siège, parce que c'est vrai. Inventer un acheteur pour rendre la
   phrase plus forte, c'est exactement ce que ce registre existe pour
   ne pas faire.
   ------------------------------------------------------------------ */

$("#screenForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#scRun"), out = $("#scOut");
  btn.disabled = true; btn.textContent = "Lecture de la chaîne…";
  out.hidden = false; out.textContent = "";

  const res = await api("/api/admin/screen", {
    method: "POST",
    body: JSON.stringify({ ticker: $("#scTicker").value.trim(), mint: $("#scMint").value.trim() }),
  });

  btn.disabled = false; btn.textContent = "Passer aux checks";
  if (!res.ok) { out.textContent = res.body.error || "Les checks n'ont pas pu tourner."; return; }

  const r = res.body;
  out.innerHTML = r.allow
    ? `<strong>Accepté</strong> — badge ${esc(r.badge || "—")}. Rien à publier : on ne poste pas les contrats qui passent sans qu'ils aient acheté un siège.`
    : `<strong>Refusé</strong> — ${(r.reasons || []).map(esc).join(" ")} Le brouillon est en bas.`;
  if (!r.allow) { $("#scTicker").value = ""; $("#scMint").value = ""; await loadDrafts(); }
});


/* ---- le registre, en entier ---------------------------------------
   Y compris les lignes déjà publiées : sans ça, une ligne écrite par
   d'anciennes règles reste en ligne sans moyen de la reprendre.
   ------------------------------------------------------------------ */

async function loadLedger() {
  const res = await api("/api/admin/refusals");
  const body = $("#ledger");
  if (!res.ok) { body.innerHTML = `<tr><td colspan="6" class="mono">Impossible de charger le registre.</td></tr>`; return; }

  const rows = res.body.rows || [];
  $("#ledgerEmpty").hidden = rows.length > 0;
  body.innerHTML = rows.map((r) => {
    const state = r.hidden ? `<span class="v-warn">retiré</span>` : `<span class="v-ok">public</span>`;
    const posted = r.posted ? ` · publié` : "";
    return `<tr>
      <td class="mono">${when(r.at)}</td>
      <td class="mono">$${esc(String(r.ticker || "").toUpperCase())}</td>
      <td>${esc((r.reasons || [])[0] || "—")}</td>
      <td class="mono">${r.source === "probe" ? "screené par nous" : "soumis"}${posted}</td>
      <td class="mono">${state}</td>
      <td><button class="btn ghost" style="width:auto;padding:6px 12px"
            data-ledger="${esc(r.id)}" data-op="${r.hidden ? "unhide" : "hide"}">
            ${r.hidden ? "Remettre" : "Retirer"}</button></td>
    </tr>`;
  }).join("");

  for (const b of body.querySelectorAll("[data-ledger]")) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api(`/api/admin/${b.dataset.op}/${encodeURIComponent(b.dataset.ledger)}`, { method: "POST" });
      await loadLedger();
    });
  }
}

/* ------------------------------------------------------------------ *
 * LA RONDE — qui vérifier aujourd'hui.
 *
 * Rien de ce qui s'affiche ici n'est enregistré. Le serveur passe les
 * mêmes checks que la caisse, en mode sec, sur des contrats que
 * personne n'a soumis. Tant que vous n'avez pas cliqué « Publier au
 * registre », le site n'a rien dit de personne.
 * ------------------------------------------------------------------ */

const VERDICT_FR = { refused: "refusé", flagged: "signalé", clear: "passe", incomplete: "non établi", pending: "relecture humaine", error: "erreur" };

const short = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "k";
  return String(Math.round(v));
};

function renderScout(r, { cached = false } = {}) {
  const out = $("#scoutOut");
  const alive = (r.sources || []).filter((s) => s.ok);
  const checked = r.checked || [];
  const postable = checked.filter((c) => c.post);
  const shortlisted = Array.isArray(r.shortlist) ? r.shortlist.length : Number(r.shortlist || 0);

  out.hidden = false;

  // Une découverte morte et un marché calme se ressemblent d'ici, et ce
  // n'est pas la même chose. On le dit.
  if (!alive.length) {
    out.innerHTML = `<strong>La découverte est en panne.</strong> Aucune source n'a répondu — ${
      (r.sources || []).map((s) => esc(s.id)).join(", ")
    }. Rien n'a été vérifié, rien n'a été enregistré.`;
    $("#scoutList").innerHTML = "";
    $("#scoutSkip").innerHTML = "";
    return;
  }

  // Pourquoi les autres sont partis. Sans cette ligne, « 84 vus, 1 retenu »
  // se lit comme un marché calme alors que c'est un seuil qui coupe.
  const DROP_FR = {
    no_volume: "sans audience", no_trades: "trop peu de trades", no_pool: "sans pool",
    too_old: "trop vieux", too_large: "trop gros", excluded: "majeurs et stables",
    no_ticker: "sans ticker", no_mint: "sans adresse",
  };
  const why = Object.entries(r.droppedWhy || {}).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${DROP_FR[k] || k}`).join(", ");

  out.innerHTML = (cached ? `<span class="mkt">ronde de ${when(r.at)} — le bouton en relance une.</span><br>` : "")
    + `<strong>${r.seen}</strong> contrats vus · <strong>${r.alreadyKnown}</strong> déjà vérifiés · `
    + `<strong>${shortlisted}</strong> retenus · <strong>${postable.length}</strong> publiables.<br>`
    + `<span class="mkt">${esc(String(r.droppedCount ?? 0))} écartés${why ? " — " + esc(why) : ""}`
    + ` · sources ${alive.map((s) => `${esc(s.id)}:${s.found}`).join(" ")}</span>`;

  $("#scoutList").innerHTML = postable.map((c, i) => `
    <div class="draft" data-mint="${esc(c.mint)}">
      <div class="draft-head">
        <span class="draft-kind k-${esc(c.verdict)}">$${esc(c.ticker)} — ${esc(VERDICT_FR[c.verdict] || c.verdict)}</span>
        <span class="mkt"><b>vol</b> $${short(c.vol24Usd)} · <b>lp</b> $${short(c.lpUsd)} · <b>${esc(c.dexId || "?")}</b>${c.ageHours !== null && c.ageHours !== undefined ? ` · ${c.ageHours} h` : ""}</span>
        <span class="draft-when">${esc((c.via || []).join(", "))}</span>
        <span class="draft-chars">${(c.draft || "").length}/280</span>
      </div>
      <textarea id="sc${i}" aria-label="Texte du post">${esc(c.draft || "")}</textarea>
      <div class="draft-acts">
        <button class="btn" data-sccopy="${i}">Copier</button>
        ${c.verdict === "refused" ? `<button class="btn ghost" data-sccard="${i}">Carte</button>` : ""}
        <button class="btn ghost" data-sccommit="${i}">Publier au registre</button>
        <button class="btn ghost" data-scskip="${i}">Passer</button>
      </div>
    </div>`).join("");

  renderLeads(r.prospects || []);

  $("#scoutSkip").innerHTML = checked.filter((c) => !c.post).map((c) => `
    <div class="skip">
      <b>$${esc(c.ticker || "?")}</b>
      <span class="v">${esc(VERDICT_FR[c.verdict] || c.verdict)}</span>
      <span class="why">${esc(c.why || "")}</span>
    </div>`).join("");

  const box = $("#scoutList");

  for (const b of box.querySelectorAll("[data-sccopy]")) {
    b.addEventListener("click", async () => {
      const t = $("#sc" + b.dataset.sccopy);
      try { await navigator.clipboard.writeText(t.value); }
      catch { t.select(); document.execCommand("copy"); }
      b.textContent = "Copié";
      setTimeout(() => { b.textContent = "Copier"; }, 1600);
    });
  }

  for (const b of box.querySelectorAll("[data-sccard]")) {
    b.addEventListener("click", async () => {
      const c = postable[Number(b.dataset.sccard)];
      b.disabled = true;
      try {
        const { downloadRefusalCard } = await import("/js/card.js");
        await downloadRefusalCard(
          { ticker: c.ticker, reasons: c.reasons, vol24Usd: c.vol24Usd, source: "probe" },
          location.origin
        );
      } finally { b.disabled = false; }
    });
  }

  for (const b of box.querySelectorAll("[data-scskip]")) {
    b.addEventListener("click", () => b.closest(".draft").remove());
  }

  for (const b of box.querySelectorAll("[data-sccommit]")) {
    b.addEventListener("click", async () => {
      const c = postable[Number(b.dataset.sccommit)];
      const card = b.closest(".draft");
      b.disabled = true;
      b.textContent = "Re-lecture de la chaîne…";

      // On re-mesure au moment de publier. Les chiffres du post doivent
      // être ceux qui étaient vrais quand il est sorti — surtout pour une
      // ronde calculée à 7 h qu'on publie à midi.
      const done = await api("/api/admin/screen", {
        method: "POST",
        body: JSON.stringify({ mint: c.mint, ticker: c.ticker, link: c.link || null, dry: false }),
      });

      if (!done.ok) {
        b.disabled = false; b.textContent = "Publier au registre";
        card.querySelector(".draft-head").insertAdjacentHTML("beforeend",
          `<span class="draft-chars over">${esc(done.body.error || "échec")}</span>`);
        return;
      }

      if (done.body.allow) {
        // Il est passé cette fois-ci. Rien à publier : on ne se porte pas
        // garant d'un contrat que personne n'a soumis.
        card.querySelector(".draft-acts").innerHTML =
          `<p class="note mono">Il passe les checks maintenant. Rien n'est publié : le mur ne se porte pas garant d'un contrat que personne n'a soumis.</p>`;
        return;
      }

      card.querySelector(".draft-acts").innerHTML = `<p class="note mono">Au registre. Le brouillon est passé dans « Posts prêts ».</p>`;
      await loadDrafts();
      await loadLedger();
    });
  }
}

/** La ronde de ce matin, déjà calculée par Cloud Scheduler. */
async function loadScout() {
  const res = await api("/api/admin/scout");
  if (!res.ok || !res.body.round) return;
  renderScout(res.body.round, { cached: true });
}

$("#scoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#scoutRun"), out = $("#scoutOut");
  const n = Math.max(1, Math.min(10, Number($("#scoutN").value) || 8));

  btn.disabled = true;
  btn.textContent = "Lecture de la chaîne…";
  out.hidden = false;
  out.textContent = `${n} contrats à passer aux checks. Comptez une minute.`;
  $("#scoutList").innerHTML = "";
  $("#scoutSkip").innerHTML = "";

  const res = await api("/api/admin/scout", { method: "POST", body: JSON.stringify({ limit: n }) });
  btn.disabled = false;
  btn.textContent = "Lancer la ronde";

  if (!res.ok) {
    out.textContent = res.body.error || "La ronde n'a pas pu tourner.";
    return;
  }
  renderScout(res.body);
});


/* ------------------------------------------------------------------ *
 * LE MOIS — des comptes, pas des adjectifs.
 * ------------------------------------------------------------------ */

function renderRecap(r) {
  const box = $("#recap");
  if (!r || !r.text) {
    box.innerHTML = `<p class="note mono">Pas encore de récapitulatif. Il s'écrit le dernier jour du mois.</p>`;
    return;
  }
  const c = r.counts || {};
  box.innerHTML = `
    <div class="draft">
      <div class="draft-head">
        <span class="draft-kind k-sale">${esc(r.month || "")}</span>
        <span class="mkt"><b>${c.checked ?? "—"}</b> vérifiés · <b>${c.refused ?? 0}</b> refusés · <b>${c.sold ?? 0}</b> vendus · <b>${c.takeovers ?? 0}</b> repris</span>
        <span class="draft-when">${when(r.at)}</span>
        <span class="draft-chars ${r.chars > 280 ? "over" : ""}">${r.chars || r.text.length}/280</span>
      </div>
      <textarea id="recapText" aria-label="Texte du récapitulatif">${esc(r.text)}</textarea>
      <div class="draft-acts"><button class="btn" id="recapCopy">Copier</button></div>
    </div>`;
  $("#recapCopy").addEventListener("click", async () => {
    const t = $("#recapText");
    try { await navigator.clipboard.writeText(t.value); }
    catch { t.select(); document.execCommand("copy"); }
    $("#recapCopy").textContent = "Copié";
    setTimeout(() => { $("#recapCopy").textContent = "Copier"; }, 1600);
  });
}

async function loadRecap() {
  const res = await api("/api/admin/recap");
  if (res.ok) renderRecap(res.body.recap);
}

$("#recapRun").addEventListener("click", async () => {
  const b = $("#recapRun");
  b.disabled = true; b.textContent = "Comptage…";
  const res = await api("/api/admin/recap", { method: "POST" });
  b.disabled = false; b.textContent = "Recalculer le mois en cours";
  if (res.ok) renderRecap(res.body);
});


/* ------------------------------------------------------------------ *
 * QUI DÉMARCHER — l'autre moitié de la ronde.
 *
 * Les contrats qui passent le gate ne sont jamais publiés : le dire
 * publiquement serait se porter garant. Mais ce sont les seules
 * personnes au monde dont on sait qu'elles achètent de la publicité ET
 * qu'elles passeraient nos checks. Rien ici ne part tout seul.
 * ------------------------------------------------------------------ */

function renderLeads(list) {
  const box = $("#leads");
  $("#leadsEmpty").hidden = list.length > 0;
  if (!list.length) { box.innerHTML = ""; return; }

  const link = (url, label) => url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)}</a>`
    : "";

  box.innerHTML = list.map((c, i) => `
    <div class="draft" data-lead="${esc(c.mint)}">
      <div class="draft-head">
        <span class="draft-kind k-${esc(c.verdict)}">$${esc(c.ticker)} — ${esc(VERDICT_FR[c.verdict] || c.verdict)}</span>
        <span class="mkt"><b>vol</b> $${short(c.vol24Usd)} · <b>lp</b> $${short(c.lpUsd)} · <b>${esc(c.dexId || "?")}</b>${c.ageHours !== null && c.ageHours !== undefined ? ` · ${c.ageHours} h` : ""}</span>
        <span class="draft-when">${[
          link(c.links?.twitter, "X"),
          link(c.links?.telegram, "Telegram"),
          link(c.links?.website, "site"),
        ].filter(Boolean).join(" · ")}</span>
        <span class="draft-chars">siège $${esc(String(c.seatUsd))}</span>
      </div>
      <textarea id="lead${i}" aria-label="Message de démarchage">${esc(c.outreach || "")}</textarea>
      <div class="draft-acts">
        <button class="btn" data-leadcopy="${i}">Copier</button>
        <button class="btn ghost" data-leaddone="${esc(c.mint)}">Marquer contacté</button>
      </div>
    </div>`).join("");

  for (const b of box.querySelectorAll("[data-leadcopy]")) {
    b.addEventListener("click", async () => {
      const t = $("#lead" + b.dataset.leadcopy);
      try { await navigator.clipboard.writeText(t.value); }
      catch { t.select(); document.execCommand("copy"); }
      b.textContent = "Copié";
      setTimeout(() => { b.textContent = "Copier"; }, 1600);
    });
  }

  for (const b of box.querySelectorAll("[data-leaddone]")) {
    b.addEventListener("click", async () => {
      b.disabled = true;
      const res = await api(`/api/admin/contacted/${encodeURIComponent(b.dataset.leaddone)}`, { method: "POST" });
      if (res.ok) b.closest(".draft").remove();
      else b.disabled = false;
    });
  }
}
