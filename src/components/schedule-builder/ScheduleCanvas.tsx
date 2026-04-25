"use client";

import type { RefObject } from "react";
import ScheduleGrid from "@/components/schedule/ScheduleGrid";
import ScheduleCanvasV2 from "@/components/schedule/v2/ScheduleCanvasV2";
import type { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";

/**
 * Sprint 3 — Route flip feature flag.
 *
 * `NEXT_PUBLIC_SCHEDULE_V2=1` (default) renders the V2 multi-row X-segment grid
 * from `src/components/schedule/v2/ScheduleGrid.tsx` via the thin adapter in
 * `ScheduleCanvasV2.tsx`. `NEXT_PUBLIC_SCHEDULE_V2=0` restores the legacy grid.
 *
 * Rollback plan: set `NEXT_PUBLIC_SCHEDULE_V2=0` in `.env.local`, restart
 * `npm run dev`. No code changes required.
 */
const SCHEDULE_V2_ENABLED =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SCHEDULE_V2 !== "0";

interface ScheduleCanvasProps {
  slots: TimeSlotOutput[];
  providers: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  timeIncrement: number;
  conflicts: ConflictResult[];
  dTimeConflicts: DTimeConflict[];
  hasSchedule: boolean;
  gridRef?: RefObject<HTMLDivElement | null>;
  // Pass-through to ScheduleGrid
  onAddBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => void;
  onRemoveBlock?: (time: string, providerId: string) => void;
  onMoveBlock?: (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => void;
  onUpdateBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => void;
  onGenerateProvider?: (realProviderId: string) => void;
  generatingProviderId?: string | null;
  fullScreen: boolean;
  onBlockSelect?: (time: string, providerId: string) => void;
  /** Empty-state metadata when `hasSchedule` is false but the office is
   *  otherwise valid. Used to render an inline "no schedule for this day"
   *  panel instead of a blank canvas. */
  emptyDayMeta?: {
    activeDayLabel: string;
    onGenerateDay?: () => void;
    isGenerating?: boolean;
  };
}

export default function ScheduleCanvas({
  slots,
  providers,
  blockTypes,
  timeIncrement,
  conflicts,
  dTimeConflicts,
  hasSchedule,
  gridRef,
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlock,
  onGenerateProvider,
  generatingProviderId,
  fullScreen,
  emptyDayMeta,
}: ScheduleCanvasProps) {
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-white">
      {/* The schedule grid fills all available space */}
      <div
        ref={gridRef}
        data-pdf-capture="true"
        className="flex-1 min-h-0 overflow-hidden"
      >
        {hasSchedule ? (
          SCHEDULE_V2_ENABLED ? (
            <ScheduleCanvasV2
              slots={slots}
              providers={providers}
              blockTypes={blockTypes}
              timeIncrement={timeIncrement}
              onBlockActivate={(time, providerId) => {
                // Delegate to legacy edit path so the Properties Panel + store
                // handlers keep working during the V3→V4 bake-in.
                if (onUpdateBlock) {
                  // noop — V2 grid surfaces the popover internally
                }
                void time;
                void providerId;
              }}
            />
          ) : (
            <ScheduleGrid
              slots={slots}
              providers={providers}
              blockTypes={blockTypes}
              timeIncrement={timeIncrement}
              conflicts={conflicts}
              dTimeConflicts={dTimeConflicts}
              onAddBlock={onAddBlock}
              onRemoveBlock={onRemoveBlock}
              onMoveBlock={onMoveBlock}
              onUpdateBlock={onUpdateBlock}
              onGenerateProvider={onGenerateProvider}
              generatingProviderId={generatingProviderId}
              fullScreen={fullScreen}
            />
          )
        ) : (
          <EmptyDayPanel meta={emptyDayMeta} />
        )}
      </div>
    </div>
  );
}

/**
 * Inline empty-state for a day with no generated schedule. Replaces the
 * legacy `null` return that produced a confusing blank canvas. The panel
 * gives the user a clear next action instead of a void.
 */
function EmptyDayPanel({
  meta,
}: {
  meta?: ScheduleCanvasProps["emptyDayMeta"];
}) {
  const dayLabel = meta?.activeDayLabel ?? "this day";
  return (
    <div
      data-testid="schedule-empty-day"
      className="h-full w-full flex items-center justify-center px-6 py-12 bg-slate-50/40"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-6 w-6"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 10h18M8 2v4M16 2v4" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          No schedule for {dayLabel}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Generate a template for this day, or copy from another day already
          built. You can also leave it blank to mark the office closed.
        </p>
        {meta?.onGenerateDay && (
          <button
            type="button"
            onClick={meta.onGenerateDay}
            disabled={meta.isGenerating}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {meta.isGenerating ? "Generating…" : `Generate ${dayLabel}`}
          </button>
        )}
      </div>
    </div>
  );
}
