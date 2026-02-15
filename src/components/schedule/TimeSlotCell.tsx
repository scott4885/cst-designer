"use client";

import { useState } from "react";

interface TimeSlotCellProps {
  time?: string;
  staffingCode?: string;
  blockLabel?: string;
  providerColor?: string;
  isBreak?: boolean;
  onClick?: () => void;
  isClickable?: boolean;
}

export default function TimeSlotCell({
  time,
  staffingCode,
  blockLabel,
  providerColor,
  isBreak = false,
  onClick,
  isClickable = false,
}: TimeSlotCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Time column cell
  if (time) {
    return (
      <div className="time-slot-cell bg-surface font-medium text-muted-foreground sticky left-0 z-10 text-xs px-2 py-1.5 whitespace-nowrap">
        {time}
      </div>
    );
  }

  // Empty or break cell
  if (isBreak || (!staffingCode && !blockLabel)) {
    return (
      <div
        className={`provider-cell px-2 py-1.5 min-h-[28px] ${
          isBreak
            ? "bg-muted/40"
            : "bg-background"
        } ${
          isClickable && !isBreak
            ? "cursor-pointer hover:bg-accent/10 transition-colors group/cell"
            : ""
        }`}
        onClick={!isBreak ? onClick : undefined}
      >
        {isBreak && <span className="text-muted-foreground text-[10px] font-medium">LUNCH</span>}
        {isClickable && !isBreak && (
          <span className="text-muted-foreground/40 text-xs transition-opacity opacity-0 group-hover/cell:opacity-100">+</span>
        )}
      </div>
    );
  }

  // Provider cell with data
  const cellStyle = providerColor
    ? {
        backgroundColor: providerColor + "30",
        borderLeft: `3px solid ${providerColor}`,
      }
    : {};

  return (
    <div
      className={`provider-cell relative group px-2 py-1.5 min-h-[28px] ${
        isClickable ? "cursor-pointer hover:brightness-110 transition-all" : ""
      }`}
      style={cellStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={blockLabel ? `${staffingCode || ""} ${blockLabel}` : ""}
    >
      {staffingCode && (
        <div className="text-[11px] font-semibold text-foreground/80">{staffingCode}</div>
      )}
      {blockLabel && (
        <div className="text-[11px] text-foreground/70 mt-0.5 leading-tight">{blockLabel}</div>
      )}

      {/* Hover tooltip */}
      {isHovered && blockLabel && (
        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded shadow-lg text-xs whitespace-nowrap pointer-events-none">
          <div className="font-semibold text-foreground">{blockLabel}</div>
          {staffingCode && <div className="text-muted-foreground">Code: {staffingCode}</div>}
          {isClickable && <div className="text-accent text-[10px]">Click to edit</div>}
        </div>
      )}
    </div>
  );
}
