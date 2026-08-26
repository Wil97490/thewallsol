/* The numbers on this page come from the running instance, so the
   published rules can never drift from the enforced ones. */
const root = document.documentElement;
try { const s = localStorage.getItem("wall-theme"); if (s) root.setAttribute("data-theme", s); } catch {}
document.querySelector("#theme").addEventListener("click", () => {
  const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem("wall-theme", next); } catch {}
});

const money = (n) => "$" + Number(n).toLocaleString("en-US");
fetch("/api/config").then((r) => r.json()).then((cfg) => {
  const map = {
    minLpUsd: money(cfg.rules.minLpUsd),
    maxTopHolderPct: String(cfg.rules.maxTopHolderPct),
    flagLpUsd: money(cfg.rules.flagLpUsd),
    flagAgeHours: String(cfg.rules.flagAgeHours),
    flagTopHolderPct: String(cfg.rules.flagTopHolderPct),
    holdMinutes: String(cfg.holdMinutes),
    floorUsd: String(cfg.floorUsd),
    incPct: String(Math.round(cfg.minIncrementPct * 100)),
    incUsd: String(cfg.minIncrementUsd),
    maxBid: Number(cfg.maxBidUsd).toLocaleString("en-US"),
    protectMinutes: String(cfg.protectMinutes),
  };
  for (const el of document.querySelectorAll("[data-cfg]")) {
    const v = map[el.dataset.cfg];
    if (v !== undefined) el.textContent = v;
  }
}).catch(() => {});
