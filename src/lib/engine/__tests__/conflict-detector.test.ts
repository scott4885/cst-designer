/**
 * Iteration 12a — Unit tests for conflict-detector.ts.
 *
 * Pins the five conflict categories exposed by detectAllConflicts:
 *   1. DOCTOR_HYGIENE_CONFLICT — doctor in hygiene op at same time as a hygiene block
 *   2. DOUBLE_BOOKING — provider in multiple ops without columns>1 setup
 *   3. PRODUCTION_UNDER_GOAL — summary.status === 'UNDER'
 *   4. MISSING_LUNCH — provider with lunch window but no LUNCH break slot
 *   5. D-time overlaps (also DOUBLE_BOOKING category) — warning-level
 */

import { describe, it, expect } from 'vitest';
import {
  detectAllConflicts,
  isScheduleClean,
  getProductionTotals,
} from '@/lib/engine/conflict-detector';
import type {
  ProviderInput,
  GenerationResult,
  TimeSlotOutput,
  ProviderProductionSummary,
  BlockTypeInput,
} from '@/lib/engine/types';

// ─── Fixtures ──────────────────────────────────────────────────────────────
const makeProvider = (
  id: string,
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER',
  overrides: Partial<ProviderInput> = {}
): ProviderInput => ({
  id,
  name: `${role} ${id}`,
  role,
  operatories: ['OP1'],
  workingStart: '07:00',
  workingEnd: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  dailyGoal: 5000,
  color: '#000',
  ...overrides,
});

const makeSlot = (
  time: string,
  providerId: string,
  operatory = 'OP1',
  overrides: Partial<TimeSlotOutput> = {}
): TimeSlotOutput => ({
  time,
  providerId,
  operatory,
  staffingCode: null,
  blockTypeId: 'bt-x',
  blockLabel: 'X',
  isBreak: false,
  ...overrides,
});

const makeSchedule = (
  slots: TimeSlotOutput[],
  productionSummary: ProviderProductionSummary[] = []
): GenerationResult => ({
  dayOfWeek: 'MONDAY',
  slots,
  productionSummary,
  warnings: [],
});

// ─── DOCTOR_HYGIENE_CONFLICT ───────────────────────────────────────────────
describe('detectAllConflicts — DOCTOR_HYGIENE_CONFLICT', () => {
  it('flags a doctor block overlapping a hygiene block in the same operatory+time', () => {
    const providers = [
      makeProvider('d1', 'DOCTOR'),
      makeProvider('h1', 'HYGIENIST'),
    ];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1', { blockLabel: 'CROWN', blockTypeId: 'bt-crown' }),
      makeSlot('08:00', 'h1', 'OP1', { blockLabel: 'PROPHY', blockTypeId: 'bt-prophy' }),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), providers);
    const dhc = conflicts.filter(c => c.category === 'DOCTOR_HYGIENE_CONFLICT');
    expect(dhc).toHaveLength(1);
    expect(dhc[0].severity).toBe('error');
    expect(dhc[0].time).toBe('08:00');
    expect(dhc[0].operatory).toBe('OP1');
  });

  it('does not flag doctor + doctor in same op (no hygienist present)', () => {
    const providers = [
      makeProvider('d1', 'DOCTOR'),
      makeProvider('d2', 'DOCTOR'),
    ];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd2', 'OP1'),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), providers);
    expect(conflicts.filter(c => c.category === 'DOCTOR_HYGIENE_CONFLICT')).toHaveLength(0);
  });

  it('ignores breaks when detecting overlap', () => {
    const providers = [
      makeProvider('d1', 'DOCTOR'),
      makeProvider('h1', 'HYGIENIST'),
    ];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1', { isBreak: true, blockLabel: 'LUNCH', blockTypeId: null }),
      makeSlot('08:00', 'h1', 'OP1'),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), providers);
    expect(conflicts.filter(c => c.category === 'DOCTOR_HYGIENE_CONFLICT')).toHaveLength(0);
  });
});

// ─── DOUBLE_BOOKING ────────────────────────────────────────────────────────
describe('detectAllConflicts — DOUBLE_BOOKING', () => {
  it('flags a single-column provider scheduled in 2 ops simultaneously', () => {
    const provider = makeProvider('d1', 'DOCTOR', { operatories: ['OP1', 'OP2'], columns: 1 });
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd1', 'OP2'),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    const dbl = conflicts.filter(c => c.category === 'DOUBLE_BOOKING');
    expect(dbl).toHaveLength(1);
    expect(dbl[0].severity).toBe('error');
    expect(dbl[0].providerId).toBe('d1');
  });

  it('does not flag multi-column providers legitimately in multiple ops', () => {
    const provider = makeProvider('d1', 'DOCTOR', { operatories: ['OP1', 'OP2'], columns: 2 });
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd1', 'OP2'),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    expect(conflicts.filter(c => c.category === 'DOUBLE_BOOKING' && c.severity === 'error')).toHaveLength(0);
  });
});

