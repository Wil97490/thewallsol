# REPORT-014A — Firebase conditional static-asset cache at the edge

## Status

Implementation branch created from `origin/master` at `4008426b987f903fc23efa1dda7255576f6a9d77`.

No production deployment has been performed by this implementation pass.

## Root cause confirmed

SPEC-014's origin implementation works: direct requests to the Cloud Run revision return `304` for a matching CSS/JS ETag.

The public Firebase Hosting URL reproducibly returned `200` with the full CSS body for the same matching client ETag. This isolated the problem to the Hosting/CDN layer rather than `src/http.js`.

## Change implemented

`firebase.json` now applies the following Hosting response header to CSS, JS and MJS paths:

`Cache-Control: public, max-age=0, must-revalidate`

The application origin remains unchanged and continues to emit `Cache-Control: no-cache` plus ETag/Last-Modified for CSS/JS/MJS.

A focused test locks the Firebase configuration so the edge-cache rule cannot disappear silently.

## Why this approach

Firebase Hosting documents that Cloud Run-backed content is not cached by the CDN by default, and that explicitly marking dynamic responses `public` enables CDN caching. The `max-age=0, must-revalidate` contract avoids introducing a stale serving window: the representation is eligible for shared caching, but must be revalidated before reuse.

The production behavior must still be proven after deployment. This report deliberately makes no claim that Firebase will return 304 until that test is performed against the public domain.

## Scope

Changed:

- `firebase.json`
- `test/firebase-cache.test.js`
- this SPEC/REPORT pair

Not changed:

- `src/http.js`
- `src/server.js`
- public assets or pages
- routing or business logic
- security headers
- media caching

## Required post-deploy proof

- Public CSS request with exact ETag → `304`, empty body.
- Wrong ETag → `200`, complete body.
- `If-Modified-Since` valid → `304`.
- HTML remains `200` and has no validator behavior.
- WebP/PNG/JPG/SVG/media cache behavior remains unchanged.
- Direct Cloud Run origin continues to return the expected 304.

Until those checks pass on `https://thewallsol.com`, SPEC-014A is not considered successful in production.
