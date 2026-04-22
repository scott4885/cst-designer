# Sprint 1 Report — X-segment Engine + Coordinator + Policy + Guard

**Sprint goal (verbatim):** "The engine solves on the X-segment graph and every block carries three-segment data through persistence, generation, and a basic render."

**Status:** Delivered. All 10 deliverables (A–J) complete; 1072/1072 tests pass including 53 new Sprint 1 unit + integration tests. TypeScript type-check clean.

---

## What Shipped

### A. Canonical type contracts — `src/lib/engine/types.ts`

Published the coordination contracts the brief specified:

```ts
export interface XSegmentTemplate {
  readonly asstPreMin: number;
  readonly doctorMin: number;
  readonly asstPostMin: number;
  readonly doctorContinuityRequired?: boolean;
  readonly examWindowMin?: { earliestUnitIdx: number; latestUnitIdx: number };
}

export type PracticeModelCode = '1D1O' | '1D2O' | '1D3O' | '1D4O'
  | '2D3O' | '2D4O' | '2D5O' | '2D6O'
  | '1D2O_3H' | '2D4O_2H' | 'CUSTOM';

export type ProductionTargetPolicy = 'JAMESON_50' | 'LEVIN_60' | 'FARRAN_75_BY_NOON' | 'CUSTOM';
export type EfdaScopeLevel = 'NONE' | 'LIMITED' | 'BROAD';
export type DayOfWeekCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface PlacedBlock {
  blockInstanceId; blockTypeId; blockLabel; providerId; operatory;
  startMinute; durationMin;
  asstPreMin; doctorMin; asstPostMin;     // ← Sprint 1 three-segment data
  doctorStartMinute?; doctorContinuityRequired?;
  productionAmount?; rationale?;
}

export interface DoctorScheduleTrace { /* ... */ }
export interface Violation     { ap; code; message; severity; ... }
export interface GuardResult   { ap; passed; violations }
export interface GuardReport   { passed; results; violations; counts }
export interface GeneratedSchedule {
  dayOfWeek: DayOfWeekCode;
  blocks: PlacedBlock[];
  doctorTrace: DoctorScheduleTrace[];
  guardReport: GuardReport;
  warnings: string[];
  policy?: { ... };
}
```

`BlockTypeInput.pattern` is now marked `@deprecated`; callers should prefer `xSegment` per Bible §2.1. `ProviderInput` gains `dayOfWeekRoster: DayOfWeekCode[]`.

### B. Prisma migration — `xsegment_and_policy`

Path: `prisma/migrations/20260421000000_xsegment_and_policy/migration.sql`

Added columns with constant-default `ALTER TABLE ADD COLUMN` (SQLite-safe, no RedefineTables needed):

- **BlockType**: `asstPreMin`, `doctorMin`, `asstPostMin`, `doctorContinuityRequired`
- **Office**: `practiceModel` (default `'1D2O'`), `productionPolicy` (default `'JAMESON_50'`), `maxConcurrentDoctorOps` (2), `doctorTransitionBufferMin` (0), `efdaScopeLevel` (`'NONE'`)
- **Provider**: `dayOfWeekRoster` (default `["MON","TUE","WED","THU","FRI"]`)

Schema updated in `prisma/schema.prisma`. `npx prisma generate` regenerates the client cleanly. Dev DB columns were added directly via `better-sqlite3` because `prisma migrate deploy` tripped on a pre-existing unrelated migration (`20260418200000_add_schedule_variant_label`) whose columns had already been manually applied. The migration SQL itself is correct for a fresh DB.

### C. Backfill script — `scripts/backfill-xsegment.ts`

Dry-run by default; `--apply` writes; `--office=<id>` scopes to one office. Exports the decomposer as `decomposePattern()` so tests can import it without running the CLI.

Decomposition precedence (matches Bible §2.1 + PRD-V4 §9.5):
1. `pattern` array present → scan `A-run / D-run / A-run`
2. `dTimeMin` + `aTimeMin` fields → map to `doctorMin` + `asstPostMin`
3. Hygiene block (no D/A) → `asstPreMin = dur-10, doctorMin = 10`
4. Fallback → whole duration becomes `doctorMin`

### D. MultiColumnCoordinator — `src/lib/engine/multi-column-coordinator.ts`

`class MultiColumnCoordinator` with three public methods:

- `canPlaceDoctorSegment(req)` — non-mutating admissibility check.
- `reserveDoctorSegment(req)` — commit placement if admissible.
- `findDoctorSegmentSlot({ earliestStartMin, latestStartMin, stepMin })` — scan for earliest admissible block-start.

Enforces Bible rules R-3.1 through R-3.6:
- **R-3.1 / R-3.3** Max-concurrent gate + EFDA scope cap (`NONE→1`, `LIMITED→2`, `BROAD→4`).
- **R-3.2** `doctorTransitionBufferMin` between inter-op transitions.
- **R-3.5** `examWindowMin` for hygiene D-bands.
- **R-3.6** Continuity-required bands serialize — new continuity band may not overlap any existing reservation, and no band may overlap an existing continuity-required reservation.

Emits `DoctorScheduleTrace[]` via `.trace()` with `concurrencyIndex` per band.

### E. Production policies — `src/lib/engine/production-policy.ts`

