"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpDown,
  Download,
  SlidersHorizontal,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOfficeStore } from "@/store/office-store";
import {
  buildProductionGapTable,
  exportGapTableToCSV,
  type OfficeScheduleData,
  type ScheduleStatus,
} from "@/lib/analytics";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

const STATUS_DOT: Record<ScheduleStatus, string> = {
  built: "🟢",
  partial: "🟡",
  not_started: "⬜",
};

function loadScheduleDataFromStorage(officeId: string): OfficeScheduleData | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `schedule-designer:schedule-state:${officeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    type StoredSchedule = {
      productionSummary?: Array<{ scheduledProduction?: number }>;
      qualityScore?: { total?: number };
    };
    const schedules = JSON.parse(raw) as Record<string, StoredSchedule | null>;
    const scheduledDays = Object.keys(schedules);
    if (scheduledDays.length === 0) return null;

    const productionByDay: Partial<Record<string, number>> = {};
    let qualityScore: number | null = null;

    for (const [day, sched] of Object.entries(schedules)) {
      if (!sched) continue;
      const summary = sched.productionSummary ?? [];
      const dayProd = summary.reduce(
        (s, p) => s + (p.scheduledProduction ?? 0),
        0
      );
      productionByDay[day] = dayProd;
      const qs = sched.qualityScore?.total ?? null;
      if (qs !== null && qualityScore === null) qualityScore = qs;
    }

    return { officeId, qualityScore, scheduledDays, productionByDay, procedureMix: {} };
  } catch {
    return null;
  }
}

// ─── Sort & Filter ────────────────────────────────────────────────────────────

type SortKey = "officeName" | "gap" | "weeklyTotal" | "goalPerDay";

function SortBtn({
  k,
  label,
  sortKey,
  onClick,
}: {
  k: SortKey;
  label: string;
  sortKey: SortKey;
  onClick: (key: SortKey) => void;
}) {
  return (
    <button
      onClick={() => onClick(k)}
      className="flex items-center gap-1 hover:text-foreground transition-colors whitespace-nowrap"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-accent" : "text-muted-foreground/40"}`} />
    </button>
  );
}

