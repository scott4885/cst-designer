/**
 * Production Mix Analyzer
 *
 * Calculates the % breakdown of scheduled production by category (HP, NP, MP, ER,
 * Recare, SRP, PM, Non-Prod) and compares against industry benchmark ranges.
 */

import type { GenerationResult, BlockTypeInput, ProviderInput } from './types';
import { categorizeLabel, BlockCategory } from './generator';

// ─── Public types ──────────────────────────────────────────────────────────

export type { BlockCategory };

export interface CategoryEntry {
  category: BlockCategory;
  /** Human-readable label for this category */
  displayLabel: string;
  amount: number;
  count: number;
  /** 0-100, proportion of totalAmount */
  percentage: number;
}

export interface ProviderMix {
  providerId: string;
  providerName: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  entries: CategoryEntry[];
  totalAmount: number;
}

export interface ProductionMix {
  providers: ProviderMix[];
  combined: {
    entries: CategoryEntry[];
    totalAmount: number;
  };
}

export interface CategoryBenchmark {
  category: BlockCategory;
  /** Ideal minimum % (0-100) */
  idealMin: number;
  /** Ideal maximum % (0-100) */
  idealMax: number;
  /** Actual % from the mix (0-100) */
  actual: number;
  status: 'OK' | 'UNDER' | 'OVER' | 'N/A';
  warning?: string;
}

export interface BenchmarkComparison {
  role: 'DOCTOR' | 'HYGIENIST';
  categories: CategoryBenchmark[];
  /** Human-readable warnings for out-of-range categories */
  warnings: string[];
}

// ─── Industry benchmarks ───────────────────────────────────────────────────

export const DOCTOR_BENCHMARKS: Record<string, { min: number; max: number }> = {
  HP:       { min: 55, max: 70 },
  NP:       { min: 15, max: 20 },
  MP:       { min: 10, max: 15 },
  ER:       { min:  5, max: 10 },
};

export const HYGIENIST_BENCHMARKS: Record<string, { min: number; max: number }> = {
  RECARE:   { min: 40, max: 50 },
  SRP:      { min: 20, max: 30 },
  PM:       { min: 15, max: 20 },
  NP:       { min: 10, max: 15 },
};

// ─── Display labels ────────────────────────────────────────────────────────

