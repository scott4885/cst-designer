# Phase 4 Debugger — AP-8 Root Cause

## Status

**AP-8 does not currently reproduce** on any of the 6 golden fixtures at HEAD,
across either the declared seed or 20 random seed variations. The Sprint 3
report flagged 1 HARD AP-8 on SMILE NM Monday; that path has been closed
by subsequent engine work and the fixture now generates a clean schedule.

## Why AP-8 is structurally prevented

`AP-8 (LUNCH_D_BAND)` fires when a PlacedBlock's doctor D-band window
(`doctorStartMinute .. doctorStartMinute + doctorMin`) overlaps the
`lunchStartMin .. lunchEndMin` window passed to `runAllGuards()`.

In the current generator (`src/lib/engine/generator.ts`):

1. **Lunch is materialized as `isBreak=true` slots at slot-creation time**
   (`generator.ts:329–342`). Every slot whose clock-time falls inside
   `[lunchStart, lunchEnd)` is emitted with `blockTypeId: null`,
   `staffingCode: null`, `isBreak: true`, `blockLabel: 'LUNCH'`.

2. **`findAvailableRanges()` rejects break slots**
   (`slot-helpers.ts:101–124`). When it scans for a contiguous run of
   empty slots, it returns only ranges where *every* slot has
   `blockTypeId === null && !isBreak`. A range that would span across
   lunch is broken up into pre-lunch and post-lunch sub-ranges.

3. **Every block placer goes through `findAvailableRanges`**, so a
   multi-segment doctor block physically cannot be placed across the lunch
   partition. The asstPreMin / doctorMin / asstPostMin bands are all
   embedded in the same contiguous non-break range.

This means an AP-8 violation would require either:

- A lunch slot being created with `isBreak=false` (bug at slot-creation), or
- A placer that bypasses `findAvailableRanges` and writes directly to the
  slot array (none in the current codebase), or
- A provider with `lunchEnabled=false` but the guard context pulling
  `lunchStartMin` from a different provider (only
  `computeGuardReport` in `generator.ts:125–133` does this — it picks the
  first provider that has `lunchEnabled !== false` and uses that lunch
  window, which matches the provider who actually has a lunch break).

All three paths are clean in the current engine.

## Coordinator's role

The `MultiColumnCoordinator.check()` path also rejects a lunch-overlapping
placement with reason `LUNCH_COLLISION`, but the hot path today does not
actually call `reserveDoctorSegment()` — the coordinator is threaded
through `rangesAvoidingDMinutes()` as an avoid-set contributor but never
mutates its reservation log from the legacy placer. So the coordinator's
LUNCH_COLLISION check is redundant defense-in-depth; the real lunch
protection is the `isBreak` slot partition.

## Regression risk

A future change that:

- Drops the `isBreak` slot partition in favour of coordinator-only lunch
  protection, **without** wiring `coordinator.reserveDoctorSegment()` into
  the placer, would reintroduce AP-8.
- Adds a placer that writes directly to the slot array bypassing
  `findAvailableRanges` would also reintroduce AP-8.

Both of those scenarios are caught by the new `guard-exhaustive.test.ts`,
which asserts zero HARD AP-8 on every golden across 8 seed variations.

## Verdict

**No code change required for AP-8.** The new `hardCeiling: 0` on every
fixture plus `guard-exhaustive` act as the permanent regression shield.
