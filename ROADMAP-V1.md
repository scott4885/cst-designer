# CST Designer — ROADMAP v1

**Date:** 2026-04-18
**Scope:** Best-in-class tool for building custom dental schedule templates. Nothing else.
**Baseline:** Deployed at http://cst.142.93.182.236.sslip.io, 931/931 tests passing, RSW engine live, Next.js 16 / React 19 / Prisma+SQLite / Zustand / Tailwind 4 / shadcn-ui.

---

## Top 3 Strategic Themes

1. **Seasoned-OM quality by default** — generator's first draft must be keep-worthy, not salvage-worthy. Close orchestration gaps in the engine.
2. **Trust through transparency** — every block placement gets a one-line rationale the user can inspect.
3. **Edit ergonomics that beat Excel** — drag-to-move, Monday→all-days, clone provider. Turn the tool into the edit surface, not just the generator.

---

## Ranked Roadmap (12 items, impact scored /10)

### 1. Golden-schedule regression harness · Engine · M · 9
5 real offices × 5 days snapshotted; CI diffs on every PR. Foundation for all engine work.

**Done when:** `npm test` produces stable snapshots for 5 offices × 5 days; engine changes produce reviewable diffs.
**Files:** `src/lib/engine/__tests__/golden/*.snap`, `src/lib/mock-data.ts`, `src/lib/engine/__tests__/golden.test.ts`, `vitest.config.ts`
**Risks:** Snapshot churn from RNG — inject deterministic RNG.

### 2. Quality-floor retry envelope · Engine · S · 9
Wrap `generateSchedule()` — generate → score → retry up to N if below threshold → keep best. Surface attempts in UI.

**Done when:** Golden offices produce tier `good`+ ≥95% of runs.
**Files:** `src/lib/engine/generator.ts`, `src/lib/engine/quality-score.ts`, `src/app/api/offices/[id]/generate/route.ts`

### 3. 80/20 morning-load hard constraint · Engine · M · 8
Enforce "80% of restorative production by lunch." Auto-swap late-day HPs into morning slots. Surface in pacing panel.

**Done when:** Golden snapshots show morning ≥75% daily production across all 5 offices.
**Files:** `src/lib/engine/rock-sand-water.ts`, `goal-pacing.ts`, `quality-score.ts`, `GoalPacingPanel.tsx`

### 4. Default mix prescription everywhere · Engine · M · 9
Turn the Sprint-17 prescription engine from opt-in to the generator's backbone. Bake default role-based mixes; single "intensity" slider.

**Done when:** Brand-new office + one doctor + defaults → Monday has ≥3 distinct block categories, none exceeding 40%.
**Files:** `src/lib/engine/mix-prescription.ts`, `generator.ts`, `types.ts`, `PropertiesPanel.tsx`

### 5. "Why this block?" rationale on every placement · UX · M · 8
Each block placement emits a rationale string ("morning rock preferred", "fills A-time gap for Hyg 1 exam"). Show in BlockEditor + hover tooltip + generation log panel.

**Done when:** Every non-break cell has a visible hover rationale.
**Files:** `rock-sand-water.ts`, `types.ts`, `TimeSlotCell.tsx`, `BlockEditor.tsx`

### 6. Multi-column stagger visualization · UX · M · 8
Draw partner-links between staggered ops inline on the grid. Red glow for conflicts instead of hiding in a side panel.

**Done when:** 3-op stagger office shows visible partner-links; conflicts glow inline.
**Files:** `ScheduleGrid.tsx`, `TimeGridRenderer.tsx`, `ConflictOverlay.tsx`, `stagger-resolver.ts`

### 7. Grid aesthetic polish pass · UX · M · 7
Cell padding, typography, block depth (soft inner shadow, provider color-strip not full fill), hairline borders in neutral.

**Done when:** Side-by-side shows clearer density and hierarchy. Light-theme only.
**Files:** `TimeSlotCell.tsx`, `ScheduleGrid.tsx`, `globals.css`, `tailwind.config.ts`

### 8. Drag-to-move with live conflict feedback · Workflow · L · 8
dnd-kit drag, paint red/amber/green on hover, commit via existing `moveBlockInDay`.

**Done when:** Blocks drag with real-time conflict paint; undo restores exact position.
**Files:** `ScheduleGrid.tsx`, `TimeSlotInteraction.tsx`, `schedule-store.ts`, `conflict-detector.ts`

### 9. Provider management: inline + clone + bulk edit · Workflow · M · 7
(a) "+Add Provider" opens inline drawer. (b) Clone-provider button. (c) Bulk-edit pane.

**Done when:** User can add 3 providers in <90s; clone-then-rename works; bulk edit passes zod.
**Files:** `offices/[id]/edit/page.tsx`, `ProviderList.tsx`, `offices/[id]/route.ts`, `bulk-goals/route.ts`

### 10. Copy Monday to… with variant days · Workflow · M · 7
Proper "Copy day to…" modal with target checkboxes + element toggles. Variant-day support (EOF, opt1/opt2).

**Done when:** Build Monday → Copy to Tue/Wed/Thu with independent undo; variants round-trip through Excel.
**Files:** `offices/[id]/page.tsx`, `schedule-store.ts`, `CloneTemplateModal.tsx`, `prisma/schema.prisma`

### 11. Excel export fidelity vs real-office references · Exports · L · 7
Pixel-diff harness vs 5 reference xlsx. Match col widths, fonts, legend panels, naming.

**Done when:** Side-by-side spot check matches; CI conformance test per office.
**Files:** `lib/export/excel.ts`, `__tests__/excel-fidelity.test.ts`, reference fixtures, `export/route.ts`

### 12. Unified Review panel (Must Fix / Consider / Opportunity) · Validation · M · 7
Collapse ClinicalValidationPanel + ConflictPanel + quality-score deltas into one severity-ranked list with one-click fixes.

**Done when:** Any generated schedule shows ≤1 panel with severity-ranked items + jump-to-cell.
**Files:** `ClinicalValidationPanel.tsx`, `ConflictPanel.tsx`, `QualityScoreBadge.tsx`, `offices/[id]/page.tsx`

---

## Intentionally OUT of Scope

1. Real-time scheduling / appointment booking
2. Patient records / PHI
3. PMS two-way sync (Dentrix/OpenDental APIs) — export only
4. Practice-performance analytics dashboards
5. Multi-tenant SaaS / auth flows
6. Mobile-first layouts
7. LLM chatbot for "natural language editing"
8. Patient-facing portal

---

## Execution Plan — Next 10 Loops

| Loop | Item | Depends on | Parallel with |
|---|---|---|---|
| 1 | #1 Golden harness | — | — |
| 2 | #2 Quality-floor retry | 1 | — |
| 3 | #4 Default mix prescription | 1 | 4 |
| 4 | #3 80/20 morning-load | 1 | 3 |
| 5 | #5 "Why this block?" rationale | 2,3,4 | 6 |
| 6 | #6 Stagger visualization | — | 5 |
| 7 | #7 Grid aesthetic pass | 5,6 | — |
| 8 | #9 Provider management | — | — |
| 9 | #10 Copy day-to-day | 8 | — |
| 10 | #8 Drag-to-move + #12 Review panel | all above | 11 (deferred) |

Deferred to Loop 11+: #11 Excel fidelity (handoff work — do once engine has stabilized).
