import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Firebase Hosting enables edge revalidation for CSS/JS/MJS", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  const rule = (config.hosting.headers ?? []).find(
    (entry) => entry.source === "**/*.@(css|js|mjs)"
  );
  assert.ok(rule, "missing Firebase edge-cache rule for CSS/JS/MJS");
  assert.deepEqual(rule.headers, [{
    key: "Cache-Control",
    value: "public, max-age=0, must-revalidate",
  }]);
});
