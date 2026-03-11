# BRIEF — Sprint 3: P2 Enhancements
**App:** Schedule Template Designer  
**Path:** `/home/scott/.openclaw/workspace/schedule-template-designer-app`  
**PRD:** `/home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md`  
**Priority:** P2 enhancements — role-based thresholds, office settings, provider fields, visual polish

---

## Context

Sprint 1 (P0 bugs) and Sprint 2 (P1 features) are complete. 238 tests passing. Sprint 3 targets P2 enhancements from the PRD. The app is a Next.js app with TypeScript, Jest tests, and localStorage persistence.

**⚠️ Note:** GitHub push is currently failing (expired token). Commit your work locally and note the commit SHAs. Push will be resolved separately by ops.

---

## Sprint 3 — P2 Tasks (in priority order)

### 1. High Production Thresholds — Role-Based (§6.2)

**Goal:** Differentiate "high production" thresholds by provider role.

**Requirements:**
- Doctor threshold: > $1,000 per appointment = High Production
- Hygienist threshold: > $300 per appointment = High Production
- Threshold is determined by provider's role (not a global setting)
- Color indicator in Production Summary respects role-appropriate threshold
- 75% goal attainment: 75% of daily production goal should come from high-production slots
- Add "HP" badge or visual indicator on high-production appointment blocks in the template

**Acceptance Criteria:**
- Dr. places $1,200 procedure → HP indicator shown
- Dr. places $900 procedure → no HP indicator
- Hygienist places $320 procedure → HP indicator shown
- Hygienist places $280 procedure → no HP indicator
- Production Summary shows HP% alongside total

---

### 2. Time Increment — Office Setting (§1.2)

**Goal:** Add a "Time Increment" field to Office Settings (10 min / 15 min). The whole grid, stagger options, and export should already respect this — but ensure the **setting UI** is present and persists.

**Requirements:**
- "Time Increment" dropdown in Office Settings: options = 10 min (default), 15 min
- Changing the increment should trigger a warning if existing appointment types have incompatible durations
- Time increment persists on reload
- Verify: stagger dropdown options update when increment changes (Sprint 2 implemented constrained stagger, it should already read from `currentOffice.timeIncrement`)
- Verify: Excel export uses the office's time increment (Sprint 2 fixed this — just verify it hooks correctly)

**Acceptance Criteria:**
- [ ] Time Increment field visible in Office Settings
- [ ] Default is 10 min
- [ ] Setting persists on reload
- [ ] Changing to 15 min updates stagger options to 0,15,30,45,60

---

### 3. Provider ID Field (§1.3)

**Goal:** Add a Provider ID text field to the provider setup form.

**Requirements:**
- "Provider ID" text input adjacent to Role dropdown in provider setup
- Free-text, alphanumeric (e.g., "DG001", "DR-01"), optional but recommended
- Flagged with a soft warning if empty (e.g., "Recommended for DPMS export")
- Persists on save/reload
- Included in export payloads (Excel export column, if provider column header exists)

**Acceptance Criteria:**
- [ ] Provider ID field visible in provider setup
- [ ] Saves and persists on reload
- [ ] Accepts alphanumeric + hyphen input
- [ ] Shows recommended badge when empty

---

### 4. DPMS System Library Dropdown (§1.1)

**Goal:** Replace free-text DPMS field with a managed dropdown.

**Requirements:**
- DPMS dropdown in practice setup with these options:
  - Open Dental
  - Dentrix
  - Eaglesoft
  - Curve Dental
  - Carestream
  - DSN
  - Other
- "Other" and "DSN" are valid; when selected, no import/sync button shown in Template Builder
- Selection persists on reload
- (Admin management UI is Phase 2 — skip for now; hardcode the list)

**Acceptance Criteria:**
- [ ] DPMS shows as dropdown (not free-text)
- [ ] All 7 options present
- [ ] Selection persists
- [ ] "Other"/"DSN" hides import integration UI (if any exists)

---

### 5. Appointment Block Visual Grouping (§4.4)

**Goal:** Multi-row appointment blocks should have a visible outer border grouping all rows.

**Requirements:**
- When an appointment spans multiple time slots (e.g., 60-min = 6 × 10-min rows), all rows get one outer border/box grouping them as a unit
- Outer border is visually distinct from the internal row lines
- Makes block start/end boundaries clear at a glance
- Consistent across D, A, H rows within the same block

**Acceptance Criteria:**
- [ ] 60-min NP Consult: outer border spans all 6 rows
- [ ] 30-min Recare: outer border spans all 3 rows
- [ ] Single-row appointments (10-min): existing border unchanged
- [ ] Visually distinct from adjacent blocks

---

### 6. Theme Toggle — Header Placement (§4.6)

**Goal:** Move light/dark mode toggle to the main page header (top-right).

**Requirements:**
- Theme toggle button visible in main header at all times (not only in Settings)
- Supports: Light, Dark, System
- Light mode fully functional (fix any rendering issues in light mode)

**Acceptance Criteria:**
- [ ] Toggle visible in header on all pages
- [ ] All three modes work
- [ ] Light mode has no broken styles

---

## Implementation Notes

1. **No GitHub push needed** — commit locally only. Use clear commit messages per feature (e.g., `feat: add role-based HP thresholds (§6.2)`).
2. **Run tests after each feature** — do not merge features that break existing tests.
3. **Target: 250+ tests passing, 0 failing** at end of sprint.
4. **Don't break Sprint 1/2 work** — role sticky, stagger, save function, production calc are all implemented and tested.
5. **Prioritize features 1-3** (HP thresholds, time increment, provider ID) — they have the most downstream impact.

---

## Deliverable

Return a summary of:
- Which features were implemented
- Test count before / after
- Any features skipped and why
- List of local commit SHAs
