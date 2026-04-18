/**
 * Stagger Resolver — Multi-Column Conflict Auto-Resolution
 *
 * When a doctor works 2+ operatories, the A-D zigzag pattern must be enforced:
 *   - A-phase first (assistant preps, 2-3 slots), then D-phase (doctor hands-on, 3-4 slots)
 *   - Stagger offset: 20-30 min between columns (configurable via provider.staggerMinutes)
 *   - When Col A enters D-phase, Col B starts new A-phase
 *   - Maximum 1 slot of D-overlap during transition
 *
 * This module AUTO-APPLIES fixes to the generated schedule, not just suggests them.
 * It works as a post-processing pass after block placement.
 *
 * @module stagger-resolver
 */

import type { TimeSlotOutput, ProviderInput, GenerationResult } from './types';
import type { ConflictResult } from './stagger';
import { detectConflicts, inferTimeIncrement } from './stagger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of auto-applying stagger fixes to a schedule */
export interface StaggerApplicationResult {
  /** The modified slots array (same reference, mutated in place) */
  modifiedSlots: TimeSlotOutput[];
  /** Record of each move applied */
  appliedMoves: Array<{
    fromTime: string;
    toTime: string;
    providerId: string;
    operatory: string;
    reason: string;
  }>;
  /** Any conflicts that could not be resolved */
  remainingConflicts: ConflictResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Auto-resolve stagger conflicts
// ---------------------------------------------------------------------------

/**
 * Automatically resolve D-time conflicts in a multi-column doctor schedule.
 *
 * For each detected conflict (provider scheduled in 2+ operatories at the same time),
 * the resolver attempts to swap the conflicting slot's block content with an adjacent
 * empty or A-time slot in the same operatory, effectively shifting the block forward
 * or backward by 1-2 time increments.
 *
 * The resolver makes up to 3 passes to handle cascading conflicts (moving one block
 * may resolve or create other conflicts).
 *
 * @param schedule - The generated schedule to fix (slots are mutated in place)
 * @param providers - All providers in the schedule
 * @returns StaggerApplicationResult with applied moves and remaining conflicts
 */
export function autoResolveStaggerConflicts(
  schedule: GenerationResult,
  providers: ProviderInput[]
): StaggerApplicationResult {
  const appliedMoves: StaggerApplicationResult['appliedMoves'] = [];
  const maxPasses = 3;
  let currentConflicts: ConflictResult[] = [];

  for (let pass = 0; pass < maxPasses; pass++) {
    currentConflicts = detectConflicts(schedule, providers);
    if (currentConflicts.length === 0) break;

    const increment = inferTimeIncrement(schedule);
    let anyResolved = false;

    for (const conflict of currentConflicts) {
      // Keep the first operatory in place; try to move the secondary ones
      const [primaryOp, ...secondaryOps] = conflict.operatories;

      for (const operatory of secondaryOps) {
        const resolved = tryResolveConflict(
          schedule.slots,
          conflict.providerId,
          operatory,
          conflict.time,
          increment,
          providers,
          appliedMoves
        );
        if (resolved) anyResolved = true;
      }
    }

    // If no conflicts were resolved this pass, further passes won't help
    if (!anyResolved) break;
  }

  // Final conflict check
  const remainingConflicts = detectConflicts(schedule, providers);

  return {
    modifiedSlots: schedule.slots,
    appliedMoves,
    remainingConflicts,
  };
}

/**
 * Try to resolve a single conflict by swapping the block at the conflict time
 * with an adjacent slot in the same provider+operatory.
 *
 * Shift candidates (in order of preference):
 *   1. Forward by 1 increment
 *   2. Forward by 2 increments
 *   3. Backward by 1 increment
 *   4. Backward by 2 increments
 *
 * A swap is valid only if:
 *   - The target slot exists and belongs to the same provider+operatory
 *   - The target slot is empty (no block) or is an A-time slot
 *   - Moving to the target time won't create a new conflict
 *
 * @returns true if the conflict was resolved
 */
function tryResolveConflict(
  slots: TimeSlotOutput[],
  providerId: string,
  operatory: string,
  conflictTime: string,
  increment: number,
  providers: ProviderInput[],
  appliedMoves: StaggerApplicationResult['appliedMoves']
): boolean {
  const conflictMinutes = timeToMinutes(conflictTime);

  // Find the conflict slot
  const conflictSlotIdx = slots.findIndex(
    s => s.time === conflictTime &&
      s.providerId === providerId &&
      s.operatory === operatory &&
      !s.isBreak
  );
  if (conflictSlotIdx === -1) return false;

  const conflictSlot = slots[conflictSlotIdx];
  if (!conflictSlot.blockTypeId) return false;

  // Build a set of times where this provider already has D-time in other operatories
  const providerDTimeSet = new Set<string>();
  for (const s of slots) {
    if (s.providerId === providerId &&
      s.operatory !== operatory &&
      s.staffingCode === 'D' &&
      s.blockTypeId !== null &&
      !s.isBreak) {
      providerDTimeSet.add(s.time);
    }
  }

  // Try shifting forward, then backward
  const shiftCandidates = [1, 2, -1, -2];

  for (const numShifts of shiftCandidates) {
    const newMinutes = conflictMinutes + increment * numShifts;
    const newTime = minutesToTime(newMinutes);

    // Find the target slot in the same provider+operatory
    const targetSlotIdx = slots.findIndex(
      s => s.time === newTime &&
        s.providerId === providerId &&
        s.operatory === operatory
    );
    if (targetSlotIdx === -1) continue;

    const targetSlot = slots[targetSlotIdx];

    // Target must be empty or a break (we won't swap into an occupied slot)
    if (targetSlot.blockTypeId !== null && !targetSlot.isBreak) continue;
    if (targetSlot.isBreak) continue;

    // Check that the new time doesn't conflict with D-time in other operatories
    if (providerDTimeSet.has(newTime)) continue;

    // Perform the swap: move block content from conflict slot to target slot
    targetSlot.blockTypeId = conflictSlot.blockTypeId;
    targetSlot.blockLabel = conflictSlot.blockLabel;
    targetSlot.staffingCode = conflictSlot.staffingCode;
    targetSlot.blockInstanceId = conflictSlot.blockInstanceId;
    targetSlot.customProductionAmount = conflictSlot.customProductionAmount;

    // Clear the conflict slot
    conflictSlot.blockTypeId = null;
    conflictSlot.blockLabel = null;
    conflictSlot.staffingCode = null;
    conflictSlot.blockInstanceId = null;
    conflictSlot.customProductionAmount = null;

    appliedMoves.push({
      fromTime: conflictTime,
      toTime: newTime,
      providerId,
      operatory,
      reason: `D-time conflict at ${conflictTime} — shifted ${numShifts > 0 ? 'forward' : 'backward'} by ${Math.abs(numShifts)} slot(s)`,
    });

    return true;
  }

  return false;
}

/**
 * Count the number of D-time overlaps remaining in a schedule.
 * A D-time overlap is when a provider has staffingCode='D' in 2+ operatories
 * at the same time.
 *
 * @param slots - The schedule slots to check
 * @param providers - All providers
 * @returns Number of time slots with D-time overlap
 */
export function countDTimeOverlaps(slots: TimeSlotOutput[], providers: ProviderInput[]): number {
  const doctorIds = new Set(providers.filter(p => p.role === 'DOCTOR').map(p => p.id));
  let overlaps = 0;

  // Group D-time slots by provider+time
  const dTimeByProviderTime = new Map<string, Set<string>>();
  for (const slot of slots) {
    if (!doctorIds.has(slot.providerId)) continue;
    if (slot.staffingCode !== 'D' || slot.isBreak || !slot.blockTypeId) continue;

    const key = `${slot.providerId}:${slot.time}`;
    const ops = dTimeByProviderTime.get(key) ?? new Set<string>();
    ops.add(slot.operatory);
    dTimeByProviderTime.set(key, ops);
  }

  for (const ops of dTimeByProviderTime.values()) {
    if (ops.size > 1) overlaps++;
  }

  return overlaps;
}
