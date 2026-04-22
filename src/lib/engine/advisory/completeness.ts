/**
 * Sprint 5 Feature A — Intake completeness scoring.
 *
 * Counts how many of the 37 intake fields from SPRINT-5-PLAN §2.1 are
 * populated. Drives the header badge and the Generate button gate at
 * ≥ 80% completeness. "Populated" = truthy (non-empty string, non-zero
 * number, non-null enum).
 */

import type { IntakeGoals, IntakeConstraints, IntakeCompleteness } from './types';

// Field registry — labels mirror SPRINT-5-PLAN §2.1 row names.
const GOALS_FIELDS: Array<{ key: keyof IntakeGoals; label: string; includeIfProviderHas?: boolean }> = [
  { key: 'practiceType', label: 'Practice type' },
  { key: 'monthlyProductionGoal', label: 'Monthly production goal' },
  { key: 'dailyProductionGoal', label: 'Daily production goal' },
  { key: 'monthlyNewPatientGoal', label: 'Monthly new-patient goal' },
  { key: 'hygieneReappointmentDemand', label: 'Hygiene reappointment demand' },
  { key: 'emergencyAccessGoal', label: 'Emergency access goal' },
  { key: 'sameDayTreatmentGoalPct', label: 'Same-day treatment goal (%)' },
  { key: 'growthPriority', label: 'Growth priority' },
  { key: 'mainSchedulingProblems', label: 'Main scheduling problems to solve' },
  { key: 'hygieneDemandLevel', label: 'Hygiene demand level' },
  { key: 'doctorExamFrequencyNeeded', label: 'Doctor exam frequency needed' },
  { key: 'perioDemand', label: 'Perio demand' },
  { key: 'npHygieneFlow', label: 'NP hygiene flow' },
  { key: 'hygieneBottlenecks', label: 'Hygiene bottlenecks' },
];

const CONSTRAINTS_FIELDS: Array<{ key: keyof IntakeConstraints; label: string }> = [
  { key: 'existingCommitments', label: 'Existing commitments' },
  { key: 'providerPreferences', label: 'Provider preferences' },
  { key: 'teamLimitations', label: 'Team limitations' },
  { key: 'roomEquipmentLimitations', label: 'Room/equipment limitations' },
  { key: 'mustStayOpenBlocks', label: 'Must-stay-open blocks' },
  { key: 'neverUseForBlocks', label: 'Never-use-for blocks' },
  { key: 'productionLeakage', label: 'Production leakage' },
  { key: 'poorAccess', label: 'Poor access' },
  { key: 'overbookedSlots', label: 'Overbooked slots' },
  { key: 'underutilizedSlots', label: 'Underutilized slots' },
  { key: 'noShowCancellationPatterns', label: 'No-show/cancellation patterns' },
  { key: 'highValueProcedures', label: 'High-value procedures' },
  { key: 'flexibleProcedures', label: 'Flexible procedures' },
  { key: 'limitedExamDurationMin', label: 'Limited exam duration' },
];

// "Derived" fields: these come from the existing Office/Provider data and
// count as HAVE if the provider array is populated. Counted for totals so
// legacy offices still reach 80% when they have full provider data.
const DERIVED_FIELDS = [
  'Practice working days',
  'Provider working hours',
  'Provider lunch break',
  'Number of doctors',
  'Number of hygienists',
  'Number of operatories',
  'Most common procedures',
  'Average procedure times',
  'NP appointment length',
];

const TOTAL_FIELDS = GOALS_FIELDS.length + CONSTRAINTS_FIELDS.length + DERIVED_FIELDS.length;

function isPopulated(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return false;
}

export function computeIntakeCompleteness(
  goals: IntakeGoals = {},
  constraints: IntakeConstraints = {},
  derivedHaveCount = 0,
): IntakeCompleteness {
  const missing: string[] = [];
  let have = 0;

  for (const f of GOALS_FIELDS) {
    if (isPopulated(goals[f.key])) have++;
    else missing.push(f.label);
  }
  for (const f of CONSTRAINTS_FIELDS) {
    if (isPopulated(constraints[f.key])) have++;
    else missing.push(f.label);
  }
  have += Math.min(derivedHaveCount, DERIVED_FIELDS.length);

  const completenessPct = Math.round((have / TOTAL_FIELDS) * 100);
  return {
    haveFields: have,
    totalFields: TOTAL_FIELDS,
    completenessPct,
    missingFieldNames: missing,
    gateOpen: completenessPct >= 80,
  };
}

export { GOALS_FIELDS, CONSTRAINTS_FIELDS, TOTAL_FIELDS };
