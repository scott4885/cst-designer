'use client';

/**
 * FlowTimeline — Sprint 17 Task 1 UI
 *
 * Horizontal timeline showing doctor movement across operatories.
 * Y-axis = operatories, X-axis = time.
 * Phases: D-time (dark blue), A-time (light blue), exam windows (green), conflicts (red).
 */

import React, { useState } from 'react';
import type { DoctorFlowResult, DoctorFlowSegment, ExamWindow, FlowConflict } from '@/lib/engine/doctor-flow';
import type { HygieneExamFitResult } from '@/lib/engine/hygiene-exam-finder';

interface FlowTimelineProps {
  flow: DoctorFlowResult;
  operatoryCount: number;
  startMin?: number;        // day start in minutes from midnight (default 480 = 08:00)
  endMin?: number;          // day end in minutes from midnight (default 1020 = 17:00)
  increment?: number;       // time increment in minutes (default 10)
  examRequests?: HygieneExamFitResult[];
  operatoryLabels?: string[];
}

// Color constants
const PHASE_COLORS = {
  D: { bg: '#1d4ed8', text: 'white', label: 'D-time' },
  A: { bg: '#93c5fd', text: '#1e3a5f', label: 'A-time' },
  transition: { bg: '#e5e7eb', text: '#6b7280', label: 'Transition' },
  empty: { bg: '#f3f4f6', text: '#9ca3af', label: 'Empty' },
};

const EXAM_FIT_COLORS: Record<string, string> = {
  fits: '#16a34a',
  tight: '#d97706',
  conflict: '#dc2626',
};

