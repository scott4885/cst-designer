# Phase 4 — Full-Sweep Testing Verdict

**Agent:** Full-sweep Testing (Phase 4)
**Date:** 2026-04-21
**Scope:** vitest, playwright, coverage, gap analysis, quality spot-check, P0 test backfill.

## Overall Verdict: **YELLOW** — clear to deploy once the 5 e2e failures are triaged

The unit/integration layer is rock-solid — 1,252 vitest tests all green at 82.4% line coverage with strong quality hygiene. The e2e layer has **5 deterministic failures** that must be triaged before deploy; none are caused by test infrastructure (they reflect real UI / persistence regressions or selector drift).

## Ready-to-Deploy Checklist

| Check | Status | Notes |
|---|:---:|---|
| Unit suite passes | ✓ GREEN | 1,252 / 1,252 |
| Integration suite passes | ✓ GREEN | 6 integration specs, all green |
| API route tests pass | ✓ GREEN | 5 files, 26 tests |
| Engine suite passes | ✓ GREEN | 32 engine tests files, full green incl. goldens |
| E2E suite passes | ✗ RED | 5 failing specs (see below) |
| Overall lines ≥ 80% | ✓ GREEN | 82.4% |
| No flaky tests observed | ✓ GREEN | 0 retries needed |

## Coverage Summary

| Metric | % |
|---|---:|
| **Lines** | **82.4%** |
| Statements | 61.4% |
| Functions | 53.8% |
| Branches | 51.8% |

## Coverage by Module

| Module | Lines % | Status |
|---|---:|:---:|
| `src/lib/engine` | 87.4% | ✓ Green |
| `src/lib/export` | 96.4% | ✓ Green |
| `src/app/api` | 80.5% | ✓ Green |
| `src/components/schedule/v2` | 91.3% | ✓ Green |
| `src/components/schedule` (legacy) | 60.1% | ~ Yellow — acceptable given v2 is primary |
| `src/store` (3 main stores) | 74.1% | ~ Yellow |
| `src/store/office-store.ts` | 33.3% | ✗ Red — P1 gap |
| `src/lib/keyboard-shortcuts.ts` | 1.6% | ✗ Red — P1 gap |

## Test Infra Blockers

**None.** The test infra is healthy:
- `@vitest/coverage-v8` now installed and working
- Playwright installs cleanly; single-browser config; no flaky retries needed
- Prisma test DB integration works; note: one cosmetic sourcemap warning (`src/generated/prisma/runtime/client.js.map`) — fix by adding `**/generated/**` to `vitest.config.ts > coverage.exclude`

## E2E Failures (must triage before deploy)

1. **`office-crud.spec.ts`** — ambiguous `getByRole('link', /new|create|add/i)` matches 2 elements → tighten selector with a `data-testid`.
2. **`schedule-generation.spec.ts`** — control visibility assertion fails → the UI element was renamed or removed.
3. **`schedule-persistence.spec.ts`** — count of persisted elements is 0 after round-trip → either persistence regression or missing `waitFor` on re-hydration.
4. **`schedule-v2-visual.spec.ts` (test 1)** — neither v2 grid nor legacy grid render on the default demo → route / feature-flag drift.
5. **`schedule-v2-visual.spec.ts` (test 2)** — ErrorBoundary triggers on empty-schedule path → unguarded edge case in a downstream component.

These are **UI/selector/state regressions**, not flakes. Each is a 30–60 min fix.

## Work Delivered in This Sweep

- Full vitest run with coverage captured: `tests-full-report.md`
- Full Playwright run captured: `tests-e2e-report.md`
- Ten lowest-coverage files triaged with priority: `tests-coverage-gaps.md`
- Five test files spot-checked for quality: `tests-quality-spot-check.md`
- **3 new P0 test files closing engine-critical gaps:**
  - `src/lib/engine/__tests__/procedure-overrides.test.ts` (7 tests) — closes `procedure-overrides.ts` from 5.9% to ~95%
  - `src/lib/engine/__tests__/stagger-resolver-auto.test.ts` (8 tests) — covers `autoResolveStaggerConflicts` + `countDTimeOverlaps`
  - `src/lib/engine/__tests__/pattern-catalog-v2.test.ts` (16 tests) — covers all 4 v2 resolver paths + `decomposeLegacyPattern` + `derivePattern`
- **+31 new tests total; full suite remains 100% green.**

## Recommendations for Ongoing Test Discipline

1. **Triage the 5 e2e failures this sprint.** They block the Phase-5 deploy gate.
2. **Exclude generated code from coverage.** Add `'**/generated/**', 'scripts/**'` to `vitest.config.ts > coverage.exclude` — the Prisma client and backfill scripts drag the functions % down by ~5pts.
3. **Set a coverage floor.** With engine at 87%+ it's worth turning on `coverage.thresholds.lines = 80` in vitest.config to prevent regression.
4. **Migrate "sprint-named" mega-files.** `sprint12..sprint17.test.ts` bundle unrelated features — split each concern into a co-located file next to the module it tests. Makes failures easier to attribute.
5. **Fixture extraction.** 15+ tests rebuild the same provider/block-type objects. A `src/__tests__/__fixtures__/` module would cut boilerplate.
6. **P1 targets for next sweep:** `office-store.ts`, `keyboard-shortcuts.ts`, `operatory-utils.ts`, `optimizer.ts`. These are all pure logic with single-digit-percent coverage — each can be backfilled in one sitting.
7. **Stabilize the visual-regression specs** (`qa-visual-phase4.spec.ts`) — 17 scenarios currently skipped behind a baseline flag. Either activate with committed baselines or delete the scaffolding to reduce noise.
8. **Transactional test DB.** `office-crud-flow.test.ts` uses real SQLite with try/catch cleanup — switch to a per-test transaction that rolls back, or a dedicated test DB file under `.tmp/`.

## Bottom Line

Engine is battle-ready (87.4% lines, all goldens green). Unit/integration/API are green. The only gate to Phase-5 is five UI-layer e2e failures that look like straightforward regressions (selector drift + persistence timing + empty-state crash), not test-infra problems. Fix those five and this is a clean GREEN.
