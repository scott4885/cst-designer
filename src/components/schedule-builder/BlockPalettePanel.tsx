"use client";

import { GripVertical } from "lucide-react";
import type { BlockTypeInput } from "@/lib/engine/types";
import { BLOCK_TYPE_DRAG_KEY } from "@/components/schedule/BlockPalette";
import { getBlockCategoryColors } from "@/lib/engine/block-categories";

interface BlockGroup {
  label: string;
  blocks: BlockTypeInput[];
}

function groupBlocks(blockTypes: BlockTypeInput[]): BlockGroup[] {
  const production: BlockTypeInput[] = [];
  const clinical: BlockTypeInput[] = [];
  const hygiene: BlockTypeInput[] = [];
  const admin: BlockTypeInput[] = [];

  for (const bt of blockTypes) {
    const label = bt.label.toLowerCase();
    if (label === "hp" || label === "mp" || label.includes("high") || label.includes("medium")) {
      production.push(bt);
    } else if (label === "np" || label === "er" || label.includes("new") || label.includes("emergency")) {
      clinical.push(bt);
    } else if (bt.isHygieneType || bt.appliesToRole === "HYGIENIST" || label.includes("srp") || label.includes("recare") || label.includes("rec") || label.includes("pm")) {
      hygiene.push(bt);
    } else {
      admin.push(bt);
    }
  }

  const groups: BlockGroup[] = [];
  if (production.length > 0) groups.push({ label: "Production", blocks: production });
  if (clinical.length > 0) groups.push({ label: "Clinical", blocks: clinical });
  if (hygiene.length > 0) groups.push({ label: "Hygiene", blocks: hygiene });
  if (admin.length > 0) groups.push({ label: "Admin / Other", blocks: admin });
  return groups;
}

interface BlockPalettePanelProps {
  blockTypes: BlockTypeInput[];
}

export default function BlockPalettePanel({ blockTypes }: BlockPalettePanelProps) {
  const groups = groupBlocks(blockTypes);

  if (blockTypes.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-slate-400">No block types configured.</p>
        <p className="text-[11px] text-slate-300 mt-1">Edit the office to add appointment types.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
        Drag blocks onto the grid
      </p>

      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.blocks.map((bt) => {
              const colors = getBlockCategoryColors(bt.label);
              return (
                <div
                  key={bt.id}
                  draggable
                  data-testid={`palette-block-${bt.id}`}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(BLOCK_TYPE_DRAG_KEY, JSON.stringify(bt));
                    e.dataTransfer.setData("text/plain", "sidebar-block");
                  }}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-grab active:cursor-grabbing
                    hover:shadow-sm transition-all duration-150 select-none group border border-transparent hover:border-border/40"
                  style={{
                    backgroundColor: colors.bg,
                    borderLeft: `3px solid ${colors.border}`,
                  }}
                  title={`Drag "${bt.label}" onto an empty time slot`}
                >
                  <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        {bt.label}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {bt.minimumAmount ? (
                          <span className="text-[10px] text-emerald-600 font-medium">
                            ${bt.minimumAmount}
                          </span>
                        ) : null}
                        <span className="text-[9px] bg-white/80 text-slate-400 px-1.5 py-0.5 rounded-full font-medium">
                          {bt.durationMin}m
                        </span>
                      </div>
                    </div>
                    {bt.description && (
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {bt.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
