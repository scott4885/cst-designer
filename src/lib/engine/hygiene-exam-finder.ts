/**
 * Hygiene Exam Window Finder — Sprint 17 Task 3
 *
 * For each hygienist's schedule, calculates when the doctor needs to step out
 * for a hygiene exam and evaluates whether it fits in the doctor's flow.
 */

import type { BlockTypeInput } from './types';
import type { ExamWindow } from './doctor-flow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HygienistSlot {
  blockTypeId: string | null;
  blockLabel: string | null;
  hygienistId: string;
  startMin: number;       // minutes from day start
  durationMin: number;
}

export interface HygieneExamRequest {
  hygienistId: string;
  requestedStartMin: number;   // when exam is needed (appointment start + offset)
  flexMin: number;             // flexibility window (±flexMin)
  blockTypeName: string;       // "Prophy", "NP Exam", etc.
  appointmentStartMin: number; // original appointment start
}

export type ExamFitStatus = 'fits' | 'tight' | 'conflict';

export interface HygieneExamFitResult {
  request: HygieneExamRequest;
  status: ExamFitStatus;
  matchedWindow: ExamWindow | null;    // the doctor exam window it fits in (if any)
  conflictBlockName: string | null;    // which doctor block is blocking the exam
  suggestionMin: number | null;        // suggested shift in minutes to make it fit
}

export interface HygieneExamSummary {
  requests: HygieneExamFitResult[];
  fitCount: number;
  tightCount: number;
  conflictCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseStartMinutes(startTime: string): number {
  const [h, m] = startTime.split(':').map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// findHygieneExamWindows
// ---------------------------------------------------------------------------

/**
 * Calculate when hygiene exams are needed based on the hygienist's schedule.
 *
 * @param hygienistSlots  - Hygienist's scheduled blocks
 * @param blockTypes      - Block type definitions (for dTimeOffsetMin)
 * @param examOffsetMin   - Default minutes into appointment when exam is needed (default 45)
 * @param examDurationMin - Duration of the exam in minutes (default 10)
 * @param startTime       - Day start time "HH:MM"
 */
export function findHygieneExamWindows(
  hygienistSlots: HygienistSlot[],
  blockTypes: BlockTypeInput[],
  examOffsetMin: number = 45,
  examDurationMin: number = 10,
  startTime: string = '08:00'
): HygieneExamRequest[] {
  const blockTypeMap = new Map(blockTypes.map(bt => [bt.id, bt]));
  const requests: HygieneExamRequest[] = [];

  for (const slot of hygienistSlots) {
    if (!slot.blockTypeId) continue;

    const bt = blockTypeMap.get(slot.blockTypeId);
    // Use block type's dTimeOffsetMin if set, otherwise fall back to examOffsetMin
    const offset = bt?.dTimeOffsetMin ?? examOffsetMin;

    // Exam happens `offset` minutes into the appointment
    const requestedStart = slot.startMin + offset;

    requests.push({
      hygienistId: slot.hygienistId,
      requestedStartMin: requestedStart,
      flexMin: 5,    // ±5 min flexibility
      blockTypeName: slot.blockLabel ?? bt?.label ?? 'Hygiene Appointment',
      appointmentStartMin: slot.startMin,
    });
  }

  // Sort by requested start time
  requests.sort((a, b) => a.requestedStartMin - b.requestedStartMin);

  return requests;
}

// ---------------------------------------------------------------------------
// scoreExamFit
// ---------------------------------------------------------------------------

/**
 * Score each hygiene exam request against the doctor's available exam windows.
 *
 * @param requests     - Exam requests from findHygieneExamWindows
 * @param examWindows  - Doctor's available exam windows from buildDoctorFlow
 * @param examDurationMin - Duration of each exam
 */
export function scoreExamFit(
  requests: HygieneExamRequest[],
  examWindows: ExamWindow[],
  dTimeSegments: { startMin: number; endMin: number; blockTypeName: string }[],
  examDurationMin: number = 10
): HygieneExamFitResult[] {
  return requests.map(req => {
    const examEnd = req.requestedStartMin + examDurationMin;
    const flex = req.flexMin;

    // Check each doctor exam window
    for (const win of examWindows) {
      // Exam fits if the requested time (+flex) falls within the window
      const flexStart = req.requestedStartMin - flex;
      const flexEnd = examEnd + flex;

      if (win.startMin <= flexStart && win.endMin >= examEnd) {
        // Perfect fit — doctor is free during exam
        return {
          request: req,
          status: 'fits' as ExamFitStatus,
          matchedWindow: win,
          conflictBlockName: null,
          suggestionMin: null,
        };
      }

      if (win.startMin <= flexEnd && win.endMin >= (req.requestedStartMin - flex)) {
        // Tight — exam is within 5 min of window boundary
        return {
          request: req,
          status: 'tight' as ExamFitStatus,
          matchedWindow: win,
          conflictBlockName: null,
          suggestionMin: null,
        };
      }
    }

    // No window found — find the conflicting D-time block
    const conflictingBlock = dTimeSegments.find(
      seg =>
        seg.startMin < examEnd &&
        seg.endMin > req.requestedStartMin
    );

    // Suggest shifting: find nearest exam window
    let suggestionMin: number | null = null;
    if (examWindows.length > 0) {
      const nearest = examWindows.reduce((best, win) => {
        const distToBest = Math.abs(best.startMin - req.requestedStartMin);
        const distToWin = Math.abs(win.startMin - req.requestedStartMin);
        return distToWin < distToBest ? win : best;
      });
      suggestionMin = nearest.startMin - req.requestedStartMin;
    }

    return {
      request: req,
      status: 'conflict' as ExamFitStatus,
      matchedWindow: null,
      conflictBlockName: conflictingBlock?.blockTypeName ?? null,
      suggestionMin,
    };
  });
}

// ---------------------------------------------------------------------------
// buildHygieneExamSummary
// ---------------------------------------------------------------------------

/**
 * Build a full summary of exam fit results.
 */
export function buildHygieneExamSummary(
  hygienistSlots: HygienistSlot[],
  blockTypes: BlockTypeInput[],
  examWindows: ExamWindow[],
  dTimeSegments: { startMin: number; endMin: number; blockTypeName: string }[],
  examOffsetMin: number = 45,
  examDurationMin: number = 10,
  startTime: string = '08:00'
): HygieneExamSummary {
  const requests = findHygieneExamWindows(
    hygienistSlots,
    blockTypes,
    examOffsetMin,
    examDurationMin,
    startTime
  );

  const results = scoreExamFit(requests, examWindows, dTimeSegments, examDurationMin);

  return {
    requests: results,
    fitCount: results.filter(r => r.status === 'fits').length,
    tightCount: results.filter(r => r.status === 'tight').length,
    conflictCount: results.filter(r => r.status === 'conflict').length,
  };
}
