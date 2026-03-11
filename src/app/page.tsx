"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Sparkles,
  Building2,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  DollarSign,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import OfficeCard from "@/components/offices/OfficeCard";
import { useOfficeStore } from "@/store/office-store";
import { toast } from "sonner";
import { mockOffices } from "@/lib/mock-data";
import { OfficeListSkeleton } from "@/components/LoadingState";
import type { OfficeData } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = 'name-asc' | 'quality-desc' | 'goal-desc' | 'updated-desc';

type ProviderCountFilter = 'all' | '0-1' | '2-3' | '4+';
type ScheduleStatusFilter = 'all' | 'has-schedule' | 'no-schedule';
type QualityRangeFilter = 'all' | '0-59' | '60-74' | '75-89' | '90-100';
type DaysPerWeekFilter = 'all' | '4' | '5';

interface Filters {
  dpms: Set<string>;
  providerCount: ProviderCountFilter;
  scheduleStatus: ScheduleStatusFilter;
  qualityRange: QualityRangeFilter;
  daysPerWeek: DaysPerWeekFilter;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const convertDayFormat = (day: string): string => {
  const dayMap: Record<string, string> = {
    MONDAY: "Mon",
    TUESDAY: "Tue",
    WEDNESDAY: "Wed",
    THURSDAY: "Thu",
    FRIDAY: "Fri",
  };
  return dayMap[day] || day;
};

const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return "over a month ago";
};

/** Load quality score from localStorage for a given office. */
function loadQualityScoreFromStorage(officeId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = `schedule-designer:schedule-state:${officeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const schedules = JSON.parse(raw) as Record<string, any>;
    // Look for any day with a quality score hint — we don't have pre-computed scores
    // in localStorage, so just check if schedules exist
    return Object.keys(schedules).length > 0 ? -1 : null; // -1 = "has schedule, score unknown"
  } catch {
    return null;
  }
}

function hasScheduleInStorage(officeId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = `schedule-designer:schedule-state:${officeId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const schedules = JSON.parse(raw);
    return Object.keys(schedules).length > 0;
  } catch {
    return false;
  }
}

const DPMS_SYSTEMS = ['DENTRIX', 'OPEN_DENTAL', 'EAGLESOFT', 'DENTICON'];

// ─── Filter logic ─────────────────────────────────────────────────────────────

export function applyFilters(
  offices: OfficeData[],
  searchQuery: string,
  filters: Filters,
  scheduleMap: Map<string, boolean>
): OfficeData[] {
  return offices.filter((office) => {
    // Search: name + dpms + provider count
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = office.name.toLowerCase().includes(q);
      const dpmsMatch = office.dpmsSystem.toLowerCase().includes(q);
      const providerCountMatch = String(office.providerCount).includes(q);
      if (!nameMatch && !dpmsMatch && !providerCountMatch) return false;
    }

    // DPMS filter
    if (filters.dpms.size > 0 && !filters.dpms.has(office.dpmsSystem)) return false;

    // Provider count filter
    if (filters.providerCount !== 'all') {
      const pc = office.providerCount;
      if (filters.providerCount === '0-1' && pc > 1) return false;
      if (filters.providerCount === '2-3' && (pc < 2 || pc > 3)) return false;
      if (filters.providerCount === '4+' && pc < 4) return false;
    }

    // Schedule status
    if (filters.scheduleStatus !== 'all') {
      const hasSchedule = scheduleMap.get(office.id) ?? false;
      if (filters.scheduleStatus === 'has-schedule' && !hasSchedule) return false;
      if (filters.scheduleStatus === 'no-schedule' && hasSchedule) return false;
    }

    // Days per week
    if (filters.daysPerWeek !== 'all') {
      const daysCount = office.workingDays.length;
      if (filters.daysPerWeek === '4' && daysCount !== 4) return false;
      if (filters.daysPerWeek === '5' && daysCount !== 5) return false;
    }

    return true;
  });
}

