"use client";

import { useState, useCallback, useMemo, useEffect, Fragment } from "react";
import { ZoomIn, ZoomOut, ChevronsLeftRight, ChevronsRight, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import TimeSlotCell from "./TimeSlotCell";
import BlockPicker from "./BlockPicker";
import BlockEditor from "./BlockEditor";
import { BLOCK_TYPE_DRAG_KEY } from "./BlockPalette";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";

export interface ProviderInput {
  id: string;
  name: string;
  role: string;
  color: string;
  operatories?: string[];
  /** "07:00" 24-hour format — used to gray out slots outside this provider's shift */
  workingStart?: string;
  workingEnd?: string;
  /** When true, renders the entire column with an "OFF" overlay (provider is disabled this day) */
  disabled?: boolean;
}

/** Convert "HH:MM" 24-hour string to minutes since midnight */
function hhmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert a display time string to minutes since midnight.
 * Handles both "07:30" (24-hour) and "7:30 AM" / "7:30 PM" (12-hour AM/PM) formats.
 */
function displayTimeToMinutes(t: string): number {
  // 12-hour AM/PM format: "7:30 AM", "12:00 PM", "1:00 PM", etc.
  const ampmMatch = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return h * 60 + m;
  }
  // 24-hour format: "07:30"
  const hhmmMatch = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    return parseInt(hhmmMatch[1], 10) * 60 + parseInt(hhmmMatch[2], 10);
  }
  return -1; // unparseable
}

/**
 * Returns true when `rowTime` is outside the provider's scheduled shift.
 * Accepts both "07:30" (24-hour) and "7:30 AM" / "7:30 PM" (12-hour AM/PM) formats.
 * Used to render a gray "unavailable" background for those cells.
 */
function isOutsideProviderHours(rowTime: string, provider: ProviderInput): boolean {
  if (!provider.workingStart || !provider.workingEnd) return false;
  const t = displayTimeToMinutes(rowTime);
  if (t === -1) return false; // unparseable — don't gray out
  const start = hhmToMinutes(provider.workingStart);
  const end = hhmToMinutes(provider.workingEnd);
  return t < start || t >= end;
}

export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    blockTypeId?: string;
    isBreak?: boolean;
    /** Unique instance ID — enables multiple adjacent same-type blocks to stay distinct */
    blockInstanceId?: string | null;
    /** Per-block production minimum override */
    customProductionAmount?: number | null;
  }[];
}

interface ScheduleGridProps {
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
}

// Drag state
interface DragState {
  time: string;
  providerId: string;
  blockTypeId: string;
  blockLabel: string;
}

// Row height zoom levels (px per 10-min slot)
// UX-V3: Smaller defaults so 8am-5pm (54 rows) fits on screen without scrolling
const ROW_HEIGHT_LEVELS = [10, 12, 14, 16, 20, 24, 32, 40];
const DEFAULT_ROW_HEIGHT = 14;
const LS_ROW_HEIGHT_KEY = "schedule-row-height";

/**
 * Auto-calculate row height to fit full day on screen.
 * Returns a height that, when multiplied by the number of time slots,
 * fits within the available viewport height.
 */
function autoCalculateRowHeight(totalSlots: number): number {
  if (typeof window === 'undefined' || totalSlots === 0) return DEFAULT_ROW_HEIGHT;
  // Reserve space for header bar (~90px) and table header (~80px)
  const availableHeight = window.innerHeight - 170;
  const calculated = Math.max(10, Math.floor(availableHeight / totalSlots));
  // Snap to nearest valid level
  const nearest = ROW_HEIGHT_LEVELS.reduce((prev, curr) =>
    Math.abs(curr - calculated) < Math.abs(prev - calculated) ? curr : prev
  );
  return nearest;
}

