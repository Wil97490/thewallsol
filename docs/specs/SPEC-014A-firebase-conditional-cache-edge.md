# SPEC-014A — Firebase conditional static-asset cache at the edge

## Context

SPEC-014 added ETag/Last-Modified validation for CSS/JS/MJS at the Cloud Run origin while deliberately keeping `Cache-Control: no-cache`. The origin returns a correct 304 when a matching validator reaches it.

Production verification showed that the public Firebase Hosting URL returned 200 with the full body even when the client supplied the exact ETag. The same request sent directly to Cloud Run returned 304. The failure is therefore at the Firebase Hosting layer, not in `src/http.js`.

Firebase Hosting documents that Cloud Run responses are dynamic content and are not cached on the CDN by default, and that explicitly public cache-control enables CDN caching.

## Goal

Allow Firebase Hosting to cache the CSS/JS/MJS response representation at the edge while preserving mandatory revalidation, so the edge can satisfy conditional requests without forwarding the browser's `If-None-Match` to Cloud Run.

## Scope

- `firebase.json`: add a Hosting header rule for `**/*.@(css|js|mjs)`.
- `test/firebase-cache.test.js`: lock the rule in an automated test.
- No application response policy changes in `src/http.js`.
- No HTML, image, media, routing, security, or business-logic changes.

## Cache contract

The Hosting edge rule sets:

`Cache-Control: public, max-age=0, must-revalidate`

This keeps the resource immediately stale for shared caches and requires revalidation, while making the response eligible for Firebase's CDN. The origin continues to emit its existing `no-cache` policy and validators; the Hosting rule is the edge-specific override.

## Required verification

1. `npm test` and `npm run check` pass.
2. Origin Cloud Run still returns 304 for a matching ETag.
3. Production Hosting URL returns 304 for a matching ETag on CSS/JS/MJS.
4. A stale/wrong ETag returns 200 with the complete body.
5. HTML remains 200 and unvalidated.
6. Images/media retain their existing immutable caching policy.
7. No functional, security, responsive, accessibility, or visual regression.

No production claim is considered proven until the public Hosting URL is tested after deployment.
