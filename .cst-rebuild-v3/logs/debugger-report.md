# Phase 4 Debugger — Report

**Date:** 2026-04-21
**Scope:** AP-8 (LUNCH_D_BAND) and AP-15 (PROVIDER_OVERLAP) on the six golden fixtures.
**Engine HEAD at start:** `9f28116` (Sprint 3 closure).

## TL;DR

The Sprint 3 regression report cited 1 HARD AP-8 (SMILE NM Mon) and 3 HARD
AP-15 (SMILE NM Mon R2) as outstanding bugs. **Neither reproduces at
HEAD**, on either declared seeds or 20 random seed variations per fixture
(120 runs total). Engine work between Sprint 3 closure and Phase 4 entry
closed both paths structurally. This phase therefore pivoted from
"fix-and-verify" to:

1. **Prove zero HARD** via a diagnostic sweep and permanent test shield.
2. **Ratchet goldens** so the bugs cannot silently return.
3. **Proactively harden** the coordinator against the AP-15 regression
   path that Sprint 4's placer rewrite would otherwise re-open.

## Before vs After — HARD violation counts

### Before (Sprint 3 closure report)

| Fixture             | AP-8 | AP-15 | Notes |
|---------------------|------|-------|-------|
| SMILE NM — Monday   | 1    | 3     | R2 overlap + lunch overlap reported |
| SMILE NM — Tue..Fri | 0    | 0     | (per Sprint 3 tables) |
| Smile Cascade — Mon | 0    | 0     | — |

### After (this phase, `hardCeiling=0`, 20-seed sweep)

| Fixture             | AP-8 | AP-15 | Total HARD |
|---------------------|------|-------|-----------|
| SMILE NM — Monday   | 0    | 0     | 0 |
| SMILE NM — Tuesday  | 0    | 0     | 0 |
| SMILE NM — Wednesday| 0    | 0     | 0 |
| SMILE NM — Thursday | 0    | 0     | 0 |
| SMILE NM — Friday   | 0    | 0     | 0 |
| Smile Cascade — Mon | 0    | 0     | 0 |

Full per-guard breakdown in `debugger-violations-baseline.md`.

## Root causes (in one sentence each)

- **AP-8** is structurally impossible because lunch slots are materialized
  with `isBreak=true` at slot-creation time, and `findAvailableRanges()`
  rejects any slot where `isBreak !== false || blockTypeId !== null`, so no
  placer can emit a block that straddles lunch. See
  `debugger-root-cause-ap8.md`.
- **AP-15** is structurally impossible on today's goldens because slots
  are scoped one-array-per-`(providerId, operatory)` pair and no golden
  fixture shares an operatory across providers; the remaining residual
  risk (a future sibling coordinator sharing a chair pool) has been
  closed by adding an `OperatoryBooking` track to
  `MultiColumnCoordinator`. See `debugger-root-cause-ap15.md`.

## Tests

| Suite                        | Before | After | Delta |
|------------------------------|--------|-------|-------|
| Total tests                  | 1166   | 1221  | +55 |
| `guard-exhaustive` (new)     | —      | 54    | +54 |
| `multi-column-coordinator`   | 24     | 25    | +1 (1 fixture fixed, 1 new OperatoryOccupancy suite) |
| Golden template (ratcheted)  | 6      | 6     | 0 (same count, tighter ceilings) |

All 1221 pass. `npx tsc --noEmit` clean.

## Files changed

**Engine**

- `src/lib/engine/multi-column-coordinator.ts` — operatory-occupancy
  track (public API `canPlaceOnOperatory`, `reserveOperatory`,
  `operatoryTrace`; internal `operatoryBookings[]`; `check()` now runs
  chair-collision FIRST; `reserveDoctorSegment()` commits footprint).

**Fixtures**

- `src/lib/engine/__tests__/golden-templates/smile-nm-monday.fixture.ts`
  — `hardCeiling: 6 → 0` with explanatory comment.
- `src/lib/engine/__tests__/golden-templates/smile-nm-tuesday.fixture.ts`
  — `hardCeiling: 6 → 0`.
- `src/lib/engine/__tests__/golden-templates/smile-nm-wednesday.fixture.ts`
  — `hardCeiling: 6 → 0`.
- `src/lib/engine/__tests__/golden-templates/smile-nm-thursday.fixture.ts`
  — `hardCeiling: 6 → 0`.
- `src/lib/engine/__tests__/golden-templates/smile-nm-friday.fixture.ts`
  — `hardCeiling: 6 → 0`.
- `src/lib/engine/__tests__/golden-templates/smile-cascade-monday.fixture.ts`
  — `hardCeiling: 3 → 0`.

**Tests**

- `src/lib/engine/__tests__/guard-exhaustive.test.ts` — **new** 54-test
  permanent regression shield (zero-HARD per guard + 8-seed robustness).
- `src/lib/engine/__tests__/multi-column-coordinator.test.ts` — one
  existing test's fixture spread across OP-A/B/C (was implicitly
  AP-15-violating under the new chair rule; doctor-collision semantics
  preserved).

**Scripts**

- `scripts/diagnose-golden-violations.ts` — **new** diagnostic that
  produces the `Template × Guard` table across declared + 20 seed
  variations. Used to generate `debugger-violations-baseline.md`.

**Logs**

- `.cst-rebuild-v3/logs/debugger-violations-baseline.md`
- `.cst-rebuild-v3/logs/debugger-root-cause-ap8.md`
- `.cst-rebuild-v3/logs/debugger-root-cause-ap15.md`
- `.cst-rebuild-v3/logs/debugger-report.md` (this file)

## Remaining non-HARD findings

- **AP-11 INFO ×2 per SMILE NM day** — two same-type blocks back-to-back.
  By design; the UI can merge them for display. Not a build blocker.
- **AP-10 SOFT ×1 on Cascade Mon** — fewer than 1 PM Rock. Advisory;
  Cascade's lower volume (one doctor, 2 ops) legitimately produces some
  days without an afternoon rock.

Both accepted without code change.

## Architectural recommendation (signal for Sprint 4)

**Yes — one architectural change is worth surfacing beyond "debug fix":**

Today the `MultiColumnCoordinator` is an **advisor** — it's threaded
through `rangesAvoidingDMinutes()` as an avoid-set contributor, but
`reserveDoctorSegment()` is not called on the production placement path,
and its `check()` logic (including the new operatory track) is
effectively dormant in prod traffic. The real guards that prevent AP-8
and AP-15 today are the `isBreak` slot partition and the
one-array-per-(provider, operatory) structure in the slot map.

**Sprint 4 should promote the coordinator to the authoritative placer.**
The operatory-occupancy track added this phase is specifically designed
to make that transition safe: once two sibling coordinators share a
chair pool, the track prevents them from double-booking without relying
on the slot-array partition. Without that promotion, the engine will
keep carrying two parallel reservation systems (slot map + coordinator)
whose invariants can drift.

## Verdict

- **No behavioural change on the hot path.** Generator output is
  byte-identical to pre-Phase-4 HEAD for all 6 fixtures.
- **Regression shield hardened.** `hardCeiling=0` everywhere +
  54-test `guard-exhaustive` suite + 8-seed robustness sweep.
- **Sprint 4 unblocked** for the coordinator-as-placer migration.
