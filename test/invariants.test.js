/* ------------------------------------------------------------------ *
 * LES INVARIANTS V4.54
 *
 * Ce fichier ne teste pas un comportement : il empêche un changement
 * silencieux. Chaque valeur figée ici est déjà canonique quelque part
 * dans le dépôt — deploy.env, ou le défaut dans src/config.js. Rien
 * n'est inventé, et rien de 🟡 PROPOSED n'est figé.
 *
 * Deux familles, et la distinction est importante :
 *
 *   1. Les VALEURS canoniques. Elles se lisent dans les fichiers, en
 *      texte. Surtout pas via `config` : test/_helpers.js remplace
 *      délibérément les réglages économiques par des valeurs de test
 *      (SEAT_COUNT=6, SEAT_FLOOR_USD=50) pour que la barrière de
 *      release ne dépende jamais de la production. Lire `config` ici
 *      testerait 6 au lieu de 24, et ne prouverait rien.
 *
 *   2. Les GARANTIES de forme. Elles se testent à l'exécution, et
 *      restent vraies quels que soient les paramètres.
 *
 * Pour changer une valeur figée ici : il faut une SPEC qui la nomme.
 * ------------------------------------------------------------------ */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./_helpers.js";
import { _resetMemory, getSeat } from "../src/storage.js";
import * as wall from "../src/wall.js";
import { config } from "../src/config.js";

const deployEnv = readFileSync("deploy.env", "utf8");
const configSrc = readFileSync("src/config.js", "utf8");

const fromDeployEnv = (key) => {
  const m = deployEnv.match(new RegExp(`^export ${key}=(\\S+)`, "m"));
  assert.ok(m, `${key} absent de deploy.env`);
  return m[1];
};
const defaultInConfig = (key) => {
  const m = configSrc.match(new RegExp(`num\\(process\\.env\\.${key},\\s*([0-9.]+)\\)`));
  assert.ok(m, `${key} n'a pas de défaut dans src/config.js`);
  return m[1];
};

/* Valeur canonique, telle qu'elle est écrite dans deploy.env. */
const CANONICAL = {
  SEAT_COUNT: "24",
  SEAT_FLOOR_USD: "15",
  MIN_INCREMENT_PCT: "0.10",
  MIN_INCREMENT_USD: "5",
  MAX_BID_USD: "100000",
  SEAT_HOLD_MINUTES: "5",
  SEAT_PROTECT_MINUTES: "30",
};

describe("invariants V4.54 — valeurs canoniques", () => {
  for (const [key, expected] of Object.entries(CANONICAL)) {
    test(`${key} vaut ${expected} dans deploy.env`, () => {
      assert.equal(fromDeployEnv(key), expected);
    });
  }

  test("le défaut du code et deploy.env ne divergent jamais", () => {
    for (const key of Object.keys(CANONICAL)) {
      assert.equal(
        Number(defaultInConfig(key)), Number(fromDeployEnv(key)),
        `${key} : le défaut de src/config.js et deploy.env ont divergé`
      );
    }
  });
});

