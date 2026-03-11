# Schedule Template Designer — Sprint 1 Brief (P0 Critical Bugs)

## App
- **Path:** /home/scott/.openclaw/workspace/schedule-template-designer-app
- **Framework:** Next.js (App Router, TypeScript, Zustand state, Prisma/SQLite, TailwindCSS, shadcn/ui)
- **Deploy:** VPS Coolify container (port 3000) — push to GitHub, do NOT deploy
- **GitHub:** scott4885/schedule-template-designer (use GITHUB_TOKEN from env)

## Your Mission
Fix all P0 critical bugs listed below. Work through them sequentially. After each fix, run the test suite. Write tests for each fix. Do not move on until tests pass.

## PRD Reference
Full PRD at: `/home/scott/.openclaw/workspace/output/reports/schedule-designer-prd-v2.md`

---

## Sprint 1 — P0 Bugs to Fix

### Bug 1: Provider Role Sticky Bug (PRD §1.4)
**Problem:** When adding a new provider and selecting "Hygienist", ALL existing providers get changed to Hygienist.
**Fix:** Provider role must be stored per-provider in its own state slice. No shared role state across providers. Fix in the store and in any component that reads/writes role.
**Test:** Provider A = Dentist, Provider B = Hygienist → Save → reload → both retain independent roles.

### Bug 2: Provider Role Display in Template Builder (PRD §1.5)
**Problem:** Providers configured as "Dentist" display as "Hygienist" in the Template Builder. Workaround is to re-save the provider.
**Fix:** Template Builder must read provider role from the persisted data source (DB/store), not from a stale state snapshot. Root cause is likely state not being re-fetched when Template Builder mounts.
**Test:** Set to Dentist → Save → open Template Builder → shows Dentist (no workaround needed).

### Bug 3: Stagger Time Persistence Bug (PRD §2.3)
**Problem:** Doctor Start Stagger value is lost after Save → Edit cycle.
**Fix:** Persist stagger value in the schedule template data model. On load/Edit, populate the stagger field from the saved value. Stagger = 0 must persist (not treated as null/undefined).
**Test:** Set stagger = 10 → Save → Edit → shows 10. Set stagger = 0 → Save → Edit → shows 0 (not blank).

### Bug 4: Multi-Op Display — All Columns Rendering (PRD §5.2)
**Problem:** When a doctor has 2+ operatories assigned, only the first shows as a column in Template Builder.
**Fix:** Template Builder must iterate over ALL assigned operatories and render one column per op. Each column is independent. Stagger offset visually shifts Op 2 start time.
**Test:** Assign Dr. A to Op 1 + Op 2 → Template Builder → shows 2 columns. Assign 3 ops → 3 columns.

### Bug 5: Production Goal Per-Op Bug (PRD §5.4)
**Problem:** Each operatory is independently assigned the FULL production goal. 3-op doctor shows 3× goal as projected production.
**Fix:** Production goal lives at the DOCTOR level. All ops combined = goal. Aggregate production total displayed in Production Summary. Per-op breakdown available as secondary.
**Test:** Dr. goal = $3,000; 3 ops → Production Summary shows $3,000 combined (not $9,000).

### Bug 6: Scrollable Template View (PRD §4.2)
**Problem:** Cannot scroll down to see full day's template. Content is clipped.
**Fix:** Template Builder must be fully scrollable vertically. Provider/column headers sticky during scroll. All time slots accessible.
**Test:** 8AM–6PM schedule → scroll down → 5PM–6PM rows visible. Headers stay at top.

---

## Also Fix (Carry-Over from Previous PRD)

### Bug 7: Time Block Label No-Repeat (PRD §4.1)
A 60-min appointment block has 6 × 10-min rows. Currently shows the appointment name in all 6 rows. Show name ONLY in row 1. Rows 2–6 show D/A/H indicator only.

### Bug 8: Block Border Thickness (PRD §4.3)
Increase appointment block border thickness by 1–2 pixels. Apply consistently across all block types.

### Bug 9: Excel Export — 10-Minute Rows (PRD §8.1)
Excel export currently exports every 30 minutes. Must export one row per 10-minute increment (matching the schedule grid). 8AM–5PM = 54 rows.

### Bug 10: Production Calc — Per-Block Not Per-Row (PRD §6.1)
Production summary must count each appointment block once at its configured fee. NOT multiply fee × number of 10-min rows in the block. 1 × NP Consult at $350 = $350, not $2,100.

---

## Code Quality Rules
- TypeScript strict — no `any` unless absolutely necessary
- Run `npm test` after every fix — all 62+ tests must pass
- Write a test case for each bug you fix
- No console.log left in production code
- Commit after each bug fix: `git commit -m "fix: [description]"`
- Push to GitHub at the end: `git push origin main`

## Output
When done:
1. List all bugs fixed with commit hashes
2. Report final test count (should be 62 + your new tests)
3. Note any bugs you couldn't fully fix and why
4. Note any new issues you discovered while working
