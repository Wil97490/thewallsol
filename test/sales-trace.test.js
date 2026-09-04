import "./_helpers.js";
import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { config, salesGaps } from "../src/config.js";
import { recordSeatAward } from "../src/sales.js";
import { recentAudit, _resetMemory } from "../src/storage.js";

/* ------------------------------------------------------------------ *
 * LA TRACE, POUR DE VRAI
 *
 * Reproche de la revue SPEC-017, et il était fondé : les tests
 * prouvaient les fonctions de calcul (`salesGaps`, `salesPreconditions`)
 * et pas le chemin. Personne n'avait jamais exécuté « paiement confirmé
 * → ligne sold_with_gaps réellement écrite → visibilité dans
 * /api/admin/ops ». C'était affirmé en lisant le code, ce qui n'est pas
 * une mesure — exactement la faute que ce site interdit ailleurs.
 *
 * Ce fichier exécute le chemin. `recordSeatAward` est la fonction que
 * le serveur appelle après `verifyPayment`, sans doublure ni
 * réimplémentation, et les assertions relisent le vrai journal d'audit.
 * Le point 3 démarre en plus un vrai serveur et frappe la vraie URL.
 * ------------------------------------------------------------------ */

const GAPPY = {
  name: "The Wall", legalForm: "", siren: "", director: "",
  address: "", addressOnRequest: false, vat: "",
  host: "Google Cloud EMEA Limited, Dublin, Ireland",
  contact: "contact@thewallsol.com",
};
const COMPLETE = {
  ...GAPPY, legalForm: "Entreprise individuelle (micro-entreprise)",
  siren: "552100554", addressOnRequest: true,
};

const withPublisher = async (over, fn) => {
  const saved = { ...config.publisher };
  Object.assign(config.publisher, over);
  try { return await fn(); } finally { Object.assign(config.publisher, saved); }
};

const ORDER = {
  id: "ord-1", seatNo: 7, ticker: "TEST", priceUsd: 120,
  amountSol: 0.61, contact: "buyer@example.com",
};
const CHECK = { signature: "5xSigNature", method: "transfer" };

const find = (rows, action) => rows.filter((r) => r.action === action);

/* ---- 1. le chemin écrit bien la trace ------------------------------ */

describe("un siège vendu avec des manques", () => {
  test("écrit sold_with_gaps avec la liste du moment", async () => {
    await _resetMemory();
    await withPublisher(GAPPY, async () => {
      const out = await recordSeatAward(ORDER, CHECK);
      assert.ok(out.gaps.length > 0, "il devait y avoir des manques");

      const rows = await recentAudit(50);
      const awarded = find(rows, "seat_awarded");
      const gapLines = find(rows, "sold_with_gaps");

      assert.equal(awarded.length, 1, "le siège doit être enregistré comme attribué");
      assert.equal(gapLines.length, 1, "la vente avec manques doit laisser exactement une ligne");

      const row = gapLines[0];
      assert.equal(row.seatNo, 7);
      assert.equal(row.ticker, "TEST");
      assert.equal(row.id, "ord-1");
      assert.ok(Array.isArray(row.gaps) && row.gaps.length > 0);
      assert.match(row.gaps.join(" "), /PUBLISHER_SIREN/);
      assert.match(row.gaps.join(" "), /PUBLISHER_LEGAL_FORM/);
    });
  });

  test("l'attribution est enregistrée avant la note sur les conditions", async () => {
    await _resetMemory();
    await withPublisher(GAPPY, async () => {
      await recordSeatAward(ORDER, CHECK);
      /* recentAudit rend le plus récent en premier : la note doit donc
       * précéder l'attribution dans la liste renvoyée. Le fait d'abord,
       * le commentaire sur le fait ensuite. */
      const rows = await recentAudit(50).then((r) => r.map((x) => x.action));
      assert.ok(rows.indexOf("sold_with_gaps") < rows.indexOf("seat_awarded"));
    });
  });

  test("sans aucun manque, aucune ligne sold_with_gaps n'est écrite", async () => {
    await _resetMemory();
    const savedMail = { ...config.mail };
    Object.assign(config.mail, { key: "re_k", from: "The Wall <a@b.co>" });
    try {
      await withPublisher(COMPLETE, async () => {
        assert.deepEqual(salesGaps(), [], "préalable du test : plus rien ne doit manquer");
        await recordSeatAward(ORDER, CHECK);
        const rows = await recentAudit(50);
        assert.equal(find(rows, "seat_awarded").length, 1);
        assert.equal(find(rows, "sold_with_gaps").length, 0);
      });
    } finally { Object.assign(config.mail, savedMail); }
  });

  test("ne lève jamais, même sans contact ni signature", async () => {
    await _resetMemory();
    await withPublisher(GAPPY, async () => {
      const out = await recordSeatAward({ seatNo: 3 }, {});
      assert.equal(out.receipt.sent, false);
      assert.equal(find(await recentAudit(50), "seat_awarded").length, 1);
    });
  });
});

