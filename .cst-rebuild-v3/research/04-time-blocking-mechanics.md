# Time-Blocking Mechanics — Research Notes

Deep-source reference for the dental-scheduling-software rebuild. Covers the 10-minute grid, procedure-length conventions, daily boundaries, and the operational conventions (huddle, lunch, emergency access, buffers, double-booking, call lists, extended hours) that every PMS scheduler has to accommodate.

---

## 1. Why 10 minutes

The 10-minute unit is the de facto standard across every major US dental PMS. Dentrix ships with configurable 5/10/15/20/30-minute intervals; Open Dental defaults each grid square to 10 minutes; Eaglesoft allows 5-minute precision; Denticon recommends keeping procedure durations aligned to 15/30/60-minute multiples that nest within a 10-minute grid.

> "By default, each square in the time bar is 10 minutes. The time increment can be set to 5 minutes, 10 minutes, or 15 minutes." — Open Dental manual, Time Bars page [1].

> "You can schedule your appointments in 5-, 10-, 15-, 20-, or 30-minute intervals… If your original Procedure Code Setup used 10-minute time blocks, Dentrix would enter a procedure that required 60 minutes as six units." — Dentrix Blog, "Changing Appointment Time Block Size" [2].

> "Time units in Eaglesoft can be changed in five-minute increments, helping offices schedule more precisely and eliminate wasted time." — Off the Cusp (Patterson/Eaglesoft) [3].

**Stated rationale.** Every consultant source found ties the 10-minute unit to two things: (a) clean arithmetic for hygiene recall and (b) granularity to squeeze slack out of procedure-length estimates.

> "If you're using a 10-minute appointment book system, that translates to seven 10-minute blocks or 'units.' The first 10 minutes is assistant time, during which the assistant prepares the patient for the procedure." — Burkhart Dental Supply, Zone Scheduling guide [4].

> "Many practices still use 15-minute as opposed to 10-minute increments in their scheduling systems. This alone costs the practice seven days of production time every year… 10-minute increments give your scheduling coordinator the ability to more accurately allocate time for clinical procedures based on up-to-date time studies." — Dental Economics, "Tips to maximize your schedule" [5].

**History — recall as the driver.** The 60-minute hygiene recall is the gravitational center. 60 minutes divides cleanly into six 10-minute units (A-D-A structure: assistant setup, doctor exam, hygienist work), but awkwardly into four 15-minute ones (no clean room for a 7-minute doctor check). Source:

> "A typical dental exam and dental hygiene appointment can last around 45-60 minutes. Many offices schedule a full 50 or 60 minutes for every recall patient visit." — NIH/NCBI, Dental Recall recommendations [6].

> "The hygiene patient exam should not take longer than seven minutes." — RDH Magazine, "Doctor, I need a hygiene check!" [7].

**History — not driven by insurance units.** None of the payer-facing documentation (CDT D-codes, Delta Dental billing guides) ties time units to 10 minutes. D0140 limited exams, D1110 prophy, D4910 perio maintenance are billed as procedures, not time-billed increments. The 10-minute convention is practice-management lore, not billing law [8].

**Why not 15.** A 15-minute grid forces the standard prophy into either 45 minutes (too short for full scale/polish/fluoride/exam) or 60 minutes (fine, but leaves a 5-minute doctor-check orphan). A 10-minute grid lets hygienists run 50- or 60-minute columns with a clean 10-minute doctor-check token. It also maps precisely to consultant-recommended procedure structures ("20-20-20" crown prep = three 20-min blocks = six 10-min units) [9].

**Why not 5.** 5-minute granularity exists (Eaglesoft) but is not the default because it (a) makes the visual grid too dense for glance-reading and (b) encourages false precision in procedure length. Consultants treat 10 minutes as the smallest block that actually tracks real chair time.

---

## 2. Canonical procedure lengths (table)

Durations expressed in minutes. "Units" = number of 10-minute blocks. Where sources disagree, "typical" is the modal consultant recommendation; "min/max" is the published range.

