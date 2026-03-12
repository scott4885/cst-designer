# Schedule Template Designer — Sprint 17 Brief
## Doctor Flow Engine + Stagger Optimizer + Hygiene Exam Windows + Mix-to-Prescription

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

The core challenge Alexa and Megan face is **timing and sequencing** — specifically:
1. How to stagger a doctor across multiple operatories so there's no idle time
2. When the doctor can step out for hygiene exams without disrupting operative flow
3. Whether the procedure mix in the template matches the doctor's actual case mix

This sprint builds a **Doctor Flow View** — a new way to look at the same schedule data
that shows the doctor's minute-by-minute movement across operatories and flags where
hygiene exams fit. The existing block grid remains the edit surface; this is the
validation/planning surface.

Both views must coexist — accessible via tabs on the Template Builder page.

---

## Task 1: Doctor Flow View

A horizontal timeline showing the doctor's minute-by-minute location and activity.

Route: New tab "Flow View" alongside existing "Block Grid" tab in the Template Builder.

### Visual Layout

```
TIME     OP 1                    OP 2                    HYGIENE EXAMS
8:00 ▓▓▓ Crown Prep [D-time] ▓▓▓ [setup]
8:30 ░░░ Crown Prep [A-time] ░░░ Composite [D-time] ▓▓▓   ← exam window opens
8:50                             Composite [A-time] ░░░   ✦ Hyg 1 ready 9:05
9:00 ▓▓▓ Composite  [D-time] ▓▓▓                         ← doctor free for exam
9:05                                                       ✅ EXAM FITS HERE
```

### Implementation

**`src/lib/engine/doctor-flow.ts`**

```typescript
export function buildDoctorFlow(
  providerSlots: Slot[],        // the provider's scheduled blocks for the day
  blockTypes: BlockType[],      // to get D/A/H time ratios per block
  staggerOffsetMin: number,     // from provider config
  operatoryCount: number,       // from provider config
  startTime: string,            // "08:00"
  increment: number             // 10 or 15 min
): DoctorFlowResult
```

```typescript
interface DoctorFlowSegment {
  startMin: number          // minutes from day start
  endMin: number
  operatory: number         // 0-indexed
  blockTypeName: string
  phase: 'D' | 'A' | 'transition' | 'empty'
  durationMin: number
}

interface DoctorFlowResult {
  segments: DoctorFlowSegment[]
  examWindows: ExamWindow[]      // gaps where doctor is available
  conflicts: FlowConflict[]      // moments where doctor needed in 2 places
  doctorUtilization: number      // % of day the doctor is in D-time
  aTimeGaps: TimeRange[]         // windows where doctor is free
}
```

**Logic:**
- Expand each slot into D-time + A-time segments using the block type's D/A ratio
- Assign segments to operatories based on stagger offset
- Find gaps: time ranges where doctor is in A-time in all ops simultaneously
- Flag conflicts: time ranges where D-time overlaps across ops
- Mark exam windows: gaps ≥ 10 min where the doctor can step out

**`FlowTimeline` component** (`src/components/FlowTimeline.tsx`)
- Horizontal timeline, Y-axis = operatories, X-axis = time
- Color coding:
  - Dark blue = D-time (doctor occupied, focused procedure)
  - Light blue = A-time (assistant working, doctor can step away)
  - Green outline = exam window (≥10 min gap, fits hygiene exam)
  - Red = conflict (doctor needed in 2 ops simultaneously)
  - Grey = empty/setup
- Hygiene exam markers: orange diamonds at "patient ready" times
- Tooltip on hover: block name, phase, duration, production amount
- Legend at bottom

**Access:** "Flow View" tab in Template Builder, same day selector applies.

---

## Task 2: Stagger Optimizer

Given the list of procedures to schedule and the operatory count, compute the optimal
sequence that minimizes doctor idle time and maximizes hygiene exam alignment.

**`src/lib/engine/stagger-optimizer.ts`**

```typescript
export function optimizeStagger(
  procedures: ProcedureToSchedule[],    // { blockTypeId, durationMin, dRatio, aRatio }
  operatoryCount: number,
  staggerOffsetMin: number,
  hygienistCount: number,
  hygExamIntervalMin: number            // how often hygiene needs an exam (default 50)
): StaggerOptimizationResult

interface StaggerOptimizationResult {
  sequence: ProcedureToSchedule[]       // reordered for optimal flow
  projectedFlow: DoctorFlowResult       // what the flow looks like with this sequence
  examsCovered: number                  // hygiene exams that fit cleanly
  doctorIdleMinutes: number             // total idle time
  improvementVsPrevious: number | null  // % improvement if replacing existing sequence
  explanation: string[]                 // ["Crown Prep first — 60min D-time creates ideal stagger"]
}
```

