# BRIEF — Sprint 4: P3 Intelligence & Advanced Features
**App:** Schedule Template Designer  
**Path:** `/home/scott/.openclaw/workspace/schedule-template-designer-app`  
**PRD:** `/home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md`  
**Priority:** P3 — smart generation, D/A/H time logic, full provider edit, doctor rotation

---

## Context

Sprints 1–3 are complete. 271 tests passing, 0 failing. TypeScript clean.
- Sprint 1: P0 bugs (role sticky, stagger, multi-op, scrolling, PDF)
- Sprint 2: P1 features (save, production calc, Excel export, block labels, borders)
- Sprint 3: P2 enhancements (HP thresholds, time increment, Provider ID, DPMS dropdown, block grouping, theme toggle)

This sprint targets the "intelligence" layer — schedule generation, D/A/H time models, and advanced editing.

**⚠️ GitHub push is still broken (expired token). Commit locally only with clear commit messages. Do NOT push.**

---

## Sprint 4 — P3 Tasks (priority order)

### 1. Rock/Sand/Water Schedule Generator (§7)

**Goal:** A "Generate Smart Schedule" button that auto-fills a provider's day using the Rock/Sand/Water production mix.

**Model:**
| Tier | Category | Target % of Daily Goal |
|------|----------|------------------------|
| Rock | High production (fee > HP threshold) | 75% |
| Sand | Medium production | remaining capacity |
| Water | Fill/exams/consults | buffer |

**Requirements:**
- "Generate Schedule" button in Template Builder (per provider, per day)
- Generator pulls from the office's Appointment Type Library
- Rocks placed first until 75% of daily production goal is reached
- Sand fills remaining capacity; Water fills any remaining open time
- Emergency/urgent time block included (1–2 slots, typically AM)
- New Patient slots: max 2 per day
- Lunch block placed at configured lunch time
- No single appointment type fills the entire day (variety enforced)
- Doctor and Hygienist have different default mixes (§7.2 and §7.3):
  - Doctor: Emergency + Rock + NP + Consult + Sand
  - Hygienist: Recare/Prophy majority + Perio Maintenance + NP Hygiene Exam + SRP
- Generated output is fully editable (blocks can be moved/removed after generation)
- Generator respects office time increment (10 or 15 min)

**Acceptance Criteria:**
- [ ] Generate button visible in Template Builder
- [ ] Generated doctor schedule: ≥75% of goal from Rock appointments
- [ ] Emergency block present
- [ ] No single appt type repeated for entire day
- [ ] Hygienist generates Prophy-majority day
- [ ] All blocks editable after generation

---

### 2. D/A/H Time Scheduling Per Appointment Type (§3.4 & §3.5)

**Goal:** Appointment types in the library should define exact D Time, A Time, and H Time segments. The template grid displays these as visual sub-segments within the block.

**Doctor Appointments (§3.4):**
- Each appointment type has: D Time (doctor hands-on) + A Time (assistant solo)
- Doctor column in template labeled "S" (not a floating "D")
- Block rows show D/A sequence from the appointment library
- D and A rows visually distinguishable (color or label)

**Hygiene Appointments (§3.5):**
- Hygiene appointment types: H Time + D Time only (no A Time)
- H Time fills majority; D Time is an overlay (doctor pops in to exam)
- D Time minimum start: minute 20 (cannot be earlier than 20 min into the appointment)
- Default D Time auto-populated at creation (e.g., minute 25–35 for a 60-min appt)
- D Time is editable; displayed as a movable window within the hygiene block
- D Time placement constraint enforced (≥ minute 20)

**Acceptance Criteria:**
- [ ] Appointment Type Library form: D Time + A Time fields for doctor appts
- [ ] Hygiene appt form: H Time + D Time fields only; no A Time
- [ ] D Time start for hygiene: ≥ minute 20 (validation error if earlier)
- [ ] Template Builder renders D/A segments visually within each block
- [ ] D Time placement editable for hygiene appointments

---

### 3. Full Provider Edit Capability

**Goal:** Providers should be fully editable after creation — not just name/role but all fields.

**Requirements:**
- Edit button on each provider in the provider list
- Edit form opens with all current values pre-filled:
  - Name, Role, Provider ID, operatories assigned, production goal, stagger setting
- Save updates the provider and refreshes the Template Builder
- Delete provider: confirmation dialog, removes from all schedule templates

**Acceptance Criteria:**
- [ ] Edit button on each provider
- [ ] All fields pre-filled in edit form
- [ ] Save updates provider + Template Builder without full reload
- [ ] Delete with confirmation dialog

---

### 4. Doctor Rotation Logic — Time Increment Snapping (§5.5)

**Goal:** Doctor rotation between operatories must snap to the office's time increment.

**Requirements:**
- Rotation events (when doctor moves from Op 1 to Op 2) snap to 10-min or 15-min boundaries
- No mid-increment rotation scheduling
- Stagger offset already uses increment-aligned values (Sprint 2 implemented) — this is about ensuring rotation within blocks also snaps correctly
- Visual indicator in Template Builder showing doctor rotation time

**Acceptance Criteria:**
- [ ] 10-min office: rotation events snap to :00, :10, :20, etc.
- [ ] 15-min office: rotation events snap to :00, :15, :30, :45
- [ ] No mid-increment times in rotation schedule

---

### 5. Working Hours Per-Day Detail

**Goal:** Office hours should be configurable per day of the week (not just a global start/end time).

**Requirements:**
- In Office Settings, per-day working hours: Mon–Fri individual start/end times
- Saturday/Sunday optional (can be marked "Closed")
- Template Builder renders only the hours for the selected day
- Days marked "Closed" disable the template tab for that day

**Acceptance Criteria:**
- [ ] Per-day hours visible in Office Settings
- [ ] Monday can have different hours than Friday
- [ ] Closed day: Template Builder tab grayed out or hidden
- [ ] Hours persist on reload

---

## Implementation Notes

1. **Prioritize tasks 1–3.** Tasks 4–5 are nice-to-have if time allows.
2. **Run `npm test` before and after.** Target: 290+ tests passing, 0 failing.
3. **TypeScript must remain clean** (exit 0).
4. **Commit each feature separately** with scoped messages (e.g., `feat: Rock/Sand/Water generator (§7)`).
5. **Do NOT push to GitHub** — token expired. Commit locally only.
6. **Do NOT break Sprints 1–3 features.**

---

## Deliverable

Return a summary of:
- Which features were implemented (and which skipped, if any)
- Test count before / after
- TypeScript status
- Local commit SHAs
