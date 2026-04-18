"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  GitCompareArrows,
  ClipboardCopy,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import ScheduleGrid, { ProviderInput } from "@/components/schedule/ScheduleGrid";
import type { TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import { useOfficeStore } from "@/store/office-store";
import { loadSchedulesFromStorage, cloneTemplateToOffices } from "@/lib/clone-template";
import type { GenerationResult } from "@/lib/engine/types";
import type { OfficeData } from "@/lib/mock-data";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Monday',
  TUESDAY: 'Tuesday',
  WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday',
  FRIDAY: 'Friday',
};

// ─── Comparison stats ─────────────────────────────────────────────────────────

function computeStats(
  schedule: GenerationResult | null,
  office: OfficeData | null
): {
  totalProduction: number;
  providerCount: number;
  opCount: number;
  blockMix: { label: string; count: number; production: number }[];
} {
  if (!schedule || !office) {
    return { totalProduction: 0, providerCount: 0, opCount: 0, blockMix: [] };
  }

  const totalProduction = (schedule.productionSummary || []).reduce(
    (sum, s) => sum + (s.actualScheduled || 0),
    0
  );
  const providerCount = office.providerCount;
  const opSet = new Set(schedule.slots.map(s => s.operatory).filter(Boolean));
  const opCount = opSet.size;

  // Block mix
  const mixMap = new Map<string, { count: number; production: number }>();
  const blockTypes = office.blockTypes ?? [];
  let prevGroupKey: string | null = null;

  for (const slot of schedule.slots) {
    if (!slot.blockLabel || slot.isBreak || !slot.blockTypeId) continue;
    const groupKey = slot.blockInstanceId
      ? slot.blockInstanceId
      : `${slot.blockTypeId}::${slot.operatory ?? ''}`;
    if (groupKey === prevGroupKey) continue;
    prevGroupKey = groupKey;

    const bt = blockTypes.find(b => b.id === slot.blockTypeId);
    const production =
      slot.customProductionAmount != null
        ? slot.customProductionAmount
        : bt?.minimumAmount ?? 0;
    const label = slot.blockLabel;
    const existing = mixMap.get(label) ?? { count: 0, production: 0 };
    mixMap.set(label, { count: existing.count + 1, production: existing.production + production });
  }

  const blockMix = Array.from(mixMap.entries())
    .map(([label, v]) => ({ label, count: v.count, production: v.production }))
    .sort((a, b) => b.production - a.production)
    .slice(0, 8);

  return { totalProduction, providerCount, opCount, blockMix };
}

// ─── Schedule to TimeSlotOutput[] ─────────────────────────────────────────────

function scheduleToTimeSlots(
  schedule: GenerationResult | null,
  providers: OfficeData['providers']
): TimeSlotOutput[] {
  if (!schedule) return [];

  const multiOpIds = new Set<string>(
    (providers ?? [])
      .filter(p => (p.operatories ?? []).length > 1)
      .map(p => p.id)
  );

  const slotsByTime: Record<string, TimeSlotOutput['slots']> = {};
  for (const slot of schedule.slots) {
    if (!slotsByTime[slot.time]) slotsByTime[slot.time] = [];
    const displayProviderId = multiOpIds.has(slot.providerId)
      ? `${slot.providerId}::${slot.operatory}`
      : slot.providerId;
    slotsByTime[slot.time].push({
      providerId: displayProviderId,
      staffingCode: slot.staffingCode ?? undefined,
      blockLabel: slot.blockLabel ?? undefined,
      blockTypeId: slot.blockTypeId ?? undefined,
      isBreak: slot.isBreak,
      blockInstanceId: slot.blockInstanceId ?? null,
      customProductionAmount: slot.customProductionAmount ?? null,
    });
  }

  const timeSlots: TimeSlotOutput[] = Object.entries(slotsByTime).map(([time, slots]) => ({
    time,
    slots,
  }));

  timeSlots.sort((a, b) => {
    const parseT = (t: string) => {
      const [tp, period] = t.split(' ');
      const [h, m] = tp.split(':').map(Number);
      let hr = h;
      if (period === 'PM' && hr !== 12) hr += 12;
      if (period === 'AM' && hr === 12) hr = 0;
      return hr * 60 + m;
    };
    return parseT(a.time) - parseT(b.time);
  });

  return timeSlots;
}

// ─── Provider display format ───────────────────────────────────────────────────

function buildDisplayProviders(office: OfficeData | null): ProviderInput[] {
  if (!office || !office.providers) return [];
  const result: ProviderInput[] = [];
  for (const p of office.providers) {
    const ops = p.operatories ?? [];
    if (ops.length > 1) {
      for (const op of ops) {
        result.push({
          id: `${p.id}::${op}`,
          name: p.name,
          role: p.role,
          color: p.color,
          operatories: [op],
          workingStart: p.workingStart,
          workingEnd: p.workingEnd,
        });
      }
    } else {
      result.push({
        id: p.id,
        name: p.name,
        role: p.role,
        color: p.color,
        operatories: ops.length > 0 ? ops : ['OP1'],
        workingStart: p.workingStart,
        workingEnd: p.workingEnd,
      });
    }
  }
  return result;
}

