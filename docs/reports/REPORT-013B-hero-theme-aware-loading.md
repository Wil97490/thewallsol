# REPORT — SPEC-013B

**SPEC executed:** SPEC-013B-hero-theme-aware-loading
**Branch:** `spec/013b-hero-theme-aware-loading`
**Starting commit:** `05b2b489c1f3c25849db62543c183555b8c57c58` (`origin/master`)
**Date:** 2026-09-02

Rule: nothing in this report is written that was not run. A test not
executed is reported as not executed, never as passed.

---

## 1. Overall result

**Complete.** The recommended CSS `background-image` solution works
correctly in a real browser for all 10 required scenarios — verified via
the Resource Timing API, not inferred from computed style alone.

## 2. Summary

Replaced the two `<img class="hero-monolith-dark/light">` with one
`<div class="hero-monolith">`, and retargeted `visual.css`'s rules from
`<img>`/`object-fit`/`display` to `background-image`/`background-size`,
reusing the exact same 3-state theme-selector shape already used for the
`display` toggle. Verified in a real browser, per-scenario, using
`performance.getEntriesByType('resource')` (correctly scoped to the
current document) as the authoritative source — a secondary tool,
`read_network_requests`, was found to return stale entries from earlier
in the same browser session and was not trusted for the pass/fail
determination (see §9).

## 3. Files created

| File | Purpose |
|---|---|
| `docs/specs/SPEC-013B-hero-theme-aware-loading.md` | This pass's SPEC |
| `docs/reports/REPORT-013B-hero-theme-aware-loading.md` | This report |

## 4. Files modified

| File | Change | Lines |
|---|---|---|
| `public/index.html` | Two `<img>` replaced by one `<div class="hero-monolith">` | 1 line touched |
| `public/css/visual.css` | `.hero-monolith` retargeted to `background-image`; 2 responsive `object-fit`→`background-size` swaps | 3 lines touched |
| `test/pages.test.js` | 2 new tests locking the markup/CSS shape | +25 |

No other file touched — confirmed by `git diff --stat` against
`origin/master` before committing.

## 5. Tests executed

| Command | Result | Measured |
|---|---|---|
| `npm test` | pass | 415 / 415 / 0 fail (413 pre-existing + 2 new) |
| `npm run check` | pass | `syntax ok` |
| `git diff --check` | pass | exit 0 |

New tests were written against the pre-change markup first (mentally
verified they'd fail — the old markup contains `hero-monolith-dark`/
`-light` and two `<img>` elements, which the new assertions explicitly
reject) — not executed in a red state as a separate step, since this is
a pure refactor with no server/business logic to run against; the
markup itself was inspected as the "before" state during the read-only
analysis phase.

## 6. Browser verification — the 10 required scenarios

All run against a local dev server (`STORAGE_BACKEND=memory`), a real
browser (Claude Browser pane), using `performance.getEntriesByType
('resource')` filtered to `monolith` as the authoritative signal for
"was this exact asset requested by this exact page load" — this API is
scoped to the current document and reset on every navigation, unlike
`read_network_requests`, which returned two stale entries (one per
theme) that did not correspond to the live test and are not used as
evidence anywhere below (see §9 for the full account of that
discrepancy).

