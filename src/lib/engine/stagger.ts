/**
 * Stagger Engine — Conflict Detection & Suggestion
 *
 * Detects when a provider is double-booked across operatories at the same time
 * slot and suggests stagger moves to eliminate the conflicts.
 *
 * Also exports calculateStaggerOffset for use by the schedule generator when
 * producing staggered multi-column schedules.
 */

import type { GenerationResult, ProviderInput, TimeSlotOutput } from './types';

// ---------------------------------------------------------------------------
// calculateStaggerOffset — per-column offset calculation
// ---------------------------------------------------------------------------

/**
 * Default number of minutes to offset each successive column's schedule.
 * Column 0 = T+0, Column 1 = T+20, Column 2 = T+40, etc.
 */
export const DEFAULT_COLUMN_STAGGER_MIN = 20;

// ---------------------------------------------------------------------------
// snapRotationTime — increment alignment for rotation events (§5.5)
// ---------------------------------------------------------------------------

/**
 * Snap a rotation time (minutes since midnight) to the nearest valid boundary
 * for the given office time increment.
 *
 * Examples with increment=10: 07:00, 07:10, 07:20, …
 * Examples with increment=15: 07:00, 07:15, 07:30, 07:45, …
 *
 * Doctor rotation events (when the doctor moves from Op1 to Op2) must land on
 * an increment boundary so they align with slot start times in the grid.
 *
 * @param minutes - Raw rotation time in minutes since midnight
 * @param increment - Office time increment (10 or 15)
 * @param direction - 'round' (nearest, default), 'floor' (previous boundary),
 *                    or 'ceil' (next boundary)
 * @returns Snapped minutes value (multiple of `increment`)
 *
 * @example
 *   snapRotationTime(7 * 60 + 5, 10)         // → 420  (07:00 → rounds to 07:00 or 07:10 = 07:10 since 5 rounds down? no, 5/10=0.5 rounds up)
 *   snapRotationTime(7 * 60 + 12, 10)        // → 430  (07:12 → 07:10)
 *   snapRotationTime(7 * 60 + 8, 15)         // → 420  (07:08 → 07:00)
 *   snapRotationTime(7 * 60 + 9, 15)         // → 435  (07:09 → 07:15)
 */
export function snapRotationTime(
  minutes: number,
  increment: number,
  direction: 'round' | 'floor' | 'ceil' = 'round'
): number {
  if (increment <= 0) return minutes;
  switch (direction) {
    case 'floor': return Math.floor(minutes / increment) * increment;
    case 'ceil':  return Math.ceil(minutes / increment) * increment;
    default:      return Math.round(minutes / increment) * increment;
  }
}

/**
 * Check that a rotation time (minutes) aligns with the given increment.
 * Returns true if `minutes` is an exact multiple of `increment`.
 */
export function isAlignedToIncrement(minutes: number, increment: number): boolean {
  if (increment <= 0) return true;
  return minutes % increment === 0;
}

/**
 * Convert minutes since midnight to a "HH:MM" time string.
 * Re-exported from stagger.ts so callers don't need to import from multiple modules.
 */
export function minutesToTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculate the stagger offset (in minutes) for a specific column of a provider.
 *
 * The offset ensures that when a provider works multiple operatories simultaneously
 * (multi-column), each column's appointment blocks start at a different time so
 * the provider is never double-booked at the same moment.
 *
 * @param providerIndex - Zero-based index of the provider among all providers of the same role.
 *                        Accepted for API completeness; the column offset is independent of
 *                        provider index (provider-level stagger is handled separately in the
 *                        generator).
 * @param columnIndex   - Zero-based index of the operatory/column within this provider's columns.
 *                        Column 0 gets offset 0, column 1 gets 1×intervalMin, etc.
 * @param intervalMin   - Minutes to offset per column step. Defaults to DEFAULT_COLUMN_STAGGER_MIN (20).
 * @returns             - Offset in minutes (≥ 0). Returns 0 for any negative inputs.
 *
 * @example
 *   calculateStaggerOffset(0, 0, 20) // → 0   (first column, no offset)
 *   calculateStaggerOffset(0, 1, 20) // → 20  (second column, +20 min)
 *   calculateStaggerOffset(0, 2, 20) // → 40  (third column, +40 min)
 *   calculateStaggerOffset(1, 0, 20) // → 0   (second provider, first column → column offset is 0)
 *   calculateStaggerOffset(1, 1, 20) // → 20  (second provider, second column → +20 min)
 */
