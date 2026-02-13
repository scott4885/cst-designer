import { describe, it, expect } from 'vitest';
import {
  calculateTarget75,
  calculateHourlyRate,
  distributeBlockMinimums,
  calculateProductionSummary
} from '../calculator';
import type { BlockTypeInput, ProviderInput } from '../types';

describe('calculator', () => {
  describe('calculateTarget75', () => {
    it('should calculate 75% of $5000 as $3750', () => {
      expect(calculateTarget75(5000)).toBe(3750);
    });

    it('should calculate 75% of $2602 as $1951.5', () => {
      expect(calculateTarget75(2602)).toBe(1951.5);
    });

    it('should handle zero', () => {
      expect(calculateTarget75(0)).toBe(0);
    });

    it('should handle decimal inputs', () => {
      expect(calculateTarget75(1000.50)).toBe(750.375);
    });
  });

  describe('calculateHourlyRate', () => {
    it('should calculate hourly rate correctly', () => {
      expect(calculateHourlyRate(5000, 10)).toBe(500);
    });

    it('should handle fractional hours', () => {
      expect(calculateHourlyRate(2500, 7.5)).toBeCloseTo(333.33, 2);
    });

    it('should return 0 for zero hours', () => {
      expect(calculateHourlyRate(5000, 0)).toBe(0);
    });

    it('should return 0 for negative hours', () => {
      expect(calculateHourlyRate(5000, -1)).toBe(0);
    });
  });

  describe('distributeBlockMinimums', () => {
    const createBlockType = (id: string, label: string, role: 'DOCTOR' | 'HYGIENIST' | 'BOTH'): BlockTypeInput => ({
      id,
      label,
      appliesToRole: role,
      durationMin: 60
    });

    it('should distribute for doctor with HP, NP blocks', () => {
      const target75 = 3750; // 75% of $5000
      const blockTypes: BlockTypeInput[] = [
        createBlockType('hp1', 'HP > $1200', 'DOCTOR'),
        createBlockType('np1', 'NP CONS', 'DOCTOR'),
      ];

      const distribution = distributeBlockMinimums(target75, blockTypes, 'DOCTOR');

      // Should have 2 distributions (HP and NP)
      expect(distribution).toHaveLength(2);

      // HP blocks should be ~65% of target ($3750 * 0.65 = $2437.5 / 3 blocks = ~$812)
      const hpDist = distribution.find(d => d.blockTypeId === 'hp1');
      expect(hpDist).toBeDefined();
      expect(hpDist!.count).toBe(3);
      expect(hpDist!.minimumAmount).toBeGreaterThan(700);
      expect(hpDist!.minimumAmount).toBeLessThan(900);

      // NP blocks should be ~18% of target ($3750 * 0.18 = $675 / 1 block = $675)
      const npDist = distribution.find(d => d.blockTypeId === 'np1');
      expect(npDist).toBeDefined();
      expect(npDist!.count).toBe(1);
      expect(npDist!.minimumAmount).toBeGreaterThan(600);
      expect(npDist!.minimumAmount).toBeLessThan(750);
    });

    it('should distribute for hygienist with HP, NP, SRP blocks', () => {
      const target75 = 1951.5; // 75% of $2602
      const blockTypes: BlockTypeInput[] = [
        createBlockType('hp1', 'HP Recare', 'HYGIENIST'),
        createBlockType('np1', 'NP Hygiene', 'HYGIENIST'),
        createBlockType('srp1', 'SRP', 'HYGIENIST'),
      ];

      const distribution = distributeBlockMinimums(target75, blockTypes, 'HYGIENIST');

      // Should have 3 distributions (HP, NP, SRP)
      expect(distribution).toHaveLength(3);

      // HP blocks (65% for hygienist, 4 blocks)
      const hpDist = distribution.find(d => d.blockTypeId === 'hp1');
      expect(hpDist).toBeDefined();
      expect(hpDist!.count).toBe(4);

      // NP blocks (18%)
      const npDist = distribution.find(d => d.blockTypeId === 'np1');
      expect(npDist).toBeDefined();
      expect(npDist!.count).toBe(1);

      // SRP blocks (17%)
      const srpDist = distribution.find(d => d.blockTypeId === 'srp1');
      expect(srpDist).toBeDefined();
      expect(srpDist!.count).toBe(1);
    });

    it('should only include SRP for hygienists', () => {
      const target75 = 3750;
      const blockTypes: BlockTypeInput[] = [
        createBlockType('hp1', 'HP', 'BOTH'),
        createBlockType('srp1', 'SRP', 'HYGIENIST'),
      ];

      const doctorDist = distributeBlockMinimums(target75, blockTypes, 'DOCTOR');
      const hygienistDist = distributeBlockMinimums(target75, blockTypes, 'HYGIENIST');

      // Doctor should not have SRP
      expect(doctorDist.find(d => d.blockTypeId === 'srp1')).toBeUndefined();

      // Hygienist should have SRP
      expect(hygienistDist.find(d => d.blockTypeId === 'srp1')).toBeDefined();
    });

    it('should return empty array for no applicable blocks', () => {
      const target75 = 3750;
      const blockTypes: BlockTypeInput[] = [
        createBlockType('hp1', 'HP', 'HYGIENIST'), // Hygienist only
      ];

      const distribution = distributeBlockMinimums(target75, blockTypes, 'DOCTOR');
      expect(distribution).toEqual([]);
    });
  });

  describe('calculateProductionSummary', () => {
    const mockProvider: ProviderInput = {
      id: 'dr1',
      name: 'Dr. Fitzpatrick',
      role: 'DOCTOR',
      operatories: ['OP1'],
      workingStart: '07:00',
      workingEnd: '18:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      dailyGoal: 5000,
      color: '#ec8a1b'
    };

    it('should calculate MET status when target is met', () => {
      const scheduledBlocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'np1', blockLabel: 'NP>$150', amount: 150 },
      ];

      const summary = calculateProductionSummary(mockProvider, scheduledBlocks);

      expect(summary.providerId).toBe('dr1');
      expect(summary.providerName).toBe('Dr. Fitzpatrick');
      expect(summary.dailyGoal).toBe(5000);
      expect(summary.target75).toBe(3750);
      expect(summary.actualScheduled).toBe(3750); // 3x1200 + 150
      expect(summary.status).toBe('MET');
      expect(summary.blocks).toHaveLength(2); // HP and NP
    });

    it('should calculate UNDER status when below target', () => {
      const scheduledBlocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'np1', blockLabel: 'NP>$150', amount: 150 },
      ];

      const summary = calculateProductionSummary(mockProvider, scheduledBlocks);

      expect(summary.actualScheduled).toBe(1350);
      expect(summary.status).toBe('UNDER'); // Less than 95% of 3750
    });

    it('should calculate OVER status when exceeding target', () => {
      const scheduledBlocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'np1', blockLabel: 'NP>$150', amount: 150 },
      ];

      const summary = calculateProductionSummary(mockProvider, scheduledBlocks);

      expect(summary.actualScheduled).toBe(4950); // 4x1200 + 150
      expect(summary.status).toBe('OVER'); // More than 110% of 3750
    });

    it('should group blocks by label and count them', () => {
      const scheduledBlocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'hp1', blockLabel: 'HP>$1200', amount: 1200 },
        { blockTypeId: 'np1', blockLabel: 'NP>$150', amount: 150 },
        { blockTypeId: 'np1', blockLabel: 'NP>$150', amount: 150 },
      ];

      const summary = calculateProductionSummary(mockProvider, scheduledBlocks);

      expect(summary.blocks).toHaveLength(2);
      
      const hpBlock = summary.blocks.find(b => b.label === 'HP>$1200');
      expect(hpBlock).toBeDefined();
      expect(hpBlock!.count).toBe(2);
      expect(hpBlock!.amount).toBe(2400);

      const npBlock = summary.blocks.find(b => b.label === 'NP>$150');
      expect(npBlock).toBeDefined();
      expect(npBlock!.count).toBe(2);
      expect(npBlock!.amount).toBe(300);
    });
  });
});