**Algorithm:**
1. Sort procedures by D-time descending (longest D-time first — creates the best stagger gaps)
2. Alternate between operatories using stagger offset
3. Score each arrangement: idle time + exam coverage
4. Greedy hill-climb: try swapping adjacent procedures if it reduces score

**UI: "Optimize Flow" button** in Quick Actions toolbar
- Shows a preview: "Current: 3/5 exams fit, 22 min idle. Optimized: 5/5 exams fit, 8 min idle"
- "Apply Optimized Sequence" button — reorders the blocks in the schedule

---

## Task 3: Hygiene Exam Window Finder

For each hygienist's schedule, calculate when the doctor needs to be available for exams
and overlay those on the doctor flow.

**`src/lib/engine/hygiene-exam-finder.ts`**

```typescript
export function findHygieneExamWindows(
  hygienistSlots: Slot[],
  blockTypes: BlockType[],
  examOffsetMin: number,        // default 45 — exam happens ~45min into appointment
  examDurationMin: number,      // default 10
  startTime: string
): HygieneExamRequest[]

interface HygieneExamRequest {
  hygienistId: string
  requestedStartMin: number     // when exam is needed (appointment start + offset)
  flexMin: number               // flexibility window (±5 min)
  blockTypeName: string         // "Prophy", "NP Exam", etc.
}
```

**Scoring against doctor flow:**
For each exam request, check if it falls in a doctor exam window (A-time gap):
- ✅ `fits`: doctor is in A-time gap, exam fits cleanly
- ⚠️ `tight`: doctor finishes D-time within 5 min of exam request
- ❌ `conflict`: doctor is mid-D-time, cannot step out

**UI additions to FlowTimeline:**
- Orange diamond markers at each exam request time
- Green/amber/red color on each diamond based on fit status
- Summary panel: "Hygiene Exams: 4 fit cleanly ✅, 1 tight ⚠️, 0 conflicts ❌"
- Click a conflict → highlights which doctor block is causing it
- "Shift exam" suggestion: "Move this hygiene block 10 min later to fit exam cleanly"

---

## Task 4: Mix-to-Prescription Engine

Takes the doctor's procedure mix (% of production dollars per category) + daily goal
and calculates exactly which block types should appear in the schedule and how many.

**`src/lib/engine/mix-prescription.ts`**

```typescript
export function buildBlockPrescription(
  dailyGoal: number,
  procedureMix: Record<ProcedureCategory, number>,   // % per category summing to 100
  availableBlockTypes: BlockType[],                   // office's configured block types
  incrementMin: number
): BlockPrescription

interface BlockPrescription {
  totalGoal: number
  byCategory: CategoryPrescription[]
  blocks: BlockPrescriptionItem[]
  totalScheduledProduction: number
  gap: number                            // totalGoal - totalScheduledProduction
  coveragePercent: number
}

interface CategoryPrescription {
  category: ProcedureCategory
  targetPct: number
  targetDollars: number
  assignedBlocks: BlockPrescriptionItem[]
  actualDollars: number
  actualPct: number
}

interface BlockPrescriptionItem {
  blockTypeId: string
  blockTypeName: string
  category: ProcedureCategory
  count: number                   // how many of this block to schedule
  productionPerBlock: number
  totalProduction: number
  totalDurationMin: number
}
```

**Algorithm:**
1. For each category, compute `targetDollars = dailyGoal × (pct / 100)`
2. Find block types belonging to each category (by `ProcedureCategory` field)
3. For each category: divide targetDollars by the block's `productionAmount` → number of blocks needed (round)
4. If category has multiple block types, split proportionally
5. Return the full prescription

**UI: "Block Prescription" panel** in Template Builder
- Shown when `currentProcedureMix` or `futureProcedureMix` is set on the provider
- Table: Category | Target $ | Target Count | Scheduled | Gap
- Color: green if scheduled ≥ target, amber if 80–99%, red if <80%
- "Generate from Prescription" button: clears current schedule and generates using prescription as target
- Updates live as blocks are added/removed from the schedule

**Generator integration:**
When `futureProcedureMix` is set, the generator uses `buildBlockPrescription()` to
determine how many of each block type to place, instead of just weighted random selection.
This makes the generator genuinely prescription-driven, not just biased.

---

## Code Quality
- TypeScript strict
- `npm test` — 712 tests must still pass
- Write tests:
  - `buildDoctorFlow()`: segments assign correctly, A-time gaps identified
  - `optimizeStagger()`: longer D-time procedures sort first, idle time decreases
  - `findHygieneExamWindows()`: exam timing calculation, fit/tight/conflict classification
  - `buildBlockPrescription()`: dollar math correct, block counts round correctly, gap calculation
- Commit each task separately
- Push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- Summary per task
- Test count
- Push confirmation
