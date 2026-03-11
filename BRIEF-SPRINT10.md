# Schedule Template Designer — Sprint 10 Brief
## Excel Export Polish + Print/PDF View + Bug Sweep

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

The CST tool's primary output is a schedule template that Alexa and Megan use to configure
dental offices. Today they do this manually in Excel. The tool must produce an Excel file that
matches or exceeds their current manual output quality. This sprint makes the export production-ready.

---

## Task 1: Excel Export — Production-Quality Format

### Current State
The Excel export exists but produces a basic grid. The real manual templates have:
- Color-coded rows by provider (each provider has their color)
- Time column formatted as HH:MM AM/PM
- Block type label in the first row of a block only (no repeat — matches the UI fix from Sprint 1)
- D/A/H staffing code column
- Provider name columns as merged header
- Bold separators between providers
- Production summary at the bottom of each provider's section
- Lunch rows highlighted differently (grey)

### Requirements

In `src/lib/excel-export.ts` (or wherever the export lives):

1. **Provider color coding**: Each provider's rows use their configured color as a light tint fill (10-15% opacity background). Distinguish doctor rows (color tint) from hygienist rows (different tint).

2. **Time column**: Format as "8:00 AM", "8:10 AM" etc. — not "08:00".

3. **Block label — first row only**: If a block spans 6 rows (60 min), show the label only in row 1. Rows 2–6 show D/A/H code only. Matches the UI.

4. **Merged provider headers**: Provider name as a merged cell spanning all columns for that provider.

5. **Lunch row styling**: Lunch rows get a grey fill + "LUNCH" label + italic.

6. **Production summary rows**: After each provider's last time slot, add summary rows:
   - "Scheduled Production: $X,XXX"
   - "Target (75%): $X,XXX"  
   - "Status: ✅ MET" or "⚠️ UNDER"

7. **Column widths**: Time col = 12, S col = 4, Block Type col = 28 per provider.

8. **Sheet per day**: One worksheet per working day (Monday, Tuesday, etc.) — each sheet has all providers for that day.

9. **Cover sheet**: First sheet named "Summary" with office name, date generated, providers list, and weekly production totals.

Use `exceljs` (already in package.json) for all formatting.

---

## Task 2: Print / PDF View

Add a "Print" button to the Template Builder (next to the Export button).

When clicked, opens a print-optimized view of the current day's schedule:
- Clean layout, no sidebar controls
- Provider columns with color headers
- Time slots with block labels (first row only)
- D/A/H codes shown
- Production summary at bottom
- `@media print` CSS: hide all nav/controls, show only the schedule grid
- Uses browser native print dialog (no PDF library needed — just `window.print()`)

The print view should be accessible at `/offices/[id]/schedule/print?day=MONDAY`
or as a modal overlay triggered by the print button.

---

## Task 3: Drag & Drop Block Placement

This is the biggest UX improvement possible for the Template Builder.

Currently: blocks are placed by clicking a slot, selecting a block type from a picker.
Goal: drag a block type from a sidebar panel, drop it onto a time slot.

### Implementation

Use `@dnd-kit/core` + `@dnd-kit/sortable` (install if not present):
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Draggable source**: Block type cards in the left sidebar (already exists as BlockPicker).
Each block type card becomes a draggable item with the block type ID as data.

**Drop zones**: Each time slot cell in the ScheduleGrid becomes a droppable zone.

**On drop**: 
- Calculate how many slots the block needs (durationMin / timeIncrement)
- Place the block starting at the dropped slot
- Validate: no overlap with existing blocks, no placement in lunch/break rows
- If invalid drop zone: show visual rejection (red border flash)

**Visual feedback during drag**:
- Dragged card shows a ghost at cursor
- Valid drop zones highlight green on hover
- Invalid zones highlight red
- The block preview shows how many slots it will occupy

**Also support**: drag to MOVE an existing block (drag from one slot to another).
Existing blocks should be draggable within the grid to new positions.

**Keyboard fallback**: the existing click-to-place system remains as fallback.

---

## Task 4: Bug Sweep — Fix Pre-Existing Failing Tests

There are 16 pre-existing TODO skips and 2 failing test files:
- `office-crud-flow` tests
- `sprint6-shared-pool` tests

Investigate and fix as many as possible. Don't mark them as skip — actually fix the root cause.
Report which ones you fixed and which remain genuinely unfixable (and why).

---

## Priority Order
1. Task 3 (Drag & Drop) — biggest UX win
2. Task 1 (Excel Export) — biggest output quality win
3. Task 2 (Print/PDF) — quick win
4. Task 4 (Bug sweep) — hygiene

## Code Quality
- TypeScript strict
- `npm test` — 442 passing minimum, target higher after bug sweep
- Commit each task separately
- Push using workspace .env token:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What was built per task
- Test count before/after bug sweep
- Push confirmation
