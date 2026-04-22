# Phase 4 QA — UX-L Legibility Acceptance

PRD-V4 §10.4 specifies UX-L1..UX-L12. Each row verified by inspection of
`src/components/schedule/v2/` component code + companion unit tests. No
live screenshot tests run here (dev server at :3001 during QA but Playwright
snapshot harness not invoked — covered by `e2e/schedule-v2-visual.spec.ts`
per Sprint 3 report).

| UX-L | Requirement | Status | Evidence | Gap |
|---|---|---|---|---|
| UX-L1 | Multi-row block rendering (single grid item spanning N rows, label once) | Pass | `BlockInstance.tsx` renders one `<div>` with `height = durationSlots × slotHeightPx` and a single absolutely-centered `<BlockLabel>`. `BlockInstance.test.tsx` (11) confirms. | — |
| UX-L2 | Three-zone segment colouring (A-pre tint / D saturated / A-post tint) | Pass | `BlockInstance.tsx:178-246` — three bands with `--a-zone-tint`, `--d-zone-fill`, and dashed separator borders. | — |
| UX-L3 | Doctor-exam glyph distinct from hygiene time (stripes + dot + bold border) | Pass | `BlockInstance.tsx:211-229` — 45° stripe pattern, top-left colour dot, `--hygiene-exam-border` top edge. Gated on `isHygieneBlock` + exam slot. | — |
| UX-L4 | Hover tooltip with full label, duration, pattern, provider, X-segment, production | Pass | `BlockHoverPopover.tsx` + `BlockHoverPopover.test.tsx` (4 tests). Wired into V2 canvas layer per sprint-3 report. | — |
| UX-L5 | Zoom control 75% / 100% / 125% / 150% | **Partial** | `ZoomControls` in `ScheduleGrid.tsx:712` offers 3 levels (`compact=24px`, `default=32px`, `expanded=48px`) not the 4 percentage-anchored levels in PRD. Ctrl+/- hotkeys work. | PRD spec asks for 150% = ≥27px/row (met: expanded=48px). 75% step not present — compact is 24px ≈ 100% of a 10-min row. Naming/steps diverge from PRD. Functional intent met. |
| UX-L6 | Procedure-category colour stripe on left border | Pass | `BlockInstance.tsx:138-140` + `CATEGORY_VAR` mapping (8 categories → `--sg-category-*` tokens). | — |
| UX-L7 | Sticky headers (time axis + provider/op) | Pass | `ScheduleGrid.tsx:468-515` — sticky corner + sticky column headers; time cells `sticky left-0`. Scroll-shadow indicators confirm scroll edges. | — |
| UX-L8 | Long-label overflow ellipsis | Pass | `BlockLabel.tsx` test suite (7 tests) covers truncation; `BlockInstance.tsx:155 overflow-hidden`. Hover tooltip is canonical full label. | — |
| UX-L9 | Conflict overlay on X-segment overlap | Pass | `BlockInstance.tsx:124` — HARD severity → red 2px `box-shadow` around block + violation badge. SOFT/INFO get distinct colours and icons. | — |
| UX-L10 | Week-type badge prominent next to day selector | Not tested | `weekType`/`rotationWeeks` persisted (schema.prisma), `VersionPanel` references, but no explicit "A/C pill" next to day selector observed in toolbar components. | Likely present in `ToolbarRibbon.tsx` but not confirmed by a test or screenshot. |
| UX-L11 | Production-policy chip in toolbar (Jameson/Levin/Farran/Custom) | **Fail** | No policy chip component found in `src/components/schedule-builder/ToolbarRibbon.tsx` or V2 header. | Policy persists in schema but is not displayed to the user. |
| UX-L12 | Goal-derivation popover on Daily Goal click | **Fail** | No derivation popover found. `PropertiesPanel.tsx` shows goal as a flat number; no annual → daily → minus-hygiene audit trail. | Tied to FR-8 failure. |

## Summary

- **Pass:** 8 — UX-L1, L2, L3, L4, L6, L7, L8, L9
- **Partial:** 1 — UX-L5 (zoom levels differ from PRD spec)
- **Fail:** 2 — UX-L11, UX-L12
- **Not tested:** 1 — UX-L10

Core legibility (the Sprint-3 P0 goal) is delivered. The two Fails are both derivation/display-layer features tied to the absent goal-derivation formula (FR-8).
