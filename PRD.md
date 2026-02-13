# Product Requirements Document
## Custom Schedule Template Designer for Dental Practices

**Version:** 1.0  
**Date:** February 12, 2026  
**Author:** Based on analysis of 5 real dental office templates + stakeholder interviews  
**Status:** Draft for Review

---

## 1. Executive Summary

### The Problem
Alexa and Megan manually create customized schedule templates in Excel for ~150 dental offices. Each template requires:
- Gathering intake data (providers, goals, block types, operatories, hours)
- Calculating production minimums (75% of daily goals distributed across blocks)
- Manually placing blocks across 10-minute time increments
- Color-coding by provider and matrixing indicators (D/A/H)
- Ensuring compliance with clinical timing, double-booking rules, and NP model constraints
- Generating separate Excel files for each weekday (Mon-Fri, sometimes 4-day weeks)
- Quarterly revisions as offices change providers or goals

This process is time-intensive, error-prone, and doesn't scale.

### The Solution
A web-based **Custom Schedule Template Designer** that:
1. **Captures intake data** via structured forms (4-bucket framework)
2. **Calculates production minimums** automatically (75% rule)
3. **Generates optimized schedules** using AI/rules engine
4. **Visualizes templates** in a web interface (dark mode, Linear/Obsidian aesthetic)
5. **Exports to Excel** matching the exact current format for compatibility
6. **Enables quarterly revisions** with 1-click regeneration

**Users:** Internal only (Alexa, Megan) — not office managers.

**Impact:** 
- Reduce manual template creation from hours to minutes
- Eliminate calculation errors
- Enable rapid iteration and what-if scenarios
- Scale to support 150+ offices easily

---

## 2. Problem Statement

### Current State Pain Points
Based on analysis of 5 real office templates (Smile Cascade, NHD Ridgeview, CDT Comfort Dental, KCC Clay Center, Los Altos):

1. **Manual calculation complexity:**
   - 75% of daily goal must be distributed across HP/NP/SRP blocks
   - Each provider has different goals ($1,098 - $9,800/day observed)
   - Block minimums vary by office ($150 - $5,000 observed)

2. **Grid construction is tedious:**
   - 10-minute increments from 7:00 AM - 6:00 PM (66 rows per day)
   - 2 columns per provider (staffing codes + block type)
   - 1-9 provider columns observed (up to 18 columns total)
   - Matrixing codes (D/A/H) must align with provider availability

3. **Variation across offices:**
   - 4-day vs 5-day weeks
   - Alternating schedules (Every Other Friday)
   - Multiple shift options (Thursday opt 1 vs opt 2)
   - Unique features (HYG EX ID tracking, DX-Views setup, Consult Rooms)

4. **Block placement constraints:**
   - NP blocks: 1-2 per day, placed per "NP model" (doctor only / hygienist only / either)
   - SRP blocks: 1-2 per day in hygiene columns
   - HP blocks: Morning vs afternoon preferences
   - Lunch breaks: typically 1:00-2:00 PM (must be empty)
   - Emergency/ER slots: Access block placement strategy

5. **Color-coding requirements:**
   - Provider-specific colors (800-1400+ colored cells per sheet)
   - Matrixing indicators (provider busy = colored, open = white)
   - Must export to Excel with colors intact

### Scope
- **In scope:** Internal template generation, AI optimization, Excel export
- **Out of scope (MVP):** Office manager access, live DPMS integration, appointment booking

---

## 3. Users & Personas

### Primary Users
**Alexa & Megan (Schedule Template Builders)**
- **Role:** Create and maintain schedule templates for 150 dental offices
- **Tech proficiency:** High (Excel power users)
- **Goals:** 
  - Reduce manual work
  - Ensure accuracy (production minimums, block placement)
  - Quickly iterate on revisions
- **Pain points:** 
  - Repetitive calculations
  - Copy-paste errors
  - Difficulty visualizing what-if scenarios

### Secondary Stakeholders
**Operations Director**
- **Role:** Provides ramp-up goals, approves templates
- **Needs:** Visibility into production targets, audit trail

**Dental Offices (Indirect)**
- **Role:** Receive completed templates (Excel files)
- **Needs:** Templates match their DPMS format, easy to understand

---

## 4. Functional Requirements

### 4.1 Intake Form (Data Collection)

**Bucket 1: Practice & Provider Foundation**

| Field | Type | Source | Required | Notes |
|-------|------|--------|----------|-------|
| Office Name | Text | Manual | Yes | |
| DPMS System | Dropdown | Manual | Yes | Dentrix, Open Dental, Eaglesoft, Denticon |
| Working Days | Multi-select | Manual | Yes | Mon-Fri, 4-day, alternating |
| Providers | Repeatable Group | Manual | Yes | See sub-fields below |

**Provider Sub-fields:**
- Name (Text)
- Provider ID (Text) — maps to DPMS
- Role (Dropdown): Doctor, Hygienist
- Operatories (Multi-select): OP1-OP10, custom labels (e.g., "Main", "Consult Room")
- Working Days (Multi-select): Subset of office days
- Working Hours (Start/End Time)
- Lunch Break (Start/End Time)

**Bucket 2: Production & Financial Inputs**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Daily Goal | Currency | Yes | Per provider, per day |
| Hourly Rate | Currency | Optional | Calculated from Daily Goal / Hours |
| Ramp-up Goals | Repeatable | Optional | Month/quarter, linear or custom |
| Fee Model | Dropdown | Yes | UCR, PPO, Mixed |
| Production Minimums | Auto-calculated | — | 75% of daily goal distributed across blocks |

**Block Type Configuration:**
- Block Label (Text): HP, NP, SRP, ER, MP, NON-PROD, Recare, PM, etc.
- Minimum $ (Currency): Auto-filled based on 75% rule, editable
- Applies to Provider Role (Dropdown): Doctor, Hygienist, Both

**Bucket 3: Clinical Timing Standards**

| Procedure | Duration (min) | Applies To | Notes |
|-----------|----------------|------------|-------|
| Crown prep + buildup | 60-90 | Doctor | Configurable per office |
| Med production/fillings | 30-60 | Doctor | |
| NP consult | 30-60 | Doctor | |
| ER (Emergency) | 20-30 | Doctor | |
| Crown seat | 20-30 | Doctor | |
| Recare | 50-60 | Hygienist | |
| PM (Perio Maintenance) | 60 | Hygienist | |
| SRP | 60-90 | Hygienist | |
| NP hygiene | 60-90 | Hygienist | |

