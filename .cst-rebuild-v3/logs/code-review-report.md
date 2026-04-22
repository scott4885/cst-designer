# Phase 4 — Code Review Report

**Reviewer:** Code Reviewer (autonomous)
**Date:** 2026-04-21
**Commits reviewed:** `bdaa959` (Sprint 1), Sprint 2B, `b50f43d` (Sprint 2C), `9f28116` (Sprint 3)
**Contracts:** `.cst-rebuild-v3/synthesis/scheduling-bible.md`, `.cst-rebuild-v3/synthesis/PRD-V4.md`
**Test posture at time of review:** 1166/1166 passing, 81 files, `tsc --noEmit` exit 0

---

## Review scope

Four sprints built the X-segment canonical primitive, the MultiColumnCoordinator, the
15-rule Anti-Pattern Guard, the 4 production-target policies, the V2 ScheduleGrid,
ProcedureOverride persistence, the route flip behind `NEXT_PUBLIC_SCHEDULE_V2`, and the
6-fixture golden-template regression suite. Key files reviewed:

- `src/lib/engine/multi-column-coordinator.ts`
- `src/lib/engine/anti-pattern-guard.ts`
- `src/lib/engine/production-policy.ts`
- `src/lib/engine/procedure-overrides.ts`
- `src/lib/engine/pattern-catalog.ts`
- `src/lib/engine/slot-helpers.ts` (coordinator integration)
- `src/lib/engine/rock-sand-water.ts` (coordinator threading)
- `src/lib/engine/slots-to-placed-blocks.ts`
- `src/lib/engine/generator.ts`
- `src/lib/engine/types.ts`
- `src/components/schedule/v2/ScheduleGrid.tsx`
- `src/components/schedule/v2/BlockInstance.tsx`
- `src/app/api/offices/[id]/procedure-overrides/route.ts`
- `src/app/offices/[id]/procedures/page.tsx`
- `src/lib/engine/__tests__/golden-templates/` (6 fixtures + runner)
- `prisma/schema.prisma`

---

## Findings

### P0 — must-fix before Phase 5

**P0-1. Anti-Pattern Guard numbering diverges from Bible §9.**
- File: `src/lib/engine/anti-pattern-guard.ts` (full file, 524 lines)
- The Bible §9 defines AP-1 as "two Rocks on the same doctor, same minute, where the
  doctor cannot be in both at once." The code's `ap1_doctorBottleneck` instead
  generalises to "any doctor collision where `maxConcurrentDoctorOps === 1`" — which
  is semantically close but named differently from the Bible contract, and similar
  drift appears on AP-5 (exam-window), AP-8 (lunch D-band), AP-13 (roster). Scheduler
  contract violations like this degrade the guard's usefulness as a shared
  vocabulary with scheduling coaches and with the requirements doc.
- Fix: Reconcile every AP-N handler to the Bible §9 wording. Add a comment block at
  the top of each handler quoting the exact Bible clause it implements, and add a
  unit test whose name is the Bible §9 label. If a new pattern was invented (e.g.,
  the generic doctor-bottleneck guard), give it a new AP number outside 1–15.
- Priority: P0 — this is a contract test that will keep regressing sprints if not
  pinned down now.

**P0-2. Five of six golden fixtures ship with non-zero `hardCeiling`.**
- File: `src/lib/engine/__tests__/golden-templates/smile-nm-monday.fixture.ts:46` and
  the other four fixtures.
