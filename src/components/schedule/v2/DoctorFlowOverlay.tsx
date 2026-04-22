"use client";

/**
 * DoctorFlowOverlay — Sprint 2 Stream B
 * ─────────────────────────────────────
 * Renders dashed, low-contrast connector lines showing how a single doctor
 * moves between operatories (columns) across the schedule. Each connector
 * links the END of one D-band to the START of the next D-band for the same
 * doctor (in minute-of-day order).
 *
 * Toggleable via useScheduleView.showDoctorFlow.
 * Bible §3 (doctor X-segment graph — doctor-as-bottleneck invariant).
 * PRD-V4 UX-L6, UX-L9.
 *
 * Renders an SVG that overlays the grid body. Parent positions it absolutely
 * over the blocks layer, so we only need to compute x/y within our own
 * bounding box (via ResizeObserver on the SVG container).
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { DoctorScheduleTrace } from '@/lib/engine/types';
import type { ScheduleGridColumn } from './ScheduleGrid';

export interface DoctorFlowOverlayProps {
  trace: DoctorScheduleTrace[];
  columns: ScheduleGridColumn[];
  workingStartMin: number;
  slotHeightPx: number;
  slotMinutes: number;
  /** Optional: highlight a single doctor id (others dim). */
  highlightDoctorId?: string | null;
}

interface FlowSegment {
  doctorProviderId: string;
  fromColIdx: number;
  toColIdx: number;
  fromYPx: number;
  toYPx: number;
  fromMin: number;
  toMin: number;
}

const DoctorFlowOverlay = memo(function DoctorFlowOverlay({
  trace,
  columns,
  workingStartMin,
  slotHeightPx,
  slotMinutes,
  highlightDoctorId,
}: DoctorFlowOverlayProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [wrapSize, setWrapSize] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  // Measure the overlay container so we can convert colIdx → x midpoint.
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === 'undefined') return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const colById = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [columns]);

  /**
   * Build per-doctor sequence of D-bands sorted by start minute, then
   * emit a segment between consecutive operatories.
   */
  const segments = useMemo<FlowSegment[]>(() => {
    if (!trace?.length || columns.length === 0) return [];
    const byDoctor = new Map<string, DoctorScheduleTrace[]>();
    for (const t of trace) {
      if (!byDoctor.has(t.doctorProviderId)) byDoctor.set(t.doctorProviderId, []);
      byDoctor.get(t.doctorProviderId)!.push(t);
    }
    const out: FlowSegment[] = [];
    for (const [doctorId, bands] of byDoctor) {
      const sorted = [...bands].sort((a, b) => a.doctorStartMinute - b.doctorStartMinute);
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i];
        const to = sorted[i + 1];
        const fromCol = colById.get(from.operatory);
        const toCol = colById.get(to.operatory);
        if (fromCol === undefined || toCol === undefined) continue;
        if (fromCol === toCol) continue; // same column = no cross-column line
        const fromY =
          ((from.doctorEndMinute - workingStartMin) / slotMinutes) * slotHeightPx;
        const toY =
          ((to.doctorStartMinute - workingStartMin) / slotMinutes) * slotHeightPx;
        out.push({
          doctorProviderId: doctorId,
          fromColIdx: fromCol,
          toColIdx: toCol,
          fromYPx: fromY,
          toYPx: toY,
          fromMin: from.doctorEndMinute,
          toMin: to.doctorStartMinute,
        });
      }
    }
    return out;
  }, [trace, columns, colById, workingStartMin, slotHeightPx, slotMinutes]);

  // Column x midpoint in px, based on measured width / column count.
  const colMidX = (idx: number) => {
    if (wrapSize.w === 0 || columns.length === 0) return 0;
    const colW = wrapSize.w / columns.length;
    return colW * (idx + 0.5);
  };

  return (
    <div
      ref={wrapRef}
      data-testid="sg-doctor-flow-overlay"
      className="absolute inset-0"
    >
      {wrapSize.w > 0 && segments.length > 0 && (
        <svg
          width={wrapSize.w}
          height={wrapSize.h}
          viewBox={`0 0 ${wrapSize.w} ${wrapSize.h}`}
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          {segments.map((seg, i) => {
            const x1 = colMidX(seg.fromColIdx);
            const x2 = colMidX(seg.toColIdx);
            const y1 = seg.fromYPx;
            const y2 = seg.toYPx;
            const midY = (y1 + y2) / 2;
            const dimmed =
              highlightDoctorId && highlightDoctorId !== seg.doctorProviderId;
            const d = `M ${x1},${y1} C ${x1},${midY} ${x2},${midY} ${x2},${y2}`;
            return (
              <g key={`${seg.doctorProviderId}-${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={dimmed ? 'rgba(17,24,39,0.15)' : 'rgba(17,24,39,0.50)'}
                  strokeWidth={dimmed ? 1 : 1.25}
                  strokeDasharray="4 3"
                  data-testid="sg-doctor-flow-path"
                  data-doctor-id={seg.doctorProviderId}
                  data-from-min={seg.fromMin}
                  data-to-min={seg.toMin}
                />
                <circle
                  cx={x1}
                  cy={y1}
                  r={2}
                  fill={dimmed ? 'rgba(17,24,39,0.15)' : 'rgba(17,24,39,0.50)'}
                />
                <circle
                  cx={x2}
                  cy={y2}
                  r={2}
                  fill={dimmed ? 'rgba(17,24,39,0.15)' : 'rgba(17,24,39,0.50)'}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
});

export default DoctorFlowOverlay;