// ─── PRODUCTION_UNDER_GOAL ─────────────────────────────────────────────────
describe('detectAllConflicts — PRODUCTION_UNDER_GOAL', () => {
  it('flags any provider with status UNDER', () => {
    const provider = makeProvider('d1', 'DOCTOR');
    const summary: ProviderProductionSummary[] = [
      {
        providerId: 'd1',
        providerName: 'Dr. D1',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 2000,
        status: 'UNDER',
        blocks: [],
      },
      {
        providerId: 'd2',
        providerName: 'Dr. D2',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 4000,
        status: 'MET',
        blocks: [],
      },
    ];
    const conflicts = detectAllConflicts(makeSchedule([], summary), [provider]);
    const under = conflicts.filter(c => c.category === 'PRODUCTION_UNDER_GOAL');
    expect(under).toHaveLength(1);
    expect(under[0].providerId).toBe('d1');
    expect(under[0].severity).toBe('warning');
  });

  it('does not flag when all providers are MET or OVER', () => {
    const summary: ProviderProductionSummary[] = [
      {
        providerId: 'd1',
        providerName: 'Dr. D1',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 5000,
        status: 'OVER',
        blocks: [],
      },
    ];
    const conflicts = detectAllConflicts(makeSchedule([], summary), []);
    expect(conflicts.filter(c => c.category === 'PRODUCTION_UNDER_GOAL')).toHaveLength(0);
  });
});

// ─── MISSING_LUNCH ─────────────────────────────────────────────────────────
describe('detectAllConflicts — MISSING_LUNCH', () => {
  it('flags provider with lunch window but no LUNCH break slot', () => {
    const provider = makeProvider('d1', 'DOCTOR', { lunchStart: '12:00', lunchEnd: '13:00' });
    const slots = [makeSlot('08:00', 'd1', 'OP1')];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    const missing = conflicts.filter(c => c.category === 'MISSING_LUNCH');
    expect(missing).toHaveLength(1);
    expect(missing[0].providerId).toBe('d1');
  });

  it('does not flag when a LUNCH break exists', () => {
    const provider = makeProvider('d1', 'DOCTOR', { lunchStart: '12:00', lunchEnd: '13:00' });
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('12:00', 'd1', 'OP1', { isBreak: true, blockLabel: 'LUNCH', blockTypeId: null }),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    expect(conflicts.filter(c => c.category === 'MISSING_LUNCH')).toHaveLength(0);
  });

  it('does not flag provider with no scheduled slots at all', () => {
    const provider = makeProvider('d1', 'DOCTOR', { lunchStart: '12:00', lunchEnd: '13:00' });
    const conflicts = detectAllConflicts(makeSchedule([]), [provider]);
    expect(conflicts.filter(c => c.category === 'MISSING_LUNCH')).toHaveLength(0);
  });

  it('does not flag providers with lunch disabled (no lunchStart/lunchEnd)', () => {
    const provider = makeProvider('d1', 'DOCTOR', { lunchStart: undefined, lunchEnd: undefined });
    const slots = [makeSlot('08:00', 'd1', 'OP1')];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    expect(conflicts.filter(c => c.category === 'MISSING_LUNCH')).toHaveLength(0);
  });
});

// ─── Clean schedule + totals helpers ───────────────────────────────────────
describe('isScheduleClean', () => {
  it('returns true for empty conflict arrays', () => {
    expect(isScheduleClean([])).toBe(true);
  });

  it('returns false when any conflict exists', () => {
    expect(
      isScheduleClean([
        {
          id: 'c1',
          severity: 'warning',
          category: 'ALL_GOOD',
          message: 'x',
        },
      ])
    ).toBe(false);
  });
});

describe('getProductionTotals', () => {
  it('sums dailyGoal, target75, and actualScheduled across providers', () => {
    const summary: ProviderProductionSummary[] = [
      {
        providerId: 'd1',
        providerName: 'Dr. D1',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 4000,
        status: 'MET',
        blocks: [],
      },
      {
        providerId: 'd2',
        providerName: 'Dr. D2',
        dailyGoal: 3000,
        target75: 2250,
        actualScheduled: 1500,
        status: 'UNDER',
        blocks: [],
      },
    ];
    const totals = getProductionTotals(summary);
    expect(totals.totalGoal).toBe(8000);
    expect(totals.totalTarget75).toBe(6000);
    expect(totals.totalScheduled).toBe(5500);
  });

  it('returns zeros for empty summary', () => {
    expect(getProductionTotals([])).toEqual({
      totalScheduled: 0,
      totalGoal: 0,
      totalTarget75: 0,
    });
  });
});

// ─── D-time overlap (blockTypes integration) ───────────────────────────────
describe('detectAllConflicts — D-time overlap pass-through', () => {
  it('only runs D-time detection when blockTypes are provided', () => {
    const provider = makeProvider('d1', 'DOCTOR', { operatories: ['OP1', 'OP2'], columns: 2 });
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd1', 'OP2'),
    ];
    // No blockTypes passed — D-time detection short-circuits and emits no warnings.
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider]);
    const dTimeWarnings = conflicts.filter(c => c.message.startsWith('⚡ D-time overlap'));
    expect(dTimeWarnings).toHaveLength(0);
  });

  it('emits no D-time warnings when block has no dTimeMin set', () => {
    const provider = makeProvider('d1', 'DOCTOR', { operatories: ['OP1', 'OP2'], columns: 2 });
    const bt: BlockTypeInput = {
      id: 'bt-x',
      label: 'X',
      appliesToRole: 'DOCTOR',
      durationMin: 30,
    };
    const slots = [
      makeSlot('08:00', 'd1', 'OP1', { blockTypeId: 'bt-x' }),
      makeSlot('08:00', 'd1', 'OP2', { blockTypeId: 'bt-x' }),
    ];
    const conflicts = detectAllConflicts(makeSchedule(slots), [provider], [bt]);
    const dTimeWarnings = conflicts.filter(c => c.message.startsWith('⚡ D-time overlap'));
    expect(dTimeWarnings).toHaveLength(0);
  });
});