| # | Scenario | Result |
|---|---|---|
| 1 | `data-theme="dark"` explicit (system dark) | Only `monolith-dark.webp` in the resource list. **PASS** |
| 1b | `data-theme="dark"` explicit, **system light** | Only `monolith-dark.webp`. Explicit dark confirmed to win over system light — the specific direction called out in the SPEC. **PASS** |
| 2 | `data-theme="light"` explicit (system dark) | Only `monolith-light.webp`. **PASS** |
| 3 | No `data-theme`, system dark | Only `monolith-dark.webp`. **PASS** |
| 4 | No `data-theme`, system light | Only `monolith-light.webp`. **PASS** |
| 5 | Toggle dark → light (real click on the Theme button) | `data-theme`/`localStorage` correctly updated to `light`; `background-image` computed style switched to `monolith-light.webp`; a new resource-timing entry for `monolith-light.webp` appeared exactly at toggle time (not before). `transferSize: 0` — **served from cache**, honestly reported: this exact URL had already been fetched many times earlier in this engagement's testing, so a real network transfer could not be observed here; the fact that a new resource-timing entry appeared at all, exactly when the toggle fired, is what's verified — not the cache/network split. **PASS on selection logic; cache state disclosed, not claimed as a fresh network fetch.** |
| 6 | Toggle light → dark | `data-theme`/`localStorage`/`background-image` correctly returned to dark. No new resource-timing entry appeared, because dark had already been requested earlier in the same tab (step 1). This is the exact "already cached, document it honestly" case anticipated in the brief — no new network need be observed, and none was claimed. **PASS on selection logic.** |
| 7 | Reload after a theme change | `localStorage` persisted; on reload, the resource list (freshly reset by the navigation) contained only the matching theme's asset. **PASS** |
| 8 | `prefers-reduced-motion` | CSSOM inspection of the served stylesheet: `.hero-monolith, .hero-art-glow { animation: none }` still present and targets the (renamed-tag, same-class) element — unchanged, because the class name was deliberately kept. Real emulation of `prefers-reduced-motion` is not available in this environment (documented limitation, same as in every prior audit in this engagement); CSSOM inspection is the fallback used. **PASS, with the same stated limitation as before.** |
| 9 | Asset missing / 404 | Forced `.hero-monolith`'s inline `background-image` to a nonexistent URL. Console showed exactly one `Failed to load resource: 404` (the network-level log every browser emits for any failed resource — not a JS exception). Screenshot confirmed no broken-image icon, no layout break — the frame simply renders as an empty dark panel with its own border/shadow intact. No `Uncaught`/exception in the console. **PASS.** |
| 10 | First paint | Screenshots taken for dark (explicit), light (explicit), and unstamped+system-dark — all three visually match the pre-existing design exactly (same crop, same drop-shadow, same framing). For the **unstamped** scenarios (3/4), there is no flash: the correct `background-image` resolves from pure CSS before any JS runs, exactly as before this change. For **explicit** scenarios (1/2), this SPEC does **not** claim to have fixed the pre-existing flash risk described in the read-only analysis (caused by `wall.js` being a deferred module that sets `data-theme` after DOM parsing, unlike the blocking `theme.js` used on other pages) — that risk is unchanged, not measured to be better or worse, and out of this SPEC's scope. **PASS on "no new flash introduced"; the pre-existing flash is not claimed to be fixed.** |

## 7. Network loading — the core claim

Verified, not inferred: in every one of the 6 initial-load combinations
(explicit dark/light × system dark/light, plus the two unstamped cases),
**exactly one** `.webp` resource ever appears in the current document's
resource list — the browser never requests the theme that isn't shown.
This was checked via `initiatorType: "css"` on the resource-timing entry
(confirming it's the CSS `background-image` mechanism, not a leftover
`<img>`) and by cross-checking `encodedBodySize` against the known real
file sizes (126,286 bytes for dark, 180,736 for light) to rule out a
false-positive from a differently-named resource.

## 8. Performance — bytes measured, not theoretical

- **Individual asset sizes**, re-confirmed via a direct `fetch(url,
  {cache:'reload'})` (bypassing the disk cache to get the real transfer):
  dark = 126,286 bytes, light = 180,736 bytes. `content-type: image/webp`,
  `cache-control: public, max-age=31536000, immutable` — both unchanged
  from `SPEC-011`, as required.
- **AVANT** (baseline, both images loaded on every visit, as they were on
  `origin/master` before this branch — this exact figure was independently
  measured multiple times earlier in this engagement, most recently in the
  `PR#12`/`PR#13` audits, and re-derived here as 126,286 + 180,736):
  **307,022 bytes.**