function minutesToTimeLabel(minutes: number, baseMin: number = 0): string {
  const totalMin = baseMin + minutes;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

interface TooltipData {
  x: number;
  y: number;
  content: React.ReactNode;
}

export function FlowTimeline({
  flow,
  operatoryCount,
  startMin = 480,
  endMin = 1020,
  increment: _increment = 10,
  examRequests = [],
  operatoryLabels,
}: FlowTimelineProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const totalMin = endMin - startMin;
  const ROW_HEIGHT = 48;
  const LABEL_WIDTH = 80;
  const TIMELINE_WIDTH = 800;

  function minToX(min: number): number {
    return (min / totalMin) * TIMELINE_WIDTH;
  }

  function renderSegment(seg: DoctorFlowSegment, idx: number) {
    const colors = PHASE_COLORS[seg.phase];
    const x = minToX(seg.startMin);
    const width = Math.max(minToX(seg.endMin) - x, 1);
    const y = seg.operatory * (ROW_HEIGHT + 4);

    return (
      <g key={`seg-${idx}`}>
        <rect
          x={x}
          y={y + 4}
          width={width}
          height={ROW_HEIGHT - 8}
          fill={colors.bg}
          rx={3}
          style={{ cursor: 'pointer' }}
          onMouseEnter={(e) => {
            const rect = (e.target as SVGElement).getBoundingClientRect();
            setTooltip({
              x: rect.left,
              y: rect.top - 60,
              content: (
                <div>
                  <div className="font-semibold">{seg.blockTypeName}</div>
                  <div>{seg.phase === 'D' ? '🔵 D-time' : '🔷 A-time'} · {seg.durationMin}min</div>
                  <div className="text-xs text-gray-500">
                    {minutesToTimeLabel(seg.startMin, startMin)} – {minutesToTimeLabel(seg.endMin, startMin)}
                  </div>
                </div>
              ),
            });
          }}
          onMouseLeave={() => setTooltip(null)}
        />
        {width > 40 && (
          <text
            x={x + width / 2}
            y={y + ROW_HEIGHT / 2 + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colors.text}
            fontSize={10}
            fontWeight={seg.phase === 'D' ? 'bold' : 'normal'}
            style={{ pointerEvents: 'none' }}
          >
            {seg.phase}
          </text>
        )}
      </g>
    );
  }

  function renderExamWindow(win: ExamWindow, idx: number) {
    const x = minToX(win.startMin);
    const width = Math.max(minToX(win.endMin) - x, 2);

    return (
      <rect
        key={`exam-win-${idx}`}
        x={x}
        y={0}
        width={width}
        height={operatoryCount * (ROW_HEIGHT + 4) - 4}
        fill="none"
        stroke="#16a34a"
        strokeWidth={2}
        strokeDasharray="4,2"
        rx={4}
        opacity={0.7}
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  function renderConflict(conflict: FlowConflict, idx: number) {
    const x = minToX(conflict.startMin);
    const width = Math.max(minToX(conflict.endMin) - x, 2);

    return (
      <rect
        key={`conflict-${idx}`}
        x={x}
        y={0}
        width={width}
        height={operatoryCount * (ROW_HEIGHT + 4) - 4}
        fill="#fee2e2"
        stroke="#dc2626"
        strokeWidth={2}
        rx={4}
        opacity={0.5}
        style={{ pointerEvents: 'none' }}
      />
    );
  }

  function renderExamRequest(req: HygieneExamFitResult, idx: number) {
    const x = minToX(req.request.requestedStartMin);
    const color = EXAM_FIT_COLORS[req.status] ?? '#6b7280';
    const y = operatoryCount * (ROW_HEIGHT + 4) + 12;

    return (
      <g key={`exam-req-${idx}`}>
        {/* Diamond marker */}
        <polygon
          points={`${x},${y - 8} ${x + 8},${y} ${x},${y + 8} ${x - 8},${y}`}
          fill={color}
          opacity={0.9}
          style={{ cursor: 'pointer' }}
          onMouseEnter={(e) => {
            const rect = (e.target as SVGElement).getBoundingClientRect();
            setTooltip({
              x: rect.left,
              y: rect.top - 80,
              content: (
                <div>
                  <div className="font-semibold">{req.request.blockTypeName}</div>
                  <div>Exam at {minutesToTimeLabel(req.request.requestedStartMin, startMin)}</div>
                  <div style={{ color }}>
                    {req.status === 'fits' ? '✅ Fits cleanly' :
                     req.status === 'tight' ? '⚠️ Tight fit' :
                     '❌ Conflict'}
                  </div>
                  {req.conflictBlockName && (
                    <div className="text-xs text-red-500">Blocked by: {req.conflictBlockName}</div>
                  )}
                  {req.suggestionMin !== null && (
                    <div className="text-xs text-gray-500">
                      Shift {req.suggestionMin > 0 ? '+' : ''}{req.suggestionMin}min to fit
                    </div>
                  )}
                </div>
              ),
            });
          }}
          onMouseLeave={() => setTooltip(null)}
        />
        <line
          x1={x} y1={0}
          x2={x} y2={y - 8}
          stroke={color}
          strokeWidth={1}
          strokeDasharray="3,2"
          opacity={0.5}
          style={{ pointerEvents: 'none' }}
        />
      </g>
    );
  }

  // Time axis tick marks
  const tickInterval = 60; // every hour
  const ticks: number[] = [];
  for (let t = 0; t <= totalMin; t += tickInterval) {
    ticks.push(t);
  }

  const svgHeight = operatoryCount * (ROW_HEIGHT + 4) + (examRequests.length > 0 ? 40 : 8);

  const fitCount = examRequests.filter(r => r.status === 'fits').length;
  const tightCount = examRequests.filter(r => r.status === 'tight').length;
  const conflictCount = examRequests.filter(r => r.status === 'conflict').length;

  return (
    <div className="flex flex-col gap-3">
      {/* Stats row */}
      <div className="flex gap-4 text-sm">
        <span className="font-medium text-gray-700">
          Doctor Utilization: <strong>{flow.doctorUtilization}%</strong>
        </span>
        <span className="text-green-600">
          🟢 {flow.examWindows.length} exam window{flow.examWindows.length !== 1 ? 's' : ''}
        </span>
        {flow.conflicts.length > 0 && (
          <span className="text-red-600">
            🔴 {flow.conflicts.length} conflict{flow.conflicts.length !== 1 ? 's' : ''}
          </span>
        )}
        {examRequests.length > 0 && (
          <span className="text-gray-600">
            Hygiene Exams: {fitCount > 0 && <span className="text-green-600">{fitCount} fit ✅</span>}
            {tightCount > 0 && <span className="text-amber-600 ml-1">{tightCount} tight ⚠️</span>}
            {conflictCount > 0 && <span className="text-red-600 ml-1">{conflictCount} conflicts ❌</span>}
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white p-4">
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Operatory labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0 }}>
            <div style={{ height: 20 }} /> {/* time axis spacer */}
            {Array.from({ length: operatoryCount }, (_, i) => (
              <div
                key={i}
                style={{
                  height: ROW_HEIGHT + 4,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#4b5563',
                }}
              >
                {operatoryLabels?.[i] ?? `Op ${i + 1}`}
              </div>
            ))}
            {examRequests.length > 0 && (
              <div style={{ height: 40, display: 'flex', alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
                Hygiene Exams
              </div>
            )}
          </div>

          {/* SVG timeline */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <svg width={TIMELINE_WIDTH} height={svgHeight + 20} style={{ display: 'block' }}>
              {/* Time axis */}
              <g transform="translate(0,0)">
                {ticks.map(t => (
                  <g key={t}>
                    <line
                      x1={minToX(t)} y1={0}
                      x2={minToX(t)} y2={svgHeight + 20}
                      stroke="#e5e7eb"
                      strokeWidth={1}
                    />
                    <text
                      x={minToX(t) + 2}
                      y={12}
                      fontSize={10}
                      fill="#9ca3af"
                    >
                      {minutesToTimeLabel(t, startMin)}
                    </text>
                  </g>
                ))}
              </g>

              {/* Timeline content */}
              <g transform="translate(0,20)">
                {/* Operatory row backgrounds */}
                {Array.from({ length: operatoryCount }, (_, i) => (
                  <rect
                    key={`row-bg-${i}`}
                    x={0}
                    y={i * (ROW_HEIGHT + 4)}
                    width={TIMELINE_WIDTH}
                    height={ROW_HEIGHT}
                    fill={i % 2 === 0 ? '#f9fafb' : '#ffffff'}
                    rx={4}
                  />
                ))}

                {/* Conflicts (render first so segments overlay) */}
                {flow.conflicts.map((c, i) => renderConflict(c, i))}

                {/* Exam windows */}
                {flow.examWindows.map((w, i) => renderExamWindow(w, i))}

                {/* Segments */}
                {flow.segments.map((seg, i) => renderSegment(seg, i))}

                {/* Exam request markers */}
                {examRequests.map((req, i) => renderExamRequest(req, i))}
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        {Object.entries(PHASE_COLORS).slice(0, 2).map(([phase, colors]) => (
          <div key={phase} className="flex items-center gap-1">
            <div style={{ width: 16, height: 10, backgroundColor: colors.bg, borderRadius: 2 }} />
            <span>{colors.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div style={{ width: 16, height: 10, border: '2px dashed #16a34a', borderRadius: 2 }} />
          <span>Exam Window</span>
        </div>
        <div className="flex items-center gap-1">
          <div style={{ width: 16, height: 10, backgroundColor: '#fee2e2', border: '2px solid #dc2626', borderRadius: 2 }} />
          <span>D-time Conflict</span>
        </div>
        {examRequests.length > 0 && (
          <>
            <div className="flex items-center gap-1">
              <div style={{ width: 10, height: 10, backgroundColor: '#16a34a', transform: 'rotate(45deg)' }} />
              <span>Exam Fits</span>
            </div>
            <div className="flex items-center gap-1">
              <div style={{ width: 10, height: 10, backgroundColor: '#d97706', transform: 'rotate(45deg)' }} />
              <span>Exam Tight</span>
            </div>
            <div className="flex items-center gap-1">
              <div style={{ width: 10, height: 10, backgroundColor: '#dc2626', transform: 'rotate(45deg)' }} />
              <span>Exam Conflict</span>
            </div>
          </>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            zIndex: 9999,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: 12,
            pointerEvents: 'none',
            maxWidth: 220,
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
