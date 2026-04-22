# CST Designer — Sprint 5 Plan
**Version 1.0 — 2026-04-21**
**Sprint window:** 2026-04-22 → 2026-05-05 (2 weeks)
**Proposed ship date:** 2026-05-05 (Tuesday EOD, to allow Mon 5/4 regression buffer)
**Supersedes:** nothing — additive to [SPRINT-PLAN.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\sprint-plan\SPRINT-PLAN.md) (Phase 3 sprints 1–3) and the Sprint 4 fix pass ([sprint-4-fix-report.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\logs\sprint-4-fix-report.md))
**Driver doc:** [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) — Scott's "Custom AI Schedule Template Generator Prompt" (March 2026)
**Contracts:** [PRD-V4.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\synthesis\PRD-V4.md) · [scheduling-bible.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\synthesis\scheduling-bible.md)

---

## 1. Scope summary

CST today produces a correct, anti-pattern-clean 10-minute template for the six canonical SMILE NM / Cascade practices. The core rebuild shipped to [http://cst.142.93.182.236.sslip.io/](http://cst.142.93.182.236.sslip.io/) on 2026-04-21 with 1,252/1,252 unit tests and 62/62 Playwright flows green.

Sprint 5 turns that correct grid into **AI-consultant-grade advice**. The inbox docx asks for an input taxonomy roughly 3× wider than the current office form, a six-section structured output the engine does not yet emit, a 1-to-10 self-scoring rubric on six axes, a Growth / Access / Balanced three-variant generator, and a 30/60/90 review plan rendered alongside the template. The engine stays the engine; Sprint 5 makes its output **advisory, explainable, and comparable**. We are not re-solving scheduling — we are packaging the solution the way a scheduling consultant would deliver it.

Two sprint-level guardrails: (a) no new clinical rules — everything in Sprint 5 is input capture, output rendering, scoring heuristics on already-computed telemetry, or policy-weighted re-runs of the existing generator; (b) no schema-shape change to `BlockType`, `ScheduleRule`, or the coordinator interfaces shipped in Sprints 1–4. New fields live on `Office` (goals/constraints/issues/intake JSON blobs) and a new `TemplateAdvisory` table bound to `ScheduleTemplate`.

---

## 2. Gap analysis

### 2.1 Input fields — docx taxonomy vs current office form

Current form: [src/app/offices/new/page.tsx](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\src\app\offices\new\page.tsx) (four tabs: Practice / Providers / Timing / Rules).

**PRACTICE / PROVIDER INFO**

| Docx field | Current CST field | Gap |
|---|---|---|
| Practice type | — | **MISSING** |
| Provider type (single doctor / multi / specialty) | Derived from provider roles | PARTIAL |
| Number of doctors | Derived from providers array | HAVE |
| Number of hygienists | Derived from providers array | HAVE |
| Days provider works | `workingDays` (office-wide) + `dayOfWeekRoster` (per-provider, Sprint 1) | HAVE |
| Hours per day | `workingHours.start/end` per provider | HAVE |
| Lunch break | `lunchBreak.start/end` per provider | HAVE |
| Number of ops available | Implicit from `OPERATORIES` constant (11 slots) | PARTIAL — not a field, hard-coded list |

**GOALS**

| Docx field | Current CST field | Gap |
|---|---|---|
| Monthly production goal | — (only per-provider `dailyGoal`) | **MISSING** |
| Daily production goal | Per-provider `dailyGoal` | PARTIAL — not office-level |
| New patient goal (monthly) | — | **MISSING** |
| Hygiene reappointment demand (low/med/high) | — | **MISSING** |
| Emergency access goal | `emergencyHandling` enum (`DEDICATED/FLEX/ACCESS_BLOCKS`) | PARTIAL — binary flag, not a goal |
| Same-day treatment goal (%) | — | **MISSING** |
| Growth priority (free text / enum) | — | **MISSING** |
| Main scheduling problems to solve | — | **MISSING** |

**VISIT MIX**

| Docx field | Current CST field | Gap |
|---|---|---|
| Most common procedures | Implicit in `procedures` array | PARTIAL |
| Average procedure times | `duration` per procedure | HAVE |
| High-value procedures to protect | — (no "protect" flag on BlockType) | **MISSING** |
| Procedures that can flex | — | **MISSING** |
| NP appointment length | `NP CONS` or `NPE` duration | HAVE |
| Emergency appointment length | `ER` duration | HAVE |
| Limited exam length | — (no distinct block) | **MISSING** |
| Crown / larger treatment length | `HP` / `Crown Prep` duration | HAVE |
| Restorative length | `MP` duration | HAVE |

**HYGIENE / EXAM NEEDS**

| Docx field | Current CST field | Gap |
|---|---|---|
| Hygiene demand level (low/med/high) | — | **MISSING** |
| Doctor exam frequency needed | — | **MISSING** |
| Perio demand | `srpBlocksPerDay` (count only) | PARTIAL |
| New patient hygiene flow | `npModel` (`doctor_only/hygienist_only/either`) | HAVE |
| Hygiene bottlenecks (free text) | — | **MISSING** |

**CONSTRAINTS**

| Docx field | Current CST field | Gap |
|---|---|---|
| Existing commitments (e.g. Wed 8am huddle) | `schedulingRules` textarea | PARTIAL — free text, not structured |
| Provider preferences | `schedulingRules` textarea | PARTIAL |
| Team limitations | — | **MISSING** |
| Rooms or equipment limitations | — | **MISSING** |
| Time blocks that must stay open | — | **MISSING** (related: `openSlotPctTarget` is engine config, not a constraint) |
| Time blocks that should never be used for certain visits | — | **MISSING** |

**CURRENT TEMPLATE ISSUES**

| Docx field | Current CST field | Gap |
|---|---|---|
| Where production is leaking | — | **MISSING** |
| Where access is poor | — | **MISSING** |
| What gets overbooked | — | **MISSING** |
| What gets underutilized | — | **MISSING** |
| No-show / cancellation patterns | — | **MISSING** |

**Totals.** 37 docx fields. HAVE: 9. PARTIAL: 9. MISSING: 19. Current coverage is **24% HAVE / 24% PARTIAL / 52% MISSING** — roughly the "~30%" Scott's prompt cited. Sprint 5 closes every MISSING row and elevates every PARTIAL to HAVE.

### 2.2 Output sections — docx vs current CST output

Current output: `ScheduleTemplate` (Prisma) → `ScheduleCanvasV2` grid + Excel export. No accompanying narrative.

| Docx output section | Current CST | Gap |
|---|---|---|
| A. Executive Summary | — | **MISSING** |
| B. Key Inputs and Assumptions | Audit page (`/audit`) shows block coverage only | PARTIAL |
| C. Recommended Weekly Template (by day) | Grid canvas per day | HAVE (visual), MISSING (narrative) |
| D. Block Logic Explanation / Block Rationale | Anti-Pattern Guard Report (pass/fail) | PARTIAL — diagnostics not rationale |
| E. Risks / Watchouts / Tradeoffs | Coordinator fallbacks list | PARTIAL — rule codes not prose |
| F. KPIs to Monitor | — | **MISSING** |
| G. Optional Refinements | — | **MISSING** |
| Suggested Review Timeline (30/60/90) | — | **MISSING** |
| 1-10 Score on 6 axes | — | **MISSING** |
| 3 Variants (Growth / Access / Balanced) with recommendation | — | **MISSING** |

---

## 3. Feature breakdown

### 3.1 Feature A — Input form expansion (Intake V2)

**User story.** As Alexa (CST ops), I want the office-creation form to capture the full scheduling-consultant intake taxonomy so that the downstream generator and advisory output reflect the practice's real goals, mix, constraints, and current issues — not just the 30% we collect today.

**Acceptance criteria.**
- A new wizard step ordering is shipped: **1. Practice · 2. Providers · 3. Goals · 4. Visit Mix · 5. Hygiene · 6. Constraints · 7. Issues · 8. Rules** (eight tabs, up from four).
- Every field in §2.1 MISSING or PARTIAL lands with label, helptext, and zod validation.
- All new fields persist on `Office` via two JSON columns: `intakeGoals` (goals + hygiene demand + NP/emergency targets) and `intakeConstraints` (constraints + issues + free-text narrative sections). Existing fields untouched.
- Draft autosave continues to work (the `DRAFT_KEY` flow stays intact).
- An "intake completeness" score renders on the office header: `HAVE fields / 37 × 100`. Must hit ≥ 80% before Generate is enabled.
- Backwards compatibility: existing offices show an "Intake incomplete — complete now to enable advisory output" banner; Generate still works but the advisory output section is gated off.

**Technical approach.**
- **UI:** [src/app/offices/new/page.tsx](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\src\app\offices\new\page.tsx) split into per-tab sub-components in `src/components/offices/intake/` (Goals.tsx, VisitMix.tsx, Hygiene.tsx, Constraints.tsx, Issues.tsx). Same pattern for edit page.
- **API:** `/api/offices` POST + PATCH payload extended; zod schema in `src/lib/contracts/api-schemas.ts` adds `IntakeGoalsSchema` and `IntakeConstraintsSchema`.
- **DB:** Prisma migration `20260422000000_intake_v2` adds `Office.intakeGoals JSON`, `Office.intakeConstraints JSON`. Nullable, defaults `{}`.
- **Shared-types:** `src/lib/engine/types.ts` gains `IntakeGoals` and `IntakeConstraints` interfaces (pure structural, no engine coupling).

**Dependencies + sequencing.** Unblocked. Must land by Wednesday of week 1 so Feature B/C/D can consume the new fields.

**Effort:** **L** (~3.5 days: form architecture + 19 new fields + validation + migration + draft flow preservation).

---

### 3.2 Feature B — Structured advisory output (Advisory Panel + Markdown Export)

**User story.** As Alexa, I want the generator output to include an executive summary, block rationale, risk section, KPIs to monitor, and a recommended review timeline — rendered in-app alongside the grid and exportable as Markdown — so that I hand office managers a document that looks like a consulting brief, not a spreadsheet.

**Acceptance criteria.**
- A new right-rail tab "Advisory" sits next to the existing Guard Report panel. Tabs: **Canvas · Guard Report · Advisory · Variants · Review Plan**.
- Advisory tab renders six sections, each collapsible:
  1. **Executive Summary** — 2-3 sentence narrative naming practice, provider count, production policy, weekly goal met/at-risk, and top recommendation.
  2. **Key Inputs & Assumptions** — table dump of intake + any generator-inferred defaults (flagged as "assumed").
  3. **Recommended Weekly Template** — 5-day table: Day · Time Block · Appointment Type · Purpose · Notes (the docx's "forced table layout" upgrade).
  4. **Block Rationale** — prose paragraph per day explaining why rocks land where they land (derived from `PolicyResult` + `coordinatorFallbacks`).
  5. **Risks & Tradeoffs** — bulleted list of every `coordinatorFallbacks[]` entry + every soft `AP-*` warning, translated to plain English via a lookup table keyed by rule code.
  6. **KPIs to Monitor** — list of 6-8 metrics from a static catalog plus 2-3 practice-specific from intake issues (e.g. if "late-afternoon cancellations" was flagged in intake → add "afternoon show-rate %" to KPI list).
- A "Download Advisory (.md)" button emits a single Markdown file with all six sections + the scoring rubric (Feature C) + the review plan (Feature E). File naming: `{officeName}-advisory-{YYYY-MM-DD}.md`.
- "Copy as prompt" button copies the full filled-in "Reusable user prompt template" from the docx (sections PRACTICE / GOALS / VISIT MIX / HYGIENE / CONSTRAINTS / ISSUES / OUTPUT REQUEST) — useful when Alexa wants to sanity-check the output against a raw AI.

**Technical approach.**
- **UI:** new `src/components/schedule/v2/AdvisoryPanel.tsx` (collapsible sections, Radix Accordion). New route `/offices/[id]/advisory` for full-screen view + print.
- **Generator:** `src/lib/engine/advisory/compose.ts` — pure function `composeAdvisory(office, template, generationResult, scoring, variants) → AdvisoryDocument`. Pulls rationale strings from `src/lib/engine/advisory/rationale-templates.ts` (a keyed catalog — no LLM call in v1; strings are deterministic templated output so the engine remains deterministic per NFR-2).
- **Rationale templates:** 20-30 canned paragraphs keyed by `(policy, day-shape, dominant-block-tier)`. Sprint 5 ships with ~25 templates; Sprint 6 can expand.
- **Export:** `src/lib/export/advisory-markdown.ts` — pure Markdown renderer, no dependencies.
- **DB:** new table `TemplateAdvisory { id, templateId, generatedAt, documentJson, scoreJson, variantsJson, reviewPlanJson }`. One row per generate.
- **API:** `/api/offices/[id]/advisory/generate` POST; `/api/advisory/[id]` GET; `/api/advisory/[id]/markdown` GET.

**Dependencies + sequencing.** Depends on Feature A (intake fields) and Feature C (score consumed inline). Advisory generation runs post-schedule-generate, so it's a second-pass compose. Ships week 2 day 1–2.

**Effort:** **L** (~4 days: panel UI + compose function + rationale catalog + Markdown export + new table + route + advisory full-screen view).

**Format decision (per prompt ask).** In-app panel + Markdown download, **not** PDF, **not** Canva. Rationale: Markdown round-trips to email, Notion, Google Docs, and the existing SGA wireframes infra; PDF adds `puppeteer` and state complexity for no value beyond formatting; Canva requires Canva API which is stubbed per CLAUDE.md. Adding the Print view (existing `/offices/[id]/print`) gets extended to print the Advisory alongside the grid for anyone who wants PDF via browser print.

---

### 3.3 Feature C — Six-axis scoring rubric (TemplateScore)

**User story.** As Alexa, I want the generated template to score itself 1-10 on production potential, NP access, emergency access, hygiene support, team usability, and schedule stability, with one-sentence "to raise this score, consider X" guidance per axis, so I can tell a practice "this is an 8 on production but only a 5 on NP access, and here's why."

**Acceptance criteria.**
- `TemplateScore` struct computed on every generation; persisted to `TemplateAdvisory.scoreJson`.
- Each axis returns `{ score: 1–10, band: 'weak'|'fair'|'strong', signals: string[], raiseSuggestions: string[] }`.
- Score visualisation: six horizontal bars with numeric score + band colour (red 1-4 / amber 5-7 / green 8-10) at the top of the Advisory panel.
- Clicking an axis expands to show: the raw engine signals feeding it, the score math, and 1-3 "to raise this score" suggestion strings.
- All scoring is deterministic. No LLM calls. Heuristic cut-offs live in `src/lib/engine/advisory/scoring.ts` alongside golden tests.

**Technical approach.** See §5 for the full rubric definition. Implementation is a pure function `scoreTemplate(office, generationResult) → TemplateScore` keyed to:
- `productionSummary[]` per-provider met/under/over
- `morningLoadSwaps.scheduleRatio`
- `coordinatorFallbacks[]` count + severity
- Intake fields (NP goal, emergency goal, hygiene demand) compared to placed slot counts
- Block-type variety + anti-pattern guard report

**Files touched.** New: `src/lib/engine/advisory/scoring.ts`, `__tests__/scoring.test.ts`. Consumers: `compose.ts` (Feature B), `AdvisoryPanel.tsx`.

**Dependencies + sequencing.** Depends on Feature A (intake targets to compare against) and Sprint 1–4 engine telemetry (`GenerationResult` is the input). Can develop in parallel with Feature B; wired to the Advisory panel at integration.

**Effort:** **M** (~2.5 days: 6 axis heuristics + raise-suggestion catalog + visualisation + golden tests).

---

### 3.4 Feature D — Three variants (Growth / Access / Balanced) + recommendation

**User story.** As Alexa, I want the system to generate three versions of the schedule — Growth-focused, Access-focused, Balanced — and recommend the best one for this practice, so I can show the office manager the tradeoff landscape instead of a single take-it-or-leave-it template.

**Acceptance criteria.**
- Generate button has a split control: default action is single-generate (current behaviour); dropdown adds **"Generate 3 variants"**.
- Three-variant generation produces three `GenerationResult`s by running the existing generator three times with different policy profiles (see §4).
- Variants tab shows side-by-side cards (three columns on desktop ≥ 1440 px, vertical stack below) with: variant name · production total · NP slots · ER slots · hygiene checks · top 3 tradeoffs · "Open in canvas" button.
- System emits a recommendation ("Balanced wins for this practice because...") keyed to intake Goals:
  - Intake growth priority = "more production" → Growth wins
  - Intake "NP goal" under-served in current state → Access wins
  - Otherwise → Balanced wins
- Recommendation is a single sentence with the deciding intake field quoted back.
- Choosing a variant promotes it to the main canvas; other two persist on the `TemplateAdvisory` record for reference.

**Technical approach.**
- No new coordinator code. Variants are three generator invocations with pre-canned `VariantProfile` objects that modify the existing `ProductionTargetPolicy` + `ScheduleRule` inputs.
- **New file:** `src/lib/engine/advisory/variants.ts` — exports `VARIANT_PROFILES: Record<'GROWTH'|'ACCESS'|'BALANCED', VariantProfile>` and `generateThreeVariants(office, weekDay) → VariantSet`.
- **API:** `/api/offices/[id]/advisory/generate-variants` POST; returns `{ variants: VariantResult[], recommendation: { winner, reason } }`.
- **UI:** `src/components/schedule/v2/VariantComparison.tsx` three-card comparison + recommendation banner.
- `MultiColumnCoordinator` does **not** change. Each variant uses the same coordinator instance but with a different policy + rule tuple.

**Policy-weight mapping — see §4 for the full specification.**

**Dependencies + sequencing.** Depends on Feature A (intake drives recommendation logic) and the generator as-shipped. Can develop in parallel with Features B and C.

**Effort:** **M** (~2.5 days: three variant profiles + orchestration + comparison UI + recommendation heuristic + persistence).

---

### 3.5 Feature E — 30/60/90 review plan (ReviewTimeline)

**User story.** As Alexa, I want the advisory output to include a 30-day, 60-day, and 90-day review plan — which KPIs to measure, what to look for, and what should trigger a revision — so the practice doesn't ship the template and forget about it.

**Acceptance criteria.**
- New section in the Advisory panel and Markdown export: "Suggested Review Timeline".
- Three milestones rendered: **Day 30 · Day 60 · Day 90**. Each shows: KPIs to measure, target threshold, expected trend, revision trigger condition.
- KPI content is driven by the template's own scoring (Feature C) + intake issues:
  - If Production Potential score < 7 → Day 30 KPI list leads with "daily production vs goal".
  - If NP Access score < 7 → Day 30 adds "days-to-NP booking".
  - If intake issues contains "late-afternoon cancellation" → Day 30 adds "PM fill rate".
- Content comes from a static catalog in `src/lib/engine/advisory/review-plan.ts` — no LLM, deterministic.
- "Download Review Plan (.md)" is a sub-export. "Copy to calendar" button generates three `.ics` events at 30/60/90 days from template generation date (calendar export is a nice-to-have; see Out of Scope if we have to cut).

**Technical approach.**
- Pure function `composeReviewPlan(score, intake) → ReviewPlan` in `src/lib/engine/advisory/review-plan.ts`.
- Rendered inline in Advisory panel (Feature B). Persisted to `TemplateAdvisory.reviewPlanJson`.
- `.ics` generation via `ics` npm package (MIT, 6 kB). Confirm before install.

**Dependencies + sequencing.** Depends on Feature C (score-driven KPI selection). Ships week 2.

**Effort:** **S** (~1 day: KPI catalog + composition function + rendering + optional .ics export).

---

## 4. Three variants — detailed design

### 4.1 Why three is the right count

The docx names three: Growth, Access, Balanced. Matching the docx keeps the output "AI-consultant-grade" in the same vocabulary the prompt used. No additional variants in Sprint 5.

### 4.2 Variant policy weights

Each variant is defined by a `VariantProfile`:

```typescript
interface VariantProfile {
  code: 'GROWTH' | 'ACCESS' | 'BALANCED';
  label: string;
  productionPolicy: ProductionTargetPolicy;
  overrides: {
    npBlocksPerDay: number;        // overrides ScheduleRule
    srpBlocksPerDay: number;
    hpPlacement: 'morning' | 'afternoon' | 'any';
    openSlotPctTarget: number;     // 0-30
    doubleBooking: boolean;
    maxConcurrentDoctorOps: number;
  };
  weights: {                        // used by ProductionTargetPolicy + scoring
    productionPct: number;          // target share of day given to Rocks
    npAccessPct: number;            // target share given to NP-suitable slots
    emergencyAccessPct: number;     // target share given to ER slots
    hygieneSupportPct: number;      // doctor-exam availability weight
    doctorContinuityPct: number;    // preference for serialisation of continuity blocks
  };
}
```

**The three profiles:**

| Attribute | Growth | Access | Balanced |
|---|---|---|---|
| productionPolicy | `FARRAN_75_BY_NOON` | `JAMESON_50` | `LEVIN_60` |
| productionPct | 75 | 50 | 60 |
| npAccessPct | 10 | 25 | 17 |
| emergencyAccessPct | 5 | 15 | 10 |
| hygieneSupportPct | 5 | 5 | 8 |
| doctorContinuityPct | 5 | 5 | 5 |
| npBlocksPerDay | max(intake.npGoal/5, 1) | max(intake.npGoal/5, 2) + 1 | intake value |
| srpBlocksPerDay | 1 | 2 | intake value |
| hpPlacement | `morning` | `any` | `morning` |
| openSlotPctTarget | 0 | 20 | 10 |
| doubleBooking | false | true (hygiene-float) | false |
| maxConcurrentDoctorOps | 2 | 2 | 2 |

**Weights sum to 100** by construction — productionPct + npAccessPct + emergencyAccessPct + hygieneSupportPct + doctorContinuityPct.

### 4.3 Mapping to existing engine structures

Weights are consumed two places:

1. **ProductionTargetPolicy selection.** Pre-canned policy per variant; no change to the existing policy evaluator. Growth picks Farran (matches "protect production"); Access picks Jameson (matches "room for urgent care, timely NP"); Balanced picks Levin (60-65% morning = middle-ground).

2. **Schedule rule override at generation time.** `generateSchedule()` today reads `ScheduleRule` once. The variant runner injects an override rule object in-memory — no DB write. The `MultiColumnCoordinator`, `anti-pattern-guard`, `slots-to-placed-blocks` — unchanged.

### 4.4 UI presentation

Desktop (≥ 1440 px): three-column side-by-side comparison cards in the Variants tab. Each card:
- Header: variant name + production policy chip
- KPI strip: production total · NP slots · ER slots · hygiene checks · rock count
- Score summary: the 6-axis rubric (Feature C) displayed as small horizontal bars
- Top 3 tradeoffs (derived from `coordinatorFallbacks[]` and scoring weak points)
- "Open in canvas" button → promotes variant to main grid

Below the three cards: a **recommendation banner** ("Balanced wins for this practice because Dr. Chen's intake flagged 'new patients pushed > 2 weeks out' and Access adds 1 more NP slot per day without compromising the 60% morning production share").

Below 1440 px: vertical stack of the three cards.

### 4.5 MultiColumnCoordinator changes required

**None.** The coordinator consumes `ScheduleRule` + `ProductionTargetPolicy` via the existing generator interface. Swapping those at the generator entry point is sufficient. This preserves the Sprint 4 invariant that the coordinator is the authoritative placer.

### 4.6 Determinism

Each variant runs with a stable seed derived from `(officeId, variantCode)` so variant output is reproducible. `tsc` and `vitest` stay green.

---

## 5. Scoring rubric — 6 axes

Implementation lives in `src/lib/engine/advisory/scoring.ts`. All scoring is deterministic. No LLM.

### 5.1 Production potential

**Signal.** `sum(productionSummary[].actual) / sum(productionSummary[].target)` — weekly ratio. Also weighted by `projectedDoctorProductionPerHour` from PRD-V4 §8.6.

**Cut-offs.** 10 = ratio ≥ 1.05 AND $/hr ≥ 500. 9 = ratio ≥ 1.00 AND $/hr ≥ 500. 8 = ratio ≥ 0.95 AND $/hr ≥ 450. 7 = ratio ≥ 0.90. 6 = ratio ≥ 0.85. 5 = ratio ≥ 0.80. 4 = ratio ≥ 0.70. 3 = ratio ≥ 0.60. 2 = ratio ≥ 0.50. 1 = ratio < 0.50 OR $/hr < 350 (red per PRD-V4 §8.6).

**Raise suggestions (sample strings).**
- "Promote one medium-production block to high-production in the 9am-11am window on your two strongest days — projected +$1,200/week."
- "Your morning load ratio is 62%; switching to Farran 75% policy would pull ~$900 more production into the AM half."
- "Hygiene block mix skews prophy (85%). Shifting 2 prophy → SRP across the week adds ~$500 in hygiene-tier production."

### 5.2 New-patient access

**Signal.** `placed_np_slots_per_week / intake.npGoalMonthly × 4` — how close we are to meeting the monthly NP goal each week. Secondary signal: "days-to-first-available-NP" estimate = `7 / placed_np_slots_per_week`.

**Cut-offs.** 10 = ratio ≥ 1.10 AND days-to-NP ≤ 3. 9 = ratio ≥ 1.00 AND days-to-NP ≤ 4. 8 = ratio ≥ 0.90. 7 = ratio ≥ 0.80. 6 = ratio ≥ 0.70. 5 = ratio ≥ 0.60. 4 = ratio ≥ 0.50. 3 = ratio ≥ 0.40. 2 = ratio ≥ 0.25. 1 = ratio < 0.25.

**Raise suggestions.**
- "Add a second NP slot on Tuesday afternoons — matches the docx's 'first slot AM or first post-lunch' heuristic and closes the 11-day booking gap you flagged in intake."
- "Expanding hygiene NP flow (npModel = either) adds ~4 NP capacity/week with no doctor-column impact."

### 5.3 Emergency access

**Signal.** `placed_er_slots_per_day × days_worked` vs. intake `emergencyGoal`. If `emergencyGoal = "same day whenever possible"` → target = 2 ER slots per doctor per day.

**Cut-offs.** 10 = ≥ 2 ER slots/doctor/day, both released per `FR-EMR-1` contract. 8 = ≥ 1 morning + ≥ 1 afternoon. 6 = ≥ 1 ER slot/day, placement any time. 4 = 0.5-1 slot/day average. 2 = < 0.5 slot/day. 1 = no ER slot, no access blocks.

**Raise suggestions.**
- "Reserve a 10:30 AM ER slot with `protectedUntil=10:00` and a 2:30 PM slot protected until 13:00 — matches the PRD-V4 FR-EMR-1 default."
- "Current afternoon has no ER protection; one slot at 2:00 PM releases to ASAP list and absorbs 3-4 emergencies/week."

### 5.4 Hygiene support

**Signal.** (a) doctor-exam availability ratio = `exams_needed / exams_placeable_within_window` per `R-3.5`; (b) `coordinatorFallbacks[]` containing `R-3.5*` rules (hygiene exam window relaxations); (c) perio bottleneck — SRP placements per hygienist vs. intake `perioDemand`.

**Cut-offs.** 10 = all exams land in middle-30-min window, zero `R-3.5` fallbacks, SRP matches demand. 8 = ≤ 1 exam-window fallback per day. 6 = 2-3 fallbacks per day. 4 = exam windows routinely expanded (soft-expand behaviour per PRD-V4 Q21). 2 = exams placed outside window. 1 = no matrixing configured despite hygiene load > 50%.

**Raise suggestions.**
- "Hygiene columns 2 and 3 compete for doctor exam at 9:20; add `maxConcurrentDoctorOps=3` (requires EFDA scope) or stagger hygiene start by 10 min."
- "Intake flagged moderate perio demand but only 1 SRP slot/day; double to 2 to match."

### 5.5 Team usability

**Signal.** (a) block-type variety — Shannon entropy across placed blocks (higher = more varied day, easier for team); (b) consecutive-complex-block count (two `HP` back-to-back on same doctor without `NON-PROD` buffer is a usability penalty); (c) lunch conformance (whole-office vs staggered consistency).

**Cut-offs.** 10 = variety entropy ≥ 2.5 AND 0 back-to-back complex runs AND lunch consistent. 8 = entropy ≥ 2.2 AND ≤ 2 back-to-back complex runs. 6 = entropy ≥ 1.8. 4 = entropy ≥ 1.4. 2 = entropy < 1.4 OR > 5 back-to-back complex runs. 1 = single-block-type days present.

**Raise suggestions.**
- "Tuesday has 3 HP blocks back-to-back 8am-1pm on Dr. Chen — insert a 20-min NON-PROD buffer after the second HP to reduce lateness risk."
- "Hygiene column 2 is 90% RC/PM; adding 2 NP_HYG slots gives the hygienist procedure variety."

### 5.6 Schedule stability

**Signal.** (a) `coordinatorFallbacks[]` total count (more fallbacks = less stable); (b) anti-pattern guard warnings (SOFT severity) count; (c) intake-cited "no-show/cancellation" patterns crossed against afternoon-placed-rocks — if intake says "late afternoon cancellations high" and the template placed a HP block at 3:30 PM, penalty.

**Cut-offs.** 10 = 0 fallbacks AND 0 soft warnings. 8 = ≤ 1 fallback, ≤ 2 soft warnings. 6 = ≤ 3 fallbacks. 4 = ≤ 6 fallbacks. 2 = > 6 fallbacks OR a risky-PM-rock placed despite intake flag. 1 = a hard coordinator relaxation (`DEFERRED`) was emitted.

**Raise suggestions.**
- "Intake flagged 'late afternoon restorative has higher cancellation rate' — move the 3:30 PM HP on Thursday to 10:00 AM Friday."
- "Two `R-3.4` zigzag fallbacks on Wednesday — tighten stagger offset from 20 min to the canonical 10 min to remove them."

### 5.7 Output format (per axis)

```typescript
interface AxisScore {
  axis: 'PRODUCTION' | 'NP_ACCESS' | 'EMERGENCY' | 'HYGIENE' | 'USABILITY' | 'STABILITY';
  score: number;         // 1-10, integer
  band: 'weak' | 'fair' | 'strong';  // 1-4 / 5-7 / 8-10
  signals: { name: string; value: string }[];
  raiseSuggestions: string[];  // 1-3 strings
}

interface TemplateScore {
  overall: number;       // weighted average (all axes equal weight in v1)
  axes: AxisScore[];
  computedAt: string;
}
```

---

## 6. Output artifact spec

### 6.1 Format decision

**In-app Advisory panel + downloadable Markdown file.** No PDF, no Canva export, no shareable-link URL in v1. Rationale in §3.2.

Browser Print (existing `/offices/[id]/print`) gets extended to include the Advisory sections alongside the grid, so any user who wants PDF can print-to-PDF from the browser. Zero new dependencies.

### 6.2 Markdown document structure

```markdown
# {Office Name} — Schedule Advisory
**Generated:** 2026-04-24
**Week:** Week A
**Production Policy:** Farran 75% by Noon
**Practice Model:** 1D2O_3H

## 1. Executive Summary
{2-3 sentence narrative}

## 2. Template Score
| Axis | Score | Band |
|---|---|---|
| Production Potential | 8 | strong |
| NP Access | 6 | fair |
| Emergency Access | 9 | strong |
| Hygiene Support | 7 | fair |
| Team Usability | 8 | strong |
| Schedule Stability | 9 | strong |
**Overall:** 7.8 / 10

## 3. Key Inputs & Assumptions
{table of intake + any assumed defaults}

## 4. Recommended Weekly Template
| Day | Time Block | Appointment Type | Purpose | Notes |
|---|---|---|---|---|
| Mon | 08:00-08:10 | HUDDLE | Team briefing | — |
| Mon | 08:10-09:30 | HP | Protected production | Dr. Chen, OP1 |
...

## 5. Block Rationale
{prose paragraph per day — ~3-5 sentences each}

## 6. Risks & Tradeoffs
- {Plain-English coordinator fallback 1}
- {Plain-English soft AP warning 1}
...

## 7. KPIs to Monitor
1. Daily production vs goal (target ≥ 95%)
2. Days-to-NP booking (target ≤ 5)
...

## 8. Review Timeline
### Day 30
- KPI: {metric + target}
- Watch for: {trend}
- Trigger revision if: {condition}
### Day 60
...
### Day 90
...

## 9. "To Raise This Score" Suggestions
### Production Potential (8 → 9)
- {suggestion 1}
### NP Access (6 → 7)
- {suggestion 1}
...
```

### 6.3 Mock visual (Advisory panel)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Canvas │ Guard Report │ Advisory │ Variants │ Review Plan            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Template Score: 7.8 / 10   [Download .md] [Copy as prompt] [Print] │
│                                                                      │
│  Production ████████░░ 8 strong    NP Access    ██████░░░░ 6 fair   │
│  Emergency  █████████░ 9 strong    Hygiene      ███████░░░ 7 fair   │
│  Usability  ████████░░ 8 strong    Stability    █████████░ 9 strong │
│                                                                      │
│ ▼ 1. Executive Summary                                              │
│   {2-3 sentence narrative}                                           │
│                                                                      │
│ ▶ 2. Key Inputs & Assumptions (24 fields)                           │
│                                                                      │
│ ▶ 3. Recommended Weekly Template                                    │
│                                                                      │
│ ▶ 4. Block Rationale                                                │
│                                                                      │
│ ▼ 5. Risks & Tradeoffs                                              │
│   • Two zigzag fallbacks on Wed; consider tightening stagger.        │
│   • PM cancellation risk flagged in intake; Thu 3:30 HP may slip.    │
│                                                                      │
│ ▶ 6. KPIs to Monitor (8 metrics)                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.4 Executive summary composition rules

Two sentence minimum, four sentence maximum. Must name:
1. Practice + provider count + production policy (sentence 1)
2. Top achievement ("production goal met at 102%") OR top risk ("NP access 6/10 due to 11-day booking lag") (sentence 2)
3. Winning variant if three-variant ran; "single-variant run" if not (sentence 3, optional)
4. The single highest-impact next action (sentence 4, optional)

Sentences are assembled from templated fragments — deterministic, no LLM.

---

## 7. Stories + sprint sizing

### 7.1 Epic → Stories → Tasks

**Epic — CST-SPRINT-5.** Make CST output AI-consultant-grade: intake expansion, advisory panel, scoring, variants, review plan.

**Story US-5.1 — Intake Goals tab (MISSING 8 fields).** [Feature A]
- T-501 (S) Zod schema + types for `IntakeGoals`
- T-502 (S) Goals.tsx component with 8 inputs + validation
- T-503 (S) API wiring + Prisma migration `Office.intakeGoals JSON`

**Story US-5.2 — Intake Visit Mix tab (2 missing + 3 partial).** [Feature A]
- T-504 (S) VisitMix.tsx with protect/flex flags + limited-exam length
- T-505 (XS) BlockType UI: `protectFromFlex` boolean

**Story US-5.3 — Intake Hygiene tab (4 missing + 1 partial).** [Feature A]
- T-506 (S) Hygiene.tsx with demand-level + exam frequency + bottleneck narrative

**Story US-5.4 — Intake Constraints tab (5 missing + 2 partial).** [Feature A]
- T-507 (M) Constraints.tsx with structured rows (commitments, blackouts) + narrative
- T-508 (S) Persist to `Office.intakeConstraints JSON`

**Story US-5.5 — Intake Issues tab (5 missing).** [Feature A]
- T-509 (S) Issues.tsx — 5 narrative fields + "prior template upload" stub (deferred)

**Story US-5.6 — Intake completeness gate.** [Feature A]
- T-510 (XS) Header badge + Generate button gate at < 80% completeness
- T-511 (XS) Backfill banner for existing offices

**Story US-5.7 — Scoring rubric implementation.** [Feature C]
- T-512 (M) `scoring.ts` with 6 axes + cut-offs + raise-suggestion catalog
- T-513 (S) Score bar visualisation component
- T-514 (S) Golden tests for scoring determinism on all 6 fixtures

**Story US-5.8 — Three-variant generator.** [Feature D]
- T-515 (S) `VARIANT_PROFILES` constant + `generateThreeVariants` orchestrator
- T-516 (M) VariantComparison.tsx side-by-side card UI + recommendation banner
- T-517 (S) Recommendation heuristic keyed to intake goals
- T-518 (S) API route `/api/offices/[id]/advisory/generate-variants`

**Story US-5.9 — Advisory compose engine.** [Feature B]
- T-519 (M) `compose.ts` + rationale-templates catalog (25+ templates)
- T-520 (S) Plain-English rule-code → prose mapping for Risks section
- T-521 (S) Executive summary assembler (sentence fragment composition)

**Story US-5.10 — Advisory panel UI + persistence.** [Feature B]
- T-522 (M) AdvisoryPanel.tsx (6 collapsible sections + score bar at top)
- T-523 (S) `TemplateAdvisory` Prisma model + migration
- T-524 (S) API routes `/api/advisory/[id]` GET + generate POST
- T-525 (S) Full-screen view route `/offices/[id]/advisory`

**Story US-5.11 — Markdown export.** [Feature B]
- T-526 (S) `advisory-markdown.ts` renderer
- T-527 (XS) Download button + file-naming convention

**Story US-5.12 — Review plan.** [Feature E]
- T-528 (S) `review-plan.ts` composer + KPI catalog
- T-529 (S) Render inline in Advisory panel + separate .md section
- T-530 (XS) .ics calendar export (optional — first cut candidate)

**Story US-5.13 — Copy-as-prompt button.** [Feature B support]
- T-531 (S) Assemble full docx user-prompt template from Office intake + export

**Story US-5.14 — Print view extension.** [Feature B support]
- T-532 (S) `/offices/[id]/print` includes Advisory sections

**Story US-5.15 — Tests + Playwright.** [cross-feature]
- T-533 (M) Unit tests: scoring, variant orchestration, compose, review-plan
- T-534 (M) Playwright: intake-wizard-happy-path, advisory-generate, variants-compare, md-download

### 7.2 Effort rollup

| Size | Count | Days |
|---|---|---|
| XL | 0 | 0 |
| L | 0 | 0 |
| M | 8 | 16 |
| S | 21 | 21 |
| XS | 5 | 2.5 |
| **Total** | **34 tasks** | **~39.5 task-days** |

Parallelised across Stream A (engine + scoring + variants + compose), Stream B (UI panels + forms), Stream C (tests + export + docs): 3 streams × 10 working days = 30 stream-days; tight but achievable with 1 agent per stream running overlap-aware.

### 7.3 Calendar

- **Week 1 (Mon 2026-04-22 → Fri 2026-04-26).** Feature A (intake) lands by Wed; Feature C (scoring) lands by Fri. Feature D (variants) starts Thu in parallel.
- **Week 2 (Mon 2026-04-29 → Fri 2026-05-03).** Feature B (advisory compose + panel + markdown), Feature E (review plan). Integration Thu. QA + Playwright Fri.
- **Mon 2026-05-04.** Regression buffer + Coolify staging smoke.
- **Tue 2026-05-05.** Ship to staging under `CST_ADVISORY_ENABLED` feature flag. Green demo to Scott.

### 7.4 Cut list (if sprint slips)

In order of first cut:
1. T-530 (.ics calendar export)
2. T-532 (Print view extension)
3. T-531 (Copy-as-prompt button)
4. T-517 (Recommendation heuristic — revert to "always pick Balanced")
5. T-520 (Plain-English rule-code mapping — revert to raw rule codes)

If more than the top 5 cut, defer T-515–518 (variants) to Sprint 6 and ship Advisory + Scoring + Review Plan alone.

---

## 8. Out of scope

Explicitly deferred to Sprint 6 or beyond:

- **Front-desk-friendly simplified version.** Docx Layer 2. Needs a second template style; scope doubles. Defer.
- **Doctor-facing version.** Docx Layer 2. Same reason. Defer.
- **Rollout plan generation.** Beyond the 30/60/90 review plan, the docx also cites "rollout plan" and "template revision recommendation" outputs. Out.
- **LLM-generated narrative.** All Sprint 5 output is deterministic templated strings. An LLM-powered Advisory v2 is a Sprint 7+ project (and requires the Claude API + PHI review).
- **Multi-practice comparison.** Comparing a template against peers in the 260-practice network would be valuable but pulls in Power BI integration.
- **Prior-template import.** "Upload current template for gap analysis" is a T-509 stub only. Full import parser defers to Sprint 6.
- **Canva export.** Waiting on Canva API (CLAUDE.md says stubbed).
- **PDF engine.** Browser-print covers the need; dedicated PDF engine (puppeteer/playwright) deferred.
- **PHI / any patient-facing data.** Intake stays practice-level. No MI/PHI-bearing data enters the intake JSON.
- **Multi-doctor variant weights.** Variants are office-wide in v1; per-doctor variant weighting defers.
- **Auto-apply winning variant.** User manually promotes. Auto-promote + audit trail is a follow-up.
- **Advisory edit-in-place.** Output is read-only in v1. Direct editing (e.g. Alexa rewriting the Exec Summary) defers.
- **Historical advisory diff.** Showing the diff between today's advisory and last month's advisory for the same practice defers.

---

## 9. Top 3 risks

### Risk 1 — Scoring heuristics calibrate poorly on limited data
**Likelihood:** High. **Impact:** Medium.
The six fixtures we have are all SMILE NM / Cascade variants. Cut-offs in §5 are literature-anchored (production $/hr from PRD-V4 §8.6, NP access from intake ratios) but not statistically validated on a larger cohort. A practice whose "real" template scores 9/10 might come out 5/10 because its block mix differs from the fixtures we tuned against.
**Mitigation.** (a) Ship the raw signals alongside the score so Alexa can see why; (b) gold-test the rubric on all 6 fixtures — no fixture may score below 6 in any axis on the golden path; (c) add a per-office score-override field in Sprint 6 if practices push back; (d) keep the rubric in a single file (`scoring.ts`) for easy iteration.

### Risk 2 — Three-variant UI bloats the canvas and confuses the user
**Likelihood:** Medium. **Impact:** Medium.
Alexa and Megan today see one canvas. Suddenly they get three cards side-by-side plus a recommendation. If the cards are visually noisy or the recommendation is unhelpful, they'll skip straight to the single-generate button and the feature ships dead.
**Mitigation.** (a) Variants live in a dedicated tab — main canvas unchanged by default; (b) recommendation is one sentence with the deciding intake field quoted back (makes it legible); (c) side-by-side cards at ≥ 1440 px, vertical stack below — scales with viewport; (d) add a Sprint 5 demo step with Alexa + Megan before freeze; (e) if user test at freeze is negative, ship single-variant plus recommendation-only (no side-by-side comparison) and defer comparison UI to Sprint 6.

### Risk 3 — Intake form length overwhelms the onboarding flow
**Likelihood:** Medium. **Impact:** High.
Going from 4 tabs to 8 is a 2× increase. If Alexa has to fill 37 fields per new practice and she onboards 4-6/week, that's 150-200 fields a week of data entry. Form-fatigue risk.
**Mitigation.** (a) Narrative fields (Issues, Constraints) accept free text — no forced structure; (b) Completeness gate at 80% — practices can ship with incomplete intake and upgrade later; (c) "Save draft" and localStorage autosave (already shipped) keep state across sessions; (d) Default sensible values for every field (e.g. perio demand = "moderate") so Alexa only edits what differs; (e) Sprint 6 backfill tool to migrate existing offices in bulk using smart defaults from observed templates.

---

## 10. Definition of Done

Sprint 5 ships when **every** checkbox below is observable on the Coolify staging deployment behind `CST_ADVISORY_ENABLED=true`:

- [ ] `Office.intakeGoals` and `Office.intakeConstraints` JSON columns live; migration `20260422000000_intake_v2` applied on staging
- [ ] Office creation wizard has 8 tabs (1. Practice · 2. Providers · 3. Goals · 4. Visit Mix · 5. Hygiene · 6. Constraints · 7. Issues · 8. Rules) — all 19 MISSING fields captured, all 9 PARTIAL fields elevated
- [ ] Intake completeness badge renders on office header; Generate button gated at < 80%
- [ ] `TemplateAdvisory` Prisma model + migration shipped; one row per generate
- [ ] `scoreTemplate()` function returns deterministic `TemplateScore` for all 6 golden fixtures; unit tests green
- [ ] 6-axis score bar visualisation renders at top of Advisory panel with band colours
- [ ] `composeAdvisory()` emits 6-section `AdvisoryDocument` with executive summary, block rationale per day, risks translated to plain English, KPIs list, and review timeline
- [ ] Advisory tab shipped in the right rail; sections collapsible; Download .md button works
- [ ] "Generate 3 Variants" split button shipped; three-variant run produces Growth / Access / Balanced
- [ ] VariantComparison UI renders three cards at ≥ 1440 px with per-variant score + tradeoffs + Open-in-canvas button
- [ ] Recommendation banner emits one sentence naming the winning variant and the deciding intake field
- [ ] Review Plan renders Day 30 / 60 / 90 KPIs + triggers; included in Markdown export
- [ ] Markdown export file downloads with format `{officeName}-advisory-{YYYY-MM-DD}.md` and contains all 8 sections + scoring + review plan
- [ ] "Copy as prompt" button copies the full docx-style user prompt to clipboard
- [ ] Print view (`/offices/[id]/print`) includes Advisory sections alongside grid
- [ ] `npm run test` green; new unit tests for scoring, variants, compose, review-plan — coverage ≥ 85% on new modules
- [ ] `npm run lint --max-warnings=0` green
- [ ] `npx tsc --noEmit` exit 0
- [ ] 4 new Playwright flows green: intake-wizard-happy-path · advisory-generate · variants-compare · md-download
- [ ] 6 golden fixtures still regenerate byte-identically under default policy; advisory output is deterministic seed-stable
- [ ] All 14 stories (US-5.1 through US-5.14) demoed live at the 2026-05-05 review
- [ ] `CHANGES.md` updated with Sprint 5 section
- [ ] Sprint 5 PR body tagged with `Feature: A-E` and `Gap: row-N` traceability
- [ ] Live demo: Alexa onboarded a new office from scratch in < 15 minutes, generated 3 variants, downloaded the advisory Markdown, and read it back in < 5 minutes of eyes-on time

---

## 11. Conflicts with existing spec

The docx is **additive** to PRD-V4 and the Bible. Three alignment notes — none are conflicts, but they deserve a call-out so future sprints don't re-open settled decisions:

### 11.1 Docx "Growth / Access / Balanced" ≠ PRD-V4 "Production Policy"
PRD-V4 §4.7 defines 4 production policies (Jameson / Levin / Farran / Custom). The docx defines 3 variants. These are **different concepts**: the PRD policies are a morning-load shape rule; the docx variants are a priority-weighting vector (production vs access vs emergency vs hygiene). Sprint 5 treats variants as a **composition on top of policies** — Growth picks Farran, Access picks Jameson, Balanced picks Levin. No conflict; the concepts stack cleanly.

### 11.2 Docx "1-10 score on 6 axes" ≠ PRD-V4 FR-20 "Quality score"
PRD-V4 FR-20 specifies a `quality-score` 0-100 per day / week / office. The docx asks for six 1-10 axes. These are **different granularities**. Sprint 5 ships the 6-axis rubric from the docx. The PRD-V4 FR-20 0-100 score can be derived later as a weighted sum of the 6 axes (overall = round(axes.avg × 10)); this happens naturally in `TemplateScore.overall`. No conflict; the 0-100 is a projection of the 6-axis model.

### 11.3 Docx "30/60/90 review plan" ≠ Bible §4.4 "Policy switching"
The Bible discusses switching production policies mid-life; the docx's review plan is a KPI cadence. These don't overlap. The review plan may **recommend** a policy switch as a Day-60 revision trigger, but the switch itself still goes through the Bible §4.4 re-validation flow. No conflict; the review plan is one input into the switch decision, not a replacement for it.

---

*End of Sprint 5 Plan v1.0. Driven by [schedule-prompt.txt](C:\Users\ScottGuest\Documents\Workspaces\sga\.tmp\schedule-prompt.txt) (March 2026). Supersedes nothing — additive to [SPRINT-PLAN.md](C:\Users\ScottGuest\Documents\Workspaces\personal\tools\cst-designer\.cst-rebuild-v3\sprint-plan\SPRINT-PLAN.md).*
