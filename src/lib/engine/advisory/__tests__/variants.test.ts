import { describe, it, expect } from 'vitest';
import { VARIANT_PROFILES, generateThreeVariants } from '../variants';
import type { ProviderInput, BlockTypeInput, ScheduleRules } from '../../types';

const minimalProvider: ProviderInput = {
  id: 'P1',
  name: 'Dr. Test',
  role: 'DOCTOR',
  operatories: ['OP1', 'OP2'],
  columns: 2,
  workingStart: '08:00',
  workingEnd: '16:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  lunchEnabled: true,
  dailyGoal: 4000,
  color: '#444',
  seesNewPatients: true,
  staggerOffsetMin: 10,
  dayOfWeekRoster: ['MON'],
  providerSchedule: {},
  currentProcedureMix: {},
  futureProcedureMix: {},
};

const minimalBlockTypes: BlockTypeInput[] = [
  {
    id: 'bt-hp',
    label: 'HP',
    description: 'High production',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    durationMax: 60,
    color: '#0a0',
    isHygieneType: false,
    dTimeMin: 30,
    aTimeMin: 30,
    procedureCategory: 'HIGH_PRODUCTION',
    asstPreMin: 10,
    doctorMin: 40,
    asstPostMin: 10,
    doctorContinuityRequired: true,
  },
  {
    id: 'bt-np',
    label: 'NP',
    description: 'New patient',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
    durationMax: 40,
    color: '#08a',
    isHygieneType: false,
    dTimeMin: 20,
    aTimeMin: 20,
    procedureCategory: 'BASIC_RESTORATIVE',
    asstPreMin: 10,
    doctorMin: 20,
    asstPostMin: 10,
    doctorContinuityRequired: false,
  },
  {
    id: 'bt-er',
    label: 'ER',
    description: 'Emergency',
    minimumAmount: 200,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
    durationMax: 30,
    color: '#d33',
    isHygieneType: false,
    dTimeMin: 15,
    aTimeMin: 15,
    procedureCategory: 'BASIC_RESTORATIVE',
    asstPreMin: 5,
    doctorMin: 20,
    asstPostMin: 5,
    doctorContinuityRequired: false,
  },
];

const minimalRules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING',
  doubleBooking: false,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

describe('variants', () => {
  it('ships exactly 3 canonical profiles with weight sums that make sense', () => {
    const codes = Object.keys(VARIANT_PROFILES).sort();
    expect(codes).toEqual(['ACCESS', 'BALANCED', 'GROWTH']);
    for (const p of Object.values(VARIANT_PROFILES)) {
      const total = Object.values(p.weights).reduce((s, n) => s + n, 0);
      expect(total).toBe(100);
    }
  });

  it('generateThreeVariants returns 3 results with a valid recommendation', () => {
    const out = generateThreeVariants({
      officeId: 'office-test-1',
      officeName: 'Test Office',
      providers: [minimalProvider],
      blockTypes: minimalBlockTypes,
      rules: minimalRules,
      timeIncrement: 10,
      days: ['MON'],
      intakeGoals: { monthlyNewPatientGoal: 40, growthPriority: 'MORE_PRODUCTION' },
    });
    expect(out.variants).toHaveLength(3);
    const codes = out.variants.map((v) => v.code).sort();
    expect(codes).toEqual(['ACCESS', 'BALANCED', 'GROWTH']);
    expect(['GROWTH', 'ACCESS', 'BALANCED']).toContain(out.recommendation.winner);
    expect(out.recommendation.reason.length).toBeGreaterThan(10);
  });

  it('honours growthPriority=MORE_PRODUCTION → Growth wins', () => {
    const out = generateThreeVariants({
      officeId: 'office-priority-growth',
      officeName: 'Prod Priority',
      providers: [minimalProvider],
      blockTypes: minimalBlockTypes,
      rules: minimalRules,
      timeIncrement: 10,
      days: ['MON'],
      intakeGoals: { growthPriority: 'MORE_PRODUCTION', monthlyNewPatientGoal: 40 },
    });
    expect(out.recommendation.winner).toBe('GROWTH');
  });

  it('honours growthPriority=MORE_NP → Access wins', () => {
    const out = generateThreeVariants({
      officeId: 'office-priority-np',
      officeName: 'NP Priority',
      providers: [minimalProvider],
      blockTypes: minimalBlockTypes,
      rules: minimalRules,
      timeIncrement: 10,
      days: ['MON'],
      intakeGoals: { growthPriority: 'MORE_NP', monthlyNewPatientGoal: 80 },
    });
    expect(out.recommendation.winner).toBe('ACCESS');
  });

  it('is deterministic — same inputs produce byte-identical JSON', () => {
    const inp = {
      officeId: 'office-determinism',
      officeName: 'Det Office',
      providers: [minimalProvider],
      blockTypes: minimalBlockTypes,
      rules: minimalRules,
      timeIncrement: 10,
      days: ['MON'],
      intakeGoals: { monthlyNewPatientGoal: 40 },
    };
    const a = JSON.stringify(generateThreeVariants(inp));
    const b = JSON.stringify(generateThreeVariants(inp));
    expect(a).toBe(b);
  });
});
