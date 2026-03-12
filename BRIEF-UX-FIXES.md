# Schedule Template Designer — UX Fix Sprint
## Layout Overhaul + Provider Role Bug

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Bug 1: Schedule Grid Is Hidden — Layout Must Be Fixed (CRITICAL)

The schedule grid is the most important part of the app but it's barely visible.
The left sidebar takes ~35% of the viewport, leaving the grid cut off.
Offices can have 10-20 columns — they ALL need to be visible/scrollable.

### Required Changes:

**A) Collapsible Sidebar**
- The left sidebar ("Office Information") must be **collapsible to an icon rail** (narrow strip ~48px wide with just icons).
- Default state: **COLLAPSED** on the Template Builder page. The schedule grid needs maximum space.
- Toggle: click the `<` chevron to collapse. Click `>` to expand. Or use keyboard shortcut.
- When collapsed: show small icons for Providers (people icon + count badge), Working Days, System.
- When expanded: current content as-is but **max width 280px**, not 35%.

**B) Schedule Grid Must Scroll Horizontally**
- The schedule grid container MUST have `overflow-x: auto` so all columns are accessible.
- Add a proper horizontal scrollbar at the bottom of the grid.
- The grid should take ALL remaining horizontal space after the sidebar.

**C) Compact Column Mode Must Be Tighter**
- In "Compact" mode, each column should be narrower — minimum ~80px per sub-column.
- Remove unnecessary padding. Every pixel counts when you have 15+ columns.
- The "S" (stagger) sub-column can be very narrow (30px).

**D) Reduce Toolbar Vertical Footprint**
- The two rows of action buttons at the top push the schedule down too far.
- Combine into a single row where possible. Use icon-only buttons for less-used actions.
- The Quick Actions toolbar (Smart Fill, Copy Mon, etc.) can be a more compact strip.
- Goal: the schedule grid should start within the top ~150px of the viewport, not the bottom 25%.

**E) Responsive Column Sizing**
- Auto-detect the number of provider columns and adjust column widths to fit the viewport when possible.
- If columns overflow (>5 providers), enable horizontal scroll rather than trying to squeeze.
- Each provider's operatory column group should have a minimum width but flex to fill available space.

### Implementation Notes
- The sidebar collapse state should persist in localStorage.
- The Template Builder page layout should be: `[sidebar 48px collapsed | grid flex-1]` or `[sidebar 280px expanded | grid flex-1]`.
- Use CSS `flex` or `grid` layout — no fixed pixel widths on the main content area.

---

## Bug 2: Adding Hygienist Changes Doctor Role (CRITICAL)

When adding a second provider (hygienist), the first provider (doctor) gets its role
changed to hygienist. This is a data mutation bug.

### Investigation
Look at the provider save/update flow:
- `src/app/offices/[id]/edit/page.tsx` or wherever providers are managed
- Check if the PUT/POST handler is replacing ALL providers instead of adding one
- Check if the form state is overwriting the first provider's role when a second is added
- The provider system uses a "full-replace" strategy (delete all → create all) on PUT.
  If the form state is sending both providers but with the wrong role on the first one,
  that's the bug.

### Fix
- Ensure each provider's role is independently stored and not shared state
- When adding a new provider, the existing providers' data must be preserved exactly
- Add a test: create office → add doctor → add hygienist → verify doctor is still DOCTOR

---

## Code Quality
- TypeScript strict
- `npm test` — 769 tests must still pass
- Add test for provider role independence (add 2 providers, verify roles preserved)
- `npm run build` must succeed
- Commit and push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What was fixed
- Test count
- Push confirmation
