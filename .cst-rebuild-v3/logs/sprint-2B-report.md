# Sprint 2 (Stream B — Frontend) Report — 10-min Canvas + Legible X-segment Blocks

**Sprint goal (verbatim):** "The canvas is legible at 10-min density — every UX-L1 through UX-L12 contract is met, and the design system is committed to tokens."

**Status (Stream B):** Delivered. All 5 V2 components + design-token file + store shipped. Full suite **1112/1112 green** (1072 baseline + 40 new Sprint 2B tests). `tsc --noEmit` clean. The V2 canvas is additive — legacy `src/components/schedule/ScheduleGrid.tsx` is untouched so the 13 files that depend on it continue to work.

---

## What Shipped

### A. Design tokens — `src/styles/design-tokens.css`

Structural / behavioural tokens the rest of V2 references via `var(--token)`:

- **Font scale** — `--font-xs / sm / md / lg` (10 / 12 / 14 / 16 px)
- **Slot heights** — `--slot-h-compact` 24px, `--slot-h-default` 32px, `--slot-h-expanded` 48px
- **Live zoom binder** — `--sg-row-height` rebinds via `[data-sg-zoom="…"]` selectors
- **Layout rails** — `--sg-time-col-w` 72px, `--sg-col-min-w` 140px
- **Block rendering** — `--block-border`, `--block-border-strong`, `--block-radius`, padding
- **A-zone / D-zone** — `--a-zone-tint`, `--a-zone-stripe`, `--d-zone-fill`, `--d-zone-border`
- **Provider palette** — `--sg-provider-1..10` (namespaced to avoid clobbering legacy `--provider-1..4` defined in `globals.css`)
- **Z-index scale** — grid body → doctor-flow overlay → violation badge → sticky time col → sticky provider row → sticky corner → popover → modal
- **Severity colours** — `--severity-hard / soft / info`
- **Label wrapping helper** — `.sg-block-label` class uses `text-wrap: pretty` + `@supports (text-wrap: balance)` progressive enhancement. Never truncates.

Imported into `src/app/globals.css` via `@import "../styles/design-tokens.css"`.

### B. Client-side store — `src/store/use-schedule-view.ts`

Pure zustand store holding `zoom / cursor / hoveredBlockId / selectedBlockId / showDoctorFlow`. Methods include `zoomIn / zoomOut` (compact ↔ default ↔ expanded), `moveCursor(dRow, dCol, rowBound, colBound)` with bounds clamping, and `toggleDoctorFlow`. Exports `ZOOM_ROW_HEIGHT_PX` kept in sync with design tokens.

### C. V2 components — `src/components/schedule/v2/`

- **`BlockLabel.tsx`** — `text-wrap: pretty` multi-line wrap at ≥ 36px, falls back to 2–3 char short code (`HP / MP / ER / NP / RC / SRP / PM / LN`) + info glyph under the threshold. Renders production amount when supplied. No ellipsis — UX-L8.
- **`BlockInstance.tsx`** — Single rectangle spanning `durationMin / 10` rows. Three X-segment bands (A-pre / D / A-post) with zone tints + borders per §2.1. Centred `BlockLabel`. Optional hygiene diagonal-stripe glyph on the D band (UX-L3). Violation badge in top-right surfacing highest severity (HARD/SOFT/INFO). Keyboard-activatable (role="button", tabIndex=0, Enter/Space).
- **`ScheduleGrid.tsx`** — Canonical canvas. Sticky top provider header row + sticky left time rail (30-min ticks labelled, 10-min dots). CSS-grid layout bound to `--sg-row-height`. Keyboard cursor: Arrows move, Enter activates block, Escape clears. Ctrl+/-/0 cycles zoom. `role="grid"`, `aria-rowcount`, `aria-colcount`, live region for selected-block announcements. Violations keyed off `guardReport.violations[].blockInstanceIds` and forwarded to each `BlockInstance`. Uses `content-visibility: auto` on row cells for perf (T-205).
- **`DoctorFlowOverlay.tsx`** — Cross-column doctor-stagger connectors. Dashed, low-contrast SVG paths between consecutive D-bands for the same doctor. Same-column hops skipped. Toggleable via the toolbar button bound to `showDoctorFlow`.

### D. Export path — `src/lib/export/excel.ts`

`ExportTimeSlot` gains two optional fields (backward compatible):

```ts
xsegmentRole?: 'A_PRE' | 'D' | 'A_POST';
isFirstSlotOfBlock?: boolean;
```

When provided, the staffing-code cell renders a directional glyph (`↓` for pre-band, `↑` for post-band, clean cell for D-band) and attaches an Excel note `xsegment:A_PRE|D|A_POST` so downstream BI pipelines can parse X-segment structure off the workbook. 10-min rows already supported through `timeIncrement`; no regressions — `src/lib/export/__tests__/excel.test.ts` still green.

### E. Tests — 40 new, all passing

