/**
 * Stagger Optimizer — Sprint 17 Task 2
 *
 * Resequences procedures for minimum doctor idle time and maximum
 * hygiene exam alignment using a greedy hill-climb approach.
 */

import { buildDoctorFlow } from './doctor-flow';
import type { Slot, DoctorFlowResult } from './doctor-flow';
import type { BlockTypeInput } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProcedureToSchedule {
  blockTypeId: string;
  blockLabel: string;
  durationMin: number;
  dRatio: number;   // 0–1 fraction of duration that is D-time
  aRatio: number;   // 0–1 fraction of duration that is A-time
}

export interface StaggerOptimizationResult {
  sequence: ProcedureToSchedule[];
  projectedFlow: DoctorFlowResult;
  examsCovered: number;
  doctorIdleMinutes: number;
  improvementVsPrevious: number | null;
  explanation: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a sequence of procedures into Slots for buildDoctorFlow */
function sequenceToSlots(
  sequence: ProcedureToSchedule[],
  operatoryCount: number,
  staggerOffsetMin: number
): Slot[] {
  const slots: Slot[] = [];
  // Track current time cursor per operatory
  const cursors = new Array(operatoryCount).fill(0);

  sequence.forEach((proc, idx) => {
    const op = idx % operatoryCount;
    slots.push({
      blockTypeId: proc.blockTypeId,
      blockLabel: proc.blockLabel,
      operatory: op,
      startMin: cursors[op],
      durationMin: proc.durationMin,
    });
    cursors[op] += proc.durationMin;
  });

  return slots;
}

/** Build block types array from procedures (for buildDoctorFlow) */
function proceduresToBlockTypes(procedures: ProcedureToSchedule[]): BlockTypeInput[] {
  const seen = new Set<string>();
  const bts: BlockTypeInput[] = [];
  for (const p of procedures) {
    if (!seen.has(p.blockTypeId)) {
      seen.add(p.blockTypeId);
      bts.push({
        id: p.blockTypeId,
        label: p.blockLabel,
        appliesToRole: 'DOCTOR',
        durationMin: p.durationMin,
        dTimeMin: Math.round(p.durationMin * p.dRatio),
        aTimeMin: Math.round(p.durationMin * p.aRatio),
      });
    }
  }
  return bts;
}

/** Score a flow: lower is better. Penalizes idle time, rewards exam coverage. */
function scoreFlow(flow: DoctorFlowResult, hygExamIntervalMin: number, hygienistCount: number): number {
  // Estimate how many exams we need based on total A-time gaps
  const totalATimeMin = flow.aTimeGaps.reduce((s, g) => s + (g.endMin - g.startMin), 0);
  const examsNeeded = hygienistCount > 0 && hygExamIntervalMin > 0
    ? Math.ceil((totalATimeMin / hygExamIntervalMin) * hygienistCount)
    : 0;

  // Idle penalty: conflicts are bad (doctor double-booked)
  const conflictPenalty = flow.conflicts.reduce((s, c) => s + (c.endMin - c.startMin), 0);

  // Exam coverage score (more exam windows = better)
  const examCoverage = flow.examWindows.length;

  return conflictPenalty * 10 - examCoverage * 5;
}

/** Count how many hygiene exam slots fit in the exam windows */
function countExamsCovered(flow: DoctorFlowResult, hygExamIntervalMin: number, hygienistCount: number): number {
  if (hygienistCount === 0 || hygExamIntervalMin === 0) return 0;
  let covered = 0;
  for (const win of flow.examWindows) {
    covered += Math.floor(win.durationMin / hygExamIntervalMin);
  }
  return Math.min(covered * hygienistCount, covered);
}

/** Calculate total doctor idle minutes (time between segments in same op where doctor is unoccupied) */
function calcIdleMinutes(flow: DoctorFlowResult): number {
  // Idle = time within the schedule window not in any D-time or A-time segment
  if (flow.segments.length === 0) return 0;
  const minT = Math.min(...flow.segments.map(s => s.startMin));
  const maxT = Math.max(...flow.segments.map(s => s.endMin));
  const scheduledMin = flow.segments.reduce((s, seg) => s + seg.durationMin, 0);
  return Math.max(0, (maxT - minT) - scheduledMin);
}

// ---------------------------------------------------------------------------
// optimizeStagger
// ---------------------------------------------------------------------------

/**
 * Find the optimal procedure sequence to minimize doctor idle time
 * and maximize hygiene exam window coverage.
 */
export function optimizeStagger(
  procedures: ProcedureToSchedule[],
  operatoryCount: number,
  staggerOffsetMin: number,
  hygienistCount: number,
  hygExamIntervalMin: number = 50
): StaggerOptimizationResult {
  if (procedures.length === 0) {
    const emptyFlow = buildDoctorFlow([], [], staggerOffsetMin, operatoryCount, '08:00', 10);
    return {
      sequence: [],
      projectedFlow: emptyFlow,
      examsCovered: 0,
      doctorIdleMinutes: 0,
      improvementVsPrevious: null,
      explanation: ['No procedures to optimize.'],
    };
  }

  const blockTypes = proceduresToBlockTypes(procedures);

  // Compute score for original sequence
  const originalSlots = sequenceToSlots(procedures, operatoryCount, staggerOffsetMin);
  const originalFlow = buildDoctorFlow(originalSlots, blockTypes, staggerOffsetMin, operatoryCount, '08:00', 10);
  const originalScore = scoreFlow(originalFlow, hygExamIntervalMin, hygienistCount);
  const originalIdle = calcIdleMinutes(originalFlow);

  // Step 1: Sort by D-time descending (longest D-time first)
  const sorted = [...procedures].sort((a, b) => {
    const aDTime = a.durationMin * a.dRatio;
    const bDTime = b.durationMin * b.dRatio;
    return bDTime - aDTime;
  });

  let bestSequence = sorted;
  let bestSlots = sequenceToSlots(sorted, operatoryCount, staggerOffsetMin);
  let bestFlow = buildDoctorFlow(bestSlots, blockTypes, staggerOffsetMin, operatoryCount, '08:00', 10);
  let bestScore = scoreFlow(bestFlow, hygExamIntervalMin, hygienistCount);

  // Step 2: Greedy hill-climb — try swapping adjacent procedures
  let improved = true;
  let iterations = 0;
  const MAX_ITER = 50;

  while (improved && iterations < MAX_ITER) {
    improved = false;
    iterations++;

    for (let i = 0; i < bestSequence.length - 1; i++) {
      const candidate = [...bestSequence];
      // Swap adjacent
      [candidate[i], candidate[i + 1]] = [candidate[i + 1], candidate[i]];

      const candidateSlots = sequenceToSlots(candidate, operatoryCount, staggerOffsetMin);
      const candidateFlow = buildDoctorFlow(candidateSlots, blockTypes, staggerOffsetMin, operatoryCount, '08:00', 10);
      const candidateScore = scoreFlow(candidateFlow, hygExamIntervalMin, hygienistCount);

      if (candidateScore < bestScore) {
        bestScore = candidateScore;
        bestSequence = candidate;
        bestSlots = candidateSlots;
        bestFlow = candidateFlow;
        improved = true;
        break; // restart from beginning after improvement
      }
    }
  }

  const optimizedIdle = calcIdleMinutes(bestFlow);
  const examsCovered = countExamsCovered(bestFlow, hygExamIntervalMin, hygienistCount);

  // Compute improvement vs previous
  let improvementVsPrevious: number | null = null;
  if (originalScore !== 0) {
    improvementVsPrevious = Math.round(((originalScore - bestScore) / Math.abs(originalScore)) * 100);
  } else if (bestScore < originalScore) {
    improvementVsPrevious = 100;
  }

  // Build explanation
  const explanation: string[] = [];
  if (bestSequence.length > 0) {
    const first = bestSequence[0];
    const firstDTime = Math.round(first.durationMin * first.dRatio);
    explanation.push(
      `${first.blockLabel} first — ${firstDTime}min D-time creates ideal stagger gap`
    );
  }
  if (optimizedIdle < originalIdle) {
    explanation.push(
      `Doctor idle time reduced from ${originalIdle}min to ${optimizedIdle}min`
    );
  }
  if (bestFlow.examWindows.length > 0) {
    explanation.push(
      `${bestFlow.examWindows.length} exam window${bestFlow.examWindows.length > 1 ? 's' : ''} created for hygiene coverage`
    );
  }
  if (bestFlow.conflicts.length > 0) {
    explanation.push(
      `⚠️ ${bestFlow.conflicts.length} D-time conflict${bestFlow.conflicts.length > 1 ? 's' : ''} remain — consider adjusting stagger offset`
    );
  } else {
    explanation.push('No D-time conflicts — doctor flow is clean');
  }

  return {
    sequence: bestSequence,
    projectedFlow: bestFlow,
    examsCovered,
    doctorIdleMinutes: optimizedIdle,
    improvementVsPrevious,
    explanation,
  };
}
