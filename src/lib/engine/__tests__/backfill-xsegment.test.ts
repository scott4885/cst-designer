import { describe, it, expect } from 'vitest';
import { decomposePattern } from '../../../../scripts/backfill-xsegment';

describe('backfill decomposer — pattern path', () => {
  it('decomposes [A,D,D,A] into (10, 20, 10)', () => {
    const r = decomposePattern(['A', 'D', 'D', 'A'], 0, 0, 40, false, 10);
    expect(r).toMatchObject({ asstPreMin: 10, doctorMin: 20, asstPostMin: 10, method: 'pattern' });
  });

  it('decomposes [A,A,D,D,D,D,A,A] into (20, 40, 20) — HP pattern', () => {
    const r = decomposePattern(['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A'], 0, 0, 80, false, 10);
    expect(r.asstPreMin).toBe(20);
    expect(r.doctorMin).toBe(40);
    expect(r.asstPostMin).toBe(20);
  });

  it('decomposes [A,D,A] into (10, 10, 10) — ER', () => {
    const r = decomposePattern(['A', 'D', 'A'], 0, 0, 30, false, 10);
    expect(r.asstPreMin).toBe(10);
    expect(r.doctorMin).toBe(10);
    expect(r.asstPostMin).toBe(10);
  });

  it('warns on non-canonical patterns with middle A-gap', () => {
    // A-D-A-D pattern: first D-run ends at idx 2, then trailing A is 1, then stray D is a tail
    const r = decomposePattern(['A', 'D', 'A', 'D'], 0, 0, 40, false, 10);
    expect(r.method).toBe('pattern');
    expect(r.warning).toBeDefined();
  });

  it('treats null slots as assistant (A)', () => {
    const r = decomposePattern(['A', 'D', null, 'A'], 0, 0, 40, false, 10);
    // null -> A, so pattern becomes [A,D,A,A]: pre=1, doc=1, post=2
    expect(r.asstPreMin).toBe(10);
    expect(r.doctorMin).toBe(10);
    expect(r.asstPostMin).toBe(20);
  });
});

describe('backfill decomposer — D/A-field path', () => {
  it('uses dTimeMin and aTimeMin when pattern is null', () => {
    const r = decomposePattern(null, 30, 10, 40, false);
    expect(r.method).toBe('d-a-fields');
    expect(r.doctorMin).toBe(30);
    expect(r.asstPostMin).toBe(10);
    expect(r.asstPreMin).toBe(0);
  });
});

describe('backfill decomposer — hygiene default', () => {
  it('emits majority-hygienist + 10-min exam for pure hygiene block', () => {
    const r = decomposePattern(null, 0, 0, 60, true);
    expect(r.method).toBe('hygiene-default');
    expect(r.asstPreMin).toBe(50);
    expect(r.doctorMin).toBe(10);
    expect(r.asstPostMin).toBe(0);
  });
});

describe('backfill decomposer — duration-only fallback', () => {
  it('assigns full duration to doctorMin when all else is absent', () => {
    const r = decomposePattern(null, 0, 0, 30, false);
    expect(r.method).toBe('duration-only');
    expect(r.doctorMin).toBe(30);
    expect(r.asstPreMin).toBe(0);
    expect(r.asstPostMin).toBe(0);
  });
});
