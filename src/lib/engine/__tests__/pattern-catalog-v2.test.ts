import { describe, it, expect } from 'vitest';
import {
  resolvePatternV2,
  decomposeLegacyPattern,
  derivePattern,
} from '../pattern-catalog';
import type { BlockTypeInput, StaffingCode } from '../types';

/**
 * Phase-4 test-suite backfill (Task 5): pattern-catalog.ts was at 61.42%
 * line coverage with the v2 resolver (Path 1–4) and decomposeLegacyPattern
 * untested. These lock the Sprint-1 resolution contract.
 */

function bt(partial: Partial<BlockTypeInput> & Pick<BlockTypeInput, 'id' | 'label'>): BlockTypeInput {
  return {
    appliesToRole: 'DOCTOR',
    durationMin: 60,
    ...partial,
  };
}

describe('resolvePatternV2 — resolution order', () => {
  it('Path 1: returns blockType.xSegment when present (authoritative)', () => {
    const blockType = bt({
      id: 'hp',
      label: 'HP',
      xSegment: { asstPreMin: 10, doctorMin: 40, asstPostMin: 10 },
    });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0 });
    expect(r.source).toBe('blockType.xSegment');
    expect(r.xSegment).toEqual({ asstPreMin: 10, doctorMin: 40, asstPostMin: 10 });
  });

  it('Path 2: derives from dTimeMin + aTimeMin when no xSegment', () => {
    // durationMin=60, dTimeMin=40, aTimeMin=15 (post) → asstPreMin = 60-40-15 = 5
    const blockType = bt({
      id: 'mp',
      label: 'CUSTOM_MP',
      durationMin: 60,
      dTimeMin: 40,
      aTimeMin: 15,
    });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0 });
    expect(r.source).toBe('blockType.dATime');
    expect(r.xSegment.doctorMin).toBe(40);
    expect(r.xSegment.asstPostMin).toBe(15);
    expect(r.xSegment.asstPreMin).toBe(5);
  });

  it('Path 2: clamps asstPreMin at zero when sum overshoots duration', () => {
    const blockType = bt({
      id: 'x',
      label: 'X',
      durationMin: 30,
      dTimeMin: 40, // larger than duration
      aTimeMin: 10,
    });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0 });
    expect(r.xSegment.asstPreMin).toBe(0);
    expect(r.xSegment.doctorMin).toBe(40);
  });

  it('Path 3: legacy catalog lookup by label when no xSegment or D/A fields', () => {
    const blockType = bt({ id: 'hp', label: 'HP > $1800', durationMin: 80 });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0, unitMin: 10 });
    expect(r.source).toBe('legacyPatternCatalog');
    expect(r.legacyPattern).toBeDefined();
    // HP pattern is ['A','A','D','D','D','D','A','A'] @ 10min → pre=20, d=40, post=20
    expect(r.xSegment).toEqual({ asstPreMin: 20, doctorMin: 40, asstPostMin: 20 });
  });

  it('Path 4: pure derivation fallback when nothing matches', () => {
    const blockType = bt({
      id: 'zz',
      label: 'Totally-Unknown-Label',
      durationMin: 40,
      appliesToRole: 'DOCTOR',
    });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0, unitMin: 10 });
    expect(r.source).toBe('derived');
    // length = 40/10 = 4 → ['A','D','D','A'] → pre=10, d=20, post=10
    expect(r.xSegment.doctorMin).toBe(20);
    expect(r.xSegment.asstPreMin + r.xSegment.asstPostMin).toBe(20);
  });

  it('Path 4: hygienist role derives all-H pattern (entire duration becomes doctorMin band)', () => {
    const blockType = bt({
      id: 'hygx',
      label: 'Zzzz-Unknown-Hyg-Label',
      durationMin: 60,
      appliesToRole: 'HYGIENIST',
    });
    const r = resolvePatternV2({ blockType, practiceModel: 'SINGLE_OP', column: 0, unitMin: 10 });
    expect(r.source).toBe('derived');
    // Derived pattern for HYGIENIST is all 'H' → decomposeLegacyPattern folds
    // the whole pattern into the doctorMin band (pre=0, post=0).
    expect(r.xSegment.asstPreMin).toBe(0);
    expect(r.xSegment.doctorMin).toBe(60);
    expect(r.xSegment.asstPostMin).toBe(0);
  });
});

describe('decomposeLegacyPattern', () => {
  it('empty pattern → all zeros', () => {
    expect(decomposeLegacyPattern([], 10)).toEqual({
      asstPreMin: 0,
      doctorMin: 0,
      asstPostMin: 0,
    });
  });

  it('A-D-A pattern → pre=unit, doc=unit, post=unit', () => {
    const pattern: StaffingCode[] = ['A', 'D', 'A'];
    expect(decomposeLegacyPattern(pattern, 10)).toEqual({
      asstPreMin: 10,
      doctorMin: 10,
      asstPostMin: 10,
    });
  });

  it('A-A-D-D-D-D-A-A (HP) @ 10min → pre=20, d=40, post=20', () => {
    const pattern: StaffingCode[] = ['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A'];
    expect(decomposeLegacyPattern(pattern, 10)).toEqual({
      asstPreMin: 20,
      doctorMin: 40,
      asstPostMin: 20,
    });
  });

  it('treats null entries as A (assistant)', () => {
    const pattern: StaffingCode[] = [null, null, 'D', null];
    expect(decomposeLegacyPattern(pattern, 10)).toEqual({
      asstPreMin: 20,
      doctorMin: 10,
      asstPostMin: 10,
    });
  });

  it('treats H as doctor-band (non-A)', () => {
    const pattern: StaffingCode[] = ['H', 'H', 'H'];
    expect(decomposeLegacyPattern(pattern, 10)).toEqual({
      asstPreMin: 0,
      doctorMin: 30,
      asstPostMin: 0,
    });
  });

  it('non-canonical tail counts as post', () => {
    // A A D A D (second D after post-As is non-canonical → folded into post)
    const pattern: StaffingCode[] = ['A', 'A', 'D', 'A', 'D'];
    const result = decomposeLegacyPattern(pattern, 10);
    expect(result.asstPreMin).toBe(20);
    expect(result.doctorMin).toBe(10);
    // the tail 'A','D' = 20 min of post
    expect(result.asstPostMin).toBe(20);
  });
});

describe('derivePattern — edge cases for v2 fallback path', () => {
  it('returns empty array for lengthSlots <= 0', () => {
    expect(derivePattern('DOCTOR', 0)).toEqual([]);
    expect(derivePattern('DOCTOR', -1)).toEqual([]);
  });

  it('length=1 doctor → single D', () => {
    expect(derivePattern('DOCTOR', 1)).toEqual(['D']);
  });

  it('length=2 doctor → A-D', () => {
    expect(derivePattern('DOCTOR', 2)).toEqual(['A', 'D']);
  });

  it('length≥5 doctor → A-A ... A-A (bookended)', () => {
    const p = derivePattern('DOCTOR', 6);
    expect(p[0]).toBe('A');
    expect(p[1]).toBe('A');
    expect(p[4]).toBe('A');
    expect(p[5]).toBe('A');
    expect(p[2]).toBe('D');
    expect(p[3]).toBe('D');
  });
});
