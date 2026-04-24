# CST Designer — Reference Study

**Scope:** Visual reference for redesigning the preview-mode block primitive — switching from 3 visible color bands (assistant-pre / doctor-hands-on / assistant-post) to a solid provider-tinted card with a thin 4px top accent strip carrying the same 3-segment proportions.

**Method:** Web search + WebFetch against vendor docs and design writeups. Three of the five tools (Dentrix Ascend, Denticon, Linear) are substantially login-gated or paywalled — where I could not verify a screenshot directly I've said so rather than fabricated. Open Dental has the richest public documentation and is the best direct comparable.

---

## TL;DR

- **Dental tools do NOT do 3-band splits.** The closest existing pattern is Open Dental's **left-edge time bar** with per-minute colored squares (provider active) vs white squares (assistant-only / non-provider). This is exactly the information CST's new "thin accent strip" encodes, just rotated 90 degrees. The pattern is validated in shipping dental software.
- **Provider color lives on the block, not the column.** Every dental tool (Dentrix, Ascend, Open Dental, Denticon) tints the appointment fill by provider, not by operatory. Columns are labeled by operatory with the provider color applied as background when a provider is assigned. CST's "provider-tinted card" aligns with this.
- **Template designers see TEMPLATES as an overlay, not solid blocks.** Dentrix Perfect Day and Ascend Time Slots both render as **outlined/bordered containers** with a label, not solid fills — that's reserved for actual appointments. CST is building template preview, so borrowing the "outlined container with label" treatment for *unscheduled* template slots (and reserving solid fills for *instances*) is worth considering.
- **Empty time is whitespace everywhere modern.** No tool uses stripes, patterns, or "available" labels in the foreground. Open Dental explicitly documents white = open, grey = closed. Google Calendar 2024 moved further toward rounded containers around blank cells but still renders empty time as light neutral.
- **Label placement is converging on top-left anchored, truncating.** Linear, Google Calendar, and Open Dental all anchor at top-left, grow rightward, and truncate with ellipsis. Short blocks suppress secondary fields rather than resizing the primary label. CST should do the same.

---

## Tool-by-tool

### 1. Dentrix Ascend

**Access note:** Ascend scheduler screenshots are behind a login wall on support.dentrixascend.com and learn.dentrixascend.com. The public-facing blog has a few, and the Dentrix Magazine article on Perfect Day scheduling embeds one reference screenshot. I was not able to pull a live current scheduler shot directly, so details below are reconstructed from documentation + verified screenshots from the blog.

