/**
 * Rock-Sand-Water Block Placement Strategy
 *
 * Implements the dental scheduling methodology:
 *   ROCKS first (HP, $1200+, 60-120 min) — anchor the day
 *   SAND second (MP, NP, ER, $800-1200, 30-60 min) — fill around rocks
 *   WATER last (NON-PROD, adjustments, $0-800, 10-20 min) — never displaces rock or sand
 *
 * Key rules:
 *   - 2 protected rock blocks in AM, 1 in PM (Linda Miles rule)
 *   - 80% of restorative production in morning (Burkhart 80/20)
 *   - NP blocks: 2/day (1 AM ~9-10am, 1 PM ~2-3pm)
 *   - ER blocks: mid-morning (10-11am) + early afternoon (2-3pm), NEVER end of day
 *   - Never break a rock block for sand or water
 *
 * @module rock-sand-water
 */

import type {
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
  ScheduleRules,
  ProcedureCategory,
  ProcedureMix,
} from './types';
import { inferProcedureCategory } from './types';
import { calculateTarget75 } from './calculator';
import {
  categorize,
  blockAppliesToProvider,
  getBlockForCategory,
  getAllBlocksForCategory,
  FALLBACK_IDS,
  DEFAULT_BLOCKS,
} from './block-categories';
import type { ProviderSlots } from './slot-helpers';
import {
  toMinutes,
  getProviderOpSlots,
  findAvailableRanges,
  placeBlockInSlots,
  makeLabel,
  roundTo25,
  getLunchMidpoint,
  morningRanges,
  afternoonRanges,
  rangesAfter,
  rangesBefore,
  rangesInWindow,
  lastRange,
  wouldExceedVarietyCap,
  rangesAvoidingDMinutes,
  getDPhaseMinutes,
} from './slot-helpers';
import { calculateProductionTargets } from './production-calculator';

// ---------------------------------------------------------------------------
// Procedure Mix Intelligence (Sprint 9)
// ---------------------------------------------------------------------------

/**
 * Determine whether a future procedure mix is valid (set + sums to ~100).
 */
export function isMixValid(mix: ProcedureMix | undefined): boolean {
  if (!mix || Object.keys(mix).length === 0) return false;
  const total = Object.values(mix).reduce((s, v) => s + (v ?? 0), 0);
  return total >= 95 && total <= 105;
}

/**
 * Calculate target block counts per procedure category for a provider.
 * Uses 75% of dailyGoal as the production target.
 */
