# Schedule Template Designer — Sprint 7 Brief
## Phase 2: Per-Day Working Hours + DPMS Import + Provider Edit + Auto-Populate

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
PRD v2: /home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Task 1: Per-Day Working Hours (PRD §1.6)

### Problem
Providers currently have a single `workingStart`/`workingEnd`/`lunchStart`/`lunchEnd` for all days.
In real practices, a hygienist may work Mon/Wed/Fri 8–5 and Tue/Thu 9–3. Without per-day hours,
the template is inaccurate — it schedules providers on days they don't work, or with wrong hours.

### Data Model Changes (Prisma)

Add a `providerSchedule` JSON field to the `Provider` model storing per-day overrides:

```prisma
providerSchedule  String  @default("{}")
```

The JSON structure:
```json
{
  "MONDAY":    { "enabled": true,  "workingStart": "08:00", "workingEnd": "17:00", "lunchStart": "12:00", "lunchEnd": "13:00" },
  "TUESDAY":   { "enabled": true,  "workingStart": "09:00", "workingEnd": "15:00", "lunchStart": "12:00", "lunchEnd": "13:00" },
  "WEDNESDAY": { "enabled": true,  "workingStart": "08:00", "workingEnd": "17:00", "lunchStart": "12:00", "lunchEnd": "13:00" },
  "THURSDAY":  { "enabled": false },
  "FRIDAY":    { "enabled": true,  "workingStart": "08:00", "workingEnd": "13:00", "lunchStart": null,   "lunchEnd": null    }
}
```

Default: empty `{}` means the provider uses their general `workingStart`/`workingEnd` for all days (backward compatible).

Apply migration. All existing providers unaffected.

### UI: Provider Setup / Edit

In the provider setup form, add a **"Working Hours" section** with:
1. **"Detail by day"** toggle (default: off)
2. When OFF: shows existing single `workingStart`/`workingEnd`/`lunchStart`/`lunchEnd` fields (current behavior)
3. When ON: shows a Mon–Fri table with columns:
   - ☑ Enabled checkbox (unchecked = provider is off that day)
   - Start time picker
   - End time picker
   - Lunch start / Lunch end pickers (or "No lunch" checkbox)
   - Values pre-fill from the general hours on first expand
4. Save button persists `providerSchedule` JSON

### Template Builder Changes

For each day of the week being rendered:
1. Look up the provider's `providerSchedule[dayOfWeek]`
2. If `enabled === false` for that day: grey out the entire provider column with a visual "OFF" indicator
3. If per-day hours exist: use those hours to set the grid start/end and grey out outside-hours rows
4. If no per-day override: fall back to general `workingStart`/`workingEnd` (current behavior)

Grey out = light opacity (0.2), non-interactive, no block placement allowed.

### Generator Changes

In `src/lib/engine/generator.ts`, when generating a day's schedule for a provider:
1. Check if `providerSchedule[dayOfWeek]` exists
2. If `enabled === false`: skip this provider entirely for that day (no slots generated)
3. If hours exist: use per-day `workingStart`/`workingEnd`/`lunchStart`/`lunchEnd`
4. Fall back to general provider hours if no per-day override

### Acceptance Criteria
- [ ] "Detail by day" toggle in provider setup
- [ ] Per-day hours save and persist per provider
- [ ] Provider with Thursday disabled: Thursday template column fully greyed + non-interactive
- [ ] Generator skips disabled days entirely (no slots created)
- [ ] Per-day hours used in generation when set
- [ ] Existing providers (no providerSchedule) behave identically to current behavior

---

## Task 2: DPMS-Specific Import Button (PRD §9.1)

### Problem
The Template Builder shows an "Import to Open Dental" button regardless of the practice's
configured DPMS system. A Dentrix practice sees "Open Dental" which is misleading.

### Fix (src/components/schedule/ScheduleGrid.tsx and/or page.tsx)

