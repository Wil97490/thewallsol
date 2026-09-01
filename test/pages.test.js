import "./_helpers.js";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { slugify, refusalPage, refusalGonePage, refusalMissingPage, seenPage, sitemap } from "../src/pages.js";
import { aggregate, pushNight, totals } from "../src/agents/scout.js";
import { monthlyDraft } from "../src/agents/poster.js";
import { _resetMemory, recordRefusal, getRefusalBySlug, listRefusals } from "../src/storage.js";

const MINT = "So11111111111111111111111111111111111111112";

const row = (over = {}) => ({
  id: "abcd1234-ef56", at: "2026-08-26T14:31:00.000Z", ticker: "SNIPY", slug: "snipy",
  reasons: ["Pool liquidity is $2,057, under the $2,500 floor."],
  ruleIds: ["lp_thin"], source: "probe", vol24Usd: 1_284_000, ...over,
});

/* ---- addresses ----------------------------------------------------- */

test("a slug is lowercase, hyphenated and bounded", () => {
  assert.equal(slugify("$SNIPY"), "snipy");
  assert.equal(slugify("Apple Cat!!"), "apple-cat");
  assert.equal(slugify("--weird--"), "weird");
  assert.ok(slugify("A".repeat(80)).length <= 24);
});

test("a ticker with no latin letters still gets an address", () => {
  // A page that 404s because the ticker was in Chinese is a page that
  // was never published.
  const s = slugify("长毛", "abcd1234-ef56");
  assert.ok(s.length > 0);
  assert.match(s, /^token-/);
});

test("two refusals of the same ticker do not overwrite each other", async () => {
  _resetMemory();
  const a = await recordRefusal({ ticker: "DUPE", mint: MINT, reasons: ["x"], ruleIds: ["whale"], source: "probe" });
  const b = await recordRefusal({ ticker: "DUPE", mint: MINT, reasons: ["y"], ruleIds: ["whale"], source: "probe" });
  assert.equal(a.slug, "dupe");
  assert.notEqual(b.slug, a.slug);
  assert.equal((await getRefusalBySlug(a.slug)).reasons[0], "x");
  assert.equal((await getRefusalBySlug(b.slug)).reasons[0], "y");
});

test("rows written before slugs existed are still addressable", async () => {
  _resetMemory();
  const r = await recordRefusal({ ticker: "OLD", mint: MINT, reasons: ["x"], ruleIds: ["whale"], source: "gate" });
  delete r.slug;                       // simulate the pre-slug ledger
  const [listed] = await listRefusals({ limit: 10 });
  assert.equal(listed.slug, "old");
});

/* ---- the page itself ------------------------------------------------ */

test("a refusal page states the measurement and the moment", () => {
  const html = refusalPage(row());
  assert.match(html, /\$SNIPY/);
  assert.match(html, /2026-08-26 14:31 UTC/);
  assert.match(html, /\$1\.3M traded/);
  assert.match(html, /Pool liquidity is \$2,057/);
});

test("a refusal page refuses to be read as advice", () => {
  const html = refusalPage(row());
  assert.match(html, /door policy, not a verdict on the token/);
  assert.match(html, /not qualified to have one/);
  assert.match(html, /measurement at one moment/);
});

test("a probe page says nobody asked; a gate page does not", () => {
  assert.match(refusalPage(row({ source: "probe" })), /Nobody submitted this contract/);
  assert.doesNotMatch(refusalPage(row({ source: "gate" })), /Nobody submitted this contract/);
});

/* This test used to assert the opposite — that the page never printed
 * the mint — on the reasoning that a ledger should not hand anyone a
 * contract address to go buy.
 *
 * That was reversed on purpose. Withholding it stopped the good use and
 * not the bad one: a buyer finds the token on a chart site in seconds,
 * while nobody could check the finding was about the contract we said
 * it was. And a ticker is not an identity — one refused ticker returned
 * a dozen live tokens of the same name across four chains, so a refusal
 * published against a name alone is smeared over every project sharing
 * it.
 *
 * What survives from the old rule is the half that mattered: printed,
 * never linked. */