function fmt(val: number) {
  if (val === 0) return "—";
  return `$${Math.round(val).toLocaleString()}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RollupPage() {
  const { offices, isLoading, fetchOffices } = useOfficeStore();
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterDPMS, setFilterDPMS] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterGapThreshold, setFilterGapThreshold] = useState<string>("");

  useEffect(() => {
    fetchOffices().catch(console.error);
  }, [fetchOffices]);

  const scheduleDataMap = useMemo(() => {
    const map = new Map<string, OfficeScheduleData>();
    if (offices.length === 0) return map;
    for (const o of offices) {
      const data = loadScheduleDataFromStorage(o.id);
      if (data) map.set(o.id, data);
    }
    return map;
  }, [offices]);

  const rawRows = useMemo(
    () => buildProductionGapTable(offices, scheduleDataMap),
    [offices, scheduleDataMap]
  );

  const filteredRows = useMemo(() => {
    let rows = rawRows;
    if (filterDPMS !== "all") rows = rows.filter(r => r.dpmsSystem === filterDPMS);
    if (filterStatus !== "all") rows = rows.filter(r => r.status === filterStatus);
    if (filterGapThreshold) {
      const threshold = parseFloat(filterGapThreshold);
      if (!isNaN(threshold)) {
        rows = rows.filter(r => r.gap < -threshold);
      }
    }
    return rows;
  }, [rawRows, filterDPMS, filterStatus, filterGapThreshold]);

  const sortedRows = useMemo(() => {
    const r = [...filteredRows];
    r.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return r;
  }, [filteredRows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const handleExportCSV = () => {
    const csv = exportGapTableToCSV(sortedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-rollup-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${sortedRows.length} offices to CSV`);
  };

  const dpmsOptions = Array.from(new Set(offices.map(o => o.dpmsSystem)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Production Rollup</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Multi-location gap analysis — {offices.length} offices
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowFilters(v => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {showFilters && <ChevronDown className="w-3 h-3" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportCSV}
            disabled={sortedRows.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </Button>
          <Link href="/analytics">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />
              Analytics
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                DPMS System
              </Label>
              <Select value={filterDPMS} onValueChange={setFilterDPMS}>
                <SelectTrigger>
                  <SelectValue placeholder="All DPMS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {dpmsOptions.map(d => (
                    <SelectItem key={d} value={d}>{d.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Schedule Status
              </Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="built">🟢 Built</SelectItem>
                  <SelectItem value="partial">🟡 Partial</SelectItem>
                  <SelectItem value="not_started">⬜ Not Started</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">
                Show Only Offices Under Goal by $
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 5000"
                  value={filterGapThreshold}
                  onChange={e => setFilterGapThreshold(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {!isLoading && sortedRows.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>Showing <strong className="text-foreground">{sortedRows.length}</strong> offices</span>
          <span>
            Total weekly production:{" "}
            <strong className="text-foreground">
              ${sortedRows.reduce((s, r) => s + r.weeklyTotal, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </strong>
          </span>
          <span>
            Under goal:{" "}
            <strong className="text-red-600">
              {sortedRows.filter(r => r.gap < 0).length}
            </strong>
          </span>
          <span>
            At/above goal:{" "}
            <strong className="text-green-600">
              {sortedRows.filter(r => r.gap >= 0 && r.weeklyTotal > 0).length}
            </strong>
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-card border rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading offices...</div>
        ) : sortedRows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No offices match your filters.{" "}
            <button
              onClick={() => {
                setFilterDPMS("all");
                setFilterStatus("all");
                setFilterGapThreshold("");
              }}
              className="underline hover:text-foreground"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">
                  <SortBtn k="officeName" label="Office" sortKey={sortKey} onClick={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn k="goalPerDay" label="Goal/Day" sortKey={sortKey} onClick={toggleSort} />
                </th>
                {DAYS.map(d => (
                  <th key={d} className="px-3 py-3 font-medium text-right text-xs">
                    {DAY_LABELS[d]}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn k="weeklyTotal" label="Weekly Total" sortKey={sortKey} onClick={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <SortBtn k="gap" label="Gap" sortKey={sortKey} onClick={toggleSort} />
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(row => {
                const isUnder = row.gap < 0 && row.weeklyTotal > 0;
                const isOver = row.gap >= 0 && row.weeklyTotal > 0;
                return (
                  <tr key={row.officeId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/offices/${row.officeId}`}
                        className="font-medium hover:text-accent transition-colors"
                      >
                        {row.officeName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.dpmsSystem.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {row.goalPerDay > 0 ? fmt(row.goalPerDay) : "—"}
                    </td>
                    {DAYS.map(d => {
                      const prod = row.productionByDay[d] ?? row.productionByDay[d.charAt(0) + d.slice(1).toLowerCase()] ?? 0;
                      const isWorkingDay = row.workingDays.some(
                        wd => wd.toUpperCase() === d
                      );
                      return (
                        <td
                          key={d}
                          className={`px-3 py-3 text-right text-xs ${
                            !isWorkingDay
                              ? "text-muted-foreground/30"
                              : prod > 0
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {!isWorkingDay ? (
                            <span className="opacity-30">—</span>
                          ) : prod > 0 ? (
                            <Link
                              href={`/offices/${row.officeId}`}
                              className="hover:text-accent cursor-pointer"
                              title="Open template builder"
                            >
                              {fmt(prod)}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground/50">$0</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-medium">
                      {row.weeklyTotal > 0 ? fmt(row.weeklyTotal) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      isUnder ? "text-red-600" : isOver ? "text-green-600" : "text-muted-foreground"
                    }`}>
                      {row.weeklyTotal > 0
                        ? (row.gap >= 0 ? "+" : "") + fmt(Math.abs(row.gap)) 
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-base">
                      {STATUS_DOT[row.status]}{" "}
                      <span className="text-xs text-muted-foreground">
                        {row.status === "built" ? "At Goal" : row.status === "partial" ? "Near" : "Not Built"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {sortedRows.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Production data loaded from localStorage. Click &quot;Download CSV&quot; to export for Excel analysis.
        </p>
      )}
    </div>
  );
}
