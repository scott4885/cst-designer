"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  TrendingUp,
  Target,
  DollarSign,
  ArrowUpDown,
  ExternalLink,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOfficeStore } from "@/store/office-store";
import RecallCapacityPanel from "@/components/schedule/RecallCapacityPanel";
import {
  computeOrgSummary,
  computeQualityDistribution,
  computeGoalAchievementByDay,
  computeProcedureMixBreakdown,
  computeScheduleStatusDonut,
  buildLeagueTable,
  getScheduleStatus,
  type OfficeScheduleData,
  type OfficeLeagueRow,
} from "@/lib/analytics";
import type { ProcedureCategory } from "@/lib/engine/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

const STATUS_COLORS = {
  built: "#22c55e",
  partial: "#eab308",
  not_started: "#e5e7eb",
};

const MIX_COLORS: Record<ProcedureCategory, string> = {
  MAJOR_RESTORATIVE: "#6366f1",
  ENDODONTICS: "#f59e0b",
  BASIC_RESTORATIVE: "#3b82f6",
  PERIODONTICS: "#10b981",
  NEW_PATIENT_DIAG: "#8b5cf6",
  EMERGENCY_ACCESS: "#ef4444",
  ORAL_SURGERY: "#f97316",
  PROSTHODONTICS: "#06b6d4",
};

