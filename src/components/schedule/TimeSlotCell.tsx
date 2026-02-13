"use client";

import { useState } from "react";

interface TimeSlotCellProps {
  time?: string;
  staffingCode?: string;
  blockLabel?: string;
  providerColor?: string;
  isBreak?: boolean;
  onClick?: () => void;
}

export default function TimeSlotCell({
  time,
  staffingCode,
  blockLabel,
  providerColor,
  isBreak = false,
  onClick,
}: TimeSlotCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Time column cell
  if (time) {
    return (
      <div className="time-slot-cell bg-surface font-medium text-muted-foreground sticky left-0 z-10">
        {time}
      </div>
    );
  }

  // Empty or break cell
  if (isBreak || (!staffingCode && !blockLabel)) {
    return (
      <div
        className={`provider-cell ${isBreak ? "bg-secondary/30" : "bg-surface/50"}`}
        onClick={onClick}
      >
        {isBreak && <span className="text-muted-foreground text-xs">LUNCH</span>}
      </div>
    );
  }

  // Provider cell with data
  const cellStyle = providerColor
    ? {
        backgroundColor: providerColor + "40", // Add alpha for transparency
        borderLeft: `3px solid ${providerColor}`,
      }
    : {};

  return (
    <div
      className="provider-cell relative group"
      style={cellStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={blockLabel ? `${staffingCode || ""} ${blockLabel}` : ""}
    >
      {staffingCode && (
        <div className="text-xs font-semibold text-foreground/80">{staffingCode}</div>
      )}
      {blockLabel && (
        <div className="text-xs text-foreground/70 mt-0.5">{blockLabel}</div>
      )}
      
      {/* Hover tooltip */}
      {isHovered && blockLabel && (
        <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded shadow-lg text-xs whitespace-nowrap">
          <div className="font-semibold">{blockLabel}</div>
          {staffingCode && <div className="text-muted-foreground">Code: {staffingCode}</div>}
        </div>
      )}
    </div>
  );
}