**Time Increment:** Default 10 minutes (15 min option available)

**Bucket 4: Schedule Architecture & Rules**

| Rule | Type | Options |
|------|------|---------|
| NP Model | Dropdown | Doctor only, Hygienist only, Either (patient filtering) |
| NP Blocks per Day | Number | 1-3 (default 1-2) |
| SRP Blocks per Day | Number | 1-3 (default 1-2) |
| HP Block Placement | Dropdown | Morning preferred, Afternoon preferred, Any |
| Double Booking | Boolean | Enable for multi-operatory doctors |
| Matrixing | Boolean | Enable D/A/H staffing codes |
| Emergency Handling | Dropdown | Dedicated ER blocks, Flex time, Access blocks |
| Meetings/Huddles | Time blocks | Morning huddle, lunch meeting, etc. |

### 4.2 Template Engine (Schedule Generation)

**Core Logic:**
1. **Grid Construction:**
   - Generate time slots: Start time → End time in configured increments (10 min default)
   - Create columns: Time column + 2 columns per provider (staffing + block type)
   - Insert lunch breaks (empty rows, typically 1:00-2:00 PM)

2. **Production Calculation:**
   - For each provider, calculate 75% of daily goal
   - Distribute across block types based on configuration
   - Round to nearest increment (e.g., HP>$1200, NP>$300)

3. **Block Placement:**
   - Place NP blocks per NP model rules
   - Place SRP blocks in hygiene columns
   - Place HP blocks per placement preferences
   - Respect clinical timing durations
   - Avoid conflicts with lunch, meetings, provider off-hours

4. **Matrixing Indicators:**
   - In staffing columns, populate D/A/H codes
   - D = Doctor time, A = Assistant time, H = Hygienist time
   - Leave white/empty for open/flex time

5. **Multi-Day Generation:**
   - Generate separate grids for each working day
   - Handle alternating schedules (e.g., Every Other Friday)
   - Support "Option 1 vs Option 2" variants (e.g., Thursday opt 1/2)

**Validation:**
- Ensure total block minimums ≤ 75% of daily goal
- No overlapping blocks per provider
- Operatory assignments don't conflict
- At least one NP and one SRP block per day (if applicable)

### 4.3 AI/Optimization Engine

**Objective:** Optimize block placement to:
1. **Maximize production efficiency** (hit 75% minimum across day)
2. **Balance provider workload** (no overloading one provider)
3. **Respect clinical flow** (NP → exam → treatment sequence)
4. **Minimize idle time** (reduce gaps between blocks)

**Constraints:**
- Clinical timing durations (blocks must fit available time)
- Provider availability (working hours, lunch, meetings)
- Operatory capacity (double booking rules)
- NP/SRP model rules
- Block placement preferences (morning/afternoon)

**Algorithm Approach:**
- **Phase 1 (MVP):** Rule-based placement
  1. Place fixed blocks (lunch, meetings)
  2. Place NP blocks per model
  3. Place SRP blocks in hygiene
  4. Fill remaining slots with HP/MP blocks
  5. Validate production minimums met
  
- **Phase 2 (Future):** AI optimization
  - Machine learning model trained on existing templates
  - Constraint satisfaction solver (e.g., Google OR-Tools)
  - Multi-objective optimization (production + balance + flow)

**Inputs:**
- Provider data (goals, hours, operatories)
- Block types and minimums
- Timing standards
- Architecture rules

**Outputs:**
- Optimized schedule grid (time × providers)
- Production summary (actual vs 75% target)
- Block placement rationale (why blocks were placed where)

### 4.4 Visualization (Web Interface)

**Dashboard View:**
- Office list (searchable, filterable)
- Quick stats: # providers, total daily goal, last updated
- Actions: Create new, Edit, Generate, Export, Archive

**Template Builder View:**

**Left Panel: Intake Form**
- 4 buckets (collapsible sections)
- Real-time validation (red highlights for errors)
- Save draft, Auto-save every 30s

**Center Panel: Schedule Grid Preview**
- Interactive table (time rows × provider columns)
- Color-coded by provider (match Excel colors)
- Matrixing codes visible in staffing columns
- Block labels visible (HP>$1200, NP>$300, etc.)
- Hover: Show block details (duration, minimum $, provider)
- Click: Edit block inline (change type, duration, position)
- Drag-and-drop: Move blocks (with conflict detection)

**Right Panel: Production Summary**
- Per provider:
  - Daily goal
  - 75% target
  - Actual scheduled (sum of block minimums)
  - Status: ✅ Met / ⚠️ Under / ❌ Over
- Total office daily goal
- Warnings/errors (e.g., "NP block missing", "Overlapping blocks")

**Day Tabs:**
- Separate tabs for Mon/Tue/Wed/Thu/Fri
- Indicator for incomplete days
- Copy day → another day (e.g., copy Monday to Wednesday)

**UI/UX Requirements:**
- **Dark mode by default** (Linear/Obsidian aesthetic)
- Clean, minimal interface (no clutter)
- Keyboard shortcuts (save: Cmd+S, generate: Cmd+G)
- Undo/redo support
- Responsive (works on laptop/desktop, not mobile-optimized)

### 4.5 Export (Excel Generation)

**Format Requirements:**
Must exactly match current Excel templates. Based on analysis of 5 offices:

**Sheet Structure:**
1. **Reading the Schedule Template** — Static guide sheet (copy from reference)
2. **Scheduling Guidelines** — Static guide sheet (copy from reference)
3. **Monday [Date]** — Generated schedule grid
4. **Tuesday [Date]** — Generated schedule grid
5. **Wednesday [Date]** — Generated schedule grid
6. **Thursday [Date]** — Generated schedule grid
7. **Friday [Date]** — Generated schedule grid (if applicable)
8. **[Blank templates]** — Optional reusable templates

**Schedule Sheet Layout:**

**Columns A-K: Left Panel (Provider Info/Legend)**
- Provider names, operatories, daily goals, hourly rates
- Block type legend with labels and minimums
- Color key (provider colors)
- Matrixing code explanations (D/A/H)

**Column L: Time**
- 10-minute increments (7:00, 7:10, 7:20... 6:00)
- Format: "h:mm" or "h:mm AM/PM"