- `hardCeiling: 6` on SMILE NM Monday (comment: "4 known hard violations on SMILE NM
  Mon: AP-8 lunch D-band x1 + AP-15 R2 overlap x3") — this is a test suite that
  passes _with known HARD guard violations baked in_. Bible §9 says HARD severity
  means "violates a core scheduling invariant" and Sprint 3's own report lists AP-8
  lunch overlap and AP-15 same-op overlap as open defects. Keeping these as ceilings
  means the build will go green even when the engine produces admittedly-broken
  schedules, and a future regression that pushes the count up by one will still pass
  if the ceiling is higher than the new count.
- Fix: Either (a) mark these fixtures `.skip` with an issue link and a driven-to-0
  commitment, or (b) split `hardCeiling` into `knownDebt: { ap8: 1, ap15: 3 }` with a
  per-AP assertion so a regression in AP-1 that happens to leave AP-8/15 unchanged
  still fails. Track each violation as a unit test in `__tests__/known-defects/`.
- Priority: P0 — this is a false-green safety net.

**P0-3. ProcedureOverride CRUD has no auth.**
- File: `src/app/api/offices/[id]/procedure-overrides/route.ts:1–197`
- The route performs a `blockType.officeId !== id` ownership check against the URL
  param, but nothing verifies the caller has access to `officeId` at all. PRD-V4
  §NFR-Security calls for per-office authorisation on all `/api/offices/[id]/*`
  routes. There is no `// TODO: auth` comment either, so this gap is easy to
  overlook at production cutover.
- Fix: Add a session check (feature-flagged so local dev is unaffected), or at
  minimum a `// TODO(auth-P5)` marker with the exact middleware to install. Make the
  same pass over the Sprint 2B/2C routes before cutover.
- Priority: P0 — surface-area gap.

**P0-4. `dayOfWeekRoster` default defeats Bible §7.**
- File: `prisma/schema.prisma:58` — `dayOfWeekRoster String @default("[\"MON\",\"TUE\",\"WED\",\"THU\",\"FRI\"]")`
- File: `src/lib/engine/types.ts` — `ProviderInput.dayOfWeekRoster?: DayCode[]`
- Bible §7 states the roster is "first-class; the scheduler is not allowed to assume
  MON–FRI for a provider with no roster data." The current Prisma default means a
  newly seeded or legacy provider silently gets MON–FRI, and the engine's AP-13
  check therefore _never fires_ for those providers. This turns a "first-class"
  field into a silent backward-compat knob.
- Fix: Change the Prisma default to an empty array (or require the field to be set
  during provider creation). Have the generator refuse to place blocks for a
  provider whose roster is empty, with a clear warning in `GenerationResult.warnings`.
- Priority: P0 — schema-encoded Bible violation.

**P0-5. AP-5 exam-window guard uses a heuristic, not the `examWindowMin` contract.**
- File: `src/lib/engine/anti-pattern-guard.ts` — `ap5_examWindow`:
  `const isLikelyHygiene = b.doctorMin > 0 && b.doctorMin < 20 && b.durationMin >= 50;`
- The Bible §R-3.5a defines exam windows as `xSegment.examWindowMin:
  { earliestUnitIdx, latestUnitIdx }`. The guard should consult that field (and the
  `BlockType` it resolves via `blockTypeId`), not pattern-match on doctor minutes.
  As written, the guard will silently pass any hygiene block with a wider doctor
  band than the heuristic and silently flag any non-hygiene doctor block that
  happens to be short.
- Fix: Load the `BlockTypeInput[]` into the guard context (alongside
  `providerRosters`), resolve each placed block's `xSegment.examWindowMin`, and only
  evaluate AP-5 when the field is present. Delete the `isLikelyHygiene` heuristic.
- Priority: P0 — the guard is structurally unable to enforce the contract.

---

### P1 — should-fix

**P1-1. `ScheduleGrid.tsx` is 769 lines.**
- File: `src/components/schedule/v2/ScheduleGrid.tsx`
- Combines GridBody, GridRow, ZoomControls, scroll-shadow overlays, the toolbar,
  and the Zustand wiring. PRD-V4 §UX-L4 (legibility maintainability) and the
  repo's own convention (`BlockInstance` in its own file) argue for splitting into
  `ScheduleGrid.tsx` (shell), `ScheduleGrid.Row.tsx`, `ScheduleGrid.Toolbar.tsx`,
  `ScheduleGrid.ZoomControls.tsx`, `ScheduleGrid.ScrollShadows.tsx`.
- Fix: Extract one file per concern, keep Zustand selector hooks local to the shell.

**P1-2. "Virtualisation" is `content-visibility: auto`.**
- File: `src/components/schedule/v2/ScheduleGrid.tsx`
- PRD-V4 §NFR-Perf calls for virtualised grid rendering on 60+ rows × 10+ ops.
  `content-visibility: auto` is a rendering-skip hint, not true virtualisation — it
  still instantiates the React subtree. Large schedules (multi-op, 5-min
  increments) will degrade. Under WebKit (Safari) the hint is unsupported, so
  the entire grid paints.
- Fix: Plan a Phase 5 task to adopt `react-window` or `@tanstack/virtual`. Until
  then, document the current behaviour in `PRD-V4.md §NFR-Perf`.

**P1-3. `PlacedBlock.doctorContinuityRequired` duplicates `xSegment.doctorContinuityRequired`.**
- File: `src/lib/engine/types.ts:252` (commented as "convenience duplicate").
- Two sources of truth on the hot path. `slots-to-placed-blocks.ts:144` reads
  `bt?.doctorContinuityRequired ?? bt?.xSegment?.doctorContinuityRequired ?? false`
  — any future change that forgets to update both fields will diverge silently.
- Fix: Pick one, remove the other. Prefer the xSegment version (Bible §2.1).

**P1-4. AP-12 has a redundant check.**
- File: `src/lib/engine/anti-pattern-guard.ts` — `ap12_zeroDoctorOnDoctorBlock`
- `b.doctorMin === 0` is tested twice. Dead branch.
- Fix: Remove one; add a unit test for the intended path.

**P1-5. AP-13 silently passes when `providerRosters` is undefined.**
- File: `src/lib/engine/anti-pattern-guard.ts` — `ap13_rosterDay`
- When the roster map is not supplied, the guard returns pass. Missing data is not
  the same as no violation; Bible §7 makes the roster mandatory.
- Fix: Return a SOFT INFO "roster data unavailable — cannot evaluate" instead of a
  silent pass, so the guard report surfaces the gap.

**P1-6. `findDoctorSegmentSlot` returns generic `DOCTOR_COLLISION`.**
- File: `src/lib/engine/multi-column-coordinator.ts`
- When the scan exhausts all candidate start minutes, the default `reason` is
  `DOCTOR_COLLISION` even when the underlying cause was (e.g.) continuity required
  or an EFDA cap hit. This dulls the debugging trail.
- Fix: Track the highest-severity reason encountered during scan and return it.

**P1-7. Generator re-exports bloat module surface.**
- File: `src/lib/engine/generator.ts` — re-exports `categorize`, `isMixValid`,
  `calculateCategoryTargets`, etc. for back-compat.
- Fix: Annotate each re-export with `@deprecated` and a one-sprint timeline, then
  remove in Sprint 5.

**P1-8. Pattern resolution has implicit 4-tier precedence.**
- File: `src/lib/engine/pattern-catalog.ts` — `resolvePattern(label)`
- The 4 tiers (exact → alias-exact → first-token → substring w/ word-boundary) are
  implemented but not named in the function comments and don't match Bible §8's
  named tiers exactly. Hard to audit.
- Fix: Add `PATTERN_RESOLUTION_TIERS = ['exact', 'alias', 'firstToken', 'substring']`
  and switch on that, so each tier is labelled and independently testable.

---

### P2 — nice-to-have

**P2-1. Production-policy drift threshold hard-coded.**
- File: `src/lib/engine/production-policy.ts` — `0.1` drift warning.
- Fix: Promote to named constant `POLICY_DRIFT_WARN_THRESHOLD`.

**P2-2. Slot → placed-block fallback decomposition silently papers over missing
xSegment.**
- File: `src/lib/engine/slots-to-placed-blocks.ts:118–130`
- When xSegment sum ≠ duration, the fallback reconstructs pre/doc/post from
  `staffingCode === 'D'` runs. Plausible but untested.
- Fix: Emit an INFO-level warning in `GenerationResult.warnings` whenever the
  fallback fires — helps catch un-migrated BlockTypes in dev.

**P2-3. `BlockInstance.effectiveHighlightExam` duplicates hygiene visual logic.**
- File: `src/components/schedule/v2/BlockInstance.tsx`
- `effectiveHighlightExam = highlightHygieneExamSlot ?? isHygieneBlock` is a fall-
  through that makes the default "highlight everything hygiene" — probably intended
  but not obvious.
- Fix: Rename to `exam_highlight_default_on_hygiene_unless_overridden` or simplify.

**P2-4. Procedure-category stripe colour falls back to provider colour.**
- File: `src/components/schedule/v2/BlockInstance.tsx`
- When a block has no `procedureCategory`, the semantic stripe becomes the
  provider colour — which is the _same_ colour used for the provider column header
  and can read as "no category" rather than "unknown category." Minor confusion.
- Fix: Use a neutral grey hatching for "no category" and reserve provider colour
  for identity.

**P2-5. `hardCeiling` naming is ambiguous.**
- File: `src/lib/engine/__tests__/golden-templates/_shared.ts`
- Calling it `hardCeiling` implies HARD-severity only — but the field is compared
  against `report.counts.hard`, fine. Consider `knownHardDebt` to signal intent.

---

## Architecture

- **Coordinator is pure-data and Prisma-decoupled** — takes `CoordinatorConfig`,
  holds `doctorSegments: DoctorScheduleTrace[]`, exposes `findDoctorSegmentSlot` and
  `reserveDoctorSegment`. No DB, no React, no env. Testable in isolation. Excellent.
- **Production-policy selector is a `Record<ProductionTargetPolicy, PolicyParams>`**
  keyed by enum — extensible, no if/else cascade.
- **`ProcedureOverride.merge()` produces engine-ready `BlockTypeInput[]`** with null-
  means-inherit semantics. Field-by-field folding, no structural reallocation when
  the override is a no-op. Hot path touches the DB once per office per generation.
- **Coordinator threaded through `rangesAvoidingDMinutes` as an optional** —
  additive, preserves determinism, and the 1136 Sprint 2C baseline tests still pass
  byte-identical. Textbook non-breaking integration.
- **Slot → PlacedBlock translator is shared** between the generator and the V2
  canvas — single source of truth for the invariant model.

## Style

- Consistent use of `@module` headers on engine files; good.
- Inline styles dominate `ScheduleGrid.tsx` (P1-1) — other components use Tailwind
  utility classes. Pick a lane.
- `Set<number>` avoid-set on minute-level ticks is memory-reasonable for a workday
  but will balloon for clinics that open 24/7 — not a current defect, just a future
  constraint.
- Good use of `??` over `||` for numeric defaults throughout the engine.
- Imports are cleanly split into `type`-only and value imports. No circular imports
  detected.

## Security

- Zod validation on every API body (good — matches SGA repo pattern).
- P2025 idempotency on DELETE (Prisma-standard). Good.
- **Missing auth on `/api/offices/[id]/procedure-overrides/route.ts`** (P0-3).
- No rate limiting on the CRUD routes. Acceptable for Phase 4 (local dev) but flag
  for production cutover.
- No PII in the route handlers — patient data boundary intact. The `ProcedureOverride`
  model holds only office-level scheduling metadata. Safe.
- `.env.local` referenced for the V2 feature flag — standard Next.js convention,
  no secrets leaked in the repo.

## Performance

- Coordinator uses linear scan (`overlaps()`) over `doctorSegments[]` on every
  `findDoctorSegmentSlot` call. Acceptable at current scale (≤20 blocks/doctor/day,
  ≤6 doctors per practice) — 120 ops per call. Document the O(n²) constant.
- `rangesAvoidingDMinutes` coordinator-merge folds all reservations into a
  `Set<number>` per call — rebuilt every invocation rather than cached.
  Optimisation opportunity, not a current blocker.
- `ScheduleGrid.tsx` renders every row (P1-2) — see finding.
- Golden tests run in `describe.each`, 30 cases × ~50ms each ≈ 1.5s — within budget.

## Test coverage

- **1166 passing / 81 files, 30 new golden-template cases.** Baseline preserved.
- Golden tests assert structural invariants, not byte goldens. Research-aligned and
  robust to future engine changes — excellent call.
- **But**: per P0-2, the golden tests pass _with_ known HARD violations under a
  ceiling. The safety net has a hole.
- Coordinator unit tests cover placement, reservation, EFDA cap. Missing:
  reservation cancellation on backtrack, deterministic tie-break ordering across
  reservations, mixed-practice-model rule evaluation (JAMESON/LEVIN/FARRAN).
- No Playwright test verifies the Guard Report panel actually renders violations in
  the UI — only that the element exists (`data-guard-panel`). Add an assertion that
  at least one AP-N row is visible when the fixture is known to fail.

## Dead code

- `categorize`, `isMixValid`, `calculateCategoryTargets`, `FALLBACK_IDS`,
  `DEFAULT_BLOCKS`, `getAllBlocksForCategory` — all re-exported from
  `rock-sand-water.ts` via `generator.ts` for back-compat. Verify each caller
  externally and deprecate. See P1-7.
- `legacyPatternCatalog` is marked `@deprecated` in the code comment but exported
  publicly as `PATTERN_CATALOG`. Gate behind a `@deprecated` annotation on the
  export and plan removal for Sprint 5.
- AP-12 redundant `b.doctorMin === 0` check (P1-4).

---

## Summary verdict

**Recommendation: SHIP WITH MINOR FIXES.**

The four sprints land a coherent, testable, Prisma-decoupled engine core with a
clean multi-column coordinator, an extensible production-policy framework, and a
research-aligned golden-template suite. The architectural choices are strong and
the non-breaking Sprint 3 coordinator integration is exemplary.

Five P0 findings block a clean Phase 5 start — all are addressable in a targeted
1-2 day Sprint 3.5:

1. Reconcile AP numbering to Bible §9 verbatim (1 day).
2. Replace global `hardCeiling` with per-AP known-debt assertions (0.5 day).
3. Add auth middleware / TODO markers on the CRUD routes (0.5 day).
4. Remove the Prisma `dayOfWeekRoster` default; add empty-roster warnings (0.5 day).
5. Swap the AP-5 heuristic for `xSegment.examWindowMin` consultation (0.5 day).

The P1 list is 8 items, mostly refactoring, and can slot into Sprint 4 alongside
the AP-8/AP-15 engine fixes already called out in the Sprint 3 report.

No security-critical findings beyond the auth gap, no PHI leakage, no destructive
schema changes. The test suite is broad and the architecture is sound — this is a
healthy codebase with a short, concrete punch list.

## Action items

| # | Priority | File | Action |
|---|---------|------|--------|
| P0-1 | must-fix | `src/lib/engine/anti-pattern-guard.ts` | Rename AP handlers to Bible §9 verbatim; add per-AP contract test |
| P0-2 | must-fix | `src/lib/engine/__tests__/golden-templates/_shared.ts` + 6 fixtures | Replace `hardCeiling` with per-AP `knownDebt` map |
| P0-3 | must-fix | `src/app/api/offices/[id]/procedure-overrides/route.ts` | Add auth middleware (or TODO marker with owner + date) |
| P0-4 | must-fix | `prisma/schema.prisma:58` | Remove MON–FRI default on `dayOfWeekRoster`; emit warning on empty roster |
| P0-5 | must-fix | `src/lib/engine/anti-pattern-guard.ts` (`ap5_examWindow`) | Consult `xSegment.examWindowMin` instead of doctorMin heuristic |
| P1-1 | should-fix | `src/components/schedule/v2/ScheduleGrid.tsx` | Split 769-line file into Row / Toolbar / ZoomControls / ScrollShadows |
| P1-2 | should-fix | `src/components/schedule/v2/ScheduleGrid.tsx` | Plan `react-window` adoption; doc current behaviour in PRD-V4 |
| P1-3 | should-fix | `src/lib/engine/types.ts:252` | Remove duplicate `doctorContinuityRequired` field |
| P1-4 | should-fix | `src/lib/engine/anti-pattern-guard.ts` (`ap12`) | Remove redundant `doctorMin === 0` check |
| P1-5 | should-fix | `src/lib/engine/anti-pattern-guard.ts` (`ap13`) | Return INFO when roster data unavailable |
| P1-6 | should-fix | `src/lib/engine/multi-column-coordinator.ts` | Track highest-severity scan reason |
| P1-7 | should-fix | `src/lib/engine/generator.ts` | `@deprecated` on re-exports; remove Sprint 5 |
| P1-8 | should-fix | `src/lib/engine/pattern-catalog.ts` | Name the 4 resolution tiers; per-tier test |
| P2-1 | nice | `src/lib/engine/production-policy.ts` | Constant for 0.1 drift threshold |
| P2-2 | nice | `src/lib/engine/slots-to-placed-blocks.ts` | Warn when xSegment fallback fires |
| P2-3 | nice | `src/components/schedule/v2/BlockInstance.tsx` | Rename `effectiveHighlightExam` |
| P2-4 | nice | `src/components/schedule/v2/BlockInstance.tsx` | Neutral grey for no-category blocks |
| P2-5 | nice | `src/lib/engine/__tests__/golden-templates/_shared.ts` | Rename `hardCeiling` → `knownHardDebt` |

**Totals:** 5 P0 · 8 P1 · 5 P2 = 18 findings.
