/**
 * Sprint 6 Epic Q — Fact-check tests.
 *
 * 8-case matrix covering: pass, each of the 6 violation codes, and a
 * forgiving-score-format edge case.
 */

import { describe, it, expect } from 'vitest';
import { factCheck } from '../fact-check';
import type { AdvisoryDocument, TemplateScore } from '../types';

function makeScore(): TemplateScore {
  return {
    overall: 8,
    band: 'strong',
    axes: [
      { axis: 'PRODUCTION', label: 'Production Potential', score: 8, band: 'strong', signals: [], raiseSuggestions: [] },
      { axis: 'NP_ACCESS', label: 'NP Access', score: 7, band: 'fair', signals: [], raiseSuggestions: [] },
      { axis: 'EMERGENCY', label: 'Emergency Access', score: 6, band: 'fair', signals: [], raiseSuggestions: [] },
      { axis: 'HYGIENE', label: 'Hygiene Support', score: 9, band: 'strong', signals: [], raiseSuggestions: [] },
      { axis: 'USABILITY', label: 'Team Usability', score: 8, band: 'strong', signals: [], raiseSuggestions: [] },
      { axis: 'STABILITY', label: 'Schedule Stability', score: 7, band: 'fair', signals: [], raiseSuggestions: [] },
    ],
    computedAt: 'fixed',
  };
}

function makeDoc(): AdvisoryDocument {
  return {
    executiveSummary: {
      narrative: 'All systems nominal.',
      practiceName: 'Test Office',
      productionPolicy: 'LEVIN_60',
      weeklyGoalStatus: 'ON_TRACK',
      topRecommendation: 'Keep going.',
    } as AdvisoryDocument['executiveSummary'],
    keyInputs: [],
    weeklyTemplate: [],
    blockRationale: [],
    risks: [
      { ruleCode: 'AP-7', severity: 'soft', plainEnglish: 'Morning load too light on Tuesdays.' },
      { ruleCode: 'R-3.5', severity: 'hard', plainEnglish: 'Hygiene bottleneck at 10am.' },
    ],
    kpis: [
      { metric: 'Daily production vs goal', target: '≥ 95%', whyItMatters: 'production' },
      { metric: 'Days-to-NP', target: '≤ 5', whyItMatters: 'access' },
    ],
    officeName: 'Test Office',
    generatedAt: 'fixed',
    productionPolicy: 'LEVIN_60',
    practiceModel: '1D2O',
    weekLabel: 'Week A',
  };
}

function makePassingMarkdown(): string {
  return `# Test Office — Schedule Advisory

## 1. Executive Summary
All systems nominal.

## 2. Key Inputs & Assumptions
| Field | Value | Source |
| --- | --- | --- |
| n/a | n/a | n/a |

**Template Score**
| Axis | Score | Band |
| --- | --- | --- |
| Production Potential | 8 | strong |
| NP Access | 7 | fair |
| Emergency Access | 6 | fair |
| Hygiene Support | 9 | strong |
| Team Usability | 8 | strong |
| Schedule Stability | 7 | fair |

## 3. Recommended Weekly Template
Table goes here.

## 4. Block Rationale
Rationale goes here.

## 5. Risks & Trade-offs
- AP-7 Morning load too light on Tuesdays.
- R-3.5 Hygiene bottleneck at 10am.

## 6. KPIs to Monitor
- Daily production vs goal — ≥ 95%
- Days-to-NP — ≤ 5

## 7. Variants
No variants requested.

## 8. Review Timeline
30 / 60 / 90 checkpoints below.`;
}

describe('factCheck', () => {
  it('PASS — a clean rewrite passes all checks', () => {
    const r = factCheck({
      original: makeDoc(),
      rewrite: makePassingMarkdown(),
      score: makeScore(),
    });
    expect(r.passed).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('SCORE_MUTATED — flags changed axis score', () => {
    const md = makePassingMarkdown().replace(
      '| Production Potential | 8 | strong |',
      '| Production Potential | 9 | strong |',
    );
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.code === 'SCORE_MUTATED')).toBe(true);
  });

  it('AXIS_MISSING — flags removed axis', () => {
    const md = makePassingMarkdown().replace(
      '| Production Potential | 8 | strong |\n',
      '',
    );
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.code === 'AXIS_MISSING')).toBe(true);
  });

  it('AXIS_INVENTED — fires when a canonical axis is absent from the score', () => {
    // Remove Hygiene Support from the score but leave it in the rewrite — the
    // fact-check should flag it as invented (present in rewrite but not in score).
    const score = makeScore();
    score.axes = score.axes.filter((a) => a.label !== 'Hygiene Support');
    const r = factCheck({
      original: makeDoc(),
      rewrite: makePassingMarkdown(),
      score,
    });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.code === 'AXIS_INVENTED')).toBe(true);
  });

  it('RISK_DROPPED — flags removed risk', () => {
    const md = makePassingMarkdown().replace(
      '- AP-7 Morning load too light on Tuesdays.\n',
      '',
    );
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.code === 'RISK_DROPPED')).toBe(true);
  });

  it('STRUCTURE_BROKEN — flags missing section header', () => {
    const md = makePassingMarkdown().replace('## 5. Risks & Trade-offs', '');
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.passed).toBe(false);
    expect(r.violations.some((v) => v.code === 'STRUCTURE_BROKEN')).toBe(true);
  });

  it('accepts rephrased risks when the ruleCode is preserved', () => {
    const md = makePassingMarkdown()
      .replace(
        '- AP-7 Morning load too light on Tuesdays.',
        '- AP-7 — The Tuesday morning columns are under-utilised relative to policy.',
      )
      .replace(
        '- R-3.5 Hygiene bottleneck at 10am.',
        '- R-3.5 — 10 AM hygiene capacity is a chokepoint.',
      );
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.passed).toBe(true);
  });

  it('tolerates forgiving score format (e.g. "8/10")', () => {
    const md = makePassingMarkdown().replace(
      '| Production Potential | 8 | strong |',
      '| Production Potential | 8/10 | strong |',
    );
    const r = factCheck({ original: makeDoc(), rewrite: md, score: makeScore() });
    expect(r.violations.find((v) => v.code === 'SCORE_MUTATED')).toBeUndefined();
  });
});
