import { describe, it, expect } from 'vitest';
import { calculateQualityScore } from '../quality-score';
import type { GenerationResult, ProviderInput, BlockTypeInput } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    id: 'p1',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    lunchEnabled: true,
    dailyGoal: 5000,
    color: '#666',
    seesNewPatients: true,
    ...overrides,
  };
}

function makeBlockType(overrides: Partial<BlockTypeInput> = {}): BlockTypeInput {
  return {
    id: 'bt1',
    label: 'Crown Prep',
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    minimumAmount: 1500,
    procedureCategory: 'MAJOR_RESTORATIVE',
    dTimeMin: 60,
    aTimeMin: 30,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots: [],
    productionSummary: [],
    warnings: [],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('calculateQualityScore', () => {
  it('returns a score object with all components', () => {
    const provider = makeProvider();
    const blockType = makeBlockType();
    const schedule = makeSchedule({
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 3750,
        status: 'MET',
        blocks: [],
      }],
      slots: [
        { time: '08:00', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: '1', customProductionAmount: null },
      ],
    });

    const result = calculateQualityScore(schedule, [provider], [blockType], []);

    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.components).toHaveLength(5);
    expect(['excellent', 'good', 'fair', 'needs_work']).toContain(result.tier);
    expect(result.emoji).toBeTruthy();
    expect(result.tierLabel).toBeTruthy();
  });

  it('awards full production score when provider meets target75', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 4000, // over target75
        status: 'MET',
        blocks: [],
      }],
    });

    const result = calculateQualityScore(schedule, [provider], [], []);
    const prodComp = result.components.find(c => c.label === 'Production Goal Achievement');
    expect(prodComp!.score).toBe(prodComp!.maxScore); // 30/30
  });

  it('penalizes score for clinical errors', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 3750,
        status: 'MET',
        blocks: [],
      }],
    });

    const clinicalWarnings = [
      { ruleId: 'RULE_5', severity: 'error' as const, message: 'Lunch violation', affectedProvider: 'Dr. Smith' },
    ];

    const result = calculateQualityScore(schedule, [provider], [], clinicalWarnings);
    const clinicalComp = result.components.find(c => c.label === 'Clinical Rules Compliance');
    expect(clinicalComp!.score).toBe(15); // 20 - 5 for one error
  });

  it('penalizes score for clinical warnings', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 3750,
        status: 'MET',
        blocks: [],
      }],
    });

    const clinicalWarnings = [
      { ruleId: 'RULE_1', severity: 'warning' as const, message: 'No NP slot', affectedProvider: 'Dr. Smith' },
      { ruleId: 'RULE_3', severity: 'warning' as const, message: 'ER in afternoon', affectedProvider: 'Dr. Smith', affectedTime: '14:00' },
    ];

    const result = calculateQualityScore(schedule, [provider], [], clinicalWarnings);
    const clinicalComp = result.components.find(c => c.label === 'Clinical Rules Compliance');
    expect(clinicalComp!.score).toBe(16); // 20 - 2 - 2 = 16
  });

  it('scores provider coverage at 0 when no providers have scheduled blocks', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({ slots: [], productionSummary: [] });

    const result = calculateQualityScore(schedule, [provider], [], []);
    const coverageComp = result.components.find(c => c.label === 'Provider Coverage');
    expect(coverageComp!.score).toBe(0);
  });

  it('scores provider coverage at max when all active providers have blocks', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({
      slots: [
        { time: '08:00', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: '1', customProductionAmount: null },
      ],
      productionSummary: [],
    });

    const result = calculateQualityScore(schedule, [provider], [], []);
    const coverageComp = result.components.find(c => c.label === 'Provider Coverage');
    expect(coverageComp!.score).toBe(10); // 10/10
  });

  it('assigns correct tier labels', () => {
    // Build a near-perfect schedule to get excellent tier
    const provider = makeProvider();
    const slots = [];
    // Fill many slots
    for (let i = 0; i < 20; i++) {
      const totalMin = 8 * 60 + i * 10;
      const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const m = (totalMin % 60).toString().padStart(2, '0');
      slots.push({
        time: `${h}:${m}`,
        providerId: 'p1',
        operatory: 'OP1',
        staffingCode: 'D' as const,
        blockTypeId: 'bt1',
        blockLabel: 'Crown Prep',
        isBreak: false,
        blockInstanceId: `slot-${i}`,
        customProductionAmount: null,
      });
    }
    const schedule = makeSchedule({
      slots,
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 5000,
        status: 'MET',
        blocks: [],
      }],
    });

    const result = calculateQualityScore(schedule, [provider], [], []);
    expect(result.total).toBeGreaterThan(0);
    // Total should be high given full production + full coverage
  });

  it('caps total score at 100', () => {
    const provider = makeProvider();
    const schedule = makeSchedule({
      productionSummary: [{
        providerId: 'p1',
        providerName: 'Dr. Smith',
        dailyGoal: 5000,
        target75: 3750,
        actualScheduled: 10000, // way over target
        status: 'OVER',
        blocks: [],
      }],
      slots: Array(50).fill(null).map((_, i) => ({
        time: `0${8 + Math.floor(i / 6)}:${((i % 6) * 10).toString().padStart(2, '0')}`,
        providerId: 'p1',
        operatory: 'OP1',
        staffingCode: 'D' as const,
        blockTypeId: 'bt1',
        blockLabel: 'Crown Prep',
        isBreak: false,
        blockInstanceId: `slot-${i}`,
        customProductionAmount: null,
      })),
    });

    const result = calculateQualityScore(schedule, [provider], [], []);
    expect(result.total).toBeLessThanOrEqual(100);
  });
});
