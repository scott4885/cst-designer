"use client";

/**
 * TimeGridRenderer
 * ────────────────
 * Extracted from ScheduleGrid. Pure render: toolbar (zoom/column width),
 * sticky 3-row thead (operatory / provider / sub-headers), and the tbody
 * with time rows + cells.
 *
 * No interaction state lives here. All drag / click / edit callbacks and
 * derived lookups (conflictMap, dTimeConflictInstanceIds, blockTypeById,
 * getBlockInfo) arrive as props so this file can be smoke-tested in
 * isolation with a mock slots array.
 */

import { Fragment } from "react";
import { ZoomIn, ZoomOut, ChevronsLeftRight, ChevronsRight, Sparkles, Loader2, Maximize2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import TimeSlotCell from "./TimeSlotCell";
import { useScheduleStore } from "@/store/schedule-store";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import { hexToRgba } from "@/lib/engine/block-categories";
import type { BlockInfo, DragOverCell, DragState } from "./TimeSlotInteraction";
import type { PartnerKind } from "./ConflictOverlay";
import type { DragValidity } from "@/lib/engine/drag-preview";

// ─── Types shared with the rest of the module ───────────────────────────
export interface ProviderInput {
  id: string;
  name: string;
  role: string;
  color: string;
  operatories?: string[];
  /** "07:00" 24-hour format — used to gray out slots outside this provider's shift */
  workingStart?: string;
  workingEnd?: string;
  /** When true, renders the entire column with an "OFF" overlay (provider is disabled this day) */
  disabled?: boolean;
}

export interface TimeSlotOutput {
  time: string;
  slots: {
    providerId: string;
    staffingCode?: string;
    blockLabel?: string;
    blockTypeId?: string;
    isBreak?: boolean;
    /** Unique instance ID — enables multiple adjacent same-type blocks to stay distinct */
    blockInstanceId?: string | null;
    /** Per-block production minimum override */
    customProductionAmount?: number | null;
    /** Loop 5: engine rationale ("morning rock anchor", etc.). */
    rationale?: string | null;
  }[];
}

// ─── Time utilities (pure) ──────────────────────────────────────────────
/** Convert "HH:MM" 24-hour string to minutes since midnight */
export function hhmToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert a display time string to minutes since midnight.
 * Handles both "07:30" (24-hour) and "7:30 AM" / "7:30 PM" (12-hour AM/PM) formats.
 */
export function displayTimeToMinutes(t: string): number {
  const ampmMatch = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return h * 60 + m;
  }
  const hhmmMatch = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    return parseInt(hhmmMatch[1], 10) * 60 + parseInt(hhmmMatch[2], 10);
  }
  return -1;
}

/**
 * Returns true when `rowTime` is outside the provider's scheduled shift.
 * Accepts both "07:30" (24-hour) and "7:30 AM" / "7:30 PM" (12-hour AM/PM) formats.
 * Used to render a gray "unavailable" background for those cells.
 */
export function isOutsideProviderHours(rowTime: string, provider: ProviderInput): boolean {
  if (!provider.workingStart || !provider.workingEnd) return false;
  const t = displayTimeToMinutes(rowTime);
  if (t === -1) return false;
  const start = hhmToMinutes(provider.workingStart);
  const end = hhmToMinutes(provider.workingEnd);
  return t < start || t >= end;
}

