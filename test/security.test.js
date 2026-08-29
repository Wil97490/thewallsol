import { test, describe } from "node:test";
import assert from "node:assert/strict";
import "./_helpers.js";
import { isPrivateAddress, vetUrl, UnsafeUrlError, sameSite } from "../src/lib/net.js";
import { secretEquals } from "../src/http.js";
import { isSolanaAddress } from "../src/lib/base58.js";
import { validateEntry } from "../src/server.js";
import { fixtureAllowed } from "../src/facts.js";
import { isOnCurve } from "../src/lib/ed25519.js";
import { decodeBase58 } from "../src/lib/base58.js";
import crypto from "node:crypto";

/* ------------------------------------------------------------------ *
 * The buyer supplies a URL and we fetch it from inside our own network.
 * These tests are the difference between a link checker and a proxy
 * that reads our cloud credentials on request.
 * ------------------------------------------------------------------ */

describe("SSRF — the link checker must not be usable as a proxy", () => {
  const private_ = [
    "127.0.0.1", "127.9.9.9", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1",
    "::ffff:127.0.0.1", "not-an-ip",
  ];
  for (const ip of private_) {
    test(`blocks ${ip}`, () => assert.equal(isPrivateAddress(ip), true, `${ip} was treated as public`));
  }
  const public_ = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "173.0.0.1", "2606:4700:4700::1111"];
  for (const ip of public_) {
    test(`allows ${ip}`, () => assert.equal(isPrivateAddress(ip), false, `${ip} was treated as private`));
  }

  const badUrls = [
    ["http://example.com/", "not_https"],
    ["https://127.0.0.1/", "private_address"],
    ["https://169.254.169.254/latest/meta-data/", "private_address"],
    ["https://localhost/admin", "internal_hostname"],
    ["https://metadata.internal/token", "internal_hostname"],
    ["https://user:pass@example.com/", "credentials_in_url"],
    ["https://example.com:2375/", "nonstandard_port"],
    ["file:///etc/passwd", "not_https"],
    ["javascript:alert(1)", "not_https"],
    ["not a url at all", "malformed"],
  ];
  for (const [url, why] of badUrls) {
    test(`refuses ${url}`, () => {
      assert.throws(() => vetUrl(url), (e) => e instanceof UnsafeUrlError && e.message === why,
        `${url} should be refused as ${why}`);
    });
  }

  test("accepts an ordinary https link", () => {
    assert.equal(vetUrl("https://example.com/token").host, "example.com");
  });
});

describe("secrets", () => {
  test("an unset secret never matches", () => {
    assert.equal(secretEquals("anything", ""), false);
    assert.equal(secretEquals("", ""), false);
  });
  test("a wrong secret never matches", () => {
    assert.equal(secretEquals("wrong", "right"), false);
    assert.equal(secretEquals("righ", "right"), false);
  });
  test("the right secret matches", () => assert.equal(secretEquals("right", "right"), true));
});

describe("addresses", () => {
  test("a real mint is accepted", () => assert.equal(isSolanaAddress("So11111111111111111111111111111111111111112"), true));
  const bad = ["", "0xdeadbeef", "https://x.com", "abc", "0".repeat(44), "l".repeat(44)];
  for (const s of bad) test(`refuses ${JSON.stringify(s).slice(0, 20)}`, () => assert.equal(isSolanaAddress(s), false));
});

describe("entry validation — the form is an attack surface too", () => {
  const good = { ticker: "frog", mint: "So11111111111111111111111111111111111111112", link: "https://frog.example", pitch: "a frog", seatNo: 1 };
  test("normalises a good entry", () => {
    const v = validateEntry(good);
    assert.equal(v.ok, true, v.errors.join("; "));
    assert.equal(v.value.ticker, "FROG");
  });
  const bad = [
    ["empty", {}],
    ["ticker with punctuation", { ...good, ticker: "FR<OG" }],
    ["ticker too long", { ...good, ticker: "ABCDEFGHIJK" }],
    ["evil link", { ...good, link: "https://169.254.169.254/" }],
    ["not a mint", { ...good, mint: "0xabc" }],
    ["pitch too long", { ...good, pitch: "x".repeat(200) }],
    ["seat out of range", { ...good, seatNo: 999 }],
    ["bad email", { ...good, contact: "not-an-email" }],
  ];
  for (const [name, body] of bad) {
    test(`refuses ${name}`, () => assert.equal(validateEntry(body).ok, false, `${name} was accepted`));
  }
});

describe("the dev fixture cannot exist in production", () => {
  test("inert when NODE_ENV=production, whatever the flag says", () => {
    assert.equal(fixtureAllowed("production", "1"), false);
    assert.equal(fixtureAllowed("production", "true"), false);
  });
  test("only active when explicitly asked for outside production", () => {
    assert.equal(fixtureAllowed("development", "1"), true);
    assert.equal(fixtureAllowed("development", undefined), false);
    assert.equal(fixtureAllowed("test", "0"), false);
  });
});

describe("wallet or program — the test that stops a liquidity pool being read as a whale", () => {
  const wallets = [
    "7nTit2yrh9G2RT6Y4jUe6DXyjgweQY2CTX9mvKCRfhts",
    "So11111111111111111111111111111111111111112",
  ];
  for (const a of wallets) {
    test(`on the curve: ${a.slice(0, 8)}…`, () => {
      assert.equal(isOnCurve(decodeBase58(a)), true, "a real wallet must read as a wallet");
    });
  }

  test("off the curve: the incinerator holds no key", () => {
    assert.equal(isOnCurve(decodeBase58("1nc1nerator11111111111111111111111111111111")), false);
  });

  test("a wrong-sized key is never a wallet", () => {
    assert.equal(isOnCurve(new Uint8Array(31)), false);
    assert.equal(isOnCurve(null), false);
  });

  test("random keys split roughly evenly — the arithmetic is real, not a stub", () => {
    let on = 0;
    for (let i = 0; i < 200; i++) {
      if (isOnCurve(crypto.randomBytes(32))) on++;
    }
    assert.ok(on > 60 && on < 140, `expected roughly half on the curve, got ${on}/200`);
  });
});

describe("sameSite — la frontière entre leur plomberie et un vrai saut", () => {
  const same = [
    ["https://c4t.cat", "https://c4t.cat/"],
    ["http://c4t.cat", "https://c4t.cat/"],
    ["https://c4t.cat", "https://www.c4t.cat/"],
    ["https://www.c4t.cat", "https://c4t.cat/"],
    ["https://c4t.cat", "https://app.c4t.cat/x"],
  ];
  for (const [a, b] of same) {
    test(`même maison : ${a} → ${b}`, () => assert.equal(sameSite(a, b), true));
  }

  const other = [
    ["https://c4t.cat", "https://linktr.ee/c4t"],
    // Le piège : un domaine qui SE TERMINE par le nom sans en être un
    // sous-domaine. Une comparaison par suffixe naïve le laisse passer.
    ["https://c4t.cat", "https://evil-c4t.cat/"],
    ["https://c4t.cat", "https://c4t.cat.evil.com/"],
  ];
  for (const [a, b] of other) {
    test(`ailleurs : ${a} → ${b}`, () => assert.equal(sameSite(a, b), false));
  }

  test("une URL illisible n'est jamais déclarée « même site »", () => {
    assert.equal(sameSite("pas une url", "https://c4t.cat"), false);
    assert.equal(sameSite("https://c4t.cat", ""), false);
    assert.equal(sameSite(null, null), false);
  });
});
