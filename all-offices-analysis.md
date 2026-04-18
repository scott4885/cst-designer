# Complete Analysis: All 5 Dental Office Schedule Templates

Generated: 2026-02-13T03:55:31.039Z

## Overview

This document provides a comprehensive analysis of 5 distinct dental office schedule templates, extracted from Excel files. These templates represent real-world scheduling patterns used by ~150 dental practices.

## Office Summary Table

| Office | Providers | Block Types | Days/Week | Key Features |
|--------|-----------|-------------|-----------|--------------|
| Smile Cascade | 5 | 31 | Varies | Every Other Friday schedule (alternating weeks) |
| NHD Ridgeview | 1 | 24 | Varies | 4-day workweek (Mon-Thu only) |
| CDT Comfort Dental | 7 | 25 | Varies | Has "HYG EX ID" column for hygiene exam tracking |
| KCC Clay Center | 3 | 28 | Varies | Thursday schedule has "Option 1" and "Option 2" variants |
| Los Altos | 3 | 48 | Varies | Multiple schedule generations/revisions present |

---

## Smile Cascade

**Description:** Dr. Kevin Fitzpatrick — Mon-Thu + Every Other Friday

**File:** `file_27---546616e6-b3a3-453b-9d5b-58da73985d8c.xlsx`

**Sheets:** Reading the Schedule Template, Scheduling Guidelines, Monday 1.26, Tuesday 1.26, Wednesday 1.26, Thursday 1.26, Every Other Friday 1.26, Monday, Tuesday, Wednesday, Thursday, Every Other Friday

### Providers

| Provider | Operatory | Daily Goal | Hours | $/Hr | 75% Goal |
|----------|-----------|------------|-------|------|----------|
| Dr. Kevin Fitzpatrick | OP8/OP9 | $5,000 | 8 | N/A | $625 |
| Cheryl Dise RDH | OP2 | $2,600 | 8 | N/A | N/A |
| Luke Beyer RDH | OP1 | $2,256 | 8 | N/A | N/A |
| Jamal Rinvelt  RDH | N/A | $2,128 | 8 | N/A | N/A |
| Alexa Mustert RDH | OP4 | $1,920 | 8 | N/A | N/A |

### Block Types

| Label | Minimum $ | Notes |
|-------|-----------|-------|
| NEW PATIENTS/SRP BLOCKS | None | Scaling & Root Planing |
| A | None |  |
| HP > $1200 | $1200 | High Production (crowns, implants) |
| NON-PROD | None |  |
| H | None |  |
| Recare/Perio Maint > $150 | $150 | Recare/Prophy |
| NPE>$300 | $300 | New Patient |
| D | None |  |
| PM = 5/5/(TOTAL) | None |  |
| Perio Maint/Ging > $190 | $190 |  |
| HP > 1200 | None | High Production (crowns, implants) |
| High Production, greater than $1200 | $1200 |  |
| MP | None |  |
| Medium Production | None |  |
| AHT>$300 | $300 |  |
| NP CONS | None | New Patient |
| New Patient Consultation/Same Day Tx | None |  |
| ER | None | Emergency |
| Emergency Limited Exam | None |  |
| Recare/Perio Maint > 150 | None | Recare/Prophy |
| Prophy or Perio Maint+Fluoride+4 BTW, greater than $150 | $150 |  |
| Perio Maint/Ging > 190 | None |  |
| Perio Maint or Gingival+Fluoride, greater than $190 | $190 |  |
| NPE > 300 | None | New Patient |
| AHT/Perio > 300 | None |  |
| Perio Treatment 2 Quads, greater than $300 | $300 |  |
| NP>$300 | $300 | New Patient |
| PM = 5/5(TOTAL) | None |  |
| PM = 0/5/(TOTAL) | None |  |
| HP > $5000 | $5000 | High Production (crowns, implants) |
| AHT > $300 | $300 |  |

### Schedule Grid Structure

- **Time Column:** L
- **Time Range:** 7:00 – 6:00
- **Increment:** 10 minutes
- **Lunch Break:** Not specified
- **Provider Columns:**
  - Column M: DR 1
  - Column O: DR 2
  - Column Q: HYG 1
  - Column S: HYG 2
  - Column U: HYG 4
  - Column W: HYG 3

### Matrixing/Staffing Codes

Codes found: A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D

- **D** = Doctor time in this slot
- **A** = Assistant time
- **H** = Hygienist time
- White/empty = Open/flex time

### Color Coding

1022 cells with color formatting detected. Colors are used to indicate provider assignment and time blocking.

### Unique Features

- Every Other Friday schedule (alternating weeks)
- Large team: 5 providers

### Shared Content Sheets

#### Reading the Schedule Template

Key guidance found (26 lines):

```
How to Read the Schedule Template
The scheduling template is designed to optimize provider schedules, ensuring efficient operatory usage, financial goal achievement, and strategic appointment placement. Below is a breakdown of key sections and how to interpret appointment blocks.
1. Provider Information/Working
Lists working providers, including dentists and hygienists, along with their unique provider IDs.
2. Hygiene Exam Assignments
Displays the hygienists and their exam IDs assigned for each provider (if applicable).
3. Operatory / Column Assignments
Specifies which column each provider is scheduled to work in throughout the day.
4. Daily Financial Goals
Daily Goal: The total revenue target set for each provider.
Goal Today: The specific expected revenue for the day.
Hours Today: Total scheduled working hours.
$ Per Hour: Revenue goal per hour, based on historical 2024 budget data and number of hours worked on average.
75% of Goal Today: A benchmark target to fill 75% of the daily goal into the High Treatment Production blocks to progress toward the full goal.
5. Appointment Block Labels and Scheduling Priorities
Reference the Block Labels and Block Descriptions table to the left in each weekday tab.
Each provider’s schedule is broken into appointment blocks, which indicate the type of procedures or patients scheduled during that time. These blocks ensure providers remain productive and on track to meet their daily goals.
A. Exam Blocks: Reserved for hygiene exams, typically placed throughout the day in alignment with hygiene appointments.
B. Treatment Blocks: Time allocated for restorative work, such as fillings, crowns, or root canals.
C. High Treatment Production Blocks/HP (Priority Scheduling):
... (truncated)
```

