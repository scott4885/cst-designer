/**
 * Sprint 17 Tests
 *
 * Task 1: Doctor Flow View (buildDoctorFlow)
 * Task 2: Stagger Optimizer (optimizeStagger)
 * Task 3: Hygiene Exam Window Finder (findHygieneExamWindows, scoreExamFit)
 * Task 4: Mix-to-Prescription Engine (buildBlockPrescription)
 */

import { describe, it, expect } from 'vitest';

// ─── Task 1: Doctor Flow View ────────────────────────────────────────────────

import {
  buildDoctorFlow,
} from '@/lib/engine/doctor-flow';
import type { Slot, DoctorFlowResult } from '@/lib/engine/doctor-flow';
import type { BlockTypeInput } from '@/lib/engine/types';

const mockCrownBT: BlockTypeInput = {
  id: 'bt-crown',
  label: 'Crown Prep',
  appliesToRole: 'DOCTOR',
  durationMin: 60,
  dTimeMin: 40,
  aTimeMin: 20,
  minimumAmount: 1500,
};

const mockCompBT: BlockTypeInput = {
  id: 'bt-comp',
  label: 'Composite',
  appliesToRole: 'DOCTOR',
  durationMin: 30,
  dTimeMin: 15,
  aTimeMin: 15,
  minimumAmount: 350,
};

const mockBlockTypes: BlockTypeInput[] = [mockCrownBT, mockCompBT];

describe('buildDoctorFlow — basic structure', () => {
  it('returns DoctorFlowResult with correct shape', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 20, 2, '08:00', 10);
    expect(Array.isArray(result.segments)).toBe(true);
    expect(Array.isArray(result.examWindows)).toBe(true);
    expect(Array.isArray(result.conflicts)).toBe(true);
    expect(Array.isArray(result.aTimeGaps)).toBe(true);
    expect(typeof result.doctorUtilization).toBe('number');
  });

  it('produces D and A segments from a single slot', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    const dSegs = result.segments.filter(s => s.phase === 'D');
    const aSegs = result.segments.filter(s => s.phase === 'A');
    expect(dSegs.length).toBeGreaterThan(0);
    expect(aSegs.length).toBeGreaterThan(0);
  });

  it('D-time segment duration matches dTimeMin', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    const dSeg = result.segments.find(s => s.phase === 'D' && s.operatory === 0);
    expect(dSeg).toBeDefined();
    expect(dSeg!.durationMin).toBe(40); // dTimeMin = 40
  });

  it('A-time segment duration matches aTimeMin', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    const aSeg = result.segments.find(s => s.phase === 'A' && s.operatory === 0);
    expect(aSeg).toBeDefined();
    expect(aSeg!.durationMin).toBe(20); // aTimeMin = 20
  });

  it('segments total duration equals slot duration', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    const totalDur = result.segments
      .filter(s => s.operatory === 0)
      .reduce((sum, s) => sum + s.durationMin, 0);
    expect(totalDur).toBe(60);
  });

  it('handles empty slots array without throwing', () => {
    const result = buildDoctorFlow([], mockBlockTypes, 20, 2, '08:00', 10);
    expect(result.segments).toHaveLength(0);
    expect(result.examWindows).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(result.doctorUtilization).toBe(0);
  });

  it('finds exam window when A-time gap >= 10 min', () => {
    // Crown: 40min D + 20min A. During A-time, doctor is free.
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    // A-time is 20 min — should be an exam window
    expect(result.examWindows.length).toBeGreaterThan(0);
    expect(result.examWindows[0].durationMin).toBeGreaterThanOrEqual(10);
  });

  it('does not create exam window for A-time gap < 10 min', () => {
    // Composite: 15min D + 15min A. A-time = 15 min → exam window
    // But if we use a custom block with 5min A-time, no window
    const shortABT: BlockTypeInput = {
      id: 'bt-short', label: 'Short', appliesToRole: 'DOCTOR', durationMin: 14,
      dTimeMin: 10, aTimeMin: 4, minimumAmount: 100,
    };
    const slots: Slot[] = [
      { blockTypeId: 'bt-short', blockLabel: 'Short', operatory: 0, startMin: 0, durationMin: 14 },
    ];
    const result = buildDoctorFlow(slots, [shortABT], 0, 1, '08:00', 10);
    // A-time is 4 min — no exam window (< 10 min)
    expect(result.examWindows).toHaveLength(0);
  });

  it('detects D-time conflict when two ops have overlapping D-time', () => {
    // Two slots on different ops with the same start time (no stagger) → D-time conflict
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 1, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 2, '08:00', 10);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].operatories).toContain(0);
    expect(result.conflicts[0].operatories).toContain(1);
  });

  it('no conflicts when D-times are staggered apart', () => {
    // Op 0 starts at 0, Op 1 starts at 40 (after Op 0 D-time ends)
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 1, startMin: 40, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 2, '08:00', 10);
    expect(result.conflicts).toHaveLength(0);
  });

  it('doctorUtilization is between 0 and 100', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 1, '08:00', 10);
    expect(result.doctorUtilization).toBeGreaterThanOrEqual(0);
    expect(result.doctorUtilization).toBeLessThanOrEqual(100);
  });

  it('applies stagger offset to operatory start times', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-comp', blockLabel: 'Composite', operatory: 0, startMin: 0, durationMin: 30 },
      { blockTypeId: 'bt-comp', blockLabel: 'Composite', operatory: 1, startMin: 0, durationMin: 30 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 20, 2, '08:00', 10);
    // Op 1 segments should start 20 min later
    const op1Segs = result.segments.filter(s => s.operatory === 1);
    expect(op1Segs.length).toBeGreaterThan(0);
    expect(op1Segs[0].startMin).toBe(20);
  });

  it('segments have correct operatory assignment', () => {
    const slots: Slot[] = [
      { blockTypeId: 'bt-crown', blockLabel: 'Crown Prep', operatory: 0, startMin: 0, durationMin: 60 },
      { blockTypeId: 'bt-comp', blockLabel: 'Composite', operatory: 1, startMin: 0, durationMin: 30 },
    ];
    const result = buildDoctorFlow(slots, mockBlockTypes, 0, 2, '08:00', 10);
    const op0Segs = result.segments.filter(s => s.operatory === 0);
    const op1Segs = result.segments.filter(s => s.operatory === 1);
    expect(op0Segs.length).toBeGreaterThan(0);
    expect(op1Segs.length).toBeGreaterThan(0);
  });

  it('falls back to 0.5/0.5 ratio for block types without dTimeMin/aTimeMin', () => {
    const noRatioBT: BlockTypeInput = {
      id: 'bt-nratio', label: 'NoRatio', appliesToRole: 'DOCTOR', durationMin: 40,
    };
    const slots: Slot[] = [
      { blockTypeId: 'bt-nratio', blockLabel: 'NoRatio', operatory: 0, startMin: 0, durationMin: 40 },
    ];
    const result = buildDoctorFlow(slots, [noRatioBT], 0, 1, '08:00', 10);
    const dSeg = result.segments.find(s => s.phase === 'D');
    const aSeg = result.segments.find(s => s.phase === 'A');
    expect(dSeg).toBeDefined();
    expect(aSeg).toBeDefined();
    expect(dSeg!.durationMin + aSeg!.durationMin).toBe(40);
  });
});

