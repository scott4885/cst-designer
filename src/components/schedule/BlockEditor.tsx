"use client";

import { useState, useEffect, useRef } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockTypeInput } from "@/lib/engine/types";

interface BlockEditorProps {
  blockTypes: BlockTypeInput[];
  providerRole: "DOCTOR" | "HYGIENIST";
  currentBlockTypeId: string;
  currentSlotCount: number;
  timeIncrement: number;
  onUpdate: (blockType: BlockTypeInput, durationSlots: number) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function BlockEditor({
  blockTypes,
  providerRole,
  currentBlockTypeId,
  currentSlotCount,
  timeIncrement,
  onUpdate,
  onDelete,
  onClose,
}: BlockEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedBlockTypeId, setSelectedBlockTypeId] = useState(currentBlockTypeId);
  const [slotCount, setSlotCount] = useState(currentSlotCount);

  const applicableBlocks = blockTypes.filter(
    (bt) => bt.appliesToRole === providerRole || bt.appliesToRole === "BOTH"
  );

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

  const handleApply = () => {
    const bt = blockTypes.find((b) => b.id === selectedBlockTypeId);
    if (bt) {
      onUpdate(bt, slotCount);
    }
  };

  const durationMinutes = slotCount * timeIncrement;

  return (
    <div
      ref={ref}
      className="bg-popover border border-border rounded-lg shadow-xl p-4 z-50 max-w-sm"
    >
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">
          Edit Block: {currentBlock?.label || "Unknown"}
        </h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
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
              }
            }}
          >
            {applicableBlocks.map((bt) => (
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

        {/* Production minimum */}
        {selectedBlock?.minimumAmount ? (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">
              Production Minimum
            </label>
            <div className="text-sm font-semibold text-foreground">
              ${selectedBlock.minimumAmount.toLocaleString()}
            </div>
          </div>
        ) : null}

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
              disabled={selectedBlockTypeId === currentBlockTypeId && slotCount === currentSlotCount}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
