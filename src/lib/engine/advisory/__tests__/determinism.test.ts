/**
 * Phase 7 regression test — Advisory pipeline is byte-deterministic.
 *
 * Phase 7 live smoke found that two identical `POST /api/offices/:id/advisory`
 * calls produced different `weeklyProductionRatio` values (1.92 / 1.95 / 2.01
 * / 2.10) because the advisory route's main-path `generateSchedule()` call
 * did not pass a seed. This test replays the same pipeline the route uses
 * (main-path generator → scoring → composeAdvisory → variants) and asserts
 * that two back-to-back runs produce byte-identical JSON once timestamp
 * fields are stripped.
 *
 * This test would FAIL without the seed fix introduced in seed.ts and the
 * route change that passes `seed: advisorySeed(officeId, 'MAIN', day)` into
 * every generator invocation.
 */

import { describe, it, expect } from 'vitest';
import type {
  ProviderInput,
  BlockTypeInput,
  ScheduleRules,
  GenerationInput,
  GenerationResult,
} from '../../types';
import { generateSchedule } from '../../generator';
import { scoreTemplate } from '../scoring';
import { composeAdvisory } from '../compose';
import { composeReviewPlan } from '../review-plan';
import { generateThreeVariants } from '../variants';
import { advisorySeed } from '../seed';
import type { IntakeGoals, IntakeConstraints } from '../types';

// ---------------------------------------------------------------------------
// Minimal fixture — same shape as the advisory route input
// ---------------------------------------------------------------------------

const provider: ProviderInput = {
  id: 'P1',
  name: 'Dr. Determinism',
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
  dayOfWeekRoster: ['MON', 'TUE', 'WED'],
  providerSchedule: {},
  currentProcedureMix: {},
  futureProcedureMix: {},
};

const blockTypes: BlockTypeInput[] = [
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

const rules: ScheduleRules = {
  npModel: 'DOCTOR_ONLY',
  npBlocksPerDay: 2,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING',
  doubleBooking: false,
  matrixing: true,
  emergencyHandling: 'ACCESS_BLOCKS',
};

const intakeGoals: IntakeGoals = {
  practiceType: 'general',
  monthlyProductionGoal: 80000,
  dailyProductionGoal: 4000,
  monthlyNewPatientGoal: 40,
  hygieneDemandLevel: 'MEDIUM',
  perioDemand: 'MEDIUM',
  emergencyAccessGoal: 'NEXT_DAY',
  sameDayTreatmentGoalPct: 60,
  growthPriority: 'STABILITY',
  npHygieneFlow: 'DOCTOR_ONLY',
};

const intakeConstraints: IntakeConstraints = {};

// ---------------------------------------------------------------------------
// Pipeline wrapper — mirrors src/app/api/offices/[id]/advisory/route.ts
// ---------------------------------------------------------------------------

function runAdvisoryPipeline(officeId: string) {
  const days = ['MON', 'TUE', 'WED'];

  // Main-path generator with stable per-day seed (Phase 7 fix).
  const weekResults: GenerationResult[] = [];
  for (const day of days) {
    const input: GenerationInput = {
      providers: [provider],
      blockTypes,
      rules,
      timeIncrement: 10,
      dayOfWeek: day,
      seed: advisorySeed(officeId, 'MAIN', day),
    };
    weekResults.push(generateSchedule(input));
  }

  const score = scoreTemplate(weekResults, intakeGoals, '', {
    computedAt: new Date(0).toISOString(),
  });

  const variants = generateThreeVariants({
    officeId,
    officeName: 'Det Office',
    providers: [provider],
    blockTypes,
    rules,
    timeIncrement: 10,
    days,
    intakeGoals,
  });

  const document = composeAdvisory({
    officeName: 'Det Office',
    practiceModel: '1D2O',
    productionPolicy: 'LEVIN_60',
    weekLabel: 'Week A',
    providerCount: 1,
    weekResults,
    score,
    intakeGoals,
    intakeConstraints,
    winningVariantLabel: variants.recommendation.winner,
    generatedAt: new Date(0).toISOString(),
  });

  const reviewPlan = composeReviewPlan(score, intakeGoals, intakeConstraints, {
    generatedAt: new Date(0).toISOString(),
  });

  return { document, score, variants, reviewPlan };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 7 — advisory pipeline determinism', () => {
  it('advisorySeed returns a stable integer for identical inputs', () => {
    const a = advisorySeed('office-abc', 'MAIN', 'MON');
    const b = advisorySeed('office-abc', 'MAIN', 'MON');
    expect(a).toBe(b);
    expect(Number.isInteger(a)).toBe(true);
  });

  it('advisorySeed differs when any input differs', () => {
    const base = advisorySeed('office-abc', 'MAIN', 'MON');
    expect(advisorySeed('office-xyz', 'MAIN', 'MON')).not.toBe(base);
    expect(advisorySeed('office-abc', 'GROWTH', 'MON')).not.toBe(base);
    expect(advisorySeed('office-abc', 'MAIN', 'TUE')).not.toBe(base);
  });

  it('two back-to-back pipeline runs produce byte-identical document JSON', () => {
    const a = runAdvisoryPipeline('office-determinism-1');
    const b = runAdvisoryPipeline('office-determinism-1');
    expect(JSON.stringify(a.document)).toBe(JSON.stringify(b.document));
  });

  it('scoring output is byte-identical across runs', () => {
    const a = runAdvisoryPipeline('office-determinism-2');
    const b = runAdvisoryPipeline('office-determinism-2');
    expect(JSON.stringify(a.score)).toBe(JSON.stringify(b.score));
  });

  it('variants set is byte-identical across runs', () => {
    const a = runAdvisoryPipeline('office-determinism-3');
    const b = runAdvisoryPipeline('office-determinism-3');
    expect(JSON.stringify(a.variants)).toBe(JSON.stringify(b.variants));
  });

  it('review plan is byte-identical across runs', () => {
    const a = runAdvisoryPipeline('office-determinism-4');
    const b = runAdvisoryPipeline('office-determinism-4');
    expect(JSON.stringify(a.reviewPlan)).toBe(JSON.stringify(b.reviewPlan));
  });

  it('weeklyProductionRatio (via executive summary) is stable — the actual Phase 7 regression', () => {
    // Before Phase 7 fix: the narrative string embedded the production ratio
    // as an integer percent ("192%", "195%", "201%", "210%") which drifted
    // between runs. After the fix, that number is locked because the
    // underlying generator is seeded.
    const a = runAdvisoryPipeline('office-weekly-ratio');
    const b = runAdvisoryPipeline('office-weekly-ratio');
    const c = runAdvisoryPipeline('office-weekly-ratio');
    expect(a.document.executiveSummary.narrative).toBe(b.document.executiveSummary.narrative);
    expect(b.document.executiveSummary.narrative).toBe(c.document.executiveSummary.narrative);
  });

  it('variant headlineKpis.productionTotal is stable — the cascaded Phase 7 regression', () => {
    // Before Phase 7 fix: variant production totals drifted ~9% because even
    // though variants.ts seeded its own generator calls, the fact that this
    // test exists here guards against regressions where variants might pick
    // up a non-seeded code path in the future.
    const a = runAdvisoryPipeline('office-variant-kpi');
    const b = runAdvisoryPipeline('office-variant-kpi');
    for (let i = 0; i < a.variants.variants.length; i++) {
      expect(a.variants.variants[i].headlineKpis.productionTotal).toBe(
        b.variants.variants[i].headlineKpis.productionTotal,
      );
    }
  });
});