export function calculateCategoryTargets(
  provider: ProviderInput,
  blockTypes: BlockTypeInput[],
  mix: ProcedureMix
): Partial<Record<ProcedureCategory, number>> {
  const target75 = calculateTarget75(provider.dailyGoal);
  const result: Partial<Record<ProcedureCategory, number>> = {};

  for (const [cat, pct] of Object.entries(mix) as [ProcedureCategory, number][]) {
    if (!pct || pct <= 0) continue;
    const catBlocks = blockTypes.filter(bt => {
      const btCat = bt.procedureCategory ?? inferProcedureCategory(bt.label);
      return btCat === cat && (bt.appliesToRole === provider.role || bt.appliesToRole === 'BOTH');
    });
    if (catBlocks.length === 0) continue;
    const avgValue = catBlocks.reduce((s, b) => s + (b.minimumAmount ?? 0), 0) / catBlocks.length;
    const dollarTarget = target75 * (pct / 100);
    result[cat] = avgValue > 0 ? Math.round(dollarTarget / avgValue) : 0;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Doctor block placement — Rock-Sand-Water with procedure mix support
// ---------------------------------------------------------------------------

/**
 * Place blocks for a doctor using category-weighted procedure mix.
 * Called when provider.futureProcedureMix is set and valid.
 *
 * @param slots - Master slots array (mutated)
 * @param ps - Provider+operatory slot group
 * @param doc - Doctor provider
 * @param blockTypes - All block type definitions
 * @param timeIncrement - Slot increment in minutes
 * @param warnings - Warning messages array (mutated)
 * @param staggerOffsetMin - Stagger offset for this column
 * @param sharedProductionCtx - Shared production context for multi-op doctors
 */
export function placeDoctorBlocksByMix(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  doc: ProviderInput,
  blockTypes: BlockTypeInput[],
  timeIncrement: number,
  warnings: string[],
  staggerOffsetMin: number,
  sharedProductionCtx?: { target: number; produced: number },
  avoidDPhaseMinutes?: Set<number>
): void {
  const futureMix = doc.futureProcedureMix!;
  const categoryTargets = calculateCategoryTargets(doc, blockTypes, futureMix);

  const sortedCategories = (Object.entries(futureMix) as [ProcedureCategory, number][])
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);

  const staggeredStartMin = toMinutes(doc.workingStart) + staggerOffsetMin;
  let totalScheduled = 0;

  const isGoalMet = () =>
    sharedProductionCtx
      ? sharedProductionCtx.produced >= sharedProductionCtx.target
      : totalScheduled >= calculateTarget75(doc.dailyGoal);

  const recordProd = (amount: number) => {
    totalScheduled += amount;
    if (sharedProductionCtx) sharedProductionCtx.produced += amount;
  };

  for (const cat of sortedCategories) {
    if (isGoalMet()) break;
    const targetCount = categoryTargets[cat] ?? 0;
    if (targetCount <= 0) continue;

    const catBlockTypes = blockTypes.filter(bt => {
      const btCat = bt.procedureCategory ?? inferProcedureCategory(bt.label);
      return btCat === cat && blockAppliesToProvider(bt, doc);
    });
    if (catBlockTypes.length === 0) continue;

    catBlockTypes.sort((a, b) => (b.minimumAmount ?? 0) - (a.minimumAmount ?? 0));

    let placed = 0;
    let btIndex = 0;
    while (placed < targetCount && !isGoalMet()) {
      const bt = catBlockTypes[btIndex % catBlockTypes.length];
      btIndex++;

      const slotsNeeded = Math.ceil(bt.durationMin / timeIncrement);
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;

      const afterStagger = rangesAfter(ranges, slots, staggeredStartMin);
      const availableRanges = rangesAvoidingDMinutes(afterStagger, slots, avoidDPhaseMinutes);
      const targetRange = availableRanges[0] ?? afterStagger[0] ?? ranges[0];

      const amount = bt.minimumAmount ?? 0;
      const mixCat = categorize(bt);
      const mixRationale =
        mixCat === 'HP' ? 'mix target — HP' :
        mixCat === 'MP' ? 'mix target — MP' :
        mixCat === 'NP' ? 'mix target — NP' :
        mixCat === 'ER' ? 'mix target — ER' :
        'mix target';
      placeBlockInSlots(slots, targetRange, bt, doc, amount > 0 ? makeLabel(bt, amount) : bt.label, mixRationale);
      recordProd(amount);
      placed++;

      if (btIndex > catBlockTypes.length * 3) break;
    }
  }

  // Fill any remaining gap to reach target
  let safety = 0;
  while (!isGoalMet() && safety < 10) {
    safety++;
    const allBlocks = blockTypes
      .filter(bt => blockAppliesToProvider(bt, doc))
      .sort((a, b) => (b.minimumAmount ?? 0) - (a.minimumAmount ?? 0));

    let filled = false;
    for (const bt of allBlocks) {
      const slotsNeeded = Math.ceil(bt.durationMin / timeIncrement);
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) continue;
      const chosen = rangesAvoidingDMinutes(ranges, slots, avoidDPhaseMinutes)[0] ?? ranges[0];
      const amount = bt.minimumAmount ?? 0;
      placeBlockInSlots(slots, chosen, bt, doc, amount > 0 ? makeLabel(bt, amount) : bt.label, 'mix gap fill');
      recordProd(amount);
      filled = true;
      break;
    }
    if (!filled) break;
  }

  if (!isGoalMet() && calculateTarget75(doc.dailyGoal) > 0) {
    warnings.push(`Procedure mix placement: could not fully reach 75% target for ${doc.name}`);
  }

  // Fill remaining empty slots
  let fillRemaining = 0;
  const allApplicableBlocks = blockTypes
    .filter(bt => blockAppliesToProvider(bt, doc))
    .sort((a, b) => (a.minimumAmount ?? 0) - (b.minimumAmount ?? 0));
  while (fillRemaining < 30 && allApplicableBlocks.length > 0) {
    fillRemaining++;
    let filled = false;
    for (const bt of allApplicableBlocks) {
      const slotsNeeded = Math.ceil(bt.durationMin / timeIncrement);
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) continue;
      if (wouldExceedVarietyCap(slots, ps, bt.id, slotsNeeded)) continue;
      const chosen = rangesAvoidingDMinutes(ranges, slots, avoidDPhaseMinutes)[0] ?? ranges[0];
      const amount = bt.minimumAmount ?? 0;
      placeBlockInSlots(slots, chosen, bt, doc, amount > 0 ? makeLabel(bt, amount) : bt.label, 'buffer / gap');
      recordProd(amount);
      filled = true;
      break;
    }
    if (!filled) break;
  }
}

// ---------------------------------------------------------------------------
// Doctor block placement — Rock-Sand-Water standard algorithm
// ---------------------------------------------------------------------------

