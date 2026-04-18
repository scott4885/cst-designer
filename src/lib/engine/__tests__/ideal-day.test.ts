import { describe, it, expect } from 'vitest';
import {
  scoreScheduleAlignment,
  DEFAULT_IDEAL_DAY_TEMPLATE,
  type IdealDayTemplate,
} from '../ideal-day';
import type { GenerationResult, TimeSlotOutput } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlot(overrides: Partial<TimeSlotOutput> & { time: string; blockLabel: string; blockTypeId: string }): TimeSlotOutput {
  return {
    providerId: 'dr1',
    operatory: 'OP1',
    staffingCode: 'D',
    isBreak: false,
    ...overrides,
  } as TimeSlotOutput;
}

function makeSchedule(slots: TimeSlotOutput[]): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots,
    productionSummary: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** All blocks in exactly the right place (100% aligned) */
function createPerfectSchedule(): GenerationResult {
  return makeSchedule([
    // HP block in the morning (08:00–08:30) ✓
    makeSlot({ time: '08:00', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:10', blockTypeId: 'hp1', blockLabel: 'HP' }),
    makeSlot({ time: '08:20', blockTypeId: 'hp1', blockLabel: 'HP' }),
    // NP block in the morning (09:00) ✓
    makeSlot({ time: '09:00', blockTypeId: 'np1', blockLabel: 'NP CONS' }),
    makeSlot({ time: '09:10', blockTypeId: 'np1', blockLabel: 'NP CONS' }),
    // SRP block in the morning (10:00) ✓
    makeSlot({ time: '10:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'srp1', blockLabel: 'SRP' }),
    makeSlot({ time: '10:10', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'srp1', blockLabel: 'SRP' }),
    // Recare block in the afternoon (14:00) ✓
    makeSlot({ time: '14:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'rc1', blockLabel: 'Recare' }),
    makeSlot({ time: '14:10', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'rc1', blockLabel: 'Recare' }),
    // MP block in the afternoon (15:00) ✓
    makeSlot({ time: '15:00', blockTypeId: 'mp1', blockLabel: 'MP' }),
    makeSlot({ time: '15:10', blockTypeId: 'mp1', blockLabel: 'MP' }),
    // PM block in the afternoon (16:00) ✓
    makeSlot({ time: '16:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'pm1', blockLabel: 'PM' }),
  ]);
}

/** All preference-specific blocks in the WRONG place (0% aligned) */
function createFullyMisalignedSchedule(): GenerationResult {
  return makeSchedule([
    // HP in the afternoon ✗ (should be morning)
    makeSlot({ time: '14:00', blockTypeId: 'hp1', blockLabel: 'HP' }),
    // NP in the afternoon ✗ (should be morning)
    makeSlot({ time: '15:00', blockTypeId: 'np1', blockLabel: 'NP CONS' }),
    // SRP in the afternoon ✗ (should be morning)
    makeSlot({ time: '16:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'srp1', blockLabel: 'SRP' }),
    // Recare in the morning ✗ (should be afternoon)
    makeSlot({ time: '08:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'rc1', blockLabel: 'Recare' }),
    // MP in the morning ✗ (should be afternoon)
    makeSlot({ time: '09:00', blockTypeId: 'mp1', blockLabel: 'MP' }),
    // PM in the morning ✗ (should be afternoon)
    makeSlot({ time: '10:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'pm1', blockLabel: 'PM' }),
  ]);
}

/** Half blocks correct, half wrong */
function createPartiallyAlignedSchedule(): GenerationResult {
  return makeSchedule([
    // HP correct (morning) ✓
    makeSlot({ time: '08:00', blockTypeId: 'hp1', blockLabel: 'HP' }),
    // NP correct (morning) ✓
    makeSlot({ time: '09:00', blockTypeId: 'np1', blockLabel: 'NP CONS' }),
    // Recare WRONG (morning — should be afternoon) ✗
    makeSlot({ time: '10:00', providerId: 'hyg1', operatory: 'OP2', staffingCode: 'H', blockTypeId: 'rc1', blockLabel: 'Recare' }),
    // MP WRONG (morning — should be afternoon) ✗
    makeSlot({ time: '11:00', blockTypeId: 'mp1', blockLabel: 'MP' }),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ideal day scoring', () => {
  describe('scoreScheduleAlignment', () => {
    it('should return 100% overall score when schedule is perfectly aligned', () => {
      const score = scoreScheduleAlignment(createPerfectSchedule(), DEFAULT_IDEAL_DAY_TEMPLATE);

      expect(score.overallScore).toBe(100);
      expect(score.alignedBlocks).toBeGreaterThan(0);
      expect(score.alignedBlocks).toBe(score.totalBlocks);
    });

    it('should return 0% overall score when ALL blocks are in the wrong half', () => {
      const score = scoreScheduleAlignment(createFullyMisalignedSchedule(), DEFAULT_IDEAL_DAY_TEMPLATE);

      expect(score.overallScore).toBe(0);
      expect(score.alignedBlocks).toBe(0);
      expect(score.totalBlocks).toBeGreaterThan(0);
    });

    it('should return an intermediate score for a partially aligned schedule', () => {
      const score = scoreScheduleAlignment(createPartiallyAlignedSchedule(), DEFAULT_IDEAL_DAY_TEMPLATE);

      // 2 correct (HP, NP) out of 4 total (HP, NP, Recare, MP) = 50%
      expect(score.overallScore).toBe(50);
      expect(score.alignedBlocks).toBe(2);
      expect(score.totalBlocks).toBe(4);
    });

    it('should return 100% for an empty schedule (nothing to misalign)', () => {
      const emptySchedule = makeSchedule([]);
      const score = scoreScheduleAlignment(emptySchedule, DEFAULT_IDEAL_DAY_TEMPLATE);

      expect(score.overallScore).toBe(100);
      expect(score.totalBlocks).toBe(0);
      expect(score.alignedBlocks).toBe(0);
    });

    it('should count ER blocks as always aligned (ANY preference)', () => {
      const schedule = makeSchedule([
        // ER at any time — should NOT affect the score
        makeSlot({ time: '08:00', blockTypeId: 'er1', blockLabel: 'ER' }),
        makeSlot({ time: '15:00', blockTypeId: 'er1', blockLabel: 'ER' }),
      ]);
      const score = scoreScheduleAlignment(schedule, DEFAULT_IDEAL_DAY_TEMPLATE);

      // Only ANY-preference blocks → overall score should be 100%
      expect(score.overallScore).toBe(100);
    });

    it('should return a per-category breakdown', () => {
      const score = scoreScheduleAlignment(createPerfectSchedule(), DEFAULT_IDEAL_DAY_TEMPLATE);

      expect(score.categoryBreakdown).toBeDefined();
      expect(Array.isArray(score.categoryBreakdown)).toBe(true);
      expect(score.categoryBreakdown.length).toBeGreaterThan(0);

      // HP should be present and 100%
      const hpScore = score.categoryBreakdown.find(c => c.category === 'HP');
      expect(hpScore).toBeDefined();
      expect(hpScore!.score).toBe(100);
    });

    it('should list misplaced block times in the breakdown', () => {
      const score = scoreScheduleAlignment(createFullyMisalignedSchedule(), DEFAULT_IDEAL_DAY_TEMPLATE);

      // HP is misplaced (in the afternoon)
      const hpScore = score.categoryBreakdown.find(c => c.category === 'HP');
      expect(hpScore).toBeDefined();
      expect(hpScore!.misplacedBlockTimes).toContain('14:00');

      // Recare is misplaced (in the morning)
      const recareScore = score.categoryBreakdown.find(c => c.category === 'RECARE');
      expect(recareScore).toBeDefined();
      expect(recareScore!.misplacedBlockTimes).toContain('08:00');
    });

    it('should handle a schedule with only lunch breaks', () => {
      const schedule = makeSchedule([
        { time: '13:00', providerId: 'dr1', operatory: 'OP1', staffingCode: null, blockTypeId: null, blockLabel: 'LUNCH', isBreak: true },
      ]);
      const score = scoreScheduleAlignment(schedule, DEFAULT_IDEAL_DAY_TEMPLATE);
      expect(score.overallScore).toBe(100);
      expect(score.totalBlocks).toBe(0);
    });

    it('should handle blocks with production amount suffixes in labels', () => {
      // "HP>$1200" should still categorize as HP
      const schedule = makeSchedule([
        makeSlot({ time: '08:00', blockTypeId: 'hp1', blockLabel: 'HP>$1200' }),
      ]);
      const score = scoreScheduleAlignment(schedule, DEFAULT_IDEAL_DAY_TEMPLATE);

      // HP in morning → aligned
      expect(score.overallScore).toBe(100);
    });

    it('should handle custom templates with different preferences', () => {
      const afternoonOnlyTemplate: IdealDayTemplate = {
        name: 'Custom',
        preferences: [
          { category: 'HP', preferredTimeOfDay: 'AFTERNOON' },
        ],
      };

      // HP in morning — misaligned for this custom template
      const schedule = makeSchedule([
        makeSlot({ time: '08:00', blockTypeId: 'hp1', blockLabel: 'HP' }),
      ]);
      const score = scoreScheduleAlignment(schedule, afternoonOnlyTemplate);
      expect(score.overallScore).toBe(0);

      // HP in afternoon — aligned for this custom template
      const afternoonSchedule = makeSchedule([
        makeSlot({ time: '14:00', blockTypeId: 'hp1', blockLabel: 'HP' }),
      ]);
      const afternoonScore = scoreScheduleAlignment(afternoonSchedule, afternoonOnlyTemplate);
      expect(afternoonScore.overallScore).toBe(100);
    });
  });
});
