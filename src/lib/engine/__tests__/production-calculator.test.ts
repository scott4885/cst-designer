import { describe, it, expect } from 'vitest';
import {
  calculateTarget75,
  calculateHourlyRate,
  distributeBlockMinimums,
  calculateProductionSummary,
} from '../calculator';
import type { BlockTypeInput, ProviderInput } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides?: Partial<ProviderInput>): ProviderInput {
  return {
    id: 'dr1',
    name: 'Dr. Test',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 5000,
    color: '#000',
    ...overrides,
  };
}

function makeBlock(id: string, label: string, role: 'DOCTOR' | 'HYGIENIST' | 'BOTH' = 'DOCTOR'): BlockTypeInput {
  return { id, label, appliesToRole: role, durationMin: 60 };
}

// ---------------------------------------------------------------------------
// 75% Rule Tests
// ---------------------------------------------------------------------------

describe('Production Calculator — 75% Rule', () => {
  describe('calculateTarget75', () => {
    it('75% of $5000 = $3750', () => {
      expect(calculateTarget75(5000)).toBe(3750);
    });

    it('75% of $3000 = $2250', () => {
      expect(calculateTarget75(3000)).toBe(2250);
    });

    it('75% of $10000 = $7500', () => {
      expect(calculateTarget75(10000)).toBe(7500);
    });

    it('handles zero goal', () => {
      expect(calculateTarget75(0)).toBe(0);
    });
  });

  describe('scheduled production must be >= 75% of daily goal', () => {
    it('MET status when production matches 75% target', () => {
      const provider = makeProvider({ dailyGoal: 5000 });
      const blocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1250 },
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1250 },
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1250 },
      ];
      const summary = calculateProductionSummary(provider, blocks);

      expect(summary.target75).toBe(3750);
      expect(summary.actualScheduled).toBe(3750);
      expect(summary.status).toBe('MET');
    });

    it('UNDER status when production is less than 95% of target', () => {
      const provider = makeProvider({ dailyGoal: 5000 });
      const blocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1000 },
      ];
      const summary = calculateProductionSummary(provider, blocks);

      expect(summary.actualScheduled).toBe(1000);
      expect(summary.status).toBe('UNDER');
    });

    it('OVER status when production exceeds 110% of target', () => {
      const provider = makeProvider({ dailyGoal: 5000 });
      // target75 = 3750, 110% = 4125, so anything > 4125 is OVER
      const blocks = [
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1500 },
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1500 },
        { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1500 },
      ];
      const summary = calculateProductionSummary(provider, blocks);

      expect(summary.actualScheduled).toBe(4500);
      expect(summary.status).toBe('OVER');
    });
  });
});

// ---------------------------------------------------------------------------
// Per-operatory target tests
// ---------------------------------------------------------------------------

describe('Production Calculator — Per-operatory targets', () => {
  it('per-operatory target = shared target / num operatories', () => {
    const dailyGoal = 5000;
    const numOps = 2;
    const target75 = calculateTarget75(dailyGoal);
    const perOpTarget = target75 / numOps;

    expect(perOpTarget).toBe(1875);
  });

  it('3-operatory split', () => {
    const dailyGoal = 9000;
    const numOps = 3;
    const target75 = calculateTarget75(dailyGoal);
    const perOpTarget = target75 / numOps;

    expect(perOpTarget).toBe(2250);
  });
});

// ---------------------------------------------------------------------------
// Goal cascade: annual -> daily -> hourly
// ---------------------------------------------------------------------------

