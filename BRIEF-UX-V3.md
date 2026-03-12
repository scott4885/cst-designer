# Schedule Template Designer — UX V3 Fixes
## 6 Issues from Scott's Testing

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Issue 1: Office Info Sidebar Access

The office info sidebar was removed from Template Builder but Scott found it helpful.

**Fix:** Add a toggle button in the header bar — "ℹ️ Office Info" — that opens the office
info panel as a **slide-over drawer from the left** (overlays on top of the schedule, doesn't
push it). Contains: providers list, working days, DPMS system, block palette.
Drawer closes when clicking outside it or pressing Escape.
This way it's accessible but doesn't steal permanent space.

---

## Issue 2: Schedule Only Shows ~1 Hour — Need Full Day Visible

The schedule grid viewport is too small vertically. Scott can only see about 1hr 10min
of the day. The grid needs to show the FULL working day (8am-5pm = 9 hours).

**Fix:**
- Remove `max-height` and `min-height` constraints on the schedule grid container
- The grid should use the FULL remaining viewport height: `calc(100vh - headerHeight)`
- The grid should scroll vertically to show the full day
- Better yet: make the row height smaller so more time slots fit on screen.
  With 10-min increments, 9 hours = 54 rows. At 24px/row that's 1296px — fits in a
  single screen if rows are ~16-18px high.
- Add a `rowHeight` setting: default to a size that fits 8am-5pm in the viewport
  without scrolling (approximately 14-16px per row on a 1080p screen)
- The zoom controls should adjust this row height

---

## Issue 3: White Lines Between 10-Min Increments Within Blocks

Blocks that span multiple time slots (e.g., a 60-min Crown Prep = 6 rows at 10-min
increments) show visible white gaps/lines between each 10-min row.

**Fix:**
- Remove `border-bottom` on rows that are part of the same block
- Only show a border at the TOP of each block and at hour boundaries
- Within a contiguous block, rows should have NO gap, NO border — they should look
  like one continuous colored rectangle
- Implementation: when rendering a cell, check if the NEXT cell has the same block.
  If yes, remove the bottom border. If no (block ends), show the border.
- The block label should appear in the FIRST row only. Subsequent rows of the same
  block should be blank (just the color fill).

---

## Issue 4: Collapsible Ribbon/Toolbar at Top

The toolbar rows at the top still take too much vertical space.

**Fix:** Make the entire toolbar area a **collapsible ribbon**.
- Small toggle chevron `▲`/`▼` at the right edge of the toolbar
- When collapsed: show ONLY the office name + day tabs + Save/Generate buttons in a single thin bar (~36px)
- When expanded: show all action buttons, quick actions, etc.
- Default: **collapsed** on Template Builder to maximize schedule visibility
- Persist state to localStorage

---

## Issue 5: Zoom In/Out Don't Work

The zoom controls are present but non-functional.

**Fix:**
- Zoom should adjust the `rowHeight` (pixels per time slot)
- Zoom in = taller rows (more detail, less day visible)
- Zoom out = shorter rows (less detail, more day visible)
- Default zoom should show the full day on screen
- Zoom range: 12px (very compact) to 40px (detailed) per row
- Store zoom level in the component state or localStorage
- The zoom buttons must actually call a handler that updates the row height state
- The grid must re-render with the new row height

---

## Issue 6: Generator Only Fills 2 Hours, Nothing in 2nd Op

The schedule generator is only filling a small portion of the doctor's day and leaving
the second operatory completely empty.

**Investigation & Fix:**
- Check `src/lib/engine/generator.ts` — the main generation function
- The generator should fill the ENTIRE working day for each provider
- For a doctor with 2 ops and stagger: Op 1 should be filled, Op 2 should be filled
  with staggered blocks
- Check if the generator is hitting the production goal too early and stopping
- Check if the production target is calculated correctly (shared pool across ops)
- Check if the generator loop iterates through ALL available time slots, not just the first few
- Check if the block types available have the right durations and production amounts
- The generator should place blocks until either:
  a) All time slots are filled (minus lunch), OR
  b) The production goal is exceeded AND at least 75% of slots are filled
- It should NEVER leave the second op completely empty when the doctor has 2 ops configured

**Debug approach:**
1. Create a test case: doctor with $5000 goal, 2 ops, 10-min increment, 8am-5pm
2. Run generator
3. Assert: both ops have blocks placed, total slots filled > 75%

---

## Code Quality
- TypeScript strict
- `npm test` — 773 tests must pass
- Add tests for: continuous block rendering (no gaps), zoom functionality, generator filling full day
- `npm run build` — must succeed
- Commit and push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
- What was fixed per issue
- Test count
- Push confirmation
