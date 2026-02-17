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
}

export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    blockTypeId?: string;
    isBreak?: boolean;
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
  onUpdateBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => void;
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
  blockTypes = [],
  timeIncrement = 10,
  conflicts = [],
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlock,
}: ScheduleGridProps) {

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
      const providerSlotData: { time: string; blockTypeId?: string; blockLabel?: string; isBreak?: boolean }[] = [];
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

      // Count contiguous slots with same blockTypeId
      let start = idx;
      while (start > 0 && providerSlotData[start - 1].blockTypeId === slot.blockTypeId) {
        start--;
      }
      let end = idx;
      while (end < providerSlotData.length - 1 && providerSlotData[end + 1].blockTypeId === slot.blockTypeId) {
        end++;
      }

      return {
        blockTypeId: slot.blockTypeId,
        blockLabel: slot.blockLabel || "",
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
      if (!onAddBlock || blockTypes.length === 0) return;
      setPickerPosition({ time, providerId });
      setPickerOpen(true);
      setEditorOpen(false);
    },
    [onAddBlock, blockTypes.length]
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
    (blockType: BlockTypeInput, durationSlots: number) => {
      if (!editorPosition || !onUpdateBlock) return;
      onUpdateBlock(editorPosition.time, editorPosition.providerId, blockType, durationSlots);
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
      {/* Block Picker (click-to-add) */}
      {pickerOpen && pickerPosition && (
        <BlockPicker
          blockTypes={blockTypes}
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
          blockTypes={blockTypes}
          providerRole={getProviderRole(editorPosition.providerId) as "DOCTOR" | "HYGIENIST"}
          currentBlockTypeId={editorPosition.blockTypeId}
          currentSlotCount={editorPosition.slotCount}
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
                      {provider.operatories && provider.operatories.length > 0 && (
                        <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                          {provider.operatories.join(', ')}
                        </div>
                      )}
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
                            draggable={hasBlock && !!onMoveBlock}
                            onDragStart={(e) => hasBlock && handleDragStart(e, row.time, provider.id)}
                            onDragOver={(e) => isEmpty && handleDragOver(e, row.time, provider.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isEmpty && handleDrop(e, row.time, provider.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <TimeSlotCell
                              blockLabel={slot?.blockLabel}
                              providerColor={slot?.blockLabel ? provider.color : undefined}
                              isBreak={slot?.isBreak || (isLunchTime && !slot?.blockLabel)}
                              onClick={
                                isInteractive
                                  ? () => {
                                      if (hasBlock) {
                                        handleBlockCellClick(row.time, provider.id);
                                      } else if (isEmpty) {
                                        handleEmptyCellClick(row.time, provider.id);
                                      }
                                    }
                                  : undefined
                              }
                              isClickable={isInteractive && (hasBlock || isEmpty)}
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