export function applySorting(offices: OfficeData[], sort: SortOption): OfficeData[] {
  const sorted = [...offices];
  switch (sort) {
    case 'name-asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'goal-desc':
      sorted.sort((a, b) => b.totalDailyGoal - a.totalDailyGoal);
      break;
    case 'updated-desc':
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
    case 'quality-desc':
      // Quality score not pre-computed; fall back to name sort
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    dpms: new Set(),
    providerCount: 'all',
    scheduleStatus: 'all',
    qualityRange: 'all',
    daysPerWeek: 'all',
  });

  // Bulk edit mode
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [showBulkGoalModal, setShowBulkGoalModal] = useState(false);
  const [bulkDoctorGoal, setBulkDoctorGoal] = useState('');
  const [bulkHygienistGoal, setBulkHygienistGoal] = useState('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Compare mode
  const [compareOfficeA, setCompareOfficeA] = useState<string | null>(null);

  // localStorage schedule map
  const [scheduleMap, setScheduleMap] = useState<Map<string, boolean>>(new Map());

  const { offices, isLoading, fetchOffices, setOffices } = useOfficeStore();

  useEffect(() => {
    document.title = "Custom Schedule Template";
  }, []);

  useEffect(() => {
    fetchOffices().catch(() => {
      toast.error("Failed to load offices");
    });
  }, [fetchOffices]);

  // Build schedule map from localStorage when offices load
  useEffect(() => {
    if (offices.length === 0) return;
    const map = new Map<string, boolean>();
    for (const o of offices) {
      map.set(o.id, hasScheduleInStorage(o.id));
    }
    setScheduleMap(map);
  }, [offices]);

  const filteredOffices = useMemo(
    () => applyFilters(offices, searchQuery, filters, scheduleMap),
    [offices, searchQuery, filters, scheduleMap]
  );

  const sortedOffices = useMemo(
    () => applySorting(filteredOffices, sortOption),
    [filteredOffices, sortOption]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dpms.size > 0) count++;
    if (filters.providerCount !== 'all') count++;
    if (filters.scheduleStatus !== 'all') count++;
    if (filters.qualityRange !== 'all') count++;
    if (filters.daysPerWeek !== 'all') count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({
      dpms: new Set(),
      providerCount: 'all',
      scheduleStatus: 'all',
      qualityRange: 'all',
      daysPerWeek: 'all',
    });
    setSearchQuery('');
  };

  const toggleDpmsFilter = (dpms: string) => {
    setFilters(prev => {
      const next = new Set(prev.dpms);
      if (next.has(dpms)) next.delete(dpms);
      else next.add(dpms);
      return { ...prev, dpms: next };
    });
  };

  const handleLoadDemoData = () => {
    setLoadingDemo(true);
    try {
      setOffices(mockOffices);
      toast.success("Demo data loaded! 5 sample offices are now available.");
    } catch {
      toast.error("Failed to load demo data");
    } finally {
      setLoadingDemo(false);
    }
  };

  const toggleBulkSelect = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCompare = (id: string) => {
    if (!compareOfficeA) {
      setCompareOfficeA(id);
      toast.info("Now click Compare on another office to compare them side-by-side.");
    } else if (compareOfficeA === id) {
      setCompareOfficeA(null);
    } else {
      router.push(`/compare?a=${compareOfficeA}&b=${id}`);
      setCompareOfficeA(null);
    }
  };

  const handleBulkGoalUpdate = async () => {
    if (bulkSelected.size === 0) return;
    const doctorGoal = parseFloat(bulkDoctorGoal);
    const hygienistGoal = parseFloat(bulkHygienistGoal);

    if ((!bulkDoctorGoal && !bulkHygienistGoal) || (bulkDoctorGoal && isNaN(doctorGoal)) || (bulkHygienistGoal && isNaN(hygienistGoal))) {
      toast.error("Enter valid dollar amounts for at least one role.");
      return;
    }

    setIsBulkUpdating(true);
    try {
      const res = await fetch('/api/offices/bulk-goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officeIds: Array.from(bulkSelected),
          doctorGoal: bulkDoctorGoal ? doctorGoal : null,
          hygienistGoal: bulkHygienistGoal ? hygienistGoal : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update goals');
      const data = await res.json();
      toast.success(`Updated goals for ${data.updatedProviders} providers across ${bulkSelected.size} offices.`);
      setShowBulkGoalModal(false);
      setBulkSelected(new Set());
      setBulkEditMode(false);
      setBulkDoctorGoal('');
      setBulkHygienistGoal('');
      // Refresh offices
      await fetchOffices();
    } catch {
      toast.error("Failed to update goals");
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Offices</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage schedule templates for {offices.length} dental offices
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Bulk Edit Toggle */}
          <Button
            variant={bulkEditMode ? "default" : "outline"}
            className="gap-2 min-h-[44px] w-full sm:w-auto"
            onClick={() => {
              setBulkEditMode(v => !v);
              setBulkSelected(new Set());
            }}
          >
            {bulkEditMode ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            {bulkEditMode ? `Bulk Edit (${bulkSelected.size})` : 'Bulk Edit'}
          </Button>
          {offices.length < 3 && (
            <Button
              variant="outline"
              className="gap-2 min-h-[44px] w-full sm:w-auto"
              onClick={handleLoadDemoData}
              disabled={loadingDemo}
            >
              <Sparkles className="w-4 h-4" />
              {loadingDemo ? "Loading..." : "Load Demo Data"}
            </Button>
          )}
          <Link href="/offices/new" className="w-full sm:w-auto">
            <Button className="gap-2 min-h-[44px] w-full">
              <Plus className="w-4 h-4" />
              New Office
            </Button>
          </Link>
        </div>
      </div>

      {/* Bulk Edit action bar */}
      {bulkEditMode && bulkSelected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <span className="text-sm font-medium">{bulkSelected.size} office{bulkSelected.size !== 1 ? 's' : ''} selected</span>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => setShowBulkGoalModal(true)}
          >
            <DollarSign className="w-4 h-4" />
            Update Goals
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setBulkSelected(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Compare mode hint */}
      {compareOfficeA && (
        <div className="flex items-center gap-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-sm">
          <span className="font-medium text-blue-600 dark:text-blue-400">
            Comparing from: {offices.find(o => o.id === compareOfficeA)?.name}
          </span>
          <span className="text-muted-foreground">— Click Compare on another office to compare</span>
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setCompareOfficeA(null)}>
            <X className="w-3 h-3 mr-1" />
            Cancel
          </Button>
        </div>
      )}

      {/* Search + Sort + Filter row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search offices, DPMS..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort */}
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="quality-desc">Quality Score (High → Low)</SelectItem>
            <SelectItem value="goal-desc">Production Goal (High → Low)</SelectItem>
            <SelectItem value="updated-desc">Last Updated</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter toggle */}
        <Button
          variant={activeFilterCount > 0 ? "default" : "outline"}
          size="sm"
          className="gap-2 h-10"
          onClick={() => setFiltersOpen(v => !v)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 bg-white/20 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
          {filtersOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </Button>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-10">
            <X className="w-3 h-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter sidebar (collapsible) */}
      {filtersOpen && (
        <div className="p-4 border rounded-lg bg-muted/20 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* DPMS System */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">DPMS System</Label>
              <div className="space-y-1.5">
                {DPMS_SYSTEMS.map(dpms => (
                  <button
                    key={dpms}
                    type="button"
                    onClick={() => toggleDpmsFilter(dpms)}
                    className={`flex items-center gap-2 w-full text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${filters.dpms.has(dpms) ? 'font-medium text-accent' : 'text-foreground'}`}
                  >
                    {filters.dpms.has(dpms) ? <CheckSquare className="w-3.5 h-3.5 text-accent" /> : <Square className="w-3.5 h-3.5 text-muted-foreground" />}
                    {dpms.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Provider Count */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Provider Count</Label>
              <div className="space-y-1.5">
                {([['all', 'All'], ['0-1', '0–1'], ['2-3', '2–3'], ['4+', '4+']] as [ProviderCountFilter, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, providerCount: val }))}
                    className={`flex items-center gap-2 w-full text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${filters.providerCount === val ? 'font-medium text-accent' : 'text-foreground'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${filters.providerCount === val ? 'border-accent bg-accent' : 'border-muted-foreground'}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule Status */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Schedule Status</Label>
              <div className="space-y-1.5">
                {([['all', 'All'], ['has-schedule', 'Has Schedule'], ['no-schedule', 'No Schedule']] as [ScheduleStatusFilter, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, scheduleStatus: val }))}
                    className={`flex items-center gap-2 w-full text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${filters.scheduleStatus === val ? 'font-medium text-accent' : 'text-foreground'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${filters.scheduleStatus === val ? 'border-accent bg-accent' : 'border-muted-foreground'}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Days Per Week */}
            <div>
              <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Days Per Week</Label>
              <div className="space-y-1.5">
                {([['all', 'All'], ['4', '4-day week'], ['5', '5-day week']] as [DaysPerWeekFilter, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilters(prev => ({ ...prev, daysPerWeek: val }))}
                    className={`flex items-center gap-2 w-full text-sm px-2 py-1 rounded hover:bg-muted transition-colors ${filters.daysPerWeek === val ? 'font-medium text-accent' : 'text-foreground'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${filters.daysPerWeek === val ? 'border-accent bg-accent' : 'border-muted-foreground'}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && <OfficeListSkeleton />}

      {/* Office Grid */}
      {!isLoading && sortedOffices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedOffices.map((office) => (
            <OfficeCard
              key={office.id}
              id={office.id}
              name={office.name}
              dpms={office.dpmsSystem}
              providerCount={office.providerCount}
              dailyGoal={office.totalDailyGoal}
              workingDays={office.workingDays.map(convertDayFormat)}
              lastUpdated={getRelativeTime(office.updatedAt)}
              hasSchedule={scheduleMap.get(office.id) ?? false}
              bulkSelected={bulkEditMode ? bulkSelected.has(office.id) : undefined}
              onBulkToggle={bulkEditMode ? toggleBulkSelect : undefined}
              onCompare={!bulkEditMode ? handleCompare : undefined}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedOffices.length === 0 && offices.length === 0 && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center space-y-6 max-w-md">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">No offices yet</h2>
              <p className="text-muted-foreground">
                Get started by creating your first office template or load demo data to explore the app.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center w-full">
              <Link href="/offices/new" className="w-full sm:w-auto">
                <Button className="w-full min-h-[44px]">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Office
                </Button>
              </Link>
              <Button
                variant="outline"
                className="w-full sm:w-auto min-h-[44px]"
                onClick={handleLoadDemoData}
                disabled={loadingDemo}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {loadingDemo ? "Loading..." : "Load Demo Data"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {!isLoading && sortedOffices.length === 0 && offices.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No offices match your search or filters.
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Bulk Goal Update Modal */}
      <Dialog open={showBulkGoalModal} onOpenChange={setShowBulkGoalModal}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Update Provider Goals</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Set daily goals by role across all {bulkSelected.size} selected office{bulkSelected.size !== 1 ? 's' : ''}.
                Leave blank to skip that role.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="doctor-goal" className="text-sm font-medium">
                  Doctor Daily Goal ($)
                </Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="doctor-goal"
                    type="number"
                    min="0"
                    placeholder="e.g. 5000"
                    value={bulkDoctorGoal}
                    onChange={e => setBulkDoctorGoal(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="hygienist-goal" className="text-sm font-medium">
                  Hygienist Daily Goal ($)
                </Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    id="hygienist-goal"
                    type="number"
                    min="0"
                    placeholder="e.g. 2500"
                    value={bulkHygienistGoal}
                    onChange={e => setBulkHygienistGoal(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setShowBulkGoalModal(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleBulkGoalUpdate}
                disabled={isBulkUpdating || (!bulkDoctorGoal && !bulkHygienistGoal)}
              >
                {isBulkUpdating ? 'Updating...' : `Update ${bulkSelected.size} Office${bulkSelected.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