**Columns M+: Provider Columns (2 per provider)**
- Column M: Staffing codes (D, A, H)
- Column N: Block type (HP>$1200, NP>$300, etc.)
- Column O: Staffing codes (next provider)
- Column P: Block type (next provider)
- ... repeat for all providers

**Cell Formatting:**
- **Colors:** Match provider colors from intake
  - Background color = provider's assigned color when occupied
  - White/no fill = open/flex time
- **Fonts:** Calibri or Arial, 10-11pt
- **Borders:** Grid lines visible
- **Alignment:** Center for time, left for block labels

**Production Summary (Bottom Rows):**
- Row below schedule: "Total Production Minimums"
- Per provider: Sum of block minimums
- Comparison to 75% target

**File Naming:**
`Customized Schedule Template - [Office Name].xlsx`

**Export Options:**
- Download as .xlsx (Excel 2007+)
- Email to stakeholders (future)
- Save to cloud storage (future)

**Validation Before Export:**
- All required fields completed
- Production minimums meet 75% target
- No overlapping blocks
- At least one template generated (Mon-Fri)

---

## 5. Data Model

### Entities & Relationships

```
Office
├── id (UUID)
├── name (String)
├── dpms_system (Enum: Dentrix, OpenDental, Eaglesoft, Denticon)
├── working_days (Array: Mon, Tue, Wed, Thu, Fri)
├── time_increment (Integer: 10 or 15)
├── fee_model (Enum: UCR, PPO, Mixed)
├── created_at, updated_at
└── Providers[] (One-to-Many)
    ├── id (UUID)
    ├── office_id (FK)
    ├── name (String)
    ├── provider_id (String) — DPMS identifier
    ├── role (Enum: Doctor, Hygienist)
    ├── operatories[] (Array: OP1, OP2, Main, etc.)
    ├── working_days[] (Array)
    ├── working_hours (Start/End Time)
    ├── lunch_break (Start/End Time)
    ├── daily_goal (Decimal)
    ├── hourly_rate (Decimal, calculated)
    ├── color (Hex: #ec8a1b, #87bcf3, etc.)
    └── RampUpGoals[] (One-to-Many)
        ├── id (UUID)
        ├── provider_id (FK)
        ├── start_date (Date)
        ├── end_date (Date)
        ├── daily_goal (Decimal)

BlockType
├── id (UUID)
├── office_id (FK)
├── label (String: HP, NP, SRP, ER, MP, NON-PROD, Recare, PM, etc.)
├── description (Text: "High Production, crowns, implants")
├── minimum_amount (Decimal: calculated from 75% rule)
├── applies_to_role (Enum: Doctor, Hygienist, Both)
├── duration_min (Integer: 30, 60, 90)
├── duration_max (Integer: optional)
└── color (Hex: optional override)

Procedure
├── id (UUID)
├── office_id (FK)
├── name (String: Crown prep, Recare, SRP, etc.)
├── duration (Integer: minutes)
├── applies_to_role (Enum: Doctor, Hygienist)
├── typical_fee (Decimal: optional)

ScheduleTemplate
├── id (UUID)
├── office_id (FK)
├── version (Integer: 1, 2, 3... for quarterly revisions)
├── effective_date (Date)
├── status (Enum: Draft, Published, Archived)
├── generated_by (Enum: Manual, AI)
├── generation_metadata (JSON: AI parameters, rationale)
├── created_at, updated_at
└── DaySchedules[] (One-to-Many)
    ├── id (UUID)
    ├── template_id (FK)
    ├── day_of_week (Enum: Mon, Tue, Wed, Thu, Fri)
    ├── variant (String: null, "opt1", "opt2", "Every Other Friday")
    └── TimeSlots[] (One-to-Many)
        ├── id (UUID)
        ├── day_schedule_id (FK)
        ├── time (Time: 7:00, 7:10, 7:20...)
        ├── provider_id (FK, nullable for lunch/meetings)
        ├── operatory (String: OP1, OP2, Main)
        ├── staffing_code (Enum: D, A, H, null)
        ├── block_type_id (FK, nullable)
        ├── block_label (String: HP>$1200, NP>$300, LUNCH, etc.)
        ├── is_break (Boolean)

ScheduleRule
├── id (UUID)
├── office_id (FK)
├── rule_type (Enum: NPModel, HPPlacement, DoubleBooking, Matrixing, etc.)
├── rule_value (JSON: flexible config per rule type)

Example NPModel rule:
{
  "np_model": "doctor_only", // or "hygienist_only", "either"
  "blocks_per_day": 2
}

Example HPPlacement rule:
{
  "placement_preference": "morning", // or "afternoon", "any"
  "avoid_after_lunch": true
}
```

### Calculated Fields

**Provider.goal_75_percent:**
- Formula: `daily_goal * 0.75`
- Used to calculate block minimums

**BlockType.minimum_amount (auto-calculation):**
- Collect all block types for provider's role
- Sum target = `provider.goal_75_percent`
- Distribute evenly or by priority:
  - HP blocks: 60-70% of target
  - NP blocks: 15-20% of target
  - SRP blocks: 15-20% of target
- Example (Doctor, $5000 daily goal):
  - 75% = $3750
  - 4 HP blocks × $900 = $3600
  - 1 NP block × $150 = $150
  - Total = $3750

**DaySchedule.total_production:**
- Sum of all `block_type.minimum_amount` for blocks scheduled that day
- Compare to `provider.goal_75_percent` to validate

---

## 6. UI/UX Requirements

### Design System

**Color Palette (Dark Mode):**
- Background: `#1a1a1a` (near-black)
- Surface: `#2d2d2d` (cards, panels)
- Border: `#404040` (subtle dividers)
- Text Primary: `#e0e0e0` (high contrast)
- Text Secondary: `#a0a0a0` (labels, metadata)
- Accent: `#6b9bd1` (links, buttons, highlights)
- Success: `#4caf50`
- Warning: `#ff9800`
- Error: `#f44336`

**Provider Colors (from analysis):**
- Dr. Fitzpatrick: `#ec8a1b` (orange)
- Hygienist 1: `#87bcf3` (light blue)
- Hygienist 2: `#f4de37` (yellow)
- Hygienist 3: `#44f2ce` (teal)
- (Auto-assign from palette for new providers)

**Typography:**
- Headings: Inter or SF Pro, 600 weight
- Body: Inter or SF Pro, 400 weight
- Monospace (for codes, IDs): Fira Code or Menlo

**Components:**

