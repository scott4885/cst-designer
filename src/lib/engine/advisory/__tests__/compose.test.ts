import { describe, it, expect } from 'vitest';
import { composeAdvisory } from '../compose';
import { scoreTemplate } from '../scoring';
import type { GenerationResult } from '../../types';

function mockDay(day: string): GenerationResult {
  return {
    dayOfWeek: day,
    slots: [
      {
        time: '08:00',
        providerId: 'P1',
        operatory: 'OP1',
        staffingCode: 'D',
        blockTypeId: 'bt-hp',
        blockLabel: 'HP',
        isBreak: false,
        blockInstanceId: `${day}-b1`,
      },
      {
        time: '09:00',
        providerId: 'P1',
        operatory: 'OP1',
        staffingCode: 'D',
        blockTypeId: 'bt-np',
        blockLabel: 'NP',
        isBreak: false,
        blockInstanceId: `${day}-b2`,
      },
    ],
    productionSummary: [
      {
        providerId: 'P1',
        providerName: 'Dr. Test',
        dailyGoal: 5000,
        target75: 5000,
        actualScheduled: 4800,
        status: 'MET',
        blocks: [],
      },
    ],
    warnings: [],
    guardReport: null,
  };
}

describe('composeAdvisory', () => {
  it('produces a 6-section document with an executive summary narrative', () => {
    const week = [mockDay('MON'), mockDay('TUE')];
    const score = scoreTemplate(week, { monthlyNewPatientGoal: 40 }, '');
    const doc = composeAdvisory({
      officeName: 'Test Office',
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: 1,
      weekResults: week,
      score,
      intakeGoals: { monthlyNewPatientGoal: 40 },
      intakeConstraints: {},
    });
    expect(doc.executiveSummary.narrative.length).toBeGreaterThan(50);
    expect(doc.keyInputs.length).toBeGreaterThan(5);
    expect(doc.weeklyTemplate.length).toBeGreaterThan(0);
    expect(doc.blockRationale).toHaveLength(2);
    expect(doc.kpis.length).toBeGreaterThanOrEqual(6);
    expect(doc.kpis.length).toBeLessThanOrEqual(8);
  });

  it('flags weeklyGoalStatus=UNDER when production is < 85% of target', () => {
    const day: GenerationResult = {
      dayOfWeek: 'MON',
      slots: [],
      productionSummary: [
        {
          providerId: 'P1',
          providerName: 'Dr. Test',
          dailyGoal: 10000,
          target75: 10000,
          actualScheduled: 4000,
          status: 'UNDER',
          blocks: [],
        },
      ],
      warnings: [],
      guardReport: null,
    };
    const week = [day];
    const score = scoreTemplate(week, {}, '');
    const doc = composeAdvisory({
      officeName: 'Under Office',
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: 1,
      weekResults: week,
      score,
      intakeGoals: {},
      intakeConstraints: {},
    });
    expect(doc.executiveSummary.weeklyGoalStatus).toBe('UNDER');
  });

  it('is deterministic', () => {
    const week = [mockDay('MON')];
    const score = scoreTemplate(week, {}, '', { computedAt: 'fixed' });
    const inp = {
      officeName: 'Det',
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: 1,
      weekResults: week,
      score,
      intakeGoals: {},
      intakeConstraints: {},
      generatedAt: 'fixed',
    };
    expect(JSON.stringify(composeAdvisory(inp))).toBe(JSON.stringify(composeAdvisory(inp)));
  });
});
