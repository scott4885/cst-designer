import { describe, it, expect } from 'vitest';
import { scoreTemplate } from '../scoring';
import type { GenerationResult } from '../../types';
import type { IntakeGoals } from '../types';

function slotOf(
  time: string,
  providerId: string,
  operatory: string,
  blockLabel: string,
  blockInstanceId: string,
): GenerationResult['slots'][number] {
  return {
    time,
    providerId,
    operatory,
    staffingCode: 'D',
    blockTypeId: null,
    blockLabel,
    isBreak: false,
    blockInstanceId,
  };
}

function mockDay(
  day: string,
  blocks: Array<{ time: string; label: string; id: string; providerId?: string; operatory?: string }>,
  productionActual = 5000,
  productionTarget = 5000,
): GenerationResult {
  return {
    dayOfWeek: day,
    slots: blocks.map((b) =>
      slotOf(b.time, b.providerId ?? 'P1', b.operatory ?? 'OP1', b.label, b.id),
    ),
    productionSummary: [
      {
        providerId: 'P1',
        providerName: 'Dr. Test',
        dailyGoal: productionTarget,
        target75: productionTarget,
        actualScheduled: productionActual,
        status: 'MET',
        blocks: [],
      },
    ],
    warnings: [],
    guardReport: {
      passed: true,
      results: [],
      violations: [],
      counts: { hard: 0, soft: 0, info: 0 },
    },
  };
}

describe('scoreTemplate', () => {
  it('produces 6 axes with integer scores 1-10 and a correct band', () => {
    const intake: IntakeGoals = { monthlyNewPatientGoal: 40, perioDemand: 'MEDIUM' };
    const week = [
      mockDay('MON', [
        { time: '08:00', label: 'HP', id: 'b1' },
        { time: '09:00', label: 'NP', id: 'b2' },
        { time: '10:00', label: 'ER', id: 'b3' },
        { time: '11:00', label: 'MP', id: 'b4' },
        { time: '13:00', label: 'SRP', id: 'b5' },
        { time: '14:00', label: 'RCPM', id: 'b6' },
      ]),
    ];
    const score = scoreTemplate(week, intake, '');
    expect(score.axes).toHaveLength(6);
    for (const a of score.axes) {
      expect(a.score).toBeGreaterThanOrEqual(1);
      expect(a.score).toBeLessThanOrEqual(10);
      expect(Number.isInteger(a.score)).toBe(true);
      expect(['weak', 'fair', 'strong']).toContain(a.band);
    }
    expect(['weak', 'fair', 'strong']).toContain(score.band);
    expect(score.overall).toBeGreaterThanOrEqual(1);
    expect(score.overall).toBeLessThanOrEqual(10);
  });

  it('is deterministic — same inputs produce byte-identical JSON', () => {
    const intake: IntakeGoals = { monthlyNewPatientGoal: 40 };
    const week = [mockDay('MON', [{ time: '08:00', label: 'HP', id: 'b1' }])];
    const a = JSON.stringify(scoreTemplate(week, intake, '', { computedAt: 'fixed' }));
    const b = JSON.stringify(scoreTemplate(week, intake, '', { computedAt: 'fixed' }));
    expect(a).toBe(b);
  });

  it('penalises stability when late-PM rocks are placed against an intake cancellation flag', () => {
    const intake: IntakeGoals = {};
    const cleanWeek = [
      mockDay('MON', [{ time: '08:00', label: 'HP', id: 'b1' }]),
    ];
    const riskyWeek = [
      mockDay('MON', [{ time: '15:30', label: 'HP', id: 'b2' }]),
    ];
    const clean = scoreTemplate(cleanWeek, intake, '');
    const risky = scoreTemplate(
      riskyWeek,
      intake,
      'Late afternoon has a high no-show rate, PM cancellations keep hitting restorative',
    );
    const cleanStab = clean.axes.find((a) => a.axis === 'STABILITY')!.score;
    const riskyStab = risky.axes.find((a) => a.axis === 'STABILITY')!.score;
    expect(riskyStab).toBeLessThanOrEqual(cleanStab);
  });

  it('lifts NP_ACCESS score when more NP slots are placed relative to the intake target', () => {
    const intake: IntakeGoals = { monthlyNewPatientGoal: 40 };
    const thin = [mockDay('MON', [{ time: '08:00', label: 'NP', id: 'b1' }])];
    const rich = [
      mockDay('MON', [
        { time: '08:00', label: 'NP', id: 'b1' },
        { time: '09:00', label: 'NP', id: 'b2' },
        { time: '10:00', label: 'NP', id: 'b3' },
      ]),
      mockDay('TUE', [
        { time: '08:00', label: 'NP', id: 'b4' },
        { time: '09:00', label: 'NP', id: 'b5' },
      ]),
    ];
    const thinScore = scoreTemplate(thin, intake, '').axes.find((a) => a.axis === 'NP_ACCESS')!.score;
    const richScore = scoreTemplate(rich, intake, '').axes.find((a) => a.axis === 'NP_ACCESS')!.score;
    expect(richScore).toBeGreaterThan(thinScore);
  });

  it('score.overall = clamped mean of the 6 axes', () => {
    const score = scoreTemplate(
      [mockDay('MON', [{ time: '08:00', label: 'HP', id: 'b1' }])],
      {},
      '',
    );
    const mean = score.axes.reduce((s, a) => s + a.score, 0) / 6;
    expect(score.overall).toBe(Math.round(Math.max(1, Math.min(10, mean))));
  });
});