/**
 * Place blocks for a doctor following Rock-Sand-Water methodology.
 *
 * Morning (Rocks):
 *   1. NP consult — first available morning slot (staggered)
 *   2. HP blocks — 2-3 in morning (op 0), 1 for op 1, 0 for op 2+
 *   3. ER/Access — mid-morning (10-11am)
 *   4. Fill remaining morning with HP or MP
 *
 * Afternoon (Sand & Water):
 *   5. HP — 1 block right after lunch (op 0-1)
 *   6. MP — after HP
 *   7. NON-PROD — late afternoon (crown seat, adjustment)
 *   8. Second MP — fill gap
 *   9. Second ER — early afternoon (if ACCESS_BLOCKS mode)
 *   10. Goal-driven gap fill
 *   11. Fill all remaining empty slots
 *
 * @param slots - Master slots array (mutated)
 * @param ps - Provider+operatory slot group
 * @param doc - Doctor provider
 * @param blocksByCategory - Pre-categorized block type map
 * @param rules - Schedule rules
 * @param timeIncrement - Slot increment in minutes
 * @param warnings - Warning messages array (mutated)
 * @param staggerOffsetMin - Stagger offset for this column
 * @param opIndex - Index of this operatory for the doctor (0 = primary)
 * @param sharedProductionCtx - Shared production context for multi-op doctors
 * @param avoidDPhaseMinutes - Minutes to avoid for D-phase placement (cross-column zigzag)
 */
