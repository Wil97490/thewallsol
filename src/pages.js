import { config } from "./config.js";
import { SEEN_RULES, SEEN_OURS } from "./agents/scout.js";
import { CHECKS, CHECK_BY_SLUG, RULE_TO_CHECK } from "./checks.js";

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
<link rel="stylesheet" href="/css/visual.css">
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
    <nav class="nav"><a href="/">The wall</a><a href="/rules">The rules</a><a href="/seen">Seen</a><a href="/refused">Refused</a></nav>
    <button class="pill" id="theme" type="button">Theme</button>
  </div>
</header>
<main>
${body}
</main>
<footer class="wrap"><a href="/">Back to the wall</a> · <a href="/seen">Last night</a> · <a href="/refused">The ledger</a> · <a href="/rules">The rules</a> · <a href="/checks">Run the checks yourself</a> · <a href="/terms">Terms</a> · <a href="mailto:contact@thewallsol.com">contact@thewallsol.com</a></footer>
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
    about: { "@type": "Thing", name: `$${t}`, ...(row.mint ? { identifier: row.mint } : {}) },
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
        ${(row.reasons || []).map((r, i) => {
          /* The finding, and — when we can be certain which rule wrote
           * it — a way to understand it and check it yourself.
           *
           * reasons[] and ruleIds[] are produced by the same .map over
           * the same filtered array, so index i pairs them. That is a
           * coupling, so it is asserted rather than assumed: rows
           * written before ruleIds existed, or by any path that builds
           * the two lists separately, get no link at all rather than
           * the wrong one. A finding pointing at the wrong explanation
           * is worse than a finding pointing at nothing. */
          const ids = row.ruleIds || [];
          const slug = ids.length === (row.reasons || []).length ? RULE_TO_CHECK[ids[i]] : null;
          return `<li>${esc(r)}${slug ? ` <a class="why-more" href="/checks/${slug}">how to check this yourself &rarr;</a>` : ""}</li>`;
        }).join("")}
      </ul>
      ${row.mint ? `<p class="note" style="max-width:70ch;margin-top:26px">
        <strong>The contract this page is about.</strong> A ticker is not an identity — several live tokens can carry the same one. This is the only thing that identifies what was measured, so you can check it yourself:
      </p>
      <p class="mono" style="margin-top:10px;font-size:14px;word-break:break-all;color:var(--muted)">${esc(row.mint)}</p>
      <p class="note" style="max-width:66ch;margin-top:8px;font-size:13px">Printed, not linked. It is here to identify a measurement, not to send anyone anywhere.</p>` : ""}
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
      </div>
    </div>
  </section>

  <!-- Le droit de réponse, à son rang.
       Cette phrase a vécu comme dernière ligne de l'encadré au-dessus :
       gris pâle, 13,5px, sous un filet pointillé, au rang typographique
       d'une mention légale. Sur une page qui NOMME un contrat et qui
       ressort dans Google sur son propre ticker, ce n'est pas une note
       de bas de page — c'est la seule voie de recours de la personne
       qu'on vient de mesurer en public. Le texte n'a pas changé ; il a
       cessé d'être écrit en petit. -->
  <section>
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">Your right of reply</p>
        <h2>If we got this wrong</h2>
      </div>
      <div class="reply">
        <p>Write to <a href="mailto:contact@thewallsol.com">contact@thewallsol.com</a> with the mint address and the line you are disputing.</p>
        <p><strong>A measurement we got wrong comes down, and the correction is public.</strong> The page does not quietly disappear — it stays at this address and says it was withdrawn. A ledger you can erase is not a ledger.</p>
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
    { loc: base + "/seen", freq: "daily", pri: "0.8" },
    { loc: base + "/rules", freq: "weekly", pri: "0.8" },
    { loc: base + "/checks", freq: "monthly", pri: "0.7" },
    ...CHECKS.map((c) => ({ loc: `${base}/checks/${c.slug}`, freq: "monthly", pri: "0.7" })),
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

