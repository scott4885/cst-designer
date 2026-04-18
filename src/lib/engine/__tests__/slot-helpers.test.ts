/**
 * Iteration 12a — Direct unit tests for slot-helpers.ts.
 *
 * The Iter 1-3 engine additions (getDPhaseMinutes, predictRangeDMinutes,
 * rangesAvoidingDMinutes) were exercised only through end-to-end generator
 * tests. This file pins their pure behavior so future refactors of the
 * cross-column A-D zigzag logic have an immediate regression signal.
 */

import { describe, it, expect } from 'vitest';
import {
  toMinutes,
  fromMinutes,
  buildProviderSlotMap,
  getProviderOpSlots,
  findAvailableRanges,
  getStaffingCode,
  placeBlockInSlots,
  parseAmountFromLabel,
  getDPhaseMinutes,
  predictRangeDMinutes,
  rangesAvoidingDMinutes,
  countSlotsByBlockType,
  countOccupiedSlots,
  wouldExceedVarietyCap,
  MAX_SAME_TYPE_FRACTION,
} from '@/lib/engine/slot-helpers';
import type { TimeSlotOutput, ProviderInput, BlockTypeInput } from '@/lib/engine/types';

// ─── Fixtures ──────────────────────────────────────────────────────────────
const makeProvider = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  id: 'p1',
  name: 'Dr. Test',
  role: 'DOCTOR',
  operatories: ['OP1'],
  workingStart: '07:00',
  workingEnd: '17:00',
  dailyGoal: 5000,
  color: '#000',
  ...overrides,
});

const makeSlot = (
  time: string,
  providerId = 'p1',
  operatory = 'OP1',
  overrides: Partial<TimeSlotOutput> = {}
): TimeSlotOutput => ({
  time,
  providerId,
  operatory,
  staffingCode: null,
  blockTypeId: null,
  blockLabel: null,
  isBreak: false,
  ...overrides,
});

const makeBlockType = (overrides: Partial<BlockTypeInput> = {}): BlockTypeInput => ({
  id: 'bt-hp',
  label: 'HP',
  appliesToRole: 'DOCTOR',
  durationMin: 60,
  minimumAmount: 1500,
  ...overrides,
});

// ─── toMinutes / fromMinutes ───────────────────────────────────────────────
describe('toMinutes / fromMinutes', () => {
  it('converts HH:MM strings round-trip', () => {
    expect(toMinutes('07:00')).toBe(420);
    expect(toMinutes('12:30')).toBe(750);
    expect(fromMinutes(420)).toBe('07:00');
    expect(fromMinutes(750)).toBe('12:30');
  });
});

// ─── getStaffingCode / parseAmountFromLabel ────────────────────────────────
describe('getStaffingCode', () => {
  it('returns role-appropriate code', () => {
    expect(getStaffingCode('DOCTOR')).toBe('D');
    expect(getStaffingCode('HYGIENIST')).toBe('H');
    expect(getStaffingCode('OTHER')).toBe('A');
  });
});

describe('parseAmountFromLabel', () => {
  it('extracts dollar amounts from labels', () => {
    expect(parseAmountFromLabel('HP>$1200')).toBe(1200);
    expect(parseAmountFromLabel('CROWN $850')).toBe(850);
    expect(parseAmountFromLabel('NP')).toBe(0);
    expect(parseAmountFromLabel('')).toBe(0);
  });
});

// ─── buildProviderSlotMap / getProviderOpSlots ─────────────────────────────
describe('buildProviderSlotMap + getProviderOpSlots', () => {
  it('indexes slot positions per provider::operatory', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00', 'p1', 'OP1'),
      makeSlot('07:00', 'p1', 'OP2'),
      makeSlot('07:10', 'p1', 'OP1'),
      makeSlot('07:10', 'p1', 'OP2'),
    ];
    const provider = makeProvider({ operatories: ['OP1', 'OP2'] });
    const map = buildProviderSlotMap(slots, [provider]);

    expect(map.size).toBe(2);
    expect(map.get('p1::OP1')!.indices).toEqual([0, 2]);
    expect(map.get('p1::OP2')!.indices).toEqual([1, 3]);

    const ops = getProviderOpSlots(map, 'p1');
    expect(ops).toHaveLength(2);
    const operatories = ops.map(o => o.operatory).sort();
    expect(operatories).toEqual(['OP1', 'OP2']);
  });
});