The office already has `dpmsSystem` set (from the DPMS dropdown built in Sprint 3).

1. Read `dpmsSystem` from the office data (already available in `page.tsx` as `currentOffice.dpmsSystem`)
2. Pass it as a prop to ScheduleGrid or render the import button in `page.tsx` directly
3. Import button label and behavior:

| DPMS | Button label | Behavior |
|------|-------------|----------|
| OPEN_DENTAL | "Export to Open Dental" | existing export logic |
| DENTRIX | "Export to Dentrix" | show "coming soon" toast for now |
| EAGLESOFT | "Export to Eaglesoft" | show "coming soon" toast |
| CURVE | "Export to Curve" | show "coming soon" toast |
| CARESTREAM | "Export to Carestream" | show "coming soon" toast |
| DSN | "Export to DSN" | show "coming soon" toast |
| OTHER | (no button shown) | hidden |
| not set | "Export to Open Dental" | default, existing behavior |

The "coming soon" toast message: "Dentrix export is in development. Use Open Dental format for now."

### Acceptance Criteria
- [ ] Button label matches configured DPMS
- [ ] Open Dental = existing behavior unchanged
- [ ] Other DPMS = "coming soon" toast on click
- [ ] "Other" DPMS = no export button shown
- [ ] Office with no DPMS set = defaults to Open Dental button

---

## Task 3: Full Provider Edit Capability (PRD §1.7)

### Problem
After a provider is created, users can only edit name and color. All other fields (role, operatories,
daily goal, working hours, appointment types, etc.) require recreating the provider.

### Fix (src/app/offices/[id]/edit/page.tsx)

The edit page already exists. Ensure ALL provider fields are editable in the provider card:
- Name ✅ (already editable)
- Color ✅ (already editable)
- Role (Dentist / Hygienist) — add to edit form
- Provider ID — add field (next to Role)
- Daily goal — add to edit form
- Working start/end times — add to edit form
- Lunch start/end + enabled — add to edit form
- Operatories (multi-select checkboxes) — add to edit form
- Sees new patients (checkbox) — add to edit form
- Stagger offset (dropdown, multiples of time increment) — add to edit form

The edit form should mirror the creation form — same fields, same layout.
When saved, all fields persist correctly.

### Acceptance Criteria
- [ ] All provider fields editable post-creation
- [ ] Edit form mirrors creation form fields
- [ ] Changes save and reflect immediately in Template Builder
- [ ] Role change updates Template Builder display (no re-save workaround needed)

---

## Task 4: Auto-Populate Existing Schedules (PRD §2.4)

### Problem
Offices with saved schedules require the user to click "Generate Schedule" to see anything.
The saved schedule should load automatically on open.

### Fix (src/app/offices/[id]/page.tsx)

1. On mount, after office data loads, check if `localStorage` has a saved schedule for this office
2. If yes: load it directly into the schedule store — skip the "Generate Schedule" step
3. If no saved schedule AND the office has saved `ScheduleTemplate` records in DB: load those
4. "Generate Schedule" button should still exist but labeled "Regenerate" when a schedule exists
5. Show a subtle "Auto-loaded saved schedule" indicator that fades after 2 seconds

### Acceptance Criteria
- [ ] Office with saved schedule: loads immediately on open, no click needed
- [ ] Office with no schedule: shows Generate Schedule button (current behavior)
- [ ] "Regenerate" label when schedule exists; "Generate Schedule" when empty
- [ ] Auto-load indicator shown briefly

---

## Code Quality Rules
- TypeScript strict
- `npm test` after each task — 354 tests must still pass
- Write at least 2 tests per task
- Commit after each task
- Push at end using workspace .env token:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Priority Order
1 → 4. Do Task 1 first (largest, most impactful), then 2, 3, 4.
If time is short, Task 1 is the must-have. Tasks 2–4 are high-value but smaller.

## Output
- What was built per task
- Any edge cases or decisions made
- Final test count
- Push confirmation
