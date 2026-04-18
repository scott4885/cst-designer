import { describe, it, expect } from 'vitest';
import {
  calculateProductionMix,
  compareToIndustryBenchmark,
  ProviderMix,
  DOCTOR_BENCHMARKS,
  HYGIENIST_BENCHMARKS,
} from '../production-mix';
import type { GenerationResult, ProviderInput, BlockTypeInput } from '../types';

// ─── Shared fixtures ────────────────────────────────────────────────────────

const doctorProvider: ProviderInput = {
  id: 'doc-1',
  name: 'Dr. Smith',
  role: 'DOCTOR',
  operatories: ['OP1'],
  workingStart: '08:00',
  workingEnd: '17:00',
  dailyGoal: 5000,
  color: '#aabbcc',
};

const hygienistProvider: ProviderInput = {
  id: 'hyg-1',
  name: 'Jane RDH',
  role: 'HYGIENIST',
  operatories: ['HYG1'],
  workingStart: '08:00',
  workingEnd: '17:00',
  dailyGoal: 2500,
  color: '#ccbbaa',
};

const blockTypes: BlockTypeInput[] = [
  { id: 'hp-1',     label: 'HP',     minimumAmount: 1200, appliesToRole: 'DOCTOR',    durationMin: 60 },
  { id: 'np-1',     label: 'NP CONS',minimumAmount: 300,  appliesToRole: 'DOCTOR',    durationMin: 40 },
  { id: 'mp-1',     label: 'MP',     minimumAmount: 375,  appliesToRole: 'DOCTOR',    durationMin: 40 },
  { id: 'er-1',     label: 'ER',     minimumAmount: 187,  appliesToRole: 'DOCTOR',    durationMin: 30 },
  { id: 'recare-1', label: 'Recare', minimumAmount: 150,  appliesToRole: 'HYGIENIST', durationMin: 50 },
  { id: 'srp-1',    label: 'SRP',    minimumAmount: 300,  appliesToRole: 'HYGIENIST', durationMin: 80 },
  { id: 'pm-1',     label: 'PM',     minimumAmount: 190,  appliesToRole: 'HYGIENIST', durationMin: 60 },
  { id: 'np-hyg-1', label: 'NP HYG', minimumAmount: 320,  appliesToRole: 'HYGIENIST', durationMin: 60 },
];

/** Build a minimal GenerationResult from block amount arrays */
function makeSchedule(
  providerBlocks: { providerId: string; providerName: string; blocks: { label: string; amount: number; count: number }[] }[]
): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots: [],
    warnings: [],
    productionSummary: providerBlocks.map(p => ({
      providerId: p.providerId,
      providerName: p.providerName,
      dailyGoal: 5000,
      target75: 3750,
      actualScheduled: p.blocks.reduce((s, b) => s + b.amount, 0),
      status: 'MET' as const,
      blocks: p.blocks,
    })),
  };
}

// ─── calculateProductionMix ─────────────────────────────────────────────────

