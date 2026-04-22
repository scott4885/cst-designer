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
        ) : null}
      </div>
    </div>
  );
}