test("a refusal page identifies the contract it measured", () => {
  const html = refusalPage(row({ mint: MINT }));
  assert.ok(html.includes(MINT), "a refusal against a ticker alone accuses every token of that name");
});

test("the mint is printed, never linked", () => {
  const html = refusalPage(row({ mint: MINT }));
  assert.ok(!new RegExp(`href="[^"]*${MINT}`).test(html),
    "the ledger identifies a contract; it does not send anyone to it");
  assert.ok(!html.includes(`solscan`) && !html.includes("dexscreener"),
    "no chart or explorer link may ride along with a refusal");
});

test("a row with no mint recorded prints no address block at all", () => {
  const html = refusalPage(row({ mint: null }));
  assert.doesNotMatch(html, /The contract this page is about/,
    "an empty identity block is worse than none — it implies we had one");
});

test("a ticker cannot inject markup into its own page", () => {
  const html = refusalPage(row({ ticker: '<script>alert(1)</script>', slug: "x" }));
  assert.ok(!html.includes("<script>alert"), "a ticker got script into the page");
});

test("an unmeasured volume is absent, not zero", () => {
  const html = refusalPage(row({ vol24Usd: null }));
  assert.doesNotMatch(html, /traded in the previous 24 hours/);
  assert.doesNotMatch(html, /\$0 traded/);
});

test("withdrawn and never-published are different pages", () => {
  const gone = refusalGonePage("snipy");
  const missing = refusalMissingPage("snipy");
  assert.match(gone, /taken down/);
  assert.match(missing, /never written/);
  assert.notEqual(gone, missing);
  // Neither may be indexed: one is a tombstone, the other is nothing.
  assert.match(gone, /noindex/);
  assert.match(missing, /noindex/);
});

test("the sitemap carries the ledger, not just the front pages", () => {
  const xml = sitemap([row(), row({ slug: "moggo", ticker: "MOGGO" })]);
  assert.match(xml, /\/refused\/snipy</);
  assert.match(xml, /\/refused\/moggo</);
  assert.match(xml, /<lastmod>2026-08-26<\/lastmod>/);
  assert.match(xml, /\/terms</);
});

/* ---- the month ------------------------------------------------------ */

test("a month with nothing in it says so", () => {
  const d = monthlyDraft({ monthIndex: 7, year: 2026, checked: 40, refused: 0, sold: 0 });
  assert.match(d, /Nothing was turned away and nothing was sold/);
  assert.ok(d.length <= 280);
});

test("a month with something in it counts it", () => {
  const d = monthlyDraft({ monthIndex: 0, year: 2027, checked: 186, refused: 12, sold: 3, takeovers: 4 });
  assert.match(d, /January on the wall/);
  assert.match(d, /186 contracts checked/);
  assert.match(d, /12 refused and published/);
  assert.match(d, /3 seats sold of 24/);
  assert.ok(d.length <= 280);
});

test("one of a thing is not 'seats'", () => {
  const d = monthlyDraft({ monthIndex: 2, year: 2027, checked: 10, refused: 1, sold: 1, takeovers: 1 });
  assert.match(d, /1 seat sold/);
  assert.match(d, /1 seat changed hands/);
});

test("a check that could not run shows no facts at all", async () => {
  // The placeholder fact set is mint-authority-open, one wallet on 100%
  // of supply, zero liquidity. It exists to trip every rule, and a
  // visitor reading it in a table has no way to know that.
  const { publicFacts } = await import("../src/server.js");
  const { refusingFacts } = await import("../src/facts.js");
  const placeholder = publicFacts(refusingFacts({ gatherError: "rpc down" }));
  assert.equal(placeholder.mintAuthority, true, "the placeholder really is the alarming one");
  assert.equal(placeholder.topHolderPct, 100);
  // …which is exactly why the route must send null instead of it.
  const sent = { factsUnread: true, facts: refusingFacts({ gatherError: "rpc down" }) };
  assert.equal(sent.factsUnread ? null : publicFacts(sent.facts), null);
});

