import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Firebase Hosting makes CSS/JS revalidation cacheable at the edge", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const headers = config.hosting.headers ?? [];
  const rule = headers.find((entry) => entry.source === "**/*.@(css|js|mjs)");
  assert.ok(rule, "missing Firebase edge-cache rule for CSS/JS/MJS");
  assert.deepEqual(rule.headers, [{
    key: "Cache-Control",
    value: "public, max-age=0, must-revalidate",
  }]);
});

test("the Firebase edge-cache rule does not change the application origin policy", async () => {
  const { serveStatic } = await import("../src/http.js");
  const response = await new Promise((resolve) => {
    const headers = {};
    const res = {
      writeHead(code, values) { this.statusCode = code; Object.assign(headers, values); },
      end(body = "") { resolve({ status: this.statusCode, headers, body }); },
      setHeader() {},
    };
    serveStatic({ headers: {} }, res, "/css/app.css");
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers["cache-control"], "no-cache");
});
