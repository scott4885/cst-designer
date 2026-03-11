# Schedule Template Designer — Sprint 9 Brief
## Procedure Mix Intelligence — Current vs. Future Mix

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
PRD: /home/scott/.openclaw/workspace/output/reports/procedure-mix-prd.md
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Overview

Add a Procedure Mix system to each provider. Two data inputs:
1. **Current Mix** — what the doctor produces today (% by category) → seeds initial schedule
2. **Future Mix** — what the practice wants to produce → drives the Smart Fill generator + gap analysis

This makes the generator clinically accurate instead of generically filling to a dollar goal.

---

## The 8 Procedure Categories

```typescript
export type ProcedureCategory =
  | 'MAJOR_RESTORATIVE'   // Crown, Bridge, Onlay, Veneer, Implant Crown
  | 'ENDODONTICS'          // Root Canal, Retreatment
  | 'BASIC_RESTORATIVE'    // Composites, Amalgams, Build-ups
  | 'PERIODONTICS'         // SRP, Perio Maintenance, Osseous
  | 'NEW_PATIENT_DIAG'     // Comprehensive Exam, X-rays, Consult
  | 'EMERGENCY_ACCESS'     // Limited Exam, Palliative
  | 'ORAL_SURGERY'         // Extractions, Implant Placement
  | 'PROSTHODONTICS';      // Dentures, Partials, Implant-Retained
```

Mix is stored as `{ [category]: number }` where values are percentages summing to 100.

---

## Data Model Changes

### Provider model (schema.prisma)
```prisma
currentProcedureMix  String  @default("{}")
futureProcedureMix   String  @default("{}")
```

### BlockType model (schema.prisma)
```prisma
procedureCategory  String  @default("BASIC_RESTORATIVE")
```

Apply migrations. All existing data backward compatible (empty JSON = mix not set, falls back to current Rock/Sand/Water logic).

---

## data-access.ts

Read/write `currentProcedureMix`, `futureProcedureMix` on Provider.
Read/write `procedureCategory` on BlockType.
Include in `OfficeDetail`, `CreateOfficeInput`, provider create/update functions.

---

## UI — Provider Settings (Edit Page)

Add a **"Procedure Mix"** tab in the provider card (alongside working hours).

Two sub-tabs: **Current Mix** | **Future Mix**

Each sub-tab shows:
- 8 percentage input fields (0–100, integer)
- Running total shown prominently — must equal 100 before save (live validation)
- Warning if total ≠ 100: "Total must equal 100% (currently X%)"
- "Copy Current → Future" button (copies current mix values to future mix tab)
- "Load Benchmarks" dropdown with 3 presets:

```
General Practice:   Major 25%, Endo 10%, Basic 20%, Perio 10%, NP 12%, ER 8%, Surgery 10%, Prostho 5%
Endo-Heavy:         Major 15%, Endo 35%, Basic 15%, Perio 10%, NP 10%, ER 5%, Surgery 5%, Prostho 5%
Cosmetic-Focused:   Major 40%, Endo 5%,  Basic 15%, Perio 10%, NP 15%, ER 5%, Surgery 5%, Prostho 5%
```

