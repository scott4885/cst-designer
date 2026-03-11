import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/engine/generator';
import type { GenerationInput } from '@/lib/engine/types';

/**
 * Edge case integration tests.
 * Tests the generator with minimal or edge-case configurations.
 */

const MINIMAL_RULES = {
  npModel: 'DOCTOR_ONLY' as const,
  npBlocksPerDay: 0,
  srpBlocksPerDay: 0,
  hpPlacement: 'MORNING' as const,
  doubleBooking: false,
  matrixing: false,
  emergencyHandling: 'DEDICATED' as const,
};

describe('Edge Cases Integration', () => {
  it('should handle office with no providers', async () => {
    // Generator should return an empty schedule (no slots) without crashing
    const input: GenerationInput = {
      providers: [],
      blockTypes: [
        { id: 'hp', label: 'HP', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 90 },
      ],
      rules: MINIMAL_RULES,
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);
    expect(result).toBeDefined();
    expect(result.slots).toBeDefined();
    expect(Array.isArray(result.slots)).toBe(true);
    expect(result.slots.length).toBe(0);
    expect(result.productionSummary.length).toBe(0);
  });

  it('should handle office with no block types', async () => {
    // Generator should still produce time slots but with no block placements
    const input: GenerationInput = {
      providers: [
        {
          id: 'dr1',
          name: 'Dr. NoBlocks',
          role: 'DOCTOR',
          workingStart: '08:00',
          workingEnd: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          dailyGoal: 3000,
          color: '#6366f1',
          operatories: ['OP1'],
        },
      ],
      blockTypes: [],
      rules: MINIMAL_RULES,
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);
    expect(result).toBeDefined();
    expect(Array.isArray(result.slots)).toBe(true);

    // Time slots should be created for the provider's working hours
    const nonBreakSlots = result.slots.filter(s => !s.isBreak && s.providerId === 'dr1');
    expect(nonBreakSlots.length).toBeGreaterThan(0);

    // Production summary should exist (even if $0)
    const summary = result.productionSummary.find(s => s.providerId === 'dr1');
    expect(summary).toBeDefined();
    // With no block types, minimal or zero production is expected
    expect(summary!.actualScheduled).toBeGreaterThanOrEqual(0);
  });

  it('should handle invalid schedule generation gracefully', async () => {
    // Provider with very short working hours (less than smallest block)
    const input: GenerationInput = {
      providers: [
        {
          id: 'dr1',
          name: 'Dr. Short',
          role: 'DOCTOR',
          workingStart: '08:00',
          workingEnd: '08:20', // only 20 min — not enough for HP (90 min)
          dailyGoal: 3000,
          color: '#ef4444',
          operatories: ['OP1'],
        },
      ],
      blockTypes: [
        { id: 'hp', label: 'HP', minimumAmount: 1200, appliesToRole: 'DOCTOR' as const, durationMin: 90 },
      ],
      rules: { ...MINIMAL_RULES, npBlocksPerDay: 0 },
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    // Should not throw — gracefully produces a schedule with no blocks placed
    let result: ReturnType<typeof generateSchedule> | undefined;
    expect(() => { result = generateSchedule(input); }).not.toThrow();
    expect(result).toBeDefined();
    expect(result!.slots.length).toBeGreaterThanOrEqual(0);
  });
});
