# Schedule Template Designer — Sprint 16 Brief
## Goal Pacing + Block Audit + Provider Benchmarking + Keyboard Shortcuts

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Task 1: Production Goal Pacing Calculator

Given a provider's daily goal and the current schedule, tell the practice: "By what time in
the day will we hit goal, assuming average procedure times?"

This is critical for front-desk scheduling — knowing at 11am whether today is on track.

### Engine (`src/lib/engine/goal-pacing.ts`)

Input: provider's schedule for one day (slots + block types), provider daily goal
Output: `PacingResult`

```typescript
interface PacingResult {
  providerId: string;
  dailyGoal: number;
  scheduledTotal: number;           // sum of all blocks' production amounts
  cumulativeByHour: HourMilestone[] // { time: "10:00 AM", cumulative: 2400, pct: 60 }
  projectedGoalTime: string | null  // "1:30 PM" — when will goal be hit, null if never
  goalHitByEnd: boolean
  onTrackAt: string                 // "On track by 2:00 PM" or "Will fall short by $1,200"
  shortfallAmount: number           // 0 if goal met
  recommendations: string[]         // ["Add 1 Crown composite at 3PM to close gap"]
}
```

For `cumulativeByHour`: sum scheduled production from start of day through each hour.

### UI — Pacing Panel
New collapsible panel in Template Builder right column ("📈 Goal Pacing"):
- Mini area chart or progress bars showing cumulative production through the day
- Provider selector (if multiple providers)
- Key callout: "🎯 Goal hit by 1:30 PM" or "⚠️ Will fall $1,200 short"
- Recommendation list

---

## Task 2: Block Type Audit Report

Across all saved schedules, analyze which block types are being used vs. which exist in
the library but are never scheduled. Surfaces dead config and optimization opportunities.

### Audit Engine (`src/lib/audit.ts`)

```typescript
function auditBlockTypes(offices: OfficeWithSchedules[], blockTypes: BlockType[]): AuditResult
```

```typescript
interface AuditResult {
  totalBlockTypes: number
  usedBlockTypes: BlockTypeUsage[]   // { blockTypeId, name, useCount, totalMinutes, totalProduction }
  unusedBlockTypes: BlockType[]      // never appear in any schedule
  overusedCategories: string[]       // categories >40% of schedule time
  underusedCategories: string[]      // categories <5% of schedule time vs benchmarks
  topBlocksByProduction: BlockTypeUsage[]
  offices: OfficeAudit[]             // per-office breakdown
}
```

### UI — Audit Page (`/audit`)
- Summary: used/unused count, top 5 blocks by total production value, top 5 by frequency
- "Unused Block Types" section: list of never-scheduled block types with a "Remove" button
- Per-office breakdown table: which blocks each office uses most
- "Export Audit CSV" button

---

## Task 3: Provider Benchmarking

Compare any provider's configuration and scheduled production against org-wide averages.

### Benchmark Engine (`src/lib/benchmark-providers.ts`)

For each role (DOCTOR, HYGIENIST, ASSISTANT):
- Average daily goal
- Median scheduled production (across offices that have schedules built)
- P25 / P75 of scheduled production
- Average quality score for offices with that role
- Top 3 offices by scheduled production for that role

### UI — `/benchmarks` page (or tab on `/analytics`)

Provider Benchmark Section:
- Role selector: Doctor | Hygienist | Assistant
- Histogram: distribution of daily goals across all providers of that role
- Org averages card: avg goal, median scheduled production, avg quality score
- "Your Providers vs. Org" table (if viewing from an office context): highlights providers above/below median
- Sortable table: all offices + their doctor/hygienist goal + scheduled production + gap to median

---

## Task 4: Keyboard Shortcuts

Power users need keyboard shortcuts to navigate and build schedules faster.

### Shortcuts to implement:

**Global:**
- `?` — opens keyboard shortcuts help modal
- `Cmd/Ctrl+S` — save current schedule
- `Cmd/Ctrl+P` — print current view
- `Cmd/Ctrl+E` — export (Excel)
- `Esc` — close any open modal/panel

**Template Builder:**
- `←` / `→` — previous/next day
- `1`–`5` — jump to Mon–Fri (when not in input field)
- `G` — generate schedule (Smart Fill All)
- `V` — open Version History
- `R` — reset day (with confirmation)
- `Shift+C` — copy Monday to all days (with confirmation)

**Navigation:**
- `O` — go to Offices
- `A` — go to Analytics
- `L` — go to Template Library
- `Shift+R` — go to Rollup

### Implementation
- `src/lib/keyboard-shortcuts.ts`: `useKeyboardShortcuts(handlers)` hook
  - Listens on `document`, ignores events inside `input`, `textarea`, `select`
  - Returns `cleanup` on unmount
- `KeyboardShortcutsModal.tsx`: grid of all shortcuts, triggered by `?`
- Wire shortcuts into `TemplatePage`, `layout.tsx` (global), office page
- Add keyboard shortcut hints to tooltips: "Save (⌘S)"

---

## Code Quality
- TypeScript strict
- `npm test` — 641 tests must still pass
- Write tests: pacing calculator (cumulative, shortfall, projectedGoalTime), audit engine, benchmark calculations, keyboard shortcut hook (mock document events)
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
