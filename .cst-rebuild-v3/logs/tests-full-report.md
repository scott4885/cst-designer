# Vitest Full-Sweep Report — Phase 4

**Date:** 2026-04-21
**Command:** `npx vitest run --coverage` (v8 provider)
**Config:** `vitest.config.ts` (jsdom env, @vitejs/plugin-react)

## Headline Numbers

| Metric | Value |
|---|---|
| Test Files | **86** |
| Total Tests | **1,252** |
| **Passed** | **1,252** |
| Failed | 0 |
| Skipped | 0 |
| Duration | ~32s (tests) / ~46s (with coverage + transform) |

*Note:* Baseline at task start was 81 files / 1,166 tests — Phase-4 work in Task 5 added **3 new test files** contributing **31 new tests**. A prior-author file `qa-fixture-report.test.ts` was also picked up during this sweep for the first time, adding the remaining tests.

## Overall Coverage (v8)

| Dimension | % | Covered / Total |
|---|---:|---|
| **Lines** | **82.43%** | 5,271 / 6,394 |
| Statements | 61.44% | 7,358 / 11,975 |
| Functions | 53.84% | 1,352 / 2,511 |
| Branches | 51.80% | 4,577 / 8,835 |

## Per-Module Coverage

| Module | Files | Lines % | Funcs % | Branches % |
|---|---:|---:|---:|---:|
| `src/lib/engine` | 41 | **87.4%** | 91.1% | 73.9% |
| `src/lib/export` | 2 | 96.4% | 84.2% | 82.4% |
| `src/lib/contracts` | 1 | 92.0% | 50.0% | 50.0% |
| `src/app/api` (all routes) | 8 | 80.5% | 88.5% | 65.0% |
| `src/components/schedule/v2` | 7 | 91.3% | 90.4% | 80.9% |
| `src/components/schedule` (legacy) | 10 | 60.1% | 51.3% | 54.3% |
| `src/components/ui` | 4 | 50.0% | 40.0% | 80.0% |
| `src/store` (block-type / schedule / view) | 3 | 74.1% | 71.8% | 58.4% |
| `src/store/office-store.ts` | 1 | **33.3%** | 50.0% | 25.0% |
| `src/app/page.tsx` | 1 | **36.4%** | 27.3% | 53.9% |
| `src/lib/audit.ts` | 1 | 100.0% | 100.0% | 77.1% |
| `src/lib/db.ts` | 1 | 100.0% | 100.0% | 83.3% |
| `src/lib/data-access.ts` | 1 | 82.9% | 81.3% | 60.7% |
| `src/lib/keyboard-shortcuts.ts` | 1 | **1.6%** | 0.0% | 0.0% |
| `src/lib/operatory-utils.ts` | 1 | **27.3%** | 0.0% | 0.0% |

## Test File Inventory

All 86 test files ran green. Breakdown by area:

- **Engine** (`src/lib/engine/__tests__/`) — 32 files, largest single concentration (golden snapshots, rock-sand-water, generator, validator, etc.)
- **Component unit** (`src/components/schedule/v2/__tests__/`) — 9 files
- **Legacy component** (`src/__tests__/components/`) — 5 files
- **Integration** (`src/__tests__/integration/`) — 6 files (drag-drop grid, office CRUD, schedule flows, edge cases)
- **Store** (`src/store/__tests__/`, `src/__tests__/store/`) — 4 files
- **Unit/sprint regression** (`src/__tests__/unit/`) — 16 files (sprint1..sprint17 plus utilities)
- **API** (`src/app/api/__tests__/`) — 5 files
- **Export** (`src/lib/export/__tests__/`) — 2 files

## Failures

**None.** Suite is fully green.

## Flaky Tests / Warnings Noted

- Prisma sourcemap warning during coverage run (`src/generated/prisma/runtime/client.js.map` missing). Cosmetic — does not affect correctness. Add `**/generated/**` to `vitest.config.ts > coverage.exclude` to silence.
- Import time dominates run time (~65s of the 46s wall clock is parallelized transform/import). Fine for dev workflow; worth watching if it grows.

## Artifacts

- Raw vitest log: `.cst-rebuild-v3/logs/vitest-raw.log`
- Coverage JSON summary: `coverage/coverage-summary.json`
- Coverage HTML: `coverage/index.html` (open locally)
- JSON reporter output: `.cst-rebuild-v3/logs/vitest-results.json`
