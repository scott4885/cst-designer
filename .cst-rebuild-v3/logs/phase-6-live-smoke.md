# Phase 6 — Live-Smoke QA Report

**URL tested:** http://cst.142.93.182.236.sslip.io/
**Commit under test:** `dcddb3c` on `scott4885/cst-designer:main` (deployed via Coolify rebuild `d0swso8sok00sc4csww8k8gg`, finished 2026-04-22 01:39:38 UTC)
**Build ID (live):** ETag `"184eud1icrqobe"` (root), `"rmiguclqvs7d5"` (/offices)
**Smoke timestamp:** 2026-04-22 ~01:47–01:55 UTC
**Operator:** Claude (Opus 4.7)
**Tooling:** Playwright 1.59.1 headless Chromium @ DPR 1.5, axe-core WCAG 2.0/2.1/2.2 AA ruleset

---

## TL;DR Verdict

**NEEDS-FIX.** All three D-P0 Sprint-4 blockers verify as fixed on live. The V2 ScheduleGrid is mounted, `/offices` redirects, and the toolbar Generate button triggers generation end-to-end. However, **two of the UX-L contracts it was supposed to enable are not functional on the live bundle**: keyboard zoom (UX-L5) and keyboard cursor navigation (UX-L3/L4 arrow nav). These are P1, not P0 — ship-blocking is a judgement call. Plus axe-core surfaces one critical and two serious WCAG violations on the populated schedule. Not a rollback — deploy is good, but a Sprint 5 fix pass is required before GA.

---

## Step 2 — Verdict Matrix

### D-P0 blockers from Sprint 4

| ID | What it claimed | Verdict on live | Evidence |
|----|-----------------|-----------------|----------|
| **D-P0-1** V2 ScheduleGrid mounted on `/offices/[id]` | PASS | YES | After clicking Generate on `/offices/cmo6h1ttk000e18s0l30estqm`: `role="grid"` count = 1, `role="gridcell"` = 198, `role="columnheader"` = 3, `role="rowheader"` = 66, `[data-schedule-v2]` = 1. Visual evidence in `phase-6-screenshots/04-post-generate.png` shows provider headers (Dr sctt OP1/OP2, jane HYG1), three-zone segment banding (UX-L2), hygiene diagonal-stripe glyph (UX-L3), conflict review rail with severity outlines (UX-L9), production rollup, Doctor-flow toggle, week-type badge ("default" pill — UX-L10). |
| **D-P0-2** `/offices` returns 2xx / 3xx | PASS | YES | `curl -I` on `/offices` → **HTTP 307** with `Location: /`. Was 404 pre-deploy. |
| **D-P0-3** Toolbar "Generate" wires to generation action | PASS | YES | Playwright clicked the toolbar Generate (ambiguous CTA disambiguation: first `button[name="Generate"]` — which is the toolbar button, not "Generate Schedule" center). Grid appeared within 10-s wait window. Post-click: `gridCount` went from 0 → 1, `gridCells` 0 → 198, `dataScheduleV2` 0 → 1. The empty-state `02-pre-generate.png` shows both CTAs; the populated `04-post-generate.png` shows the toolbar button has swapped to "Regenerate" (nice UX) and the canvas is rendered. |

### Phase 4 visual P0s — recheck on live

| ID | Status | Notes |
|----|--------|-------|
| D-P0-1 | **FIXED** | See table above. |
| D-P0-2 | **FIXED** | See table above. |
| D-P0-3 | **FIXED** | See table above. |

All three P0s from `qa-visual-defects.md` close. No P0 regressions.

### Phase 4 P1/P2 recheck (spot sample)

