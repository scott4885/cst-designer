"use client";

/**
 * ScheduleGrid — thin orchestrator
 * ────────────────────────────────
 * Public entry point for the schedule grid. Composes three focused modules:
 *
 *   - useConflictLookups (ConflictOverlay.tsx) — conflict derivation memos
 *   - useTimeSlotInteraction (TimeSlotInteraction.tsx) — drag/click/edit state
 *     plus the BlockPicker/BlockEditor modal JSX
 *   - TimeGridRenderer — pure render of toolbar + sticky thead + tbody
 *
 * Owned locally:
 *   - Zoom / column-width chrome state (rowHeight, columnsExpanded) and its
 *     localStorage persistence, auto-fit, and fullScreen reactivity
 *   - Empty states (no providers, no slots)
 *   - Default time-slot generation when slots prop is empty
 *
 * Public props are unchanged from prior versions — internal reorg only.
 */

import { useCallback, useEffect, useState } from "react";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";
import TimeGridRenderer, { type ProviderInput, type TimeSlotOutput } from "./TimeGridRenderer";
import { useTimeSlotInteraction } from "./TimeSlotInteraction";
import { useConflictLookups } from "./ConflictOverlay";

// Re-export public types so existing imports keep working.
export type { ProviderInput, TimeSlotOutput };

