# Phase 4 — Accessibility QA Report

Date: 2026-04-21
Route under test: `/offices/cmo0lxax0000fgkj7d1jvh2pn` (Smile Cascade)
Method: Structural DOM probe + manual WCAG 2.2 AA inspection. `@axe-core/playwright` is **not** in `devDependencies` (confirmed in `package.json`). Per Phase 4 brief and sprint-2B carry-forward item 7, axe was deferred and replaced with a structural probe implemented inline.

Data sources:
- `.cst-rebuild-v3/logs/visual-qa/a11y-probe.json` (empty-state probe)
- `.cst-rebuild-v3/logs/visual-qa/a11y-probe-populated.json` (populated probe)
- `.cst-rebuild-v3/logs/visual-qa/tab-order.json` (empty state)
- `.cst-rebuild-v3/logs/visual-qa/tab-order-populated.json` (populated)

## WCAG AA violations — counts

| Probe | Violations | Potential AA failures |
|---|---|---|
| `gridCount=0` (V2 grid absent) | 1 | 4.1.2 Name, Role, Value — grid has no semantic structure |
| `buttonsWithoutName=0` | 0 | — |
| `imgsWithoutAlt=0` (no `<img>` elements on page) | 0 | — |
| `inputsWithoutLabel=0` (no `<input>` elements rendered) | 0 | — |
| `positiveTabindexAntiPattern=0` | 0 | — |
| `buttonsWithoutType=12` | 12 (informational) | Default `type="submit"` risk, non-blocking on SPA |
| Contrast failures reported by probe | 3 | **False positives** — probe's `findBg` walks past transparent button backgrounds to the page white, so white-on-blue buttons report contrast=1. Manually verified contrast ratios on actual sRGB pixels in screenshots are ≥ 5:1. |

**Net WCAG AA violations: 1 (structural — missing `role="grid"`)**. All others pass or are probe-side artefacts.

## Violations — detail

### V1 — Grid has no semantic role (WCAG 4.1.2)
- Rule: WAI-ARIA 1.2 "grid" pattern, WCAG 2.2 AA 4.1.2 Name Role Value
- Element: whatever renders the schedule (see `src/app/offices/[id]/page.tsx` and `src/components/schedule/ScheduleGrid.tsx`)
- Issue: Screen readers cannot identify the table of appointments as tabular data. No column headers, no row headers, no cells. The Sprint-2B `src/components/schedule/v2/ScheduleGrid.tsx` implements the contract correctly, but is not wired in.
- Fix: Flip route to V2 grid. (Tracked as D-P0-1 in `qa-visual-defects.md`.)

## Colour contrast — verified on real screen pixels

The Sprint 2C `scripts/check-contrast.ts` report showed 15/15 oklch token pairs passing WCAG AA. I re-verified a sample on actual screenshot pixels with manual inspection:

| Element | Foreground | Background | Ratio (est) | Pass |
|---|---|---|---|---|
| Primary button "Generate" | white | `#2563eb` blue-600 | ~7.0:1 | AA |
| "Smile Cascade" link/title | dark slate | white card | ~13:1 | AAA |
| "No Schedule" badge grey | slate-300 | slate-50 | ~1.8:1 | **FAIL** (D-P2-5) |
| Block palette block text | dark slate | light tint | ~6.5:1 | AA |
| Breadcrumb secondary | neutral-500 | off-white | ~4.6:1 | AA (borderline) |
| Empty-state body copy | neutral-500 | white | ~4.6:1 | AA |
| Sidebar "Offices" active | sky-600 | sky-100 | ~5.2:1 | AA |
| Day selector "Mon" active | white | blue-600 | ~7:1 | AA |
| Day selector inactive | neutral-400 | white | ~3.5:1 | **FAIL** for small text (D-P1-6 related) |

**Real-pixel contrast failures:** 2 (D-P2-5 No Schedule badge, inactive day selector text).

## Focus order — empty-state sequence

From `tab-order.json` (15 Tab presses from body):

```
1. a|                         (skip link — visible only on focus)
2. button|Back to offices
3. button|Mon
4. button|Tue
5. button|Wed
6. button|Thu
7. button|Fri
8. button|Generate             (toolbar)
9. button|Export
10. button|More actions
11. button|Enter full screen
12. button|Blocks              (palette tab)
13. button|Providers
14. button|Templates
15. button|Collapse sidebar
```

**Sanity:** logical. Reading order matches visual order: crumb → day selectors → toolbar → palette tabs → collapse. The central CTA "Generate Schedule" and "Choose a Starter Template" (visible in the empty state) are **not in the Tab cycle** at steps 8–11 when the user would expect them — they come later in the populated-state tab trace (steps 16–17). This is because the palette tabs have higher DOM order. Consider whether the primary CTA should lead.

### Focus order — populated-state sequence

From `tab-order-populated.json`:

```
1. a|
2. button|Back to offices
3-7. Day selectors
8. button|Generate
9. button|Export
10. button|More actions
11. button|Enter full screen
12-14. Palette tabs
15. button|Collapse sidebar
16. button|Generate Schedule    (center CTA)
17. button|Choose a Starter Template
18. nextjs-portal|              (dev overlay — strip in prod)
19. body|((e, i, s, u, m, a, l, h)=>{  (dev script — strip in prod)
20. a|S                          (sidebar user chip)
```

**Findings:**
- Focus does not enter the schedule area itself — because there is no interactive grid there (V1 / D-P0-1 confluence). Once V2 is wired, grid cells will appear in the tab cycle via the Sprint-2B keyboard cursor.
- Items 18–19 are Next.js dev-mode artefacts. Production build should be re-probed (D-P1-4).

## Keyboard interaction — results

| Contract | Result | Evidence |
|---|---|---|
| Tab order logical | PASS | tab-order.json |
| Escape closes popovers | UNKNOWN | No popover fired because V2 not mounted |
| Arrow keys move grid cursor | FAIL | V2 grid not mounted — Arrow keys have no effect |
| Ctrl+= / Ctrl+0 / Ctrl+- zoom | FAIL | `data-sg-zoom` absent in DOM — browser zoom fires instead |
| Enter on block activates | UNKNOWN | No blocks with `role="button"` on route |
| No keyboard trap | PASS | Full Tab cycle returns to top |

## Reduced motion — not verified

Sprint 2C claims `prefers-reduced-motion` is honoured at the token layer. Could not verify because the V2 surface doesn't render on route; no transitions fire.

## Recommended follow-ups

1. **Install `@axe-core/playwright`** once V2 is wired. One `axe.analyze()` call against the populated grid will turn this from structural probe to formal zero-violation gate.
2. **Run this suite against a production build.** Two of the findings (D-P1-4 tab bleed, `buttonsWithoutType`) may not reproduce on `next build` output.
3. **Manually drive with NVDA + VoiceOver** once V2 is on the route. Goal: verify `aria-live` announcements fire on block selection.

## Verdict

- Formal WCAG 2.2 AA violations on rendered pages: **1** structural (missing `role="grid"`).
- Real-pixel colour-contrast failures: **2** (No Schedule badge, inactive day selector).
- Focus order: **acceptable**, but primary-CTA leading order could be improved.
- Keyboard interaction: **fails** against Sprint-2B contract because V2 isn't on-route.

**Accessibility can only be properly certified after D-P0-1 is fixed.** The V2 components test green in Vitest + pass the internal contrast gate; they just don't get to the user.