| ID | Phase 4 description | Live status |
|----|---------------------|-------------|
| D-P1-1 | Invalid office id = 1s toast, no 404 page | **NOT RETESTED** — didn't hit invalid id; live has 4 offices, all valid. |
| D-P1-2 | Next.js "N" devtools badge overlaps collapse chevron | **FIXED** (inferred) — prod build, no Turbopack/dev portal observed. Home screenshots at all 5 widths: no "N" badge visible. |
| D-P1-3 | `role="grid"` missing | **FIXED** — 1 grid, 198 cells, 3 col-headers, 66 row-headers. |
| D-P1-4 | Tab order bleeds into nextjs-portal | **FIXED** (inferred) — prod build, no dev portal in DOM. |
| D-P1-5 | "DRAG BLOCKS ONTO THE GRID" in empty state | **STILL PRESENT** — `03-office-detail-empty.png` still shows this header in left sidebar while center shows "Start building your schedule". Same copy mismatch as Phase 4. |
| D-P1-6 | Inactive day selectors look unclickable | **STILL PRESENT** — populated `04-post-generate.png` shows "Thu" active, "Fri" plain grey text. No visible "has schedule" indicator. Also: live has only Thu/Fri (workingDays), not Mon-Fri, so the Phase 4 framing is partially obsolete. |
| D-P2-3 | Hover popover timing unverifiable | **UNVERIFIED AGAIN** — see new finding below (`hasBlock=false` on populated view, `[data-block-instance]` selector returns 0 despite 198 gridcells). Hover contract could not be exercised by automation. |
| D-P2-4 | `data-sg-zoom` not present → Ctrl+= = browser zoom | **PARTIALLY FIXED** — `data-sg-zoom` attribute IS now in the DOM (reads `"default"`), so V2 mounted the attribute. BUT Ctrl+= does NOT change it (`z0=default → z1=default → z2=default`). See NEW-P1-B below. |
| D-P2-5 | Low-contrast "No Schedule" badge | **STILL PRESENT** (see `01-home-1920.png`) — badge still reads slate-on-slate. |
| D-P2-6 | Breadcrumb weak affordance | **STILL PRESENT** — same weight on "Offices" and "test.4.19" in `03-office-detail-empty.png`. |

---

## Step 3 — New issues found on live (not in Phase 4 QA)

### NEW-P1-A — Keyboard arrow navigation does not move grid cursor

- **Where:** Populated schedule, `/offices/[id]` after Generate.
- **Evidence:** `phase-6-screenshots/05-ux-interactions.json` → `arrowMoved: "before=none after=none moved=false"`.
- **Repro:** Click first `[role="gridcell"]`, press ArrowDown. No element receives `aria-current="true"` or `data-cursor="true"` before or after the keystroke.
- **Impact:** UX-L cursor/arrow-key navigation is supposed to be live per Sprint 2C. Without it, keyboard-only users cannot navigate schedule cells. Partial WCAG 2.1 AA 2.1.1 (Keyboard) non-conformance on the core data surface.
- **Severity:** P1.
- **Suspected cause:** `ScheduleGridV2` mounts but the cursor state (`aria-current="true"` on a focused gridcell) is never set on initial click. Either the click handler on gridcell doesn't update `useScheduleStore.cursor`, or the key listener is bound to a parent that isn't receiving focus.

### NEW-P1-B — Ctrl+= / Ctrl+0 keyboard zoom shortcut does not update `data-sg-zoom`

- **Where:** Populated schedule, `/offices/[id]` after Generate.
- **Evidence:** `phase-6-screenshots/05-ux-interactions.json` → `zoom: {z0:"default", z1:"default", z2:"default"}`. The attribute exists and initialises to `"default"`, but Ctrl+= and Ctrl+0 do not mutate it.
- **Impact:** UX-L5 "Zoom control" partially broken. Users likely still have a toolbar zoom control that works (not tested), but the keyboard shortcut doesn't. Also — since the attribute holds the literal string `"default"` not `"100"`, the discrete-step contract (75/100/125/150) appears to be pre-release and the attribute is a stub.
- **Severity:** P1.
- **Suspected cause:** The keyboard listener was stubbed or never wired. `useKeyboardShortcuts` hook likely missing a `Ctrl+Equal` case.

### NEW-P1-C — `[data-block-instance]` attribute missing on live build, despite cells being populated

