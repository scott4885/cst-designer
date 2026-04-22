# CST Designer — Product Requirements Document (PRD v4.0)

| Field | Value |
|---|---|
| Document | Product Requirements Document |
| Version | 4.0 |
| Date | 2026-04-21 |
| Status | Draft for Review — supersedes V1 and V3 |
| Supersedes | [PRD v1.0 (2026-02-12)](../../PRD.md), [PRD v3.0 (2026-04-21)](../../PRD-V3.md), [PRD-V2-FIXES punch list](../../PRD-V2-FIXES.md) |
| Authors | Product + Engineering (Phase-0 research synthesis) |
| Audience | SGA internal stakeholders, CST ops (Alexa, Megan), engineering |
| Repo | `scott4885/cst-designer` |
| Live URL | `http://cst.142.93.182.236.sslip.io/` (Coolify, Docker) |
| Research corpus | `.cst-rebuild-v3/research/` — 5 research files, ~25k words |

---

## 1. Executive Summary

CST Designer (Custom Schedule Template Designer) is an internal SGA tool that generates and maintains weekly block-schedule templates for ~150 dental offices in the network. Two ops specialists (Alexa and Megan) use it to turn a short clinical intake (practice hours, providers, goals, procedure mix) into a fully-filled 10-minute-granularity weekly template that the practice's DPMS team then mirrors into Open Dental / Dentrix / Eaglesoft.

PRD v3 (also dated 2026-04-21) codified the current rebuild's state, the engine contract, and 25 open problems. **Phase-0 research** (five deep-source files compiled today) surfaced five classes of findings that materially change the product spec and therefore require this PRD v4:

1. **Procedures are not monolithic.** Every dental procedure decomposes into three segments: an assistant-only prefix, a doctor-required middle, and an assistant-only suffix. Our data model stores one duration per block; the literature unanimously stores three. This is the single biggest bug-source we keep shipping.
2. **The doctor is the bottleneck, not the chair.** Multi-column coordination solves on the **X-segment graph** (doctor-required minutes), not on appointment rectangles. The current engine's zigzag-against-D-minutes ([rangesAvoidingDMinutes at slot-helpers.ts:392](src/lib/engine/slot-helpers.ts#L392)) reaches toward this but does not operate on first-class X-segments.
3. **There is no single "production policy."** The literature splits three ways — Jameson 50% primary, Levin 60–65% morning, and Farran 75%-by-noon — and practices legitimately choose different ones. The engine currently hard-codes 75%.
4. **Goal derivation is a formula, not a number.** `(Annual ÷ working days) − hygiene = doctor daily target`. The schema stores a flat `dailyGoal` per provider and forces users to arrive at that number out-of-band.
5. **UI block legibility at 10-minute density is broken.** User feedback is blunt: "you can't read what's on there." Section 11 is a ground-up rewrite of UX requirements focused on legibility, not feature parity.

Additional research-driven requirements: three-attribute emergency slots, per-practice procedure-length overrides (crown prep is bimodal at 30 min and 80 min), day-of-week provider rosters, practice-model awareness (1D2O vs 2D3O vs 1D3H), and a `max_concurrent_doctor_ops` config.

Scope of work represented by this PRD: **2–3 sprints**, starting with the X-segment data-model migration (P0), multi-column coordinator (P0), UI legibility overhaul (P0), and production-policy selection (P1). The 25 problems inventoried in PRD v3 section 13 remain open and are carried forward as section 13 here with six research-sourced additions.

---

## 2. Problem Statement

**Why the rebuild was needed (unchanged from V3).** The Feb 2026 codebase had multiple sources of truth, no persistence, no golden tests, and a pattern catalog that did not match the six canonical multi-column templates extracted from SMILE NM and Smile Cascade. The v3 rebuild re-founded the engine on a deterministic seeded RSW placer, added Prisma + SQLite persistence, a three-panel UI, Excel export with color fidelity, and 855+ vitest cases.

**What's still broken, per research + V3 audits.** Five themes:

1. **The data model is wrong at the atom.** Every published template and every PMS (Dentrix, Open Dental) stores procedure time as `asst_pre / doctor_X / asst_post`. Our `BlockType.durationMin/Max` collapses that into one number. Every downstream multi-column bug traces back here. (Research: `03-multi-column-coordination.md` §2; `04-time-blocking-mechanics.md` §1.)
2. **The multi-column coordinator is the wrong shape.** V3's zigzag works on an "avoid D-minutes" list. The correct primitive is a doctor-resource schedule (the X-segment graph) where the doctor is a singleton and D-segments across all columns must not overlap — but assistant `/` phases can. (Research: `03-multi-column-coordination.md` §3.)
3. **Production policy is hard-coded to 75% when it's actually a choice.** Jameson/Levin/Farran split the literature. Practices differ by philosophy and patient mix. (Research: `02-perfect-day-scheduling.md` §3.)
4. **Goals enter the system as dollars, not as a derivation.** Users compute annual→daily→minus-hygiene in their heads or on paper, then type a number. The tool should do the math and show the audit trail. (Research: `02-perfect-day-scheduling.md` §2.)
5. **The canvas is unreadable at 10-min density.** Blocks are labelled with strings that don't fit the cell. Staffing code (`D`, `A`, `H`) is a single letter inside a coloured cell; a `D` inside a hygiene cell looks indistinguishable from hygiene's own time. Users have said literally "you can't read what's on there." (V3 section 13 items P1-2, P2-1, plus new research-driven items.)

Underneath all five: the product was designed as a **generator** when it is actually a **coordinator**. Generation is the 30% case; the rest is refinement, conflict resolution, and visual inspection. PRD v4 commits the entire UI/UX section (section 10) to that reframing.

---

## 3. Users and Use Cases

### 3.1 Primary users (unchanged)

**Alexa** — SGA CST ops specialist. 4–6 new templates per week, 10–15 revisions. Desktop.

**Megan** — SGA CST ops specialist. ~8 mid-cycle adjustments per week. Desktop.

### 3.2 Secondary users (future)

**Regional Directors** — read-only access to production summaries and quality scores.

**Practice Office Managers** — receive exported Excel. No direct access.

### 3.3 Use cases

