# Multi-Column Coordination — Research Notes

Scope: the canonical rules for scheduling **one doctor across 2, 3, or 4 operatories simultaneously**, with an assistant dedicated to each op doing the pre-doctor and post-doctor phases so the doctor is never the idle resource. This is the pattern our scheduler keeps modelling incorrectly — the notes below are written to be directly translatable into engine rules.

---

## 1. Terminology

The literature does not use one canonical name. The same scheduling mechanic appears under at least nine labels, all describing the same thing: a single doctor rotating through multiple operatories staffed by assistants who run the pre- and post-doctor phases.

| Term | Source |
|------|--------|
| **Block scheduling** (the umbrella term — most sources wrap everything else inside it) | Yapi, Open Dental Blog, Curve Dental |
| **Zone scheduling** | Burkhart Dental, *Constructing Zone Scheduling* |
| **Staggered scheduling** | Dental Clinic Manual (Unit 4), *Harnessing the Power of the Dental Schedule* (D4 Practice Solutions), Teero |
| **Column scheduling** ("two-column scheduling", "multi-column scheduling") | MGE Management Experts, Dental Economics (*Scheduling for Success*) |
| **Hybrid scheduling** (explicitly combines block + staggered + Theory of Constraints) | Spear Education — Hybrid Dental Schedule |
| **Room-to-room / bounce scheduling** | Dental Economics — "busy but not rushed … bounce from room to room" |
| **Overlapping appointments / overlap scheduling** | MGE Management Experts Part 2 |
| **EFDA-leveraged scheduling** (practitioner slang — shows up in DA-scope literature) | AAPD State Laws on DAs, DANB |
| **Smart Seat™ scheduling** (a consultant-branded variant) | DesErgo / Dr. Mayer |