| Procedure | Min | Typical | Max | Units (10-min) | Source |
|-----------|-----|---------|-----|---------------|--------|
| New patient comprehensive exam (doctor-led) | 60 | 75 | 90 | 6–9 | MGE, Advanced Indiana, Birchgrove [10][11][12] |
| New patient + hygiene (prophy + doctor check) | 60 | 60–75 | 90 | 6–9 | MGE, Filbrun, Southbridge [10][13] |
| Adult prophy only (D1110) | 30 | 45 | 60 | 3–6 | Colgate Hygienist Formula, SDOralHealth [14][15] |
| Adult prophy + periodic exam (D0120) | 50 | 60 | 60 | 5–6 | RDH Magazine, Today's RDH [7][16] |
| Child prophy + exam | 30 | 40 | 60 | 3–6 | Grand Parkway Pediatric, Sweet Tooth PDO [17][18] |
| Scaling & root planing (D4341/D4342) — per quadrant | 45 | 60 | 90 | 4–9 | Dental Economics, Carmel Dental, Delta Dental [19][20][21] |
| Perio maintenance (D4910) | 45 | 60 | 60 | 4–6 | Colgate Professional, Today's RDH [22][23] |
| Single-surface composite (D2391) | 20 | 30 | 40 | 2–4 | LA Dental Line, Gallatin Dental [24][25] |
| Multi-surface composite (D2392–D2394) | 40 | 60 | 90 | 4–9 | LA Dental Line, DOCS Education [24][26] |
| Crown prep — single, traditional | 50 | 60–80 | 90 | 5–9 | Dentistry IQ (survey, n=1,777), Summit Practice Solutions, DSN [27][28][29] |
| Crown prep — "20-minute / 30-minute" efficient model | 20 | 30 | 60 | 2–6 | DSN "20-Minute Crown," Summit "30-Minute Crown Prep" [29][28] |
| Crown seat / cementation | 20 | 30 | 45 | 2–5 | Animated-Teeth crown steps, Associated Dental Lab [30][31] |
| Implant placement — single, simple | 30 | 60 | 90 | 3–9 | Angell Family Dentistry, Hanna Dental [32][33] |
| Simple extraction | 20 | 30 | 40 | 2–4 | Park Meadows Dental, Aspen Dental [34][35] |
| Surgical extraction | 45 | 60 | 120 | 5–12 | Park Meadows, Aspen, OMS Cincinnati [34][35][36] |
| Limited exam / emergency exam (D0140) | 15 | 20–30 | 30 | 2–3 | Zap Dental Billing, Teero CDT Guide [37][38] |
| Denture wax try-in | 30 | 45 | 60 | 3–6 | Cooney Dental denture timeline, Cranford Dental [39][40] |
| Denture delivery / insertion | 30 | 60 | 60 | 3–6 | Cooney Dental, Saberton [39][41] |
| Night guard / occlusal guard delivery | 15 | 20–30 | 30 | 2–3 | Bluestem, Carefree Dentists [42][43] |

**Notes on the table.**

- The "20-minute crown" vs. "76-minute crown" spread is real and consultant-dependent. The Dentistry IQ survey of 1,777 dentists reported **average scheduled chair time 76 ± 21 minutes** [27]; efficiency consultants at DSN, Summit Practice Solutions, and Pankey advocate structured 20- or 30-minute doctor-time models with assistant pre/post work [29][28]. A rebuilt scheduler should support both — the **procedure-length default should be 80 min (8 units)** but the template should allow practice-level overrides as low as 30 min.
- SRP is the most variable entry. Insurance payer expectations (Delta Dental: "minimum 45–50 min per quadrant") set a **4-unit minimum**. Practices treating advanced cases commonly schedule **6 units (60 min) per quadrant** [19][21].
- Denture delivery vs. try-in: the Brainly-cited CDA training answer (60 min for partial delivery) matches Cooney Dental's denture-appointment PDF [39][44]. Use 60 as the default.

---

## 3. Daily start/end

**Traditional GP day.** 8:00 AM – 5:00 PM, one hour for lunch (12:00–1:00 or 1:00–2:00) is the historical baseline and still the ADA-referenced template [45]. The MGE "Designing the Ideal Schedule" series uses 8–5 as the default frame [46].

**Extended-hours trend.** Consultants and patient-demand data now push the envelope on both ends:

- **Early-morning columns** (7:00–9:00) for working professionals who need to be at work by 9. Some offices run a dedicated 7–3 provider and a 10–6 provider to cover 11 productive hours with two overlapping shifts.
- **Evening columns** (5:00–8:00) for after-work and after-school. Night & Day Dental (NC) is a commonly cited example [47].
- **Compressed weeks** — 4-day × 10-hour schedules are becoming common to give teams a 3-day weekend without sacrificing chair hours.

> "Some dental offices have weekday hours of 7am–8pm… Some practices offer longer opening hours by having employees work in shifts, which allows them to accommodate a wider range of appointment times." — Revenuewell, "Master Dental Scheduling" [48].

> "Just as pharmacies, urgent care clinics, and other healthcare services have extended their hours, dental practices are increasingly adopting the dental office open late model." — Redent Klinik, "Dental Office Open Late" [49].

**Design implication.** The scheduler should not hard-code 8–5. Store per-provider, per-day-of-week start/end; the template renderer generates rows from min-start to max-end across all providers on a given day. Column visibility can be driven by shift assignment.

---

## 4. Lunch

**Length.** 60 minutes is the standard and legally clean default across most US states. Extended 90- or 120-minute lunches exist but trigger split-shift differential rules in some states [50].

> "Making sure that your team all get a full hour each for lunch goes a long way to creating harmony and an enjoyable work environment… Some dental offices provide extended lunches of 90 minutes or two hours for some staff members… there may be legal considerations, as some states have requirements to pay a split shift differential for employees taking 90 minutes or two hours or more for lunch." — Ultimate Patient Experience [50].

**Placement.** 12:00–1:00 is the most common anchor. 1:00–2:00 is used by practices running 7:00 AM starts (gives a ~6-hour morning). 11:30–12:30 appears in pediatric offices.

**Staggered vs. whole-office.** Both are observed. Consultant recommendations diverge:

- **Whole-office**: simpler to manage, team-building benefit, phones roll to answering service. MGE's default.
- **Staggered**: front desk and one hygiene column stay open through lunch; answers phones and absorbs emergencies. Recommended by Delta Dental's "smarter scheduling" piece [51].

> "Dental offices can stagger lunches so that everyone gets an hour, ending the morning with one-hour appointments so some team members can go to lunch early. Some dentists stagger their team members' lunches so that the phone and front desk are manned at all times." — Ultimate Patient Experience [50].

**Design implication.** Support both modes — a whole-office lunch block (single template entry) OR per-column lunch blocks (per-provider, per-day).

---

## 5. Morning huddle and afternoon review

**Morning huddle.** Universal consultant recommendation. Built into the schedule template as a **pre-clinic blocked-off period**.

> "The dental morning huddle is a 10-15 minute daily team meeting, with a typical duration of 15 minutes, held 5–15 minutes before doors open." — Multiple sources synthesized from Dental Intelligence, Cambridge Dental Consultants, Weave, PlanetDDS [52][53][54][55].

**Length.** 10–15 minutes. Never longer — if it runs long, the first patient is late.

**Placement.** Starts 15 min before first patient. If first patient is at 8:00, huddle is 7:45–8:00.

**Attendees.** Entire clinical + admin team: dentists, hygienists, assistants, front office.

**Afternoon review.** Less universal than morning huddle but present in higher-performing practices. Typically 10–15 minutes at day's end to:
- Review same-day production vs. goal.
- Confirm tomorrow's schedule, especially unfilled gaps.
- Flag patients needing callbacks.

**Design implication.** Huddle and afternoon review should be first-class template entities — not "block-offs" — so dashboards can show "huddle attendance" and "afternoon review completion" as KPIs. Minimum default: morning huddle 15 min, afternoon review 10 min, both team-wide.

---

## 6. Emergency access

**Universal consultant advice: reserve dedicated emergency slots every day.** The template should enforce these as "do not fill before X o'clock" blocks.

**Typical placement.**
- **One slot mid-morning** (e.g., 10:30–11:00) — captures patients who woke up with pain.
- **One slot early afternoon** (e.g., 2:00–2:30 or 2:30–3:00) — captures patients who developed pain during the day, or walk-ins from lunch.

> "Two daily 30-minute buffer zones should be maintained specifically for urgent, high-paying emergency cases." — DOCS Education, "Mastering the Clock" [26].

