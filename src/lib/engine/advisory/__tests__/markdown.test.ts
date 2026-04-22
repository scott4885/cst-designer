import { describe, it, expect } from 'vitest';
import { renderAdvisoryMarkdown, renderUserPrompt } from '../markdown';
import { composeAdvisory } from '../compose';
import { scoreTemplate } from '../scoring';
import { composeReviewPlan } from '../review-plan';
import type { GenerationResult } from '../../types';

function mockDay(): GenerationResult {
  return {
    dayOfWeek: 'MON',
    slots: [
      {
        time: '08:00',
        providerId: 'P1',
        operatory: 'OP1',
        staffingCode: 'D',
        blockTypeId: 'bt-hp',
        blockLabel: 'HP',
        isBreak: false,
        blockInstanceId: 'b1',
      },
    ],
    productionSummary: [
      {
        providerId: 'P1',
        providerName: 'Dr. Test',
        dailyGoal: 5000,
        target75: 5000,
        actualScheduled: 5100,
        status: 'MET',
        blocks: [],
      },
    ],
    warnings: [],
    guardReport: null,
  };
}

describe('markdown exporter', () => {
  it('renders an 8-section advisory with header metadata', () => {
    const week = [mockDay()];
    const score = scoreTemplate(week, {}, '', { computedAt: 'fixed' });
    const doc = composeAdvisory({
      officeName: 'Test Office',
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: 1,
      weekResults: week,
      score,
      intakeGoals: {},
      intakeConstraints: {},
      generatedAt: 'fixed',
    });
    const reviewPlan = composeReviewPlan(score, {}, {}, { generatedAt: 'fixed' });
    const md = renderAdvisoryMarkdown(doc, score, reviewPlan);
    expect(md).toContain('# Test Office — Schedule Advisory');
    expect(md).toContain('## 1. Executive Summary');
    expect(md).toContain('## 2. Template Score');
    expect(md).toContain('## 3. Key Inputs & Assumptions');
    expect(md).toContain('## 4. Recommended Weekly Template');
    expect(md).toContain('## 5. Block Rationale');
    expect(md).toContain('## 6. Risks & Tradeoffs');
    expect(md).toContain('## 7. KPIs to Monitor');
    expect(md).toContain('## 8. Review Timeline');
    expect(md).toContain('LEVIN_60');
    expect(md).toContain('Day 30');
    expect(md).toContain('Day 60');
    expect(md).toContain('Day 90');
  });

  it('renderUserPrompt emits docx-style sections with JSON blobs', () => {
    const week = [mockDay()];
    const score = scoreTemplate(week, {}, '', { computedAt: 'fixed' });
    const doc = composeAdvisory({
      officeName: 'Copy Test',
      practiceModel: '1D2O',
      productionPolicy: 'LEVIN_60',
      weekLabel: 'Week A',
      providerCount: 1,
      weekResults: week,
      score,
      intakeGoals: { monthlyNewPatientGoal: 40 },
      intakeConstraints: { productionLeakage: 'PM shrinks' },
      generatedAt: 'fixed',
    });
    const prompt = renderUserPrompt(doc, {
      intakeGoalsJson: { monthlyNewPatientGoal: 40 },
      intakeConstraintsJson: { productionLeakage: 'PM shrinks' },
    });
    expect(prompt).toContain('## PRACTICE');
    expect(prompt).toContain('## GOALS');
    expect(prompt).toContain('## CONSTRAINTS + ISSUES');
    expect(prompt).toContain('## OUTPUT REQUEST');
    expect(prompt).toContain('monthlyNewPatientGoal');
  });
});
