/**
 * Sprint 1 integration test — exercises X-segment resolution end-to-end:
 *   BlockType → resolvePatternV2 → MultiColumnCoordinator → trace → AntiPatternGuard
 *
 * Simulates a 2-op doctor day placing a mix of HP/MP/Endo blocks and asserts:
 *   - All admitted placements respect maxConcurrentDoctorOps=2
 *   - Endo (continuity) is serialized
 *   - AntiPatternGuard reports zero HARD violations
 *   - DoctorScheduleTrace surfaces concurrency index correctly
 */

import { describe, it, expect } from 'vitest';
import { MultiColumnCoordinator } from '../multi-column-coordinator';
import { resolvePatternV2 } from '../pattern-catalog';
import { runAllGuards } from '../anti-pattern-guard';
import type { BlockTypeInput, PlacedBlock, DoctorScheduleTrace } from '../types';

const HP_BT: BlockTypeInput = {
  id: 'hp',
  label: 'HP > $1800',
  appliesToRole: 'DOCTOR',
  durationMin: 80,
  xSegment: { asstPreMin: 20, doctorMin: 40, asstPostMin: 20 },
};
const MP_BT: BlockTypeInput = {
  id: 'mp',
  label: 'MP',
  appliesToRole: 'DOCTOR',
  durationMin: 40,
  xSegment: { asstPreMin: 10, doctorMin: 20, asstPostMin: 10 },
};
const ENDO_BT: BlockTypeInput = {
  id: 'endo',
  label: 'ENDO',
  appliesToRole: 'DOCTOR',
  durationMin: 80,
  xSegment: { asstPreMin: 10, doctorMin: 60, asstPostMin: 10, doctorContinuityRequired: true },
};

function placeAndTrace(bt: BlockTypeInput, startMin: number, op: string): PlacedBlock {
  const v2 = resolvePatternV2({ blockType: bt, practiceModel: '1D2O', column: 0 });
  return {
    blockInstanceId: `${bt.id}-${op}-${startMin}`,
    blockTypeId: bt.id,
    blockLabel: bt.label,
    providerId: 'dr-1',
    operatory: op,
    startMinute: startMin,
    durationMin: bt.durationMin,
    asstPreMin: v2.xSegment.asstPreMin,
    doctorMin: v2.xSegment.doctorMin,
    asstPostMin: v2.xSegment.asstPostMin,
    doctorStartMinute: startMin + v2.xSegment.asstPreMin,
    doctorContinuityRequired: v2.xSegment.doctorContinuityRequired,
    productionAmount: bt.id === 'hp' ? 1800 : bt.id === 'mp' ? 800 : 1400,
  };
}

