/**
 * Sprint 5 Feature E — 30/60/90 review plan templating.
 *
 * Deterministic KPI catalog. Driven by the six-axis score (Feature C) and
 * intake issues — if production is scoring weak, the Day 30 KPI list leads
 * with "daily production vs goal"; if NP access is weak, days-to-NP gets
 * added. No LLM. No runtime side effects.
 *
 * See SPRINT-5-PLAN §3.5.
 */

import type { TemplateScore } from './types';
import type {
  IntakeGoals,
  IntakeConstraints,
  ReviewMilestone,
  ReviewPlan,
  VariantProfile,
} from './types';

interface KpiSpec {
  metric: string;
  target: string;
  trendToWatch: string;
  revisionTrigger: string;
}

// ---------------------------------------------------------------------------
// Static KPI catalog — every "standard" KPI CST can measure
// ---------------------------------------------------------------------------

const KPI_CATALOG: Record<string, KpiSpec> = {
  DAILY_PRODUCTION_VS_GOAL: {
    metric: 'Daily production vs goal',
    target: '≥ 95% of daily goal on at least 4 of 5 days',
    trendToWatch: 'Miss rate rising week-over-week',
    revisionTrigger: 'If < 85% for 2 consecutive weeks, revisit block placement',
  },
  DAYS_TO_NP: {
    metric: 'Days-to-first-available NP',
    target: '≤ 5 business days',
    trendToWatch: 'Creeping past 7 days signals NP capacity shortfall',
    revisionTrigger: 'If > 10 days for 2 weeks, add an NP slot per day',
  },
  EMERGENCY_FILL_RATE: {
    metric: 'Emergency slot fill rate',
    target: '70-90% filled (over-fill = under-provisioned)',
    trendToWatch: 'Above 90% fill → emergencies bumping production',
    revisionTrigger: 'Below 40% fill → convert one ER to productive block',
  },
  HYGIENE_EXAM_HIT_RATE: {
    metric: 'Doctor exam window hit rate',
    target: '≥ 90% of hygiene exams in the canonical 30-min middle window',
    trendToWatch: 'Expansion fallbacks appearing in Guard Report',
    revisionTrigger: 'If < 80% for 1 week, reduce hygiene matrix load',
  },
  PM_FILL_RATE: {
    metric: 'Afternoon fill rate',
    target: '≥ 85%',
    trendToWatch: 'Drop below 70% indicates PM cancellation risk',
    revisionTrigger: 'Sustained < 70% → shift one PM rock to AM',
  },
  PROVIDER_FATIGUE: {
    metric: 'Back-to-back complex block count',
    target: '0 HP/Crown back-to-back on the same column',
    trendToWatch: 'Running late past 12:00 lunch',
    revisionTrigger: 'If lateness > 2x/week, insert NON-PROD buffer',
  },
  HYGIENE_REAPPT_RATE: {
    metric: 'Hygiene reappointment rate',
    target: '≥ 80% pre-booked',
    trendToWatch: 'Gaps in recare columns 2 weeks out',
    revisionTrigger: 'Below 70% → reassess recare reminder cadence',
  },
  MORNING_PRODUCTION_SHARE: {
    metric: 'Morning production share',
    target: 'Within policy band (Jameson ≥ 50%, Levin ≥ 60%, Farran ≥ 75% by noon)',
    trendToWatch: 'Slipping below band in the Guard Report',
    revisionTrigger: 'If below band 2 weeks, audit PM rock placement',
  },
  CANCELLATION_PATTERN: {
    metric: 'No-show + cancellation rate by time-of-day',
    target: 'AM + PM rates within 3 percentage points',
    trendToWatch: 'PM rising independently',
    revisionTrigger: 'If PM > AM + 5 pts, move valuable PM blocks to AM',
  },
  UTILIZATION_BY_OPERATORY: {
    metric: 'Operatory utilization',
    target: '≥ 80% all operatories',
    trendToWatch: 'One operatory consistently < 70%',
    revisionTrigger: 'Redistribute blocks or retire the operatory',
  },
};