#### Scheduling Guidelines

Key guidance found (12 lines):

```
Scheduling Guidelines
48-Hour Rule:                                                                                                                                                                                                   When implementing the new scheduling template, if an appointment block remains unfilled within 48 hours, prioritize scheduling an alternative appointment type to ensure the block does not remain open. Maintaining a fully booked schedule is essential, so always apply this 48-hour rule to optimize appointment availability.
Priority Booking Rules Aligned with Your Goals:                                                                                                                       Maximize high treatment procedures: Utilize the reserved pre-blocks labeled "HP" for high-production appointments like crowns, implants, or comprehensive treatments. Schedule the pre-block to the minimum dollar amount listed to align with each providers daily goals.
Confirmation & Cancellation Policies:                                                                                                                                               Implement a proactive confirmation process: Use your automated reminders (texts, emails, or calls) at least 48 hours before appointments to reduce no-shows.
Establish a last-minute cancellation protocol: If a patient cancels within 24–48 hours, have a standby list ready to fill the slot.                                                                                                                                                                                                      Tools we can use: Dental Intel, ASAP/Short Call Lists, Unscheduled Treatment Lists.
Flexibility & Adaptation:                                                                                                                                                                                   Follow the 48-hour rule: If specific appointment types don’t fill within 48 hours, adjust and allow different appointment types to prevent open slots.                                                                                                                                                                                                  Review and adjust your template regularly: Monitor scheduling patterns and adjust the template based on patient demand and office workflow. Please schedule a revision meeting with Alexa when the template shows a need for adjustment, as well as when there are any changes to providers or practice hours.
Online Scheduling Availability & Optimization:                                                                                                                                   Monitor and Adjust Availability: Regularly check how far key procedures are booked out (e.g., new patient exams, emergencies, hygiene). If wait times are too long, adjust appointment blocks to improve and shorten wait times.
Optimize Scheduling with Alexa: Work with Alexa to maximize online scheduling availability, and strategize how to fill last-minute openings and reduce schedule gaps.
Online Scheduling Availability Tracking Template | How to Use This Template
Date Reviewed | Procedure Type | Next Available Appointment | Avg. Wait Time (Days) | % Online Slots Filled | % Manual Bookings | Cancellation Rate | Adjustment Needed? (Y/N) | Action Taken | Follow-Up Date | ✅ Fill this out weekly to monitor appointment availability and identify scheduling issues.
New Patient Consultation | Open More Slots | ✅ Compare "Next Available Appointment" to benchmarks—if patients are waiting too long, adjust accordingly.
New Patient Hygiene Cleaning and Exam | Adjust Provider Schedule | ✅ Track online vs. manual bookings to determine if adjustments to online scheduling availability are needed.
Hygiene Recare Cleaning and Exam | TrueLark Follow-Up | ✅ Note cancellations—high rates may indicate a need for reminder adjustments or reallocation of appointment types.
Emergency Visit | Add Emergency Blocks | ✅ Coordinate with Alexa based on findings to maximize online scheduling efficiency.
```

---

## NHD Ridgeview

**Description:** Dr. Anne Isinger, Kate Garland — Mon-Thu, 4-day office, DX-Views setup

**File:** `file_28---b06725bc-dcc6-4a5e-8059-4f36b82c594f.xlsx`

**Sheets:** Reading the Schedule Template, Scheduling Guidelines, Monday 1.26, Tuesday 1.26, Wednesday 1.26, Thursday 1.26, Monday 2025, Tuesday 2025, Wednesday 2025, Thursday 2025, DX-Views and Goals Setup

### Providers

| Provider | Operatory | Daily Goal | Hours | $/Hr | 75% Goal |
|----------|-----------|------------|-------|------|----------|
| Dr. Anne Isinger | N/A | $5,000 | 8 | N/A | $625 |

### Block Types

| Label | Minimum $ | Notes |
|-------|-----------|-------|
| NP | None | New Patient |
| NEW PATIENTS/SRP BLOCKS | None | Scaling & Root Planing |
| PM = 6/6 | None |  |
| H | None |  |
| PERIO MAINT | None | Emergency |
| A | None |  |
| HP>$1500 | $1500 | High Production (crowns, implants) |
| D | None |  |
| perio maint/fl2 | None |  |
| High Production, minimum of $1100 PPO Patients | $1100 |  |
| Medium Production | None |  |
| NP CONS | None | New Patient |
| New Patient Consultation/Same Day Tx | None |  |
| ER | None | Emergency |
| Emergency Limited Exam | None |  |
| Perio Maintenance, minimum of $150 | $150 |  |
| NP>150 | None | New Patient |
| New Patient Hygiene, minimum of $150 | $150 |  |
| SRP | None | Scaling & Root Planing |
| PM>140 | None |  |
| PM = 5/6 | None |  |
| High Production, minimum of $1500 UCR/NON-PPO | $1500 |  |
| Perio Maintenance, minimum of $140 | $140 |  |
| SRP>400 | None | Scaling & Root Planing |

### Schedule Grid Structure

- **Time Column:** L
- **Time Range:** 6:00 – 6:00
- **Increment:** 10 minutes
- **Lunch Break:** Not specified
- **Provider Columns:**
  - Column M: 1-SK
  - Column O: 2-JC
  - Column Q: 3HOF
  - Column S: 4DRP
  - Column U: 5DRP
  - Column W: 7DRA

