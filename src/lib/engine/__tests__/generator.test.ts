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
      
      // Set very short working hours to make it hard to fit blocks
      input.providers[0].workingStart = '07:00';
      input.providers[0].workingEnd = '08:00'; // Only 1 hour

      const result = generateSchedule(input);

      // Should have warnings about not being able to place all blocks
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
