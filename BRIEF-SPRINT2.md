# BRIEF — Sprint 2: P1 Core Features
**App:** Schedule Template Designer  
**Path:** /home/scott/.openclaw/workspace/schedule-template-designer-app  
**PRD:** /home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md  
**Priority:** P1 (High)  
**Sprint:** 2 of 4

---

## Objective
Implement P1 core features for the Schedule Template Designer, focusing on save functionality, Excel export fixes, and production calculation accuracy.

---

## Tasks

### 1. Save Function — Preserve Built Schedule (§2.1)
**Problem:** Template regenerates from scratch each time; no way to save and return to a built schedule.

**Requirements:**
- Add prominent "Save" button in Template Builder
- Save captures all procedure blocks, timings, assignments, modifications
- "Edit" on saved template loads exact saved state (no regeneration)
- "Generate Days" shows warning modal if saved template exists: *"This will overwrite your saved schedule. Continue?"*
- Auto-save indicator for unsaved changes
- No data loss across save/edit cycles

**Acceptance Criteria:**
- [ ] Save button visible in Template Builder
- [ ] Save persists all block placements, durations, assignments
- [ ] Edit loads exact saved state
- [ ] Generate Days prompts warning if saved template exists
- [ ] No data loss across save/edit cycles

**Test Cases:**
- Build template → Save → close → Edit → exact template loads
- Load → move block → Save → Edit → modified state loads
- Saved template exists → click Generate Days → warning appears
- Generate Days → Cancel → saved template unchanged
- Generate Days → Confirm → new schedule replaces saved

---

### 2. Time Block Label — No Repeat (§4.1)
**Problem:** Multi-row blocks repeat appointment name in every row.

**Expected:** Appointment name appears only in first (top) row. Subsequent rows show D/A/H indicator only.

**Acceptance Criteria:**
- [ ] 60-min block: name in row 1 only
- [ ] Rows 2–6: D/A/H indicator; no name repeat
- [ ] Consistent across all appointment types

---

### 3. Stagger Time Increment Alignment (§5.3)
**Problem:** Stagger options not aligned to practice time increment; incorrect range.

**Requirements:**
- Stagger options = multiples of practice increment ONLY
- 10-min practice: valid options = 0, 10, 20, 30, 40, 50, 60
- 15-min practice: valid options = 0, 15, 30, 45, 60
- Remove current 0–15 cap
- Display as constrained dropdown (not free-text)
- Tooltip explaining what stagger does

**Acceptance Criteria:**
- [ ] Stagger dropdown shows only valid multiples of practice increment
- [ ] Range extends to at least 60 minutes
- [ ] Tooltip explains the concept
- [ ] Value of 10 accepted in 10-min practice

---

### 4. Excel Export — 10-Minute Increments (§8.1)
**Problem:** Excel export shows 30-minute rows instead of matching the office's configured increment.

**Requirements:**
- Export renders one row per time increment (10-min or 15-min per office setting)
- NOT every 30 minutes
- Column layout matches template builder columns
- All appointment type/block data included per row

**Acceptance Criteria:**
- [ ] 8AM–5PM at 10-min increment → 54 rows in export (not 18)
- [ ] Each row labeled with time (8:00, 8:10, 8:20...)
- [ ] Block data present in correct rows

---

### 5. Block Border Thickness (§4.3)
**Problem:** Appointment block borders too thin; hard to distinguish.

**Requirements:**
- Increase block border thickness by 1–2px
- Consistent across all appointment block types (D, A, H rows)

**Acceptance Criteria:**
- [ ] Borders visually thicker than current
- [ ] Consistent across all block types

---

### 6. Production Calculation Method (§6.1)
**Problem:** Production calculated per-row instead of per-appointment.

**Expected:** Production = **procedure fee × number of that appointment type placed**. A 60-min block = 1 unit, not 6 rows × fee.

**Requirements:**
- Each appointment block counted once at its configured fee
- Multi-row blocks within one appointment = one unit
- Display clearly reflects this method

**Acceptance Criteria:**
- [ ] 1 × NP Consult at $350 → Production Summary shows $350 (not $2,100)
- [ ] 3 × Recare at $150 → shows $450

---

## Implementation Notes

### Tech Stack
- Next.js 15.1.6
- TypeScript
- Tailwind CSS
- Shadcn UI components
- localStorage for persistence

### Key Files
- `/app/templates/[id]/page.tsx` — Template Builder main page
- `/components/schedule/ScheduleGrid.tsx` — Grid rendering
- `/lib/scheduleGenerator.ts` — Schedule generation logic
- `/lib/excel-export.ts` — Excel export logic

### Testing
- Run existing test suite: `npm test` (62 tests)
- Manual acceptance testing against each AC
- Visual regression for block display changes
- Excel export validation (row count, time labels)

---

## Definition of Done
- [ ] All 6 features implemented
- [ ] All acceptance criteria met
- [ ] Existing tests pass
- [ ] New tests written for save/load cycle
- [ ] Manual testing completed
- [ ] Git commits pushed to main branch
- [ ] Progress tracker updated

---

## Context & Dependencies
- **Sprint 1 (P0 bugs):** Role sticky, role display, stagger persistence, multi-op columns, production goal per-op, scroll — completed
- **Sprint 2 (this sprint):** Save function, label no-repeat, stagger alignment, Excel export, border thickness, production calc
- **Sprint 3 (next):** High prod thresholds, working hours per-day, time increment setting, Provider ID, DPMS library, D/A/H schedules
- **Sprint 4 (future):** Rock/Sand/Water generator, auto-populate, full provider edit

---

## Priority Order
1. **Save function** — highest value, most requested
2. **Production calc fix** — critical for accurate reporting
3. **Excel export 10-min rows** — operational necessity
4. **Stagger increment alignment** — usability + correctness
5. **Block label no-repeat** — UX polish
6. **Block border thickness** — visual clarity

Start with Save, then Production calc, then Excel export. Polish items (label, border) can be done last.

---

**Spawn this agent with:**
```
sessions_spawn({
  task: "[contents of this BRIEF]",
  label: "cst-sprint2-p1-features",
  model: "sonnet",
  mode: "run",
  runTimeoutSeconds: 0
})
```
