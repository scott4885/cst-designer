"use client";

import { useState, useMemo, Fragment } from "react";
import TimeSlotCell from "./TimeSlotCell";

export interface ProviderInput {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    isBreak?: boolean;
  }[];
}

interface ScheduleGridProps {
  slots: TimeSlotOutput[];
  providers: ProviderInput[];
}

export default function ScheduleGrid({ slots, providers }: ScheduleGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const ROWS_PER_PAGE = 30; // Show 30 rows at a time (5 hours worth)

  // Generate time slots from 7:00 AM to 6:00 PM in 10-minute increments
  const generateTimeSlots = (): string[] => {
    const times: string[] = [];
    let hour = 7;
    let minute = 0;

    while (hour < 18 || (hour === 18 && minute === 0)) {
      const formattedHour = hour > 12 ? hour - 12 : hour;
      const period = hour >= 12 ? "PM" : "AM";
      const formattedMinute = minute.toString().padStart(2, "0");
      times.push(`${formattedHour}:${formattedMinute} ${period}`);

      minute += 10;
      if (minute >= 60) {
        minute = 0;
        hour += 1;
      }
    }

    return times;
  };

  const timeSlots: TimeSlotOutput[] = slots.length > 0 ? slots : generateTimeSlots().map(time => ({
    time,
    slots: providers.map(p => ({ 
      providerId: p.id,
      staffingCode: undefined,
      blockLabel: undefined,
      isBreak: false,
    })),
  }));

  // Calculate pagination
  const totalPages = Math.ceil(timeSlots.length / ROWS_PER_PAGE);
  const startIdx = currentPage * ROWS_PER_PAGE;
  const endIdx = Math.min(startIdx + ROWS_PER_PAGE, timeSlots.length);
  const visibleSlots = timeSlots.slice(startIdx, endIdx);

  // Get time range for current page
  const pageStartTime = timeSlots[startIdx]?.time || "";
  const pageEndTime = timeSlots[Math.min(endIdx - 1, timeSlots.length - 1)]?.time || "";

  // Empty state
  if (providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 border border-border rounded-lg bg-surface/30">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No providers configured</p>
          <p className="text-sm text-muted-foreground">Add providers to see the schedule grid</p>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 border border-border rounded-lg bg-surface/30">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">✨</div>
          <h3 className="text-lg font-semibold text-foreground">No Schedule Yet</h3>
          <p className="text-sm text-muted-foreground">
            Click &quot;Generate&quot; above to create an optimized schedule for this day.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface border border-border rounded-lg">
          <div className="text-sm text-muted-foreground">
            Showing {pageStartTime} - {pageEndTime} ({startIdx + 1}-{endIdx} of {timeSlots.length} slots)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <div className="px-3 py-1 text-sm">
              Page {currentPage + 1} of {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage === totalPages - 1}
              className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <div className="schedule-grid border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface z-20">
              <tr>
                <th className="px-3 py-3 text-sm font-semibold text-foreground border-b-2 border-border bg-surface w-20">
                  Time
                </th>
                {providers.map((provider) => (
                  <th
                    key={provider.id}
                    colSpan={2}
                    className="px-3 py-3 text-sm font-semibold text-foreground border-b-2 border-border bg-surface"
                  >
                    <div className="text-center">
                      <div className="font-semibold">{provider.name}</div>
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th className="border-b border-border bg-surface"></th>
                {providers.map((provider) => (
                  <Fragment key={provider.id}>
                    <th className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-surface min-w-[100px]">
                      Staffing
                    </th>
                    <th className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-surface min-w-[150px]">
                      Block Type
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleSlots.map((row, rowIdx) => (
                <tr key={startIdx + rowIdx} className="hover:bg-surface/50 transition-colors">
                  <td className="p-0 border-b border-border">
                    <TimeSlotCell time={row.time} />
                  </td>
                  {providers.map((provider) => {
                    const slot = row.slots.find(s => s.providerId === provider.id);
                    const timeStr = row.time;
                    const isLunchTime = timeStr >= "1:00 PM" && timeStr < "2:00 PM" && timeStr.includes("PM") && (timeStr.startsWith("1:"));
                    
                    return (
                      <Fragment key={provider.id}>
                        <td className="p-0 border-b border-border">
                          <TimeSlotCell
                            staffingCode={slot?.staffingCode}
                            providerColor={slot?.staffingCode ? provider.color : undefined}
                            isBreak={slot?.isBreak || (isLunchTime && !slot?.staffingCode)}
                          />
                        </td>
                        <td className="p-0 border-b border-border">
                          <TimeSlotCell
                            blockLabel={slot?.blockLabel}
                            providerColor={slot?.blockLabel ? provider.color : undefined}
                            isBreak={slot?.isBreak || (isLunchTime && !slot?.blockLabel)}
                          />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty state message when no schedule generated */}
      {slots.length === 0 && providers.length > 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <p>Click "Generate Schedule" to create optimized schedule blocks</p>
        </div>
      )}

      {/* Bottom pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2">
          <button
            onClick={() => setCurrentPage(0)}
            disabled={currentPage === 0}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          <span className="px-3 py-1 text-sm">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
          <button
            onClick={() => setCurrentPage(totalPages - 1)}
            disabled={currentPage === totalPages - 1}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-surface/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
}
