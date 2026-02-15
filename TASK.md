# TASK: Rebuild the Schedule Generator with Expert Dental Scheduling Logic

## CRITICAL: Read RESEARCH.md FIRST
Before writing ANY code, read RESEARCH.md thoroughly. It contains expert-level research on dental block scheduling, the Rock-Sand-Water framework, zone scheduling, two-column doctor scheduling, matrixing, and production calculations. The generator MUST implement these principles.

## Problem
The current generator at `src/lib/engine/generator.ts` only places NP blocks and lunch. The rest of the day is empty. A real dental schedule template needs to be FULL — every slot should have a purpose (procedure block, assistant time, exam time, or strategically held).

## What the Generator Must Produce

### For EACH Doctor:
1. **NP Consult** — 1 per day, placed in first 2 hours (40-60 min based on blockTypes config)
2. **HP Blocks (ROCKS)** — 2-3 per morning, 1-2 afternoon. Crown preps, endo, multi-unit work. These are the biggest production. Place in morning FIRST.
3. **MP Blocks (SAND)** — 1-2 per day. Single fillings, simple procedures. Fill gaps between rocks.
4. **ER/Access Block** — 1 per day. Mid-morning (~10:00-10:30) or mid-afternoon (~2:30-3:00).
5. **NON-PROD (WATER)** — 1-2 late afternoon. Crown seats, adjustments, follow-ups.
6. **Lunch** — Immovable. Per provider config (default 1:00-2:00 PM).

### For EACH Hygienist:
1. **SRP** — 1 per day, morning preferred (60-90 min based on blockTypes config)
2. **PM (Perio Maintenance)** — 1 per day, morning or early afternoon (50-60 min)
3. **Recare** — Fill remaining slots (50-60 min each)
4. **Lunch** — Immovable.

### Production Calculations:
- Calculate 75% of each provider's daily goal
- HP blocks get 55-70% of the 75% target
- NP blocks get 5-10%
- MP blocks get 15-25%
- ER/Access gets 5-10%
- Each block gets a production minimum label (e.g., "HP>$1200", "NP>$300")
- Total scheduled production MUST meet or exceed 75% target

### Doctor Matrixing (if matrixing enabled):
- During assistant-only time (setup, temp, dismiss), doctor can do hygiene exams
- Mark these slots with appropriate D/A codes:
  - Doctor in own OP = "D"
  - Assistant only in doctor OP = "A"  
  - Doctor doing hygiene exam = show "D" in hygiene column for that slot

### 80/20 Rule:
- 80% of production blocks should be in the morning (before lunch)
- 20% in the afternoon
- Afternoon is lighter: crown seats, adjustments, fillings, emergencies

## Algorithm Steps

```
1. INITIALIZE
   - Create time grid from provider working hours (10 or 15 min increments)
   - Mark lunch slots as LUNCH (immovable)
   - Calculate available morning slots (start → lunch) and afternoon slots (lunch → end)
   - Calculate 75% production target per provider
   - Calculate production allocation per block type

2. PLACE DOCTOR BLOCKS (in priority order)
   a. NP CONSULT — First available morning slot (duration from blockTypes or default 40 min)
   b. HP BLOCK 1 — After NP, morning. Duration from blockTypes or default 90 min (crown prep)
   c. HP BLOCK 2 — After HP1, morning. Duration 60-90 min
   d. ER/ACCESS — Mid-morning (~10:00-10:30). Duration 30 min
   e. HP BLOCK 3 — If morning slots remain. Duration 60-90 min
   f. HP BLOCK (afternoon) — First slot after lunch. Duration 60-90 min
   g. MP BLOCK — After afternoon HP. Duration 30-40 min
   h. NON-PROD — Late afternoon. Duration 20-30 min (crown seat, adjustment)
   i. MP BLOCK 2 — Fill remaining afternoon gaps. Duration 30 min
   j. Check: does total production ≥ 75% target? If not, add more MP blocks.

3. PLACE HYGIENE BLOCKS (in priority order)
   a. SRP — First morning slot. Duration from blockTypes or default 75 min
   b. PM — After SRP or mid-morning. Duration 60 min
   c. RECARE — Fill all remaining non-lunch slots. Duration 55 min each
   d. If multiple hygienists: stagger SRP times (HYG1 gets 7:00 SRP, HYG2 gets 8:30 SRP)

4. ADD MATRIXING CODES (if enabled)
   - For each doctor slot: "D" when doctor present, "A" when assistant-only
   - For assistant-only windows, check if hygienist needs exam → mark doctor exam time
   
5. VALIDATE
   - No gaps (every non-lunch slot has a block)
   - Production meets 75% target
   - No blocks cross lunch boundary
   - NP is in first 2 hours
   - HP blocks concentrated in morning
```

