/**
 * Weekly Schedule Report helpers (Sprint 15 Task 3)
 */

import type { GenerationResult, ProviderInput, BlockTypeInput } from './engine/types';
import { validateClinicalRules } from './engine/clinical-rules';
import { calculateQualityScore } from './engine/quality-score';

export interface ReportProvider {
  id: string;
  name: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  dailyGoal: number;
  scheduledProduction: number;
  gap: number;
  score: number | null;
}

export interface ReportDay {
  dayOfWeek: string;
  label: string;
  scheduledProduction: number;
  dailyGoal: number;
  achievementPct: number;
  warningCount: number;
  providers: ReportProvider[];
}

export interface ProcedureMixRow {
  label: string;
  currentPct: number;
  targetPct: number;
  delta: number;
}

export interface WeeklyReportData {
  officeName: string;
  weekOf: string;
  generatedAt: string;
  totalScheduledProduction: number;
  totalGoal: number;
  goalAchievementPct: number;
  averageQualityScore: number;
  providerCount: number;
  workingDays: number;
  days: ReportDay[];
  procedureMix: ProcedureMixRow[];
  providers: ReportProvider[];
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
};

/**
 * Build comprehensive weekly report data from generated schedules.
 */
export function buildWeeklyReport(
  officeName: string,
  schedules: Record<string, GenerationResult>,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  totalDailyGoal: number
): WeeklyReportData {
  const now = new Date();

  // Get Monday of current week
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const weekOf = monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const generatedAt = now.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

  const dayOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  const workingDayKeys = dayOrder.filter(d => schedules[d]);

  let totalScheduled = 0;
  let totalGoal = 0;
  let qualityScoreSum = 0;
  let qualityScoreCount = 0;

  const days: ReportDay[] = workingDayKeys.map(dayKey => {
    const schedule = schedules[dayKey];
    const warnings = (() => {
      try {
        return validateClinicalRules(schedule, providers, blockTypes);
      } catch {
        return [];
      }
    })();

    const qs = (() => {
      try {
        return calculateQualityScore(schedule, providers, blockTypes, warnings);
      } catch {
        return null;
      }
    })();

    if (qs) {
      qualityScoreSum += qs.total;
      qualityScoreCount++;
    }

    const dayScheduled = schedule.productionSummary.reduce(
      (s, p) => s + (p.actualScheduled ?? 0), 0
    );
    const dayGoal = providers.reduce((s, p) => s + (p.dailyGoal ?? 0), 0) || totalDailyGoal;

    totalScheduled += dayScheduled;
    totalGoal += dayGoal;

    const reportProviders: ReportProvider[] = providers.map(p => {
      const summary = schedule.productionSummary.find(s => s.providerId === p.id);
      const scheduled = summary?.actualScheduled ?? 0;
      const goal = p.dailyGoal ?? 0;
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        dailyGoal: goal,
        scheduledProduction: scheduled,
        gap: goal - scheduled,
        score: qs ? Math.round(qs.total) : null,
      };
    });

    return {
      dayOfWeek: dayKey,
      label: DAY_LABELS[dayKey] ?? dayKey,
      scheduledProduction: dayScheduled,
      dailyGoal: dayGoal,
      achievementPct: dayGoal > 0 ? Math.round((dayScheduled / dayGoal) * 100) : 0,
      warningCount: warnings.length,
      providers: reportProviders,
    };
  });

  // Provider performance summary across all days
  const providerSummary: ReportProvider[] = providers.map(p => {
    let totalScheduledForProvider = 0;
    let totalGoalForProvider = 0;
    workingDayKeys.forEach(dayKey => {
      const schedule = schedules[dayKey];
      const summary = schedule?.productionSummary.find(s => s.providerId === p.id);
      totalScheduledForProvider += summary?.actualScheduled ?? 0;
      totalGoalForProvider += p.dailyGoal ?? 0;
    });

    return {
      id: p.id,
      name: p.name,
      role: p.role,
      dailyGoal: p.dailyGoal ?? 0,
      scheduledProduction: totalScheduledForProvider,
      gap: totalGoalForProvider - totalScheduledForProvider,
      score: null,
    };
  });

  // Simple procedure mix from block labels
  const blockCounts: Record<string, number> = {};
  let totalBlocks = 0;
  for (const dayKey of workingDayKeys) {
    for (const slot of schedules[dayKey].slots) {
      if (!slot.isBreak && slot.blockLabel) {
        blockCounts[slot.blockLabel] = (blockCounts[slot.blockLabel] ?? 0) + 1;
        totalBlocks++;
      }
    }
  }

  const procedureMix: ProcedureMixRow[] = Object.entries(blockCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      label,
      currentPct: Math.round((count / Math.max(totalBlocks, 1)) * 100),
      targetPct: 0,
      delta: 0,
    }));

  return {
    officeName,
    weekOf,
    generatedAt,
    totalScheduledProduction: totalScheduled,
    totalGoal,
    goalAchievementPct: totalGoal > 0 ? Math.round((totalScheduled / totalGoal) * 100) : 0,
    averageQualityScore: qualityScoreCount > 0 ? Math.round(qualityScoreSum / qualityScoreCount) : 0,
    providerCount: providers.length,
    workingDays: workingDayKeys.length,
    days,
    procedureMix,
    providers: providerSummary,
  };
}
