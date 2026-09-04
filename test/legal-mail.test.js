import "./_helpers.js";
import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { config, sirenLooksValid, publisherGaps, publisherComplete, mailConfigured,
         salesGaps, salesPreconditions, salesOpen } from "../src/config.js";
import { publisherBlock } from "../src/pages.js";
import { receiptText, sendEmail, sendReceipt, mailStatus } from "../src/notify.js";

/* Config is read once at import. These tests drive the pure functions
 * and pass their input explicitly wherever they can; where they cannot,
 * they put the object back the way they found it. */
const withPublisher = (over, fn) => {
  const saved = { ...config.publisher };
  Object.assign(config.publisher, over);
  try { return fn(); } finally { Object.assign(config.publisher, saved); }
};
const withMail = (over, fn) => {
  const saved = { ...config.mail };
  Object.assign(config.mail, over);
  try { return fn(); } finally { Object.assign(config.mail, saved); }
};

const FULL = {
  name: "The Wall", legalForm: "Entreprise individuelle (micro-entreprise)",
  siren: "552100554", director: "M. Example", address: "", addressOnRequest: true,
  vat: "", host: "Google Cloud EMEA Limited, Dublin, Ireland",
  contact: "contact@thewallsol.com",
};

/* ---- SIREN --------------------------------------------------------- */

describe("SIREN", () => {
  test("accepts a number that passes its checksum", () => {
    assert.equal(sirenLooksValid("552100554"), true);   // Danone, a real SIREN
    assert.equal(sirenLooksValid("552 100 554"), true); // spacing is not data
  });

  test("refuses the wrong length and a failed checksum", () => {
    assert.equal(sirenLooksValid("55210055"), false);
    assert.equal(sirenLooksValid("5521005541"), false);
    assert.equal(sirenLooksValid("552100555"), false);
    assert.equal(sirenLooksValid(""), false);
    assert.equal(sirenLooksValid(undefined), false);
  });

  test("a well-formed number is not a claim that it belongs to anyone", () => {
    // Guarding the comment in config.js: the check is arithmetic only.
    assert.equal(sirenLooksValid("000000000"), true);
  });
});

/* ---- what is missing ----------------------------------------------- */

describe("publisher gaps", () => {
  test("a complete identity has none", () => {
    withPublisher(FULL, () => {
      assert.deepEqual(publisherGaps(), []);
      assert.equal(publisherComplete(), true);
    });
  });

  test("each missing field is named once", () => {
    withPublisher({ ...FULL, name: "", siren: "" }, () => {
      const gaps = publisherGaps().join(" | ");
      assert.match(gaps, /PUBLISHER_NAME/);
      assert.match(gaps, /PUBLISHER_SIREN/);
      assert.equal(publisherComplete(), false);
    });
  });

  test("a SIREN that fails its checksum is a gap, not a pass", () => {
    withPublisher({ ...FULL, siren: "552100555" }, () => {
      assert.match(publisherGaps().join(" "), /checksum/);
    });
  });

  test("no address and no on-request choice is a gap; either one closes it", () => {
    withPublisher({ ...FULL, address: "", addressOnRequest: false }, () => {
      assert.match(publisherGaps().join(" "), /PUBLISHER_ADDRESS/);
    });
    withPublisher({ ...FULL, address: "1 rue Exemple, 97420 Le Port", addressOnRequest: false }, () => {
      assert.deepEqual(publisherGaps(), []);
    });
    withPublisher({ ...FULL, address: "", addressOnRequest: true }, () => {
      assert.deepEqual(publisherGaps(), []);
    });
  });
});

/* ---- the rendered notice ------------------------------------------- */