export function placeDoctorBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  doc: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[],
  staggerOffsetMin: number = 0,
  opIndex: number = 0,
  sharedProductionCtx?: { target: number; produced: number },
  avoidDPhaseMinutes?: Set<number>
): void {
  // Helper: pick the best target range out of `ranges`, preferring ranges
  // whose predicted D-phase minutes do not collide with the other column's
  // D-phase (A-D cross-column zigzag). Falls back to `ranges[0]` if the
  // avoid filter is empty or no clean candidate exists.
  const pickAvoiding = (ranges: number[][]): number[] | undefined => {
    if (ranges.length === 0) return undefined;
    const filtered = rangesAvoidingDMinutes(ranges, slots, avoidDPhaseMinutes);
    return filtered[0] ?? ranges[0];
  };
  const staggeredStartMin = toMinutes(doc.workingStart) + staggerOffsetMin;
  const targets = calculateProductionTargets(doc);

  let totalScheduled = 0;

  const isGoalMet = () =>
    sharedProductionCtx
      ? sharedProductionCtx.produced >= sharedProductionCtx.target
      : totalScheduled >= targets.target75;
  const recordProd = (amount: number) => {
    totalScheduled += amount;
    if (sharedProductionCtx) sharedProductionCtx.produced += amount;
  };

  // Resolve block types for each category
  const npBlock = getBlockForCategory('NP', blocksByCategory, doc);
  const mpBlock = getBlockForCategory('MP', blocksByCategory, doc);
  const erBlock = getBlockForCategory('ER', blocksByCategory, doc);
  const nonProdBlock = getBlockForCategory('NON_PROD', blocksByCategory, doc);

  const hpBlocks = getAllBlocksForCategory('HP', blocksByCategory, doc);
  hpBlocks.sort((a, b) => (b.minimumAmount || 0) - (a.minimumAmount || 0));

  // Calculate per-block production minimums from the 75% target
  const hpMinPerBlock = roundTo25(targets.hpTarget / 3);
  const npMin = roundTo25(targets.npTarget);
  const mpMinPerBlock = roundTo25(targets.mpTarget / 2);
  const erMin = roundTo25(targets.erTarget);

  // ──────── MORNING: ROCKS ────────

  // NP CONSULT — First available morning slot (staggered by doctor index)
  if (npBlock && rules.npBlocksPerDay > 0 && (rules.npModel === 'DOCTOR_ONLY' || rules.npModel === 'EITHER') && !isGoalMet()) {
    const slotsNeeded = Math.ceil(npBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const earlyRanges = rangesAfter(
      rangesBefore(ranges, slots, staggeredStartMin + 120),
      slots,
      staggeredStartMin
    );
    const targetRange = pickAvoiding(earlyRanges) || pickAvoiding(morningRanges(ranges, slots, doc));

    if (targetRange) {
      const amount = npBlock.minimumAmount || npMin;
      placeBlockInSlots(slots, targetRange, npBlock, doc, makeLabel(npBlock, amount), 'new patient exam');
      recordProd(amount);
    } else if (ranges[0]) {
      const amount = npBlock.minimumAmount || npMin;
      placeBlockInSlots(slots, ranges[0], npBlock, doc, makeLabel(npBlock, amount), 'new patient exam');
      recordProd(amount);
    } else {
      warnings.push(`No room for NP block for ${doc.name}`);
    }
  }

  // HP BLOCKS — Fill morning with rocks. OP 2 (opIndex=1) previously got
  // only 1 morning HP, which caused its afternoon to empty once isGoalMet
  // triggered. Bumped to 2 so the chair has sustained morning production.
  // OP 3+ (opIndex>=2) still gets 0 here but receives a forced anchor below.
  const morningHPMax = opIndex === 0 ? 3 : opIndex === 1 ? 2 : 0;
  let morningHPPlaced = 0;

  // Iter 12a: Rock-Sand-Water quality floor — every operatory MUST have at
  // least 1 morning HP "rock" anchor, even if isGoalMet() returns true early
  // (shared pool already filled by other ops). Force at least 1 HP placement
  // for any opIndex that has hpBlocks available and room in the morning.
  const guaranteedMinHP = hpBlocks.length > 0 ? 1 : 0;

  for (let i = 0; i < morningHPMax; i++) {
    // Iter 12a: skip the goal-met short-circuit for the first forced HP —
    // every op needs at least one morning anchor regardless of shared pool.
    if (i >= guaranteedMinHP && isGoalMet()) break;

    const hp = hpBlocks[i % hpBlocks.length];
    if (!hp) break;

    const hpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);

    const targetRange = pickAvoiding(amRanges) || pickAvoiding(fallbackAmRanges);

    if (targetRange) {
      const hpRationale = i === 0 ? 'morning rock anchor' : 'morning rock follow-up';
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, hpAmount), hpRationale);
      recordProd(hpAmount);
      morningHPPlaced++;
    } else {
      break;
    }
  }

  // Iter 12a: ensure opIndex >= 2 (OP3 and beyond) also gets at least 1
  // morning HP anchor. The original cap was 0 for opIndex>=2, but without
  // a rock anchor they fall into pure fill-with-sand mode.
  if (opIndex >= 2 && hpBlocks.length > 0 && morningHPPlaced === 0) {
    const hp = hpBlocks[0];
    const hpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);
    const targetRange = pickAvoiding(amRanges) || pickAvoiding(fallbackAmRanges);
    if (targetRange) {
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, hpAmount), 'morning rock anchor');
      recordProd(hpAmount);
      morningHPPlaced++;
    }
  }

  // For Op 1+: place an MP block in the morning
  if (opIndex >= 1 && mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);
    const targetRange = pickAvoiding(amRanges) || pickAvoiding(fallbackAmRanges);
    if (targetRange) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, targetRange, mpBlock, doc, makeLabel(mpBlock, amount), 'afternoon sand');
      recordProd(amount);
    }
  }

  // ER/ACCESS — Mid-morning, offset by stagger
  if (erBlock && rules.emergencyHandling !== 'FLEX' && !isGoalMet()) {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const erWindowStart = Math.max(10 * 60 + staggerOffsetMin, staggeredStartMin);
    const midMorningRanges = rangesInWindow(ranges, slots, erWindowStart, 11 * 60 + 30 + staggerOffsetMin);
    const targetRange = pickAvoiding(midMorningRanges) || pickAvoiding(morningRanges(ranges, slots, doc));

    if (targetRange) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, targetRange, erBlock, doc, makeLabel(erBlock, amount), 'emergency slot');
      recordProd(amount);
    }
  }

  // Fill remaining morning with more HP if available (Op 0 and Op 1 only).
  if (opIndex <= 1 && morningHPPlaced < 4 && hpBlocks.length > 0 && !isGoalMet()) {
    const hp = hpBlocks[0];
    const fillHpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = morningRanges(ranges, slots, doc);
    const targetRange = pickAvoiding(amRanges);
    if (targetRange) {
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, fillHpAmount), 'morning rock follow-up');
      recordProd(fillHpAmount);
    }
  }

  // ──────── AFTERNOON: SAND & WATER ────────

  // HP BLOCK — 1 block right after lunch (Op 0 and Op 1 only).
  if (opIndex <= 1 && hpBlocks.length > 0 && !isGoalMet()) {
    const hp = hpBlocks[0];
    const pmHpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const pmStaggerStart = getLunchMidpoint(doc) + staggerOffsetMin;
      const staggeredPmRanges = rangesAfter(pmRanges, slots, pmStaggerStart);
      const targetRange = pickAvoiding(staggeredPmRanges) || pickAvoiding(pmRanges);
      if (targetRange) {
        placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, pmHpAmount), 'afternoon rock');
        recordProd(pmHpAmount);
      }
    }
  }

  // MP BLOCK — After afternoon HP
  if (mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    const targetRange = pickAvoiding(pmRanges);
    if (targetRange) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, targetRange, mpBlock, doc, makeLabel(mpBlock, amount), 'afternoon sand');
      recordProd(amount);
    }
  }

  // NON-PROD — Late afternoon (crown seat, adjustment). Always place regardless of goal.
  if (nonProdBlock) {
    const slotsNeeded = Math.ceil(nonProdBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);
    const lateRanges = rangesAfter(pmRanges, slots, 16 * 60);
    // Prefer late ranges that avoid cross-column D-phase; fall back to any late range.
    const lateAvoid = rangesAvoidingDMinutes(lateRanges, slots, avoidDPhaseMinutes);
    const pmAvoid = rangesAvoidingDMinutes(pmRanges, slots, avoidDPhaseMinutes);
    const targetRange = lastRange(lateAvoid) || lastRange(lateRanges) || lastRange(pmAvoid) || lastRange(pmRanges);

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, nonProdBlock, doc, makeLabel(nonProdBlock), 'late-day non-prod');
      recordProd(nonProdBlock.minimumAmount || 0);
    }
  }

  // Second MP block — fill remaining afternoon gap
  if (mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    const targetRange = pickAvoiding(pmRanges);
    if (targetRange) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, targetRange, mpBlock, doc, makeLabel(mpBlock, amount), 'afternoon sand');
      recordProd(amount);
    }
  }

  // Second ER block in early afternoon if ACCESS_BLOCKS mode
  if (erBlock && rules.emergencyHandling === 'ACCESS_BLOCKS' && !isGoalMet()) {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const earlyPM = rangesInWindow(ranges, slots, 14 * 60, 15 * 60 + 30);

    const targetRange = pickAvoiding(earlyPM);
    if (targetRange) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, targetRange, erBlock, doc, makeLabel(erBlock, amount), 'emergency slot');
      recordProd(amount);
    }
  }

  // Goal-driven gap fill
  let safety = 0;
  while (!isGoalMet() && safety < 15) {
    safety++;
    const sharedGap = sharedProductionCtx
      ? sharedProductionCtx.target - sharedProductionCtx.produced
      : targets.target75 - totalScheduled;

    const candidateBlocks: { block: BlockTypeInput; priority: number }[] = [];

    if (opIndex === 0) {
      if (hpBlocks.length > 0 && sharedGap >= (hpBlocks[0].minimumAmount || 800)) {
        hpBlocks.forEach(b => candidateBlocks.push({ block: b, priority: 3 }));
      }
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 2 });
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 1 });
      }
    } else if (opIndex === 1) {
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 3 });
      }
      if (hpBlocks.length > 0 && sharedGap >= (hpBlocks[0].minimumAmount || 800)) {
        hpBlocks.forEach(b => candidateBlocks.push({ block: b, priority: 2 }));
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 1 });
      }
    } else {
      if (npBlock && sharedGap >= (npBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: npBlock, priority: 3 });
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 2 });
      }
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 1 });
      }
    }

    if (candidateBlocks.length === 0 && mpBlock) {
      candidateBlocks.push({ block: mpBlock, priority: 0 });
    }
    if (candidateBlocks.length === 0 && erBlock) {
      candidateBlocks.push({ block: erBlock, priority: 0 });
    }
    if (candidateBlocks.length === 0) break;

    candidateBlocks.sort((a, b) => b.priority - a.priority || (b.block.minimumAmount || 0) - (a.block.minimumAmount || 0));
    const selected = candidateBlocks[0].block;

    const slotsNeeded = Math.ceil(selected.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;

    const targetRange = pickAvoiding(ranges) ?? ranges[0];
    const amount = selected.minimumAmount || mpMinPerBlock;
    const gapCat = categorize(selected);
    const gapRationale =
      gapCat === 'HP' ? 'cap filler — HP' :
      gapCat === 'MP' ? 'cap filler — MP' :
      gapCat === 'NP' ? 'cap filler — NP' :
      gapCat === 'ER' ? 'cap filler — ER' :
      'buffer / gap';
    placeBlockInSlots(slots, targetRange, selected, doc, makeLabel(selected, amount), gapRationale);
    recordProd(amount);
  }

  // Fill all remaining empty slots
  let fillSafety = 0;
  const fillBlocks = [mpBlock, erBlock, npBlock, nonProdBlock].filter(Boolean) as BlockTypeInput[];
  while (fillSafety < 30 && fillBlocks.length > 0) {
    fillSafety++;
    let filled = false;
    for (const bt of fillBlocks) {
      const slotsNeeded = Math.ceil(bt.durationMin / timeIncrement);
      const allRanges = findAvailableRanges(slots, ps, slotsNeeded);
      const staggeredRanges = staggerOffsetMin > 0
        ? rangesAfter(allRanges, slots, staggeredStartMin)
        : allRanges;
      const targetRanges = staggerOffsetMin > 0 ? staggeredRanges : allRanges;
      if (targetRanges.length === 0) continue;
      if (wouldExceedVarietyCap(slots, ps, bt.id, slotsNeeded)) continue;
      const chosen = pickAvoiding(targetRanges) ?? targetRanges[0];
      const amount = bt.minimumAmount || 0;
      placeBlockInSlots(slots, chosen, bt, doc, makeLabel(bt, amount), 'buffer / gap');
      recordProd(amount);
      filled = true;
      break;
    }
    if (!filled) break;
  }

  // Production warning (only for single-op or after all ops processed)
  if (!sharedProductionCtx && totalScheduled < targets.target75) {
    warnings.push(`${doc.name}: scheduled $${totalScheduled} vs $${Math.round(targets.target75)} target (${Math.round(totalScheduled / targets.target75 * 100)}%)`);
  }
}

