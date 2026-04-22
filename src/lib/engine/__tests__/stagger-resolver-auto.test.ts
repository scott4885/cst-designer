import { describe, it, expect } from 'vitest';
import {
  autoResolveStaggerConflicts,
  countDTimeOverlaps,
} from '../stagger-resolver';
import type {
  ProviderInput,
  TimeSlotOutput,
  GenerationResult,
} from '../types';

/**
 * Phase-4 test-suite backfill (Task 5): stagger-resolver is engine-critical
 * (post-pass D-time conflict resolver) but the bundled test covers only
 * `detectConflicts` via `stagger.ts`. These tests lock the public API of
 * `autoResolveStaggerConflicts` and `countDTimeOverlaps`.
 */

const provider: ProviderInput = {
  id: 'drA',
  name: 'Dr. A',
  role: 'DOCTOR',
  operatories: ['OP1', 'OP2'],
  workingStart: '08:00',
  workingEnd: '10:00',
  dailyGoal: 5000,
  color: '#000',
};

function slot(
  time: string,
  operatory: string,
  opts: Partial<TimeSlotOutput> = {},
): TimeSlotOutput {
  return {
    time,
    providerId: 'drA',
    operatory,
    staffingCode: null,
    blockTypeId: null,
    blockLabel: null,
    isBreak: false,
    blockInstanceId: null,
    customProductionAmount: null,
    ...opts,
  };
}

describe('countDTimeOverlaps', () => {
  it('returns 0 when no D-time slots exist', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'A', blockTypeId: 'x', blockLabel: 'x' }),
      slot('08:00', 'OP2', { staffingCode: 'A', blockTypeId: 'x', blockLabel: 'x' }),
    ];
    expect(countDTimeOverlaps(slots, [provider])).toBe(0);
  });

  it('returns 0 when doctor D-time is in a single operatory at any given time', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:10', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
    ];
    expect(countDTimeOverlaps(slots, [provider])).toBe(0);
  });

  it('counts 1 when the same provider is D-timed in 2 ops at the same instant', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:00', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
    ];
    expect(countDTimeOverlaps(slots, [provider])).toBe(1);
  });

  it('counts each overlapping instant separately', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:00', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:10', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:10', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
    ];
    expect(countDTimeOverlaps(slots, [provider])).toBe(2);
  });

  it('ignores breaks and slots belonging to non-doctor providers', () => {
    const hyg: ProviderInput = { ...provider, id: 'hyg1', role: 'HYGIENIST' };
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP', isBreak: true }),
      slot('08:00', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      // hygienist D-time should be filtered out
      { ...slot('09:00', 'OP1', { staffingCode: 'D', blockTypeId: 'rc', blockLabel: 'RC' }), providerId: 'hyg1' },
      { ...slot('09:00', 'OP2', { staffingCode: 'D', blockTypeId: 'rc', blockLabel: 'RC' }), providerId: 'hyg1' },
    ];
    expect(countDTimeOverlaps(slots, [provider, hyg])).toBe(0);
  });
});

describe('autoResolveStaggerConflicts', () => {
  // Minimal GenerationResult shape — we only populate the fields the resolver reads.
  function buildSchedule(slots: TimeSlotOutput[]): GenerationResult {
    return {
      dayOfWeek: 'MONDAY',
      slots,
      productionSummary: [],
      warnings: [],
    } as GenerationResult;
  }

  it('returns zero moves and no remaining conflicts when schedule is clean', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'A', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:10', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:20', 'OP2', { staffingCode: 'A', blockTypeId: 'hp', blockLabel: 'HP' }),
      slot('08:30', 'OP2', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
    ];
    const result = autoResolveStaggerConflicts(buildSchedule(slots), [provider]);
    expect(result.appliedMoves).toEqual([]);
    expect(result.remainingConflicts).toEqual([]);
    expect(result.modifiedSlots).toBe(slots); // same ref (in-place)
  });

  it('shape of result includes modifiedSlots, appliedMoves, remainingConflicts', () => {
    const slots = [
      slot('08:00', 'OP1', { staffingCode: 'D', blockTypeId: 'hp', blockLabel: 'HP' }),
    ];
    const result = autoResolveStaggerConflicts(buildSchedule(slots), [provider]);
    expect(result).toHaveProperty('modifiedSlots');
    expect(result).toHaveProperty('appliedMoves');
    expect(result).toHaveProperty('remainingConflicts');
    expect(Array.isArray(result.appliedMoves)).toBe(true);
    expect(Array.isArray(result.remainingConflicts)).toBe(true);
  });

  it('handles a schedule with no slots gracefully (no throw, empty result)', () => {
    const result = autoResolveStaggerConflicts(buildSchedule([]), [provider]);
    expect(result.appliedMoves).toEqual([]);
    expect(result.remainingConflicts).toEqual([]);
    expect(result.modifiedSlots).toEqual([]);
  });
});
