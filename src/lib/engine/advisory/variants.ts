/**
 * Sprint 5 Feature D — Three-variant generator (Growth / Access / Balanced).
 *
 * No coordinator changes. Variants are three invocations of the existing
 * `generateSchedule()` with different ProductionTargetPolicy + ScheduleRules
 * pairs. Seeds are stable — (officeId, variantCode) hashed — so repeated
 * runs are byte-identical.
 *
 * See SPRINT-5-PLAN §4.2 for the policy-weight table and §4.5 for the
 * zero-coordinator-change rationale.
 */

import { generateSchedule } from '../generator';
import type {
  GenerationInput,
  GenerationResult,
  ScheduleRules,
  ProviderInput,
  BlockTypeInput,
} from '../types';
import type {
  IntakeGoals,
  VariantCode,
  VariantProfile,
  VariantResult,
  VariantSet,
  VariantRecommendation,
} from './types';
import { scoreTemplate } from './scoring';

// ---------------------------------------------------------------------------
// §4.2 — Three variant profiles
// ---------------------------------------------------------------------------

export const VARIANT_PROFILES: Record<VariantCode, VariantProfile> = {
  GROWTH: {
    code: 'GROWTH',
    label: 'Growth',
    productionPolicy: 'FARRAN_75_BY_NOON',
    overrides: {
      npBlocksPerDay: 1,
      srpBlocksPerDay: 1,
      hpPlacement: 'MORNING',
      doubleBooking: false,
    },
    weights: {
      productionPct: 75,
      npAccessPct: 10,
      emergencyAccessPct: 5,
      hygieneSupportPct: 5,
      doctorContinuityPct: 5,
    },
    tagline: 'Maximum restorative production, morning-heavy, protected rocks.',
  },
  ACCESS: {
    code: 'ACCESS',
    label: 'Access',
    productionPolicy: 'JAMESON_50',
    overrides: {
      npBlocksPerDay: 3,
      srpBlocksPerDay: 2,
      hpPlacement: 'ANY',
      doubleBooking: true,
    },
    weights: {
      productionPct: 50,
      npAccessPct: 25,
      emergencyAccessPct: 15,
      hygieneSupportPct: 5,
      doctorContinuityPct: 5,
    },
    tagline: 'New-patient + emergency headroom; hygiene-float double-booking.',
  },
  BALANCED: {
    code: 'BALANCED',
    label: 'Balanced',
    productionPolicy: 'LEVIN_60',
    overrides: {
      npBlocksPerDay: 2,
      srpBlocksPerDay: 2,
      hpPlacement: 'MORNING',
      doubleBooking: false,
    },
    weights: {
      productionPct: 60,
      npAccessPct: 17,
      emergencyAccessPct: 10,
      hygieneSupportPct: 8,
      doctorContinuityPct: 5,
    },
    tagline: 'Middle-ground production with solid NP and emergency coverage.',
  },
};

// ---------------------------------------------------------------------------
// Seed derivation — stable across runs
// ---------------------------------------------------------------------------

