"use client";

/**
 * Print/PDF View — /offices/[id]/print
 *
 * A clean, print-optimised rendering of the schedule for the selected day.
 * Uses @media print CSS to hide nav chrome and produce a single-page PDF.
 * Can also be triggered via window.print() from the toolbar Print button.
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import type { TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import Link from "next/link";

// Helper: parse time "7:30 AM" or "07:30" to minutes since midnight
function parseTimeMin(t: string): number {
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const p = ampm[3].toUpperCase();
    if (p === 'AM' && h === 12) h = 0;
    if (p === 'PM' && h !== 12) h += 12;
    return h * 60 + m;
  }
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return parseInt(hhmm[1], 10) * 60 + parseInt(hhmm[2], 10);
  return 0;
}

function formatTimeAMPM(t: string): string {
  const m = parseTimeMin(t);
  let h = Math.floor(m / 60);
  const min = m % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${String(min).padStart(2, '0')} ${period}`;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday',
  THURSDAY: 'Thursday', FRIDAY: 'Friday',
};

export default function PrintSchedulePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const officeId = params.id as string;
  const queryDay = searchParams.get('day')?.toUpperCase() || '';

  const { currentOffice, fetchOffice, isLoading } = useOfficeStore();
  const { generatedSchedules, loadSchedulesForOffice } = useScheduleStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchOffice(officeId)
      .then(() => loadSchedulesForOffice(officeId))
      .then(() => setReady(true))
      .catch(() => router.push('/'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  const activeDay = queryDay || currentOffice?.workingDays?.[0] || '';
  const schedule = generatedSchedules[activeDay];
  const providers = currentOffice?.providers || [];
  const blockTypes = currentOffice?.blockTypes || [];

  // Build display slots
  const timeSlots: TimeSlotOutput[] = useMemo(() => {
    if (!schedule) return [];
    const multiOpIds = new Set(
      providers.filter(p => (p.operatories || []).length > 1).map(p => p.id)
    );
    const byTime: Record<string, any[]> = {};
    for (const slot of schedule.slots) {
      if (!byTime[slot.time]) byTime[slot.time] = [];
      const displayId = multiOpIds.has(slot.providerId)
        ? `${slot.providerId}::${slot.operatory}`
        : slot.providerId;
      byTime[slot.time].push({ ...slot, providerId: displayId });
    }
    return Object.entries(byTime)
      .map(([time, slots]) => ({ time, slots }))
      .sort((a, b) => parseTimeMin(a.time) - parseTimeMin(b.time));
  }, [schedule, providers]);

  // Expand multi-op providers for display
  const displayProviders = useMemo(() => {
    const result: typeof providers = [];
    for (const p of providers) {
      const ops = p.operatories || [];
      if (ops.length > 1) {
        ops.forEach(op => result.push({ ...p, id: `${p.id}::${op}`, operatories: [op] }));
      } else {
        result.push(p);
      }
    }
    return result;
  }, [providers]);

  if (!ready || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-muted-foreground">No schedule generated for {DAY_LABELS[activeDay] || activeDay}.</p>
        <Link href={`/offices/${officeId}`}>
          <Button variant="outline">← Back to Editor</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* ── Toolbar (hidden when printing) ─────────────────────────────── */}
      <div className="print:hidden flex items-center gap-3 p-4 border-b border-border bg-background sticky top-0 z-10">
        <Link href={`/offices/${officeId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-semibold">{currentOffice?.name}</h1>
          <p className="text-xs text-muted-foreground">{DAY_LABELS[activeDay] || activeDay} — Print View</p>
        </div>
        {/* Day tabs */}
        <div className="flex gap-1">
          {(currentOffice?.workingDays || []).map(day => (
            <Link key={day} href={`/offices/${officeId}/print?day=${day.toLowerCase()}`}>
              <Button
                size="sm"
                variant={day === activeDay ? 'default' : 'outline'}
                className="text-xs h-8"
              >
                {DAY_LABELS[day]?.substring(0, 3) || day}
              </Button>
            </Link>
          ))}
        </div>
        <Button onClick={() => window.print()} size="sm" className="gap-2">
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </Button>
      </div>

      {/* ── Print content ───────────────────────────────────────────────── */}
      <div
        className="print-content p-6 print:p-0 bg-white text-black"
        style={{ fontFamily: 'Calibri, Arial, sans-serif', fontSize: '10pt' }}
      >
        {/* Page header */}
        <div className="text-center mb-6 print:mb-4">
          <h1 className="text-xl font-bold text-gray-900">{currentOffice?.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {DAY_LABELS[activeDay] || activeDay} — Schedule Template
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        {/* Production summary row */}
        <div className="flex gap-4 justify-center mb-6 print:mb-3 flex-wrap">
          {schedule.productionSummary.map((s) => {
            const prov = providers.find(p => p.id === s.providerId);
            const bt = blockTypes.find(() => true); // used below
            const isMet = s.status === 'MET' || s.status === 'OVER';
            return (
              <div
                key={s.providerId}
                className="flex flex-col items-center px-4 py-2 rounded border"
                style={{
                  borderColor: prov?.color ?? '#ccc',
                  backgroundColor: (prov?.color ?? '#ccc') + '18',
                }}
              >
                <span className="text-xs font-semibold" style={{ color: prov?.color ?? '#333' }}>
                  {prov?.name ?? s.providerId}
                </span>
                <span className="text-base font-bold text-gray-800">
                  ${s.actualScheduled.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-500">
                  Target: ${((s as any).target75 ?? (prov ? prov.dailyGoal * 0.75 : 0)).toLocaleString()}
                </span>
                <span className={`text-[10px] font-bold ${isMet ? 'text-green-600' : 'text-yellow-600'}`}>
                  {isMet ? '✓ MET' : '⚠ UNDER'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Schedule grid */}
        <div className="overflow-x-auto">
          <table
            className="border-collapse w-full text-[9pt]"
            style={{ tableLayout: 'fixed', minWidth: `${60 + displayProviders.length * 180}px` }}
          >
            <colgroup>
              <col style={{ width: '60px' }} />
              {displayProviders.map(p => (
                <col key={p.id} style={{ width: '180px' }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-gray-300 px-1 py-1 text-center bg-gray-800 text-white text-[8pt]">
                  Time
                </th>
                {displayProviders.map(p => (
                  <th
                    key={p.id}
                    className="border border-gray-300 px-2 py-1 text-center text-[8pt] font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    <div>{p.name}</div>
                    <div className="text-[7pt] font-normal opacity-80">{p.role} · {p.operatories?.[0] ?? 'OP'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((row, rowIdx) => {
                // Detect hour boundary for visual separation
                const isHourBoundary = parseTimeMin(row.time) % 60 === 0;
                return (
                  <tr
                    key={rowIdx}
                    style={{ height: '18px', borderTop: isHourBoundary ? '1.5px solid #9CA3AF' : undefined }}
                  >
                    <td
                      className="border-r border-gray-200 px-1 text-right text-gray-500 bg-gray-50 text-[8pt] whitespace-nowrap"
                      style={{ borderBottom: '1px solid #E5E7EB' }}
                    >
                      {formatTimeAMPM(row.time)}
                    </td>
                    {displayProviders.map(provider => {
                      const slot = row.slots.find(s => s.providerId === provider.id);
                      const hasBlock = !!(slot?.blockTypeId || slot?.blockLabel) && !slot?.isBreak;
                      const isBreak = !!slot?.isBreak;
                      const bgColor = hasBlock
                        ? provider.color + '22'
                        : isBreak
                        ? '#F3F4F6'
                        : '#FFFFFF';
                      const borderLeft = hasBlock ? `3px solid ${provider.color}` : undefined;

                      return (
                        <td
                          key={provider.id}
                          className="text-[8pt] px-1"
                          style={{
                            backgroundColor: bgColor,
                            borderLeft,
                            borderRight: '1px solid #E5E7EB',
                            borderBottom: '1px solid #E5E7EB',
                            verticalAlign: 'middle',
                          }}
                        >
                          {isBreak ? (
                            <span className="text-gray-400 italic text-[7pt]">lunch</span>
                          ) : hasBlock ? (
                            <span className="font-medium text-gray-800 truncate block" title={slot?.blockLabel ?? ''}>
                              {slot?.staffingCode && (
                                <span className="text-[7pt] font-bold mr-1 text-gray-500">{slot.staffingCode}</span>
                              )}
                              {slot?.blockLabel}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Block legend */}
        {blockTypes.length > 0 && (
          <div className="mt-6 print:mt-3">
            <p className="text-xs font-semibold text-gray-600 mb-1">Block Types:</p>
            <div className="flex flex-wrap gap-3">
              {blockTypes.map(bt => (
                <div key={bt.id} className="flex items-center gap-1.5 text-[9pt]">
                  <span className="font-semibold text-gray-800">{bt.label}</span>
                  {bt.minimumAmount ? (
                    <span className="text-gray-500">&gt;${bt.minimumAmount}</span>
                  ) : null}
                  {bt.description ? (
                    <span className="text-gray-400">{bt.description}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 print:mt-4 text-center text-[8pt] text-gray-400 print:fixed print:bottom-4 print:left-0 print:right-0">
          Schedule Template Designer · {currentOffice?.name} · {DAY_LABELS[activeDay] || activeDay}
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: landscape;
            margin: 10mm 8mm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
