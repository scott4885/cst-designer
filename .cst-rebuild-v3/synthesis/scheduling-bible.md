# Scheduling Methodology Bible
**Version 1.0 — 2026-04-21**
**Status:** Draft, pending Phase-1 approval
**Supersedes:** ad-hoc rules in [pattern-catalog.ts](../../src/lib/engine/pattern-catalog.ts) and any `rock-sand-water.ts` logic currently resident in the engine.

---

## 0. How to read this document

This Bible is the **authoritative specification** for the CST Designer scheduling engine. It is written so that four downstream consumers can treat it as a contract:

1. **Backend engineers** implementing the constraint solver in `/src/lib/engine/` — read sections 2, 3, 4, 9 as mandatory requirements.
2. **UI engineers** rendering the grid, operatory columns, and block inspector — read sections 2, 5, 6, 10 for the visual vocabulary and interactions.
3. **Test authors** writing golden fixtures and anti-pattern guards — every rule in sections 3, 4, 9 is addressable as a testable assertion.
4. **Product / consulting stakeholders** reviewing policy choices — read sections 1, 4, 7, 8, 12.

**Traceability.** Every claim cites its Phase-0 research file (`research/01-rsw-methodology.md` through `research/05-existing-templates-analysis.md`) or a specific source URL captured in those files. Code references are clickable links to the current (pre-rebuild) tree. When a rule derives from a single research source, that source is the audit trail; when a rule is a synthesis across sources, the rationale names the sources and the synthesis choice made.

**Versioning.** This is v1.0. Changes must bump the version in the header, list what moved, and re-run every golden test before merge.

---

## 1. First Principles

Five axioms. Every downstream rule in this Bible traces back to one of these. If an implementation detail contradicts an axiom, the axiom wins and the detail is wrong.

### Axiom 1 — The doctor is the bottleneck resource

**Statement.** A general-practice dental day is doctor-bound, not chair-bound. Chairs, assistants, and hygienists are replicable; the doctor is a singleton per-license. The schedule must be constructed so the doctor's hands-on time is never idle while patients are ready.

**Rationale.** Every consulting source across research files 01 and 03 frames the doctor's per-hour production as the ceiling metric. The canonical anchor: "if a practice assumes the hygienist produces $1,000 per day, the dentist needs to produce $4,000 per day, which divides to $500 per hour" ([research/01-rsw-methodology.md §2](../research/01-rsw-methodology.md)). Dental Economics: "the doctor's time is typically the tightest constraint in a busy, multi-chair office" ([research/03-multi-column-coordination.md §2](../research/03-multi-column-coordination.md); Spear Education, https://www.speareducation.com/2022/10/using-a-hybrid-dental-schedule-to-increase-production).

**Research citation.** research/01 §2, research/03 §2 and §8.

### Axiom 2 — Every procedure is a three-segment structure, not a single duration

**Statement.** Every procedure template decomposes into `assistant_prefix + doctor_required + assistant_suffix`. Engine code that operates on a single "duration" scalar is wrong. The constraint solver operates on the X-segment graph (doctor-required minutes), not on appointment rectangles.

**Rationale.** Burkhart's canonical crown example: 12 ten-minute units (2 hours total), of which 3 are assistant prefix, 6 are doctor, and 3 are assistant suffix ([research/03 §2](../research/03-multi-column-coordination.md); Burkhart, https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/). MGE uses `/XXXX//` notation for a 70-minute crown prep. Dentrix surfaces X/slash in its appointment book.

**Research citation.** research/03 §2, research/04 §1.

### Axiom 3 — RSW is doctor-level, not column-level

**Statement.** Rock-Sand-Water (RSW) production targets are computed against the doctor's daily goal across all columns that doctor serves. A column's block mix is a consequence of this allocation, not an input to it.