// ---------------------------------------------------------------------------
// Hygienist block placement — SRP morning, PM, then Recare fills rest
// ---------------------------------------------------------------------------

/**
 * Place blocks for a hygienist following dental scheduling best practices.
 *
 * @param slots - Master slots array (mutated)
 * @param ps - Provider+operatory slot group
 * @param hyg - Hygienist provider
 * @param hygIndex - Index of this hygienist
 * @param totalHygienists - Total number of hygienists
 * @param blocksByCategory - Pre-categorized block type map
 * @param rules - Schedule rules
 * @param timeIncrement - Slot increment in minutes
 * @param warnings - Warning messages array (mutated)
 */
export function placeHygienistBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  hygIndex: number,
  totalHygienists: number,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  // Assisted Hygiene mode uses a different block pattern
  if (hyg.assistedHygiene) {
    placeAssistedHygienistBlocks(slots, ps, hyg, hygIndex, blocksByCategory, rules, timeIncrement, warnings);
    return;
  }

  const srpBlock = getBlockForCategory('SRP', blocksByCategory, hyg);
  const pmBlock = getBlockForCategory('PM', blocksByCategory, hyg);
  const recareBlock = getBlockForCategory('RECARE', blocksByCategory, hyg);

  // SRP — First morning slot (stagger if multiple hygienists)
  if (srpBlock && rules.srpBlocksPerDay > 0) {
    const slotsNeeded = Math.ceil(srpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);

    const staggerOffset = hygIndex * 90;
    const startMin = toMinutes(hyg.workingStart) + staggerOffset;

    const staggeredRanges = rangesAfter(
      morningRanges(ranges, slots, hyg),
      slots,
      startMin
    );

    const targetRange = staggeredRanges[0] || morningRanges(ranges, slots, hyg)[0] || ranges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, srpBlock, hyg, makeLabel(srpBlock), 'SRP (perio program)');
    } else {
      warnings.push(`No room for SRP block for ${hyg.name}`);
    }
  }

  // PM (Perio Maintenance) — Morning or early afternoon
  if (pmBlock) {
    const slotsNeeded = Math.ceil(pmBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = morningRanges(ranges, slots, hyg);
    const earlyPM = rangesInWindow(ranges, slots, getLunchMidpoint(hyg), getLunchMidpoint(hyg) + 120);
    const targetRange = amRanges[0] || earlyPM[0] || ranges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, pmBlock, hyg, makeLabel(pmBlock), 'perio maint');
    }
  }

  // RECARE — Place 2-3 blocks initially, rest will be varied in fill function
  if (recareBlock) {
    const slotsNeeded = Math.ceil(recareBlock.durationMin / timeIncrement);
    let safety = 0;

    while (safety < 3) {
      safety++;
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;
      placeBlockInSlots(slots, ranges[0], recareBlock, hyg, makeLabel(recareBlock), 'recare (prophy)');
    }
  }
}