describe('Sprint 1 integration — 2-op day regeneration', () => {
  it('admits HP(OP1) + MP(OP2) staggered — passes guards', () => {
    const coord = new MultiColumnCoordinator({
      doctorProviderId: 'dr-1',
      dayStartMin: 7 * 60,
      dayEndMin: 16 * 60,
      lunchStartMin: 12 * 60,
      lunchEndMin: 13 * 60,
      maxConcurrentDoctorOps: 2,
      doctorTransitionBufferMin: 0,
      efdaScopeLevel: 'LIMITED',
    });

    // Place HP at 8:00 OP1 (D-band 8:20–9:00)
    const hp = resolvePatternV2({ blockType: HP_BT, practiceModel: '1D2O', column: 0 });
    const hpRes = coord.reserveDoctorSegment({
      blockInstanceId: 'hp-1',
      operatory: 'OP1',
      blockStartMin: 8 * 60,
      xSegment: hp.xSegment,
    });
    expect(hpRes.ok).toBe(true);

    // Place MP at 8:10 OP2 (D-band 8:20–8:40) — overlaps HP's D-band → OK since max=2
    const mp = resolvePatternV2({ blockType: MP_BT, practiceModel: '1D2O', column: 1 });
    const mpRes = coord.reserveDoctorSegment({
      blockInstanceId: 'mp-1',
      operatory: 'OP2',
      blockStartMin: 8 * 60 + 10,
      xSegment: mp.xSegment,
    });
    expect(mpRes.ok).toBe(true);

    const trace = coord.trace();
    expect(trace).toHaveLength(2);
    expect(trace.some((t) => t.concurrencyIndex > 0)).toBe(true);

    // Construct a realistic full-day block set whose IDs match the coordinator
    // reservations so AP-2 (orphan X) is clean. We rebuild the trace directly
    // from the block list to guarantee ID symmetry.
    const blocks: PlacedBlock[] = [
      {
        blockInstanceId: 'hp-1',
        blockTypeId: 'hp',
        blockLabel: 'HP > $1800',
        providerId: 'dr-1',
        operatory: 'OP1',
        startMinute: 8 * 60,
        durationMin: 80,
        asstPreMin: 20,
        doctorMin: 40,
        asstPostMin: 20,
        doctorStartMinute: 8 * 60 + 20,
        productionAmount: 1800,
      },
      {
        blockInstanceId: 'mp-1',
        blockTypeId: 'mp',
        blockLabel: 'MP',
        providerId: 'dr-1',
        operatory: 'OP2',
        startMinute: 8 * 60 + 10,
        durationMin: 40,
        asstPreMin: 10,
        doctorMin: 20,
        asstPostMin: 10,
        doctorStartMinute: 8 * 60 + 20,
        productionAmount: 800,
      },
      {
        blockInstanceId: 'hp-pm',
        blockTypeId: 'hp',
        blockLabel: 'HP > $1800',
        providerId: 'dr-1',
        operatory: 'OP1',
        startMinute: 14 * 60,
        durationMin: 80,
        asstPreMin: 20,
        doctorMin: 40,
        asstPostMin: 20,
        doctorStartMinute: 14 * 60 + 20,
        productionAmount: 1800,
      },
    ];
    const fullTrace: DoctorScheduleTrace[] = [
      ...trace,
      {
        doctorStartMinute: 14 * 60 + 20,
        doctorEndMinute: 15 * 60,
        doctorProviderId: 'dr-1',
        operatory: 'OP1',
        blockInstanceId: 'hp-pm',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
    ];

    const report = runAllGuards({
      blocks,
      doctorTrace: fullTrace,
      dayStartMin: 7 * 60,
      dayEndMin: 16 * 60,
      lunchStartMin: 12 * 60,
      lunchEndMin: 13 * 60,
      maxConcurrentDoctorOps: 2,
      doctorTransitionBufferMin: 0,
      productionPolicy: 'JAMESON_50',
      dayOfWeek: 'MON',
    });

    expect(report.counts.hard).toBe(0);
  });

  it('endo at 9:00 OP1 blocks MP placement in overlapping window on OP2', () => {
    const coord = new MultiColumnCoordinator({
      doctorProviderId: 'dr-1',
      dayStartMin: 7 * 60,
      dayEndMin: 16 * 60,
      maxConcurrentDoctorOps: 2,
      doctorTransitionBufferMin: 0,
      efdaScopeLevel: 'LIMITED',
    });

    const endo = resolvePatternV2({ blockType: ENDO_BT, practiceModel: '1D2O', column: 0 });
    coord.reserveDoctorSegment({
      blockInstanceId: 'endo-1',
      operatory: 'OP1',
      blockStartMin: 9 * 60,
      xSegment: endo.xSegment,
    });

    // Try to place MP at 9:30 OP2 — D-band 9:40–10:00 overlaps endo's 9:10–10:10
    const mp = resolvePatternV2({ blockType: MP_BT, practiceModel: '1D2O', column: 1 });
    const r = coord.canPlaceDoctorSegment({
      blockInstanceId: 'mp-1',
      operatory: 'OP2',
      blockStartMin: 9 * 60 + 30,
      xSegment: mp.xSegment,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('CONTINUITY_COLLISION');
  });
});
