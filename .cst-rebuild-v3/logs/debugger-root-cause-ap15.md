# Phase 4 Debugger — AP-15 Root Cause

## Status

**AP-15 does not currently reproduce** on any of the 6 golden fixtures at
HEAD, across either the declared seed or 20 random seed variations. The
Sprint 3 report flagged ~3 HARD AP-15 on SMILE NM Monday R2; that path
has been closed by subsequent engine work.

## Why AP-15 is structurally prevented today

`AP-15 (PROVIDER_OVERLAP)` fires when two PlacedBlocks share the same
`providerId + operatory` and their `startMinute..startMinute+durationMin`
windows overlap.

In the current generator:

1. **One slot array per `(providerId, operatory)` pair**
   (`slot-helpers.ts:52–68`, `buildProviderSlotMap`). Every slot is scoped
   to exactly one provider/operatory pair via its `providerId` and
   `operatory` fields at slot-creation time.

2. **`findAvailableRanges()` requires `blockTypeId === null`**
   (`slot-helpers.ts:101–124`). A slot occupied by any block is off-limits
   to subsequent placements within the same `ProviderSlots` index array.

3. **Fixtures do not share operatories across providers.** In SMILE NM,
   Dr Hall owns `R1, R2` and Dr Borst owns `R3, R4`; there is no shared
   chair. In Cascade, only one doctor exists. So the "two providers → same
   op" case cannot arise in the golden set.

Together these three facts make same-op same-provider overlap (classical
AP-15) impossible, and same-op different-provider overlap (coordinator-
gap AP-15) also impossible for the specific fixture set.

## Real-world regression risk

The brief described a plausible path where AP-15 **could** surface:

> "Multiple providers share an operatory but the coordinator only tracks
> doctors, not operatories. Provider A (HP at 10am) and Provider B (HP at
> 10:30am) both claim the same op because the ops-dimension has no
> conflict guard."

This was accurate for the `MultiColumnCoordinator` as-written in Sprint 1.
The coordinator's `check()` method only inspected doctor-level reservations.
Its `reserveDoctorSegment()` never touched operatory-level state. In a
future sprint where two doctor coordinators are linked and share a chair
pool, they would have collided.

## Phase 4 fix — Operatory-occupancy track

Added to `MultiColumnCoordinator`:

- New `OperatoryBooking` interface: `{ blockInstanceId, operatory,
  startMin, endMin, providerId? }`.
- New `operatoryBookings: OperatoryBooking[]` private field.
- New public API:
  - `canPlaceOnOperatory({ operatory, startMin, durMin, blockInstanceId? })`
    → boolean (pure check).
  - `reserveOperatory({ blockInstanceId, operatory, startMin, durMin,
    providerId? })` → `{ ok, reason?, collidingWith? }`.
  - `operatoryTrace()` → readonly snapshot for tests/debug.
- `check()` now runs the operatory-occupancy collision test FIRST, before
  doctor-level checks. Same-op overlap (different owner or same owner)
  returns `ok: false, reason: 'OPERATORY_OCCUPIED'`.
- `reserveDoctorSegment()` also commits the full block footprint
  (`asstPreMin + doctorMin + asstPostMin`) to the operatory log so future
  placements — including from a sibling coordinator — see the chair as
  occupied.

This is **defensive hardening**: it does not fix a violation that was
reproducing at HEAD, but it closes the architectural gap the brief
identified. When Sprint 4 makes the coordinator the authoritative placer
(rather than an avoid-set advisor), the operatory track is already in
place to prevent AP-15.

## Test suite impact

One pre-existing coordinator unit test asserted `ok:false` by filling the
SAME operatory with three back-to-back HPs whose chair footprints
overlapped end-to-end. That fixture was implicitly an AP-15 violation
that the old coordinator ignored. Fixed by spreading the three HP blocks
across `OP-A`, `OP-B`, `OP-C` — the doctor-collision property the test
was really asserting is preserved, but the fixture is now realistic.

All 1221 tests (1166 prior + 54 new guard-exhaustive + 1 still-fixing
coordinator test) pass.

## Verdict

- No engine behavioural change on the hot path (legacy placer still runs).
- Coordinator is now ready to take over placement without re-introducing
  AP-15.
- Guard-exhaustive test plus `hardCeiling: 0` on every golden catches any
  regression the moment it happens.