// ─── findAvailableRanges ───────────────────────────────────────────────────
describe('findAvailableRanges', () => {
  it('returns all contiguous empty ranges of the required length', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00'),
      makeSlot('07:10'),
      makeSlot('07:20', 'p1', 'OP1', { isBreak: true, blockLabel: 'LUNCH' }),
      makeSlot('07:30'),
      makeSlot('07:40'),
      makeSlot('07:50'),
    ];
    const provider = makeProvider();
    const map = buildProviderSlotMap(slots, [provider]);
    const ps = map.get('p1::OP1')!;

    const ranges2 = findAvailableRanges(slots, ps, 2);
    // [0,1], [3,4], [4,5] — [2] is a break so excluded.
    expect(ranges2).toEqual([[0, 1], [3, 4], [4, 5]]);

    const ranges3 = findAvailableRanges(slots, ps, 3);
    // Only [3,4,5] is a clean 3-range (break at idx 2 blocks 0-2 options).
    expect(ranges3).toEqual([[3, 4, 5]]);
  });

  it('skips ranges containing already-placed blocks', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00'),
      makeSlot('07:10', 'p1', 'OP1', { blockTypeId: 'bt-x', blockLabel: 'X' }),
      makeSlot('07:20'),
      makeSlot('07:30'),
    ];
    const provider = makeProvider();
    const map = buildProviderSlotMap(slots, [provider]);
    const ps = map.get('p1::OP1')!;

    const ranges = findAvailableRanges(slots, ps, 2);
    expect(ranges).toEqual([[2, 3]]);
  });
});

// ─── placeBlockInSlots ─────────────────────────────────────────────────────
describe('placeBlockInSlots', () => {
  it('applies A/D staffing pattern for 3+ slot doctor blocks', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00'),
      makeSlot('07:10'),
      makeSlot('07:20'),
    ];
    placeBlockInSlots(slots, [0, 1, 2], makeBlockType(), makeProvider(), 'HP>$1500');

    expect(slots[0].staffingCode).toBe('A');
    expect(slots[1].staffingCode).toBe('D');
    expect(slots[2].staffingCode).toBe('A');
    for (const s of slots) {
      expect(s.blockTypeId).toBe('bt-hp');
      expect(s.blockLabel).toBe('HP>$1500');
    }
  });

  it('uses plain D staffing for 2-slot doctor blocks', () => {
    const slots: TimeSlotOutput[] = [makeSlot('07:00'), makeSlot('07:10')];
    placeBlockInSlots(slots, [0, 1], makeBlockType(), makeProvider());
    expect(slots[0].staffingCode).toBe('D');
    expect(slots[1].staffingCode).toBe('D');
  });

  it('uses H staffing for hygienist regardless of length', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00'),
      makeSlot('07:10'),
      makeSlot('07:20'),
    ];
    const hyg = makeProvider({ id: 'h1', role: 'HYGIENIST' });
    const bt = makeBlockType({ appliesToRole: 'HYGIENIST' });
    placeBlockInSlots(slots, [0, 1, 2], bt, hyg);
    for (const s of slots) expect(s.staffingCode).toBe('H');
  });
});