- **APRÈS** (this branch, measured live via the Resource Timing API and
  the direct `fetch` above): **126,286 bytes** when dark is shown, or
  **180,736 bytes** when light is shown — never both.
- **GAIN MESURÉ:** 180,736 bytes (−58.9%) saved when dark is the active
  theme, or 126,286 bytes (−41.1%) when light is active. Not a theoretical
  number — the "après" figures are the same `encodedBodySize`/`fetch`
  byte counts measured directly against the running branch, and the
  "avant" figure is the same two-file total independently measured
  several times earlier in this engagement against the pre-change
  markup.

## 9. A discrepancy investigated and resolved

`read_network_requests` initially reported **both** `monolith-dark.webp`
and `monolith-light.webp` as requested for the very first scenario
tested (explicit dark, system dark) — which would have meant the fix
doesn't work. Before accepting or reporting that, it was investigated:

- The served CSS was re-fetched directly (`curl`) and confirmed to match
  the intended edit exactly — the source was not the problem.
- `performance.getEntriesByType('resource')`, scoped strictly to the
  live document, showed only **one** entry (`monolith-dark.webp`,
  `initiatorType: "css"`) for the same page state.
- The two timestamps `read_network_requests` reported for "both" assets
  were identical across two separate checks taken moments apart, and did
  not change as the test proceeded — consistent with a stale, buffered
  log entry from earlier browser activity in this same long session
  (this exact tool limitation was already documented independently in
  this engagement's PR#14 final audit).

Conclusion: the CSS mechanism works; the initial "both requested"
reading was a tooling artifact, not a defect. Reported here in full
rather than silently discarded, per this engagement's own standing rule
against selectively citing evidence.

## 10. Responsive

1280 / 1024 / 900 / 720 / 390 / 320 — no horizontal overflow at any
width (`scrollWidth === clientWidth`, checked at each). `background-size`
confirmed `contain` above 960px and `cover` at and below it, matching the
pre-existing `object-fit` breakpoints exactly. Screenshots taken at 900px
and 320px show the same framing (no destructive crop) as every prior
audit of this hero in this engagement.

## 11. Accessibility

`.hero-art`'s `aria-hidden="true"` unchanged. The new `.hero-monolith`
div has no `role`, no text content, `tabIndex: -1` (not focusable), and
`.hero-art` contains zero focusable elements — identical accessibility
posture to the previous `<img alt="">` pair. No change to keyboard
navigation anywhere on the page.

## 12. Functional regression

24/24 seats present, panel and banners present, nav (4 links) and hero
CTA (`href="#wall"`) unchanged, 4 stats rendered. `/`, `/rules`, `/seen`,
`/refused`, `/terms`, `/checks` all return 200. No console error beyond
the one deliberately caused for scenario 9.

## 13. Audit

No `scripts/audit.sh` run — not applicable, this SPEC touches no
business logic it checks.

## 14. Drift check

No `scripts/drift.sh` run — same reason.

## 15. Invariants added

None.

## 16. Gaps

None against the SPEC's 12 acceptance criteria — all satisfied and
verified as described above.

## 17. Risks

- The `read_network_requests` tool's stale-buffer behavior (§9) means it
  should not be trusted alone for this class of "was exactly one asset
  requested" question in future sessions — `performance.getEntriesByType
  ('resource')` is the reliable source.
- The pre-existing flash-of-wrong-theme risk for explicit-theme
  returning visitors (§4/§6 scenario 10) remains — unrelated to this
  SPEC, not measured as better or worse.

## 18. Requires human validation

Push, PR review, merge — left to the operator, per instruction. Not done
in this pass.

## 19. Still manual

Real `prefers-reduced-motion` emulation is not available in this test
environment — verified via CSSOM inspection instead, same limitation as
every prior visual audit in this engagement.

## 20. Recommended next step

None specific to this SPEC — the two remaining known items (the
pre-existing explicit-theme flash, and `.hero-art-glow`'s redundancy)
were already flagged as separate, out-of-scope observations in earlier
reports and are not repeated here as new work.
