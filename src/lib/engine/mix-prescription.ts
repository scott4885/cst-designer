/**
 * Mix-to-Prescription Engine — Sprint 17 Task 4
 *
 * Converts a doctor's procedure mix (% of production dollars per category)
 * plus a daily goal into a specific prescription of block types and counts.
 */

import type { BlockTypeInput, ProcedureCategory } from './types';
import { inferProcedureCategory } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockPrescriptionItem {
  blockTypeId: string;
  blockTypeName: string;
  category: ProcedureCategory;
  count: number;
  productionPerBlock: number;
  totalProduction: number;
  totalDurationMin: number;
}

export interface CategoryPrescription {
  category: ProcedureCategory;
  targetPct: number;
  targetDollars: number;
  assignedBlocks: BlockPrescriptionItem[];
  actualDollars: number;
  actualPct: number;
}

export interface BlockPrescription {
  totalGoal: number;
  byCategory: CategoryPrescription[];
  blocks: BlockPrescriptionItem[];
  totalScheduledProduction: number;
  gap: number;             // totalGoal - totalScheduledProduction
  coveragePercent: number; // totalScheduledProduction / totalGoal * 100
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the production amount for a block type (falls back to minimumAmount or 0) */
function getProductionAmount(bt: BlockTypeInput): number {
  return bt.minimumAmount ?? 0;
}

/** Get the procedure category for a block type */
function getCategory(bt: BlockTypeInput): ProcedureCategory {
  return bt.procedureCategory ?? inferProcedureCategory(bt.label);
}

// ---------------------------------------------------------------------------
// buildBlockPrescription
// ---------------------------------------------------------------------------

/**
 * Build a block prescription from a procedure mix and daily goal.
 *
 * @param dailyGoal          - Target daily production in dollars
 * @param procedureMix       - Map of ProcedureCategory to % (should sum to 100)
 * @param availableBlockTypes - Office's configured block types
 * @param incrementMin        - Time increment in minutes (10 or 15)
 */
export function buildBlockPrescription(
  dailyGoal: number,
  procedureMix: Partial<Record<ProcedureCategory, number>>,
  availableBlockTypes: BlockTypeInput[],
  incrementMin: number = 10
): BlockPrescription {
  // Filter out hygiene-only types and zero-production blocks for doctor scheduling
  const doctorBlockTypes = availableBlockTypes.filter(
    bt => bt.appliesToRole !== 'HYGIENIST' && !bt.isHygieneType
  );

  // Group block types by category
  const blocksByCategory = new Map<ProcedureCategory, BlockTypeInput[]>();
  for (const bt of doctorBlockTypes) {
    const cat = getCategory(bt);
    const existing = blocksByCategory.get(cat) ?? [];
    existing.push(bt);
    blocksByCategory.set(cat, existing);
  }

  const byCategory: CategoryPrescription[] = [];
  const allBlocks: BlockPrescriptionItem[] = [];
  let totalScheduledProduction = 0;

  for (const [catStr, pct] of Object.entries(procedureMix)) {
    const cat = catStr as ProcedureCategory;
    if (!pct || pct <= 0) continue;

    const targetDollars = dailyGoal * (pct / 100);
    const categoryBlockTypes = blocksByCategory.get(cat) ?? [];

    const assignedBlocks: BlockPrescriptionItem[] = [];

    if (categoryBlockTypes.length === 0) {
      // No block types for this category — record gap
      byCategory.push({
        category: cat,
        targetPct: pct,
        targetDollars,
        assignedBlocks: [],
        actualDollars: 0,
        actualPct: 0,
      });
      continue;
    }

    // Calculate total production weight for proportional splitting
    const totalWeight = categoryBlockTypes.reduce(
      (sum, bt) => sum + Math.max(getProductionAmount(bt), 1),
      0
    );

    for (const bt of categoryBlockTypes) {
      const production = getProductionAmount(bt);
      if (production <= 0) continue;

      // Proportional allocation within this category
      const weight = production / totalWeight;
      const allocatedDollars = targetDollars * weight;

      // Calculate count (round to nearest whole number, minimum 0)
      const count = Math.max(0, Math.round(allocatedDollars / production));

      if (count === 0) continue;

      const totalProduction = count * production;
      const totalDurationMin = count * bt.durationMin;

      const item: BlockPrescriptionItem = {
        blockTypeId: bt.id,
        blockTypeName: bt.label,
        category: cat,
        count,
        productionPerBlock: production,
        totalProduction,
        totalDurationMin,
      };

      assignedBlocks.push(item);
      allBlocks.push(item);
      totalScheduledProduction += totalProduction;
    }

    const actualDollars = assignedBlocks.reduce((s, b) => s + b.totalProduction, 0);

    byCategory.push({
      category: cat,
      targetPct: pct,
      targetDollars,
      assignedBlocks,
      actualDollars,
      actualPct: dailyGoal > 0 ? (actualDollars / dailyGoal) * 100 : 0,
    });
  }

  const gap = dailyGoal - totalScheduledProduction;
  const coveragePercent = dailyGoal > 0
    ? Math.round((totalScheduledProduction / dailyGoal) * 100)
    : 0;

  return {
    totalGoal: dailyGoal,
    byCategory,
    blocks: allBlocks,
    totalScheduledProduction,
    gap,
    coveragePercent,
  };
}

// ---------------------------------------------------------------------------
// Prescription coverage status
// ---------------------------------------------------------------------------

export type CoverageStatus = 'green' | 'amber' | 'red';

/**
 * Get the coverage status color for a category.
 * green = scheduled >= target, amber = 80–99%, red = <80%
 */
export function getCoverageStatus(actualPct: number, targetPct: number): CoverageStatus {
  if (targetPct === 0) return 'green';
  const ratio = actualPct / targetPct;
  if (ratio >= 1.0) return 'green';
  if (ratio >= 0.8) return 'amber';
  return 'red';
}
