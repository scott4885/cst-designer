/**
 * Analytics & Multi-Location Rollup — Sprint 14
 *
 * Pure computation functions for org-level metrics.
 * No React/browser dependencies — safe for tests.
 */

import type { OfficeData } from './mock-data';
import type { ProcedureCategory } from './engine/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleStatus = 'built' | 'partial' | 'not_started';

export interface OfficeScheduleData {
  officeId: string;
  /** Quality score 0–100 from quality-score engine, or null if no schedule. */
  qualityScore: number | null;
  /** Days that have a schedule built (from localStorage/templates). */
  scheduledDays: string[];
  /** Production per day-of-week from saved templates. */
  productionByDay: Partial<Record<string, number>>;
  /** Future procedure mix from providers (averaged). */
  procedureMix: Partial<Record<ProcedureCategory, number>>;
}

export interface OrgSummaryCards {
  totalOffices: number;
  officesWithSchedules: number;
  averageQualityScore: number | null;
  pctAtOrAboveGoal: number;
  totalWeeklyProduction: number;
}

export interface QualityDistributionBucket {
  label: string;
  count: number;
  /** Lower bound of bucket (for sorting) */
  min: number;
}

export interface GoalAchievementByDay {
  day: string;
  pctMeetingTarget: number;
  count: number;
  total: number;
}

export interface ProcedureMixBreakdown {
  category: ProcedureCategory;
  label: string;
  avgPct: number;
}

export interface ScheduleStatusDonut {
  built: number;
  partial: number;
  not_started: number;
}

export interface OfficeLeagueRow {
  officeId: string;
  officeName: string;
  dpmsSystem: string;
  qualityScore: number | null;
  avgDailyProduction: number;
  daysScheduled: number;
  weeklyProduction: number;
  status: ScheduleStatus;
  goalPerDay: number;
  gap: number; // weeklyProduction - (goalPerDay * workingDays)
}

export interface ProductionGapRow {
  officeId: string;
  officeName: string;
  dpmsSystem: string;
  goalPerDay: number;
  productionByDay: Partial<Record<string, number>>;
  weeklyTotal: number;
  gap: number; // positive = over goal
  status: ScheduleStatus;
  workingDays: string[];
}

// ─── Schedule Status ──────────────────────────────────────────────────────────

export function getScheduleStatus(
  workingDays: string[],
  scheduledDays: string[]
): ScheduleStatus {
  if (workingDays.length === 0) return 'not_started';
  if (scheduledDays.length === 0) return 'not_started';
  if (scheduledDays.length >= workingDays.length) return 'built';
  return 'partial';
}

// ─── Org Summary Cards ────────────────────────────────────────────────────────

export function computeOrgSummary(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): OrgSummaryCards {
  const total = offices.length;

  let officesWithSchedules = 0;
  let qualityScoreSum = 0;
  let qualityScoreCount = 0;
  let atOrAboveGoalCount = 0;
  let officesWithGoalData = 0;
  let totalWeeklyProduction = 0;

  for (const office of offices) {
    const data = scheduleDataMap.get(office.id);
    if (!data) continue;

    const status = getScheduleStatus(office.workingDays, data.scheduledDays);
    if (status === 'built' || status === 'partial') officesWithSchedules++;

    if (data.qualityScore !== null) {
      qualityScoreSum += data.qualityScore;
      qualityScoreCount++;
    }

    // Production & goal
    const weeklyProd = Object.values(data.productionByDay).reduce((s, v) => s + (v ?? 0), 0);
    totalWeeklyProduction += weeklyProd;

    const goalPerDay = office.totalDailyGoal;
    const workingDaysCount = office.workingDays.length || 5;
    const weeklyGoal = goalPerDay * workingDaysCount;

    if (weeklyGoal > 0) {
      officesWithGoalData++;
      if (weeklyProd >= weeklyGoal * 0.95) atOrAboveGoalCount++; // 95% = "at goal"
    }
  }

  return {
    totalOffices: total,
    officesWithSchedules,
    averageQualityScore:
      qualityScoreCount > 0 ? Math.round(qualityScoreSum / qualityScoreCount) : null,
    pctAtOrAboveGoal:
      officesWithGoalData > 0
        ? Math.round((atOrAboveGoalCount / officesWithGoalData) * 100)
        : 0,
    totalWeeklyProduction,
  };
}

