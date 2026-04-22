import { describe, it, expect } from 'vitest';
import {
  ap1_doctorCollision,
  ap3_continuityCrossed,
  ap4_transitionBuffer,
  ap6_quarterbackOverload,
  ap7_assistantDrought,
  ap8_lunchCollision,
  ap9_morningUnderload,
  ap10_rockShortfall,
  ap11_adjacencyDrift,
  ap13_offRoster,
  ap14_afterHours,
  ap15_providerOverlap,
  runAllGuards,
  type GuardContext,
} from '../anti-pattern-guard';
import type { PlacedBlock, DoctorScheduleTrace } from '../types';

function pb(overrides: Partial<PlacedBlock>): PlacedBlock {
  return {
    blockInstanceId: 'b',
    blockTypeId: 'bt',
    blockLabel: 'MP',
    providerId: 'dr-1',
    operatory: 'OP1',
    startMinute: 8 * 60,
    durationMin: 40,
    asstPreMin: 10,
    doctorMin: 20,
    asstPostMin: 10,
    productionAmount: 800,
    ...overrides,
  };
}

function tr(overrides: Partial<DoctorScheduleTrace>): DoctorScheduleTrace {
  return {
    doctorStartMinute: 8 * 60 + 10,
    doctorEndMinute: 8 * 60 + 30,
    doctorProviderId: 'dr-1',
    operatory: 'OP1',
    blockInstanceId: 'b',
    continuityRequired: false,
    concurrencyIndex: 0,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<GuardContext> = {}): GuardContext {
  return {
    blocks: [],
    doctorTrace: [],
    dayStartMin: 7 * 60,
    dayEndMin: 16 * 60,
    lunchStartMin: 12 * 60,
    lunchEndMin: 13 * 60,
    maxConcurrentDoctorOps: 1,
    doctorTransitionBufferMin: 0,
    productionPolicy: 'JAMESON_50',
    dayOfWeek: 'MON',
    rockDollarThreshold: 1000,
    ...overrides,
  };
}

describe('AP-1 doctor collision', () => {
  it('passes when no overlaps', () => {
    const ctx = baseCtx({
      doctorTrace: [
        tr({ blockInstanceId: 'a', doctorStartMinute: 8 * 60, doctorEndMinute: 8 * 60 + 20 }),
        tr({ blockInstanceId: 'b', doctorStartMinute: 9 * 60, doctorEndMinute: 9 * 60 + 20, operatory: 'OP2' }),
      ],
    });
    expect(ap1_doctorCollision(ctx).passed).toBe(true);
  });

  it('fails when two D-bands overlap and max=1', () => {
    const ctx = baseCtx({
      doctorTrace: [
        tr({ blockInstanceId: 'a', doctorStartMinute: 8 * 60, doctorEndMinute: 8 * 60 + 20 }),
        tr({ blockInstanceId: 'b', doctorStartMinute: 8 * 60 + 10, doctorEndMinute: 8 * 60 + 30, operatory: 'OP2' }),
      ],
    });
    expect(ap1_doctorCollision(ctx).passed).toBe(false);
  });
});

describe('AP-3 continuity crossed', () => {
  it('fails when a continuity D-band is overlapped', () => {
    const ctx = baseCtx({
      maxConcurrentDoctorOps: 2,
      doctorTrace: [
        tr({ blockInstanceId: 'endo', continuityRequired: true, doctorStartMinute: 9 * 60, doctorEndMinute: 10 * 60 }),
        tr({ blockInstanceId: 'mp', doctorStartMinute: 9 * 60 + 30, doctorEndMinute: 9 * 60 + 50, operatory: 'OP2' }),
      ],
    });
    expect(ap3_continuityCrossed(ctx).passed).toBe(false);
  });

  it('passes when continuity bands are separated', () => {
    const ctx = baseCtx({
      doctorTrace: [
        tr({ blockInstanceId: 'endo', continuityRequired: true, doctorStartMinute: 9 * 60, doctorEndMinute: 10 * 60 }),
        tr({ blockInstanceId: 'mp', doctorStartMinute: 10 * 60 + 10, doctorEndMinute: 10 * 60 + 30, operatory: 'OP2' }),
      ],
    });
    expect(ap3_continuityCrossed(ctx).passed).toBe(true);
  });
});

describe('AP-4 transition buffer', () => {
  it('fails when inter-op transition < buffer', () => {
    const ctx = baseCtx({
      doctorTransitionBufferMin: 5,
      doctorTrace: [
        tr({ blockInstanceId: 'a', doctorStartMinute: 8 * 60, doctorEndMinute: 8 * 60 + 20, operatory: 'OP1' }),
        tr({ blockInstanceId: 'b', doctorStartMinute: 8 * 60 + 22, doctorEndMinute: 8 * 60 + 42, operatory: 'OP2' }),
      ],
    });
    expect(ap4_transitionBuffer(ctx).passed).toBe(false);
  });

  it('no-op when buffer is 0', () => {
    const ctx = baseCtx({ doctorTransitionBufferMin: 0 });
    expect(ap4_transitionBuffer(ctx).passed).toBe(true);
  });
});

describe('AP-6 quarterback overload', () => {
  it('fails when 3 D-bands overlap under max=2', () => {
    const ctx = baseCtx({
      maxConcurrentDoctorOps: 2,
      doctorTrace: [
        tr({ blockInstanceId: 'a', doctorStartMinute: 8 * 60, doctorEndMinute: 9 * 60 }),
        tr({ blockInstanceId: 'b', doctorStartMinute: 8 * 60 + 10, doctorEndMinute: 9 * 60 + 10, operatory: 'OP2' }),
        tr({ blockInstanceId: 'c', doctorStartMinute: 8 * 60 + 20, doctorEndMinute: 9 * 60 + 20, operatory: 'OP3' }),
      ],
    });
    expect(ap6_quarterbackOverload(ctx).passed).toBe(false);
  });
});

describe('AP-7 assistant drought', () => {
  it('fails when block has uncovered minutes', () => {
    const ctx = baseCtx({
      blocks: [pb({ durationMin: 60, asstPreMin: 10, doctorMin: 20, asstPostMin: 10 })], // 40 covered, 60 dur
    });
    expect(ap7_assistantDrought(ctx).passed).toBe(false);
  });

  it('passes when asstPre+doc+asstPost = dur', () => {
    const ctx = baseCtx({
      blocks: [pb({ durationMin: 40 })],
    });
    expect(ap7_assistantDrought(ctx).passed).toBe(true);
  });
});

describe('AP-8 lunch collision', () => {
  it('fails when doctor scheduled during lunch', () => {
    const ctx = baseCtx({
      doctorTrace: [tr({ doctorStartMinute: 12 * 60 + 10, doctorEndMinute: 12 * 60 + 30 })],
    });
    expect(ap8_lunchCollision(ctx).passed).toBe(false);
  });
});

describe('AP-9 morning underload', () => {
  it('fails when morning share drastically below target', () => {
    const ctx = baseCtx({
      productionPolicy: 'FARRAN_75_BY_NOON',
      blocks: [
        pb({ startMinute: 8 * 60, productionAmount: 500 }), // AM
        pb({ startMinute: 14 * 60, productionAmount: 5000, blockInstanceId: 'pm' }), // PM
      ],
    });
    expect(ap9_morningUnderload(ctx).passed).toBe(false);
  });

  it('passes when schedule meets morning share', () => {
    const ctx = baseCtx({
      productionPolicy: 'JAMESON_50',
      blocks: [
        pb({ startMinute: 8 * 60, productionAmount: 2500 }),
        pb({ startMinute: 14 * 60, productionAmount: 2500, blockInstanceId: 'pm' }),
      ],
    });
    expect(ap9_morningUnderload(ctx).passed).toBe(true);
  });
});

describe('AP-10 rock shortfall', () => {
  it('fails when AM has no rock blocks', () => {
    const ctx = baseCtx({
      productionPolicy: 'JAMESON_50',
      blocks: [
        pb({ startMinute: 8 * 60, productionAmount: 400 }), // sand
        pb({ startMinute: 14 * 60, productionAmount: 1500, blockInstanceId: 'pm' }), // rock PM
      ],
    });
    expect(ap10_rockShortfall(ctx).passed).toBe(false);
  });
});

describe('AP-11 adjacency drift', () => {
  it('flags two back-to-back same-type blocks', () => {
    const ctx = baseCtx({
      blocks: [
        pb({ blockInstanceId: 'a', blockTypeId: 'MP', startMinute: 8 * 60, durationMin: 40 }),
        pb({ blockInstanceId: 'b', blockTypeId: 'MP', startMinute: 8 * 60 + 40, durationMin: 40 }),
      ],
    });
    expect(ap11_adjacencyDrift(ctx).passed).toBe(false);
  });
});

describe('AP-13 off-roster', () => {
  it('fails when a provider is scheduled off roster', () => {
    const ctx = baseCtx({
      dayOfWeek: 'FRI',
      providerRosters: { 'dr-1': ['MON', 'TUE', 'WED', 'THU'] },
      blocks: [pb({ providerId: 'dr-1' })],
    });
    expect(ap13_offRoster(ctx).passed).toBe(false);
  });

  it('passes when on roster', () => {
    const ctx = baseCtx({
      dayOfWeek: 'MON',
      providerRosters: { 'dr-1': ['MON', 'TUE', 'WED', 'THU', 'FRI'] },
      blocks: [pb({ providerId: 'dr-1' })],
    });
    expect(ap13_offRoster(ctx).passed).toBe(true);
  });
});

describe('AP-14 after hours', () => {
  it('fails when D-band ends past dayEndMin', () => {
    const ctx = baseCtx({
      dayEndMin: 16 * 60,
      doctorTrace: [tr({ doctorStartMinute: 15 * 60 + 55, doctorEndMinute: 16 * 60 + 15 })],
    });
    expect(ap14_afterHours(ctx).passed).toBe(false);
  });
});

describe('AP-15 provider overlap', () => {
  it('fails when provider has two overlapping blocks in same op', () => {
    const ctx = baseCtx({
      blocks: [
        pb({ blockInstanceId: 'a', startMinute: 8 * 60, durationMin: 40 }),
        pb({ blockInstanceId: 'b', startMinute: 8 * 60 + 20, durationMin: 40 }),
      ],
    });
    expect(ap15_providerOverlap(ctx).passed).toBe(false);
  });
});

describe('runAllGuards aggregator', () => {
  it('aggregates violations with severity counts', () => {
    const ctx = baseCtx({
      blocks: [
        pb({ blockInstanceId: 'a', startMinute: 8 * 60, durationMin: 40 }),
        pb({ blockInstanceId: 'b', startMinute: 8 * 60 + 20, durationMin: 40 }),
      ],
      doctorTrace: [tr({ doctorStartMinute: 12 * 60 + 10, doctorEndMinute: 12 * 60 + 30 })],
    });
    const report = runAllGuards(ctx);
    expect(report.passed).toBe(false);
    expect(report.counts.hard).toBeGreaterThan(0);
    expect(report.results.length).toBe(15);
  });

  it('passes clean schedule', () => {
    const ctx = baseCtx({
      blocks: [
        pb({ startMinute: 8 * 60, productionAmount: 1500 }),
        pb({ blockInstanceId: 'pm', startMinute: 14 * 60, productionAmount: 1500 }),
      ],
      doctorTrace: [
        tr({ doctorStartMinute: 8 * 60 + 10, doctorEndMinute: 8 * 60 + 30 }),
        tr({ blockInstanceId: 'pm', doctorStartMinute: 14 * 60 + 10, doctorEndMinute: 14 * 60 + 30, operatory: 'OP1' }),
      ],
    });
    const report = runAllGuards(ctx);
    expect(report.counts.hard).toBe(0);
  });
});