/**
 * Assisted Hygiene mode: hygienist rotates across 2-3 chairs with assistant support.
 * Shorter appointment slots (30-45 min), more patients per day.
 */
function placeAssistedHygienistBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  hygIndex: number,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  const assistedHygBlock = getBlockForCategory('ASSISTED_HYG', blocksByCategory, hyg)
    || { id: FALLBACK_IDS.ASSISTED_HYG, ...DEFAULT_BLOCKS.ASSISTED_HYG as Omit<BlockTypeInput, 'id'> };

  const srpBlock = getBlockForCategory('SRP', blocksByCategory, hyg);

  // SRP morning block (staggered)
  if (srpBlock && rules.srpBlocksPerDay > 0) {
    const slotsNeeded = Math.ceil(srpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const staggerOffset = hygIndex * 90;
    const startMin = toMinutes(hyg.workingStart) + staggerOffset;
    const staggeredRanges = rangesAfter(morningRanges(ranges, slots, hyg), slots, startMin);
    const targetRange = staggeredRanges[0] || morningRanges(ranges, slots, hyg)[0] || ranges[0];
    if (targetRange) {
      placeBlockInSlots(slots, targetRange, srpBlock, hyg, makeLabel(srpBlock), 'SRP (perio program)');
    } else {
      warnings.push(`No room for SRP block for ${hyg.name} (assisted hygiene mode)`);
    }
  }

  // Fill remaining slots with assisted hygiene blocks
  const slotsNeeded = Math.ceil(assistedHygBlock.durationMin / timeIncrement);
  let safety = 0;
  while (safety < 12) {
    safety++;
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;
    placeBlockInSlots(slots, ranges[0], assistedHygBlock, hyg, 'Assisted Hyg', 'assisted hyg rotation');
  }
}

// ---------------------------------------------------------------------------
// Fill remaining gaps — ensure every slot has a block
// ---------------------------------------------------------------------------

/**
 * Fill remaining empty doctor slots across all operatories.
 * Respects per-column stagger windows and shared production pools.
 */
export function fillRemainingDoctorSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  doctors: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  columnStaggerMap?: Map<string, number>,
  sharedDoctorCtxMap?: Map<string, { target: number; produced: number }>,
  rng: () => number = Math.random
): void {
  for (const doc of doctors) {
    const opSlotsList = getProviderOpSlots(psMap, doc.id);
    const sharedCtx = sharedDoctorCtxMap?.get(doc.id);
    for (const ps of opSlotsList) {
      const staggerMin = columnStaggerMap?.get(`${doc.id}::${ps.operatory}`) ?? 0;
      // Compute D-phase minutes from all OTHER operatories for this doctor
      // so the fill step preserves the cross-column A-D zigzag.
      const avoidDMinutes = new Set<number>();
      for (const other of opSlotsList) {
        if (other.operatory === ps.operatory) continue;
        for (const m of getDPhaseMinutes(slots, other)) avoidDMinutes.add(m);
      }
      fillDocOpSlots(slots, ps, doc, blocksByCategory, timeIncrement, staggerMin, sharedCtx, avoidDMinutes, rng);
    }
  }
}