- **Block visual:** Solid fill tinted by **provider color** (configured per-provider in setup). Each operatory is a column; when a provider is assigned to that operatory, the column's background uses a low-opacity version of the provider color. Appointments are a stronger-saturation fill of that same color. Text inside the block shows patient name + procedure (customizable position — Main / Upper Right / Lower Right). No visible segmentation for doctor-vs-assistant time inside the appointment itself — that information lives in the "time pattern" (e.g. `X/X/XX//` where X = doctor time, / = assistant time) which is *configured* on the appointment but doesn't render as visible bands on the block.
- **Empty time:** Plain white (when operatory is open) or light grey (when closed). Template time slots (Ascend's version of blockouts) render as thin **colored borders** surrounding a region with a small label — NOT solid fills. This is the key distinction: templates are containers, appointments are fills.
- **Column headers:** Operatory name at top (e.g. "Op 1", "Hyg 1"). When a provider is assigned, the provider's color tints the column. No separate "role badge" in the header — role is implied by operatory naming convention.
- **Hover/detail:** Click opens the appointment detail panel (side panel). Hover shows a lightweight tooltip with patient + time. No in-block hover reveal of doctor/assistant time split.
- **Screenshot URLs (for follow-up):**
  - https://blog.dentrixascend.com/wp-content/uploads/2021/02/sched_no_slots.png (before: empty day)
  - https://blog.dentrixascend.com/wp-content/uploads/2021/02/sched_with_slots-1.png (after: templated day with colored slot borders)
  - https://blog.dentrixascend.com/wp-content/uploads/2021/02/schedule_calendar_view.png (day calendar)
  - https://magazinedxprd.wpengine.com/wp-content/uploads/Q3_2011_Fig1ApptBookRevised.jpg (older Dentrix desktop Perfect Day — still the clearest "outlined template container" shot on the public web)
  - Docs: https://support.dentrixascend.com/hc/en-us/articles/229955347-Customizing-the-schedule-view
  - Docs: https://blog.dentrixascend.com/2021/02/10/create-a-schedule-that-meets-your-production-goals/

---

### 2. Open Dental

**Access note:** Open Dental's manual is fully public and includes screenshots. This is the richest source and the closest functional comparable to CST.

- **Block visual:** Solid fill in the **provider's appointment color** (lighter shades preferred so black text remains legible — explicit guidance in their docs). Inside the block, fields are placed in three zones configured per Appointment View: Main (center, multi-line), UR (upper-right, single line), LR (lower-right, single line). Status is conveyed by overlays: completed appointments change the entire block background to a "Completed" color; broken appointments are crossed out; late patients flip to a "Late" color that overrides provider color. A **colored left-edge time bar** runs down the full height of every block — this is the critical pattern — made up of per-minute-interval colored squares where **colored = active provider time** and **white = assistant/non-provider time**. For hygiene appointments, the hygienist's color is used in the squares instead. This is functionally the same information CST's new 4px top strip will encode, just on the left edge instead of the top.
- **Empty time:** White = practice open, grey = practice closed. No stripes, no labels. Blockouts can render as **either solid color OR outline-only** — configurable via a Preferences toggle ("Use solid blockouts instead of outlines"). Default is outline.
- **Column headers:** Each operatory is a column. Header shows operatory name. When clicked, header expands to reveal default provider name + specialty, scheduled providers, their time blocks, and schedule notes. Provider color tints the **operatory column background** (lighter) in addition to tinting the appointment block (saturated).
- **Hover/detail:** Hovering an appointment header shows a tooltip with provider name + daily scheduled production totals. Hovering the appointment body can show a "bubble" with customizable info via Display Fields. Double-click opens full Edit Appointment dialog (modal). The doctor-vs-assistant time split is visible *on the block itself* via the left-edge time bar — no hover needed.
- **Screenshot URLs (for follow-up):**
  - Appointments module: https://www.opendental.com/manual/appointments.html
  - Appointment View Edit (shows the 3-zone Main/UR/LR layout): https://www.opendental.com/manual/appointmentvieweditwindow.html
  - Time Bars (describes left-edge stripe pattern): https://www.opendental.com/manual/timebars.html
  - Appointment Colors definitions: https://www.opendental.com/manual/definitionsappointmentcolors.html
  - "Fun and Function with Colors" blog post: https://opendental.blog/fun-and-function-with-colors/
  - Block Scheduling blog post: https://opendental.blog/block-scheduling/
  - Specific embedded images referenced in the manual:
    - `images/apptViewEdit.png`
    - `images/apptViewProvBars.png` (provider time bars specifically)
    - `images/apptViewOps.png`

---

### 3. Denticon (Planet DDS)

**Access note:** Denticon's scheduler interface is entirely behind customer login. Public Planet DDS pages (marketing, support articles) reference the scheduler functionally but do not embed UI screenshots I could reach. The support articles I hit returned 403 to WebFetch. I did not find current post-2020 Denticon scheduler screenshots on the public web and I will not fabricate them.

- **Block visual:** Per their support docs, appointments show small letter-icons inside (e.g. "Q" for AppointNow online-booked, "P" and "S" for primary/secondary provider flags) and colors vary by status. Cannot verify exact visual treatment — solid fill vs banded — without direct UI access.
- **Empty time:** Documented as "watermarks" for template guidance — implies an outlined/ghosted container rendering of templates similar to Dentrix. Cannot verify treatment of truly empty time.
- **Column headers:** Scheduler Views allow per-user custom columns. Scheduler Templates are maintained separately as "watermarks" — suggests the template layer is visually distinct from the instance layer. Details unverified.
- **Hover/detail:** Unverified.
- **Screenshot URLs:** None obtained. Denticon's scheduler screenshots are not published on the public web.
- **Docs referenced (functional only):**
  - https://support.planetdds.com/hc/en-us/articles/37670014890395-Denticon-Setup-Guide-Scheduler-Setup
  - https://www.planetdds.com/denticon/

**Net:** Denticon is a weak reference point for this study. Skip it as a pattern source; lean on Open Dental + Dentrix for dental-domain signal.

---

### 4. Google Calendar (week view)

**Access note:** The 2024 Material Design 3 refresh is the current state. I could not pull pixel-level event anatomy from Google's own docs (they don't publish it), but the TechCrunch, Android Police, and 9to5Google writeups describe the changes consistently.