// ─── getDPhaseMinutes / predictRangeDMinutes ───────────────────────────────
describe('getDPhaseMinutes', () => {
  it('returns only the D-staffing, non-break, placed slot times', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00', 'p1', 'OP1', { staffingCode: 'A', blockTypeId: 'bt-hp', blockLabel: 'HP' }),
      makeSlot('07:10', 'p1', 'OP1', { staffingCode: 'D', blockTypeId: 'bt-hp', blockLabel: 'HP' }),
      makeSlot('07:20', 'p1', 'OP1', { staffingCode: 'D', blockTypeId: 'bt-hp', blockLabel: 'HP' }),
      makeSlot('07:30', 'p1', 'OP1', { staffingCode: 'A', blockTypeId: 'bt-hp', blockLabel: 'HP' }),
      // Break slot with D — should be ignored
      makeSlot('07:40', 'p1', 'OP1', { staffingCode: 'D', isBreak: true, blockLabel: 'LUNCH' }),
      // Unblocked slot — ignored
      makeSlot('07:50'),
    ];
    const map = buildProviderSlotMap(slots, [makeProvider()]);
    const result = getDPhaseMinutes(slots, map.get('p1::OP1')!);
    expect([...result].sort()).toEqual([toMinutes('07:10'), toMinutes('07:20')]);
  });

  it('returns empty set when no D-phase slots exist', () => {
    const slots: TimeSlotOutput[] = [makeSlot('07:00')];
    const map = buildProviderSlotMap(slots, [makeProvider()]);
    expect(getDPhaseMinutes(slots, map.get('p1::OP1')!).size).toBe(0);
  });
});

describe('predictRangeDMinutes', () => {
  it('returns middle minutes for ranges >= 3 (A-D-A pattern)', () => {
    const slots: TimeSlotOutput[] = [
      makeSlot('07:00'),
      makeSlot('07:10'),
      makeSlot('07:20'),
      makeSlot('07:30'),
      makeSlot('07:40'),
    ];
    const result = predictRangeDMinutes(slots, [0, 1, 2, 3, 4]);
    // First (07:00) and last (07:40) are A; middle three are D.
    expect(result).toEqual([toMinutes('07:10'), toMinutes('07:20'), toMinutes('07:30')]);
  });

  it('returns all minutes for ranges < 3 (no A-D split)', () => {
    const slots: TimeSlotOutput[] = [makeSlot('07:00'), makeSlot('07:10')];
    expect(predictRangeDMinutes(slots, [0, 1])).toEqual([toMinutes('07:00'), toMinutes('07:10')]);
  });
});

describe('rangesAvoidingDMinutes', () => {
  const slots: TimeSlotOutput[] = [
    makeSlot('07:00'), makeSlot('07:10'), makeSlot('07:20'),
    makeSlot('07:30'), makeSlot('07:40'), makeSlot('07:50'),
    makeSlot('08:00'), makeSlot('08:10'), makeSlot('08:20'),
  ];
  const rangeA = [0, 1, 2]; // D-phase minute: 07:10
  const rangeB = [3, 4, 5]; // D-phase minute: 07:40
  const rangeC = [6, 7, 8]; // D-phase minute: 08:10

  it('returns original ranges when avoid set is empty', () => {
    expect(rangesAvoidingDMinutes([rangeA, rangeB], slots, new Set())).toEqual([rangeA, rangeB]);
    expect(rangesAvoidingDMinutes([rangeA, rangeB], slots, undefined)).toEqual([rangeA, rangeB]);
  });

  it('prefers ranges with zero overlap', () => {
    const avoid = new Set([toMinutes('07:10')]);
    const result = rangesAvoidingDMinutes([rangeA, rangeB, rangeC], slots, avoid);
    // rangeA overlaps, rangeB and rangeC do not.
    expect(result).toEqual([rangeB, rangeC]);
  });

  it('falls back to single-overlap ranges when no clean option exists', () => {
    const avoid = new Set([toMinutes('07:10'), toMinutes('07:40'), toMinutes('08:10')]);
    const result = rangesAvoidingDMinutes([rangeA, rangeB, rangeC], slots, avoid);
    // All three overlap by exactly 1 — all survive the oneOrLess filter.
    expect(result).toHaveLength(3);
  });

  it('sorts by overlap ASC when all ranges conflict heavily', () => {
    // Make range with 2 slots of overlap.
    const heavyRange = [0, 1, 2, 3, 4]; // D-phase minutes: 07:10, 07:20, 07:30
    const avoid = new Set([toMinutes('07:10'), toMinutes('07:20'), toMinutes('07:30'), toMinutes('07:40')]);
    const result = rangesAvoidingDMinutes([heavyRange, rangeB], slots, avoid);
    // rangeB has 1 overlap (07:40), heavyRange has 3.
    // oneOrLess filter picks up rangeB.
    expect(result[0]).toEqual(rangeB);
  });
});

