# CST Designer — Product Requirements Document (PRD v3.0)

| Field | Value |
|---|---|
| Document | Product Requirements Document |
| Version | 3.0 |
| Date | 2026-04-21 |
| Status | Draft for Review |
| Supersedes | [PRD v1.0 (2026-02-12)](PRD.md), [PRD-V2-FIXES punch list](PRD-V2-FIXES.md) |
| Authors | Product + Engineering |
| Audience | SGA internal stakeholders, CST ops (Alexa, Megan), engineering |
| Repo | `scott4885/cst-designer` |
| Live URL | `http://cst.142.93.182.236.sslip.io/` (Coolify, Docker) |

---

## 1. Executive Summary

CST Designer (Custom Schedule Template Designer) is an internal SGA tool that generates and maintains weekly block-schedule templates for ~150 dental offices in the network. Two ops specialists (Alexa and Megan) use it to turn a short clinical intake (practice hours, providers, goals, procedure mix) into a fully-filled 10-minute-granularity weekly template that the practice's DPMS team then mirrors into Open Dental / Dentrix / Eaglesoft.

The product is currently in rebuild-v2 (the codebase was re-founded from scratch on 2026-04-15 after the Feb v1 architecture audit flagged multiple sources of truth and no persistence). As of today (2026-04-21) the build includes:

- A deterministic Rock-Sand-Water (RSW) placement engine ([rock-sand-water.ts](src/lib/engine/rock-sand-water.ts)), with canonical staffing patterns extracted from six real multi-column templates.
- Prisma + SQLite persistence ([schema.prisma](prisma/schema.prisma)) replacing the in-memory Feb prototype.
- A three-panel UI (Block Palette / Canvas / Properties) on a light/white theme.
- Excel export with 10-minute row fidelity and color-matched cells ([excel.ts](src/lib/export/excel.ts)).
- 855+ vitest cases across 24 engine test suites.

The product works end-to-end for the simple case — one doctor, one hygienist, one op — but leaks reliability in multi-op, multi-provider, rotation-week, and edit-after-generate scenarios. This PRD v3 re-states scope, codifies the engine contract against what the code now does, and inventories the ~25 open problems (prioritised) that must close before the tool is rolled out beyond Alexa and Megan.

## 2. Problem Statement

The user explicitly flagged, at the opening of this drafting session, that CST Designer has "lots of problems." Those problems cluster into five themes:

1. **Intake incompleteness.** Office setup collects provider hours and daily goals, but does not yet collect (a) per-provider operatory assignment on the provider form itself, (b) NP/SRP blocks-per-day targets on the Schedule Rules form, or (c) Assisted-Hygiene mode as a first-class toggle. Schedulers compensate by editing generated output.
2. **Generator over-fills.** The generator packs every empty slot post-placement ([fillRemainingDoctorSlots at rock-sand-water.ts](src/lib/engine/rock-sand-water.ts)). There is no "leave N% open for urgent/walk-in capture" knob, which the QA report calls out as a blocker to Alexa's click-to-add workflow.
3. **Edit-after-generate is fragile.** Manual edits on the canvas do not re-run production summaries, morning-load telemetry, or variety-cap checks. Users save a template that the engine would not itself produce.
4. **Multi-column correctness gaps.** Cross-column D-phase zigzag exists ([rangesAvoidingDMinutes at slot-helpers.ts:392](src/lib/engine/slot-helpers.ts#L392)) but does not escalate to a warning when it falls back to a ≥1-overlap candidate. Staggering ([DEFAULT_COLUMN_STAGGER_MIN in stagger.ts](src/lib/engine/stagger.ts)) is applied but not visually verified in the canvas.
5. **Brand-visual gaps.** Hygienist default daily goal is `$5,000` ([schema.prisma:44](prisma/schema.prisma#L44)) — roughly 3x reality. Block labels overflow narrow columns. The 'D' doctor-check code inside a hygienist column has no visual distinction, so an exam that pulls the doctor is indistinguishable from the hygienist's own time.

Underneath those symptoms is a single design gap: the product treats *generation* as the primary workflow and *refinement* as a secondary afterthought. Real users spend 70%+ of their session in refinement. PRD v3 commits to closing that asymmetry.

## 3. Users and Use Cases

### 3.1 Primary Users

**Alexa** — SGA CST ops specialist. Owns new-office onboarding and quarterly template refresh. Runs 4–6 new templates per week, revises 10–15. Desktop user.

**Megan** — SGA CST ops specialist. Owns mid-cycle template adjustments triggered by provider changes (associate added, hygienist reduced hours, lunch moved). Runs ~8 revisions per week.

### 3.2 Secondary Users (future)

**Regional Directors** — read-only access to production summaries and quality scores as part of practice operational reviews.

**Practice Office Managers** — receive the exported Excel schedule and mirror it into their DPMS. No direct CST Designer access.

### 3.3 Use Cases

| ID | Use case | Actor | Frequency |
|---|---|---|---|
| UC-1 | Onboard new office — create office, providers, block types, generate week | Alexa | 4–6 / week |
| UC-2 | Quarterly refresh — regenerate all 5 days preserving saved rules | Alexa | 60+ / quarter |
| UC-3 | Provider change — edit one provider, regenerate affected days | Megan | 8 / week |
| UC-4 | Swap a single block on the canvas without regenerating | Megan | 15 / week |
| UC-5 | Export Excel for office manager review | both | every run |
| UC-6 | Compare two template variants (A/B rotation, EOF vs regular) | Alexa | 5 / week |
| UC-7 | Audit an existing template against clinical rules | Alexa | on demand |

## 4. Domain Model and Vocabulary

### 4.1 Core entities

- **Office** — a single dental practice. One Office has many Providers, many BlockTypes, one ScheduleRule, many ScheduleTemplates, many ScheduleVersions. Schema: [Office model at schema.prisma:10](prisma/schema.prisma#L10).
- **Provider** — a doctor or hygienist (role `DOCTOR | HYGIENIST | OTHER`). Has `operatories` (JSON string of op names), `columns` (chair count), per-day `providerSchedule` with optional rotation, `staggerOffsetMin` for multi-column placement, and `currentProcedureMix` / `futureProcedureMix` JSON blobs. Schema: [Provider model at schema.prisma:32](prisma/schema.prisma#L32).
- **BlockType** — a canonical appointment template (HP, MP, NP CONS, NP HYG, SRP, PM/GING, RC/PM, ER, NON-PROD). Carries `durationMin/durationMax`, `color`, `procedureCategory` (one of 8 clinical categories), staffing-time splits `dTimeMin`/`aTimeMin`/`hTimeMin`. Schema: [BlockType model at schema.prisma:55](prisma/schema.prisma#L55).
- **ScheduleRule** — per-office generation rules: `npModel` (DOCTOR_ONLY, HYGIENE_ONLY, BOTH), `npBlocksPerDay`, `srpBlocksPerDay`, `hpPlacement`, `doubleBooking`, `matrixing`, `emergencyHandling`. Schema: [ScheduleRule at schema.prisma:72](prisma/schema.prisma#L72).
- **ScheduleTemplate** — a generated and saved day. Unique per `(officeId, dayOfWeek, weekType, type)`. `variantLabel` (EOF, Opt1, …) distinguishes non-regular variants. Slots, summary, warnings stored as JSON. Schema: [ScheduleTemplate at schema.prisma:85](prisma/schema.prisma#L85).
- **ScheduleVersion** — auto-snapshot on every save (rollback target). Schema: [ScheduleVersion at schema.prisma:119](prisma/schema.prisma#L119).
- **ProviderAbsence** — date-based time-off entries. Schema: [ProviderAbsence at schema.prisma:132](prisma/schema.prisma#L132).

### 4.2 Staffing codes

`A` = assistant hands-on (doctor not in chair). `D` = doctor hands-on. `H` = hygienist hands-on. `null` = open / break. See [StaffingCode type at types.ts](src/lib/engine/types.ts).

### 4.3 Procedure categories

Enum of 8 clinical classifications: `MAJOR_RESTORATIVE`, `ENDODONTICS`, `BASIC_RESTORATIVE`, `PERIODONTICS`, `NEW_PATIENT_DIAG`, `EMERGENCY_ACCESS`, `ORAL_SURGERY`, `PROSTHODONTICS`. Used when the provider has a `futureProcedureMix` to drive category-weighted placement. See [ProcedureCategory in types.ts](src/lib/engine/types.ts).

### 4.4 Canonical block patterns (extracted from 6 real multi-column templates)

These are the ground-truth A/D/H sequences observed in the SMILE NM (Mon–Fri) and Smile Cascade (Mon) templates. All assume 10-minute slots.

| Code | Label | Duration | Pattern | Role | Aliases |
|---|---|---|---|---|---|
| HP | HP > $1800 | 80 min | `A-A-D-D-D-D-A-A` | DOCTOR | HIGH PRODUCTION, HP>$1800 |
| MP | MP | 40 min | `A-D-D-A` | DOCTOR | MID PRODUCTION, FILLING |
| ER | ER | 30 min | `A-D-A` | DOCTOR | EMERGENCY, LIMITED EXAM |
| NON_PROD | NON-PROD | 30 min | `A-A-A` | DOCTOR | NONPROD, NON PROD |
| NP_DOC | NP CONS | 40 min | `A-D-D-A` | DOCTOR | NEW PATIENT CONSULT |
| NP_HYG | NP>$300 | 90 min | `H-H-H-H-H-D-D-D-H` | HYGIENIST | NEW PATIENT, NP |
| PM_GING | PM/GING>$150 | 60 min | `H-H-H-H-H-H` | HYGIENIST | PROPHY, GINGIVITIS |
| RC_PM | RC/PM > $130 | 60 min | `H-D-H-H-H-H` | HYGIENIST | RECALL, RECARE |
| SRP | SRP>$400 | 60 min | `H-H-H-H-H-H` | HYGIENIST | SCALING, PERIO MAINTENANCE |

Source of truth: [pattern-catalog.ts:19](src/lib/engine/pattern-catalog.ts#L19). Extraction evidence: [.rebuild-research/extracted-patterns.md](.rebuild-research/extracted-patterns.md).

### 4.5 Vocabulary the tool must continue to honor

- **Rock / Sand / Water** — large protected production blocks / mid-value variable blocks / NON-PROD connective time.
- **Linda Miles rule** — 2 rocks AM, 1 rock PM per doctor op (codified as `protectedRockBlocks` in [RSWConfig at types.ts](src/lib/engine/types.ts)).
- **Burkhart 80/20** — 80% of restorative volume in AM (enforced by [morning-load-enforcer.ts](src/lib/engine/morning-load-enforcer.ts)).
- **75% rule** — target of 75% of `dailyGoal` is the placement ceiling, not 100% (see [calculator.ts](src/lib/engine/calculator.ts), `calculateTarget75`).
- **Matrixing** — marking the ~60%-through slot of a hygiene block as `D` so the doctor's exam overlay is visible across columns. Excludes SRP / PERIO SRP.
- **Stagger** — horizontal time offset between operatories of the same doctor so they are not in two chairs at the same minute.
- **Variety cap** — no single block type may exceed 65% of a provider+op's non-break slots (`MAX_SAME_TYPE_FRACTION = 0.65` at [slot-helpers.ts:431](src/lib/engine/slot-helpers.ts#L431)).

## 5. Functional Requirements

### 5.1 Office & provider setup

- **FR-1** The system must allow creation, edit, and soft-delete of Offices. An Office carries `name`, `dpmsSystem` (enum OPEN_DENTAL / DENTRIX / EAGLESOFT), `workingDays` (JSON), `timeIncrement` (10 or 15, default 10), `operatories`, `alternateWeekEnabled`, `rotationEnabled`, `rotationWeeks` (2–4).
- **FR-2** The system must allow 1–N Providers per Office. Provider form must collect: name, role, columns (1–N), operatories (multi-select mapped to Office operatories — *currently missing on provider form; see section 13 P0-1*), working hours, lunch window, daily goal, color, `seesNewPatients`, `staggerOffsetMin`, and per-day schedule overrides with optional rotationWeeks.
- **FR-3** The system must allow 1–N BlockTypes per Office. BlockType form must collect: label, description, minimumAmount, appliesToRole (DOCTOR / HYGIENIST / BOTH), durationMin/durationMax, color, isHygieneType, `dTimeMin`, `aTimeMin`, `procedureCategory`, and an optional per-slot `pattern` override.
- **FR-4** The system must allow per-Office ScheduleRule configuration: `npModel`, `npBlocksPerDay`, `srpBlocksPerDay`, `hpPlacement` (MORNING / AFTERNOON / MIXED), `doubleBooking`, `matrixing`, `emergencyHandling`.

### 5.2 Generation

- **FR-5** The system must generate a full day schedule given (providers, blockTypes, rules, timeIncrement, dayOfWeek, optional activeWeek). Entry point: [generateSchedule at generator.ts:188](src/lib/engine/generator.ts#L188).
- **FR-6** Generation must be deterministic when a `seed` is provided (seeded RNG) and legacy-random otherwise. See [generator.ts:196](src/lib/engine/generator.ts#L196).
- **FR-7** Generation must honor per-day `rotationWeeks`, excluding providers whose active week does not match.
- **FR-8** Generation must stagger multi-op doctors using `staggerOffsetMin` (base) + `columnStaggerIntervalMin` (per-op increment, default 20).
- **FR-9** When a provider has a valid `futureProcedureMix` (sums ~100%), the engine must use category-weighted placement ([placeDoctorBlocksByMix](src/lib/engine/rock-sand-water.ts)) instead of standard RSW.
- **FR-10** The generator must never exceed the 65% variety cap for any single block type on any single provider+op.

### 5.3 Canvas editing

- **FR-11** Users must be able to click-to-replace any slot's block on the canvas via the BlockPicker ([BlockPicker.tsx](src/components/schedule/BlockPicker.tsx)).
- **FR-12** Users must be able to drag-drop re-arrange blocks within an op (dnd-kit, [ScheduleGrid.tsx](src/components/schedule/ScheduleGrid.tsx)).
- **FR-13** Any edit on the canvas must trigger an incremental recompute of (a) production summary, (b) morning-load ratio, (c) conflict/overlap detection, and (d) quality score badge. *Currently partial — see P1-3.*
- **FR-14** Users must be able to open Properties Panel ([PropertiesPanel.tsx](src/components/schedule-builder/PropertiesPanel.tsx)) on any selected block and edit its label, duration, pattern, color, and production amount.

### 5.4 Variants & rotation

- **FR-15** The system must support A/C rotation weeks (alternating templates) via `weekType` on ScheduleTemplate.
- **FR-16** The system must support variant days via `variantLabel` (EOF, Opt1, Opt2, …) — already present in schema and Excel exporter.
- **FR-17** Users must be able to clone a template (day → another day, or week A → week C).

### 5.5 Export

- **FR-18** Export to `.xlsx` with 10-minute rows, per-op columns, color-tinted cells matching block type colors, and production summary footer. See [excel.ts](src/lib/export/excel.ts).
- **FR-19** Export to DPMS-specific formats (Open Dental first) via [open-dental.ts](src/lib/export/open-dental.ts).
- **FR-20** Export must include variant tag in the sheet/file name when present.

### 5.6 Analytics & governance

- **FR-21** The system must compute and surface a `quality-score` (0–100) per day, per week, per office. See [quality-score.ts](src/lib/engine/quality-score.ts).
- **FR-22** The system must auto-snapshot a ScheduleVersion on every save (rollback history).
- **FR-23** The system must run [audit.ts](src/lib/audit.ts) checks (block type coverage, provider coverage, rule coverage) accessible at `/audit`.
- **FR-24** The system must compute chair utilization (`src/lib/engine/chair-utilization.ts`) and benchmark providers across the network (`src/lib/benchmark-providers.ts`).

## 6. Non-Functional Requirements

- **NFR-1 Performance.** Full-week regeneration (5 days × 3 providers × 2 ops) must complete in ≤ 1.5 seconds on a mid-tier laptop (Intel i5 / 16GB). Canvas re-render on block edit ≤ 150 ms.
- **NFR-2 Determinism.** With a fixed seed, the same (input, rules) must produce byte-identical slot arrays. This is required so CI golden tests pass.
- **NFR-3 Persistence.** All writes go to SQLite via Prisma. No in-memory state may outlive a request. No `window.localStorage` as primary storage (UI preferences only).
- **NFR-4 Theme.** All HTML surfaces must render on a light/white background with dark text. No dark-mode variants in MVP.
- **NFR-5 Responsiveness.** The three-panel canvas must remain usable at viewport widths down to 1280 px. Below that, Block Palette collapses into a drawer.
- **NFR-6 Test coverage.** Engine modules (under `src/lib/engine/`) must maintain ≥ 85% statement coverage. The current suite is 24 test files with 855+ assertions.
- **NFR-7 Deployability.** The tool must ship as a single container (Dockerfile present at repo root) deployed via Coolify to a sslip.io subdomain. No Netlify / Vercel dependency.
- **NFR-8 Browser support.** Chrome, Edge, Firefox — latest two versions. Safari best-effort.
- **NFR-9 Tech stack.** Next.js 16, React 19, Prisma 7 + better-sqlite3, Tailwind 4, shadcn/ui, react-hook-form + zod, ExcelJS, Recharts, Zustand for local UI state, vitest + Playwright.

## 7. Non-Functional Requirements (security, accessibility, data)

- **NFR-10 No PHI.** CST Designer does not process patient data. It handles practice-level operational metadata only.
- **NFR-11 Auth.** MVP is internal-only — unauthenticated behind an IP/VPN boundary. Post-MVP: Supabase or Cognito, SGA SSO.
- **NFR-12 Accessibility.** Keyboard navigation on canvas (arrow keys move selection, Enter opens picker). See [keyboard-shortcuts.ts](src/lib/keyboard-shortcuts.ts). Contrast ratio ≥ 4.5:1 for text, ≥ 3:1 for block fills.
- **NFR-13 Data export.** Exports are user-initiated. No automated uploads to third-party services.
- **NFR-14 Soft delete.** Offices are soft-deleted; ScheduleVersions preserve the pre-delete state.

## 8. Engine Behaviour Specification (RSW Contract)

This is the authoritative contract for what `generateSchedule()` must do. The implementation lives in [generator.ts:188](src/lib/engine/generator.ts#L188) and delegates to [rock-sand-water.ts](src/lib/engine/rock-sand-water.ts).

### 8.1 Order of operations (standard path)

1. **Initialise slots.** For each provider × operatory × time-increment, create a `TimeSlotOutput` marked break if inside the lunch window. See [generator.ts:199](src/lib/engine/generator.ts#L199).
2. **Build provider-slot map.** Index slots by `providerId::operatory`. See [buildProviderSlotMap at slot-helpers.ts:51](src/lib/engine/slot-helpers.ts#L51).
3. **Place doctor blocks per op.** For each doctor, for each operatory (in order), run either `placeDoctorBlocksByMix` (if `futureProcedureMix` is valid) or `placeDoctorBlocks`. Multi-op doctors accumulate `avoidDMinutes` across ops so later ops zigzag around earlier ops. See [generator.ts:260–318](src/lib/engine/generator.ts#L260).
4. **Place hygienist blocks per op.** For each hygienist, run `placeHygienistBlocks` with the hygienist's index and total count (used to stagger SRP placement).
5. **Fill remaining gaps.** `fillRemainingDoctorSlots` and `fillRemainingHygienistSlots` do a weighted random fill honoring the 65% variety cap and `avoidDMinutes`. See [generator.ts:329–330](src/lib/engine/generator.ts#L329).
6. **Morning-load enforcement.** Post-fill, `enforceMorningLoad` swaps PM restorative into AM up to Burkhart 80/20. Runs before matrixing. See [generator.ts:336](src/lib/engine/generator.ts#L336).
7. **Matrixing.** If `rules.matrixing === true`, mark the ~60%-through slot of each non-SRP hygiene block as `D`. See [addDoctorMatrixing](src/lib/engine/rock-sand-water.ts).
8. **Production summary.** Compute per-provider actual vs target with status (MET / UNDER / OVER). See [calculateAllProductionSummaries](src/lib/engine/production-calculator.ts).

### 8.2 Placement priority (standard `placeDoctorBlocks`)

In order, the engine tries:

1. AM Rocks — 2 HP anchors in morning for op 0, 2 for op 1, 0 for op 2+ (with a guaranteed min 1 HP anchor per op regardless).
2. PM Rock — 1 HP anchor after lunch.
3. Mid-morning ER (access block).
4. NP CONS — if `npModel` is DOCTOR_ONLY or BOTH, place `npBlocksPerDay` NP consults, morning preferred.
5. MP Sand — fill mid-values toward the 75% target.
6. NON-PROD Water — late-morning / late-afternoon connective.
7. Second ER and second MP as needed.
8. Goal-driven gap fill — continue placing sand until remaining target ≤ 0.
9. Fill remaining slots (see step 5 of order of operations).

### 8.3 Pattern resolution

When a block is placed in a range of length N, staffing is derived by `resolveBlockPattern`:

1. If `blockType.pattern` is explicitly set — use it.
2. Else lookup [pattern-catalog.ts](src/lib/engine/pattern-catalog.ts) by label, aliases, first-token, and word-boundary substring (in that order).
3. Else fall back to `derivePattern(role, N)` — hygienists all-H, doctors A-bookends.
4. If the canonical pattern's length ≠ N, proportionally resample, then hard-preserve bookends and the second slot from each end for length ≥ 4. See [slot-helpers.ts:155](src/lib/engine/slot-helpers.ts#L155).

### 8.4 Variety cap

`wouldExceedVarietyCap` blocks any placement that would push a single block type above 65% of the provider+op's non-break slots. See [slot-helpers.ts:464](src/lib/engine/slot-helpers.ts#L464).

### 8.5 Cross-column D-phase zigzag

When a doctor has ≥ 2 operatories, placements in op N avoid D-phase minutes already committed in ops 0…N-1. Fallback priority: zero-overlap ranges → ≤ 1-overlap ranges → sorted by overlap ASC. See [rangesAvoidingDMinutes at slot-helpers.ts:392](src/lib/engine/slot-helpers.ts#L392).

### 8.6 Telemetry

The `GenerationResult` must surface:

- `warnings: string[]` — anything the placer could not fully satisfy.
- `morningLoadSwaps.scheduleRatio` — schedule-wide AM-restorative ratio.
- `morningLoadSwaps.perOpRatios` — per-provider+op ratios.
- `morningLoadSwaps.hardCapViolators` — ops still below the Burkhart floor after swaps.
- `productionSummary[]` — per-provider MET/UNDER/OVER and dollar deltas.

## 9. Data Model

Prisma schema is authoritative. File: [prisma/schema.prisma](prisma/schema.prisma). Summary of the eight tables:

| Table | Purpose | Notable columns |
|---|---|---|
| `Office` | Practice root | `timeIncrement`, `rotationWeeks`, `schedulingWindows` (JSON) |
| `Provider` | Doctor / hygienist / other | `operatories` (JSON), `staggerOffsetMin`, `providerSchedule` (JSON per-day), `currentProcedureMix`, `futureProcedureMix` |
| `BlockType` | Canonical appointment templates | `procedureCategory`, `dTimeMin`, `aTimeMin`, `durationMin/Max` |
| `ScheduleRule` | 1:1 with Office | `npModel`, `npBlocksPerDay`, `srpBlocksPerDay`, `hpPlacement`, `matrixing`, `doubleBooking` |
| `ScheduleTemplate` | Saved day | unique `(officeId, dayOfWeek, weekType, type)`, `variantLabel`, `slotsJson`, `summaryJson`, `warningsJson` |
| `ScheduleVersion` | Snapshot on save | `label`, `slotsJson`, `createdAt` |
| `TemplateLibraryItem` | Global reusable templates | `isBuiltIn`, `category` |
| `ProviderAbsence` | Time-off | `providerId`, `date`, `reason` |
| `TreatmentSequence` | Reusable multi-visit sequences | `stepsJson` |

All JSON columns are strings (SQLite). The Office → Provider / BlockType / ScheduleRule / ScheduleTemplate / ScheduleVersion cascades are `onDelete: Cascade`.

## 10. UI / UX Requirements

### 10.1 Global

- **UX-1 Theme.** Light/white only. Background `#ffffff` or `#f8f9fa`. Text `#111` / `#1a1a2e`. No dark mode toggle in MVP, even though `next-themes` is installed. ThemeProvider is wrapped around the app ([ThemeProvider.tsx](src/components/ThemeProvider.tsx)) but should resolve to light always.
- **UX-2 Typography.** Inter or system stack. Base 14 px, headings 18/20/24. No emojis.
- **UX-3 Navigation.** Persistent left sidebar ([Sidebar.tsx](src/components/layout/Sidebar.tsx)): Offices, Templates, Appointment Library, Benchmarks, Audit, Analytics, Rollup, Compare, Utilization, Settings.

### 10.2 Three-panel schedule builder

Route: `/offices/[id]`. Components under [src/components/schedule-builder/](src/components/schedule-builder).

- **UX-4 Left — Block Palette** ([BlockPalettePanel.tsx](src/components/schedule-builder/BlockPalettePanel.tsx)). Searchable, grouped by role, color swatch, duration badge. Scrollable.
- **UX-5 Center — Schedule Canvas** ([ScheduleCanvas.tsx](src/components/schedule-builder/ScheduleCanvas.tsx)). One column per provider+operatory. Rows are 10-minute slots. Each cell shows label, staffing code, production $. Lunch rows greyed. Fixed-header scrollable body.
- **UX-6 Right — Properties Panel** ([PropertiesPanel.tsx](src/components/schedule-builder/PropertiesPanel.tsx)). Shows selection context: block details, provider details, or multi-select summary.
- **UX-7 Top — Toolbar Ribbon** ([ToolbarRibbon.tsx](src/components/schedule-builder/ToolbarRibbon.tsx)). Day selector (horizontal row of 5–7 day pills), week-type toggle (A/C), generate / regenerate / save / export / clone.

### 10.3 Interaction rules

- **UX-8 Horizontal day selector.** Days are pills in a single horizontal row, not a dropdown.
- **UX-9 10-minute slider.** Time-increment is a slider between 10 and 15. Default 10. Changing increment on an Office warns before re-slotting saved templates.
- **UX-10 Full-screen generated view.** The schedule canvas is the dominant visual element, using at least 55% of viewport width at 1440 px.
- **UX-11 Block overflow.** Long labels ("HP > $1800") truncate with ellipsis and show full label on hover. *Currently overflows on narrow viewports — P2-1.*
- **UX-12 'D' in hygienist column.** When matrixing marks a `D` slot inside a hygiene block, the cell gets a diagonal stripe or border accent distinct from regular hygiene colour. *Currently just a code letter change — P1-2.*
- **UX-13 Keyboard shortcuts.** Documented in [KeyboardShortcutsModal.tsx](src/components/KeyboardShortcutsModal.tsx). `?` opens the modal.

### 10.4 Supporting panels

- **UX-14 Production Summary** ([ProductionSummary.tsx](src/components/schedule/ProductionSummary.tsx)) — per-provider status tiles.
- **UX-15 Clinical Validation** ([ClinicalValidationPanel.tsx](src/components/schedule/ClinicalValidationPanel.tsx)) — AM-rocks, PM-rock, Burkhart ratio, matrixing coverage.
- **UX-16 Goal Pacing** ([GoalPacingPanel.tsx](src/components/schedule/GoalPacingPanel.tsx)) — month-to-date pacing projection.
- **UX-17 Recall Capacity** ([RecallCapacityPanel.tsx](src/components/schedule/RecallCapacityPanel.tsx)) — hygiene column utilization.
- **UX-18 Conflict Overlay / Panel** ([ConflictPanel.tsx](src/components/schedule/ConflictPanel.tsx)) — cross-op conflicts highlighted.
- **UX-19 Version Panel** ([VersionPanel.tsx](src/components/schedule/VersionPanel.tsx)) — history list with rollback.

## 11. Excel Export Contract

Implementation: [excel.ts](src/lib/export/excel.ts). Tests: [excel.test.ts](src/lib/export/__tests__/excel.test.ts).

- **EX-1** One workbook per office. One sheet per day (`Monday`, `Tuesday`, …). Variant days append `-EOF`, `-Opt1`, etc.
- **EX-2** Row header = time label formatted `HH:MM` in the office's time-increment. Must include the terminal working-end row (loop uses `<=`).
- **EX-3** Column header = provider name + operatory. When `providerId` is present, prepend DPMS provider code (e.g. "DG001 — Dr Hall / OP1").
- **EX-4** Cell fill = block color tinted with `hexToArgbTint` at 0.35 opacity for assistant slots, 0.7 for D/H slots.
- **EX-5** Cell text = block label on the first slot of the block; empty on continuation slots.
- **EX-6** Staffing code appears as a short prefix (`D`, `A`, `H`) in a dedicated status column where the source template uses one.
- **EX-7** Last 3 rows of each sheet = production summary per provider (target, actual, status).
- **EX-8** Lunch rows merged across columns labelled `LUNCH`.
- **EX-9** Default time-increment for export is 10 when not specified.
- **EX-10** Colors must round-trip — the Excel sheet opened in Microsoft Excel must show the same visual categorization users see on the web canvas.

## 12. Integration Points (Current & Future)

| System | Direction | Status | Notes |
|---|---|---|---|
| Open Dental | out | stub built ([open-dental.ts](src/lib/export/open-dental.ts)) | Schedule block XML |
| Dentrix | out | not built | Planned Q3 |
| Eaglesoft | out | not built | Planned Q3 |
| Dental Intelligence | in | future | Pull actual production to populate `currentProcedureMix` |
| Power BI | out | future | Emit chair-utilization + RIS-style benchmarks |
| SGA practice-directory | in | future | Auto-provision Office from parent system |
| Coolify | ops | live | Docker deploy via `Dockerfile` |

## 13. Known Problems and Issues to Fix (Prioritised)

Problem catalogue synthesised from [QA-REPORT.md](QA-REPORT.md), [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md), [UX_REVIEW.md](UX_REVIEW.md), [AUDIT_SUMMARY.md](AUDIT_SUMMARY.md), and code review against the April rebuild.

### P0 — must fix before broader rollout

- **P0-1 No operatory assignment UI on provider form.** The schema supports `operatories` per provider ([schema.prisma:37](prisma/schema.prisma#L37)) but the provider form in [ProviderFormDialog.tsx](src/components/schedule/ProviderFormDialog.tsx) does not expose a multi-select bound to the Office's operatories. Effort: 0.5 day.
- **P0-2 Edit-after-generate does not recompute telemetry.** Changing a block on the canvas updates visuals but does not re-run morning-load, quality-score, or conflict detection. Users save stale summaries. Effort: 1 day.
- **P0-3 100%-fill generator.** `fillRemainingDoctorSlots` fills every gap — no way to say "leave 30 min/day open for walk-ins." The QA report flags this as a workflow blocker. Add a ScheduleRule field `openSlotPctTarget` (0–30%) and honor it in fill. Effort: 1.5 days.
- **P0-4 Cross-column overlap fallback is silent.** `rangesAvoidingDMinutes` falls back to ≤ 1-overlap ranges or sorted-by-overlap with no warning to the user. Emit a warning in `GenerationResult.warnings` when fallback fires. Effort: 0.5 day.

### P1 — must fix before GA (quarter out)

- **P1-1 Schedule Rules form missing NP/SRP blocks-per-day.** Schema fields `npBlocksPerDay` / `srpBlocksPerDay` are present ([schema.prisma:76–77](prisma/schema.prisma#L76)) but not exposed in the rules form. Default 2 hard-coded. Effort: 0.5 day.
- **P1-2 'D' in hygienist column has no visual distinction.** Add a diagonal stripe or coloured border so an exam pull reads differently from hygiene time. Effort: 0.5 day.
- **P1-3 Hygienist default daily goal is $5,000.** Realistic per-chair hygienist goal is $1,300–$1,800. Change [schema.prisma:44](prisma/schema.prisma#L44) default and migrate existing offices. Effort: 0.5 day + migration.
- **P1-4 Manual edit → variety cap not re-checked.** The 65% cap is enforced at placement but bypassed when a user hand-drops 12 MP blocks. Add a validator pass on save. Effort: 0.5 day.
- **P1-5 Rotation week filtering partial.** Per-provider rotation is honored in [generator.ts:204](src/lib/engine/generator.ts#L204) but the UI does not clearly indicate which week the canvas is showing. Add a prominent week-type badge. Effort: 0.25 day.
- **P1-6 Assisted hygiene mode not first-class.** `assistedHygiene` flag is in the type layer but `placeAssistedHygienistBlocks` is not wired into the orchestrator branch — the generator always calls `placeHygienistBlocks`. Effort: 1 day.
- **P1-7 Print view ([offices/[id]/print/page.tsx](src/app/offices/[id]/print/page.tsx)) does not match Excel color fidelity.** Colors desaturate when printed. Effort: 0.5 day.
- **P1-8 Variant-day flow not exposed in UI.** Schema supports `variantLabel` ("EOF", "Opt1") and Excel respects it, but there is no create-variant button on the canvas. Effort: 1 day.
- **P1-9 No bulk goals dialog wire-up.** [BulkGoalsDialog.tsx](src/components/schedule/BulkGoalsDialog.tsx) exists but is not reachable from provider list. Effort: 0.25 day.
- **P1-10 `futureProcedureMix` JSON edit is raw text.** Users type `{"MAJOR_RESTORATIVE":0.35,...}` by hand. Add a category-percentage slider panel. Effort: 1.5 days.

### P2 — quality-of-life

- **P2-1 Block label overflow on narrow viewports.** Labels truncate but sometimes cut mid-word without ellipsis. Effort: 0.25 day.
- **P2-2 No empty-schedule keyboard shortcut.** Nothing to clear a day without the generate dialog. Effort: 0.25 day.
- **P2-3 Production summary refresh flicker.** On regenerate, the summary tiles blank for ~300 ms before repopulating. Effort: 0.5 day.
- **P2-4 Import from Dental Intel not built.** Future work — pull actual procedure-mix history to seed `currentProcedureMix`. Effort: 3 days.
- **P2-5 Benchmarks page comparison lacks filters.** [benchmarks/page.tsx](src/app/benchmarks/page.tsx) shows all providers; add region / DPMS filters. Effort: 0.5 day.
- **P2-6 Sidebar counts stale after creating an office.** Requires a full refresh. Add a global invalidation on office-list mutations. Effort: 0.5 day.
- **P2-7 Clone-template modal does not preview deltas.** Users clone blind. Add a before/after summary. Effort: 0.5 day.
- **P2-8 Goal pacing assumes 20 working days/month.** Ignores office working-days config. Effort: 0.25 day.
- **P2-9 Stagger offset default 0 can create chair-conflict warnings on import.** Auto-compute a sensible default from `columns` on save. Effort: 0.25 day.
- **P2-10 Dockerfile does not pin Prisma client version.** Build nondeterminism risk. Effort: 0.25 day.
- **P2-11 No rate-limit on `/api` routes.** Internal tool, low risk, but fix before any external auth. Effort: 1 day.

Total outstanding problem count: 25 (4 P0 + 10 P1 + 11 P2).

## 14. Out of Scope

- Patient data (no PHI; the tool operates on practice metadata only).
- Real-time multiplayer editing (single-user sessions only in MVP).
- Insurance-fee schedule import beyond the existing `feeModel` enum slot.
- Automatic push into DPMS — exports are user-initiated downloads.
- Mobile / tablet optimisation — desktop only (viewport ≥ 1280 px).
- A native dark mode — light/white surface only.
- Multi-tenant account management — MVP is single-tenant (SGA only).

## 15. Test Strategy

- **Unit tests (vitest)** — 24 engine test files in [src/lib/engine/__tests__/](src/lib/engine/__tests__), covering pattern catalog, slot-helpers, calculator, generator, rock-sand-water core, rotation snap, procedure-mix, quality-score, clinical-rules, production-calculator, stagger, stagger-resolver, conflict-detector, ideal-day, validator, retry-envelope, production-mix, multi-op-single-doctor, sprint6 shared-pool, generator-variety, generator-integration, and golden snapshots. Current pass count: 855+.
- **Golden tests** — [golden.test.ts](src/lib/engine/__tests__/golden.test.ts) runs seeded full-day generations and asserts byte-identical slot arrays against fixtures. Any placement change must intentionally update a golden.
- **Integration tests** — [generator-integration.test.ts](src/lib/engine/__tests__/generator-integration.test.ts) exercises full orchestrator with realistic offices.
- **Component tests** — @testing-library/react installed, tests to be authored for Properties Panel, Block Palette, Schedule Canvas. Current coverage: low.
- **End-to-end (Playwright)** — installed (`@playwright/test`), minimal coverage today. Target MVP: 7 flows from [FUNCTIONAL_TEST_REPORT.md](FUNCTIONAL_TEST_REPORT.md) — create office, view detail, edit, export, settings, dashboard, delete.
- **Visual regression** — not yet in place. Planned via Playwright screenshot diff on canvas.
- **Export fidelity** — [excel.test.ts](src/lib/export/__tests__/excel.test.ts) asserts row count includes terminal slot, color tints round-trip, production summary rows present.
- **CI gating.** Every PR must pass `npm run lint`, `npm run test`, and `npm run build`. Golden fixtures must be regenerated intentionally (never auto-updated).

## 16. Open Questions for Stakeholders

- **Q1** Should the 65% variety cap be configurable per office, or is it a fixed clinical rule? (Current: fixed at `MAX_SAME_TYPE_FRACTION = 0.65`.)
- **Q2** For the P0-3 open-slot percentage, is the correct default 0% (keep current behaviour) or 10% (reserve for walk-ins)?
- **Q3** When a provider has a `futureProcedureMix`, should the AM-rocks rule still apply, or should category weights fully drive placement?
- **Q4** How should the tool handle a hygienist whose daily goal is below one RC/PM block × number of hours — i.e., impossible to meet? Warn? Auto-adjust?
- **Q5** For rotation weeks (A/C), do we assume providers alternate symmetrically, or should we support 3-week cycles (A/B/C)?
- **Q6** Should `matrixing` default to on or off for new offices? (Current default: on.)
- **Q7** When two doctors share an operatory on different days, should the UI group them in a single column with a day-of-week filter, or keep them as separate columns?
- **Q8** How should the tool treat practices that scan and scan-seat in a dedicated scanner room — model as a per-block "roomRequired" attribute, or out of scope?
- **Q9** Is an "emergency access only" operatory (always 100% ER) a recognised pattern we should support as a preset?
- **Q10** Should we expose Assisted Hygiene mode as a per-office toggle, a per-provider toggle, or per-day?
- **Q11** What is the authoritative source for SGA practice directory once we integrate — the DPMS or an SGA-owned system?
- **Q12** For multi-variant days (EOF, Opt1, Opt2), do schedulers want the comparison view side-by-side in-app, or is diff-against-Excel sufficient?

---

*End of PRD v3.0. Maintained at [PRD-V3.md](PRD-V3.md). Feb v1 preserved at [PRD.md](PRD.md).*