// ---------------------------------------------------------------------------
// Selection heuristic — the score + intake drive which KPIs make the cut
// ---------------------------------------------------------------------------

interface SelectInput {
  score: TemplateScore;
  intakeGoals: IntakeGoals;
  intakeConstraints: IntakeConstraints;
}

function selectDay30(inp: SelectInput): KpiSpec[] {
  const list: KpiSpec[] = [];
  const byAxis = new Map(inp.score.axes.map((a) => [a.axis, a]));

  if ((byAxis.get('PRODUCTION')?.score ?? 10) < 7) list.push(KPI_CATALOG.DAILY_PRODUCTION_VS_GOAL);
  if ((byAxis.get('NP_ACCESS')?.score ?? 10) < 7) list.push(KPI_CATALOG.DAYS_TO_NP);
  if ((byAxis.get('EMERGENCY')?.score ?? 10) < 7) list.push(KPI_CATALOG.EMERGENCY_FILL_RATE);
  if ((byAxis.get('HYGIENE')?.score ?? 10) < 7) list.push(KPI_CATALOG.HYGIENE_EXAM_HIT_RATE);

  // Intake-driven additions
  const narrative = [
    inp.intakeConstraints.noShowCancellationPatterns,
    inp.intakeConstraints.productionLeakage,
    inp.intakeConstraints.overbookedSlots,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/afternoon|pm|late/.test(narrative) && /cancel|no[-\s]*show/.test(narrative)) {
    list.push(KPI_CATALOG.PM_FILL_RATE);
  }

  // Always include one stability sentinel
  list.push(KPI_CATALOG.MORNING_PRODUCTION_SHARE);

  // If list too short, pad with production-vs-goal and days-to-NP
  if (list.length < 3) {
    list.push(KPI_CATALOG.DAILY_PRODUCTION_VS_GOAL);
    list.push(KPI_CATALOG.DAYS_TO_NP);
  }
  return dedupe(list).slice(0, 5);
}

function selectDay60(inp: SelectInput): KpiSpec[] {
  const list: KpiSpec[] = [];
  const byAxis = new Map(inp.score.axes.map((a) => [a.axis, a]));

  // Team-usability-driven
  if ((byAxis.get('USABILITY')?.score ?? 10) < 7) list.push(KPI_CATALOG.PROVIDER_FATIGUE);
  if ((byAxis.get('HYGIENE')?.score ?? 10) < 8) list.push(KPI_CATALOG.HYGIENE_REAPPT_RATE);

  list.push(KPI_CATALOG.UTILIZATION_BY_OPERATORY);

  if (inp.intakeGoals.hygieneDemandLevel === 'HIGH') list.push(KPI_CATALOG.HYGIENE_EXAM_HIT_RATE);

  if (list.length < 3) list.push(KPI_CATALOG.EMERGENCY_FILL_RATE);

  return dedupe(list).slice(0, 5);
}

function selectDay90(inp: SelectInput): KpiSpec[] {
  const list: KpiSpec[] = [];

  // Day 90 is a "strategy review" checkpoint — all four anchor KPIs
  list.push(KPI_CATALOG.DAILY_PRODUCTION_VS_GOAL);
  list.push(KPI_CATALOG.DAYS_TO_NP);
  list.push(KPI_CATALOG.UTILIZATION_BY_OPERATORY);
  list.push(KPI_CATALOG.CANCELLATION_PATTERN);

  // Add stability-related KPI if SCHEDULE STABILITY is still weak at this point
  const byAxis = new Map(inp.score.axes.map((a) => [a.axis, a]));
  if ((byAxis.get('STABILITY')?.score ?? 10) < 8) list.push(KPI_CATALOG.MORNING_PRODUCTION_SHARE);

  return dedupe(list).slice(0, 5);
}