**Rationale.** The Dental A Team frames multi-column scheduling as "Sudoku across the board" — daily R:S:W targets are at the doctor level; each column is a sub-sequence that staggers doctor-time rocks against assistant-time setup/cleanup ([research/01 §6](../research/01-rsw-methodology.md); The Dental A Team #970, https://www.thedentalateam.com/podcast/970-3-steps-to-implement-block-scheduling/). Pocket Dentistry's Jameson citation explicitly discusses doctor-level pre-blocking, not per-chair ([research/01 §1](../research/01-rsw-methodology.md)).

**Research citation.** research/01 §6, research/05 gaps 2 and 5.

### Axiom 4 — Production targets are policy choices, not constants

**Statement.** The literature documents at least three legitimate production-target policies: Jameson's 50% primary pre-block, Dentrix SMART's 75% primary, and Burkhart's 80%-by-noon. The engine must expose these as selectable per-practice policies, with sensible defaults, not hard-code one.

**Rationale.** Research file 01's §4 table enumerates six concurrent rules cited by the literature, attributed to different consultants. Research file 02 §3 restates the same divergence: Levin at 60–65%, Jameson at ~50%, Farran/Cambridge at 75%-by-lunch, Burkhart at 80%-morning ([research/02 §3](../research/02-perfect-day-scheduling.md)).

**Research citation.** research/01 §4, research/02 §3.

### Axiom 5 — The template is the contract; real-time resolution handles variance

**Statement.** A scheduling template is a recurring weekly promise. Any rule the template expresses must be machine-checkable, not lore. Day-of-week variance is first-class (not an override). Practice-model variance (1D2O, 2D3O, 1D3H) is first-class (not a parameter on a generic template). Run-time conditions (emergency walk-ins, late patients, complex procedure overruns) are handled by release rules and buffers, not by permanent schedule mutation.

**Rationale.** Research file 05's five gaps all trace to a template model that was too rigid (doctor-phase timing hard-coded, one pattern per block label, no practice-model awareness) yet simultaneously too weak (no cross-column coordination, no day-of-week roster scoping). Dentrix Magazine's "Perfect Day": "gives your team a guideline to follow and creates an environment where there is little room for error" ([research/02 §8](../research/02-perfect-day-scheduling.md); Dentrix Magazine, https://magazine.dentrix.com/scheduling-the-perfect-day/). PDA's Baird critique is also captured: rigid templates snap when reality diverges — the engine must tolerate run-time variance without discarding the template ([research/02 §1, §8](../research/02-perfect-day-scheduling.md)).

**Research citation.** research/02 §8, research/05 §Five critical gaps.

---

## 2. Canonical Data Model

All pseudo-TypeScript below is normative. A backend engineer can implement directly from it. Types are expressed in the form the engine stores; serialization format may differ.

### 2.1 The X-segment (core primitive)

Every appointment decomposes into an ordered list of 10-minute segments, each tagged with exactly one staffing code.

```typescript
// 10-minute slot staffing code
type StaffingCode =
  | 'A'   // assistant-only (pre-doctor setup OR post-doctor cleanup)
  | 'D'   // doctor hands-on (the "X" segment — the singleton resource)
  | 'H'   // hygienist-only (hygiene work; no doctor required this minute)
  | 'E'   // EFDA (expanded-function DA) performing a task that would
          // otherwise be 'D' in a non-EFDA practice. Scope-of-practice gated.
  | null; // empty / no patient / turnover padding

// The canonical appointment primitive
interface AppointmentSegments {
  readonly pattern: ReadonlyArray<StaffingCode>; // length === durationSlots
  readonly durationSlots: number;                // 10-min units
  readonly asstPreSlots: number;                 // leading A's (or E's)
  readonly doctorSlots: number;                  // contiguous D's, the X-segment
  readonly asstPostSlots: number;                // trailing A's (or E's)
}

// Invariant: asstPreSlots + doctorSlots + asstPostSlots === durationSlots
// Invariant: pattern[0..asstPreSlots-1] are all 'A' or 'E' (or 'H' for hygiene)
// Invariant: pattern[asstPreSlots..asstPreSlots+doctorSlots-1] are all 'D'
// Invariant: doctorSlots may be 0 for non-doctor blocks (pure hygiene, NON-PROD)
```

**Cross-column coordination operates on the doctor-slot projection of this structure** — see §3.3.

**Canonical 60-minute HP block** (A-D-D-D-D-A timing diagram, reproduced from research/03 §2):

```
min:   0   10   20   30   40   50   60
       |    |    |    |    |    |    |
Pattern: A   A   D    D    D    D    A   A     (8 slots @ 10 min = 80 min)
Role:   [ASST----][-----DOCTOR-----][ASST]
Phase:   Setup       Hands-on work    Cleanup
```

The 80-minute HP block currently in [pattern-catalog.ts:19-26](../../src/lib/engine/pattern-catalog.ts#L19-L26) matches this structure. Note that the 60-min crown example from research/03 uses a shorter assistant prefix; see §5 for the full atlas.

### 2.2 Procedure / BlockType

```typescript
type BlockRole = 'DOCTOR' | 'HYGIENIST' | 'BOTH' | 'OTHER';
type RsWTier = 'ROCK' | 'SAND' | 'WATER';

interface ProcedureTemplate {
  readonly id: string;                  // e.g. 'CROWN_PREP_STD'
  readonly label: string;               // human display, e.g. 'HP > $1800'
  readonly cdtCodes: ReadonlyArray<string>; // e.g. ['D2740','D2750']
  readonly role: BlockRole;
  readonly tier: RsWTier;               // Rock / Sand / Water
  readonly segments: AppointmentSegments;
  readonly rsvValueUsd: number;         // expected production
  readonly continuityRequired: boolean; // doctor cannot leave mid-procedure
                                        // (endo, surgical ext, implant)
  readonly recoveryBufferSlots: number; // 0 by default; 1 for surgical/SRP/implant
  readonly aliases: ReadonlyArray<string>;
  readonly examWindow?: ExamWindow;     // hygiene-only; see §3.5
  readonly scopeProfile?: ScopeProfile; // see §2.5 and §6
}

interface ExamWindow {
  // For hygiene blocks that embed a doctor check:
  // Express window as earliest/latest slot-index within the block when
  // the D-slot may land. Prevents exam drifting to end of appointment.
  readonly earliestSlotIndex: number;
  readonly latestSlotIndex: number;
  readonly leadSignalSlots: number;     // default 1 (10 min) — see §3.5
}
```

**Per-practice overrides.** Crown prep length is bimodal in the literature — survey average 76 ± 21 min vs. efficient-practice models at 20 or 30 min ([research/04 §2](../research/04-time-blocking-mechanics.md)). The engine must support a per-practice `ProcedureTemplateOverride` that replaces `segments` without replacing the procedure identity:

```typescript
interface ProcedureTemplateOverride {
  readonly practiceId: string;
  readonly procedureId: string;
  readonly segments: AppointmentSegments;
  readonly rationale: string;           // audit trail: 'CEREC same-visit model'
}
```

### 2.3 Provider roles (Doctor, Hygienist, Assistant, EFDA)

```typescript
type ProviderKind = 'DOCTOR' | 'HYGIENIST' | 'ASSISTANT' | 'EFDA';

interface Provider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly displayName: string;
  // Day-of-week scoped shifts — see §7
  readonly weeklySchedule: ReadonlyMap<Weekday, ShiftDefinition | null>;
  readonly assignedOperatoryIds: ReadonlyArray<string>;
}

type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

interface ShiftDefinition {
  readonly startHHmm: string;           // "07:00"
  readonly endHHmm: string;             // "16:00"
  readonly lunchStartHHmm: string | null;
  readonly lunchDurationMin: number | null;
}
```

**Note on scope.** `EFDA` is a distinct `ProviderKind` because in California (RDAEF), Ohio, and similar states, an EFDA may perform tasks that in Texas would require the doctor. This changes which staffing codes are valid inside a procedure template. See §6 (Assistant scope) in research/03 and §8 below.

### 2.4 Operatory

```typescript
interface Operatory {
  readonly id: string;
  readonly label: string;               // 'OP1', 'OP8', 'HYG-1'
  readonly kind: 'RESTORATIVE' | 'HYGIENE' | 'FLEX';
  readonly assignedProviderIds: ReadonlyArray<string>; // may include >1
}
```

### 2.5 Practice model enumeration

```typescript
// Encodes "N doctor(s), M operatories" and hygiene layout
type PracticeModelCode =
  | '1D1O' | '1D2O' | '1D3O' | '1D4O'   // single doctor, N ops
  | '2D3O' | '2D4O' | '2D5O' | '2D6O'   // two doctors, N ops
  | '1D2H' | '1D3H' | '1D4H'            // hygiene-column counts
  | `${number}D${number}O_${number}H`;  // escape hatch for hybrids

interface PracticeModel {
  readonly code: PracticeModelCode;
  readonly maxConcurrentDoctorOps: number;  // default 2
  readonly maxConcurrentHygieneCheckOps: number; // how many hygiene Xs can queue
  readonly doctorTransitionBufferMin: number; // default 0
  readonly scopeProfile: ScopeProfile;
}

interface ScopeProfile {
  readonly state: string;               // 'CA' | 'OH' | 'TX' | ...
  readonly efdaScope: EfdaScopeLevel;
  readonly assistantMayAdministerLocal: boolean;
  readonly assistantMayPlaceRestorations: boolean;
  readonly assistantMayTakeFinalImpressions: boolean;
}

type EfdaScopeLevel = 'NONE' | 'LIMITED' | 'BROAD';
// NONE: Texas-style — DA does setup/cleanup only
// LIMITED: Ohio-style — coronal polish, sealants, impressions, placing restorations
// BROAD: California RDAEF — all of the above plus final impressions and
//        cementation of permanent indirect restorations
```

**Rationale for enumerating this.** Research/05 gap 5 identified practice-model variance as a first-class concern: Smile Cascade (1 doctor, 2 ops, 3 hygienists on OP1/OP2/OP8/OP9) uses different doctor-exam flow than SMILE NM ([research/05](../research/05-existing-templates-analysis.md)). A procedure template does not know how to resolve its own D-phase placement without this context.

### 2.6 Goal hierarchy (annual → daily → per-provider)

```typescript
interface ProductionGoals {
  readonly annualUsd: number;
  readonly workingDaysPerYear: number;
  readonly workingDaysPerMonth: number;  // derived, practice-specific
  readonly hygieneDailyUsd: number;      // subtracted before doctor target
  readonly targetPolicy: ProductionTargetPolicy;
}

type ProductionTargetPolicy =
  | 'JAMESON_50_PRIMARY'   // 50% of day's $ goal pre-blocked as primary
  | 'DENTRIX_75_PRIMARY'   // 75% pre-blocked as primary
  | 'BURKHART_80_BY_NOON'  // 80% of restorative $ achieved before lunch
  | 'LEVIN_60_MORNING';    // 60-65% morning major production

interface DerivedDailyTargets {
  readonly totalDailyUsd: number;        // annual / workingDays
  readonly hygieneDailyUsd: number;
  readonly doctorDailyUsd: number;       // total − hygiene
  readonly perWeekdayDoctorUsd: ReadonlyMap<Weekday, number>; // Friday may differ
}
```

**Canonical worked example, from research/02 §2** ([research/02](../research/02-perfect-day-scheduling.md); MGE, https://www.mgeonline.com/2023/designing-the-ideal-schedule-for-your-dental-practice-part-1/):

> $100,000 monthly goal ÷ 17 working days = $5,900 daily → minus $1,500 hygiene = $4,400 doctor-production target.

The engine's goal-derivation formula must reproduce this example exactly as a smoke test.

---

## 3. Multi-Column Coordination Rules

### 3.1 The doctor-as-bottleneck invariant

**Rule (R-3.1).** For every minute `t` of the scheduled day and every doctor `d`, the number of scheduled `D`-slot segments on `d` at minute `t` must be ≤ `PracticeModel.maxConcurrentDoctorOps` (default 2).

**Detection.** Walk the minute-indexed projection of all appointments assigned to `d`. Count concurrent `D` segments. If > `maxConcurrentDoctorOps` at any minute, the schedule is invalid.

**Test fixture.** Given 3 HP blocks starting at 08:00, 08:00, 08:00 on the same doctor with `maxConcurrentDoctorOps=2`: expect validation failure with rule code `R-3.1`.

**Research citation.** research/03 §3 ("Time units dedicated to a provider (X) can't be booked in more than two appointments at a time" — Dentrix Magazine).

### 3.2 Max-concurrent-doctor-ops (default 2, configurable)

**Rule (R-3.2).** `maxConcurrentDoctorOps` is 2 by default. Configurable 1–4. Values ≥ 3 require `ScopeProfile.efdaScope !== 'NONE'` AND at least one `EFDA` provider on staff. Values of 4 require `efdaScope === 'BROAD'`.

**Rationale.** Research/03 §4: 3-op is "2 primary + 1 flex," 4-op is "DSO / high-volume, hard ceiling" requiring EFDAs ([research/03](../research/03-multi-column-coordination.md)).

**Detection.** Config validation at practice save-time. Attempting `max=4` without EFDA scope fails with rule code `R-3.2`.

### 3.3 Cross-column X-segment non-overlap

**Rule (R-3.3).** Two X-segments (doctor-required slots) on the same doctor may overlap in time if and only if the total concurrent count does not exceed `maxConcurrentDoctorOps`. **Assistant (`A`/`E`) and hygienist (`H`) segments across columns are unconstrained and may overlap freely.**

**Why this is in its own rule.** Research/03 §3 is explicit: "The scheduler's constraint solver must operate on the X-segment graph, not the full appointment rectangles. Two appointment rectangles can overlap; two X-segments on the same doctor cannot. This is the bug we keep shipping" ([research/03 §3](../research/03-multi-column-coordination.md)). This is the primary engine contract.

**Test fixture.** Two crown-prep appointment rectangles at `OP1` and `OP2` fully overlap in wall-clock time but their `D` sub-segments are staggered 20 min apart → valid. The same two rectangles with `D` sub-segments starting at the same minute → invalid.

### 3.4 Zigzag pattern for 2-op doctors

**Rule (R-3.4).** When the engine auto-places a second appointment on the same doctor in a concurrent op, the second appointment's start time offset from the first is `first.asstPreSlots + first.doctorSlots - second.asstPreSlots` (in 10-min units), clamped to ≥ `first.asstPreSlots`.

**Canonical timing diagram** (from research/03 §3):

```
time  00   10   20   30   40   50   60   70   80   90  100  110  120
      |    |    |    |    |    |    |    |    |    |    |    |    |
Op 1: A    D    D    D    D    A                                         Crown #1
Op 2:            A   D    D    D    D    A                               Crown #2 (stagger at min 20)
Op 1:                                A    D    D    D    D    A          Crown #3 (Op1 next patient)
Op 2:                                              A    D    D    D D A  Crown #4

Doctor idle OP1  OP1  OP2  OP2  OP2  OP1  OP1  OP1  OP2  OP2  OP2
```

The stagger offset equals the assistant-prefix length of Op 2 (typically 10–20 min). Op 2's `A` prefix overlaps Op 1's first `D`; the doctor finishes Op 1's last `D` and walks into Op 2's first `D`.

**Research citation.** research/03 §3, Dentrix Magazine ("the doctor could anesthetize a patient in one operatory and while waiting for that patient to get numb, they can work on another patient").

### 3.5 Hygiene exam windows (middle 30 min, 5-min lead signal)

**Rule (R-3.5a).** Every `RC_PM`, `PM_GING`, `NP_HYG`, and similar recall-class block has an `ExamWindow`. The embedded `D`-slot must land within `[earliestSlotIndex, latestSlotIndex]`. Default for a 6-slot (60-min) hygiene recall: `earliestSlotIndex=1`, `latestSlotIndex=4` (i.e., the middle 30 minutes, minutes 10–50 of the block).

**Rule (R-3.5b).** The UI must surface a "doctor needed in N min" indicator, where N = `leadSignalSlots × 10`, default 5 min (half of one slot, so the indicator fires halfway through the slot preceding the `D` slot).

**Rule (R-3.5c).** The hygiene `D`-slot is subject to R-3.1 / R-3.3 along with restorative `D`-slots — the same doctor cannot exam two hygienists at the same minute unless `maxConcurrentDoctorOps ≥ 2`.

**Canonical timing diagram** (from research/03 §5):

```
time  00   10   20   30   40   50   60   70   80   90
      |    |    |    |    |    |    |    |    |    |
Op 1: A    D    D    D    D    A                        Crown prep
Op 2:            A   D    D    D    D    A              Crown prep (staggered)
Hyg-1: H   H    H    H    H    D    H                   Prophy with exam at min 50
                                 ^
                            doctor check (1 D unit, ~5 min rendered as 10)
```

**Why "middle 30 min" of a 60-min block.** RDH Magazine: "The optimal window for doctor exams occurs during the middle 30 minutes of hygiene appointments… a patient scheduled at 8 a.m. should ideally see the doctor between 8:15-8:45 a.m." ([research/03 §5](../research/03-multi-column-coordination.md); RDH Magazine, https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check).

**Test fixture.** 60-min recall block with embedded `D` at slot-index 5 (final slot): rule `R-3.5a` fails (outside window). Same block with `D` at slot-index 2: passes.

### 3.6 `continuityRequired` flag (endo, surgical ext, implant)

**Rule (R-3.6).** When `ProcedureTemplate.continuityRequired === true`, the engine refuses to stagger a second doctor appointment on the same doctor during that procedure's `D`-segment. Effectively, `maxConcurrentDoctorOps` temporarily drops to 1 for the duration of the continuity-required X-segment.

**Rationale.** Research/03 §9.4: "two crown preps at once is fine. Two molar endos at once is not — each demands continuous doctor attention." Safety Net Dental Clinic Manual: "as each dentist works out of two dental chairs for optimal productivity, it is important that two complex procedures not be scheduled concurrently."

**Defaults.** `continuityRequired=true` for: endo (molar and anterior), surgical extractions, implant placement, IV sedation cases, any case with procedure length > 90 min outside CEREC/same-day workflows.

**Test fixture.** Two molar-endo templates scheduled on the same doctor with any overlap → invalid with rule code `R-3.6`, even if `maxConcurrentDoctorOps=2`.

---

## 4. Production-Target Policies

The engine supports these as selectable policies per practice. None is hard-coded as "the rule." Jameson-50 is the conservative default; Dentrix-75 is the default for practices self-identifying as high-production; Burkhart-80-by-noon is the default for DSO or two-shift practices. Users may switch, subject to re-validation.

### 4.1 Policy A — Jameson 50% pre-block primary

**Rule.** At least 50% of each day's doctor-daily-goal ($) must be pre-blocked as `tier === 'ROCK'` (primary) blocks before the first sand or water block is placed.

**Source.** Cathy Jameson via Dentrix Magazine: "pre-block for approximately half of the daily goal with primary procedures" ([research/01 §2, §4](../research/01-rsw-methodology.md)).

**Default for.** Start-ups, practices recovering from schedule chaos, practices with fee-schedule uncertainty.

### 4.2 Policy B — Dentrix SMART 75% primary

**Rule.** At least 75% of each day's doctor-daily-goal ($) must be pre-blocked as `tier === 'ROCK'` before sand/water placement. Pre-blocks remain reserved until 24 hours before the appointment date.

**Source.** Dentrix Work SMART system: "pre-block your schedule to meet at least 75% of your goal with primary care or blocks which are all high production procedures" ([research/01 §4](../research/01-rsw-methodology.md); https://magazine.dentrix.com/the-work-smart-scheduling-system/).

**Default for.** Mature practices with consistent case-acceptance rates.

### 4.3 Policy C — Burkhart 80% by noon

**Rule.** 80% of each day's restorative doctor-daily-goal ($) must be scheduled in the pre-lunch segment of the day (defined as any minute `t < lunchStartHHmm`). This is an achievement-by-lunch rule in dollars, not a slot-fill rule — see research/02 §3.

**Source.** Burkhart Dental zone scheduling: "80% of your restorative production goal is met in the morning, with the remaining 20% in the afternoon" ([research/01 §3](../research/01-rsw-methodology.md); https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/).

**Default for.** DSO / high-volume practices, multi-shift offices, practices with strict case-acceptance-by-lunch expectations.

### 4.4 Default recommendation + per-practice selection

**Engine default.** `JAMESON_50_PRIMARY` unless the practice has logged >90 days of production data at `doctorDailyUsd >= 4400` (the MGE anchor), in which case the recommendation escalates to `DENTRIX_75_PRIMARY`.

**Switching.** Changing policies triggers full re-validation of the active template and warns the user of any day that violates the new rule.

**Policy composition.** The four policies are not mutually exclusive. A practice may run `DENTRIX_75_PRIMARY` for the slot-filling math AND `BURKHART_80_BY_NOON` for the daily shape check. The engine treats them as composable constraints — a template must satisfy every active policy.

---

## 5. Block Pattern Atlas

This section replaces the single-pattern lookup in [pattern-catalog.ts:19-91](../../src/lib/engine/pattern-catalog.ts#L19-L91). Every pattern here is a *seed*; the `MultiColumnCoordinator` (§3) may deviate when cross-column X-segment placement demands it.

The nine canonical patterns reflect the 245 blocks observed across the six SMILE NM and Smile Cascade templates ([research/05](../research/05-existing-templates-analysis.md)), expanded with variant rows the literature requires but the templates did not capture.

### 5.1 HP — High Production (doctor)

- **Label:** `HP > $1800`
- **Aliases:** HIGH PRODUCTION, HP>$1800
- **Role:** DOCTOR
- **RSW tier:** ROCK
- **Default length:** 80 min (8 slots)
- **X-segment template:** `A-A-D-D-D-D-A-A`
- **Pattern-length variants:** 60 min (`A-D-D-D-D-A`), 100 min (`A-A-D-D-D-D-D-A-A-A`), 120 min (`A-A-D-D-D-D-D-D-A-A-A-A`)
- **Continuity required:** false for standard crown; true for molar endo / implant / full-mouth cases
- **Observed in templates:** 37 of 245 blocks (15.1%)
- **Research citations:** research/01 §2, research/03 §2, research/04 §2, research/05 gap 3 (length variance)
- **Timing diagram:**

```
min:   0   10   20   30   40   50   60   70   80
       |   |    |    |    |    |    |    |    |
Std:   A   A    D    D    D    D    A    A               80-min crown prep
60m:   A   D    D    D    D    A                         60-min crown prep (Burkhart canonical)
100m:  A   A    D    D    D    D    D    A    A    A     long endo or multi-quad resto
```

### 5.2 MP — Medium Production (doctor)

- **Label:** `MP`
- **Aliases:** MID PRODUCTION, MEDIUM PRODUCTION, FILLING
- **Role:** DOCTOR
- **RSW tier:** SAND
- **Default length:** 40 min (4 slots)
- **X-segment template:** `A-D-D-A`
- **Variants:** 30 min (`A-D-A`), 50 min (`A-D-D-D-A`)
- **Continuity required:** false
- **Observed in templates:** 37 of 245 (15.1%)
- **Research citations:** research/01 §2, research/04 §2 (multi-surface composite 40–60 min)

### 5.3 ER — Emergency Slot (doctor)

- **Label:** `ER`
- **Aliases:** EMERGENCY, LIMITED EXAM
- **Role:** DOCTOR
- **RSW tier:** WATER
- **Default length:** 30 min (3 slots)
- **X-segment template:** `A-D-A`
- **Reservation attributes:** (see §6.5) `protectedUntilHHmm` (morning: 10:00; afternoon: 13:00), `autoReleaseTarget: 'ASAP_LIST'`
- **Observed in templates:** 38 of 245 (15.5%) — one or two per day
- **Research citations:** research/02 §7, research/04 §6

### 5.4 NON-PROD — Non-Production (doctor)

- **Label:** `NON-PROD`
- **Aliases:** NONPROD, NON PROD
- **Role:** DOCTOR
- **RSW tier:** WATER
- **Default length:** 30 min (3 slots) — also supports 10 / 20 / 60 / 90 min variants
- **X-segment template:** `A-A-A` (no doctor-required segment)
- **Used for:** morning huddle (3 slots = 30 min, but typically 10–15 min actual), afternoon review, staff meetings, admin, lunch overrun recovery, scheduled open buffers
- **Observed in templates:** 25 of 245 (10.2%)
- **Research citations:** research/02 §5, research/04 §5

### 5.5 NP_DOC — New Patient Consultation (doctor)

- **Label:** `NP CONS`
- **Aliases:** NEW PATIENT CONSULT, NP CONSULT
- **Role:** DOCTOR
- **RSW tier:** SAND (can be ROCK if same-day case acceptance expected)
- **Default length:** 40 min (4 slots); 60 min variant for comprehensive exam
- **X-segment template:** `A-D-D-A` (std) or `A-A-D-D-D-A` (comprehensive)
- **Placement preference:** first slot AM or first slot post-lunch (research/02 §6)
- **Observed in templates:** 6 of 245 (2.4%)
- **Research citations:** research/02 §6, research/04 §2 (NP 60–90 min)

### 5.6 NP_HYG — New Patient Hygiene (hygienist + doctor check)

- **Label:** `NP > $300`
- **Aliases:** NEW PATIENT, NP, HYG NP
- **Role:** HYGIENIST
- **RSW tier:** ROCK (hygiene-tier)
- **Default length:** 90 min (9 slots)
- **X-segment template:** `H-H-H-H-H-D-D-D-H` (D cluster in middle-to-late)
- **Exam window:** `earliestSlotIndex=4, latestSlotIndex=7` (min 40–80 of a 90-min block)
- **Cross-column constraint:** when multiple NP_HYG blocks run concurrently (research/05 gap 2), the D-clusters must stagger per R-3.3
- **Observed in templates:** 8 of 245 (3.3%)
- **Research citations:** research/01 §5, research/03 §5, research/05 gap 2

### 5.7 PM/GING — Prophy / Gingivitis (hygienist)

- **Label:** `PM/GING > $150`
- **Aliases:** PROPHY, PROPHY/GINGIVITIS, GINGIVITIS
- **Role:** HYGIENIST
- **RSW tier:** WATER (hygiene-tier, healthy-adult prophy)
- **Default length:** 60 min (6 slots)
- **X-segment template:** `H-H-H-H-H-H` (no embedded D when patient is not on recall due)
- **Variant:** with embedded exam, use `RC_PM` instead
- **Observed in templates:** 23 of 245 (9.4%)
- **Research citations:** research/01 §5 (Burkhart classifies healthy-adult prophy as hygiene "water"), research/04 §2

### 5.8 RC/PM — Recare / Periodontal Maintenance (hygienist + exam)

- **Label:** `RC/PM > $130`
- **Aliases:** RECALL, RC/PM, RECARE
- **Role:** HYGIENIST
- **RSW tier:** WATER (hygiene-tier)
- **Default length:** 60 min (6 slots)
- **X-segment template:** **VARIABLE** — seed `H-D-H-H-H-H` but D position is resolved at placement time by the MultiColumnCoordinator (research/05 gap 1)
- **Exam window:** `earliestSlotIndex=1, latestSlotIndex=4` — middle 30 min
- **Observed in templates:** 62 of 245 (25.3%) — the single most common block
- **Research citations:** research/03 §5, research/05 gap 1
- **Variant:** D4910 periodontal maintenance uses same pattern; only the label and fee differ

### 5.9 SRP — Scaling and Root Planing (hygienist)

- **Label:** `SRP > $400`
- **Aliases:** SCALING, SRP, PERIO MAINTENANCE
- **Role:** HYGIENIST
- **RSW tier:** ROCK (hygiene-tier)
- **Default length:** 60 min per quadrant (6 slots)
- **X-segment template:** `H-H-H-H-H-H` (hygiene-only; no embedded doctor exam by default)
- **Variants:** 45-min short (`H-H-H-H-H`), 90-min complex (`H-H-H-H-H-H-H-H-H`)
- **Placement preference:** mornings (research/01 §5)
- **Daily cap:** ~2 per hygienist per day (research/01 §5)
- **Recovery buffer:** +10 min recommended after each quadrant
- **Observed in templates:** 9 of 245 (3.7%)
- **Research citations:** research/01 §5, research/04 §2 (SRP per-quadrant 45–90 min)

### 5.10 Additional patterns the atlas exposes (required by literature, not in templates)

These were absent from the six analyzed templates but the Bible mandates their support; they are needed for the engine to produce valid schedules for non-SMILE practices.

- **HP_EFDA** — HP block where the suffix `A` segments are `E` (EFDA placing/finishing the restoration) → shortens `D` requirement; default 60 min total but only 20 min D (`A-E-D-D-E-E` equivalent). Enables the 3-ops and 4-ops models. Research/03 §6.
- **NP_HYG_CHILD** — pediatric NP: 60 min, `H-H-H-D-H-H` (exam earlier). Research/04 §2 (child prophy + exam).
- **DEL_CROWN** — crown seat / cementation: 30 min, `A-D-A`. Research/04 §2 (crown seat 20–45 min).
- **DEL_DENT** — denture delivery: 60 min, `A-A-D-D-A-A`. Research/04 §2.
- **DEL_NG** — night guard delivery: 20 min, `A-D`. Research/04 §2.
- **HUDDLE** — morning huddle: 15 min, all columns, roster-wide `null` / `NON-PROD`. Research/02 §5.
- **AFTER_REVIEW** — afternoon review: 10 min, roster-wide. Research/04 §5.
- **LUNCH_WHOLE** — whole-office lunch: 60 min, all columns. Research/04 §4.
- **LUNCH_STAGGER** — staggered lunch: per-provider, overlaps supported. Research/04 §4.

---

## 6. Time-Grid Conventions

### 6.1 10-minute slot rationale

The engine's time primitive is a 10-minute slot. 5-min and 15-min grids are explicitly **not supported** at the schema level. 10 min is anchored to the 60-minute hygiene recall (six slots with clean A-D-A-A-A-A room for an embedded exam) and divides cleanly into canonical procedure lengths (20-20-20 crown prep, 40-min filling, 60-min prophy, 90-min NP).

**Sources.** Open Dental manual default ([research/04 §1](../research/04-time-blocking-mechanics.md)), Dentrix default ([research/04 §1](../research/04-time-blocking-mechanics.md)), Dental Economics cost quantification ("15-minute increments cost the practice seven days of production time every year… potentially worth $21,000 in lost revenue recovery" — research/04 §1).

**Why not insurance-driven.** CDT D-codes are procedure-based, not time-billed. 10-minute units are practice-management lore, not payer requirement ([research/04 §1](../research/04-time-blocking-mechanics.md)).

### 6.2 Daily start/end defaults

Default operating window: **07:00–18:00**. Default provider shift: **08:00–17:00** with 12:00–13:00 lunch.

The engine does NOT hard-code any of these. Each provider carries a day-of-week-scoped `ShiftDefinition` (see §2.3). The grid renders from `min(start)` to `max(end)` across all active providers for the displayed day.

**Rationale.** Research/04 §3 documents the spread: traditional 08:00–17:00, extended early (07:00 GP), extended late (19:00–20:00 at Night & Day Dental and similar), compressed 4×10 weeks. The grid must flex without config changes.

### 6.3 Lunch placement + duration

**Default:** 60-min whole-office lunch starting at 12:00.

**Supported variants** (from research/04 §4):
- 90- or 120-min lunch (triggers split-shift differential warning for CA/NY practices)
- Staggered lunches with front desk and one hygiene column remaining open
- Shorter 30-min lunch on half-days or Saturdays

**Legal note.** Durations ≥ 90 min trigger split-shift-differential flag for states with such rules (stored but not enforced by the engine — HR responsibility).

### 6.4 Morning huddle

**Default:** 15-min `HUDDLE` block ending 0 min before first patient, covering all active-column providers and administrative staff.

**Rationale.** Dental Intelligence: "Dental practices who participate daily in these morning meetings, on average, outproduce practices that don't do a morning huddle by 30%" ([research/02 §5](../research/02-perfect-day-scheduling.md); https://www.dentalintel.com/dental-morning-huddle). Research/04 §5 mandates first-class template representation.

**Rule.** If a day has active clinical providers, the engine warns (not errors) when no HUDDLE is present for that day.

### 6.5 Emergency slots — scheduled window + protected-until + auto-release

**Rule (R-6.5).** Every `ER` block has three reservation attributes:

```typescript
interface EmergencyReservation {
  readonly scheduledStartHHmm: string;    // e.g., "10:30"
  readonly scheduledEndHHmm: string;      // e.g., "11:00"
  readonly protectedUntilHHmm: string;    // e.g., "10:00" — before this time,
                                          // only ER-coded appointments may book
  readonly autoReleaseTarget: 'ASAP_LIST' | 'WALK_IN' | 'OPEN';
}
```

**Default placements:** one slot mid-morning (10:30–11:00, protected until 10:00), one slot early-afternoon (14:30–15:00, protected until 13:00). Both auto-release to the ASAP list at the protected-until time.

**Research citation.** research/02 §7, research/04 §6.

### 6.6 Recovery buffers

**Rule.** `ProcedureTemplate.recoveryBufferSlots` defaults to 0. Procedures with `continuityRequired=true` default to 1 (10 min). SRP quadrants default to 1. The buffer is an A-only suffix that is not cleared for the next appointment.

**Configurable per practice.** Efficient-scheduling practices may set all buffers to 0; conservative practices may set all rock-tier procedures to 1.

**Research citation.** research/04 §7.

---

## 7. Day-of-Week Variance

**Rule (R-7.1).** Provider rosters, operatory assignments, and production goals are **day-of-week scoped**, not practice-scoped. A template is a 7-tuple of daily specs, not a single day with overrides.

**Rationale.** Research/05 gap 4: "Kelli Parratta (one hygienist) doesn't work Friday at SMILE NM. Templates show reduced block mix and provider count on Fridays, but the catalog has no staffing-variance-by-weekday rules."

**Implications.**

- Goal distribution recomputes per weekday. If Fridays have one fewer hygienist, the hygiene daily goal drops for Fridays and the doctor target rises to absorb the difference (or the total drops).
- Column count is a function of `(weekday, practice_model, provider_roster)` — not a constant.
- Huddle, lunch, emergency-slot counts may differ per weekday. Saturday half-days may have no huddle or a truncated one.

**Canonical patterns from literature** (research/04 §10):

| Day shape | Typical provider count | Hours | Lunch | Emergency slots |
|-----------|------------------------|-------|-------|-----------------|
| Standard weekday | full roster | 08:00–17:00 | 60 min | 2 |
| Light Friday | reduced by 1 | 08:00–14:00 | 30 min | 1 |
| Half-day | reduced by 50% | 08:00–13:00 | none | 1 |
| Evening shift | 1–2 providers | 11:00–19:00 | 30 min | 1 late |
| Saturday full | reduced | 08:00–16:00 | 30 min | 1 |
| Saturday half | minimum | 08:00–13:00 | none | 0 |

**Test fixture.** A practice configured as `1D3H` Mon–Thu and `1D2H` Fri must produce a Fri template where only 2 hygiene columns are active; the goal calculator must scale `hygieneDailyUsd` by 2/3 on Fridays.

---

## 8. Practice-Model-Aware Pattern Selection

**Rule (R-8).** A block label + its procedure template does not fully determine the staffing pattern. The `MultiColumnCoordinator` consumes `(blockLabel, practiceModel, dayContext, scopeProfile)` and returns the resolved pattern. The seed patterns in §5 are defaults that the coordinator may override.

**Rationale.** Research/05 gap 5: "Smile Cascade uses 1 doctor (2 ops) + 3 hygienists in operatory layout OP1, OP2, OP8, OP9 — different from SMILE NM. The doctor's exam flow in Cascade hygiene blocks differs from SMILE NM in both timing and frequency, yet the pattern definitions don't distinguish practice-model variations."

**Resolution algorithm** (conceptual):

1. Start with the seed pattern from §5 for the given block label.
2. For hygiene-with-exam blocks (`RC_PM`, `NP_HYG`, `PM_GING` with exam): query the doctor's existing X-segment schedule for the target minute window. Choose the `D`-slot index inside the exam window that minimizes conflict.
3. For doctor blocks in 3-op or 4-op practices with EFDA scope: replace eligible `A` suffix slots with `E` slots where `scopeProfile.assistantMayPlaceRestorations` or `scopeProfile.assistantMayTakeFinalImpressions` applies.
4. For practice models with `continuityRequired` procedures concurrent: serialize them per R-3.6.
5. Validate result against all active §4 policies and §3 invariants.

**Engine implication.** The current [pattern-catalog.ts:19-91](../../src/lib/engine/pattern-catalog.ts#L19-L91) is demoted to a single-column fallback. The `MultiColumnCoordinator` is the new source of truth.

---

## 9. Anti-Patterns (things the generator must refuse)

The engine must detect and refuse the following. Each carries a detection rule expressible as a pure function over the schedule graph. Implementers must write a golden test per entry.

### AP-1. Two rocks on the same doctor, same minute, in ops the doctor can't see

**Statement.** Placing two `tier === 'ROCK'` doctor blocks with overlapping `D`-segments on the same doctor when those ops are not doctor-visible (config + layout).
**Why.** Kiera Dent: "I'm not doing two crowns back to back where I can't see it" ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** For each pair of overlapping `D`-segments on the same doctor, if both blocks have `tier='ROCK'` and any op in the pair has `operatory.doctorVisible=false`, raise `AP-1`.

### AP-2. Implant + filling in adjacent columns, overlapping

**Statement.** `continuityRequired` procedure scheduled adjacent to a non-`continuityRequired` procedure where `D`-segments overlap.
**Why.** Kiera Dent: "I'm not putting implants and fillings next door to each other" — the small procedure collapses into the large one ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** For any `ROCK` doctor block with `continuityRequired=true`, if a `SAND`-tier doctor block has overlapping `D` on the same doctor in an adjacent op, raise `AP-2`.

### AP-3. Pre-block given away earlier than policy window

**Statement.** Scheduling a non-primary appointment into a pre-blocked primary slot more than the configured days-out threshold.
**Why.** Dentrix Work SMART: "DO NOT give away pre-blocks until 24 hours ahead" ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** When converting a pre-block to a concrete appointment, if `(appointmentDate - today) > preblockReleaseWindow`, raise `AP-3`. Default window: 24 hours (configurable 24–48).

### AP-4. Jar filled with sand first

**Statement.** On a given day, `SAND + WATER` blocks exceed their policy-allowed share before `ROCK` blocks reach the policy minimum.
**Why.** Jameson's core warning ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** At template save time, for each day, run the active Production Target Policy (§4) and verify `ROCK` share meets the threshold. Raise `AP-4` if not.

### AP-5. Rock immediately after lunch with no buffer

**Statement.** A `ROCK` doctor block starting within 0 min of `lunchEndHHmm`.
**Why.** Implied across "80% of production in the morning" guidance; post-lunch re-start is historically a lateness risk ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** `rockBlock.startHHmm === lunch.endHHmm` and no intervening `NON-PROD` buffer. Raise `AP-5`. (Warning, not error.)

### AP-6. Schedule with no scheduling-hawk / owner

**Statement.** No provider or front-desk role is configured as `schedule_owner` for the practice.
**Why.** MGE + Dentrix: "one person needs to ultimately be in charge" ([research/01 §7](../research/01-rsw-methodology.md)).
**Detection.** Config-level check at save. Raise `AP-6`. (Warning.)

### AP-7. Two X-segments on same doctor, same minute, exceeding max-concurrent

**Statement.** See R-3.1. Restated here as an anti-pattern for symmetry in the guard ledger.
**Why.** Doctor-singleton invariant.
**Detection.** See R-3.1.

### AP-8. Hygiene exam at last slot of appointment

**Statement.** A hygiene block places its embedded `D`-slot at `slotIndex === durationSlots - 1`.
**Why.** Dimensions of Dental Hygiene: exam "completed in the middle of the procedure allows more time for the patient to ask questions" ([research/01 §5](../research/01-rsw-methodology.md)); forces doctor-wait and hygienist idle-time.
**Detection.** See R-3.5a.

### AP-9. Two continuity-required procedures concurrent on same doctor

**Statement.** See R-3.6.
**Why.** Molar endo, IV sedation, surgical extraction need continuous doctor attention.
**Detection.** See R-3.6.

### AP-10. Day-of-week template applying weekday roster to weekend

**Statement.** A provider with no `weeklySchedule[weekday]` entry appearing in that day's column render.
**Why.** Research/05 gap 4 (Friday staffing drop). Applies generally to any day off.
**Detection.** Schedule render-time check: no column may be assigned to a provider whose `weeklySchedule[weekday]` is null.

### AP-11. Procedure saved with only `durationMin` and no segment breakdown

**Statement.** A `ProcedureTemplate` or an inline appointment saved without a 3-segment breakdown.
**Why.** Axiom 2.
**Detection.** Schema validation — every appointment persists `asstPreSlots`, `doctorSlots`, `asstPostSlots`. Raise `AP-11`.

### AP-12. 3+ op doctor configured without EFDA scope

**Statement.** `maxConcurrentDoctorOps ≥ 3` with `scopeProfile.efdaScope === 'NONE'`.
**Why.** R-3.2.
**Detection.** See R-3.2.

### AP-13. Emergency slot with no release rule

**Statement.** An `ER` block without `protectedUntilHHmm` or without `autoReleaseTarget`.
**Why.** Research/04 §6 — unfilled ER slots waste primetime unless released.
**Detection.** Schema validation on `EmergencyReservation`.

### AP-14. NP scheduled outside recommended placement windows

**Statement.** A `NP_DOC` or `NP_HYG` block starting at any time other than first slot of day or first slot post-lunch.
**Why.** Research/02 §6 — maximises conversion and same-day case acceptance.
**Detection.** Warning (not error): if block start ≠ first AM slot and ≠ lunchEnd slot, raise `AP-14`.

### AP-15. Hard-coded single-pattern per block label

**Statement.** A block placement where the pattern came from the §5 seed without passing through the MultiColumnCoordinator.
**Why.** Research/05 gap 1 + gap 5. Doctor-phase timing varies with concurrent columns.
**Detection.** Engine-internal — every resolved pattern must carry a `resolvedBy: 'COORDINATOR' | 'SEED_FALLBACK'` tag. Raise `AP-15` if `SEED_FALLBACK` is used when `maxConcurrentDoctorOps > 1`.

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **A-segment / Assistant segment** | Portion of a procedure where the DA (not doctor) is the required resource. Coded `A`. |
| **Anti-pattern (AP)** | A schedule state the engine must refuse or warn on. Enumerated in §9. |
| **ASAP list** | A queue of patients who would take an earlier appointment if offered. Separate from the schedule template; fed by emergency-slot auto-release (R-6.5). |
| **Block** | A reserved slice of schedule time tagged with a `ProcedureTemplate`. A concrete scheduled appointment is a block made specific to a patient. |
| **Continuity required** | A flag on procedures (endo, surgical ext, implant, IV sedation) that forces the doctor to remain in the room for the entire `D`-segment, temporarily suppressing R-3.3 for that doctor. See R-3.6. |
| **Column** | The vertical lane in the schedule render corresponding to one operatory on one day. |
| **CDT code** | Current Dental Terminology code; the procedure coding system maintained by the ADA. `D2740` = porcelain/ceramic crown; `D1110` = adult prophy; etc. |
| **D-segment / Doctor segment / X-segment** | Portion of a procedure where the doctor is the required resource. Coded `D`. The scheduler's primary constrained resource. |
| **EFDA** | Expanded-Function Dental Assistant. Scope varies by state (California RDAEF, Ohio EFDA, Texas-no-blanket). `ScopeProfile.efdaScope` governs which staffing codes are legal. |
| **Exam window** | The range of slot indices inside a hygiene block where the doctor's exam may land. Default: middle 30 min of a 60-min recall. See R-3.5. |
| **HP / MP / ER / NON-PROD / NP / RC/PM / PM-GING / SRP** | Canonical block labels. See §5. |
| **Huddle** | Pre-clinic team briefing, typically 10–15 min before first patient. See §6.4. |
| **Lead signal** | The "doctor needed in N min" flag that precedes a hygiene exam. Default 5 min (one half-slot). R-3.5b. |
| **MultiColumnCoordinator** | Engine component responsible for resolving `D`-slot placements across all operatories a doctor serves, enforcing R-3.1 / R-3.3 / R-3.6. |
| **Operatory** | A physical chair / room. Each has `kind: RESTORATIVE | HYGIENE | FLEX`. |
| **Pattern** | The ordered sequence of `StaffingCode` values for a given procedure at a given duration. May be a seed (§5) or a coordinator-resolved override (§8). |
| **Policy (production target)** | A rule set governing how daily production targets translate to block mix. §4 defines four: Jameson-50, Dentrix-75, Burkhart-80-by-noon, Levin-60-morning. |
| **Practice model** | Enumeration of doctor/op/hygiene counts: `1D2O`, `2D3O`, `1D3H`, etc. See §2.5. |
| **Pre-block** | A reserved slot in the template committed to a specific tier/procedure, not yet assigned to a patient. Release rules govern when the reservation lapses. |
| **Procedure template** | A reusable specification of a procedure: label, CDT codes, role, tier, segment breakdown, rsvValueUsd, continuity, recovery buffer. §2.2. |
| **Recovery buffer** | An `A`-only suffix added after a procedure for turnover / recovery, not cleared for the next appointment. §6.6. |
| **Rock / Sand / Water** | RSW tiers. Rock = high-production (doctor hands-on, $1000+), Sand = medium-production ($200–$600), Water = no-fee-or-low-fee (deliveries, post-ops, recalls). §1 axiom 3 + §5 tier tags. |
| **Scope profile** | Per-state legal specification of what an assistant / EFDA may perform. Gates which staffing codes are legal inside procedure templates. §2.5. |
| **Seed pattern** | The default `AppointmentSegments` for a block label absent coordinator override. §5. |
| **Stagger / Zigzag** | The canonical 2-column coordination pattern where Op 2's appointment starts `asstPreSlots` minutes after Op 1, so the doctor's `D`-segments in Ops 1 and 2 do not overlap. R-3.4. |
| **Staffing code** | Single-character tag for each 10-min slot: `A`, `D`, `H`, `E`, or null. §2.1. |
| **Time-in-motion study** | An empirical measurement of actual chair time per procedure at a given practice. Jameson's essential #5. Required before any block-length override. |
| **Weekday** | One of `MON | TUE | WED | THU | FRI | SAT | SUN`. Day-of-week is first-class everywhere in the template model (§7). |

---

## 11. Research Source Register

| Bible section | Primary research file | Key source URL |
|---------------|----------------------|----------------|
| §1 Axiom 1 (doctor bottleneck) | research/01 §2, research/03 §2 | https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule |
| §1 Axiom 2 (X-segment) | research/03 §2, research/04 §1 | https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/ |
| §1 Axiom 3 (RSW doctor-level) | research/01 §6 | https://www.thedentalateam.com/podcast/970-3-steps-to-implement-block-scheduling/ |
| §1 Axiom 4 (policies) | research/01 §4, research/02 §3 | https://magazine.dentrix.com/the-work-smart-scheduling-system/ |
| §1 Axiom 5 (template-as-contract) | research/02 §8, research/05 | https://magazine.dentrix.com/scheduling-the-perfect-day/ |
| §2 Data model | research/03 §2, research/04 §1 | https://magazine.dentrix.com/how-to-maximize-provider-time-in-the-schedule/ |
| §2.6 Goal hierarchy | research/02 §2 | https://www.mgeonline.com/2023/designing-the-ideal-schedule-for-your-dental-practice-part-1/ |
| §3.1–3.4 Coordination rules | research/03 §3–§4 | https://pocketdentistry.com/12-appointment-scheduling-strategies/ |
| §3.5 Hygiene exam window | research/03 §5 | https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check |
| §3.6 Continuity required | research/03 §9.4 | https://www.dentalclinicmanual.com/4-admin/sec4-02.php |
| §4.1 Jameson 50% | research/01 §4 | https://www.dentistryiq.com/front-office/scheduling/article/16363291/universal-and-enduring-systems-of-a-dental-practice-part-1 |
| §4.2 Dentrix 75% | research/01 §4, research/02 §3 | https://magazine.dentrix.com/the-work-smart-scheduling-system/ |
| §4.3 Burkhart 80% by noon | research/01 §3 | https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/ |
| §4 Levin 60% morning | research/02 §1, §3 | https://magazine.dentrix.com/scheduling-the-perfect-day/ |
| §5 Pattern atlas | research/05 + research/04 §2 | See per-pattern citations in §5 |
| §5.8 RC/PM variance | research/05 gap 1 | https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check |
| §5 HP length variance | research/05 gap 3, research/04 §2 | https://www.dentistryiq.com/front-office/scheduling/article/16348635/the-15-minute-crown-procedure |
| §6.1 10-min grid | research/04 §1 | https://www.opendental.com/manual/timebars.html |
| §6.2 Daily hours | research/04 §3 | https://www.revenuewell.com/article/master-dental-scheduling |
| §6.3 Lunch | research/04 §4 | https://theultimatepatientexperience.com/whats-happening-with-your-dental-office-lunch-breaks/ |
| §6.4 Huddle | research/02 §5, research/04 §5 | https://www.dentalintel.com/dental-morning-huddle |
| §6.5 Emergency slots | research/02 §7, research/04 §6 | https://www.docseducation.com/blog/mastering-clock-8-proven-strategies-keep-dental-patients-time-and-schedule |
| §6.6 Recovery buffers | research/04 §7 | https://dentalsuccessnetwork.com/blog/dental-practice-20-minute-crown-prep/ |
| §7 Day-of-week | research/05 gap 4, research/04 §10 | https://www.dentistryiq.com/front-office/scheduling/article/16363540/scheduling-for-productivity-profitability-and-stress-control |
| §8 Practice-model-aware | research/05 gap 5 | https://www.apexdesignbuild.net/how-many-dental-office-operatories-should-you-have-for-max-roi/ |
| §9 AP-1, AP-2 | research/01 §7 | https://www.thedentalateam.com/podcast/970-3-steps-to-implement-block-scheduling/ |
| §9 AP-3 | research/01 §7 | https://magazine.dentrix.com/the-work-smart-scheduling-system/ |
| §9 AP-4 | research/01 §7 | https://dentalmanagementdiary.wordpress.com/tag/rocks/ |
| §9 AP-5, AP-6 | research/01 §7 | https://www.mgeonline.com/2023/designing-the-ideal-schedule-for-your-dental-practice-part-1/ |
| §9 AP-8 | research/01 §5 | https://dimensionsofdentalhygiene.com/questions/standards-for-patient-scheduling/ |

---

## 12. Open Questions for Stakeholders

Ambiguities the research literature did not resolve. These need a stakeholder decision before Phase 2 implementation freezes behavior.

**Q1.** **Default policy selection.** The Bible sets `JAMESON_50_PRIMARY` as the cold-start default. Should SMILE NM / Smile Cascade be default-switched to `DENTRIX_75_PRIMARY` given their observed production level? Research alone cannot decide — this is a practice-owner call. Defer to the CST Designer practice-onboarding flow.

**Q2.** **Crown-prep length default: 76 min survey mean or 30 min efficient-model?** Research/04 §2 cites the Dentistry IQ survey of 1,777 dentists at 76 ± 21 min vs. structured 20-/30-min models. Phase 1 must choose a ship-default. Proposed: 80 min for cold-start, surface an onboarding prompt offering "efficient 30-min override" with docs on what the practice must change to make that work.

**Q3.** **Emergency slot count on light-Friday and Saturday half-day.** Research/04 §6 recommends 1–2/day but is silent on partial-day templates. Research/05 gap 4 notes Friday staffing drops but not emergency-slot policy. Proposed: 1 emergency slot per doctor-staffed day regardless of length; 0 on hygiene-only half-days. Needs stakeholder sign-off.

**Q4.** **Doctor transition buffer default.** Split in literature (research/03 §7 — Burkhart implicit buffer vs. Dentrix no buffer). Proposed default: 0 min, allow 0–5 min configuration. Needs stakeholder confirmation that zero-buffer back-to-back D-segments are tolerable given real-world lateness.

**Q5.** **Does SMILE Cascade actually run 1D2O or 1D4O?** Research/05 gap 5 notes "OP1, OP2, OP8, OP9" but doesn't clarify whether all four are doctor ops or mixed doctor/hygiene. Phase 1 synthesis agent should re-inspect raw templates to resolve. Treated as a data question, not a rules question, but blocks §8 validation until answered.

**Q6.** **EFDA scope assumption for SMILE NM.** SMILE NM is a New Mexico practice. NM's EFDA rules differ from CA/OH/TX (research/03 §6 did not specifically cover NM). Phase 1 must confirm `ScopeProfile` for NM. Treated as a config-population question.

**Q7.** **Same-day-dentistry / case-acceptance slots.** Research/02 §6, §7 both reference the "same-day acceptance" pattern (slot freed by cancellation goes to a consult-accept patient). Not enumerated in the block atlas. Open question: is this a new block label (`SAMEDAY_ACCEPT`) or a dynamic reclassification of a released `ER` slot?

**Q8.** **Perfect-Day template style.** Per the Phase-0 brief, "Perfect Day" is contested — PDA's Baird rejects rigid X/slash. Should the engine expose a "template style" switch (Jameson-style pre-block vs. Baird-style over-allocate-hourly)? The Bible currently treats PDA's model as out-of-scope; a stakeholder may choose to elevate it.

---

*End of Scheduling Methodology Bible v1.0.*
