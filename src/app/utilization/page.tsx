"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Download, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOfficeStore } from "@/store/office-store";
import {
  calculateChairUtilization,
  exportUtilizationToCSV,
  gradeUtilization,
  type ChairUtilizationResult,
  type ScheduledSlotSummary,
} from "@/lib/engine/chair-utilization";
import type { ProcedureCategory } from "@/lib/engine/types";
import { inferProcedureCategory } from "@/lib/engine/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-600",
  B: "text-blue-600",
  C: "text-yellow-600",
  D: "text-red-600",
};

const GRADE_BG: Record<string, string> = {
  A: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  B: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  C: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  D: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

const CATEGORY_COLORS: Record<string, string> = {
  MAJOR_RESTORATIVE: "#6366f1",
  ENDODONTICS: "#f59e0b",
  BASIC_RESTORATIVE: "#3b82f6",
  PERIODONTICS: "#10b981",
  NEW_PATIENT_DIAG: "#8b5cf6",
  EMERGENCY_ACCESS: "#ef4444",
  ORAL_SURGERY: "#f97316",
  PROSTHODONTICS: "#06b6d4",
  HYGIENE: "#22c55e",
  BREAK: "#e5e7eb",
  UNCATEGORIZED: "#9ca3af",
};

function loadSlotsFromStorage(officeId: string): ScheduledSlotSummary[] {
  if (typeof window === "undefined") return [];
  const slots: ScheduledSlotSummary[] = [];
  try {
    const key = `schedule-designer:schedule-state:${officeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const schedules = JSON.parse(raw) as Record<string, any>;
    for (const [day, sched] of Object.entries(schedules)) {
      if (!sched) continue;
      const slotList: any[] = (sched as any).slots ?? [];
      // Build instance → duration map
      const instanceSeen = new Map<string, boolean>();
      const instanceDuration = new Map<string, number>();
      for (const slot of slotList) {
        if (!slot.blockInstanceId) continue;
        if (!instanceSeen.has(slot.blockInstanceId)) {
          instanceSeen.set(slot.blockInstanceId, true);
          instanceDuration.set(slot.blockInstanceId, 0);
        }
        instanceDuration.set(
          slot.blockInstanceId,
          (instanceDuration.get(slot.blockInstanceId) ?? 0) + 10 // approximate 10min per slot
        );
      }
      // Build one summary slot per block instance
      const emitted = new Set<string>();
      for (const slot of slotList) {
        const instanceId = slot.blockInstanceId;
        if (instanceId && emitted.has(instanceId)) continue;
        if (instanceId) emitted.add(instanceId);
        const label: string = slot.blockLabel ?? "";
        const cat: ProcedureCategory | null = slot.blockTypeId
          ? inferProcedureCategory(label)
          : null;
        slots.push({
          providerId: slot.providerId ?? "",
          dayOfWeek: day,
          blockTypeId: slot.blockTypeId ?? null,
          blockLabel: label || null,
          blockInstanceId: instanceId ?? null,
          isBreak: slot.isBreak ?? false,
          durationMin: instanceId ? (instanceDuration.get(instanceId) ?? 10) : 10,
          category: cat,
        });
      }
    }
  } catch {
    // ignore
  }
  return slots;
}

// ─── Grade Badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${GRADE_BG[grade] ?? GRADE_BG.D}`}>
      {grade}
    </span>
  );
}

// ─── Drill-down Row ───────────────────────────────────────────────────────────