test("a month never publishes a count that contradicts itself", () => {
  // The audit log is capped and rotates. When it does not cover the month
  // it returns fewer checks than there were refusals — and "0 contracts
  // checked, 12 refused" is a visible lie in a post whose only asset is
  // that its numbers are right.
  const d = monthlyDraft({ monthIndex: 7, year: 2026, checked: 0, refused: 12, sold: 1 });
  assert.doesNotMatch(d, /contracts checked/);
  assert.match(d, /12 refused and published/);
  // …and it comes back the moment the number can carry its own weight.
  assert.match(monthlyDraft({ monthIndex: 7, year: 2026, checked: 40, refused: 12, sold: 1 }), /40 contracts checked/);
});

/* ------------------------------------------------------------------ *
 * CSP — la faute que rien ne signale.
 *
 * Les en-têtes du site imposent `script-src 'self'`. Un <script> en
 * ligne dans une page ne s'exécute donc jamais : le navigateur le refuse
 * en silence, le serveur répond 200, les tests passent, et la
 * fonctionnalité est simplement absente. C'est arrivé deux fois le même
 * jour — la lecture automatique du film, et le thème des pages rendues
 * côté serveur, livré cassé sans que rien ne le dise.
 *
 * Un seul type de script en ligne est permis : `application/ld+json`,
 * qui est une donnée et n'est jamais exécuté.
 * ------------------------------------------------------------------ */

import fsp from "node:fs";
import pathp from "node:path";

