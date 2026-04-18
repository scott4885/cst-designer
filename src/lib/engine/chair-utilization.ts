/**
 * Chair Utilization Engine — Sprint 17, Task 2
 *
 * Calculates how much of the available chair time is scheduled vs. empty
 * for each office and provider.
 */

import type { ProcedureCategory } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UtilizationGrade = 'A' | 'B' | 'C' | 'D';

export interface ChairUtilizationInput {
  officeId: string;
  officeName: string;
  /** Office open time, e.g. "08:00" */
  startTime: string;
  /** Office close time, e.g. "17:00" */
  endTime: string;
  /** Lunch start, e.g. "12:00" */
  lunchStart?: string;
  /** Lunch end, e.g. "13:00" */
  lunchEnd?: string;
  /** Number of operatories */
  operatoryCount: number;
  /** Number of working days per week */
  workingDays: string[];
  /** Slots from the schedule (serialized from localStorage) */
  scheduledSlots: ScheduledSlotSummary[];
}

export interface ScheduledSlotSummary {
  providerId: string;
  dayOfWeek: string;
  blockTypeId: string | null;
  blockLabel: string | null;
  blockInstanceId: string | null;
  isBreak: boolean;
  durationMin: number;
  /** Procedure category for category breakdown */
  category?: ProcedureCategory | null;
}

export interface DayUtilization {
  dayOfWeek: string;
  chairHoursAvailable: number;
  chairHoursScheduled: number;
  utilizationPct: number;
  grade: UtilizationGrade;
}

export interface CategoryBreakdown {
  category: string;
  label: string;
  hours: number;
  pct: number;
}

export interface ChairUtilizationResult {
  officeId: string;
  officeName: string;
  chairHoursAvailable: number; // per week
  chairHoursScheduled: number; // per week
  utilizationPct: number;
  grade: UtilizationGrade;
  byDay: DayUtilization[];
  byCategoryBreakdown: CategoryBreakdown[];
  emptySlotsAnalysis: EmptySlotAnalysis[];
}

