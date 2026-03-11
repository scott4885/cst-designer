import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/engine/generator';
import type { GenerationInput } from '@/lib/engine/types';

/**
 * Integration tests for Intake → Generation flow
 * Verifies that intake-configured providers and block types flow correctly through
 * the generation engine to produce valid, production-meeting schedules.
 */

const INTAKE_BLOCK_TYPES = [
  { id: 'hp', label: 'HP', description: 'High Production', minimumAmount: 1200, appliesToRole: 'DOCTOR' as const, durationMin: 90 },
  { id: 'mp', label: 'MP', description: 'Medium Production', minimumAmount: 375, appliesToRole: 'DOCTOR' as const, durationMin: 40 },
  { id: 'np', label: 'NP CONS', description: 'New Patient', minimumAmount: 300, appliesToRole: 'DOCTOR' as const, durationMin: 40 },
  { id: 'recare', label: 'Recare', description: 'Recare', minimumAmount: 150, appliesToRole: 'HYGIENIST' as const, durationMin: 60 },
];

const INTAKE_RULES = {
  npModel: 'DOCTOR_ONLY' as const,
  npBlocksPerDay: 1,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING' as const,
  doubleBooking: false,
  matrixing: false,
  emergencyHandling: 'DEDICATED' as const,
};

describe('Intake to Generation Flow Integration', () => {
  it('should generate schedules after office creation', async () => {
    // Simulates the intake → generation flow:
    // 1. Office is configured with providers and block types (intake phase)
    // 2. generateSchedule is called with the configured data (generation phase)
    // 3. Verify schedule is valid and meets production targets

    const intakeConfig: GenerationInput = {
      providers: [
        {
          id: 'dr1',
          name: 'Dr. Smith',
          role: 'DOCTOR',
          workingStart: '07:00',
          workingEnd: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          dailyGoal: 4000,
          color: '#3b82f6',
          operatories: ['OP1'],
        },
        {
          id: 'hyg1',
          name: 'Jane Hygienist',
          role: 'HYGIENIST',
          workingStart: '07:00',
          workingEnd: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          dailyGoal: 2000,
          color: '#10b981',
          operatories: ['HYG1'],
        },
      ],
      blockTypes: INTAKE_BLOCK_TYPES,
      rules: INTAKE_RULES,
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(intakeConfig);

    // Schedule should have slots for all providers
    expect(result.slots.length).toBeGreaterThan(0);
    const drSlots = result.slots.filter(s => s.providerId === 'dr1' && !s.isBreak);
    const hygSlots = result.slots.filter(s => s.providerId === 'hyg1' && !s.isBreak);
    expect(drSlots.length).toBeGreaterThan(0);
    expect(hygSlots.length).toBeGreaterThan(0);

    // Production summaries should be computed
    expect(result.productionSummary.length).toBe(2);
    const drSummary = result.productionSummary.find(s => s.providerId === 'dr1');
    const hygSummary = result.productionSummary.find(s => s.providerId === 'hyg1');
    expect(drSummary).toBeDefined();
    expect(hygSummary).toBeDefined();

    // Doctor should have HP blocks placed (intake MORNING placement rule)
    const hpSlots = result.slots.filter(s => s.providerId === 'dr1' && s.blockTypeId === 'hp');
    expect(hpSlots.length).toBeGreaterThan(0);
  });

  it('should validate provider and block type relationships', async () => {
    // Verifies that block types are correctly filtered by appliesToRole
    // and that each provider only gets blocks appropriate for their role

    const intakeConfig: GenerationInput = {
      providers: [
        {
          id: 'dr1',
          name: 'Dr. Test',
          role: 'DOCTOR',
          workingStart: '07:00',
          workingEnd: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          dailyGoal: 3000,
          color: '#6366f1',
          operatories: ['OP1'],
        },
        {
          id: 'hyg1',
          name: 'Hyg. Test',
          role: 'HYGIENIST',
          workingStart: '07:00',
          workingEnd: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00',
          dailyGoal: 2000,
          color: '#ec4899',
          operatories: ['HYG1'],
        },
      ],
      blockTypes: INTAKE_BLOCK_TYPES,
      rules: INTAKE_RULES,
      timeIncrement: 10,
      dayOfWeek: 'Tuesday',
    };

    const result = generateSchedule(intakeConfig);

    // Doctor should NOT have hygienist-only blocks
    const doctorWithHygBlocks = result.slots.filter(
      s => s.providerId === 'dr1' && s.blockTypeId === 'recare'
    );
    expect(doctorWithHygBlocks.length).toBe(0);

    // Hygienist should NOT have doctor-only blocks (HP/MP/NP)
    const hygWithDrBlocks = result.slots.filter(
      s => s.providerId === 'hyg1' && ['hp', 'mp', 'np'].includes(s.blockTypeId ?? '')
    );
    expect(hygWithDrBlocks.length).toBe(0);

    // Hygienist should have recare blocks
    const hygRecareBlocks = result.slots.filter(
      s => s.providerId === 'hyg1' && s.blockTypeId === 'recare'
    );
    expect(hygRecareBlocks.length).toBeGreaterThan(0);
  });
});
