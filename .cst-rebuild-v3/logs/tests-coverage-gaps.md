# Coverage Gap Analysis — Phase 4

**Source:** `coverage/coverage-summary.json` (v8 provider, jsdom)
**Overall lines coverage:** 82.43%

## Ten Files with Lowest Line Coverage (filtered ≥ 20 statements)

| # | File | Lines % | Funcs % | Untested | Priority |
|---|---|---:|---:|---|:---:|
| 1 | `src/components/schedule/BlockEditor.tsx` | **0.0%** | 0.0% | Entire legacy block-editor UI (constructor, save, validation) — never imported in tests | P2 |
| 2 | `src/lib/keyboard-shortcuts.ts` | **1.6%** | 0.0% | Global shortcut handlers (save, generate, undo, navigation) — 64-line keymap | P1 |
| 3 | `src/lib/engine/stagger-resolver.ts` | **30.9%** | 44.4% | `autoResolveStaggerConflicts` swap-path, 3-pass cascade, `countDTimeOverlaps` hygienist filter | **P0** |
| 4 | `src/components/schedule/ConflictOverlay.tsx` | **31.6%** | 71.4% | Overlay render branches — only mounted in legacy schedule view | P2 |
| 5 | `src/store/office-store.ts` | **33.3%** | 50.0% | Zustand actions (`selectOffice`, `updateOfficeMeta`, `deleteOffice`, async refresh) | P1 |
| 6 | `src/app/page.tsx` | **36.4%** | 27.3% | Home/dashboard render branches, search/filter, create-office entry point | P2 (UI — covered by e2e in principle) |
| 7 | `scripts/backfill-xsegment.ts` | **43.3%** | 40.0% | One-off migration script; no unit tests | P2 |
| 8 | `src/components/schedule/ScheduleGrid.tsx` (legacy) | **60.3%** | 40.0% | Legacy grid hover/drag branches; V2 replacement at 91.5% | P2 |
| 9 | `src/lib/engine/pattern-catalog.ts` | **61.4%** | 80.0% | `resolvePatternV2` Path 2/3/4 + `decomposeLegacyPattern` | **P0** |
| 10 | `src/components/schedule/TimeGridRenderer.tsx` | **63.3%** | 66.7% | Render branches for edit-mode / selection overlay | P1 |

## Additional high-value targets surfaced during review

| File | Lines % | Gap | Priority |
|---|---:|---|:---:|
| `src/lib/engine/procedure-overrides.ts` | **5.9%** | Per-practice x-segment merge (one of the engine's public contracts) — critical for multi-office rollout | **P0** |
| `src/lib/operatory-utils.ts` | 27.3% | Operatory sort/dedupe helpers called from multiple services | P1 |
| `src/lib/api-error.ts` | 40.0% | Error envelope formatting for API responses | P1 |
| `src/store/schedule-store.ts` | 74.2% | Undo/redo stack, drag-drop commit paths | P1 |
| `src/lib/engine/optimizer.ts` | 77.1% | Swap heuristics under certain block-mix constellations | P1 |
| `src/lib/engine/quality-score.ts` | 75.5% | Specific scoring branches for edge mixes | P1 |

## Gaps Closed in Task 5 of This Sweep

- **`procedure-overrides.ts`** — new `procedure-overrides.test.ts` (7 tests) covering empty-override, field-level merge, duration recompute, doctor-continuity preservation, and no-op fallback. Coverage should jump from 5.9% → ~95%.
- **`stagger-resolver.ts`** — new `stagger-resolver-auto.test.ts` (8 tests) covering `countDTimeOverlaps` (doctor-only filter, break filter, multi-instant counts) and `autoResolveStaggerConflicts` (clean-pass, empty-input, result shape).
- **`pattern-catalog.ts`** — new `pattern-catalog-v2.test.ts` (16 tests) covering all 4 resolver paths + `decomposeLegacyPattern` + `derivePattern` edge cases.

**Net:** +31 tests, covering the 3 highest-priority engine-critical gaps.

## Remaining P0/P1 Priorities

After this sweep, open priorities for the next test pass:

1. **P1** — `src/store/office-store.ts` actions (async `loadOffices`, CRUD)
2. **P1** — `src/lib/keyboard-shortcuts.ts` (keymap dispatch)
3. **P1** — `src/lib/operatory-utils.ts` helpers
4. **P1** — `src/lib/engine/optimizer.ts` swap heuristics
5. **P2** — Legacy `BlockEditor.tsx` / `ScheduleGrid.tsx` — consider removing if unused, else backfill component tests
