/**
 * useScheduleView — Sprint 2 Stream B
 * ───────────────────────────────────
 * Pure client-state store for the V2 schedule canvas. No server state, no
 * engine state. Holds:
 *   - zoom (compact / default / expanded) — drives `--sg-row-height`
 *   - cursor (for keyboard nav — row index + column index)
 *   - hoveredBlockId (for popover + doctor-flow overlay highlight)
 *   - selectedBlockId (Enter on cursor cell)
 *   - showDoctorFlow (toggle the DoctorFlowOverlay)
 *
 * Bible references: §3 (doctor X-segment graph), §2.1 (X-segment primitive).
 * PRD-V4 references: §10.4 UX-L1..UX-L12.
 * Sprint plan: T-201 / T-205.
 */

import { create } from 'zustand';

export type ScheduleZoom = 'compact' | 'default' | 'expanded';

export interface GridCursor {
  rowIndex: number;   // 0-based index into visible 10-min slot rows
  colIndex: number;   // 0-based index into visible provider columns
}

interface ScheduleViewState {
  zoom: ScheduleZoom;
  cursor: GridCursor | null;
  hoveredBlockId: string | null;
  selectedBlockId: string | null;
  showDoctorFlow: boolean;

  setZoom: (zoom: ScheduleZoom) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  setCursor: (cursor: GridCursor | null) => void;
  moveCursor: (dRow: number, dCol: number, rowBound: number, colBound: number) => void;

  setHoveredBlockId: (id: string | null) => void;
  setSelectedBlockId: (id: string | null) => void;

  setShowDoctorFlow: (v: boolean) => void;
  toggleDoctorFlow: () => void;
}

const ZOOM_ORDER: ScheduleZoom[] = ['compact', 'default', 'expanded'];

export const useScheduleView = create<ScheduleViewState>((set, get) => ({
  zoom: 'default',
  cursor: null,
  hoveredBlockId: null,
  selectedBlockId: null,
  showDoctorFlow: false,

  setZoom: (zoom) => set({ zoom }),
  zoomIn: () => {
    const idx = ZOOM_ORDER.indexOf(get().zoom);
    if (idx < ZOOM_ORDER.length - 1) set({ zoom: ZOOM_ORDER[idx + 1] });
  },
  zoomOut: () => {
    const idx = ZOOM_ORDER.indexOf(get().zoom);
    if (idx > 0) set({ zoom: ZOOM_ORDER[idx - 1] });
  },

  setCursor: (cursor) => set({ cursor }),
  moveCursor: (dRow, dCol, rowBound, colBound) => {
    const cur = get().cursor ?? { rowIndex: 0, colIndex: 0 };
    const nextRow = Math.max(0, Math.min(rowBound - 1, cur.rowIndex + dRow));
    const nextCol = Math.max(0, Math.min(colBound - 1, cur.colIndex + dCol));
    set({ cursor: { rowIndex: nextRow, colIndex: nextCol } });
  },

  setHoveredBlockId: (id) => set({ hoveredBlockId: id }),
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),

  setShowDoctorFlow: (v) => set({ showDoctorFlow: v }),
  toggleDoctorFlow: () => set((s) => ({ showDoctorFlow: !s.showDoctorFlow })),
}));

/** Pixel height for a 10-min slot at each zoom. Kept in sync with design-tokens.css. */
export const ZOOM_ROW_HEIGHT_PX: Record<ScheduleZoom, number> = {
  compact: 24,
  default: 32,
  expanded: 48,
};