function loadScheduleDataFromStorage(officeId: string): OfficeScheduleData | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `schedule-designer:schedule-state:${officeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const schedules = JSON.parse(raw) as Record<string, any>;
    const scheduledDays = Object.keys(schedules);
    if (scheduledDays.length === 0) return null;

    const productionByDay: Partial<Record<string, number>> = {};
    let qualityScore: number | null = null;

    for (const [day, sched] of Object.entries(schedules)) {
      if (!sched) continue;
      const summary = (sched as any).productionSummary ?? [];
      const dayProd = summary.reduce(
        (s: number, p: any) => s + (p.scheduledProduction ?? 0),
        0
      );
      productionByDay[day] = dayProd;

      const qs = (sched as any).qualityScore?.total ?? null;
      if (qs !== null && qualityScore === null) qualityScore = qs;
    }

    return {
      officeId,
      qualityScore,
      scheduledDays,
      productionByDay,
      procedureMix: {},
    };
  } catch {
    return null;
  }
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-accent",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─── League Table ─────────────────────────────────────────────────────────────

type LeagueSortKey = keyof Pick<
  OfficeLeagueRow,
  "qualityScore" | "avgDailyProduction" | "daysScheduled" | "gap"
>;

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  built: { label: "Built", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  partial: { label: "Partial", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" },
  not_started: { label: "Not Started", className: "bg-muted text-muted-foreground" },
};

function LeagueTable({ rows }: { rows: OfficeLeagueRow[] }) {
  const [sortKey, setSortKey] = useState<LeagueSortKey>("qualityScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return r;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: LeagueSortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortBtn = ({ k, label }: { k: LeagueSortKey; label: string }) => (
    <button
      onClick={() => toggleSort(k)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-accent" : "text-muted-foreground/50"}`} />
    </button>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            <th className="pb-3 pr-4 font-medium">Office</th>
            <th className="pb-3 pr-4 font-medium">DPMS</th>
            <th className="pb-3 pr-4 font-medium text-right">
              <SortBtn k="qualityScore" label="Quality" />
            </th>
            <th className="pb-3 pr-4 font-medium text-right">
              <SortBtn k="avgDailyProduction" label="Avg Daily Prod" />
            </th>
            <th className="pb-3 pr-4 font-medium text-right">
              <SortBtn k="daysScheduled" label="Days Built" />
            </th>
            <th className="pb-3 pr-4 font-medium text-right">
              <SortBtn k="gap" label="Weekly Gap" />
            </th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const badge = STATUS_BADGE[row.status];
            return (
              <tr key={row.officeId} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-3 pr-4">
                  <Link
                    href={`/offices/${row.officeId}`}
                    className="font-medium hover:text-accent transition-colors"
                  >
                    {i + 1}. {row.officeName}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{row.dpmsSystem.replace("_", " ")}</td>
                <td className="py-3 pr-4 text-right font-medium">
                  {row.qualityScore !== null ? (
                    <span className={
                      row.qualityScore >= 90 ? "text-green-600" :
                      row.qualityScore >= 75 ? "text-yellow-600" :
                      row.qualityScore >= 60 ? "text-orange-600" : "text-red-600"
                    }>
                      {row.qualityScore}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right text-muted-foreground">
                  {row.avgDailyProduction > 0
                    ? `$${row.avgDailyProduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    : "—"}
                </td>
                <td className="py-3 pr-4 text-right text-muted-foreground">{row.daysScheduled}</td>
                <td className="py-3 pr-4 text-right">
                  {row.weeklyProduction > 0 ? (
                    <span className={row.gap >= 0 ? "text-green-600" : "text-red-600"}>
                      {row.gap >= 0 ? "+" : ""}${row.gap.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-1">
                    <Link href={`/offices/${row.officeId}`}>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </Link>
                    <Link href={`/offices/${row.officeId}/edit`}>
                      <Button variant="ghost" size="sm" className="h-7 px-2">
                        <Edit className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-center text-muted-foreground">
                No offices found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type AnalyticsTab = "overview" | "recall";

export default function AnalyticsPage() {
  const { offices, isLoading, fetchOffices } = useOfficeStore();
  const [scheduleDataMap, setScheduleDataMap] = useState<Map<string, OfficeScheduleData>>(new Map());
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

  useEffect(() => {
    fetchOffices().catch(console.error);
  }, [fetchOffices]);

  useEffect(() => {
    if (offices.length === 0) return;
    const map = new Map<string, OfficeScheduleData>();
    for (const o of offices) {
      const data = loadScheduleDataFromStorage(o.id);
      if (data) map.set(o.id, data);
    }
    setScheduleDataMap(map);
  }, [offices]);

  const summary = useMemo(
    () => computeOrgSummary(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const qualityDist = useMemo(
    () => computeQualityDistribution(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const goalByDay = useMemo(
    () => computeGoalAchievementByDay(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const mixBreakdown = useMemo(
    () => computeProcedureMixBreakdown(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const statusDonut = useMemo(
    () => computeScheduleStatusDonut(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const leagueRows = useMemo(
    () => buildLeagueTable(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const donutData = [
    { name: "Built", value: statusDonut.built, color: STATUS_COLORS.built },
    { name: "Partial", value: statusDonut.partial, color: STATUS_COLORS.partial },
    { name: "Not Started", value: statusDonut.not_started, color: STATUS_COLORS.not_started },
  ].filter(d => d.value > 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Org-level schedule performance across {offices.length} offices
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["overview", "recall"] as AnalyticsTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "recall" ? "Recall Capacity" : "Overview"}
          </button>
        ))}
      </div>

      {/* Recall Tab */}
      {activeTab === "recall" && (
        <RecallCapacityPanel offices={offices} />
      )}

      {/* Overview Tab — only render when active */}
      {activeTab !== "recall" && (
        <>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Building2}
          label="Offices with Schedules"
          value={`${summary.officesWithSchedules} / ${summary.totalOffices}`}
          sub={`${summary.totalOffices > 0 ? Math.round((summary.officesWithSchedules / summary.totalOffices) * 100) : 0}% coverage`}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg Quality Score"
          value={summary.averageQualityScore !== null ? String(summary.averageQualityScore) : "—"}
          sub="Across offices with schedules"
        />
        <SummaryCard
          icon={Target}
          label="At / Above Goal"
          value={`${summary.pctAtOrAboveGoal}%`}
          sub="Offices meeting ≥95% weekly goal"
          color="text-green-600"
        />
        <SummaryCard
          icon={DollarSign}
          label="Total Weekly Production"
          value={`$${summary.totalWeeklyProduction.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub="Sum across all offices"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Score Distribution */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">Quality Score Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={qualityDist} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip
                formatter={(v: number) => [`${v} offices`, "Count"]}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Offices" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Goal Achievement by Day */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">Production Goal Achievement by Day</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={goalByDay.map(d => ({ ...d, day: DAY_LABELS[d.day] ?? d.day }))}
              margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "% Meeting Target75"]}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar dataKey="pctMeetingTarget" fill="#22c55e" radius={[4, 4, 0, 0]} name="% Meeting Target75" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Procedure Mix */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">Avg Procedure Mix (Offices with Future Mix Set)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={mixBreakdown}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 40]} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={110} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Avg %"]}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar dataKey="avgPct" radius={[0, 4, 4, 0]} name="Avg %">
                {mixBreakdown.map(entry => (
                  <Cell
                    key={entry.category}
                    fill={MIX_COLORS[entry.category] ?? "#6366f1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Schedule Status Donut */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="font-semibold text-foreground mb-4">Schedule Build Status</h2>
          {donutData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v} offices`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {donutData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-foreground font-medium">{d.name}</span>
                    <span className="text-muted-foreground">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No offices yet
            </div>
          )}
        </div>
      </div>

      {/* League Table */}
      <div className="bg-card border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">Office League Table</h2>
          <Link href="/rollup">
            <Button variant="outline" size="sm" className="gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Production Rollup
            </Button>
          </Link>
        </div>
        <LeagueTable rows={leagueRows} />
      </div>
    </div>
  );
}
