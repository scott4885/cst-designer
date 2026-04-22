# Phase 4 — Visual Defect Register

Date: 2026-04-21
QA run: `e2e/qa-visual-phase4*.spec.ts`
Screenshot directory: `.cst-rebuild-v3/logs/visual-qa/`
Office exercised: `Smile Cascade` (id `cmo0lxax0000fgkj7d1jvh2pn`)

Legend — P0 unusable, P1 noticeable, P2 minor.

## P0 — must fix before ship

### D-P0-1  V2 ScheduleGrid is not mounted on `/offices/[id]` route
- File: any `50-pop-*.png`, `a11y-probe-populated.json`
- Defect: The populated office route renders the legacy grid (no `role="grid"`, `role="gridcell"`, `role="columnheader"`), not the Sprint-2B/2C V2 canvas. A11y probe on the populated schedule reports `gridCount=0`, `gridCellCount=0`, `colHeaderCount=0`, `rowHeaderCount=0`. The only `role="grid"` in the DOM is the sidebar block palette.
- Impact: Every UX-L1 through UX-L12 contract that was shipped in Sprint 2B/2C — three-zone segment banding, hygiene-exam glyph, sticky headers, doctor-flow overlay, keyboard cursor, zoom control, severity-coloured violation outlines, hover popover, WCAG-tested provider palette — is **not reachable by an end user**. Confirmed by the Sprint-2C report section "Route integration — V2 components are unwired".
- Suggested fix: Flip the `/offices/[id]/page.tsx`, `/print`, `/compare` render-path to `src/components/schedule/v2/ScheduleGrid.tsx` (behind a feature flag if rollback is needed). This was listed as Sprint 3 work item 5 in the 2B report.

### D-P0-2  `/offices` renders Next.js 404
- File: `10-empty-offices-list.png`
- Defect: Navigating directly to `/offices` produces "404 — This page could not be found." There is no `src/app/offices/page.tsx`; the list lives only at `/`. Users who type `/offices` (expected URL for a "Offices" resource) or who bookmark the sidebar item lose context.
- Impact: Confusing URL space. The sidebar item is labelled "Offices" but routes to `/`, while `/offices/[id]` works fine; the missing middle is a foot-gun.
- Suggested fix: Add `src/app/offices/page.tsx` that either re-renders the office list or `redirect('/')`.

### D-P0-3  "Generate Schedule" CTA silently duplicated in toolbar
- File: `02-office-detail-1440.png`, `40-pre-generate.png`
- Defect: Empty office view shows two distinct "Generate" buttons — a toolbar button labelled "Generate" (top right) and a center-panel CTA labelled "Generate Schedule". During QA automation the toolbar button's click did not cause any visible action (`0` net activity, empty-state persisted), while the center CTA worked (`41-post-generate.png` shows a populated schedule). Office managers will try the top-right button first because it is the more prominent affordance in a toolbar-driven SaaS convention.
- Impact: "Nothing happens when I click Generate" pattern. User believes the engine is broken.
- Suggested fix: Either (a) wire the toolbar Generate to the same handler as the center CTA, or (b) hide the toolbar Generate when no schedule exists and show it only for regeneration of a saved schedule.

## P1 — must fix before GA

### D-P1-1  Error state on invalid office id is a 1-second toast, not a page
- File: `11-error-invalid-office-id.png`
- Defect: Navigating to `/offices/does-not-exist-99999` briefly flashes a "Failed to load office" toast in the bottom-right then bounces back to the office list. There is no 404 page, no explicit "Office not found" content. The toast auto-dismisses.
- Impact: If a user's bookmark or shared URL references a deleted office they get no explanation, only a flash of red.
- Suggested fix: Create `src/app/offices/[id]/not-found.tsx` with clear copy ("This office no longer exists" + link back) and raise it from the loader when the ID resolves to null.

### D-P1-2  Sidebar collapse button floats above the "N" issue badge
- File: `01-home-1440.png`, `02-office-detail-1440.png`
- Defect: The bottom-left corner stacks three elements: a black "N" avatar/notification badge, the "« Collapse sidebar" button, and (in error states) the "1 Issue ×" pill. At 1024–1440 widths they can overlap visually; the N badge sits directly over the collapse chevron on some widths.
- Impact: Makes the collapse control hard to hit. "N" is likely a dev devtools badge from Next.js — in production build this would not appear. Verify.
- Suggested fix: Reserve vertical space for the N devtools badge OR only render it in dev builds (it looks like a Turbopack/Next.js dev marker — production deploy may drop it). Add a 12-px gap between the N dot and the collapse control.

### D-P1-3  Schedule grid `role="grid"` missing → screen readers can't announce structure
- Source: `a11y-probe-populated.json` — `gridCount=0`, `colHeaderCount=0`, `rowHeaderCount=0`.
- Defect: Paired with D-P0-1. Even the legacy grid currently rendered doesn't expose `role="grid"`. Tab lands on the office's tabs/toolbar/sidebar controls only; it never enters the schedule. Keyboard cursor shortcuts (Arrow keys, Ctrl+=, Ctrl+0) that exist in V2 have no effect because V2 isn't mounted.
- Impact: Non-conformance with WCAG 2.2 AA "name, role, value" on the core business data structure.
- Suggested fix: Blocked on D-P0-1. Once V2 is mounted this resolves automatically.