- **Where:** Populated schedule post-generate.
- **Evidence:** `phase-6-screenshots/04-generate-result.json` → `postProbe.blocks = 0`, `postProbe.gridCells = 198`. Hover/click automation (`05-ux-interactions.json` → `hasBlock: false`) could not find any block to interact with, so UX-L4 hover-popover timing remains unverified.
- **Impact:** Either (a) the blocks attribute name changed to something else (e.g. `data-block-id`, `data-segment`) and the QA spec needs updating, or (b) the V2 canvas isn't actually rendering block instances into gridcells and the "SRP>$300 / $300" text visible in the screenshot is coming from a different codepath. Visual inspection of `04-post-generate.png` shows only ~1-2 cells populated despite 198 grid cells — suggests engine is generating very sparse output for a 2-provider/2-day office, OR the majority of cells are blank scaffolding.
- **Severity:** P1 (ambiguous — might be a QA-selector issue, might be a real contract gap).
- **Suggested follow-up:** Sprint 5 — lock in a stable `data-block-instance` selector contract OR publish the correct selector in the test helper catalog.

### NEW-P1-D — axe-core critical + serious WCAG violations on populated schedule

- **Where:** `/offices/[id]` post-generate, axe-core scan against wcag2aa + wcag21aa + wcag22aa tags.
- **Evidence:** `phase-6-screenshots/06-a11y.json`:

| Rule | Impact | Node count |
|------|--------|-----------|
| `aria-required-children` | critical | 1 |
| `aria-required-parent` | critical | 267 |
| `color-contrast` | serious | 30 |
| `link-name` | serious | 10 |

- **Interpretation:**
  - **`aria-required-parent` × 267** is the big one. A `role="rowheader"` must live inside a `role="row"`; a `role="gridcell"` must live inside a `role="row"` inside a `role="grid"`. 66 rowheaders + 198 gridcells + 3 columnheaders = 267 — exactly the count. That means the V2 grid is missing the intermediate `role="row"` wrappers. The children are directly inside the `role="grid"` container.
  - **`aria-required-children`** (1 node) — inverse of above; the grid has children but not the right ones.
  - **`color-contrast` × 30** — likely includes the "No Schedule" grey-on-grey badge (D-P2-5), and maybe day-selector inactive-day text (D-P1-6).
  - **`link-name` × 10** — sidebar nav items with icon-only + aria-label mismatch, or anchor-tags with no accessible name. Needs node-level inspection.
- **Impact:** WCAG 2.2 AA fail. The rowheader/gridcell without row parent means screen readers cannot announce grid structure correctly — users will hear cells but no row context ("3 of 3", "row 2 col 1" etc).
- **Severity:** P1 — not P0 because the happy-path still works, but this is the kind of thing a11y audit reports will flag as a blocker for healthcare SaaS procurement.
- **Suggested fix:** Wrap each row in `<div role="row">` inside `ScheduleGridV2`. Sprint 5 candidate.

### NEW-P2-A — `_rsc` prefetch `ERR_ABORTED` on home page hover

- **Where:** Home page, on hover of office card links.
- **Evidence:** `phase-6-screenshots/01-home-diag.json` → 8 × `GET /offices/<id>?_rsc=... — net::ERR_ABORTED`.
- **Impact:** None, these are Next.js router prefetch aborts (hover initiates, navigation happens, prefetch abandoned). Normal Next.js 16 behavior but noisy in DevTools.
- **Severity:** P2 (informational — no user impact).
- **Fix:** None required.

---

## Browser console errors

**Zero** `console.error` events and **zero** uncaught `pageerror` events across all six spec runs spanning home, offices/[id] empty, offices/[id] populated, doctor-flow toggle, zoom probe, and a11y probe. The only `requestfailed` events are the benign RSC prefetch aborts noted above.

No hydration mismatch warnings observed.

---

## a11y scan summary

