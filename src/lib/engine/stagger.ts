/**
 * Stagger Engine — Conflict Detection & Suggestion
 *
 * Detects when a provider is double-booked across operatories at the same time
 * slot and suggests stagger moves to eliminate the conflicts.
 */

import type { GenerationResult, ProviderInput, TimeSlotOutput } from './types';

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