| ID | Use case | Actor | Frequency |
|---|---|---|---|
| UC-1 | Onboard new office — create office, providers, block types, generate week | Alexa | 4–6 / week |
| UC-2 | Quarterly refresh — regenerate all 5 days preserving saved rules | Alexa | 60+ / quarter |
| UC-3 | Provider change — edit one provider, regenerate affected days | Megan | 8 / week |
| UC-4 | Swap a single block on the canvas without regenerating | Megan | 15 / week |
| UC-5 | Export Excel for office manager review | both | every run |
| UC-6 | Compare two template variants (A/C rotation, EOF vs regular) | Alexa | 5 / week |
| UC-7 | Audit an existing template against clinical rules | Alexa | on demand |
| UC-8 | **Select a production policy per practice** (50 / 75 / 80%-by-noon) | Alexa | per office, at onboarding |
| UC-9 | **Override a procedure length per practice** (e.g. 30-min crown for DSN practices) | both | 2–3 / week |
| UC-10 | **Configure day-of-week rosters** (Kelli doesn't work Fridays) | both | at onboarding + provider changes |

---

## 4. Domain Model and Vocabulary

### 4.1 Core entities

- **Office** — a single dental practice. One Office has many Providers, many BlockTypes, one ScheduleRule, many ScheduleTemplates, many ScheduleVersions, **one PracticeModel** (new — see §4.6), and **one ProductionPolicy** (new — see §4.7).
- **Provider** — a doctor, hygienist, or assistant (role `DOCTOR | HYGIENIST | ASSISTANT | OTHER`). Carries operatories (JSON), columns, per-day `providerSchedule` with optional rotation, `staggerOffsetMin`, `currentProcedureMix` / `futureProcedureMix`. **New:** `dayOfWeekRoster` (JSON mapping weekday → present/absent/hours-override).
- **BlockType** — a canonical appointment template. **Reshape:** three durations instead of one (see §4.2 X-segment).
- **ScheduleRule** — per-office generation rules. **New fields:** `productionPolicy`, `maxConcurrentDoctorOps`, `doctorTransitionBufferMin`, `openSlotPctTarget`.
- **ScheduleTemplate / ScheduleVersion / ProviderAbsence / TemplateLibraryItem / TreatmentSequence** — unchanged semantics; storage tweaked for X-segment (§9).
- **PracticeModel** (new) — 1D2O / 2D3O / 1D3H / etc. See §4.6.
- **ProductionPolicy** (new) — enum: `JAMESON_50` / `LEVIN_60_65` / `FARRAN_75_BY_NOON` / `CUSTOM`. See §4.7.
- **ProcedureOverride** (new) — per-Office, per-BlockType override of the X-segment durations (§4.2) and/or pattern.

### 4.2 The X-segment model (new — replaces single duration)

Every procedure decomposes into three segments:

| Segment | Abbreviation | Who holds the chair | Doctor needed? |
|---|---|---|---|
| Assistant prefix | `asst_pre` | Assistant (seats, numbs, images, sets up) | No |
| Doctor middle | `doctor_X` | Doctor (hands-on — prep, extract, exam, diagnosis) | **Yes** |
| Assistant suffix | `asst_post` | Assistant (impressions, temp, dismiss, turnover) | No |

Notation convention borrowed from Dentrix and the consulting literature: `/` for assistant-only minutes, `X` for doctor minutes. A 60-minute crown prep in 10-minute units is written `/ / X X X X / /` (2/4/2).

**Stored as:** `asstPreMin INTEGER`, `doctorXMin INTEGER`, `asstPostMin INTEGER`. Total = sum. Legacy `durationMin/Max` become computed fields for back-compat.

Canonical segment shapes observed across sources:

| Block code | Duration | `/ / X X X X / /` pattern | Notes |
|---|---|---|---|
| HP > $1800 | 80 min | `2 / 4 / 2` (20/40/20) | Crown prep, canonical |
| MP | 40 min | `1 / 2 / 1` (10/20/10) | Filling |
| ER | 30 min | `1 / 1 / 1` (10/10/10) | Limited exam |
| NP CONS (doctor) | 40 min | `1 / 2 / 1` | New-patient consult |
| NP HYG | 90 min | `5 / 1 / 3` | Hygiene-led NP with doctor exam mid-block |
| PM/GING (hygiene) | 60 min | `5 / 1 / 0` at min 50 | Doctor check is the `X`; hygienist holds the chair otherwise |
| RC/PM | 60 min | `5 / 1 / 0` at min 10, 20, 30, or 50 | **Variable exam placement — see Gap 1 below** |
| SRP | 60 min | `6 / 0 / 0` | No doctor exam in SRP |

**Source:** `03-multi-column-coordination.md` §2 (crown-prep example with `/XXXX//` citation from MGE); Burkhart's zone-scheduling 10-minute unit breakdown; Dentrix `X` notation; `05-existing-templates-analysis.md` Gap-1 (RC/PM doctor-exam position varies).

### 4.3 Staffing codes (preserved)

`A` = assistant hands-on. `D` = doctor hands-on. `H` = hygienist hands-on. `null` = open / break.

### 4.4 Procedure categories (preserved)

8-value enum: `MAJOR_RESTORATIVE`, `ENDODONTICS`, `BASIC_RESTORATIVE`, `PERIODONTICS`, `NEW_PATIENT_DIAG`, `EMERGENCY_ACCESS`, `ORAL_SURGERY`, `PROSTHODONTICS`.

### 4.5 Canonical block patterns (updated — now parameterised)

Patterns were previously stored as fixed strings in [pattern-catalog.ts:19](src/lib/engine/pattern-catalog.ts#L19). Research Gaps 2–5 in `05-existing-templates-analysis.md` show the catalog is inadequate:

- RC/PM's D position varies per column (Gap 1).
- HP stretches from 80 min to 120 min (Gap 3).
- Pattern depends on practice model (Gap 5).

**Resolution:** `pattern-catalog.ts` is demoted to *seed patterns for single-column fallback*. True pattern resolution happens dynamically in the multi-column coordinator (§8.3). The three X-segment durations (`asstPreMin`, `doctorXMin`, `asstPostMin`) generate the template; the coordinator decides where the `X` lands within the block.

### 4.6 Practice Model (new)

A compact string naming the doctor/op/hygienist layout, drawn from `05-existing-templates-analysis.md` Gap 5.

| Code | Meaning | Example practice |
|---|---|---|
| `1D2O` | 1 doctor, 2 doctor operatories | Solo GP, standard |
| `1D3O` | 1 doctor, 3 doctor operatories (flex 3rd) | Mature solo GP |
| `2D3O` | 2 doctors sharing 3 ops | Partner practice |
| `1D2O_3H` | 1 doctor, 2 doctor ops, 3 hygiene ops | Smile Cascade |
| `2D4O_2H` | 2 doctors, 4 doctor ops, 2 hygiene ops | DSO site |
| `1D1O` | Solo GP, single op | Start-up |

**Why it matters:** pattern resolution changes with practice model. On `1D2O_3H` the doctor services 5 operatories (2 own + 3 hygiene checks) and the X-segment graph is denser.

### 4.7 Production Policy (new)

Enum selectable per Office. Drives the goal-derivation solver and the morning-load enforcer.

| Policy | Rule | Source |
|---|---|---|
| `JAMESON_50` | Pre-block ½ of daily goal with primary procedures; AM-morning load target 60–70% | Jameson (Dentistry IQ, Dentrix Magazine) |
| `LEVIN_60_65` | Morning major-production blocks capture 60–65% of daily production | Levin Group (Dentrix Magazine) |
| `FARRAN_75_BY_NOON` | 75% of daily dollar goal achieved by lunch; afternoons = fillers only | Farran / Cambridge Dental / Burkhart 80/20 |
| `CUSTOM` | Practice-defined percentage and cutoff hour | — |

**Default for new offices:** `FARRAN_75_BY_NOON` (matches current engine behaviour).

### 4.8 Vocabulary the tool must continue to honour

- **Rock / Sand / Water** — large protected production blocks / mid-value variable blocks / NON-PROD connective time. Origin and attribution documented in `01-rsw-methodology.md` §1–§2.
- **Linda Miles rule** — 2 rocks AM, 1 rock PM per doctor op.
- **Burkhart 80/20** — 80% of restorative volume in AM (only active under `FARRAN_75_BY_NOON` policy).
- **Matrixing** — marking the doctor exam slot inside a hygiene block. With X-segment model, matrixing is now just the placement of `doctor_X` inside `PM/GING`, `RC/PM`, `NP_HYG` — no longer a separate post-processing step.
- **Stagger** — horizontal offset between ops such that doctor `X`-segments do not overlap.
- **Variety cap** — no single block type > 65% of a provider+op's non-break slots.
- **Zigzag** — renamed to **multi-column coordination** and rebased on X-segment non-overlap (§8.3).

---

## 5. Functional Requirements — Office & Provider Setup

### FR-1 Office CRUD with practice model
**Statement.** The system must allow creation, edit, and soft-delete of Offices. An Office carries `name`, `dpmsSystem`, `workingDays` (JSON per-day start/end), `timeIncrement` (10 or 15, default 10), `operatories`, `alternateWeekEnabled`, `rotationEnabled`, `rotationWeeks` (2–4), **`practiceModel`** (enum, §4.6), and **`productionPolicy`** (enum, §4.7).

**Acceptance criteria.**
- Given a new Office with no practice model selected, when saving, then validation fails with "Practice model required."
- Given a practice model of `1D2O`, when adding providers, then the UI constrains to 1 doctor × 2 ops and warns if violated.
- Given `productionPolicy = FARRAN_75_BY_NOON`, then the Burkhart 80/20 morning-load enforcer runs; otherwise it is skipped.

**Traces to:** PRD-V3 FR-1; new fields from `05-existing-templates-analysis.md` Gap 5; `02-perfect-day-scheduling.md` §3.

### FR-2 Provider CRUD with operatory assignment and day-of-week roster
**Statement.** Each Office must allow 1–N Providers. Provider form must collect: name, role, columns (1–N), **operatories (multi-select mapped to Office operatories — closes P0-1)**, working hours, lunch window, daily goal, color, `seesNewPatients`, `staggerOffsetMin`, per-day schedule overrides with optional rotationWeeks, and **`dayOfWeekRoster`** — a JSON mapping `MON|TUE|WED|THU|FRI|SAT|SUN` → `{present: bool, startHour?, endHour?, lunchStart?, lunchEnd?}`.

**Acceptance criteria.**
- Given a hygienist Kelli with `dayOfWeekRoster.FRI.present = false`, when generating a Friday template, then Kelli has no column on Friday.
- Given the provider form is opened, operatories are shown as a multi-select bound to the parent Office's `operatories` field.

**Traces to:** PRD-V3 P0-1, PRD-V3 P1-5; `05-existing-templates-analysis.md` Gap 4 (Kelli Friday drop-out).

### FR-3 BlockType with X-segment durations
**Statement.** The system must allow 1–N BlockTypes per Office. BlockType form must collect: label, description, minimumAmount, appliesToRole (DOCTOR / HYGIENIST / BOTH), **`asstPreMin`**, **`doctorXMin`**, **`asstPostMin`**, color, isHygieneType, `procedureCategory`, optional `pattern` override, and optional `doctorContinuityRequired` flag.

**Acceptance criteria.**
- Given a BlockType HP, when saved with `asstPreMin=20, doctorXMin=40, asstPostMin=20`, then `durationMin` computed = 80.
- Given a BlockType with `durationMin=60` and no X-segment values (legacy row), when read, then the migration (§9.5) has populated X-segments from role-based defaults (doctor → `10/40/10`, hygiene → `50/10/0`).
- Given `doctorContinuityRequired = true` (molar endo, surgical ext), then the coordinator (§8.3) may not serialise a second continuity-required block concurrently.

**Traces to:** `03-multi-column-coordination.md` §2, §9.4; `04-time-blocking-mechanics.md` §2.

### FR-4 ScheduleRule — production policy + new configuration fields
**Statement.** The system must allow per-Office ScheduleRule configuration: `npModel`, `npBlocksPerDay`, `srpBlocksPerDay`, `hpPlacement`, `doubleBooking`, `matrixing`, `emergencyHandling`, **`productionPolicy`** (mirrors Office; set at Office create), **`maxConcurrentDoctorOps`** (int, default 2, range 1–4), **`doctorTransitionBufferMin`** (int, default 0, range 0–5), **`openSlotPctTarget`** (int, default 0, range 0–30 — closes P0-3), **`emergencySlotConfig`** (§5.5 FR-EMR-1).

**Acceptance criteria.**
- Given `maxConcurrentDoctorOps = 2`, when the coordinator attempts to place a third overlapping `X`-segment, then the placement is rejected.
- Given `openSlotPctTarget = 20`, when generation completes, then at least 20% of doctor-op slots are left unfilled for walk-in/emergency capture.

**Traces to:** PRD-V3 P0-3, P1-1; `03-multi-column-coordination.md` §4, §7; `02-perfect-day-scheduling.md` §3.

### FR-5 NP/SRP blocks-per-day in the rules form (closes PRD-V3 P1-1)
**Statement.** The ScheduleRule form must expose `npBlocksPerDay` (0–6) and `srpBlocksPerDay` (0–6) as numeric steppers. These are no longer hard-coded to 2.

**Acceptance criteria.**
- Given rules form is opened, NP and SRP steppers are visible and bound to the ScheduleRule record.

**Traces to:** PRD-V3 P1-1.

### FR-6 Procedure-length override (per-practice)
**Statement.** The system must allow per-Office override of any BlockType's X-segment durations and/or pattern via a `ProcedureOverride` table. Overrides shadow the global BlockType at generation time.

**Acceptance criteria.**
- Given global HP is `20/40/20`, when Office A creates a ProcedureOverride for HP with `10/20/10` (a 40-min "efficient crown prep" per DSN), then generation for Office A uses the override.
- Given no ProcedureOverride exists, then generation falls back to the global BlockType.

**Traces to:** `04-time-blocking-mechanics.md` §2 (crown prep bimodal distribution — 76 ± 21 min mean vs 20–30 min "efficient" model).

---

## 6. Functional Requirements — Generation, Canvas, Variants, Export, Governance

### FR-7 Deterministic generation
**Statement.** Generation must produce byte-identical slot arrays when a `seed` is provided. Entry point: [generateSchedule at generator.ts:188](src/lib/engine/generator.ts#L188).

**Traces to:** PRD-V3 FR-6, NFR-2.

### FR-8 Goal derivation (new)
**Statement.** Daily goals must be computed, not typed, using this formula:

```
daily_goal = annual_target / working_days_in_year
doctor_daily_goal = daily_goal - hygiene_daily_production
hourly_target = doctor_daily_goal / (working_hours - lunch_hours)
```

The tool must persist the intermediate values so the user can audit the derivation.

**Acceptance criteria.**
- Given `annual_target = 1,200,000`, `working_days = 220`, `hygiene_daily = 1500`, then `daily_goal = 5454.54`, `doctor_daily = 3954.54`, `hourly = 494` (for 8 working hours).
- Given a user overrides `doctor_daily` directly, then the tool flags "manual override" on the audit trail.

**Traces to:** `02-perfect-day-scheduling.md` §2 (MGE formula); `01-rsw-methodology.md` §4.

### FR-9 Category-weighted placement when futureProcedureMix valid
**Statement.** When a provider has a valid `futureProcedureMix` summing ~100%, the engine must use category-weighted placement instead of standard RSW.

**Traces to:** PRD-V3 FR-9.

### FR-10 Variety cap enforcement
**Statement.** The generator must never exceed the 65% variety cap for any single block type on any single provider+op.

**Traces to:** PRD-V3 FR-10.

### FR-11 Canvas click-to-replace
**Statement.** Users must be able to click-to-replace any slot's block on the canvas via the BlockPicker.

### FR-12 Drag-drop reorder
**Statement.** Users must be able to drag-drop re-arrange blocks within an op.

### FR-13 Live recompute on edit (closes PRD-V3 P0-2)
**Statement.** Any edit on the canvas must trigger an incremental recompute of (a) production summary, (b) morning-load ratio per selected production policy, (c) conflict/overlap detection on the X-segment graph, (d) quality score badge, and (e) variety-cap check.

**Acceptance criteria.**
- Given a user drops an MP into a slot that would push the provider above 65% MP, then a warning banner appears immediately.
- Given a user changes a block that creates two overlapping `X` segments on the same doctor, then both cells turn red with a conflict-overlay tooltip.

**Traces to:** PRD-V3 P0-2, P1-4; `03-multi-column-coordination.md` §3.

### FR-14 Properties Panel
**Statement.** Users must be able to edit a block's label, duration (three-part — see §4.2), pattern, color, and production amount.

### FR-15 Rotation weeks
**Statement.** The system must support A/C rotation via `weekType` and up to 4-week cycles via `rotationWeeks`.

### FR-16 Variant days
**Statement.** The system must support variant days via `variantLabel` (EOF, Opt1, Opt2, …), with a **"Create Variant"** button on the canvas (closes PRD-V3 P1-8).

### FR-17 Clone template
**Statement.** Users must be able to clone day → day, or week A → week C, with a before/after preview (closes PRD-V3 P2-7).

### FR-18 Excel export
**Statement.** Export to `.xlsx` with 10-minute rows, per-op columns, colour-tinted cells, and production summary footer. Contract in §11.

### FR-19 DPMS exports
**Statement.** Export to Open Dental (built), Dentrix, and Eaglesoft (Q3).

### FR-20 Quality score
**Statement.** The system must compute and surface a `quality-score` (0–100) per day, per week, per office.

### FR-21 Auto-snapshot
**Statement.** The system must auto-snapshot a ScheduleVersion on every save.

### FR-22 Audit checks
**Statement.** `/audit` must surface block-type coverage, provider coverage, rule coverage, and X-segment validity per practice.

### FR-23 Chair utilization benchmark
**Statement.** The system must compute chair utilization and benchmark providers across the network.

### FR-24 Doctor production per hour telemetry (new)
**Statement.** The engine must surface `projectedDoctorProductionPerHour` based on X-segment density. Target threshold: $500/hr (per `03-multi-column-coordination.md` §8). Below threshold → amber warning; below $350 → red.

**Traces to:** `03-multi-column-coordination.md` §8.

---

## 7. Non-Functional Requirements

- **NFR-1 Performance.** Full-week regeneration (5 days × 3 providers × 2 ops) ≤ 1.5 s on mid-tier laptop. Canvas re-render on block edit ≤ 150 ms.
- **NFR-2 Determinism.** Seeded generation is byte-identical. CI golden tests fail-closed.
- **NFR-3 Persistence.** All writes to SQLite via Prisma. No in-memory primary state.
- **NFR-4 Theme.** Light/white only.
- **NFR-5 Responsiveness.** Usable down to 1280 px viewport.
- **NFR-6 Test coverage.** Engine modules ≥ 85% statement coverage. **New:** multi-column coordinator ≥ 95% (it is the single biggest bug-source historically).
- **NFR-7 Deployability.** Single Docker container via Coolify.
- **NFR-8 Browser.** Chrome, Edge, Firefox — latest two.
- **NFR-9 Stack.** Next.js 16, React 19, Prisma 7 + better-sqlite3, Tailwind 4, shadcn/ui, react-hook-form + zod, ExcelJS, Recharts, Zustand, vitest + Playwright.
- **NFR-10 No PHI.**
- **NFR-11 Auth.** MVP internal-only. Post-MVP SGA SSO.
- **NFR-12 Accessibility.** Keyboard navigation. Contrast ≥ 4.5:1 text, ≥ 3:1 fills. **New:** block labels must remain readable at WCAG AA when the canvas is at 100% zoom on a 1440 px viewport (see §10).
- **NFR-13 Data export.** User-initiated only.
- **NFR-14 Soft delete.** Offices soft-deleted; versions preserved.
- **NFR-15 X-segment migration safety (new).** The V3→V4 schema migration (§9.5) must be idempotent, preserve existing generated templates, and ship with a dry-run mode.

---

## 8. Engine Behaviour Specification

This is the authoritative contract for `generateSchedule()`. The current implementation at [generator.ts:188](src/lib/engine/generator.ts#L188) is substantially rewritten per research findings.

### 8.1 Inputs
- Office (with `practiceModel`, `productionPolicy`, `maxConcurrentDoctorOps`, `doctorTransitionBufferMin`)
- Providers (with `dayOfWeekRoster`, `operatories`, `staggerOffsetMin`)
- BlockTypes (with `asstPreMin`, `doctorXMin`, `asstPostMin`, `doctorContinuityRequired`)
- ProcedureOverrides
- ScheduleRule (with `npBlocksPerDay`, `srpBlocksPerDay`, `openSlotPctTarget`, `emergencySlotConfig`)
- `dayOfWeek`, optional `activeWeek`, optional `seed`
- Derived goals (from §FR-8): `doctorDailyGoal`, `hygieneDailyGoal`, `hourlyTarget`

### 8.2 Order of operations (V4 path)

1. **Resolve effective rosters.** For the given `dayOfWeek`, drop providers whose `dayOfWeekRoster[day].present === false`. (Closes Gap 4.)
2. **Initialise X-segment graph.** For each provider × operatory × 10-min slot, initialise a node carrying `{providerId, opId, minute, occupant: null, segmentKind: null}`. Lunch rows seeded as breaks.
3. **Compute doctor X-segment budget.** The doctor's daily doctor-minutes budget is `(working_hours - lunch_hours) × 60 × maxConcurrentDoctorOps`. The engine must not schedule more `X`-minutes than this budget.
4. **Place big rocks on the X-segment graph.** For each doctor, walk the AM rock requirement. For each rock, find an X-free window of length `doctorXMin`, then wrap `asstPreMin` before and `asstPostMin` after. Conflict with existing X → skip to next candidate.
5. **Stagger subsequent rocks across ops.** The second AM rock in the second op must start at `prev_rock_end - asst_post_overlap + stagger_offset`. Canonical stagger = `asstPreMin` of the next block.
6. **Place NP, MP, ER.** Same X-first logic.
7. **Place hygiene blocks.** Hygiene `X` (doctor exam) is treated exactly like a restorative `X` — the coordinator refuses overlaps with any other doctor `X` anywhere in the office. Exam window = earliest/latest unit-index in the hygiene block where the check can land (per `03-multi-column-coordination.md` §5).
8. **Fill remaining slots** honouring 65% variety cap and `openSlotPctTarget`. If `openSlotPctTarget = 20`, at least 20% of each op's non-break slots stay `null`.
9. **Apply production-policy enforcer:**
   - `FARRAN_75_BY_NOON`: enforce ≥ 75% of dollar-goal achieved by lunch.
   - `LEVIN_60_65`: enforce 60–65% in AM.
   - `JAMESON_50`: enforce ≥ 50% of daily goal in primary (rock) blocks.
   - `CUSTOM`: apply practice-defined threshold.
10. **Insert emergency slots** per `emergencySlotConfig` (FR-EMR-1).
11. **Compute summaries, warnings, telemetry** — per-provider MET/UNDER/OVER; cross-column overlap check; `projectedDoctorProductionPerHour`.

### 8.3 Multi-Column Coordinator (new, replaces §8.5 of V3)

The coordinator is the authoritative source of doctor `X`-segment placement across all columns including hygiene.

**Core invariants.**
- At any minute `t`, `count(X-segments on doctor D at minute t) ≤ maxConcurrentDoctorOps` (default 2, max 4).
- Assistant `/` segments across columns **may** overlap freely.
- Two `X`-segments from blocks flagged `doctorContinuityRequired` may not overlap at all — they serialise.
- The optional `doctorTransitionBufferMin` prepends a buffer to every `X`-segment that starts within ≤ 10 min of the end of another doctor's `X`-segment elsewhere.

**Algorithm.**
```
for each doctor D:
  X_schedule[D] = empty interval set
for each block B being placed:
  candidate_window = find free interval of length B.doctorXMin in X_schedule[D]
  if no candidate: emit warning, defer block to fallback pass
  else:
    X_schedule[D].insert(candidate_window)
    place asstPre before, asstPost after in the op's slot array
```

**Hygiene integration.** Hygiene doctor exams are modelled as 1-unit `X` inside a hygiene block with an exam window `[earliestUnit, latestUnit]`. The coordinator places each exam in the free `X` window closest to its preferred position (mid-block, per `03-multi-column-coordination.md` §5).

**Replaces:** `rangesAvoidingDMinutes` at [slot-helpers.ts:392](src/lib/engine/slot-helpers.ts#L392). That function was zigzag-against-D-minutes but did not operate on first-class X-segments.

**Traces to:** `03-multi-column-coordination.md` §3, §4, §5, §9; `05-existing-templates-analysis.md` Gap 1, Gap 2.

### 8.4 Pattern resolution (updated)

Patterns are no longer the primary source of truth — X-segment durations are. The pattern-catalog is a fallback for single-column cases. Resolution order:

1. If `ProcedureOverride.pattern` is set for `(officeId, blockTypeId)` → use.
2. Else if `BlockType.pattern` is set → use.
3. Else derive from `(asstPreMin, doctorXMin, asstPostMin)`: `A`-run of length `asstPreMin/10`, `D`-run of length `doctorXMin/10`, `A`-run of length `asstPostMin/10`. Hygiene: replace `A` with `H`; keep `D` for the exam window.

### 8.5 Variety cap (preserved)
65% per provider+op.

### 8.6 Telemetry (expanded)

`GenerationResult` must surface:
- `warnings[]`
- `morningLoadSwaps.scheduleRatio`, `.perOpRatios`, `.hardCapViolators`
- `productionSummary[]`
- **`doctorXSchedule[doctorId]`** (new) — full list of `X`-segments across all ops for inspection
- **`projectedDoctorProductionPerHour`** (new)
- **`coordinatorFallbacks[]`** (new) — emit when coordinator had to defer/relax a constraint (closes PRD-V3 P0-4).

---

## 9. Data Model

Prisma schema is authoritative. File: [prisma/schema.prisma](prisma/schema.prisma).

### 9.1 Tables

| Table | Changes from V3 |
|---|---|
| `Office` | **Add** `practiceModel` (string enum), `productionPolicy` (string enum) |
| `Provider` | **Add** `dayOfWeekRoster` (JSON string), `role` enum extended with `ASSISTANT` |
| `BlockType` | **Add** `asstPreMin` (int), `doctorXMin` (int), `asstPostMin` (int), `doctorContinuityRequired` (bool). **Deprecate but retain** `durationMin`, `durationMax` as computed/back-compat columns |
| `ScheduleRule` | **Add** `productionPolicy`, `maxConcurrentDoctorOps` (int default 2), `doctorTransitionBufferMin` (int default 0), `openSlotPctTarget` (int default 0), `emergencySlotConfig` (JSON) |
| `ScheduleTemplate` | **Add** `xSegmentScheduleJson` — per-doctor X-segment audit log for the generated day |
| `ScheduleVersion` | unchanged |
| `ProcedureOverride` (new) | `(officeId, blockTypeId)` with `asstPreMin`, `doctorXMin`, `asstPostMin`, `patternOverride` |
| `TemplateLibraryItem` | unchanged |
| `ProviderAbsence` | unchanged |
| `TreatmentSequence` | unchanged |

### 9.2 Schema skeleton (Prisma)

```prisma
model BlockType {
  id                        String  @id @default(cuid())
  officeId                  String
  label                     String
  // X-segment model (new)
  asstPreMin                Int     @default(0)
  doctorXMin                Int     @default(0)
  asstPostMin               Int     @default(0)
  doctorContinuityRequired  Boolean @default(false)
  // Legacy (computed on read post-migration)
  durationMin               Int?
  durationMax               Int?
  ...
}

model ProcedureOverride {
  id                        String  @id @default(cuid())
  officeId                  String
  blockTypeId               String
  asstPreMin                Int?
  doctorXMin                Int?
  asstPostMin               Int?
  patternOverride           String?
  @@unique([officeId, blockTypeId])
}

model Office {
  practiceModel             String  // enum: 1D2O, 1D3O, 2D3O, 1D2O_3H, ...
  productionPolicy          String  // enum: JAMESON_50, LEVIN_60_65, FARRAN_75_BY_NOON, CUSTOM
  ...
}
```

### 9.3 Hygienist default daily goal (closes PRD-V3 P1-3)

Change [schema.prisma:44](prisma/schema.prisma#L44) hygienist `dailyGoal` default from `5000` to `1500`. Migration updates existing offices.

### 9.4 Cascades (preserved)

`Office → Provider / BlockType / ScheduleRule / ScheduleTemplate / ScheduleVersion / ProcedureOverride` all `onDelete: Cascade`.

### 9.5 V3→V4 migration plan

Idempotent migration `016_x_segment_model.sql`:

1. Add new columns with nullable defaults.
2. Backfill X-segment values from `durationMin` using role-based heuristics:
   - DOCTOR blocks: `asstPreMin = round(durationMin × 0.25)`, `doctorXMin = round(durationMin × 0.50)`, `asstPostMin = round(durationMin × 0.25)`. Rounded to nearest 10.
   - HYGIENIST blocks: `asstPreMin = durationMin - 10`, `doctorXMin = 10` (if matrixing enabled), `asstPostMin = 0`.
   - SRP / PM blocks with no exam: `asstPreMin = durationMin`, others 0.
3. Emit a report of all rows backfilled for manual review.
4. Provide a dry-run flag (`PRISMA_MIGRATE_DRY_RUN=1`).

---

## 10. UI / UX Requirements

### 10.1 The legibility problem (new — primary focus)

User feedback: "you can't read what's on there." The current canvas at 10-min density renders an 8-unit HP block as eight stacked cells, each showing "HP > $1800" truncated to "HP …". Staffing codes (`A`, `D`, `H`) are single letters inside coloured cells and are not visually distinct from the cell's own semantics.

**Root causes:**
1. Block label is repeated per 10-min cell instead of once per block.
2. Cell height at 10 min = ~18 px at standard zoom; labels don't fit.
3. `D` inside hygiene column is visually identical to `H` except the letter.
4. Cross-column doctor `X`-overlaps are not annotated.

### 10.2 UX-1 to UX-3 — Global (preserved)

- **UX-1 Theme.** Light/white only.
- **UX-2 Typography.** Inter / system stack.
- **UX-3 Navigation.** Persistent left sidebar.

### 10.3 Three-panel schedule builder (preserved layout, rewritten cell treatment)

- **UX-4 Left — Block Palette.**
- **UX-5 Center — Schedule Canvas.**
- **UX-6 Right — Properties Panel.**
- **UX-7 Top — Toolbar Ribbon.**

### 10.4 Legibility requirements (new)

**UX-L1 Multi-row block rendering.** A block occupying N slots must render as a single CSS grid item spanning N rows, not as N independent cells. The block's label appears once, centered vertically, with responsive font sizing based on block height.

**UX-L2 Three-zone segment colouring within a block.** Each block's cell displays three visual bands corresponding to `asst_pre` (light tint of block colour), `doctor_X` (full saturation + bold outline), `asst_post` (light tint). This makes the X-segment graph visually obvious.

**UX-L3 Doctor-exam glyph distinct from hygiene time.** When matrixing places a `D` inside a hygiene block, that unit renders with (a) a diagonal-stripe background pattern, (b) a doctor-colour dot in the corner, and (c) a bold left border. Closes PRD-V3 P1-2.

**UX-L4 Hover reveal.** Hovering over any block shows a tooltip with full label, duration, pattern, provider, X-segment breakdown, and production amount. Truncation is permitted on the cell; the tooltip is canonical.

**UX-L5 Zoom control.** The canvas must support 75% / 100% / 125% / 150% zoom via a toolbar control. At 150%, a 10-min row is ≥ 27 px tall and labels must fully fit.

**UX-L6 Colour-coding by procedure category.** Beyond the block's own colour, a thin left-border stripe indicates procedure category (8 categories × 8 border colours). This gives users a at-a-glance read of the day's category mix.

**UX-L7 Sticky headers.** Time column (rows) sticky on horizontal scroll. Provider/op header (cols) sticky on vertical scroll.

**UX-L8 Overflow strategy.** Long labels truncate with ellipsis. Closes PRD-V3 P2-1.

**UX-L9 Conflict overlay on X-segment overlap.** When two `X`-segments on the same doctor overlap (whether from generator fallback or user edit), both cells gain a red outline and a conflict icon. Clicking the icon opens the conflict panel. Closes PRD-V3 P0-4 on the UI side.

**UX-L10 Week-type badge prominent.** The active week (A / C / Week 1 / Week 2…) is a large pill next to the day selector, not hidden in a dropdown. Closes PRD-V3 P1-5.

**UX-L11 Production-policy indicator.** The active production policy (Jameson / Levin / Farran / Custom) appears as a small chip in the toolbar. Hover shows the policy's rule in plain English.

**UX-L12 Goal derivation inspector.** Clicking the "Daily Goal" number in the Properties Panel opens a popover showing the derivation math (annual → daily → minus hygiene → doctor target). Closes the mental-math burden described in §2 problem #4.

**Traces to:** User feedback "you can't read what's on there"; `03-multi-column-coordination.md` §10 (Dentrix/Open Dental show X/slash within the appointment rectangle); `04-time-blocking-mechanics.md` §1 (10-min grid density rationale).

### 10.5 Interaction rules (preserved)

- **UX-8 Horizontal day selector.**
- **UX-9 10-minute slider.**
- **UX-10 Full-screen generated view.**
- **UX-13 Keyboard shortcuts.**

### 10.6 Supporting panels (preserved)

- **UX-14 Production Summary.**
- **UX-15 Clinical Validation.**
- **UX-16 Goal Pacing.** Updated to use computed annual → daily pipeline from FR-8; closes PRD-V3 P2-8 (honour working-days config).
- **UX-17 Recall Capacity.**
- **UX-18 Conflict Overlay / Panel.** Now fed by the coordinator's X-segment overlap detection.
- **UX-19 Version Panel.**

### 10.7 New panels

**UX-20 Doctor X-Schedule Inspector.** A read-only view showing the doctor's full day as an X-segment timeline across all ops (hygiene + restorative). One row per doctor. Visual proof that doctor overlaps are within `maxConcurrentDoctorOps`.

**UX-21 Procedure Override Panel.** Per-Office table of ProcedureOverride rows. Add / edit / delete override. Preview the effect on a test block before saving.

---

## 11. Excel Export Contract

Implementation: [excel.ts](src/lib/export/excel.ts). Tests: [excel.test.ts](src/lib/export/__tests__/excel.test.ts).

- **EX-1** One workbook per office. One sheet per day. Variants append `-EOF`, `-Opt1`, etc.
- **EX-2** Row header `HH:MM` in the office's time-increment. Includes terminal working-end row.
- **EX-3** Column header = provider name + operatory. DPMS provider code prepended when known.
- **EX-4** Cell fill = block colour tinted 0.35 (`/`) or 0.7 (`X` / `H`).
- **EX-5** Cell text = block label on first slot of block; empty on continuation slots.
- **EX-6** Staffing code as short prefix.
- **EX-7** Last 3 rows = production summary per provider (target, actual, status). **New:** include `projectedDoctorProductionPerHour` in the summary block.
- **EX-8** Lunch rows merged across columns labelled `LUNCH`.
- **EX-9** Default time-increment 10 when unspecified.
- **EX-10** Colours round-trip to Microsoft Excel.
- **EX-11 (new)** X-segment visual bands preserved in Excel via distinct cell tints within the block (prefix/X/suffix).
- **EX-12 (new)** Production policy and practice model printed in sheet footer.

---

## 12. Integration Points

| System | Direction | Status | Notes |
|---|---|---|---|
| Open Dental | out | stub built | Schedule block XML |
| Dentrix | out | not built | Planned Q3 |
| Eaglesoft | out | not built | Planned Q3 |
| Dental Intelligence | in | future | Pull actual procedure mix to seed `currentProcedureMix` |
| Power BI | out | future | Emit chair-utilization + RIS-style benchmarks |
| SGA practice-directory | in | future | Auto-provision Office |
| Coolify | ops | live | Docker via `Dockerfile` |

---

## 13. Known Problems and Issues to Fix (Prioritised)

Carries forward PRD-V3's 25 items **verbatim** (P0 / P1 / P2). New items from Phase-0 research are appended with `-RES-` prefix.

### P0 — must fix before broader rollout

- **P0-1** No operatory assignment UI on provider form. [schema.prisma:37](prisma/schema.prisma#L37). Closed by FR-2. Effort 0.5 d.
- **P0-2** Edit-after-generate does not recompute telemetry. Closed by FR-13. Effort 1 d.
- **P0-3** 100%-fill generator. Closed by FR-4 (`openSlotPctTarget`). Effort 1.5 d.
- **P0-4** Cross-column overlap fallback is silent. Closed by §8.6 (`coordinatorFallbacks`). Effort 0.5 d.
- **P0-RES-1 X-segment data model missing.** The primary atom of multi-column scheduling — three durations per block — is not in the schema. Every multi-column bug traces to this. Effort 2 d (schema + migration + generator refactor).
- **P0-RES-2 Multi-column coordinator operates on wrong primitive.** Current zigzag works on D-minutes avoid-list; should operate on first-class X-segment graph with a singleton doctor resource (§8.3). Effort 3 d.
- **P0-RES-3 UI block legibility broken at 10-min density.** User-reported. Closed by UX-L1 through UX-L12. Effort 3 d.

### P1 — must fix before GA

- **P1-1** Schedule Rules form missing NP/SRP blocks-per-day. Closed by FR-5. Effort 0.5 d.
- **P1-2** 'D' in hygienist column has no visual distinction. Closed by UX-L3. Effort 0.5 d.
- **P1-3** Hygienist default daily goal $5,000. Closed by §9.3. Effort 0.5 d + migration.
- **P1-4** Manual edit → variety cap not re-checked. Closed by FR-13. Effort 0.5 d.
- **P1-5** Rotation week filtering partial. Closed by UX-L10. Effort 0.25 d.
- **P1-6** Assisted hygiene mode not first-class. Effort 1 d.
- **P1-7** Print view does not match Excel colour fidelity. Effort 0.5 d.
- **P1-8** Variant-day flow not exposed in UI. Closed by FR-16. Effort 1 d.
- **P1-9** No bulk goals dialog wire-up. Effort 0.25 d.
- **P1-10** `futureProcedureMix` JSON edit is raw text. Effort 1.5 d.
- **P1-RES-1 Production policy is hard-coded to 75%.** Practices legitimately want Jameson 50% or Levin 60–65%. Closed by §4.7, FR-4. Effort 1.5 d.
- **P1-RES-2 Goal derivation is manual.** Annual→daily→minus-hygiene happens out-of-band; users type a number. Closed by FR-8, UX-L12. Effort 1 d.
- **P1-RES-3 Day-of-week rosters missing.** Kelli Friday drop-out (Gap 4). Closed by FR-2. Effort 1 d.
- **P1-RES-4 Per-practice procedure-length overrides missing.** Crown prep bimodal (20 vs 80 min). Closed by FR-6. Effort 1 d.
- **P1-RES-5 Practice-model awareness missing.** 1D2O vs 2D3O changes pattern choice (Gap 5). Closed by §4.6, FR-1. Effort 1 d.
- **P1-RES-6 Emergency slot configuration under-specified.** Need scheduled window, protected-until, auto-release. Closed by FR-EMR-1 below. Effort 1 d.
- **P1-RES-7 Doctor-continuity-required flag missing.** Molar endo and surgical ext cannot stagger — they serialise. Not currently modelled. Closed by FR-3, §8.3. Effort 0.5 d.
- **P1-RES-8 `maxConcurrentDoctorOps` config missing.** Default 2, but DSO sites may want 3; hard-capped to 2 silently. Closed by FR-4. Effort 0.25 d.

### P2 — quality-of-life

- **P2-1** Block label overflow. Closed by UX-L4, UX-L5, UX-L8. Effort 0.25 d.
- **P2-2** No empty-schedule keyboard shortcut. Effort 0.25 d.
- **P2-3** Production summary refresh flicker. Effort 0.5 d.
- **P2-4** Import from Dental Intel not built. Effort 3 d.
- **P2-5** Benchmarks page comparison lacks filters. Effort 0.5 d.
- **P2-6** Sidebar counts stale after office create. Effort 0.5 d.
- **P2-7** Clone-template modal lacks preview. Closed by FR-17. Effort 0.5 d.
- **P2-8** Goal pacing assumes 20 working days/month. Partially closed by FR-8. Effort 0.25 d.
- **P2-9** Stagger offset default 0. Effort 0.25 d.
- **P2-10** Dockerfile does not pin Prisma version. Effort 0.25 d.
- **P2-11** No rate-limit on `/api`. Effort 1 d.
- **P2-RES-1 Doctor transition buffer not configurable.** The literature splits pro-buffer vs no-buffer (`03-multi-column-coordination.md` §7). Closed by FR-4. Effort 0.25 d.
- **P2-RES-2 Hygiene exam window not configurable.** Currently matrixing is always ~60% through; should be a window `[earliest, latest]`. Effort 0.5 d.
- **P2-RES-3 Morning huddle / afternoon review not first-class template entities.** Both appear as generic block-offs; should be their own concept for KPI tracking. Effort 0.5 d.

**Total outstanding:** 25 V3 items + 14 new research items = **39**. Classification: 7 P0 (4 V3 + 3 new), 18 P1 (10 V3 + 8 new), 14 P2 (11 V3 + 3 new).

### FR-EMR-1 Emergency slot contract (new, referenced from FR-4)
**Statement.** Every emergency slot carries three attributes:
1. `scheduledWindow` — start/end minute of the slot.
2. `protectedUntil` — minute before which only emergency-coded appointments may book.
3. `autoReleaseBehavior` — `ROLL_TO_ASAP_LIST` | `PROMOTE_SAME_DAY_DENTISTRY` | `LEAVE_OPEN`.

Default: one mid-morning slot (10:30–11:00) and one early-afternoon slot (14:00–14:30), both 30 min, `protectedUntil` = slot-start - 60 min, `autoReleaseBehavior = ROLL_TO_ASAP_LIST`.

**Traces to:** `04-time-blocking-mechanics.md` §6.

---

## 14. Out of Scope

- Patient data (no PHI).
- Real-time multiplayer editing (single-user in MVP).
- Insurance-fee schedule import beyond the existing `feeModel` enum slot.
- Automatic push into DPMS.
- Mobile / tablet optimisation.
- Native dark mode.
- Multi-tenant account management.
- **New:** Full cancellation / ASAP list management — the scheduler is aware that an ASAP list exists but does not own it (§04 research §9).
- **New:** Anesthesia-timing modelling (beyond `asst_pre` length).
- **New:** Modelling EFDA vs RDA scope-of-practice at the procedure level (§03 §6). The engine exposes `doctorXMin` but does not validate scope.

---

## 15. Test Strategy

- **Unit tests (vitest)** — current 855+ assertions preserved. New suites:
  - `x-segment-model.test.ts` — asserts `asstPreMin + doctorXMin + asstPostMin = total` for every BlockType post-migration.
  - `multi-column-coordinator.test.ts` — ≥ 95% coverage. Asserts X-segment non-overlap, `maxConcurrentDoctorOps` respected, `doctorContinuityRequired` serialisation, hygiene exam window.
  - `production-policy.test.ts` — each of 4 policies drives a distinct morning-load outcome.
  - `goal-derivation.test.ts` — annual → daily → minus hygiene formula correctness.
  - `procedure-override.test.ts` — override shadows global BlockType at generation.
  - `day-of-week-roster.test.ts` — Kelli Friday drop-out scenario.
- **Golden tests** — 6 existing templates re-captured post-V4 migration. Must produce identical slot arrays for the `FARRAN_75_BY_NOON` policy (the default) to verify no regression. New goldens for `JAMESON_50` and `LEVIN_60_65`.
- **Integration tests** — full-office with 1D2O, 1D2O_3H, 2D3O practice models.
- **Component tests** — Properties Panel, Block Palette, Schedule Canvas (UX-L1 through UX-L12 each has a visual-regression screenshot test).
- **End-to-end (Playwright)** — 10 flows: UC-1 through UC-10.
- **Visual regression** — Playwright screenshot diff on canvas at 75/100/125/150% zoom.
- **Export fidelity** — `excel.test.ts` extended for EX-11 and EX-12.
- **Migration test** — run `016_x_segment_model.sql` on a V3 production snapshot, assert post-migration templates re-generate within 2% dollar-delta of V3 output.
- **CI gating.** `npm run lint && npm run test && npm run build` must all pass. Golden fixtures updated only via explicit `UPDATE_GOLDENS=1`.

---

## 16. Open Questions for Stakeholders

**Carried forward from V3:**
- **Q1** 65% variety cap configurable per office, or fixed clinical rule?
- **Q2** Default for `openSlotPctTarget` — 0% or 10%?
- **Q3** When `futureProcedureMix` is set, does the AM-rocks rule still apply, or do category weights fully drive placement?
- **Q4** Hygienist whose daily goal is below one RC/PM block — warn or auto-adjust?
- **Q5** Rotation weeks — 2-week symmetrical or support 3/4-week cycles?
- **Q6** `matrixing` default on or off for new offices?
- **Q7** Doctors sharing an op on different days — single column with day filter, or separate columns?
- **Q8** Scanner-room scheduling — per-block `roomRequired` or out of scope?
- **Q9** "Emergency access only" operatory a recognised preset?
- **Q10** Assisted Hygiene — per-office, per-provider, or per-day toggle?
- **Q11** SGA practice directory authoritative source — DPMS or SGA-owned?
- **Q12** Multi-variant days — in-app side-by-side comparison, or Excel-diff sufficient?

**New from Phase-0 research:**
- **Q13** Default production policy for new offices — `FARRAN_75_BY_NOON` (matches current behaviour) or `JAMESON_50` (most commonly cited in literature)?
- **Q14** Goal derivation — does SGA have a canonical "working days per year" number (220? 240?) or is it per-office?
- **Q15** Practice-model taxonomy — do we restrict to the six codes in §4.6 or accept any `NDxMOyH` string?
- **Q16** `maxConcurrentDoctorOps` cap — 4 (per literature) or 3 (SGA operational preference)?
- **Q17** X-segment migration — backfill heuristic (§9.5 step 2) acceptable, or do we need a human-in-the-loop review for every BlockType?
- **Q18** Doctor-continuity-required flag — which block types get it by default? (Proposal: molar endo, surgical ext, implant placement.)
- **Q19** Emergency slot `autoReleaseBehavior` — which is the default? (Proposal: `ROLL_TO_ASAP_LIST`.)
- **Q20** UX-L2 three-zone segment colouring — is this clear at a glance, or does it make the canvas busier? (Needs user test with Alexa + Megan before implementation.)
- **Q21** Hygiene exam window — should the engine auto-expand the window if no free doctor X-segment is found (soft constraint) or refuse and warn (hard constraint)?

---

*End of PRD v4.0. Supersedes [PRD v1.0](../../PRD.md) and [PRD v3.0](../../PRD-V3.md). Research corpus in [`.cst-rebuild-v3/research/`](../research/).*