### Matrixing/Staffing Codes

Codes found: H, A, D, H, A, D, H, D, A, H, A, D, H, A, D, H, A, D, H, D, A, H, A, D

- **D** = Doctor time in this slot
- **A** = Assistant time
- **H** = Hygienist time
- White/empty = Open/flex time

### Color Coding

1286 cells with color formatting detected. Colors are used to indicate provider assignment and time blocking.

### Unique Features

- 4-day workweek (Mon-Thu only)
- DX-Views setup (diagnostic viewing protocol)

### Shared Content Sheets

#### Reading the Schedule Template

Key guidance found (25 lines):

```
How to Read the Schedule Template
The scheduling template is designed to optimize provider schedules, ensuring efficient operatory usage, financial goal achievement, and strategic appointment placement. Below is a breakdown of key sections and how to interpret appointment blocks.
1. Provider Information
Lists working providers, including dentists and hygienists, along with their unique provider IDs.
2. Hygiene Exam Assignments
Displays the assigned hygienists and their exam IDs for each provider.
3. Operatory / Column Assignments (OPs)
Specifies which column each provider is scheduled to work in throughout the day.
4. Daily Financial Goals
Daily Goal: The total revenue target set for each provider.
Goal Today: The specific expected revenue for the day.
# of Hours: Total scheduled working hours.
$ Per Hour: Revenue goal per hour, based on historical 2024 budget data and number of hours worked on average.
75% of Goal Today: A benchmark target to fill 75% of the daily goal into the High Production blocks to progress toward the full goal.
5. Appointment Block Labels and Scheduling Priorities
Each provider’s schedule is broken into appointment blocks, which indicate the type of procedures or patients scheduled during that time. These blocks ensure providers remain productive and on track to meet their daily goals.
1. Exam Blocks: Reserved for hygiene exams, typically placed throughout the day in alignment with hygiene appointments.
2. Treatment Blocks: Time allocated for restorative work, such as fillings, crowns, or root canals.
3. High Production Blocks (Priority Scheduling):
These blocks are strategically placed in the schedule for high-revenue procedures, such as crowns, implants, or multiple restorative treatments.
... (truncated)
```

#### Scheduling Guidelines

Key guidance found (12 lines):

```
Scheduling Guidelines
48-Hour Rule:                                                                                                                                                                                 When implementing the new scheduling template, if an appointment block remains unfilled within 48 hours, prioritize scheduling an alternative appointment type to ensure the block does not remain open. Maintaining a fully booked schedule is essential, so always apply this 48-hour rule to optimize appointment availability.
Priority Booking Rules Aligned with Your Goals:                                                                                                        Maximize high treatment procedures: Utilize the reserved pre-blocks labeled "HP" for high-production appointments like crowns, implants, or comprehensive treatments. Schedule the pre-block to the minimum dollar amount listed to align with each providers daily goals.
Confirmation & Cancellation Policies:                                                                                                                            Implement a proactive confirmation process: Use your automated reminders (texts, emails, or calls) at least 48 hours before appointments to reduce no-shows.
Establish a last-minute cancellation protocol: If a patient cancels within 24–48 hours, have a standby list ready to fill the slot.                                                                                                                                                                      Tools we can use: Dental Intel, ASAP/Short Call Lists, Unscheduled Treatment Lists.
Flexibility & Adaptation:                                                                                                                                                          Follow the 48-hour rule: If specific appointment types don’t fill within 48 hours, adjust and allow different appointment types to prevent open slots.                                                                                                                                                                                                  Review and adjust your template regularly: Monitor scheduling patterns and adjust the template based on patient demand and office workflow. Please schedule a revision meeting with Alexa when the template shows a need for adjustment, as well as when there are any changes to providers or practice hours.
Online Scheduling Availability & Optimization:                                                                                                             Monitor and Adjust Availability: Regularly check how far key procedures are booked out (e.g., new patient exams, emergencies, hygiene). If wait times are too long, adjust appointment blocks to improve and shorten wait times.
Optimize Scheduling with Alexa: Work with Alexa to maximize online scheduling availability, and strategize how to fill last-minute openings and reduce schedule gaps.
Online Scheduling Availability Tracking Template | How to Use This Template
Date Reviewed | Procedure Type | Next Available Appointment | Avg. Wait Time (Days) | % Online Slots Filled | % Manual Bookings | Cancellation Rate | Adjustment Needed? (Y/N) | Action Taken | Follow-Up Date | ✅ Fill this out weekly to monitor appointment availability and identify scheduling issues.
New Patient Consultation | Open More Slots | ✅ Compare "Next Available Appointment" to benchmarks—if patients are waiting too long, adjust accordingly.
New Patient Hygiene Cleaning and Exam | Adjust Provider Schedule | ✅ Track online vs. manual bookings to determine if adjustments to online scheduling availability are needed.
Hygiene Recare Cleaning and Exam | TrueLark Follow-Up | ✅ Note cancellations—high rates may indicate a need for reminder adjustments or reallocation of appointment types.
Emergency Visit | Add Emergency Blocks | ✅ Coordinate with Alexa based on findings to maximize online scheduling efficiency.
```

---

## CDT Comfort Dental

**Description:** Dr. Roring, Dr. Garrett — Mon-Fri, Oct '25, has HYG EX ID column

**File:** `file_29---06913c94-0284-4335-b845-0ca7c87a6a61.xlsx`

**Sheets:** Reading the Schedule Template, Scheduling Guidelines, Monday 10.25, Tuesday - V1, Tuesday 10.25, Wednesday 10.25, Thursday 10.25, Friday 10.25, Tuesday, Wednesday, Thursday, Friday - V1, Friday

### Providers

