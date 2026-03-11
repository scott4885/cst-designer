# Schedule Template Designer — Sprint 12 Brief
## Multi-Office Management + Template Cloning + Schedule Comparison

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## Context

The tool currently manages each office independently with no way to share work across offices.
In a DSO/group practice context (Gen4 has 265 offices, SGA has 148), users need to:
- Clone a successful template to other similar offices
- Compare two offices' schedules side-by-side
- Apply bulk changes to a group of offices with similar profiles
- Search and filter the office list by meaningful criteria

---

## Task 1: Template Cloning — Copy Schedule to Another Office

On the office detail page and Template Builder, add a **"Clone Template"** action.

### UI
- Button: "📋 Clone to Another Office" in the Quick Actions toolbar (add to sprint 11 toolbar)
- Opens a modal: searchable list of all offices, checkbox multi-select
- Option: "Clone which weeks?" — checkboxes for A / B / C / D (only shown if rotation enabled)
- Option: "Clone which days?" — Mon/Tue/Wed/Thu/Fri checkboxes (default all checked)
- Option: "Clone appointment library too?" — toggle (default: no — keeps target office's own library)
- Confirm button: "Clone to X offices"

### Logic
- For each target office + selected day + selected week:
  - Copy all slots from source → target (using target office's providers by role match)
  - Provider matching: match by role (DOCTOR → DOCTOR, HYGIENIST → HYGIENIST, by index)
  - If source has 2 doctors and target has 1 doctor: clone first doctor's schedule only, warn about unmatched
  - If source has 1 doctor and target has 2: clone to doctor 1 only, leave doctor 2 empty
- Show success summary: "Cloned to 5 offices. 2 offices had provider count mismatches."

### Acceptance Criteria
- [ ] Clone modal opens from Quick Actions toolbar
- [ ] Multi-select target offices
- [ ] Day/week/library options work
- [ ] Provider role matching with mismatch warnings
- [ ] Success summary shown

---

## Task 2: Office Search + Filters on Dashboard

The main dashboard (`/`) currently shows all offices in a simple grid. Upgrade:

**Search**: existing search bar → extends to also search by DPMS system, provider count

**Filter sidebar** (collapsible left panel):
- DPMS System (multi-select checkboxes: Open Dental, Dentrix, etc.)
- Provider count (0–1, 2–3, 4+)
- Schedule status (Has schedule / No schedule yet)
- Quality score range (0–59 / 60–74 / 75–89 / 90–100)
- Working days (4-day week / 5-day week)

**Sort options** (dropdown):
- Name A–Z (default)
- Quality Score (high → low)
- Production Goal (high → low)
- Last Updated

**Office cards** — upgrade to show more at a glance:
- Quality score badge (🟢/🟡/🟠/🔴) — if schedule exists
- DPMS system tag
- Provider count
- Schedule status ("Schedule Ready" / "No Schedule")
- Days per week

---

## Task 3: Side-by-Side Schedule Comparison

Add a **"Compare"** view: select two offices, see their Monday schedules side-by-side.

Route: `/compare?a={officeIdA}&b={officeIdB}&day=MONDAY`

### UI
- Two ScheduleGrid instances rendered side-by-side (read-only)
- Day selector at top (applies to both)
- Comparison stats below each grid:
  - Total scheduled production
  - Quality score
  - Procedure mix breakdown (donut or bar chart)
  - Provider count / op count
- Highlight differences: if Office A has a Crown Prep at 9:00 and Office B doesn't, mark that slot with a subtle indicator
- "Clone A → B" button in header if user wants to apply A's schedule to B

### Access
- "Compare" button on each office card → selects first office, then prompts to pick second
- Or: `/compare` page with two searchable office dropdowns

---

## Task 4: Bulk Provider Goal Update

Allow updating production goals for multiple offices at once.

On the main dashboard: "Bulk Edit" mode toggle.

When active:
- Office cards get a checkbox
- Select multiple offices
- "Update Goals" button appears at top
- Modal: set daily goal per role (Doctor: $_____, Hygienist: $_____)
- Applies to ALL providers of that role across all selected offices
- Confirmation: "Update goals for 12 offices (24 providers)"

---

## Code Quality
- TypeScript strict
- `npm test` — 482 tests must still pass
- Write tests for: clone logic (provider role matching), filter/search, comparison stats
- Commit each task separately
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
