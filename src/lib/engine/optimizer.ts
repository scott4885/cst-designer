/**
 * Optimization Advisor — Sprint 13
 *
 * Analyzes the current schedule's quality score and generates prioritized
 * suggestions to raise it. Each suggestion includes:
 *   - category: 'production' | 'mix' | 'clinical' | 'utilization'
 *   - action: Human-readable description of what to change
 *   - estimatedScoreImprovement: estimated +X pts
 *   - difficulty: 'easy' | 'medium' | 'hard'
 *   - autoApply: whether an auto-apply action is available
 *   - applyPayload: optional structured data to drive the auto-apply
 */

import type { GenerationResult, ProviderInput, BlockTypeInput } from './types';
import type { QualityScore } from './quality-score';
import type { ClinicalWarning } from './clinical-rules';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type OptimizationCategory = 'production' | 'mix' | 'clinical' | 'utilization';
export type OptimizationDifficulty = 'easy' | 'medium' | 'hard';

export interface OptimizationSuggestion {
  id: string;
  category: OptimizationCategory;
  action: string;
  estimatedScoreImprovement: number;
  difficulty: OptimizationDifficulty;
  /** Whether this suggestion has an auto-apply action */
  canAutoApply: boolean;
  /** Structured payload for auto-apply (provider/time/blockType hints) */
  applyPayload?: {
    type: 'ADD_BLOCK' | 'MOVE_BLOCK' | 'REPLACE_BLOCK';
    time?: string;
    providerId?: string;
    blockLabel?: string;
    fromTime?: string;
    toTime?: string;
  };
}

// ─── Suggestion Generators ────────────────────────────────────────────────────

/** Production Goal suggestions */
function productionSuggestions(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  qualityScore: QualityScore
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const prodComponent = qualityScore.components.find(c => c.label === 'Production Goal Achievement');
  if (!prodComponent || prodComponent.score >= prodComponent.maxScore) return [];

  const gap = prodComponent.maxScore - prodComponent.score;
  const underProviders = schedule.productionSummary.filter(s => {
    const pct = s.target75 > 0 ? s.actualScheduled / s.target75 : 1;
    return pct < 0.85;
  });

  for (const pSummary of underProviders.slice(0, 2)) {
    const provider = providers.find(p => p.id === pSummary.providerId);
    if (!provider) continue;

    const deficit = pSummary.target75 - pSummary.actualScheduled;
    const deficitPct = pSummary.target75 > 0 ? Math.round((deficit / pSummary.target75) * 100) : 0;

    // Suggest high-value block types for this provider
    const highValueBlocks = blockTypes
      .filter(bt =>
        (bt.minimumAmount ?? 0) >= 800 &&
        (bt.appliesToRole === provider.role || bt.appliesToRole === 'BOTH')
      )
      .sort((a, b) => (b.minimumAmount ?? 0) - (a.minimumAmount ?? 0));

    const suggestedBlock = highValueBlocks[0];
    const blockLabel = suggestedBlock?.label ?? (provider.role === 'DOCTOR' ? 'Crown Prep' : 'SRP');

    // Find the first empty afternoon slot
    const emptyAfternoonSlot = schedule.slots
      .filter(s =>
        s.providerId === provider.id &&
        !s.isBreak &&
        !s.blockTypeId &&
        !s.blockLabel
      )
      .find(s => {
        const [h] = s.time.split(':').map(Number);
        return h >= 13;
      });

    const improvement = Math.min(Math.round(gap * 0.5), 8);

    suggestions.push({
      id: `prod-under-${provider.id}`,
      category: 'production',
      action: `${provider.name} is ${deficitPct}% under production goal — add ${blockLabel} block${emptyAfternoonSlot ? ` at ${emptyAfternoonSlot.time}` : ' in the afternoon'}`,
      estimatedScoreImprovement: improvement,
      difficulty: 'medium',
      canAutoApply: !!emptyAfternoonSlot,
      applyPayload: emptyAfternoonSlot ? {
        type: 'ADD_BLOCK',
        time: emptyAfternoonSlot.time,
        providerId: provider.id,
        blockLabel,
      } : undefined,
    });
  }

  return suggestions;
}