function OfficeRow({
  result,
  expanded,
  onToggle,
}: {
  result: ChairUtilizationResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-3 pr-4">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">{result.officeName}</span>
          </div>
        </td>
        <td className="py-3 pr-4 text-right text-muted-foreground">
          {result.chairHoursAvailable}h
        </td>
        <td className="py-3 pr-4 text-right text-muted-foreground">
          {result.chairHoursScheduled}h
        </td>
        <td className="py-3 pr-4 text-right">
          <span
            className={
              result.utilizationPct >= 90
                ? "text-green-600 font-semibold"
                : result.utilizationPct >= 75
                ? "text-blue-600 font-semibold"
                : result.utilizationPct >= 60
                ? "text-yellow-600 font-semibold"
                : "text-red-600 font-semibold"
            }
          >
            {result.utilizationPct}%
          </span>
        </td>
        <td className="py-3">
          <GradeBadge grade={result.grade} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/20">
          <td colSpan={5} className="p-4">
            <div className="space-y-4">
              {/* Per-day breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  Per-Day Breakdown
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {result.byDay.map((d) => (
                    <div
                      key={d.dayOfWeek}
                      className="bg-card border rounded p-3 text-center"
                    >
                      <div className="text-xs text-muted-foreground font-medium mb-1">
                        {DAY_LABELS[d.dayOfWeek] ?? d.dayOfWeek}
                      </div>
                      <div
                        className={`text-lg font-bold ${GRADE_COLORS[d.grade] ?? "text-foreground"}`}
                      >
                        {d.utilizationPct}%
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.chairHoursScheduled}h / {d.chairHoursAvailable}h
                      </div>
                      <GradeBadge grade={d.grade} />
                    </div>
                  ))}
                </div>
              </div>
              {/* Category breakdown */}
              {result.byCategoryBreakdown.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2">
                    Time by Category
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.byCategoryBreakdown.map((cat) => (
                      <div
                        key={cat.category}
                        className="flex items-center gap-1.5 text-xs bg-card border rounded px-2 py-1"
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            background:
                              CATEGORY_COLORS[cat.category] ?? "#9ca3af",
                          }}
                        />
                        <span className="text-muted-foreground">
                          {cat.label}
                        </span>
                        <span className="font-medium">
                          {cat.hours}h ({cat.pct}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UtilizationPage() {
  const { offices, isLoading, fetchOffices } = useOfficeStore();
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);

  useEffect(() => {
    fetchOffices().catch(console.error);
  }, [fetchOffices]);

  const results = useMemo<ChairUtilizationResult[]>(() => {
    if (offices.length === 0) return [];
    return offices
      .map((o) => {
        const scheduledSlots = loadSlotsFromStorage(o.id);
        // Default times if not available from office data
        const startTime = "08:00";
        const endTime = "17:00";
        const lunchStart = "12:00";
        const lunchEnd = "13:00";
        const workingDays: string[] = (o as any).workingDays ?? [
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
        ];
        // Count operatories from providers
        const operatories = new Set<string>();
        ((o as any).providers ?? []).forEach((p: any) => {
          (p.operatories ?? []).forEach((op: string) => operatories.add(op));
        });
        const operatoryCount = Math.max(1, operatories.size);

        return calculateChairUtilization({
          officeId: o.id,
          officeName: o.name,
          startTime,
          endTime,
          lunchStart,
          lunchEnd,
          operatoryCount,
          workingDays,
          scheduledSlots,
        });
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [offices]);

  // Summary stats
  const avgUtilization =
    results.length > 0
      ? Math.round(
          results.reduce((s, r) => s + r.utilizationPct, 0) / results.length
        )
      : 0;
  const gradeACounts = results.filter((r) => r.grade === "A").length;
  const gradeDCounts = results.filter((r) => r.grade === "D").length;

  // Bar chart data
  const chartData = results.slice(0, 12).map((r) => ({
    name: r.officeName.split(" ").slice(0, 2).join(" "),
    scheduled: r.chairHoursScheduled,
    available: Math.max(0, r.chairHoursAvailable - r.chairHoursScheduled),
  }));

  const handleExportCSV = () => {
    const csv = exportUtilizationToCSV(results);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chair-utilization.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Chair Utilization Report
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            How much of available chair time is scheduled across{" "}
            {offices.length} offices
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="gap-1.5"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-medium mb-1">
            Avg Utilization
          </div>
          <div
            className={`text-2xl font-bold ${GRADE_COLORS[gradeUtilization(avgUtilization)] ?? "text-foreground"}`}
          >
            {avgUtilization}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Org-wide average
          </div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-medium mb-1">
            Grade A Offices
          </div>
          <div className="text-2xl font-bold text-green-600">{gradeACounts}</div>
          <div className="text-xs text-muted-foreground mt-1">≥ 90% utilized</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-medium mb-1">
            Grade D Offices
          </div>
          <div className="text-2xl font-bold text-red-600">{gradeDCounts}</div>
          <div className="text-xs text-muted-foreground mt-1">&lt; 60% utilized</div>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <div className="text-xs text-muted-foreground font-medium mb-1">
            Total Chair Hours
          </div>
          <div className="text-2xl font-bold text-foreground">
            {results.reduce((s, r) => s + r.chairHoursAvailable, 0).toFixed(0)}h
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Available per week
          </div>
        </div>
      </div>

      {/* Stacked Bar Chart */}
      {chartData.length > 0 && (
        <div className="bg-card border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">
            Chair Hours: Scheduled vs. Available
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 8, left: -10, bottom: 40 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-border"
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-30}
                textAnchor="end"
              />
              <YAxis tick={{ fontSize: 11 }} unit="h" />
              <Tooltip
                formatter={(v: number, name: string) => [
                  `${v}h`,
                  name === "scheduled" ? "Scheduled" : "Empty",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Legend formatter={(v) => (v === "scheduled" ? "Scheduled" : "Empty")} />
              <Bar dataKey="scheduled" stackId="a" fill="#6366f1" name="scheduled" />
              <Bar dataKey="available" stackId="a" fill="#e5e7eb" name="available" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Office Table */}
      <div className="bg-card border rounded-lg p-5">
        <h2 className="font-semibold text-foreground mb-4">
          Office Utilization Table
        </h2>
        {results.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No offices found. Add offices and generate schedules to see
            utilization data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="pb-3 pr-4 font-medium">Office</th>
                  <th className="pb-3 pr-4 font-medium text-right">
                    Chair Hrs Available
                  </th>
                  <th className="pb-3 pr-4 font-medium text-right">
                    Chair Hrs Scheduled
                  </th>
                  <th className="pb-3 pr-4 font-medium text-right">
                    Utilization %
                  </th>
                  <th className="pb-3 font-medium">Grade</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <OfficeRow
                    key={r.officeId}
                    result={r}
                    expanded={expandedOffice === r.officeId}
                    onToggle={() =>
                      setExpandedOffice(
                        expandedOffice === r.officeId ? null : r.officeId
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Grading Legend */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Utilization Grading Scale
        </h3>
        <div className="flex flex-wrap gap-4">
          {[
            { grade: "A", label: "≥ 90%", desc: "Excellent utilization" },
            { grade: "B", label: "75–89%", desc: "Good utilization" },
            { grade: "C", label: "60–74%", desc: "Below target" },
            { grade: "D", label: "< 60%", desc: "Needs improvement" },
          ].map((g) => (
            <div key={g.grade} className="flex items-center gap-2 text-sm">
              <GradeBadge grade={g.grade} />
              <span className="text-muted-foreground">
                {g.label} — {g.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
