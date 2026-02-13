import { describe, it, expect } from 'vitest';
import {
  validateNoOverlaps,
  validateProductionMinimums,
  validateBlockPlacement,
  validateSchedule
} from '../validator';
import type { TimeSlotOutput, ProviderProductionSummary, GenerationResult, ScheduleRules } from '../types';

describe('validator', () => {
  describe('validateNoOverlaps', () => {
    it('should pass when no overlaps exist', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: false
        },
        {
          time: '07:10',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: false
        },
        {
          time: '08:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        }
      ];

      const result = validateNoOverlaps(slots);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect overlaps for same provider at same time', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: false
        },
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP2',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        }
      ];

      const result = validateNoOverlaps(slots);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Overlap detected');
    });

    it('should allow different providers at same time', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: false
        },
        {
          time: '07:00',
          providerId: 'hyg1',
          operatory: 'OP3',
          staffingCode: 'H',
          blockTypeId: 'recare1',
          blockLabel: 'Recare',
          isBreak: false
        }
      ];

      const result = validateNoOverlaps(slots);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle null blockTypeIds correctly', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: null,
          blockLabel: null,
          isBreak: false
        },
        {
          time: '07:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: null,
          blockLabel: null,
          isBreak: false
        }
      ];

      // Null blocks should not be considered overlaps
      const result = validateNoOverlaps(slots);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateProductionMinimums', () => {
    it('should pass when production meets target', () => {
      const summary: ProviderProductionSummary[] = [
        {
          providerId: 'dr1',
          providerName: 'Dr. Test',
          dailyGoal: 5000,
          target75: 3750,
          actualScheduled: 3750,
          status: 'MET',
          blocks: [
            { label: 'HP>$1200', amount: 3600, count: 3 },
            { label: 'NP>$150', amount: 150, count: 1 }
          ]
        }
      ];

      const result = validateProductionMinimums(summary);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn when production is under target', () => {
      const summary: ProviderProductionSummary[] = [
        {
          providerId: 'dr1',
          providerName: 'Dr. Test',
          dailyGoal: 5000,
          target75: 3750,
          actualScheduled: 2000,
          status: 'UNDER',
          blocks: [
            { label: 'HP>$1200', amount: 1200, count: 1 }
          ]
        }
      ];

      const result = validateProductionMinimums(summary);
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('under target');
      expect(result.warnings[0]).toContain('Dr. Test');
    });

    it('should warn when production is over target', () => {
      const summary: ProviderProductionSummary[] = [
        {
          providerId: 'dr1',
          providerName: 'Dr. Test',
          dailyGoal: 5000,
          target75: 3750,
          actualScheduled: 5000,
          status: 'OVER',
          blocks: [
            { label: 'HP>$1200', amount: 5000, count: 4 }
          ]
        }
      ];

      const result = validateProductionMinimums(summary);
      expect(result.valid).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('over target');
    });

    it('should handle multiple providers', () => {
      const summary: ProviderProductionSummary[] = [
        {
          providerId: 'dr1',
          providerName: 'Dr. Test',
          dailyGoal: 5000,
          target75: 3750,
          actualScheduled: 3750,
          status: 'MET',
          blocks: []
        },
        {
          providerId: 'hyg1',
          providerName: 'Hyg Test',
          dailyGoal: 2000,
          target75: 1500,
          actualScheduled: 1000,
          status: 'UNDER',
          blocks: []
        }
      ];

      const result = validateProductionMinimums(summary);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1); // Only hygienist is under
      expect(result.warnings[0]).toContain('Hyg Test');
    });
  });

  describe('validateBlockPlacement', () => {
    const defaultRules: ScheduleRules = {
      npModel: 'DOCTOR_ONLY',
      npBlocksPerDay: 1,
      srpBlocksPerDay: 1,
      hpPlacement: 'MORNING',
      doubleBooking: false,
      matrixing: true,
      emergencyHandling: 'ACCESS_BLOCKS'
    };

    it('should pass when NP blocks are present', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '09:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        },
        {
          time: '09:10',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        }
      ];

      const result = validateBlockPlacement(slots, defaultRules);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error when NP blocks are missing and required', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '09:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: false
        }
      ];

      const result = validateBlockPlacement(slots, defaultRules);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('No NP blocks found');
    });

    it('should error when blocks are placed during lunch', () => {
      const slots: TimeSlotOutput[] = [
        // Include an NP block first so we don't trigger the "missing NP" error
        {
          time: '09:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        },
        // Then have a block during lunch (which should error)
        {
          time: '13:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'hp1',
          blockLabel: 'HP>$1200',
          isBreak: true
        }
      ];

      const result = validateBlockPlacement(slots, defaultRules);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('lunch break');
    });

    it('should allow lunch breaks without blocks', () => {
      const slots: TimeSlotOutput[] = [
        {
          time: '13:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: null,
          blockTypeId: null,
          blockLabel: 'LUNCH',
          isBreak: true
        },
        {
          time: '09:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        }
      ];

      const result = validateBlockPlacement(slots, defaultRules);
      expect(result.valid).toBe(true);
    });

    it('should count unique blocks correctly', () => {
      const slots: TimeSlotOutput[] = [
        // NP block spanning multiple slots (should count as 1)
        {
          time: '09:00',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        },
        {
          time: '09:10',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        },
        {
          time: '09:20',
          providerId: 'dr1',
          operatory: 'OP1',
          staffingCode: 'D',
          blockTypeId: 'np1',
          blockLabel: 'NP CONS',
          isBreak: false
        }
      ];

      const result = validateBlockPlacement(slots, defaultRules);
      expect(result.valid).toBe(true); // Should recognize this as 1 NP block
    });
  });

  describe('validateSchedule', () => {
    const defaultRules: ScheduleRules = {
      npModel: 'DOCTOR_ONLY',
      npBlocksPerDay: 1,
      srpBlocksPerDay: 1,
      hpPlacement: 'MORNING',
      doubleBooking: false,
      matrixing: true,
      emergencyHandling: 'ACCESS_BLOCKS'
    };

    it('should pass with valid schedule', () => {
      const result: GenerationResult = {
        dayOfWeek: 'Monday',
        slots: [
          {
            time: '09:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: 'D',
            blockTypeId: 'np1',
            blockLabel: 'NP CONS',
            isBreak: false
          },
          {
            time: '10:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: 'D',
            blockTypeId: 'hp1',
            blockLabel: 'HP>$1200',
            isBreak: false
          },
          {
            time: '13:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: null,
            blockTypeId: null,
            blockLabel: 'LUNCH',
            isBreak: true
          }
        ],
        productionSummary: [
          {
            providerId: 'dr1',
            providerName: 'Dr. Test',
            dailyGoal: 5000,
            target75: 3750,
            actualScheduled: 3750,
            status: 'MET',
            blocks: [
              { label: 'HP>$1200', amount: 3600, count: 3 },
              { label: 'NP>$150', amount: 150, count: 1 }
            ]
          }
        ],
        warnings: []
      };

      const validation = validateSchedule(result, defaultRules);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should aggregate errors from all validations', () => {
      const result: GenerationResult = {
        dayOfWeek: 'Monday',
        slots: [
          // Overlapping blocks
          {
            time: '09:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: 'D',
            blockTypeId: 'hp1',
            blockLabel: 'HP>$1200',
            isBreak: false
          },
          {
            time: '09:00',
            providerId: 'dr1',
            operatory: 'OP2',
            staffingCode: 'D',
            blockTypeId: 'np1',
            blockLabel: 'NP CONS',
            isBreak: false
          },
          // Block during lunch
          {
            time: '13:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: 'D',
            blockTypeId: 'hp1',
            blockLabel: 'HP>$1200',
            isBreak: true
          }
        ],
        productionSummary: [
          {
            providerId: 'dr1',
            providerName: 'Dr. Test',
            dailyGoal: 5000,
            target75: 3750,
            actualScheduled: 2000,
            status: 'UNDER',
            blocks: []
          }
        ],
        warnings: ['Test warning']
      };

      const validation = validateSchedule(result, defaultRules);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });

    it('should include generation warnings in result', () => {
      const result: GenerationResult = {
        dayOfWeek: 'Monday',
        slots: [
          {
            time: '09:00',
            providerId: 'dr1',
            operatory: 'OP1',
            staffingCode: 'D',
            blockTypeId: 'np1',
            blockLabel: 'NP CONS',
            isBreak: false
          }
        ],
        productionSummary: [
          {
            providerId: 'dr1',
            providerName: 'Dr. Test',
            dailyGoal: 5000,
            target75: 3750,
            actualScheduled: 3750,
            status: 'MET',
            blocks: []
          }
        ],
        warnings: ['Could not place all HP blocks', 'Provider workload imbalanced']
      };

      const validation = validateSchedule(result, defaultRules);
      expect(validation.warnings).toContain('Could not place all HP blocks');
      expect(validation.warnings).toContain('Provider workload imbalanced');
    });
  });
});