export function calculateStaggerOffset(
  providerIndex: number,
  columnIndex: number,
  intervalMin: number = DEFAULT_COLUMN_STAGGER_MIN,
): number {
  // Guard against negative indices or invalid intervals
  if (columnIndex <= 0 || intervalMin <= 0) return 0;
  return columnIndex * intervalMin;
}

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** A detected double-booking conflict for a single provider at a single time */
export interface ConflictResult {
  /** The time slot (24h "HH:MM") where the conflict occurs */
  time: string;
  /** The provider who is double-booked */
  providerId: string;
  /** All operatories the provider is scheduled in at this time */
  operatories: string[];
  /** The block labels present in each conflicting slot */
  blockLabels: string[];
}

/** A suggested stagger move that would eliminate a conflict */
export interface StaggerSuggestion {
  /** The time where the conflict currently occurs */
  conflictTime: string;
  /** The provider who is double-booked */
  providerId: string;
  /** The operatory whose block should be moved */
  operatory: string;
  /** The block label currently at the conflict slot */
  currentBlockLabel: string | null;
  /** The blockTypeId currently at the conflict slot */
  currentBlockTypeId: string | null;
  /** The recommended new start time (shift forward or backward) */
  suggestedTime: string;
  /** Positive = shifted forward, negative = shifted backward (in # of increments) */
  timesShifted: number;
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

/**
 * Infer the time increment (in minutes) from the schedule's slot times.
 * Falls back to 10 if the schedule has fewer than 2 time points.
 */
export function inferTimeIncrement(schedule: GenerationResult): number {
  const uniqueTimes = [...new Set(schedule.slots.map(s => s.time))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b)
  );
  if (uniqueTimes.length < 2) return 10;
  return timeToMinutes(uniqueTimes[1]) - timeToMinutes(uniqueTimes[0]);
}

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

/**
 * Detect conflicts where the same provider is scheduled in 2+ operatories at
 * the same time slot.
 *
 * Only non-break slots with an assigned block (blockTypeId !== null) are
 * considered; empty and lunch slots are ignored.
 *
 * @returns Array of ConflictResult, sorted by time ascending.
 */
export function detectConflicts(
  schedule: GenerationResult,
  // providers param is part of the public API for future extensibility
  // (e.g., filtering by provider type); not used by current logic
  _providers: ProviderInput[]
): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  // Group active (non-break, assigned) slots by time
  const slotsByTime = new Map<string, TimeSlotOutput[]>();
  for (const slot of schedule.slots) {
    if (slot.isBreak || slot.blockTypeId === null) continue;
    const list = slotsByTime.get(slot.time) ?? [];
    list.push(slot);
    slotsByTime.set(slot.time, list);
  }

  // For each time, look for providers in multiple operatories
  for (const [time, slots] of slotsByTime) {
    // Group by providerId
    const byProvider = new Map<string, TimeSlotOutput[]>();
    for (const slot of slots) {
      const list = byProvider.get(slot.providerId) ?? [];
      list.push(slot);
      byProvider.set(slot.providerId, list);
    }

    for (const [providerId, provSlots] of byProvider) {
      const uniqueOperatories = [...new Set(provSlots.map(s => s.operatory))];
      if (uniqueOperatories.length > 1) {
        conflicts.push({
          time,
          providerId,
          operatories: uniqueOperatories,
          blockLabels: provSlots.map(s => s.blockLabel ?? '').filter(Boolean),
        });
      }
    }
  }

  // Sort by time ascending for deterministic output
  conflicts.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return conflicts;
}

// ---------------------------------------------------------------------------
// suggestStagger
// ---------------------------------------------------------------------------