describe('Production Calculator — Goal cascade', () => {
  describe('annual to daily to hourly', () => {
    it('annual $1.3M -> daily goal (260 working days)', () => {
      const annualGoal = 1300000;
      const workingDaysPerYear = 260; // ~52 weeks * 5 days
      const dailyGoal = annualGoal / workingDaysPerYear;

      expect(dailyGoal).toBe(5000);
    });

    it('daily to hourly rate for 8-hour day', () => {
      const hourlyRate = calculateHourlyRate(5000, 8);
      expect(hourlyRate).toBe(625);
    });

    it('daily to hourly rate for 10-hour day', () => {
      const hourlyRate = calculateHourlyRate(5000, 10);
      expect(hourlyRate).toBe(500);
    });
  });

  describe('Friday / short day proportional reduction', () => {
    it('5-hour Friday = 62.5% of 8-hour day production target', () => {
      const fullDayHours = 8;
      const fridayHours = 5;
      const ratio = fridayHours / fullDayHours;

      expect(ratio).toBe(0.625);

      // If daily goal is $5000 for 8 hours, Friday target = $3125
      const fridayGoal = 5000 * ratio;
      expect(fridayGoal).toBe(3125);

      // 75% target for Friday
      const fridayTarget75 = calculateTarget75(fridayGoal);
      expect(fridayTarget75).toBe(2343.75);
    });

    it('6-hour Friday = 75% of 8-hour day production target', () => {
      const ratio = 6 / 8;
      expect(ratio).toBe(0.75);

      const fridayGoal = 5000 * ratio;
      expect(fridayGoal).toBe(3750);
    });

    it('hourly rate handles zero hours gracefully', () => {
      expect(calculateHourlyRate(5000, 0)).toBe(0);
    });

    it('hourly rate handles negative hours gracefully', () => {
      expect(calculateHourlyRate(5000, -2)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Block distribution (Rock-Sand-Water percentages)
// ---------------------------------------------------------------------------

describe('Production Calculator — Block distribution', () => {
  it('doctor HP blocks get ~65% of target', () => {
    const target75 = calculateTarget75(5000); // 3750
    const blocks: BlockTypeInput[] = [
      makeBlock('hp1', 'HP > $1200'),
      makeBlock('np1', 'NP CONS'),
    ];

    const dist = distributeBlockMinimums(target75, blocks, 'DOCTOR');
    const hpDist = dist.find(d => d.blockTypeId === 'hp1');

    expect(hpDist).toBeDefined();
    // 65% of 3750 = 2437.5, spread across 3 blocks = ~812 each
    expect(hpDist!.minimumAmount).toBeGreaterThan(700);
    expect(hpDist!.minimumAmount).toBeLessThan(900);
    expect(hpDist!.count).toBe(3);
  });

  it('hygienist HP blocks get ~65% with 4 blocks', () => {
    const target75 = calculateTarget75(2600); // 1950
    const blocks: BlockTypeInput[] = [
      makeBlock('hp_hyg', 'HP Recare', 'HYGIENIST'),
      makeBlock('np_hyg', 'NP Hygiene', 'HYGIENIST'),
      makeBlock('srp1', 'SRP', 'HYGIENIST'),
    ];

    const dist = distributeBlockMinimums(target75, blocks, 'HYGIENIST');
    const hpDist = dist.find(d => d.blockTypeId === 'hp_hyg');

    expect(hpDist).toBeDefined();
    expect(hpDist!.count).toBe(4); // hygienists get 4 HP blocks
  });

  it('SRP only distributed to hygienists, not doctors', () => {
    const target75 = 3750;
    const blocks: BlockTypeInput[] = [
      makeBlock('hp1', 'HP', 'BOTH'),
      makeBlock('srp1', 'SRP', 'HYGIENIST'),
    ];

    const docDist = distributeBlockMinimums(target75, blocks, 'DOCTOR');
    const hygDist = distributeBlockMinimums(target75, blocks, 'HYGIENIST');

    expect(docDist.find(d => d.blockTypeId === 'srp1')).toBeUndefined();
    expect(hygDist.find(d => d.blockTypeId === 'srp1')).toBeDefined();
  });

  it('returns empty array when no applicable blocks exist', () => {
    const dist = distributeBlockMinimums(3750, [], 'DOCTOR');
    expect(dist).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// High production metric
// ---------------------------------------------------------------------------

describe('Production Calculator — High production tracking', () => {
  it('doctor: blocks >= $1000 count as high production', () => {
    const provider = makeProvider({ role: 'DOCTOR', dailyGoal: 5000 });
    const blocks = [
      { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1200, minimumAmount: 1200 },
      { blockTypeId: 'mp1', blockLabel: 'MP', amount: 375, minimumAmount: 375 },
      { blockTypeId: 'hp1', blockLabel: 'HP', amount: 1200, minimumAmount: 1200 },
    ];

    const summary = calculateProductionSummary(provider, blocks);
    expect(summary.highProductionScheduled).toBe(2400); // only the 1200+1200
  });

  it('hygienist: blocks >= $300 count as high production', () => {
    const provider = makeProvider({ role: 'HYGIENIST', dailyGoal: 2600 });
    const blocks = [
      { blockTypeId: 'hp_hyg', blockLabel: 'HP Recare', amount: 350, minimumAmount: 350 },
      { blockTypeId: 'np_hyg', blockLabel: 'NP Hygiene', amount: 150, minimumAmount: 150 },
      { blockTypeId: 'srp1', blockLabel: 'SRP', amount: 300, minimumAmount: 300 },
    ];

    const summary = calculateProductionSummary(provider, blocks);
    expect(summary.highProductionScheduled).toBe(650); // 350 + 300
  });
});
