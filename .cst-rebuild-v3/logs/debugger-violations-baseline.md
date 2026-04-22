# Phase 4 Debugger — Violations Baseline

**Captured:** 2026-04-21
**Engine HEAD:** Sprint 3 closure (`9f28116`) + Phase 4 coordinator hardening (`60dd190`)

## Per-fixture × per-guard HARD violation counts

Format: `H = HARD, S = SOFT, I = INFO`. All counts are per-run with the fixture's declared seed.

| Fixture                | AP-1 | AP-2 | AP-3 | AP-4 | AP-5 | AP-6 | AP-7 | AP-8 | AP-9 | AP-10 | AP-11 | AP-12 | AP-13 | AP-14 | AP-15 | Total HARD |
|------------------------|------|------|------|------|------|------|------|------|------|-------|-------|-------|-------|-------|-------|------------|
| SMILE NM — Monday      | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 0H    | 2I    | 0H    | 0H    | 0H    | **0H** | **0**      |
| SMILE NM — Tuesday     | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 0H    | 2I    | 0H    | 0H    | 0H    | **0H** | **0**      |
| SMILE NM — Wednesday   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 0H    | 2I    | 0H    | 0H    | 0H    | **0H** | **0**      |
| SMILE NM — Thursday    | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 0H    | 2I    | 0H    | 0H    | 0H    | **0H** | **0**      |
| SMILE NM — Friday      | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 0H    | 2I    | 0H    | 0H    | 0H    | **0H** | **0**      |
| Smile Cascade — Monday | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | 0H   | **0H** | 0H   | 1S    | 0H    | 0H    | 0H    | 0H    | **0H** | **0**      |

## Robustness sweep

The diagnostic script (`scripts/diagnose-golden-violations.ts`) also runs each
fixture across 20 seed variations. **Worst-case HARD count across all
6 fixtures × 20 seeds = 0** for AP-8 and AP-15.

## Interpretation

The Sprint 3 report's "known issues" (AP-8 lunch D-band x1, AP-15 R2 overlap
x3 on SMILE NM Mon) no longer reproduce at HEAD. Earlier engine
improvements — specifically the `rangesAvoidingDMinutes` coordinator
threading and the `placeDoctorBlocks` stagger-aware placement — appear to
have closed those paths structurally.

What remains:

| Severity | AP     | Count per SMILE NM day | Count on Cascade Mon | Classification |
|----------|--------|------------------------|----------------------|----------------|
| INFO     | AP-11  | 2                      | 0                    | By design — harmless "two same-type blocks back-to-back"; UI can merge for display. |
| SOFT     | AP-10  | 0                      | 1                    | Advisory — Cascade Mon has fewer than 1 PM Rock; Cascade's single-doctor / smaller daily goal doesn't always produce an afternoon rock. |

Neither blocks the build.

## Action taken

- `hardCeiling` ratcheted from 6 → 0 on the 5 SMILE NM fixtures and
  from 3 → 0 on the Cascade fixture.
- Added `src/lib/engine/__tests__/guard-exhaustive.test.ts` as a permanent
  regression shield: asserts exact-zero HARD for AP-1, AP-6, AP-8, AP-13,
  AP-14, AP-15 on every fixture, plus an 8-seed sweep across all 6 fixtures.
- Added chair-level `OperatoryOccupancy` track to `MultiColumnCoordinator`
  as a proactive AP-15 regression shield for the Sprint 4 placer rewrite.
