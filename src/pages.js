import { config } from "./config.js";

/* ------------------------------------------------------------------ *
 * SERVER-RENDERED PAGES — the half of the site a crawler can read.
 *
 * Everything else on this site is a static shell that fetches its own
 * data. That is fine for a wall somebody is looking at; it is useless
 * for a page that has to exist in a search index the moment it is
 * written. A refusal page has one job — be there, complete, on the
 * first response — so it is built here as text.
 *
 * The rule the rest of the codebase lives by applies unchanged: nothing
 * on these pages may state something that was not measured. A field
 * that is absent from the ledger row is absent from the page.
 * ------------------------------------------------------------------ */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const tick = (t) => String(t || "").replace(/^\$/, "").toUpperCase();

/** A slug a person could type, and that survives a ticker in any script. */
export function slugify(ticker, id = "") {
  const base = String(ticker || "")
    .replace(/^\$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  // A ticker in Chinese, Arabic or emoji leaves nothing behind. Rather
  // than publish /refused/-- for it, fall back to the row's own id.
  return base || `token-${String(id).slice(0, 8)}`;
}

const day = (iso) => {
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return null; }
};

const when = (iso) => {
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch { return "—"; }
};

const compact = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + "M";
  if (v >= 1_000) return "$" + Math.round(v / 1_000) + "k";
  return "$" + Math.round(v);
};

/* ---- the shell ----------------------------------------------------- */

function shell({ title, description, canonical, jsonLd, body, robots = "index, follow" }) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${esc(robots)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(base)}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:site_name" content="The Wall">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;0,6..96,800;1,6..96,400&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/app.css">
<!-- Externe, et sans defer : la CSP interdit les scripts en ligne, et
     l'attribut doit être posé avant le premier rendu — sinon la page
     s'allume en clair puis bascule au visage de quelqu'un. -->
<script src="/js/theme.js"></script>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ""}
</head>
<body>
<header class="topbar">
  <div class="wrap topbar-in">
    <a class="mark" href="/"><svg class="glyph" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect x="1.25" y="1.25" width="37.5" height="37.5" fill="none" stroke="var(--brass)" stroke-width="2.5"/><text x="20" y="29.5" text-anchor="middle" font-family="Bodoni Moda, Georgia, serif" font-size="27" font-weight="800" fill="currentColor">№</text></svg>THE WALL</a>
    <nav class="nav"><a href="/">The wall</a><a href="/rules">The rules</a><a href="/refused">Refused</a></nav>
    <button class="pill" id="theme" type="button">Theme</button>
  </div>