/**
 * For each conflict, suggest moving the block in the secondary operatory
 * forward (or backward) by 1–2 time increments so that the provider is no
 * longer double-booked at the original time.
 *
 * A suggestion is only emitted when:
 *  1. The target slot exists in the schedule.
 *  2. The target slot is currently empty for this provider+operatory.
 *  3. The provider is not already scheduled in ANOTHER operatory at the
 *     target time (which would create a new conflict).
 *
 * @returns Array of StaggerSuggestion (one per conflicting secondary operatory).
 */
export function suggestStagger(
  schedule: GenerationResult,
  providers: ProviderInput[]
): StaggerSuggestion[] {
  const conflicts = detectConflicts(schedule, providers);
  if (conflicts.length === 0) return [];

  const increment = inferTimeIncrement(schedule);

  // Build lookup sets for fast checks
  const allTimes = new Set(schedule.slots.map(s => s.time));

  // occupied[providerId:operatory:time] = true if there's a block there
  const occupied = new Set<string>();
  for (const slot of schedule.slots) {
    if (!slot.isBreak && slot.blockTypeId !== null) {
      occupied.add(`${slot.providerId}:${slot.operatory}:${slot.time}`);
    }
  }

  // providerAtTime[providerId:time] = set of operatories where they have blocks
  const providerAtTime = new Map<string, Set<string>>();
  for (const slot of schedule.slots) {
    if (!slot.isBreak && slot.blockTypeId !== null) {
      const key = `${slot.providerId}:${slot.time}`;
      const ops = providerAtTime.get(key) ?? new Set<string>();
      ops.add(slot.operatory);
      providerAtTime.set(key, ops);
    }
  }

  const suggestions: StaggerSuggestion[] = [];

  for (const conflict of conflicts) {
    // Keep the FIRST operatory in place; suggest moving the rest
    const [, ...secondaryOps] = conflict.operatories;

    for (const operatory of secondaryOps) {
      // Find the specific slot to move
      const conflictSlot = schedule.slots.find(
        s =>
          s.time === conflict.time &&
          s.providerId === conflict.providerId &&
          s.operatory === operatory &&
          !s.isBreak
      );
      if (!conflictSlot) continue;

      // Try shifting forward by 1 then 2 increments, then backward
      const shiftCandidates = [1, 2, -1, -2];
      let resolved = false;

      for (const numShifts of shiftCandidates) {
        const newMinutes = timeToMinutes(conflict.time) + increment * numShifts;
        const newTime = minutesToTime(newMinutes);

        if (!allTimes.has(newTime)) continue;

        // Target slot must be empty for this provider+operatory
        if (occupied.has(`${conflict.providerId}:${operatory}:${newTime}`)) continue;

        // At the new time, the provider must not be in another operatory
        // (that would create a new conflict)
        const opsAtNewTime = providerAtTime.get(`${conflict.providerId}:${newTime}`);
        if (opsAtNewTime && opsAtNewTime.size > 0) {
          // Provider already has blocks at newTime in other ops — skip
          continue;
        }

        suggestions.push({
          conflictTime: conflict.time,
          providerId: conflict.providerId,
          operatory,
          currentBlockLabel: conflictSlot.blockLabel,
          currentBlockTypeId: conflictSlot.blockTypeId,
          suggestedTime: newTime,
          timesShifted: numShifts,
        });
        resolved = true;
        break;
      }

      if (!resolved) {
        // No clean slot found — emit a suggestion with timesShifted=1 as best-effort
        const fallbackTime = minutesToTime(timeToMinutes(conflict.time) + increment);
        if (allTimes.has(fallbackTime)) {
          suggestions.push({
            conflictTime: conflict.time,
            providerId: conflict.providerId,
            operatory,
            currentBlockLabel: conflictSlot.blockLabel,
            currentBlockTypeId: conflictSlot.blockTypeId,
            suggestedTime: fallbackTime,
            timesShifted: 1,
          });
        }
      }
    }
  }

  return suggestions;
}