describe('calculateProductionMix', () => {
  it('calculates correct percentages for a single doctor with known blocks', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [
          { label: 'HP>$1200', amount: 1200, count: 1 },
          { label: 'HP>$1200', amount: 1200, count: 1 },
          { label: 'NP CONS>$300', amount: 300, count: 1 },
          { label: 'MP>$375', amount: 375, count: 1 },
          { label: 'ER>$187', amount: 187, count: 1 },
        ],
      },
    ]);

    const mix = calculateProductionMix(schedule, blockTypes, [doctorProvider]);

    expect(mix.providers).toHaveLength(1);
    const pm = mix.providers[0];
    expect(pm.providerId).toBe('doc-1');

    const total = 1200 + 1200 + 300 + 375 + 187; // 3262
    const hpEntry = pm.entries.find(e => e.category === 'HP');
    const npEntry = pm.entries.find(e => e.category === 'NP');
    const mpEntry = pm.entries.find(e => e.category === 'MP');
    const erEntry = pm.entries.find(e => e.category === 'ER');

    expect(hpEntry).toBeDefined();
    expect(mpEntry).toBeDefined();
    expect(npEntry).toBeDefined();
    expect(erEntry).toBeDefined();

    // HP = 2400 / 3262 ≈ 73.6%
    expect(hpEntry!.amount).toBe(2400);
    expect(hpEntry!.percentage).toBeCloseTo((2400 / total) * 100, 1);

    // NP = 300 / 3262 ≈ 9.2%
    expect(npEntry!.amount).toBe(300);
    expect(npEntry!.percentage).toBeCloseTo((300 / total) * 100, 1);

    // MP = 375 / 3262 ≈ 11.5%
    expect(mpEntry!.amount).toBe(375);

    // ER = 187 / 3262 ≈ 5.7%
    expect(erEntry!.amount).toBe(187);
  });

  it('calculates combined view across multiple providers', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [{ label: 'HP>$1200', amount: 1200, count: 1 }],
      },
      {
        providerId: 'hyg-1',
        providerName: 'Jane RDH',
        blocks: [{ label: 'Recare>$150', amount: 150, count: 1 }],
      },
    ]);

    const mix = calculateProductionMix(schedule, blockTypes, [doctorProvider, hygienistProvider]);

    expect(mix.combined.totalAmount).toBe(1350);
    expect(mix.combined.entries).toHaveLength(2); // HP + RECARE
  });

  it('strips ">$" suffix when matching block types', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [
          { label: 'HP>$1500', amount: 1500, count: 1 }, // amount differs from blockType def
        ],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes, [doctorProvider]);
    const hpEntry = mix.providers[0].entries.find(e => e.category === 'HP');
    expect(hpEntry).toBeDefined();
    expect(hpEntry!.amount).toBe(1500);
  });

  it('assigns correct role from providers array', () => {
    const schedule = makeSchedule([
      {
        providerId: 'hyg-1',
        providerName: 'Jane RDH',
        blocks: [{ label: 'Recare', amount: 150, count: 1 }],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes, [hygienistProvider]);
    expect(mix.providers[0].role).toBe('HYGIENIST');
  });

  it('defaults role to OTHER when providers array is not supplied', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [{ label: 'HP', amount: 1200, count: 1 }],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes);
    expect(mix.providers[0].role).toBe('OTHER');
  });

  it('handles empty productionSummary (no blocks)', () => {
    const schedule: GenerationResult = {
      dayOfWeek: 'MONDAY',
      slots: [],
      warnings: [],
      productionSummary: [],
    };
    const mix = calculateProductionMix(schedule, blockTypes);
    expect(mix.providers).toHaveLength(0);
    expect(mix.combined.totalAmount).toBe(0);
    expect(mix.combined.entries).toHaveLength(0);
  });

  it('handles provider with zero-amount blocks', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [{ label: 'NON-PROD', amount: 0, count: 1 }],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes, [doctorProvider]);
    const nonProdEntry = mix.providers[0].entries.find(e => e.category === 'NON_PROD');
    // 0 / 0 = NaN guard — should return 0%
    expect(nonProdEntry?.percentage ?? 0).toBe(0);
  });

  it('categorizes hygienist Recare as RECARE category', () => {
    const schedule = makeSchedule([
      {
        providerId: 'hyg-1',
        providerName: 'Jane RDH',
        blocks: [
          { label: 'Recare>$150', amount: 150, count: 3 },
          { label: 'SRP>$300', amount: 300, count: 1 },
          { label: 'PM>$190', amount: 190, count: 1 },
        ],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes, [hygienistProvider]);
    const pm = mix.providers[0];

    expect(pm.entries.find(e => e.category === 'RECARE')).toBeDefined();
    expect(pm.entries.find(e => e.category === 'SRP')).toBeDefined();
    expect(pm.entries.find(e => e.category === 'PM')).toBeDefined();
  });

  it('percentages sum to ~100 for a single provider', () => {
    const schedule = makeSchedule([
      {
        providerId: 'doc-1',
        providerName: 'Dr. Smith',
        blocks: [
          { label: 'HP', amount: 1200, count: 2 },
          { label: 'NP CONS', amount: 300, count: 1 },
          { label: 'MP', amount: 375, count: 2 },
        ],
      },
    ]);
    const mix = calculateProductionMix(schedule, blockTypes, [doctorProvider]);
    const total = mix.providers[0].entries.reduce((s, e) => s + e.percentage, 0);
    expect(total).toBeCloseTo(100, 3);
  });
});

// ─── compareToIndustryBenchmark ─────────────────────────────────────────────

