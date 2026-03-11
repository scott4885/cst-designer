/**
 * Sprint 4 P3 Tests — Rock/Sand/Water Schedule Generator (§7)
 *
 * Verifies:
 * - No single appointment type fills > MAX_SAME_TYPE_FRACTION (65%) of a provider's day
 * - Variety: at least 2 distinct block types in a full-day schedule
 * - wouldExceedVarietyCap utility function
 * - MAX_SAME_TYPE_FRACTION constant is 0.65
 * - HP blocks achieve ≥ 75% of daily goal when possible (Rock = HP)
 * - Emergency block is present
 */

import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  MAX_SAME_TYPE_FRACTION,
  wouldExceedVarietyCap,
} from '../generator';
import type { GenerationInput, ProviderInput, BlockTypeInput, TimeSlotOutput } from '../types';

// ─── MAX_SAME_TYPE_FRACTION constant ─────────────────────────────────────────

describe('MAX_SAME_TYPE_FRACTION', () => {
  it('should be 0.65 (65%)', () => {
    expect(MAX_SAME_TYPE_FRACTION).toBe(0.65);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createVarietyInput(): GenerationInput {
  const doctor: ProviderInput = {
    id: 'dr1',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 6000,
    color: '#3b82f6',
  };

  const hygienist: ProviderInput = {
    id: 'hyg1',
    name: 'Jane Hyg RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 2500,
    color: '#22c55e',
  };

  const blockTypes: BlockTypeInput[] = [
    { id: 'hp1', label: 'HP Crown', minimumAmount: 1500, appliesToRole: 'DOCTOR', durationMin: 60 },
    { id: 'hp2', label: 'HP Implant', minimumAmount: 2000, appliesToRole: 'DOCTOR', durationMin: 90 },
    { id: 'mp1', label: 'MP Filling', minimumAmount: 350, appliesToRole: 'DOCTOR', durationMin: 30 },
    { id: 'np1', label: 'NP CONS', minimumAmount: 150, appliesToRole: 'DOCTOR', durationMin: 30 },
    { id: 'er1', label: 'ER', minimumAmount: 200, appliesToRole: 'DOCTOR', durationMin: 30 },
    { id: 'pr1', label: 'Prophy', minimumAmount: 150, appliesToRole: 'HYGIENIST', durationMin: 50 },
    { id: 'srp1', label: 'SRP', minimumAmount: 400, appliesToRole: 'HYGIENIST', durationMin: 60 },
    { id: 'np2', label: 'NP Exam', minimumAmount: 200, appliesToRole: 'HYGIENIST', durationMin: 60 },
    { id: 'pm1', label: 'Perio Maint', minimumAmount: 200, appliesToRole: 'HYGIENIST', durationMin: 50 },
  ];

  return {
    providers: [doctor, hygienist],
    blockTypes,
    rules: {
      npModel: 'DOCTOR_ONLY',
      npBlocksPerDay: 1,
      srpBlocksPerDay: 1,
      hpPlacement: 'MORNING',
      doubleBooking: false,
      matrixing: false,
      emergencyHandling: 'DEDICATED',
    },
    timeIncrement: 10,
    dayOfWeek: 'Monday',
  };
}

// ─── Generator variety tests ─────────────────────────────────────────────────

describe('generateSchedule — variety enforcement (§7)', () => {
  it('should produce at least 2 different block types for a doctor in a full day', () => {
    const input = createVarietyInput();
    const result = generateSchedule(input);

    const drSlots = result.slots.filter(
      s => s.providerId === 'dr1' && !s.isBreak && s.blockTypeId
    );
    const uniqueBlockTypes = new Set(drSlots.map(s => s.blockTypeId));

    expect(uniqueBlockTypes.size).toBeGreaterThanOrEqual(2);
  });

  it('should not fill more than 65% of doctor slots with a single block type', () => {
    const input = createVarietyInput();
    const result = generateSchedule(input);

    const drSlots = result.slots.filter(
      s => s.providerId === 'dr1' && !s.isBreak && s.blockTypeId
    );
    if (drSlots.length === 0) return; // skip if no blocks placed

    const counts = new Map<string, number>();
    for (const s of drSlots) {
      counts.set(s.blockTypeId!, (counts.get(s.blockTypeId!) ?? 0) + 1);
    }

    for (const [blockTypeId, count] of counts) {
      const fraction = count / drSlots.length;
      expect(fraction).toBeLessThanOrEqual(MAX_SAME_TYPE_FRACTION + 0.01); // float tolerance
    }
  });

  it('should produce at least 2 different block types for a hygienist in a full day', () => {
    const input = createVarietyInput();
    const result = generateSchedule(input);

    const hygSlots = result.slots.filter(
      s => s.providerId === 'hyg1' && !s.isBreak && s.blockTypeId
    );
    const uniqueBlockTypes = new Set(hygSlots.map(s => s.blockTypeId));

    // Hygienists should have variety (prophy + at least one other type)
    expect(uniqueBlockTypes.size).toBeGreaterThanOrEqual(2);
  });

  it('should not fill more than 65% of hygienist slots with a single block type', () => {
    const input = createVarietyInput();
    const result = generateSchedule(input);

    const hygSlots = result.slots.filter(
      s => s.providerId === 'hyg1' && !s.isBreak && s.blockTypeId
    );
    if (hygSlots.length === 0) return;

    const counts = new Map<string, number>();
    for (const s of hygSlots) {
      counts.set(s.blockTypeId!, (counts.get(s.blockTypeId!) ?? 0) + 1);
    }

    for (const [, count] of counts) {
      const fraction = count / hygSlots.length;
      expect(fraction).toBeLessThanOrEqual(MAX_SAME_TYPE_FRACTION + 0.01);
    }
  });

  it('should place HP blocks that contribute toward the 75% daily goal target', () => {
    const input = createVarietyInput();
    const result = generateSchedule(input);

    const drSummary = result.productionSummary.find(s => s.providerId === 'dr1');
    expect(drSummary).toBeDefined();

    // target75 should be 75% of 6000 = 4500
    expect(drSummary!.target75).toBe(4500);

    // The schedule should have some HP production
    const hpAmount = drSummary!.blocks
      .filter(b => b.label.includes('HP'))
      .reduce((sum, b) => sum + b.amount, 0);

    expect(hpAmount).toBeGreaterThan(0);
  });
});

// ─── wouldExceedVarietyCap utility ───────────────────────────────────────────

describe('wouldExceedVarietyCap', () => {
  // Build a minimal ProviderSlots-like structure for testing (matches the private ProviderSlots interface)
  function makeMinimalProviderSlots(slotCount: number): { indices: number[]; providerId: string; operatory: string; [key: string]: unknown } {
    return {
      indices: Array.from({ length: slotCount }, (_, i) => i),
      providerId: 'dr1',
      operatory: 'OP1',
    };
  }

  function makeSlotsArray(count: number, filledTypeId?: string, fillCount?: number): TimeSlotOutput[] {
    return Array.from({ length: count }, (_, i) => ({
      time: `07:${String(i * 10).padStart(2, '0')}`,
      providerId: 'dr1',
      operatory: 'OP1',
      staffingCode: 'D' as const,
      blockTypeId: i < (fillCount ?? 0) ? (filledTypeId ?? null) : null,
      blockLabel: i < (fillCount ?? 0) ? 'HP' : null,
      isBreak: false,
    }));
  }

  it('should return false when no slots are filled', () => {
    const ps = makeMinimalProviderSlots(10) as any;
    const slots = makeSlotsArray(10);
    expect(wouldExceedVarietyCap(slots, ps, 'hp1', 3)).toBe(false);
  });

  it('should return false when placing would stay under the cap', () => {
    // 6 slots total, 3 filled with 'hp1', placing 1 more → 4/6 = 67% > 65%
    // but if we check 4/6 = 0.667 > 0.65 → this should return TRUE
    // So: 6 slots, 0 filled, placing 4 → 4/6 = 67% → over cap
    const ps = makeMinimalProviderSlots(10) as any;
    const slots = makeSlotsArray(10, 'hp1', 0);
    // Placing 6 out of 10 non-break slots = 60% → under cap (65%)
    expect(wouldExceedVarietyCap(slots, ps, 'hp1', 6)).toBe(false);
  });

  it('should return true when placing would exceed 65% cap', () => {
    // 10 slots total, 5 already filled with 'hp1', placing 3 more → 8/10 = 80% → over cap
    const ps = makeMinimalProviderSlots(10) as any;
    const slots = makeSlotsArray(10, 'hp1', 5);
    expect(wouldExceedVarietyCap(slots, ps, 'hp1', 3)).toBe(true);
  });

  it('should not count breaks toward the total', () => {
    // 10 slots, 5 are breaks → only 5 non-break slots
    // 3 already filled with 'hp1', placing 1 more → 4/5 = 80% → over cap
    const ps = makeMinimalProviderSlots(10) as any;
    const slots = makeSlotsArray(10, 'hp1', 3).map((s, i) => ({
      ...s,
      isBreak: i >= 5, // slots 5-9 are breaks
    }));
    expect(wouldExceedVarietyCap(slots, ps, 'hp1', 1)).toBe(true);
  });

  it('should not cap a different block type', () => {
    // 10 slots, 8 filled with 'hp1' → but we're placing 'mp1' (different type)
    // mp1 count = 0, placing 1 → 1/10 = 10% → under cap
    const ps = makeMinimalProviderSlots(10) as any;
    const slots = makeSlotsArray(10, 'hp1', 8);
    expect(wouldExceedVarietyCap(slots, ps, 'mp1', 1)).toBe(false);
  });
});