describe("invariants V4.54 — garanties de forme", () => {
  beforeEach(async () => { _resetMemory(); await wall.ensureSeats(); });

  test("un siège vide coûte le plancher", async () => {
    assert.equal(wall.minimumBid(await getSeat(1)), config.seatFloorUsd);
  });

  /* Vérifié par propriétés, pas en recalculant la formule. Recalculer
   * la reproduirait bug compris : la première version de ce test faisait
   * `price * 1.10` en flottant et exigeait 111 $ pour battre 100 $, donc
   * accusait le code d'avoir tort. Les propriétés, elles, ne mentent pas. */
  test("la reprise domine les trois termes, jamais moins", async () => {
    for (const price of [1, 7, 20, 100, 999, 12345]) {
      const seat = { occupant: { ticker: "X" }, priceUsd: price };
      const got = wall.minimumBid(seat);
      assert.ok(got >= price + config.minIncrementUsd, `prix ${price} : sous le +$ fixe`);
      assert.ok(got * 100 >= Math.round(price * 100 * (1 + config.minIncrementPct)) - 1, `prix ${price} : sous le +%`);
      assert.ok(got >= config.seatFloorUsd, `prix ${price} : sous le plancher`);
      assert.equal(got, Math.ceil(got), `prix ${price} : la mise minimale doit être un entier de dollars`);
    }
  });

  /* 100 * 1.10 vaut 110.00000000000001 en flottant. Arrondi vers le haut,
   * cela demande 111 $ pour battre 100 $. C'est un dollar volé au premier
   * acheteur venu, invisible en lecture de code. */
  test("l'argent est en centimes entiers, pas en flottants", () => {
    const seat = { occupant: { ticker: "X" }, priceUsd: 100 };
    assert.equal(wall.minimumBid(seat), 110);
    assert.notEqual(wall.minimumBid(seat), 111);
  });

  test("un siège occupé ne descend jamais sous le plancher", async () => {
    const seat = { occupant: { ticker: "X" }, priceUsd: 0.01 };
    assert.ok(wall.minimumBid(seat) >= config.seatFloorUsd);
  });

  test("le plafond refuse au-dessus de MAX_BID_USD", async () => {
    const seat = await getSeat(1);
    assert.equal(wall.checkBid(seat, config.maxBidUsd).ok, true);
    assert.equal(wall.checkBid(seat, config.maxBidUsd + 0.01).ok, false);
  });

  test("le mur compte exactement SEAT_COUNT sièges", async () => {
    const seats = await wall.ensureSeats();
    assert.equal(seats.length, config.seatCount);
  });

  /* 🟢 VALIDÉ, Master §7.2 : aucun pourcentage de la nouvelle mise ne va
   * au détenteur précédent. L'invariant tient par ABSENCE — rien dans le
   * code ne le paie. Ce test échouera le jour où quelqu'un ajoutera un
   * champ de reversement, ce qui est exactement le but. */
  test("le détenteur précédent ne reçoit rien", async () => {
    await wall.awardSeat(1, { id: "o1", ticker: "FROG", priceUsd: 100, badge: "SCREENED" });
    const out = await wall.awardSeat(1, { id: "o2", ticker: "DOGG", priceUsd: 200, badge: "SCREENED" });
    assert.equal(out.displaced, "FROG");

    const seat = await getSeat(1);
    const blob = JSON.stringify(seat);
    for (const forbidden of ["payout", "refund", "credit", "royalty", "kickback", "owedTo"]) {
      assert.ok(!blob.includes(forbidden), `le siège contient « ${forbidden} » : un reversement est apparu`);
    }
    assert.deepEqual(
      Object.keys(seat.history[0]).sort(),
      ["from", "priceUsd", "ticker", "to"],
      "l'entrée d'historique a gagné un champ — vérifier qu'il ne s'agit pas d'un reversement"
    );
  });
});

/* Le Master Context marque ces modèles 🟡 PROPOSED : pas encore
 * validés, donc pas encore de code. Leur absence est l'état correct.
 * Ce test tombe si quelqu'un les implémente sans SPEC. */
describe("invariants V4.54 — ce qui ne doit pas encore exister", () => {
  const SOURCES = ["src/wall.js", "src/config.js", "src/payments.js", "src/server.js"];
  for (const term of ["flywheel", "rewardsVault", "protocolReserve", "communityPoints", "wallPoints"]) {
    test(`« ${term} » n'est pas implémenté`, () => {
      for (const f of SOURCES) {
        assert.ok(
          !readFileSync(f, "utf8").toLowerCase().includes(term.toLowerCase()),
          `${f} référence ${term} — modèle 🟡 PROPOSED, une SPEC est requise`
        );
      }
    });
  }
});