**1. Office List (Dashboard)**
```
┌─────────────────────────────────────────────────────┐
│ Schedule Template Designer              + New Office│
├─────────────────────────────────────────────────────┤
│ 🔍 Search offices...                    Filter: All │
├─────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────┐   │
│ │ Smile Cascade                      Dr. Fitzpatrick│
│ │ 5 providers • $11,984/day • Updated 2 days ago   │
│ │ [Edit] [Generate] [Export] [Archive]             │
│ └───────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────┐   │
│ │ NHD Ridgeview                      Dr. Isinger    │
│ │ 1 provider • $5,000/day • Updated 1 week ago     │
│ │ [Edit] [Generate] [Export] [Archive]             │
│ └───────────────────────────────────────────────┘   │
│ ...                                                  │
└─────────────────────────────────────────────────────┘
```

**2. Template Builder (Main View)**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Dashboard        Smile Cascade                    [Save] [Export] │
├───────────┬─────────────────────────────────────────────────────┬───────────┤
│ Intake    │ Monday 1/26  [Tue] [Wed] [Thu] [Fri]               │ Summary   │
├───────────┤                                                     ├───────────┤
│           │ Time  | DR 1  | DR 2  | HYG 2 | HYG 4 | HYG 3      │ Dr. Fitz  │
│ 1️⃣ Practice│ ──────┼───────┼───────┼───────┼───────┼───────     │ Goal: 5k  │
│ ▼         │ 7:00  │ D     │HP>1200│       │       │            │ 75%: 3.75k│
│ Name: ... │ 7:10  │ D     │HP>1200│ H     │Recare │            │ Actual:   │
│ DPMS: Dent│ 7:20  │ D     │HP>1200│ H     │>150   │            │ 3.8k ✅   │
│ Days: MTWTF│ ...   │ ...   │ ...   │ ...   │ ...   │ ...       │           │
│           │ 1:00  │       │LUNCH  │       │       │            │ Cheryl D  │
│ 2️⃣ Produc. │ 1:10  │       │LUNCH  │       │       │            │ Goal: 2.6k│
│ ▼         │ ...   │ ...   │ ...   │ ...   │ ...   │ ...       │ 75%: 1.95k│
│ Dr. Fitz  │       │       │       │       │       │            │ Actual:   │
│ Goal: 5000│       │       │       │       │       │            │ 2.0k ✅   │
│ 75%: 3750 │       │       │       │       │       │            │           │
│           │       │       │       │       │       │            │ [Generate]│
│ 3️⃣ Timing  │       │       │       │       │       │            │ [Optimize]│
│ ▼         │       │       │       │       │       │            │           │
│ Crown:60  │       │       │       │       │       │            │ Warnings: │
│ Recare:50 │       │       │       │       │       │            │ None      │
│           │       │       │       │       │       │            │           │
│ 4️⃣ Rules   │       │       │       │       │       │            │           │
│ ▼         │       │       │       │       │       │            │           │
│ NP Model: │       │       │       │       │       │            │           │
│ Doctor    │       │       │       │       │       │            │           │
└───────────┴─────────────────────────────────────────────────────┴───────────┘
```

**3. Block Editing (Inline)**
- Click on a cell → inline editor appears
- Dropdown: Select block type (HP, NP, SRP, etc.)
- Input: Override minimum $ (default from config)
- Duration: How many time slots (e.g., 6 × 10min = 60min)
- Save or Cancel

**4. Drag-and-Drop Blocks**
- Click and hold on block → drag to new time slot
- Ghost preview shows destination
- Conflict detection: Red highlight if overlaps another block
- Drop → validate, update grid

**5. Production Summary (Right Panel)**
```
┌─────────────────────────┐
│ Production Summary      │
├─────────────────────────┤
│ Dr. Kevin Fitzpatrick   │
│ Daily Goal:    $5,000   │
│ 75% Target:    $3,750   │
│ Actual Sched:  $3,800 ✅│
├─────────────────────────┤
│ Cheryl Dise RDH         │
│ Daily Goal:    $2,600   │
│ 75% Target:    $1,950   │
│ Actual Sched:  $2,000 ✅│
├─────────────────────────┤
│ Total Office            │
│ Daily Goal:   $11,984   │
│ 75% Target:    $8,988   │
│ Actual Sched:  $9,200 ✅│
└─────────────────────────┘
```

**Interaction Patterns:**

**Hover:**
- Over block → tooltip shows: Block type, Minimum $, Duration, Provider
- Over time slot → highlight entire row (all providers at that time)
- Over provider column → highlight entire column

**Keyboard Shortcuts:**
- `Cmd+S` / `Ctrl+S` → Save
- `Cmd+G` / `Ctrl+G` → Generate schedule
- `Cmd+E` / `Ctrl+E` → Export to Excel
- `Cmd+Z` / `Ctrl+Z` → Undo
- `Cmd+Shift+Z` / `Ctrl+Y` → Redo
- Arrow keys → Navigate grid cells
- `Enter` → Edit selected cell
- `Esc` → Cancel edit

**Responsive Breakpoints:**
- Desktop: 1440px+ (3-column layout: Intake | Grid | Summary)
- Laptop: 1024-1439px (2-column: Intake/Summary collapsible | Grid)
- Not mobile-optimized (internal tool, desktop usage expected)

---

## 7. AI/Optimization Logic

### Goal
Place blocks across the schedule grid to:
1. Meet production minimums (75% of daily goal)
2. Respect constraints (timing, availability, rules)
3. Optimize for clinical flow and provider balance

### Phase 1: Rule-Based Placement (MVP)

**Algorithm:**

```
Input:
- Providers[] with working hours, operatories, goals
- BlockTypes[] with minimums, durations, roles
- ScheduleRules (NP model, HP placement, etc.)
- TimeGrid (10-min slots from start to end)

Output:
- Populated TimeGrid with assigned blocks

Steps:
1. Initialize TimeGrid
   - Create time slots (7:00, 7:10, ..., 6:00)
   - Mark lunch breaks as unavailable (1:00-2:00 PM default)
   - Mark provider off-hours as unavailable

2. Place Fixed Blocks
   - Meetings, huddles (if configured)
   - Mark slots as occupied

3. Calculate Block Counts
   - For each provider:
     - Total slots available = working hours - lunch - meetings
     - Goal 75% = daily_goal * 0.75
     - For each block type applicable to provider:
       - Count needed = ceil(Goal 75% / block.minimum)
       - Ensure at least 1 NP, 1 SRP (per rules)

