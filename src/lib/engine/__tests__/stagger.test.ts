import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  suggestStagger,
  inferTimeIncrement,
  type ConflictResult,
  type StaggerSuggestion,
} from '../stagger';
import type { GenerationResult, ProviderInput, TimeSlotOutput } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides?: Partial<ProviderInput>): ProviderInput {
  return {
    id: 'dr1',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    operatories: ['OP1', 'OP2'],
    workingStart: '08:00',
    workingEnd: '09:00',
    dailyGoal: 5000,
    color: '#fff',
    ...overrides,
  };
}

function makeSlot(overrides: Partial<TimeSlotOutput> & { time: string }): TimeSlotOutput {
  return {
    time: overrides.time,
    providerId: 'dr1',
    operatory: 'OP1',
    staffingCode: 'D',
    blockTypeId: 'hp1',
    blockLabel: 'HP',
    isBreak: false,
    ...overrides,
  };
}

function makeSchedule(slots: TimeSlotOutput[]): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots,
    productionSummary: [],
    warnings: [],
  };
}

/** Apply one stagger suggestion to a schedule (returns a new schedule) */
function applyFirstSuggestion(
  schedule: GenerationResult,
  suggestions: StaggerSuggestion[]
): GenerationResult {
  if (suggestions.length === 0) return schedule;
  const s = suggestions[0];

  const newSlots = schedule.slots.map(slot => {
    if (
      slot.time === s.conflictTime &&
      slot.providerId === s.providerId &&
      slot.operatory === s.operatory
    ) {
      // Clear the conflict slot
      return { ...slot, blockTypeId: null, blockLabel: null };
    }
    if (
      slot.time === s.suggestedTime &&
      slot.providerId === s.providerId &&
      slot.operatory === s.operatory
    ) {
      // Fill the target slot
      return { ...slot, blockTypeId: s.currentBlockTypeId, blockLabel: s.currentBlockLabel };
    }
    return slot;
  });

  return { ...schedule, slots: newSlots };
}

// ---------------------------------------------------------------------------
// Clean schedule fixture (no conflicts)
// ---------------------------------------------------------------------------