// Column width modes
const COL_WIDTH_COMPACT = 120;
const COL_WIDTH_EXPANDED = 220;

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
}: ScheduleGridProps) {
  // blockTypes may be undefined (fall back to global library in BlockPicker/BlockEditor)
  // or an explicit array of office-specific types
  const effectiveBlockTypes = blockTypes ?? [];

  // ─── Zoom & column width state ────────────────────────────────────────────
  const [rowHeight, setRowHeight] = useState<number>(DEFAULT_ROW_HEIGHT);
  const [columnsExpanded, setColumnsExpanded] = useState(false);

  // Load rowHeight from localStorage on mount, or auto-calculate if not stored
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
      // Auto-calculate: fit full day on screen
      const totalSlots = slots.length > 0 ? slots.length : 54; // default 54 for 8am-5pm @ 10min
      setRowHeight(autoCalculateRowHeight(totalSlots));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist rowHeight changes to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS_ROW_HEIGHT_KEY, String(rowHeight));
  }, [rowHeight]);

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

  // ─── Block picker state (click-to-add) ────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ time: string; providerId: string } | null>(null);

  // ─── Block editor state (click-to-edit) ───────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPosition, setEditorPosition] = useState<{
    time: string;
    providerId: string;
    blockTypeId: string;
    blockLabel: string;
    slotCount: number;
    customProductionAmount: number | null;
  } | null>(null);

  // ─── Drag state ───────────────────────────────────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ time: string; providerId: string } | null>(null);
  // Track whether a sidebar drag (from BlockPalette) is in progress
  const [sidebarDragging, setSidebarDragging] = useState(false);

  // Build conflict lookup: "time:providerId" → ConflictResult
  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictResult>();
    for (const c of conflicts) {
      map.set(`${c.time}:${c.providerId}`, c);
    }
    return map;
  }, [conflicts]);

  // Build blockType lookup by ID (must come before dTimeConflictInstanceIds)
  const blockTypeById = useMemo(() => {
    const map = new Map<string, BlockTypeInput>();
    for (const bt of (blockTypes ?? [])) {
      map.set(bt.id, bt);
    }
    return map;
  }, [blockTypes]);

  // Build D-time conflict set: Set of blockInstanceIds that have D-time overlapping with another block
  // This is computed by cross-referencing conflict times with block instance start times.
  const dTimeConflictInstanceIds = useMemo(() => {
    if (dTimeConflicts.length === 0 || slots.length === 0) return new Set<string>();

    // Build a map: "providerId:blockInstanceId" → earliest slot time for that instance
    const instanceStartTimes = new Map<string, number>(); // key: instanceId, value: minutes
    const instanceByProvider = new Map<string, Map<string, number>>(); // providerId → instanceId → startMin

    for (const row of slots) {
      for (const slot of row.slots) {
        if (!slot.blockTypeId || !slot.blockInstanceId || slot.isBreak) continue;
        const realProviderId = slot.providerId.includes('::')
          ? slot.providerId.slice(0, slot.providerId.lastIndexOf('::'))
          : slot.providerId;

        // Parse the time (slot times are 24h "HH:MM" format)
        const timeParts = row.time.match(/^(\d{1,2}):(\d{2})$/);
        const timeMin = timeParts
          ? parseInt(timeParts[1], 10) * 60 + parseInt(timeParts[2], 10)
          : -1;
        if (timeMin < 0) continue;

        const existing = instanceStartTimes.get(slot.blockInstanceId);
        if (existing === undefined || timeMin < existing) {
          instanceStartTimes.set(slot.blockInstanceId, timeMin);
        }

        const pMap = instanceByProvider.get(realProviderId) ?? new Map<string, number>();
        const pExisting = pMap.get(slot.blockInstanceId);
        if (pExisting === undefined || timeMin < pExisting) {
          pMap.set(slot.blockInstanceId, timeMin);
        }
        instanceByProvider.set(realProviderId, pMap);
      }
    }

    const conflictingIds = new Set<string>();

    for (const conflict of dTimeConflicts) {
      const conflictMin = (() => {
        const m = conflict.time.match(/^(\d{1,2}):(\d{2})$/);
        return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
      })();
      if (conflictMin < 0) continue;

      const pMap = instanceByProvider.get(conflict.providerId);
      if (!pMap) continue;

      // Find all blocks for this provider where D-time covers the conflict time
      for (const [instanceId, startMin] of pMap) {
        // Find the blockTypeId for this instance from slots
        let blockTypeId: string | undefined;
        outer: for (const row of slots) {
          for (const s of row.slots) {
            if (s.blockInstanceId === instanceId) {
              blockTypeId = s.blockTypeId ?? undefined;
              break outer;
            }
          }
        }
        if (!blockTypeId) continue;

        const bt = blockTypeById.get(blockTypeId);
        const dTimeMin = bt?.dTimeMin ?? 0;
        const dEndMin = startMin + (dTimeMin > 0 ? dTimeMin : (bt?.durationMin ?? 30));

        // D-time is active from startMin to dEndMin; check if conflict time falls in that range
        if (conflictMin >= startMin && conflictMin < dEndMin) {
          conflictingIds.add(instanceId);
        }
      }
    }

    return conflictingIds;
  }, [dTimeConflicts, slots, blockTypeById]);

  // Generate default time slots
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

  const timeSlots: TimeSlotOutput[] =
    slots.length > 0
      ? slots
      : generateTimeSlots().map((time) => ({
          time,
          slots: providers.map((p) => ({
            providerId: p.id,
            staffingCode: undefined,
            blockLabel: undefined,
            isBreak: false,
          })),
        }));

  // Find the block that a slot belongs to (for determining block spans)
  const getBlockInfo = useCallback(
    (time: string, providerId: string) => {
      if (slots.length === 0) return null;

      // Find this provider's slots across all time rows
      const providerSlotData: { time: string; blockTypeId?: string; blockLabel?: string; blockInstanceId?: string | null; customProductionAmount?: number | null; isBreak?: boolean }[] = [];
      for (const row of timeSlots) {
        const slot = row.slots.find((s) => s.providerId === providerId);
        if (slot) {
          providerSlotData.push({ time: row.time, ...slot });
        }
      }

      // Find the slot at the given time
      const idx = providerSlotData.findIndex((s) => s.time === time);
      if (idx === -1) return null;

      const slot = providerSlotData[idx];
      if (!slot.blockTypeId) return null;

      // Count contiguous slots belonging to the SAME block instance.
      // When blockInstanceId is available, use it to avoid merging adjacent blocks of the same type
      // placed as separate instances (Issue 5 fix).
      const isSameBlock = (i: number) => {
        const s = providerSlotData[i];
        if (slot.blockInstanceId && s.blockInstanceId) {
          return s.blockInstanceId === slot.blockInstanceId;
        }
        // Fall back to blockTypeId matching for legacy slots without instanceId
        return s.blockTypeId === slot.blockTypeId;
      };

      let start = idx;
      while (start > 0 && isSameBlock(start - 1)) {
        start--;
      }
      let end = idx;
      while (end < providerSlotData.length - 1 && isSameBlock(end + 1)) {
        end++;
      }

      return {
        blockTypeId: slot.blockTypeId,
        blockLabel: slot.blockLabel || "",
        blockInstanceId: slot.blockInstanceId ?? null,
        customProductionAmount: slot.customProductionAmount ?? null,
        slotCount: end - start + 1,
        isFirst: idx === start,
        isLast: idx === end,
        startTime: providerSlotData[start].time,
      };
    },
    [timeSlots, slots.length]
  );

  // Handle clicking an empty cell
  const handleEmptyCellClick = useCallback(
    (time: string, providerId: string) => {
      if (!onAddBlock) return;
      setPickerPosition({ time, providerId });
      setPickerOpen(true);
      setEditorOpen(false);
    },
    [onAddBlock]
  );

  // Handle clicking an occupied cell
  const handleBlockCellClick = useCallback(
    (time: string, providerId: string) => {
      if (!onUpdateBlock && !onRemoveBlock) return;
      const info = getBlockInfo(time, providerId);
      if (!info) return;

      setEditorPosition({
        time: info.startTime,
        providerId,
        blockTypeId: info.blockTypeId,
        blockLabel: info.blockLabel,
        slotCount: info.slotCount,
        customProductionAmount: info.customProductionAmount,
      });
      setEditorOpen(true);
      setPickerOpen(false);
    },
    [onUpdateBlock, onRemoveBlock, getBlockInfo]
  );

  // Handle block type selection from picker
  const handleBlockSelected = useCallback(
    (blockType: BlockTypeInput) => {
      if (!pickerPosition || !onAddBlock) return;
      const durationSlots = Math.ceil(blockType.durationMin / timeIncrement);
      onAddBlock(pickerPosition.time, pickerPosition.providerId, blockType, durationSlots);
      setPickerOpen(false);
      setPickerPosition(null);
    },
    [pickerPosition, onAddBlock, timeIncrement]
  );

  // Handle block edit
  const handleBlockUpdate = useCallback(
    (blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => {
      if (!editorPosition || !onUpdateBlock) return;
      onUpdateBlock(editorPosition.time, editorPosition.providerId, blockType, durationSlots, customProductionAmount);
      setEditorOpen(false);
      setEditorPosition(null);
    },
    [editorPosition, onUpdateBlock]
  );

  // Handle block delete
  const handleBlockDelete = useCallback(() => {
    if (!editorPosition || !onRemoveBlock) return;
    onRemoveBlock(editorPosition.time, editorPosition.providerId);
    setEditorOpen(false);
    setEditorPosition(null);
  }, [editorPosition, onRemoveBlock]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, time: string, providerId: string) => {
      const info = getBlockInfo(time, providerId);
      if (!info) return;

      setDragState({
        time: info.startTime,
        providerId,
        blockTypeId: info.blockTypeId,
        blockLabel: info.blockLabel,
      });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "block");
    },
    [getBlockInfo]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, time: string, providerId: string) => {
      // Accept drops from: existing block drag OR sidebar palette drag
      const hasSidebarData = e.dataTransfer.types.includes(BLOCK_TYPE_DRAG_KEY);
      if (!dragState && !hasSidebarData) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = hasSidebarData ? "copy" : "move";
      setDragOverCell({ time, providerId });
      if (hasSidebarData && !sidebarDragging) setSidebarDragging(true);
    },
    [dragState, sidebarDragging]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, time: string, providerId: string) => {
      e.preventDefault();

      // ── Sidebar drop: block type from BlockPalette/BlockPicker ──────────
      const blockTypeJson = e.dataTransfer.getData(BLOCK_TYPE_DRAG_KEY);
      if (blockTypeJson && onAddBlock) {
        try {
          const blockType: BlockTypeInput = JSON.parse(blockTypeJson);
          const durationSlots = Math.ceil(blockType.durationMin / timeIncrement);
          onAddBlock(time, providerId, blockType, durationSlots);
        } catch {
          // malformed JSON — ignore
        }
        setSidebarDragging(false);
        setDragOverCell(null);
        return;
      }

      // ── Grid block move ──────────────────────────────────────────────────
      if (!dragState || !onMoveBlock) return;
      onMoveBlock(dragState.time, dragState.providerId, time, providerId);
      setDragState(null);
      setDragOverCell(null);
    },
    [dragState, onMoveBlock, onAddBlock, timeIncrement]
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverCell(null);
    setSidebarDragging(false);
  }, []);

  // Determine the provider role for filtering block types in the picker
  const getProviderRole = useCallback(
    (providerId: string) => {
      return providers.find((p) => p.id === providerId)?.role || "DOCTOR";
    },
    [providers]
  );

  // ─── Empty states ─────────────────────────────────────────────────────────
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

  const isInteractive = !!(onAddBlock || onRemoveBlock || onMoveBlock || onUpdateBlock);
  const zoomLevelIdx = ROW_HEIGHT_LEVELS.indexOf(rowHeight);
  const canZoomIn = zoomLevelIdx < ROW_HEIGHT_LEVELS.length - 1;
  const canZoomOut = zoomLevelIdx > 0;

  return (
    <div className="space-y-2">
      {/* Block Picker (click-to-add) — always falls back to global Appointment Library */}
      {pickerOpen && pickerPosition && (
        <BlockPicker
          blockTypes={undefined}
          providerRole={getProviderRole(pickerPosition.providerId) as "DOCTOR" | "HYGIENIST"}
          onSelect={handleBlockSelected}
          onClose={() => {
            setPickerOpen(false);
            setPickerPosition(null);
          }}
          timeLabel={pickerPosition.time}
        />
      )}

      {/* Block Editor (click-to-edit) */}
      {editorOpen && editorPosition && (
        <BlockEditor
          blockTypes={effectiveBlockTypes.length > 0 ? effectiveBlockTypes : undefined}
          providerRole={getProviderRole(editorPosition.providerId) as "DOCTOR" | "HYGIENIST"}
          currentBlockTypeId={editorPosition.blockTypeId}
          currentSlotCount={editorPosition.slotCount}
          currentCustomProductionAmount={editorPosition.customProductionAmount}
          timeIncrement={timeIncrement}
          onUpdate={handleBlockUpdate}
          onDelete={handleBlockDelete}
          onClose={() => {
            setEditorOpen(false);
            setEditorPosition(null);
          }}
        />
      )}

      {/* ─── Controls bar — compact single row ────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/30 rounded-md border border-border/50">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={!columnsExpanded ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setColumnsExpanded(false)}
            title="Compact columns"
          >
            <ChevronsRight className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Compact</span>
          </Button>
          <Button
            size="sm"
            variant={columnsExpanded ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setColumnsExpanded(true)}
            title="Expanded columns"
          >
            <ChevronsLeftRight className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Wide</span>
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={zoomOut} disabled={!canZoomOut} title="Zoom out">
            <ZoomOut className="w-3 h-3" />
          </Button>
          <span className="text-[10px] text-muted-foreground w-8 text-center tabular-nums">{rowHeight}px</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={zoomIn} disabled={!canZoomIn} title="Zoom in">
            <ZoomIn className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* ─── Schedule Grid ─────────────────────────────────────────────────── */}
      {/* Outer container: scrollable with sticky column headers at top */}
      {/* UX-V3: No maxHeight — grid uses full remaining viewport height */}
      <div
        className="schedule-grid border border-border rounded-lg overflow-y-auto overflow-x-auto flex-1"
      >
        <div>
          <table
            className="border-collapse"
            style={{ tableLayout: "fixed", borderCollapse: "collapse", borderSpacing: 0, minWidth: `${80 + providers.length * (colWidth + 28)}px` }}
          >
            <thead className="sticky top-0 z-20">
              {/* Row 1: Operatory name header */}
              <tr className="border-b border-border/50">
                {/* Sticky time column header */}
                <th
                  className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-surface text-left border-b border-border/50 sticky left-0 z-30"
                  style={{ width: 80, minWidth: 80 }}
                >
                  Operatory
                </th>
                {providers.map((provider) => {
                  const opName = provider.operatories?.[0] || '—';
                  const staffCode = provider.role === 'DOCTOR' ? 'D' : provider.role === 'HYGIENIST' ? 'H' : 'A';
                  return (
                    <th
                      key={`op-${provider.id}`}
                      colSpan={2}
                      className="px-2 py-1 text-center bg-surface"
                      style={{ borderBottom: '2px solid var(--border)', minWidth: colWidth + 28 }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border"
                          style={{ backgroundColor: provider.color + '20', borderColor: provider.color + '60', color: provider.color }}
                        >
                          {opName}
                        </span>
                        <span className="text-[10px] font-bold px-1 rounded bg-muted text-muted-foreground">
                          {staffCode}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Row 2: Provider name header */}
              <tr>
                <th
                  className="px-3 py-2 text-sm font-semibold text-foreground border-b-2 border-border bg-surface sticky left-0 z-30"
                  style={{ width: 80, minWidth: 80 }}
                >
                  Time
                </th>
                {providers.map((provider) => {
                  // Strip virtual "id::OP" suffix to get real provider ID
                  const realProviderId = provider.id.includes('::')
                    ? provider.id.slice(0, provider.id.lastIndexOf('::'))
                    : provider.id;
                  const isGenerating = generatingProviderId === realProviderId;
                  return (
                    <th
                      key={provider.id}
                      colSpan={2}
                      className={`px-2 py-1.5 text-sm font-semibold text-foreground border-b-2 border-border bg-surface ${provider.disabled ? 'opacity-50' : ''}`}
                      style={{ minWidth: colWidth + 28 }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="font-semibold text-xs" style={{ color: provider.disabled ? '#999' : provider.color }}>
                          {provider.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-normal">
                          {provider.role}
                        </div>
                        {provider.disabled ? (
                          <span className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border/50">
                            OFF TODAY
                          </span>
                        ) : onGenerateProvider && (
                          <button
                            onClick={() => onGenerateProvider(realProviderId)}
                            disabled={isGenerating || !!generatingProviderId}
                            title={`Generate smart schedule for ${provider.name}`}
                            className="mt-0.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium
                              bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent
                              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            style={{ fontSize: '9px' }}
                          >
                            {isGenerating ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-2.5 h-2.5" />
                            )}
                            {isGenerating ? 'Generating…' : 'Smart Fill'}
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Row 3: Staffing / Block type sub-headers */}
              <tr>
                <th
                  className="border-b border-border bg-surface sticky left-0 z-30"
                  style={{ width: 80, minWidth: 80 }}
                />
                {providers.map((provider) => (
                  <Fragment key={provider.id}>
                    <th className="px-1 py-1 text-[10px] text-muted-foreground border-b border-border bg-surface text-center" style={{ width: 28, minWidth: 28 }}>
                      S
                    </th>
                    <th
                      className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border bg-surface"
                      style={{ minWidth: colWidth }}
                    >
                      Block Type
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((row, rowIdx) => {
                // Compact mode: hide D/A split bars, DA labels, HP badge when rows are tiny
                const isCompactRow = rowHeight < 20;
                return (
                <tr
                  key={rowIdx}
                  className="hover:bg-muted/30 transition-colors"
                  style={{ height: rowHeight, maxHeight: rowHeight }}
                >
                  {/* Sticky time cell */}
                  <td
                    className="p-0 border-b border-border sticky left-0 z-10 bg-surface"
                    style={{ width: 80, minWidth: 80, height: rowHeight, maxHeight: rowHeight, overflow: 'hidden' }}
                  >
                    <TimeSlotCell time={row.time} />
                  </td>
                  {providers.map((provider) => {
                    // Provider disabled for this day — render a greyed-out inert cell
                    if (provider.disabled) {
                      return (
                        <Fragment key={provider.id}>
                          <td className="p-0 border-b border-border/30 bg-muted/20 text-center" style={{ width: 28, minWidth: 28, height: rowHeight, maxHeight: rowHeight, overflow: 'hidden' }} />
                          <td
                            className="p-0 border-b border-border/30 bg-muted/20"
                            style={{ minWidth: colWidth, height: rowHeight, maxHeight: rowHeight, overflow: 'hidden' }}
                          />
                        </Fragment>
                      );
                    }

                    const slot = row.slots.find((s) => s.providerId === provider.id);
                    const timeStr = row.time;
                    const isLunchTime =
                      timeStr >= "1:00 PM" &&
                      timeStr < "2:00 PM" &&
                      timeStr.includes("PM") &&
                      timeStr.startsWith("1:");

                    const hasBlock = !!(slot?.blockTypeId || slot?.blockLabel) && !slot?.isBreak;
                    const isEmpty = !hasBlock && !slot?.isBreak && !(isLunchTime && !slot?.staffingCode);
                    // Gray-out slots that fall outside this provider's scheduled work hours
                    const outsideHours = isOutsideProviderHours(row.time, provider);
                    const isCellDragOver =
                      dragOverCell?.time === row.time && dragOverCell?.providerId === provider.id;

                    // Determine if this cell's block is the one being dragged
                    const blockInfo = hasBlock ? getBlockInfo(row.time, provider.id) : null;
                    const isDraggingSource =
                      !!dragState &&
                      dragState.providerId === provider.id &&
                      !!blockInfo &&
                      blockInfo.startTime === dragState.time;

                    // Conflict detection (hard double-booking)
                    const conflictEntry = conflictMap.get(`${row.time}:${provider.id}`);
                    const cellHasConflict = !!conflictEntry;
                    const conflictTooltip = conflictEntry
                      ? `Double-booked in: ${conflictEntry.operatories.join(', ')} — blocks: ${conflictEntry.blockLabels.join(', ')}`
                      : undefined;

                    // D-time conflict detection: check if this block instance is in the D-time conflict set
                    const isFirstCell = blockInfo?.isFirst || false;
                    let hasDTimeConflict = false;
                    let dTimeConflictTooltip: string | undefined;
                    let cellDTimeMin = 0;
                    let cellATimeMin = 0;

                    // HP badge: role-based threshold (Dr≥$1k, Hyg≥$300)
                    let isHighProduction = false;
                    if (hasBlock && slot?.blockTypeId) {
                      const bt = blockTypeById.get(slot.blockTypeId);
                      if (bt && isFirstCell) {
                        cellDTimeMin = bt.dTimeMin ?? 0;
                        cellATimeMin = bt.aTimeMin ?? 0;
                        const hpThreshold = provider.role === 'HYGIENIST' ? 300 : 1000;
                        isHighProduction = (bt.minimumAmount ?? 0) >= hpThreshold;
                      }

                      // Show D-time conflict on the first cell of any conflicting block
                      if (isFirstCell && slot.blockInstanceId && dTimeConflictInstanceIds.has(slot.blockInstanceId)) {
                        hasDTimeConflict = true;
                        dTimeConflictTooltip = `D-time overlap: doctor has hands-on time in another column at the same time. Consider staggering start times.`;
                      }
                    }

                    // Visual grouping (§4.4): suppress row divider for non-last block cells
                    // so the block appears as a single contiguous unit
                    const isBlockCellNotLast = hasBlock && blockInfo && !blockInfo.isLast;

                    return (
                      <Fragment key={provider.id}>
                        <td
                          className={`p-0 ${isBlockCellNotLast ? '' : 'border-b border-border'}`}
                          style={{
                            width: 28, minWidth: 28,
                            height: rowHeight, maxHeight: rowHeight, overflow: 'hidden',
                            ...(isBlockCellNotLast ? { borderBottom: 'none' } : {}),
                          }}
                        >
                          <TimeSlotCell
                            staffingCode={slot?.staffingCode}
                            providerColor={slot?.staffingCode ? provider.color : undefined}
                            isBreak={slot?.isBreak || (isLunchTime && !slot?.staffingCode)}
                            isDrExam={slot?.staffingCode === 'D' && provider.role === 'HYGIENIST'}
                          />
                        </td>
                        <td
                          className={`p-0 ${isBlockCellNotLast ? '' : 'border-b border-border'}`}
                          style={{
                            minWidth: colWidth,
                            height: rowHeight, maxHeight: rowHeight, overflow: 'hidden',
                            ...(isBlockCellNotLast ? { borderBottom: 'none' } : {}),
                          }}
                        >
                          <div
                            data-testid={`block-cell-${row.time}-${provider.id}`}
                            style={{ height: rowHeight, maxHeight: rowHeight, overflow: 'hidden' }}
                            draggable={hasBlock && !!onMoveBlock && !outsideHours}
                            onDragStart={(e) => hasBlock && !outsideHours && handleDragStart(e, row.time, provider.id)}
                            onDragOver={(e) => !outsideHours && (isEmpty || sidebarDragging) && handleDragOver(e, row.time, provider.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => !outsideHours && (isEmpty || sidebarDragging) && handleDrop(e, row.time, provider.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <TimeSlotCell
                              blockLabel={slot?.blockLabel}
                              providerColor={slot?.blockLabel ? provider.color : undefined}
                              isBreak={slot?.isBreak || (isLunchTime && !slot?.blockLabel)}
                              isOutsideHours={outsideHours && !slot?.blockLabel && !slot?.isBreak}
                              onClick={
                                isInteractive && !outsideHours
                                  ? () => {
                                      if (hasBlock) {
                                        handleBlockCellClick(row.time, provider.id);
                                      } else if (isEmpty) {
                                        handleEmptyCellClick(row.time, provider.id);
                                      }
                                    }
                                  : undefined
                              }
                              isClickable={isInteractive && !outsideHours && (hasBlock || isEmpty)}
                              isBlockFirst={isFirstCell}
                              isBlockLast={blockInfo?.isLast || false}
                              isDragOver={isCellDragOver}
                              isDragging={isDraggingSource}
                              hasConflict={cellHasConflict}
                              conflictTooltip={conflictTooltip ?? dTimeConflictTooltip}
                              dTimeMin={isCompactRow ? 0 : cellDTimeMin}
                              aTimeMin={isCompactRow ? 0 : cellATimeMin}
                              hasDTimeConflict={hasDTimeConflict}
                              isHighProduction={isCompactRow ? false : isHighProduction}
                            />
                          </div>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
