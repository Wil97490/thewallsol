import "./_helpers.js";
import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

/* ------------------------------------------------------------------ *
 * LES ROUTES, POUR DE VRAI
 *
 * /seen a été livré en production avec un import manquant. Il rendait
 * un 503 sur chaque visite, et TOUS les tests passaient — parce qu'ils
 * appelaient seenPage() directement, jamais le serveur. On testait la
 * page, pas le chemin qui y mène.
 *
 * Ce fichier démarre le vrai serveur et frappe les vraies URL. C'est
 * le seul endroit du dépôt qui vérifie qu'une page est ATTEIGNABLE, et
 * pas seulement qu'elle sait se fabriquer.
 * ------------------------------------------------------------------ */

const PORT = 8477;
let child;

before(async () => {
  child = spawn(process.execPath, ["src/server.js"], {
    /* NODE_ENV doit sortir de "test" : le serveur n'appelle listen()
     * que si isTest est faux, et _helpers.js met NODE_ENV=test dans
     * l'environnement dont ce fils hérite. C'est précisément ce qui a
     * fait que ce fichier a mis quinze secondes à ne rien tester. */
    env: { ...process.env, NODE_ENV: "development", STORAGE_BACKEND: "memory",
           AGENTS_ENABLED: "true", PORT: String(PORT),
           PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let boot = "";
  child.stdout.on("data", (d) => { boot += d; });
  child.stderr.on("data", (d) => { boot += d; });
  const deadline = Date.now() + 20000;
  for (;;) {
    try { await fetch(`http://127.0.0.1:${PORT}/health`); break; }
    catch { if (Date.now() > deadline) throw new Error("le serveur n'a pas démarré"); 
            await new Promise((r) => setTimeout(r, 200)); }
  }
});

after(() => { if (child) child.kill("SIGKILL"); });

describe("every public page answers", () => {
  const pages = [
    ["/", /Twenty-four seats|seats/i],
    ["/rules", /Hard rules/],
    ["/refused", /refused|ledger/i],
    ["/seen", /What the wall|has not stored a night yet/],
    ["/checks", /Run our checks yourself|how to run them/i],
    ["/checks/mint-authority", /mintAuthority/],
    ["/checks/freeze-authority", /freezeAuthority/],
    ["/checks/liquidity-lock", /1nc1nerator/],
    ["/checks/holder-concentration", /getTokenLargestAccounts/],
    ["/checks/pool-depth", /dexscreener/i],
    ["/checks/pair-age", /pairCreatedAt/],
    ["/checks/destination-link", /curl -sI/],
    ["/terms", /terms|conditions/i],
    ["/sitemap.xml", /<urlset/],
    ["/robots.txt", /User-agent/i],
  ];
  for (const [path, marker] of pages) {
    test(`GET ${path} renders`, async () => {
      const r = await fetch(`http://127.0.0.1:${PORT}${path}`);
      assert.equal(r.status, 200, `${path} a répondu ${r.status}`);
      const body = await r.text();
      assert.match(body, marker, `${path} a répondu 200 mais sans son contenu`);
    });
  }

  test("a crashed route is never mistaken for a working one", async () => {
    // Le 503 du gestionnaire de crash porte ce corps. Aucune page
    // publique ne doit jamais le renvoyer.
    for (const [path] of pages) {
      const body = await fetch(`http://127.0.0.1:${PORT}${path}`).then((r) => r.text());
      assert.ok(!body.includes("Checks unavailable"),
        `${path} rend la réponse d'un gate en panne`);
    }
  });

  test("/sitemap.xml lists /seen", async () => {
    const xml = await fetch(`http://127.0.0.1:${PORT}/sitemap.xml`).then((r) => r.text());
    assert.match(xml, /\/seen<\/loc>/, "une page absente du sitemap n'existe pas pour un moteur");
  });

  test("/sitemap.xml liste les pages de contrôle", async () => {
    const xml = await fetch(`http://127.0.0.1:${PORT}/sitemap.xml`).then((r) => r.text());
    for (const slug of ["mint-authority", "freeze-authority", "liquidity-lock",
                        "holder-concentration", "pool-depth", "pair-age", "destination-link"]) {
      assert.ok(xml.includes(`/checks/${slug}</loc>`), `${slug} absent du sitemap`);
    }
  });

  test("un contrôle inexistant renvoie 404, pas une page inventée", async () => {
    const r = await fetch(`http://127.0.0.1:${PORT}/checks/pas-un-controle`);
    assert.equal(r.status, 404);
    const body = await r.text();
    assert.ok(!body.includes("Checks unavailable"), "un gate en panne rendu comme une page");
    assert.match(body, /run/i, "le 404 devrait au moins montrer la liste des contrôles");
  });

  test("aucune page ne sert de champ à trous", async () => {
    /* /terms a publié pendant des jours, sous le titre « Who publishes
     * this site », trois lignes « [to be completed] ». Un champ vide
     * AFFICHÉ est pire qu'un champ absent : il annonce que la page
     * n'est pas finie à la personne qui hésite à envoyer de l'argent.
     *
     * Les commentaires HTML sont retirés avant le contrôle : la note
     * qui explique pourquoi ces champs ont disparu cite forcément le
     * marqueur, et le lecteur ne la voit jamais. */
    for (const path of ["/", "/rules", "/refused", "/seen", "/terms", "/checks"]) {
      const brut = await fetch(`http://127.0.0.1:${PORT}${path}`).then((r) => r.text());
      const vu = brut.replace(/<!--[\s\S]*?-->/g, "");
      for (const trou of ["to be completed", "TODO", "[name or company", "lorem ipsum"]) {
        assert.ok(!vu.toLowerCase().includes(trou.toLowerCase()),
          `${path} affiche « ${trou} » à un visiteur`);
      }
    }
  });

  test("le verrou de l'équipe est vérifiable depuis la page", async () => {
    /* La page annonçait 9,39 % détenus par l'équipe et « if we sell, it
     * will be written here » — une promesse qui ne tenait que par la
     * bonne foi de son auteur. Elle porte maintenant un contrat.
     *
     * Ce qui est testé n'est pas le texte : c'est qu'un lecteur puisse
     * aller vérifier sans nous. Un verrou dont l'adresse n'est pas
     * publiée est un verrou qui n'existe que sur le papier — exactement
     * le reproche que ce site adresse aux autres. */
    const html = await fetch(`http://127.0.0.1:${PORT}/rules`).then((r) => r.text());
    assert.match(html, /683JjcRcEwzEDzutGZhoqp1xkgUmd9Zy1J9R29SdtryJ/,
      "l'adresse du contrat de verrouillage n'est pas publiée");
    assert.match(html, /4wFzqzNRpycJnkDZdQMhfsCQvTdhPWsdK8JLyGjgcVpF/,
      "le portefeuille équipe n'est pas publié — le chiffre reste invérifiable");
    assert.match(html, /28 November 2026/, "la date de déblocage n'est pas dite");
    assert.match(html, /neither be canceled nor transferred/,
      "la page ne cite plus la garantie de non-annulabilité");
  });

  test("l'accueil ne dit pas moins que ce qui est vrai du token", async () => {
    /* La ligne de l'accueil disait « the team holds some of it ». Vrai,
     * et incomplet depuis que la part est verrouillée — or c'est la
     * seule phrase sur le token que lit un visiteur qui n'ira jamais
     * jusqu'à /rules. Une divulgation partielle sur la page la plus vue
     * ne vaut pas mieux qu'une divulgation enterrée. */
    const html = await fetch(`http://127.0.0.1:${PORT}/`).then((r) => r.text());
    assert.match(html, /9\.39%/, "l'accueil ne chiffre plus la part de l'équipe");
    assert.match(html, /locked until 28 November 2026/, "l'accueil ne mentionne pas le verrou");
  });

  test("les mentions légales nomment un éditeur", async () => {
    const html = await fetch(`http://127.0.0.1:${PORT}/terms`).then((r) => r.text());
    const vu = html.replace(/<!--[\s\S]*?-->/g, "");
    assert.match(vu, /Publisher:<\/strong>\s*The Wall/,
      "la page dit qui publie, ou elle ne le dit pas — elle ne le laisse pas en blanc");
  });

  test("le pied de page mène aux contrôles depuis chaque page servie", async () => {
    // Le maillage ne sert à rien si un moteur ne trouve jamais l'entrée.
    for (const path of ["/", "/rules", "/refused", "/seen", "/terms"]) {
      const body = await fetch(`http://127.0.0.1:${PORT}${path}`).then((r) => r.text());
      assert.ok(body.includes('href="/checks'), `${path} ne mène pas aux contrôles`);
    }
  });
});
