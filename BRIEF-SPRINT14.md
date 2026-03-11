# Schedule Template Designer — Sprint 14 Brief
## Analytics + Multi-Location Rollup + DPMS CSV Import + Treatment Sequences

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

This sprint is about the DSO use case — Gen4/SGA style operations with 100+ offices.
The tool needs to answer: "Across all my offices, where are the production gaps?
Which offices have great schedules? Which need work?" + streamline setup via CSV import.

---

## Task 1: Analytics Dashboard (`/analytics`)

New top-level page showing charts and metrics across all offices.

### Metrics to show:

**Org-Level Summary Cards** (top row):
- Total offices with schedules built
- Average quality score across all offices
- Offices at/above production goal (%) vs. below
- Total weekly scheduled production (sum across all offices × days)

**Charts** (use Recharts — already in package.json or install if not):
1. **Quality Score Distribution** — histogram: how many offices score 90+, 75–89, 60–74, <60
2. **Production Goal Achievement** — bar chart: % of offices meeting target75 by day of week (Mon–Fri)
3. **Procedure Mix Breakdown** — stacked bar: average procedure mix across all offices with future mix set
4. **Schedule Status** — donut: Built / Partial (some days) / Not Started

**Office League Table** (sortable):
- All offices ranked by quality score (highest first by default)
- Columns: Office Name | Quality Score | Avg Daily Production | Days Scheduled | DPMS | Actions (View, Edit)
- Sortable by any column
- Click office name → goes to that office's schedule

---

## Task 2: Multi-Location Production Rollup

A dedicated view showing production gaps at scale — the key DSO management tool.

Route: `/rollup`

### UI: Production Gap Table

Sortable table with one row per office:

| Office | Goal/Day | Mon | Tue | Wed | Thu | Fri | Weekly Total | Gap | Status |
|--------|----------|-----|-----|-----|-----|-----|-------------|-----|--------|

- **Goal/Day**: sum of all providers' daily goals
- **Mon–Fri**: scheduled production for that day (from saved template)
- **Weekly Total**: sum of Mon–Fri scheduled production
- **Gap**: Weekly Total vs. (Goal/Day × working days) — positive = over goal, negative = under
- **Status**: 🟢 At Goal / 🟡 Near / 🔴 Under / ⬜ Not Built

**Filters**: DPMS system, schedule status, gap threshold (show only offices >$X under goal)

**Export**: "Download CSV" — exports this table to CSV for Excel analysis

**Action**: click any day cell → opens that office's Template Builder for that day in a new tab

---

## Task 3: DPMS CSV Import — Procedure Mix

Allow importing a practice's current procedure mix from a DPMS production report CSV.

Support Open Dental production report format first (most common).

### Open Dental Export Format
Open Dental's "Procedure Production" report exports columns:
`ProcDate, Provider, ProcCode, Description, Qty, Fee, Production`

### Import Flow
1. "Import from DPMS Report" button in Provider Settings → Procedure Mix tab
2. File picker: accepts `.csv`
3. Parse CSV, group by ADA procedure code range → map to 8 categories
4. Calculate each category's % of total production
5. Preview: show calculated mix with "Apply as Current Mix" button
6. On apply: saves as `currentProcedureMix` for that provider

### ADA Code → Category Mapping
```
D2710–D2999, D6XXX → MAJOR_RESTORATIVE
D3XXX → ENDODONTICS
D2140–D2394 → BASIC_RESTORATIVE
D4XXX → PERIODONTICS
D01XX → NEW_PATIENT_DIAG
D0140, D9110 → EMERGENCY_ACCESS
D7XXX → ORAL_SURGERY
D5XXX → PROSTHODONTICS
```

### Parser (`src/lib/dpms-import.ts`)
```typescript
export function parseOpenDentalCSV(csvText: string): ProcedureMixImportResult
export function parseDentrixCSV(csvText: string): ProcedureMixImportResult  // stub for later
export function mapADACodeToCategory(procCode: string): ProcedureCategory
```

`ProcedureMixImportResult`:
```typescript
{
  providerName: string;
  totalProduction: number;
  mix: Record<ProcedureCategory, number>;  // % per category summing to 100
  rowCount: number;
  dateRange: { from: string; to: string };
  warnings: string[];  // e.g., "12 rows had unrecognized procedure codes"
}
```

---

## Task 4: Treatment Sequence Templates

Pre-defined appointment sequences that can be placed as a group.

### Concept
Some procedures always come in sequences:
- **Crown Sequence**: Crown Prep (visit 1) → Crown Seat (visit 2, ~2 weeks later)
- **New Patient Flow**: NP Comprehensive Exam → Treatment Plan Consult → First Restorative Visit
- **Perio Treatment**: Perio Eval → SRP (2 quads) → SRP (2 quads) → Perio Re-eval
- **Implant Series**: Implant Placement → Healing abutment → Implant Crown

A sequence template defines the TYPES of appointments and their order.
In scheduling, you can place a sequence onto a week and it pre-fills the right block types
across multiple days.

### Data Model
```prisma
model TreatmentSequence {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  isBuiltIn   Boolean  @default(false)
  stepsJson   String   @default("[]")  // array of { stepIndex, blockTypeCategory, label, durationMin, dayOffset }
  createdAt   DateTime @default(now())
}
```

`stepsJson` example for Crown Sequence:
```json
[
  { "stepIndex": 0, "label": "Crown Prep", "category": "MAJOR_RESTORATIVE", "durationMin": 90, "dayOffset": 0 },
  { "stepIndex": 1, "label": "Crown Seat", "category": "MAJOR_RESTORATIVE", "durationMin": 30, "dayOffset": 14 }
]
```

### UI
- `/sequences` page — list of built-in and custom sequences
- "Add Sequence" button — create custom sequence with step editor
- In Template Builder: "Insert Sequence" in Quick Actions toolbar
  → picks a sequence → places step 0 on the current day automatically
  → for multi-day sequences, shows a note: "Step 2 (Crown Seat) should be scheduled ~14 days out"

### Built-in sequences to seed:
1. Crown Series (2 steps)
2. New Patient Flow (3 steps)
3. Perio Treatment Series (4 steps)
4. Implant Series (3 steps)
5. Denture Series (4 steps)

---

## Code Quality
- TypeScript strict
- `npm test` — 546 tests must still pass
- Write tests: analytics metric calculation, gap table logic, CSV parser (ADA code mapping), sequence step placement
- Commit each task
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