> "Building 15-minute 'emergency buffer' slots into each day is important because dental emergencies are inevitable and bumping scheduled patients damages trust." — Curve Dental scheduling checklist [56].

**Slot length.** 20–30 minutes is typical (2–3 units). Long enough for a D0140 limited exam + PA radiograph + diagnosis + initial treatment (e.g., palliative incision and drainage, temp restoration). Not long enough for definitive root canal or extraction — those get rescheduled.

**Release policy.** Consultants universally recommend a "release-by" time:
- **Morning slot**: release by 10:00 AM if unfilled (pulls from ASAP list).
- **Afternoon slot**: release by 1:00 PM.

This keeps the slot useful for genuine emergencies early in the day but recovers the production time if no emergency materializes.

**Design implication.** Emergency slots need three attributes: (a) scheduled start/end, (b) "protected until" time before which only emergency-coded appointments can book, (c) auto-release behavior that notifies the scheduler and/or promotes an ASAP-list patient.

---

## 7. Recovery buffers

**Practice pattern.** Some higher-volume or specialty practices insert 10- or 20-minute buffers after big procedures (crown prep, implant placement, multi-quad SRP, surgical extraction) for:
- Patient recovery (bleeding, anesthesia wearing off, post-op instructions).
- Operatory turnover (clean down, sterilize, restock).
- Doctor/assistant documentation and lab prescription time.

**Source evidence.**

> "Some dental practices accomplish crown prep in 60 minutes total using an assistant-doctor-assistant time model (20-20-20), where the middle twenty minutes is the doctor time for prep, impression, temporary fabrication and cement." — DSN, "20-Minute Crown" [29].

The 20-20-20 structure is itself a buffer pattern — the terminal 20-min assistant block is partly recovery/finishing.

**Consultant divergence.** Efficient-scheduling advocates (Summit Practice Solutions, DSN, Dental Success Network) argue buffers are waste — schedule back-to-back with a confident time study. Conservative consultants (Cathy Jameson, Pankey Institute) argue a 10-min buffer after the "rock" procedures protects the whole afternoon from cascading lateness.

**Design implication.** Support optional recovery buffers as a per-procedure-code attribute: "add N 10-minute buffer units after this procedure." Default = 0 for routine, 1 unit (10 min) for surgical/implant/SRP. Let the practice override globally or per-appointment.

---

## 8. Double-booking

**Appropriate for hygiene, rare for doctor chair.**

**Hygiene column staggering.** Widely accepted. Two hygiene patients scheduled 30 minutes apart in a 60-minute model: while patient A is getting polished/flossed by assistant, hygienist begins scaling on patient B.

> "Patients are usually stagger-booked with certain scheduling models, meaning all appointments overlap by 30 minutes. For a nine-hour day (with a one-hour lunch), the hygienist or hygiene assistant will see 16 patients." — RDH Magazine [7].

**Doctor column.** Double-booking is limited to the 7-minute hygiene exam — doctor "pops" from an operative column into hygiene for a recall check, then returns. Not true double-booking of operative chairs.

> "The hygiene patient exam should not take longer than seven minutes." — RDH Magazine [7].

**Where consultants draw the line.**
- **OK**: doctor hygiene checks overlapping operative work.
- **OK**: hygienist + assistant tandem (assistant does setup/polish).
- **NOT OK**: two operative procedures on the same doctor simultaneously.
- **NOT OK**: scheduling a surgical/sedation case concurrent with anything else.

**Design implication.** The scheduler must model doctor time as a separate resource from operatory/chair time. A 60-min hygiene appointment with a 10-min doctor-exam token mid-block should lock 10 minutes of doctor time without locking the chair.

---

## 9. Cancellation / short-notice list

**ASAP list is a separate data structure from the schedule.** Every major PMS has one:

> "An ASAP List is a list of patients who would like to come in as soon as an opening is available, used to identify patients and notify them of openings." — Open Dental manual [57].

> "A digital waitlist automatically matches open time slots with eligible patients (e.g., procedure type, provider, time preference) and sends them a text message to claim the slot in one tap." — NexHealth Waitlist [58].

