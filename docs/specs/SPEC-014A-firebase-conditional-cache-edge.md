# SPEC-014A — Firebase conditional static-asset cache at the edge

**Author:** Operator (relayed via Claude Code session)
**Date:** 2026-09-02
**Status:** validated
**Branch:** `spec/014a-firebase-conditional-cache-edge`

---

## 1. Objective

Firebase Hosting's public edge revalidates CSS/JS/MJS conditional
requests (matching `ETag`/`Last-Modified`) with a `304`, instead of
always returning `200` with the full body — without changing the Cloud
Run origin's response policy at all.

## 2. Context

SPEC-014 added `ETag`/`Last-Modified` validation for CSS/JS/MJS at the
Cloud Run origin while deliberately keeping `Cache-Control: no-cache`.
The origin returns a correct `304` when a matching validator reaches it.

Production verification showed that the public Firebase Hosting URL
returned `200` with the full body even when the client supplied the
exact `ETag`. The same request sent directly to Cloud Run returned
`304`. The failure is therefore at the Firebase Hosting layer, not in
`src/http.js`.

Firebase Hosting documents that Cloud Run responses are dynamic content
and are not cached on the CDN by default, and that explicitly public
cache-control enables CDN caching.

## 3. Scope

- `firebase.json`: add a Hosting header rule for `**/*.@(css|js|mjs)`.
- `test/firebase-cache.test.js`: lock the rule in an automated test.

## 4. Out of scope

- No application response policy changes in `src/http.js`.
- No HTML, image, media, routing, security, or business-logic changes.

## 5. Files concerned

| File | Expected change |
|---|---|
| `firebase.json` | New Hosting `headers` rule for `**/*.@(css\|js\|mjs)` |
| `test/firebase-cache.test.js` | New — locks the rule's presence and exact value |

Anything not in this table is out of scope. If the work needs another
file, stop and amend the SPEC.

## 6. Expected behaviour

The Hosting edge rule sets:

`Cache-Control: public, max-age=0, must-revalidate`

This keeps the resource immediately stale for shared caches and
requires revalidation, while making the response eligible for
Firebase's CDN. The origin continues to emit its existing `no-cache`
policy and validators; the Hosting rule is the edge-specific override.

## 7. Acceptance criteria

1. `npm test` and `npm run check` pass.
2. Origin Cloud Run still returns `304` for a matching `ETag`.
3. Production Hosting URL returns `304` for a matching `ETag` on
   CSS/JS/MJS.
4. A stale/wrong `ETag` returns `200` with the complete body.
5. HTML remains `200` and unvalidated.
6. Images/media retain their existing immutable caching policy.
7. No functional, security, responsive, accessibility, or visual
   regression.

## 8. Invariants that must not move

None — no `CLAUDE.md §9` business invariant is near a Hosting-layer
cache-header change; no application code is touched.

## 9. Risks

The `max-age=0, must-revalidate` contract is chosen specifically to
avoid introducing a stale serving window: the representation becomes
eligible for shared caching, but must be revalidated before reuse —
the same guarantee `no-cache` already gave, extended to the edge.

No production claim is considered proven until the public Hosting URL
is tested after deployment — the theory that this header change makes
Firebase's edge perform its own revalidation is not verifiable from the
files in this repository alone.

## 10. Tests required

| Test | Proves | Must be seen failing first |
|---|---|---|
| `test/firebase-cache.test.js` | The Hosting rule exists for `**/*.@(css\|js\|mjs)` with the exact `Cache-Control` value | Yes — the rule did not exist before this SPEC |
| `npm test` (full suite) | No regression elsewhere | No — nothing else changes |
| `npm run check` | No syntax error | No |
| Manual, direct-to-Cloud-Run `curl` (no deploy needed) | The origin's `304`/`200` behaviour from SPEC-014 is unaffected | No — SPEC-014 already proved this; re-checked as a sanity measure |

## 11. Human validation required

Deployment, and the post-deploy production proof against
`https://thewallsol.com` (see the required verification list in §7,
items 2–7 as they apply to the live domain) — left entirely to the
operator. No production claim is made by this SPEC.