// ─── Quality Score Distribution ───────────────────────────────────────────────

export function computeQualityDistribution(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): QualityDistributionBucket[] {
  const buckets: QualityDistributionBucket[] = [
    { label: '90–100', min: 90, count: 0 },
    { label: '75–89', min: 75, count: 0 },
    { label: '60–74', min: 60, count: 0 },
    { label: '<60', min: 0, count: 0 },
  ];

  for (const office of offices) {
    const data = scheduleDataMap.get(office.id);
    const score = data?.qualityScore ?? null;
    if (score === null) continue;

    if (score >= 90) buckets[0].count++;
    else if (score >= 75) buckets[1].count++;
    else if (score >= 60) buckets[2].count++;
    else buckets[3].count++;
  }

  return buckets;
}

// ─── Goal Achievement by Day of Week ─────────────────────────────────────────

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

export function computeGoalAchievementByDay(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): GoalAchievementByDay[] {
  const dayCounts: Record<string, { met: number; total: number }> = {};

  for (const day of DAY_ORDER) {
    dayCounts[day] = { met: 0, total: 0 };
  }

  for (const office of offices) {
    const data = scheduleDataMap.get(office.id);
    if (!data) continue;

    const goalPerDay = office.totalDailyGoal;
    if (goalPerDay <= 0) continue;

    for (const day of office.workingDays) {
      const dayKey = day.toUpperCase();
      if (!dayCounts[dayKey]) continue;

      const prod = data.productionByDay[dayKey] ?? data.productionByDay[day] ?? 0;
      dayCounts[dayKey].total++;
      if (prod >= goalPerDay * 0.75) dayCounts[dayKey].met++;
    }
  }

  return DAY_ORDER.map(day => {
    const { met, total } = dayCounts[day];
    return {
      day,
      pctMeetingTarget: total > 0 ? Math.round((met / total) * 100) : 0,
      count: met,
      total,
    };
  });
}

// ─── Procedure Mix Breakdown ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  MAJOR_RESTORATIVE: 'Major Restorative',
  ENDODONTICS: 'Endodontics',
  BASIC_RESTORATIVE: 'Basic Restorative',
  PERIODONTICS: 'Periodontics',
  NEW_PATIENT_DIAG: 'New Patient / Diag',
  EMERGENCY_ACCESS: 'Emergency / Access',
  ORAL_SURGERY: 'Oral Surgery',
  PROSTHODONTICS: 'Prosthodontics',
};

const ALL_CATEGORIES: ProcedureCategory[] = [
  'MAJOR_RESTORATIVE',
  'ENDODONTICS',
  'BASIC_RESTORATIVE',
  'PERIODONTICS',
  'NEW_PATIENT_DIAG',
  'EMERGENCY_ACCESS',
  'ORAL_SURGERY',
  'PROSTHODONTICS',
];

export function computeProcedureMixBreakdown(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): ProcedureMixBreakdown[] {
  const catSums: Record<ProcedureCategory, number> = {} as Record<ProcedureCategory, number>;
  let officesWithMix = 0;

  for (const cat of ALL_CATEGORIES) catSums[cat] = 0;

  for (const office of offices) {
    const data = scheduleDataMap.get(office.id);
    if (!data || !data.procedureMix) continue;
    const mix = data.procedureMix;
    const keys = Object.keys(mix) as ProcedureCategory[];
    if (keys.length === 0) continue;
    officesWithMix++;
    for (const cat of ALL_CATEGORIES) {
      catSums[cat] += mix[cat] ?? 0;
    }
  }

  return ALL_CATEGORIES.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    avgPct:
      officesWithMix > 0
        ? Math.round((catSums[cat] / officesWithMix) * 10) / 10
        : 0,
  }));
}

// ─── Schedule Status Donut ────────────────────────────────────────────────────

