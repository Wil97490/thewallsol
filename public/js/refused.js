/* The public half of the ledger. Read-only, no token, no addresses. */

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const root = document.documentElement;
try { const s = localStorage.getItem("wall-theme"); if (s) root.setAttribute("data-theme", s); } catch {}
$("#theme").addEventListener("click", () => {
  const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("wall-theme", next); } catch {}
});

const when = (iso) => {
  try {
    return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

(async function load() {
  const box = $("#rows");
  let rows = [];
  try {
    const res = await fetch("/api/refused");
    rows = (await res.json()).rows || [];
  } catch {
    box.innerHTML = `<p class="note mono">The ledger is unreachable right now.</p>`;
    return;
  }

  $("#empty").hidden = rows.length > 0;
  box.innerHTML = rows.map((r) => `
    <article class="ref">
      <div class="ref-head">
        <span class="ref-tick">${r.slug
          ? `<a href="/refused/${encodeURIComponent(r.slug)}">$${esc(String(r.ticker || "").replace(/^\$/, "").toUpperCase())}</a>`
          : `$${esc(String(r.ticker || "").replace(/^\$/, "").toUpperCase())}`}</span>
        <span class="ref-when">${esc(when(r.at))}</span>
      </div>
      <div class="ref-src ${r.source === "probe" ? "s-probe" : "s-gate"}">
        ${r.source === "probe" ? "screened — nobody asked for a seat" : "submitted, and turned away"}
      </div>
      <ul class="ref-why">
        ${(r.reasons || []).map((x) => `<li>${esc(x)}</li>`).join("")}
      </ul>
      ${r.mint ? `<p class="ref-mint" title="The contract this row is about">${esc(r.mint)}</p>` : ""}
    </article>`).join("");
})();
