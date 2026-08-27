import "./_helpers.js";
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { CHECKS, RULE_TO_CHECK, CHECK_BY_SLUG } from "../src/checks.js";
import { HARD_RULES, SOFT_RULES, UNRESOLVED_RULES, UNVERIFIABLE_RULES } from "../src/agents/screener.js";
import { NOT_ABOUT_THEM } from "../src/agents/scout.js";
import { checkPage, checksIndexPage, refusalPage, sitemap } from "../src/pages.js";
import { config } from "../src/config.js";

/* ------------------------------------------------------------------ *
 * LES PAGES DE CONTRÔLE
 *
 * Ces pages ont deux façons de mentir, et les deux sont pires que de
 * ne pas exister :
 *
 *   1. dériver du screener — publier un seuil que le code n'applique
 *      plus, ou expliquer une règle qui a disparu ;
 *   2. renvoyer un constat vers la mauvaise explication.
 *
 * Le maillage est la seule raison d'être de ces pages : un constat
 * publié doit pointer vers le contrôle qui l'a produit. Un lien vers
 * la mauvaise page est pire que pas de lien du tout.
 * ------------------------------------------------------------------ */

const ALL_RULES = [...HARD_RULES, ...SOFT_RULES, ...UNRESOLVED_RULES, ...UNVERIFIABLE_RULES];
const RULE_IDS = new Set(ALL_RULES.map((r) => r.id));

describe("la table de contrôles ne dérive pas du screener", () => {
  test("chaque ruleId cité existe vraiment dans le screener", () => {
    for (const [id, slug] of Object.entries(RULE_TO_CHECK)) {
      assert.ok(RULE_IDS.has(id),
        `/checks/${slug} explique "${id}", qui n'est plus une règle du screener`);
    }
  });

  test("chaque règle publiable a une page qui l'explique", () => {
    // Une règle qui peut apparaître sur une page de refus publique et
    // qui ne renvoie nulle part laisse le lecteur avec une phrase et
    // aucun moyen de la vérifier.
    for (const r of [...HARD_RULES, ...SOFT_RULES]) {
      if (NOT_ABOUT_THEM.has(r.id)) continue;   // ticker_taken : sur nous, pas sur eux
      assert.ok(RULE_TO_CHECK[r.id], `la règle "${r.id}" n'a aucune page de contrôle`);
    }
  });

  test("aucun contrôle ne réclame deux fois la même règle", () => {
    const seen = new Set();
    for (const c of CHECKS) for (const id of c.ruleIds) {
      assert.ok(!seen.has(id), `"${id}" est expliqué par deux pages`);
      seen.add(id);
    }
  });

  test("les slugs sont uniques et propres pour une URL", () => {
    const slugs = CHECKS.map((c) => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
  });
});

describe("chaque page se construit entièrement", () => {
  for (const c of CHECKS) {
    test(`/checks/${c.slug}`, () => {
      const html = checkPage(c.slug);
      assert.ok(html && html.length > 2000, "page vide ou tronquée");
      assert.match(html, /<h1>/);
      assert.ok(html.includes(`/checks/${c.slug}`), "canonique absente");
      assert.match(html, /class="cmd"/, "aucune commande à reproduire");
      // La restriction, sur chaque page, sans exception.
      assert.match(html, /does not establish/i);
      assert.ok(html.includes("not qualified to have one"),
        "la page ne dit pas qu'elle n'est pas une notation");
      // Rien de non substitué.
      assert.ok(!html.includes("undefined"), "un champ manquant est rendu tel quel");
      assert.ok(!html.includes("${"), "un gabarit n'a pas été substitué");
    });
  }

  test("un slug inconnu ne construit rien", () => {
    assert.equal(checkPage("mint-authorityy"), null);
    assert.equal(checkPage("../../etc/passwd"), null);
    assert.equal(checkPage(""), null);
  });

  test("l'index cite les sept pages", () => {
    const html = checksIndexPage();
    for (const c of CHECKS) assert.ok(html.includes(`/checks/${c.slug}`), c.slug);
  });
});

describe("les seuils sont lus dans config, jamais écrits dans la prose", () => {
  test("la page profondeur imprime le plancher courant", () => {
    const html = checkPage("pool-depth");
    assert.ok(html.includes(config.minLpUsd.toLocaleString("en-US")),
      "le plancher affiché n'est pas celui du code");
    assert.ok(html.includes(config.flagLpUsd.toLocaleString("en-US")));
  });

  test("la page concentration imprime le plafond courant", () => {
    const html = checkPage("holder-concentration");
    assert.ok(html.includes(String(config.maxTopHolderPct)));
    assert.ok(html.includes(String(config.flagTopHolderPct)));
  });

  test("aucune page n'écrit un seuil en dur dans son texte", async () => {
    // Le texte vit dans checks.js ; les chiffres vivent dans config.
    // Si un seuil apparaît dans la prose, il sera faux le jour où
    // quelqu'un change une variable d'environnement.
    const src = await import("node:fs").then((fs) => fs.readFileSync("src/checks.js", "utf8"));
    for (const n of ["2,500", "$2500", "15,000", "$15000", "40%", "25%", "24 hours"]) {
      assert.ok(!src.includes(n), `checks.js écrit le seuil "${n}" en dur`);
    }
  });
});

describe("le maillage : un constat renvoie au contrôle qui l'a produit", () => {
  const row = {
    ticker: "TEST", slug: "test", at: new Date().toISOString(),
    mint: "So11111111111111111111111111111111111111112",
    reasons: ["Mint authority is still open — the supply can be inflated at any time.",
              "Pool liquidity is $900, under the $2,500 floor."],
    ruleIds: ["mint_authority", "lp_thin"],
    source: "probe",
  };

  test("chaque constat porte le lien de sa propre règle", () => {
    const html = refusalPage(row);
    assert.ok(html.includes("/checks/mint-authority"), "le constat mint ne renvoie nulle part");
    assert.ok(html.includes("/checks/pool-depth"), "le constat profondeur ne renvoie nulle part");
  });

  test("des listes désalignées ne produisent AUCUN lien", () => {
    // Un constat qui pointe vers la mauvaise explication est pire que
    // pas de lien : il fait dire à la page une chose qui n'a pas été
    // mesurée. Les lignes anciennes, écrites avant ruleIds, tombent ici.
    const html = refusalPage({ ...row, ruleIds: ["mint_authority"] });
    assert.ok(!html.includes("/checks/mint-authority"),
      "un lien a été posé alors que l'appariement n'était pas certain");
    const sans = refusalPage({ ...row, ruleIds: undefined });
    assert.ok(!sans.includes("/checks/"), "une ligne sans ruleIds a reçu un lien");
  });

  test("une règle sans page ne fabrique pas d'URL", () => {
    const html = refusalPage({
      ...row, reasons: ["$TEST is already on the wall."], ruleIds: ["ticker_taken"],
    });
    assert.ok(!html.includes("/checks/undefined"), "URL fabriquée depuis une règle sans page");
    assert.ok(!html.includes("/checks/"), "ticker_taken n'a rien à expliquer au public");
  });
});

describe("le sitemap", () => {
  test("liste l'index et les sept pages", () => {
    const xml = sitemap([]);
    assert.match(xml, /\/checks<\/loc>/);
    for (const c of CHECKS) {
      assert.ok(xml.includes(`/checks/${c.slug}</loc>`), `${c.slug} absent du sitemap`);
    }
  });
});