describe("the legal notice", () => {
  test("never prints a placeholder, whatever is missing", () => {
    for (const pub of [
      {}, { name: "The Wall" }, { ...FULL, siren: "", address: "", addressOnRequest: false },
    ]) {
      const html = publisherBlock({ contact: "contact@thewallsol.com", ...pub });
      assert.doesNotMatch(html, /to be completed/i);
      assert.doesNotMatch(html, /\[.*\]/);
      assert.doesNotMatch(html, /undefined|null|N\/A/);
    }
  });

  test("omits the line rather than printing an empty one", () => {
    const html = publisherBlock({ name: "The Wall", contact: "contact@thewallsol.com" });
    assert.doesNotMatch(html, /SIREN/);
    assert.doesNotMatch(html, /VAT/);
    assert.doesNotMatch(html, /Publication director/);
    assert.match(html, /The Wall/);
  });

  test("prints every established field", () => {
    const html = publisherBlock({ ...FULL, address: "1 rue Exemple", addressOnRequest: false, vat: "FR12552100554" });
    assert.match(html, /Entreprise individuelle/);
    assert.match(html, /552 100 554/);          // grouped for reading
    assert.match(html, /1 rue Exemple/);
    assert.match(html, /FR12552100554/);
    assert.match(html, /Google Cloud/);
  });

  test("an address on request is said in words, not left as a hole", () => {
    const html = publisherBlock(FULL);
    assert.match(html, /Address:/);
    assert.match(html, /not published here/);
    assert.match(html, /contact@thewallsol\.com/);
  });

  test("says out loud when the till is closed", () => {
    const open = publisherBlock(FULL, { salesClosed: false });
    const shut = publisherBlock(FULL, { salesClosed: true });
    assert.doesNotMatch(open, /not on sale/);
    assert.match(shut, /not on sale/);
    assert.match(shut, /ledger/);   // and that the rest still runs
  });

  test("blames the identity only when the identity is the cause", () => {
    /* The till also closes when no receipt could be sent. Printing
     * "the identity above is incomplete" under a complete notice would
     * be a confident wrong sentence on a public page. */
    const mailFault = publisherBlock(FULL, { salesClosed: true, identityIncomplete: false });
    assert.match(mailFault, /not on sale/);
    assert.doesNotMatch(mailFault, /identity above is incomplete/);

    const idFault = publisherBlock(FULL, { salesClosed: true, identityIncomplete: true });
    assert.match(idFault, /identity above is incomplete/);
  });

  test("escapes what it is given", () => {
    const html = publisherBlock({ name: '<script>alert(1)</script>', contact: "a@b.co" });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  test("always ends on the governing law", () => {
    assert.match(publisherBlock({}), /Governing law: France/);
  });
});

/* ---- the receipt --------------------------------------------------- */

describe("the receipt", () => {
  const ORDER = {
    id: "o1", seatNo: 7, ticker: "TEST", priceUsd: 120, amountSol: 0.6123,
    signature: "5xSigNature", contact: "buyer@example.com",
  };

  test("carries the seat, the price and a signature anyone can look up", () => {
    const t = receiptText(ORDER);
    assert.match(t, /No 07/);
    assert.match(t, /\$TEST/);
    assert.match(t, /\$120/);
    assert.match(t, /0\.6123 SOL/);
    assert.match(t, /5xSigNature/);
    assert.match(t, /solscan\.io\/tx\/5xSigNature/);
  });

  test("does not congratulate, predict, or ask for more money", () => {
    const t = receiptText(ORDER).toLowerCase();
    for (const word of ["congratulation", "moon", "guarantee", "invest", "upgrade", "defend your seat"]) {
      assert.equal(t.includes(word), false, `receipt should not say "${word}"`);
    }
  });

  test("points at the checks, including what they do not establish", () => {
    assert.match(receiptText(ORDER), /\/checks/);
    assert.match(receiptText(ORDER), /does not establish/);
  });

  test("survives an order with nothing but a seat number", () => {
    const t = receiptText({ seatNo: 1 });
    assert.match(t, /No 01/);
    assert.doesNotMatch(t, /undefined|NaN|null/);
  });
});

/* ---- sending ------------------------------------------------------- */

describe("sending", () => {
  test("refuses a recipient that is not an address, before touching the network", async () => {
    for (const bad of ["", "   ", "nope", "a@b", "a b@c.co", null, undefined, "x@.com"]) {
      const out = await sendEmail(bad, "s", "b");
      assert.equal(out.sent, false);
      assert.match(out.reason, /not an address/);
    }
  });

  test("says the key is missing rather than pretending it sent", async () => {
    await withMail({ key: "", from: "" }, async () => {
      const out = await sendEmail("buyer@example.com", "s", "b");
      assert.equal(out.sent, false);
      assert.match(out.reason, /not configured/);
    });
  });

  test("a receipt with no contact on file is reported, not thrown", async () => {
    const out = await sendReceipt({ seatNo: 3, ticker: "TEST" });
    assert.equal(out.sent, false);
    assert.match(out.reason, /no contact/);
  });

  test("mailStatus names what is missing and leaks no secret", () => {
    withMail({ key: "re_secret_value", from: "" }, () => {
      const st = mailStatus();
      assert.equal(st.configured, false);
      assert.deepEqual(st.missing, ["MAIL_FROM"]);
      assert.equal(JSON.stringify(st).includes("re_secret_value"), false);
    });
    withMail({ key: "re_k", from: "The Wall <a@b.co>" }, () => {
      assert.equal(mailConfigured(), true);
      assert.equal(mailStatus().configured, true);
    });
  });
});

/* ---- the page that ships ------------------------------------------- */

describe("/terms as served", () => {
  const render = async () => {
    const { serveHtml } = await import("../src/http.js");
    let body = "", code = 0;
    const res = {
      writeHead(c) { code = c; },
      end(b) { body = b || ""; },
    };
    serveHtml(res, "terms.html", {
      PUBLISHER_IDENTITY: publisherBlock(FULL, { salesClosed: true }),
    });
    return { code, body };
  };

  test("substitutes the marker and leaves none behind", async () => {
    const { code, body } = await render();
    assert.equal(code, 200);
    assert.doesNotMatch(body, /<!--PUBLISHER_IDENTITY-->/);
    assert.match(body, /552 100 554/);
  });

  test("the shipped file carries no placeholder text anywhere", async () => {
    const { body } = await render();
    assert.doesNotMatch(body, /to be completed/i);
    assert.doesNotMatch(body, /À COMPLÉTER/i);
  });

  test("the marker exists in the file, so the block cannot silently vanish", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = fs.readFileSync(path.join(process.cwd(), "public/terms.html"), "utf8");
    assert.match(raw, /<!--PUBLISHER_IDENTITY-->/);
  });
});

/* ---- the deploy wiring --------------------------------------------- */

describe("deploy wiring", () => {
  const read = async (rel) => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  };

  test("env vars are passed with a non-comma delimiter", async () => {
    /* A postal address contains a comma. With gcloud's default
     * separator the list splits inside the address and the next
     * variable silently becomes "97420 Le Port". */
    const sh = await read("scripts/deploy.sh");
    assert.match(sh, /--set-env-vars "\^\|\^/);
    assert.doesNotMatch(sh, /--set-env-vars "STORAGE_BACKEND/);
  });

  test("the Resend secret is looked up, never assumed", async () => {
    /* Referencing a secret that does not exist makes the revision fail
     * to start. The site must not go down because email is unset. */
    const sh = await read("scripts/deploy.sh");
    assert.match(sh, /gcloud secrets describe resend-api-key/);
    assert.doesNotMatch(sh, /--set-secrets "[^"]*resend-api-key/);
  });

  test("every publisher variable the code reads is declared for deploy", async () => {
    const sh = await read("scripts/deploy.sh");
    const env = await read("deploy.env");
    for (const key of [
      "PUBLISHER_NAME", "PUBLISHER_LEGAL_FORM", "PUBLISHER_SIREN", "PUBLISHER_DIRECTOR",
      "PUBLISHER_ADDRESS", "PUBLISHER_ADDRESS_ON_REQUEST", "PUBLISHER_VAT", "PUBLISHER_CONTACT",
      "MAIL_FROM", "MAIL_REPLY_TO",
    ]) {
      assert.ok(sh.includes(key), `deploy.sh ne transmet pas ${key}`);
      assert.ok(env.includes(key), `deploy.env ne déclare pas ${key}`);
    }
  });

  test("no secret is written into the versioned settings file", async () => {
    const env = await read("deploy.env");
    assert.doesNotMatch(env, /re_[A-Za-z0-9]{8}/);
    assert.doesNotMatch(env, /RESEND_API_KEY=\S/);
  });
});

/* ---- selling while the identity is incomplete ----------------------- */

describe("the till, and what closes it", () => {
  const withFlag = (v, fn) => {
    const saved = config.requirePublisherForSales;
    config.requirePublisherForSales = v;
    try { return fn(); } finally { config.requirePublisherForSales = saved; }
  };

  test("gaps are reported whether or not they stop a sale", () => {
    withPublisher({ ...FULL, siren: "" }, () => {
      const gaps = salesGaps().join(" ");
      assert.match(gaps, /PUBLISHER_SIREN/);
    });
  });

  test("by default an incomplete identity does NOT stop a sale", () => {
    /* Operator's decision, 2026-09-03: payment is validated while the
     * identity is being completed. The gap is recorded, not enforced. */
    withFlag(false, () => {
      withPublisher({ ...FULL, siren: "", legalForm: "" }, () => {
        assert.ok(salesGaps().length > 0, "the gaps must still be visible");
        assert.deepEqual(salesPreconditions(), [], "but they must not close the till");
        assert.equal(salesOpen(), true);
      });
    });
  });

  test("the strict behaviour is one variable away, and still works", () => {
    withFlag(true, () => {
      withPublisher({ ...FULL, siren: "" }, () => {
        assert.ok(salesPreconditions().length > 0);
        assert.equal(salesOpen(), false);
      });
      withPublisher(FULL, () => {
        withMail({ key: "re_k", from: "The Wall <a@b.co>" }, () => {
          assert.deepEqual(salesPreconditions(), []);
          assert.equal(salesOpen(), true);
        });
      });
    });
  });

  test("what is missing and what we refuse to sell over stay separate", () => {
    /* Collapsing the two is how a policy change quietly becomes a
     * measurement change: the gaps must read the same either way. */
    withPublisher({ ...FULL, siren: "" }, () => {
      const a = withFlag(false, () => salesGaps());
      const b = withFlag(true, () => salesGaps());
      assert.deepEqual(a, b);
    });
  });
});