- **axe-core ruleset:** wcag2a + wcag2aa + wcag21aa + wcag22aa
- **Passes:** 26 rules
- **Violations:** 4 rules (2 critical, 2 serious — see NEW-P1-D)
- **Incomplete:** 2 rules (axe couldn't determine — typical for color-contrast on gradients)

Structural probe (post-generate):
- `gridCount` = 1, `colHeaderCount` = 3, `rowHeaderCount` = 66, `gridCellCount` = 198, `ariaLiveCount` = 2
- `buttonsWithoutName` = 0 (all buttons have accessible names — good)
- `positiveTabindex` = 0 (no tabindex anti-patterns — good)

---

## Screenshots

Saved to `.cst-rebuild-v3/logs/phase-6-screenshots/` (gitignored):

| File | Viewport | Content |
|------|----------|---------|
| `01-home-1920.png` | 1920×1080 | Home with 4 office cards |
| `home-1920.png` | 1920×1080 | Home matrix sample |
| `home-1440.png` | 1440×900 | Home matrix sample |
| `home-1280.png` | 1280×800 | Home matrix sample |
| `home-1024.png` | 1024×768 | Home matrix sample |
| `home-768.png` | 768×1024 | Home matrix sample (phone/tablet) |
| `03-office-detail-empty.png` | 1440×900 | `/offices/[id]` empty state — "Start building your schedule" + palette |
| `04-pre-generate.png` | 1440×900 | Same empty state pre-click |
| `04-post-generate.png` | 1440×900 | V2 canvas after toolbar Generate — populated |
| `05-populated-1920.png` | 1920×1080 | V2 canvas populated with conflict review rail + production rollup |
| `05-doctor-flow-on.png` | 1920×1080 | After clicking Doctor flow toggle |

All screenshots captured at DPR 1.5 for readability.

---

## Step 4 — Sprint 5 scope signal

Reading the Phase 4 register + live findings against Sprint 5 objectives, these Sprint 5 candidates are validated by live data:

1. **Keyboard contract hardening** — arrow nav + zoom shortcuts are stubbed but inert. Sprint 5 should own `useKeyboardShortcuts` tests for Ctrl+=, Ctrl+-, Ctrl+0, Arrow keys, Escape.
2. **a11y row-wrapping** — V2 grid missing `role="row"` wrappers. 267 nodes violating `aria-required-parent`. Single-commit fix, unblocks WCAG AA conformance.
3. **Empty-state copy cleanup** — "DRAG BLOCKS ONTO THE GRID" sidebar header contradicts the empty center CTA. Relabel to "Blocks available after generation" (Phase 4 suggestion D-P1-5).
4. **Data-attribute contract** — publish a stable block-instance / cursor / focus-ring attribute catalog so QA automation and screen readers can find blocks reliably (NEW-P1-C).
5. **Color contrast pass** — 30 nodes fail color-contrast AA. "No Schedule" badge + day-selector grey-on-grey are the obvious offenders.
6. **Link-name a11y** — 10 anchors without discernible names. Likely sidebar nav icon-only buttons.
7. **Block-instance rendering audit** — 198 gridcells but only a few visually populated cells. Either the engine output is sparse on the 2-provider test office (expected), or the renderer is silently dropping blocks. Instrument.

---

## Final verdict

**NEEDS-FIX.**

The Sprint 4 deliverables that were the point of this deploy (V2 grid live, `/offices` redirect, toolbar Generate wired) all verify on the live URL. Zero console errors. No hydration problems. No regressions in page structure.

However:
- Two UX-L contracts that require V2 mount (keyboard zoom + arrow cursor) are inert.
- axe-core surfaces 2 critical + 2 serious WCAG violations on the populated schedule — the `aria-required-parent` fix (add `role="row"` wrappers) is a small, high-leverage Sprint 5 commit.
- Three Phase 4 P1/P2 defects remain unpatched (empty-state copy, day-selector state, breadcrumb weight, low-contrast badge).

These are P1 issues, not P0. The deploy should **stay live** for stakeholder demos and internal validation. Schedule Sprint 5 to close NEW-P1-A through NEW-P1-D plus the outstanding Phase 4 P1s before GA to external customers.

---

## Artifact inventory

- **Scratch spec** (gitignored): `e2e/qa-phase6-live-smoke.spec.ts`
- **Scratch config** (gitignored): `playwright.phase6.config.ts`
- **Screenshots + JSON diagnostics**: `.cst-rebuild-v3/logs/phase-6-screenshots/` (gitignored)
- **This report**: `.cst-rebuild-v3/logs/phase-6-live-smoke.md` (tracked)

No production code modified. No pushes made.

Run command for future live smokes:
```bash
cd tools/cst-designer && npx playwright test --config=playwright.phase6.config.ts
```
