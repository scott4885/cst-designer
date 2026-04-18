"use client";

/**
 * BlockPalette — Persistent drag-source sidebar panel for block types.
 *
 * Block type cards are draggable via HTML5 DnD API (compatible with ScheduleGrid's
 * existing drop zones). Each card embeds the full BlockTypeInput as JSON in the
 * 'application/block-type' data-transfer slot so ScheduleGrid can reconstruct it.
 *
 * @dnd-kit/core is installed for the DragOverlay ghost renderer; the actual
 * drag source uses HTML5 draggable so existing test infrastructure (which fires
 * HTML5 DnD events) continues to work without modification.
 */

import { GripVertical } from "lucide-react";
import type { BlockTypeInput } from "@/lib/engine/types";

/** Key written into dataTransfer to identify sidebar drops. */
export const BLOCK_TYPE_DRAG_KEY = "application/block-type";

interface BlockPaletteProps {
  blockTypes: BlockTypeInput[];
  providerRole?: "DOCTOR" | "HYGIENIST";
  onSelect?: (bt: BlockTypeInput) => void;
}

export default function BlockPalette({
  blockTypes,
  providerRole,
  onSelect,
}: BlockPaletteProps) {
  const applicable = blockTypes.filter((bt) => {
    if (providerRole === "DOCTOR" && bt.isHygieneType) return false;
    if (!providerRole) return true;
    return (
      bt.appliesToRole === providerRole ||
      bt.appliesToRole === "BOTH" ||
      bt.appliesToRole?.toUpperCase() === providerRole
    );
  });

  if (applicable.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-2">
        Block Palette — drag onto grid
      </p>
      {applicable.map((bt) => {
        const color = bt.color;
        return (
          <div
            key={bt.id}
            draggable
            data-testid={`palette-block-${bt.id}`}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              // Embed full block type JSON so ScheduleGrid can call onAddBlock
              e.dataTransfer.setData(BLOCK_TYPE_DRAG_KEY, JSON.stringify(bt));
              // text/plain marks this as a sidebar drag (not a grid block move)
              e.dataTransfer.setData("text/plain", "sidebar-block");
            }}
            onClick={() => onSelect?.(bt)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border cursor-grab active:cursor-grabbing hover:bg-accent/10 transition-colors group select-none"
            title={`Drag "${bt.label}" onto an empty time slot`}
          >
            <GripVertical className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            {color && (
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-foreground truncate">{bt.label}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {bt.minimumAmount ? (
                    <span className="text-[10px] text-success font-medium">${bt.minimumAmount}</span>
                  ) : null}
                  <span className="text-[9px] bg-secondary text-muted-foreground px-1 py-0.5 rounded">
                    {bt.durationMin}m
                  </span>
                </div>
              </div>
              {bt.description && (
                <p className="text-[10px] text-muted-foreground truncate">{bt.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