/** Utilization suggestions (empty slots) */
function utilizationSuggestions(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  qualityScore: QualityScore
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const utilComponent = qualityScore.components.find(c => c.label === 'Time Utilization');
  if (!utilComponent || utilComponent.score >= utilComponent.maxScore) return [];

  const gap = utilComponent.maxScore - utilComponent.score;

  // Find providers with empty afternoon slots
  const providerEmptySlots: Record<string, { time: string; count: number }[]> = {};

  for (const slot of schedule.slots) {
    if (slot.isBreak || slot.blockTypeId || slot.blockLabel) continue;
    const [h] = slot.time.split(':').map(Number);
    if (h < 13) continue; // Only flag afternoon gaps

    if (!providerEmptySlots[slot.providerId]) {
      providerEmptySlots[slot.providerId] = [];
    }
    providerEmptySlots[slot.providerId].push({ time: slot.time, count: 1 });
  }

  for (const [providerId, emptySlots] of Object.entries(providerEmptySlots)) {
    if (emptySlots.length < 3) continue; // Only flag significant gaps

    const provider = providers.find(p => p.id === providerId);
    if (!provider) continue;

    // Group into contiguous blocks
    const firstGap = emptySlots[0];
    const lastGap = emptySlots[emptySlots.length - 1];

    // Suggest an easy-to-add block type
    const fillBlock = blockTypes.find(bt =>
      (bt.appliesToRole === provider.role || bt.appliesToRole === 'BOTH') &&
      !bt.isHygieneType
    );
    const blockLabel = fillBlock?.label ?? (provider.role === 'DOCTOR' ? 'Composite' : 'Prophy');

    suggestions.push({
      id: `util-empty-${providerId}`,
      category: 'utilization',
      action: `${provider.name} has ${emptySlots.length} empty slots after ${firstGap.time} — add ${blockLabel} or Exam blocks to improve utilization`,
      estimatedScoreImprovement: Math.min(Math.round(gap * 0.6), 6),
      difficulty: 'easy',
      canAutoApply: true,
      applyPayload: {
        type: 'ADD_BLOCK',
        time: firstGap.time,
        providerId,
        blockLabel,
      },
    });
  }

  return suggestions;
}

/** Clinical rule violation suggestions */
function clinicalSuggestions(
  clinicalWarnings: ClinicalWarning[],
  providers: ProviderInput[],
  qualityScore: QualityScore
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const clinicalComponent = qualityScore.components.find(c => c.label === 'Clinical Rules Compliance');
  if (!clinicalComponent || clinicalComponent.score >= clinicalComponent.maxScore) return [];

  // Suggest fixing the first few errors
  const errors = clinicalWarnings.filter(w => w.severity === 'error').slice(0, 3);
  for (const warning of errors) {
    const providerLabel = warning.affectedProvider ?? 'Provider';

    suggestions.push({
      id: `clinical-error-${warning.ruleId}-${providerLabel.replace(/\s/g, '_')}`,
      category: 'clinical',
      action: `Fix clinical rule violation for ${providerLabel}: ${warning.message}`,
      estimatedScoreImprovement: 5,
      difficulty: 'medium',
      canAutoApply: false,
    });
  }

  // Suggest addressing warnings
  const warns = clinicalWarnings.filter(w => w.severity === 'warning').slice(0, 2);
  for (const warning of warns) {
    const providerLabel = warning.affectedProvider ?? 'Provider';

    suggestions.push({
      id: `clinical-warn-${warning.ruleId}-${providerLabel.replace(/\s/g, '_')}`,
      category: 'clinical',
      action: `Resolve clinical warning for ${providerLabel}: ${warning.message}`,
      estimatedScoreImprovement: 2,
      difficulty: 'easy',
      canAutoApply: false,
    });
  }

  return suggestions;
}