**Template reservations.** Higher-end consultants (Jameson, Levin) recommend that the schedule template itself NOT reserve dedicated "call-list slots." Instead:
- Use pre-blocked "rocks" (high-production) and "sand" (short/low-production) buckets.
- When a cancellation opens a rock block, the ASAP list is filtered by "patient has pending crown/implant/multi-surface" and offered to rock-eligible patients first.
- When a short appointment cancels, the sand-eligible ASAP list is used.

**Design implication.** ASAP list needs procedure-type tagging so it can be matched to cancellations automatically. Do not require the template to pre-reserve short-notice slots — it's a waste of primetime production capacity.

---

## 10. Saturday / half-day / evening

**Saturday.** Common in 2026 at corporate/DSO practices and competitive solo practices. Typical patterns:
- **Half-day Saturday**: 8:00 AM – 1:00 PM, hygiene-heavy, no lunch block.
- **Full Saturday**: 8:00 AM – 4:00 PM with 30-min staff lunch, usually every other week.

**Half-day weekdays.** Many practices run one half-day (e.g., Friday PM off). Template should support day-of-week conditional hours.

**Evening shifts.** 11:00 AM – 7:00 PM or 12:00 PM – 8:00 PM for a single provider, paired with a 7:00–3:00 daytime provider. Requires overlap coverage for hygiene doctor-checks.

**Template differences from standard weekday.**
- No morning huddle if half-day (or a 5-min pre-shift brief instead).
- Lunch often eliminated on 5-hour shifts.
- Emergency slot may be eliminated (or kept if volume supports it).
- Staffing is thinner — fewer columns active, different staff assignments.

**Design implication.** The template system should operate on day-of-week templates (Mon/Tue/.../Sat), not a single "standard day" with overrides. Each day gets its own column layout, start/end, break structure, huddle presence.

---

## 11. Sources (bibliography)

