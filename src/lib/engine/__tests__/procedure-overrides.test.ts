import { describe, it, expect } from 'vitest';
import {
  mergeProcedureOverrides,
  type ProcedureOverrideRow,
} from '../procedure-overrides';
import type { BlockTypeInput } from '../types';

/**
 * Phase-4 test-suite backfill (Task 5): procedure-overrides is engine-critical
 * (per-practice x-segment override merge) and was at 5.88% line coverage.
 * These tests lock the merge contract defined in the module JSDoc.
 */

function bt(partial: Partial<BlockTypeInput> & Pick<BlockTypeInput, 'id' | 'label'>): BlockTypeInput {
  return {
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    ...partial,
  };
}

const base: BlockTypeInput[] = [
  bt({
    id: 'hp',
    label: 'HP',
    durationMin: 60,
    xSegment: { asstPreMin: 10, doctorMin: 40, asstPostMin: 10 },
  }),
  bt({
    id: 'mp',
    label: 'MP',
    durationMin: 40,
    xSegment: {
      asstPreMin: 5,
      doctorMin: 25,
      asstPostMin: 10,
      doctorContinuityRequired: true,
      examWindowMin: 15,
    },
  }),
  bt({ id: 'np', label: 'NP CONS', durationMin: 30 }), // no xSegment
];

describe('mergeProcedureOverrides', () => {
  it('returns a fresh copy of base when overrides is empty', () => {
    const result = mergeProcedureOverrides(base, []);
    expect(result).toHaveLength(base.length);
    expect(result).not.toBe(base); // new array
    result.forEach((row, i) => expect(row).toBe(base[i])); // but same refs inside
  });

  it('applies override only to matching blockTypeId, leaves others untouched', () => {
    const overrides: ProcedureOverrideRow[] = [
      { officeId: 'o1', blockTypeId: 'hp', asstPreMin: 20, doctorMin: null, asstPostMin: null },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const hp = result.find((b) => b.id === 'hp')!;
    const mp = result.find((b) => b.id === 'mp')!;
    expect(hp.xSegment?.asstPreMin).toBe(20);
    expect(hp.xSegment?.doctorMin).toBe(40); // preserved
    expect(hp.xSegment?.asstPostMin).toBe(10); // preserved
    expect(mp).toBe(base[1]); // untouched ref
  });

  it('null/undefined override fields keep base values, defined fields replace', () => {
    const overrides: ProcedureOverrideRow[] = [
      { officeId: 'o1', blockTypeId: 'hp', asstPreMin: null, doctorMin: 50, asstPostMin: 15 },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const hp = result.find((b) => b.id === 'hp')!;
    expect(hp.xSegment?.asstPreMin).toBe(10); // from base
    expect(hp.xSegment?.doctorMin).toBe(50);
    expect(hp.xSegment?.asstPostMin).toBe(15);
  });

  it('recomputes durationMin from merged x-segment sums', () => {
    const overrides: ProcedureOverrideRow[] = [
      { officeId: 'o1', blockTypeId: 'hp', asstPreMin: 20, doctorMin: 50, asstPostMin: 20 },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const hp = result.find((b) => b.id === 'hp')!;
    expect(hp.durationMin).toBe(90); // 20+50+20
  });

  it('preserves doctorContinuityRequired and examWindowMin on overridden row', () => {
    const overrides: ProcedureOverrideRow[] = [
      { officeId: 'o1', blockTypeId: 'mp', asstPreMin: 10, doctorMin: null, asstPostMin: null },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const mp = result.find((b) => b.id === 'mp')!;
    expect(mp.xSegment?.doctorContinuityRequired).toBe(true);
    expect(mp.xSegment?.examWindowMin).toBe(15);
    expect(mp.xSegment?.asstPreMin).toBe(10);
  });

  it('returns base ref when every override field equals base (no-op empty row)', () => {
    const overrides: ProcedureOverrideRow[] = [
      { officeId: 'o1', blockTypeId: 'hp', asstPreMin: null, doctorMin: null, asstPostMin: null },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const hp = result.find((b) => b.id === 'hp')!;
    expect(hp).toBe(base[0]); // exact same object
  });

  it('leaves durationMin alone when base had no xSegment', () => {
    const overrides: ProcedureOverrideRow[] = [
      // asstPreMin=10 is non-null so it'll force a merge, but base NP has no xSegment
      // — so the base sum is 0 and durationMin stays 30.
      { officeId: 'o1', blockTypeId: 'np', asstPreMin: 10, doctorMin: 20, asstPostMin: 0 },
    ];
    const result = mergeProcedureOverrides(base, overrides);
    const np = result.find((b) => b.id === 'np')!;
    expect(np.durationMin).toBe(30); // preserved because base had no xSegment
    expect(np.xSegment).toEqual({ asstPreMin: 10, doctorMin: 20, asstPostMin: 0 });
  });
});