### D-P1-4  Tab order bleeds into Next.js dev portal
- File: `tab-order-populated.json`
- Defect: Tab sequence: back → day-selectors → Generate → Export → More → Full Screen → palette tabs → Collapse sidebar → Generate Schedule → Choose a Starter Template → `nextjs-portal` → `body|((e, i, s, u, m, a, l, h)=>{…`. The last two entries are Turbopack HMR infrastructure, not app UI. The body's tabindex is being injected by the Next.js dev devtools.
- Impact: In dev-mode screenshots the sequence looks broken but this is likely dev-only. Must verify on `next build` production bundle.
- Suggested fix: Take a production-build QA pass and confirm the Next devtools shim is absent.

### D-P1-5  Empty-state block palette shows "DRAG BLOCKS ONTO THE GRID" when there's no grid
- File: `02-office-detail-1440.png`
- Defect: Left sidebar header reads "DRAG BLOCKS ONTO THE GRID" even in the empty state before any schedule exists. There is no grid to drag onto — the center shows "Start building your schedule" with a CTA. Users will try dragging and nothing will accept.
- Impact: Contradictory affordance. Violates the coordinator framing from PRD v4 section 2.
- Suggested fix: Hide or re-label the palette header copy when no schedule exists. Suggested alt: "Blocks available after generation."

### D-P1-6  Two days (Tue–Fri) remain colourless/inactive in the selector
- File: `02-office-detail-1440.png`
- Defect: "Mon" is in a filled blue pill, "Tue / Wed / Thu / Fri" are plain grey text. The selector style doesn't indicate these are clickable buttons. They also don't show "has schedule" vs "needs generation" state.
- Impact: Users don't realise they have to generate each day independently, or that Fri has a different roster (Kelli Friday-off — Gap 4 in PRD v4 §4.2).
- Suggested fix: Add a subtle underline or dot-indicator on days where a schedule exists. Style all five as equal-weight buttons.

## P2 — quality-of-life

### D-P2-1  At 390px (mobile) the toolbar right-edge is cropped (… and full-screen icons hidden)
- File: `02-office-detail-390.png`
- Defect: "More" and "Full screen" icons fall off the right edge. Export dropdown is trimmed.
- Impact: PRD NFR-5 says "Usable down to 1280 px" so 390 is explicitly out-of-scope. Noted for awareness only.
- Suggested fix: Document as "not supported below 1024 px" in the product copy or add a "switch to desktop" interstitial.

### D-P2-2  Block palette production/clinical/hygiene categories have no clickable collapsing
- File: `02-office-detail-1440.png`
- Defect: Section headers "PRODUCTION / CLINICAL / HYGIENE / ADMIN / OTHER" are plain text, not collapsible. 8 blocks always visible, takes ~550 px vertical. On 768-px-tall displays the last block is below fold.
- Impact: Mild friction; not blocking.
- Suggested fix: Make section headers expand/collapse (chevron).

### D-P2-3  Hover popover timing not measured (V2 not mounted)
- Source: `a11y-probe-populated.json`
- Defect: Hover-popover interaction test could not exercise the V2 `BlockHoverPopover` because V2 is not on the route. The Sprint-2C report says the component is "drop-in-ready" but the sub-300ms timing contract cannot be verified until D-P0-1 is fixed.
- Impact: UX-L4 "Hover reveal" unverifiable.
- Suggested fix: After D-P0-1, re-run `qa-visual-phase4-matrix.spec.ts` → `hover_appeared` + `ms` annotation.

### D-P2-4  Zoom shortcut Ctrl+= resolves to browser zoom, not app zoom
- Source: `54-zoom-plus.png`, `55-zoom-reset.png`, `56-zoom-minus.png`, `generate-diag.json`
- Defect: `data-sg-zoom` attribute is not present anywhere in the DOM (all zoom assertions returned `null`). Pressing Ctrl+= in the office detail view therefore triggers browser's native page zoom, not the app-level 75/100/125/150 % zoom documented in UX-L5.
- Impact: UX-L5 unreachable. Related to D-P0-1.
- Suggested fix: After V2 mount, verify `data-sg-zoom` binds on the ScheduleGrid root.

### D-P2-5  Office list card "No Schedule" badge is low-contrast grey-on-grey
- File: `01-home-1440.png`
- Defect: The "No Schedule" badge on the Smile Cascade card uses `text-slate-300 bg-slate-50` (from `src/app/page.tsx:166-168`), which visually reads as disabled. Visible-text contrast looks below AA at a glance.
- Impact: Scanning for "which offices need generation" is slower than it needs to be.
- Suggested fix: Use `text-amber-700 bg-amber-50` (or the severity INFO token) to signal "action needed" rather than "disabled".

### D-P2-6  Breadcrumb "Offices / Smile Cascade" link is black-on-grey-bar-on-white
- File: `02-office-detail-1440.png`
- Defect: Breadcrumb in the light-grey top strip uses the same weight as the "Smile Cascade" terminal crumb. User cannot tell which word is clickable.
- Impact: Weak affordance.
- Suggested fix: Underline "Offices" on hover or lower its weight vs the current page.

### D-P2-7  Provider column width at 1024px cramps RDH names
- File: `41-post-generate.png` (visible at the narrow shot aspect)
- Defect: "Cheryl Diaz RDH — HYG2" and "Luke Knader RDH — HYG4" column headers visually clip at narrower widths. The role badge (RDH) is integrated into the text rather than as a separate pill per Sprint-2C's `ProviderRoleBadge`.
- Impact: Confirms V2 ProviderRoleBadge is not on this route (D-P0-1).

## Summary counts

- P0: 3
- P1: 6
- P2: 7
- Total: 16
