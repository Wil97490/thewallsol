# SPEC-014 — Conditional static assets cache

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-02
**Status:** validated
**Branch:** `spec/014-conditional-static-assets-cache`

---

## 1. Objective

CSS and JS assets, still served `Cache-Control: no-cache`, can be
revalidated for free (`304`, no body) when their content hasn't changed,
instead of always retransmitting the full file — without changing the
`no-cache` policy itself or introducing any client/server version-mismatch
risk.

## 2. Context

Read-only audit (this session) measured the current state precisely:
`no-cache` is sent, but the server never sends or reads any validator
(`ETag`/`Last-Modified`), confirmed live by sending
`If-Modified-Since: <a date in 2030>` against production and getting
`200` back regardless. `no-cache` degenerates to `no-store` in practice —
every request pays the full ~74,592 bytes (`app.css` 28853,
`visual.css` 12107, `home-cohesion.css` 5013,
`interaction-polish.css` 1798, `wall.js` 23935, `theme.js` 1428,
`film.js` 1458).

The audit's safety analysis: `no-cache` already forces mandatory
revalidation before reuse; adding a validator doesn't weaken that — it
only makes the *already-mandatory* revalidation cheap when nothing
changed. A content-hash `ETag` is safe by construction: different
content always produces a different `ETag`, so a real change is never
missed. `Last-Modified` (`mtime`) is additionally confirmed safe *in
this repo's specific build*: the `Dockerfile`'s `COPY public ./public`
resets every file's `mtime` to build time on every deploy, so `mtime`
can never signal "unchanged" across a real deploy even when it should.

## 3. Scope

- `src/http.js`: compute a `sha256` content hash per file, cached in
  memory (`Map`, keyed by resolved path, invalidated only if `mtime`
  changes — handles `npm run dev`, where editing a `public/*.css` file
  doesn't restart the process, without adding any real-world risk since
  Cloud Run containers are immutable for the life of a revision). Read
  `If-None-Match`/`If-Modified-Since` on requests for `.css`/`.js`/`.mjs`
  only; respond `304` with no body when a validator matches, `200` with
  `ETag` + `Last-Modified` otherwise. `Cache-Control` computation
  entirely unchanged.
- `src/server.js`: `serveStatic`'s signature changes from
  `(res, urlPath)` to `(req, res, urlPath)` — required because reading
  `If-None-Match`/`If-Modified-Since` needs the request object, which no
  caller previously passed in. All 8 call sites updated to pass `req`
  through; no routing decision, condition, or response body changes.
- `test/routes.test.js`: tests for the new conditional behaviour, using
  the file's existing real-server pattern, plus a small in-process check
  that the content hash is computed once and reused, not recomputed per
  request.

## 4. Out of scope

- `public/js/wall.js`, `public/js/theme.js`, any HTML, any CSS content,
  routing decisions, business logic — untouched.
- `Cache-Control`/`max-age` for any extension — unchanged for every type,
  confirmed in the diff and in tests.
- Firebase Hosting, Cloud Run, any deploy or infrastructure change —
  nothing here is deployed as part of this SPEC.
- `.html` is not made conditional, even though it currently shares the
  same `no-cache` value — explicitly tested to confirm it still never
  receives a `304`.

## 5. Files concerned

| File | Expected change |
|---|---|
| `src/http.js` | `serveStatic(req, res, urlPath)`; content-hash `ETag` + `mtime`-based `Last-Modified`, cached in memory; `304` handling for `.css`/`.js`/`.mjs` |
| `src/server.js` | 8 call sites updated to pass `req` through — mechanical only |
| `test/routes.test.js` | New tests for the conditional-request behaviour and the in-memory cache |
| `docs/specs/SPEC-014-conditional-static-assets-cache.md` | This SPEC |
| `docs/reports/REPORT-014-conditional-static-assets-cache.md` | This report |

## 6. Expected behaviour

A visitor's browser, revisiting a page or navigating between
`/`, `/rules`, `/seen`, `/refused`, `/checks` within the same session,
gets `304` responses for `app.css`/`visual.css`/etc. instead of the full
body, once it has a cached copy with the current `ETag`. A first-time
visitor, or a visit right after a deploy, sees no change at all — same
`200`, same content, plus two new headers.

## 7. Acceptance criteria

1. An unconditional request to a `.css`/`.js`/`.mjs` file returns `200`
   with the content, an `ETag`, and a `Last-Modified` header;
   `Cache-Control` unchanged.
2. The same request repeated with the returned `ETag` in `If-None-Match`
   returns `304` with no body.
3. The same request with an incorrect `If-None-Match` returns `200` with
   the full content.
4. A request with `If-Modified-Since` at or after the file's
   `Last-Modified` returns `304` with no body.
5. A request with `If-Modified-Since` before the file's `Last-Modified`
   returns `200` with the full content.
6. `.html` never returns `304`, regardless of the conditional headers
   sent, and never carries an `ETag`/`Last-Modified`.
7. `.svg`/`.png`/`.jpg`/`.mp4`/`.webm`/`.webp` keep their exact current
   `Cache-Control` value and never carry an `ETag`/`Last-Modified`.
8. Security headers, path-traversal protection, and `404` handling are
   unchanged.
9. All 8 `serveStatic` call sites in `src/server.js` still respond
   correctly with `req` threaded through.
10. A file's content hash is computed once and reused across repeated
    requests within the same running instance — verified by intercepting
    `fs.readFileSync` and counting calls, not inferred from response
    correctness alone.
11. `npm test`, `npm run check`, `git diff --check` all pass.

## 8. Invariants that must not move

None — no `CLAUDE.md §9` business invariant is near this change.

## 9. Risks

- Firebase Hosting's own edge-caching behaviour for conditional requests
  against a Cloud-Run-backed origin was **not verified** — no deployment
  was made as part of this SPEC. `firebase.json` defines no cache
  override, which is the basis for treating this as low-risk, but it is
  an inference, not a measurement, and is flagged as such rather than
  claimed as confirmed.
- `Last-Modified`'s safety currently depends on the `Dockerfile`'s
  `COPY` semantics resetting `mtime` on every build. If the build
  process ever changed to one that preserves source timestamps, `mtime`
  alone could under-invalidate — mitigated by `ETag` being checked first
  and being safe unconditionally, per RFC 7232 §6, so this risk is
  contained to the (currently unused) case of a client that only sends
  `If-Modified-Since`.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| Conditional-request behaviour (11 new tests, `test/routes.test.js`) | Acceptance criteria 1–9 | Yes — manually verified against the pre-implementation server with `curl` (always `200`, no validators) before writing any code; see REPORT-014 §6 |
| In-memory cache check (`fs.readFileSync` call count) | Acceptance criterion 10 | Yes — trivially true before the cache existed (every request would read the file) |
| `npm test` (full suite) | No regression anywhere else, including the 8 `serveStatic` call sites | No — nothing else changes |

## 11. Human validation required

PR review and merge — left to the operator. A real deploy, if this is
merged, would be the first opportunity to confirm the Firebase Hosting
inference in §9.
