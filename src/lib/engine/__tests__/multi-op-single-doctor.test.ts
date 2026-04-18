/**
 * Regression Tests — Single Doctor Assigned to Multiple Operatories
 *
 * Covers the two engine bugs reported on first real-world use:
 *
 *   Bug 2: Engine stops at ~$2,962 of a $5,000 goal (59%) when a single doctor
 *          is assigned to BOTH OP1 and OP2. OP1 fills fully, OP2 stays under-
 *          filled because perOpTarget collapses to near-zero after OP1 hits
 *          the shared target, causing isGoalMet() in placeDoctorBlocks to
 *          short-circuit OP2's morning/afternoon placement.
 *
 *   Bug 3: Same provider in OP1 + OP2 gets little to no stagger — OP2 ends up
 *          empty because there is no per-op placement context with its own
 *          budget, and the stagger offset must ensure OP2 starts 20-30 min
 *          after OP1's first HP anchor.
 *
 * Fix (in generator.ts): every operatory for a multi-op doctor receives a
 * per-op budget that is floored at 60% of the fair share (sharedTarget /
 * numOps). This guarantees placeDoctorBlocks runs through Rock-Sand-Water
 * morning + afternoon + gap-fill steps for every op, independent of whether
 * earlier ops already covered the shared pool.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import type {
  GenerationInput,
  ProviderInput,
  BlockTypeInput,
  ScheduleRules,
} from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures — mirror the real-world config from the bug report
// ──────────────────────────────────────────────────────────────────────────────

const STANDARD_BLOCK_TYPES: BlockTypeInput[] = [
  {
    id: 'hp-default',
    label: 'HP',
    description: 'High Production',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 90,
  },
  {
    id: 'mp-default',
    label: 'MP',
    description: 'Medium Production',
    minimumAmount: 375,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
  },
  {
    id: 'np-cons-default',
    label: 'NP CONS',
    description: 'New Patient Consult',
    minimumAmount: 300,
    appliesToRole: 'DOCTOR',
    durationMin: 40,
  },
  {
    id: 'er-default',
    label: 'ER',
    description: 'Emergency',
    minimumAmount: 187,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
  {
    id: 'non-prod-default',
    label: 'NON-PROD',
    description: 'Non-Productive',
    minimumAmount: 0,
    appliesToRole: 'DOCTOR',
    durationMin: 30,
  },
];

function makeRules(overrides: Partial<ScheduleRules> = {}): ScheduleRules {
  return {
    npModel: 'DOCTOR_ONLY',
    npBlocksPerDay: 1,
    srpBlocksPerDay: 1,
    hpPlacement: 'MORNING',
    doubleBooking: true,
    matrixing: false,
    emergencyHandling: 'DEDICATED',
    ...overrides,
  };
}

function makeDoctor(
  overrides: Partial<ProviderInput> & { operatories: string[] }
): ProviderInput {
  return {
    id: 'dr-scott',
    name: 'Dr. Scott',
    role: 'DOCTOR',
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 5000,
    color: '#4a90d9',
    ...overrides,
  };
}

function computeOpProduction(
  result: ReturnType<typeof generateSchedule>,
  providerId: string,
  operatory: string
): number {
  const btMap = new Map<string, number>(
    STANDARD_BLOCK_TYPES.map(bt => [bt.id, bt.minimumAmount ?? 0])
  );
  const opSlots = result.slots.filter(
    s =>
      s.providerId === providerId &&
      s.operatory === operatory &&
      s.blockTypeId &&
      !s.isBreak
  );
  let total = 0;
  let prev: string | null = null;
  for (const s of opSlots) {
    if (s.blockTypeId !== prev) {
      total += btMap.get(s.blockTypeId!) ?? 0;
      prev = s.blockTypeId;
    }
  }
  return total;
}

function firstBlockStartTime(
  result: ReturnType<typeof generateSchedule>,
  providerId: string,
  operatory: string
): string | null {
  const opSlots = result.slots
    .filter(
      s =>
        s.providerId === providerId &&
        s.operatory === operatory &&
        s.blockTypeId !== null &&
        !s.isBreak
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  return opSlots[0]?.time ?? null;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ──────────────────────────────────────────────────────────────────────────────
// Bug 2 — Single doctor + 2 ops must hit ≥90% of the shared 75% goal
// ──────────────────────────────────────────────────────────────────────────────

describe('Bug 2 — single doctor + 2 operatories reaches shared production goal', () => {
  it('Dr. Scott in OP1+OP2, $5,000 goal → combined production ≥ 90% of $3,750 target', () => {
    const doc = makeDoctor({ operatories: ['OP1', 'OP2'], dailyGoal: 5000 });
    const input: GenerationInput = {
      providers: [doc],
      blockTypes: STANDARD_BLOCK_TYPES,
      rules: makeRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);
    const op1 = computeOpProduction(result, 'dr-scott', 'OP1');
    const op2 = computeOpProduction(result, 'dr-scott', 'OP2');
    const combined = op1 + op2;
    const target75 = doc.dailyGoal * 0.75; // $3,750

    // Pre-fix behavior: combined hovered around $2,962 (~79% of $3,750) with
    // OP2 starved. Post-fix: each op runs the full Rock-Sand-Water pipeline
    // so combined reaches at least 90% of the shared goal.
    expect(combined).toBeGreaterThanOrEqual(target75 * 0.9);

    // Sanity: neither op is starved. Each op should carry meaningful work.
    expect(op1).toBeGreaterThan(0);
    expect(op2).toBeGreaterThan(0);
  });

  it('Dr. Scott in OP1+OP2, $3,000 goal → combined production ≥ 90% of $2,250 target', () => {
    const doc = makeDoctor({ operatories: ['OP1', 'OP2'], dailyGoal: 3000 });
    const input: GenerationInput = {
      providers: [doc],
      blockTypes: STANDARD_BLOCK_TYPES,
      rules: makeRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);
    const combined =
      computeOpProduction(result, 'dr-scott', 'OP1') +
      computeOpProduction(result, 'dr-scott', 'OP2');
    const target75 = doc.dailyGoal * 0.75;

    expect(combined).toBeGreaterThanOrEqual(target75 * 0.9);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Bug 3 — OP2 must be non-empty and must start with a stagger offset vs OP1
// ──────────────────────────────────────────────────────────────────────────────

describe('Bug 3 — same provider in OP1 + OP2 gets stagger, OP2 is non-empty', () => {
  it('OP2 has a non-trivial schedule (≥ 20 occupied slots, at least one HP/MP block)', () => {
    const doc = makeDoctor({ operatories: ['OP1', 'OP2'] });
    const input: GenerationInput = {
      providers: [doc],
      blockTypes: STANDARD_BLOCK_TYPES,
      rules: makeRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);

    const op2OccupiedSlots = result.slots.filter(
      s =>
        s.providerId === 'dr-scott' &&
        s.operatory === 'OP2' &&
        s.blockTypeId !== null &&
        !s.isBreak
    ).length;

    // Pre-fix failure mode: OP2 ended up with 0 or a handful of slots.
    // Post-fix: OP2 runs the full pipeline + fill step, so it should have
    // at least ~20 slots occupied (out of ~54 working-day slots at 10 min).
    expect(op2OccupiedSlots).toBeGreaterThanOrEqual(20);

    // OP2 must contain at least one production-bearing block.
    const op2HasProd = result.slots.some(
      s =>
        s.providerId === 'dr-scott' &&
        s.operatory === 'OP2' &&
        s.blockTypeId !== null &&
        !s.isBreak &&
        (s.blockTypeId === 'hp-default' ||
          s.blockTypeId === 'mp-default' ||
          s.blockTypeId === 'np-cons-default')
    );
    expect(op2HasProd).toBe(true);
  });

  it('OP2 first block starts ≥ 20 min after OP1 first block (column stagger offset)', () => {
    const doc = makeDoctor({ operatories: ['OP1', 'OP2'] });
    const input: GenerationInput = {
      providers: [doc],
      blockTypes: STANDARD_BLOCK_TYPES,
      rules: makeRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);

    const op1First = firstBlockStartTime(result, 'dr-scott', 'OP1');
    const op2First = firstBlockStartTime(result, 'dr-scott', 'OP2');

    // Both ops must have at least one block.
    expect(op1First).not.toBeNull();
    expect(op2First).not.toBeNull();

    // OP2 must be staggered at least 20 minutes after OP1's first block
    // (DEFAULT_COLUMN_STAGGER_MIN). The stagger guarantees the A-D zigzag
    // pattern — while OP1 is in D-phase, OP2 is in A-phase.
    const op1Min = timeToMinutes(op1First!);
    const op2Min = timeToMinutes(op2First!);
    expect(op2Min - op1Min).toBeGreaterThanOrEqual(20);
  });

  it('OP1 and OP2 are both filled when using procedure mix placement', () => {
    // Exercise the mix-based code path (placeDoctorBlocksByMix). The per-op
    // floor applies here too because the same perOpCtx is passed in.
    const doc = makeDoctor({
      operatories: ['OP1', 'OP2'],
      dailyGoal: 5000,
      futureProcedureMix: {
        MAJOR_RESTORATIVE: 30,
        BASIC_RESTORATIVE: 25,
        ENDODONTICS: 10,
        PERIODONTICS: 10,
        NEW_PATIENT_DIAG: 10,
        EMERGENCY_ACCESS: 10,
        ORAL_SURGERY: 3,
        PROSTHODONTICS: 2,
      },
    });
    const input: GenerationInput = {
      providers: [doc],
      blockTypes: STANDARD_BLOCK_TYPES,
      rules: makeRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };

    const result = generateSchedule(input);
    const op1 = computeOpProduction(result, 'dr-scott', 'OP1');
    const op2 = computeOpProduction(result, 'dr-scott', 'OP2');

    expect(op1).toBeGreaterThan(0);
    expect(op2).toBeGreaterThan(0);
  });
});
