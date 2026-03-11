/**
 * Provider Benchmarking Engine — Sprint 16
 *
 * Compares providers' configuration and scheduled production against org-wide averages.
 * Pure computation — no React/browser dependencies.
 */

import type { ProviderInput } from './engine/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ProviderRole = 'DOCTOR' | 'HYGIENIST' | 'ASSISTANT';

export interface ProviderBenchmarkRow {
  officeId: string;
  officeName: string;
  providerId: string;
  providerName: string;
  role: ProviderRole;
  dailyGoal: number;
  scheduledProduction: number;
  qualityScore: number | null;
  /** Difference vs. org median scheduled production */
  gapToMedian: number;
  /** Above or below org median */
  vsMedian: 'above' | 'below' | 'at';
}

export interface RoleBenchmarkStats {
  role: ProviderRole;
  count: number;
  avgDailyGoal: number;
  medianScheduledProduction: number;
  p25ScheduledProduction: number;
  p75ScheduledProduction: number;
  avgQualityScore: number | null;
  topOfficesByProduction: Array<{
    officeId: string;
    officeName: string;
    providerId: string;
    providerName: string;
    scheduledProduction: number;
  }>;
}

export interface BenchmarkResult {
  byRole: Map<ProviderRole, RoleBenchmarkStats>;
  rows: ProviderBenchmarkRow[];
}

// ─── Input shapes ─────────────────────────────────────────────────────────────────

export interface OfficeProviderData {
  officeId: string;
  officeName: string;
  providers: ProviderInput[];
  /** Map providerId → scheduled production (from schedule data) */
  scheduledProductionByProvider: Map<string, number>;
  /** Map providerId → quality score, or office-level quality score */
  qualityScoreByProvider?: Map<string, number>;
  officeQualityScore?: number | null;
}

// ─── Percentile helper ────────────────────────────────────────────────────────────

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedArr[lo];
  return sortedArr[lo] + (sortedArr[hi] - sortedArr[lo]) * (idx - lo);
}

function median(sortedArr: number[]): number {
  return percentile(sortedArr, 50);
}

// ─── Main function ────────────────────────────────────────────────────────────────

export function benchmarkProviders(
  offices: OfficeProviderData[]
): BenchmarkResult {
  const roles: ProviderRole[] = ['DOCTOR', 'HYGIENIST', 'ASSISTANT'];
  const allRows: ProviderBenchmarkRow[] = [];

  // Build all rows first
  for (const office of offices) {
    for (const provider of office.providers) {
      const role: ProviderRole =
        provider.role === 'DOCTOR' ? 'DOCTOR' :
        provider.role === 'HYGIENIST' ? 'HYGIENIST' : 'ASSISTANT';

      const scheduledProduction =
        office.scheduledProductionByProvider.get(provider.id) ?? 0;

      const qualityScore =
        office.qualityScoreByProvider?.get(provider.id) ??
        office.officeQualityScore ??
        null;

      allRows.push({
        officeId: office.officeId,
        officeName: office.officeName,
        providerId: provider.id,
        providerName: provider.name,
        role,
        dailyGoal: provider.dailyGoal,
        scheduledProduction,
        qualityScore,
        gapToMedian: 0, // filled in after median calc
        vsMedian: 'at',
      });
    }
  }

  // Compute stats per role
  const byRole = new Map<ProviderRole, RoleBenchmarkStats>();

  for (const role of roles) {
    const roleRows = allRows.filter(r => r.role === role);
    if (roleRows.length === 0) continue;

    const goals = roleRows.map(r => r.dailyGoal);
    const productions = roleRows.map(r => r.scheduledProduction).sort((a, b) => a - b);
    const qualityScores = roleRows
      .map(r => r.qualityScore)
      .filter((q): q is number => q !== null);

    const avgDailyGoal = goals.reduce((s, v) => s + v, 0) / goals.length;
    const medianProd = median(productions);
    const p25Prod = percentile(productions, 25);
    const p75Prod = percentile(productions, 75);
    const avgQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((s, v) => s + v, 0) / qualityScores.length
      : null;

    const topOffices = [...roleRows]
      .sort((a, b) => b.scheduledProduction - a.scheduledProduction)
      .slice(0, 3)
      .map(r => ({
        officeId: r.officeId,
        officeName: r.officeName,
        providerId: r.providerId,
        providerName: r.providerName,
        scheduledProduction: r.scheduledProduction,
      }));

    byRole.set(role, {
      role,
      count: roleRows.length,
      avgDailyGoal: Math.round(avgDailyGoal),
      medianScheduledProduction: Math.round(medianProd),
      p25ScheduledProduction: Math.round(p25Prod),
      p75ScheduledProduction: Math.round(p75Prod),
      avgQualityScore: avgQualityScore !== null ? Math.round(avgQualityScore) : null,
      topOfficesByProduction: topOffices,
    });

    // Update gapToMedian and vsMedian in allRows
    for (const row of roleRows) {
      row.gapToMedian = Math.round(row.scheduledProduction - medianProd);
      row.vsMedian =
        row.scheduledProduction > medianProd + 50 ? 'above' :
        row.scheduledProduction < medianProd - 50 ? 'below' : 'at';
    }
  }

  return { byRole, rows: allRows };
}

// ─── Goal histogram data for chart ────────────────────────────────────────────────

export interface GoalHistogramBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

export function buildGoalHistogram(
  rows: ProviderBenchmarkRow[],
  role: ProviderRole,
  binSize = 1000
): GoalHistogramBin[] {
  const roleRows = rows.filter(r => r.role === role);
  if (roleRows.length === 0) return [];

  const goals = roleRows.map(r => r.dailyGoal);
  const minGoal = Math.floor(Math.min(...goals) / binSize) * binSize;
  // Ensure maxGoal is always strictly greater than all values so last bin is inclusive
  const rawMax = Math.max(...goals);
  const maxGoal = Math.ceil((rawMax + 1) / binSize) * binSize;

  const bins: GoalHistogramBin[] = [];
  for (let bin = minGoal; bin < maxGoal; bin += binSize) {
    const count = goals.filter(g => g >= bin && g < bin + binSize).length;
    bins.push({
      label: `$${(bin / 1000).toFixed(0)}k–$${((bin + binSize) / 1000).toFixed(0)}k`,
      min: bin,
      max: bin + binSize,
      count,
    });
  }
  // Include last bin edge
  if (bins.length === 0 && goals.length > 0) {
    bins.push({
      label: `$${(minGoal / 1000).toFixed(0)}k+`,
      min: minGoal,
      max: minGoal + binSize,
      count: goals.length,
    });
  }

  return bins;
}
