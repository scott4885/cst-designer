"use client";

/**
 * TimeSlotInteraction
 * ───────────────────
 * Extracted from ScheduleGrid. Owns all cell-level interaction state and
 * returns the handlers + modal JSX that the grid renderer consumes.
 *
 * State owned here:
 *   - pickerOpen / pickerPosition — click-to-add on empty cells
 *   - editorOpen / editorPosition — click-to-edit on occupied cells
 *   - dragState — active block-move drag origin
 *   - dragOverCell — currently-hovered drop target
 *   - sidebarDragging — flag for BlockPalette drag-in-progress
 *
 * Not owned here:
 *   - Zoom / column width (lives in ScheduleGrid — chrome state)
 *   - Conflict derivation (lives in ConflictOverlay hook)
 *   - Pure rendering (lives in TimeGridRenderer)
 *
 * The hook returns:
 *   - modals: JSX for BlockPicker + BlockEditor (rendered by ScheduleGrid)
 *   - handlers: callbacks for empty-cell click, block-cell click, and drag
 *   - drag flags: dragState, dragOverCell, sidebarDragging (renderer reads
 *     these to decorate cells)
 *   - getBlockInfo: lookup helper used by both renderer and interaction
 */

import { useCallback, useMemo, useState } from "react";
import BlockPicker from "./BlockPicker";
import BlockEditor from "./BlockEditor";
import { BLOCK_TYPE_DRAG_KEY } from "./BlockPalette";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ProviderInput, TimeSlotOutput } from "./TimeGridRenderer";

// Drag origin state
export interface DragState {
  time: string;
  providerId: string;
  blockTypeId: string;
  blockLabel: string;
}

export interface DragOverCell {
  time: string;
  providerId: string;
}

export interface BlockInfo {
  blockTypeId: string;
  blockLabel: string;
  blockInstanceId: string | null;
  customProductionAmount: number | null;
  slotCount: number;
  isFirst: boolean;
  isLast: boolean;
  startTime: string;
}

export interface UseTimeSlotInteractionArgs {
  slots: TimeSlotOutput[];
  timeSlots: TimeSlotOutput[];
  providers: ProviderInput[];
  effectiveBlockTypes: BlockTypeInput[];
  timeIncrement: number;
  onAddBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => void;
  onRemoveBlock?: (time: string, providerId: string) => void;
  onMoveBlock?: (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => void;
  onUpdateBlock?: (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => void;
}

export interface UseTimeSlotInteractionReturn {
  // Modals to render
  modals: React.ReactNode;
  // Block info lookup (also used by renderer for block span/first/last decoration)
  getBlockInfo: (time: string, providerId: string) => BlockInfo | null;
  // Click handlers
  handleEmptyCellClick: (time: string, providerId: string) => void;
  handleBlockCellClick: (time: string, providerId: string) => void;
  // Drag handlers
  handleDragStart: (e: React.DragEvent, time: string, providerId: string) => void;
  handleDragOver: (e: React.DragEvent, time: string, providerId: string) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, time: string, providerId: string) => void;
  handleDragEnd: () => void;
  // Drag state (exposed for renderer decoration)
  dragState: DragState | null;
  dragOverCell: DragOverCell | null;
  sidebarDragging: boolean;
  // Whether any interaction prop was passed (disables cursor/click when false)
  isInteractive: boolean;
}

export function useTimeSlotInteraction(
  args: UseTimeSlotInteractionArgs
): UseTimeSlotInteractionReturn {
  const {
    slots,
    timeSlots,
    providers,
    effectiveBlockTypes,
    timeIncrement,
    onAddBlock,
    onRemoveBlock,
    onMoveBlock,
    onUpdateBlock,
  } = args;

  // ─── Block picker state (click-to-add) ──────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ time: string; providerId: string } | null>(null);

  // ─── Block editor state (click-to-edit) ─────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPosition, setEditorPosition] = useState<{
    time: string;
    providerId: string;
    blockTypeId: string;
    blockLabel: string;
    slotCount: number;
    customProductionAmount: number | null;
  } | null>(null);

