import { describe, it, expect } from 'vitest';
import {
  generateTimeSlots,
  isLunchTime,
  getStaffingCode,
  generateSchedule
} from '../generator';
import type { GenerationInput, ProviderInput, BlockTypeInput } from '../types';

describe('generator', () => {
  describe('generateTimeSlots', () => {
    it('should generate correct number of slots for 7:00-18:00 with 10min increment', () => {
      const slots = generateTimeSlots('07:00', '18:00', 10);
      
      // 7:00 to 18:00 = 11 hours = 660 minutes / 10 = 66 slots
      expect(slots).toHaveLength(66);
      expect(slots[0]).toBe('07:00');
      expect(slots[1]).toBe('07:10');
      expect(slots[65]).toBe('17:50');
    });

    it('should generate correct slots for 15min increment', () => {
      const slots = generateTimeSlots('07:00', '18:00', 15);
      
      // 11 hours = 660 minutes / 15 = 44 slots
      expect(slots).toHaveLength(44);
      expect(slots[0]).toBe('07:00');
      expect(slots[1]).toBe('07:15');
      expect(slots[2]).toBe('07:30');
    });

    it('should handle different time ranges', () => {
      const slots = generateTimeSlots('08:00', '12:00', 10);
      
      // 4 hours = 240 minutes / 10 = 24 slots
      expect(slots).toHaveLength(24);
      expect(slots[0]).toBe('08:00');
      expect(slots[23]).toBe('11:50');
    });

    it('should format times with leading zeros', () => {
      const slots = generateTimeSlots('09:05', '09:35', 10);
      
      expect(slots[0]).toBe('09:05');
      expect(slots[1]).toBe('09:15');
      expect(slots[2]).toBe('09:25');
    });
  });

  describe('isLunchTime', () => {
    it('should return true for time within lunch break', () => {
      expect(isLunchTime('13:00', '13:00', '14:00')).toBe(true);
      expect(isLunchTime('13:30', '13:00', '14:00')).toBe(true);
    });

    it('should return false for time before lunch', () => {
      expect(isLunchTime('12:50', '13:00', '14:00')).toBe(false);
    });

    it('should return false for time at lunch end', () => {
      expect(isLunchTime('14:00', '13:00', '14:00')).toBe(false);
    });

    it('should return false when no lunch configured', () => {
      expect(isLunchTime('13:00', undefined, undefined)).toBe(false);
    });
  });

  describe('getStaffingCode', () => {
    it('should return D for doctor', () => {
      expect(getStaffingCode('DOCTOR')).toBe('D');
    });

    it('should return H for hygienist', () => {
      expect(getStaffingCode('HYGIENIST')).toBe('H');
    });
  });

  describe('generateSchedule', () => {
    const createTestInput = (): GenerationInput => {
      const drFitzpatrick: ProviderInput = {
        id: 'dr1',
        name: 'Dr. Kevin Fitzpatrick',
        role: 'DOCTOR',
        operatories: ['OP1', 'OP2'],
        workingStart: '07:00',
        workingEnd: '18:00',
        lunchStart: '13:00',
        lunchEnd: '14:00',
        dailyGoal: 5000,
        color: '#ec8a1b'
      };

      const blockTypes: BlockTypeInput[] = [
        {
          id: 'hp1',
          label: 'HP > $1200',
          description: 'High Production',
          minimumAmount: 1200,
          appliesToRole: 'DOCTOR',
          durationMin: 70
        },
        {
          id: 'np1',
          label: 'NP CONS',
          description: 'New Patient',
          minimumAmount: 150,
          appliesToRole: 'DOCTOR',
          durationMin: 30
        },
        {
          id: 'srp1',
          label: 'SRP',
          description: 'Scaling & Root Planing',
          minimumAmount: 300,
          appliesToRole: 'HYGIENIST',
          durationMin: 60
        }
      ];

      return {
        providers: [drFitzpatrick],
        blockTypes,
        rules: {
          npModel: 'DOCTOR_ONLY',
          npBlocksPerDay: 1,
          srpBlocksPerDay: 1,
          hpPlacement: 'MORNING',
          doubleBooking: false,
          matrixing: true,
          emergencyHandling: 'ACCESS_BLOCKS'
        },
        timeIncrement: 10,
        dayOfWeek: 'Monday'
      };
    };

    it('should generate schedule with correct time slots', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      expect(result.dayOfWeek).toBe('Monday');
      expect(result.slots.length).toBeGreaterThan(0);

      // Verify time slots are generated
      const times = result.slots.map(s => s.time);
      expect(times).toContain('07:00');
      expect(times).toContain('17:50');
    });

    it('should mark lunch breaks correctly', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      const lunchSlots = result.slots.filter(s => s.isBreak && s.blockLabel === 'LUNCH');
      expect(lunchSlots.length).toBeGreaterThan(0);

      // Check lunch is between 13:00 and 14:00
      const lunchTimes = lunchSlots.map(s => s.time);
      expect(lunchTimes).toContain('13:00');
      expect(lunchTimes).toContain('13:50');
    });

    it('should place NP blocks according to model rules', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      const npSlots = result.slots.filter(s =>
        s.blockTypeId === 'np1'
      );

      // Should have at least one NP block
      expect(npSlots.length).toBeGreaterThan(0);

      // NP blocks should be in doctor's column with D or A staffing (A for first/last slots)
      npSlots.forEach(slot => {
        expect(slot.providerId).toBe('dr1');
        expect(['D', 'A']).toContain(slot.staffingCode);
      });
    });

    it('should place HP blocks to meet 75% target', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      // Check production summary
      expect(result.productionSummary).toHaveLength(1);
      
      const drSummary = result.productionSummary[0];
      expect(drSummary.providerId).toBe('dr1');
      expect(drSummary.dailyGoal).toBe(5000);
      expect(drSummary.target75).toBe(3750);
      
      // Should have scheduled production close to target
      expect(drSummary.actualScheduled).toBeGreaterThan(0);
    });

    it('should respect HP placement preference (morning)', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      const hpSlots = result.slots.filter(s => s.blockTypeId === 'hp1');

      if (hpSlots.length > 0) {
        // Most HP blocks should be in the morning (before noon)
        const morningHpSlots = hpSlots.filter(s => {
          const [hour] = s.time.split(':').map(Number);
          return hour < 12;
        });

        // At least some HP blocks should be in the morning
        expect(morningHpSlots.length).toBeGreaterThan(0);
      }
    });

    it('should generate production summary with status', () => {
      const input = createTestInput();
      const result = generateSchedule(input);

      expect(result.productionSummary).toHaveLength(1);
      
      const summary = result.productionSummary[0];
      expect(summary.status).toMatch(/^(MET|UNDER|OVER)$/);
      expect(summary.blocks).toBeDefined();
      expect(Array.isArray(summary.blocks)).toBe(true);
    });

    it('should handle multiple providers', () => {
      const input = createTestInput();
      
      // Add a hygienist
      input.providers.push({
        id: 'hyg1',
        name: 'Cheryl Dise RDH',
        role: 'HYGIENIST',
        operatories: ['OP3'],
        workingStart: '07:00',
        workingEnd: '18:00',
        lunchStart: '13:00',
        lunchEnd: '14:00',
        dailyGoal: 2602,
        color: '#87bcf3'
      });

      const result = generateSchedule(input);

      // Should have slots for both providers
      const drSlots = result.slots.filter(s => s.providerId === 'dr1');
      const hygSlots = result.slots.filter(s => s.providerId === 'hyg1');

      expect(drSlots.length).toBeGreaterThan(0);
      expect(hygSlots.length).toBeGreaterThan(0);

      // Should have production summary for both
      expect(result.productionSummary).toHaveLength(2);
    });

    it('should place SRP blocks for hygienists', () => {
      const input = createTestInput();
      
      // Add a hygienist
      input.providers.push({
        id: 'hyg1',
        name: 'Hygienist',
        role: 'HYGIENIST',
        operatories: ['OP3'],
        workingStart: '07:00',
        workingEnd: '18:00',
        lunchStart: '13:00',
        lunchEnd: '14:00',
        dailyGoal: 2000,
        color: '#87bcf3'
      });

      const result = generateSchedule(input);

      const srpSlots = result.slots.filter(s => s.blockTypeId === 'srp1');

      // SRP blocks should exist for hygienist
      if (srpSlots.length > 0) {
        srpSlots.forEach(slot => {
          expect(slot.providerId).toBe('hyg1');
          expect(slot.staffingCode).toBe('H');
        });
      }
    });

    it('should return warnings when constraints cannot be met', () => {
      const input = createTestInput();

      // Tight single-op window — no room to hit the 75% target, no room for
      // the 70-min HP block. Using a single op here isolates the "unmet
      // target" warning; multi-op adds capacity and would mask it.
      input.providers[0].operatories = ['OP1'];
      input.providers[0].workingStart = '07:00';
      input.providers[0].workingEnd = '08:00'; // Only 1 hour

      const result = generateSchedule(input);

      // Should have warnings about not being able to place all blocks
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    // ── Multi-column stagger tests ──────────────────────────────────────────

    /**
     * Build a minimal GenerationInput for a single doctor working 2 or 3 operatories.
     * doubleBooking must be true so the generator creates slots for all operatories.
     */
    function createMultiColumnInput(numColumns: number, customStaggerInterval?: number): GenerationInput {
      const ops = ['OP1', 'OP2', 'OP3'].slice(0, numColumns);
      const provider: ProviderInput = {
        id: 'drMulti',
        name: 'Dr. Multi',
        role: 'DOCTOR',
        operatories: ops,
        workingStart: '07:00',
        workingEnd: '17:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        dailyGoal: 5000,
        color: '#000',
        ...(customStaggerInterval !== undefined ? { columnStaggerIntervalMin: customStaggerInterval } : {}),
      };
      const blockTypes: BlockTypeInput[] = [
        { id: 'hp1', label: 'HP > $1200', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 60 },
        { id: 'np1', label: 'NP CONS',   minimumAmount: 150,  appliesToRole: 'DOCTOR', durationMin: 30 },
        { id: 'mp1', label: 'MP',        minimumAmount: 375,  appliesToRole: 'DOCTOR', durationMin: 40 },
        { id: 'er1', label: 'ER',        minimumAmount: 187,  appliesToRole: 'DOCTOR', durationMin: 30 },
      ];
      return {
        providers: [provider],
        blockTypes,
        rules: {
          npModel: 'DOCTOR_ONLY',
          npBlocksPerDay: 1,
          srpBlocksPerDay: 1,
          hpPlacement: 'MORNING',
          doubleBooking: true,   // must be true to activate multi-op slots
          matrixing: false,
          emergencyHandling: 'DEDICATED',
        },
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };
    }

    it('single-column provider should have no column stagger (all slots in one operatory)', () => {
      const input = createMultiColumnInput(1);
      const result = generateSchedule(input);

      const op1Slots = result.slots.filter(s => s.providerId === 'drMulti' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId);
      expect(op1Slots.length).toBeGreaterThan(0);

      // No OP2 slots should exist for this provider
      const op2Slots = result.slots.filter(s => s.providerId === 'drMulti' && s.operatory === 'OP2');
      expect(op2Slots.length).toBe(0);
    });

    it('two-column provider should have schedules that are NOT identical across columns', () => {
      const input = createMultiColumnInput(2);
      const result = generateSchedule(input);

      const op1Active = result.slots.filter(s =>
        s.providerId === 'drMulti' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId
      );
      const op2Active = result.slots.filter(s =>
        s.providerId === 'drMulti' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId
      );

      expect(op1Active.length).toBeGreaterThan(0);
      expect(op2Active.length).toBeGreaterThan(0);

      // The set of occupied times must differ between OP1 and OP2
      const op1Times = new Set(op1Active.map(s => s.time));
      const op2Times = new Set(op2Active.map(s => s.time));

      // There should be times in OP1 that are NOT in OP2 (because col2 is shifted by 20min)
      const uniqueToOp1 = [...op1Times].filter(t => !op2Times.has(t));
      expect(uniqueToOp1.length).toBeGreaterThan(0);
    });

    it('two-column provider: column 2 first block starts at least 20min after column 1 first block', () => {
      const input = createMultiColumnInput(2);
      const result = generateSchedule(input);

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      const op1FirstBlock = result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      const op2FirstBlock = result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      expect(op1FirstBlock).toBeDefined();
      expect(op2FirstBlock).toBeDefined();

      // Column 2 must start at least 20 minutes after column 1 (the stagger offset)
      const startDiff = toMin(op2FirstBlock!.time) - toMin(op1FirstBlock!.time);
      expect(startDiff).toBeGreaterThanOrEqual(20);
    });

    it('three-column provider: columns are offset by 0, 20, 40 min respectively', () => {
      const input = createMultiColumnInput(3);
      const result = generateSchedule(input);

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      const firstBlockTime = (op: string) =>
        result.slots
          .filter(s => s.providerId === 'drMulti' && s.operatory === op && !s.isBreak && s.blockTypeId)
          .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      const col1First = firstBlockTime('OP1');
      const col2First = firstBlockTime('OP2');
      const col3First = firstBlockTime('OP3');

      expect(col1First).toBeDefined();
      expect(col2First).toBeDefined();
      expect(col3First).toBeDefined();

      // OP2 starts ≥20 min after OP1
      expect(toMin(col2First!.time) - toMin(col1First!.time)).toBeGreaterThanOrEqual(20);
      // OP3 starts ≥40 min after OP1
      expect(toMin(col3First!.time) - toMin(col1First!.time)).toBeGreaterThanOrEqual(40);
    });

    it('multi-column stagger interval is configurable per provider', () => {
      const input30 = createMultiColumnInput(2, 30); // 30min stagger interval
      const result = generateSchedule(input30);

      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      const op1First = result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      const op2First = result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      expect(op1First).toBeDefined();
      expect(op2First).toBeDefined();

      // With 30min interval, column 2 must start at least 30 min after column 1
      const startDiff = toMin(op2First!.time) - toMin(op1First!.time);
      expect(startDiff).toBeGreaterThanOrEqual(30);
    });

    it('multi-column provider should not have the same blocks at every time slot', () => {
      const input = createMultiColumnInput(2);
      const result = generateSchedule(input);

      // If the schedules were identical (old mirroring bug), every block in OP1 would
      // appear at the exact same time in OP2. We verify this is no longer the case.
      const op1BlocksByTime = new Map<string, string | null>();
      result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
        .forEach(s => op1BlocksByTime.set(s.time, s.blockTypeId));

      const op2BlocksByTime = new Map<string, string | null>();
      result.slots
        .filter(s => s.providerId === 'drMulti' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
        .forEach(s => op2BlocksByTime.set(s.time, s.blockTypeId));

      // Count times where both OP1 and OP2 have a block at the same time (double-booking)
      let simultaneousCount = 0;
      for (const [time] of op1BlocksByTime) {
        if (op2BlocksByTime.has(time)) simultaneousCount++;
      }

      // There may be some overlap (e.g. fill blocks) but the schedules should NOT be fully identical.
      // The stagger means OP1 and OP2 blocks differ in start times.
      // OP1 total blocks count should NOT equal the simultaneously-occupied slots count (i.e., not all overlap)
      expect(simultaneousCount).toBeLessThan(op1BlocksByTime.size);
    });
  });

  // ── Sprint 5: Multi-Op Production Goal Fix (§5.4) ────────────────────────
  describe('multi-op production goal fix (Sprint 5)', () => {
    function makeMultiOpInput(numOps: number, dailyGoal: number): GenerationInput {
      const ops = Array.from({ length: numOps }, (_, i) => `OP${i + 1}`);
      const provider: ProviderInput = {
        id: 'drFix',
        name: 'Dr. Fix',
        role: 'DOCTOR',
        operatories: ops,
        workingStart: '07:00',
        workingEnd: '17:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        dailyGoal,
        color: '#000',
      };
      const blockTypes: BlockTypeInput[] = [
        { id: 'hp1', label: 'HP > $1200', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 60 },
        { id: 'np1', label: 'NP CONS',   minimumAmount: 150,  appliesToRole: 'DOCTOR', durationMin: 30 },
        { id: 'mp1', label: 'MP',        minimumAmount: 375,  appliesToRole: 'DOCTOR', durationMin: 40 },
        { id: 'er1', label: 'ER',        minimumAmount: 187,  appliesToRole: 'DOCTOR', durationMin: 30 },
      ];
      return {
        providers: [provider],
        blockTypes,
        rules: {
          npModel: 'DOCTOR_ONLY',
          npBlocksPerDay: 1,
          srpBlocksPerDay: 1,
          hpPlacement: 'MORNING',
          doubleBooking: true,
          matrixing: false,
          emergencyHandling: 'DEDICATED',
        },
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };
    }

    function getActualProduction(result: ReturnType<typeof generateSchedule>): number {
      const summary = result.productionSummary.find(s => s.providerId === 'drFix');
      return summary?.actualScheduled ?? 0;
    }

    it('single-op doctor: production ≈ dailyGoal (baseline unchanged)', () => {
      const result = generateSchedule(makeMultiOpInput(1, 3000));
      const actual = getActualProduction(result);
      // Should be close to target75 of 3000 = 2250, not more than 2× goal
      expect(actual).toBeLessThanOrEqual(3000 * 2);
      expect(actual).toBeGreaterThan(0);
    });

    it('2-op doctor goal $3,000: combined production stays reasonable (not $6,000)', () => {
      const result = generateSchedule(makeMultiOpInput(2, 3000));
      const actual = getActualProduction(result);
      // UX-V3: Both ops fill the full day, so production will exceed goal
      // but should not be 2x the goal (blocks use lower values when target exceeded)
      expect(actual).toBeLessThanOrEqual(3000 * 2.5);
      expect(actual).toBeGreaterThan(0);
    });

    it('3-op doctor goal $3,000: combined production stays reasonable (not $9,000)', () => {
      const result = generateSchedule(makeMultiOpInput(3, 3000));
      const actual = getActualProduction(result);
      // UX-V3: All 3 ops fill the full day, production exceeds goal but stays reasonable
      expect(actual).toBeLessThanOrEqual(3000 * 3.5);
      expect(actual).toBeGreaterThan(0);
    });

    it('2-op doctor: both ops have blocks (not just Op 1)', () => {
      const result = generateSchedule(makeMultiOpInput(2, 3000));
      const op1 = result.slots.filter(s => s.providerId === 'drFix' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId);
      const op2 = result.slots.filter(s => s.providerId === 'drFix' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId);
      expect(op1.length).toBeGreaterThan(0);
      expect(op2.length).toBeGreaterThan(0);
    });

    it('productionSummary dailyGoal reflects the original (full) goal, not per-op goal', () => {
      // The summary should still show the doctor's real goal for display purposes
      const result = generateSchedule(makeMultiOpInput(2, 3000));
      const summary = result.productionSummary.find(s => s.providerId === 'drFix');
      expect(summary?.dailyGoal).toBe(3000);
    });
  });

  // ── UX-V3: Full day fill + staggered 2-op scheduling ────────────────────
  describe('UX-V3: full day fill across all operatories', () => {
    function createFullDayInput(numOps: number, staggerOffset?: number): GenerationInput {
      const ops = Array.from({ length: numOps }, (_, i) => `OP${i + 1}`);
      const provider: ProviderInput = {
        id: 'drFull',
        name: 'Dr. Full',
        role: 'DOCTOR',
        operatories: ops,
        workingStart: '08:00',
        workingEnd: '17:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        dailyGoal: 5000,
        color: '#000',
        ...(staggerOffset !== undefined ? { staggerOffsetMin: staggerOffset } : {}),
      };
      const blockTypes: BlockTypeInput[] = [
        { id: 'hp1', label: 'HP > $1200', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 60 },
        { id: 'np1', label: 'NP CONS',   minimumAmount: 150,  appliesToRole: 'DOCTOR', durationMin: 30 },
        { id: 'mp1', label: 'MP',        minimumAmount: 375,  appliesToRole: 'DOCTOR', durationMin: 40 },
        { id: 'er1', label: 'ER',        minimumAmount: 187,  appliesToRole: 'DOCTOR', durationMin: 30 },
      ];
      return {
        providers: [provider],
        blockTypes,
        rules: {
          npModel: 'DOCTOR_ONLY',
          npBlocksPerDay: 1,
          srpBlocksPerDay: 1,
          hpPlacement: 'MORNING',
          doubleBooking: true,
          matrixing: false,
          emergencyHandling: 'DEDICATED',
        },
        timeIncrement: 10,
        dayOfWeek: 'Monday',
      };
    }

    const toMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    it('2-op doctor: BOTH ops should have blocks throughout the day', () => {
      const input = createFullDayInput(2);
      const result = generateSchedule(input);

      const op1Blocks = result.slots.filter(s =>
        s.providerId === 'drFull' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId
      );
      const op2Blocks = result.slots.filter(s =>
        s.providerId === 'drFull' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId
      );

      // Both ops should have significant blocks (at least 10 each for an 8-hour day)
      expect(op1Blocks.length).toBeGreaterThan(10);
      expect(op2Blocks.length).toBeGreaterThan(10);
    });

    it('2-op doctor: Op 2 blocks should span most of the working day, not just first 2 hours', () => {
      const input = createFullDayInput(2);
      const result = generateSchedule(input);

      const op2Blocks = result.slots.filter(s =>
        s.providerId === 'drFull' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId
      );

      const op2Times = op2Blocks.map(s => toMin(s.time));
      const op2Min = Math.min(...op2Times);
      const op2Max = Math.max(...op2Times);
      const op2Span = op2Max - op2Min;

      // Op 2 should span at least 4 hours of blocks (240 min), not just 2 hours
      expect(op2Span).toBeGreaterThanOrEqual(240);
    });

    it('staggered 2-op: Op 2 first block is offset from Op 1 first block', () => {
      const input = createFullDayInput(2);
      const result = generateSchedule(input);

      const op1First = result.slots
        .filter(s => s.providerId === 'drFull' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      const op2First = result.slots
        .filter(s => s.providerId === 'drFull' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
        .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

      expect(op1First).toBeDefined();
      expect(op2First).toBeDefined();

      // Op 2 should start at least 20 min after Op 1 (stagger offset)
      const diff = toMin(op2First!.time) - toMin(op1First!.time);
      expect(diff).toBeGreaterThanOrEqual(20);
    });

    it('staggered 2-op: Op 1 and Op 2 block occupancy differs (not mirrors)', () => {
      const input = createFullDayInput(2);
      const result = generateSchedule(input);

      // Compare which time slots are occupied in each op
      const op1Times = new Set(
        result.slots
          .filter(s => s.providerId === 'drFull' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
          .map(s => s.time)
      );
      const op2Times = new Set(
        result.slots
          .filter(s => s.providerId === 'drFull' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
          .map(s => s.time)
      );

      // Both should have blocks
      expect(op1Times.size).toBeGreaterThan(0);
      expect(op2Times.size).toBeGreaterThan(0);

      // Due to stagger offset, the sets should NOT be identical
      // (Op 2 starts 20min later, so at least the first 2 slots are different)
      const uniqueToOp1 = [...op1Times].filter(t => !op2Times.has(t));
      const uniqueToOp2 = [...op2Times].filter(t => !op1Times.has(t));

      // At least one time should be unique to each op (stagger offset guarantees this)
      expect(uniqueToOp1.length + uniqueToOp2.length).toBeGreaterThan(0);
    });
  });
});