export interface EmptySlotAnalysis {
  dayOfWeek: string;
  emptyHours: number;
  emptyPct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "HH:MM" to minutes since midnight */
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

const CATEGORY_LABELS: Record<string, string> = {
  MAJOR_RESTORATIVE: 'Major Restorative',
  ENDODONTICS: 'Endodontics',
  BASIC_RESTORATIVE: 'Basic Restorative',
  PERIODONTICS: 'Periodontics',
  NEW_PATIENT_DIAG: 'New Patient / Diag',
  EMERGENCY_ACCESS: 'Emergency / Access',
  ORAL_SURGERY: 'Oral Surgery',
  PROSTHODONTICS: 'Prosthodontics',
  HYGIENE: 'Hygiene',
  BREAK: 'Break / Lunch',
  UNCATEGORIZED: 'Uncategorized',
};

/** Grade utilization percentage */
export function gradeUtilization(pct: number): UtilizationGrade {
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  return 'D';
}

// ─── Core Calculator ──────────────────────────────────────────────────────────

/**
 * Calculate chair utilization for a single office.
 */
export function calculateChairUtilization(input: ChairUtilizationInput): ChairUtilizationResult {
  const {
    officeId,
    officeName,
    startTime,
    endTime,
    lunchStart,
    lunchEnd,
    operatoryCount,
    workingDays,
    scheduledSlots,
  } = input;

  // Chair hours available per day (end - start - lunch) × operatories
  const dayMinutes = timeToMin(endTime) - timeToMin(startTime);
  const lunchMinutes =
    lunchStart && lunchEnd ? timeToMin(lunchEnd) - timeToMin(lunchStart) : 0;
  const netDayMinutes = Math.max(0, dayMinutes - lunchMinutes);
  const chairHoursAvailablePerDay = (netDayMinutes / 60) * operatoryCount;
  const chairHoursAvailable = chairHoursAvailablePerDay * workingDays.length;

  // Aggregate scheduled time per day
  const scheduledByDay: Record<string, number> = {};
  for (const day of workingDays) {
    scheduledByDay[day] = 0;
  }

  // Sum unique block instance durations per day (don't double-count slots)
  // Group by day → blockInstanceId → pick one slot per instance
  const seenInstances = new Set<string>();
  const categoryHours: Record<string, number> = {};
  let breakFallbackCounter = 0;

  for (const slot of scheduledSlots) {
    if (slot.isBreak) {
      // Count break time separately — use monotonic counter (not Math.random) so
      // utilization is deterministic under the seeded generator.
      const key = `break-${slot.dayOfWeek}-${slot.providerId}-${slot.blockInstanceId ?? `fallback-${breakFallbackCounter++}`}`;
      if (!seenInstances.has(key)) {
        seenInstances.add(key);
        categoryHours['BREAK'] = (categoryHours['BREAK'] || 0) + slot.durationMin / 60;
      }
      continue;
    }
    if (!slot.blockInstanceId) continue;
    const instanceKey = `${slot.dayOfWeek}::${slot.blockInstanceId}`;
    if (seenInstances.has(instanceKey)) continue;
    seenInstances.add(instanceKey);

    const day = slot.dayOfWeek;
    const durHrs = slot.durationMin / 60;
    if (day in scheduledByDay) {
      scheduledByDay[day] += durHrs;
    }

    // Category tracking
    const cat = slot.category || 'UNCATEGORIZED';
    categoryHours[cat] = (categoryHours[cat] || 0) + durHrs;
  }

  const chairHoursScheduled = Object.values(scheduledByDay).reduce((s, v) => s + v, 0);
  const utilizationPct = chairHoursAvailable > 0
    ? Math.round((chairHoursScheduled / chairHoursAvailable) * 100)
    : 0;
  const grade = gradeUtilization(utilizationPct);

  // Per-day breakdown
  const byDay: DayUtilization[] = workingDays.map((day) => {
    const scheduled = scheduledByDay[day] ?? 0;
    const pct = chairHoursAvailablePerDay > 0
      ? Math.round((scheduled / chairHoursAvailablePerDay) * 100)
      : 0;
    return {
      dayOfWeek: day,
      chairHoursAvailable: chairHoursAvailablePerDay,
      chairHoursScheduled: Math.round(scheduled * 10) / 10,
      utilizationPct: pct,
      grade: gradeUtilization(pct),
    };
  });

  // Category breakdown
  const totalScheduledHrs = chairHoursScheduled || 1;
  const byCategoryBreakdown: CategoryBreakdown[] = Object.entries(categoryHours)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, hrs]) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] ?? cat,
      hours: Math.round(hrs * 10) / 10,
      pct: Math.round((hrs / totalScheduledHrs) * 100),
    }));

  // Empty slot analysis per day
  const emptySlotsAnalysis: EmptySlotAnalysis[] = byDay.map((d) => ({
    dayOfWeek: d.dayOfWeek,
    emptyHours: Math.round((d.chairHoursAvailable - d.chairHoursScheduled) * 10) / 10,
    emptyPct: Math.max(0, 100 - d.utilizationPct),
  }));

  return {
    officeId,
    officeName,
    chairHoursAvailable: Math.round(chairHoursAvailable * 10) / 10,
    chairHoursScheduled: Math.round(chairHoursScheduled * 10) / 10,
    utilizationPct,
    grade,
    byDay,
    byCategoryBreakdown,
    emptySlotsAnalysis,
  };
}

/**
 * Build utilization results for multiple offices.
 */
export function buildOrgUtilizationReport(
  offices: ChairUtilizationInput[]
): ChairUtilizationResult[] {
  return offices.map(calculateChairUtilization);
}

/**
 * Export utilization report to CSV string.
 */
export function exportUtilizationToCSV(results: ChairUtilizationResult[]): string {
  const rows: string[] = [
    'Office,Chair Hours Available,Chair Hours Scheduled,Utilization %,Grade',
  ];
  for (const r of results) {
    rows.push(
      `"${r.officeName}",${r.chairHoursAvailable},${r.chairHoursScheduled},${r.utilizationPct}%,${r.grade}`
    );
  }
  return rows.join('\n');
}