function dedupe(list: KpiSpec[]): KpiSpec[] {
  const seen = new Set<string>();
  const out: KpiSpec[] = [];
  for (const k of list) {
    if (seen.has(k.metric)) continue;
    seen.add(k.metric);
    out.push(k);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function composeReviewPlan(
  score: TemplateScore,
  intakeGoals: IntakeGoals,
  intakeConstraints: IntakeConstraints = {},
  opts: { generatedAt?: string; chosenVariantProfile?: VariantProfile } = {},
): ReviewPlan {
  const inp: SelectInput = { score, intakeGoals, intakeConstraints };

  const day30 = selectDay30(inp);
  const day60 = selectDay60(inp);
  const day90 = selectDay90(inp);

  // Sprint 6 Epic R — if a variant has been committed, rescale KPI targets
  // by that variant's weights. Baseline weights are Balanced
  // (productionPct 60 / npAccessPct 17 / emergencyAccessPct 10).
  const maybeScale = (
    list: ReturnType<typeof selectDay30>,
  ) => (opts.chosenVariantProfile ? applyVariantScaling(list, opts.chosenVariantProfile) : list);

  const variantLabel = opts.chosenVariantProfile?.label;
  const baseDay30Summary =
    'Day-30 checkpoint focuses on whether the template is hitting its basic operating targets and catches week-over-week drift early.';
  const baseDay60Summary =
    'Day-60 reviews team fatigue, operatory utilisation, and hygiene cadence — the signals that tell you whether the template is sustainable.';
  const baseDay90Summary =
    'Day-90 is a full strategic review: production outcomes, access outcomes, cancellation patterns, and any residual stability concerns are evaluated before committing to the template for the next quarter.';

  const milestones: ReviewMilestone[] = [
    {
      day: 30,
      kpis: maybeScale(day30),
      summary: variantLabel
        ? `Day-30 checkpoint, with ${variantLabel} committed: verify protected-production adherence and the leading KPIs below are hitting the ${variantLabel}-tuned targets.`
        : baseDay30Summary,
    },
    {
      day: 60,
      kpis: maybeScale(day60),
      summary: variantLabel
        ? `Day-60 review under ${variantLabel}: team fatigue, utilisation, and hygiene cadence — expect ${variantLabel}-weighted targets.`
        : baseDay60Summary,
    },
    {
      day: 90,
      kpis: maybeScale(day90),
      summary: variantLabel
        ? `Day-90 strategic review with ${variantLabel} committed: re-evaluate outcomes against the ${variantLabel} rescoped KPIs before renewing the commitment for the next quarter.`
        : baseDay90Summary,
    },
  ];

  return {
    milestones,
    generatedAt: opts.generatedAt ?? new Date(0).toISOString(),
  };
}

/**
 * Sprint 6 Epic R — apply per-variant weights to the KPI target strings.
 * Baseline is Balanced (production 60 / NP 17 / ER 10). Growth's 75% will
 * uplift the production target text; Access's 25 NP pct will uplift the NP
 * target. We scale numeric targets found in the target string by the ratio.
 */
function applyVariantScaling(
  kpis: ReturnType<typeof selectDay30>,
  profile: VariantProfile,
): ReturnType<typeof selectDay30> {
  const prodRatio = profile.weights.productionPct / 60;
  const npRatio = profile.weights.npAccessPct / 17;
  const erRatio = profile.weights.emergencyAccessPct / 10;

  return kpis.map((kpi) => {
    let ratio = 1;
    const m = kpi.metric.toLowerCase();
    if (/production/.test(m)) ratio = prodRatio;
    else if (/new\s*patient|np|days-to-first-available np/.test(m)) ratio = npRatio;
    else if (/emergency|er slot|emerg/.test(m)) ratio = erRatio;
    // Only rewrite numeric percentages in the target string; leave other text alone.
    if (ratio === 1) return kpi;
    const rescaled = kpi.target.replace(/(\d+(?:\.\d+)?)\s*%/g, (_all, num) => {
      const n = Number(num);
      const scaled = Math.round(n * ratio);
      return `${scaled}%`;
    });
    return {
      ...kpi,
      target: rescaled === kpi.target ? kpi.target : `${rescaled} (${profile.label}-scaled)`,
    };
  });
}
