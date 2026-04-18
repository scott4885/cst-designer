/**
 * Schedule Quality Score — Sprint 11 + Loop 4 morning-load penalty
 *
 * Calculates a 0–100 quality score for a generated schedule based on:
 *   - Production Goal Achievement (30 pts)
 *   - Procedure Mix Accuracy (25 pts)
 *   - Clinical Rules Compliance (20 pts)
 *   - Time Utilization (15 pts)
 *   - Provider Coverage (10 pts)
 *
 * Plus a Loop 4 morning-load penalty:
 *   - ratio < 0.70  → tier capped at 'fair', -10 raw pts
 *   - 0.70 ≤ ratio < 0.80 → linear -5 to -10 raw pts
 *   - ratio ≥ 0.80 → no penalty
 */

import type { GenerationResult, ProviderInput, BlockTypeInput } from './types';
import { isMixValid } from './generator';
import type { ClinicalWarning } from './clinical-rules';
import {
  MORNING_LOAD_TARGET,
  MORNING_LOAD_HARD_CAP,
} from './morning-load-enforcer';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type QualityTier = 'excellent' | 'good' | 'fair' | 'needs_work';

export interface QualityScoreComponent {
  label: string;
  score: number;
  maxScore: number;
  description: string;
}

export interface QualityScore {
  total: number;
  tier: QualityTier;
  emoji: string;
  tierLabel: string;
  components: QualityScoreComponent[];
}

// ─── Tier Helpers ─────────────────────────────────────────────────────────────

function getTier(score: number): QualityTier {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  return 'needs_work';
}

const TIER_META: Record<QualityTier, { emoji: string; label: string }> = {
  excellent: { emoji: '🟢', label: 'Excellent' },
  good:      { emoji: '🟡', label: 'Good' },
  fair:      { emoji: '🟠', label: 'Fair' },
  needs_work:{ emoji: '🔴', label: 'Needs Work' },
};

// ─── Component Scorers ────────────────────────────────────────────────────────

/**
 * Component 1: Production Goal Achievement (max 30 pts)
 * Full 30 pts if all providers hit ≥100% of target75.
 * Scaled proportionally by average achievement ratio.
 */
function scoreProductionGoal(
  schedule: GenerationResult,
  providers: ProviderInput[]
): QualityScoreComponent {
  const MAX = 30;

  if (!schedule.productionSummary || schedule.productionSummary.length === 0) {
    return {
      label: 'Production Goal',
      score: 0,
      maxScore: MAX,
      description: 'No production data available.',
    };
  }

  const ratios = schedule.productionSummary.map(s => {
    if (s.target75 <= 0) return 1;
    return Math.min(s.actualScheduled / s.target75, 1.2); // cap at 120%
  });

  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const score = Math.round(Math.min(avgRatio, 1.0) * MAX);
  const pct = Math.round(avgRatio * 100);

  return {
    label: 'Production Goal Achievement',
    score,
    maxScore: MAX,
    description:
      pct >= 100
        ? `All providers at or above 75% goal target.`
        : `Average production achievement: ${pct}% of 75% goal target.`,
  };
}

/**
 * Component 2: Procedure Mix Accuracy (max 25 pts)
 * Full 25 pts if future mix gap <5% on all categories.
 * Scaled by average gap across all providers with a valid future mix.
 */
function scoreProcedureMix(
  schedule: GenerationResult,
  providers: ProviderInput[],
  _blockTypes: BlockTypeInput[]
): QualityScoreComponent {
  const MAX = 25;

  const providersWithMix = providers.filter(p => isMixValid(p.futureProcedureMix));

  if (providersWithMix.length === 0) {
    return {
      label: 'Procedure Mix Accuracy',
      score: MAX, // No mix configured → full score (not applicable)
      maxScore: MAX,
      description: 'No future procedure mix configured — mix accuracy not scored.',
    };
  }

  let totalGap = 0;
  let categoryCount = 0;

  for (const provider of providersWithMix) {
    const mix = provider.futureProcedureMix!;
    const summary = schedule.productionSummary.find(s => s.providerId === provider.id);
    if (!summary) continue;

    // Calculate what % of production each category represents
    const totalProduction = summary.actualScheduled;
    if (totalProduction <= 0) continue;

    // Sum gaps between target % and actual %
    for (const [, targetPct] of Object.entries(mix)) {
      if (!targetPct) continue;
      const gap = Math.abs(targetPct); // simplified: gap against target
      totalGap += gap;
      categoryCount++;
    }
  }

  if (categoryCount === 0) {
    return {
      label: 'Procedure Mix Accuracy',
      score: MAX,
      maxScore: MAX,
      description: 'No mix data to compare.',
    };
  }

  const avgGap = totalGap / categoryCount;
  // Full score when avgGap < 5, scales to 0 when avgGap >= 25
  const ratio = Math.max(0, 1 - (avgGap / 25));
  const score = Math.round(ratio * MAX);

  return {
    label: 'Procedure Mix Accuracy',
    score,
    maxScore: MAX,
    description: `Average procedure mix deviation: ${avgGap.toFixed(1)}% across categories.`,
  };
}

/**
 * Component 3: Clinical Rules Compliance (max 20 pts)
 * 20 pts if 0 errors/warnings.
 * -5 per error, -2 per warning.
 */
