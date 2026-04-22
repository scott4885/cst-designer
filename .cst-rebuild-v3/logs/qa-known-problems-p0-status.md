# Phase 4 QA — P0 Known-Problem Regression Status

PRD-V4 §13 lists seven P0 items (4 carry-forward + 3 research-sourced).
This is the HEAD status per-item as of 2026-04-21.

| P0 ID | Statement | Fixed? | Evidence | Current status |
|---|---|---|---|---|
| **P0-1** | No operatory assignment UI on provider form. | Partial | `dayOfWeekRoster` field persists and the generator honours rosters (`generator.ts:254 isOnRosterForDay`). Provider form now collects operatories. | Roster presence only; per-day hours/lunch override not surfaced in the form. Multi-select binding to Office operatories is present in code but not covered by a dedicated UI test. |
| **P0-2** | Edit-after-generate does not recompute telemetry. | Partial | `schedule-store.ts` re-dispatches recompute; `GuardReportPanel` re-renders. `slots-to-placed-blocks.ts` feeds fresh blocks into guards. | No explicit assertion that the *morning-load ratio* recomputes after a single block swap. Variety-cap warning banner not verified. Covered indirectly by `conflict-detector.test.ts` + `schedule-store-drag.test.ts`. |
| **P0-3** | 100%-fill generator. | Fail | No `openSlotPctTarget` field in schema, rules, or `ScheduleRules` type. | Engine still fills to capacity minus variety-cap headroom. Research-cited requirement to leave walk-in/emergency capture slots is not implemented. |
| **P0-4** | Cross-column overlap fallback is silent. | Partial | Anti-pattern guard surfaces AP-1/AP-6/AP-15 violations to the `guardReport`; panel renders them. All 6 golden fixtures now run with **HARD=0** (sprint-3 report cited 4+ HARD per fixture — engine has improved). | No `coordinatorFallbacks[]` emission on `GenerationResult` per PRD §8.6. The guard report catches end-state violations, but the fallback-deferral events during generation are not surfaced. |
| **P0-RES-1** | X-segment data model missing. | Pass | `XSegmentTemplate` in `types.ts:184-196`. Schema migration `20260421000000_xsegment_and_policy/`. Tests: `xsegment-integration.test.ts` (2) + `backfill-xsegment.test.ts` (8). Every golden fixture passes X-segment data through `smileBlockTypes()`. | Closed. |
| **P0-RES-2** | Multi-column coordinator operates on wrong primitive. | Pass | `multi-column-coordinator.ts` + `multi-column-coordinator.test.ts` (16 tests). Sprint 3 threaded coordinator into `rangesAvoidingDMinutes()` (slot-helpers.ts:392). QA diagnostic confirms 0 same-op and 0 3-way doctor X overlaps on all 6 fixtures. Pairwise overlaps (5–11 per fixture) are expected where `maxConcurrentDoctorOps=2`. | Closed. |
| **P0-RES-3** | UI block legibility broken at 10-min density. | Pass | `BlockInstance.tsx` renders UX-L1 (single rect spanning N rows), UX-L2 (3 bands), UX-L3 (hygiene exam glyph), UX-L6 (category left-stripe). `BlockLabel.tsx` handles truncation. Zoom control (`ZoomControls`) in `ScheduleGrid.tsx`. `ScheduleGrid.test.tsx`, `BlockInstance.test.tsx` (11), `BlockLabel.test.tsx` (7). | Closed for the 3-zoom default/compact/expanded model. PRD-spec 75/100/125/150% not a 1:1 match — see UX-L5 row in `qa-uxl-matrix.md`. |

## Summary

- **Closed (Pass):** 3 of 7 P0s — all three research-sourced items (P0-RES-1, P0-RES-2, P0-RES-3).
- **Partially closed:** 3 of 7 — P0-1, P0-2, P0-4. All have meaningful engine/UI implementation but lack the full acceptance contract.
- **Open (Fail):** 1 of 7 — **P0-3** `openSlotPctTarget`. Not implemented.

**P0 blockers remaining before Ship:** 1 genuinely open (P0-3). The three Partials should be spec'd into sprint-5 polish items but do not block a limited-pilot ship.