/**
 * Fill empty slots for a single doctor+operatory with a weighted random distribution.
 */
function fillDocOpSlots(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  doc: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  staggerOffsetMin: number = 0,
  sharedProductionCtx?: { target: number; produced: number },
  avoidDPhaseMinutes?: Set<number>,
  rng: () => number = Math.random
): void {
  const hpBlocks = getAllBlocksForCategory('HP', blocksByCategory, doc);
  const mpBlocks = getAllBlocksForCategory('MP', blocksByCategory, doc);
  const npBlocks = getAllBlocksForCategory('NP', blocksByCategory, doc);
  const erBlocks = getAllBlocksForCategory('ER', blocksByCategory, doc);

  const blockPool: { block: BlockTypeInput; weight: number }[] = [];
  hpBlocks.forEach(b => blockPool.push({ block: b, weight: 30 }));
  mpBlocks.forEach(b => blockPool.push({ block: b, weight: 30 }));
  erBlocks.forEach(b => blockPool.push({ block: b, weight: 20 }));
  npBlocks.forEach(b => blockPool.push({ block: b, weight: 20 }));

  if (blockPool.length === 0) return;

  const staggeredFillStart = toMinutes(doc.workingStart) + staggerOffsetMin;

  let safety = 0;
  let consecutiveSkips = 0;
  while (safety < 120) {
    safety++;

    const totalWeight = blockPool.reduce((sum, item) => sum + item.weight, 0);
    let random = rng() * totalWeight;
    let selectedBlock = blockPool[0].block;

    for (const item of blockPool) {
      random -= item.weight;
      if (random <= 0) {
        selectedBlock = item.block;
        break;
      }
    }

    const slotsNeeded = Math.ceil(selectedBlock.durationMin / timeIncrement);

    if (wouldExceedVarietyCap(slots, ps, selectedBlock.id, slotsNeeded)) {
      consecutiveSkips++;
      if (consecutiveSkips > blockPool.length * 3) break;
      continue;
    }
    consecutiveSkips = 0;

    const allRanges = findAvailableRanges(slots, ps, slotsNeeded);
    const ranges = staggerOffsetMin > 0
      ? rangesAfter(allRanges, slots, staggeredFillStart)
      : allRanges;
    if (ranges.length === 0) break;

    const cat = categorize(selectedBlock);
    let targetRange = ranges[0];
    if (cat === 'HP') {
      const amRanges = morningRanges(ranges, slots, doc);
      targetRange = amRanges[0] || ranges[0];
    } else if (cat === 'MP' || cat === 'ER') {
      const pmRanges = afternoonRanges(ranges, slots, doc);
      targetRange = pmRanges[0] || ranges[0];
    }

    // Prefer ranges that don't collide with the other column's D-phase.
    const sameCatFiltered = (() => {
      if (cat === 'HP') return morningRanges(ranges, slots, doc);
      if (cat === 'MP' || cat === 'ER') return afternoonRanges(ranges, slots, doc);
      return ranges;
    })();
    const avoidFiltered = rangesAvoidingDMinutes(
      sameCatFiltered.length > 0 ? sameCatFiltered : ranges,
      slots,
      avoidDPhaseMinutes
    );
    if (avoidFiltered.length > 0) targetRange = avoidFiltered[0];

    const fillRationale =
      cat === 'HP' ? 'cap filler — HP' :
      cat === 'MP' ? 'cap filler — MP' :
      cat === 'NP' ? 'cap filler — NP' :
      cat === 'ER' ? 'cap filler — ER' :
      'buffer / gap';
    placeBlockInSlots(slots, targetRange, selectedBlock, doc, makeLabel(selectedBlock), fillRationale);
    if (sharedProductionCtx) sharedProductionCtx.produced += selectedBlock.minimumAmount ?? 0;
  }
}

/**
 * Fill remaining empty hygienist slots across all operatories.
 */
export function fillRemainingHygienistSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  hygienists: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  rng: () => number = Math.random
): void {
  for (const hyg of hygienists) {
    const opSlotsList = getProviderOpSlots(psMap, hyg.id);
    for (const ps of opSlotsList) {
      fillHygOpSlots(slots, ps, hyg, blocksByCategory, timeIncrement, rng);
    }
  }
}

/**
 * Fill empty slots for a single hygienist+operatory.
 */
