"use client";

/**
 * Provider Benchmarking Page — Sprint 16
 *
 * Compare providers' configuration and scheduled production against org-wide averages.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Target,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import {
  benchmarkProviders,
  buildGoalHistogram,
  type OfficeProviderData,
  type ProviderRole,
  type ProviderBenchmarkRow,
} from "@/lib/benchmark-providers";

const ROLES: ProviderRole[] = ["DOCTOR", "HYGIENIST", "ASSISTANT"];
const ROLE_LABELS: Record<ProviderRole, string> = {
  DOCTOR: "Doctor",
  HYGIENIST: "Hygienist",
  ASSISTANT: "Assistant",
};

function formatCurrency(n: number) {
  return `$${n.toLocaleString()}`;
}

function VsMedianBadge({ row }: { row: ProviderBenchmarkRow }) {
  if (row.vsMedian === "above") {
    return (
      <Badge className="text-xs bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-100">
        <TrendingUp className="h-3 w-3 mr-1" />
        +{formatCurrency(Math.abs(row.gapToMedian))}
      </Badge>
    );
  }
  if (row.vsMedian === "below") {
    return (
      <Badge className="text-xs bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-100">
        <TrendingDown className="h-3 w-3 mr-1" />
        -{formatCurrency(Math.abs(row.gapToMedian))}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs">
      <Minus className="h-3 w-3 mr-1" />
      At median
    </Badge>
  );
}

export default function BenchmarksPage() {
  const { offices, fetchOffices } = useOfficeStore();
  const { generatedSchedules } = useScheduleStore();
  const [activeRole, setActiveRole] = useState<ProviderRole>("DOCTOR");
  const [sortField, setSortField] = useState<"name" | "goal" | "production" | "gap">("production");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch offices on mount
  useMemo(() => {
    if (offices.length === 0) fetchOffices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build OfficeProviderData
  const officeProviderData = useMemo((): OfficeProviderData[] => {
    return offices.map((office) => {
      const prodByProvider = new Map<string, number>();
      for (const provider of (office.providers ?? [])) {
        // Sum production across all days for this provider
        let total = 0;
        for (const day of ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]) {
          const key = `${office.id}-${day}`;
          const daySchedule = generatedSchedules[key];
          const summary = daySchedule?.productionSummary?.find(
            (s) => s.providerId === provider.id
          );
          if (summary) total += summary.actualScheduled;
        }
        prodByProvider.set(provider.id, total);
      }

      return {
        officeId: office.id,
        officeName: office.name,
        providers: office.providers ?? [],
        scheduledProductionByProvider: prodByProvider,
        officeQualityScore: null,
      };
    });
  }, [offices, generatedSchedules]);

  const benchmarkResult = useMemo(
    () => benchmarkProviders(officeProviderData),
    [officeProviderData]
  );

  const roleStats = benchmarkResult.byRole.get(activeRole);
  const roleRows = benchmarkResult.rows.filter((r) => r.role === activeRole);

  const histogramBins = useMemo(
    () => buildGoalHistogram(benchmarkResult.rows, activeRole),
    [benchmarkResult.rows, activeRole]
  );

  // Sort rows
  const sortedRows = useMemo(() => {
    const rows = [...roleRows];
    rows.sort((a, b) => {
      let diff = 0;
      if (sortField === "name") diff = a.providerName.localeCompare(b.providerName);
      else if (sortField === "goal") diff = a.dailyGoal - b.dailyGoal;
      else if (sortField === "production") diff = a.scheduledProduction - b.scheduledProduction;
      else if (sortField === "gap") diff = a.gapToMedian - b.gapToMedian;
      return sortDir === "asc" ? diff : -diff;
    });
    return rows;
  }, [roleRows, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  const maxHistCount = Math.max(...histogramBins.map((b) => b.count), 1);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6 text-purple-500" />
            Provider Benchmarking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Compare providers against org-wide averages
          </p>
        </div>
      </div>

      {/* Role selector */}
      <div className="flex gap-2">
        {ROLES.map((role) => {
          const count = benchmarkResult.rows.filter((r) => r.role === role).length;
          return (
            <Button
              key={role}
              variant={activeRole === role ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveRole(role)}
              disabled={count === 0}
            >
              {ROLE_LABELS[role]}
              {count > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                  {count}
                </Badge>
              )}
            </Button>
          );
        })}
      </div>

      {roleStats ? (
        <>
          {/* Org averages cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {ROLE_LABELS[activeRole]}s
                  </p>
                </div>
                <p className="text-3xl font-bold">{roleStats.count}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Avg Daily Goal
                  </p>
                </div>
                <p className="text-3xl font-bold">
                  {formatCurrency(roleStats.avgDailyGoal)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Median Scheduled
                  </p>
                </div>
                <p className="text-3xl font-bold">
                  {formatCurrency(roleStats.medianScheduledProduction)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  P25: {formatCurrency(roleStats.p25ScheduledProduction)} · P75:{" "}
                  {formatCurrency(roleStats.p75ScheduledProduction)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Award className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Avg Quality Score
                  </p>
                </div>
                <p className="text-3xl font-bold">
                  {roleStats.avgQualityScore !== null
                    ? `${roleStats.avgQualityScore}`
                    : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Goal histogram + Top offices */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Histogram */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Daily Goal Distribution — {ROLE_LABELS[activeRole]}s
                </CardTitle>
              </CardHeader>
              <CardContent>
                {histogramBins.length > 0 ? (
                  <div className="space-y-2">
                    {histogramBins.map((bin) => (
                      <div key={bin.label} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">
                          {bin.label}
                        </span>
                        <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded transition-all"
                            style={{ width: `${(bin.count / maxHistCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-4 text-right shrink-0">
                          {bin.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Top offices */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Top {ROLE_LABELS[activeRole]}s by Scheduled Production
                </CardTitle>
              </CardHeader>
              <CardContent>
                {roleStats.topOfficesByProduction.length > 0 ? (
                  <div className="space-y-2">
                    {roleStats.topOfficesByProduction.map((entry, i) => (
                      <div
                        key={entry.providerId}
                        className="flex items-center gap-3 py-1"
                      >
                        <span className="text-lg font-bold text-muted-foreground w-6 shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {entry.providerName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {entry.officeName}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-green-600 shrink-0">
                          {formatCurrency(entry.scheduledProduction)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No data available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Provider comparison table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                All {ROLE_LABELS[activeRole]}s — vs. Org Median
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="text-xs cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("name")}
                    >
                      Provider {sortField === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead className="text-xs">Office</TableHead>
                    <TableHead
                      className="text-xs text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("goal")}
                    >
                      Daily Goal {sortField === "goal" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead
                      className="text-xs text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("production")}
                    >
                      Scheduled {sortField === "production" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                    <TableHead
                      className="text-xs text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("gap")}
                    >
                      vs. Median {sortField === "gap" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => (
                    <TableRow key={`${row.officeId}-${row.providerId}`}>
                      <TableCell className="text-sm font-medium">
                        {row.providerName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.officeName}
                      </TableCell>
                      <TableCell className="text-sm text-right">
                        {formatCurrency(row.dailyGoal)}
                      </TableCell>
                      <TableCell className="text-sm text-right font-medium">
                        {row.scheduledProduction > 0
                          ? formatCurrency(row.scheduledProduction)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <VsMedianBadge row={row} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {sortedRows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-muted-foreground py-6"
                      >
                        No {ROLE_LABELS[activeRole].toLowerCase()}s found in your offices.
                        Add providers in Office Settings.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No {ROLE_LABELS[activeRole].toLowerCase()}s found across all offices.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add providers in your office configurations to see benchmarks.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