export interface ScheduleGridProps {
  slots: TimeSlotOutput[];
  providers: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  timeIncrement?: number;
  conflicts?: ConflictResult[];
  /** D-time conflicts: when same doctor has hands-on time overlapping across columns */
  dTimeConflicts?: DTimeConflict[];
  onAddBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => void;
  onRemoveBlock?: (time: string, providerId: string) => void;
  onMoveBlock?: (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => void;
  onUpdateBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => void;
  /**
   * Optional: called when the user clicks "Generate Smart Schedule" for a specific provider.
   * The provider ID is the canonical real provider ID (not the virtual "id::OP" form).
   */
  onGenerateProvider?: (providerId: string) => void;
  /** Set to true when a per-provider generation is in progress for the given ID */
  generatingProviderId?: string | null;
  /** Whether the page is in fullscreen mode — triggers auto row-height recalculation */
  fullScreen?: boolean;
}

// Row height zoom levels (px per 10-min slot)
// UX-V3: Smaller defaults so 8am-5pm (54 rows) fits on screen without scrolling
const ROW_HEIGHT_LEVELS = [10, 12, 14, 16, 20, 24, 32, 40];
const DEFAULT_ROW_HEIGHT = 14;
const LS_ROW_HEIGHT_KEY = "schedule-row-height";

/**
 * Auto-calculate row height to fit full day on screen.
 */
function autoCalculateRowHeight(totalSlots: number, isFullScreen = false): number {
  if (typeof window === "undefined" || totalSlots === 0) return DEFAULT_ROW_HEIGHT;
  const reservedPx = isFullScreen ? 100 : 250;
  const availableHeight = window.innerHeight - reservedPx;
  const calculated = Math.max(10, Math.floor(availableHeight / totalSlots));
  const nearest = ROW_HEIGHT_LEVELS.reduce((prev, curr) =>
    Math.abs(curr - calculated) < Math.abs(prev - calculated) ? curr : prev
  );
  return nearest;
}

// Column width modes
const COL_WIDTH_COMPACT = 120;
const COL_WIDTH_EXPANDED = 220;

/** Default 7am–6pm @ 10-min increments for empty-slots fallback. */
function generateDefaultTimeSlots(): string[] {
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
}

export default function ScheduleGrid({
  slots,
  providers,
  blockTypes,
  timeIncrement = 10,
  conflicts = [],
  dTimeConflicts = [],
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlock,
  onGenerateProvider,
  generatingProviderId,
  fullScreen = false,
}: ScheduleGridProps) {
  const effectiveBlockTypes = blockTypes ?? [];

  // ─── Zoom & column width state ──────────────────────────────────────────
  const [rowHeight, setRowHeight] = useState<number>(DEFAULT_ROW_HEIGHT);
  const [columnsExpanded, setColumnsExpanded] = useState(false);

  // Load rowHeight from localStorage on mount, or auto-calculate
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(LS_ROW_HEIGHT_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (ROW_HEIGHT_LEVELS.includes(parsed)) {
        setRowHeight(parsed);
      } else if (parsed >= ROW_HEIGHT_LEVELS[0] && parsed <= ROW_HEIGHT_LEVELS[ROW_HEIGHT_LEVELS.length - 1]) {
        const nearest = ROW_HEIGHT_LEVELS.reduce((prev, curr) =>
          Math.abs(curr - parsed) < Math.abs(prev - parsed) ? curr : prev
        );
        setRowHeight(nearest);
      }
    } else {
      const totalSlots = slots.length > 0 ? slots.length : 54;
      setRowHeight(autoCalculateRowHeight(totalSlots));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist rowHeight changes to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS_ROW_HEIGHT_KEY, String(rowHeight));
  }, [rowHeight]);

  // Auto-recalculate row height when fullScreen mode toggles
  useEffect(() => {
    if (typeof window === "undefined") return;
    const totalSlots = slots.length > 0 ? slots.length : 54;
    setRowHeight(autoCalculateRowHeight(totalSlots, fullScreen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullScreen]);

  const fitToScreen = useCallback(() => {
    const totalSlots = slots.length > 0 ? slots.length : 54;
    setRowHeight(autoCalculateRowHeight(totalSlots, fullScreen));
  }, [slots.length, fullScreen]);

  const zoomIn = useCallback(() => {
    setRowHeight((h) => {
      const idx = ROW_HEIGHT_LEVELS.indexOf(h);
      return idx < ROW_HEIGHT_LEVELS.length - 1 ? ROW_HEIGHT_LEVELS[idx + 1] : h;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setRowHeight((h) => {
      const idx = ROW_HEIGHT_LEVELS.indexOf(h);
      return idx > 0 ? ROW_HEIGHT_LEVELS[idx - 1] : h;
    });
  }, []);

  const colWidth = columnsExpanded ? COL_WIDTH_EXPANDED : COL_WIDTH_COMPACT;

  // ─── Fallback to default generated slots when none provided ─────────────
  const timeSlots: TimeSlotOutput[] =
    slots.length > 0
      ? slots
      : generateDefaultTimeSlots().map((time) => ({
          time,
          slots: providers.map((p) => ({
            providerId: p.id,
            staffingCode: undefined,
            blockLabel: undefined,
            isBreak: false,
          })),
        }));

  // ─── Conflict lookups (derived memos) ───────────────────────────────────
  const { conflictMap, dTimeConflictInstanceIds, blockTypeById } = useConflictLookups(
    slots,
    conflicts,
    dTimeConflicts,
    blockTypes
  );

  // ─── Interaction state (drag + picker + editor) ─────────────────────────
  const {
    modals,
    getBlockInfo,
    handleEmptyCellClick,
    handleBlockCellClick,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    dragState,
    dragOverCell,
    sidebarDragging,
    isInteractive,
  } = useTimeSlotInteraction({
    slots,
    timeSlots,
    providers,
    effectiveBlockTypes,
    timeIncrement,
    onAddBlock,
    onRemoveBlock,
    onMoveBlock,
    onUpdateBlock,
  });

  // ─── Empty states ───────────────────────────────────────────────────────
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
          <div className="text-4xl">&#10024;</div>
          <h3 className="text-lg font-semibold text-foreground">No Schedule Yet</h3>
          <p className="text-sm text-muted-foreground">
            Click &quot;Generate&quot; above to create an optimized schedule for this day.
          </p>
        </div>
      </div>
    );
  }

  const zoomLevelIdx = ROW_HEIGHT_LEVELS.indexOf(rowHeight);
  const canZoomIn = zoomLevelIdx < ROW_HEIGHT_LEVELS.length - 1;
  const canZoomOut = zoomLevelIdx > 0;

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {modals}
      <TimeGridRenderer
        timeSlots={timeSlots}
        providers={providers}
        rowHeight={rowHeight}
        columnsExpanded={columnsExpanded}
        colWidth={colWidth}
        canZoomIn={canZoomIn}
        canZoomOut={canZoomOut}
        setColumnsExpanded={setColumnsExpanded}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToScreen={fitToScreen}
        onGenerateProvider={onGenerateProvider}
        generatingProviderId={generatingProviderId}
        conflictMap={conflictMap}
        dTimeConflictInstanceIds={dTimeConflictInstanceIds}
        blockTypeById={blockTypeById}
        isInteractive={isInteractive}
        dragState={dragState}
        dragOverCell={dragOverCell}
        sidebarDragging={sidebarDragging}
        getBlockInfo={getBlockInfo}
        onEmptyCellClick={handleEmptyCellClick}
        onBlockCellClick={handleBlockCellClick}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onMoveBlockEnabled={!!onMoveBlock}
      />
    </div>
  );
}
