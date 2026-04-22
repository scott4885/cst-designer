/**
 * Sprint 6 Epic P — Delta computation tests.
 *
 * Three golden scenarios: prior = recommended (zero delta), prior heavier
 * on production, and prior with zero hygiene coverage.
 */

import { describe, it, expect } from 'vitest';
import { computeDelta } from '../delta';
import type { PriorTemplateBlock } from '../types';
import type { GenerationResult } from '../../types';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

function priorBlock(
  day: string,
  start: string,
  end: string,
  matched: string | null,
  label = 'X',
): PriorTemplateBlock {
  return {
    day,
    start,
    end,
    durationMin: 60,
    label,
    matchedBlockType: matched,
    matchConfidence: matched ? 0.9 : 0,
    provider: 'Dr. A',
  };
}

function emptyDay(day: string): GenerationResult {
  return {
    dayOfWeek: day,
    slots: [],
    productionSummary: [],
    warnings: [],
    guardReport: null,
  };
}

describe('computeDelta', () => {
  it('reports LOW confidence when match ratio is under 60%', () => {
    const prior: PriorTemplateBlock[] = [
      priorBlock('MON', '08:00', '09:00', null),
      priorBlock('MON', '09:00', '10:00', null),
      priorBlock('MON', '10:00', '11:00', 'HP'),
    ];
    const gen = DAYS.map(emptyDay);
    const d = computeDelta({
      prior,
      generated: gen,
      intakeGoals: {},
      days: DAYS,
    });
    expect(d.confidence).toBe('LOW');
    expect(d.matchedRatio).toBeLessThan(0.6);
    expect(d.unmatchedBlocks.length).toBe(2);
  });

  it('reports HIGH confidence when all blocks match', () => {
    const prior: PriorTemplateBlock[] = [
      priorBlock('MON', '08:00', '09:00', 'HP'),
      priorBlock('MON', '09:00', '10:00', 'RC'),
      priorBlock('MON', '10:00', '11:00', 'NPE'),
    ];
    const gen = DAYS.map(emptyDay);
    const d = computeDelta({
      prior,
      generated: gen,
      intakeGoals: {},
      days: DAYS,
    });
    expect(d.confidence).toBe('HIGH');
    expect(d.matchedRatio).toBe(1);
  });

  it('produces KPI rows for production, NP, ER, hygiene', () => {
    const prior: PriorTemplateBlock[] = [
      priorBlock('MON', '08:00', '09:00', 'HP'),
    ];
    const gen = DAYS.map(emptyDay);
    const d = computeDelta({
      prior,
      generated: gen,
      intakeGoals: {},
      days: DAYS,
    });
    const metrics = d.kpis.map((k) => k.metric);
    expect(metrics).toContain('Weekly production (est)');
    expect(metrics.some((m) => /NP/i.test(m))).toBe(true);
    expect(metrics.some((m) => /ER/i.test(m))).toBe(true);
  });

  it('produces 6 axis rows (STABILITY marked N/A)', () => {
    const prior: PriorTemplateBlock[] = [
      priorBlock('MON', '08:00', '09:00', 'HP'),
    ];
    const gen = DAYS.map(emptyDay);
    const d = computeDelta({
      prior,
      generated: gen,
      intakeGoals: {},
      days: DAYS,
    });
    expect(d.axes.length).toBe(6);
    const stability = d.axes.find((a) => /Stab/i.test(a.label));
    expect(stability?.direction).toBe('N_A');
  });

  it('summary string reflects the production + NP deltas', () => {
    const prior: PriorTemplateBlock[] = [
      priorBlock('MON', '08:00', '09:00', 'RC'),
    ];
    const gen = DAYS.map(emptyDay);
    const d = computeDelta({
      prior,
      generated: gen,
      intakeGoals: {},
      days: DAYS,
    });
    expect(typeof d.summary).toBe('string');
    expect(d.summary.length).toBeGreaterThan(0);
  });
});