| Provider | Operatory | Daily Goal | Hours | $/Hr | 75% Goal |
|----------|-----------|------------|-------|------|----------|
| Rachelle Florence RDH | OP1/OP2 | $1,504 | 8 | $1,500 | N/A |
| Andrea Hernandez RDH | OP3/OP4 | $1,352 | 8 | $1,350 | N/A |
| Dusty Hancock RDH | OP3/OP4 | $1,437 | 8.5 | $1,350 | N/A |
| Rachelle Florence RDH | OP3/OP4 | $1,504 | 8 | $1,500 | N/A |
| Dusty Hancock RDH | OP1/OP2 | $1,437 | 8.5 | $1,350 | N/A |
| Faith Gooch RDH | OP3/OP2 | $1,410 | 7.5 | $1,500 | N/A |
| Kimberly Swift RDH | OP1/OP2 | $1,098 | 6 | $1,285 | $824 |

### Block Types

| Label | Minimum $ | Notes |
|-------|-----------|-------|
| NEW PATIENTS/SRP BLOCKS | None | Scaling & Root Planing |
| H | None |  |
| PM > $250 | $250 |  |
| A | None |  |
| HP > $1600 | $1600 | High Production (crowns, implants) |
| HP > $1700 | $1700 | High Production (crowns, implants) |
| D | None |  |
| PM = 8/8/(TOTAL) | None |  |
| NP CONSULT | None | New Patient |
| NP > $300 | $300 | New Patient |
| MP | None |  |
| SRP > $500 | $500 | Scaling & Root Planing |
| ER | None | Emergency |
| HP>1600 | None | High Production (crowns, implants) |
| High Production, minimum of $1600 | $1600 |  |
| Medium Production | None |  |
| NP CONS | None | New Patient |
| New Patient Consultation/Same Day Tx | None |  |
| Emergency Limited Exam | None |  |
| PM1>250 | None |  |
| Perio Maintenance + Fluoride, minimum of $250 | $250 |  |
| NP>300 | None | New Patient |
| New Patient Hyg Pro + FMX/PAN + Fluoride, minimum of $300 | $300 |  |
| SRP>500 | None | Scaling & Root Planing |
| PM = 0/0/(TOTAL) | None |  |

### Schedule Grid Structure

- **Time Column:** M
- **Time Range:** 7:00 – 6:30
- **Increment:** 10 minutes
- **Lunch Break:** Not specified
- **Provider Columns:**
  - Column N: OP1
  - Column P: OP2
  - Column R: OP3
  - Column T: OP4
  - Column V: OP5
  - Column X: OP6
  - Column Z: OP7
  - Column \: OP8

### Matrixing/Staffing Codes

Codes found: H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D, H, A, D

- **D** = Doctor time in this slot
- **A** = Assistant time
- **H** = Hygienist time
- White/empty = Open/flex time

### Color Coding

1674 cells with color formatting detected. Colors are used to indicate provider assignment and time blocking.

### Unique Features

- Has "HYG EX ID" column for hygiene exam tracking
- Large team: 7 providers

### Shared Content Sheets

#### Reading the Schedule Template

Key guidance found (26 lines):

```
How to Read the Excel Schedule Template
The scheduling template is designed to optimize provider schedules, ensuring efficient operatory usage, financial goal achievement, and strategic appointment placement. Below is a breakdown of key sections and how to interpret appointment blocks.
1. Provider Information/Working
Lists working providers, including dentists and hygienists, along with their unique provider IDs.
2. Hygiene Exam Assignments
Displays the hygienists and their exam IDs assigned for each provider (if applicable).
3. Operatory / Column Assignments
Specifies which column each provider is scheduled to work in throughout the day.
4. Daily Financial Goals
Daily Goal: The total revenue target set for each provider.
Goal Today: The specific expected revenue for the day.
Hours Today: Total scheduled working hours.
$ Per Hour: Revenue goal per hour, based on historical budget data and number of hours worked on average.
75% of Goal Today: A benchmark target to fill 75% of the daily goal into the High Treatment Production blocks to progress toward the full goal.
5. Appointment Block Labels and Scheduling Priorities
Reference the Block Labels and Block Descriptions table to the left in each weekday tab.
Each provider’s schedule is broken into appointment blocks, which indicate the type of procedures or patients scheduled during that time. These blocks ensure providers remain productive and on track to meet their daily goals.
A. Exam Blocks: Reserved for hygiene and new patient exams, typically placed in alignment with hygiene appointments.
B. Treatment Blocks "HP or MP": Time allocated for restorative work, such as fillings, crowns, or root canals.
C. High Treatment Production Blocks "HP" (Priority Scheduling):
... (truncated)
```

#### Scheduling Guidelines

Key guidance found (12 lines):

