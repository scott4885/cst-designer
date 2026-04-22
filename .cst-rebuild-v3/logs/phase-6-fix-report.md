# Phase 6 — Fix Report

**Operator:** Claude (Opus 4.7)
**Session window:** 2026-04-21 19:30 → 2026-04-21 21:47 CT
**Trigger:** Phase 6 live smoke (`.cst-rebuild-v3/logs/phase-6-live-smoke.md`) surfaced 4 defects on Sprint 4 live build before Sprint 5 scope could open.
**Verdict:** **LIVE-GREEN**

---

## 1. Bug inventory (from phase-6-live-smoke.md)

| # | Priority | Rule / Behavior | Evidence on Sprint-4 live build |
|---|---------|------------------|--------------------------------|
| 1 | P0 | `aria-required-parent` | 267 nodes flagged by axe-core — direct grid children lacked `role="row"` |
| 2 | P0 | `color-contrast` + `link-name` | 30 contrast + 10 link-name failures across schedule-builder / sidebar / production summary |
| 3 | P1 | Ctrl+= / Ctrl+0 / Ctrl+- | keyboard zoom did not mutate `[data-sg-zoom]` attribute |
| 4 | P1 | Arrow-key navigation | arrow keys did not move focus cursor in grid |

---

## 2. Fix trail (per-bug → commit SHA)

### Bug 1 — `aria-required-parent` (267 → 0)

**Commit:** `b8cdaa4` (monorepo) / `53de525` segment (standalone)
**Files:**
- `src/components/schedule/v2/ScheduleGrid.tsx`
- `src/components/schedule/v2/__tests__/ScheduleGrid.test.tsx`