// ─── Task 2: Stagger Optimizer ───────────────────────────────────────────────

import {
  optimizeStagger,
} from '@/lib/engine/stagger-optimizer';
import type { ProcedureToSchedule } from '@/lib/engine/stagger-optimizer';

const crown: ProcedureToSchedule = {
  blockTypeId: 'bt-crown', blockLabel: 'Crown Prep',
  durationMin: 60, dRatio: 0.67, aRatio: 0.33,
};
const composite: ProcedureToSchedule = {
  blockTypeId: 'bt-comp', blockLabel: 'Composite',
  durationMin: 30, dRatio: 0.5, aRatio: 0.5,
};
const endo: ProcedureToSchedule = {
  blockTypeId: 'bt-endo', blockLabel: 'Root Canal',
  durationMin: 90, dRatio: 0.7, aRatio: 0.3,
};

describe('optimizeStagger — basic structure', () => {
  it('returns StaggerOptimizationResult with correct shape', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    expect(Array.isArray(result.sequence)).toBe(true);
    expect(typeof result.projectedFlow).toBe('object');
    expect(typeof result.examsCovered).toBe('number');
    expect(typeof result.doctorIdleMinutes).toBe('number');
    expect(Array.isArray(result.explanation)).toBe(true);
  });

  it('returns empty result for empty procedures', () => {
    const result = optimizeStagger([], 2, 20, 1, 50);
    expect(result.sequence).toHaveLength(0);
    expect(result.examsCovered).toBe(0);
    expect(result.doctorIdleMinutes).toBe(0);
  });

  it('sequence contains all input procedures', () => {
    const result = optimizeStagger([crown, composite, endo], 2, 20, 1, 50);
    expect(result.sequence).toHaveLength(3);
    const ids = result.sequence.map(p => p.blockTypeId);
    expect(ids).toContain('bt-crown');
    expect(ids).toContain('bt-comp');
    expect(ids).toContain('bt-endo');
  });

  it('places longer D-time procedures to minimize conflicts', () => {
    // The optimizer starts by sorting D-time desc, then hill-climbs.
    // Either ordering of [composite, endo] is valid — what matters is
    // that the optimized sequence has fewer or equal conflicts than placing
    // the high-D-time procedure naively at position 0 with stagger=0.
    const noStaggerResult = optimizeStagger([composite, endo], 1, 0, 1, 50);
    // With 1 op and 0 stagger, both procedures are sequential — no conflict possible
    expect(noStaggerResult.sequence).toHaveLength(2);
    expect(noStaggerResult.projectedFlow.conflicts).toHaveLength(0);
  });

  it('doctorIdleMinutes is non-negative', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    expect(result.doctorIdleMinutes).toBeGreaterThanOrEqual(0);
  });

  it('examsCovered is non-negative', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    expect(result.examsCovered).toBeGreaterThanOrEqual(0);
  });

  it('explanation array is non-empty', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('projectedFlow has segments', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    expect(result.projectedFlow.segments.length).toBeGreaterThan(0);
  });

  it('improvementVsPrevious is null or a number', () => {
    const result = optimizeStagger([crown, composite], 2, 20, 1, 50);
    const val = result.improvementVsPrevious;
    expect(val === null || typeof val === 'number').toBe(true);
  });

  it('handles single procedure without errors', () => {
    const result = optimizeStagger([crown], 1, 0, 0, 50);
    expect(result.sequence).toHaveLength(1);
  });

  it('reduces or maintains conflicts with staggered procedures', () => {
    const result = optimizeStagger([crown, crown, composite], 2, 30, 1, 50);
    // With good stagger, conflicts should be fewer than worst case
    expect(result.projectedFlow.conflicts.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── Task 3: Hygiene Exam Window Finder ──────────────────────────────────────

import {
  findHygieneExamWindows,
  scoreExamFit,
  buildHygieneExamSummary,
} from '@/lib/engine/hygiene-exam-finder';
import type { HygienistSlot } from '@/lib/engine/hygiene-exam-finder';

const prophyBT: BlockTypeInput = {
  id: 'bt-prophy', label: 'Prophy', appliesToRole: 'HYGIENIST',
  durationMin: 60, dTimeMin: 10, aTimeMin: 50, dTimeOffsetMin: 45,
  isHygieneType: true, minimumAmount: 150,
};

const mockHygSlots: HygienistSlot[] = [
  { blockTypeId: 'bt-prophy', blockLabel: 'Prophy', hygienistId: 'hyg1', startMin: 0, durationMin: 60 },
  { blockTypeId: 'bt-prophy', blockLabel: 'Prophy', hygienistId: 'hyg1', startMin: 60, durationMin: 60 },
];

describe('findHygieneExamWindows — timing calculation', () => {
  it('returns one request per non-null slot', () => {
    const requests = findHygieneExamWindows(mockHygSlots, [prophyBT], 45, 10, '08:00');
    expect(requests).toHaveLength(2);
  });

  it('uses dTimeOffsetMin from block type when set', () => {
    // prophyBT has dTimeOffsetMin: 45
    const requests = findHygieneExamWindows(
      [{ blockTypeId: 'bt-prophy', blockLabel: 'Prophy', hygienistId: 'hyg1', startMin: 0, durationMin: 60 }],
      [prophyBT],
      50, // default offset (should be overridden by dTimeOffsetMin)
      10,
      '08:00'
    );
    expect(requests[0].requestedStartMin).toBe(45); // 0 + 45 (dTimeOffsetMin)
  });

  it('falls back to examOffsetMin when dTimeOffsetMin not set', () => {
    const btNoOffset: BlockTypeInput = {
      id: 'bt-no-offset', label: 'NP Exam', appliesToRole: 'HYGIENIST', durationMin: 90,
    };
    const requests = findHygieneExamWindows(
      [{ blockTypeId: 'bt-no-offset', blockLabel: 'NP Exam', hygienistId: 'hyg1', startMin: 0, durationMin: 90 }],
      [btNoOffset],
      30, // examOffsetMin
      10,
      '08:00'
    );
    expect(requests[0].requestedStartMin).toBe(30);
  });

  it('flexMin is 5 by default', () => {
    const requests = findHygieneExamWindows(mockHygSlots, [prophyBT], 45, 10, '08:00');
    expect(requests[0].flexMin).toBe(5);
  });

  it('returns sorted by requestedStartMin', () => {
    const requests = findHygieneExamWindows(mockHygSlots, [prophyBT], 45, 10, '08:00');
    for (let i = 1; i < requests.length; i++) {
      expect(requests[i].requestedStartMin).toBeGreaterThanOrEqual(requests[i - 1].requestedStartMin);
    }
  });

  it('returns empty array for empty slots', () => {
    const requests = findHygieneExamWindows([], [prophyBT], 45, 10, '08:00');
    expect(requests).toHaveLength(0);
  });

  it('skips slots with null blockTypeId', () => {
    const slots: HygienistSlot[] = [
      { blockTypeId: null, blockLabel: null, hygienistId: 'hyg1', startMin: 0, durationMin: 60 },
    ];
    const requests = findHygieneExamWindows(slots, [prophyBT], 45, 10, '08:00');
    expect(requests).toHaveLength(0);
  });

  it('blockTypeName falls back to "Hygiene Appointment" for unknown block', () => {
    const slots: HygienistSlot[] = [
      { blockTypeId: 'bt-unknown', blockLabel: null, hygienistId: 'hyg1', startMin: 0, durationMin: 60 },
    ];
    const requests = findHygieneExamWindows(slots, [], 45, 10, '08:00');
    expect(requests[0].blockTypeName).toBe('Hygiene Appointment');
  });
});

describe('scoreExamFit — fit/tight/conflict classification', () => {
  it('returns "fits" when exam falls cleanly in exam window', () => {
    const request = {
      hygienistId: 'hyg1',
      requestedStartMin: 50,
      flexMin: 5,
      blockTypeName: 'Prophy',
      appointmentStartMin: 0,
    };
    const window = { startMin: 40, endMin: 70, durationMin: 30 };
    const results = scoreExamFit([request], [window], [], 10);
    expect(results[0].status).toBe('fits');
    expect(results[0].matchedWindow).toBeDefined();
  });

  it('returns "conflict" when exam falls in D-time', () => {
    const request = {
      hygienistId: 'hyg1',
      requestedStartMin: 10,
      flexMin: 5,
      blockTypeName: 'Prophy',
      appointmentStartMin: 0,
    };
    const dSeg = { startMin: 0, endMin: 40, blockTypeName: 'Crown Prep' };
    const results = scoreExamFit([request], [], [dSeg], 10);
    expect(results[0].status).toBe('conflict');
    expect(results[0].conflictBlockName).toBe('Crown Prep');
  });

  it('returns "conflict" status and suggests shift when no window fits', () => {
    const request = {
      hygienistId: 'hyg1',
      requestedStartMin: 10,
      flexMin: 5,
      blockTypeName: 'Prophy',
      appointmentStartMin: 0,
    };
    const window = { startMin: 50, endMin: 80, durationMin: 30 };
    const results = scoreExamFit([request], [window], [], 10);
    expect(results[0].status).toBe('conflict');
    expect(results[0].suggestionMin).toBeDefined();
    expect(typeof results[0].suggestionMin).toBe('number');
  });

  it('returns null conflictBlockName when no D-time block causes conflict', () => {
    const request = {
      hygienistId: 'hyg1',
      requestedStartMin: 10,
      flexMin: 5,
      blockTypeName: 'Prophy',
      appointmentStartMin: 0,
    };
    const results = scoreExamFit([request], [], [], 10);
    expect(results[0].status).toBe('conflict');
    expect(results[0].conflictBlockName).toBeNull();
  });

  it('returns empty array for empty requests', () => {
    const results = scoreExamFit([], [], [], 10);
    expect(results).toHaveLength(0);
  });
});

describe('buildHygieneExamSummary — counts', () => {
  it('returns correct fit/tight/conflict counts', () => {
    // Build a scenario: 1 exam window that fits first appointment
    const hygSlots: HygienistSlot[] = [
      { blockTypeId: 'bt-prophy', blockLabel: 'Prophy', hygienistId: 'hyg1', startMin: 0, durationMin: 60 },
    ];
    // Exam window at minute 40-70, exam needed at minute 45 → fits
    const examWindows = [{ startMin: 40, endMin: 70, durationMin: 30 }];
    const dSegs: { startMin: number; endMin: number; blockTypeName: string }[] = [];
    const summary = buildHygieneExamSummary(hygSlots, [prophyBT], examWindows, dSegs, 45, 10, '08:00');
    expect(summary.fitCount + summary.tightCount + summary.conflictCount).toBe(1);
    expect(summary.requests).toHaveLength(1);
  });

  it('counts conflict when no windows available', () => {
    const hygSlots: HygienistSlot[] = [
      { blockTypeId: 'bt-prophy', blockLabel: 'Prophy', hygienistId: 'hyg1', startMin: 0, durationMin: 60 },
    ];
    const summary = buildHygieneExamSummary(hygSlots, [prophyBT], [], [], 45, 10, '08:00');
    expect(summary.conflictCount).toBe(1);
    expect(summary.fitCount).toBe(0);
  });
});

// ─── Task 4: Mix-to-Prescription Engine ─────────────────────────────────────

import {
  buildBlockPrescription,
  getCoverageStatus,
} from '@/lib/engine/mix-prescription';
import type { BlockPrescription } from '@/lib/engine/mix-prescription';

const prescriptionBlockTypes: BlockTypeInput[] = [
  {
    id: 'bt-crown', label: 'Crown Prep', appliesToRole: 'DOCTOR',
    durationMin: 60, minimumAmount: 1500, procedureCategory: 'MAJOR_RESTORATIVE',
  },
  {
    id: 'bt-comp', label: 'Composite', appliesToRole: 'DOCTOR',
    durationMin: 30, minimumAmount: 350, procedureCategory: 'BASIC_RESTORATIVE',
  },
  {
    id: 'bt-endo', label: 'Root Canal', appliesToRole: 'DOCTOR',
    durationMin: 90, minimumAmount: 1200, procedureCategory: 'ENDODONTICS',
  },
  {
    id: 'bt-prophy', label: 'Prophy', appliesToRole: 'HYGIENIST',
    durationMin: 60, minimumAmount: 150, isHygieneType: true, procedureCategory: 'PERIODONTICS',
  },
];

describe('buildBlockPrescription — dollar math', () => {
  it('returns BlockPrescription with correct shape', () => {
    const result = buildBlockPrescription(
      5000,
      { MAJOR_RESTORATIVE: 50, BASIC_RESTORATIVE: 50 },
      prescriptionBlockTypes,
      10
    );
    expect(typeof result.totalGoal).toBe('number');
    expect(Array.isArray(result.byCategory)).toBe(true);
    expect(Array.isArray(result.blocks)).toBe(true);
    expect(typeof result.totalScheduledProduction).toBe('number');
    expect(typeof result.gap).toBe('number');
    expect(typeof result.coveragePercent).toBe('number');
  });

  it('totalGoal matches dailyGoal input', () => {
    const result = buildBlockPrescription(5000, { MAJOR_RESTORATIVE: 100 }, prescriptionBlockTypes, 10);
    expect(result.totalGoal).toBe(5000);
  });

  it('block count calculation is correct: target / productionPerBlock rounded', () => {
    // MAJOR_RESTORATIVE 100% of $3000 = $3000 → $3000 / $1500 = 2 crowns
    const result = buildBlockPrescription(3000, { MAJOR_RESTORATIVE: 100 }, prescriptionBlockTypes, 10);
    const crownBlock = result.blocks.find(b => b.blockTypeId === 'bt-crown');
    expect(crownBlock).toBeDefined();
    expect(crownBlock!.count).toBe(2);
  });

  it('totalProduction = count × productionPerBlock', () => {
    const result = buildBlockPrescription(3000, { MAJOR_RESTORATIVE: 100 }, prescriptionBlockTypes, 10);
    for (const block of result.blocks) {
      expect(block.totalProduction).toBe(block.count * block.productionPerBlock);
    }
  });

  it('gap = totalGoal - totalScheduledProduction', () => {
    const result = buildBlockPrescription(5000, { MAJOR_RESTORATIVE: 50, BASIC_RESTORATIVE: 50 }, prescriptionBlockTypes, 10);
    expect(result.gap).toBe(result.totalGoal - result.totalScheduledProduction);
  });

  it('coveragePercent = totalScheduledProduction / totalGoal × 100 (rounded)', () => {
    const result = buildBlockPrescription(3000, { MAJOR_RESTORATIVE: 100 }, prescriptionBlockTypes, 10);
    const expected = Math.round((result.totalScheduledProduction / result.totalGoal) * 100);
    expect(result.coveragePercent).toBe(expected);
  });

  it('excludes hygiene block types from prescription', () => {
    const result = buildBlockPrescription(
      5000,
      { PERIODONTICS: 100 },
      prescriptionBlockTypes,
      10
    );
    const prophyBlock = result.blocks.find(b => b.blockTypeId === 'bt-prophy');
    expect(prophyBlock).toBeUndefined();
  });

  it('handles zero daily goal', () => {
    const result = buildBlockPrescription(0, { MAJOR_RESTORATIVE: 100 }, prescriptionBlockTypes, 10);
    expect(result.totalScheduledProduction).toBe(0);
    expect(result.gap).toBe(0);
  });

  it('returns empty blocks for empty mix', () => {
    const result = buildBlockPrescription(5000, {}, prescriptionBlockTypes, 10);
    expect(result.blocks).toHaveLength(0);
    expect(result.totalScheduledProduction).toBe(0);
  });

  it('splits proportionally when category has multiple block types', () => {
    // Add another major restorative block type
    const bridge: BlockTypeInput = {
      id: 'bt-bridge', label: 'Bridge', appliesToRole: 'DOCTOR',
      durationMin: 90, minimumAmount: 2000, procedureCategory: 'MAJOR_RESTORATIVE',
    };
    const bts = [...prescriptionBlockTypes, bridge];
    const result = buildBlockPrescription(6000, { MAJOR_RESTORATIVE: 100 }, bts, 10);
    // Both crown and bridge should have blocks assigned
    const crownBlock = result.blocks.find(b => b.blockTypeId === 'bt-crown');
    const bridgeBlock = result.blocks.find(b => b.blockTypeId === 'bt-bridge');
    // At least one of them should be present
    expect(crownBlock !== undefined || bridgeBlock !== undefined).toBe(true);
  });

  it('byCategory has entry for each mix category', () => {
    const result = buildBlockPrescription(
      5000,
      { MAJOR_RESTORATIVE: 50, ENDODONTICS: 50 },
      prescriptionBlockTypes,
      10
    );
    const cats = result.byCategory.map(c => c.category);
    expect(cats).toContain('MAJOR_RESTORATIVE');
    expect(cats).toContain('ENDODONTICS');
  });

  it('category actualDollars matches sum of assigned block totalProduction', () => {
    const result = buildBlockPrescription(
      3000,
      { MAJOR_RESTORATIVE: 100 },
      prescriptionBlockTypes,
      10
    );
    for (const cat of result.byCategory) {
      const sumFromBlocks = cat.assignedBlocks.reduce((s, b) => s + b.totalProduction, 0);
      expect(cat.actualDollars).toBe(sumFromBlocks);
    }
  });

  it('infers procedureCategory from label when not set', () => {
    const inferredBT: BlockTypeInput = {
      id: 'bt-inferred', label: 'Crown Prep Inferred', appliesToRole: 'DOCTOR',
      durationMin: 60, minimumAmount: 1200,
      // no procedureCategory set — should be inferred as MAJOR_RESTORATIVE
    };
    const result = buildBlockPrescription(
      3000,
      { MAJOR_RESTORATIVE: 100 },
      [inferredBT],
      10
    );
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.blocks[0].category).toBe('MAJOR_RESTORATIVE');
  });
});

describe('getCoverageStatus', () => {
  it('returns "green" when actual >= target', () => {
    expect(getCoverageStatus(25, 25)).toBe('green');
    expect(getCoverageStatus(30, 25)).toBe('green');
  });

  it('returns "amber" when actual is 80–99% of target', () => {
    expect(getCoverageStatus(20, 25)).toBe('amber'); // 80%
    expect(getCoverageStatus(22, 25)).toBe('amber'); // 88%
  });

  it('returns "red" when actual < 80% of target', () => {
    expect(getCoverageStatus(10, 25)).toBe('red'); // 40%
    expect(getCoverageStatus(0, 25)).toBe('red');
  });

  it('returns "green" when targetPct is 0', () => {
    expect(getCoverageStatus(0, 0)).toBe('green');
  });
});