// ─── Renderer props ─────────────────────────────────────────────────────
export interface TimeGridRendererProps {
  // Data
  timeSlots: TimeSlotOutput[];
  providers: ProviderInput[];
  // Chrome state (controlled by ScheduleGrid)
  rowHeight: number;
  columnsExpanded: boolean;
  colWidth: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  setColumnsExpanded: (expanded: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  // Provider-level smart-fill
  onGenerateProvider?: (providerId: string) => void;
  generatingProviderId?: string | null;
  // Conflict lookups (from useConflictLookups)
  conflictMap: Map<string, ConflictResult>;
  dTimeConflictInstanceIds: Set<string>;
  blockTypeById: Map<string, BlockTypeInput>;
  /** Loop 6: map of "time:providerId" → 'hard' | 'partner' for multi-op doctor cells. */
  partnerMap: Map<string, PartnerKind>;
  // Interaction (from useTimeSlotInteraction)
  isInteractive: boolean;
  dragState: DragState | null;
  dragOverCell: DragOverCell | null;
  sidebarDragging: boolean;
  /** Loop 10: per-cell validity map for the active drag's target range. */
  dragValidityMap: Map<string, DragValidity>;
  /** Loop 10: hovered-target validity tier (drives drop-blocking in the UI). */
  currentDragValidity: DragValidity | null;
  getBlockInfo: (time: string, providerId: string) => BlockInfo | null;
  onEmptyCellClick: (time: string, providerId: string) => void;
  onBlockCellClick: (time: string, providerId: string) => void;
  onDragStart: (e: React.DragEvent, time: string, providerId: string) => void;
  onDragOver: (e: React.DragEvent, time: string, providerId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, time: string, providerId: string) => void;
  onDragEnd: () => void;
  onMoveBlockEnabled: boolean;
}

export default function TimeGridRenderer({
  timeSlots,
  providers,
  rowHeight,
  columnsExpanded,
  colWidth,
  canZoomIn,
  canZoomOut,
  setColumnsExpanded,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onGenerateProvider,
  generatingProviderId,
  conflictMap,
  dTimeConflictInstanceIds,
  blockTypeById,
  partnerMap,
  isInteractive,
  dragState,
  dragOverCell,
  sidebarDragging,
  dragValidityMap,
  currentDragValidity: _currentDragValidity,
  getBlockInfo,
  onEmptyCellClick,
  onBlockCellClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onMoveBlockEnabled,
}: TimeGridRendererProps) {
  // Loop 10: subscribe to the flashingCell state so a "Jump to cell" click
  // from the Review panel briefly highlights the target slot.
  const flashingCell = useScheduleStore((s) => s.flashingCell);
  return (
    <>
      {/* ─── Controls bar — compact single row ────────────────────────── */}
      <div className="flex items-center justify-between gap-2 px-2 py-1 bg-neutral-50 rounded-md border border-neutral-200 shrink-0">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant={!columnsExpanded ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setColumnsExpanded(false)}
            title="Compact columns"
          >
            <ChevronsRight className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Compact</span>
          </Button>
          <Button
            size="sm"
            variant={columnsExpanded ? "secondary" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setColumnsExpanded(true)}
            title="Expanded columns"
          >
            <ChevronsLeftRight className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Wide</span>
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onZoomOut} disabled={!canZoomOut} title="Zoom out" aria-label="Zoom out schedule rows">
            <ZoomOut className="w-3 h-3" aria-hidden="true" />
          </Button>
          <span className="text-[10px] text-muted-foreground w-8 text-center tabular-nums">{rowHeight}px</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onZoomIn} disabled={!canZoomIn} title="Zoom in" aria-label="Zoom in schedule rows">
            <ZoomIn className="w-3 h-3" aria-hidden="true" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onFitToScreen} title="Fit all rows to screen">
            <Maximize2 className="w-3 h-3 mr-0.5" />
            <span className="hidden sm:inline">Fit</span>
          </Button>
        </div>
      </div>

      {/* ─── Schedule Grid ────────────────────────────────────────────── */}
      <div className="schedule-grid min-h-0 min-w-0 border border-neutral-200 rounded-lg overflow-y-auto overflow-x-auto flex-1 bg-white">
        <div>
          <table
            className="border-collapse"
            style={{
              tableLayout: "fixed",
              borderCollapse: "collapse",
              borderSpacing: 0,
              minWidth: `${80 + providers.length * (colWidth + 28)}px`,
            }}
          >
            <thead className="sticky top-0 z-20">
              {/* Row 1: Operatory name header */}
              <tr className="border-b border-neutral-200">
                <th
                  className="px-2 py-1 text-[10px] font-medium text-neutral-500 bg-surface text-left border-b border-neutral-200 sticky left-0 z-30"
                  style={{ width: 80, minWidth: 80 }}
                >
                  Operatory
                </th>
                {providers.map((provider) => {
                  const opName = provider.operatories?.[0] || "—";
                  const staffCode = provider.role === "DOCTOR" ? "D" : provider.role === "HYGIENIST" ? "H" : "A";
                  return (
                    <th
                      key={`op-${provider.id}`}
                      colSpan={2}
                      className="px-2 py-1 text-center bg-surface"
                      style={{ borderBottom: "1px solid var(--border)", minWidth: colWidth + 28 }}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border tracking-tight"
                          style={{
                            backgroundColor: hexToRgba(provider.color, 0.08),
                            borderColor: hexToRgba(provider.color, 0.3),
                            color: provider.color,
                          }}
                        >
                          {opName}
                        </span>
                        <span className="text-[10px] font-semibold px-1 rounded bg-neutral-100 text-neutral-600">
                          {staffCode}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Row 2: Provider name header */}
              <tr>
                <th
                  className="px-3 py-2 text-xs font-medium text-neutral-500 border-b border-neutral-200 bg-surface sticky left-0 z-30 text-right tabular-nums"
                  style={{ width: 80, minWidth: 80 }}
                >
                  Time
                </th>
                {providers.map((provider) => {
                  const realProviderId = provider.id.includes("::")
                    ? provider.id.slice(0, provider.id.lastIndexOf("::"))
                    : provider.id;
                  const isGenerating = generatingProviderId === realProviderId;
                  return (
                    <th
                      key={provider.id}
                      colSpan={2}
                      className={`px-2 py-1.5 border-b border-neutral-200 bg-surface ${provider.disabled ? "opacity-50" : ""}`}
                      style={{ minWidth: colWidth + 28 }}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div className="text-sm font-semibold tracking-tight" style={{ color: provider.disabled ? "#999" : provider.color }}>
                          {provider.name}
                        </div>
                        <div className="text-[10px] text-neutral-500 font-normal tracking-wide">
                          {provider.role}
                        </div>
                        {provider.disabled ? (
                          <span className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-muted text-muted-foreground border border-border/50">
                            OFF TODAY
                          </span>
                        ) : onGenerateProvider && (
                          <button
                            onClick={() => onGenerateProvider(realProviderId)}
                            disabled={isGenerating || !!generatingProviderId}
                            title={`Generate smart schedule for ${provider.name}`}
                            className="mt-0.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium
                              bg-accent/10 hover:bg-accent/20 border border-accent/30 text-accent
                              disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            style={{ fontSize: "9px" }}
                          >
                            {isGenerating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                            {isGenerating ? "Generating…" : "Smart Fill"}
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Row 3: Staffing / Block type sub-headers */}
              <tr>
                <th
                  className="border-b border-neutral-200 bg-surface sticky left-0 z-30"
                  style={{ width: 80, minWidth: 80 }}
                />
                {providers.map((provider) => (
                  <Fragment key={provider.id}>
                    <th className="px-1 py-1 text-[10px] text-neutral-400 font-normal border-b border-neutral-200 bg-surface text-center" style={{ width: 28, minWidth: 28 }}>
                      S
                    </th>
                    <th
                      className="px-3 py-1 text-[10px] text-neutral-400 font-normal border-b border-neutral-200 bg-surface"
                      style={{ minWidth: colWidth }}
                    >
                      Block Type
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((row, rowIdx) => {
                const isCompactRow = rowHeight < 20;
                // Loop 7: hour-boundary rows get a slightly darker divider to
                // make the day's structure readable at a glance.
                const isHourBoundary = /:00\s*(AM|PM)?$/i.test(row.time);
                return (
                  <tr
                    key={rowIdx}
                    className="hover:bg-neutral-50/60 transition-colors"
                    style={{ height: rowHeight, maxHeight: rowHeight }}
                  >
                    <td
                      className={`p-0 sticky left-0 z-10 bg-surface ${isHourBoundary ? "border-b border-neutral-300" : "border-b border-neutral-100"}`}
                      style={{ width: 80, minWidth: 80, height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                    >
                      <TimeSlotCell time={row.time} />
                    </td>
                    {providers.map((provider) => {
                      const rowScopeName = `schedule-row:${row.time}:${provider.id}`;
                      const errorFallback = (
                        <Fragment>
                          <td
                            className="p-0 border-b border-border bg-red-50 text-center"
                            style={{ width: 28, minWidth: 28, height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                            title="Row render failed — see console"
                          >
                            <AlertTriangle className="w-3 h-3 text-red-500 mx-auto" aria-hidden="true" />
                          </td>
                          <td
                            className="p-0 border-b border-border bg-red-50 text-[10px] text-red-600 px-1"
                            style={{ minWidth: colWidth, height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                          >
                            Row error
                          </td>
                        </Fragment>
                      );
                      // Provider disabled for this day — greyed-out inert cell
                      if (provider.disabled) {
                        return (
                          <Fragment key={provider.id}>
                            <td className="p-0 border-b border-border/30 bg-muted/20 text-center" style={{ width: 28, minWidth: 28, height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }} />
                            <td
                              className="p-0 border-b border-border/30 bg-muted/20"
                              style={{ minWidth: colWidth, height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                            />
                          </Fragment>
                        );
                      }

                      const slot = row.slots.find((s) => s.providerId === provider.id);

                      const hasBlock = !!(slot?.blockTypeId || slot?.blockLabel) && !slot?.isBreak;
                      const isEmpty = !hasBlock && !slot?.isBreak;
                      const outsideHours = isOutsideProviderHours(row.time, provider);
                      const isCellDragOver =
                        dragOverCell?.time === row.time && dragOverCell?.providerId === provider.id;
                      // Loop 10: tier for this specific cell when it's part of the drag-preview footprint.
                      const cellDragValidity = dragValidityMap.get(`${row.time}:${provider.id}`) ?? null;
                      // Loop 10: flash pulse if the Review panel targeted this cell.
                      const isFlashing =
                        !!flashingCell &&
                        flashingCell.time === row.time &&
                        flashingCell.providerId === provider.id;

                      const blockInfo = hasBlock ? getBlockInfo(row.time, provider.id) : null;
                      const isDraggingSource =
                        !!dragState &&
                        dragState.providerId === provider.id &&
                        !!blockInfo &&
                        blockInfo.startTime === dragState.time;

                      const conflictEntry = conflictMap.get(`${row.time}:${provider.id}`);
                      const cellHasConflict = !!conflictEntry;
                      const conflictTooltip = conflictEntry
                        ? `Double-booked in: ${conflictEntry.operatories.join(", ")} — blocks: ${conflictEntry.blockLabels.join(", ")}`
                        : undefined;

                      // Loop 6: partner-link kind for this cell (only set for
                      // multi-op doctor cells that share the same real provider
                      // with another virtual column at the same time).
                      const partnerKind = partnerMap.get(`${row.time}:${provider.id}`);

                      const isFirstCell = blockInfo?.isFirst || false;
                      let hasDTimeConflict = false;
                      let dTimeConflictTooltip: string | undefined;
                      let cellDTimeMin = 0;
                      let cellATimeMin = 0;

                      let isHighProduction = false;
                      if (hasBlock && slot?.blockTypeId) {
                        const bt = blockTypeById.get(slot.blockTypeId);
                        if (bt && isFirstCell) {
                          cellDTimeMin = bt.dTimeMin ?? 0;
                          cellATimeMin = bt.aTimeMin ?? 0;
                          const hpThreshold = provider.role === "HYGIENIST" ? 300 : 1000;
                          isHighProduction = (bt.minimumAmount ?? 0) >= hpThreshold;
                        }

                        if (isFirstCell && slot.blockInstanceId && dTimeConflictInstanceIds.has(slot.blockInstanceId)) {
                          hasDTimeConflict = true;
                          dTimeConflictTooltip = `D-time overlap: doctor has hands-on time in another column at the same time. Consider staggering start times.`;
                        }
                      }

                      // §4.4 visual grouping: suppress row divider for non-last block cells
                      const isBlockCellNotLast = hasBlock && blockInfo && !blockInfo.isLast;
                      // Loop 7: row dividers — hour-boundary slightly stronger
                      // to help the eye scan the day; non-boundary rows are a
                      // whisper-thin hairline so dense schedules don't stripe.
                      const rowDividerClass = isBlockCellNotLast
                        ? ""
                        : isHourBoundary
                        ? "border-b border-neutral-300"
                        : "border-b border-neutral-100";

                      return (
                        <ErrorBoundary key={provider.id} name={rowScopeName} fallback={errorFallback}>
                          <Fragment>
                          <td
                            className={`p-0 ${rowDividerClass}`}
                            style={{
                              width: 28,
                              minWidth: 28,
                              height: rowHeight,
                              maxHeight: rowHeight,
                              overflow: "hidden",
                              ...(isBlockCellNotLast ? { borderBottom: "none" } : {}),
                            }}
                          >
                            <TimeSlotCell
                              staffingCode={slot?.staffingCode}
                              providerColor={slot?.staffingCode ? provider.color : undefined}
                              isBreak={slot?.isBreak || false}
                              isDrExam={slot?.staffingCode === "D" && provider.role === "HYGIENIST"}
                            />
                          </td>
                          <td
                            className={`p-0 ${rowDividerClass}`}
                            style={{
                              minWidth: colWidth,
                              height: rowHeight,
                              maxHeight: rowHeight,
                              overflow: "hidden",
                              ...(isBlockCellNotLast ? { borderBottom: "none" } : {}),
                            }}
                          >
                            <div
                              data-testid={`block-cell-${row.time}-${provider.id}`}
                              style={{ height: rowHeight, maxHeight: rowHeight, overflow: "hidden" }}
                              draggable={hasBlock && onMoveBlockEnabled && !outsideHours}
                              onDragStart={(e) => hasBlock && !outsideHours && onDragStart(e, row.time, provider.id)}
                              // Loop 10: allow dragOver on ALL non-outside-hours cells while a grid
                              // drag is in progress, so the preview paints red/amber/green across
                              // the would-be target range even when it overlaps existing blocks.
                              onDragOver={(e) => {
                                if (outsideHours) return;
                                if (isEmpty || sidebarDragging || (!!dragState && hasBlock)) {
                                  onDragOver(e, row.time, provider.id);
                                }
                              }}
                              onDragLeave={onDragLeave}
                              // Drop stays restricted to empty cells for grid-block moves; sidebar
                              // drops always write over their target via onAddBlock. handleDrop
                              // in TimeSlotInteraction additionally refuses 'conflict' previews.
                              onDrop={(e) => !outsideHours && (isEmpty || sidebarDragging) && onDrop(e, row.time, provider.id)}
                              onDragEnd={onDragEnd}
                            >
                              <TimeSlotCell
                                blockLabel={slot?.blockLabel}
                                providerColor={slot?.blockLabel ? provider.color : undefined}
                                isBreak={slot?.isBreak || false}
                                isOutsideHours={outsideHours && !slot?.blockLabel && !slot?.isBreak}
                                onClick={
                                  isInteractive && !outsideHours
                                    ? () => {
                                        if (hasBlock) {
                                          onBlockCellClick(row.time, provider.id);
                                        } else if (isEmpty) {
                                          onEmptyCellClick(row.time, provider.id);
                                        }
                                      }
                                    : undefined
                                }
                                isClickable={isInteractive && !outsideHours && (hasBlock || isEmpty)}
                                isBlockFirst={isFirstCell}
                                isBlockLast={blockInfo?.isLast || false}
                                isDragOver={isCellDragOver}
                                isDragging={isDraggingSource}
                                dragValidity={cellDragValidity}
                                flashPulse={isFlashing}
                                hasConflict={cellHasConflict}
                                conflictTooltip={conflictTooltip ?? dTimeConflictTooltip}
                                dTimeMin={isCompactRow ? 0 : cellDTimeMin}
                                aTimeMin={isCompactRow ? 0 : cellATimeMin}
                                hasDTimeConflict={hasDTimeConflict}
                                isHighProduction={isCompactRow ? false : isHighProduction}
                                rationale={slot?.rationale}
                                partnerKind={partnerKind}
                              />
                            </div>
                          </td>
                          </Fragment>
                        </ErrorBoundary>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
