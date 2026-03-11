# Schedule Template Designer — Sprint 5 Brief
## Two Tasks: Multi-Op Goal Fix + Alternate Week Toggle

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
PRD v2: /home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md
GITHUB_TOKEN: run `grep GITHUB /home/scott/.openclaw/workspace/.env` to get it — do NOT use $GITHUB_TOKEN env var

---

## Task 1: Fix Multi-Op Production Goal Bug (PRD §5.4)

### Problem
The generator calls `placeDoctorBlocks()` once per operatory, and each call independently tries to fill up to `targets.target75`. A doctor with goal $3,000 and 3 ops ends up scheduling ~$2,250 per op = ~$6,750 total — 3× what one doctor can produce.

### Root Cause
In `src/lib/engine/generator.ts`, the multi-column block for loop (around line 447):
```js
for (let oi = 0; oi < opSlots.length; oi++) {
  placeDoctorBlocks(slots, opSlots[oi], doc, blocksByCategory, rules, timeIncrement, warnings, totalStagger, di, doctors.length);
}
```
Each call gets `doc.dailyGoal` as its full target. No cross-op coordination.

### Fix
Divide the daily goal evenly across all operatories before calling `placeDoctorBlocks`. Pass a per-column goal instead of the full goal.

Approach:
1. Before the multi-column loop, calculate `perOpGoal = doc.dailyGoal / opSlots.length`
2. Create a modified provider object (or pass an override param) with `dailyGoal: perOpGoal` for each `placeDoctorBlocks` call
3. `placeDoctorBlocks` signature already accepts a `ProviderInput` — just pass a spread with the divided goal

The production DISPLAY in `recalcProductionSummary` (store) already aggregates all slots for a provider across all ops correctly — no change needed there.

### Acceptance Criteria
- Doctor goal $3,000, 2 ops → combined scheduled production ≈ $3,000 (not $6,000)
- Doctor goal $3,000, 3 ops → combined ≈ $3,000 (not $9,000)
- Single-op doctor unchanged
- Existing tests still pass

---

## Task 2: Alternate Week Schedule Toggle (PRD §9.2)

### Feature Description
Some providers work alternating weeks (e.g., every other Wednesday, or a provider who rotates). Offices need a second weekly template that alternates with the primary.

This should be a **simple toggle** — not complex. Think of it as: the office has a "Week A" template and optionally a "Week B" template. The toggle turns on the Week B concept.

### UI: Office Settings
- Add a toggle: **"Alternate Week Schedule"** (off by default)
- When toggled ON: in the Template Builder, add a **week selector** at the top: `Week A | Week B`
- Week A = the existing schedule (no change to current behavior)
- Week B = a separate independent schedule (same providers, same structure, but different block placements)
- When toggle is OFF: Template Builder shows only one schedule (current behavior, unchanged)

### Data Model
The schedule is currently stored per `officeId + dayOfWeek`. Add a `weekType` field:
- Default/existing: `weekType = 'A'` (or null, backward compatible)
- Alternate: `weekType = 'B'`

In Prisma schema (`DaySchedule` model), add:
```prisma
weekType  String  @default("A")
```

Apply migration. All existing schedules default to `weekType = 'A'` — no data loss.

### Template Builder UI Changes
- When alternate week is enabled for the office: show `Week A | Week B` tab/toggle at top of Template Builder
- Switching between A and B loads/saves the correct schedule independently
- "Generate Days" and "Save" operate on the currently selected week
- Week B starts empty until generated or manually built
- Visual indicator showing which week is active (e.g., pill badge: `Week A` / `Week B`)

### Office Setup Changes
- Toggle stored on the `Office` model: `alternateWeekEnabled Boolean @default(false)`
- Visible in office setup/edit page

### Acceptance Criteria
- [ ] Alternate Week toggle in office settings, off by default
- [ ] When OFF: Template Builder unchanged (single schedule)
- [ ] When ON: Week A / Week B selector appears in Template Builder
- [ ] Week A and Week B schedules are independent (different block placements per day)
- [ ] Switching weeks loads the correct schedule for that week
- [ ] Save/Generate operate on the active week only
- [ ] Week B empty by default until built
- [ ] Existing offices with toggle OFF are completely unaffected
- [ ] No data loss on migration

### Test Cases
| ID | Scenario | Expected |
|----|----------|----------|
| T1 | Toggle OFF (default) | Template Builder shows single schedule, no week selector |
| T2 | Toggle ON | Week A / Week B tabs appear |
| T3 | Build Week A, switch to Week B | Week B is empty; Week A unchanged |
| T4 | Build Week B, switch back to Week A | Week A unchanged |
| T5 | Save Week B | Week B persists on reload |
| T6 | Existing office (pre-feature) | Unaffected, defaulted to Week A |

---

## Code Quality Rules
- TypeScript strict — no `any` unless necessary
- Run `npm test` after each task — all tests must pass
- Write regression tests for both tasks
- Commit after each task: `git commit -m "fix/feat: [description]"`
- Push at end: use token from `grep GITHUB /home/scott/.openclaw/workspace/.env`
  ```bash
  FRESH_TOKEN=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH_TOKEN}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
1. Confirm multi-op goal fix with before/after test
2. Confirm alternate week toggle working with test cases
3. Final test count
4. Push confirmation
