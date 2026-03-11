# Schedule Template Designer — Sprint 6 Brief
## Multi-Op Scheduling: Shared-Pool Production Target (Industry-Correct Model)

App: /home/scott/.openclaw/workspace/schedule-template-designer-app
Research log: /home/scott/.openclaw/workspace/output/reports/schedule-designer-research-log.md
GITHUB_TOKEN: `grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2`

---

## The Problem with the Current Fix

Sprint 5 fixed multi-op over-production by dividing `dailyGoal / numOps` before calling
`placeDoctorBlocks` for each op. This is an improvement but wrong in two ways:

1. **$3k goal / 3 ops = $1k per op** — but a single HP block costs $1,200. The generator
   can't fit ANY HP block into a $1k-target op. Ops end up under-filled or filled with
   low-value blocks instead of the most efficient mix.

2. **Equal division isn't how real practices work.** Industry standard: Op 0 carries the
   majority of production (HP-heavy), Op 1 carries mid-tier work, Op 2 carries lighter
   work (NP/ER/exams). The doctor has one goal total.

## The Right Model: Shared Production Pool

The doctor has ONE production goal. All ops are vessels to fill until that goal is met.
The fix is a shared tracker across all ops, not a per-op division.

---

## Implementation

### In `src/lib/engine/generator.ts`

Replace the current multi-op goal-division approach with a shared production pool.

**Step 1: Create a shared production tracker per doctor**

```typescript
// In the multi-column block placement loop (where isMultiColumn === true):
const sharedTarget = calculateTarget75(doc.dailyGoal);  // one target for all ops combined
let sharedProduced = 0;  // accumulates across ALL ops for this doctor
```

**Step 2: Pass the shared tracker into `placeDoctorBlocks`**

Modify `placeDoctorBlocks` signature to accept:
```typescript
sharedProductionCtx?: { target: number; produced: number }
```

Inside `placeDoctorBlocks`, before placing each revenue block (HP, MP, NP, ER):
- Check `sharedProductionCtx.produced >= sharedProductionCtx.target`
- If yes → skip placement (goal already met)
- If no → place block, add `block.minimumAmount` to `sharedProductionCtx.produced`

Non-revenue blocks (lunch, breaks) always placed regardless.

**Step 3: Op fill order matters — use weighted allocation**

Fill ops in this order:
- Op 0 (index 0): fills HP/Rock blocks first → targets ~55-60% of shared goal
- Op 1 (index 1): fills MP/Sand blocks → targets ~30-35% of remaining
- Op 2+ (index 2+): fills lighter blocks (NP/ER/Water) → fills remaining gap to goal

Implementation: pass `opIndex` to `placeDoctorBlocks`. Adjust the Rock/Sand/Water
preference based on `opIndex`:
- `opIndex === 0`: strong Rock preference (HP blocks), current behavior
- `opIndex === 1`: MP preference, some HP if room
- `opIndex >= 2`: NP/ER/exam preference, fills to goal if not already met

**Step 4: Single-op path unchanged**

The single-op path (`isMultiColumn === false`) does NOT use shared tracking —
it uses the existing independent fill logic. No change needed.

---

## Expected Results After Fix

With a doctor, $3,000 goal, 3 ops, HP block at $1,200, MP at $350, NP at $200:

| Op | Fill Target (approx) | Block types |
|----|---------------------|-------------|
| Op 0 | ~$1,500 (50%) | HP + MP |
| Op 1 | ~$1,050 (35%) | MP + HP if available |
| Op 2 | ~$450 (15%) | NP + ER |
| **Combined** | **~$3,000** | **Meets goal** |

With a $5,000 goal, 2 ops:
- Op 0 fills to ~$2,750 (55%)
- Op 1 fills to ~$2,250 (45%)
- Combined ≈ $5,000 ✅

---

## Acceptance Criteria

- [ ] Doctor with 1 op: behavior unchanged from pre-Sprint 5
- [ ] Doctor with 2 ops, $3k goal: combined production ≈ $2,250–$3,000 (within 20%)
- [ ] Doctor with 3 ops, $3k goal: combined production ≈ $2,250–$3,000 (within 20%)
- [ ] Op 0 always carries the majority of production value
- [ ] No individual op exceeds the shared target on its own
- [ ] HP blocks ($1,200+) can still be placed even when per-op would have been $1,000
- [ ] Existing 326 tests still pass
- [ ] Add regression tests covering 2-op and 3-op goal scenarios

---

## Also Fix: Production Summary Display Clarity (PRD §5.4)

In `src/components/schedule/ScheduleGrid.tsx` and the Production Summary panel:

Currently the production summary shows one row per provider (correct). Add a secondary
breakdown for multi-op doctors:

```
Dr. Smith — Combined Production: $2,847 / $2,250 target (126%) ✅
  ├── Op 1: $1,650
  ├── Op 2: $897
  └── Op 3: $300
```

This gives the user visibility into how production is distributed across ops.
The combined total drives the goal bar — not per-op totals.

The breakdown can be a collapsible/expandable section under the existing production summary
card (click to expand). Default collapsed.

---

## Code Quality Rules
- TypeScript strict — no `any`
- `npm test` after changes — all 340 tests must pass
- Write regression tests for 1-op, 2-op, and 3-op goal scenarios
- Commit: `git commit -m "fix: shared-pool multi-op production (Sprint 6 §5.4)"`
- Push:
  ```bash
  FRESH=$(grep GITHUB /home/scott/.openclaw/workspace/.env | cut -d= -f2)
  git remote set-url origin "https://scott4885:${FRESH}@github.com/scott4885/schedule-template-designer.git"
  git push origin main
  ```

## Output
1. Before/after production numbers for 1-op, 2-op, 3-op scenarios
2. Confirm shared-pool logic working correctly
3. Final test count (expect 340+)
4. Push confirmation
