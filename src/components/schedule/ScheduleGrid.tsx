"use client";

import { useState, useCallback, useMemo, Fragment } from "react";
import TimeSlotCell from "./TimeSlotCell";
import BlockPicker from "./BlockPicker";
import BlockEditor from "./BlockEditor";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";

export interface ProviderInput {
  id: string;
  name: string;
  role: string;
  color: string;
  operatories?: string[];
  /** "07:00" 24-hour format — used to gray out slots outside this provider's shift */
  workingStart?: string;
  workingEnd?: string;
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
  onAddBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => void;
  onRemoveBlock?: (time: string, providerId: string) => void;
  onMoveBlock?: (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => void;
  onUpdateBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => void;
}

// Drag state
interface DragState {
  time: string;
  providerId: string;
  blockTypeId: string;
  blockLabel: string;
}

export default function ScheduleGrid({
  slots,
  providers,
  blockTypes,
  timeIncrement = 10,
  conflicts = [],
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlock,
}: ScheduleGridProps) {
  // blockTypes may be undefined (fall back to global library in BlockPicker/BlockEditor)
  // or an explicit array of office-specific types
  const effectiveBlockTypes = blockTypes ?? [];

  // Block picker state (click-to-add)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ time: string; providerId: string } | null>(null);

  // Block editor state (click-to-edit)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPosition, setEditorPosition] = useState<{
    time: string;
    providerId: string;
    blockTypeId: string;
    blockLabel: string;
    slotCount: number;
    customProductionAmount: number | null;
  } | null>(null);

  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ time: string; providerId: string } | null>(null);

  // Build conflict lookup: "time:providerId" → ConflictResult
  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictResult>();
    for (const c of conflicts) {
      map.set(`${c.time}:${c.providerId}`, c);
    }
    return map;
  }, [conflicts]);

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
      // Allow opening the picker even when no office-specific blockTypes are set;
      // BlockPicker will fall back to the global Appointment Library.
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
      if (!dragState) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverCell({ time, providerId });
    },
    [dragState]
  );

  const handleDragLeave = useCallback(() => {
    setDragOverCell(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, time: string, providerId: string) => {
      e.preventDefault();
      if (!dragState || !onMoveBlock) return;

      onMoveBlock(dragState.time, dragState.providerId, time, providerId);
      setDragState(null);
      setDragOverCell(null);
    },
    [dragState, onMoveBlock]
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverCell(null);
  }, []);

  // Determine the provider role for filtering block types in the picker
  const getProviderRole = useCallback(
    (providerId: string) => {
      return providers.find((p) => p.id === providerId)?.role || "DOCTOR";
    },
    [providers]
  );

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

  return (
    <div className="space-y-4">
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

      <div className="schedule-grid border border-border rounded-lg overflow-hidden max-h-[700px] overflow-y-auto">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface z-20">
              {/* Row 1: Operatory name header */}
              <tr className="border-b border-border/50">
                <th className="px-2 py-1 text-[10px] font-medium text-muted-foreground bg-surface w-20 text-left">
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
                      style={{ borderBottom: '2px solid var(--border)' }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border"
                          style={{ backgroundColor: provider.color + '20', borderColor: provider.color + '60', color: provider.color }}>
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
                <th className="px-3 py-2 text-sm font-semibold text-foreground border-b-2 border-border bg-surface w-20">
                  Time
                </th>
                {providers.map((provider) => (
                  <th
                    key={provider.id}
                    colSpan={2}
                    className="px-3 py-2 text-sm font-semibold text-foreground border-b-2 border-border bg-surface"
                  >
                    <div className="text-center">
                      <div className="font-semibold text-xs"
                        style={{ color: provider.color }}>
                        {provider.name}
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
              {/* Row 3: Staffing / Block type sub-headers */}
              <tr>
                <th className="border-b border-border bg-surface"></th>
                {providers.map((provider) => (
                  <Fragment key={provider.id}>
                    <th className="px-1 py-1 text-[10px] text-muted-foreground border-b border-border bg-surface w-7 text-center">
                      S
                    </th>
                    <th className="px-3 py-1 text-[10px] text-muted-foreground border-b border-border bg-surface min-w-[150px]">
                      Block Type
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/30 transition-colors">
                  <td className="p-0 border-b border-border">
                    <TimeSlotCell time={row.time} />
                  </td>
                  {providers.map((provider) => {
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

                    // Conflict detection
                    const conflictEntry = conflictMap.get(`${row.time}:${provider.id}`);
                    const cellHasConflict = !!conflictEntry;
                    const conflictTooltip = conflictEntry
                      ? `Double-booked in: ${conflictEntry.operatories.join(', ')} — blocks: ${conflictEntry.blockLabels.join(', ')}`
                      : undefined;

                    return (
                      <Fragment key={provider.id}>
                        <td className="p-0 border-b border-border">
                          <TimeSlotCell
                            staffingCode={slot?.staffingCode}
                            providerColor={slot?.staffingCode ? provider.color : undefined}
                            isBreak={slot?.isBreak || (isLunchTime && !slot?.staffingCode)}
                            isDrExam={slot?.staffingCode === 'D' && provider.role === 'HYGIENIST'}
                          />
                        </td>
                        <td className="p-0 border-b border-border">
                          <div
                            data-testid={`block-cell-${row.time}-${provider.id}`}
                            draggable={hasBlock && !!onMoveBlock && !outsideHours}
                            onDragStart={(e) => hasBlock && !outsideHours && handleDragStart(e, row.time, provider.id)}
                            onDragOver={(e) => isEmpty && !outsideHours && handleDragOver(e, row.time, provider.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isEmpty && !outsideHours && handleDrop(e, row.time, provider.id)}
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
                              isBlockFirst={blockInfo?.isFirst || false}
                              isBlockLast={blockInfo?.isLast || false}
                              isDragOver={isCellDragOver}
                              isDragging={isDraggingSource}
                              hasConflict={cellHasConflict}
                              conflictTooltip={conflictTooltip}
                            />
                          </div>
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
    </div>
  );
}