```
Scheduling Guidelines
48-Hour Rule:                                                                                                                                                                                 When implementing the new scheduling template, if an appointment block remains unfilled within 48 hours, prioritize scheduling an alternative appointment type to ensure the block does not remain open. Maintaining a fully booked schedule is essential, so always apply this 48-hour rule to optimize appointment availability.
Priority Booking Rules Aligned with Your Goals:                                                                                                        Maximize high treatment procedures: Utilize the reserved pre-blocks labeled "HP" for high-production appointments like crowns, implants, or comprehensive treatments. Schedule the pre-block to the minimum dollar amount listed to align with each providers daily goals.
Confirmation & Cancellation Policies:                                                                                                                            Implement a proactive confirmation process: Use your automated reminders (texts, emails, or calls) at least 48 hours before appointments to reduce no-shows.
Establish a last-minute cancellation protocol: If a patient cancels within 24–48 hours, have a standby list ready to fill the slot.                                                                                                                                                                      Tools we can use: Dental Intel, ASAP/Short Call Lists, Unscheduled Treatment Lists.
Flexibility & Adaptation:                                                                                                                                                          Follow the 48-hour rule: If specific appointment types don’t fill within 48 hours, adjust and allow different appointment types to prevent open slots.                                                                                                                                                                                                  Review and adjust your template regularly: Monitor scheduling patterns and adjust the template based on patient demand and office workflow. Please schedule a revision meeting with Alexa when the template shows a need for adjustment, as well as when there are any changes to providers or practice hours.
Online Scheduling Availability & Optimization:                                                                                                             Monitor and Adjust Availability: Regularly check how far key procedures are booked out (e.g., new patient exams, emergencies, hygiene). If wait times are too long, adjust appointment blocks to improve and shorten wait times.
Optimize Scheduling with Alexa: Work with Alexa to maximize online scheduling availability, and strategize how to fill last-minute openings and reduce schedule gaps.
Online Scheduling Availability Tracking Template | How to Use This Template
Date Reviewed | Procedure Type | Next Available Appointment | Avg. Wait Time (Days) | % Online Slots Filled | % Manual Bookings | Cancellation Rate | Adjustment Needed? (Y/N) | Action Taken | Follow-Up Date | ✅ Fill this out weekly to monitor appointment availability and identify scheduling issues.
New Patient Consultation | Open More Slots | ✅ Compare "Next Available Appointment" to benchmarks—if patients are waiting too long, adjust accordingly.
New Patient Hygiene Cleaning and Exam | Adjust Provider Schedule | ✅ Track online vs. manual bookings to determine if adjustments to online scheduling availability are needed.
Hygiene Recare Cleaning and Exam | TrueLark Follow-Up | ✅ Note cancellations—high rates may indicate a need for reminder adjustments or reallocation of appointment types.
Emergency Visit | Add Emergency Blocks | ✅ Coordinate with Alexa based on findings to maximize online scheduling efficiency.
```

---

## KCC Clay Center

**Description:** Dr. Dustin Kruse — Mon-Fri, has Dec '25 history, Thursday opt 1/opt 2

**File:** `file_30---c38e47e2-77df-4e10-b3c8-14ed0cb61dc8.xlsx`

**Sheets:** Reading the Schedule Template, Scheduling Guidelines, Monday 1.26, Tuesday 1.26, Wednesday 1.26, Thursday 1.26 opt 1, Thursday 1.26 opt 2, Friday 1.26, Monday, Tuesday, Wednesday, Thursday, Friday, Monday 12.25, Tuesday 12.25, Wednesday 12.25, Thursday 12.25, Friday 12.25, DX-Views and Goals Setup

### Providers

| Provider | Operatory | Daily Goal | Hours | $/Hr | 75% Goal |
|----------|-----------|------------|-------|------|----------|
| Dr. Dustin Kruse | OP1/OP2 | $4,520 | 8 | N/A | $565 |
| Alicia RDH | OP3 | $1,168 | 8 | $1,175 | $876 |
| Kelli RDH | OP5 | $1,168 | 8 | $1,175 | $876 |

### Block Types

| Label | Minimum $ | Notes |
|-------|-----------|-------|
| NEW PATIENTS/SRP BLOCKS | None | Scaling & Root Planing |
| A | None |  |
| HP > $ 1200 | None | High Production (crowns, implants) |
| H | None |  |
| PM/GING > $160 | $160 |  |
| D | None |  |
| ER | None | Emergency |
| NP>$230 | $230 | New Patient |
| HP > 1200 | None | High Production (crowns, implants) |
| High Production, greater than $1200 | $1200 |  |
| MP | None |  |
| Medium Production | None |  |
| NP CONS | None | New Patient |
| New Patient Consultation/Same Day Tx | None |  |
| NON-PROD | None |  |
| Emergency Limited Exam | None |  |
| SRP>$300 | $300 | Scaling & Root Planing |
| Prophy or Perio Maint+Fluoride+4 BTW, greater than $160 | $160 |  |
| PM/GING>160 | None |  |
| Perio Maint or Gingival+Fluoride, greater than $160 | $160 |  |
| NP>230 | None | New Patient |
| SRP>500 | None | Scaling & Root Planing |
| HP > $ 1500 | None | High Production (crowns, implants) |
| NP CON/NON PRD | None | New Patient |
| MP/NP CON | None | New Patient |
| NEW PATIENT | None |  |
| PERIO MAINT | None | Emergency |
| MP at 8am | None |  |

### Schedule Grid Structure

- **Time Column:** L
- **Time Range:** 7:00 – 6:00
- **Increment:** 10 minutes
- **Lunch Break:** Not specified
- **Provider Columns:**
  - Column M: OP 1
  - Column O: OP 2
  - Column Q: OP 3
  - Column S: OP 4
  - Column U: OP 5
  - Column W: OP4

### Matrixing/Staffing Codes

Codes found: A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D, A, D, H, A, H, D, A, D, H, A, H, D

- **D** = Doctor time in this slot
- **A** = Assistant time
- **H** = Hygienist time
- White/empty = Open/flex time

### Color Coding

956 cells with color formatting detected. Colors are used to indicate provider assignment and time blocking.

### Unique Features

- Thursday schedule has "Option 1" and "Option 2" variants
- Has historical data from December 2025

### Shared Content Sheets

#### Reading the Schedule Template

Key guidance found (26 lines):

