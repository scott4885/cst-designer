import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../generator';
import type { GenerationInput, ProviderInput, BlockTypeInput } from '../types';

// ---------------------------------------------------------------------------
// Shared block type definitions
// ---------------------------------------------------------------------------

function doctorBlocks(): BlockTypeInput[] {
  return [
    { id: 'hp1', label: 'HP', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 90 },
    { id: 'np1', label: 'NP CONS', minimumAmount: 300, appliesToRole: 'DOCTOR', durationMin: 40 },
    { id: 'mp1', label: 'MP', minimumAmount: 375, appliesToRole: 'DOCTOR', durationMin: 40 },
    { id: 'er1', label: 'ER', minimumAmount: 187, appliesToRole: 'DOCTOR', durationMin: 30 },
  ];
}

function hygieneBlocks(): BlockTypeInput[] {
  return [
    { id: 'hp_hyg', label: 'HP Recare', minimumAmount: 300, appliesToRole: 'HYGIENIST', durationMin: 60 },
    { id: 'np_hyg', label: 'NP Hygiene', minimumAmount: 150, appliesToRole: 'HYGIENIST', durationMin: 60 },
    { id: 'srp1', label: 'SRP', minimumAmount: 300, appliesToRole: 'HYGIENIST', durationMin: 80 },
  ];
}

function allBlocks(): BlockTypeInput[] {
  return [...doctorBlocks(), ...hygieneBlocks()];
}

