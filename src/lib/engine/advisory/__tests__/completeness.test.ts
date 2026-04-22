import { describe, it, expect } from 'vitest';
import { computeIntakeCompleteness, TOTAL_FIELDS } from '../completeness';

describe('computeIntakeCompleteness', () => {
  it('returns 0 HAVE when both blobs are empty and no derived fields', () => {
    const c = computeIntakeCompleteness({}, {}, 0);
    expect(c.haveFields).toBe(0);
    expect(c.completenessPct).toBe(0);
    expect(c.gateOpen).toBe(false);
    expect(c.totalFields).toBe(TOTAL_FIELDS);
  });

  it('counts populated fields and unlocks gate at >= 80%', () => {
    const goals = {
      practiceType: 'general',
      monthlyProductionGoal: 300000,
      dailyProductionGoal: 15000,
      monthlyNewPatientGoal: 40,
      hygieneReappointmentDemand: 'HIGH' as const,
      emergencyAccessGoal: 'SAME_DAY' as const,
      sameDayTreatmentGoalPct: 25,
      growthPriority: 'MORE_PRODUCTION' as const,
      mainSchedulingProblems: 'NP booked > 2 weeks out',
      hygieneDemandLevel: 'HIGH' as const,
      doctorExamFrequencyNeeded: 'EVERY_VISIT' as const,
      perioDemand: 'MEDIUM' as const,
      npHygieneFlow: 'EITHER' as const,
      hygieneBottlenecks: 'PM exam gaps',
    };
    const constraints = {
      existingCommitments: 'Wed 8am huddle',
      providerPreferences: 'Dr. Chen prefers AM HP',
      teamLimitations: 'single hygienist Fridays',
      roomEquipmentLimitations: 'OP3 no laser',
      mustStayOpenBlocks: 'Thu 2pm access',
      neverUseForBlocks: 'no HP after 3pm',
      productionLeakage: 'PM shrinks',
      poorAccess: 'NP 14d',
      overbookedSlots: 'Thu afternoons',
      underutilizedSlots: 'Mon early',
      noShowCancellationPatterns: 'PM cancellations',
      highValueProcedures: 'Crown, implants',
      flexibleProcedures: 'prophy',
      limitedExamDurationMin: 20,
    };
    const c = computeIntakeCompleteness(goals, constraints, 9);
    expect(c.haveFields).toBe(TOTAL_FIELDS);
    expect(c.completenessPct).toBe(100);
    expect(c.gateOpen).toBe(true);
  });

  it('gate opens at exactly 80%', () => {
    // With TOTAL_FIELDS = 37, 80% threshold = 29.6 → 30 populated
    const goals = {
      practiceType: 'x',
      monthlyProductionGoal: 1,
      dailyProductionGoal: 1,
      monthlyNewPatientGoal: 1,
      hygieneReappointmentDemand: 'LOW' as const,
      emergencyAccessGoal: 'NONE' as const,
      sameDayTreatmentGoalPct: 1,
      growthPriority: 'STABILITY' as const,
      mainSchedulingProblems: 'x',
      hygieneDemandLevel: 'LOW' as const,
      doctorExamFrequencyNeeded: 'AS_NEEDED' as const,
      perioDemand: 'LOW' as const,
      npHygieneFlow: 'EITHER' as const,
      hygieneBottlenecks: 'x',
    };
    const constraints = {
      existingCommitments: 'x',
      providerPreferences: 'x',
      teamLimitations: 'x',
      roomEquipmentLimitations: 'x',
      mustStayOpenBlocks: 'x',
      neverUseForBlocks: 'x',
      productionLeakage: 'x',
      poorAccess: 'x',
    };
    const c = computeIntakeCompleteness(goals, constraints, 8);
    expect(c.haveFields).toBe(14 + 8 + 8);
    expect(c.completenessPct).toBeGreaterThanOrEqual(80);
    expect(c.gateOpen).toBe(true);
  });
});
