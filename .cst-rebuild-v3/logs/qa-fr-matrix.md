# Phase 4 QA — Functional Requirement Acceptance Matrix

Source of truth: PRD-V4 §5, §6 (FR-1..FR-24 + FR-EMR-1). Test evidence
verified 2026-04-21 against HEAD (1166-test suite, 100% passing +
qa-fixture-report diagnostic).

**Legend**
- **Pass** — FR implemented and covered by automated tests.
- **Partial** — implemented but gaps in coverage, configurability, or UI surface.
- **Fail** — not implemented, or implemented in a way that violates acceptance.
- **Not tested** — implementation present, no targeted test evidence.

| FR | Title | Status | Evidence | Gap |
|---|---|---|---|---|
| FR-1 | Office CRUD with practice model | Partial | `prisma/schema.prisma` has `practiceModel`/`productionPolicy`/`maxConcurrentDoctorOps` columns with defaults. `src/app/offices/new/page.tsx` + `edit/page.tsx` handle CRUD. | No practice-model enum *selector* in the UI form; no validation "Practice model required" (schema defaults to `1D2O`). No warning when provider count violates `1D2O` constraint. |
| FR-2 | Provider CRUD with operatory assignment and day-of-week roster | Partial | `dayOfWeekRoster` field exists on Provider (schema.prisma:58); generator filters by `isOnRosterForDay` (`generator.ts:254`); `anti-pattern-guard.ts` AP-13 enforces it. No explicit Friday-drop-out test fixture. | No UI multi-select tying provider ops to parent office ops (still free text in most paths); per-day *hours override* inside `dayOfWeekRoster` is absent — only presence is stored. |
| FR-3 | BlockType with X-segment durations | Pass | `XSegmentTemplate { asstPreMin, doctorMin, asstPostMin, examWindowMin, doctorContinuityRequired }` in `types.ts:184-196`. Migration `20260421000000_xsegment_and_policy`. Tests: `xsegment-integration.test.ts`, `backfill-xsegment.test.ts` (8 tests), `golden-templates.test.ts` fixtures use X-segments throughout. | None for core. UI exposure of X-segment fields not visually verified on block-type editor. |
| FR-4 | ScheduleRule — production policy + config fields | Partial | `productionPolicy`, `maxConcurrentDoctorOps` persisted at Office level. `production-policy.ts` engine covers 7 policy tests. AP-6 enforces `maxConcurrentDoctorOps`. | `openSlotPctTarget`, `doctorTransitionBufferMin`, `emergencySlotConfig` not found in schema or engine. AP-4 checks buffer conceptually but field is not configurable. |
| FR-5 | NP/SRP blocks-per-day steppers | Pass | `ScheduleRules.npBlocksPerDay`/`srpBlocksPerDay` in `types.ts`, used in `rock-sand-water.ts`. Rules form covered indirectly by intake tests. | — |
| FR-6 | Procedure-length override (per-practice) | Pass | `ProcedureOverride` model + unique `(officeId, blockTypeId)`. CRUD API `src/app/api/offices/[id]/procedure-overrides/route.ts`. Merge logic in `src/lib/engine/procedure-overrides.ts`. Hot-path fetch in `src/lib/data-access.ts`. UI at `src/app/offices/[id]/procedures/page.tsx`. | No dedicated test file named `procedure-override.test.ts` as called out in PRD §15. Integration covered via `data-access` and generator integration. |
| FR-7 | Deterministic generation | Pass | Seeded RNG in `rng.ts`; `generateSchedule` takes optional `seed`. Golden fixtures use `seed: 0x5A17E100` and produce byte-identical repeat results. `golden.test.ts` + `retry-envelope.test.ts`. | — |
| FR-8 | Goal derivation (annual → daily → minus hygiene → hourly) | Fail | No formula evident; `production-calculator.ts` works from `provider.dailyGoal` directly. No audit-trail persistence. | Critical research-sourced gap (P1-RES-2). Users still type a daily number. |
| FR-9 | Category-weighted placement when futureProcedureMix valid | Pass | `procedure-mix.ts` + `procedure-mix.test.ts` (33 tests) + `production-mix.test.ts` (18 tests). | — |
| FR-10 | Variety cap enforcement (65%) | Pass | `MAX_SAME_TYPE_FRACTION = 0.65` in `slot-helpers.ts:456`. `generator-variety.test.ts` (11 tests). | — |
| FR-11 | Canvas click-to-replace | Pass | `BlockPicker.tsx` + `TimeSlotInteraction.tsx`; `BlockPicker.test.tsx`, `TimeSlotInteraction.test.tsx` (3 tests). | — |
| FR-12 | Drag-drop reorder | Pass | `drag-preview.ts` + `drag-drop-grid.test.tsx` (6 tests) + `schedule-store-drag.test.ts` (5 tests). | — |
| FR-13 | Live recompute on edit | Partial | `schedule-store.ts` triggers re-eval; conflict detection fires via `conflict-detector.ts`. `GuardReportPanel` reflects guard-report state. | No automated integration test proving the morning-load ratio and variety-cap check *specifically* re-run on a single block edit. UI banner for 65% overflow not verified. |
| FR-14 | Properties Panel (edit label, 3-part duration, pattern, color) | Partial | `PropertiesPanel.tsx` + `ScheduleCanvas.tsx` integration. | Three-part (X-segment) editing on the Properties Panel not visually confirmed — legacy `duration` field may still be primary editor. No test asserting asstPre/doctor/asstPost editable fields on the panel. |
| FR-15 | Rotation weeks (A/C rotation, 2–4 cycles) | Pass | `rotation-snap.ts` + `rotation-templates.test.ts` (27 tests) + `alternate-week.test.ts` (9 tests). | — |
| FR-16 | Variant days (EOF, Opt1, Opt2) with "Create Variant" button | Pass | `variantLabel` in Excel export (`copy-day-variant.test.ts` 7 tests) + `copyDayModal`/`ToolbarRibbon`. | — |
| FR-17 | Clone template with before/after preview | Pass | `lib/clone-template.ts` + `CloneTemplateModal.tsx` + `/compare/page.tsx` + sprint12 tests. | — |
| FR-18 | Excel export contract | Pass | `src/lib/export/excel.ts` + `excel.test.ts` (10 tests). | — |
| FR-19 | DPMS exports | Partial | Open Dental shipped: `open-dental.ts` + `open-dental.test.ts` (32 tests). | Dentrix + Eaglesoft explicitly Q3 per PRD — not a Phase 4 gap. Marked Partial only for completeness. |
| FR-20 | Quality score (0–100) per day/week/office | Pass | `quality-score.ts` + `quality-score.test.ts` (8 tests). | — |
| FR-21 | Auto-snapshot on every save | Pass | `/schedule-versions` route + `VersionPanel.tsx` + `sprint13.test.ts` coverage. | — |
| FR-22 | Audit checks (block-type/provider/rule/X-segment) | Partial | `/audit/page.tsx` exists; `validator.ts` covers rule coverage. | X-segment-validity audit not surfaced in `/audit` UI. `clinical-rules.test.ts` covers rule logic only. |
| FR-23 | Chair-utilization benchmark | Partial | `/utilization/page.tsx` + `benchmark-providers.ts`. | No dedicated test of network-wide benchmark comparison. |
| FR-24 | Doctor production per hour telemetry | Fail | No `projectedDoctorProductionPerHour` field in `GenerationResult` or anywhere in `src/`. | Missing. PRD threshold ($500/hr amber / $350/hr red) unimplemented. |
| FR-EMR-1 | Emergency slot contract (3 attributes) | Fail | `ScheduleRules.emergencyHandling` is a simple enum (`ACCESS_BLOCKS`, etc). No `scheduledWindow`, `protectedUntil`, or `autoReleaseBehavior` fields anywhere in schema or engine. | Entirely missing. |

## Summary

- **Pass:** 14 (FR-3, FR-5, FR-6, FR-7, FR-9, FR-10, FR-11, FR-12, FR-15, FR-16, FR-17, FR-18, FR-20, FR-21)
- **Partial:** 8 (FR-1, FR-2, FR-4, FR-13, FR-14, FR-19, FR-22, FR-23)
- **Fail:** 3 (FR-8, FR-24, FR-EMR-1)
- **Not tested:** 0

14 Pass / 8 Partial / 3 Fail across 25 FRs.