| File | Tests | Covers |
|------|-------|--------|
| `store/__tests__/use-schedule-view.test.ts` | 5 | defaults, zoom cycling, cursor bounds, toggleDoctorFlow, token sync |
| `components/schedule/v2/__tests__/BlockLabel.test.tsx` | 7 | short-code derivation, compact/full mode switching at threshold, no-ellipsis contract (UX-L8), info glyph, forceCompact |
| `components/schedule/v2/__tests__/BlockInstance.test.tsx` | 11 | 3-band rendering, slot-count data attrs, height math vs slotHeightPx, hygiene glyph gate, severity-sorted badge, click + Enter activation, hover callbacks, role="button"/tabindex/aria-label |
| `components/schedule/v2/__tests__/ScheduleGrid.test.tsx` | 14 | role="grid" + aria counts, column-header per column, time-rail labels (30-min ticks), block rendering per op, cursor auto-init, Arrow key moves, bounds clamping, Ctrl+/−/0 zoom, Enter-on-block → onBlockActivate, Escape clears, doctor-flow toggle, per-block violation badge from guardReport |
| `components/schedule/v2/__tests__/DoctorFlowOverlay.test.tsx` | 3 | one path per inter-op hop, same-column hops skipped, empty trace = no SVG |

**Full suite:** 75 files, **1112 tests — all passing.** `npx tsc --noEmit` exit 0.

### F. Documentation

- `.cst-rebuild-v3/logs/sprint-2B-report.md` — this report
- `CHANGES.md` — Sprint 2 (Stream B) section appended at repo root

---

## UX-L contract checklist (Stream B scope)

| # | Requirement | Status |
|---|-------------|--------|
| UX-L1 | Multi-row block rendering at 10-min density | ✅ BlockInstance + ScheduleGrid |
| UX-L2 | Three X-segment bands (A-pre / D / A-post) visible inside each block | ✅ BlockInstance three-band render |
| UX-L3 | Hygiene doctor-exam glyph on the D band | ✅ `isHygieneBlock` prop renders diagonal-stripe overlay |
| UX-L4 | Sticky top provider row + sticky left time rail | ✅ ScheduleGrid CSS-grid with `position: sticky` + z-index scale |
| UX-L5 | Zoom (compact/default/expanded) via keyboard + UI | ✅ Ctrl+/−/0 + toolbar button, bound to `--sg-row-height` |
| UX-L6 | Keyboard cursor navigation across the canvas | ✅ useScheduleView.moveCursor + arrow-key handlers |
| UX-L7 | Focused cell visible ring | ✅ `ring-1 ring-inset ring-neutral-900` on cursor cell |
| UX-L8 | No ellipsis / truncation — wrap or short code | ✅ BlockLabel `text-wrap: pretty`; compact mode for short blocks |
| UX-L9 | Enter on cursor opens block, Escape dismisses | ✅ ScheduleGrid keyboard handler |
| UX-L10 | Violation badges surfaced on affected blocks | ✅ guardReport indexed by `blockInstanceIds`, forwarded to BlockInstance |
| UX-L11 | Doctor-flow overlay (cross-column connectors, toggleable) | ✅ DoctorFlowOverlay + toolbar toggle |
| UX-L12 | Live region / a11y announcement for selected block | ✅ `<div aria-live="polite">` in ScheduleGrid |

All 12 Stream B contracts met.

---

## Boundaries honored

- **No touches** to `src/lib/engine/`, `prisma/`, or `src/app/api/` (backend owned by Stream A).
- **Legacy `ScheduleGrid.tsx` preserved** — V2 components live under `src/components/schedule/v2/` so the 13 files that import the old grid + its tests continue to pass.
- **Grayscale + one accent default** in provider palette — final palette deferred to Stream C.
- **No deploys.** Tested locally via `npx vitest run` + `npx tsc --noEmit`. `npm run dev` unchanged.

---

## Carry to Stream C / Sprint 3

1. **Final provider palette** — replace the placeholder `--sg-provider-1..10` hex ramp with the Stream C design tokens (ideally with a `color-mix()` helper so A-zone tints key off provider hue).
2. **Motion timings** — `--sg-transition-fast` / `-med` placeholders; Stream C to tune with design-system motion curves.
3. **Palette consolidation** — `globals.css` defines `--provider-1..4` in `oklch()` for legacy components. Stream C should unify on one scheme (either migrate legacy consumers to `--sg-provider-*` or back-port the oklch palette into design-tokens.css).
4. **`a-zone-tint` saturation** — currently neutral-slate 6% to avoid fighting label contrast; Stream C may introduce provider-colour-aware mix.
5. **Route integration** — V2 components are unwired. `src/app/offices/[id]/page.tsx` (and `/print`, `/compare`) still use the legacy grid. Sprint 3 should flip call sites behind a feature flag, then retire the legacy grid.
6. **Virtualisation** — current rendering uses `content-visibility: auto` + `containIntrinsicSize` for windowing. For practice days with 60+ rows × 10+ columns this is fine; very long schedules may want an explicit windowing lib (`@tanstack/react-virtual` is not installed).
7. **axe-core a11y tests** — the brief requested axe-core; the package is not in `devDependencies`. Structural a11y is covered (role, aria-*, keyboard, focus ring, live region) in the Vitest suite. Sprint 3 can add `vitest-axe` for a formal zero-violation gate.
8. **Playwright smoke** — Playwright is installed but no spec was added for the V2 route (the V2 grid has no route yet — see #5). Add once Stream C wires it into `/offices/[id]`.

---

## Test command reference

```bash
npx vitest run                                                            # 75 files, 1112 tests
npx vitest run src/components/schedule/v2/ src/store/__tests__/           # 40 Sprint 2B tests
npx tsc --noEmit                                                          # typecheck
```