// ─── Office Selector ──────────────────────────────────────────────────────────

function OfficeSelector({
  label,
  value,
  onChange,
  offices,
  excludeId,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  offices: OfficeData[];
  excludeId?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-56 h-9">
          <SelectValue placeholder="Select office..." />
        </SelectTrigger>
        <SelectContent>
          {offices
            .filter(o => o.id !== excludeId)
            .map(o => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Stats panel ──────────────────────────────────────────────────────────────

function StatsPanel({
  stats,
  officeName,
}: {
  stats: ReturnType<typeof computeStats>;
  officeName: string;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  return (
    <div className="mt-3 p-3 rounded-lg border bg-muted/20 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Scheduled</p>
          <p className="font-semibold">{fmt(stats.totalProduction)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Providers</p>
          <p className="font-semibold">{stats.providerCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Operatories</p>
          <p className="font-semibold">{stats.opCount}</p>
        </div>
      </div>

      {stats.blockMix.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Procedure Mix</p>
          <div className="space-y-1">
            {stats.blockMix.map(b => (
              <div key={b.label} className="flex items-center gap-2 text-xs">
                <span className="w-20 truncate font-medium">{b.label}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-accent"
                    style={{
                      width: `${Math.min(100, stats.totalProduction > 0 ? (b.production / stats.totalProduction) * 100 : 0)}%`,
                    }}
                  />
                </div>
                <span className="text-muted-foreground">{b.count}×</span>
                <span>{fmt(b.production)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Compare Page ────────────────────────────────────────────────────────

function ComparePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialA = searchParams.get('a') ?? '';
  const initialB = searchParams.get('b') ?? '';
  const initialDay = (searchParams.get('day') ?? 'MONDAY').toUpperCase();

  const [officeIdA, setOfficeIdA] = useState(initialA);
  const [officeIdB, setOfficeIdB] = useState(initialB);
  const [activeDay, setActiveDay] = useState(DAYS.includes(initialDay) ? initialDay : 'MONDAY');

  const [officeA, setOfficeA] = useState<OfficeData | null>(null);
  const [officeB, setOfficeB] = useState<OfficeData | null>(null);
  const [scheduleA, setScheduleA] = useState<GenerationResult | null>(null);
  const [scheduleB, setScheduleB] = useState<GenerationResult | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  const { offices, fetchOffices } = useOfficeStore();

  // Load offices list
  useEffect(() => {
    if (offices.length === 0) {
      fetchOffices().catch(() => {});
    }
  }, [offices.length, fetchOffices]);

  // Load office A data
  useEffect(() => {
    if (!officeIdA) { setOfficeA(null); setScheduleA(null); return; }
    setLoadingA(true);
    fetch(`/api/offices/${officeIdA}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const o: OfficeData = {
          ...data,
          providerCount: data.providers?.length ?? 0,
          totalDailyGoal: data.providers?.reduce((s: number, p: { dailyGoal?: number }) => s + (p.dailyGoal || 0), 0) ?? 0,
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        };
        setOfficeA(o);
        const schedules = loadSchedulesFromStorage(officeIdA);
        setScheduleA(schedules[activeDay] ?? null);
      })
      .catch(() => toast.error('Failed to load Office A'))
      .finally(() => setLoadingA(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeIdA]);

  // Load office B data
  useEffect(() => {
    if (!officeIdB) { setOfficeB(null); setScheduleB(null); return; }
    setLoadingB(true);
    fetch(`/api/offices/${officeIdB}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        const o: OfficeData = {
          ...data,
          providerCount: data.providers?.length ?? 0,
          totalDailyGoal: data.providers?.reduce((s: number, p: { dailyGoal?: number }) => s + (p.dailyGoal || 0), 0) ?? 0,
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        };
        setOfficeB(o);
        const schedules = loadSchedulesFromStorage(officeIdB);
        setScheduleB(schedules[activeDay] ?? null);
      })
      .catch(() => toast.error('Failed to load Office B'))
      .finally(() => setLoadingB(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeIdB]);

  // Update schedules when day changes
  useEffect(() => {
    if (officeIdA) {
      const schedules = loadSchedulesFromStorage(officeIdA);
      setScheduleA(schedules[activeDay] ?? null);
    }
    if (officeIdB) {
      const schedules = loadSchedulesFromStorage(officeIdB);
      setScheduleB(schedules[activeDay] ?? null);
    }
  }, [activeDay, officeIdA, officeIdB]);

  // Update URL when selections change
  useEffect(() => {
    const params = new URLSearchParams();
    if (officeIdA) params.set('a', officeIdA);
    if (officeIdB) params.set('b', officeIdB);
    params.set('day', activeDay.toLowerCase());
    router.replace(`/compare?${params.toString()}`, { scroll: false });
  }, [officeIdA, officeIdB, activeDay, router]);

  const providersA = useMemo(() => buildDisplayProviders(officeA), [officeA]);
  const providersB = useMemo(() => buildDisplayProviders(officeB), [officeB]);
  const timeSlotsA = useMemo(() => scheduleToTimeSlots(scheduleA, officeA?.providers), [scheduleA, officeA]);
  const timeSlotsB = useMemo(() => scheduleToTimeSlots(scheduleB, officeB?.providers), [scheduleB, officeB]);
  const statsA = useMemo(() => computeStats(scheduleA, officeA), [scheduleA, officeA]);
  const statsB = useMemo(() => computeStats(scheduleB, officeB), [scheduleB, officeB]);

  const timeIncrementA = officeA?.timeIncrement ?? 10;
  const timeIncrementB = officeB?.timeIncrement ?? 10;

  // Clone A → B
  const handleCloneAtoB = () => {
    if (!officeA || !officeB) return;
    const result = cloneTemplateToOffices(
      officeA.id,
      officeA.providers ?? [],
      [{ id: officeB.id, name: officeB.name, providers: officeB.providers ?? [] }],
      { days: [activeDay], weeks: ['A'], cloneLibrary: false }
    );
    if (result.results.length > 0) {
      const cloned = result.results[0].schedules[activeDay];
      if (cloned) {
        setScheduleB(cloned);
        toast.success(`Cloned ${officeA.name}'s ${DAY_LABELS[activeDay]} schedule to ${officeB.name}`);
      }
    }
    if (result.totalMismatches > 0) {
      toast.warning(`${result.totalMismatches} provider mismatch(es) during clone.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-5 h-5 text-accent" />
              <h1 className="text-lg sm:text-2xl font-bold">Schedule Comparison</h1>
            </div>
            <p className="text-sm text-muted-foreground">Compare schedules side-by-side</p>
          </div>
        </div>

        {/* Clone A → B */}
        {officeA && officeB && scheduleA && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleCloneAtoB}
          >
            <ClipboardCopy className="w-4 h-4" />
            Clone A → B
          </Button>
        )}
      </div>

      {/* Office selectors + day picker */}
      <div className="flex flex-wrap gap-3 items-center p-3 bg-muted/20 rounded-lg border">
        <OfficeSelector
          label="Office A"
          value={officeIdA}
          onChange={id => { setOfficeIdA(id); }}
          offices={offices}
          excludeId={officeIdB}
        />
        <span className="text-muted-foreground">vs.</span>
        <OfficeSelector
          label="Office B"
          value={officeIdB}
          onChange={id => { setOfficeIdB(id); }}
          offices={offices}
          excludeId={officeIdA}
        />

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">Day:</span>
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            {DAYS.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDay(day)}
                className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l' : ''} ${
                  activeDay === day
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {DAY_LABELS[day].slice(0, 3)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Side-by-side grids */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Office A */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-base font-semibold">
              {officeA ? officeA.name : 'Office A'}
            </h2>
            {officeA && (
              <Badge variant="secondary" className="text-xs">{officeA.dpmsSystem}</Badge>
            )}
            {loadingA && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          <Card>
            <CardContent className="p-2 sm:p-4">
              {!officeIdA ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  Select Office A above
                </div>
              ) : loadingA ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !scheduleA ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No schedule for {DAY_LABELS[activeDay]}.{' '}
                  <Link href={`/offices/${officeIdA}`} className="underline ml-1">Build one</Link>
                </div>
              ) : (
                <ScheduleGrid
                  slots={timeSlotsA}
                  providers={providersA}
                  blockTypes={officeA?.blockTypes}
                  timeIncrement={timeIncrementA}
                  conflicts={[]}
                  dTimeConflicts={[]}
                  
                />
              )}
            </CardContent>
          </Card>

          {officeA && (
            <StatsPanel stats={statsA} officeName={officeA.name} />
          )}
        </div>

        {/* Office B */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-base font-semibold">
              {officeB ? officeB.name : 'Office B'}
            </h2>
            {officeB && (
              <Badge variant="secondary" className="text-xs">{officeB.dpmsSystem}</Badge>
            )}
            {loadingB && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          <Card>
            <CardContent className="p-2 sm:p-4">
              {!officeIdB ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  Select Office B above
                </div>
              ) : loadingB ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !scheduleB ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  No schedule for {DAY_LABELS[activeDay]}.{' '}
                  <Link href={`/offices/${officeIdB}`} className="underline ml-1">Build one</Link>
                </div>
              ) : (
                <ScheduleGrid
                  slots={timeSlotsB}
                  providers={providersB}
                  blockTypes={officeB?.blockTypes}
                  timeIncrement={timeIncrementB}
                  conflicts={[]}
                  dTimeConflicts={[]}
                  
                />
              )}
            </CardContent>
          </Card>

          {officeB && (
            <StatsPanel stats={statsB} officeName={officeB.name} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <ComparePageInner />
    </Suspense>
  );
}
