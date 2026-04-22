/**
 * Sprint 5 Feature B — Advisory document composer.
 *
 * Pure, deterministic, no LLM. Accepts the week's GenerationResult[] and
 * intake blobs, returns the 6-section AdvisoryDocument. Executive summary
 * is templated-fragment composition (see SPRINT-5-PLAN §6.4).
 */

import type { GenerationResult } from '../types';
import type {
  IntakeGoals,
  IntakeConstraints,
  AdvisoryDocument,
  AdvisoryExecutiveSummary,
  AdvisoryInputAssumption,
  AdvisoryWeeklyRow,
  AdvisoryBlockRationale,
  AdvisoryRisk,
  AdvisoryKpi,
  TemplateScore,
} from './types';
import { dayShape, plainEnglishForRule, rationaleFor } from './rationale-templates';

// ---------------------------------------------------------------------------
// Executive summary — templated fragments
// ---------------------------------------------------------------------------

export interface ComposeInput {
  officeName: string;
  practiceModel: string;
  productionPolicy: string;
  weekLabel: string;
  providerCount: number;
  weekResults: GenerationResult[];
  score: TemplateScore;
  intakeGoals: IntakeGoals;
  intakeConstraints: IntakeConstraints;
  winningVariantLabel?: string;
  generatedAt?: string;
}

function composeExecutiveSummary(inp: ComposeInput): AdvisoryExecutiveSummary {
  const totalActual = inp.weekResults
    .flatMap((r) => r.productionSummary ?? [])
    .reduce((s, p) => s + (p.actualScheduled ?? 0), 0);
  const totalTarget = inp.weekResults
    .flatMap((r) => r.productionSummary ?? [])
    .reduce((s, p) => s + (p.target75 ?? 0), 0);
  const ratio = totalTarget > 0 ? totalActual / totalTarget : 0;

  let weeklyGoalStatus: 'MET' | 'AT_RISK' | 'UNDER' = 'MET';
  if (ratio < 0.85) weeklyGoalStatus = 'UNDER';
  else if (ratio < 0.95) weeklyGoalStatus = 'AT_RISK';

  const s1 = `${inp.officeName} is a ${inp.practiceModel} practice with ${inp.providerCount} provider${inp.providerCount === 1 ? '' : 's'} running the ${inp.productionPolicy} production policy.`;

  let s2: string;
  if (weeklyGoalStatus === 'MET') {
    s2 = `The current template meets weekly production at ${Math.round(ratio * 100)}% of target and scores ${inp.score.overall}/10 overall across the six advisory axes.`;
  } else if (weeklyGoalStatus === 'AT_RISK') {
    s2 = `The current template is at risk on production — ${Math.round(ratio * 100)}% of target — and overall scores ${inp.score.overall}/10; the top weak axis is ${topWeakAxis(inp.score)}.`;
  } else {
    s2 = `The current template is under-producing at ${Math.round(ratio * 100)}% of weekly target; overall advisory score is ${inp.score.overall}/10 with ${topWeakAxis(inp.score)} as the top risk.`;
  }

  const s3 = inp.winningVariantLabel
    ? `Three variants were compared (Growth / Access / Balanced); ${inp.winningVariantLabel} was recommended based on the intake priority.`
    : 'Single-variant run — run "Generate 3 Variants" to compare Growth / Access / Balanced side-by-side.';

  const topSuggestion = findTopRaiseSuggestion(inp.score);

  return {
    narrative: [s1, s2, s3, topSuggestion ? `Highest-impact next action: ${topSuggestion}` : '']
      .filter(Boolean)
      .join(' '),
    practiceName: inp.officeName,
    providerCount: inp.providerCount,
    productionPolicy: inp.productionPolicy,
    weeklyGoalStatus,
    topRecommendation: topSuggestion ?? 'No immediate action — template is within policy.',
  };
}

function topWeakAxis(score: TemplateScore): string {
  const weakest = [...score.axes].sort((a, b) => a.score - b.score)[0];
  return `${weakest.label} (${weakest.score}/10)`;
}

