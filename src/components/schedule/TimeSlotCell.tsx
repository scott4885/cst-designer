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
  /**
   * Loop 10: validity tier for the would-be target range during a drag.
   *   'valid'    — green paint (drop will commit cleanly)
   *   'warning'  — amber paint (drop commits but with a soft conflict)
   *   'conflict' — red paint (drop is blocked)
   *
   * Applied to every cell in the target range (not just the hovered cell), so
   * the user sees the full footprint of the incoming block.
   */
  dragValidity?: "valid" | "warning" | "conflict" | null;
  /**
   * Loop 10: when true, briefly flash this cell with an outline animation
   * (1s) so "Jump to cell" from the Review panel draws the eye.
   */
  flashPulse?: boolean;
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
  /** Loop 5: one-line rationale explaining why the engine placed this block. */
  rationale?: string | null;
  /**
   * Loop 6: multi-op stagger partner indicator.
   *   'hard'    — D-time overlap with another column of the same real doctor.
   *               Renders a red outer box-shadow glow.
   *   'partner' — correctly staggered partner (one column D, the other A).
   *               Renders a muted-blue hairline tick on the right edge.
   */
  partnerKind?: 'hard' | 'partner';
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
  dragValidity = null,
  flashPulse = false,
  hasConflict = false,
  conflictTooltip,
  isDrExam = false,
  isOutsideHours = false,
  dTimeMin = 0,
  aTimeMin = 0,
  hasDTimeConflict = false,
  isHighProduction = false,
  rationale = null,
  partnerKind,
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
      <div className="time-slot-cell bg-surface text-neutral-500 sticky left-0 z-10 text-[10px] font-normal px-2 py-0 whitespace-nowrap leading-none h-full flex items-center justify-end tabular-nums">
        {time}
      </div>
    );
  }

  // Outside provider work hours — gray, non-interactive
  if (isOutsideHours) {
    return (
      <div
        className="provider-cell px-1 py-0 h-full bg-neutral-100/70 cursor-not-allowed"
        title="Outside provider's scheduled hours"
      />
    );
  }

  // Empty or break cell
  if (isBreak || (!staffingCode && !blockLabel)) {
    const isInteractiveEmpty = !!onClick && !isBreak && isClickable;
    // Loop 10: drag-preview paint overrides generic drag-over styling when set.
    const dragPaintClass =
      dragValidity === "conflict"
        ? "bg-red-100 ring-2 ring-red-400 ring-inset"
        : dragValidity === "warning"
        ? "bg-amber-100 ring-2 ring-amber-400 ring-inset"
        : dragValidity === "valid"
        ? "bg-emerald-100 ring-2 ring-emerald-400 ring-inset"
        : null;
    // Flash pulse animation for "Jump to cell" feedback.
    const flashClass = flashPulse ? "cst-flash-pulse" : "";
    return (
      <div
        className={`provider-cell flex items-center justify-center px-2 py-0 h-full ${flashClass} ${
          isBreak
            ? "bg-neutral-100"
            : dragPaintClass
            ? dragPaintClass
            : isDragOver
            ? "bg-accent/15 ring-2 ring-accent ring-inset"
            : "bg-white"
        } ${
          isBreak
            ? ""
            : isClickable
            ? "cursor-pointer hover:bg-neutral-50 transition-colors group/cell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            : ""
        }`}
        style={
          isBreak
            ? {
                backgroundImage:
                  "repeating-linear-gradient(135deg, rgba(0,0,0,0.035) 0 6px, transparent 6px 12px)",
              }
            : undefined
        }
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
        {isBreak && (
          <span className="text-neutral-500 text-[10px] font-medium tracking-wide leading-none">
            LUNCH
          </span>
        )}
        {isDragOver && !isBreak && (
          <span className="text-accent/70 text-[10px] font-medium select-none leading-none">Drop here</span>
        )}
        {isClickable && !isBreak && !isDragOver && (
          <span className="text-neutral-400 text-xs transition-opacity opacity-0 group-hover/cell:opacity-100 leading-none">+</span>
        )}
      </div>
    );
  }

  // Staffing code cell - extremely narrow, single char
  if (staffingCode !== undefined && !blockLabel) {
    return (
      <div
        className={`flex items-center justify-center w-7 h-full px-0 py-0 ${
          isBreak ? "bg-neutral-100" : ""
        }`}
        style={providerColor && !isBreak ? {
          backgroundColor: hexToRgba(providerColor, 0.06),
          borderLeft: `2px solid ${providerColor}`,
        } : {}}
      >
        {staffingCode && !isBreak && (
          <span className="text-[10px] font-semibold text-neutral-700 leading-none tabular-nums">{staffingCode}</span>
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

  // Effective conflict: regular conflict OR D-time conflict OR Loop 6 hard partner overlap
  const hasHardPartner = partnerKind === 'hard';
  const effectiveConflict = hasConflict || hasDTimeConflict || hasHardPartner;
  const conflictColor = hasDTimeConflict && !hasConflict ? CONFLICT_COLORS.DTIME_OVERLAP : CONFLICT_COLORS.HARD;
  // Loop 6: is this cell a correctly-staggered partner (not a hard conflict)?
  const hasSoftPartner = partnerKind === 'partner';

  // Assisted Hygiene blocks get a distinct teal/cyan color overriding the provider color
  const isAssistedHyg = !!(blockLabel && (blockLabel.toUpperCase().includes('ASSISTED HYG') || blockLabel.toUpperCase().includes('ASSISTED HYGIENE')));
  const effectiveProviderColor = isAssistedHyg ? '#8b5cf6' : providerColor;

  // Outside provider work hours — gray, non-interactive (compact)
  // (duplicated here intentionally for flow control)

  // Provider cell with data — Loop 7 aesthetic polish.
  //   * White/off-white cell background (not a heavy color fill)
  //   * 3-4px vertical color strip on the left = provider identity
  //   * Subtle inset shadow for depth, faint hairline top/bottom on block edges
  // Conflict + partner treatments from Loop 6 are layered via additional
  // box-shadow entries so they still read as the loudest thing on the grid.
  const stripColor = effectiveConflict
    ? conflictColor
    : effectiveProviderColor ?? "transparent";
  const edgeColor = effectiveProviderColor
    ? hexToRgba(effectiveProviderColor, 0.35)
    : effectiveConflict
    ? conflictColor
    : undefined;

  // Base inner-shadow depth — only on block cells (not breaks/gaps).
  const baseDepthShadow = "inset 0 1px 2px rgba(0,0,0,0.04)";
  // Loop 6: outer red glow for hard conflicts.
  const hardGlowShadow = effectiveConflict
    ? `0 0 0 2px rgba(239, 68, 68, 0.8)`
    : undefined;
  // Loop 6: muted-blue hairline tick on the right edge for correctly-staggered partners.
  const partnerTickShadow = hasSoftPartner
    ? `inset -2px 0 0 0 rgba(59, 130, 246, 0.55)`
    : undefined;

  // Background: very light tint of provider color for a touch of identity at
  // low saturation — keeps blocks readable on white while preserving the
  // "which column belongs to whom" signal in dense grids. Conflicts override
  // with a warm red wash so the hard glow reads even harder.
  const cellBackground = effectiveConflict
    ? hasDTimeConflict && !hasConflict
      ? hexToRgba(CONFLICT_COLORS.DTIME_OVERLAP, 0.08)
      : hexToRgba(CONFLICT_COLORS.HARD, 0.08)
    : effectiveProviderColor
    ? hexToRgba(effectiveProviderColor, 0.06)
    : "#ffffff";

  // Loop 10: if this block cell is part of a drag-preview target range, paint
  // it with a colored ring to reinforce the footprint of the incoming block.
  const dragPaintRing =
    dragValidity === "conflict"
      ? "inset 0 0 0 2px rgba(248, 113, 113, 0.9)"
      : dragValidity === "warning"
      ? "inset 0 0 0 2px rgba(251, 191, 36, 0.9)"
      : dragValidity === "valid"
      ? "inset 0 0 0 2px rgba(16, 185, 129, 0.9)"
      : null;
  const boxShadowWithDragPaint = [
    baseDepthShadow,
    hardGlowShadow,
    partnerTickShadow,
    dragPaintRing,
  ]
    .filter(Boolean)
    .join(", ") || undefined;

  const cellStyle: React.CSSProperties = {
    backgroundColor: cellBackground,
    borderLeft: `3px solid ${stripColor}`,
    borderRight: `1px solid rgba(0,0,0,0.06)`,
    ...(isBlockFirst && edgeColor ? { borderTop: `1px solid ${edgeColor}` } : {}),
    ...(isBlockLast && edgeColor ? { borderBottom: `1px solid ${edgeColor}` } : {}),
    ...(boxShadowWithDragPaint ? { boxShadow: boxShadowWithDragPaint } : {}),
  };

  const isInteractiveBlock = !!onClick && isClickable;
  const blockAriaLabel = blockLabel
    ? `${staffingCode ? staffingCode + " " : ""}${blockLabel} block${
        effectiveConflict ? " — scheduling conflict" : ""
      }${isInteractiveBlock ? ", press Enter to edit" : ""}`
    : undefined;

  return (
    <div
      className={`provider-cell relative group px-2 py-[2px] h-full transition-all ${flashPulse ? "cst-flash-pulse" : ""} ${
        isClickable ? "cursor-pointer hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1" : ""
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
      title={
        effectiveConflict && conflictTooltip
          ? conflictTooltip
          : hasHardPartner
          ? "Multi-op conflict: same doctor in D-time here and in another operatory — stagger failed."
          : hasSoftPartner
          ? `Staggered with partner column — same doctor, A-D zigzag${blockLabel ? ` (${blockLabel})` : ""}`
          : blockLabel
          ? `${staffingCode || ""} ${blockLabel}${rationale ? ` — ${rationale}` : ""}`
          : ""
      }
    >
      {staffingCode && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-neutral-700 tracking-tight">{staffingCode}</span>
          {isDrExam && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-300 leading-none">
              🦷 Dr. Exam
            </span>
          )}
        </div>
      )}
      {blockLabel && isBlockFirst && (
        <div
          className="text-[11px] font-medium tracking-tight text-neutral-800 leading-tight truncate max-w-[140px] flex items-center gap-0.5"
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
        <div className="flex items-center gap-1 mt-0.5 tabular-nums">
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
              {rationale && (
                <div className="text-muted-foreground italic mt-0.5 max-w-[220px] whitespace-normal">
                  Placed as: {rationale}
                </div>
              )}
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
