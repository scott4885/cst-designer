/**
 * Procedure Mix Intelligence — Sprint 9
 * Gap analysis utilities for current vs. future procedure mix.
 */

import type { ProcedureMix, MixGapRow, ProcedureCategory } from './types';
import { ALL_PROCEDURE_CATEGORIES, PROCEDURE_CATEGORY_LABELS } from './types';

/**
 * Generate gap analysis rows comparing current vs. future mix.
 * Only returns rows where |gap| > 3%.
 */
export function computeMixGapAnalysis(
  currentMix: ProcedureMix,
  futureMix: ProcedureMix
): MixGapRow[] {
  const rows: MixGapRow[] = [];

  for (const cat of ALL_PROCEDURE_CATEGORIES) {
    const currentPct = currentMix[cat] ?? 0;
    const targetPct = futureMix[cat] ?? 0;
    const gap = targetPct - currentPct; // positive = need more, negative = need less

    if (Math.abs(gap) <= 3) continue; // skip within-tolerance rows

    const severity: MixGapRow['severity'] =
      Math.abs(gap) > 10 ? 'red' : Math.abs(gap) > 3 ? 'amber' : 'ok';

    const action = generateActionText(cat, gap);

    rows.push({
      category: cat,
      label: PROCEDURE_CATEGORY_LABELS[cat],
      currentPct,
      targetPct,
      gap,
      action,
      severity,
    });
  }

  // Sort by absolute gap descending (biggest gaps first)
  rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return rows;
}

function generateActionText(cat: ProcedureCategory, gap: number): string {
  const absDiff = Math.abs(gap);
  const isAdd = gap > 0;

  if (absDiff > 15) {
    return isAdd
      ? `Add ${Math.ceil(absDiff / 8)} ${shortName(cat)} blocks/day`
      : `Reduce ${shortName(cat)} by ~${Math.ceil(absDiff / 5) * 30} min/week`;
  }
  if (absDiff > 8) {
    return isAdd
      ? `Add 1 ${shortName(cat)} block/day`
      : `Reduce 1 ${shortName(cat)} block/week`;
  }
  // 4-8%
  return isAdd
    ? `Add 1 ${shortName(cat)} slot/day`
    : `Convert 1 ${shortName(cat)} → higher-value procedure`;
}

function shortName(cat: ProcedureCategory): string {
  const map: Record<ProcedureCategory, string> = {
    MAJOR_RESTORATIVE: 'crown',
    ENDODONTICS: 'endo',
    BASIC_RESTORATIVE: 'composite',
    PERIODONTICS: 'perio',
    NEW_PATIENT_DIAG: 'NP',
    EMERGENCY_ACCESS: 'ER',
    ORAL_SURGERY: 'surgery',
    PROSTHODONTICS: 'prosth',
  };
  return map[cat];
}

/**
 * Validate that a procedure mix sums to 100 (within tolerance).
 * Returns the actual total.
 */
export function getMixTotal(mix: ProcedureMix): number {
  return Object.values(mix).reduce((s, v) => s + (v ?? 0), 0);
}

export function isMixComplete(mix: ProcedureMix): boolean {
  const total = getMixTotal(mix);
  return total >= 99 && total <= 101;
}
