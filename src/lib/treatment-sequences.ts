/**
 * Treatment Sequence Templates — Sprint 14
 *
 * Pre-defined appointment sequences that can be placed as a group.
 * Each sequence defines ordered steps with block category, duration, and day offset.
 */

import type { ProcedureCategory } from './engine/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SequenceStep {
  stepIndex: number;
  label: string;
  category: ProcedureCategory;
  durationMin: number;
  /** Days after the first appointment (step 0) when this step should be scheduled. */
  dayOffset: number;
}

export interface TreatmentSequence {
  id: string;
  name: string;
  description: string;
  isBuiltIn: boolean;
  steps: SequenceStep[];
}

// ─── Built-in Sequences ───────────────────────────────────────────────────────

export const BUILT_IN_SEQUENCES: TreatmentSequence[] = [
  {
    id: 'builtin-crown',
    name: 'Crown Series',
    description: 'Crown prep followed by crown seat ~2 weeks later.',
    isBuiltIn: true,
    steps: [
      {
        stepIndex: 0,
        label: 'Crown Prep',
        category: 'MAJOR_RESTORATIVE',
        durationMin: 90,
        dayOffset: 0,
      },
      {
        stepIndex: 1,
        label: 'Crown Seat',
        category: 'MAJOR_RESTORATIVE',
        durationMin: 30,
        dayOffset: 14,
      },
    ],
  },
  {
    id: 'builtin-new-patient',
    name: 'New Patient Flow',
    description: 'Comprehensive exam → treatment plan consult → first restorative visit.',
    isBuiltIn: true,
    steps: [
      {
        stepIndex: 0,
        label: 'NP Comprehensive Exam',
        category: 'NEW_PATIENT_DIAG',
        durationMin: 60,
        dayOffset: 0,
      },
      {
        stepIndex: 1,
        label: 'Treatment Plan Consult',
        category: 'NEW_PATIENT_DIAG',
        durationMin: 30,
        dayOffset: 7,
      },
      {
        stepIndex: 2,
        label: 'First Restorative Visit',
        category: 'BASIC_RESTORATIVE',
        durationMin: 60,
        dayOffset: 14,
      },
    ],
  },
  {
    id: 'builtin-perio',
    name: 'Perio Treatment Series',
    description: 'Full perio treatment sequence: eval, two SRP appointments, re-eval.',
    isBuiltIn: true,
    steps: [
      {
        stepIndex: 0,
        label: 'Perio Eval',
        category: 'PERIODONTICS',
        durationMin: 60,
        dayOffset: 0,
      },
      {
        stepIndex: 1,
        label: 'SRP — Quads 1 & 2',
        category: 'PERIODONTICS',
        durationMin: 90,
        dayOffset: 7,
      },
      {
        stepIndex: 2,
        label: 'SRP — Quads 3 & 4',
        category: 'PERIODONTICS',
        durationMin: 90,
        dayOffset: 14,
      },
      {
        stepIndex: 3,
        label: 'Perio Re-eval',
        category: 'PERIODONTICS',
        durationMin: 45,
        dayOffset: 42,
      },
    ],
  },
  {
    id: 'builtin-implant',
    name: 'Implant Series',
    description: 'Implant placement → healing abutment → implant crown.',
    isBuiltIn: true,
    steps: [
      {
        stepIndex: 0,
        label: 'Implant Placement',
        category: 'ORAL_SURGERY',
        durationMin: 90,
        dayOffset: 0,
      },
      {
        stepIndex: 1,
        label: 'Healing Abutment',
        category: 'MAJOR_RESTORATIVE',
        durationMin: 30,
        dayOffset: 90,
      },
      {
        stepIndex: 2,
        label: 'Implant Crown',
        category: 'MAJOR_RESTORATIVE',
        durationMin: 60,
        dayOffset: 120,
      },
    ],
  },
  {
    id: 'builtin-denture',
    name: 'Denture Series',
    description: 'Full denture fabrication sequence from impressions to delivery.',
    isBuiltIn: true,
    steps: [
      {
        stepIndex: 0,
        label: 'Primary Impressions',
        category: 'PROSTHODONTICS',
        durationMin: 60,
        dayOffset: 0,
      },
      {
        stepIndex: 1,
        label: 'Final Impressions & Bite',
        category: 'PROSTHODONTICS',
        durationMin: 60,
        dayOffset: 7,
      },
      {
        stepIndex: 2,
        label: 'Wax Try-In',
        category: 'PROSTHODONTICS',
        durationMin: 45,
        dayOffset: 21,
      },
      {
        stepIndex: 3,
        label: 'Denture Delivery',
        category: 'PROSTHODONTICS',
        durationMin: 60,
        dayOffset: 35,
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Serialize a sequence's steps array to the JSON string used in the DB.
 */
export function serializeSteps(steps: SequenceStep[]): string {
  return JSON.stringify(steps);
}

/**
 * Deserialize a stepsJson string back to a SequenceStep array.
 */
export function deserializeSteps(stepsJson: string): SequenceStep[] {
  try {
    const parsed = JSON.parse(stepsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed as SequenceStep[];
  } catch {
    return [];
  }
}

/**
 * Get the first step (index 0) for placement on the current day.
 */
export function getFirstStep(sequence: TreatmentSequence): SequenceStep | null {
  return sequence.steps.find(s => s.stepIndex === 0) ?? null;
}

/**
 * Get all follow-up steps (index > 0) with human-readable scheduling hints.
 */
export function getFollowUpHints(sequence: TreatmentSequence): { step: SequenceStep; hint: string }[] {
  return sequence.steps
    .filter(s => s.stepIndex > 0)
    .map(s => {
      let hint = '';
      if (s.dayOffset === 0) {
        hint = 'same day';
      } else if (s.dayOffset < 7) {
        hint = `~${s.dayOffset} day${s.dayOffset !== 1 ? 's' : ''} out`;
      } else if (s.dayOffset < 30) {
        const weeks = Math.round(s.dayOffset / 7);
        hint = `~${weeks} week${weeks !== 1 ? 's' : ''} out`;
      } else {
        const months = Math.round(s.dayOffset / 30);
        hint = `~${months} month${months !== 1 ? 's' : ''} out`;
      }
      return { step: s, hint };
    });
}