const INLINE = /<script(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>/gi;

test("aucune page statique ne contient de script en ligne", () => {
  const dir = new URL("../public/", import.meta.url).pathname;
  const bad = [];
  for (const f of fsp.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const html = fsp.readFileSync(pathp.join(dir, f), "utf8");
    const hits = html.match(INLINE);
    if (hits) bad.push(`${f}: ${hits.join(" ")}`);
  }
  assert.deepEqual(bad, [], "la CSP les refusera en silence");
});

test("aucune page rendue côté serveur ne contient de script en ligne", () => {
  const pages = [
    refusalPage(row()),
    refusalGonePage("x"),
    refusalMissingPage("x"),
  ];
  for (const html of pages) {
    const hits = html.match(INLINE);
    assert.equal(hits, null, `script en ligne : ${hits && hits.join(" ")}`);
  }
});

test("les pages rendues chargent bien le thème et le CSS", () => {
  const html = refusalPage(row());
  assert.match(html, /<script src="\/js\/theme\.js"><\/script>/);
  assert.match(html, /href="\/css\/app\.css"/);
  // Sans defer, et avant le corps : l'attribut doit exister au premier
  // rendu, sinon la page s'allume en clair puis bascule.
  assert.ok(html.indexOf("/js/theme.js") < html.indexOf("<body>"));
  assert.doesNotMatch(html, /theme\.js" defer/);
});

test("le JSON-LD reste autorisé — c'est une donnée, pas du code", () => {
  const html = refusalPage(row());
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.equal(html.match(INLINE), null);
});

test("le fichier de validation Search Console est présent et intact", () => {
  // Google révoque la propriété si ce fichier disparaît, et ne prévient
  // personne — le site sort de la Search Console en silence. Son contenu
  // doit correspondre exactement à son nom.
  const name = "googlebcc882ef153fa8c5.html";
  const file = new URL("../public/" + name, import.meta.url).pathname;
  const body = fsp.readFileSync(file, "utf8").trim();
  assert.equal(body, "google-site-verification: " + name);
});

test("la page des règles ne peut plus affirmer qu'il n'y a pas de token", () => {
  // Elle l'a affirmé pendant une journée après le lancement. Un site qui
  // contrôle des contrats survit à beaucoup de choses, pas à celle-là.
  const html = fsp.readFileSync(new URL("../public/rules.html", import.meta.url).pathname, "utf8");
  assert.doesNotMatch(html, /The Wall has no token/);
  assert.doesNotMatch(html, /There is no \$WALL/);
  assert.match(html, /There is a token\. We launched it\./);
  assert.match(html, /8nbF1nKD5uuVuMSZBGeRCGcihabcYvkvogq8QihVpump/);
  // L'adresse est écrite pour vérifier, jamais pour acheter : la page ne
  // devient pas un chemin vers pump.fun.
  assert.doesNotMatch(html, /href="https?:\/\/pump\.fun/);
});

/* ------------------------------------------------------------------ *
 * /seen — l'agrégat des nuits
 *
 * La règle unique de cette page : une statistique qui pourrait
 * identifier un projet n'est pas une statistique, c'est une accusation
 * dont on a limé le nom. Ces tests l'épinglent, parce que c'est le seul
 * endroit du site où l'on publie des mesures faites sur des contrats
 * qu'on a délibérément choisi de NE PAS nommer.
 * ------------------------------------------------------------------ */
describe("what the wall saw — counted, never named", () => {
  const round = () => ({
    at: "2026-08-27T05:00:00Z", seen: 85, priced: 70, droppedCount: 24,
    droppedWhy: { no_pool: 13, no_volume: 8 },
    checked: [
      { ticker: "PISSTACIO", mint: MINT, link: "https://pisstacio.lol", verdict: "refused",
        ruleIds: ["lp_thin"], lpUsd: 2300, vol24Usd: 1300000, ageHours: 13 },
      { ticker: "MARTIANS", mint: "MaRt1ans", verdict: "flagged",
        ruleIds: ["young", "lp_burn_only"], lpUsd: 121000, vol24Usd: 8000000, ageHours: 9 },
      { ticker: "GROKBOT", mint: "Gr0kb0t", verdict: "refused",
        ruleIds: ["mint_authority", "whale"], lpUsd: 5000, vol24Usd: 600000, ageHours: 40 },
    ],
  });
  const page = () => {
    const h = pushNight([], aggregate(round()));
    return seenPage({ last: h[0], history: h, totals: totals(h) });
  };

  test("no ticker, no mint, no link reaches the page", () => {
    const html = page();
    for (const secret of ["PISSTACIO", "MARTIANS", "GROKBOT", MINT, "MaRt1ans", "Gr0kb0t", "pisstacio.lol"]) {
      assert.ok(!html.includes(secret), `${secret} a fuité sur une page qui ne doit nommer personne`);
    }
  });

  test("findings and our own limits are counted in separate sections", () => {
    const html = page();
    assert.match(html, /What the checks found/);
    assert.match(html, /What we could not check/);
    assert.ok(html.indexOf("What the checks found") < html.indexOf("What we could not check"),
      "les constats d'abord, nos limites ensuite — jamais mélangés");
  });

  test("the aggregate counts every rule a contract carried", () => {
    const a = aggregate(round());
    assert.equal(a.checked, 3);
    assert.equal(a.findings.mint_authority, 1);
    assert.equal(a.findings.lp_thin, 1);
    assert.equal(a.findings.young, 1);
    assert.equal(a.verdicts.refused, 2);
    assert.equal(a.verdicts.flagged, 1);
  });

  test("re-running the round on the same day does not inflate the history", () => {
    const a = aggregate(round());
    let h = pushNight([], a);
    h = pushNight(h, { ...a, at: "2026-08-27T22:00:00Z" });
    assert.equal(h.length, 1, "deux rondes le même jour comptent pour une nuit");
    assert.equal(totals(h).checked, 3, "sinon le cumul compterait les contrats deux fois");
  });

  test("a night that measured nothing renders without inventing figures", () => {
    const html = seenPage({ last: null, history: [], totals: { nights: 0, checked: 0, findings: {}, ours: {}, verdicts: {} } });
    assert.match(html, /has not stored a night yet/);
    assert.doesNotMatch(html, /\b0 contracts read\b/);
  });
});

describe("le droit de réponse a le rang d'une section, pas d'une note", () => {
  /* La phrase existait, en gris pâle et en 13,5px, comme dernière ligne
   * de l'encadré « What this page does not say ». Sur une page qui nomme
   * un contrat et qui ressort dans Google sur son ticker, c'est la seule
   * voie de recours de la personne mesurée. Elle ne peut pas avoir le
   * rang typographique d'une mention légale. */
  const row = {
    ticker: "TEST", slug: "test", at: new Date().toISOString(),
    mint: "So11111111111111111111111111111111111111112",
    reasons: ["Mint authority is still open — the supply can be inflated at any time."],
    ruleIds: ["mint_authority"], source: "probe",
  };

  test("l'adresse de recours est joignable depuis la page", () => {
    assert.match(refusalPage(row), /mailto:contact@thewallsol\.com/);
  });

  test("elle a son propre titre de section", () => {
    const html = refusalPage(row);
    assert.match(html, /If we got this wrong/,
      "le recours n'a pas de titre : il est redevenu une note de bas de page");
    assert.match(html, /class="reply"/);
  });

  test("elle n'est plus la dernière ligne grise de l'encadré", () => {
    // pledge-last est le style de la note qui ferme une section. Le
    // recours ne doit plus y vivre.
    const html = refusalPage(row);
    const bloc = html.slice(html.indexOf("What this page does not say"), html.indexOf('class="reply"'));
    assert.ok(!/pledge-last/.test(bloc) || !/line on this page is wrong/.test(bloc),
      "le recours est retombé dans la note de pied de l'encadré");
  });

  test("la promesse tenue est celle que le code tient vraiment", () => {
    // « la page ne disparaît pas, elle dit qu'elle a été retirée » —
    // c'est refusalGonePage(), et un 410. Si cette page cessait de le
    // dire, la promesse deviendrait fausse.
    assert.match(refusalPage(row), /says it was withdrawn/);
    assert.match(refusalGonePage("test"), /taken down/i);
  });
});

describe("le canal de contact est joignable depuis les pages servies", () => {
  /* Le Telegram (@ThewallSol) et le compte X (@xTheWallx0) — l'ancien
   * second canal du droit de réponse — ont tous les deux été suspendus
   * (2026-09-01). Le droit de réponse d'un projet nommé publiquement ne
   * doit jamais dépendre d'un chemin mort : en attendant qu'un nouveau
   * canal officiel soit choisi, l'email reste le seul chemin promis, et
   * ces tests vérifient qu'aucune page ne propose plus le Telegram ou le
   * X suspendus à sa place. */
  const row = {
    ticker: "TEST", slug: "test", at: new Date().toISOString(),
    reasons: ["Mint authority is still open — the supply can be inflated at any time."],
    ruleIds: ["mint_authority"], source: "probe",
  };

  test("le pied de page mène au contact, jamais à un canal suspendu", () => {
    assert.match(refusalPage(row), /mailto:contact@thewallsol\.com/);
    assert.match(seenPage({ last: null, history: [] }), /mailto:contact@thewallsol\.com/);
    assert.doesNotMatch(refusalPage(row), /t\.me\/|x\.com\//, "un canal suspendu traîne encore dans le pied de page");
    assert.doesNotMatch(seenPage({ last: null, history: [] }), /t\.me\/|x\.com\//, "un canal suspendu traîne encore dans le pied de page");
  });

  test("le droit de réponse offre un canal vérifiable, jamais un canal mort", () => {
    const bloc = refusalPage(row).match(/class="reply"[\s\S]*?<\/div>/)[0];
    assert.match(bloc, /mailto:contact@thewallsol\.com/, "l'email a disparu du recours");
    assert.doesNotMatch(bloc, /t\.me\/|x\.com\//, "un canal suspendu est encore proposé dans le recours");
  });
});