4. Place NP Blocks (Priority 1)
   - Per NP model rule:
     - If "doctor_only": Place in doctor columns
     - If "hygienist_only": Place in hygienist columns
     - If "either": Place in available columns (prefer hygienist)
   - Placement preference:
     - Morning slots (before 11:00 AM) preferred
     - Duration: 30-60 min (use procedure timing)
   - Validate no conflicts with lunch, other blocks

5. Place SRP Blocks (Priority 2)
   - Only in hygienist columns
   - Duration: 60-90 min
   - Placement: Morning or afternoon (avoid lunch boundary)

6. Place HP Blocks (Priority 3)
   - Doctor columns (multi-operatory if double booking enabled)
   - Duration: 60-90 min
   - Placement preference: Per rule (morning/afternoon/any)
   - Fill slots to meet 75% minimum

7. Fill Remaining Slots
   - Medium Production (MP) blocks
   - Non-productive blocks (crown seats, adjustments)
   - Emergency (ER) slots if configured

8. Validate Production
   - Sum block minimums per provider
   - Compare to 75% target
   - If under: Add more HP/MP blocks
   - If over: Flag warning (acceptable)

9. Generate Matrixing Codes
   - For each occupied slot:
     - Set staffing code based on provider role:
       - Doctor slot → D
       - Hygienist slot → H
       - Assistant helping → A (if configured)
   - Leave empty for open/flex time

10. Return Populated Grid
```

**Conflict Detection:**
- Two blocks overlap same provider at same time → Error
- Block exceeds provider working hours → Error
- Block during lunch → Error
- Operatory double-booked (unless double booking enabled) → Error

**Optimization Heuristics (MVP):**
- Prefer contiguous blocks (minimize gaps)
- Balance provider workload (avoid one provider overloaded)
- Alternate block types (HP, NP, SRP, MP) for variety
- Leave buffer time between large blocks (10-20 min)

### Phase 2: AI Optimization (Future)

**Approach:**
Use constraint satisfaction solver (e.g., Google OR-Tools) or genetic algorithm.

**Objective Function:**
Maximize:
- Production coverage (hit 75% target)
- Provider balance (minimize variance in workload)
- Clinical flow score (NP → exam → treatment sequence)
- Block contiguity (minimize gaps)

Minimize:
- Idle time
- Constraint violations

**Constraints:**
- Hard constraints (must satisfy):
  - Production minimums ≥ 75% target
  - No overlapping blocks per provider
  - Blocks within working hours
  - NP/SRP placement per model rules
  
- Soft constraints (prefer but not required):
  - HP blocks in morning
  - Contiguous blocks
  - Balanced workload

**Training Data:**
- Existing 150 office templates (manual)
- Extract patterns: Common block sequences, timing, placement
- Train model to replicate expert scheduling

**Explainability:**
- For each block placed, provide rationale:
  - "HP block placed at 8:00 AM (morning preference rule)"
  - "NP block placed in HYG 2 (NP model: hygienist only)"
- Allow overrides: User can manually adjust, AI re-optimizes around changes

---

## 8. Export Requirements

### Excel Format Specification

Based on analysis of 5 real templates, the Excel export must:

**File Structure:**
1. **Sheet 1: Reading the Schedule Template**
   - Static instructional content (copy from reference template)
   - ~50 rows of text explaining how to use the template

2. **Sheet 2: Scheduling Guidelines**
   - Static policies (48-hour rule, priority booking, etc.)
   - Copy from reference template

3. **Sheets 3-7: Day Schedules (Monday - Friday)**
   - Generated from ScheduleTemplate data
   - Layout: Provider info panel (left) + Time grid (right)

4. **Sheets 8-12: Blank Templates (Optional)**
   - Reusable templates without dates
   - Copy of sheets 3-7 but empty

**Sheet Layout (Day Schedule):**

**Columns A-K: Left Panel**
```
A: Provider Names
B: Operatories
C: Daily Goal
D: Hours
E: $/Hr
F: 75% Goal

G-K: Block Type Legend
- Label (HP > $1200)
- Description (High Production, greater than $1200)
- Color indicator
```

**Column L: Time**
- Rows 1-15: Header info (office name, date, totals)
- Row 16: Column headers (Time, DR 1, DR 2, HYG 2, etc.)
- Rows 17-82: Time slots (7:00, 7:10, ..., 6:00)
  - Format: `h:mm` or `h:mm AM/PM` (consistent per office preference)

**Columns M+: Provider Columns (2 per provider)**
- **Pattern:** Staffing | Block Type | Staffing | Block Type | ...
- **Example (3 providers):**
  - M: DR 1 Staffing (D/A/H codes)
  - N: DR 1 Block Type (HP>$1200, NP>$300, etc.)
  - O: DR 2 Staffing
  - P: DR 2 Block Type
  - Q: HYG 2 Staffing
  - R: HYG 2 Block Type

**Cell Formatting:**

**Colors:**
- Use provider's assigned color (from database)
- Apply to both Staffing and Block Type columns when occupied
- White/no fill for empty/flex time
- Example colors observed:
  - `#ec8a1b` (orange)
  - `#87bcf3` (light blue)
  - `#f4de37` (yellow)
  - `#44f2ce` (teal)

**Fonts:**
- Calibri 11pt (or Arial)
- Bold for headers (row 16)
- Normal for data

**Alignment:**
- Time column: Center
- Staffing codes: Center
- Block labels: Left or Center
- Provider info: Left

**Borders:**
- Grid lines: Light gray (`#d0d0d0`)
- Header row: Thicker bottom border
- Time column: Right border separator

**Conditional Formatting:**
- None required (colors are static per provider)

**Footer Rows (Below Time Grid):**
- Row 83: "Total Production Minimums"
- Row 84: Per provider sum of block minimums
- Row 85: Comparison to 75% target (text: "Met" or "Under")

**Named Ranges (Optional, for formulas):**
- `ProviderGoals` → C3:C10 (daily goals)
- `BlockMinimums` → Column totals

**Workbook Properties:**
- Author: "Schedule Template Designer"
- Created Date: Current date
- Modified Date: Current date
- Subject: "Customized Schedule Template - [Office Name]"

### Export Process

**User Flow:**
1. User clicks "Export" button
2. System validates:
   - All required days have schedules
   - Production minimums met
   - No blocking errors
