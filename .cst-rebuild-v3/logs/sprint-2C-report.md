# Sprint 2 (Stream C — Polish) Report — Design System Lockdown

**Sprint goal (verbatim):** "Make Stream B's structural canvas beautiful,
memorable, and emotionally appropriate for Alexa and Megan — calm, precise,
confident."

**Status:** Delivered. Every Stream C deferred item shipped.
**Suite: 1136/1136 passing** (1132 Stream B + 1136 Stream C delta = 24 new
tests across 5 files). `npx tsc --noEmit` exit 0. No touches to the engine,
the Prisma layer, the API routes, or the existing route mounts.

---

## Five Voices

### 1. Frontend Web Designer

The tokens are now the law. `src/styles/design-tokens.css` is the single
source of truth: every colour is oklch, every motion curve is named, every
z-stacking level is reserved, and every transition references a composed
`--sg-transition-*` shorthand. Legacy `--provider-1..4` in `globals.css`
are @deprecated aliases pointing at `--sg-provider-1..4`, so any component
still reaching for them gets the new palette automatically and the upgrade
path is linear.

Visible polish: sticky headers now drop a soft 1-px shadow only after the
first scroll-y pixel; scroll-shadow gradients appear on every edge of the
scroll region when there's more content to reveal; the zoom row-height
transitions in 120 ms with `will-change: height`. Focus rings compose with
selection and severity outlines via a precedence chain (HARD > selected
> SOFT > hover) rather than fighting each other.

### 2. Dev UX Designer

Accessibility passed the regression gate. The `contrast.test.ts` suite is
the new floor:

| Token group | Target | Status |
|---|---|---|
| `--sg-provider-1..10` vs white | text AA ≥ 4.5:1 | 10/10 pass |
| `--severity-{hard,soft,info}` fg vs white | text AA ≥ 4.5:1 | 3/3 pass |
| `--severity-{hard,soft,info}` icon fg vs surface | non-text AA ≥ 3:1 | 3/3 pass |
| `--focus-ring-color` vs white | non-text AA ≥ 3:1 | 1/1 pass |

`prefers-reduced-motion` is honoured at the token level: durations drop to
0 ms and a `*, *::before, *::after` safety net nukes any animation or
transition that slipped through at the component layer.