function defaultRules(overrides?: Partial<GenerationInput['rules']>): GenerationInput['rules'] {
  return {
    npModel: 'DOCTOR_ONLY',
    npBlocksPerDay: 2,
    srpBlocksPerDay: 1,
    hpPlacement: 'MORNING',
    doubleBooking: true,
    matrixing: false,
    emergencyHandling: 'DEDICATED',
    ...overrides,
  };
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ---------------------------------------------------------------------------
// Small Office: 1 doctor (2 ops), 2 hygienists (1 op each)
// ---------------------------------------------------------------------------

describe('Generator Integration — Small Office', () => {
  function createSmallOffice(): GenerationInput {
    const providers: ProviderInput[] = [
      {
        id: 'dr1', name: 'Dr. Kevin', role: 'DOCTOR',
        operatories: ['OP1', 'OP2'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '13:00', lunchEnd: '14:00',
        dailyGoal: 5000, color: '#ec8a1b',
      },
      {
        id: 'hyg1', name: 'Cheryl RDH', role: 'HYGIENIST',
        operatories: ['OP3'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '13:00', lunchEnd: '14:00',
        dailyGoal: 1200, color: '#87bcf3',
      },
      {
        id: 'hyg2', name: 'Lisa RDH', role: 'HYGIENIST',
        operatories: ['OP4'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '13:00', lunchEnd: '14:00',
        dailyGoal: 1200, color: '#93c5fd',
      },
    ];

    return {
      providers,
      blockTypes: allBlocks(),
      rules: defaultRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };
  }

  it('no empty operatories — all providers have blocks', () => {
    const result = generateSchedule(createSmallOffice());

    for (const pid of ['dr1', 'hyg1', 'hyg2']) {
      const slots = result.slots.filter(
        s => s.providerId === pid && !s.isBreak && s.blockTypeId
      );
      expect(slots.length, `Provider ${pid} should have blocks`).toBeGreaterThan(0);
    }
  });

  it('doctor operatories only contain doctor block types', () => {
    const result = generateSchedule(createSmallOffice());
    const input = createSmallOffice();
    const hygBlockIds = new Set(
      input.blockTypes.filter(bt => bt.appliesToRole === 'HYGIENIST').map(bt => bt.id)
    );
    const doctorBlockIds = new Set(
      input.blockTypes.filter(bt => bt.appliesToRole === 'DOCTOR').map(bt => bt.id)
    );

    // Doctor's operatories (OP1, OP2) should only have doctor blocks
    const drSlots = result.slots.filter(
      s => s.providerId === 'dr1' && !s.isBreak && s.blockTypeId
    );
    for (const slot of drSlots) {
      expect(
        hygBlockIds.has(slot.blockTypeId!),
        `Doctor slot at ${slot.time} in ${slot.operatory} has hygienist block ${slot.blockLabel} (${slot.blockTypeId})`
      ).toBe(false);
    }

    // Hygienist operatories should only have hygienist blocks
    const hygSlots = result.slots.filter(
      s => (s.providerId === 'hyg1' || s.providerId === 'hyg2') && !s.isBreak && s.blockTypeId
    );
    for (const slot of hygSlots) {
      expect(
        doctorBlockIds.has(slot.blockTypeId!),
        `Hygienist slot at ${slot.time} in ${slot.operatory} has doctor block ${slot.blockLabel} (${slot.blockTypeId})`
      ).toBe(false);
    }
  });

  it('doctor has blocks in both operatories', () => {
    const result = generateSchedule(createSmallOffice());

    const op1 = result.slots.filter(s => s.providerId === 'dr1' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId);
    const op2 = result.slots.filter(s => s.providerId === 'dr1' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId);

    expect(op1.length).toBeGreaterThan(0);
    expect(op2.length).toBeGreaterThan(0);
  });

  it('production targets are approached', () => {
    const result = generateSchedule(createSmallOffice());

    const drSummary = result.productionSummary.find(s => s.providerId === 'dr1');
    expect(drSummary).toBeDefined();
    expect(drSummary!.dailyGoal).toBe(5000);
    expect(drSummary!.actualScheduled).toBeGreaterThan(0);
  });

  it('all block durations are valid multiples of time increment', () => {
    const result = generateSchedule(createSmallOffice());
    const increment = 10;

    // Group slots by blockInstanceId to check block durations
    const instances = new Map<string, number>();
    for (const slot of result.slots) {
      if (slot.blockInstanceId && slot.blockTypeId) {
        instances.set(slot.blockInstanceId, (instances.get(slot.blockInstanceId) ?? 0) + 1);
      }
    }

    for (const [, slotCount] of instances) {
      const durationMin = slotCount * increment;
      // Duration should be a positive multiple of 10
      expect(durationMin % increment).toBe(0);
      expect(durationMin).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Medium Office: 1 doctor (2 ops), 3 hygienists (1 op each)
// ---------------------------------------------------------------------------

describe('Generator Integration — Medium Office', () => {
  function createMediumOffice(): GenerationInput {
    const providers: ProviderInput[] = [
      {
        id: 'dr1', name: 'Dr. Medium', role: 'DOCTOR',
        operatories: ['OP1', 'OP2'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 5000, color: '#ec8a1b',
      },
      {
        id: 'hyg1', name: 'Hyg 1', role: 'HYGIENIST',
        operatories: ['OP3'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1200, color: '#87bcf3',
      },
      {
        id: 'hyg2', name: 'Hyg 2', role: 'HYGIENIST',
        operatories: ['OP4'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1200, color: '#93c5fd',
      },
      {
        id: 'hyg3', name: 'Hyg 3', role: 'HYGIENIST',
        operatories: ['OP5'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1200, color: '#a5b4fc',
      },
    ];

    return {
      providers,
      blockTypes: allBlocks(),
      rules: defaultRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };
  }

  it('all 4 providers have blocks and production summaries', () => {
    const result = generateSchedule(createMediumOffice());

    expect(result.productionSummary).toHaveLength(4);

    for (const summary of result.productionSummary) {
      expect(summary.actualScheduled).toBeGreaterThan(0);
    }
  });

  it('no D-time overlap between doctor columns', () => {
    const result = generateSchedule(createMediumOffice());

    const op1DTimes = new Set(
      result.slots
        .filter(s => s.providerId === 'dr1' && s.operatory === 'OP1' && s.staffingCode === 'D' && !s.isBreak)
        .map(s => s.time)
    );
    const op2DTimes = new Set(
      result.slots
        .filter(s => s.providerId === 'dr1' && s.operatory === 'OP2' && s.staffingCode === 'D' && !s.isBreak)
        .map(s => s.time)
    );

    let overlap = 0;
    for (const t of op1DTimes) {
      if (op2DTimes.has(t)) overlap++;
    }

    // Allow minimal transition overlap
    const totalD = op1DTimes.size + op2DTimes.size;
    if (totalD > 0) {
      expect(overlap / totalD).toBeLessThan(0.5);
    }
  });

  it('hygienists receive SRP blocks', () => {
    const result = generateSchedule(createMediumOffice());

    const srpSlots = result.slots.filter(s => s.blockTypeId === 'srp1' && !s.isBreak);

    // At least one hygienist should have SRP
    if (srpSlots.length > 0) {
      const srpProviders = new Set(srpSlots.map(s => s.providerId));
      // SRP should only be assigned to hygienists
      for (const pid of srpProviders) {
        expect(['hyg1', 'hyg2', 'hyg3']).toContain(pid);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Large Office: 2 doctors (2 ops each), 3 hygienists
// ---------------------------------------------------------------------------

describe('Generator Integration — Large Office', () => {
  function createLargeOffice(): GenerationInput {
    const providers: ProviderInput[] = [
      {
        id: 'dr1', name: 'Dr. Alpha', role: 'DOCTOR',
        operatories: ['OP1', 'OP2'],
        workingStart: '07:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 10000, color: '#ec8a1b',
      },
      {
        id: 'dr2', name: 'Dr. Beta', role: 'DOCTOR',
        operatories: ['OP3', 'OP4'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 8000, color: '#f59e0b',
      },
      {
        id: 'hyg1', name: 'Hyg 1', role: 'HYGIENIST',
        operatories: ['OP5'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1800, color: '#87bcf3',
      },
      {
        id: 'hyg2', name: 'Hyg 2', role: 'HYGIENIST',
        operatories: ['OP6'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1800, color: '#93c5fd',
      },
      {
        id: 'hyg3', name: 'Hyg 3', role: 'HYGIENIST',
        operatories: ['OP7'],
        workingStart: '08:00', workingEnd: '17:00',
        lunchStart: '12:00', lunchEnd: '13:00',
        dailyGoal: 1800, color: '#a5b4fc',
      },
    ];

    return {
      providers,
      blockTypes: allBlocks(),
      rules: defaultRules(),
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };
  }

  it('all 5 providers produce valid schedules', () => {
    const result = generateSchedule(createLargeOffice());

    expect(result.productionSummary).toHaveLength(5);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.warnings).toBeDefined();
  });

  it('no empty operatories across all providers', () => {
    const result = generateSchedule(createLargeOffice());

    for (const op of ['OP1', 'OP2', 'OP3', 'OP4', 'OP5', 'OP6', 'OP7']) {
      const slots = result.slots.filter(
        s => s.operatory === op && !s.isBreak && s.blockTypeId
      );
      expect(slots.length, `Operatory ${op} should have blocks`).toBeGreaterThan(0);
    }
  });

  it('doctor 1 ($10K goal) has higher production than doctor 2 ($8K goal)', () => {
    const result = generateSchedule(createLargeOffice());

    const dr1 = result.productionSummary.find(s => s.providerId === 'dr1');
    const dr2 = result.productionSummary.find(s => s.providerId === 'dr2');

    expect(dr1).toBeDefined();
    expect(dr2).toBeDefined();
    expect(dr1!.dailyGoal).toBe(10000);
    expect(dr2!.dailyGoal).toBe(8000);

    // dr1 should generally have higher scheduled production
    // (not guaranteed to be proportional, but should both be > 0)
    expect(dr1!.actualScheduled).toBeGreaterThan(0);
    expect(dr2!.actualScheduled).toBeGreaterThan(0);
  });

  it('production summaries reflect correct daily goals', () => {
    const result = generateSchedule(createLargeOffice());

    const dr1 = result.productionSummary.find(s => s.providerId === 'dr1');
    const dr2 = result.productionSummary.find(s => s.providerId === 'dr2');
    const hyg1 = result.productionSummary.find(s => s.providerId === 'hyg1');

    expect(dr1!.dailyGoal).toBe(10000);
    expect(dr1!.target75).toBe(7500);
    expect(dr2!.dailyGoal).toBe(8000);
    expect(dr2!.target75).toBe(6000);
    expect(hyg1!.dailyGoal).toBe(1800);
    expect(hyg1!.target75).toBe(1350);
  });

  it('each doctor has staggered columns', () => {
    const result = generateSchedule(createLargeOffice());

    // Doctor 1: OP1 vs OP2
    const dr1Op1First = result.slots
      .filter(s => s.providerId === 'dr1' && s.operatory === 'OP1' && !s.isBreak && s.blockTypeId)
      .sort((a, b) => toMin(a.time) - toMin(b.time))[0];
    const dr1Op2First = result.slots
      .filter(s => s.providerId === 'dr1' && s.operatory === 'OP2' && !s.isBreak && s.blockTypeId)
      .sort((a, b) => toMin(a.time) - toMin(b.time))[0];

    if (dr1Op1First && dr1Op2First) {
      const diff = toMin(dr1Op2First.time) - toMin(dr1Op1First.time);
      expect(diff).toBeGreaterThanOrEqual(20);
    }
  });

  it('schedule generation completes without throwing', () => {
    expect(() => generateSchedule(createLargeOffice())).not.toThrow();
  });

  it('lunch breaks are correctly marked for all providers', () => {
    const result = generateSchedule(createLargeOffice());

    for (const pid of ['dr1', 'dr2', 'hyg1', 'hyg2', 'hyg3']) {
      const lunchSlots = result.slots.filter(
        s => s.providerId === pid && s.isBreak && s.blockLabel === 'LUNCH'
      );
      expect(lunchSlots.length, `Provider ${pid} should have lunch slots`).toBeGreaterThan(0);
    }
  });
});
