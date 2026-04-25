"use client";

/**
 * ScheduleGrid (V2) — Sprint 2 Stream B
 * ─────────────────────────────────────
 * The canonical 10-minute-density canvas.
 *
 *   • Vertical canvas of all 10-min slots from workingStart → workingEnd.
 *   • Sticky TOP row: provider/column headers.
 *   • Sticky LEFT rail: time axis labelled every 10 min (hour/half-hour
 *     ticks dark, intermediate 10/20/40/50 marks muted).
 *   • Virtualised row rendering (windowed by scroll offset + buffer).
 *   • Keyboard cursor: Arrow keys move; Enter opens; Escape dismisses.
 *   • Zoom: Ctrl+/− cycles fit (14px) / compact (24px) / default (32px) /
 *     expanded (48px). Default on load is `fit` — a 9-hour day fits in
 *     one pane (~756px) without scrolling.
 *   • Consumes `GeneratedSchedule` from the engine (blocks + guardReport).
 *   • Delegates doctor-stagger connectors to <DoctorFlowOverlay/>.
 *
 * Bible §2.1 (X-segment primitive) • §3 (doctor-bottleneck invariant).
 * PRD-V4 §10.4 UX-L1..UX-L12.
 * Sprint plan T-201 / T-202 / T-205.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import BlockInstance, { type ProcedureCategoryCode } from './BlockInstance';
import DoctorFlowOverlay from './DoctorFlowOverlay';
import { IconZoomIn, IconZoomOut, IconToggleOverlay } from './icons';
import type { ProviderRoleCode } from './icons';
import {
  ScheduleGridEmpty,
  ScheduleGridError,
  ScheduleGridLoading,
} from './ScheduleGridStates';
import {
  useScheduleView,
  ZOOM_ROW_HEIGHT_PX,
  type ScheduleZoom,
} from '@/store/use-schedule-view';
import type {
  GeneratedSchedule,
  PlacedBlock,
  Violation,
} from '@/lib/engine/types';

/**
 * Simple column contract — one per operatory visible on the canvas.
 * Providers get a colour slot via CSS custom properties `--provider-1..10`.
 */
export interface ScheduleGridColumn {
  /** Stable id (operatory name or provider id). */
  id: string;
  /** Short header label (e.g. "Op 1 — Dr. Kim"). */
  label: string;
  /** Secondary header line (e.g. "Hygiene"). */
  sublabel?: string;
  /** 1-indexed slot into the provider palette (1..10). Falls back to neutral if absent. */
  providerColorIndex?: number;
  /** Optional provider role (DDS / RDH / DA / OTHER) — shows a role badge in the header. */
  providerRole?: ProviderRoleCode;
}

export interface ScheduleGridProps {
  schedule: GeneratedSchedule;
  columns: ScheduleGridColumn[];
  /** Minute-of-day for the top of the grid (e.g. 480 for 8:00 AM). */
  workingStartMin: number;
  /** Minute-of-day for the bottom of the grid (exclusive). */
  workingEndMin: number;
  /** Minutes per row. The canvas renders at 10-min density per PRD-V4 UX-L1. */
  slotMinutes?: number;
  /** Optional callback when user activates (click / Enter) a block. */
  onBlockActivate?: (block: PlacedBlock) => void;
  /** Hygiene block ids — drives the D-band exam-glyph (UX-L3). */
  hygieneBlockIds?: ReadonlySet<string>;
  /** Optional per-block procedure category — drives the UX-L6 left stripe. */
  blockCategories?: ReadonlyMap<string, ProcedureCategoryCode>;
  /** Allow the parent to suppress the doctor-flow toggle entirely (e.g. print). */
  hideDoctorFlow?: boolean;
  /** Whether to apply a tabular content-visibility optimisation. */
  enableContentVisibility?: boolean;
  /** Explicit state override — when set, the grid renders the matching state
      component instead of the schedule. Useful for route-level loaders. */
  state?:
    | { kind: 'ready' }
    | { kind: 'empty'; onAction?: () => void; actionLabel?: string; message?: string }
    | { kind: 'error'; message?: string; detail?: string; onRetry?: () => void }
    | { kind: 'loading'; rows?: number; columns?: number; message?: string };
}

/** Format a minute-of-day as 12-hour string (e.g. 495 → "8:15 AM"). */
function formatMinute(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const mm = m.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}

