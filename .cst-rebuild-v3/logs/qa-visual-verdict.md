# Phase 4 — Visual QA Verdict

**Date:** 2026-04-21
**Branch:** local dev (Next.js dev server on :3000, reflecting current checkout)
**Office under test:** Smile Cascade (id `cmo0lxax0000fgkj7d1jvh2pn`)

## Overall

**Verdict: SHIP-WITH-FIXES — conditional on resolving D-P0-1.**

The rebuild has excellent foundations. Sprint 2B/2C shipped a legitimate, WCAG-AA-gated, multi-row block-rendering V2 canvas with all 12 UX-L contracts satisfied at the **component layer**. Vitest: 1136/1136 green. Contrast gate: 15/15 tokens passing. The V2 components are not the problem.

**The problem is route integration.** `src/app/offices/[id]/page.tsx` is still rendering the legacy grid, so none of the Sprint 2B/2C legibility work reaches the user. This was explicitly carried over as "Sprint 3 work item 5" in the 2B report; Phase 4 QA confirms it is still outstanding.

## Headline counts

| Severity | Count |
|---|---|
| P0 (unusable / must fix) | 3 |
| P1 (noticeable / fix before GA) | 6 |
| P2 (quality-of-life / minor) | 7 |
| **Total visual defects** | **16** |

| Accessibility dimension | Status |
|---|---|
| Formal WCAG 2.2 AA violations | 1 structural (missing grid role — blocked on D-P0-1) |
| Real-pixel contrast failures | 2 (badge + inactive day selector) |
| Keyboard interaction contracts | 6/11 pass or partial; 5 blocked by D-P0-1 |
| Focus order | Logical, no traps |
| No PHI on screen | Confirmed |

## Does the "you can't read what's on there" pain get resolved?

**Not by the currently-deployed artefact.** In the `41-post-generate.png` populated capture, block labels inside narrow RDH columns clip, provider columns compress role badges into the name, and no zoom control is available (Ctrl+= hits browser zoom, not app zoom because `data-sg-zoom` isn't bound). The user's original complaint remains unaddressed on the visible route.

However, the **component-layer work is legitimate and ready to deploy**: `src/components/schedule/v2/BlockInstance.tsx` renders multi-row blocks with three-zone banding, `BlockLabel.tsx` uses `text-wrap: pretty` with no ellipsis, `ProviderRoleBadge.tsx` emits distinct pills, and `ScheduleGrid.tsx` wires Ctrl+=/Ctrl+0/Arrow keys to a real cursor. All of that is tested green but unreachable.

**Resolution path:** a one-sprint route flip (D-P0-1) is all that stands between the current state and Alexa/Megan actually being able to read the schedule.

## Top 5 to fix pre-deploy

1. **D-P0-1 — Mount V2 ScheduleGrid on `/offices/[id]`, `/print`, `/compare`.**
   This unblocks UX-L1 through UX-L12 in one change and converts 6 of the 11 interaction-test failures to testable. High value, low risk (the V2 components are isolated under `src/components/schedule/v2/` and are fully covered by Vitest).

2. **D-P0-3 — Make the toolbar "Generate" button do something, or hide it in the empty state.**
   Office managers will click the toolbar button first by SaaS convention. Currently clicking it produces no visible result, which primes them to distrust the tool. Two-line fix: either wire the same handler or conditionally render based on `hasSchedule`.

3. **D-P0-2 — Add `src/app/offices/page.tsx`.**
   Directly typing `/offices` currently yields Next.js "404 — This page could not be found." Add a one-line `redirect('/')` or a dedicated listing page.

4. **D-P1-1 — Real error state for invalid office IDs.**
   A 1-second toast that auto-dismisses is not a real error UX. Create `src/app/offices/[id]/not-found.tsx` with explicit copy and a return link.

5. **D-P1-5 — Fix empty-state block palette copy ("DRAG BLOCKS ONTO THE GRID").**
   Contradicts the empty-state framing and pushes users to try drag-drop before generation exists to receive the drop.

## What shipped well (keep doing this)

- **Design tokens are genuinely the law** — `src/styles/design-tokens.css` governs the whole system; the oklch palette with dichromacy separation is a good call and the contrast-verification script in `scripts/check-contrast.ts` is a best-in-class CI gate. Keep it.
- **Light theme is consistent** across 100% of routes tested (CLAUDE.md NFR-4). No dark mode leaks.
- **No PHI exposure** on any surface.
- **Sidebar navigation IA** is clean: 9 well-labelled items, active state obvious, hierarchy sensible.
- **Toolbar ribbon** UX is coherent — Day selector + Generate + Export + More + Full-screen is the right grouping.

## Handoff artefacts

- Screenshots: `.cst-rebuild-v3/logs/visual-qa/*.png` (gitignored)
- Defect register: `.cst-rebuild-v3/logs/qa-visual-defects.md`
- A11y report: `.cst-rebuild-v3/logs/qa-a11y.md`
- Interaction log: `.cst-rebuild-v3/logs/qa-interactions.md`
- Playwright specs (new, kept in repo):
  - `e2e/qa-visual-phase4.spec.ts` — widths + states + basic interactions (24 tests)
  - `e2e/qa-visual-phase4-generated.spec.ts` — post-generation matrix + a11y (11 tests)
  - `e2e/qa-visual-phase4-matrix.spec.ts` — populated matrix (12 tests)
  - `e2e/qa-visual-phase4-gen3.spec.ts` — diagnostic (2 tests)
- Dev-server log: `.cst-rebuild-v3/logs/visual-qa/dev-server.log`

To re-run: `npx playwright test e2e/qa-visual-phase4*.spec.ts --reporter=line`.
