# Schedule Template Designer — Full Screen Schedule Fix
## Make the schedule dominate the screen

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## THE PROBLEM

Users CANNOT see the schedule. The grid shows only ~1 hour of the day. Blocks have
visual gaps. Op 2 is empty. The toolbars take too much space. This is the #1 priority.

---

## Fix 1: FULL SCREEN SCHEDULE MODE

Add a **"Full Screen"** button (⛶ icon) in the header that:
- Hides the main navigation sidebar COMPLETELY (display: none)
- Hides the right panel COMPLETELY
- Collapses the toolbar ribbon to a SINGLE LINE: `[← Back] [Office Name] [Day Tabs] [Save] [Generate] [⛶ Exit]`
- The schedule grid takes 100% of the viewport width and height
- Exit full screen: click ⛶ again or press Escape

This is separate from the collapsed sidebar — full screen means NO sidebar, NO right panel,
MINIMAL header. Just the schedule.

Implementation:
- Add a `fullScreen` state (boolean) to the template page
- When true: hide Sidebar, hide right panel, minimize header to one line
- CSS: the grid wrapper gets `position: fixed; inset: 0; z-index: 50` with just a thin header bar

---

## Fix 2: TABLE ROW HEIGHT ACTUALLY ENFORCED

The `<tr style={{ height: rowHeight }}>` sets height but doesn't ENFORCE it.
Cell content can push the row taller.

**Fix:**
- On EVERY `<td>` inside the row: add `style={{ height: rowHeight, maxHeight: rowHeight, overflow: 'hidden' }}`
- On the `<table>`: add CSS `table-layout: fixed`
- On the TimeSlotCell wrapper div: add `style={{ height: '100%', maxHeight: rowHeight, overflow: 'hidden' }}`
- Remove ALL padding (py-*) from cells in the tbody — use `p-0` everywhere
- When rowHeight < 20: hide the D/A time split bar, hide the DA time labels,
  hide the HP badge — just show the block color + label text

**Default rowHeight**: calculate it to fit the full day:
```
const totalSlots = timeSlots.length; // e.g., 54 for 8am-5pm at 10min
const availableHeight = window.innerHeight - headerHeight - 120; // rough header/toolbar
const autoRowHeight = Math.max(12, Math.floor(availableHeight / totalSlots));
```
Use this `autoRowHeight` as the default instead of a fixed 16px.

---

## Fix 3: ZERO GAPS BETWEEN BLOCK ROWS

The `isBlockCellNotLast` logic removes `border-b` on mid-block rows but there are
STILL visual gaps. This is because:
1. The table has `border-collapse: separate` (default) — rows have spacing
2. Each cell may have a 1px border from the table default styling

**Fix:**
- On the `<table>`: add `style={{ borderCollapse: 'collapse', borderSpacing: 0 }}`
- On mid-block `<td>` cells (where `isBlockCellNotLast` is true):
  `style={{ borderBottom: 'none', padding: 0 }}`
- On the TimeSlotCell div for mid-block cells: ensure NO margin, NO padding, NO border
- The block should look like ONE continuous colored rectangle across all its rows

---

## Fix 4: SMART FILL RIBBON ACTUALLY COLLAPSES

The ribbon toggle hides the button text but keeps the same height.

**Fix:**
When collapsed, the ribbon should be `display: none` — completely hidden, 0 height.
Show a thin bar (24px) with just `[▼ Toolbar]` text that expands on click.
When expanded: show the full toolbar.

If this is too complex: just remove the "Smart Fill All" ribbon row entirely from the
Template Builder. Move "Smart Fill All" into the header bar as a button. That's one
fewer row.

---

## Fix 5: GENERATOR FILLS FULL DAY IN BOTH OPS

The generator stops after filling ~2 hours and leaves Op 2 empty.

Look at `src/lib/engine/generator.ts`:
- Find where it iterates over time slots and places blocks
- Find the condition that makes it STOP placing blocks
- The generator must continue placing blocks until ALL time slots (minus lunch) are filled
- For multi-op doctors: BOTH ops must get blocks
- Each op should be filled independently with stagger offset applied

**Key check:** Is the generator checking `production >= goal` and stopping?
If so: change it to `production >= goal && utilization >= 0.90`.
The schedule should be FULL even if the production goal is already met.

**Key check 2:** Is the generator iterating over ops? Or does it only fill Op 1?
For each provider with N ops, the generator must create a separate schedule for EACH op.

Add a test: doctor with 2 ops, 30-min stagger, $5000 goal →
assert both ops have blocks, total slots filled > 80%.

---

## Code Quality
- TypeScript strict
- `npm test` — 777 tests must still pass
- `npm run build` — must succeed
- Test the full screen mode visually: verify the grid takes 100% of viewport
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