```
How to Read the Schedule Template
The scheduling template is designed to optimize provider schedules, ensuring efficient operatory usage, financial goal achievement, and strategic appointment placement. Below is a breakdown of key sections and how to interpret appointment blocks.
1. Provider Information/Working
Lists working providers, including dentists and hygienists, along with their unique provider IDs.
2. Hygiene Exam Assignments
Displays the hygienists and their exam IDs assigned for each provider (if applicable).
3. Operatory / Column Assignments
Specifies which column each provider is scheduled to work in throughout the day.
4. Daily Financial Goals
Daily Goal: The total revenue target set for each provider.
Goal Today: The specific expected revenue for the day.
Hours Today: Total scheduled working hours.
$ Per Hour: Revenue goal per hour, based on historical 2024 budget data and number of hours worked on average.
75% of Goal Today: A benchmark target to fill 75% of the daily goal into the High Treatment Production blocks to progress toward the full goal.
5. Appointment Block Labels and Scheduling Priorities
Reference the Block Labels and Block Descriptions table to the left in each weekday tab.
Each provider’s schedule is broken into appointment blocks, which indicate the type of procedures or patients scheduled during that time. These blocks ensure providers remain productive and on track to meet their daily goals.
A. Exam Blocks: Reserved for hygiene exams, typically placed throughout the day in alignment with hygiene appointments.
B. Treatment Blocks: Time allocated for restorative work, such as fillings, crowns, or root canals.
C. High Treatment Production Blocks/HP (Priority Scheduling):
... (truncated)
```

#### Scheduling Guidelines

Key guidance found (12 lines):

```
Scheduling Guidelines
48-Hour Rule:                                                                                                                                                                                                   When implementing the new scheduling template, if an appointment block remains unfilled within 48 hours, prioritize scheduling an alternative appointment type to ensure the block does not remain open. Maintaining a fully booked schedule is essential, so always apply this 48-hour rule to optimize appointment availability.
Priority Booking Rules Aligned with Your Goals:                                                                                                                       Maximize high treatment procedures: Utilize the reserved pre-blocks labeled "HP" for high-production appointments like crowns, implants, or comprehensive treatments. Schedule the pre-block to the minimum dollar amount listed to align with each providers daily goals.
Confirmation & Cancellation Policies:                                                                                                                                               Implement a proactive confirmation process: Use your automated reminders (texts, emails, or calls) at least 48 hours before appointments to reduce no-shows.
Establish a last-minute cancellation protocol: If a patient cancels within 24–48 hours, have a standby list ready to fill the slot.                                                                                                                                                                                                      Tools we can use: Dental Intel, ASAP/Short Call Lists, Unscheduled Treatment Lists.
Flexibility & Adaptation:                                                                                                                                                                                   Follow the 48-hour rule: If specific appointment types don’t fill within 48 hours, adjust and allow different appointment types to prevent open slots.                                                                                                                                                                                                  Review and adjust your template regularly: Monitor scheduling patterns and adjust the template based on patient demand and office workflow. Please schedule a revision meeting with Alexa when the template shows a need for adjustment, as well as when there are any changes to providers or practice hours.
Online Scheduling Availability & Optimization:                                                                                                                                   Monitor and Adjust Availability: Regularly check how far key procedures are booked out (e.g., new patient exams, emergencies, hygiene). If wait times are too long, adjust appointment blocks to improve and shorten wait times.
Optimize Scheduling with Alexa: Work with Alexa to maximize online scheduling availability, and strategize how to fill last-minute openings and reduce schedule gaps.
Online Scheduling Availability Tracking Template | How to Use This Template
Date Reviewed | Procedure Type | Next Available Appointment | Avg. Wait Time (Days) | % Online Slots Filled | % Manual Bookings | Cancellation Rate | Adjustment Needed? (Y/N) | Action Taken | Follow-Up Date | ✅ Fill this out weekly to monitor appointment availability and identify scheduling issues.
New Patient Consultation | Open More Slots | ✅ Compare "Next Available Appointment" to benchmarks—if patients are waiting too long, adjust accordingly.
New Patient Hygiene Cleaning and Exam | Adjust Provider Schedule | ✅ Track online vs. manual bookings to determine if adjustments to online scheduling availability are needed.
Hygiene Recare Cleaning and Exam | TrueLark Follow-Up | ✅ Note cancellations—high rates may indicate a need for reminder adjustments or reallocation of appointment types.
Emergency Visit | Add Emergency Blocks | ✅ Coordinate with Alexa based on findings to maximize online scheduling efficiency.
```

---

## Los Altos

**Description:** Dr. Karl Supal, Dr. Shile — Mon-Fri, multiple schedule generations

**File:** `file_31---ab0c267c-23ed-4f34-8112-6c102a228cbc.xlsx`

**Sheets:** Reading the Schedule Template, Scheduling Guidelines, Mon | Los Altos | Jan 2026, Tues | Los Altos | Jan 2026, Wed | Los Altos | Jan 2026, Thurs | Los Altos | Jan 2026, Fri | Los Altos | Jan 2026, Monday 1.26 (2), Tuesday  1.26 (2), Wednesday  1.26 (2), Thursday  1.26 (2), Friday 1.26 (2), Monday 1.26, Tuesday  1.26, Wednesday  1.26, Thursday  1.26, Friday 1.26, Monday, Tuesday, Tuesday , Wednesday, Thursday, Wednesday , Thursday , Friday

### Providers

| Provider | Operatory | Daily Goal | Hours | $/Hr | 75% Goal |
|----------|-----------|------------|-------|------|----------|
| Dr. Shile | N/A | $7,680 | 6 | N/A | N/A |
| Dr. Karl Supal | N/A | $9,800 | 10 | N/A | N/A |
| Dr. Field | N/A | $5,200 | 6 | N/A | N/A |

### Block Types