3. System generates Excel file:
   - Library: `exceljs` (Node.js) or `openpyxl` (Python)
   - Create workbook
   - Add "Reading" and "Guidelines" sheets (from templates)
   - For each day:
     - Generate sheet
     - Populate left panel (provider info)
     - Populate time grid (from DaySchedule data)
     - Apply colors, borders, formatting
4. Offer download:
   - Filename: `Customized Schedule Template - [Office Name].xlsx`
   - MIME type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Testing:**
- Validate exported Excel opens in Excel 2016+ and Google Sheets
- Verify colors render correctly
- Confirm formulas (if any) calculate properly
- Check file size (should be <500KB for typical template)

---

## 9. Integration Points

### Current Integrations (MVP)
None. Internal tool, no external APIs required.

### Future Integrations (Post-MVP)

**DPMS Systems:**
- **Goal:** Auto-import provider data, goals, procedure fees
- **Systems:** Dentrix, Open Dental, Eaglesoft, Denticon
- **Challenges:** Each has proprietary APIs/exports
- **Approach:** Start with CSV import, then build DPMS connectors

**Email/Notification:**
- Send completed templates to stakeholders
- Notify offices when new template available
- Use: SendGrid or AWS SES

**Cloud Storage:**
- Save templates to Google Drive, Dropbox, or S3
- Enable version history, sharing

**Analytics:**
- Track: Template generation time, AI optimization success rate, user feedback
- Tools: Mixpanel, Amplitude, or custom dashboard

**Authentication (if multi-user):**
- Currently: Internal tool (Alexa & Megan only)
- Future: Auth0 or Clerk for user management

---

## 10. Technical Architecture

### Tech Stack Recommendations

**Frontend:**
- **Framework:** Next.js 14+ (React) or SvelteKit
  - Why: Server-side rendering, file-based routing, API routes
- **UI Library:** shadcn/ui or Radix UI (unstyled components)
  - Why: Accessible, customizable, dark mode support
- **Styling:** Tailwind CSS
  - Why: Utility-first, rapid prototyping, dark mode built-in
- **State Management:** Zustand or Redux Toolkit
  - Why: Simple, no boilerplate
- **Forms:** React Hook Form + Zod (validation)
  - Why: Performance, TypeScript support
- **Grid/Table:** TanStack Table (React Table v8)
  - Why: Headless, flexible, supports drag-and-drop

**Backend:**
- **Runtime:** Node.js 20+ or Bun
- **Framework:** Next.js API routes or tRPC
  - Why: Type-safe, collocated with frontend
- **Database:** PostgreSQL (Supabase or Neon)
  - Why: Relational data (offices, providers, schedules)
- **ORM:** Prisma or Drizzle
  - Why: Type-safe queries, migrations
- **File Storage:** AWS S3 or Cloudflare R2 (for Excel exports)

**Excel Generation:**
- **Library:** `exceljs` (Node.js)
  - Why: Full control over formatting, colors, styles

**AI/Optimization (Phase 2):**
- **Solver:** Google OR-Tools (constraint satisfaction)
- **ML (Optional):** TensorFlow.js or Python microservice
  - Train on existing templates, suggest optimizations

**Deployment:**
- **Hosting:** Vercel (Next.js) or Netlify
- **Database:** Supabase (PostgreSQL + Auth)
- **CDN:** Cloudflare (for static assets, Excel files)

