"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Sparkles,
  Building2,
  Calendar,
  Users,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOfficeStore } from "@/store/office-store";
import { toast } from "sonner";
import { mockOffices } from "@/lib/mock-data";
import { OfficeListSkeleton } from "@/components/LoadingState";
import type { OfficeData } from "@/lib/mock-data";

// ─── Helpers ──────────────────────────────────────────────────────

const convertDayFormat = (day: string): string => {
  const dayMap: Record<string, string> = {
    MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri",
  };
  return dayMap[day] || day;
};

const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return "30d+ ago";
};

function hasScheduleInStorage(officeId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(`schedule-designer:schedule-state:${officeId}`);
    if (!raw) return false;
    return Object.keys(JSON.parse(raw)).length > 0;
  } catch { return false; }
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);

// ─── Component ────────────────────────────────────────────────────

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [scheduleMap, setScheduleMap] = useState<Map<string, boolean>>(new Map());

  const { offices, isLoading, fetchOffices, setOffices } = useOfficeStore();

  useEffect(() => { document.title = "Custom Schedule Template"; }, []);

  useEffect(() => {
    fetchOffices().catch(() => toast.error("Failed to load offices"));
  }, [fetchOffices]);

  useEffect(() => {
    if (offices.length === 0) return;
    const map = new Map<string, boolean>();
    for (const o of offices) map.set(o.id, hasScheduleInStorage(o.id));
    setScheduleMap(map);
  }, [offices]);

  const filteredOffices = useMemo(() => {
    if (!searchQuery.trim()) return offices;
    const q = searchQuery.toLowerCase();
    return offices.filter((o) =>
      o.name.toLowerCase().includes(q) || o.dpmsSystem.toLowerCase().includes(q)
    );
  }, [offices, searchQuery]);

  const handleLoadDemoData = () => {
    setLoadingDemo(true);
    try {
      setOffices(mockOffices);
      toast.success("Demo data loaded!");
    } catch { toast.error("Failed to load demo data"); }
    finally { setLoadingDemo(false); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Schedule Templates</h1>
          <p className="text-slate-500 text-sm mt-1">
            {offices.length} office{offices.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <div className="flex gap-2">
          {offices.length < 3 && (
            <Button
              variant="outline"
              onClick={handleLoadDemoData}
              disabled={loadingDemo}
              className="gap-2 h-9 text-sm border-border/60 text-slate-500"
            >
              <Sparkles className="w-4 h-4" />
              {loadingDemo ? "Loading..." : "Load Demo Data"}
            </Button>
          )}
          <Link href="/offices/new">
            <Button className="gap-2 h-9 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
              <Plus className="w-4 h-4" />
              New Office
            </Button>
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search offices..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-9 bg-white border-border/60 text-sm"
        />
      </div>

      {/* Loading */}
      {isLoading && <OfficeListSkeleton />}

      {/* Office Grid */}
      {!isLoading && filteredOffices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOffices.map((office) => {
            const hasSchedule = scheduleMap.get(office.id) ?? false;
            const days = office.workingDays.map(convertDayFormat);

            return (
              <Link key={office.id} href={`/offices/${office.id}`}>
                <div className="bg-white rounded-xl border border-border/50 p-4 hover:border-blue-600/30 hover:shadow-md transition-all duration-200 cursor-pointer group">
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate">
                        {office.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {office.dpmsSystem.replace("_", " ")}
                        </span>
                        {hasSchedule ? (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Schedule Ready
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-300 bg-slate-50 px-1.5 py-0.5 rounded">
                            No Schedule
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-0.5" />
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-400">Providers</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{office.providerCount}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <DollarSign className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-400">Daily Goal</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{formatCurrency(office.totalDailyGoal)}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span className="text-[10px] text-slate-400">Days</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-700">{office.workingDays.length}/wk</p>
                    </div>
                  </div>

                  {/* Working days dots + last updated */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1">
                      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                        <div
                          key={d}
                          className={`w-5 h-5 rounded-full text-[9px] font-medium flex items-center justify-center ${
                            days.includes(d)
                              ? "bg-blue-50 text-blue-600 border border-blue-200"
                              : "bg-slate-50 text-slate-300"
                          }`}
                        >
                          {d[0]}
                        </div>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-300">
                      {getRelativeTime(office.updatedAt)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && offices.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">No offices yet</h2>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Create your first office to start building schedule templates, or load demo data to explore.
            </p>
            <div className="flex flex-col gap-2.5">
              <Link href="/offices/new">
                <Button className="w-full h-10 gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4" />
                  Create Your First Office
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full h-10 gap-2 border-border/60 text-slate-500"
                onClick={handleLoadDemoData}
                disabled={loadingDemo}
              >
                <Sparkles className="w-4 h-4" />
                {loadingDemo ? "Loading..." : "Load Demo Data"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* No search results */}
      {!isLoading && filteredOffices.length === 0 && offices.length > 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-slate-500">No offices match your search.</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-blue-600"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </Button>
        </div>
      )}
    </div>
  );
}

// Preserve filter/sort exports for any consumers
export function applyFilters(
  offices: OfficeData[], searchQuery: string,
  filters: { dpms: Set<string>; providerCount: string; scheduleStatus: string; qualityRange: string; daysPerWeek: string },
  scheduleMap: Map<string, boolean>
): OfficeData[] {
  return offices.filter((office) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!office.name.toLowerCase().includes(q) && !office.dpmsSystem.toLowerCase().includes(q)) return false;
    }
    if (filters.dpms.size > 0 && !filters.dpms.has(office.dpmsSystem)) return false;
    if (filters.providerCount && filters.providerCount !== 'all') {
      const count = office.providerCount;
      if (filters.providerCount === '0-1' && count > 1) return false;
      if (filters.providerCount === '2-3' && (count < 2 || count > 3)) return false;
      if (filters.providerCount === '4+' && count < 4) return false;
    }
    if (filters.scheduleStatus && filters.scheduleStatus !== 'all') {
      const hasSchedule = scheduleMap.get(office.id);
      if (filters.scheduleStatus === 'has-schedule' && !hasSchedule) return false;
      if (filters.scheduleStatus === 'no-schedule' && hasSchedule !== false) return false;
    }
    if (filters.daysPerWeek && filters.daysPerWeek !== 'all') {
      const days = office.workingDays?.length ?? 0;
      if (filters.daysPerWeek === '4' && days !== 4) return false;
      if (filters.daysPerWeek === '5' && days !== 5) return false;
    }
    return true;
  });
}

export function applySorting(offices: OfficeData[], sort: string): OfficeData[] {
  const sorted = [...offices];
  switch (sort) {
    case "name-asc": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
    case "goal-desc": sorted.sort((a, b) => b.totalDailyGoal - a.totalDailyGoal); break;
    case "updated-desc": sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); break;
  }
  return sorted;
}