**Mechanism:**
- Moved `role="grid"` from outer container to the inner `.sg-grid-body` where rows actually live.
- Wrapped header row + each rendered `<GridRow>` in a `<div role="row">` that uses `display: contents` so CSS-grid layout is unaffected while ARIA sees row scope.
- Wrapped every column's `BlockInstance` overlay stack in `<div role="row" role="gridcell">` using `display: contents` (keyed with `aria-rowindex={rowCount + 2 + colIdx}`).
- Wrapped `DoctorFlowOverlay` in `role="row"` + `role="gridcell"` with `aria-hidden` (it's decorative flow, not tabular data).
- Updated the first `ScheduleGrid.test.tsx` a11y assertion: root node is `role="region"`, inner body is `role="grid"`.

### Bug 2 — `color-contrast` + `link-name` (40 → 0)

**Commits:** `be598d0` (Sidebar link-name) + `d4a71d5` (schedule-builder contrast)

**Sidebar link-name fixes (`src/components/layout/Sidebar.tsx`):**
- `aria-label={item.label}` on every nav `<Link>`.
- `aria-label="CST Home"` on collapsed brand link.
- `aria-hidden="true"` on decorative `<Icon>` and the single-char "S" brand span.

**Contrast fixes (all slate-400/300 / color-600 → darker-shade with higher font weight):**
- `src/app/offices/[id]/page.tsx` — production-summary emerald/amber/red `-600/-500` → `-800/-700`; `text-slate-400/300` → `text-slate-700/600`; added `font-medium` / `font-semibold`.
- `src/components/schedule-builder/BlockPalettePanel.tsx`
- `src/components/schedule-builder/PropertiesPanel.tsx`
- `src/components/schedule-builder/ProviderList.tsx`
- `src/components/schedule-builder/TemplatePicker.tsx`
- `src/components/schedule-builder/ToolbarRibbon.tsx` (inactive week tabs, variant section, Save outline, conflict badge text-size + `aria-label`)
- `src/components/schedule-builder/EmptyState.tsx`
- `src/components/schedule-builder/LeftSidebar.tsx`
- `src/components/schedule/ReviewPanel.tsx` (tierLabel now `font-semibold`)
- `src/components/schedule/BulkGoalsDialog.tsx` ((unnamed) placeholder)
- `src/components/schedule/CopyDayModal.tsx` (source/disabled target pills + helper text)

All replaced pairs clear 4.5:1 contrast (3:1 for ≥14pt bold) per WCAG 2.2 AA.

### Bug 3 — Ctrl+= / Ctrl+0 / Ctrl+- zoom

**Commit:** `b8cdaa4`
**File:** `src/components/schedule/v2/ScheduleGrid.tsx`

**Mechanism:**
- Removed the `ctrlKey||metaKey` branch from React `onKeyDown` (early return when ctrl-key is held; the React handler was firing alongside any document listener, causing double-zoom + double-stepping).
- Added a document-level `keydown` useEffect listener with an `isEditable()` guard (so typing in inputs doesn't steal focus) that calls `zoomIn` / `zoomOut` / `setZoom("default")` and writes `data-sg-zoom` on the root via the Zustand `use-schedule-view` store.
- Dropped `zoomIn`/`zoomOut`/`setZoom` from the React `onKeyDown` deps array (ESLint `exhaustive-deps` was pinning them in) since those callbacks no longer live in the React handler.

### Bug 4 — Arrow-key cursor movement

**Commit:** `b8cdaa4`
**File:** `src/components/schedule/v2/ScheduleGrid.tsx`

**Mechanism:**
- Added `handleCellClick(rowIdx, colIdx)` callback that seeds `cursor` state on click or arrow keypress.
- The existing arrow-key branch now resolves the new cursor via `Math.max(0, Math.min(rowCount-1, cur.row ± 1))` and mirrors for columns — confirmed live: `before=0,0 after=1,0 moved=true`.

---

## 3. Test-count before → after

| Suite | Before (Sprint 4 baseline) | After (Phase 6 fix) |
|-------|---------------------------|---------------------|
| Vitest | 1252 / 1252 | **1252 / 1252** — no delta, no regression |
| Playwright e2e | 73 passed + 12 skipped | **73 passed + 12 skipped** — no delta |
| ESLint | 0 warnings (`--max-warnings=0`) | **0 warnings** |
| Phase 6 live-smoke spec | 11/11 with failing a11y + zoom + arrow assertions | **11/11 green** — `axe violations=[]`, zoom default→expanded→default, arrow moved=true |

Golden fixtures untouched — no fixture regression.

---

## 4. Deploy trail

### Commit chain — monorepo `scott4885/personal`

Cherry-picked onto a clean branch off `origin/master` to sidestep the held-back 154MB obsidian commit `e951c8c`:

| SHA on master | Scope |
|---------------|-------|
| `b8cdaa4` | phase 6 fix: ScheduleGrid a11y + keyboard zoom/cursor (P0/P1) |
| `be598d0` | phase 6 fix: Sidebar link-name a11y (P0) |
| `d4a71d5` | phase 6 fix: WCAG AA color-contrast across schedule-builder (P0) |
| `6582a19` | phase 6: gitignore phase-6 live-smoke screenshots + scratch spec/config |

**Push:** `git push origin phase-6-only:master` → `a1c0cdd..6582a19 phase-6-only -> master` (fast-forward accepted — no force push used).

### Commit chain — standalone `scott4885/cst-designer`

Used the **clone-and-overwrite** pattern (Option B from Phase 5b, required because monorepo and standalone have fully-divergent SHA histories):

1. Cloned `https://github.com/scott4885/cst-designer.git` into `C:\Users\ScottGuest\.tmp-sync\cst-designer-standalone`.
2. Removed every top-level entry except `.git/`.
3. `cp -a` everything from `tools/cst-designer/.` into the clone.
4. `git add -A` → 26 files changed, 1646 insertions(+), 192 deletions(-).
5. Commit message preserves monorepo cherry-pick trail.

| SHA on main | Scope |
|-------------|-------|
| `53de525` | sync from monorepo: phase 6 a11y + WCAG AA contrast fixes |

**Push:** `git push origin main` → `dcddb3c..53de525 main -> main` (fast-forward).

### Coolify rebuild trigger

Via Coolify API using application UUID `ks00wk80goggko4wwckgokso` (the `App\Models\GithubApp` source discovered in Phase 5c):

```
POST http://142.93.182.236:8000/api/v1/deploy?uuid=ks00wk80goggko4wwckgokso&force=false
→ {"deployments":[{"message":"Application cst-designer deployment queued.",
                   "resource_uuid":"ks00wk80goggko4wwckgokso",
                   "deployment_uuid":"n4o40wgs4o0o84s0o8s4k8go"}]}
```

Polled `/api/v1/deployments/n4o40wgs4o0o84s0o8s4k8go` every 20s. Status transitions:

| T+ | Poll result |
|-----|-------------|
| 0s | `in_progress` |
| 9m 12s | `finished` |

No UI hand-off; entire deploy lifecycle API-driven.

---

## 5. Live verification

### Headers (ETag rotation)

| Target | Before (Phase 5c) | After (Phase 6) |
|--------|-------------------|-----------------|
| `GET /` | `184eud1icrqobe` | `12bjgf5fbk4oii` **changed** |
| `GET /offices` | `uwjpi7z1h2obe` → 307 | `npiur62v5o7d5` → 307 **still redirecting** |

### Phase 6 spec against live (`PHASE6_TARGET=live`)

11/11 passed:

```
ok 1 [chromium-live] 1920 — / root page + HTTP health (8.3s)
ok 2 home screenshot @ 1920px
ok 3 home screenshot @ 1440px
ok 4 home screenshot @ 1280px
ok 5 home screenshot @ 1024px
ok 6 home screenshot @ 768px
ok 7 /offices → redirect to / (450ms)
ok 8 /offices/[id] renders V2 ScheduleGrid (or sensible empty state) (5.0s)
ok 9 toolbar Generate → generation fires (6.7s)
ok 10 populated schedule visual + UX-L contracts (8.0s)
ok 11 a11y probe + axe-core scan (7.7s)

11 passed (51.5s)
```

### A11y scan payload (`06-a11y.json`)

```json
{
  "axeResults": { "violations": [], "passCount": 28, "incompleteCount": 2 },
  "a11yProbe": {
    "gridCount": 1,
    "colHeaderCount": 3,
    "rowHeaderCount": 66,
    "gridCellCount": 199,
    "ariaLiveCount": 2,
    "buttonsWithoutName": 0,
    "positiveTabindex": 0
  },
  "log": { "consoleErrors": [], "pageErrors": [], "requestFailures": [] }
}
```

### UX interactions payload (`05-ux-interactions.json`)

```json
{
  "hasBlock": true,
  "zoom": { "z0": "default", "z1": "expanded", "z2": "default" },
  "arrowMoved": "before=0,0 after=1,0 moved=true",
  "docToggleVisible": true
}
```

- **Ctrl+=** rotates `[data-sg-zoom]` from `default` → `expanded` ✓
- **Ctrl+0** rotates `expanded` → `default` ✓
- **ArrowDown** moves cursor `0,0 → 1,0` ✓

---

## 6. What was held back (task-rule compliance)

- **`e951c8c`** (154MB obsidian-vault sync) still sits at origin/master between `a1c0cdd` and the phase-6 cherry-picks. Per task rules, not amended/reset. Phase 6 cherry-picked **past** it onto a temporary branch, then pushed as fast-forward; no force-push, no history rewrite.
- No existing Vitest/Playwright baseline was modified. Only one test file (`ScheduleGrid.test.tsx`) had a single assertion **relaxed to match the new intentional role placement** (grid role moved to inner element). All other 1252 tests unchanged.
- No golden fixture edits.

---

## 7. Final verdict

**LIVE-GREEN.**

All 4 Phase 6 defects fixed, committed in logical chunks to both `scott4885/personal:master` and `scott4885/cst-designer:main`, Coolify rebuild triggered via API and completed cleanly. Live smoke at `http://cst.142.93.182.236.sslip.io/` shows ETag rotation, zero axe violations, keyboard zoom + arrow-key navigation working. Vitest 1252/1252, Playwright 73/12, ESLint 0 warnings — baselines intact.

Sprint 5 scope is unblocked.

---

## 8. Artifacts

| Path | What |
|------|------|
| `.cst-rebuild-v3/logs/phase-6-fix-report.md` | This report |
| `.cst-rebuild-v3/logs/phase-6-live-smoke.md` | Original pre-fix smoke report that identified the 4 bugs |
| `.cst-rebuild-v3/logs/phase-6-screenshots/06-a11y.json` | Post-fix axe-core payload (violations=[]) |
| `.cst-rebuild-v3/logs/phase-6-screenshots/05-ux-interactions.json` | Post-fix zoom + arrow probe |
| `.cst-rebuild-v3/logs/phase-6-screenshots/*.png` | Post-fix visual screenshots at 5 breakpoints |
| `playwright.phase6.config.ts` | Config for live target (gitignored) |
| `e2e/qa-phase6-live-smoke.spec.ts` | Spec (gitignored — scratch/live-only) |
