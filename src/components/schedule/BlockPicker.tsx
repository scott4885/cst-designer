"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockTypeInput } from "@/lib/engine/types";
import { useBlockTypeStore } from "@/store/block-type-store";
import { BLOCK_TYPE_DRAG_KEY } from "./BlockPalette";

interface BlockPickerProps {
  /** If omitted, falls back to the global Appointment Type Library */
  blockTypes?: BlockTypeInput[];
  providerRole: "DOCTOR" | "HYGIENIST";
  onSelect: (blockType: BlockTypeInput) => void;
  onClose: () => void;
  timeLabel: string;
}

export default function BlockPicker({
  blockTypes: propBlockTypes,
  providerRole,
  onSelect,
  onClose,
  timeLabel,
}: BlockPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const libraryBlockTypes = useBlockTypeStore((s) => s.blockTypes);
  const initFromStorage = useBlockTypeStore((s) => s.initFromStorage);

  // Ensure the global library is hydrated from localStorage so the picker
  // always shows the same block types as the Appointment Library page.
  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  // Use prop block types when provided; fall back to global library when prop is null/undefined
  // Note: if propBlockTypes is an explicit empty array [], we don't fall back (no blocks = null render)
  const blockTypes = propBlockTypes ?? libraryBlockTypes;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Close on Escape
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

  // Filter block types by provider role - include ALL matching blocks
  // Hygiene-typed blocks (SRP, PM, Prophy) are never shown for Doctor columns
  const applicableBlocks = blockTypes.filter((bt) => {
    if (providerRole === "DOCTOR" && bt.isHygieneType) return false;
    return (
      bt.appliesToRole === providerRole ||
      bt.appliesToRole === "BOTH" ||
      bt.appliesToRole?.toUpperCase() === providerRole
    );
  });

  if (applicableBlocks.length === 0) {
    return null;
  }

  return (
    <div
      ref={ref}
      className="bg-popover border border-border rounded-lg shadow-xl p-3 z-50 w-[calc(100vw-2rem)] max-w-xs"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-foreground">
          Add Block at {timeLabel}
        </h4>
        <Button variant="ghost" size="icon" className="h-8 w-8 min-h-[44px] min-w-[44px]" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {applicableBlocks.map((bt) => (
          <button
            key={bt.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(BLOCK_TYPE_DRAG_KEY, JSON.stringify(bt));
              e.dataTransfer.setData("text/plain", "sidebar-block");
            }}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/20 transition-colors text-sm group border border-transparent hover:border-border cursor-grab active:cursor-grabbing"
            onClick={() => onSelect(bt)}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                {"color" in bt && (bt as any).color ? (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: (bt as any).color }}
                  />
                ) : null}
                {bt.label}
              </span>
              <span className="flex items-center gap-1.5">
                {bt.minimumAmount ? (
                  <span className="text-xs font-medium text-success">${bt.minimumAmount}</span>
                ) : null}
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                  {bt.durationMin}min
                </span>
              </span>
            </div>
            {bt.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{bt.description}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