/* ---- 2. état courant et trace historique sont deux faits ----------- */

describe("l'histoire ne se réécrit pas quand la configuration change", () => {
  test("compléter l'identité après coup ne nettoie pas la trace", async () => {
    await _resetMemory();

    // Le jour de la vente : il manquait des choses.
    await withPublisher(GAPPY, async () => { await recordSeatAward(ORDER, CHECK); });

    // Plus tard : l'identité est complétée.
    await withPublisher(COMPLETE, async () => {
      const savedMail = { ...config.mail };
      Object.assign(config.mail, { key: "re_k", from: "The Wall <a@b.co>" });
      try {
        assert.deepEqual(salesGaps(), [], "l'état courant est désormais propre");

        const row = find(await recentAudit(50), "sold_with_gaps")[0];
        assert.ok(row, "la trace de la vente passée doit subsister");
        assert.match(row.gaps.join(" "), /PUBLISHER_SIREN/,
          "elle doit encore porter ce qui manquait CE JOUR-LÀ");
      } finally { Object.assign(config.mail, savedMail); }
    });
  });
});

/* ---- 3. la visibilité, sur la vraie URL ---------------------------- */

describe("/api/admin/ops expose l'état courant", () => {
  const PORT = 8479;
  const TOKEN = "test-admin-token-0123456789";
  let child;

  const boot = (env) => new Promise((resolve, reject) => {
    child = spawn(process.execPath, ["src/server.js"], {
      env: { ...process.env, NODE_ENV: "development", STORAGE_BACKEND: "memory",
             PORT: String(PORT), ADMIN_TOKEN: TOKEN,
             PUBLIC_BASE_URL: `http://127.0.0.1:${PORT}`, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const deadline = Date.now() + 20000;
    (async function poll() {
      for (;;) {
        try { await fetch(`http://127.0.0.1:${PORT}/health`); return resolve(); }
        catch {
          if (Date.now() > deadline) return reject(new Error("le serveur n'a pas démarré"));
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    })();
  });
  const stop = () => { if (child) { child.kill("SIGKILL"); child = null; } };
  const ops = () => fetch(`http://127.0.0.1:${PORT}/api/admin/ops`,
    { headers: { authorization: `Bearer ${TOKEN}` } }).then((r) => r.json());

  after(stop);

  test("identité incomplète : les manques sont listés, et la vente reste ouverte", async () => {
    await boot({ PUBLISHER_SIREN: "", PUBLISHER_LEGAL_FORM: "" });
    try {
      const j = await ops();
      assert.ok(Array.isArray(j.sales.gaps), "sales.gaps doit être exposé");
      assert.ok(j.sales.gaps.length > 0, "les manques doivent être visibles");
      assert.match(j.sales.gaps.join(" "), /PUBLISHER_SIREN/);

      // La politique choisie par l'opérateur, vérifiée sur la vraie URL.
      assert.equal(j.sales.requirePublisher, false, "le défaut doit rester permissif");
      assert.equal(j.sales.open, true, "la vente ne doit pas être fermée");
      assert.deepEqual(j.sales.blocking, [], "rien ne doit bloquer");

      // Et aucun secret ne fuit au passage.
      assert.equal(JSON.stringify(j.mail).includes("re_"), false);
    } finally { stop(); }
  });

  test("SALES_REQUIRE_PUBLISHER=true ferme bien la caisse, sur la vraie URL", async () => {
    await boot({ PUBLISHER_SIREN: "", SALES_REQUIRE_PUBLISHER: "true" });
    try {
      const j = await ops();
      assert.equal(j.sales.requirePublisher, true);
      assert.equal(j.sales.open, false);
      assert.ok(j.sales.blocking.length > 0);

      const r = await fetch(`http://127.0.0.1:${PORT}/api/checkout`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: "TEST", mint: "So11111111111111111111111111111111111111112",
                               pitch: "x", link: "https://example.com", seatNo: 1, amountUsd: 50 }),
      });
      assert.equal(r.status, 503);
      const body = await r.json();
      assert.equal(body.salesClosed, true);
      assert.match(body.reason, /about us, not about your contract/);
    } finally { stop(); }
  });

  test("identité complète : plus aucun manque listé", async () => {
    await boot({
      PUBLISHER_SIREN: "552100554",
      PUBLISHER_LEGAL_FORM: "Entreprise individuelle (micro-entreprise)",
      PUBLISHER_ADDRESS_ON_REQUEST: "true",
      RESEND_API_KEY: "re_test_key", MAIL_FROM: "The Wall <contact@thewallsol.com>",
    });
    try {
      const j = await ops();
      assert.deepEqual(j.sales.gaps, []);
      assert.equal(j.sales.open, true);
      assert.equal(j.mail.configured, true);
      assert.equal(JSON.stringify(j).includes("re_test_key"), false, "la clé ne doit jamais sortir");
    } finally { stop(); }
  });
});