  // ─── Drag state ─────────────────────────────────────────────────────────
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverCell, setDragOverCell] = useState<DragOverCell | null>(null);
  const [sidebarDragging, setSidebarDragging] = useState(false);

  // Precompute per-provider slot rows once per `timeSlots` reference change.
  // Prior implementation rebuilt this array on every `getBlockInfo` call —
  // O(rows × providers) per cell render. Now O(rows × providers) once per
  // timeSlots reference, O(1) per lookup via Map.
  type ProviderSlotRow = {
    time: string;
    blockTypeId?: string;
    blockLabel?: string;
    blockInstanceId?: string | null;
    customProductionAmount?: number | null;
    isBreak?: boolean;
  };

  const providerSlotIndex = useMemo(() => {
    const index = new Map<string, ProviderSlotRow[]>();
    for (const row of timeSlots) {
      for (const slot of row.slots) {
        let bucket = index.get(slot.providerId);
        if (!bucket) {
          bucket = [];
          index.set(slot.providerId, bucket);
        }
        bucket.push({ time: row.time, ...slot });
      }
    }
    return index;
  }, [timeSlots]);

  // Resolve the block a slot belongs to + its span.
  const getBlockInfo = useCallback(
    (time: string, providerId: string): BlockInfo | null => {
      if (slots.length === 0) return null;

      const providerSlotData = providerSlotIndex.get(providerId);
      if (!providerSlotData || providerSlotData.length === 0) return null;

      const idx = providerSlotData.findIndex((s) => s.time === time);
      if (idx === -1) return null;

      const slot = providerSlotData[idx];
      if (!slot.blockTypeId) return null;

      // Match by blockInstanceId when available (Issue 5 fix — avoids merging
      // adjacent same-type instances); fall back to blockTypeId for legacy.
      const isSameBlock = (i: number) => {
        const s = providerSlotData[i];
        if (slot.blockInstanceId && s.blockInstanceId) {
          return s.blockInstanceId === slot.blockInstanceId;
        }
        return s.blockTypeId === slot.blockTypeId;
      };

      let start = idx;
      while (start > 0 && isSameBlock(start - 1)) start--;
      let end = idx;
      while (end < providerSlotData.length - 1 && isSameBlock(end + 1)) end++;

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
    [providerSlotIndex, slots.length]
  );

  // ─── Click handlers ─────────────────────────────────────────────────────
  const handleEmptyCellClick = useCallback(
    (time: string, providerId: string) => {
      if (!onAddBlock) return;
      setPickerPosition({ time, providerId });
      setPickerOpen(true);
      setEditorOpen(false);
    },
    [onAddBlock]
  );

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

  const handleBlockUpdate = useCallback(
    (blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => {
      if (!editorPosition || !onUpdateBlock) return;
      onUpdateBlock(editorPosition.time, editorPosition.providerId, blockType, durationSlots, customProductionAmount);
      setEditorOpen(false);
      setEditorPosition(null);
    },
    [editorPosition, onUpdateBlock]
  );

  const handleBlockDelete = useCallback(() => {
    if (!editorPosition || !onRemoveBlock) return;
    onRemoveBlock(editorPosition.time, editorPosition.providerId);
    setEditorOpen(false);
    setEditorPosition(null);
  }, [editorPosition, onRemoveBlock]);

  // ─── Drag handlers ──────────────────────────────────────────────────────
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
      // Iter 12a fix: ALWAYS clear drag state and drag-over cell, regardless of
      // which return path is taken. Prior implementation leaked dragState when
      // the early-return branch (!dragState || !onMoveBlock) fired — leaving
      // stale drag visuals on the next interaction.
      try {
        // Sidebar drop: block type from BlockPalette/BlockPicker
        const blockTypeJson = e.dataTransfer.getData(BLOCK_TYPE_DRAG_KEY);
        if (blockTypeJson && onAddBlock) {
          try {
            const blockType: BlockTypeInput = JSON.parse(blockTypeJson);
            const durationSlots = Math.ceil(blockType.durationMin / timeIncrement);
            onAddBlock(time, providerId, blockType, durationSlots);
          } catch {
            // malformed JSON — ignore
          }
          return;
        }

        // Grid block move
        if (!dragState || !onMoveBlock) return;
        onMoveBlock(dragState.time, dragState.providerId, time, providerId);
      } finally {
        setDragState(null);
        setDragOverCell(null);
        setSidebarDragging(false);
      }
    },
    [dragState, onMoveBlock, onAddBlock, timeIncrement]
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverCell(null);
    setSidebarDragging(false);
  }, []);

  const getProviderRole = useCallback(
    (providerId: string) => {
      return providers.find((p) => p.id === providerId)?.role || "DOCTOR";
    },
    [providers]
  );

  const isInteractive = !!(onAddBlock || onRemoveBlock || onMoveBlock || onUpdateBlock);

  // Modal JSX — owned here so ScheduleGrid stays thin.
  const modals = (
    <>
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
    </>
  );

  return {
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
  };
}