function findTopRaiseSuggestion(score: TemplateScore): string | null {
  const weakest = [...score.axes].sort((a, b) => a.score - b.score)[0];
  return weakest?.raiseSuggestions?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Section 2 — Key Inputs & Assumptions
// ---------------------------------------------------------------------------

function composeKeyInputs(intakeGoals: IntakeGoals, intakeConstraints: IntakeConstraints): AdvisoryInputAssumption[] {
  const out: AdvisoryInputAssumption[] = [];
  const pushOrAssume = (field: string, value: unknown, assumed: string) => {
    if (value === undefined || value === null || value === '') {
      out.push({ field, value: assumed, source: 'assumed-default' });
    } else {
      out.push({ field, value: String(value), source: 'intake' });
    }
  };

  pushOrAssume('Practice type', intakeGoals.practiceType, 'general');
  pushOrAssume('Monthly production goal', intakeGoals.monthlyProductionGoal, 'not set');
  pushOrAssume('Daily production goal', intakeGoals.dailyProductionGoal, 'not set');
  pushOrAssume('Monthly new-patient goal', intakeGoals.monthlyNewPatientGoal, 'not set');
  pushOrAssume('Hygiene demand level', intakeGoals.hygieneDemandLevel, 'MEDIUM');
  pushOrAssume('Perio demand', intakeGoals.perioDemand, 'MEDIUM');
  pushOrAssume('Emergency access goal', intakeGoals.emergencyAccessGoal, 'NEXT_DAY');
  pushOrAssume('Same-day treatment goal (%)', intakeGoals.sameDayTreatmentGoalPct, 'not set');
  pushOrAssume('Growth priority', intakeGoals.growthPriority, 'STABILITY');
  pushOrAssume('NP hygiene flow', intakeGoals.npHygieneFlow, 'DOCTOR_ONLY');
  pushOrAssume('Production leakage (intake narrative)', intakeConstraints.productionLeakage, 'not reported');
  pushOrAssume('Overbooked slots (intake narrative)', intakeConstraints.overbookedSlots, 'not reported');
  pushOrAssume('No-show / cancellation patterns', intakeConstraints.noShowCancellationPatterns, 'not reported');
  pushOrAssume('High-value procedures', intakeConstraints.highValueProcedures, 'none flagged');
  pushOrAssume('Existing commitments', intakeConstraints.existingCommitments, 'none');
  return out;
}

// ---------------------------------------------------------------------------
// Section 3 — Recommended Weekly Template table
// ---------------------------------------------------------------------------

function composeWeeklyTemplate(weekResults: GenerationResult[]): AdvisoryWeeklyRow[] {
  const rows: AdvisoryWeeklyRow[] = [];
  for (const day of weekResults) {
    const seen = new Set<string>();
    const placed = (day.slots ?? [])
      .filter((s) => s.blockInstanceId && s.blockLabel)
      .filter((s) => {
        if (seen.has(s.blockInstanceId!)) return false;
        seen.add(s.blockInstanceId!);
        return true;
      });
    for (const slot of placed) {
      rows.push({
        day: day.dayOfWeek,
        timeBlock: slot.time,
        appointmentType: slot.blockLabel ?? '',
        purpose: purposeFor(slot.blockLabel ?? ''),
        notes: slot.rationale ?? `${slot.providerId} / ${slot.operatory}`,
      });
    }
  }
  return rows;
}

function purposeFor(label: string): string {
  if (/^HP|^CROWN|^LARGE/.test(label)) return 'Protected high-production restorative';
  if (/^MP/.test(label)) return 'Medium-production restorative';
  if (/^NP/.test(label)) return 'New patient exam';
  if (/^ER/.test(label) || /EMERGENC/i.test(label)) return 'Emergency access';
  if (/^SRP/.test(label)) return 'Scaling + root planing (perio)';
  if (/^HYG|^RC|^PROPHY/.test(label)) return 'Hygiene recare';
  if (/^HUDDLE/.test(label)) return 'Team huddle';
  if (/^LUNCH/.test(label)) return 'Lunch break';
  if (/^NONPROD/.test(label)) return 'Non-productive time';
  return 'Scheduled block';
}

// ---------------------------------------------------------------------------
// Section 4 — Block Rationale (per day)
// ---------------------------------------------------------------------------

function composeBlockRationale(
  weekResults: GenerationResult[],
  productionPolicy: string,
): AdvisoryBlockRationale[] {
  return weekResults.map((day) => ({
    day: day.dayOfWeek,
    prose: rationaleFor({ policy: productionPolicy, shape: dayShape(day) }),
  }));
}

// ---------------------------------------------------------------------------
// Section 5 — Risks & Tradeoffs
// ---------------------------------------------------------------------------

function composeRisks(
  weekResults: GenerationResult[],
  intakeConstraints: IntakeConstraints,
): AdvisoryRisk[] {
  const out: AdvisoryRisk[] = [];
  for (const day of weekResults) {
    for (const w of day.warnings ?? []) {
      out.push({
        ruleCode: (w.match(/(AP-\d+|R-\d+(\.\d+)?)/) ?? [])[1],
        severity: /HARD/.test(w) ? 'hard' : /SOFT/.test(w) ? 'soft' : 'info',
        plainEnglish: `${day.dayOfWeek}: ${plainEnglishForRule(w)}`,
      });
    }
    const gr = day.guardReport;
    if (gr) {
      for (const v of gr.violations ?? []) {
        out.push({
          ruleCode: v.code,
          severity:
            v.severity === 'HARD'
              ? 'hard'
              : v.severity === 'SOFT'
                ? 'soft'
                : 'info',
          plainEnglish: `${day.dayOfWeek} (${v.code}): ${plainEnglishForRule(v.message ?? v.code)}`,
        });
      }
    }
  }
  // Intake-driven risk additions
  if (intakeConstraints.noShowCancellationPatterns) {
    out.push({
      severity: 'info',
      plainEnglish: `Intake flagged no-show / cancellation patterns: "${intakeConstraints.noShowCancellationPatterns}". Monitor PM fill rate in Day-30 review.`,
    });
  }
  if (intakeConstraints.productionLeakage) {
    out.push({
      severity: 'info',
      plainEnglish: `Intake flagged production leakage: "${intakeConstraints.productionLeakage}".`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Section 6 — KPIs to Monitor (standalone catalog; review-plan picks from it)
// ---------------------------------------------------------------------------

function composeKpis(intakeConstraints: IntakeConstraints): AdvisoryKpi[] {
  const list: AdvisoryKpi[] = [
    {
      metric: 'Daily production vs goal',
      target: '≥ 95% of daily goal on 4 of 5 days',
      whyItMatters: 'Earliest signal that the template is slipping — leads all other KPIs.',
    },
    {
      metric: 'Days-to-first-available NP',
      target: '≤ 5 business days',
      whyItMatters: 'NP booking lag is the #1 growth bottleneck for mature practices.',
    },
    {
      metric: 'Emergency slot fill rate',
      target: '70-90%',
      whyItMatters: 'Above 90% = under-provisioned; below 40% = wasted capacity.',
    },
    {
      metric: 'Morning production share',
      target: 'Policy band (Jameson 50% / Levin 60% / Farran 75% by noon)',
      whyItMatters: 'Leading indicator of policy conformance — catch drift before production misses.',
    },
    {
      metric: 'Hygiene exam window hit rate',
      target: '≥ 90% of exams in the canonical middle-30-min band',
      whyItMatters: 'Drops precede hygienist overload and patient-perceived run-late risk.',
    },
    {
      metric: 'Operatory utilization',
      target: '≥ 80% on all operatories',
      whyItMatters: 'Identifies redistributable capacity or operatories to retire.',
    },
    {
      metric: 'Back-to-back complex block count',
      target: '0 HP/Crown pairs on the same column',
      whyItMatters: 'Team fatigue and lunch-overrun risk.',
    },
  ];

  // Intake-driven additions (capped at 8 total)
  if (intakeConstraints.noShowCancellationPatterns) {
    list.push({
      metric: 'Afternoon fill rate',
      target: '≥ 85%',
      whyItMatters: 'Directly tracks the intake-flagged cancellation pattern.',
    });
  }
  return list.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function composeAdvisory(inp: ComposeInput): AdvisoryDocument {
  const stableTs = inp.generatedAt ?? new Date(0).toISOString();
  return {
    executiveSummary: composeExecutiveSummary(inp),
    keyInputs: composeKeyInputs(inp.intakeGoals, inp.intakeConstraints),
    weeklyTemplate: composeWeeklyTemplate(inp.weekResults),
    blockRationale: composeBlockRationale(inp.weekResults, inp.productionPolicy),
    risks: composeRisks(inp.weekResults, inp.intakeConstraints),
    kpis: composeKpis(inp.intakeConstraints),
    officeName: inp.officeName,
    generatedAt: stableTs,
    productionPolicy: inp.productionPolicy,
    practiceModel: inp.practiceModel,
    weekLabel: inp.weekLabel,
  };
}