Only show this tab for DOCTOR role providers (hygienists don't have procedure mix).

---

## UI — Appointment Library (Block Types)

Add a **"Procedure Category"** dropdown to each block type in the appointment library:
- Dropdown with the 8 categories
- Default: auto-assign based on block label keywords (see mapping below)
- User can override

**Auto-assignment keyword mapping** (apply on block type creation if no category set):
```
Crown, Bridge, Veneer, Onlay, Inlay, Implant Crown → MAJOR_RESTORATIVE
Root Canal, Endo, RCT, Pulp → ENDODONTICS
Composite, Filling, Amalgam, Build-up, BU → BASIC_RESTORATIVE
SRP, Perio, Scaling → PERIODONTICS
New Patient, NP, Exam, Consult, Diagnostic → NEW_PATIENT_DIAG
Emergency, ER, Limited, Palliative → EMERGENCY_ACCESS
Extraction, Surgery, Implant Place, Surgical → ORAL_SURGERY
Denture, Partial, Prosth → PROSTHODONTICS
```
Case-insensitive match. If no match: default to BASIC_RESTORATIVE.

---

## Generator Integration (src/lib/engine/generator.ts)

### When futureProcedureMix IS set (and sums to ~100):

Replace the current Rock/Sand/Water priority model with category-weighted placement.

For each doctor with a future mix:

```typescript
// Calculate target block counts per category
const target = calculateCategoryTargets(doc, blockTypes, futureMix);
// target = { MAJOR_RESTORATIVE: 2, ENDODONTICS: 1, BASIC_RESTORATIVE: 2, ... }

// Place blocks by category priority (highest % first)
// For each category in descending target order:
//   - Find block types tagged to this category
//   - Place up to target[category] blocks
//   - Respect stagger, shared pool, lunch
```

`calculateCategoryTargets(provider, blockTypes, mix)`:
```typescript
function calculateCategoryTargets(
  provider: ProviderInput,
  blockTypes: BlockTypeInput[],
  mix: Record<ProcedureCategory, number>
): Record<ProcedureCategory, number> {
  const target75 = provider.dailyGoal * 0.75;
  const result: Record<ProcedureCategory, number> = {} as any;
  for (const [cat, pct] of Object.entries(mix)) {
    const catBlocks = blockTypes.filter(bt => bt.procedureCategory === cat && bt.appliesToRole === provider.role);
    if (catBlocks.length === 0) continue;
    const avgValue = catBlocks.reduce((s, b) => s + (b.minimumAmount || 0), 0) / catBlocks.length;
    const dollarTarget = target75 * (pct / 100);
    result[cat as ProcedureCategory] = avgValue > 0 ? Math.round(dollarTarget / avgValue) : 0;
  }
  return result;
}
```

Block placement: iterate categories highest-% first, place blocks until count met or no slots remain. Use shared pool tracker (from Sprint 6) to stop at combined goal.

### When futureProcedureMix is NOT set (empty or doesn't sum to ~100):
Fall back to current Rock/Sand/Water logic — NO behavior change for existing offices.

---

## Gap Analysis — Production Summary Panel

After generation, show a **"Mix Analysis"** section in the production summary panel.
Only shown when BOTH currentProcedureMix and futureProcedureMix are set.

Display as a compact table:

```
📊 Mix Gap Analysis
Category            Current  Target   Gap        Action
────────────────────────────────────────────────────────
Major Restorative    18%      35%     +17%  → Add 1 crown block/day
Endodontics          25%      20%      -5%  → Reduce 30 min/week
Basic Restorative    22%      15%      -7%  → Convert 1 composite → crown
New Patient/Diag      8%      12%      +4%  → Add 1 NP slot/day
...
```

Only show rows where gap > 3%. "Action" text is auto-generated from the gap size.
Gap color: green if within 3%, amber if 4–10%, red if >10%.

---

## Acceptance Criteria

- [ ] Provider has Current Mix and Future Mix tabs (doctors only)
- [ ] 8 category fields, must sum to 100 (validated before save)
- [ ] 3 benchmark presets loadable
- [ ] "Copy Current → Future" works
- [ ] BlockType has Procedure Category field with auto-assignment on creation
- [ ] Generator uses future mix when set (category-weighted placement)
- [ ] Generator falls back to Rock/Sand/Water when mix not set
- [ ] Gap Analysis shown in production summary when both mixes are set
- [ ] All existing tests still pass
- [ ] Existing offices/providers fully unaffected (no mix = identical behavior)

---

## Code Quality
- TypeScript strict
- `npm test` — 407 tests must still pass
- Write tests: mix validation (sum=100), category target calculation, generator fallback
- Commit: `feat: procedure mix intelligence — current/future mix + gap analysis (Sprint 9)`
- Push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- Summary of what was built
- Test count (expect 407+)
- Push confirmation
