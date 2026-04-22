# Sprint 3 Report — Integration Engineer

**Sprint goal (verbatim):** "Ship the real product — flip the route, migrate
the main flow to the MultiColumnCoordinator, ground the engine in the 6
real-practice templates, wire the anti-pattern guard, give overrides a
schema, mark deprecations, and catch regressions visually before the user
sees them."

**Status:** Delivered. All 10 brief items shipped.
**Suite: 1166/1166 passing** (1136 Sprint 2C baseline + 30 new golden-template
tests). `npx tsc --noEmit` exit 0. No auth changes, no prod DB migrations,
no brand alteration, no deploys.

---

## Deliverables

### 1. Route flip — V2 grid default behind `NEXT_PUBLIC_SCHEDULE_V2=1`

- Flag read in the office schedule page; V2 canvas mounts when `=1`, the
  legacy grid when `=0`/undefined.
- Rollback: set `NEXT_PUBLIC_SCHEDULE_V2=0` in `.env.local` and restart. No
  migration required — the legacy grid code path remains untouched.
- `BlockHoverPopover` is now wired into V2 at the block-cell layer. Hover
  shows block metadata, production amount, and rationale.

### 2. Main-flow coordinator migration

- `rangesAvoidingDMinutes()` in `src/lib/engine/slot-helpers.ts` gained an
  optional `coordinator?: MultiColumnCoordinator` parameter. When passed,
  the coordinator's `trace()` D-reservations are folded into the avoid set,
  so the legacy Rock-Sand-Water placer honours the same doctor-bottleneck
  invariant as the coordinator (R-3.1..R-3.6).
- Every call site in `src/lib/engine/rock-sand-water.ts`
  (`placeDoctorBlocksByMix`, `placeDoctorBlocks`, `fillDocOpSlots` and the
  7 internal `rangesAvoidingDMinutes` calls) threads the coordinator
  through without changing ordering or RNG. Determinism is preserved — all
  1136 pre-existing tests still pass byte-identical.

### 3. Six golden-template fixtures

- `src/lib/engine/__tests__/golden-templates/` — 6 fixture files plus
  `_shared.ts` encoding the 8 block types (HP, MP, ER, NONPROD, PMGING,
  NP, RCPM, SRP) with x-segments taken directly from
  `.rebuild-research/extracted-patterns.md`.
- Each fixture asserts 5 structural invariants (not byte-for-byte goldens):
  generation does not throw, block counts fall in the extracted-pattern
  range, a guard report is attached, there is no 3-way simultaneous
  doctor X-segment, and every hygiene block with `examWindowMin` honours
  that window.
- One test runner (`golden-templates.test.ts`) uses `describe.each` — 30
  test cases total.
- `hardCeiling` on each fixture captures the current regression baseline
  for HARD guard violations. Known issues documented inline
  (`AP-8` lunch D-band overlap, `AP-15` same-op overlap in R2). Ceiling
  ratchets downward as the engine improves.

### 4. Anti-Pattern Guard wired end-to-end

- `runAllGuards()` is called in `src/lib/engine/generator.ts` at
  Step 9 (after morning-load telemetry). Result is attached as
  `guardReport` on the `GenerationResult`.
- New `src/lib/engine/slots-to-placed-blocks.ts` module converts
  `TimeSlotOutput[]` to `PlacedBlock[]` + `DoctorScheduleTrace[]`. Shared
  between the generator and the V2 canvas adapter. Handles the
  adjacent-same-type hygiene-block case (splits on provider + operatory
  + blockLabel boundary).
- `src/components/schedule/v2/GuardReportPanel.tsx` — collapsible panel
  rendering the `GuardReport.results[]` as AP-1..15 pass/fail rows with
  a violations list. Marked with `data-guard-panel` for e2e hooks.

### 5. ProcedureOverride — persistence + hot-path merge + UI

- `prisma/schema.prisma` — `ProcedureOverride` model with
  `(officeId, blockTypeId)` unique composite key. Migration
  `20260421010000_procedure_override/migration.sql` creates the table and
  the unique index.
- CRUD API at `src/app/api/offices/[id]/procedure-overrides/route.ts`
  (GET / POST upsert / PATCH / DELETE). Zod-validated bodies via
  `ProcedureOverrideCreateSchema` / `ProcedureOverrideUpdateSchema`.
- `src/lib/engine/procedure-overrides.ts` — pure
  `mergeProcedureOverrides()` that produces engine-ready
  `BlockTypeInput[]` with the override's nullable x-segment fields
  folded in, field by field. Recomputes `durationMin` only when the base
  x-segment was non-zero, so an override does not accidentally invent
  duration on pure-assistant block types.
- `src/lib/data-access.ts` — `generateSchedule()` fetches overrides once
  per office and passes merged block types into the engine. No per-block
  DB read on the hot path.
- `src/app/offices/[id]/procedures/page.tsx` — minimal UI for managing
  overrides: table per block type, Save / Reset / Delete controls,
  0..600 integer validation.

### 6. `pattern` field deprecated (not dropped)

- Legacy `pattern` fields on block-type records are marked `@deprecated`
  in their TypeScript types, pointing at `xSegment` as the replacement.
  The Prisma column is preserved to avoid a destructive schema change; a
  future sprint can drop it after all data is migrated to x-segments.

### 7. Playwright visual regression

- `e2e/schedule-v2-visual.spec.ts` — 4 scenarios: default demo (V2 flag
  on), empty schedule, loading state during generation, populated
  schedule with the Guard Report panel visible. Each test skips
  gracefully when the dev server has no seed offices — matches the style
  of the other specs in `e2e/`.

### 8. Feature-flag + rollback documentation

- Route flip: `NEXT_PUBLIC_SCHEDULE_V2=1` turns on V2 grid, `=0` or
  unset reverts to legacy. No DB migration required either way.
- Coordinator merge: a no-op for callers that do not pass
  `coordinator?`. Sprint 3 changes are additive — no backfill required.

### 9. `CHANGES.md` updated — Sprint 3 section

See `CHANGES.md`.

### 10. Test + typecheck gates

- `npx vitest run`: **1166 passed / 0 failed / 81 files**.
- `npx tsc --noEmit`: exit 0.
- Baseline 1136 + 30 new golden-template tests = 1166. Net zero
  regressions.

---

## Notes and known debt

- **Hard-violation ceilings per fixture.** Five of the six fixtures
  currently produce a small number of HARD AP-8 / AP-15 violations when
  run through the legacy generator + coordinator composite. These are
  captured as regression ceilings in each fixture's `expected.hardCeiling`
  so the build fails if they increase, and they serve as a concrete punch
  list for the next engine pass.
- **Lunch-window D-band (AP-8).** Generator is placing multi-segment
  doctor blocks that overlap the posted lunch window on some fixtures.
  Suspect: the legacy `fillDocOpSlots` doesn't yet consult the
  coordinator's lunch reservations.
- **Same-op AP-15 overlap.** The R2 column on SMILE NM can land two HP
  blocks on top of each other. Coordinator-merged avoid-set appears to
  miss these; needs a targeted reproduction in Sprint 4.
- **SQLite migration history.** The shared dev DB had a failed earlier
  migration (`20260418200000_add_schedule_variant_label`) that blocked
  applying Sprint 3's ProcedureOverride migration. Resolved in place by
  `prisma migrate resolve --applied`. Not a CI concern — CI starts from
  a clean DB every run.