describe('compareToIndustryBenchmark', () => {
  it('flags DOCTOR HP as OVER when above 70%', () => {
    // HP at 80% — above the 55-70% ideal
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 4000,
      entries: [
        { category: 'HP',  displayLabel: 'High Production', amount: 3200, count: 2, percentage: 80 },
        { category: 'NP',  displayLabel: 'New Patient',     amount:  400, count: 1, percentage: 10 },
        { category: 'MP',  displayLabel: 'Medium Prod',     amount:  400, count: 1, percentage: 10 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');

    const hpBenchmark = result.categories.find(c => c.category === 'HP');
    expect(hpBenchmark).toBeDefined();
    expect(hpBenchmark!.status).toBe('OVER');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('flags DOCTOR HP as UNDER when below 55%', () => {
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 4000,
      entries: [
        { category: 'HP',  displayLabel: 'High Production', amount: 1600, count: 2, percentage: 40 },
        { category: 'NP',  displayLabel: 'New Patient',     amount: 1200, count: 1, percentage: 30 },
        { category: 'MP',  displayLabel: 'Medium Prod',     amount: 1200, count: 1, percentage: 30 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');

    const hpBenchmark = result.categories.find(c => c.category === 'HP');
    expect(hpBenchmark!.status).toBe('UNDER');
    expect(result.warnings.some(w => w.toLowerCase().includes('high production'))).toBe(true);
  });

  it('returns OK for all in-range doctor categories', () => {
    // HP=62% (55-70 ✓), NP=17% (15-20 ✓), MP=12% (10-15 ✓), ER=9% (5-10 ✓)
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 10000,
      entries: [
        { category: 'HP', displayLabel: 'HP', amount: 6200, count: 3, percentage: 62 },
        { category: 'NP', displayLabel: 'NP', amount: 1700, count: 1, percentage: 17 },
        { category: 'MP', displayLabel: 'MP', amount: 1200, count: 2, percentage: 12 },
        { category: 'ER', displayLabel: 'ER', amount:  900, count: 1, percentage:  9 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');

    expect(result.warnings).toHaveLength(0);
    result.categories.forEach(c => {
      expect(c.status).toBe('OK');
    });
  });

  it('flags HYGIENIST SRP as UNDER when below 20%', () => {
    const mix: ProviderMix = {
      providerId: 'hyg-1',
      providerName: 'Jane RDH',
      role: 'HYGIENIST',
      totalAmount: 3000,
      entries: [
        { category: 'RECARE', displayLabel: 'Recare', amount: 2400, count: 8, percentage: 80 },
        { category: 'SRP',    displayLabel: 'SRP',    amount:  300, count: 1, percentage: 10 },
        { category: 'PM',     displayLabel: 'PM',     amount:  300, count: 1, percentage: 10 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'HYGIENIST');

    const srpBenchmark = result.categories.find(c => c.category === 'SRP');
    expect(srpBenchmark!.status).toBe('UNDER');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('flags HYGIENIST Recare as OVER when above 50%', () => {
    const mix: ProviderMix = {
      providerId: 'hyg-1',
      providerName: 'Jane RDH',
      role: 'HYGIENIST',
      totalAmount: 3000,
      entries: [
        { category: 'RECARE', displayLabel: 'Recare', amount: 2100, count: 7, percentage: 70 },
        { category: 'SRP',    displayLabel: 'SRP',    amount:  900, count: 3, percentage: 30 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'HYGIENIST');

    const recareBenchmark = result.categories.find(c => c.category === 'RECARE');
    expect(recareBenchmark!.status).toBe('OVER');
  });

  it('returns N/A (0 actual) for categories not present in the mix', () => {
    // Doctor with no ER blocks
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 3000,
      entries: [
        { category: 'HP', displayLabel: 'HP', amount: 2000, count: 2, percentage: 66.7 },
        { category: 'MP', displayLabel: 'MP', amount: 1000, count: 2, percentage: 33.3 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');
    const erBenchmark = result.categories.find(c => c.category === 'ER');
    // ER not in mix → actual = 0, below 5% → UNDER
    expect(erBenchmark).toBeDefined();
    expect(erBenchmark!.actual).toBe(0);
    expect(erBenchmark!.status).toBe('UNDER');
  });

  it('includes idealMin and idealMax from benchmark definitions', () => {
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 1000,
      entries: [
        { category: 'HP', displayLabel: 'HP', amount: 620, count: 1, percentage: 62 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');
    const hpBenchmark = result.categories.find(c => c.category === 'HP');
    expect(hpBenchmark!.idealMin).toBe(DOCTOR_BENCHMARKS.HP.min);
    expect(hpBenchmark!.idealMax).toBe(DOCTOR_BENCHMARKS.HP.max);
  });

  it('hygienist benchmark uses HYGIENIST_BENCHMARKS', () => {
    const mix: ProviderMix = {
      providerId: 'hyg-1',
      providerName: 'Jane RDH',
      role: 'HYGIENIST',
      totalAmount: 1000,
      entries: [
        { category: 'RECARE', displayLabel: 'Recare', amount: 450, count: 3, percentage: 45 },
        { category: 'SRP',    displayLabel: 'SRP',    amount: 250, count: 1, percentage: 25 },
        { category: 'PM',     displayLabel: 'PM',     amount: 175, count: 1, percentage: 17.5 },
        { category: 'NP',     displayLabel: 'NP',     amount: 125, count: 1, percentage: 12.5 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'HYGIENIST');
    expect(result.role).toBe('HYGIENIST');
    const recareBenchmark = result.categories.find(c => c.category === 'RECARE');
    expect(recareBenchmark!.idealMin).toBe(HYGIENIST_BENCHMARKS.RECARE.min);
    expect(recareBenchmark!.idealMax).toBe(HYGIENIST_BENCHMARKS.RECARE.max);
    // All in range → no warnings
    expect(result.warnings).toHaveLength(0);
  });

  it('warning message includes the actual percentage value', () => {
    const mix: ProviderMix = {
      providerId: 'doc-1',
      providerName: 'Dr. Smith',
      role: 'DOCTOR',
      totalAmount: 1000,
      entries: [
        { category: 'HP', displayLabel: 'High Production', amount: 800, count: 2, percentage: 80 },
      ],
    };
    const result = compareToIndustryBenchmark(mix, 'DOCTOR');
    expect(result.warnings[0]).toContain('80.0%');
  });
});