export function computeScheduleStatusDonut(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): ScheduleStatusDonut {
  const result: ScheduleStatusDonut = { built: 0, partial: 0, not_started: 0 };

  for (const office of offices) {
    const data = scheduleDataMap.get(office.id);
    const status = data
      ? getScheduleStatus(office.workingDays, data.scheduledDays)
      : 'not_started';
    result[status]++;
  }

  return result;
}

// ─── Office League Table ──────────────────────────────────────────────────────

export function buildLeagueTable(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): OfficeLeagueRow[] {
  return offices.map(office => {
    const data = scheduleDataMap.get(office.id);
    const scheduledDays = data?.scheduledDays ?? [];
    const productionByDay = data?.productionByDay ?? {};
    const weeklyProduction = Object.values(productionByDay).reduce((s, v) => s + (v ?? 0), 0);
    const daysScheduled = scheduledDays.length;
    const avgDailyProduction = daysScheduled > 0 ? weeklyProduction / daysScheduled : 0;
    const goalPerDay = office.totalDailyGoal;
    const workingDaysCount = Math.max(office.workingDays.length, 1);
    const gap = weeklyProduction - goalPerDay * workingDaysCount;
    const status = getScheduleStatus(office.workingDays, scheduledDays);

    return {
      officeId: office.id,
      officeName: office.name,
      dpmsSystem: office.dpmsSystem,
      qualityScore: data?.qualityScore ?? null,
      avgDailyProduction,
      daysScheduled,
      weeklyProduction,
      status,
      goalPerDay,
      gap,
    };
  });
}

// ─── Production Gap Rollup ────────────────────────────────────────────────────

export function buildProductionGapTable(
  offices: OfficeData[],
  scheduleDataMap: Map<string, OfficeScheduleData>
): ProductionGapRow[] {
  return offices.map(office => {
    const data = scheduleDataMap.get(office.id);
    const productionByDay = data?.productionByDay ?? {};
    const scheduledDays = data?.scheduledDays ?? [];
    const weeklyTotal = Object.values(productionByDay).reduce((s, v) => s + (v ?? 0), 0);
    const goalPerDay = office.totalDailyGoal;
    const gap = weeklyTotal - goalPerDay * Math.max(office.workingDays.length, 1);
    const status = getScheduleStatus(office.workingDays, scheduledDays);

    return {
      officeId: office.id,
      officeName: office.name,
      dpmsSystem: office.dpmsSystem,
      goalPerDay,
      productionByDay,
      weeklyTotal,
      gap,
      status,
      workingDays: office.workingDays,
    };
  });
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Convert the production gap table to a CSV string.
 */
export function exportGapTableToCSV(rows: ProductionGapRow[]): string {
  const headers = [
    'Office',
    'DPMS',
    'Goal/Day',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Weekly Total',
    'Gap',
    'Status',
  ];

  const escapeCSV = (val: string | number): string => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const statusLabel = (status: ScheduleStatus): string => {
    if (status === 'built') return '🟢 At Goal / Built';
    if (status === 'partial') return '🟡 Partial';
    return '⬜ Not Built';
  };

  const dayKeys = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

  const lines: string[] = [headers.map(escapeCSV).join(',')];

  for (const row of rows) {
    const dayProds = dayKeys.map(d => {
      const val = row.productionByDay[d] ?? row.productionByDay[d.charAt(0) + d.slice(1).toLowerCase()] ?? 0;
      return escapeCSV(val > 0 ? `$${val.toLocaleString()}` : '');
    });

    lines.push(
      [
        escapeCSV(row.officeName),
        escapeCSV(row.dpmsSystem),
        escapeCSV(`$${row.goalPerDay.toLocaleString()}`),
        ...dayProds,
        escapeCSV(`$${row.weeklyTotal.toLocaleString()}`),
        escapeCSV(row.gap >= 0 ? `+$${row.gap.toLocaleString()}` : `-$${Math.abs(row.gap).toLocaleString()}`),
        escapeCSV(statusLabel(row.status)),
      ].join(',')
    );
  }

  return lines.join('\n');
}
