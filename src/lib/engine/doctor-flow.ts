/**
 * Doctor Flow Engine — Sprint 17 Task 1
 *
 * Builds a minute-by-minute view of a doctor's movement across operatories,
 * segmented into D-time (doctor hands-on) and A-time (assistant managed).
 * Identifies exam windows, conflicts, and utilization metrics.
 */

import type { BlockTypeInput } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Slot {
  blockTypeId: string | null;
  blockLabel: string | null;
  operatory: number;        // 0-indexed
  startMin: number;         // minutes from day start (e.g. 0 = 08:00 if startTime="08:00")
  durationMin: number;
}

export interface TimeRange {
  startMin: number;
  endMin: number;
}

export interface DoctorFlowSegment {
  startMin: number;         // minutes from day start
  endMin: number;
  operatory: number;        // 0-indexed
  blockTypeName: string;
  phase: 'D' | 'A' | 'transition' | 'empty';
  durationMin: number;
}

export interface ExamWindow {
  startMin: number;
  endMin: number;
  durationMin: number;
}

export interface FlowConflict {
  startMin: number;
  endMin: number;
  operatories: number[];
  description: string;
}

export interface DoctorFlowResult {
  segments: DoctorFlowSegment[];
  examWindows: ExamWindow[];
  conflicts: FlowConflict[];
  doctorUtilization: number;    // % of day doctor is in D-time
  aTimeGaps: TimeRange[];       // windows where doctor is free (in A-time across all ops)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get D-time ratio for a block type. Falls back to 0.5 if not set. */
function getDRatio(bt: BlockTypeInput): number {
  if (bt.dTimeMin && bt.durationMin > 0) {
    return bt.dTimeMin / bt.durationMin;
  }
  return 0.5;
}

/** Get A-time ratio for a block type. Falls back to 0.5 if not set. */
function getARatio(bt: BlockTypeInput): number {
  if (bt.aTimeMin && bt.durationMin > 0) {
    return bt.aTimeMin / bt.durationMin;
  }
  return 0.5;
}

// ---------------------------------------------------------------------------
// buildDoctorFlow
// ---------------------------------------------------------------------------

/**
 * Build a doctor flow result from the provider's scheduled slots.
 *
 * @param providerSlots  - The provider's scheduled blocks for the day
 * @param blockTypes     - Block type definitions (for D/A time ratios)
 * @param staggerOffsetMin - Minutes staggered per operatory
 * @param operatoryCount - Number of simultaneous operatories
 * @param startTime      - Day start time "HH:MM" (used for relative minute offsets)
 * @param increment      - Time increment in minutes (10 or 15)
 */
export function buildDoctorFlow(
  providerSlots: Slot[],
  blockTypes: BlockTypeInput[],
  staggerOffsetMin: number,
  operatoryCount: number,
  startTime: string,
  increment: number
): DoctorFlowResult {
  const blockTypeMap = new Map(blockTypes.map(bt => [bt.id, bt]));

  // Build segments from slots
  const segments: DoctorFlowSegment[] = [];

  for (const slot of providerSlots) {
    if (!slot.blockTypeId) continue;

    const bt = blockTypeMap.get(slot.blockTypeId);
    const label = slot.blockLabel ?? bt?.label ?? 'Unknown';
    const dRatio = bt ? getDRatio(bt) : 0.5;
    const _aRatio = bt ? getARatio(bt) : 0.5;
    void _aRatio;

    const totalDur = slot.durationMin;
    const dDur = Math.round(totalDur * dRatio);
    const aDur = totalDur - dDur;

    // Apply stagger offset: each operatory starts later
    const opOffset = slot.operatory * staggerOffsetMin;
    const slotStart = slot.startMin + opOffset;

    // D-time segment
    if (dDur > 0) {
      segments.push({
        startMin: slotStart,
        endMin: slotStart + dDur,
        operatory: slot.operatory,
        blockTypeName: label,
        phase: 'D',
        durationMin: dDur,
      });
    }

    // A-time segment
    if (aDur > 0) {
      segments.push({
        startMin: slotStart + dDur,
        endMin: slotStart + totalDur,
        operatory: slot.operatory,
        blockTypeName: label,
        phase: 'A',
        durationMin: aDur,
      });
    }
  }

  // Sort segments by start time
  segments.sort((a, b) => a.startMin - b.startMin || a.operatory - b.operatory);

  // --- Detect conflicts: D-time overlapping across operatories ---
  const conflicts: FlowConflict[] = [];
  const dSegments = segments.filter(s => s.phase === 'D');

  for (let i = 0; i < dSegments.length; i++) {
    for (let j = i + 1; j < dSegments.length; j++) {
      const a = dSegments[i];
      const b = dSegments[j];
      if (a.operatory === b.operatory) continue;

      const overlapStart = Math.max(a.startMin, b.startMin);
      const overlapEnd = Math.min(a.endMin, b.endMin);

      if (overlapEnd > overlapStart) {
        // Check if we already logged this conflict range
        const existing = conflicts.find(
          c => c.startMin === overlapStart && c.endMin === overlapEnd
        );
        if (existing) {
          if (!existing.operatories.includes(b.operatory)) {
            existing.operatories.push(b.operatory);
          }
        } else {
          conflicts.push({
            startMin: overlapStart,
            endMin: overlapEnd,
            operatories: [a.operatory, b.operatory],
            description: `Doctor needed in Op ${a.operatory + 1} and Op ${b.operatory + 1} simultaneously`,
          });
        }
      }
    }
  }

  // --- Find A-time gaps: doctor is free (all ops in A-time or empty) ---
  // Only scan if there are segments to analyze
  if (segments.length === 0) {
    return { segments: [], examWindows: [], conflicts: [], doctorUtilization: 0, aTimeGaps: [] };
  }

  const minTime = Math.min(...segments.map(s => s.startMin));
  const maxTime = Math.max(...segments.map(s => s.endMin));
  const aTimeGaps: TimeRange[] = [];
  const examWindows: ExamWindow[] = [];

  // Scan minute by minute to find D-time-free windows
  const MIN_EXAM_WINDOW = 10;
  let gapStart: number | null = null;

  for (let t = minTime; t <= maxTime; t += increment) {
    const hasDTime = dSegments.some(s => s.startMin <= t && s.endMin > t);

    if (!hasDTime) {
      if (gapStart === null) gapStart = t;
    } else {
      if (gapStart !== null) {
        const gapEnd = t;
        const gapDur = gapEnd - gapStart;
        aTimeGaps.push({ startMin: gapStart, endMin: gapEnd });
        if (gapDur >= MIN_EXAM_WINDOW) {
          examWindows.push({ startMin: gapStart, endMin: gapEnd, durationMin: gapDur });
        }
        gapStart = null;
      }
    }
  }
  // Close any trailing gap
  if (gapStart !== null) {
    const gapEnd = maxTime;
    const gapDur = gapEnd - gapStart;
    aTimeGaps.push({ startMin: gapStart, endMin: gapEnd });
    if (gapDur >= MIN_EXAM_WINDOW) {
      examWindows.push({ startMin: gapStart, endMin: gapEnd, durationMin: gapDur });
    }
  }

  // --- Doctor utilization: % of scheduled time in D-time ---
  const totalDTimeMin = dSegments.reduce((sum, s) => sum + s.durationMin, 0);
  const totalScheduledMin = maxTime - minTime;
  const doctorUtilization = totalScheduledMin > 0
    ? Math.round((totalDTimeMin / totalScheduledMin) * 100)
    : 0;

  return {
    segments,
    examWindows,
    conflicts,
    doctorUtilization,
    aTimeGaps,
  };
}
