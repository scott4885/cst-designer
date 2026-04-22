# Phase 4 — Interaction Verification

Date: 2026-04-21
Specs run:
- `e2e/qa-visual-phase4.spec.ts` (baseline matrix + interactions)
- `e2e/qa-visual-phase4-generated.spec.ts` (post-generation interactions)
- `e2e/qa-visual-phase4-matrix.spec.ts` (comprehensive)
- `e2e/qa-visual-phase4-gen3.spec.ts` (diagnostic)

Playwright version: `@playwright/test ^1.59.1`

## Results

| # | Contract | Result | Evidence / note |
|---|---|---|---|
| I-1 | Hover block → popover appears within 300 ms | **FAIL / N/A** | Block elements not present on the rendered route (legacy grid, not V2). Probe never found a `[data-block-instance]`. Blocked by D-P0-1. |
| I-2 | Click block → selection outline | **FAIL / N/A** | Same as I-1. |
| I-3 | Keyboard arrows move cursor cell | **FAIL** | `[role="grid"]` absent. Arrow keys scroll the page instead. |
| I-4 | Ctrl+= / Ctrl++ increases zoom | **FAIL** | `data-sg-zoom` attribute absent in rendered DOM. The keystroke triggered browser zoom, not app zoom (diag annotation: `initial=null plus=null`). |
| I-5 | Ctrl+0 resets zoom | **FAIL** | Same root cause as I-4. |
| I-6 | Tab cycles through provider headers then grid cells | **PARTIAL PASS** | Tab order through static UI chrome is logical (see `qa-a11y.md`). The "then grid cells" portion cannot be exercised because grid cells have no tabindex on the rendered legacy grid. |
| I-7 | Escape closes popovers | **UNKNOWN** | No popover fired to test against. |
| I-8 | Generate Schedule CTA populates the canvas | **PASS (intermittent)** | `41-post-generate.png` shows a fully populated schedule with provider columns (Dr. Kevin Fitzpatrick DP1/OP2, Cheryl Diaz RDH HYG2, Luke Knader RDH HYG4), guard review panel, production summary, and a "Schedule generated for Monday" toast. Later runs (`50-pop-*`) did not populate; root cause suspected dev-mode HMR race or that the `[role="grid"]` wait condition matched the sidebar palette, letting the test proceed before the center CTA completed its post-click render. |
| I-9 | Toolbar "Generate" button populates the canvas | **FAIL** | The top-right "Generate" button in the toolbar produced no visible state change. Only the center "Generate Schedule" CTA works. See D-P0-3. |
| I-10 | Doctor-flow overlay toggle | **FAIL / N/A** | No button matching `/doctor.?flow|flow overlay/i` found on the rendered route. V2 `DoctorFlowOverlay` is not mounted. Blocked by D-P0-1. |
| I-11 | Guard Report panel renders after generation | **PASS** | `41-post-generate.png` shows the right-side "Review" panel populated with "Double meeting at 07:30" and "Cauldron" violations. `[data-guard-panel]` attribute present on the panel root. |
| I-12 | Production summary renders after generation | **PASS** | Visible in `41-post-generate.png` bottom-right; three provider rows with "$0" / goal bars. |
| I-13 | Success toast on generate | **PASS** | "Schedule generated for Monday" toast visible at screenshot capture time in `41-post-generate.png`. |
| I-14 | Responsive at 1920 / 1440 / 1280 / 1024 px | **PASS** | No layout overflow observed. Left palette, center canvas, toolbar ribbon all stack correctly. |
| I-15 | Responsive at 768 px | **PASS (with caveat)** | Layout compresses to sidebar-drawer pattern. Header buttons shrink to icons. Per NFR-5 this is outside required scope but degrades gracefully. |
| I-16 | Responsive at 390 px | **PARTIAL** | Mobile layout renders but far-right toolbar icons cropped. Per NFR-5 outside scope. |
| I-17 | Navigation — back link to office list | **PASS** | Breadcrumb "Offices" link and in-page back button both return to `/`. |
| I-18 | Day selector switches day | Not exercised | Only Monday tested. |
| I-19 | Full-screen toggle | Not exercised | Toolbar button present; entering true full-screen from Playwright changes viewport semantics so deferred. |

## Summary

| Bucket | Count |
|---|---|
| Pass | 6 |
| Partial pass | 3 |
| Fail — blocked by D-P0-1 (V2 not on route) | 6 |
| Fail — other | 1 (D-P0-3 toolbar Generate) |
| Unknown / not exercised | 3 |

## Notes

- All "fail" results blocked by D-P0-1 will flip to "testable" once the V2 grid is mounted on `/offices/[id]`. Interactions are **unit-tested green** in Vitest per sprint-2B report (1112/1112 passing) but not end-to-end verified because the component isn't reachable.
- The one non-blocked failure (I-9, toolbar Generate) is a real UX bug that users will hit first.
- Playwright was unable to reliably time the sub-300 ms hover-popover contract because no block elements exist on the route. Add `await page.waitForSelector('[data-block-instance]')` with a real test once D-P0-1 ships.
