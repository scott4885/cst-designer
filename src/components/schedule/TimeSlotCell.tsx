"use client";

import { useState } from "react";
import { CONFLICT_COLORS, hexToRgba } from "@/lib/engine/block-categories";

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
  /** When true, this slot falls outside the provider's scheduled work hours — renders with gray background */
  isOutsideHours?: boolean;
  // D/A time visual breakdown (for doctor columns)
  dTimeMin?: number;
  aTimeMin?: number;
  /** Has a D-time conflict (D-time overlapping with another doctor column) */
  hasDTimeConflict?: boolean;
  /** This block meets or exceeds the role-based High Production threshold */
  isHighProduction?: boolean;
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
  isOutsideHours = false,
  dTimeMin = 0,
  aTimeMin = 0,
  hasDTimeConflict = false,
  isHighProduction = false,
}: TimeSlotCellProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Shared keyboard activation handler — Space/Enter triggers the same onClick.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      onClick();
    }
  };

  // Time column cell
  if (time) {
    return (
      <div className="time-slot-cell bg-surface font-medium text-muted-foreground sticky left-0 z-10 text-[10px] px-1 py-0 whitespace-nowrap leading-none h-full flex items-center">
        {time}
      </div>
    );
  }

  // Outside provider work hours — gray, non-interactive
  if (isOutsideHours) {
    return (
      <div
        className="provider-cell px-1 py-0 h-full bg-muted/60 cursor-not-allowed"
        title="Outside provider's scheduled hours"
      />
    );
  }

  // Empty or break cell
  if (isBreak || (!staffingCode && !blockLabel)) {
    const isInteractiveEmpty = !!onClick && !isBreak && isClickable;
    return (
      <div
        className={`provider-cell px-1 py-0 h-full ${
          isBreak
            ? "bg-muted/40"
            : isDragOver
            ? "bg-accent/20 ring-2 ring-accent ring-inset"
            : "bg-background"
        } ${
          isClickable && !isBreak
            ? "cursor-pointer hover:bg-accent/10 transition-colors group/cell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            : ""
        }`}
        onClick={!isBreak ? onClick : undefined}
        onKeyDown={isInteractiveEmpty ? handleKeyDown : undefined}
        role={isInteractiveEmpty ? "button" : undefined}
        tabIndex={isInteractiveEmpty ? 0 : undefined}
        aria-label={
          isInteractiveEmpty
            ? "Empty slot, press Enter to add block"
            : isBreak
            ? "Lunch break"
            : undefined
        }
      >
        {isBreak && <span className="text-muted-foreground text-[10px] font-medium leading-none">LUNCH</span>}
        {isDragOver && !isBreak && (
          <span className="text-accent/70 text-[10px] font-medium select-none leading-none">Drop here</span>
        )}
        {isClickable && !isBreak && !isDragOver && (
          <span className="text-muted-foreground/40 text-xs transition-opacity opacity-0 group-hover/cell:opacity-100 leading-none">+</span>
        )}
      </div>
    );
  }

  // Staffing code cell - extremely narrow, single char
  if (staffingCode !== undefined && !blockLabel) {
    return (
      <div
        className={`flex items-center justify-center w-7 h-full px-0 py-0 ${
          isBreak ? "bg-muted/40" : ""
        }`}
        style={providerColor && !isBreak ? {
          backgroundColor: hexToRgba(providerColor, 0.125),
          borderLeft: `2px solid ${providerColor}`,
        } : {}}
      >
        {staffingCode && !isBreak && (
          <span className="text-[10px] font-bold text-foreground/80 leading-none">{staffingCode}</span>
        )}
        {isDrExam && !isBreak && (
          <span className="text-[8px] text-blue-600 leading-none">Dr</span>
        )}
      </div>
    );
  }

  // D/A time split visual
  const hasDASplit = isBlockFirst && dTimeMin > 0 && aTimeMin > 0;
  const totalDA = dTimeMin + aTimeMin;
  const dPct = hasDASplit ? Math.round((dTimeMin / totalDA) * 100) : 0;
  const aPct = hasDASplit ? 100 - dPct : 0;

  // Effective conflict: regular conflict OR D-time conflict
  const effectiveConflict = hasConflict || hasDTimeConflict;
  const conflictColor = hasDTimeConflict && !hasConflict ? CONFLICT_COLORS.DTIME_OVERLAP : CONFLICT_COLORS.HARD;

  // Assisted Hygiene blocks get a distinct teal/cyan color overriding the provider color
  const isAssistedHyg = !!(blockLabel && (blockLabel.toUpperCase().includes('ASSISTED HYG') || blockLabel.toUpperCase().includes('ASSISTED HYGIENE')));
  const effectiveProviderColor = isAssistedHyg ? '#8b5cf6' : providerColor;

  // Outside provider work hours — gray, non-interactive (compact)
  // (duplicated here intentionally for flow control)

  // Provider cell with data — clean continuous fills, thin left accent only.
  // First/last cell of a block gets a subtle top/bottom border so adjacent blocks
  // (e.g., Crown Prep then MP) don't visually merge. Right border applied to every
  // cell to close the rectangle on the trailing edge.
  const edgeColor = effectiveProviderColor
    ? hexToRgba(effectiveProviderColor, 0.55)
    : effectiveConflict
    ? conflictColor
    : undefined;
  const cellStyle = effectiveProviderColor
    ? {
        backgroundColor: effectiveConflict
          ? (hasDTimeConflict && !hasConflict ? hexToRgba(CONFLICT_COLORS.DTIME_OVERLAP, 0.10) : hexToRgba(CONFLICT_COLORS.HARD, 0.12))
          : hexToRgba(effectiveProviderColor, 0.1875),
        borderLeft: `3px solid ${effectiveConflict ? conflictColor : effectiveProviderColor}`,
        borderRight: `1px solid rgba(0,0,0,0.08)`,
        ...(isBlockFirst && edgeColor ? { borderTop: `1.5px solid ${edgeColor}` } : {}),
        ...(isBlockLast && edgeColor ? { borderBottom: `1.5px solid ${edgeColor}` } : {}),
      }
    : effectiveConflict
    ? {
        borderLeft: `3px solid ${conflictColor}`,
        backgroundColor: hasDTimeConflict ? hexToRgba(CONFLICT_COLORS.DTIME_OVERLAP, 0.08) : hexToRgba(CONFLICT_COLORS.HARD, 0.08),
        borderRight: `1px solid rgba(0,0,0,0.08)`,
        ...(isBlockFirst ? { borderTop: `1.5px solid ${conflictColor}` } : {}),
        ...(isBlockLast ? { borderBottom: `1.5px solid ${conflictColor}` } : {}),
      }
    : {};

  const isInteractiveBlock = !!onClick && isClickable;
  const blockAriaLabel = blockLabel
    ? `${staffingCode ? staffingCode + " " : ""}${blockLabel} block${
        effectiveConflict ? " — scheduling conflict" : ""
      }${isInteractiveBlock ? ", press Enter to edit" : ""}`
    : undefined;

  return (
    <div
      className={`provider-cell relative group px-1 py-0 h-full transition-all ${
        isClickable ? "cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1" : ""
      } ${
        isDragging
          ? "opacity-40 ring-2 ring-amber-400/60 ring-inset cursor-grabbing"
          : blockLabel
          ? "cursor-grab"
          : ""
      }`}
      style={cellStyle}
      onClick={onClick}
      onKeyDown={isInteractiveBlock ? handleKeyDown : undefined}
      role={isInteractiveBlock ? "button" : undefined}
      tabIndex={isInteractiveBlock ? 0 : undefined}
      aria-label={blockAriaLabel}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={effectiveConflict && conflictTooltip ? conflictTooltip : blockLabel ? `${staffingCode || ""} ${blockLabel}` : ""}
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
      {blockLabel && isBlockFirst && (
        <div
          className="text-[10px] text-foreground/70 leading-none truncate max-w-[140px] flex items-center gap-0.5"
          title={blockLabel}
        >
          {isAssistedHyg && isBlockFirst && (
            <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-bold leading-tight bg-violet-100 text-violet-700 border border-violet-300 shrink-0">
              AH
            </span>
          )}
          {isHighProduction && isBlockFirst && (
            <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-bold leading-tight bg-amber-100 text-amber-700 border border-amber-300 shrink-0" title="High Production">
              HP
            </span>
          )}
          {blockLabel}
        </div>
      )}

      {/* D/A time split bar — shown on first cell of a block when D and A times are both set */}
      {hasDASplit && (
        <div className="flex items-center gap-0.5 mt-1" title={`D-time: ${dTimeMin}min (hands-on) | A-time: ${aTimeMin}min (assistant)`}>
          <div
            className="h-1.5 rounded-sm"
            style={{ width: `${dPct}%`, backgroundColor: '#3b82f6', minWidth: 4 }}
            title={`D: ${dTimeMin}min`}
          />
          <div
            className="h-1.5 rounded-sm"
            style={{ width: `${aPct}%`, backgroundColor: '#10b981', minWidth: 4 }}
            title={`A: ${aTimeMin}min`}
          />
        </div>
      )}

      {/* D/A time label — small text badge on first cell */}
      {hasDASplit && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-bold leading-tight bg-blue-100 text-blue-700">
            D·{dTimeMin}m
          </span>
          <span className="inline-flex items-center px-1 py-0 rounded text-[8px] font-bold leading-tight bg-emerald-100 text-emerald-700">
            A·{aTimeMin}m
          </span>
        </div>
      )}

      {/* Conflict warning icons — decorative; conflict info is conveyed textually in tooltip + aria-label. */}
      {(hasConflict || hasDTimeConflict) && (
        <div className="absolute top-0.5 right-0.5 z-10 pointer-events-none flex gap-0.5" aria-hidden="true">
          {hasConflict && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill={CONFLICT_COLORS.HARD}>
              <title>Double-booking conflict</title>
              <path d="M8 1L1 14h14L8 1zm0 2.5l5.5 9.5H2.5L8 3.5zM7.25 7v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z" />
            </svg>
          )}
          {hasDTimeConflict && !hasConflict && (
            <svg width="12" height="12" viewBox="0 0 16 16" fill={CONFLICT_COLORS.DTIME_OVERLAP}>
              <title>D-time overlap</title>
              <path d="M8 1L1 14h14L8 1zm0 2.5l5.5 9.5H2.5L8 3.5zM7.25 7v3h1.5V7h-1.5zm0 4v1.5h1.5V11h-1.5z" />
            </svg>
          )}
        </div>
      )}

      {/* Drag handle dots — visible on hover (hidden when conflict icon shown) */}
      {blockLabel && !isDragging && !effectiveConflict && (
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
          ) : hasDTimeConflict && conflictTooltip ? (
            <>
              <div className="font-semibold text-orange-500">⚡ D-time overlap</div>
              <div className="text-muted-foreground max-w-[200px] whitespace-normal">{conflictTooltip}</div>
              {blockLabel && <div className="text-foreground mt-1 font-medium">{blockLabel}</div>}
            </>
          ) : blockLabel ? (
            <>
              <div className="font-semibold text-foreground">{blockLabel}</div>
              {staffingCode && <div className="text-muted-foreground">Code: {staffingCode}</div>}
              {hasDASplit && (
                <div className="flex gap-2 mt-1">
                  <span className="text-blue-600 font-medium">D·{dTimeMin}m</span>
                  <span className="text-emerald-600 font-medium">A·{aTimeMin}m</span>
                </div>
              )}
              {isClickable && <div className="text-accent text-[10px]">Click to edit • Drag to move</div>}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