- **Block visual:** Solid fill in the event's color. Rounded corners (Material 3 — more prominent rounding than pre-2024). Text inside: title top-left anchored, time immediately below on a second line for medium/long blocks, with conference-link / guest-count icons on the right when space allows. For short blocks (sub-30min), everything collapses to a single truncated title line; the time hides. Events owned by "someone else" show as lighter/outlined ("tentative" state) vs owned-by-you solid — a two-level elevation/ownership cue. The 2024 refresh explicitly replaced faint gridlines with **solid background blocks in system-theme primary hue around hour/day slots** (that's the grid itself, not events — creates a container-within-container feel).
- **Empty time:** Light neutral background, no stripes or labels. The 2024 redesign actually added more visual weight to empty cells via the theme-tinted grid blocks, but it is still passive whitespace — no "Available" labels.
- **Column headers:** Day name + numeric date top, centered. When viewing "today," the column header gets a filled circle highlight on the date. No role badges (not applicable — it's not a resource calendar).
- **Hover/detail:** Hover shows a quick tooltip with full title + time. Click opens a popover with full detail: attendees, location, description, video link, actions (RSVP / Edit / Delete). No split-time concept (single-event model).
- **Screenshot URLs (for follow-up):**
  - https://techcrunch.com/2024/10/24/google-calendar-gets-a-design-refresh-along-with-dark-mode/ (shows Calendar-on-web-in-light-mode.jpeg and dark-mode.jpeg)
  - https://www.androidpolice.com/google-calendar-redesign-enable/
  - https://9to5google.com/2024/10/23/google-calendar-material-you-redesign-dark-theme/
  - https://static0.anpoimages.com/wordpress/wp-content/uploads/2025/07/google-calendar-tasks-events-hero.jpg (before/after composite)

---

### 5. Linear (cycles / kanban board)

**Access note:** Linear's design writeups are published but don't itemize card anatomy. The public Mobbin shot (linked below) and Linear's own docs give a reliable picture. Not scheduling — but the canonical "solid colored card with label + priority + accent" pattern.

- **Block visual:** Cards have a **borders-only** treatment — Linear explicitly eschews shadows for subtle 1px borders (reference: their "how we redesigned Linear UI part II" writeup + the wider observation that "Linear, Raycast and many developer tools use almost no shadows, just subtle borders to define regions"). Card body is solid white/neutral (not tinted by team/label/priority). Hierarchy goes:
  - Status icon (top-left, small colored circle/pie indicating todo/in-progress/done/cancelled)
  - Issue ID + title (dominant text row)
  - Assignee avatar (right side)
  - Label pills (small rounded rectangles in label colors, horizontal row under title)
  - Priority icon (leftmost or near status)
  - Estimate (small badge, right side)
  - Due date (badge form, right side, colors when urgent)
- Color is **never** the card fill — it lives in small iconic elements (status pie, priority bars, label pills). This is a deliberate choice against "every card a different color" and toward "structured scanability."
- **Empty time:** Not applicable (no grid). Empty columns show an empty-state illustration + "No issues" text.
- **Column headers:** Each Kanban column has a header with: status icon (colored), status name, issue count badge. Very terse, no role/avatar, no color tinting of the column background.
- **Hover/detail:** Hover reveals a faint outline change (no shadow, matches borders-only aesthetic). `Space` on hover opens an inline peek with full issue body. Click opens full issue detail in side panel. Keyboard-first throughout.
- **Screenshot URLs (for follow-up):**
  - Board layout docs: https://linear.app/docs/board-layout
  - Display options docs: https://linear.app/docs/display-options
  - Redesign writeup: https://linear.app/now/how-we-redesigned-the-linear-ui
  - Mobbin capture (kanban): https://mobbin.com/explore/screens/423b83f6-5340-41cd-a537-dd39a0d56ced
  - Mobbin capture (kanban alt): https://mobbin.com/explore/screens/77a9dcea-7020-44ba-9e26-f30a86d92bf4

---

## Pattern convergence

### Block primitive

- **Most tools** (Dentrix Ascend, Open Dental, Google Calendar) use a **solid fill tinted by a single domain color** (provider for dental, event-category for GCal), with status/state conveyed via overlays (crossed-out, color-shift on completion, opacity shift on tentative). Label sits top-left, truncates.
- **Open Dental** is the only tool with an explicit **"per-minute segmentation stripe"** — and it's on the **left edge**, not the top. The pattern encodes exactly what CST encodes: which minutes are provider-hands-on vs assistant-only. Validated pattern.
- **Linear outlier:** no fill-tinting on cards at all. Color lives in small iconic elements. Works because Linear's domain (issues) has many orthogonal dimensions (priority, status, label, team, cycle) and tinting the whole card would collapse them. CST's domain is simpler (one provider per block), so fill-tint is the right choice.

### Empty time

- **Unanimous:** plain whitespace (white or light neutral). No stripes, no patterns, no "Available" labels.
- **Open Dental** distinguishes two tones: white = practice open, grey = practice closed. This is worth stealing — it gives CST a free "within-hours vs out-of-hours" affordance.
- **Google Calendar 2024** adds subtle theme-tinted rounded containers around hour/day cells — makes empty time feel more intentional without ever labeling it. Worth considering for the grid background.

### Column headers

- **Dental tools:** operatory name + provider color tinting the column background when assigned. Role is implied by naming convention (Op 1, Hyg 1), not a separate badge.
- **Google Calendar:** day name + date only (not a resource calendar).
- **Linear:** status-icon + name + count badge. Very minimal.
- **Convergence:** short label + colored indicator + implicit context. None of the tools do a three-part "name / role badge / color swatch" because role gets encoded into the naming + color does the swatch job already. **CST should collapse: column = provider name + subtle left color bar or header underline in provider color. Skip the separate "role badge" — it's visual noise.**

### Hover/detail

- **Dentrix + Ascend + Denticon:** tooltip on hover (lightweight — patient, time, production), click/double-click for modal or side-panel edit. Doctor/assistant split is NOT shown on hover — it's configured on the appointment record and visible only to schedulers who know to look at the time pattern.
- **Open Dental:** header-hover shows production totals; body-hover shows configurable "bubble" of details; the doctor/assistant split is **rendered on the block itself** via the left-edge time bar — no hover needed.
- **Google Calendar:** hover tooltip (title + time), click for popover.
- **Linear:** Space-on-hover peek + click for side panel detail.
- **Convergence:** the tools that encode segmentation visually (Open Dental) don't need hover for it. The tools that don't (Dentrix, Ascend) also don't surface it on hover — it's hidden in modal edit. **For CST, the accent strip IS the segmentation reveal — hover can stay for patient-name-level context only.**

---

## Recommendation for CST Designer

**The redesign direction is correct. Ship it. Specifics below.**

Alexa's team is designing *templates*, not running live schedules — so they are looking at empty chairs filled with conceptual block patterns, zooming out to see a whole day, and asking "does this day balance doctor time across operatories?" That's a different job than an OM filling a Friday. For that job, density and pattern-reading beat individual-block detail.

### Adopt from Open Dental

1. **Left-edge (or top-edge, same idea) time-bar pattern.** Open Dental ships the exact thing CST is building. The information density is right — per-minute granularity is legible at normal zoom, and it answers "where's the assistant-only tail?" at a glance. CST's choice of a 4px top strip is a defensible variant; the top-edge orientation reads faster when blocks are wide-and-short (the dental-column aspect ratio). **Keep it top.**
2. **Two-tone empty time (within-hours vs out-of-hours).** Steal this directly. White for operatory-open time, light grey (`#f5f6f8`) for closed/unavailable. Zero labels needed. Non-load-bearing but hugely orienting.
3. **Provider-color tint on both block AND column background.** Column = low-opacity version of provider color (~8-12%), block = fuller saturation (~35-55% opacity, or a mixed tint against white). Open Dental's lesson about keeping lighter shades so text remains legible is real — enforce a luminance floor in the token.

### Adopt from Linear

4. **Borders, not shadows.** 1px borders on blocks. The dental domain has hundreds of blocks on screen in template mode — shadow-per-block creates visual soup. Linear proves borders scan cleaner at density. Hover can brighten the border rather than add a shadow.
5. **Status via small glyph, not fill-color override.** If a template block has a "conflict" or "warning" state in the future, encode it with a small badge/icon top-right rather than flipping the whole block red. Preserves the provider-color read.

### Adopt from Google Calendar

6. **Rounded corners, ~6-8px.** Modern + forgiving for dense grids. Too-sharp corners read as "spreadsheet"; too-round reads as Trello and wastes vertical real estate. 6-8px is the Google Calendar 2024 sweet spot.
7. **Label top-left, time hides on short blocks.** Anchor the primary label top-left. For blocks shorter than ~30min, suppress secondary fields entirely rather than resize — this matches every modern calendar's behavior and avoids mid-block-height font scaling.

### Diverge from Dentrix

8. **Skip the role badge in column header.** Dentrix uses naming convention (Op 1 / Hyg 1) to encode role. CST can do the same. If you need explicit role, put it as a one-letter monogram in a small neutral chip next to the name — not a full pill. Avoid stacking "name + role badge + color swatch" — it's three signals where one does the job.

### Diverge from all dental tools

9. **Templates as outlined containers, instances as solid fills — but CST's preview mode is all templates.** So for this mode, the question is: do all blocks look "template-ish" (outlined)? I'd argue **no — go full solid-tint even in preview.** Reason: the template-designer's mental model is "this is what a live day will look like." If preview blocks are outlined, designers will underestimate density. Solid fills at preview time are honest. Reserve outlined treatment for **placeholder / empty-slot / blockout** semantics only.

### The call

**Solid provider-tinted card + 4px top accent strip carrying the 3-segment proportions + 1px border + rounded 6-8px corners + top-left anchored label that truncates, with time suppressed below ~30min.** Two-tone whitespace for empty cells. No shadows. Column headers show provider name with a subtle left vertical color bar in the provider's tint; no role badge.

That combination takes the best of Open Dental (segmentation visible on the block, no hover required), Linear (borders-only elevation, scan-friendly at density), and Google Calendar (label behavior, corner radius).

---

## Concrete block-primitive spec

ASCII rendering of one block at two sizes, plus an empty-time row, plus a column header:

```
+-----------------------------+    <- column header: 40px tall
|  [▎] Dr. Chen  Op 3         |       provider color as 3px left vertical bar
|                             |       name Inter 600 14px, op name 12px 60% gray
+=============================+    <- 1px border between header + grid

      8:00  [ ][ ][ ][ ][ ][ ]     <- empty row, practice-open, white
      8:30  [ ][ ][ ][ ][ ][ ]
      9:00  [ ][ ][ ][ ][ ][ ]        (in-hours: white fill, 1px grid lines
                                       very light - #eaecef)

      9:30  ┌──────────────────┐   <- BLOCK: 60min, 3-seg strip on top
            │▓▓▓░░░░░░░░░░▓▓▓▓│      4px top accent strip:
            │                  │        ▓ = assistant time (dark tint of provider color)
            │ NP Exam & Clean  │        ░ = doctor hands-on (full provider color)
            │ Dr. Chen · 60m   │        ▓ = assistant post (dark tint)
            │                  │      Proportions: 15/30/15 min = 25/50/25%
            │                  │
     10:30  └──────────────────┘      BODY: solid fill in provider color @ 40% vs white
                                      label "NP Exam & Clean" top-left, Inter 600 13px
                                      sub-label "Dr. Chen · 60m" top-left, Inter 400 11px
                                      1px border in provider color @ 70%
                                      6px border-radius
                                      NO shadow

     11:00  ╔══════════╗           <- SHORT BLOCK: 15min, sub-label suppressed
            ║▓▓░░░▓▓▓▓▓║               4px top strip still renders (5/5/5 = 33/33/33)
            ║ Hyg Chk  ║               single truncated label, no sub-label
     11:15  ╚══════════╝               block height just enough for one line + strip

     11:15  ░░░░░░░░░░░░░░░░░░      <- out-of-hours: grey fill #f5f6f8
     11:30  ░░░░░░░░░░░░░░░░░░         (e.g. lunch, practice-closed)
```

### Fill color

- Block body: `color-mix(in oklch, var(--provider-color) 38%, white)` — gives legible tint, maintains contrast for black body text at WCAG AA.
- Enforce luminance floor: if provider color is too dark (L* < 45), mix against white more aggressively (~50% white minimum).
- Alternate light theme: if user prefers outline-only, same provider color at 100% for the 1px border + fully white fill. One toggle, same block primitive.

### Label placement

- Primary label: top-left, 8px inset both sides, Inter 600 13px, single line, truncate with ellipsis.
- Secondary label: directly below primary, 8px top gap (from primary baseline), Inter 400 11px, 60% body-text opacity, single line, truncate. **Suppressed entirely if block height < 56px** (which corresponds roughly to 15 min at CST's current row height — verify against design-tokens.css).
- Never move label to center/right even on wide blocks. Consistency > optimization.

### Accent strip (top edge, 4px)

- Renders as a flex-row of three spans with proportional widths matching the 3 segments.
- Colors:
  - Assistant-pre: `color-mix(in oklch, var(--provider-color) 70%, black 15%)` (darker tint of provider color)
  - Doctor hands-on: `var(--provider-color)` at full saturation
  - Assistant-post: same darker tint as assistant-pre
- If a segment is 0-length, it collapses (flex-basis: 0). The remaining two fill the strip proportionally.
- 1px rounded top corners to match block corner radius (so the strip looks integral, not pasted-on).
- Thin 1px hairline below the strip in `rgba(0,0,0,0.08)` to separate strip from body fill visually without a hard edge.

### Left category stripe (optional — currently not in the redesign, but consider)

Not recommended. The top 4px strip already carries provider-color signal. Adding a left stripe would duplicate that signal and compete visually. Reserve a left stripe for a future orthogonal signal (e.g. "this block has a warning" in amber), should it arise.

### Hover state

- Border brightens: provider color at 100% (from 70%).
- Subtle background lift: `filter: brightness(1.03)`.
- **No shadow, no scale.** Linear's lesson.
- Cursor: `pointer`.
- Hover tooltip (optional): patient name / appointment type full text, no time split (it's already visible on the strip).

### Selected state

- Border: provider color at 100%, 2px (not 1px).
- Background: unchanged fill.
- **Outer focus ring**: 2px offset ring in provider color at 40%. Keyboard-accessible.

### Empty-time treatment

- Within practice hours, unassigned: white fill (`#ffffff`).
- Outside practice hours: light grey (`#f5f6f8`).
- Grid lines: `#eaecef` at 1px, every 15min horizontal. Vertical op-dividers: `#dde1e6` at 1px.
- No stripes, no patterns, no labels. Whitespace is the UI.

### Column header

- Height: 40px.
- Content: 3px left vertical bar (provider color, full saturation), then provider name (Inter 600 14px), then operatory name below in 12px 60% gray.
- Background: white, with a 2px bottom border in provider color at 15% opacity when that column has any scheduled blocks (subtle "this column is active today" cue — Open Dental-inspired).
- **No separate role badge.** If you must surface role (DDS vs RDH), embed it in a single-letter monogram chip directly after the name (`Dr. Chen  [D]`), 10px font, neutral-gray chip. But prefer naming convention at the op-level.

---

## Sources

### Dentrix Ascend
- [Customizing the schedule view — Dentrix Ascend support](https://support.dentrixascend.com/hc/en-us/articles/229955347-Customizing-the-schedule-view)
- [Create a Schedule that Meets Your Production Goals — Dentrix Ascend blog](https://blog.dentrixascend.com/2021/02/10/create-a-schedule-that-meets-your-production-goals/)
- [Scheduling the Perfect Day — Dentrix Magazine](https://magazine.dentrix.com/scheduling-the-perfect-day/)
- [Setting up Time Blocks for Providers — Dentrix blog](https://blog.dentrix.com/blog/2018/02/06/setting-up-time-blocks-for-providers/)
- [Using Appointment Book Views — Dentrix Magazine](https://magazine.dentrix.com/using-appointment-book-views-to-see-scheduled-production/)

### Open Dental
- [Appointments Module](https://www.opendental.com/manual/appointments.html)
- [Appointment View Edit window](https://www.opendental.com/manual/appointmentvieweditwindow.html)
- [Appointment Views](https://www.opendental.com/manual/appointmentviews.html)
- [Time Bars](https://www.opendental.com/manual/timebars.html)
- [Definitions: Appointment Colors](https://www.opendental.com/manual/definitionsappointmentcolors.html)
- [Fun (and Function) with Colors — Open Dental blog](https://opendental.blog/fun-and-function-with-colors/)
- [Block Scheduling in Open Dental](https://opendental.blog/block-scheduling/)

### Denticon (Planet DDS)
- [Denticon Setup Guide — Scheduler Setup](https://support.planetdds.com/hc/en-us/articles/37670014890395-Denticon-Setup-Guide-Scheduler-Setup)
- [Denticon product page](https://www.planetdds.com/denticon/)
- (Scheduler UI is login-gated; no current public screenshots located.)

### Google Calendar
- [Google Calendar gets a design refresh — TechCrunch](https://techcrunch.com/2024/10/24/google-calendar-gets-a-design-refresh-along-with-dark-mode/)
- [Google Calendar redesign enable — Android Police](https://www.androidpolice.com/google-calendar-redesign-enable/)
- [Material You redesign rollout — 9to5Google](https://9to5google.com/2024/10/23/google-calendar-material-you-redesign-dark-theme/)

### Linear
- [Board layout — Linear docs](https://linear.app/docs/board-layout)
- [Display options — Linear docs](https://linear.app/docs/display-options)
- [How we redesigned the Linear UI (part II) — Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Method introduction](https://linear.app/method/introduction)
- [Linear Web Kanban Board — Mobbin](https://mobbin.com/explore/screens/77a9dcea-7020-44ba-9e26-f30a86d92bf4)
