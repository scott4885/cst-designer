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

  // ---- Sprint 6 Epic R — variant-weighted KPI scaling ---------------------

  it('rescales % targets up when Growth profile is committed', () => {
    const GROWTH = {
      code: 'GROWTH' as const,
      label: 'Growth',
      productionPolicy: 'FARRAN_75_BY_NOON' as const,
      overrides: {
        npBlocksPerDay: 2,
        srpBlocksPerDay: 1,
        hpPlacement: 'MORNING' as const,
        doubleBooking: false,
      },
      weights: {
        productionPct: 75,
        npAccessPct: 15,
        emergencyAccessPct: 10,
        hygieneSupportPct: 0,
        doctorContinuityPct: 0,
      },
    };
    const base = composeReviewPlan(makeScore(), {}, {});
    const growth = composeReviewPlan(makeScore(), {}, {}, {
      chosenVariantProfile: GROWTH,
    });
    // Milestone summaries mention the variant name
    for (const m of growth.milestones) {
      expect(m.summary).toContain('Growth');
    }
    // Plan still has 3 milestones
    expect(growth.milestones.map((m) => m.day)).toEqual([30, 60, 90]);
    // And the structural cardinality is preserved (scaling is on target strings only).
    for (let i = 0; i < 3; i++) {
      expect(growth.milestones[i].kpis.length).toBe(base.milestones[i].kpis.length);
    }
  });

  it('milestone summaries do not mention a variant when none committed', () => {
    const plan = composeReviewPlan(makeScore(), {}, {});
    for (const m of plan.milestones) {
      expect(m.summary).not.toContain('Growth');
      expect(m.summary).not.toContain('Access');
      expect(m.summary).not.toContain('Balanced');
    }
  });
});
