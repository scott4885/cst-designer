# Schedule Template Designer — Sprint 13 Brief
## Template Library + Schedule Versioning + Provider Time-Off + Optimization Advisor

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Task 1: Global Template Library

A library of pre-built, named schedule templates that can be applied to any office as a
starting point. Saves setup time — instead of building from scratch, pick a template
and customize.

### Data Model
```prisma
model TemplateLibraryItem {
  id            String   @id @default(cuid())
  name          String                          // "Standard GP", "High Volume Endo", "2-Op Doctor"
  description   String   @default("")
  category      String   @default("GENERAL")   // GENERAL | ENDO | COSMETIC | HYGIENE | MULTI_OP
  isBuiltIn     Boolean  @default(false)        // true = system default, can't be deleted
  slotsJson     String   @default("{}")         // keyed by dayOfWeek, role-relative slots
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

Slots stored role-relative (DOCTOR_0, DOCTOR_1, HYGIENIST_0) — mapped to actual provider IDs on apply.

### Built-In Templates (seed on first run)
5 pre-built templates:
1. **Standard GP (1 Doctor, 1 Hygienist)** — typical bread-and-butter GP day
2. **High Volume GP (1 Doctor, 2 Hygienists)** — doctor heavy with 2 hygiene chairs
3. **2-Op Doctor (Multi-Op)** — doctor in 2 ops with stagger, hygienist support
4. **Endo-Focused** — heavy endo block weighting, fewer hygiene slots
5. **New Patient Focused** — heavy NP exam weighting, consultation slots prominent

### UI — Template Library Page
New route: `/templates`
- Grid of library cards (name, category badge, description, preview thumbnail)
- "Apply to Office" button → office picker modal → applies to selected office
- "Save Current as Template" — saves the active office's schedule to the library with a name
- "Delete" on non-built-in templates

### Apply Logic
- Match provider roles by index (DOCTOR_0 → first doctor of target office)
- If target has more providers than template: remaining providers get empty schedules
- If target has fewer: extra template slots ignored, warning shown
- Production amounts scaled to target office's daily goal (proportional)

---

## Task 2: Schedule Version History

Every time a schedule is saved, create a version snapshot. Allow restoring to any prior version.

### Data Model
```prisma
model ScheduleVersion {
  id          String   @id @default(cuid())
  officeId    String
  dayOfWeek   String
  weekType    String   @default("A")
  slotsJson   String
  summaryJson String   @default("[]")
  label       String   @default("")      // auto: "Saved 3:42 PM" or user-typed name
  createdAt   DateTime @default(now())
  office      Office   @relation(fields: [officeId], references: [id], onDelete: Cascade)
}
```

Max 20 versions per office+day+week combination (auto-prune oldest).

### UI — Version History Panel
In Template Builder, "Version History" button in Quick Actions toolbar.
Opens a right-side drawer showing:
- List of saved versions (timestamp + label)
- "Restore" button on each version (with confirmation: "Restore to version from 2:15 PM?")
- "Name this version" — add a label to the current version (e.g., "Before procedure mix change")
- Preview on hover: shows a mini schedule grid thumbnail

### Save Behavior
- Every "Save" action creates a new ScheduleVersion record
- Auto-label: "Saved [time]" if no user label
- Restore overwrites current schedule with the version's slots + summary

---

## Task 3: Provider Time-Off / Absence Tracking

Allow marking a provider as absent on specific dates (not recurring — single date events).

### Data Model
```prisma
model ProviderAbsence {
  id          String   @id @default(cuid())
  providerId  String
  officeId    String
  date        String                      // ISO date string YYYY-MM-DD
  reason      String   @default("")       // "Vacation", "CE", "Sick", etc.
  provider    Provider @relation(fields: [providerId], references: [id], onDelete: Cascade)
}
```

### UI — Provider Calendar
In provider settings, add a "Time Off" section:
- Month calendar view
- Click a date to mark as absent — shows a reason input (optional)
- Marked dates shown in red
- "Clear" to remove

### Template Builder Impact
- On the Template Builder, show a banner if any provider is marked absent on the date range
  being scheduled: "⚠️ Dr. Smith is marked absent on Apr 14 (Monday)"
- Visual: provider column header shows a small red absence indicator
- Does NOT block scheduling — just an informational warning

---

## Task 4: Optimization Advisor

A simple AI-driven advisor that looks at the current schedule's quality score and
suggests specific improvements to raise it.

### Logic (`src/lib/engine/optimizer.ts`)

`generateOptimizationSuggestions(schedule, providers, blockTypes, qualityScore)`:
Returns an array of prioritized suggestions, each with:
- Category (production | mix | clinical | utilization)
- Specific action (text)
- Estimated score improvement (+X pts)
- Difficulty (easy | medium | hard)

**Example suggestions:**
```
🎯 +8pts (Easy)    Add 1 Crown Prep block Tuesday morning — you're 22% under Major Restorative target
🎯 +5pts (Easy)    Move Emergency block from 2:00 PM to 8:00 AM on Wednesday — clinical rule violation
🎯 +4pts (Medium)  Tuesday has 4 empty slots after 3PM — add Composite or Exam blocks to hit goal
🎯 +3pts (Medium)  Dr. B has no NP slot on Thursday — add 1 New Patient Consult
```

Suggestions are ordered by estimated score impact (highest first).

### UI — Optimization Panel
In the Template Builder right panel, below Clinical Validation:
- "💡 Optimization Suggestions" collapsible section
- List of suggestions with score impact badge and difficulty label
- "Apply" button on easy/medium suggestions — auto-applies the change to the schedule
- "Apply All Easy" button at top — applies all easy suggestions at once

---

## Code Quality
- TypeScript strict
- `npm test` — 512 tests must still pass
- Write tests: template library apply logic, version snapshot/restore, absence tracking, optimizer output format
- Commit each task
- Push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What was built per task
- Test count
- Push confirmation
