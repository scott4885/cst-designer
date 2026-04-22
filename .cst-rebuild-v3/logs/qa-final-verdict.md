# Phase 4 QA — Final Verdict

**Date:** 2026-04-21
**Test suite at HEAD:** 1167 passed / 0 failed / 82 files (1166 baseline + 1 QA diagnostic added).
**TypeScript:** `npx tsc --noEmit` passes (not re-run by QA; trusted from Sprint 3 report).
**Build:** Not re-run by QA (per brief — inspect only).

## Overall status: **Ship-with-fixes**

The engine is materially better than Sprint 3 described. All six golden
fixtures now report **zero HARD anti-pattern violations**, zero lunch
D-band overlaps, and zero same-op or 3-way doctor-X overlaps. The
Sprint 3 ceiling of 6 HARD violations per SMILE NM day is stale — actual
is 0. Legibility overhaul (UX-L1..L9) is in. The MultiColumnCoordinator
is live. X-segment model is the primary data primitive.

What keeps this from a clean Ship: **three FRs are missing outright
(FR-8 goal derivation, FR-24 doctor-$/hr telemetry, FR-EMR-1 emergency
slot contract)**, one P0 is unimplemented (P0-3 `openSlotPctTarget`),
and two UX-L items (L11 policy chip, L12 goal-derivation popover) and
FR-14 three-part duration editing in the Properties Panel are not
surfaced despite backing data existing.

## P0 blockers — must fix before broader rollout

1. **P0-3 — `openSlotPctTarget` not implemented.** Generator still fills to capacity minus variety-cap. Research-cited requirement to leave walk-in/emergency capture slots is absent. Fix: add field to `ScheduleRule`, honour in `rock-sand-water.ts`, add guard for over-fill.
2. **P0-4 — coordinator fallbacks silent.** Guard report catches end-state but `GenerationResult.coordinatorFallbacks[]` is not emitted. Operators cannot tell *why* a block was deferred. Fix: instrument coordinator to emit fallback events; surface in `GuardReportPanel.tsx`.
3. **Sprint 3 `hardCeiling` values are stale.** All 6 fixtures currently produce 0 HARD; ceilings are set at 4–6. Ratchet down to 0 so regressions fail the build. Trivial fix.

## P1 — should fix before GA

1. **FR-8 Goal derivation missing.** Users still type daily goals manually. Implement `(annual ÷ working_days) − hygiene = doctor_daily` pipeline; persist audit trail; surface via UX-L12 popover.
2. **FR-24 Doctor-production-per-hour telemetry missing.** Add `projectedDoctorProductionPerHour` to `GenerationResult`; amber < $500, red < $350.
3. **FR-EMR-1 Emergency-slot 3-attribute contract missing.** Add `scheduledWindow`, `protectedUntil`, `autoReleaseBehavior` to schema + rules form.
4. **FR-4 `doctorTransitionBufferMin`, `emergencySlotConfig` not configurable.** AP-4 guard exists but the field is not exposed — no way for a practice to turn it on.
5. **UX-L11 Production-policy chip missing** from the toolbar. Policy persists in schema but is invisible to the operator.
6. **UX-L12 Goal-derivation popover missing.** Tied to FR-8.
7. **FR-14 Properties Panel three-part duration editing** not confirmed. Users may still edit `durationMin` as a scalar, bypassing X-segment semantics.
8. **RC/PM under-placement.** Extracted-patterns ground truth shows RC/PM as the single most common block (~25% of SMILE NM volume). Engine produces ~2/day of explicit `RCPM` label (rest labelled `recare-default` / empty). Review label mapping before GA.
9. **Practice-model UI selector missing (FR-1).** Schema has the column but no form field. Defaults to `1D2O` silently.
10. **Sprint 3 `hardCeiling` values.** Repeat of P0 — graduate to P1 if timing pushes the P0 fix.

## P2 — backlog

1. UX-L5 zoom naming/steps diverge from PRD (3 levels instead of 4%-anchored). Functional intent met; cosmetic.
2. `aria-live` region announces selection only — not violations. Screen-reader parity gap.
3. Responsive check below 1280 px not automated (PRD floor is 1280; below that is out of scope but worth a screenshot matrix).
4. `/audit` page exists but X-segment validity not surfaced.
5. Chair-utilization benchmark has no network-comparison test.
6. No `procedure-override.test.ts` despite PRD §15 calling for one (coverage is via integration tests).
7. `coordinatorFallbacks[]` field omission (see P0-4) also hits PRD §8.6 compliance.

## Risk assessment for production deploy

| Risk | Severity | Mitigation |
|---|---|---|
| Operators ship schedules that over-fill the day (no open-slot headroom) | Medium | Document `openSlotPctTarget` gap; advise practices to hand-trim 10–20% per op until fixed. |
| Missing goal-derivation mis-calibrates primary-block budget | Medium | Goals are manually entered — same failure mode as V3. Not a *regression*, just an un-fixed existing gap. |
| RC/PM label drift (engine calls them `recare-default`) makes Excel exports look different from the source Excel | High | Front-load label-mapping review with Alexa & Megan; adjust `hygiene-exam-finder.ts` label emission. Blocks export-fidelity confidence. |
| Emergency-slot policy is enum-only; practices lose protected-until guarantee | Low for Phase A | Front-desk team owns emergency policy today manually. Deferring FR-EMR-1 is acceptable if documented. |
| Policy chip absence confuses operators switching policies | Low | Document current default (`JAMESON_50`). Cannot switch in UI anyway. |
| `hardCeiling` stale — future regression could sneak in at ceiling=6 | Low | Trivial fix; do it in Sprint 5 first commit. |

**Verdict.** Limited-pilot ship to Alexa & Megan is defensible *if* P0-3 is patched and the RC/PM label drift is resolved. Broader rollout requires the P1 list. No data-loss or corruption risk identified.