/* ---- what the wall saw ---------------------------------------------
 * The round reads two dozen contracts a night and publishes at most
 * one. This page is the other twenty-three — counted, never named.
 *
 * The rule that governs every line here: a number that could identify
 * one project is not a statistic, it is an accusation with the name
 * filed off. No tickers, no mints, no links, and no bucket so small it
 * points at somebody.
 * ------------------------------------------------------------------ */

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function seenPage({ last, history = [], totals: sum }) {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const url = `${base}/seen`;
  const n = last?.checked || 0;

  const title = "What the wall saw last night — measurements, no names";
  const description = last
    ? `${n} Solana contracts read on ${day(last.at) || "the last round"}. What the checks found, counted and unnamed.`
    : "What the wall's nightly round found across the contracts it read, counted and unnamed.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "The Wall — nightly contract checks",
    description: "Aggregate results of automated Solana contract checks run nightly. No token is named.",
    url, isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "The Wall", url: base },
    ...(last?.at ? { dateModified: last.at } : {}),
    temporalCoverage: history.length ? `${day(history[history.length - 1].at)}/${day(history[0].at)}` : undefined,
  };

  const bars = (rows, source, total) => rows
    .map(([id, label]) => [label, Number(source?.[id] || 0)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, v]) => `
      <div class="seen-row">
        <span class="seen-k">${esc(label)}</span>
        <span class="seen-bar"><i style="width:${total ? Math.round((v / total) * 100) : 0}%"></i></span>
        <span class="seen-v">${v}</span>
      </div>`).join("") || `<p class="note">Nothing in this group last night.</p>`;

  const body = `
  <div class="wrap hero">
    <p class="eyebrow">Every night, without being asked</p>
    <h1>What the wall <em>saw last night.</em></h1>
    <p class="sub">${last
      ? `${plural(n, "contract", "contracts")} read on Solana, ${esc(when(last.at))}. The round publishes at most one finding a day. This is everything else it measured — counted, and deliberately nameless.`
      : "The round has not stored a night yet. This page fills itself the next time it runs."}</p>
  </div>

  ${last ? `
  <section><div class="wrap">
    <div class="stats">
      <div class="stat"><span class="stat-k">Seen</span><b>${last.seen}</b><span class="note">candidates found buying attention</span></div>
      <div class="stat"><span class="stat-k">Checked</span><b>${last.checked}</b><span class="note">read on chain, one by one</span></div>
      <div class="stat"><span class="stat-k">Median pool</span><b>${compact(last.medianLpUsd) || "—"}</b><span class="note">of those checked</span></div>
      <div class="stat"><span class="stat-k">Median age</span><b>${last.medianAgeHours != null ? last.medianAgeHours + " h" : "—"}</b><span class="note">since the pair opened</span></div>
    </div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Facts about the contracts</p>
      <h2>What the checks found</h2>
      <p class="note">Each line is a count, not a verdict. A contract can appear on several.</p>
    </div>
    <div class="seen" style="margin-top:22px">${bars(SEEN_RULES, last.findings, last.checked)}</div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Facts about us</p>
      <h2>What we could not check</h2>
      <p class="note">Counted separately, on purpose. A check that did not run is our limit, not a finding against anyone — and reporting the two in the same column is the error this whole site was built to avoid.</p>
    </div>
    <div class="seen" style="margin-top:22px">${bars(SEEN_OURS, last.ours, last.checked)}</div>
  </div></section>` : ""}

  ${sum && sum.nights > 1 ? `
  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Since we started counting</p>
      <h2>${plural(sum.nights, "night", "nights")}, ${sum.checked} contracts read</h2>
    </div>
    <div class="seen" style="margin-top:22px">${bars(SEEN_RULES, sum.findings, sum.checked)}</div>
  </div></section>` : ""}

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Read this part</p>
      <h2>Why no token is named here</h2>
    </div>
    <div class="pledge">
      <p><strong>Nothing on this page identifies a project.</strong> Most of what the round measures is not publishable against a named contract: it either passed, or it failed on something that is a limit of our checks rather than a fact about them. A count accuses nobody. A count with a ticker attached is an accusation with the name filed off, and we are not doing that.</p>
      <p><strong>These are not ratings.</strong> The wall sells advertising seats and screens contracts before selling one. It has no opinion on whether anyone should hold, buy or sell anything, and is not qualified to have one.</p>
      <p class="pledge-last">The contracts we <em>do</em> name are the ones that were refused, with the measurement that refused them: <a href="/refused">the ledger</a>. <a href="/rules">Every threshold used here is published</a>.</p>
    </div>
  </div></section>`;

  return shell({ title, description, canonical: url, jsonLd, body });
}

/* ---- the checks, explained -----------------------------------------
 * Six things we measure and one we measure about the advertisement,
 * each with the call that measures it, written so somebody can run it
 * without us. See checks.js for why these exist at all.
 *
 * Every threshold on these pages is read from config here, never
 * written into the prose in checks.js. A number in a paragraph is a
 * number that will be wrong the first time someone changes an
 * environment variable, and this whole site is an argument against
 * publishing claims nobody re-measured.
 * ------------------------------------------------------------------ */

const money = (n) => "$" + Math.round(Number(n)).toLocaleString("en-US");

function thresholds(slug) {
  switch (slug) {
    case "holder-concentration":
      return [
        [`Over ${config.maxTopHolderPct}% in one wallet`, "Refused"],
        [`Over ${config.flagTopHolderPct}% in one wallet`, "Flagged on the seat"],
      ];
    case "pool-depth":
      return [
        [`Pool under ${money(config.minLpUsd)}`, "Refused"],
        [`Pool under ${money(config.flagLpUsd)}`, "Flagged on the seat"],
      ];
    case "pair-age":
      return [[`Pair under ${config.flagAgeHours} hours old`, "Flagged on the seat"]];
    case "mint-authority":
      return [["Mint authority not revoked", "Refused"]];
    case "freeze-authority":
      return [["Freeze authority not revoked", "Refused"]];
    case "liquidity-lock":
      return [
        ["Pool read, and the LP can still be withdrawn", "Refused"],
        ["Locked only by the launchpad's migration", "Flagged on the seat"],
        ["Pool on a DEX we do not model", "Flagged — the gap is ours"],
      ];
    case "destination-link":
      return [
        ["Destination gone, or flagged by the safety service", "Refused"],
        ["Destination declines to answer, or redirects before it lands", "Flagged on the seat"],
      ];
    default:
      return [];
  }
}