/** Every 10-min row gets a full time label (every row). The time gutter is
 *  72px wide and tabular-nums, so "12:00 AM"-width labels render cleanly
 *  even at fit zoom (14px rows). */
function minuteLabel(rowStartMin: number): string {
  return formatMinute(rowStartMin);
}

/** Group violations by block id so we can forward them to each BlockInstance. */
function indexViolationsByBlock(
  violations: Violation[],
): Record<string, Violation[]> {
  const idx: Record<string, Violation[]> = {};
  for (const v of violations) {
    for (const id of v.blockInstanceIds ?? []) {
      (idx[id] ??= []).push(v);
    }
  }
  return idx;
}

/** Group blocks by column id so we can render per-column. */
function indexBlocksByColumn(
  blocks: PlacedBlock[],
): Record<string, PlacedBlock[]> {
  const idx: Record<string, PlacedBlock[]> = {};
  for (const b of blocks) {
    (idx[b.operatory] ??= []).push(b);
  }
  return idx;
}

const ScheduleGrid = memo(function ScheduleGrid({
  schedule,
  columns,
  workingStartMin,
  workingEndMin,
  slotMinutes = 10,
  onBlockActivate,
  hygieneBlockIds,
  blockCategories,
  hideDoctorFlow = false,
  enableContentVisibility = true,
  state,
}: ScheduleGridProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const zoom = useScheduleView((s) => s.zoom);
  const cursor = useScheduleView((s) => s.cursor);
  const setCursor = useScheduleView((s) => s.setCursor);
  const moveCursor = useScheduleView((s) => s.moveCursor);
  const hoveredBlockId = useScheduleView((s) => s.hoveredBlockId);
  const setHoveredBlockId = useScheduleView((s) => s.setHoveredBlockId);
  const selectedBlockId = useScheduleView((s) => s.selectedBlockId);
  const setSelectedBlockId = useScheduleView((s) => s.setSelectedBlockId);
  const showDoctorFlow = useScheduleView((s) => s.showDoctorFlow);
  const toggleDoctorFlow = useScheduleView((s) => s.toggleDoctorFlow);
  const showXSegments = useScheduleView((s) => s.showXSegments);
  const toggleXSegments = useScheduleView((s) => s.toggleXSegments);
  const zoomIn = useScheduleView((s) => s.zoomIn);
  const zoomOut = useScheduleView((s) => s.zoomOut);
  const setZoom = useScheduleView((s) => s.setZoom);

  const slotHeightPx = ZOOM_ROW_HEIGHT_PX[zoom];

  // ─── Derived geometry ──────────────────────────────────────────────
  const totalMinutes = Math.max(0, workingEndMin - workingStartMin);
  const rowCount = Math.max(1, Math.ceil(totalMinutes / slotMinutes));
  const rows = useMemo(() => {
    const r: number[] = [];
    for (let i = 0; i < rowCount; i++) r.push(workingStartMin + i * slotMinutes);
    return r;
  }, [rowCount, workingStartMin, slotMinutes]);

  const violationsByBlock = useMemo(
    () => indexViolationsByBlock(schedule.guardReport.violations ?? []),
    [schedule.guardReport.violations],
  );
  const blocksByColumn = useMemo(
    () => indexBlocksByColumn(schedule.blocks ?? []),
    [schedule.blocks],
  );

  // ─── Keyboard handling (UX-L6, UX-L9) ─────────────────────────────
  // WCAG 2.1 grid widget keyboard contract:
  //   Arrows  — move cursor by 1 cell
  //   Home    — jump to col 0 in current row
  //   End     — jump to last col in current row
  //   Ctrl+Home — jump to (0, 0)
  //   Ctrl+End  — jump to (rowCount-1, last col)
  //   PageUp / PageDown — jump 10 rows
  //   Enter / Space — activate block under cursor
  //   Escape — clear selection
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Ctrl+/- zoom is handled by the document-level listener below so the
      // shortcut works regardless of whether the grid root has focus. Skip it
      // here to avoid a double-fire that would zoom twice per keystroke.
      if (e.metaKey) return;
      if (e.ctrlKey && e.key !== 'Home' && e.key !== 'End') return;
      if (e.key === 'Escape') {
        setSelectedBlockId(null);
        return;
      }
      const cur = cursor ?? { rowIndex: 0, colIndex: 0 };
      const colBound = Math.max(1, columns.length);
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveCursor(-1, 0, rowCount, colBound);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveCursor(1, 0, rowCount, colBound);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveCursor(0, -1, rowCount, colBound);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveCursor(0, 1, rowCount, colBound);
          break;
        case 'Home':
          e.preventDefault();
          if (e.ctrlKey) {
            setCursor({ rowIndex: 0, colIndex: 0 });
          } else {
            setCursor({ rowIndex: cur.rowIndex, colIndex: 0 });
          }
          break;
        case 'End':
          e.preventDefault();
          if (e.ctrlKey) {
            setCursor({ rowIndex: rowCount - 1, colIndex: colBound - 1 });
          } else {
            setCursor({ rowIndex: cur.rowIndex, colIndex: colBound - 1 });
          }
          break;
        case 'PageUp':
          e.preventDefault();
          moveCursor(-10, 0, rowCount, colBound);
          break;
        case 'PageDown':
          e.preventDefault();
          moveCursor(10, 0, rowCount, colBound);
          break;
        case 'Enter':
        case ' ': {
          // Find block at current cursor
          const col = columns[cur.colIndex];
          if (!col) return;
          const colBlocks = blocksByColumn[col.id] ?? [];
          const minuteAtCursor = workingStartMin + cur.rowIndex * slotMinutes;
          const hit = colBlocks.find(
            (b) =>
              minuteAtCursor >= b.startMinute &&
              minuteAtCursor < b.startMinute + b.durationMin,
          );
          if (hit) {
            e.preventDefault();
            setSelectedBlockId(hit.blockInstanceId);
            onBlockActivate?.(hit);
          }
          break;
        }
        default:
          break;
      }
    },
    [
      cursor,
      moveCursor,
      rowCount,
      columns,
      setSelectedBlockId,
      blocksByColumn,
      workingStartMin,
      slotMinutes,
      onBlockActivate,
    ],
  );

  // Initial focus so keyboard works right away once user clicks into the region.
  useEffect(() => {
    if (!cursor && columns.length > 0 && rowCount > 0) {
      setCursor({ rowIndex: 0, colIndex: 0 });
    }
  }, [cursor, columns.length, rowCount, setCursor]);

  // Cell click handler — sets cursor AND focuses the grid root so keyboard
  // navigation works immediately after a mouse click. Without this, ArrowDown
  // after a click does nothing because focus sits on the clicked cell (which
  // is not the onKeyDown target) or drops to body.
  const handleCellClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      setCursor({ rowIndex, colIndex });
      // Re-focus the grid root so subsequent keyboard events are delivered
      // to the onKeyDown listener.
      rootRef.current?.focus({ preventScroll: true });
    },
    [setCursor],
  );

  // Document-level zoom shortcuts. Ctrl+= / Ctrl+- / Ctrl+0 should work any
  // time the V2 grid is on screen, without requiring the grid root to have
  // focus (browsers by default steal these combos for page zoom; we
  // preventDefault so our zoom applies instead). Skip when focus is inside
  // a text input so native undo/redo/find behaviour in inputs still works.
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    };
    const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (isEditable(e.target)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom('default');
      }
    };
    document.addEventListener('keydown', onDocKeyDown);
    return () => document.removeEventListener('keydown', onDocKeyDown);
  }, [zoomIn, zoomOut, setZoom]);

  // Document-level arrow navigation + Escape, also scoped to the grid being
  // mounted. Same editable-target gate. If no cursor is set yet, seed (0,0)
  // on first arrow press so the cursor is visible.
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    };
    const onDocKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;

      // Only intercept arrow keys when focus is not already on a grid root
      // (the grid's own onKeyDown handles focused case). We detect focus by
      // checking if `document.activeElement` is inside rootRef — if so, the
      // onKeyDown above will fire first and preventDefault.
      const root = rootRef.current;
      const active = document.activeElement;
      const focusInsideGrid = !!(root && active && root.contains(active));
      if (focusInsideGrid) return;

      // Only trigger if the schedule grid is visible in viewport — otherwise
      // arrow keys still do their normal thing on the rest of the page.
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const visible =
        rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
      if (!visible) return;

      const colBound = Math.max(1, columns.length);
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          moveCursor(-1, 0, rowCount, colBound);
          break;
        case 'ArrowDown':
          e.preventDefault();
          moveCursor(1, 0, rowCount, colBound);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          moveCursor(0, -1, rowCount, colBound);
          break;
        case 'ArrowRight':
          e.preventDefault();
          moveCursor(0, 1, rowCount, colBound);
          break;
      }
    };
    document.addEventListener('keydown', onDocKeyDown);
    return () => document.removeEventListener('keydown', onDocKeyDown);
  }, [columns.length, rowCount, moveCursor]);

  // ─── Scroll-shadow state (polish-brief item) ──────────────────────
  // Show a 2-px gradient at the top/bottom/left/right of the scroll area
  // when there's more content to reveal. Sticky header gets a soft shadow
  // only after the first scroll-y pixel.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState<{
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
    scrolled: boolean;
  }>({ top: false, bottom: false, left: false, right: false, scrolled: false });

  const onScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const nearTop = el.scrollTop <= 1;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const nearLeft = el.scrollLeft <= 1;
    const nearRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setScrollEdges({
      top: !nearTop,
      bottom: !nearBottom && el.scrollHeight > el.clientHeight,
      left: !nearLeft,
      right: !nearRight && el.scrollWidth > el.clientWidth,
      scrolled: el.scrollTop > 0,
    });
  }, []);

  useEffect(() => {
    onScroll();
  }, [onScroll, rowCount, columns.length, zoom]);

  // Auto-scroll the cursor cell into view when keyboard navigation moves
  // past the visible area (Home/End/PageUp/PageDown can move 10+ rows at
  // a time and the cursor would otherwise scroll off-screen). Uses
  // `scrollIntoView({ block: 'nearest', inline: 'nearest' })` so we only
  // scroll when the cell is actually offscreen — no jitter when navigating
  // inside the visible range.
  useEffect(() => {
    if (!cursor || !bodyRef.current) return;
    const sel = `[data-testid="sg-cell"][data-row-index="${cursor.rowIndex}"][data-col-index="${cursor.colIndex}"]`;
    const cell = bodyRef.current.querySelector(sel);
    // Guard against jsdom test environments where scrollIntoView isn't implemented.
    if (cell instanceof HTMLElement && typeof cell.scrollIntoView === 'function') {
      cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [cursor]);

  // ─── State short-circuit (empty / error / loading) ─────────────────
  // When a parent passes `state`, render the matching card inside a
  // container that still owns the grid's focus region for a11y.
  if (state && state.kind !== 'ready') {
    return (
      <div
        data-testid="sg-schedule-grid"
        data-sg-state={state.kind}
        role="region"
        aria-label={`Schedule for ${schedule.dayOfWeek}`}
        className="relative"
      >
        {state.kind === 'empty' && (
          <ScheduleGridEmpty
            onSuggestedAction={state.onAction}
            suggestedActionLabel={state.actionLabel}
            message={state.message}
          />
        )}
        {state.kind === 'error' && (
          <ScheduleGridError
            message={state.message}
            detail={state.detail}
            onRetry={state.onRetry}
          />
        )}
        {state.kind === 'loading' && (
          <ScheduleGridLoading
            rows={state.rows}
            columns={state.columns}
            slotHeightPx={slotHeightPx}
            message={state.message}
          />
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────
  // Root container is a region; the actual `role="grid"` is applied to the
  // inner grid body so that the only children of the grid role are rows
  // (aria-required-children). The toolbar, scroll-shadow overlays, and
  // live region remain outside the grid's ARIA tree.
  return (
    <div
      ref={rootRef}
      data-testid="sg-schedule-grid"
      data-sg-zoom={zoom}
      tabIndex={0}
      role="region"
      aria-label={`Schedule for ${schedule.dayOfWeek}`}
      onKeyDown={onKeyDown}
      className="relative outline-none focus:outline-none"
      style={
        {
          ['--sg-row-height' as string]: `${slotHeightPx}px`,
        } as React.CSSProperties
      }
    >
      {/* Top toolbar — zoom + doctor-flow toggle
          Sticky with a subtle bottom border; soft shadow drops in on
          first scroll (respects prefers-reduced-motion via tokens). */}
      <div
        data-testid="sg-grid-toolbar"
        data-scrolled={scrollEdges.scrolled ? 'true' : 'false'}
        className="flex items-center gap-2 px-2 py-1 bg-white sticky top-0"
        style={{
          zIndex: 'var(--z-sticky-provider-row)' as unknown as number,
          borderBottom: `1px solid var(--sticky-header-border)`,
          boxShadow: scrollEdges.scrolled ? 'var(--sticky-header-shadow)' : 'none',
          transition: 'box-shadow var(--sg-transition-fast)',
        }}
      >
        <span className="text-[var(--font-xs)] text-neutral-500 tabular-nums">
          {formatMinute(workingStartMin)} – {formatMinute(workingEndMin)}
        </span>
        <div className="flex-1" />
        <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={() => setZoom('default')} />
        <button
          type="button"
          data-testid="sg-xsegments-toggle"
          aria-pressed={showXSegments}
          onClick={toggleXSegments}
          title="Show A-pre / Doctor / A-post time bands at full height"
          className={`inline-flex items-center gap-1 px-2 py-1 text-[var(--font-xs)] rounded border focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
            showXSegments
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
          }`}
          style={{
            transition:
              'background-color var(--sg-transition-fast), color var(--sg-transition-fast), box-shadow var(--sg-transition-fast)',
          }}
        >
          <span data-micro="true">X-segments</span>
        </button>
        {!hideDoctorFlow && (
          <button
            type="button"
            data-testid="sg-doctor-flow-toggle"
            aria-pressed={showDoctorFlow}
            onClick={toggleDoctorFlow}
            className={`inline-flex items-center gap-1 px-2 py-1 text-[var(--font-xs)] rounded border focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] ${
              showDoctorFlow
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
            }`}
            style={{
              transition:
                'background-color var(--sg-transition-fast), color var(--sg-transition-fast), box-shadow var(--sg-transition-fast)',
            }}
          >
            <IconToggleOverlay size="sm" />
            <span data-micro="true">Doctor flow</span>
          </button>
        )}
      </div>

      {/* Scroll-shadow edges — gradient fades on top/bottom/left/right
          when there's more content to scroll. Non-interactive overlays. */}
      {scrollEdges.top && (
        <div
          aria-hidden="true"
          data-testid="sg-scroll-shadow-top"
          className="pointer-events-none absolute left-0 right-0"
          style={{
            top: 0,
            height: 'var(--scroll-shadow-size)',
            background: `linear-gradient(to bottom, var(--scroll-shadow-color), transparent)`,
            zIndex: 'var(--z-scroll-shadow)' as unknown as number,
          }}
        />
      )}
      {scrollEdges.bottom && (
        <div
          aria-hidden="true"
          data-testid="sg-scroll-shadow-bottom"
          className="pointer-events-none absolute left-0 right-0"
          style={{
            bottom: 0,
            height: 'var(--scroll-shadow-size)',
            background: `linear-gradient(to top, var(--scroll-shadow-color), transparent)`,
            zIndex: 'var(--z-scroll-shadow)' as unknown as number,
          }}
        />
      )}
      {scrollEdges.left && (
        <div
          aria-hidden="true"
          data-testid="sg-scroll-shadow-left"
          className="pointer-events-none absolute top-0 bottom-0"
          style={{
            left: 0,
            width: 'var(--scroll-shadow-size)',
            background: `linear-gradient(to right, var(--scroll-shadow-color), transparent)`,
            zIndex: 'var(--z-scroll-shadow)' as unknown as number,
          }}
        />
      )}
      {scrollEdges.right && (
        <div
          aria-hidden="true"
          data-testid="sg-scroll-shadow-right"
          className="pointer-events-none absolute top-0 bottom-0"
          style={{
            right: 0,
            width: 'var(--scroll-shadow-size)',
            background: `linear-gradient(to left, var(--scroll-shadow-color), transparent)`,
            zIndex: 'var(--z-scroll-shadow)' as unknown as number,
          }}
        />
      )}

      {/* Grid body — carries `role="grid"` so that gridcells and rows
          descend directly from the grid role with no non-row children
          (satisfies aria-required-children / aria-required-parent). */}
      <div
        ref={bodyRef}
        data-testid="sg-grid-body"
        role="grid"
        aria-label={`Schedule for ${schedule.dayOfWeek}`}
        aria-rowcount={rowCount + 1}
        aria-colcount={columns.length + 1}
        onScroll={onScroll}
        className="relative overflow-auto"
        style={{
          display: 'grid',
          gridTemplateColumns: `var(--sg-time-col-w) repeat(${Math.max(1, columns.length)}, minmax(var(--sg-col-min-w), 1fr))`,
        }}
      >
        {/* Sticky provider header row — wrapped in role="row" per ARIA grid pattern
            (aria-required-parent). Uses `display: contents` so CSS grid layout is
            unaffected — the wrapper contributes semantics only. */}
        <div
          role="row"
          aria-rowindex={1}
          style={{ display: 'contents' }}
        >
          {/* Sticky corner — matches the fixed 40px column-header height
              so the header row stays aligned at any zoom. */}
          <div
            className="sticky top-0 left-0 bg-white border-b border-r border-neutral-200"
            style={{
              zIndex: 'var(--z-sticky-corner)' as unknown as number,
              height: Math.max(40, slotHeightPx),
            }}
            aria-hidden="true"
          />

          {columns.map((col, colIdx) => {
            // Fixed 40px header regardless of zoom row height (Google
            // Calendar 2024 pattern — the header is its own surface, not
            // a time row). Provider colour lives in a 3px left bar +
            // matching column-bottom accent (Open Dental convention).
            const HEADER_H = 40;
            const providerVar = col.providerColorIndex
              ? `var(--sg-provider-${Math.min(10, Math.max(1, col.providerColorIndex))})`
              : undefined;
            return (
              <div
                key={`hdr-${col.id}`}
                data-testid="sg-col-header"
                data-col-id={col.id}
                data-col-index={colIdx}
                role="columnheader"
                aria-colindex={colIdx + 2}
                className="sticky top-0 flex flex-col justify-center px-3 bg-white border-b border-r border-neutral-200"
                style={{
                  zIndex: 'var(--z-sticky-provider-row)' as unknown as number,
                  height: Math.max(HEADER_H, slotHeightPx),
                  borderLeft: providerVar
                    ? `3px solid ${providerVar}`
                    : undefined,
                }}
              >
                <span
                  className="text-[var(--font-sm)] font-semibold text-neutral-900 truncate leading-tight"
                  title={col.label}
                >
                  {col.label}
                </span>
                {col.sublabel && (
                  <span className="text-[var(--font-xs)] text-neutral-500 truncate leading-tight">
                    {col.sublabel}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Row grid — time axis + per-column cells (absolute-positioned blocks overlaid) */}
        {rows.map((rowStartMin, rowIdx) => (
          <GridRow
            key={`row-${rowIdx}`}
            rowIdx={rowIdx}
            rowStartMin={rowStartMin}
            slotMinutes={slotMinutes}
            slotHeightPx={slotHeightPx}
            columns={columns}
            cursor={cursor}
            setCursor={setCursor}
            onCellClick={handleCellClick}
            enableContentVisibility={enableContentVisibility}
          />
        ))}

        {/* Absolute-positioned blocks per column. Wrapped in role="row"
            so that aria-required-children (grid → row) is satisfied and
            the interactive BlockInstance buttons sit inside a gridcell,
            not directly under role="grid". `display: contents` keeps the
            wrappers semantic-only (CSS grid layout unaffected). */}
        {columns.map((col, colIdx) => {
          const colBlocks = blocksByColumn[col.id] ?? [];
          if (colBlocks.length === 0) return null;
          return (
            <div
              key={`blocks-row-${col.id}`}
              role="row"
              aria-rowindex={rowCount + 2 + colIdx}
              style={{ display: 'contents' }}
            >
              <div
                data-testid="sg-col-blocks"
                data-col-id={col.id}
                role="gridcell"
                aria-colindex={colIdx + 2}
                className="relative"
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: `2 / span ${rowCount}`,
                }}
              >
                {colBlocks.map((block) => {
                  const offsetSlots = Math.max(
                    0,
                    Math.round((block.startMinute - workingStartMin) / slotMinutes),
                  );
                  const topPx = offsetSlots * slotHeightPx;
                  return (
                    <div
                      key={block.blockInstanceId}
                      className="absolute left-1 right-1"
                      style={{ top: topPx }}
                    >
                      <BlockInstance
                        block={block}
                        slotHeightPx={slotHeightPx}
                        providerColor={
                          col.providerColorIndex
                            ? `var(--sg-provider-${Math.min(10, Math.max(1, col.providerColorIndex))})`
                            : undefined
                        }
                        providerColorSoft={
                          col.providerColorIndex
                            ? `var(--sg-provider-${Math.min(10, Math.max(1, col.providerColorIndex))}-soft)`
                            : undefined
                        }
                        isHovered={hoveredBlockId === block.blockInstanceId}
                        isSelected={selectedBlockId === block.blockInstanceId}
                        violations={violationsByBlock[block.blockInstanceId]}
                        isHygieneBlock={hygieneBlockIds?.has(block.blockInstanceId)}
                        procedureCategory={blockCategories?.get(block.blockInstanceId)}
                        onActivate={(id) => {
                          setSelectedBlockId(id);
                          onBlockActivate?.(block);
                        }}
                        onHoverChange={setHoveredBlockId}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Doctor-flow cross-column connectors (below blocks in stacking).
            Wrapped in role="row" + role="gridcell" so the SVG lives inside
            a valid grid descendant chain. aria-hidden keeps the SVG paths
            themselves out of the accessibility tree. */}
        {showDoctorFlow && !hideDoctorFlow && (
          <div
            role="row"
            aria-rowindex={rowCount + 2 + columns.length}
            style={{ display: 'contents' }}
          >
            <div
              role="gridcell"
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 'var(--z-doctor-flow-overlay)' as unknown as number,
                gridColumn: `2 / span ${Math.max(1, columns.length)}`,
                gridRow: `2 / span ${rowCount}`,
              }}
            >
              <DoctorFlowOverlay
                trace={schedule.doctorTrace}
                columns={columns}
                workingStartMin={workingStartMin}
                slotHeightPx={slotHeightPx}
                slotMinutes={slotMinutes}
              />
            </div>
          </div>
        )}
      </div>

      {/* Status line / live region for screen readers. Surfaces state
          transitions (selection, view-mode toggles, zoom) so non-sighted
          users hear what their input changed, not just "selected". */}
      <div className="sr-only" aria-live="polite" data-testid="sg-live-region">
        {selectedBlockId
          ? (() => {
              const sel = (schedule.blocks ?? []).find(
                (b) => b.blockInstanceId === selectedBlockId,
              );
              if (!sel) return `Selected block ${selectedBlockId}`;
              const startH = Math.floor(sel.startMinute / 60);
              const startM = sel.startMinute % 60;
              const endH = Math.floor((sel.startMinute + sel.durationMin) / 60);
              const endM = (sel.startMinute + sel.durationMin) % 60;
              return `Selected ${sel.blockLabel}, ${sel.durationMin} minutes from ${startH}:${String(startM).padStart(2, '0')} to ${endH}:${String(endM).padStart(2, '0')}, in ${sel.operatory}.`;
            })()
          : showXSegments
            ? 'X-segment view active. Press the toggle to return to compact view.'
            : showDoctorFlow
              ? 'Doctor-flow overlay shown.'
              : `Schedule ready. ${(schedule.blocks ?? []).length} blocks across ${columns.length} ${columns.length === 1 ? 'column' : 'columns'}. Navigate with arrow keys; Home and End jump to row edges; press Enter on a block to select.`}
      </div>
    </div>
  );
});

export default ScheduleGrid;

/* ══════════════════════════════════════════════════════════════════
   GridRow — time rail cell + N empty column cells per 10-min row.
   Blocks are overlaid on top via absolute positioning.
   ══════════════════════════════════════════════════════════════════ */

interface GridRowProps {
  rowIdx: number;
  rowStartMin: number;
  slotMinutes: number;
  slotHeightPx: number;
  columns: ScheduleGridColumn[];
  cursor: { rowIndex: number; colIndex: number } | null;
  setCursor: (c: { rowIndex: number; colIndex: number }) => void;
  /** Called when a cell is clicked — allows parent to refocus grid root. */
  onCellClick?: (rowIndex: number, colIndex: number) => void;
  enableContentVisibility: boolean;
}

const GridRow = memo(function GridRow({
  rowIdx,
  rowStartMin,
  slotMinutes: _slotMinutes,
  slotHeightPx,
  columns,
  cursor,
  setCursor,
  onCellClick,
  enableContentVisibility,
}: GridRowProps) {
  const label = minuteLabel(rowStartMin);
  const isHourTick = rowStartMin % 60 === 0;
  const isHalfHourTick = rowStartMin % 30 === 0;

  const tickStyle: React.CSSProperties = {
    height: slotHeightPx,
    willChange: 'height',
    transition: 'height var(--sg-transition-fast)',
    borderTop: isHourTick
      ? '1px solid rgba(17,24,39,0.20)'
      : isHalfHourTick
        ? '1px dashed rgba(17,24,39,0.15)'
        : '1px dashed rgba(17,24,39,0.06)',
    contentVisibility: enableContentVisibility ? 'auto' : undefined,
    containIntrinsicSize: enableContentVisibility
      ? `${slotHeightPx}px auto`
      : undefined,
  };

  return (
    // Wrap each row in role="row" so rowheader + gridcells have a parent row
    // per WCAG aria-required-parent. `display: contents` keeps the wrapper
    // layout-inert — the inner cells continue to participate in the parent
    // CSS grid as direct-placement children.
    <div role="row" aria-rowindex={rowIdx + 2} style={{ display: 'contents' }}>
      {/* Sticky time rail cell. Hour/half-hour ticks render dark for anchor
          scanning; intermediate 10/20/40/50 marks render muted so the eye
          can still land on the hour lines quickly. */}
      <div
        data-testid="sg-time-cell"
        data-row-index={rowIdx}
        data-row-minute={rowStartMin}
        role="rowheader"
        aria-rowindex={rowIdx + 2}
        className="sticky left-0 bg-white px-1 flex items-start justify-end pr-2 border-r border-neutral-200"
        style={{
          ...tickStyle,
          zIndex: 'var(--z-sticky-time-col)' as unknown as number,
        }}
      >
        {label && (
          <span
            className={`text-[10px] tabular-nums leading-none ${
              isHourTick
                ? 'font-semibold text-neutral-900'
                : isHalfHourTick
                  ? 'font-medium text-neutral-700'
                  : 'text-neutral-400'
            }`}
          >
            {label}
          </span>
        )}
      </div>

      {/* Column cells */}
      {columns.map((col, colIdx) => {
        const isCursorHere =
          !!cursor && cursor.rowIndex === rowIdx && cursor.colIndex === colIdx;
        return (
          <div
            key={`cell-${rowIdx}-${col.id}`}
            data-testid="sg-cell"
            data-row-index={rowIdx}
            data-col-id={col.id}
            data-col-index={colIdx}
            data-cursor={isCursorHere ? 'true' : undefined}
            role="gridcell"
            aria-rowindex={rowIdx + 2}
            aria-colindex={colIdx + 2}
            aria-current={isCursorHere ? 'true' : undefined}
            tabIndex={isCursorHere ? 0 : -1}
            onClick={() => {
              if (onCellClick) {
                onCellClick(rowIdx, colIdx);
              } else {
                setCursor({ rowIndex: rowIdx, colIndex: colIdx });
              }
            }}
            className={`border-r border-neutral-100 ${
              isCursorHere ? 'ring-1 ring-inset ring-neutral-900' : ''
            }`}
            style={tickStyle}
          />
        );
      })}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════════
   ZoomControls — small, unobtrusive UI control mirroring Ctrl+/-
   ══════════════════════════════════════════════════════════════════ */

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: ScheduleZoom;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}) {
  const btnBase =
    'inline-flex items-center justify-center h-6 w-7 text-[var(--font-xs)] border rounded border-neutral-300 bg-white hover:bg-neutral-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]';
  const transitionStyle = {
    transition:
      'background-color var(--sg-transition-fast), box-shadow var(--sg-transition-fast), color var(--sg-transition-fast)',
  } as React.CSSProperties;
  return (
    <div
      className="flex items-center gap-1"
      data-testid="sg-zoom-controls"
      data-zoom={zoom}
    >
      <button
        type="button"
        aria-label="Zoom out"
        data-testid="sg-zoom-out"
        onClick={onZoomOut}
        className={btnBase}
        style={transitionStyle}
      >
        <IconZoomOut size="sm" />
      </button>
      <button
        type="button"
        aria-label="Reset zoom"
        data-testid="sg-zoom-reset"
        onClick={onReset}
        className="px-2 h-6 text-[var(--font-xs)] text-neutral-600 tabular-nums rounded focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        data-micro="true"
        style={transitionStyle}
      >
        {zoom}
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        data-testid="sg-zoom-in"
        onClick={onZoomIn}
        className={btnBase}
        style={transitionStyle}
      >
        <IconZoomIn size="sm" />
      </button>
    </div>
  );
}