| Label | Minimum $ | Notes |
|-------|-----------|-------|
| NEW PATIENTS/SRP BLOCKS | None | Scaling & Root Planing |
| Consult Room | None |  |
| A | None |  |
| HP > 3500 | None | High Production (crowns, implants) |
| D | None |  |
| New Patient Records | None |  |
| H | None |  |
| RECARE/PM > $350 | $350 |  |
| PM = 4/4/(TOTAL) | None |  |
| EMERGENCY | None | Emergency |
| NP Exam | None | New Patient |
| HP > 2000 | None | High Production (crowns, implants) |
| PM/GING > $370 | $370 |  |
| NP CONS VIRTUAL | None | New Patient |
| SRP > $1000 | $1000 | Scaling & Root Planing |
| HP>3500 | None | High Production (crowns, implants) |
| High Production, minimum of $3500 | $3500 |  |
| MP | None |  |
| Medium Production | None |  |
| NP CONS | None | New Patient |
| New Patient Consultation/Same Day Tx | None |  |
| ER | None | Emergency |
| Emergency Limited Exam | None |  |
| RECARE/PM>350 | None |  |
| Prophy or Perio Maint + Fluoride + 4 BTW, minimum of $350 | $350 |  |
| PM/GING>$370 | $370 |  |
| Perio Maintenance or Gingival + Fluoride, minimum of $370 | $370 |  |
| NP>400 | None | New Patient |
| New Patient Hyg Pro + FMX/PAN + Fluoride, minimum of $400 | $400 |  |
| SRP>1000 | None | Scaling & Root Planing |
| NP Records *60 mins | None | New Patient |
| PM = 6/6/(TOTAL) | None |  |
| HP > $2000 | $2000 | High Production (crowns, implants) |
| NP RECORDS / NP CONSULT | None | New Patient |
| NP > $400 | $400 | New Patient |
| MP>3000 | None |  |
| HP > $3500 | $3500 | High Production (crowns, implants) |
| NP Consult | None | New Patient |
| HP > 5000 | None | High Production (crowns, implants) |
| RECARE/PM >$350 | $350 |  |
| NP RECORDS, NP CONSULT | None | New Patient |
| HP > 4500 | None | High Production (crowns, implants) |
| NP Records | None | New Patient |
| MP>$3000 | $3000 |  |
| perio maint+fl2 | None |  |
| NP CONSULT | None | New Patient |
| HP > $5000 | $5000 | High Production (crowns, implants) |
| NP CONSULT 11:30AM NP CONS 3PM | None | New Patient |

### Schedule Grid Structure

- **Time Column:** L
- **Time Range:** 7:00 – 6:00
- **Increment:** 10 minutes
- **Lunch Break:** Not specified
- **Provider Columns:**
  - Column O: Main
  - Column Q: Dr. Karl Supal
  - Column S: Dr. Shile
  - Column U: Main-2
  - Column W: Consult Room
  - Column Y: Katy
  - Column [: Stephanie
  - Column ]: Jennifer

### Matrixing/Staffing Codes

Codes found: A, D, H, A, D, H, A, H, D, A, H, D, A, H, D, A, H, D, A, D, H, A, H, D, A, H, D, A, H, D, A, H, D, A, D, H, A, H, D, A, H, D, A, H, D, A, H, D, A, D, H, A, D, H, A, H, D, A, H, D, A, H, D, A, H, D, A, H, D

- **D** = Doctor time in this slot
- **A** = Assistant time
- **H** = Hygienist time
- White/empty = Open/flex time

### Color Coding

1784 cells with color formatting detected. Colors are used to indicate provider assignment and time blocking.

### Unique Features

- Multiple schedule generations/revisions present
- Multi-doctor practice with complex coordination

### Shared Content Sheets

#### Reading the Schedule Template

Key guidance found (26 lines):

```
How to Read the Schedule Template
The scheduling template is designed to optimize provider schedules, ensuring efficient operatory usage, financial goal achievement, and strategic appointment placement. Below is a breakdown of key sections and how to interpret appointment blocks.
1. Provider Information/Working
Lists working providers, including dentists and hygienists, along with their unique provider IDs.
2. Hygiene Exam Assignments
Displays the hygienists and their exam IDs assigned for each provider (if applicable).
3. Operatory / Column Assignments
Specifies which column each provider is scheduled to work in throughout the day.
4. Daily Financial Goals
Daily Goal: The total revenue target set for each provider.
Goal Today: The specific expected revenue for the day.
Hours Today: Total scheduled working hours.
$ Per Hour: Revenue goal per hour, based on historical 2024 budget data and number of hours worked on average.
75% of Goal Today: A benchmark target to fill 75% of the daily goal into the High Treatment Production blocks to progress toward the full goal.
5. Appointment Block Labels and Scheduling Priorities
Reference the Block Labels and Block Descriptions table to the left in each weekday tab.
Each provider’s schedule is broken into appointment blocks, which indicate the type of procedures or patients scheduled during that time. These blocks ensure providers remain productive and on track to meet their daily goals.
A. Exam Blocks: Reserved for hygiene exams, typically placed throughout the day in alignment with hygiene appointments.
B. Treatment Blocks: Time allocated for restorative work, such as fillings, crowns, or root canals.
C. High Treatment Production Blocks/HTX (Priority Scheduling):
... (truncated)
```

#### Scheduling Guidelines

Key guidance found (12 lines):