**Dev Tools:**
- **TypeScript:** End-to-end type safety
- **Linting:** ESLint + Prettier
- **Testing:** Vitest (unit), Playwright (E2E)
- **Version Control:** Git + GitHub

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Dashboard   │  │ Template     │  │ Export     │ │
│  │ (Office List│  │ Builder      │  │ (Download) │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│         │                  │                  │      │
│         └──────────────────┼──────────────────┘      │
│                            │                         │
│                            ▼                         │
│         ┌──────────────────────────────────────┐    │
│         │         API Layer (tRPC/REST)        │    │
│         └──────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────┐
│                 Backend Services                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ Template     │  │ Optimization │  │ Export    │ │
│  │ Engine       │  │ Engine       │  │ Service   │ │
│  │ (Rule-based) │  │ (AI/Solver)  │  │ (exceljs) │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│         │                  │                  │      │
│         └──────────────────┼──────────────────┘      │
│                            │                         │
│                            ▼                         │
│         ┌──────────────────────────────────────┐    │
│         │       Database (PostgreSQL)          │    │
│         │  - Offices, Providers, BlockTypes    │    │
│         │  - ScheduleTemplates, DaySchedules   │    │
│         │  - TimeSlots, ScheduleRules          │    │
│         └──────────────────────────────────────┘    │
│                            │                         │
│                            ▼                         │
│         ┌──────────────────────────────────────┐    │
│         │      File Storage (S3/R2)            │    │
│         │  - Exported Excel files              │    │
│         └──────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### API Endpoints

**Offices:**
- `GET /api/offices` — List all offices
- `GET /api/offices/:id` — Get office details
- `POST /api/offices` — Create office
- `PUT /api/offices/:id` — Update office
- `DELETE /api/offices/:id` — Archive office

**Providers:**
- `GET /api/offices/:id/providers` — List providers for office
- `POST /api/offices/:id/providers` — Add provider
- `PUT /api/providers/:id` — Update provider
- `DELETE /api/providers/:id` — Remove provider

**Block Types:**
- `GET /api/offices/:id/block-types` — List block types for office
- `POST /api/offices/:id/block-types` — Add block type
- `PUT /api/block-types/:id` — Update block type

**Templates:**
- `GET /api/offices/:id/templates` — List templates (versions)
- `POST /api/offices/:id/templates` — Create new template
- `PUT /api/templates/:id` — Update template
- `POST /api/templates/:id/generate` — Generate schedule (run algorithm)
- `POST /api/templates/:id/optimize` — Re-optimize with AI (Phase 2)

**Export:**
- `POST /api/templates/:id/export` — Generate Excel file, return download URL

### Performance Considerations

**Grid Rendering:**
- 66 time slots × 9 providers × 2 columns = ~1,200 cells
- Use virtualization (TanStack Virtual) if grid grows beyond 2,000 cells
- Debounce inline edits (300ms delay before saving)

**Database Queries:**
- Index on: `office_id`, `template_id`, `day_schedule_id`
- Use eager loading for related data (Prisma `include`)
- Cache office configurations (Redis or in-memory, invalidate on update)

**Excel Generation:**
- Generate server-side (not in browser)
- Stream large files (>1MB) to avoid memory issues
- Time limit: 10s max for generation

**Scaling:**
- Current scale: 150 offices, 2 users → Low load
- If scales to 1,000+ offices: Add caching, read replicas
- If multi-tenant (100+ users): Add rate limiting, CDN

---

## 11. MVP vs Future Phases

### MVP (Phase 1) — Q1 2026 Target

**Goal:** Replace manual Excel creation for Alexa & Megan.

**Features:**
✅ Office CRUD (Create, Read, Update, Delete)
✅ Provider management (add, edit, remove)
✅ Intake form (4 buckets)
✅ Production calculation (75% rule)
✅ Block type configuration
✅ Rule-based schedule generation (algorithm above)
✅ Web visualization (grid view, color-coded)
✅ Inline editing (click to change block type, duration)
✅ Production summary (right panel)
✅ Excel export (exact format match)
✅ Dark mode UI

**Out of Scope (MVP):**
❌ AI optimization (use rule-based only)
❌ Drag-and-drop blocks (inline edit only)
❌ Multi-user auth (Alexa & Megan hardcoded)
❌ DPMS integration (manual data entry)
❌ Email/notifications
❌ Version history (1 template per office)

**Success Metrics:**
- Reduce template creation time from 2-4 hours → 30 minutes
- 100% accuracy on production calculations
- Alexa & Megan prefer web tool over Excel (user survey)
- Generate 10 templates in first month

### Phase 2 — Q2 2026

**Features:**
✅ AI optimization engine (Google OR-Tools)
✅ Drag-and-drop blocks
✅ Undo/redo support
✅ Template versioning (quarterly revisions)
✅ What-if scenarios ("What if we add another hygienist?")
✅ Export to PDF (for printing)

**Success Metrics:**
- AI-generated schedules match or exceed manual quality (user feedback)
- 50% reduction in manual adjustments after generation
- Support 200 offices

### Phase 3 — Q3 2026

**Features:**
✅ Multi-user auth (invite Ops Directors, office managers)
✅ Role-based access (read-only for offices, edit for Alexa/Megan)
✅ DPMS integration (Dentrix API, CSV import)
✅ Email templates to offices
✅ Analytics dashboard (usage, production trends)

**Success Metrics:**
- 300 offices using the tool
- 10 active users (Ops team)
- 90% of offices use imported DPMS data (vs manual entry)

### Phase 4 — Future (2027+)

**Features:**
✅ Mobile app (iOS/Android) for on-the-go edits
✅ Live schedule optimization (adjust as appointments booked)
✅ Integration with appointment booking systems
✅ Predictive analytics (forecast production, utilization)
✅ White-label option (sell to other dental management companies)

---

## 12. Open Questions

### Product Questions
1. **Block placement preferences:** Are there specific time slots that should never have HP blocks? (e.g., after 4:00 PM?)
   - **Action:** Interview Alexa/Megan for rules of thumb
**Answer:** No
2. **Double booking details:** When double booking is enabled, how do we represent it in the grid? (Two columns for same doctor?)
   - **Action:** Analyze existing double-booked templates
**Answer:** Two columns for same doctor or Two Columsn for same hygienist depending on the office
3. **Alternating schedules:** How to handle "Every Other Friday" in the data model? (Separate template variant or flag?)
   - **Action:** Decide: One template with variants vs multiple templates
**Answer:** One template with variants
4. **Color coding for matrixing:** Should color intensity change when provider is in multiple operatories at once?
   - **Action:** Review current Excel templates for patterns
**Answer:** Yes
5. **Block minimum overrides:** Should users be able to override auto-calculated minimums? (e.g., change HP>$1200 to HP>$1500?)
   - **Answer:** Yes (inline edit in grid or intake form)
**Answer:** Yes
### Technical Questions
6. **Database choice:** PostgreSQL vs MongoDB for flexible schema (offices have unique fields)?
   - **Recommendation:** PostgreSQL with JSONB columns for flexible configs
**Answer:** PostgreSQL
7. **Excel library:** exceljs vs SheetJS vs xlsx-populate?
   - **Recommendation:** exceljs (best color/formatting support)
**Answer:** exceljs
8. **Hosting costs:** Vercel free tier sufficient? Or need paid plan?
   - **Answer:** Free tier OK for MVP (2 users), upgrade Phase 2

9. **Authentication:** Next-Auth vs Clerk vs Supabase Auth?
   - **Recommendation:** Supabase Auth (integrated with database)
**Answer:** Supabase Auth
10. **Real-time collaboration:** Do Alexa & Megan need to edit same template simultaneously?
    - **Answer:** No (MVP), but add Phase 3 (WebSockets or Supabase Realtime)

### Data Questions
11. **Procedure timing standards:** Should we pre-populate common procedures (Crown prep = 60 min) or force manual entry?
    - **Recommendation:** Pre-populate with editable defaults
**Answer:** Pre-populate with editable defaults
12. **Historical data:** Import existing 150 templates for AI training?
    - **Answer:** Phase 2 (manual for MVP, import for AI training)
**Answer:** Phase 2 (manual for MVP, import for AI training)
13. **Block type taxonomy:** Standardize labels (HP, NP, SRP) or allow custom labels per office?
    - **Recommendation:** Hybrid (standard + custom)
**Answer:** Hybrid (standard + custom)
14. **Ramp-up goals:** How granular? (Monthly? Quarterly?)
    - **Action:** Ask Ops Director for typical cadence
**Answer:** Monthly
15. **Office archival:** When an office closes, soft delete or hard delete?
    - **Recommendation:** Soft delete (keep data for audit)
**Answer:** Soft delete (keep data for audit)

---

## 13. Success Criteria

### User Acceptance
- [x] Alexa & Megan can create a template end-to-end without assistance
- [x] Generated Excel matches manual templates ≥95% accuracy
- [x] Users prefer web tool over manual Excel (survey score ≥4/5)

### Performance
- [x] Intake form loads in <2s
- [x] Schedule generation completes in <10s
- [x] Excel export downloads in <5s
- [x] Grid editing feels responsive (<100ms latency)

### Business Impact
- [x] Reduce template creation time by 50-75%
- [x] Support 150 offices by end of Q1 2026
- [x] Enable quarterly revisions for all offices (4× per year)
- [x] Zero calculation errors (production minimums, block placement)

### Quality
- [x] Zero critical bugs in production
- [x] 90% test coverage (unit + integration)
- [x] Accessible (WCAG 2.1 AA) — keyboard navigation, screen reader support
- [x] Works in Chrome, Firefox, Safari, Edge (latest versions)

---

## 14. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **DPMS** | Dental Practice Management Software (Dentrix, Open Dental, etc.) |
| **Provider** | Dentist (Doctor) or Hygienist |
| **Operatory** | Treatment room (OP1, OP2, Main, etc.) |
| **Block Type** | Schedule slot category (HP, NP, SRP, ER, MP, etc.) |
| **HP** | High Production (crowns, implants, multi-restorative procedures) |
| **NP** | New Patient (consultation, same-day treatment) |
| **SRP** | Scaling & Root Planing (deep cleaning, perio treatment) |
| **ER** | Emergency (limited exam, urgent care) |
| **MP** | Medium Production (fillings, smaller restorative) |
| **NON-PROD** | Non-productive (crown seats, impressions, adjustments) |
| **Recare** | Recall/Prophy (routine cleaning, 6-month checkup) |
| **PM** | Perio Maintenance (periodontal maintenance for perio patients) |
| **Matrixing** | Doctor floating between hygiene exams and restorative work |
| **D/A/H Codes** | Doctor / Assistant / Hygienist staffing indicators |
| **Double Booking** | One doctor scheduled in multiple operatories simultaneously |
| **75% Rule** | 75% of daily goal distributed across block minimums |
| **NP Model** | Rule defining where NP blocks can be placed (doctor / hygienist / either) |
| **UCR** | Usual, Customary & Reasonable (standard fee schedule) |
| **PPO** | Preferred Provider Organization (insurance contracted fees) |

### B. References

**Source Files Analyzed:**
1. `file_27` — Smile Cascade (Dr. Kevin Fitzpatrick)
2. `file_28` — NHD Ridgeview (Dr. Anne Isinger)
3. `file_29` — CDT Comfort Dental (Dr. Roring, Dr. Garrett)
4. `file_30` — KCC Clay Center (Dr. Dustin Kruse)
5. `file_31` — Los Altos (Dr. Karl Supal, Dr. Shile)

**Stakeholder Interviews:**
- Scott's Q&A answers (`answers.md`)
- Intake framework (`intake-doc.md`)
- Example template analysis (`example-template-analysis.md`)

**Patterns Observed:**
- **Providers per office:** 1-7 (avg ~3)
- **Daily goals:** $1,098 - $9,800 (doctors: $4,500-$9,800, hygienists: $1,000-$2,600)
- **Block types:** 18-48 unique per office (avg ~25)
- **Production minimums:** $150 - $5,000 per block
- **Time range:** 6:00 AM - 6:30 PM (most common: 7:00 AM - 6:00 PM)
- **Lunch breaks:** 1:00-2:00 PM (universal)
- **Matrixing usage:** 100% of offices use D/A/H codes
- **Color-coded cells:** 800-1,400 per sheet

### C. Example Block Placement

**Office:** Smile Cascade  
**Provider:** Dr. Kevin Fitzpatrick  
**Daily Goal:** $5,000  
**75% Target:** $3,750  
**Working Hours:** 7:00 AM - 6:00 PM (11 hours)  
**Lunch:** 1:00-2:00 PM (1 hour)  
**Available Time:** 10 hours = 60 slots (10-min increments)

**Block Distribution:**
- **HP blocks:** 3 × $1,200 = $3,600 (70 min each)
- **NP block:** 1 × $150 = $150 (30 min)
- **Total:** $3,750 ✅ (meets 75% target)

**Placement:**
```
Time  | Block Type       | Duration | Staffing
─────────────────────────────────────────────
7:00  | HP > $1200      | 70 min   | D
8:10  | MP              | 30 min   | D
8:40  | HP > $1200      | 70 min   | D
9:50  | NP CONS         | 30 min   | D
10:20 | Break           | 20 min   | —
10:40 | HP > $1200      | 70 min   | D
11:50 | MP              | 20 min   | D
12:10 | Lunch prep      | 50 min   | —
1:00  | LUNCH           | 60 min   | —
2:00  | NON-PROD        | 30 min   | D
2:30  | MP              | 60 min   | D
3:30  | ER (Access)     | 30 min   | D
4:00  | NON-PROD        | 30 min   | D
4:30  | Admin/Wrap-up   | 90 min   | —
```

**Notes:**
- HP blocks placed in morning (7:00, 8:40) and afternoon (10:40)
- NP block at 9:50 (mid-morning)
- ER access block at 3:30 (late afternoon for urgent cases)
- Buffer time before/after lunch

---

## 15. Next Steps

### Immediate Actions (Week 1)
1. **Review this PRD** with Scott, Alexa, Megan
2. **Clarify open questions** (Section 12)
3. **Prioritize MVP features** (cut scope if needed)
4. **Set up development environment** (Next.js, Supabase, Tailwind)

### Development Roadmap (8-12 weeks)

**Week 1-2: Foundation**
- Database schema (Prisma)
- Auth setup (Supabase)
- UI design system (Tailwind + shadcn/ui)
- Intake form (Bucket 1: Practice info)

**Week 3-4: Data Management**
- Provider CRUD
- Block type configuration
- Production calculation logic (75% rule)
- Intake form (Buckets 2-4)

**Week 5-6: Schedule Engine**
- Rule-based placement algorithm
- Grid visualization (TanStack Table)
- Matrixing code generation
- Production validation

**Week 7-8: Export & Polish**
- Excel generation (exceljs)
- Export validation (test in Excel/Google Sheets)
- Dark mode UI polish
- Inline editing

**Week 9-10: Testing & Iteration**
- User acceptance testing (Alexa & Megan)
- Bug fixes
- Performance optimization
- Documentation (user guide)

**Week 11-12: Launch Prep**
- Deploy to production (Vercel + Supabase)
- Migrate first 10 offices
- Training session (Alexa & Megan)
- Monitor & support

### Post-Launch
- Gather feedback (weekly check-ins)
- Plan Phase 2 (AI optimization)
- Scale to 150 offices (quarterly rollout)

---

**End of PRD**

**Document Owner:** Schedule Template Designer Team  
**Last Updated:** February 12, 2026  
**Next Review:** After MVP user testing (Week 10)