> "You can stagger appointments … designating different time blocks when different staff are interacting with patients to ensure smooth flow of the dentists between multiple operatories." — Safety Net Dental Clinic Manual, Unit 4 ([dentalclinicmanual.com](https://www.dentalclinicmanual.com/4-admin/sec4-02.php))

**Rebuild implication:** treat "column scheduling" as the canonical internal term. Surface "block scheduling" in UI (most recognisable). Every other term maps to the same engine rules.

---

## 2. Canonical single-block pattern (A-D-D-D-D-A)

The canonical pattern breaks every procedure into three segments: **assistant-only prefix → doctor-required middle → assistant-only suffix**. In 10-minute unit notation (near-universal in the literature), this is written with `/` for assistant-only time and `X` for doctor time.

> "Track time needed for each procedure separately for the doctor and the clinical assistant … clearly identify which part of each scheduled procedure represents doctor time, doctor and assistant time together, and assistant time only." — Dental Economics, *Tips to Maximize Your Schedule* ([dentaleconomics.com](https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule))

> "A 70-minute crown prep example: **/XXXX//** represents the breakdown across seven 10-minute blocks." — MGE Management Experts, *Designing the Ideal Schedule Part 2* ([mgeonline.com](https://www.mgeonline.com/2023/ideal-scheduling-for-dental-practice-part-2/))

Burkhart Dental gives the same example at higher resolution:

> "In the crown prep example: Assistant unit time: 3 (pre-procedure) + 3 (post-procedure). Doctor unit time: 6. Total: 12 ten-minute units (2 hours). The doctor only needs 60 minutes of the 2-hour appointment, while the assistant completes seating, preparation, temporary crown placement, homecare instructions, dismissal, charting, and operatory turnover." — Burkhart Dental ([burkhartdental.com](https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/))

### Canonical 60-minute HP block (the A-D-D-D-D-A pattern)

```
min:   0   10   20   30   40   50   60
       |    |    |    |    |    |    |
A/D:   / / X  X  X  X  /  /            (MGE/Burkhart 10-min notation)
Role:  [ASST][------DOCTOR-----][ASST]
Phase: Setup   Hands-on work     Cleanup
        Seat                     Post-op
        Numb                     Dismiss
        X-ray                    Turnover
```

**Phase 1 — Assistant, min 0–10 (sometimes 0–20 for crown/endo):**
- Greet, seat, review med history
- Topical, administer local (where DA scope allows — see §6)
- Take x-rays / intraoral photos
- Setup instruments, bib, bite block
- Let anaesthetic take hold

**Phase 2 — Doctor, min 10–50 (the "doctor middle"):**
- Prep / drill / extract / adjust
- In simple blocks (exam, simple filling) this shrinks to a single 10-min X unit
- In complex blocks (crown, endo, surgical ext) this expands to 4–6 X units

**Phase 3 — Assistant, min 50–60:**
- Impressions, temp fabrication, cementation of temp
- Home-care instructions, dismiss patient
- Break down room, disinfect, turnover to next setup

> "While the assistant is making the temporary, the doctor can work on another patient in another operatory to be most productive." — Dentrix Magazine, *How to Maximize Provider Time in the Schedule* ([magazine.dentrix.com](https://magazine.dentrix.com/how-to-maximize-provider-time-in-the-schedule/))

**Rebuild implication:** every procedure template must carry **three time values**, not one: `asst_pre`, `doctor_required`, `asst_post`. Engine should refuse to save a procedure with only a total duration.

---

## 3. Zigzag / stagger rule between columns

The doctor is a **singleton resource**. Doctor-required (`X`) segments across columns **must not overlap**. Assistant-only (`/`) segments across columns **can overlap freely** because each op has its own assistant.

> "Time units dedicated to a provider (X) can't be booked in more than two appointments at a time. This eliminates the doctor being booked in more than two operatories at once." — Dentrix Magazine ([magazine.dentrix.com](https://magazine.dentrix.com/how-to-maximize-provider-time-in-the-schedule/))

> "Staggering the appointment time by starting the first patient on the hour and the second patient on the half hour would allow the dentist to walk away from the first patient to the second patient and complete them both in about an hour's time." — Pocket Dentistry, Chapter 12 ([pocketdentistry.com](https://pocketdentistry.com/12-appointment-scheduling-strategies/))

### Canonical 2-op zigzag (two crown preps, A-D-D-D-D-A each, 60 min)

```
time  00   10   20   30   40   50   60   70   80   90  100  110  120
      |    |    |    |    |    |    |    |    |    |    |    |    |
Op 1:  /   X    X    X    X    /                                        Crown #1
Op 2:            /   X    X    X    X    /                              Crown #2 — starts at min 20
Op 1:                                /   X    X    X    X    /          Crown #3 — Op1 next patient
Op 2:                                              /   X    X    X  X/  Crown #4

Doctor: idle   OP1  OP1  OP2  OP2  OP2  OP1  OP1  OP1  OP2  OP2  OP2
```

The stagger offset is **equal to the assistant-prefix length of the second column** (typically 10–20 min). Op 2's `/` prefix overlaps Op 1's first `X`; the doctor finishes Op 1's last `X` and walks into Op 2's first `X`.

> "The doctor could anesthetize a patient in one operatory and while waiting for that patient to get numb, they can work on another patient." — Dentrix Magazine

**Rebuild implication:** the scheduler's constraint solver must operate on the `X`-segment graph, not the full appointment rectangles. Two appointment rectangles can overlap; two X-segments on the same doctor cannot. This is the bug we keep shipping.

---

## 4. Column-count scaling (2 → 3 → 4)

### 2 ops — the default
Near-universal recommendation for a productive GP. Minimum requires two assistants.

> "A general dentist should use at least two main chairs and effectively rotate between patients." — Dental Economics ([dentaleconomics.com](https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule))

> "The minimum configuration includes two operatories and ideally two assistants with staggered appointments in two columns. Without two assistants this would not be possible." — Safety Net Dental Clinic Manual

### 3 ops — realistic if the 3rd is flex/overflow
Most literature frames this as "2 primary + 1 flex", not "3 equal columns". The third op absorbs emergencies, short recalls, or DA-only tasks (seating early, impressions).

> "General dentists and all specialists should have at least one additional chair that will produce at 50 to 60 percent of the first two chairs, which will significantly enhance practice production and allow for flexibility in emergency scheduling." — Dental Economics

> "For a 1 doctor practice, 3+2 (3 restorative operatories plus 2 hygiene rooms) is described as the simplest, most productive, most efficient, and most profitable configuration." — How To Open A Dental Office ([howtoopenadentaloffice.com](https://howtoopenadentaloffice.com/2013/11/11/dental-office-design/))

### 4 ops — DSO / high-volume model, hard ceiling
Physically possible only with: (a) EFDA-licensed assistants, (b) short procedures, (c) walking distance <30 ft between ops, (d) a dedicated rover assistant.

> "For a single-doctor practice, a general guideline is four treatment rooms and two hygiene operatories, which gives room to grow without overbuilding at the start." — Apex Design Build ([apexdesignbuild.net](https://www.apexdesignbuild.net/how-many-dental-office-operatories-should-you-have-for-max-roi/))

> "Layout minimizing the walking distance between operatories, particularly in a square floor plan, dramatically improves daily efficiency compared to a rectangular layout where moving between rooms can require 60 feet of travel." — Apex Design Build

### Typical column counts

| Practice type | Doctor columns | Notes |
|--------------|---------------|-------|
| Solo GP (starting) | 1–2 | Scale to 2 once DA trained |
| Solo GP (mature) | 2 + 1 flex | Industry default |
| DSO / high-volume GP | 3–4 | Requires EFDA in scope-of-practice states |
| Specialty (ortho, paediatric) | 3–6 | Doctor check is <5 min, not hands-on work |
| Specialty (endo, OS) | 1–2 | Doctor-required time is the entire procedure |

**Rebuild implication:** engine should expose `max_concurrent_doctor_ops` as a per-practice config, default 2, max 4. Validation rule: `sum(X-segments overlapping at time t) ≤ max_concurrent_doctor_ops`.

---

## 5. Hygiene-check integration

Hygiene recalls embed a doctor-required check, typically at minute 45–50 of a 60-min prophy. This check is **another `X` segment** competing for the same doctor resource as restorative columns.

> "The optimal window for doctor exams occurs during the middle 30 minutes of hygiene appointments. For example, a patient scheduled at 8 a.m. should ideally see the doctor between 8:15-8:45 a.m." — RDH Magazine, *Doctor, I Need a Hygiene Check* ([rdhmag.com](https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check))

> "Hygienists should signal for the doctor 5 minutes before the exam is needed, not when the patient is fully ready and the hygienist is standing idle, giving the doctor a transition window without leaving the hygiene patient waiting." — Rework.com ([resources.rework.com](https://resources.rework.com/libraries/dental-clinic-growth/wait-time-optimization-dental-clinics))

### Diagram — 2 restorative columns + 1 hygiene column

```
time  00   10   20   30   40   50   60   70   80   90
      |    |    |    |    |    |    |    |    |    |
Op 1:  /   X    X    X    X    /                        Crown prep
Op 2:            /   X    X    X    X    /              Crown prep (staggered)
Hyg:   /   /    /    /    /   X    /                    Prophy with exam at min 50
                                 ^
                            doctor check (1 X unit, ~5 min)
```

Hygiene check placement strategies:

1. **Window-based (preferred):** schedule the check into the hygiene op's explicit `X` slot, modelling it exactly like any restorative `X` segment. Engine enforces doctor non-overlap across all columns including hygiene.
2. **Light-signal deferred:** hygiene slot has a "flex exam window" (e.g. min 40–55), not a fixed time. Doctor takes the check during the nearest `/` segment in a restorative column.
3. **Role-switch:** "the doctor and hygienist switch places — the hygienist administers anesthesia to restorative patients while the dentist completes hygiene exams." (RDH Magazine) — only works in states where RDHs can administer local.

> "The single biggest source of hygiene schedule delays in most practices is waiting for the dentist to complete the hygiene exam, with hygienists who can't close out their appointments on time because the doctor is tied up in restorative work becoming the bottleneck that backs up the entire afternoon." — Rework.com

**Rebuild implication:** hygiene exams are not a separate primitive — they are a 1-unit `X` inside a hygiene column. The engine treats hygiene columns identically to restorative columns for purposes of doctor non-overlap. Add an "exam window" concept: earliest/latest unit-index within the hygiene block when the check can land.

---

## 6. Assistant competence and scope of practice

Multi-column only works when the DA can legally and competently run the A-phases unsupervised. Scope varies wildly by state.

### California (most permissive via RDAEF)
- **RDA** — basic support duties under direct supervision
- **RDAEF** (Registered Dental Assistant in Extended Functions) — "place, contour, finish, and adjust all direct restorations … take final impressions for permanent indirect restorations, adjust and cement permanent indirect restorations." — Dental Board of California ([dbc.ca.gov](https://www.dbc.ca.gov/applicants/become_licensed_rdaef.shtml))
- Enables true 4-column model

### Ohio (EFDA tier well-defined)
- **DA** — basic qualified personnel (Hep B vaccine + training)
- **EFDA** — coronal polishing, sealants, placing/contouring restorations, taking impressions. Ohio EFDA is a formal license with a 6-month board-approved program. — Ohio EFDA Association ([ohioefda.org](https://www.ohioefda.org/faq))
- Supports 3-column model with mixed DA/EFDA staffing

### Texas (more restrictive)
- DA performs "basic supportive dental procedures under the direct supervision of a licensed dentist"
- Expanded functions require separate certifications (e.g. pit-and-fissure sealant cert needs 2 years experience + 8 hrs board-approved education)
- TSBDE registration required per expanded function — no blanket EFDA license. — Weave, *Dental Assistant Requirements: State-by-State* ([getweave.com](https://www.getweave.com/dental-assistant-requirements/))

### Duties typically delegated for A-phases (where scope permits)
- Seating, medical-history review, vitals
- Intraoral/extraoral imaging, radiographs
- Topical anaesthetic, rubber-dam placement
- Temporary crown fabrication and cementation
- Impression-taking (alginate, digital scans)
- Suture removal, post-op instructions
- Cavitron / coronal polish (in EFDA states)

### Duties always retained by doctor (the `X` core)
- Diagnosis, treatment planning
- Injection of local anaesthetic (except a handful of states with expanded function)
- Tooth preparation, drilling, caries removal
- Final restoration placement on posterior teeth (many states)
- Extractions, surgery

**Rebuild implication:** engine needs a `state_scope_profile` config that governs which procedure primitives may be inside `asst_pre` / `asst_post` vs doctor-required. A procedure template configured for a California RDAEF practice is not portable to a Texas DA practice.

References: AAPD *State Laws on DAs* ([aapd.org](https://www.aapd.org/assets/1/7/StateLawsonDAs.pdf)), ADAA *Dental Assisting Info By State* ([adaausa.org](https://adaausa.org/resources/dental-assisting-info-by-state/)), DANB *3 FAQs on EFDAs* ([danb.org](https://www.danb.org/news-blog/detail/blog/3-faqs-on-expanded-functions-dental-assistants)).

---

## 7. Transition buffers

Split in the literature.

**Pro-buffer camp** (1–2 min between columns):
- Burkhart Zone Scheduling implicitly builds it in — the `/` suffix of one procedure overlaps the `/` prefix of the next, giving the doctor a handoff window.
- DesErgo "Smart Seat": every 10-min increment is allocated, including anaesthetic-hold time, which acts as an implicit doctor buffer.

**No-buffer camp** (back-to-back X segments):
- Dentrix's double-booking rule is X-adjacent: the doctor can be booked in consecutive 10-min units in different ops with zero gap, and the system will allow it.
- Spear *Hybrid Schedule*: optimises for "busy but not rushed", but doesn't mandate explicit transition time — relies on the inherent `/` padding of the next procedure's assistant prefix.

> "In most cases in a busy, multi-chair office, the doctor's time is going to be the tightest constraint, with the goal being to plan a schedule that allows for the doctor to bounce from room to room, busy but not rushed." — Spear Education ([speareducation.com](https://www.speareducation.com/2022/10/using-a-hybrid-dental-schedule-to-increase-production))

**Rebuild implication:** make `doctor_transition_buffer_min` a config, default 0, user-tunable 0–5. Many consultants get it wrong by hard-coding a buffer that collapses the stagger.

---

## 8. Production impact

| Claim | Source |
|-------|--------|
| "Saves hours a day" vs back-to-back without overlap | MGE, *Ideal Schedule Part 2* |
| 10-min units vs 15-min units: "saves seven production days annually, potentially worth $21,000 in lost revenue recovery" | Dental Economics ([dentaleconomics.com](https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule)) |
| High-performing practices target **doctor production per hour of $500+** | Dental Economics |
| Two-chair rotation: ~**$314 per chair per hour** over an 8-hour day | Dental Economics |
| Efficient general office: **$50,000/operatory/month** | How To Open A Dental Office |
| 4-op practice: **$200,000/month** collections before maxed out | Apex Design Build |
| Schedule-optimised practices: **up to 15% daily productivity lift** | Apex Design Build |
| General dentist with 2+ ops and 2 assistants: **1.7 visits/hour** | Weave, *Dental Scheduling Template* |
| Target **85–90% schedule utilization** | Dental Economics benchmark ([dentaleconomics.com](https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule)) |

The consistent framing: going from 1 column to 2 columns roughly doubles doctor throughput (not operatory throughput — the doctor is the bottleneck, so doubling her parallelism doubles production). Going 2 → 3 adds ~50–60% of a column, not 100%, because of diminishing returns on doctor attention and emergency absorption.

**Rebuild implication:** engine should surface a `projected_doctor_production_per_hour` telemetry value based on X-segment density — practices target $500/hr. If the schedule has X-gaps, the telemetry goes red.

---

## 9. Risk factors and safeguards

Multi-column schedules break predictably. The literature names four failure modes:

### 9.1 Doctor stuck on difficult procedure → cascade
Every X-unit the doctor runs long, every downstream column's X-start slides by the same amount.

> "Without buffer slots, every emergency becomes a cascade, with a 30-minute emergency at 9:30 AM delaying every subsequent appointment by 30 minutes." — Rework.com ([resources.rework.com](https://resources.rework.com/libraries/dental-clinic-growth/wait-time-optimization-dental-clinics))

Safeguard: one **buffer / flex slot mid-morning and mid-afternoon** (the "mid-morning buffer" pattern). Keep the afternoon lighter than the morning.

> "80% of your restorative production goal is met in the morning, with the remaining 20% in the afternoon." — Burkhart Dental

### 9.2 Patient late, X-segment shifts
If a patient is 15 min late and the `/` prefix is only 10 min, the doctor arrives in an unprepared op.

Safeguard: if patient is more than `asst_pre` late, the engine should recommend either reseating as last appointment or pushing the whole block.

### 9.3 Emergency interrupts
Walk-in emergency consumes a doctor X-unit the scheduler didn't allocate.

Safeguard: modified wave — "schedule patients in the first half of an hour and keep the other thirty-minute slot open for special procedures, allowing the dentist to accommodate walk-ins, long procedures, and late patients." — *Wait Time Optimization*

### 9.4 Complex procedures concurrent → doctor can't parallelise
Two crown preps at once is fine. Two molar endos at once is not — each demands continuous doctor attention.

> "As each dentist works out of two dental chairs for optimal productivity, it is important that two complex procedures not be scheduled concurrently for the dentist." — Safety Net Dental Clinic Manual

Safeguard: engine tags procedures with a `doctor_continuity_required` flag (endo, surgical ext). Two continuity-required procedures cannot stagger — they serialise.

### 9.5 Hygiene doctor-check backs up
Hygiene can't close until doctor arrives; if doctor is mid-X in op 1, hygiene patient sits idle.

Safeguard: 5-min lead signal protocol — hygienist flags "need doctor in 5 min" so doctor can finish current X-unit cleanly. UI should surface a "hygiene waiting" indicator.

---

## 10. Software implementations

### Dentrix (Henry Schein)
- Uses explicit `X` (doctor) / `/` (assistant) / empty chair notation at the appointment-time-unit level. Inherited the notation from the canonical dental literature.
- Hard-coded rule: a provider cannot be booked in more than **2** operatories at the same time-unit. Double-book warning at 2, block at 3.
- Chair/Provider/Assistant time all adjustable within a single appointment.
- Custom views support per-staff "TODO" columns next to the patient schedule.
- Reference: *Changing an Appointment's Provider or Assistant Time* ([blog.dentrix.com](https://blog.dentrix.com/blog/2023/02/28/changing-an-appointments-provider-or-assistant-time/)), *How to Maximize Provider Time* ([magazine.dentrix.com](https://magazine.dentrix.com/how-to-maximize-provider-time-in-the-schedule/))

### Open Dental
- Operatories as columns, provider time blocks assigned to specific operatories (or "shared" mode where provider is not pre-assigned).
- Time Bars: up to **2 vertical bars per operatory** showing primary + secondary provider. This is the native UI way to show "doctor is in this op" vs "doctor is elsewhere but this is her op".
- `Schedule Edit Day Window` and `Schedule Setup Examples` manuals explicitly document the "providers share operatories" scenario.
- Appointment Search respects provider-operatory assignment.
- Reference: *Schedule Setup Examples* ([opendental.com](https://www.opendental.com/manual/schedulesetupexamples.html)), *Time Bars* ([opendental.com](https://www.opendental.com/manual/timebars.html))

### Eaglesoft (Patterson)
- OnSchedule module — operatory view with colour-coded appointment booking, provider assignment.
- Straightforward operatory columns; does not implement the `X`/`/` notation as prominently as Dentrix. Doctor/assistant split exists inside appointment but is less surfaced.

### Curve Dental (cloud)
- Cloud-based, 4.5 stars on Capterra. Operatory columns; multi-provider support per operatory.
- Published a "Dental Block Scheduling Template" — treats block scheduling as a first-class concept but doesn't expose X/slash explicitly in UI.
- Reference: *Dental Block Scheduling Template* ([curvedental.com](https://www.curvedental.com/dental-blog/dental-block-scheduling-template))

### Denticon (Planet DDS)
- Provider schedules assigned to operatories via `Setup > Providers > Per Office Settings > Schedules`. Per-office settings allow the same provider to have different op assignments per location.
- DSO-oriented: handles many locations × many providers × shared ops.
- Appointment book shows operatory columns; less documentation on X/slash-style segment notation.
- Reference: Planet DDS support articles ([support.planetdds.com](https://support.planetdds.com/hc/en-us/articles/23918621538459-Denticon-Practice-Analytics-Glossary-Front-Office))

### Dentally (cloud, UK-origin, now US)
- Operatory-column appointment book. Does not publicly document a provider-double-book constraint equivalent to Dentrix's hard 2-op cap.

### UI conventions across all six
- **Operatories as vertical columns**, time on the vertical axis (near-universal)
- **Provider-coloured appointment blocks** — colour by provider so the doctor's "path" through the day is visually obvious
- **Time unit = 10 or 15 min** (10 is the scheduling-consultant recommendation)
- **Within-appointment segments** — Dentrix and Open Dental both let you see doctor vs assistant time *inside* the appointment rectangle; Curve, Eaglesoft, Denticon tend to show only the wrapper rectangle

**Rebuild implication:** our engine needs the Dentrix-style segment model (within-appointment X/slash pattern) plus the Open Dental-style operatory-shared-provider-assignment model. Neither alone is sufficient.

---

## 11. Sources (bibliography)

Primary sources — the canonical scheduling literature:

- Safety Net Dental Clinic Manual, Unit 4: *Administrative Operations — Strategies for Scheduling Appointments* — https://www.dentalclinicmanual.com/4-admin/sec4-02.php
- Burkhart Dental Supply, *Constructing Zone Scheduling* — https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/
- MGE Management Experts, *Designing the Ideal Schedule for Your Dental Practice Part 1 & Part 2* — https://www.mgeonline.com/2023/designing-the-ideal-schedule-for-your-dental-practice-part-1/ and https://www.mgeonline.com/2023/ideal-scheduling-for-dental-practice-part-2/
- D4 Practice Solutions, *Harnessing the Power of the Dental Schedule Beyond the Basics* — https://www.d4practicesolutions.com/wp-content/uploads/Harnessing-the-Power-of-the-Dental-Schedule.pdf
- Pocket Dentistry, Chapter 12: *Appointment Scheduling Strategies* — https://pocketdentistry.com/12-appointment-scheduling-strategies/
- Dental Economics, *Tips to Maximize Your Schedule* — https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule
- Dental Economics, *Scheduling for Success* — https://www.dentaleconomics.com/practice/article/16394481/scheduling-for-success
- Dental Economics, *Right on Schedule* — https://www.dentaleconomics.com/practice/article/16389817/right-on-schedule
- Spear Education, *Using a Hybrid Dental Schedule to Increase Production* — https://www.speareducation.com/2022/10/using-a-hybrid-dental-schedule-to-increase-production
- RDH Magazine, *Doctor, I Need a Hygiene Check* — https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check
- Dentistry IQ, *How to Run an Efficient Dental Hygiene Exam* — https://www.dentistryiq.com/dental-hygiene/clinical-hygiene/article/14180152/how-to-run-an-efficient-dental-hygiene-exam
- Dentistry IQ, *Dental Practice Scheduling Essentials* — https://www.dentistryiq.com/front-office/scheduling/article/16367853/dental-practice-scheduling-essentials
- Dentistry IQ, *8 Steps for Increasing Productivity of Dental Assistants* — https://www.dentistryiq.com/front-office/scheduling/article/16360351/8-steps-for-increasing-the-productivity-of-dental-assistants
- Dentistry IQ, *Just Duet! Tune Up Your Hygiene Department* — https://www.dentistryiq.com/front-office/scheduling/article/16351262/just-duet-tune-up-your-hygiene-department-by-adding-an-assistant
- Rework, *Wait Time Optimization in Dental Clinics* — https://resources.rework.com/libraries/dental-clinic-growth/wait-time-optimization-dental-clinics
- Dentistry Today, *Maximizing Efficiency by Delegation of Duties* — https://www.dentistrytoday.com/sp-1595777018/

Software documentation:

- Dentrix Blog, *Changing an Appointment's Provider or Assistant Time* — https://blog.dentrix.com/blog/2023/02/28/changing-an-appointments-provider-or-assistant-time/
- Dentrix Magazine, *How to Maximize Provider Time in the Schedule* — https://magazine.dentrix.com/how-to-maximize-provider-time-in-the-schedule/
- Dentrix Magazine, *Manage Your Complex Office Schedule Within Dentrix* — https://magazine.dentrix.com/manage-your-complex-office-schedule-within-dentrix/
- Open Dental, *Schedule Setup Examples* — https://www.opendental.com/manual/schedulesetupexamples.html
- Open Dental, *Time Bars* — https://www.opendental.com/manual/timebars.html
- Open Dental, *Operatories* — https://www.opendental.com/manual/operatories.html
- Open Dental Blog, *Block Scheduling in Open Dental* — https://opendental.blog/block-scheduling/
- Curve Dental, *Maximize Efficiency with a Dental Block Scheduling Template* — https://www.curvedental.com/dental-blog/dental-block-scheduling-template
- Yapi, *Understanding Block Scheduling* — https://yapiapp.com/blog/dental-appointment-scheduling/what-is-dental-block-scheduling/
- Teero, *A Guide to Efficient Dental Block Scheduling* — https://www.teero.com/blog/dental-block-scheduling
- Weave, *How to Create the Most Efficient Dental Scheduling Template* — https://www.getweave.com/dental-scheduling-template/
- Planet DDS / Denticon support — https://support.planetdds.com/

Scope-of-practice references:

- AAPD, *Expanded Functions for Dental Assistants — State Laws* — https://www.aapd.org/assets/1/7/StateLawsonDAs.pdf
- AAPD, *Impact Statement — Expanded Function Dental Auxiliary* — https://www.aapd.org/assets/1/7/ImpactStatementAssistants.doc
- DANB, *3 FAQs on Expanded Functions Dental Assistants* — https://www.danb.org/news-blog/detail/blog/3-faqs-on-expanded-functions-dental-assistants
- ADAA, *Dental Assisting Info By State* — https://adaausa.org/resources/dental-assisting-info-by-state/
- Dental Board of California, *How to Become an RDAEF* — https://www.dbc.ca.gov/applicants/become_licensed_rdaef.shtml
- UCSF / Dental Board of California, *2020 CA SOW RDA/RDAEF* — https://oralhealthsupport.ucsf.edu/sites/g/files/tkssra861/f/wysiwyg/2020%20CA%20SOW%20RDA_RDAEF%20-%20Original.pdf
- Ohio EFDA Association FAQ — https://www.ohioefda.org/faq
- Weave, *Dental Assistant Requirements: State-by-State* — https://www.getweave.com/dental-assistant-requirements/
- Stepful, *Dental Assistant Requirements: State-by-State* — https://www.stepful.com/post/dental-assistant-requirements-by-state
- Assisting 101, *Expanded Duties DA Program Georgia* — https://www.assisting101.com/our-programs/expanded-duties/

Office design / operatory-count references:

- How To Open A Dental Office, *Dental Office Design; How Many Operatories Do You Really Need?* — https://howtoopenadentaloffice.com/2013/11/11/dental-office-design/
- Apex Design Build, *How Many Operatories Should You Have for Max ROI?* — https://www.apexdesignbuild.net/how-many-dental-office-operatories-should-you-have-for-max-roi/
- Ideal Practices, *Dental Office Floor Plans* — https://idealpractices.com/blog/dental-office-floor-plans/
- DesErgo, *How Many Treatment Rooms Should a Dental Office Have* — https://desergo.com/blog/how-many-treatment-rooms-should-a-dental-office-have
- DesErgo, *Scheduling Is the Most Important System in Your Dental Practice* — https://desergo.com/blog/scheduling-is-the-most-important-system-in-your-dental-practice
- DesErgo, *How to Increase Dental Production Without Adding Operatories* — https://desergo.com/blog/how-to-increase-dental-production-
- Benco, *Smaller Is Smarter* (white paper) — https://www.benco.com/wp-content/uploads/2022/02/FINAL-21_MRKTNG_WhitePapers_Just-Right-Operatories_d08.pdf
- Apex Design Build, various operatory benchmarks — https://www.apexdesignbuild.net/how-many-dental-office-operatories-should-you-have-for-max-roi/

Risk / wait-time / cascading-delay references:

- DOCS Education, *Mastering the Clock: 8 Strategies to Keep Patients On Time* — https://www.docseducation.com/blog/mastering-clock-8-proven-strategies-keep-dental-patients-time-and-schedule
- mConsent, *Introduction: The Scheduling Struggles in Dental Practices* — https://mconsent.net/blog/introduction-scheduling-struggles-dental-practices/
- Jarvis Analytics, *Core Strategies for Keeping a Full Dental Schedule* — https://www.jarvisanalytics.com/blog/core-strategies-for-keeping-and-managing-a-full-dental-schedule/
- Dental Intelligence, *8 Different Types of Dental Office Scheduling* — https://www.dentalintel.com/blog-posts/8-different-types-of-dental-office-scheduling
