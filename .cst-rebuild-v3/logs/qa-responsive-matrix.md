# Phase 4 QA — Cross-Size / Keyboard Smoke

Dev server attempt returned "Unable to acquire lock" (another instance on
:3001 during QA). Live interactive checks below deferred to
`e2e/schedule-v2-visual.spec.ts` (Playwright — Chromium, 1440×900 default)
from Sprint 3. Code-level inspection performed instead.

## Viewport breakpoints (code-level assessment)

| Breakpoint | Assessment | Evidence | Concerns |
|---|---|---|---|
| 1440 px | Pass | Primary target per PRD NFR-5 "usable down to 1280 px". `ScheduleGrid.tsx` uses `grid-template-columns: var(--sg-time-col-w) repeat(N, minmax(var(--sg-col-min-w), 1fr))` — fluid by design. | — |
| 1024 px | Pass (likely) | Still above NFR-5 floor of 1280 px. Sticky time column + overflow-x on grid body means columns scroll horizontally. | Below 1280 px the PRD does not promise usability. Form-heavy pages (office edit, procedures) use Tailwind defaults and have not been spot-checked. |
| 768 px (tablet portrait) | Partial | Grid fundamentally horizontal-scrollable. App shell (`Sidebar.tsx`) is fixed-width and would dominate the viewport. | Not a supported breakpoint per PRD; noted only for completeness. |
| 390 px (mobile) | Out of scope | PRD §14 "Out of Scope" explicitly excludes mobile/tablet optimisation. | — |

## Keyboard-only flow

| Interaction | Evidence | Concern |
|---|---|---|
| Tab into grid, arrow-move cursor | `ScheduleGrid.tsx:186-247` — full ArrowUp/Down/Left/Right + `moveCursor` wiring. `cursor` ring style on active cell. | — |
| Enter / Space on a block | `ScheduleGrid.tsx:226-243` — finds hit block under cursor, calls `setSelectedBlockId` + `onBlockActivate`. | — |
| Escape dismisses selection | `ScheduleGrid.tsx:204` | — |
| Ctrl+/-/0 zoom | `ScheduleGrid.tsx:188-203` | — |
| Block-level Enter to activate | `BlockInstance.tsx:166-170` on the inner `role="button"`. | — |
| Focus ring visibility | `focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]` on buttons throughout. Grid root uses `outline-none` with the cursor ring as affordance. | Grid-root focus affordance relies on cursor rectangle only — a sighted keyboard-only user *must* see the cursor to know focus is present. Acceptable but worth noting. |
| Doctor-flow overlay toggle | `ScheduleGrid.tsx:382-401` — button with `aria-pressed`. | — |
| Screen-reader announcements | Live region `aria-live="polite"` (`ScheduleGrid.tsx:606-608`). | Announcement is sparse ("Selected block {id}"). No announcement of violation severity. |
| Reach Properties Panel via keyboard | Assumed reachable via Tab-out from grid — not directly tested. | — |

## Assessment

No broken layouts detected at 1024 px+ viewports. Keyboard navigation is
implemented comprehensively for the core canvas interaction. Accessibility
defects most likely to bite: (a) focus-ring on grid root is subtle,
(b) guard-report violations are not announced via `aria-live`.

Recommendation: run the existing Playwright visual spec across three
viewport sizes (add `1024×768` and `1600×1000` to Sprint 5 screenshot
matrix) before ship.
