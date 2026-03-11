"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GenerationResult, ProviderInput } from "@/lib/engine/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DaySummary {
  day: string;
  dayLabel: string;
  scheduled: number;
  target: number;
  pct: number;
  status: "green" | "amber" | "red" | "empty";
  providers: { name: string; role: string; color: string; scheduled: number }[];
}

interface WeeklyProductionOverviewProps {
  officeId: string;
  workingDays: string[];
  generatedSchedules: Record<string, GenerationResult>;
  providers: ProviderInput[];
  totalDailyGoal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
};

function getStatusColor(status: DaySummary["status"]): string {
  switch (status) {
    case "green": return "border-green-300 dark:border-green-700";
    case "amber": return "border-amber-300 dark:border-amber-700";
    case "red":   return "border-red-300 dark:border-red-700";
    default:      return "border-border";
  }
}

function getStatusBg(status: DaySummary["status"]): string {
  switch (status) {
    case "green": return "bg-green-50 dark:bg-green-950/30";
    case "amber": return "bg-amber-50 dark:bg-amber-950/30";
    case "red":   return "bg-red-50 dark:bg-red-950/30";
    default:      return "bg-muted/30";
  }
}

function getStatusText(status: DaySummary["status"]): string {
  switch (status) {
    case "green": return "text-green-700 dark:text-green-400";
    case "amber": return "text-amber-700 dark:text-amber-400";
    case "red":   return "text-red-700 dark:text-red-400";
    default:      return "text-muted-foreground";
  }
}

function getProgressBg(status: DaySummary["status"]): string {
  switch (status) {
    case "green": return "bg-green-500";
    case "amber": return "bg-amber-500";
    case "red":   return "bg-red-500";
    default:      return "bg-muted-foreground/30";
  }
}

function formatDollars(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WeeklyProductionOverview({
  officeId,
  workingDays,
  generatedSchedules,
  providers,
  totalDailyGoal,
}: WeeklyProductionOverviewProps) {
  const providerById = new Map(providers.map(p => [p.id, p]));

  // Build per-day summary
  const daySummaries: DaySummary[] = workingDays.map(day => {
    const schedule = generatedSchedules[day];
    const dayLabel = DAY_LABELS[day] || day;

    if (!schedule) {
      return {
        day,
        dayLabel,
        scheduled: 0,
        target: totalDailyGoal,
        pct: 0,
        status: "empty" as const,
        providers: [],
      };
    }

    const scheduled = schedule.productionSummary.reduce(
      (sum, s) => sum + (s.actualScheduled ?? 0),
      0
    );
    const target = totalDailyGoal;
    const pct = target > 0 ? (scheduled / target) * 100 : 0;

    let status: DaySummary["status"] = "red";
    if (pct >= 100) status = "green";
    else if (pct >= 75) status = "amber";

    // Per-provider breakdown
    const providerBreakdown = schedule.productionSummary.map(s => {
      const providerRecord = providerById.get(s.providerId);
      return {
        name: s.providerName,
        role: providerRecord?.role ?? 'OTHER',
        color: providerRecord?.color ?? '#666',
        scheduled: s.actualScheduled ?? 0,
      };
    });

    return { day, dayLabel, scheduled, target, pct, status, providers: providerBreakdown };
  });

  // Weekly totals
  const weeklyScheduled = daySummaries.reduce((s, d) => s + d.scheduled, 0);
  const weeklyTarget = totalDailyGoal * workingDays.length;
  const weeklyPct = weeklyTarget > 0 ? (weeklyScheduled / weeklyTarget) * 100 : 0;
  const weeklyStatus: DaySummary["status"] = weeklyPct >= 100 ? "green" : weeklyPct >= 75 ? "amber" : weeklyPct > 0 ? "red" : "empty";

  const scheduledDays = daySummaries.filter(d => d.status !== "empty").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            Weekly Production Overview
          </CardTitle>
          {scheduledDays > 0 && (
            <div className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getStatusBg(weeklyStatus)} ${getStatusText(weeklyStatus)} ${getStatusColor(weeklyStatus)}`}>
              {formatDollars(weeklyScheduled)} / {formatDollars(weeklyTarget)} ({weeklyPct.toFixed(0)}%)
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {daySummaries.map(day => (
          <div
            key={day.day}
            className={`rounded-md border p-2.5 ${getStatusBg(day.status)} ${getStatusColor(day.status)}`}
          >
            {/* Day header */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{day.dayLabel}</span>
                {day.status === "empty" ? (
                  <span className="text-[10px] text-muted-foreground">No schedule</span>
                ) : (
                  <span className={`text-[10px] font-medium ${getStatusText(day.status)}`}>
                    {day.pct.toFixed(0)}% of goal
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {day.status !== "empty" && (
                  <span className={`text-xs font-semibold tabular-nums ${getStatusText(day.status)}`}>
                    {formatDollars(day.scheduled)}
                    <span className="opacity-60 font-normal"> / {formatDollars(day.target)}</span>
                  </span>
                )}
                <Link
                  href={`/offices/${officeId}?day=${day.day}`}
                  className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title={`Jump to ${day.dayLabel} in Template Builder`}
                >
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Progress bar */}
            {day.status !== "empty" && (
              <div className="h-1.5 w-full bg-white/50 dark:bg-black/20 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full ${getProgressBg(day.status)}`}
                  style={{ width: `${Math.min(day.pct, 100)}%` }}
                />
              </div>
            )}

            {/* Provider breakdown */}
            {day.providers.length > 0 && (
              <div className="space-y-0.5">
                {day.providers.map(prov => (
                  <div key={prov.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: prov.color }}
                      />
                      <span className="text-[11px] text-muted-foreground">{prov.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{prov.role}</span>
                    </div>
                    <span className="text-[11px] font-medium tabular-nums">{formatDollars(prov.scheduled)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Weekly total row */}
        {scheduledDays > 0 && (
          <div className={`rounded-md border p-2.5 mt-1 ${getStatusBg(weeklyStatus)} ${getStatusColor(weeklyStatus)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {weeklyPct >= 100 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                ) : weeklyPct >= 75 ? (
                  <Minus className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                )}
                <span className="text-xs font-bold">Weekly Total</span>
                <span className="text-[10px] text-muted-foreground">({scheduledDays}/{workingDays.length} days scheduled)</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs font-bold tabular-nums ${getStatusText(weeklyStatus)}`}>
                  {formatDollars(weeklyScheduled)}
                </span>
                <span className="text-[10px] text-muted-foreground">/ {formatDollars(weeklyTarget)}</span>
                <span className={`text-[10px] font-semibold ml-1 px-1.5 py-0.5 rounded-full ${getStatusBg(weeklyStatus)} ${getStatusText(weeklyStatus)}`}>
                  {weeklyPct.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {scheduledDays === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Generate schedules to see the weekly production overview.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
