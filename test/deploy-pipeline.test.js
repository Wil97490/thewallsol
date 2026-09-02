import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("deploy.sh publishes Firebase Hosting after the Cloud Run traffic switch (SPEC-015)", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts/deploy.sh"), "utf8");

  const trafficSwitch = script.indexOf("update-traffic");
  const hostingDeploy = script.indexOf("firebase deploy");
  assert.ok(trafficSwitch !== -1, "the existing Cloud Run traffic switch must still be present");
  assert.ok(hostingDeploy !== -1, "missing a firebase deploy step");
  assert.ok(hostingDeploy > trafficSwitch, "Hosting must deploy after Cloud Run traffic switches, not before");

  assert.match(script, /firebase deploy[^\n]*--only hosting/, "must deploy Hosting only, not the full Firebase project");
  assert.match(script, /firebase deploy[^\n]*--project "\$PROJECT"/, "must target the project already configured in deploy.env");
});

test("package.json pins firebase-tools as a devDependency (SPEC-015)", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies && pkg.devDependencies["firebase-tools"], "firebase-tools must be a pinned devDependency");
});

test("firebase.json's existing rewrites and headers are unchanged by SPEC-015", () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "firebase.json"), "utf8"));
  assert.deepEqual(config.hosting.rewrites, [
    { source: "**", run: { serviceId: "wall", region: "europe-west1" } },
  ]);
  assert.deepEqual(config.hosting.headers, [
    {
      source: "**/*.@(css|js|mjs)",
      headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
    },
  ]);
});
