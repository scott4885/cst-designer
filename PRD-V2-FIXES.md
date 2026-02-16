# PRD: Schedule Template Designer v2 Fixes

## Project
- **Path:** /home/scott/.openclaw/workspace/schedule-template-designer-app
- **Framework:** Next.js
- **Deploy:** https://schedule-template-designer.netlify.app (Netlify, site ID: 07b37a82)
- **Do NOT deploy to production** — push to GitHub only

## Priority Issues (Fix in Order)

### 1. Light Mode Broken + Theme Toggle on Main Page
- Light mode does not work — fix it
- Move the Light/Dark mode toggle to the main page header — NOT hidden in Settings
- Theme toggle should be visible and accessible at all times

### 2. Excel Export — 10 Minute Increments
- Export currently only exports every 30 minutes — WRONG
- Must export in **10 minute increments** matching the calendar grid
- Every 10-min slot should appear as a row in the Excel output

### 3. Auto-Populate Existing Schedules
- If an office already has a schedule built, it should auto-populate when you open it
- Remove the need to click "Generate Schedule" for offices that already have saved data
- "Generate Schedule" should only be needed for NEW offices with no existing schedule

### 4. Responsive Layout + Scrollable Calendar
- Current layout prevents seeing "Next" buttons at the bottom
- **A)** Make the page more responsive — content should fit/flow properly
- **B)** Replace calendar pagination with scrollable view — user scrolls up/down to see the full schedule top to bottom
- No more paging — one continuous scrollable calendar view

### 5. Appointment Block Outlines
- When an appointment type spans multiple 10-min slots, show a visual outline/box around them
- Example: A 60-min Prophy = six 10-min blocks with a border/outline grouping them as one appointment
- Makes it visually clear where one appointment starts and ends

### 6. Duration Slider — 10 Minute Increments
- Appointment duration sliders currently use 15-min steps (30, 45, 60)
- Calendar uses 10-min time slots
- **Sync them:** Duration sliders must use 10-min increments (10, 20, 30, 40, 50, 60, etc.)

### 7. Day-of-Week Selector — Horizontal Layout
- Day selector above the appointment area overlaps the calendar
- **Fix:** Arrange days horizontally (Monday | Tuesday | Wednesday | Thursday | Friday) instead of stacked vertically
- Tighten up the spacing/design so nothing overlaps

### 8. Provider Settings — Full Edit Capability
- Currently you can only edit provider name/color after creation
- Need to be able to go back and edit ALL provider settings:
  - Appointment types they see
  - Whether they see new patients
  - Their role (Hygienist vs Dentist)
  - All original creation settings
- Bug: Creating an office with one dentist filled the entire day with "Crown Prep + Buildup" — no variety

### 9. Smart Appointment Intelligence (Rock/Sand/Water)
- The schedule generator needs "smart intelligence" for appointment blocks
- **Rock/Sand/Water concept:**
  - **Rock** = High production (Crown Prep, implants, etc.)
  - **Sand** = Medium production (fillings, etc.)
  - **Water** = Low/no production (exams, consults, etc.)
- **Hygiene providers** should default to a mix of: Prophy, Perio, New Patient
- **Doctors** should default to a mix of: ER time, High Production, Medium Production, Low/No Production spots, New Patient slots, Consult slots
- The generator should create a realistic, varied schedule — NOT fill the entire day with one appointment type
- This is the core value proposition of the tool

## Design Standards
- Match the existing aesthetic (Linear/Obsidian vibes)
- Full-width responsive design — no max-w-7xl
- Dark/light combo mode (light + dark + system)
- Clean, professional UI

## Testing
- Run existing test suite (62/62 should still pass)
- Test light mode, dark mode, and system mode
- Test Excel export with 10-min increments
- Test schedule auto-population for existing offices

## DO NOT
- Deploy to Netlify production
- Break existing test suite
- Use fake/placeholder data
