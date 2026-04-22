import { describe, it, expect } from 'vitest';
import { composeReviewPlan } from '../review-plan';
import type { TemplateScore } from '../types';

function makeScore(overrides: Partial<Record<string, number>> = {}): TemplateScore {
  const axisCodes = ['PRODUCTION', 'NP_ACCESS', 'EMERGENCY', 'HYGIENE', 'USABILITY', 'STABILITY'] as const;
  const axes = axisCodes.map((code) => ({
    axis: code,
    label: code,
    score: overrides[code] ?? 8,
    band: 'strong' as const,
    signals: [],
    raiseSuggestions: [],
  }));
  return {
    overall: 8,
    band: 'strong',
    axes,
    computedAt: 'fixed',
  };
}

describe('composeReviewPlan', () => {
  it('returns exactly 3 milestones at days 30/60/90', () => {
    const plan = composeReviewPlan(makeScore(), {}, {});
    expect(plan.milestones.map((m) => m.day)).toEqual([30, 60, 90]);
    for (const m of plan.milestones) {
      expect(m.kpis.length).toBeGreaterThan(0);
      expect(m.summary.length).toBeGreaterThan(20);
    }
  });

  it('adds PM_FILL_RATE when intake flags PM cancellations', () => {
    const plan = composeReviewPlan(
      makeScore(),
      {},
      { noShowCancellationPatterns: 'Late afternoon cancellations are high' },
    );
    const day30Metrics = plan.milestones[0].kpis.map((k) => k.metric).join(' | ');
    expect(day30Metrics).toContain('Afternoon fill rate');
  });

  it('adds days-to-NP when NP_ACCESS scores weak', () => {
    const plan = composeReviewPlan(makeScore({ NP_ACCESS: 4 }), {}, {});
    const day30Metrics = plan.milestones[0].kpis.map((k) => k.metric);
    expect(day30Metrics.some((m) => /NP/.test(m))).toBe(true);
  });

  it('is deterministic', () => {
    const a = JSON.stringify(composeReviewPlan(makeScore(), {}, {}, { generatedAt: 'fixed' }));
    const b = JSON.stringify(composeReviewPlan(makeScore(), {}, {}, { generatedAt: 'fixed' }));
    expect(a).toBe(b);
  });
});
