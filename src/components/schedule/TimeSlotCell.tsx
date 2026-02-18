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
  isBlockFirst?: boolean;
  isBlockLast?: boolean;
  // Drag-and-drop visual feedback
  isDragOver?: boolean;
  isDragging?: boolean;
  // Conflict indicators
  hasConflict?: boolean;
  conflictTooltip?: string;
  // Dr. Exam indicator (hygienist column with doctor staffing code)
  isDrExam?: boolean;
}

export default function TimeSlotCell({
  time,
  staffingCode,
  blockLabel,
  providerColor,
  isBreak = false,
  onClick,
  isClickable = false,
  isBlockFirst = false,
  isBlockLast = false,
  isDragOver = false,
  isDragging = false,
  hasConflict = false,
  conflictTooltip,
  isDrExam = false,
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
            : isDragOver
            ? "bg-accent/20 ring-2 ring-accent ring-inset"
            : "bg-background"
        } ${
          isClickable && !isBreak
            ? "cursor-pointer hover:bg-accent/10 transition-colors group/cell"
            : ""
        }`}
        onClick={!isBreak ? onClick : undefined}
      >
        {isBreak && <span className="text-muted-foreground text-[10px] font-medium">LUNCH</span>}
        {isDragOver && !isBreak && (
          <span className="text-accent/70 text-[10px] font-medium select-none">Drop here</span>
        )}
        {isClickable && !isBreak && !isDragOver && (
          <span className="text-muted-foreground/40 text-xs transition-opacity opacity-0 group-hover/cell:opacity-100">+</span>
        )}
      </div>
    );
  }

  // Staffing code cell - extremely narrow, single char
  if (staffingCode !== undefined && !blockLabel) {
    return (
      <div
        className={`flex items-center justify-center w-7 min-h-[28px] px-0 py-1.5 ${
          isBreak ? "bg-muted/40" : ""
        }`}
        style={providerColor && !isBreak ? {
          backgroundColor: providerColor + "20",
          borderLeft: `2px solid ${providerColor}`,
        } : {}}
      >
        {staffingCode && !isBreak && (
          <span className="text-[10px] font-bold text-foreground/80">{staffingCode}</span>
        )}
        {isDrExam && !isBreak && (
          <span className="text-[8px] text-blue-600">Dr</span>
        )}
      </div>
    );
  }

  // Provider cell with data
  const cellStyle = providerColor
    ? {
        backgroundColor: hasConflict ? "rgba(239,68,68,0.12)" : providerColor + "30",
        borderLeft: hasConflict ? "3px solid #ef4444" : `3px solid ${providerColor}`,
        borderRight: hasConflict ? "2px solid #ef4444" : `2px solid ${providerColor}`,
        ...(isBlockFirst && {
          borderTop: hasConflict ? "2px solid #ef4444" : `2px solid ${providerColor}`,
          borderTopLeftRadius: '4px',
          borderTopRightRadius: '4px',
        }),
        ...(isBlockLast && {
          borderBottom: hasConflict ? "2px solid #ef4444" : `2px solid ${providerColor}`,
          borderBottomLeftRadius: '4px',
          borderBottomRightRadius: '4px',
        }),
      }
    : hasConflict
    ? { borderLeft: "3px solid #ef4444", backgroundColor: "rgba(239,68,68,0.08)" }
    : {};

  return (
    <div
      className={`provider-cell relative group px-2 py-1.5 min-h-[28px] transition-all ${
        isClickable ? "cursor-pointer hover:brightness-110" : ""
      } ${
        isDragging
          ? "opacity-40 ring-2 ring-amber-400/60 ring-inset cursor-grabbing"
          : blockLabel
          ? "cursor-grab"
          : ""
      }`}
      style={cellStyle}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={hasConflict && conflictTooltip ? conflictTooltip : blockLabel ? `${staffingCode || ""} ${blockLabel}` : ""}
    >
      {staffingCode && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-foreground/80">{staffingCode}</span>
          {isDrExam && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-300 leading-none">
              🦷 Dr. Exam
            </span>
          )}
        </div>
      )}
      {blockLabel && (
        <div
          className="text-[11px] text-foreground/70 mt-0.5 leading-tight truncate max-w-[140px]"
          title={blockLabel}
        >
          {blockLabel}
        </div>
      )}

      {/* Conflict warning icon */}
      {hasConflict && (
        <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none" aria-label="conflict">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="#ef4444">
            <path d="M8 1L1 14h14L8 1zm0 2.5l5.5 9.5H2.5L8 3.5zM7.25 7v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z" />
          </svg>
        </div>
      )}

      {/* Drag handle dots — visible on hover (hidden when conflict icon shown) */}
      {blockLabel && !isDragging && !hasConflict && (
        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-foreground">
            <circle cx="2" cy="2" r="1" />
            <circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="6" r="1" />
            <circle cx="6" cy="6" r="1" />
          </svg>
        </div>
      )}

      {/* Hover tooltip */}
      {isHovered && !isDragging && (
        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded shadow-lg text-xs whitespace-nowrap pointer-events-none">
          {hasConflict && conflictTooltip ? (
            <>
              <div className="font-semibold text-red-500">⚠ Double-booking conflict</div>
              <div className="text-muted-foreground max-w-[200px] whitespace-normal">{conflictTooltip}</div>
              {blockLabel && <div className="text-foreground mt-1 font-medium">{blockLabel}</div>}
            </>
          ) : blockLabel ? (
            <>
              <div className="font-semibold text-foreground">{blockLabel}</div>
              {staffingCode && <div className="text-muted-foreground">Code: {staffingCode}</div>}
              {isClickable && <div className="text-accent text-[10px]">Click to edit • Drag to move</div>}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