/** Procedure mix suggestions */
function mixSuggestions(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  qualityScore: QualityScore
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const mixComponent = qualityScore.components.find(c => c.label === 'Procedure Mix Accuracy');
  if (!mixComponent || mixComponent.score >= mixComponent.maxScore) return [];

  const gap = mixComponent.maxScore - mixComponent.score;

  for (const provider of providers) {
    const futureMix = provider.futureProcedureMix;
    if (!futureMix) continue;

    const summary = schedule.productionSummary.find(s => s.providerId === provider.id);
    if (!summary || summary.actualScheduled <= 0) continue;

    // Find the most under-represented category
    const underCategories = Object.entries(futureMix)
      .filter(([, pct]) => (pct ?? 0) > 10)
      .map(([category, targetPct]) => {
        const actualBlocks = summary.blocks.filter(b =>
          b.label.toUpperCase().includes(category.split('_')[0])
        );
        const actualPct = actualBlocks.reduce((s, b) => s + b.amount, 0) / summary.actualScheduled * 100;
        return { category, targetPct: targetPct ?? 0, actualPct, gap: (targetPct ?? 0) - actualPct };
      })
      .filter(c => c.gap > 15)
      .sort((a, b) => b.gap - a.gap);

    if (underCategories.length === 0) continue;

    const topGap = underCategories[0];
    const categoryLabel = topGap.category.replace(/_/g, ' ').toLowerCase();

    // Find matching block type
    const matchingBlock = blockTypes.find(bt =>
      bt.procedureCategory === topGap.category &&
      (bt.appliesToRole === provider.role || bt.appliesToRole === 'BOTH')
    );

    if (!matchingBlock) continue;

    suggestions.push({
      id: `mix-under-${provider.id}-${topGap.category}`,
      category: 'mix',
      action: `${provider.name} is ${Math.round(topGap.gap)}% under target for ${categoryLabel} — add more ${matchingBlock.label} blocks`,
      estimatedScoreImprovement: Math.min(Math.round(gap * 0.4), 5),
      difficulty: 'medium',
      canAutoApply: false,
    });
  }

  return suggestions;
}

// ─── Provider Coverage Suggestions ───────────────────────────────────────────

function coverageSuggestions(
  schedule: GenerationResult,
  providers: ProviderInput[],
  qualityScore: QualityScore
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  const coverageComponent = qualityScore.components.find(c => c.label === 'Provider Coverage');
  if (!coverageComponent || coverageComponent.score >= coverageComponent.maxScore) return [];

  const providersWithSchedule = new Set(
    schedule.slots
      .filter(s => s.blockTypeId && !s.isBreak)
      .map(s => s.providerId)
  );

  const uncoveredProviders = providers.filter(p =>
    p.role !== 'OTHER' && !providersWithSchedule.has(p.id)
  );

  for (const provider of uncoveredProviders.slice(0, 2)) {
    suggestions.push({
      id: `coverage-${provider.id}`,
      category: 'production',
      action: `${provider.name} has no scheduled blocks — run Smart Fill or add blocks manually`,
      estimatedScoreImprovement: 3,
      difficulty: 'easy',
      canAutoApply: false,
    });
  }

  return suggestions;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Generate prioritized optimization suggestions for a schedule.
 *
 * @param schedule         The current GenerationResult
 * @param providers        Provider definitions
 * @param blockTypes       Block type definitions
 * @param qualityScore     Pre-computed QualityScore (to avoid re-computing)
 * @param clinicalWarnings Pre-computed clinical warnings
 */
export function generateOptimizationSuggestions(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  qualityScore: QualityScore,
  clinicalWarnings: ClinicalWarning[] = []
): OptimizationSuggestion[] {
  const all: OptimizationSuggestion[] = [
    ...productionSuggestions(schedule, providers, blockTypes, qualityScore),
    ...utilizationSuggestions(schedule, providers, blockTypes, qualityScore),
    ...clinicalSuggestions(clinicalWarnings, providers, qualityScore),
    ...mixSuggestions(schedule, providers, blockTypes, qualityScore),
    ...coverageSuggestions(schedule, providers, qualityScore),
  ];

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = all.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // Sort by estimated score improvement (highest first), then difficulty (easy first)
  const difficultyOrder: Record<OptimizationDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
  return unique.sort((a, b) => {
    if (b.estimatedScoreImprovement !== a.estimatedScoreImprovement) {
      return b.estimatedScoreImprovement - a.estimatedScoreImprovement;
    }
    return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
  });
}