function checkNav(current) {
  return `<nav class="checknav">${CHECKS.map((c) => c.slug === current
    ? `<span aria-current="page">${esc(c.nav)}</span>`
    : `<a href="/checks/${c.slug}">${esc(c.nav)}</a>`).join("")}</nav>`;
}

export function checkPage(slug) {
  const c = CHECK_BY_SLUG[slug];
  if (!c) return null;
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const url = `${base}/checks/${c.slug}`;
  const rows = thresholds(c.slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: c.title,
    url,
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "The Wall", url: base },
    publisher: { "@type": "Organization", name: "The Wall", url: base },
    proficiencyLevel: "Beginner",
    about: { "@type": "Thing", name: c.nav },
  };

  const body = `
  <div class="wrap hero">
    <p class="eyebrow">One of the checks</p>
    <h1>${c.h1}</h1>
    <p class="sub">${c.lede}</p>
  </div>

  <section><div class="wrap">
    ${checkNav(c.slug)}
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">What it is</p>
      <h2>The thing being measured</h2>
    </div>
    ${c.what.map((t) => `<p class="body">${t}</p>`).join("")}
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Without taking our word for it</p>
      <h2>Check it yourself</h2>
      <p class="note">${c.verify.intro}</p>
    </div>
    <pre class="cmd">${esc(c.verify.command)}</pre>
    <div class="reading">
      ${c.verify.reading.map(([k, v]) => `
      <div class="read-row">
        <code class="read-k">${esc(k)}</code>
        <span class="read-v">${esc(v)}</span>
      </div>`).join("")}
    </div>
    ${c.verify.note ? `<p class="note" style="margin-top:18px">${c.verify.note}</p>` : ""}
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Our door policy</p>
      <h2>What we do with the answer</h2>
      <p class="note">${esc(c.outcomeLine)}</p>
    </div>
    ${rows.length ? `<div class="thresh">${rows.map(([k, v]) => `
      <div class="thresh-row"><span class="thresh-k">${esc(k)}</span><span class="thresh-v">${esc(v)}</span></div>`).join("")}</div>` : ""}
    <p class="note" style="margin-top:20px">Every threshold on this site is published before it is applied. <a href="/rules">All of them, on one page.</a></p>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Read this part</p>
      <h2>What this measurement does not establish</h2>
    </div>
    <div class="pledge">
      ${c.limits.map((t) => `<p>${t}</p>`).join("")}
      ${c.not.map((t) => `<p>${t}</p>`).join("")}
      <p class="pledge-last">The Wall sells twenty-four advertising seats and screens every contract before selling one. It is a door policy, not a rating: we have no opinion on whether anyone should hold, buy or sell anything, and we are not qualified to have one.</p>
    </div>
  </div></section>

  <section><div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">Where this check gets used</p>
      <h2>Every refusal is published, with its measurement</h2>
      <p class="note">A badge nobody can audit is a marketing claim. <a href="/refused">The ledger</a> · <a href="/seen">what last night's round found, counted and unnamed</a>.</p>
    </div>
  </div></section>`;

  return shell({ title: c.title, description: stripTags(c.lede).slice(0, 300), canonical: url, jsonLd, body });
}

const stripTags = (s) => String(s).replace(/<[^>]*>/g, "");

export function checksIndexPage() {
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const url = `${base}/checks`;
  const title = "The contract checks, one page each — how to run them yourself";
  const description = "What each check on The Wall measures, the exact call it makes, and how to reproduce it against a public Solana RPC without an account.";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title, description, url,
    isAccessibleForFree: true,
    publisher: { "@type": "Organization", name: "The Wall", url: base },
    hasPart: CHECKS.map((c) => ({ "@type": "TechArticle", name: c.title, url: `${base}/checks/${c.slug}` })),
  };

  const body = `
  <div class="wrap hero">
    <p class="eyebrow">Every check, with the call it makes</p>
    <h1>How to run <em>our checks yourself.</em></h1>
    <p class="sub">A site that says "trust our screening" is worth nothing. Each page below explains one thing we measure, hands you the exact call we make, and says plainly what the measurement does not establish. All of it runs against a public Solana RPC — no account, no key, and no need for us.</p>
  </div>

  <section><div class="wrap">
    <div class="checks">
      ${CHECKS.map((c) => `
      <a class="chk" href="/checks/${c.slug}">
        <span class="chk-k">${esc(c.nav)}</span>
        <span class="chk-h">${stripTags(c.h1)}</span>
        <span class="chk-v">${esc(c.outcome === "refused" ? "Can refuse a seat" : "Flags a seat")}</span>
      </a>`).join("")}
    </div>
    <p class="note" style="margin-top:24px">These are the checks. <a href="/rules">The rules that apply them</a>, with every threshold. <a href="/refused">The ledger</a>, where each refusal names the check that produced it.</p>
  </div></section>`;

  return shell({ title, description, canonical: url, jsonLd, body });
}
