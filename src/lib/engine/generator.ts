/**
 * Schedule Generator — Orchestrator
 *
 * This is the main entry point for schedule generation. It coordinates:
 *   1. Time slot creation for each provider+operatory
 *   2. Rock-Sand-Water block placement (doctors, then hygienists)
 *   3. Gap filling (ensure every slot has a block)
 *   4. Doctor matrixing (D/A codes for hygiene exam overlay)
 *   5. Production summary calculation
 *
 * The actual placement logic lives in:
 *   - rock-sand-water.ts — block placement strategy
 *   - stagger-resolver.ts — multi-column conflict auto-resolution
 *   - production-calculator.ts — 75% rule, per-op targets
 *   - block-categories.ts — block type classification
 *   - slot-helpers.ts — slot manipulation utilities
 *
 * @module generator
 */

import type {
  GenerationInput,
  GenerationResult,
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
} from './types';
import { calculateTarget75 } from './calculator';
import { calculateStaggerOffset, DEFAULT_COLUMN_STAGGER_MIN, snapRotationTime } from './stagger';

// Re-export snapRotationTime so callers can import it from generator if needed
export { snapRotationTime };

// Re-export from block-categories (backward compat)
export { categorizeLabel, type BlockCategory } from './block-categories';
import { categorize } from './block-categories';

// Re-export from slot-helpers (backward compat)
export {
  MAX_SAME_TYPE_FRACTION,
  findAvailableRanges,
  placeBlockInSlots,
  countSlotsByBlockType,
  countOccupiedSlots,
  wouldExceedVarietyCap,
  getStaffingCode,
  parseAmountFromLabel,
} from './slot-helpers';
import {
  toMinutes,
  buildProviderSlotMap,
  getProviderOpSlots,
  getStaffingCode,
  getDPhaseMinutes,
} from './slot-helpers';

// Re-export from rock-sand-water (backward compat)
export { isMixValid, calculateCategoryTargets } from './rock-sand-water';
import {
  isMixValid,
  placeDoctorBlocksByMix,
  placeDoctorBlocks,
  placeHygienistBlocks,
  fillRemainingDoctorSlots,
  fillRemainingHygienistSlots,
  addDoctorMatrixing,
} from './rock-sand-water';

// Re-export from production-calculator (backward compat)
import {
  recomputeSharedCtxFromSlots,
  calculateAllProductionSummaries,
} from './production-calculator';

// ---------------------------------------------------------------------------
// Time slot generation
// ---------------------------------------------------------------------------

/**
 * Generate time slots from start to end in specified increments (24h format: "07:00").
 *
 * @param start - Start time in "HH:MM" format
 * @param end - End time in "HH:MM" format
 * @param increment - Time increment in minutes (e.g., 10 or 15)
 * @returns Array of time strings
 */
export function generateTimeSlots(start: string, end: string, increment: number): string[] {
  const slots: string[] = [];

  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    currentMinutes += increment;
  }

  return slots;
}

/**
 * Check if a time falls within lunch break.
 *
 * @param time - Time to check in "HH:MM"
 * @param lunchStart - Lunch start time in "HH:MM"
 * @param lunchEnd - Lunch end time in "HH:MM"
 * @returns true if time is during lunch
 */
export function isLunchTime(time: string, lunchStart?: string, lunchEnd?: string): boolean {
  if (!lunchStart || !lunchEnd) return false;

  const timeMinutes = toMinutes(time);
  const lunchStartMinutes = toMinutes(lunchStart);
  const lunchEndMinutes = toMinutes(lunchEnd);

  return timeMinutes >= lunchStartMinutes && timeMinutes < lunchEndMinutes;
}

// ---------------------------------------------------------------------------
// Provider day-hours resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the effective working hours for a provider on a specific day.
 * Returns null if the provider is disabled (off) for that day.
 * Falls back to general working hours if no per-day override exists.
 *
 * @param provider - The provider to resolve hours for
 * @param dayOfWeek - Day of week string (e.g., "MONDAY")
 * @returns Effective hours or null if provider is off
 */
export function resolveProviderDayHours(
  provider: ProviderInput,
  dayOfWeek: string
): { workingStart: string; workingEnd: string; lunchStart?: string; lunchEnd?: string; lunchEnabled: boolean } | null {
  const dayEntry = provider.providerSchedule?.[dayOfWeek];
  if (dayEntry !== undefined) {
    if (dayEntry.enabled === false) return null;
    return {
      workingStart: dayEntry.workingStart || provider.workingStart,
      workingEnd: dayEntry.workingEnd || provider.workingEnd,
      lunchStart: dayEntry.lunchStart ?? provider.lunchStart,
      lunchEnd: dayEntry.lunchEnd ?? provider.lunchEnd,
      lunchEnabled: !!(dayEntry.lunchStart && dayEntry.lunchEnd),
    };
  }
  return {
    workingStart: provider.workingStart,
    workingEnd: provider.workingEnd,
    lunchStart: provider.lunchStart,
    lunchEnd: provider.lunchEnd,
    lunchEnabled: provider.lunchEnabled !== false,
  };
}