## Block Duration Defaults (when blockTypes not configured)

Use these as fallbacks. If the office has configured blockTypes in Clinical Timing (tab 3), use those durations instead:

| Block | Doctor Duration | Hygiene Duration |
|-------|----------------|-----------------|
| HP (Crown prep + buildup) | 90 min (9 slots @ 10min) | N/A |
| HP (Endo) | 90 min | N/A |
| HP (Multi-unit composite) | 60 min | N/A |
| NP Consult | 40 min (4 slots) | N/A |
| MP (Filling) | 40 min (4 slots) | N/A |
| ER (Emergency) | 30 min (3 slots) | N/A |
| NON-PROD (Crown seat) | 30 min (3 slots) | N/A |
| SRP | N/A | 75 min (use 80 min = 8 slots for clean fit) |
| PM | N/A | 60 min (6 slots) |
| Recare | N/A | 60 min (6 slots) |
| NP Hygiene | N/A | 60 min (6 slots) |

## Production Minimum Labels

Calculate and display these on each block:
```
75% Target = dailyGoal * 0.75

HP minimum = floor(target * 0.25) per HP block  (e.g., $937 → "HP>$900")
NP minimum = floor(target * 0.08)  (e.g., $300 → "NP>$300")  
MP minimum = floor(target * 0.10) per MP block  (e.g., $375 → "MP>$375")
ER minimum = floor(target * 0.05)  (e.g., $187 → "ER>$187")
```

Round minimums to nearest $25 or $50 for clean labels.

## Files to Modify

### PRIMARY: `src/lib/engine/generator.ts`
This is where 90% of the work happens. Rewrite the `generateSchedule` function to implement the algorithm above. Read the current file first to understand the interface — don't change the function signature, just fix the implementation.

### SECONDARY: `src/app/offices/[id]/page.tsx`
The office detail page renders the schedule grid. Ensure it properly displays:
- Block labels with production minimums (e.g., "HP>$1200")
- Color coding by block type
- Staffing codes (D/A/H) in the staffing column
- All time slots filled (no empty slots except intentional gaps)

### ALSO CHECK: `src/lib/engine/types.ts`
Make sure types support all block types listed above. Add any missing types.

### ALSO CHECK: `src/lib/engine/calculator.ts`  
Make sure production calculations work correctly with the 75% rule.

## What NOT to Change
- Do NOT modify the intake form (tabs 1-4)
- Do NOT modify localStorage persistence  
- Do NOT modify the Excel export
- Do NOT add new npm dependencies
- Do NOT add tests — focus on making it WORK

## Verification
1. Run `npm run build` — must pass
2. The generated schedule should look FULL — every time slot should have a block assigned
3. Morning should be dominated by HP blocks
4. Afternoon should be lighter (MP, NON-PROD, ER)
5. NP should be in first 2 hours
6. Hygienists should have SRP morning, recare filling the rest
7. Production summary should show ≥75% target met
8. Lunch properly blocked

## When Done
Run: `openclaw system event --text "Done: Generator rebuilt with Rock-Sand-Water scheduling, full day templates, production calculations" --mode now`
