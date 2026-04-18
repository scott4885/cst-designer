"use client";

import type { RefObject } from "react";
import ScheduleGrid from "@/components/schedule/ScheduleGrid";
import type { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";

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
        ) : null}
      </div>
    </div>
  );
}