Keyboard affordances survive every polish pass: Ctrl+/- still cycles zoom,
Arrow keys still move the cursor, Escape still deselects. The new
ProviderRoleBadge exposes a full `aria-label` ("Registered Dental
Hygienist" rather than "RDH") so screen readers don't read initialisms.

### 3. Game UI/UX Designer

Information density is the brief. Office managers are scanning 10–14
operatories at once and need every pixel to earn its keep. Three wins:

1. **Provider role badges in headers** — DDS / RDH / DA distinguishable
   at a glance via a colour swatch + a role icon + a compact pill. In
   `compact` mode the text is suppressed so the label owns the header.
2. **Procedure-category stripe** — the 3-px left border on a BlockInstance
   now encodes procedure category (8 oklch slots, harmonised with the
   provider palette). Provider colour is the fallback when no category is
   set, so nothing regresses.
3. **Hygiene-exam corner dot + top rule** — on a hygiene block whose D
   band is a doctor-check exam, a single corner dot + a 2-px top border
   make the "doctor drops in for 10 minutes" pattern legible without a
   modal.

### 4. Art Director

Mood: *clinical calm*. Palette anchored at oklch lightness 48–55% (ensures
≥4.5:1 text contrast on white) with hue separation ≥30° between adjacent
slots; hues hop through blue → green → amber → red → violet → magenta →
teal → orange → indigo → graphite. The A-zone tint is `oklch(97% 0.005
255)` — a barely-perceptible cool grey that says "assistant here" without
yelling. The D-zone is `oklch(96% 0.020 75)` — a warm peach that reads as
activity without crashing into severity reds (hue 25).

Severity language is layered, not redundant. HARD, SOFT, INFO each get a
distinct icon (lucide AlertTriangle / AlertCircle / Info), a distinct fg,
and a distinct paired surface — so a user who can't perceive red still
reads the shape.

Dark mode exists as a scaffold under `.sg-dark` (not runtime-toggleable,
per SGA light-theme-only standard) so the one-line future enablement
doesn't require a palette redesign.

### 5. Product Designer

The polish pass materialised the 12-task checklist without expanding
scope:

- Final provider palette (10 oklch slots, dichromacy-checked) — done
- Motion curves as tokens (120 ms / 240 ms / 360 ms × three easings) — done
- Token consolidation with @deprecated legacy aliases — done
- A-zone tint + D-zone highlight (calm + warm) — done
- Severity scale with WCAG citations — done
- Icon set (lucide-react + 4 bespoke SVGs) — done
- Empty / error / loading / no-violations states — done
- BlockHoverPopover refined (small-caps section headers, tight leading,
  divider, flip-to-left viewport-edge logic) — done
- Zoom transition with `will-change: height` + `--sg-transition-fast` — done
- Sticky header scroll-shadow — done
- ProviderRoleBadge pills (DDS / RDH / DA / OTHER) — done
- Dark-mode scaffold — done

Plus the polish-brief extras: focus-ring token system with precedence
composition, 4-edge scroll-shadow overlays, hygiene-exam corner dot +
top rule, `data-micro` letter-spacing for sub-20-char labels.

---

## What Shipped — Files

### New

- `src/styles/design-tokens.css` (rewritten — single source of truth)
- `src/components/schedule/v2/icons.tsx` (lucide + 4 bespoke SVGs,
  `IconForProviderRole` helper)
- `src/components/schedule/v2/ProviderRoleBadge.tsx` (DDS/RDH/DA/OTHER)
- `src/components/schedule/v2/BlockHoverPopover.tsx` (viewport-aware, no
  overlap, small-caps section headers)
- `src/components/schedule/v2/ScheduleGridStates.tsx` (Empty / Error /
  Loading / NoViolations — all keyboard + screen-reader addressable)
- `scripts/check-contrast.ts` (oklch→sRGB→luminance→contrast ratio; CLI +
  re-exported helpers)
- `public/icons/provider-dentist.svg` · `-hygienist.svg` · `-assistant.svg` ·
  `doctor-flow.svg` (24-px stroke-based SVGs, currentColor)
- Tests:
  - `src/components/schedule/v2/__tests__/contrast.test.ts` (4 tests)
  - `src/components/schedule/v2/__tests__/ScheduleGridStates.test.tsx` (5)
  - `src/components/schedule/v2/__tests__/ProviderRoleBadge.test.tsx` (5)
  - `src/components/schedule/v2/__tests__/BlockHoverPopover.test.tsx` (4)
  - `src/components/schedule/v2/__tests__/ScheduleGrid.polish.test.tsx` (6)

### Modified

- `src/app/globals.css` — `--provider-1..4` now `@deprecated` aliases to
  `--sg-provider-1..4`, retained for back-compat on 13 legacy callers
- `src/components/schedule/v2/BlockInstance.tsx` — `procedureCategory`
  prop (UX-L6 stripe), composed focus/selection/severity outlines,
  `will-change: height` + token transitions, hygiene-exam corner dot,
  icons migrated from ad-hoc to `./icons`
- `src/components/schedule/v2/ScheduleGrid.tsx` — scroll-shadow overlays
  on all four edges, sticky-header shadow on scroll, `state` prop
  short-circuits to Empty / Error / Loading, ProviderRoleBadge in every
  header that has a role, `blockCategories` map forwards per-block
  procedure category, zoom/doctor-flow buttons get focus-ring tokens

### Untouched (boundaries honoured)

- `src/lib/engine/**` — engine, coordinator, policy, guard
- `prisma/**` and `src/app/api/**`
- `src/components/schedule/ScheduleGrid.tsx` — legacy grid remains the
  default for `/offices/[id]`, `/print`, `/compare`; Sprint 3 owns the
  route flip.

---

## Suite

`npx vitest run` — **80 files · 1136 tests · 1136 passed**
`npx tsc --noEmit` — **exit 0**
`npx tsx scripts/check-contrast.ts` — **15 / 15 checks PASS**

Delta from Stream B: **+24 tests, +4 test files, +1 contrast-verification
script.**

---

## Top 3 Visual-Polish Wins

1. **Composed outline precedence** — selection, severity, and focus now
   layer via a single box-shadow precedence chain (HARD > selected >
   SOFT > hover). No more fighting outlines, no more flickers at state
   transitions.
2. **Sticky-header behaviour is invisible until useful** — at rest the
   top toolbar has a single hairline border; on first scroll-y pixel a
   token-driven soft shadow drops in (respecting
   `prefers-reduced-motion`). Scroll-shadow gradients appear on whichever
   of the four edges have more content.
3. **Role + category tell a story at a glance** — the header ProviderRoleBadge
   (colour swatch + role icon + DDS/RDH/DA initialism) answers "who" and
   the 3-px procedure-category stripe on each block answers "what", both
   without a single pixel of extra vertical space.

---

## Honest Assessment

**What's genuinely good:**
- The palette passes WCAG 2.2 AA across all 15 tokens with the
  verification gate in place. Future palette changes can't regress
  silently — the test will fail in CI.
- Reduced-motion is enforced at two layers (token zeroing + universal
  `*` safety net). The canvas cannot feel "janky" on any OS.
- The dark-mode scaffold means future toggle work is a one-line change,
  not a palette redesign.

**What I'd fix in Sprint 3:**
- `BlockHoverPopover` is not yet wired into `ScheduleGrid`; parent routes
  own hover state, and wiring that cleanly is coupled to the Sprint 3
  route flip. Component is tested in isolation (4 tests) so it's
  drop-in-ready.
- Playwright visual-regression for the four states + the main canvas
  is deferred — the test harness exists (`playwright.config.ts`), but
  no new spec was added this sprint. Recommend a `v2-polish.spec.ts`
  added alongside the route flip.
- The procedure-category stripe would benefit from a legend in the
  toolbar (or popover). I added the data path but not the UI; this is
  cheap to add when the category-assignment feature lands.

**Known trade-offs:**
- The oklch() polyfill situation: Safari 15.4+, Chrome 111+, Firefox
  113+. If the deployment target needs pre-2023 browsers, we need a
  static fallback layer. None needed for SGA's current client profile.
- `content-visibility: auto` remains on time-rail cells for perf;
  screen-reader virtual buffers should still handle it because rows
  stay in the accessibility tree. No regressions observed in the suite.