Exports `POLICIES: Record<ProductionTargetPolicy, PolicyParams>` with the four canonical policies (Jameson 50%, Levin 60%, Farran 75% by noon, Custom), `getPolicy()`, `pickBlockMixForGoal()` (returns `{ rockCount, sandCount, waterCount, rockDollars, ... }` to satisfy a daily goal), and `isMorningMinute()` helper.

### F. Anti-pattern guards — `src/lib/engine/anti-pattern-guard.ts`

All 15 guards (AP-1..AP-15) as pure functions returning `{ passed, violations }`, plus the `runAllGuards(ctx) → GuardReport` aggregator. Violations have severity `HARD | SOFT | INFO` so the UI can grade health.

### G. Pattern Catalog v2 — `src/lib/engine/pattern-catalog.ts`

- Legacy catalog exported as `legacyPatternCatalog` (and aliased `PATTERN_CATALOG` for back-compat).
- Existing `resolvePattern(label)` + `derivePattern(role, length)` preserved verbatim — **zero breakage** to the 22 pre-existing pattern-catalog tests.
- New `resolvePatternV2({ blockType, practiceModel, column, coordinator? })` returns `{ xSegment, source, legacyPattern? }` with a 4-path precedence:
  1. `blockType.xSegment` (authoritative)
  2. `blockType.dTimeMin`/`aTimeMin` (backfilled offices)
  3. `legacyPatternCatalog` lookup
  4. `derivePattern` fallback
- New `decomposeLegacyPattern()` helper for converting existing per-slot arrays into canonical x-segment minutes.

RSW hookup: appended `placeBlockWithCoordinator()` and `buildCoordinatorForDoctor()` to `src/lib/engine/rock-sand-water.ts`. These are **additive** — the existing single-column RSW placement path is untouched so the 1019 pre-existing tests remain green. New code can consult the coordinator directly when `office.maxConcurrentDoctorOps > 1`.

### H. Day-of-week roster plumbing

`ProviderInput.dayOfWeekRoster` is now a first-class field (Bible §7). `generator.ts` gains an `isOnRosterForDay(provider, dayOfWeek)` filter that runs **before** the rotation-week check — closes P0-1 (the "Kelli Friday drop-out" research gap). Default roster (MON–FRI) preserves backward compat for existing data.

### I. Tests — 53 new, all passing

| File | Tests | Covers |
|------|-------|--------|
| `multi-column-coordinator.test.ts` | 16 | max=1 singleton, max=2 concurrent, max=3 with BROAD scope, EFDA cap enforcement, continuity collision, exam window, stagger via `findDoctorSegmentSlot`, transition buffer |
| `production-policy.test.ts` | 7 | POLICIES registry shape, noon cutoff, pickBlockMixForGoal math, Farran-vs-Jameson rock count, unreachable-goal warning, morning minute helper |
| `anti-pattern-guard.test.ts` | 20 | Positive + negative cases for AP-1, AP-3, AP-4, AP-6, AP-7, AP-8, AP-9, AP-10, AP-11, AP-13, AP-14, AP-15 + aggregator |
| `backfill-xsegment.test.ts` | 8 | Pattern decomposer on MP/HP/ER + null-slot handling + D/A-field fallback + hygiene default + duration-only |
| `xsegment-integration.test.ts` | 2 | End-to-end: resolvePatternV2 → coordinator → trace → runAllGuards (2-op HP+MP staggered day; endo blocks MP) |

**Full suite:** 70 files, **1072 tests — all passing.** TypeScript `tsc --noEmit` exit 0.

### J. Documentation

- `.cst-rebuild-v3/logs/sprint-1-report.md` — this report
- `CHANGES.md` — Sprint 1 header appended at repo root

---

## Boundaries honored

- No touches to `src/components/` — backend-only sprint.
- No deploys.
- No break of `pattern-catalog.ts` public API — `resolvePattern()` / `derivePattern()` / `PATTERN_CATALOG` all preserved.
- RSW integration is additive — no changes to single-column placement behavior, so the pre-existing 1019-test suite remains green.

## Known notes / open items (carry to Sprint 2)

1. The dev-DB's migration history has an unrelated drift from a prior sprint (the `variantLabel` column was applied out-of-band). Sprint 1 SQL was instead applied directly via `better-sqlite3`. Migration file is still committed and will apply cleanly on a fresh DB. Sprint 2 should `prisma migrate resolve --applied` on staging/prod DBs before deploying.
2. `resolvePatternV2` takes an optional `coordinator` arg but doesn't yet mutate it — that's the Sprint 2 work (RSW orchestration replaces `rangesAvoidingDMinutes` with the coordinator).
3. The legacy `pattern` field on `BlockTypeInput` is marked `@deprecated` but still honored for back-compat. Sprint 3 should migrate all seed blocks to `xSegment` and remove the legacy catalog.
4. `ProcedureOverride` table (PRD-V4 §data-model) not yet added — per Sprint 1 scope it's listed but the brief's deliverable list does not include it. Carry to Sprint 2.

## Test command reference

```bash
npx vitest run                     # full suite (70 files, 1072 tests)
npx vitest run --grep="Sprint 1"   # nothing (we don't tag by sprint)
npx vitest run src/lib/engine/__tests__/multi-column-coordinator.test.ts
npx tsx scripts/backfill-xsegment.ts              # dry run
npx tsx scripts/backfill-xsegment.ts --apply      # write
npx tsc --noEmit                                   # type-check
```
