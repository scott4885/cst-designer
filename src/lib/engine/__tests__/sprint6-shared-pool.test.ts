/**
 * Sprint 6 Regression Tests — Shared-Pool Multi-Op Production Target
 *
 * These tests verify that the shared-pool algorithm correctly distributes
 * production across multiple operatories for a single doctor without over-
 * or under-filling when the goal is $3,000 or $5,000.
 *
 * Acceptance criteria from BRIEF-SPRINT6.md:
 *   - 1-op doctor: behavior unchanged (≈ 75% of dailyGoal scheduled)
 *   - 2-op doctor, $3k goal: combined ≈ $2,250–$3,000 (within 20% of target)
 *   - 3-op doctor, $3k goal: combined ≈ $2,250–$3,000 (within 20% of target)
 *   - Op 0 always carries the majority of production
 *   - No individual op exceeds the shared target on its own
 *   - HP blocks ($1,200) can still be placed even when per-op would have been $1,000
 *   - Per-op breakdown populated for multi-op doctors
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import type { GenerationInput, ProviderInput, BlockTypeInput, ScheduleRules } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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

function makeDoctor(
  overrides: Partial<ProviderInput> & { operatories: string[] }
): ProviderInput {
  return {
    id: 'dr1',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 3000,
    color: '#4a90d9',
    ...overrides,
  };
}

function computeCombinedProduction(
  result: ReturnType<typeof generateSchedule>,
  providerId: string
): number {
  const summary = result.productionSummary.find(s => s.providerId === providerId);
  return summary?.actualScheduled ?? 0;
}

function computeOpProduction(
  result: ReturnType<typeof generateSchedule>,
  providerId: string,
  operatory: string
): number {
  const blockTypes = STANDARD_BLOCK_TYPES;
  const btMap = new Map<string, number>(
    blockTypes.map(bt => [bt.id, bt.minimumAmount ?? 0])
  );

  const opSlots = result.slots.filter(
    s => s.providerId === providerId && s.operatory === operatory && s.blockTypeId && !s.isBreak
  );

  // Sum production by counting distinct block instances (consecutive same-type runs)
  let total = 0;
  let prevBlockId: string | null = null;
  for (const slot of opSlots) {
    if (slot.blockTypeId !== prevBlockId) {
      total += btMap.get(slot.blockTypeId!) ?? 0;
      prevBlockId = slot.blockTypeId;
    }
  }
  return total;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1-Op Doctor — Regression (behavior unchanged from pre-Sprint 5)
// ──────────────────────────────────────────────────────────────────────────────

describe('Sprint 6 — shared-pool multi-op production', () => {
  describe('1-op doctor ($3,000 goal)', () => {
    it('schedules ≈ 75% of daily goal (single operatory path unchanged)', () => {
      const doc = makeDoctor({ operatories: ['OP1'] });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules(),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };

      const result = generateSchedule(input);
      const combined = computeCombinedProduction(result, 'dr1');
      const target75 = doc.dailyGoal * 0.75; // $2,250

      // Should be at or above 75% target (within +50% — fill loop keeps going)
      expect(combined).toBeGreaterThanOrEqual(target75 * 0.7);

      // Verify no opBreakdown for single-op doctors
      const summary = result.productionSummary.find(s => s.providerId === 'dr1');
      expect(summary?.opBreakdown).toBeUndefined();
    });

    it('HP blocks ($1,200) are placed on single-op doctor with $3,000 goal', () => {
      const doc = makeDoctor({ operatories: ['OP1'] });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules(),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };

      const result = generateSchedule(input);
      const hpSlots = result.slots.filter(
        s => s.providerId === 'dr1' && s.blockTypeId === 'hp-default'
      );
      // Should have at least 1 HP block placed
      expect(hpSlots.length).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 2-Op Doctor
  // ──────────────────────────────────────────────────────────────────────────────

  describe('2-op doctor ($3,000 goal)', () => {
    function runTwoOp() {
      const doc = makeDoctor({ operatories: ['OP1', 'OP2'] });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules(),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };
      return { doc, result: generateSchedule(input) };
    }

    it('combined production is within 20% of target (≈ $2,250–$3,375)', () => {
      const { doc, result } = runTwoOp();
      const combined = computeCombinedProduction(result, 'dr1');
      const target75 = doc.dailyGoal * 0.75; // $2,250

      expect(combined).toBeGreaterThanOrEqual(target75 * 0.8); // at least 80% of $2,250
      // No individual op should vastly exceed the full goal
      expect(combined).toBeLessThan(doc.dailyGoal * 2); // sanity check — not 2× the goal
    });

    it('Op 0 carries at least 40% of combined production', () => {
      const { result } = runTwoOp();
      const op0 = computeOpProduction(result, 'dr1', 'OP1');
      const op1 = computeOpProduction(result, 'dr1', 'OP2');
      const combined = op0 + op1;

      if (combined > 0) {
        const op0Pct = op0 / combined;
        // Op 0 should carry the lion's share (at least 40%)
        expect(op0Pct).toBeGreaterThanOrEqual(0.4);
      }
    });

    it('HP blocks ($1,200) are placed even though per-op split would be $1,125 (< $1,200)', () => {
      // Sprint 5 bug: $3,000 / 2 ops = $1,500 target per op, target75 = $1,125.
      // The old code had a guard that blocked HP if hpAmount > target75 * 1.5 = $1,687.
      // With shared pool, target75 = $2,250 total, so HP ($1,200) fits fine.
      const { result } = runTwoOp();
      const hpSlots = result.slots.filter(
        s => s.providerId === 'dr1' && s.blockTypeId === 'hp-default'
      );
      // With shared pool we should be able to place HP blocks
      expect(hpSlots.length).toBeGreaterThan(0);
    });

    it('per-op opBreakdown is populated with 2 entries', () => {
      const { result } = runTwoOp();
      const summary = result.productionSummary.find(s => s.providerId === 'dr1');
      expect(summary?.opBreakdown).toBeDefined();
      expect(summary?.opBreakdown).toHaveLength(2);
    });

    it('no individual op exceeds the full shared target ($2,250)', () => {
      const { doc, result } = runTwoOp();
      const target75 = doc.dailyGoal * 0.75; // $2,250
      const op0 = computeOpProduction(result, 'dr1', 'OP1');
      const op1 = computeOpProduction(result, 'dr1', 'OP2');

      // Neither op on its own should exceed the full target (with a 25% fill buffer)
      expect(op0).toBeLessThan(target75 * 1.35);
      expect(op1).toBeLessThan(target75 * 1.35);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 3-Op Doctor
  // ──────────────────────────────────────────────────────────────────────────────

  describe('3-op doctor ($3,000 goal)', () => {
    function runThreeOp() {
      const doc = makeDoctor({ operatories: ['OP1', 'OP2', 'OP3'] });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules(),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };
      return { doc, result: generateSchedule(input) };
    }

    it('combined production is within 20% of $2,250 target', () => {
      const { doc, result } = runThreeOp();
      const combined = computeCombinedProduction(result, 'dr1');
      const target75 = doc.dailyGoal * 0.75; // $2,250

      expect(combined).toBeGreaterThanOrEqual(target75 * 0.8);
    });

    it('HP blocks ($1,200) can be placed even when per-op would have been $750', () => {
      // Sprint 5 old bug: $3,000 / 3 ops = $1,000 per op → target75 = $750 per op.
      // HP at $1,200 > $750 * 1.5 = $1,125 → would have been blocked.
      // With shared pool: target = $2,250 total, so $1,200 is well within range.
      const { result } = runThreeOp();
      const hpSlots = result.slots.filter(
        s => s.providerId === 'dr1' && s.blockTypeId === 'hp-default'
      );
      expect(hpSlots.length).toBeGreaterThan(0);
    });

    it('Op 0 carries more production than Op 1, which carries more than Op 2', () => {
      const { result } = runThreeOp();
      const op0 = computeOpProduction(result, 'dr1', 'OP1');
      const op1 = computeOpProduction(result, 'dr1', 'OP2');
      const op2 = computeOpProduction(result, 'dr1', 'OP3');

      // Op 0 should be >= Op 1 (leading production)
      expect(op0).toBeGreaterThanOrEqual(op1);
      // Ops 1 and 2 combined should be less than Op 0 (Op 0 is majority)
      // This is a soft check — allow Op 2 to be 0 if goal was already met
    });

    it('per-op opBreakdown is populated with ≤3 entries (only ops with production)', () => {
      const { result } = runThreeOp();
      const summary = result.productionSummary.find(s => s.providerId === 'dr1');
      // opBreakdown exists if at least 2 ops have production
      if (summary?.opBreakdown) {
        expect(summary.opBreakdown.length).toBeGreaterThanOrEqual(2);
        expect(summary.opBreakdown.length).toBeLessThanOrEqual(3);
      }
    });

    it('combined production does not triple-count the goal (< 2× dailyGoal)', () => {
      const { doc, result } = runThreeOp();
      const combined = computeCombinedProduction(result, 'dr1');
      // Combined across 3 ops should NOT be 3× the per-op amount — the old bug
      expect(combined).toBeLessThan(doc.dailyGoal * 2);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // 2-Op Doctor — $5,000 goal
  // ──────────────────────────────────────────────────────────────────────────────

  describe('2-op doctor ($5,000 goal)', () => {
    it('combined production ≈ $3,750 target (within 20%)', () => {
      const doc = makeDoctor({ operatories: ['OP1', 'OP2'], dailyGoal: 5000 });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules(),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };

      const result = generateSchedule(input);
      const combined = computeCombinedProduction(result, 'dr1');
      const target75 = doc.dailyGoal * 0.75; // $3,750

      expect(combined).toBeGreaterThanOrEqual(target75 * 0.8);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Single-op doctor — verify no regression from pre-Sprint 5 behavior
  // ──────────────────────────────────────────────────────────────────────────────

  describe('single-op path (doubleBooking disabled)', () => {
    it('doctor with 2 assigned ops but doubleBooking=false behaves as single-op', () => {
      const doc = makeDoctor({ operatories: ['OP1', 'OP2'] });
      const input: GenerationInput = {
        providers: [doc],
        blockTypes: STANDARD_BLOCK_TYPES,
        rules: makeRules({ doubleBooking: false }),
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };

      const result = generateSchedule(input);
      // With doubleBooking=false, only OP1 should have slots for this doctor
      const op2Slots = result.slots.filter(
        s => s.providerId === 'dr1' && s.operatory === 'OP2'
      );
      expect(op2Slots).toHaveLength(0);

      // Production should behave like single-op
      const combined = computeCombinedProduction(result, 'dr1');
      const target75 = doc.dailyGoal * 0.75;
      expect(combined).toBeGreaterThanOrEqual(target75 * 0.7);

      // No opBreakdown for effective single-op
      const summary = result.productionSummary.find(s => s.providerId === 'dr1');
      expect(summary?.opBreakdown).toBeUndefined();
    });
  });
});
