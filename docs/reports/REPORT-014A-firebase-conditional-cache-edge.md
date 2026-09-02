# REPORT — SPEC-014A

**SPEC executed:** SPEC-014A-firebase-conditional-cache-edge
**Branch:** `spec/014a-firebase-conditional-cache-edge`
**Starting commit:** `4008426b987f903fc23efa1dda7255576f6a9d77` (`origin/master`)
**Date:** 2026-09-02

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

**Complete**, for the part this pass can prove without a deployment. The
Firebase Hosting header rule is added and locked by a test; whether it
actually makes the public edge return `304` is not yet proven — that
requires a real deployment and a request against
`https://thewallsol.com`, both explicitly out of this pass's scope.

## 2. Summary

SPEC-014's origin implementation works: direct requests to the Cloud
Run revision return `304` for a matching CSS/JS `ETag`. The public
Firebase Hosting URL reproducibly returned `200` with the full CSS body
for the same matching client `ETag` instead — this isolated the problem
to the Hosting/CDN layer, not `src/http.js`. `firebase.json` now applies
`Cache-Control: public, max-age=0, must-revalidate` to CSS/JS/MJS paths
at the Hosting layer, on top of the origin's unchanged `no-cache` +
`ETag`/`Last-Modified` response. Firebase Hosting documents that
Cloud-Run-backed content isn't cached by its CDN by default, and that
marking a dynamic response `public` makes it eligible — the
`max-age=0, must-revalidate` contract keeps it immediately stale (no
serving window) while enabling that eligibility.

## 3. Files created

| File | Purpose |
|---|---|
| `test/firebase-cache.test.js` | Locks the Hosting rule's presence and exact value |
| `docs/specs/SPEC-014A-firebase-conditional-cache-edge.md` | This pass's SPEC |
| `docs/reports/REPORT-014A-firebase-conditional-cache-edge.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `firebase.json` | New Hosting `headers` rule for `**/*.@(css\|js\|mjs)` → `Cache-Control: public, max-age=0, must-revalidate` | +7 |

Not changed: `src/http.js`, `src/server.js`, public assets or pages,
routing or business logic, security headers, media caching — confirmed
by `git diff` against `origin/master` touching only the files listed
above plus this SPEC/REPORT pair.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 426 / 426 / 0 fail (425 pre-existing + 1 new) |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

New test (`test/firebase-cache.test.js`): written against a
`firebase.json` that did not yet have the rule — it would have failed
before this change, since `find(...)` on an empty/absent
`hosting.headers` array returns `undefined` and the `assert.ok` fails.

## 6. Audit

No `scripts/audit.sh` run — not applicable to a Hosting-config change.

## 7. Drift check

No `scripts/drift.sh` run — same reason.

## 8. Invariants added

None.

## 9. Gaps

None against SPEC-014A's acceptance criteria 1, 2, 4, 5, 6, 7 (all
verifiable pre-deploy). Criterion 3 — the production Hosting URL
returning `304` — is explicitly not claimed here; closing it requires
the deployment and post-deploy proof listed in §11, not a gap in this
pass's own work.

## 10. Risks

The `max-age=0, must-revalidate` contract is deliberately chosen to
avoid introducing a stale serving window — the representation becomes
eligible for shared caching but must still be revalidated before reuse,
the same guarantee `no-cache` already gave, extended to the edge. The
production behaviour must still be proven after deployment: this report
makes no claim that Firebase will return `304` until that test is
performed against the public domain.

## 11. Requires human validation

Deployment, and after it, this exact production proof against
`https://thewallsol.com`:

- Public CSS request with exact `ETag` → `304`, empty body.
- Wrong `ETag` → `200`, complete body.
- `If-Modified-Since` valid → `304`.
- HTML remains `200` and has no validator behaviour.
- WebP/PNG/JPG/SVG/media cache behaviour remains unchanged.
- Direct Cloud Run origin continues to return the expected `304`.

Until those checks pass on `https://thewallsol.com`, SPEC-014A is not
considered successful in production. PR review and merge — also left to
the operator.

## 12. Still manual

Firebase Hosting's actual edge-caching/revalidation behaviour for
Cloud-Run-backed content can only be confirmed by a real deployment and
a real request against the public domain — nothing in this repository
can prove it locally.

## 13. Recommended next step

Deploy, then run the post-deploy proof checks listed in §11 against
`https://thewallsol.com` — the one thing this pass cannot do itself.