// ---------------------------------------------------------------------------
// Main schedule generation — Orchestrator
// ---------------------------------------------------------------------------

/**
 * Generate a complete daily schedule for all providers.
 *
 * This is the public API. The function signature is a contract — do not change it.
 *
 * Steps:
 *   1. Create empty time slots for every provider x operatory
 *   2. Place doctor blocks (Rock-Sand-Water or procedure mix)
 *   3. Place hygienist blocks
 *   4. Fill any remaining gaps
 *   5. Apply doctor matrixing (D/A codes)
 *   6. Calculate production summary
 *
 * @param input - GenerationInput with providers, blockTypes, rules, timeIncrement, dayOfWeek
 * @returns GenerationResult with slots, productionSummary, and warnings
 */
export function generateSchedule(input: GenerationInput & { activeWeek?: string }): GenerationResult {
  const { providers, blockTypes, rules, timeIncrement, dayOfWeek, activeWeek } = input;
  const warnings: string[] = [];
  const slots: TimeSlotOutput[] = [];
  const activeProviders: ProviderInput[] = [];

  // ─── Step 1: Create empty time slots for every provider x operatory ───
  for (const provider of providers) {
    const dayHours = resolveProviderDayHours(provider, dayOfWeek);
    if (dayHours === null) continue;

    // Rotation week filtering
    if (activeWeek) {
      const dayEntry = provider.providerSchedule?.[dayOfWeek];
      if (dayEntry?.rotationWeeks && dayEntry.rotationWeeks.length > 0) {
        if (!dayEntry.rotationWeeks.includes(activeWeek)) continue;
      }
    }

    const effectiveProvider = dayHours.workingStart !== provider.workingStart || dayHours.workingEnd !== provider.workingEnd
      ? { ...provider, workingStart: dayHours.workingStart, workingEnd: dayHours.workingEnd, lunchStart: dayHours.lunchStart, lunchEnd: dayHours.lunchEnd, lunchEnabled: dayHours.lunchEnabled }
      : provider;

    const timeSlots = generateTimeSlots(effectiveProvider.workingStart, effectiveProvider.workingEnd, timeIncrement);

    const allOperatories = provider.operatories.length > 0 ? provider.operatories : ['OP1'];
    const operatories = (!rules.doubleBooking && provider.role === 'DOCTOR')
      ? [allOperatories[0]]
      : allOperatories;

    const lunchActive = effectiveProvider.lunchEnabled !== false;

    for (const operatory of operatories) {
      for (const time of timeSlots) {
        const isLunch = lunchActive
          ? isLunchTime(time, effectiveProvider.lunchStart, effectiveProvider.lunchEnd)
          : false;

        slots.push({
          time,
          providerId: provider.id,
          operatory,
          staffingCode: isLunch ? null : getStaffingCode(provider.role),
          blockTypeId: null,
          blockLabel: isLunch ? 'LUNCH' : null,
          isBreak: isLunch
        });
      }
    }
    activeProviders.push(effectiveProvider);
  }

  const psMap = buildProviderSlotMap(slots, activeProviders);

  const doctors = activeProviders.filter(p => p.role === 'DOCTOR');
  const hygienists = activeProviders.filter(p => p.role === 'HYGIENIST');

  // Group block types by category
  const blocksByCategory = new Map<string, BlockTypeInput[]>();
  for (const bt of blockTypes) {
    const cat = categorize(bt);
    if (!blocksByCategory.has(cat)) blocksByCategory.set(cat, []);
    blocksByCategory.get(cat)!.push(bt);
  }

  // ─── Step 2: Place DOCTOR blocks (with multi-column staggering) ───
  const STAGGER_INTERVAL_MIN = 20;
  const doctorColumnStagger = new Map<string, number>();
  const sharedDoctorCtxMap = new Map<string, { target: number; produced: number }>();

  for (let di = 0; di < doctors.length; di++) {
    const doc = doctors[di];
    const baseStaggerMin = doc.staggerOffsetMin ?? (di * STAGGER_INTERVAL_MIN);
    const columnStaggerInterval = doc.columnStaggerIntervalMin ?? DEFAULT_COLUMN_STAGGER_MIN;
    const opSlots = getProviderOpSlots(psMap, doc.id);
    const isMultiColumn = opSlots.length > 1;
    const useMixPlacement = isMixValid(doc.futureProcedureMix);

    if (isMultiColumn) {
      const sharedTarget = calculateTarget75(doc.dailyGoal);
      const sharedProductionCtx = { target: sharedTarget, produced: 0 };
      sharedDoctorCtxMap.set(doc.id, sharedProductionCtx);
      const numOps = opSlots.length;
      // Accumulate D-phase minutes across operatories as we place them.
      // Each subsequent op's placement avoids putting D-phase at minutes
      // where an earlier op already has D-phase (A-D cross-column zigzag).
      const avoidDMinutes = new Set<number>();
      // Bug 2 fix: when a doctor works multiple operatories, every op must
      // receive a per-op MINIMUM placement budget so the Rock-Sand-Water
      // pipeline in placeDoctorBlocks runs through morning rocks, afternoon
      // sand, and gap-fill for every op. Previously perOpTarget was derived
      // solely from the REMAINING shared budget — if OP1 over-produced, OP2's
      // target collapsed to ~0 and isGoalMet() short-circuited the afternoon
      // placement, leaving OP2 with only a single forced HP (Iter 12a) and
      // whatever fillRemainingDoctorSlots tacked on later (often resulting
      // in an under-filled OP2 totalling ~$2,962 of a $5,000 goal).
      //
      // The floor is set to 60% of the per-op fair share — enough to drive
      // placeDoctorBlocks past the morning-rock stage and keep afternoon
      // placement active, while still allowing the shared-pool Iter 3
      // redistribution to prevent combined production from ballooning to 2x
      // when OP1 already covered the goal.
      const perOpFairShare = Math.ceil(sharedTarget / numOps);
      const perOpFloor = Math.ceil(perOpFairShare * 0.6);
      for (let oi = 0; oi < numOps; oi++) {
        const columnOffset = calculateStaggerOffset(di, oi, columnStaggerInterval);
        const totalStagger = baseStaggerMin + columnOffset;
        doctorColumnStagger.set(`${doc.id}::${opSlots[oi].operatory}`, totalStagger);
        // Per-op fairness (Iter 3 + Bug 2): use the LARGER of the remaining
        // shared budget share OR the per-op floor. This guarantees each op
        // runs through Rock-Sand-Water placement even when earlier ops
        // consumed the shared pool. The per-op context isolates isGoalMet()
        // inside placeDoctorBlocks so OP2's placement won't bail just because
        // OP1 already hit the combined target.
        const remainingOps = numOps - oi;
        const remainingTarget = Math.max(0, sharedTarget - sharedProductionCtx.produced);
        const remainingShare = Math.ceil(remainingTarget / remainingOps);
        const perOpTarget = Math.max(remainingShare, perOpFloor);
        const perOpCtx = { target: perOpTarget, produced: 0 };
        if (useMixPlacement) {
          placeDoctorBlocksByMix(slots, opSlots[oi], doc, blockTypes, timeIncrement, warnings, totalStagger, perOpCtx, avoidDMinutes);
        } else {
          placeDoctorBlocks(slots, opSlots[oi], doc, blocksByCategory, rules, timeIncrement, warnings, totalStagger, oi, perOpCtx, avoidDMinutes);
        }
        recomputeSharedCtxFromSlots(slots, doc.id, blockTypes, sharedProductionCtx);
        // Update the avoid set with this op's newly-placed D-phase minutes
        // so later ops route around them.
        for (const m of getDPhaseMinutes(slots, opSlots[oi])) avoidDMinutes.add(m);
      }
    } else {
      for (const ps of opSlots) {
        doctorColumnStagger.set(`${doc.id}::${ps.operatory}`, baseStaggerMin);
        if (useMixPlacement) {
          placeDoctorBlocksByMix(slots, ps, doc, blockTypes, timeIncrement, warnings, baseStaggerMin);
        } else {
          placeDoctorBlocks(slots, ps, doc, blocksByCategory, rules, timeIncrement, warnings, baseStaggerMin);
        }
      }
    }
  }

  // ─── Step 3: Place HYGIENIST blocks ───
  for (let i = 0; i < hygienists.length; i++) {
    const opSlots = getProviderOpSlots(psMap, hygienists[i].id);
    for (const ps of opSlots) {
      placeHygienistBlocks(slots, ps, hygienists[i], i, hygienists.length, blocksByCategory, rules, timeIncrement, warnings);
    }
  }

  // ─── Step 4: Fill ANY remaining gaps ───
  fillRemainingDoctorSlots(slots, psMap, doctors, blocksByCategory, timeIncrement, doctorColumnStagger, sharedDoctorCtxMap);
  fillRemainingHygienistSlots(slots, psMap, hygienists, blocksByCategory, timeIncrement);

  // ─── Step 5: Doctor matrixing — D/A codes ───
  if (rules.matrixing) {
    addDoctorMatrixing(slots, psMap, doctors, hygienists);
  }

  // ─── Step 6: Calculate production summary ───
  const productionSummary = calculateAllProductionSummaries(slots, activeProviders, blockTypes);

  return {
    dayOfWeek,
    slots,
    productionSummary,
    warnings
  };
}
