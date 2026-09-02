# REPORT — SPEC-014

**SPEC executed:** SPEC-014-conditional-static-assets-cache
**Branch:** `spec/014-conditional-static-assets-cache`
**Starting commit:** `3331ac741` (`origin/master`)
**Date:** 2026-09-02

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

**Complete.** `304` revalidation works for CSS/JS, verified against a
real running server, `Cache-Control` unchanged everywhere, all 425 tests
pass (415 pre-existing + 10 new), no file outside the authorized scope
touched.

## 2. Summary

Added a content-hash `ETag` and `mtime`-based `Last-Modified` to
`.css`/`.js`/`.mjs` responses in `src/http.js`, computed once per file
and cached in memory for the life of the process. `serveStatic`'s
signature had to change from `(res, urlPath)` to `(req, res, urlPath)`
to read the incoming conditional-request headers — this was flagged as
a scope question before writing any code (`src/http.js` alone cannot
read request headers it is never given), and the operator explicitly
authorized extending the scope to the 8 mechanical call sites in
`src/server.js`. Every behavioural claim below was checked against a
real running server with real HTTP requests, not inferred.

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-014-conditional-static-assets-cache.md` | This pass's SPEC |
| `docs/reports/REPORT-014-conditional-static-assets-cache.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `src/http.js` | `serveStatic(req, res, urlPath)`; in-memory validator cache; `304` handling for `.css`/`.js`/`.mjs` | +47 / −1 |
| `src/server.js` | 8 call sites updated to pass `req` — mechanical only, confirmed by diff (see §8) | +8 / −8 |
| `test/routes.test.js` | 10 new tests | +133 |

No other file touched — confirmed by `git diff --stat` against
`origin/master` before committing.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 425 / 425 / 0 fail (415 pre-existing + 10 new) |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

## 6. Behaviour verified before writing code (the "must fail first" step)

Against the unmodified branch (before any edit), on a local server:

```
curl -H 'If-None-Match: "anything"' /css/app.css        → 200
curl -H 'If-Modified-Since: <a date in 2030>' /css/app.css → 200
```

Both confirmed the pre-implementation server ignores conditional headers
entirely and always returns `200` — this is the failing state the new
tests in `test/routes.test.js` are written against. The tests themselves
were not run against the pre-implementation code as a separate step
(the manual `curl` checks above serve that purpose; re-running the exact
same automated assertions against reverted code was judged redundant
given the `curl` evidence was already conclusive and specific).

## 7. Behaviour verified after implementation — HTTP, on a real server

All checked with `curl` against a locally running instance
(`STORAGE_BACKEND=memory`), then locked into `test/routes.test.js`
against the project's existing real-server pattern:

| # | Scenario | Result |
|---|---|---|
| 1 | Unconditional `GET /css/app.css` | `200`, `cache-control: no-cache` (unchanged), `etag` and `last-modified` present |
| 2 | `If-None-Match` with the real ETag | `304`, **zero-byte body** (curl did not even create the output file — no body was sent) |
| 3 | `If-None-Match` with a wrong ETag | `200`, full 28,853-byte body |
| 4 | `If-Modified-Since` set to `2030-01-01` (after the file's real `Last-Modified`) | `304`, no body |
| 5 | `If-Modified-Since` set to `2020-01-01` (before) | `200`, full body |
| 6 | `GET /` with `If-None-Match: "*"` | `200` — HTML never returns `304`, no `etag`/`last-modified` header at all |
| 7 | `/favicon.svg`, `/og.png`, `/how-it-works-2.jpg`, `.mp4`, `.webm`, `/monolith-dark.webp` | Each keeps its exact pre-existing `Cache-Control` (`86400` for svg, `31536000, immutable` for media); none carries an `ETag` |
| 8 | Path traversal (`/../src/config.js`) and a missing file | `404` both, `x-content-type-options: nosniff` and the full CSP still present, `cache-control: no-store` on the 404 — unchanged |

## 8. `server.js` diff — confirmed mechanical only

```diff
-      if (p === "/" ) return serveStatic(res, "index.html");
+      if (p === "/" ) return serveStatic(req, res, "index.html");
```
(× 8, identical shape each time — `git diff` inspected line by line;
no condition, route, or response body changed anywhere in the file.)

## 9. The in-memory cache — verified, not assumed

`test/routes.test.js`'s dedicated test starts a small in-process HTTP
server bound directly to `serveStatic`, intercepts `fs.readFileSync`
with `node:test`'s `mock.method`, issues two requests for the same file,
and asserts the file's content was read exactly once. This test passed —
the hash is genuinely computed once and reused, not just observed to
"work" from the outside (which a stateless-but-slow implementation would
also satisfy).

## 10. Gaps

None against this SPEC's 11 acceptance criteria — all 11 verified as
described above.

## 11. Risks (unchanged from SPEC-014 §9, restated because still true)

- **Firebase Hosting's edge-caching behaviour for conditional requests
  against Cloud Run was not verified** — no deployment was made in this
  pass. This is the one part of the original audit's "warning" that
  remains an inference (based on `firebase.json` defining no cache
  override) rather than a measurement. Flagged explicitly, not silently
  assumed safe.
- `Last-Modified`'s safety depends on the `Dockerfile`'s `COPY`
  resetting `mtime` on every build — true today, not an intrinsic
  property of `mtime` itself. `ETag` is checked first and is safe
  regardless, per RFC 7232 §6, so this only matters for a client that
  sends `If-Modified-Since` without `If-None-Match`.

## 12. Requires human validation

PR review and merge — left to the operator. A real deploy would be the
first opportunity to close the Firebase Hosting gap in §11 — not done
here, per instruction.

## 13. Still manual

Nothing about this pass is meant to be automated further; the one
open question (Firebase Hosting's real behaviour) can only be answered
by an actual deploy, which is explicitly out of scope for this pass.

## 14. Recommended next step

If this merges and deploys, a quick production check of
`If-None-Match`/`If-Modified-Since` against `https://thewallsol.com`
would close the one remaining unverified assumption (§11) — not
proposed as a new SPEC, just a one-off check worth doing at deploy time.