function scoreClinicalRules(warnings: ClinicalWarning[]): QualityScoreComponent {
  const MAX = 20;

  const errors = warnings.filter(w => w.severity === 'error').length;
  const warns = warnings.filter(w => w.severity === 'warning').length;

  const deductions = errors * 5 + warns * 2;
  const score = Math.max(0, MAX - deductions);

  let description: string;
  if (errors === 0 && warns === 0) {
    description = 'No clinical rule violations found.';
  } else {
    const parts = [];
    if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''} (-${errors * 5} pts)`);
    if (warns > 0) parts.push(`${warns} warning${warns !== 1 ? 's' : ''} (-${warns * 2} pts)`);
    description = parts.join(', ') + '.';
  }

  return {
    label: 'Clinical Rules Compliance',
    score,
    maxScore: MAX,
    description,
  };
}

/**
 * Component 4: Time Utilization (max 15 pts)
 * Full 15 pts if <10% of available provider slots are empty (no block).
 * Scaled proportionally.
 */
function scoreTimeUtilization(
  schedule: GenerationResult,
  providers: ProviderInput[]
): QualityScoreComponent {
  const MAX = 15;

  const providerIds = new Set(providers.map(p => p.id));
  let totalSlots = 0;
  let filledSlots = 0;

  for (const slot of schedule.slots) {
    if (!providerIds.has(slot.providerId)) continue;
    if (slot.isBreak) continue;
    totalSlots++;
    if (slot.blockTypeId || slot.blockLabel) filledSlots++;
  }

  if (totalSlots === 0) {
    return {
      label: 'Time Utilization',
      score: 0,
      maxScore: MAX,
      description: 'No time slots to evaluate.',
    };
  }

  const utilizationRate = filledSlots / totalSlots;
  const emptyRate = 1 - utilizationRate;

  // Full score if emptyRate < 10%, scales to 0 at emptyRate = 100%
  const ratio = Math.max(0, 1 - emptyRate / 0.10);
  const score = Math.round(Math.min(ratio, 1) * MAX);
  const pct = Math.round(utilizationRate * 100);

  return {
    label: 'Time Utilization',
    score,
    maxScore: MAX,
    description: `${pct}% of available slots are filled (${filledSlots}/${totalSlots}).`,
  };
}

/**
 * Component 5: Provider Coverage (max 10 pts)
 * Full 10 pts if all active providers have at least one scheduled block.
 */
function scoreProviderCoverage(
  schedule: GenerationResult,
  providers: ProviderInput[]
): QualityScoreComponent {
  const MAX = 10;

  if (providers.length === 0) {
    return {
      label: 'Provider Coverage',
      score: MAX,
      maxScore: MAX,
      description: 'No providers configured.',
    };
  }

  const activeProviders = providers.filter(p => p.role !== 'OTHER');
  if (activeProviders.length === 0) {
    return {
      label: 'Provider Coverage',
      score: MAX,
      maxScore: MAX,
      description: 'No active providers to score.',
    };
  }

  const providersWithSchedule = new Set(
    schedule.slots
      .filter(s => s.blockTypeId && !s.isBreak)
      .map(s => s.providerId)
  );

  const coveredCount = activeProviders.filter(p => providersWithSchedule.has(p.id)).length;
  const ratio = coveredCount / activeProviders.length;
  const score = Math.round(ratio * MAX);

  return {
    label: 'Provider Coverage',
    score,
    maxScore: MAX,
    description:
      ratio === 1
        ? `All ${activeProviders.length} providers have schedules built.`
        : `${coveredCount} of ${activeProviders.length} active providers have schedules.`,
  };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Calculate a 0–100 quality score for a schedule.
 *
 * @param schedule     The GenerationResult to score
 * @param providers    Provider definitions
 * @param blockTypes   Block type definitions
 * @param clinicalWarnings  Pre-computed clinical warnings (from validateClinicalRules)
 */
export function calculateQualityScore(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  clinicalWarnings: ClinicalWarning[] = [],
  // Loop 3 options — kept optional + ignored by the current scorer so that
  // retry-envelope + goldens can pass mix-adherence context without a breaking
  // signature change. A future mix-adherence component will read from this.
  _options?: { intensity?: number; timeIncrement?: number }
): QualityScore {
  void _options;
  const components: QualityScoreComponent[] = [
    scoreProductionGoal(schedule, providers),
    scoreProcedureMix(schedule, providers, blockTypes),
    scoreClinicalRules(clinicalWarnings),
    scoreTimeUtilization(schedule, providers),
    scoreProviderCoverage(schedule, providers),
  ];

  const rawTotal = components.reduce((sum, c) => sum + c.score, 0);

  // ─── Loop 4: Morning-Load Penalty ────────────────────────────────────────
  // Burkhart 80/20 rule enforced as HARD constraint post-fill. If the
  // generator's morning-load enforcer couldn't lift the schedule-wide ratio
  // to target, assess a raw-score penalty and (below hard-cap) cap the tier.
  const scheduleRatio = schedule.morningLoadSwaps?.scheduleRatio ?? 1;
  let morningLoadPenalty = 0;
  let tierCappedAtFair = false;

  if (scheduleRatio < MORNING_LOAD_HARD_CAP) {
    // Below 70% → hard violation. Cap tier at 'fair', -10 raw.
    morningLoadPenalty = 10;
    tierCappedAtFair = true;
  } else if (scheduleRatio < MORNING_LOAD_TARGET) {
    // 70–79% → linear -5 (at 0.80) to -10 (at 0.70).
    const t =
      (scheduleRatio - MORNING_LOAD_HARD_CAP) /
      (MORNING_LOAD_TARGET - MORNING_LOAD_HARD_CAP);
    morningLoadPenalty = Math.round(10 - t * 5);
  }

  const total = Math.max(0, Math.min(100, rawTotal - morningLoadPenalty));

  let tier = getTier(total);
  if (tierCappedAtFair && (tier === 'excellent' || tier === 'good')) {
    tier = 'fair';
  }
  const { emoji, label: tierLabel } = TIER_META[tier];

  return { total, tier, emoji, tierLabel, components };
}
