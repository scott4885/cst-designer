/**
 * Sprint 7 — Task 1: Per-Day Working Hours
 * Tests for resolveProviderDayHours and generateSchedule per-day override behavior.
 */
import { describe, it, expect } from 'vitest';
import { resolveProviderDayHours, generateSchedule } from '@/lib/engine/generator';
import type { ProviderInput, BlockTypeInput, ScheduleRules } from '@/lib/engine/types';

const baseProvider: ProviderInput = {
  id: 'doc1',
  name: 'Dr. Test',
  role: 'DOCTOR',
  operatories: ['OP1'],
  workingStart: '07:00',
  workingEnd: '16:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  lunchEnabled: true,
  dailyGoal: 5000,
  color: '#ff0000',
};

const defaultBlockTypes: BlockTypeInput[] = [
  {
    id: 'hp-1',
    label: 'HP',
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    minimumAmount: 1200,
  },
  {
    id: 'mp-1',
    label: 'MP',
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    minimumAmount: 600,
  },
];

const defaultRules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 1,
  srpBlocksPerDay: 0,
  hpPlacement: 'MORNING',
  doubleBooking: false,
  matrixing: false,
  emergencyHandling: 'ACCESS_BLOCKS',
};

describe('resolveProviderDayHours', () => {
  it('returns general hours when no providerSchedule', () => {
    const result = resolveProviderDayHours(baseProvider, 'MONDAY');
    expect(result).not.toBeNull();
    expect(result!.workingStart).toBe('07:00');
    expect(result!.workingEnd).toBe('16:00');
  });

  it('returns null when provider is disabled for that day', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        MONDAY: { enabled: false },
      },
    };
    const result = resolveProviderDayHours(provider, 'MONDAY');
    expect(result).toBeNull();
  });

  it('returns per-day hours when enabled with custom times', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        TUESDAY: { enabled: true, workingStart: '08:00', workingEnd: '15:00', lunchStart: '12:30', lunchEnd: '13:00' },
      },
    };
    const result = resolveProviderDayHours(provider, 'TUESDAY');
    expect(result).not.toBeNull();
    expect(result!.workingStart).toBe('08:00');
    expect(result!.workingEnd).toBe('15:00');
  });

  it('falls back to general hours for days without an override', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        MONDAY: { enabled: true, workingStart: '08:00', workingEnd: '14:00' },
      },
    };
    // TUESDAY has no override
    const result = resolveProviderDayHours(provider, 'TUESDAY');
    expect(result!.workingStart).toBe('07:00');
    expect(result!.workingEnd).toBe('16:00');
  });
});

describe('generateSchedule — per-day hours', () => {
  it('skips disabled provider on that day (no slots generated)', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        MONDAY: { enabled: false },
      },
    };
    const result = generateSchedule({
      providers: [provider],
      blockTypes: defaultBlockTypes,
      rules: defaultRules,
      timeIncrement: 10,
      dayOfWeek: 'MONDAY',
    });
    // No slots should be generated for disabled provider
    const providerSlots = result.slots.filter(s => s.providerId === 'doc1');
    expect(providerSlots.length).toBe(0);
  });

  it('uses per-day hours override when provider is enabled', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        FRIDAY: { enabled: true, workingStart: '09:00', workingEnd: '14:00', lunchStart: null, lunchEnd: null },
      },
    };
    const result = generateSchedule({
      providers: [provider],
      blockTypes: defaultBlockTypes,
      rules: defaultRules,
      timeIncrement: 10,
      dayOfWeek: 'FRIDAY',
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'doc1');
    expect(providerSlots.length).toBeGreaterThan(0);
    // First slot should be at 09:00
    const times = providerSlots.map(s => s.time);
    expect(times[0]).toBe('09:00');
    // Last slot should be before 14:00
    const lastTime = times[times.length - 1];
    const [h, m] = lastTime.split(':').map(Number);
    expect(h * 60 + m).toBeLessThan(14 * 60);
  });

  it('generates normal schedule for non-disabled days even with providerSchedule set', () => {
    const provider: ProviderInput = {
      ...baseProvider,
      providerSchedule: {
        MONDAY: { enabled: false },
      },
    };
    const result = generateSchedule({
      providers: [provider],
      blockTypes: defaultBlockTypes,
      rules: defaultRules,
      timeIncrement: 10,
      dayOfWeek: 'TUESDAY', // Tuesday has no override → use general hours
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'doc1');
    // Should have slots for the general hours (7:00 - 16:00)
    expect(providerSlots.length).toBeGreaterThan(0);
    expect(providerSlots[0].time).toBe('07:00');
  });
});
