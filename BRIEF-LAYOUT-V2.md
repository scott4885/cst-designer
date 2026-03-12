# Schedule Template Designer — Layout V2 Fix
## Make Schedule Grid Fill Entire Available Space

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Problem

There are TWO sidebars eating space:
1. The **main navigation sidebar** (~270px) with Offices, Analytics, etc.
2. The **office info icon sidebar** (~48px) with provider/calendar/chat icons

Together they consume ~320px+ before the schedule grid even starts.
The schedule grid — THE most important part of the app — only gets ~64% of the viewport.

Scott wants the schedule to fill the ENTIRE white space.

---

## Required Changes

### 1. Main Nav Sidebar — Collapsible to Icon Rail

The main navigation sidebar (Offices, Analytics, Chair Utilization, etc.) must be
collapsible to a narrow icon-only rail (~56px).

- **On Template Builder page: DEFAULT TO COLLAPSED (icon rail only)**
- On other pages (dashboard, analytics, settings): can default to expanded
- Toggle: hamburger menu icon or `<<` / `>>` chevron at bottom of sidebar
- Collapsed state: just the icons, no text labels. Tooltip on hover showing the name.
- Expanded state: current layout with icons + labels, max 220px
- Persist collapse state to localStorage per page context

### 2. Office Info Sidebar — Merge Into Header or Remove from Template Builder

The office info sidebar (the 48px icon strip with provider count, calendar, chat icons)
is redundant on the Template Builder page. The office info is already in the header
("Test • DENTRIX • Template Builder").

- **On Template Builder: HIDE this sidebar entirely.** The provider info is accessible
  via the expanded main nav or the office header.
- OR: merge these icons into the top header bar (next to the Saved/Export/Dentrix buttons)

### 3. Schedule Grid — Full Width

With both sidebars collapsed/hidden on Template Builder:
- The schedule grid container should be: `margin-left: 56px` (icon rail) + `flex: 1`
- No additional padding or gaps between the nav rail and the grid
- The grid should stretch from the nav rail edge to the right edge of the viewport
- Horizontal scroll (`overflow-x: auto`) for when columns exceed viewport width

### 4. Toolbar Compression (continued)

The toolbars still take too many rows. Looking at the screenshot:
- Row 1: Office name + action buttons (Saved, Export, Dentrix, Matrix, etc.)
- Row 2: Day tabs (Monday, Tuesday, Wednesday, Thursday)
- Row 3: Quick Actions (Smart Fill All, Copy Mon, Reset, Validate, Print, Export, Clone)
- Row 4: Compact/Wide toggle + zoom

That's 4 rows before any schedule content.

**Compress to 2 rows:**
- Row 1: Office name + day tabs (inline) + primary actions (Save, Generate)
- Row 2: Quick Actions strip (smaller buttons, icon-heavy) + Compact/Wide/Zoom

Move secondary actions (Matrix, Report, Print, PDF, Clone) into a "⋯ More" dropdown.

### 5. Remove Unnecessary Whitespace

- The gap between the Quick Actions row and the Compact/Wide row has visible empty space
- The "Operatory" header row + "Time" row + "Smart Fill" row = 3 sub-header rows before actual schedule data
- Can the "Smart Fill" button be part of the provider header instead of a separate row?
- Minimize padding on the grid header cells

---

## Implementation Priority

1. **Collapse main nav on Template Builder** — biggest space win
2. **Hide office info sidebar on Template Builder** — second biggest win
3. **Compress toolbars to 2 rows** — vertical space win
4. **Remove whitespace gaps** — polish

---

## Code Quality
- TypeScript strict
- `npm test` — 773 tests must pass
- `npm run build` — must succeed
- Commit and push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What changed
- Test count
- Push confirmation
