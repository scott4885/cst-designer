"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BlockTypeInput } from "@/lib/engine/types";
import { useBlockTypeStore } from "@/store/block-type-store";

interface BlockEditorProps {
  /** Office-specific block types. When undefined/empty, falls back to the global Appointment Library. */
  blockTypes?: BlockTypeInput[];
  providerRole: "DOCTOR" | "HYGIENIST";
  currentBlockTypeId: string;
  currentSlotCount: number;
  /** Current per-block production override (null = use block type default) */
  currentCustomProductionAmount?: number | null;
  timeIncrement: number;
  onUpdate: (blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function BlockEditor({
  blockTypes: propBlockTypes,
  providerRole,
  currentBlockTypeId,
  currentSlotCount,
  currentCustomProductionAmount,
  timeIncrement,
  onUpdate,
  onDelete,
  onClose,
}: BlockEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Fall back to global library when no office-specific block types are provided (Issue 1 fix)
  const libraryBlockTypes = useBlockTypeStore((s) => s.blockTypes);
  const blockTypes: BlockTypeInput[] = (propBlockTypes && propBlockTypes.length > 0)
    ? propBlockTypes
    : libraryBlockTypes;

  const [selectedBlockTypeId, setSelectedBlockTypeId] = useState(currentBlockTypeId);
  const [slotCount, setSlotCount] = useState(currentSlotCount);
  const [customAmount, setCustomAmount] = useState<string>(
    currentCustomProductionAmount != null
      ? String(currentCustomProductionAmount)
      : ""
  );

  const applicableBlocks = blockTypes.filter(
    (bt) => bt.appliesToRole === providerRole || bt.appliesToRole === "BOTH"
  );

  // If the current block type ID isn't in the applicable list, include it anyway
  // so the editor can display and apply it
  const currentBtInList = applicableBlocks.find((bt) => bt.id === selectedBlockTypeId);
  const allRelevantBlocks = currentBtInList
    ? applicableBlocks
    : [
        ...blockTypes.filter((bt) => bt.id === selectedBlockTypeId),
        ...applicableBlocks,
      ];

  const selectedBlock = blockTypes.find((bt) => bt.id === selectedBlockTypeId);
  const currentBlock = blockTypes.find((bt) => bt.id === currentBlockTypeId);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const resolvedAmount = customAmount !== "" ? Number(customAmount) : (selectedBlock?.minimumAmount ?? null);

  const handleApply = () => {
    const bt = blockTypes.find((b) => b.id === selectedBlockTypeId);
    if (!bt) return;

    const customProductionAmount = customAmount !== ""
      ? Number(customAmount)
      : (bt.minimumAmount ?? null);

    onUpdate(bt, slotCount, customProductionAmount);
  };

  // Determine if anything changed (for enabling Apply button)
  // Case 1: user typed a new non-empty value different from the stored (or default) amount
  const typedAmountChanged = customAmount !== "" && Number(customAmount) !== (currentCustomProductionAmount ?? selectedBlock?.minimumAmount ?? 0);
  // Case 2: user cleared the field to reset a custom amount back toward the default
  const clearedCustomAmount =
    customAmount === "" &&
    currentCustomProductionAmount != null &&
    currentCustomProductionAmount !== (selectedBlock?.minimumAmount ?? null);
  const amountChanged = typedAmountChanged || clearedCustomAmount;
  const hasChanges =
    selectedBlockTypeId !== currentBlockTypeId ||
    slotCount !== currentSlotCount ||
    amountChanged;

  const durationMinutes = slotCount * timeIncrement;

  return (
    <div
      ref={ref}
      className="bg-popover border border-border rounded-lg shadow-xl p-4 z-50 w-[calc(100vw-2rem)] max-w-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">
          Edit Block: {currentBlock?.label || "Unknown"}
        </h4>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-h-[44px] min-w-[44px]" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Block type selector */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Block Type</label>
          <select
            className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-foreground"
            value={selectedBlockTypeId}
            onChange={(e) => {
              setSelectedBlockTypeId(e.target.value);
              const bt = blockTypes.find((b) => b.id === e.target.value);
              if (bt) {
                setSlotCount(Math.ceil(bt.durationMin / timeIncrement));
                // Reset custom amount to the new block type's default
                setCustomAmount("");
              }
            }}
          >
            {allRelevantBlocks.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.label}
                {bt.minimumAmount ? ` (>$${bt.minimumAmount})` : ""}
                {" - "}
                {bt.durationMin}min
              </option>
            ))}
          </select>
        </div>

        {/* Duration slider */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">
            Duration: {durationMinutes} min ({slotCount} slots)
          </label>
          <input
            type="range"
            min={1}
            max={Math.max(slotCount + 4, 12)}
            value={slotCount}
            onChange={(e) => setSlotCount(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{timeIncrement}min</span>
            <span>{Math.max(slotCount + 4, 12) * timeIncrement}min</span>
          </div>
        </div>

        {/* D/A Time breakdown — informational display */}
        {selectedBlock && ((selectedBlock.dTimeMin ?? 0) > 0 || (selectedBlock.aTimeMin ?? 0) > 0) && (
          <div className="rounded-md bg-muted/40 border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1">
              <span>D/A Time Split</span>
              <span className="text-[9px] text-muted-foreground/60 ml-1">(doctor/assistant time)</span>
            </div>
            <div className="flex items-center gap-2">
              {(selectedBlock.dTimeMin ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <span>D</span>
                  <span>{selectedBlock.dTimeMin}min</span>
                </span>
              )}
              {(selectedBlock.aTimeMin ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span>A</span>
                  <span>{selectedBlock.aTimeMin}min</span>
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                = {(selectedBlock.dTimeMin ?? 0) + (selectedBlock.aTimeMin ?? 0)}min hands-on+assist
              </span>
            </div>
            {(selectedBlock.dTimeMin ?? 0) > 0 && (selectedBlock.aTimeMin ?? 0) > 0 && (
              <div className="mt-1.5 h-2 flex rounded-sm overflow-hidden">
                <div
                  className="bg-blue-500"
                  style={{ width: `${Math.round(((selectedBlock.dTimeMin ?? 0) / ((selectedBlock.dTimeMin ?? 0) + (selectedBlock.aTimeMin ?? 0))) * 100)}%` }}
                  title={`D-time: ${selectedBlock.dTimeMin}min`}
                />
                <div
                  className="bg-emerald-500"
                  style={{ width: `${Math.round(((selectedBlock.aTimeMin ?? 0) / ((selectedBlock.dTimeMin ?? 0) + (selectedBlock.aTimeMin ?? 0))) * 100)}%` }}
                  title={`A-time: ${selectedBlock.aTimeMin}min`}
                />
              </div>
            )}
            <p className="text-[9px] text-muted-foreground mt-1 leading-tight">
              D = Doctor hands-on time. A = Assistant-managed time (doctor can be in another chair).
            </p>
          </div>
        )}

        {/* Production minimum — editable per-block override (Issue 6) */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">
            Production Minimum ($)
            <span className="ml-1 text-[10px] text-accent">(per-block override)</span>
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder={String(selectedBlock?.minimumAmount ?? 0)}
              className="h-8 text-sm"
            />
            {customAmount !== "" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => setCustomAmount("")}
                title="Reset to default"
              >
                Reset
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Library default: ${selectedBlock?.minimumAmount?.toLocaleString() ?? 0}
            {customAmount !== "" && Number(customAmount) !== (selectedBlock?.minimumAmount ?? 0) && (
              <span className="ml-1 text-accent font-medium">→ custom: ${Number(customAmount).toLocaleString()}</span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!hasChanges}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