function fillHygOpSlots(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  rng: () => number = Math.random
): void {
  // Assisted hygiene mode
  if (hyg.assistedHygiene) {
    const assistedHygBlock = getBlockForCategory('ASSISTED_HYG', blocksByCategory, hyg)
      || { id: FALLBACK_IDS.ASSISTED_HYG, ...DEFAULT_BLOCKS.ASSISTED_HYG as Omit<BlockTypeInput, 'id'> };
    const slotsNeeded = Math.ceil(assistedHygBlock.durationMin / timeIncrement);
    let safety = 0;
    while (safety < 20) {
      safety++;
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;
      placeBlockInSlots(slots, ranges[0], assistedHygBlock, hyg, 'Assisted Hyg', 'assisted hyg rotation');
    }
    return;
  }

  // Standard hygiene fill
  const recareBlocks = getAllBlocksForCategory('RECARE', blocksByCategory, hyg);
  const pmBlocks = getAllBlocksForCategory('PM', blocksByCategory, hyg);
  const srpBlocks = getAllBlocksForCategory('SRP', blocksByCategory, hyg);
  const npBlocks = getAllBlocksForCategory('NP', blocksByCategory, hyg);

  const blockPool: { block: BlockTypeInput; weight: number }[] = [];
  recareBlocks.forEach(b => blockPool.push({ block: b, weight: 40 }));
  pmBlocks.forEach(b => blockPool.push({ block: b, weight: 25 }));
  npBlocks.forEach(b => blockPool.push({ block: b, weight: 25 }));
  srpBlocks.forEach(b => blockPool.push({ block: b, weight: 10 }));

  if (blockPool.length === 0) {
    const recareBlock = getBlockForCategory('RECARE', blocksByCategory, hyg);
    if (recareBlock) blockPool.push({ block: recareBlock, weight: 100 });
  }

  if (blockPool.length === 0) return;

  let safety = 0;
  let consecutiveSkips = 0;
  while (safety < 120) {
    safety++;

    const totalWeight = blockPool.reduce((sum, item) => sum + item.weight, 0);
    let random = rng() * totalWeight;
    let selectedBlock = blockPool[0].block;

    for (const item of blockPool) {
      random -= item.weight;
      if (random <= 0) {
        selectedBlock = item.block;
        break;
      }
    }

    const slotsNeeded = Math.ceil(selectedBlock.durationMin / timeIncrement);

    if (wouldExceedVarietyCap(slots, ps, selectedBlock.id, slotsNeeded)) {
      consecutiveSkips++;
      if (consecutiveSkips > blockPool.length * 3) break;
      continue;
    }
    consecutiveSkips = 0;

    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;

    const hygCat = categorize(selectedBlock);
    const hygRationale =
      hygCat === 'SRP' ? 'SRP (perio program)' :
      hygCat === 'PM' ? 'perio maint' :
      hygCat === 'NP' ? 'new pt hyg' :
      hygCat === 'RECARE' ? 'recare (prophy)' :
      'cap filler — recare';
    placeBlockInSlots(slots, ranges[0], selectedBlock, hyg, makeLabel(selectedBlock), hygRationale);
  }
}

// ---------------------------------------------------------------------------
// Doctor Matrixing — D/A codes and hygiene exam markers
// ---------------------------------------------------------------------------

/**
 * Add doctor matrixing (D/A codes) to hygienist blocks.
 * For each hygienist block, marks a slot ~60% through as 'D' (doctor exam).
 * Excludes SRP blocks (standalone hygienist procedures without doctor exam).
 *
 * @param slots - Master slots array (mutated)
 * @param psMap - Provider slot map
 * @param doctors - Doctor providers
 * @param hygienists - Hygienist providers
 */
export function addDoctorMatrixing(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  doctors: ProviderInput[],
  hygienists: ProviderInput[]
): void {
  if (doctors.length === 0 || hygienists.length === 0) return;

  for (const hyg of hygienists) {
    const opSlotsList = getProviderOpSlots(psMap, hyg.id);
    for (const ps of opSlotsList) {
      const hygSlots = ps.indices;

      // Find the start of each block
      const blockStarts: number[] = [];
      for (let i = 0; i < hygSlots.length; i++) {
        const idx = hygSlots[i];
        const slot = slots[idx];
        if (slot.blockTypeId && !slot.isBreak) {
          if (i === 0 || slots[hygSlots[i - 1]].blockTypeId !== slot.blockTypeId || slots[hygSlots[i - 1]].isBreak) {
            blockStarts.push(i);
          }
        }
      }

      // For each block, ~60% through, mark for doctor exam
      for (const startPos of blockStarts) {
        const blockTypeId = slots[hygSlots[startPos]].blockTypeId;
        const blockLabel = slots[hygSlots[startPos]].blockLabel || '';

        // Skip SRP blocks
        if (blockLabel.toUpperCase().includes('SRP') || blockLabel.toUpperCase().includes('PERIO SRP')) {
          continue;
        }

        let endPos = startPos;
        while (endPos < hygSlots.length && slots[hygSlots[endPos]].blockTypeId === blockTypeId) {
          endPos++;
        }
        const blockLen = endPos - startPos;
        if (blockLen < 3) continue;

        const examPos = startPos + Math.floor(blockLen * 0.6);
        if (examPos < hygSlots.length) {
          slots[hygSlots[examPos]].staffingCode = 'D';
        }
      }
    }
  }
}