</header>
<main>
${body}
</main>
<footer class="wrap"><a href="/">Back to the wall</a> · <a href="/refused">The ledger</a> · <a href="/rules">The rules</a> · <a href="/terms">Terms</a> · <a href="mailto:contact@thewallsol.com">contact@thewallsol.com</a></footer>
</body>
</html>`;
}

/* ---- one refusal ---------------------------------------------------
 * The page somebody lands on after typing a ticker and the word "rug"
 * into a search box. That person is frightened and in a hurry, so the
 * measurement comes first and the explanation second — and the page is
 * scrupulous about what it does NOT claim, because the same anxiety
 * that brought them here will make them read a refusal as a warning
 * about their money, which it is not.
 * ------------------------------------------------------------------ */

export function refusalPage(row) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const t = tick(row.ticker);
  const url = `${base}/refused/${row.slug}`;
  const vol = compact(row.vol24Usd);
  const probe = row.source === "probe";

  const title = `$${t} would not get a seat on The Wall — checked ${day(row.at) || ""}`.trim();
  const description = (row.reasons || [])[0]
    ? `${(row.reasons || [])[0]} Measured on Solana at ${when(row.at)}.`
    : `A contract check for $${t}, measured on Solana at ${when(row.at)}.`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    datePublished: row.at,
    dateModified: row.at,
    url,
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "The Wall", url: base },
    publisher: { "@type": "Organization", name: "The Wall", url: base },
    about: { "@type": "Thing", name: `$${t}` },
    articleBody: (row.reasons || []).join(" "),
  };

  const body = `
  <div class="wrap hero">
    <p class="eyebrow">${probe ? "Nobody asked — we checked anyway" : "Submitted, and turned away"}</p>
    <h1>$${esc(t)} would <em>not get a seat.</em></h1>
    <p class="sub">Measured on Solana at ${esc(when(row.at))}${vol ? `, with ${esc(vol)} traded in the previous 24 hours` : ""}. The Wall sells twenty-four advertising seats and screens every contract before selling one. This contract did not pass.</p>
  </div>

  <section>
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">What was measured</p>
        <h2>The findings</h2>
      </div>
      <ul class="ref-why" style="margin-top:22px;max-width:70ch">
        ${(row.reasons || []).map((r) => `<li>${esc(r)}</li>`).join("")}
      </ul>
      <p class="note" style="max-width:66ch;margin-top:22px">
        Each line above corresponds to a rule that was written down before this contract was looked at. <a href="/rules">Every rule is published</a>, with its threshold.
      </p>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">Read this part</p>
        <h2>What this page does not say</h2>
      </div>
      <div class="pledge">
        <p><strong>This is a door policy, not a verdict on the token.</strong> The only question answered here is whether this contract could buy advertising space on our wall. We are not a rating agency, we have no opinion on whether anyone should hold, buy or sell anything, and we are not qualified to have one.</p>
        <p><strong>It is a measurement at one moment.</strong> ${esc(when(row.at))}, and nothing since. A contract can be fixed the hour after it is checked — an authority revoked, liquidity added — and this page will not know.</p>
        ${probe ? `<p><strong>Nobody submitted this contract.</strong> No one connected to $${esc(t)} asked us for anything and no money was involved. We check contracts that are buying attention elsewhere, and we publish what we find. <a href="/rules#unsubmitted">How they are chosen.</a></p>` : ""}
        <p class="pledge-last">If a line on this page is wrong, write to <a href="mailto:contact@thewallsol.com">contact@thewallsol.com</a> with the mint address. A measurement we got wrong comes down, and the correction is public.</p>
      </div>
    </div>
  </section>

  <section>
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">The rest of the ledger</p>
        <h2>Every refusal is published</h2>
        <p class="note">A badge nobody can audit is a marketing claim. <a href="/refused">See what else was turned away.</a></p>
      </div>
    </div>
  </section>`;

  return shell({ title, description, canonical: url, jsonLd, body });
}

/** A row that was taken down. 410, not 404: it was here, and it was withdrawn. */
export function refusalGonePage(slug) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return shell({
    title: "This check was withdrawn — The Wall",
    description: "A published check was taken down. The ledger records that it was withdrawn rather than pretending it never existed.",
    canonical: `${base}/refused/${slug}`,
    robots: "noindex, follow",
    body: `
  <div class="wrap hero">
    <p class="eyebrow">Withdrawn</p>
    <h1>This check was <em>taken down.</em></h1>
    <p class="sub">It was published here, and it is not any more — usually because the measurement was wrong, or because it rested on something we could not establish. A ledger you can quietly erase is not a ledger, so this page says so rather than returning nothing.</p>
  </div>
  <section><div class="wrap">
    <p class="note" style="max-width:66ch"><a href="/refused">The rest of the ledger</a> · <a href="/rules">The rules</a></p>
  </div></section>`,
  });
}

/** A slug that was never here. Different words from a withdrawal, on
 *  purpose: "we took this down" and "this never existed" are two
 *  different claims, and printing the first for the second would be the
 *  same error the whole gate exists to avoid. */
export function refusalMissingPage(slug) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  return shell({
    title: "No check at this address — The Wall",
    description: "The Wall has not published a contract check at this address.",
    canonical: `${base}/refused`,
    robots: "noindex, follow",
    body: `
  <div class="wrap hero">
    <p class="eyebrow">Nothing here</p>
    <h1>We have not <em>published this.</em></h1>
    <p class="sub">There is no check at this address — not one that was taken down, one that was never written. If you are looking for a particular contract, you can run the checks on it yourself.</p>
  </div>
  <section><div class="wrap">
    <p class="note" style="max-width:66ch"><a href="/refused">The ledger</a> · <a href="/rules">The rules</a></p>
  </div></section>`,
  });
}

/* ---- the sitemap, which now has a body --------------------------- */

export function sitemap(rows = []) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const fixed = [
    { loc: base + "/", freq: "hourly", pri: "1.0" },
    { loc: base + "/refused", freq: "daily", pri: "0.9" },
    { loc: base + "/rules", freq: "weekly", pri: "0.8" },
    { loc: base + "/terms", freq: "monthly", pri: "0.3" },
  ];
  const urls = [
    ...fixed.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`),
    ...rows.map((r) => `  <url><loc>${base}/refused/${r.slug}</loc><lastmod>${day(r.at)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}
