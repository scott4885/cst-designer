# Schedule Template Designer — Sprint 8 Brief
## Phase 2: Multi-Week Rotating Templates (§9.3)

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
PRD v2: /home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Background

Sprint 5 built the Alternate Week toggle (Week A / Week B, simple every-other-week flip).
This sprint extends that to support MORE rotation patterns:
- Every other week (Week A / B) — ALREADY BUILT
- 4-week rotation (Week A / B / C / D)
- Provider-specific rotation (a provider only works certain weeks of the rotation)
- Month-based patterns (1st/3rd week vs 2nd/4th week)

The core concept is the same: multiple independent schedule "versions" per office,
with a configurable rotation cadence.

---

## Data Model

### Office model additions
```prisma
rotationWeeks    Int     @default(2)   // 2 = A/B (default), 4 = A/B/C/D
rotationEnabled  Boolean @default(false)  // replaces alternateWeekEnabled for multi-week
```

Keep `alternateWeekEnabled` for backward compat but treat `rotationEnabled` as the new flag.
When `rotationEnabled=true`, use `rotationWeeks` to determine how many week slots (2 or 4).

### ScheduleTemplate weekType
Currently: `weekType String @default("A")` — supports "A" or "B"
Extend to support: "A", "B", "C", "D" (up to 4 rotation slots)

No migration complexity — just allow more values in the field.

---

## UI Changes

### Office Settings
- Replace existing "Alternate Week Scheduling" toggle with **"Rotation Schedule"** section
- Toggle: "Enable Rotation Schedule" (enables multi-week)
- When enabled: dropdown **"Rotation Length"** with options:
  - "2 weeks (A / B)" — current behavior
  - "4 weeks (A / B / C / D)"
- Keep backward compat: existing offices with `alternateWeekEnabled=true` treated as 2-week rotation

### Template Builder
- When rotation enabled: week selector shows the appropriate tabs: `Week A | Week B` (2-week) or `Week A | Week B | Week C | Week D` (4-week)
- Active week tab highlighted
- Switching tabs loads/saves the schedule for that week
- Each week is fully independent (different block placements per day)
- "Copy from Week A" button on Weeks B/C/D when they are empty — copies Week A schedule as a starting point (user can then modify)

### Provider-Level Rotation
In the per-day working hours section (built in Sprint 7):
- For each day, add a **"Weeks"** multi-select (only visible when rotation is enabled)
- Options match the rotation length: A, B (2-week) or A, B, C, D (4-week)
- Default: all weeks selected (provider works every week on that day)
- Example: Hygienist works Monday only on Week A and C → uncheck B and D for Monday
- This drives the "OFF TODAY" display for that provider on that week+day combo

---

## Generator Changes

When generating a day's schedule, pass `weekType` to the generator.
The generator already ignores providers whose `providerSchedule[dayOfWeek].enabled === false`.
Extend: also skip if `providerSchedule[dayOfWeek].rotationWeeks` doesn't include the active week.

The `activeWeek` from the schedule store ('A'|'B'|'C'|'D') is already passed through to generation.

---

## Acceptance Criteria

- [ ] Office Settings: "Enable Rotation Schedule" toggle
- [ ] Rotation Length dropdown: 2-week or 4-week
- [ ] Template Builder: correct number of week tabs based on rotation length
- [ ] Each week tab has an independent, saveable schedule
- [ ] "Copy from Week A" available on empty weeks B/C/D
- [ ] Provider per-day rotation week assignment (which weeks a provider works)
- [ ] Template Builder correctly greys out provider columns for weeks they don't work
- [ ] Backward compat: existing offices with `alternateWeekEnabled=true` show as 2-week rotation
- [ ] Existing offices with rotation disabled: completely unchanged

---

## Test Cases

| ID | Scenario | Expected |
|----|----------|----------|
| T1 | 4-week rotation enabled | Template Builder shows A/B/C/D tabs |
| T2 | Week C empty, click "Copy from A" | Week C populated with Week A schedule |
| T3 | Provider works weeks A+C on Monday | Week B/D: provider column greyed on Monday |
| T4 | Switch A→B in 2-week | Week B schedule loads independently |
| T5 | Switch A→D in 4-week | Week D loads (empty until built) |
| T6 | Office with rotation off | Single schedule, no tabs |
| T7 | Existing office (alternateWeekEnabled) | Shows as 2-week rotation, data intact |

---

## Code Quality
- TypeScript strict
- `npm test` — 381 tests must still pass
- Write tests for the rotation scenarios above
- Commit: `git commit -m "feat: multi-week rotation templates (Sprint 8 §9.3)"`
- Push using workspace .env token:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- Summary of what was built
- Test count (expect 381+)
- Push confirmation