1. Open Dental Software, "Time Bars," https://www.opendental.com/manual/timebars.html
2. The Dentrix Blog, "Changing Appointment Time Block Size," https://blog.dentrix.com/blog/2020/06/02/changing-appointment-time-block-size/
3. Off the Cusp (Patterson), "Eaglesoft's Advanced Scheduling Features," https://www.offthecusp.com/eaglesoft%E2%80%99s-advanced-scheduling-features/
4. Burkhart Dental Supply, "Constructing Zone Scheduling," https://www.burkhartdental.com/practice-guide/front-office-systems/constructing-zone-scheduling/
5. Dental Economics, "Tips to maximize your schedule," https://www.dentaleconomics.com/practice/article/16391060/tips-to-maximize-your-schedule
6. NIH/NCBI Bookshelf, "Recommendations — Dental Recall," https://www.ncbi.nlm.nih.gov/books/NBK54533/
7. RDH Magazine, "'Doctor, I need a hygiene check!'," https://www.rdhmag.com/career-profession/personal-wellness/article/16405567/doctor-i-need-a-hygiene-check
8. Delta Dental, "SRP Dental Code: Scaling and Root Planing Dental Code for Providers," https://www1.deltadentalins.com/dentists/fyi-online/2021/scaling-root-planing-claims.html
9. Dental Success Network, "Dental Practice Systemization: 20 Minute Crown," https://dentalsuccessnetwork.com/blog/dental-practice-20-minute-crown-prep/
10. MGE Management Experts, "How Long Should a New Patient Initial Appointment Be?" https://www.mgeonline.com/2025/how-long-should-a-new-patient-initial-appointment-be/
11. Advanced Dental Care, "How Long is a Dentist Appointment," https://www.advancedindiana.com/blog/how-long-is-a-dentist-appt-your-complete-guide
12. Birchgrove Dental Practice, "New Dental Patient Exam," https://www.birchgrovedental.co.uk/understanding-new-patient-dental-exam/
13. Filbrun Family Dentistry, "What to Expect During a New Patient Comprehensive Exam," https://filbrunfamilydentistry.com/what-to-expect-during-a-new-patient-comprehensive-exam-a-guide/
14. Colgate Professional, "Hygienist Appointment Time Management Formula," https://www.colgateprofessional.com/hygienist-resources/tools-resources/hygienists-appointment-time-management-formula
15. Center For Oral Health, "How Long Does a Dental Exam and Cleaning Take?" https://sdoralhealth.com/how-long-does-a-dental-exam-and-cleaning-take/
16. Today's RDH, "DENTISTS: Why You Should Give Your Hygienist 60 Minute Appointments," https://www.todaysrdh.com/dentists-why-you-should-give-your-hygienist-60-minute-appointments/
17. Grand Parkway Pediatric Dental, "How Long is a Typical Children's Oral Health Exam?" https://www.grandparkwaypediatricdental.com/blog/how-long-is-a-typical-children-oral-health-exam-cip2000/
18. Sweet Tooth PDO, "How Long Does a Cleaning Take at the Dentist?" https://www.sweettoothpdo.com/how-long-does-cleaning-take
19. Dental Economics, "Scaling and root-planing," https://www.dentaleconomics.com/science-tech/article/16388763/scaling-and-root-planing
20. Carmel Dental Associates, "How Long Does Scaling And Root Planing Take?" https://www.carmeldentalassociates.com/how-long-does-scaling-and-root-planing-take/
21. Authority Dental, "Scaling and Root Planing Cost (SRP)," https://www.authoritydental.org/scaling-and-root-planing-cost
22. Colgate Professional, "D4910: When and For How Long Is Periodontal Maintenance the Right Code?" https://www.colgateprofessional.com/hygienist-resources/tools-resources/how-long-periodontal-maintenance
23. Today's RDH, "Periodontal Maintenance: Taking the Guesswork Out of the 4910," https://www.todaysrdh.com/periodontal-maintenance-taking-the-guesswork-out-of-the-4910/
24. LA Dental Line, "How Long Dentist Appointments Take," https://ladentalline.com/how-long-dentist-appointments-take/
25. Gallatin Dental, "How Long Do Dentist Appointments Take?" https://www.gallatindental.com/patient-education/how-long-do-dentist-appointments-take
26. DOCS Education, "Mastering the Clock: 8 Proven Strategies to Keep Dental Patients On Time and On Schedule," https://www.docseducation.com/blog/mastering-clock-8-proven-strategies-keep-dental-patients-time-and-schedule
27. Dentistry IQ, "The 15-minute crown procedure," https://www.dentistryiq.com/front-office/scheduling/article/16348635/the-15-minute-crown-procedure
28. Summit Practice Solutions, "The 30-minute Crown Prep," https://summitpracticesolutions.com/blog/the-30-minute-crown-prep/
29. Dental Success Network, "Dental Practice Systemization: 20 Minute Crown," https://dentalsuccessnetwork.com/blog/dental-practice-20-minute-crown-prep/
30. Animated-Teeth, "The steps of the dental crown procedure," https://www.animated-teeth.com/dental_crowns/t4_dental_crowns_steps.htm
31. Associated Dental Lab, "Crown Seating Checklist: Cut Chair Time by 30%," https://associateddl.com/pre-seat-checklists-that-cut-chair-time-30-checklist/
32. Angell Family Dentistry, "How Long Does Dental Implant Procedure Take? Complete Guide," https://www.angellfamilydentistry.com/how-long-does-a-dental-implant-procedure-take/
33. Hanna Dental Implant Center, "How Long Does a Dental Implant Procedure Take?" https://hannadentalimplants.com/how-long-does-a-dental-implant-procedure-take/
34. Park Meadows Dental, "How Long Does a Tooth Extraction Take for Simple & Surgical Cases," https://parkmeadowsdental.ca/blog/how-long-does-a-tooth-extraction-take/
35. Aspen Dental, "How long does a tooth extraction take?" https://www.aspendental.com/dental-care-resources/how-long-does-a-tooth-extraction-take/
36. Oral & Facial Surgery Associates (OMS Cincinnati), "How Long Does A Tooth Extraction Take?" https://www.omscincinnati.com/how-long-does-a-tooth-extraction-take/
37. Zap Dental Billing, "D0140 Dental Code," https://zapdentalbilling.com/d0140-dental-code/
38. Teero, "CDT Code D0140: Limited Oral Exam Guide," https://www.teero.com/cdt-codes/dental-code-d0140-limited-oral-exam-guide
39. Cooney Dental, "Denture Appointment Timeline," https://www.cooneydental.com/cmss_files/attachmentlibrary/denture_appointment_timeline.pdf
40. Cranford Dental, "Denture Appointments: What to Expect," https://cranforddental.com/denture-appointment-what-to-expect/
41. Saberton, "How Long to Get Dentures," https://www.saberton.ca/blog/how-long-to-get-dentures-timeline
42. Bluestem, "Occlusal Guard or Night Guard," https://www.bluestemlincoln.com/healthcare-service/occlusal-guard-or-night-guard/
43. Carefree Dentists, "Dental Night Guard (Occlusal Guard) Instructions," https://carefreedentists.com/dental-night-guard-occlusal-guard-instructions/
44. Brainly (referenced CDA training answer), "How long of an appointment is scheduled to deliver the partial denture?" https://brainly.com/question/43704642
45. American Dental Association, "Office Hours," https://www.ada.org/resources/practice/practice-management/office-hours
46. MGE Management Experts, "Designing The Ideal Schedule for Your Dental Practice: Part 1," https://www.mgeonline.com/2023/designing-the-ideal-schedule-for-your-dental-practice-part-1/
47. Night & Day Dental (NC), https://www.nightanddaydental.com/
48. Revenuewell, "Master Dental Scheduling: How to Schedule Dental Appointment," https://www.revenuewell.com/article/master-dental-scheduling
49. Redent Klinik, "Dental Office Open Late: Your Complete Guide to Evening Dental Care," https://www.redentklinik.com/en/dental-office-open-late/
50. The Ultimate Patient Experience, "What's Happening With Your Dental Office Lunch Breaks?" https://theultimatepatientexperience.com/whats-happening-with-your-dental-office-lunch-breaks/
51. Delta Dental, "5 smart dental office scheduling tips that'll save you time and energy," https://www1.deltadentalins.com/dentists/fyi-online/2025/smarter-scheduling-tips-for-dental-offices.html
52. Dental Intelligence, "Dental Morning Huddle," https://www.dentalintel.com/dental-morning-huddle
53. Cambridge Dental Consultants, "Morning Huddle Checklist," https://www.mydentalconsultant.com/free-documents/checklists/morning-huddle-checklist
54. Weave, "Tips for a Great Dental Morning Huddle," https://www.getweave.com/tips-for-a-great-dental-morning-huddle/
55. PlanetDDS, "How To Hold Effective Morning Huddle Meetings For Your Dental Practice," https://www.planetdds.com/blog/effective-morning-huddles-to-kickstart-your-day/
56. Curve Dental, "Your Dental Office Scheduling Checklist: 10 Steps to Success," https://www.curvedental.com/dental-blog/dental-office-scheduling-checklist
57. Open Dental Software, "ASAP List," https://www.opendental.com/manual/asaplist.html
58. NexHealth, "Waitlist | Quickly Fill Cancellations," https://www.nexhealth.com/features/waitlist
59. Dentrix Ascend, "Changing the scheduling time increments," https://support.dentrixascend.com/hc/en-us/articles/229957847-Changing-the-scheduling-time-increments
60. Dental Intelligence Knowledge Base, "Set Up OnSchedule Templates in Eaglesoft," https://educate.dentalintel.com/en/articles/6213759-engagement-set-up-onschedule-templates-in-eaglesoft
61. Dental Intelligence Knowledge Base, "Set Up Denticon for Dental Intelligence Online Scheduling," https://educate.dentalintel.com/en/articles/13717565-set-up-denticon-for-dental-intelligence-online-scheduling
62. Jameson Coaching, "7 Easy Production Planning Tricks That Actually Work," https://coaching.jmsn.com/7-easy-production-planning-tricks-that-work/
63. Revenuewell, "Boost Dental Office Productivity with Block Scheduling," https://www.revenuewell.com/article/block-scheduling-productivity
64. Dental Management Diary, "Rocks, Pebbles, Sand," https://dentalmanagementdiary.wordpress.com/tag/rocks/
65. Dentistry IQ, "Scheduling for productivity, profitability, and stress control," https://www.dentistryiq.com/front-office/scheduling/article/16363540/scheduling-for-productivity-profitability-and-stress-control