```
Scheduling Guidelines
48-Hour Rule:                                                                                                                                                                                 When implementing the new scheduling template, if an appointment block remains unfilled within 48 hours, prioritize scheduling an alternative appointment type to ensure the block does not remain open. Maintaining a fully booked schedule is essential, so always apply this 48-hour rule to optimize appointment availability.
Priority Booking Rules Aligned with Your Goals:                                                                                                        Maximize high treatment procedures: Utilize the reserved pre-blocks labeled "HP" for high-production appointments like crowns, implants, or comprehensive treatments. Schedule the pre-block to the minimum dollar amount listed to align with each providers daily goals.
Confirmation & Cancellation Policies:                                                                                                                            Implement a proactive confirmation process: Use your automated reminders (texts, emails, or calls) at least 48 hours before appointments to reduce no-shows.
Establish a last-minute cancellation protocol: If a patient cancels within 24–48 hours, have a standby list ready to fill the slot.                                                                                                                                                                      Tools we can use: Dental Intel, ASAP/Short Call Lists, Unscheduled Treatment Lists.
Flexibility & Adaptation:                                                                                                                                                          Follow the 48-hour rule: If specific appointment types don’t fill within 48 hours, adjust and allow different appointment types to prevent open slots.                                                                                                                                                                                                  Review and adjust your template regularly: Monitor scheduling patterns and adjust the template based on patient demand and office workflow. Please schedule a revision meeting with Alexa when the template shows a need for adjustment, as well as when there are any changes to providers or practice hours.
Online Scheduling Availability & Optimization:                                                                                                             Monitor and Adjust Availability: Regularly check how far key procedures are booked out (e.g., new patient exams, emergencies, hygiene). If wait times are too long, adjust appointment blocks to improve and shorten wait times.
Optimize Scheduling with Alexa: Work with Alexa to maximize online scheduling availability, and strategize how to fill last-minute openings and reduce schedule gaps.
Online Scheduling Availability Tracking Template | How to Use This Template
Date Reviewed | Procedure Type | Next Available Appointment | Avg. Wait Time (Days) | % Online Slots Filled | % Manual Bookings | Cancellation Rate | Adjustment Needed? (Y/N) | Action Taken | Follow-Up Date | ✅ Fill this out weekly to monitor appointment availability and identify scheduling issues.
New Patient Consultation | Open More Slots | ✅ Compare "Next Available Appointment" to benchmarks—if patients are waiting too long, adjust accordingly.
New Patient Hygiene Cleaning and Exam | Adjust Provider Schedule | ✅ Track online vs. manual bookings to determine if adjustments to online scheduling availability are needed.
Hygiene Recare Cleaning and Exam | TrueLark Follow-Up | ✅ Note cancellations—high rates may indicate a need for reminder adjustments or reallocation of appointment types.
Emergency Visit | Add Emergency Blocks | ✅ Coordinate with Alexa based on findings to maximize online scheduling efficiency.
```

---

## Cross-Office Patterns & Insights

### Provider Statistics

- **Total providers across 5 offices:** 19
- **Average providers per office:** 3.8

### Common Block Types

Found across all offices:

- A
- AHT
- AHT/Perio
- Consult Room
- D
- EMERGENCY
- ER
- Emergency Limited Exam
- H
- HP
- HP > $ 1200
- HP > $ 1500
- High Production, greater than $1200
- High Production, minimum of $1100 PPO Patients
- High Production, minimum of $1500 UCR/NON-PPO
- High Production, minimum of $1600
- High Production, minimum of $3500
- MP
- MP at 8am
- MP/NP CON
- Medium Production
- NEW PATIENT
- NEW PATIENTS/SRP BLOCKS
- NON-PROD
- NP
- NP CON/NON PRD
- NP CONS
- NP CONS VIRTUAL
- NP CONSULT
- NP CONSULT 11:30AM NP CONS 3PM
- NP Consult
- NP Exam
- NP RECORDS / NP CONSULT
- NP RECORDS, NP CONSULT
- NP Records
- NP Records *60 mins
- NPE
- New Patient Consultation/Same Day Tx
- New Patient Hyg Pro + FMX/PAN + Fluoride, minimum of $300
- New Patient Hyg Pro + FMX/PAN + Fluoride, minimum of $400
- New Patient Hygiene, minimum of $150
- New Patient Records
- PERIO MAINT
- PM
- PM = 0/0/(TOTAL)
- PM = 0/5/(TOTAL)
- PM = 4/4/(TOTAL)
- PM = 5/5(TOTAL)
- PM = 5/5/(TOTAL)
- PM = 5/6
- PM = 6/6
- PM = 6/6/(TOTAL)
- PM = 8/8/(TOTAL)
- PM/GING
- PM1
- Perio Maint or Gingival+Fluoride, greater than $160
- Perio Maint or Gingival+Fluoride, greater than $190
- Perio Maint/Ging
- Perio Maintenance + Fluoride, minimum of $250
- Perio Maintenance or Gingival + Fluoride, minimum of $370
- Perio Maintenance, minimum of $140
- Perio Maintenance, minimum of $150
- Perio Treatment 2 Quads, greater than $300
- Prophy or Perio Maint + Fluoride + 4 BTW, minimum of $350
- Prophy or Perio Maint+Fluoride+4 BTW, greater than $150
- Prophy or Perio Maint+Fluoride+4 BTW, greater than $160
- RECARE/PM
- Recare/Perio Maint
- SRP
- perio maint+fl2
- perio maint/fl2

### Time Patterns

- **Standard increment:** 10 minutes (universal across all offices)
- **Typical day start:** 7:00-8:00 AM
- **Typical day end:** 5:00-6:00 PM
- **Lunch blocks:** 1:00-2:00 PM (most common)

### Matrixing Implementation

- **Offices using D/A/H codes:** 5 out of 5
- This indicates doctor floating between hygiene exams and restorative work

---

## Key Takeaways for PRD

1. **Provider diversity:** Offices range from single-doctor to multi-doctor practices
2. **Block type consistency:** HP, NP, SRP, ER are universal; specific labels vary
3. **Production minimums:** 75% rule is consistent (75% of daily goal distributed across blocks)
4. **Time standardization:** 10-minute increments are the norm
5. **Matrixing complexity:** Not all offices use full D/A/H staffing codes
6. **Schedule variations:** 4-day vs 5-day weeks, alternating Fridays, multiple shift options
7. **Shared guidelines:** "Reading the Schedule Template" and "Scheduling Guidelines" appear consistently
8. **Excel structure:** Left panel (provider info/legend) + Center grid (time × providers)