// ─── Variety helpers ──────────────────────────────────────────────────────
describe('countSlotsByBlockType + countOccupiedSlots + wouldExceedVarietyCap', () => {
  const slots: TimeSlotOutput[] = [
    makeSlot('07:00', 'p1', 'OP1', { blockTypeId: 'bt-hp', blockLabel: 'HP' }),
    makeSlot('07:10', 'p1', 'OP1', { blockTypeId: 'bt-hp', blockLabel: 'HP' }),
    makeSlot('07:20', 'p1', 'OP1', { blockTypeId: 'bt-np', blockLabel: 'NP' }),
    makeSlot('07:30', 'p1', 'OP1', { isBreak: true, blockLabel: 'LUNCH' }),
    makeSlot('07:40'),
  ];
  const map = buildProviderSlotMap(slots, [makeProvider()]);
  const ps = map.get('p1::OP1')!;

  it('counts slots per block type, excluding breaks', () => {
    const counts = countSlotsByBlockType(slots, ps);
    expect(counts.get('bt-hp')).toBe(2);
    expect(counts.get('bt-np')).toBe(1);
    // break excluded (it has blockLabel 'LUNCH' but no blockTypeId)
    expect(counts.size).toBe(2);
  });

  it('counts total occupied slots', () => {
    // 2 HP + 1 NP = 3 occupied; break and empty slot excluded.
    expect(countOccupiedSlots(slots, ps)).toBe(3);
  });

  it('wouldExceedVarietyCap blocks additions past MAX_SAME_TYPE_FRACTION', () => {
    // 10 total non-break slots. Seed with 6 HP already placed (60%).
    const cappySlots: TimeSlotOutput[] = [];
    for (let i = 0; i < 10; i++) {
      const time = `07:${String(i * 10).padStart(2, '0')}`;
      cappySlots.push(
        i < 6
          ? makeSlot(time, 'p1', 'OP1', { blockTypeId: 'bt-hp', blockLabel: 'HP' })
          : makeSlot(time, 'p1', 'OP1')
      );
    }
    const cappyMap = buildProviderSlotMap(cappySlots, [makeProvider()]);
    const cappyPs = cappyMap.get('p1::OP1')!;

    // Denominator is total non-break (10), not (current + added).
    // After adding 1 HP → 7/10 = 70% > 65% cap → true.
    expect(wouldExceedVarietyCap(cappySlots, cappyPs, 'bt-hp', 1)).toBe(true);
    // Adding 0 HP → 6/10 = 60% ≤ 65% → false.
    expect(wouldExceedVarietyCap(cappySlots, cappyPs, 'bt-hp', 0)).toBe(false);
    // Different block type, no existing count → 1/10 = 10% → false.
    expect(wouldExceedVarietyCap(cappySlots, cappyPs, 'bt-new', 1)).toBe(false);

    // Returns false when provider has no non-break slots (divide-by-zero guard).
    const emptyMap = buildProviderSlotMap([], [makeProvider()]);
    const emptyPs = emptyMap.get('p1::OP1')!;
    expect(wouldExceedVarietyCap([], emptyPs, 'bt-hp', 5)).toBe(false);

    // Sanity: cap constant is sensible.
    expect(MAX_SAME_TYPE_FRACTION).toBeGreaterThan(0);
    expect(MAX_SAME_TYPE_FRACTION).toBeLessThanOrEqual(1);
  });
});