function createCleanSchedule(): GenerationResult {
  return makeSchedule([
    // dr1 is only in OP1 at each time slot
    makeSlot({ time: '08:00', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:10', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:20', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    // hyg1 is only in OP3
    makeSlot({ time: '08:00', providerId: 'hyg1', operatory: 'OP3', staffingCode: 'H', blockTypeId: 'srp1', blockLabel: 'SRP' }),
    makeSlot({ time: '08:10', providerId: 'hyg1', operatory: 'OP3', staffingCode: 'H', blockTypeId: 'srp1', blockLabel: 'SRP' }),
  ]);
}

// ---------------------------------------------------------------------------
// Conflicted schedule fixture
// ---------------------------------------------------------------------------

/**
 * Schedule where dr1 is in OP1 AND OP2 at 08:00 — one conflict.
 * At 08:10: OP1 is occupied (HP), OP2 is empty — perfect for the stagger suggestion.
 * At 08:20: OP1 is empty, OP2 is empty — also available.
 */
function createSingleConflictSchedule(): GenerationResult {
  return makeSchedule([
    // 08:00 — CONFLICT: dr1 in OP1 and OP2
    makeSlot({ time: '08:00', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:00', operatory: 'OP2', blockTypeId: 'np1', blockLabel: 'NP' }),
    // 08:10 — OP1 occupied, OP2 empty (available for stagger)
    makeSlot({ time: '08:10', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:10', operatory: 'OP2', staffingCode: null, blockTypeId: null, blockLabel: null }),
    // 08:20 — both empty
    makeSlot({ time: '08:20', operatory: 'OP1', staffingCode: null, blockTypeId: null, blockLabel: null }),
    makeSlot({ time: '08:20', operatory: 'OP2', staffingCode: null, blockTypeId: null, blockLabel: null }),
  ]);
}

/**
 * Schedule with two providers, each double-booked at a different time.
 */
function createMultiConflictSchedule(): GenerationResult {
  return makeSchedule([
    // dr1 in OP1 and OP2 at 08:00
    makeSlot({ time: '08:00', providerId: 'dr1', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:00', providerId: 'dr1', operatory: 'OP2', blockTypeId: 'np1', blockLabel: 'NP' }),
    // dr2 in OP3 and OP4 at 09:00
    makeSlot({ time: '09:00', providerId: 'dr2', operatory: 'OP3', blockTypeId: 'mp1', blockLabel: 'MP' }),
    makeSlot({ time: '09:00', providerId: 'dr2', operatory: 'OP4', blockTypeId: 'er1', blockLabel: 'ER' }),
    // free slots needed for suggestions
    makeSlot({ time: '08:10', providerId: 'dr1', operatory: 'OP1', staffingCode: null, blockTypeId: null, blockLabel: null }),
    makeSlot({ time: '08:10', providerId: 'dr1', operatory: 'OP2', staffingCode: null, blockTypeId: null, blockLabel: null }),
    makeSlot({ time: '09:10', providerId: 'dr2', operatory: 'OP3', staffingCode: null, blockTypeId: null, blockLabel: null }),
    makeSlot({ time: '09:10', providerId: 'dr2', operatory: 'OP4', staffingCode: null, blockTypeId: null, blockLabel: null }),
  ]);
}

// ---------------------------------------------------------------------------
// detectConflicts tests
// ---------------------------------------------------------------------------

describe('stagger engine', () => {
  describe('inferTimeIncrement', () => {
    it('should infer 10-minute increment', () => {
      const schedule = createCleanSchedule();
      expect(inferTimeIncrement(schedule)).toBe(10);
    });

    it('should return 10 for schedules with fewer than 2 unique times', () => {
      const schedule = makeSchedule([
        makeSlot({ time: '08:00' }),
      ]);
      expect(inferTimeIncrement(schedule)).toBe(10);
    });
  });

  describe('detectConflicts', () => {
    it('should return 0 conflicts on a clean schedule', () => {
      const schedule = createCleanSchedule();
      const providers = [makeProvider(), makeProvider({ id: 'hyg1', role: 'HYGIENIST' })];
      const conflicts = detectConflicts(schedule, providers);
      expect(conflicts).toHaveLength(0);
    });

    it('should detect 1 conflict when a provider is in 2 operatories at the same time', () => {
      const schedule = createSingleConflictSchedule();
      const providers = [makeProvider()];
      const conflicts = detectConflicts(schedule, providers);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].time).toBe('08:00');
      expect(conflicts[0].providerId).toBe('dr1');
      expect(conflicts[0].operatories).toContain('OP1');
      expect(conflicts[0].operatories).toContain('OP2');
      expect(conflicts[0].operatories).toHaveLength(2);
    });

    it('should detect conflicts from multiple providers', () => {
      const schedule = createMultiConflictSchedule();
      const providers = [makeProvider({ id: 'dr1' }), makeProvider({ id: 'dr2' })];
      const conflicts = detectConflicts(schedule, providers);

      expect(conflicts).toHaveLength(2);
      // dr1 conflict at 08:00
      expect(conflicts[0].providerId).toBe('dr1');
      expect(conflicts[0].time).toBe('08:00');
      // dr2 conflict at 09:00
      expect(conflicts[1].providerId).toBe('dr2');
      expect(conflicts[1].time).toBe('09:00');
    });

    it('should include block labels in conflict result', () => {
      const schedule = createSingleConflictSchedule();
      const conflicts = detectConflicts(schedule, [makeProvider()]);

      const conflict = conflicts[0];
      expect(conflict.blockLabels).toContain('HP');
      expect(conflict.blockLabels).toContain('NP');
    });

    it('should NOT flag break (lunch) slots as conflicts', () => {
      const schedule = makeSchedule([
        // Same provider, same time, same operatory as a break — not a real conflict
        makeSlot({ time: '13:00', operatory: 'OP1', isBreak: true, blockTypeId: null, blockLabel: 'LUNCH' }),
        makeSlot({ time: '13:00', operatory: 'OP2', isBreak: true, blockTypeId: null, blockLabel: 'LUNCH' }),
      ]);
      const conflicts = detectConflicts(schedule, [makeProvider()]);
      expect(conflicts).toHaveLength(0);
    });

    it('should NOT flag empty (no block) slots as conflicts', () => {
      const schedule = makeSchedule([
        makeSlot({ time: '08:00', operatory: 'OP1', blockTypeId: null, blockLabel: null }),
        makeSlot({ time: '08:00', operatory: 'OP2', blockTypeId: null, blockLabel: null }),
      ]);
      const conflicts = detectConflicts(schedule, [makeProvider()]);
      expect(conflicts).toHaveLength(0);
    });

    it('should return conflicts sorted by time ascending', () => {
      const schedule = makeSchedule([
        // Reverse order in the array — conflicts should still come out sorted
        makeSlot({ time: '10:00', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
        makeSlot({ time: '10:00', operatory: 'OP2', blockTypeId: 'np1', blockLabel: 'NP' }),
        makeSlot({ time: '08:00', operatory: 'OP1', blockTypeId: 'hp1', blockLabel: 'HP' }),
        makeSlot({ time: '08:00', operatory: 'OP2', blockTypeId: 'np1', blockLabel: 'NP' }),
      ]);
      const conflicts = detectConflicts(schedule, [makeProvider()]);
      expect(conflicts).toHaveLength(2);
      expect(conflicts[0].time).toBe('08:00');
      expect(conflicts[1].time).toBe('10:00');
    });
  });

  // ---------------------------------------------------------------------------
  // suggestStagger tests
  // ---------------------------------------------------------------------------

  describe('suggestStagger', () => {
    it('should return an empty array when there are no conflicts', () => {
      const schedule = createCleanSchedule();
      const providers = [makeProvider()];
      const suggestions = suggestStagger(schedule, providers);
      expect(suggestions).toHaveLength(0);
    });

    it('should return at least one suggestion for a conflicted schedule', () => {
      const schedule = createSingleConflictSchedule();
      const providers = [makeProvider()];
      const suggestions = suggestStagger(schedule, providers);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should reference the correct conflict time and provider', () => {
      const schedule = createSingleConflictSchedule();
      const suggestions = suggestStagger(schedule, [makeProvider()]);

      const s = suggestions[0];
      expect(s.conflictTime).toBe('08:00');
      expect(s.providerId).toBe('dr1');
      expect(s.operatory).toBe('OP2'); // The secondary operatory gets shifted
    });

    it('should suggest a time that actually exists in the schedule', () => {
      const schedule = createSingleConflictSchedule();
      const suggestions = suggestStagger(schedule, [makeProvider()]);

      const allTimes = new Set(schedule.slots.map(s => s.time));
      for (const s of suggestions) {
        expect(allTimes.has(s.suggestedTime)).toBe(true);
      }
    });

    it('should include the block label and blockTypeId in the suggestion', () => {
      const schedule = createSingleConflictSchedule();
      const suggestions = suggestStagger(schedule, [makeProvider()]);

      expect(suggestions[0].currentBlockLabel).toBe('NP');
      expect(suggestions[0].currentBlockTypeId).toBe('np1');
    });

    it('applied suggestion resolves the conflict', () => {
      const schedule = createSingleConflictSchedule();
      const providers = [makeProvider()];

      // Verify we start with a conflict
      const before = detectConflicts(schedule, providers);
      expect(before).toHaveLength(1);

      const suggestions = suggestStagger(schedule, providers);
      expect(suggestions.length).toBeGreaterThan(0);

      // Apply the first suggestion
      const resolved = applyFirstSuggestion(schedule, suggestions);

      // Should have 0 conflicts after applying
      const after = detectConflicts(resolved, providers);
      expect(after).toHaveLength(0);
    });

    it('suggestions for multiple conflicts reduce total conflict count', () => {
      const schedule = createMultiConflictSchedule();
      const providers = [
        makeProvider({ id: 'dr1' }),
        makeProvider({ id: 'dr2', operatories: ['OP3', 'OP4'] }),
      ];

      const before = detectConflicts(schedule, providers);
      expect(before).toHaveLength(2);

      const suggestions = suggestStagger(schedule, providers);
      expect(suggestions.length).toBeGreaterThan(0);

      // Apply only the first suggestion
      const partiallyResolved = applyFirstSuggestion(schedule, suggestions);
      const after = detectConflicts(partiallyResolved, providers);

      // At least one conflict should be gone
      expect(after.length).toBeLessThan(before.length);
    });
  });
});
