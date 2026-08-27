import "./_helpers.js";
import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CHECKS, PUBLIC_RPC } from "../src/checks.js";

/* ------------------------------------------------------------------ *
 * LES COMMANDES PUBLIÉES DOIVENT MARCHER
 *
 * /checks tient sur une seule promesse : la commande imprimée est
 * celle que nous faisons, et elle rend ce que la page dit qu'elle
 * rend. Une commande fausse est pire qu'une page absente — elle
 * renvoie quelqu'un vers un terminal avec une erreur de syntaxe et
 * notre nom dessus.
 *
 * Ce fichier vérifie deux choses différentes :
 *
 *   1. STRUCTURE — la commande appelle bien la méthode que notre
 *      propre code appelle, et lit le champ que notre propre code
 *      lit. C'est le test qui mord le jour où facts.js change de
 *      méthode et où personne ne pense à la page.
 *
 *   2. EXÉCUTION — les filtres jq tournent réellement, contre des
 *      réponses figées dont la forme est celle de la production, et
 *      sortent les champs annoncés. Sauté proprement si jq n'est pas
 *      installé : le réseau sortant ne joint ni le RPC ni DexScreener
 *      depuis le conteneur de build, alors la réponse est en fixture.
 * ------------------------------------------------------------------ */

const byId = Object.fromEntries(CHECKS.map((c) => [c.slug, c]));
const cmd = (slug) => byId[slug].verify.command;

const factsSrc = readFileSync("src/facts.js", "utf8");
const poolSrc = readFileSync("src/solana/pool.js", "utf8");

let hasJq = true;
try { execFileSync("jq", ["--version"], { stdio: "ignore" }); } catch { hasJq = false; }

/** Fait tourner un filtre jq contre une fixture, comme le lecteur le ferait. */
function jq(filter, fixture) {
  return execFileSync("jq", [filter, `test/fixtures/${fixture}`], { encoding: "utf8" });
}

describe("la commande appelle ce que notre code appelle", () => {
  test("mint et freeze lisent le compte de mint, comme facts.js", () => {
    for (const slug of ["mint-authority", "freeze-authority"]) {
      assert.match(cmd(slug), /getAccountInfo/);
      assert.match(cmd(slug), /jsonParsed/);
    }
    assert.match(factsSrc, /getAccountInfo.*jsonParsed/s,
      "facts.js n'appelle plus getAccountInfo — la page enseigne un appel mort");
    assert.match(cmd("mint-authority"), /mintAuthority/);
    assert.match(cmd("freeze-authority"), /freezeAuthority/);
    assert.match(factsSrc, /p\.mintAuthority/);
    assert.match(factsSrc, /p\.freezeAuthority/);
  });

  test("la concentration enseigne les deux appels que nous faisons", () => {
    const c = cmd("holder-concentration");
    assert.match(c, /getTokenLargestAccounts/);
    assert.match(c, /getMultipleAccounts/);
    assert.match(factsSrc, /getTokenLargestAccounts/);
    assert.match(factsSrc, /getMultipleAccounts/);
    assert.match(c, /parsed\.info\.owner/);
    assert.match(factsSrc, /parsed\?\.info\?\.owner/);
  });

  test("le verrou de liquidité pointe l'incinérateur que pool.js interroge", () => {
    const inc = (poolSrc.match(/const INCINERATOR = "([^"]+)"/) || [])[1];
    assert.ok(inc, "pool.js n'expose plus d'adresse d'incinérateur");
    assert.ok(byId["liquidity-lock"].what.join(" ").includes(inc),
      "la page imprime une autre adresse que celle que le code interroge");
    // Et les launchpads cités doivent être ceux du code.
    for (const dex of ["pumpswap", "pumpfun", "moonshot"]) {
      assert.ok(poolSrc.includes(`"${dex}"`), `${dex} n'est plus un burn de protocole`);
      assert.ok(cmd("liquidity-lock").includes(dex) ||
                byId["liquidity-lock"].verify.reading.some(([k]) => k.includes(dex)),
        `${dex} n'est plus cité sur la page`);
    }
  });

  test("profondeur et âge lisent la même réponse que pool.js", () => {
    const host = (poolSrc.match(/const DEXSCREENER = "https:\/\/([^/"]+)/) || [])[1];
    assert.ok(host, "pool.js n'expose plus d'endpoint marché");
    for (const slug of ["pool-depth", "pair-age", "liquidity-lock"]) {
      assert.ok(cmd(slug).includes(host), `/checks/${slug} enseigne un autre hôte que le nôtre`);
    }
    assert.match(cmd("pair-age"), /pairCreatedAt/);
    assert.match(poolSrc, /pairCreatedAt/);
    assert.match(cmd("pool-depth"), /liquidity\.usd/);
    assert.match(poolSrc, /liquidity\?\.usd/);
  });

  test("l'endpoint public annoncé est le seul cité dans les commandes RPC", () => {
    for (const c of CHECKS) {
      for (const m of c.verify.command.matchAll(/https:\/\/[a-z0-9.-]+/g)) {
        const ok = m[0] === PUBLIC_RPC
          || m[0].includes("dexscreener")
          || m[0] === "https://EXAMPLE";
        assert.ok(ok, `${c.slug} cite un hôte inattendu : ${m[0]}`);
      }
    }
  });
});

describe("les filtres jq tournent vraiment", { skip: hasJq ? false : "jq absent" }, () => {
  test("profondeur : le pool solana le plus profond, pas le premier venu", () => {
    const out = JSON.parse(jq(`[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {dexId, liquidity: .liquidity.usd, volume24h: .volume.h24, fdv}`,
      "dexscreener-token.json"));
    assert.equal(out.dexId, "pumpswap");
    assert.equal(out.liquidity, 41234.5);      // et non les 999999 de la paire base
    assert.equal(out.volume24h, 118000);
    assert.ok(out.fdv > 0);
  });

  test("verrou : la paire et son AMM", () => {
    const out = JSON.parse(jq(`[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {dexId, pair: .pairAddress, liquidity: .liquidity.usd}`,
      "dexscreener-token.json"));
    assert.equal(out.pair, "PAIR1");
    assert.equal(out.dexId, "pumpswap");
  });

  test("âge : une date lisible et des heures entières", () => {
    const out = JSON.parse(jq(`[.pairs[] | select(.chainId=="solana")]
        | max_by(.liquidity.usd)
        | {created: (.pairCreatedAt/1000 | todate),
           hours: ((now - .pairCreatedAt/1000) / 3600 | floor)}`,
      "dexscreener-token.json"));
    assert.match(out.created, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof out.hours, "number");
    assert.ok(Number.isInteger(out.hours), "des heures à virgule sur une page de référence");
  });

  test("concentration : les comptes, puis leurs propriétaires", () => {
    const accounts = jq(`.result.value[] | {address, amount: .uiAmountString}`,
      "rpc-largest-accounts.json");
    assert.match(accounts, /"address": "ACC1"/);
    const owners = jq(`.result.value[].data.parsed.info.owner`, "rpc-multiple-accounts.json");
    assert.match(owners, /"OWNER1"/);
  });

  test("mint et freeze : le grep imprimé sort la bonne ligne", () => {
    // Le grep de la page, appliqué à une réponse de la forme de la prod.
    const body = readFileSync("test/fixtures/rpc-mint-account.json", "utf8");
    assert.equal((body.match(/"mintAuthority":[^,]*/) || [])[0], '"mintAuthority":null');
    assert.equal((body.match(/"freezeAuthority":[^,]*/) || [])[0], '"freezeAuthority":null');
  });
});