const CATEGORY_DISPLAY: Record<BlockCategory, string> = {
  HP:       'High Production',
  NP:       'New Patient',
  SRP:      'Scaling & Root Planing',
  ER:       'Emergency',
  MP:       'Medium Production',
  RECARE:   'Recare / Recall',
  PM:       'Perio Maintenance',
  NON_PROD: 'Non-Productive',
  OTHER:    'Other',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Strip ">$NNN" suffix from a block label to get the base label */
function stripAmountSuffix(label: string): string {
  const idx = label.indexOf('>$');
  return idx >= 0 ? label.slice(0, idx).trim() : label.trim();
}

/** Merge entries from multiple ProviderMix arrays into combined totals */
function mergeCategoryEntries(
  allEntries: CategoryEntry[][]
): CategoryEntry[] {
  const map = new Map<BlockCategory, { amount: number; count: number }>();

  for (const entries of allEntries) {
    for (const e of entries) {
      const existing = map.get(e.category) ?? { amount: 0, count: 0 };
      map.set(e.category, {
        amount: existing.amount + e.amount,
        count: existing.count + e.count,
      });
    }
  }

  const total = Array.from(map.values()).reduce((s, v) => s + v.amount, 0);

  return Array.from(map.entries()).map(([category, data]) => ({
    category,
    displayLabel: CATEGORY_DISPLAY[category],
    amount: data.amount,
    count: data.count,
    percentage: total > 0 ? (data.amount / total) * 100 : 0,
  }));
}

// ─── Main functions ────────────────────────────────────────────────────────

/**
 * Calculate the production mix from a generated schedule.
 *
 * @param schedule   The GenerationResult (slots + productionSummary)
 * @param blockTypes The office's block type definitions (used for categorization)
 * @param providers  Optional – supply to include role info on ProviderMix
 */
export function calculateProductionMix(
  schedule: GenerationResult,
  blockTypes: BlockTypeInput[],
  providers?: ProviderInput[]
): ProductionMix {
  // Build lookup: blockTypeId → category (for label-based fallback)
  const blockTypeById = new Map(blockTypes.map(bt => [bt.id, bt]));
  const providerById = new Map((providers ?? []).map(p => [p.id, p]));

  const providerMixes: ProviderMix[] = schedule.productionSummary.map(summary => {
    const providerRole: 'DOCTOR' | 'HYGIENIST' | 'OTHER' =
      providerById.get(summary.providerId)?.role ?? 'OTHER';

    // Accumulate by category
    const categoryMap = new Map<BlockCategory, { amount: number; count: number }>();

    for (const block of summary.blocks) {
      // Try to find the BlockTypeInput matching this label
      const baseLabel = stripAmountSuffix(block.label);

      // 1. Match by exact label
      const matchedBT = blockTypes.find(
        bt => bt.label.toLowerCase() === baseLabel.toLowerCase()
      );

      // 2. Categorize: prefer matched BlockTypeInput label, else raw label
      const category = matchedBT
        ? categorizeLabel(matchedBT.label)
        : categorizeLabel(baseLabel);

      const existing = categoryMap.get(category) ?? { amount: 0, count: 0 };
      categoryMap.set(category, {
        amount: existing.amount + block.amount,
        count: existing.count + block.count,
      });
    }

    const totalAmount = Array.from(categoryMap.values()).reduce(
      (s, v) => s + v.amount,
      0
    );

    const entries: CategoryEntry[] = Array.from(categoryMap.entries()).map(
      ([category, data]) => ({
        category,
        displayLabel: CATEGORY_DISPLAY[category],
        amount: data.amount,
        count: data.count,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      })
    );

    return {
      providerId: summary.providerId,
      providerName: summary.providerName,
      role: providerRole,
      entries,
      totalAmount,
    };
  });

  // Build combined view
  const combinedEntries = mergeCategoryEntries(providerMixes.map(pm => pm.entries));
  const combinedTotal = combinedEntries.reduce((s, e) => s + e.amount, 0);

  return {
    providers: providerMixes,
    combined: {
      entries: combinedEntries,
      totalAmount: combinedTotal,
    },
  };
}

/**
 * Compare a single provider's production mix against industry benchmarks.
 *
 * @param mix   The ProviderMix (or combined entries wrapped similarly)
 * @param role  'DOCTOR' | 'HYGIENIST'
 */
export function compareToIndustryBenchmark(
  mix: ProviderMix | { entries: CategoryEntry[]; totalAmount: number },
  role: 'DOCTOR' | 'HYGIENIST'
): BenchmarkComparison {
  const benchmarks = role === 'DOCTOR' ? DOCTOR_BENCHMARKS : HYGIENIST_BENCHMARKS;
  const warnings: string[] = [];

  // Build a lookup of actual percentages by category
  const actualByCategory = new Map<BlockCategory, number>();
  for (const entry of mix.entries) {
    actualByCategory.set(entry.category, entry.percentage);
  }

  const categories: CategoryBenchmark[] = Object.entries(benchmarks).map(
    ([catKey, { min, max }]) => {
      const category = catKey as BlockCategory;
      const actual = actualByCategory.get(category) ?? 0;

      let status: CategoryBenchmark['status'] = 'OK';
      let warning: string | undefined;

      if (actual < min) {
        status = 'UNDER';
        warning = `${CATEGORY_DISPLAY[category]} is ${actual.toFixed(1)}% — below the ${min}–${max}% ideal range`;
        warnings.push(warning);
      } else if (actual > max) {
        status = 'OVER';
        warning = `${CATEGORY_DISPLAY[category]} is ${actual.toFixed(1)}% — above the ${min}–${max}% ideal range`;
        warnings.push(warning);
      }

      return { category, idealMin: min, idealMax: max, actual, status, warning };
    }
  );

  return { role, categories, warnings };
}

/** Convenience: compare each provider in a ProductionMix */
export function compareAllProviders(
  mix: ProductionMix,
  providers: ProviderInput[]
): Map<string, BenchmarkComparison> {
  const result = new Map<string, BenchmarkComparison>();
  const providerById = new Map(providers.map(p => [p.id, p]));

  for (const pm of mix.providers) {
    const role = providerById.get(pm.providerId)?.role;
    if (role === 'DOCTOR' || role === 'HYGIENIST') {
      result.set(pm.providerId, compareToIndustryBenchmark(pm, role));
    }
  }

  return result;
}
