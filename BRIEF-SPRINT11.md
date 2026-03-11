# Schedule Template Designer — Sprint 11 Brief
## Schedule Intelligence: Clinical Rules + Conflict Prevention + UX Polish

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

The tool now generates realistic, goal-driven, procedure-mix-weighted schedules.
Sprint 11 adds clinical intelligence (scheduling rules that real practices follow),
improves the quality of generated schedules, and polishes the UX.

---

## Task 1: Clinical Scheduling Rules Engine

Dental schedules must follow clinical rules that the generator currently ignores.
Add a rules validation layer that flags impossible or suboptimal scheduling decisions.

### Rules to implement:

**Rule 1: New Patient → Comprehensive Exam first**
A new patient slot (NP/DIAG category) should always precede any major restorative block
for the same patient type. The generator should never place a Crown Prep as the first
appointment type in the morning without an NP slot earlier in the day (if seesNewPatients=true).
→ Warning if no NP slot exists and provider is configured to see new patients.

**Rule 2: SRP → Perio Maintenance minimum 4-week gap**
SRP blocks should not appear alongside Perio Maintenance blocks for the same provider
in the same day (they're different stages of perio treatment — can't do both same day).
→ Warning if both SRP and Perio Maintenance blocks exist in one provider's day.

**Rule 3: Emergency block — morning only**
Emergency/Access blocks should be placed in the first 2 hours of the day.
Afternoon emergency slots are generally not how practices handle urgencies.
→ Auto-place ER blocks before 10AM. If no morning slot exists, warn.

**Rule 4: No consecutive high-production blocks without assistant time**
Two consecutive HP blocks (e.g., Crown Prep back-to-back, 180 min straight D time)
is physically impossible for one doctor. Flag when doctor D-time exceeds 90 min without
a break or A-time gap.
→ Warning: "Dr. X has 120min consecutive D-time starting at 9:00. Consider adding a break."

**Rule 5: Lunch enforced**
Generator already handles lunch. Rule engine validates: no blocks scheduled during lunch window.
→ Error (not warning) if a block overlaps lunch.

**Rule 6: Hygienist D-time minimum gap**
For hygiene appointments, D-time (doctor exam) cannot start before minute 20 of the appointment.
Already in the engine but add validation that flags if this rule is being violated in saved schedules.

### Implementation

Add `src/lib/engine/clinical-rules.ts`:
```typescript
export function validateClinicalRules(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[]
```

Returns an array of warnings with severity ('error' | 'warning' | 'info'), message, and affected time slot.

Display these in a "Clinical Validation" panel in the Template Builder — collapsible, shown below production summary. Errors shown in red, warnings in amber, info in grey.

---

## Task 2: Schedule Quality Score

Add a **Schedule Quality Score** (0–100) displayed prominently in the Template Builder.

Scoring components:
- **Production Goal Achievement** (30pts): 30pts if ≥100% of target75, scaled proportionally
- **Procedure Mix Accuracy** (25pts): 25pts if future mix gap <5% on all categories, scaled by avg gap
- **Clinical Rules Compliance** (20pts): 20pts if 0 errors/warnings, -5 per error, -2 per warning
- **Time Utilization** (15pts): 15pts if <10% of available slots are empty, scaled
- **Provider Coverage** (10pts): 10pts if all active providers have schedules built

Display as a circular progress indicator or prominent badge in the template builder header:
- 90–100: 🟢 Excellent
- 75–89: 🟡 Good  
- 60–74: 🟠 Fair
- <60: 🔴 Needs Work

Show score breakdown on hover/click.

---

## Task 3: Quick Actions Toolbar

Add a **Quick Actions** floating toolbar to the Template Builder for common operations:

```
[🪄 Smart Fill All] [📋 Copy Mon → All Days] [🔄 Reset Day] [📊 Validate] [🖨️ Print] [⬇️ Export]
```

- **Smart Fill All**: runs Smart Fill for all providers on the current day simultaneously
- **Copy Mon → All Days**: copies Monday's schedule to all other working days (with confirmation)
- **Reset Day**: clears all blocks for the current day (with confirmation)
- **Validate**: runs clinical rules validation and shows results panel
- **Print** / **Export**: existing buttons, consolidated here

Place below the day selector tabs, above the schedule grid.

---

## Task 4: Office Dashboard — Production Overview

The main office page (`/offices/[id]`) currently shows basic info. Upgrade it to a
production overview dashboard.

Add a **Weekly Overview** section on the office page showing:
- Cards per working day (Mon–Fri): day name + scheduled production vs. target
- Color coded: green (≥target), amber (75–99%), red (<75%)
- Provider summary: provider name + role + daily production scheduled
- "Jump to day" link on each card → opens Template Builder on that day
- Weekly total: sum of all days + % of weekly goal hit

Weekly goal = sum of all providers' dailyGoal × working days in week.

---

## Code Quality
- TypeScript strict
- `npm test` — 458 tests must still pass
- Write tests for clinical rules (each rule has at least 2 tests: valid case + violation)
- Write test for quality score calculation
- Commit each task separately
- Push using workspace .env token:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What was built per task
- Test count
- Push confirmation
