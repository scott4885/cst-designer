# QA Report — Schedule Template Designer
_Tested: 2026-02-16 11:30 PM CT_

## Test Results

### Homepage
- ✅ Page loads correctly
- ✅ "New Office" button navigates to `/offices/new`
- ✅ Empty state with illustration shown when no offices
- ✅ "Load Demo Data" button present
- ✅ Search box renders

### Create New Office
- ✅ All 4 tabs accessible (Practice Foundation, Providers, Clinical Timing, Schedule Rules)
- ✅ Office name input works
- ✅ DPMS dropdown works (Dentrix, Open Dental, Eaglesoft, Denticon)
- ✅ Working days toggle buttons work (Mon-Fri)
- ✅ Add Provider creates provider card with all fields
- ✅ Provider role dropdown works (Doctor/Hygienist)
- ✅ Daily goal, color, working hours, lunch break fields present
- ✅ Multiple providers can be added
- ✅ Provider delete button present
- ✅ "Create Office" saves and redirects to office detail page
- ✅ Toast "Office created successfully!" shown
- ❌ **🔴 CRITICAL: No operatory assignment on provider form** — Providers have an `operatories` field in the data model but no UI to assign operatories. Users can't map doctors/hygienists to specific ops.
- ❌ **🟡 MEDIUM: NP Blocks Per Day / SRP Blocks Per Day missing from Schedule Rules** — These fields exist in `ScheduleRules` type but aren't exposed in the form. Only NP Model, HP Placement, Double Booking, and Matrixing are shown.
- ⚠️ **🟢 LOW: No form validation feedback on empty office name** — Can click through tabs without entering a name (validation only triggers on submit)

### Office Detail Page
- ✅ Schedule generates for all 5 days with toast notifications per day
- ✅ Day tabs switch correctly (Mon-Fri)
- ✅ ScheduleGrid renders with time column + provider columns
- ✅ Staffing codes (D, A, H) display correctly in dedicated column
- ✅ A→D→D→A pattern visible on doctor blocks (assistant setup/teardown)
- ✅ Block labels and production amounts display (e.g., "Crown prep + buildup>$1200")
- ✅ Lunch break slots render correctly (13:00-14:00)
- ✅ "D" appears in hygienist columns for doctor exam matrixing
- ✅ Export button enabled after generation
- ✅ Open Dental export button enabled after generation
- ✅ Production Summary shows per-provider and total metrics
- ✅ Schedule Alignment score displays (69% in test)
- ✅ "Show category breakdown" expandable button works
- ✅ Production Mix donut chart renders with category breakdown
- ✅ Combined/per-provider view toggle buttons work
- ✅ Edit button links to edit page
- ✅ Delete office button present
- ⚠️ **🟡 MEDIUM: Hygienist daily goal defaults to $5,000** — This is unrealistically high for a hygienist (typical: $1,200-$2,000). Causes "Under" status on every hygienist. Should default to ~$1,500 when role is Hygienist.
- ⚠️ **🟡 MEDIUM: No visual distinction for "Dr. Exam" slots in hygiene column** — The `D` code appears in the hygienist column (e.g., 08:50, 11:30) but there's no special styling, icon, or "DX" badge to differentiate it from a regular doctor slot. It just shows "D" which could confuse users.
- ⚠️ **🟢 LOW: Block labels truncated** — "Crown prep + buildup>$1200" is long. On narrow viewports this could overflow. Consider shorter labels or tooltips.

### Interactive Schedule Editing
- ✅ "Editing" helper text shown ("Click empty slots to add blocks...")
- ✅ Drag handles described in tooltip
- ⚠️ **🟡 MEDIUM: No empty slots to test click-to-add** — The generator fills 100% of available time, leaving zero empty slots. Users can't click to add blocks because there's nowhere to click. Need ability to clear individual blocks first OR have the generator intentionally leave some flex time.

### Appointment Library
- ✅ Page loads with 9 default types
- ✅ Stats row shows correct counts (9 total, 5 doctor, 4 hygienist, 0 custom)
- ✅ Role filter buttons work (All, Doctor, Hygienist, Both)
- ✅ Each type shows label, role, duration range, min production
- ✅ Edit button on each type
- ✅ "New Type" button present
- ✅ "Reset Defaults" button present
- ✅ Types include descriptions

### Settings
- ✅ Time increment selector present (5, 10, 15, 30 min)
- ✅ Theme toggle (dark/light) works from header

### Navigation
- ✅ Sidebar links work (Offices, Appt Library, Settings)
- ✅ Breadcrumb navigation on office pages (Offices > Office Name)
- ✅ Back button on office detail page

---

## Issues Summary (Prioritized)

### 🔴 Critical (1)
1. **No operatory assignment UI on provider form** — Core feature missing. Can't assign doctors/hygienists to specific ops. The data model supports it but the form doesn't expose it.

### 🟡 Medium (4)
2. **NP/SRP blocks per day not configurable** — Schedule Rules tab missing these controls
3. **Hygienist daily goal defaults to $5,000** — Should default to ~$1,500 for hygienists
4. **No "Dr. Exam" visual indicator in hygiene columns** — D code in hygienist column needs distinct styling
5. **No empty slots for manual block placement** — Generator fills 100% of time, blocking click-to-add workflow

### 🟢 Low (1)
6. **Block label overflow on narrow viewports** — Long labels like "Crown prep + buildup>$1200" may clip

---

## Recommendations
1. Add operatory section to office form with custom naming + provider assignment with limits (doc ≤5, hyg ≤2)
2. Add NP/SRP blocks per day spinners to Schedule Rules tab
3. Set hygienist daily goal default to $1,500
4. Add "DX" badge + amber/orange tint for doctor exam slots in hygienist columns
5. Have generator leave 1-2 "flex" slots empty per half-day for manual additions
6. Add text truncation + tooltip for long block labels