function stableSeed(officeId: string, variant: VariantCode): number {
  let h = 5381;
  const s = `${officeId}:${variant}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 2147483647;
}

// ---------------------------------------------------------------------------
// Rule overlay — variant overrides stack on top of the office's ScheduleRule
// ---------------------------------------------------------------------------

function overlayRules(base: ScheduleRules, profile: VariantProfile, intake: IntakeGoals): ScheduleRules {
  // Intake-aware NP count override (§4.2): Growth = max(monthly/5, 1);
  // Access = max(monthly/5, 2) + 1; Balanced = intake value (fall through).
  const monthly = intake.monthlyNewPatientGoal ?? 0;
  const intakePerDay = Math.max(1, Math.ceil(monthly / 20)); // 20 working days
  let npBlocksPerDay = profile.overrides.npBlocksPerDay;
  if (profile.code === 'GROWTH') npBlocksPerDay = Math.max(Math.ceil(intakePerDay / 5), 1);
  else if (profile.code === 'ACCESS') npBlocksPerDay = Math.max(Math.ceil(intakePerDay / 5), 2) + 1;
  else npBlocksPerDay = Math.max(base.npBlocksPerDay, intakePerDay);

  return {
    ...base,
    npBlocksPerDay,
    srpBlocksPerDay: profile.overrides.srpBlocksPerDay,
    hpPlacement: profile.overrides.hpPlacement,
    doubleBooking: profile.overrides.doubleBooking,
  };
}

// ---------------------------------------------------------------------------
// Headline KPI + tradeoff derivation
// ---------------------------------------------------------------------------

function countPlaced(weekResults: GenerationResult[], matcher: (label: string) => boolean): number {
  let n = 0;
  for (const day of weekResults) {
    const seen = new Set<string>();
    for (const slot of day.slots ?? []) {
      if (!slot.blockInstanceId || !slot.blockLabel) continue;
      if (seen.has(slot.blockInstanceId)) continue;
      if (matcher(slot.blockLabel)) {
        seen.add(slot.blockInstanceId);
        n++;
      }
    }
  }
  return n;
}

function topTradeoffs(profile: VariantProfile, weekResults: GenerationResult[]): string[] {
  const out: string[] = [];
  if (profile.code === 'GROWTH') {
    out.push('Prioritises production share; NP and emergency headroom are the tightest.');
    out.push('Morning AM load is forced to 75% — good for restorative, hard on hygiene matrixing.');
  } else if (profile.code === 'ACCESS') {
    out.push('NP and ER slots are generous; expect 10-15% less weekly production vs Growth.');
    out.push('Hygiene-float double-booking is ON — requires a confident hygienist team.');
  } else {
    out.push('Balanced production at ~60% morning load; no double-booking risk.');
    out.push('Slightly lower NP access than ACCESS; higher stability than GROWTH.');
  }
  // Derived third point from fallback count
  const totalFallbacks = weekResults.reduce((s, r) => s + (r.warnings?.length ?? 0), 0);
  if (totalFallbacks > 3) out.push(`Generator recorded ${totalFallbacks} coordinator fallbacks — inspect the Guard Report.`);
  else out.push('Zero or minor coordinator fallbacks — the template is stable as-is.');
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VariantRunInput {
  officeId: string;
  officeName: string;
  practiceModel?: string;
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  rules: ScheduleRules;
  timeIncrement: number;
  days: string[];                                  // e.g. ["MON","TUE","WED","THU","FRI"]
  intakeGoals: IntakeGoals;
  intakeConstraintsNarrative?: string;
}

/**
 * Run the three variants and return the comparison set + recommendation.
 * Each variant runs through the existing generator. No coordinator changes.
 */
export function generateThreeVariants(input: VariantRunInput): VariantSet {
  const variantResults: VariantResult[] = [];

  for (const code of ['GROWTH', 'ACCESS', 'BALANCED'] as VariantCode[]) {
    const profile = VARIANT_PROFILES[code];
    const rules = overlayRules(input.rules, profile, input.intakeGoals);
    const seed = stableSeed(input.officeId, code);
    const weekResults: GenerationResult[] = [];
    for (const day of input.days) {
      const genInput: GenerationInput = {
        providers: input.providers,
        blockTypes: input.blockTypes,
        rules,
        timeIncrement: input.timeIncrement,
        dayOfWeek: day,
        seed,
      };
      try {
        weekResults.push(generateSchedule(genInput));
      } catch (err) {
        // Graceful degrade — record an empty day with a warning so the
        // advisory still composes rather than blowing up the whole UI.
        weekResults.push({
          dayOfWeek: day,
          slots: [],
          productionSummary: [],
          warnings: [`VARIANT-GEN-FAIL: ${String(err)}`],
          guardReport: null,
        });
      }
    }

    const productionTotal = weekResults
      .flatMap((r) => r.productionSummary ?? [])
      .reduce((s, p) => s + (p.actualScheduled ?? 0), 0);

    const npSlotsPerWeek = countPlaced(
      weekResults,
      (l) => /^NP/.test(l) || /NEW\s*PATIENT/i.test(l),
    );
    const erSlotsPerWeek = countPlaced(weekResults, (l) => l === 'ER' || /EMERGENC/i.test(l));
    const hygieneExamsPlaced = countPlaced(
      weekResults,
      (l) => /^HYG|^RECARE|^PROPHY|^RC(\b|PM)/.test(l),
    );
    const rockBlocksPlaced = countPlaced(
      weekResults,
      (l) => /^HP|^CROWN|^LARGE|^ROCK/.test(l),
    );

    const score = scoreTemplate(
      weekResults,
      input.intakeGoals,
      input.intakeConstraintsNarrative ?? '',
      { computedAt: new Date(0).toISOString() },
    );

    variantResults.push({
      code,
      label: profile.label,
      productionPolicy: profile.productionPolicy,
      headlineKpis: {
        productionTotal,
        npSlotsPerWeek,
        erSlotsPerWeek,
        hygieneExamsPlaced,
        rockBlocksPlaced,
      },
      score,
      topTradeoffs: topTradeoffs(profile, weekResults),
    });
  }

  const recommendation = recommendVariant(variantResults, input.intakeGoals);

  return {
    generatedAt: new Date(0).toISOString(),
    variants: variantResults,
    recommendation,
  };
}

// ---------------------------------------------------------------------------
// §3.4 — Recommendation heuristic
// ---------------------------------------------------------------------------

function recommendVariant(
  results: VariantResult[],
  intake: IntakeGoals,
): VariantRecommendation {
  const growth = results.find((r) => r.code === 'GROWTH');
  const access = results.find((r) => r.code === 'ACCESS');
  const balanced = results.find((r) => r.code === 'BALANCED');
  const highest = [...results].sort((a, b) => b.score.overall - a.score.overall)[0];

  // Rule 1: explicit growth priority wins.
  if (intake.growthPriority === 'MORE_PRODUCTION') {
    return {
      winner: 'GROWTH',
      reason: `Intake named "more production" as the priority — Growth delivers the highest weekly production ($${growth?.headlineKpis.productionTotal.toLocaleString()}) with a ${growth?.score.overall ?? 0}/10 overall score.`,
    };
  }
  if (intake.growthPriority === 'MORE_NP' || intake.growthPriority === 'BETTER_ACCESS') {
    return {
      winner: 'ACCESS',
      reason: `Intake named "${intake.growthPriority === 'MORE_NP' ? 'more new patients' : 'better access'}" as the priority — Access places ${access?.headlineKpis.npSlotsPerWeek ?? 0} NP slots per week vs Growth's ${growth?.headlineKpis.npSlotsPerWeek ?? 0}.`,
    };
  }

  // Rule 2: if NP goal is meaningfully under-served by Balanced, pick Access.
  const weeklyNpTarget = (intake.monthlyNewPatientGoal ?? 0) / 4;
  if (
    weeklyNpTarget > 0 &&
    balanced &&
    balanced.headlineKpis.npSlotsPerWeek < weeklyNpTarget * 0.8
  ) {
    return {
      winner: 'ACCESS',
      reason: `Balanced places ${balanced.headlineKpis.npSlotsPerWeek} NP slots/week against the ${weeklyNpTarget.toFixed(0)}/week target from intake — Access closes the gap.`,
    };
  }

  // Rule 3: if emergency goal is SAME_DAY and Balanced's ER score < 8, pick Access.
  const balancedEmergencyScore = balanced?.score.axes.find((a) => a.axis === 'EMERGENCY')?.score ?? 10;
  if (
    intake.emergencyAccessGoal === 'SAME_DAY' &&
    balanced &&
    balancedEmergencyScore < 8
  ) {
    return {
      winner: 'ACCESS',
      reason: 'Intake set a same-day emergency goal — Access provides the AM + PM ER coverage needed; Balanced falls short.',
    };
  }

  // Rule 4: otherwise pick the highest-overall-scoring variant (tiebreak: Balanced).
  if (highest && highest.code !== 'BALANCED' && highest.score.overall > (balanced?.score.overall ?? 0) + 1) {
    return {
      winner: highest.code,
      reason: `${highest.label} scored ${highest.score.overall}/10 overall vs Balanced's ${balanced?.score.overall ?? 0}/10 — the lift is worth the tradeoff.`,
    };
  }

  return {
    winner: 'BALANCED',
    reason: `Balanced is the best fit — it hits ${balanced?.score.overall ?? 0}/10 overall with no intake field strongly flagged toward Growth or Access.`,
  };
}
