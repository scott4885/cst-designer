/**
 * Sprint 4 P3 Tests — D/A/H Time Model for Hygiene Appointments (§3.4/3.5)
 *
 * Tests:
 * - validateHygieneDTimeOffset — ensures ≥ minute 20 constraint is enforced
 * - computeDefaultHygieneDTimeOffset — scales offset proportionally per appointment
 * - getHygieneDAProportion — H+D visual proportions for rendering
 * - HYGIENE_DTIME_MIN_OFFSET constant is 20
 */

import { describe, it, expect } from 'vitest';
import {
  validateHygieneDTimeOffset,
  computeDefaultHygieneDTimeOffset,
  getHygieneDAProportion,
  HYGIENE_DTIME_MIN_OFFSET,
  HYGIENE_DTIME_DEFAULT_OFFSET,
} from '../da-time';
import type { BlockTypeInput } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

describe('HYGIENE_DTIME_MIN_OFFSET', () => {
  it('should be 20 minutes', () => {
    expect(HYGIENE_DTIME_MIN_OFFSET).toBe(20);
  });

  it('HYGIENE_DTIME_DEFAULT_OFFSET should be ≥ 20', () => {
    expect(HYGIENE_DTIME_DEFAULT_OFFSET).toBeGreaterThanOrEqual(HYGIENE_DTIME_MIN_OFFSET);
  });
});

// ─── validateHygieneDTimeOffset ──────────────────────────────────────────────

describe('validateHygieneDTimeOffset', () => {
  it('should accept offset of exactly 20 (minimum)', () => {
    const result = validateHygieneDTimeOffset(20, 10, 60);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept offset > 20', () => {
    const result = validateHygieneDTimeOffset(25, 10, 60);
    expect(result.valid).toBe(true);
  });

  it('should reject offset < 20 (< minute 20 constraint)', () => {
    const result = validateHygieneDTimeOffset(10, 10, 60);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20');
  });

  it('should reject offset of 0', () => {
    const result = validateHygieneDTimeOffset(0, 10, 60);
    expect(result.valid).toBe(false);
  });

  it('should reject offset of 19', () => {
    const result = validateHygieneDTimeOffset(19, 10, 60);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('minute 20');
  });

  it('should reject offset ≥ appointment duration', () => {
    const result = validateHygieneDTimeOffset(60, 10, 60);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('before the end');
  });

  it('should reject when D-time window overflows appointment', () => {
    // offset=50, dTime=15, duration=60 → would end at minute 65
    const result = validateHygieneDTimeOffset(50, 15, 60);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('extends beyond');
  });

  it('should accept when D-time window fits exactly at end', () => {
    // offset=50, dTime=10, duration=60 → ends at minute 60 (ok, exactly at end)
    const result = validateHygieneDTimeOffset(50, 10, 60);
    expect(result.valid).toBe(true);
  });

  it('should accept D-time of 0 (no exam configured)', () => {
    // dTime=0 means no exam overlay — just validate offset is ≥ 20
    const result = validateHygieneDTimeOffset(25, 0, 60);
    expect(result.valid).toBe(true);
  });
});

// ─── computeDefaultHygieneDTimeOffset ────────────────────────────────────────

describe('computeDefaultHygieneDTimeOffset', () => {
  it('should always return ≥ 20 regardless of appointment duration', () => {
    for (const dur of [20, 30, 45, 60, 90, 120]) {
      const offset = computeDefaultHygieneDTimeOffset(dur, 10);
      expect(offset).toBeGreaterThanOrEqual(HYGIENE_DTIME_MIN_OFFSET);
    }
  });

  it('should return a value that snaps to the time increment', () => {
    const offset10 = computeDefaultHygieneDTimeOffset(60, 10);
    expect(offset10 % 10).toBe(0);

    const offset15 = computeDefaultHygieneDTimeOffset(60, 15);
    expect(offset15 % 15).toBe(0);
  });

  it('should scale proportionally for longer appointments', () => {
    const short = computeDefaultHygieneDTimeOffset(30, 10);
    const medium = computeDefaultHygieneDTimeOffset(60, 10);
    const long = computeDefaultHygieneDTimeOffset(90, 10);
    // Longer appointments → later doctor entry point
    expect(medium).toBeGreaterThanOrEqual(short);
    expect(long).toBeGreaterThanOrEqual(medium);
  });

  it('should return 20 for very short appointments (30 min)', () => {
    const offset = computeDefaultHygieneDTimeOffset(30, 10);
    // 40% of 30 = 12 → snapped up to 20 (minimum)
    expect(offset).toBe(20);
  });
});

// ─── getHygieneDAProportion ──────────────────────────────────────────────────

describe('getHygieneDAProportion', () => {
  const makeHygieneBlockType = (overrides: Partial<BlockTypeInput> = {}): BlockTypeInput => ({
    id: 'prophy-1',
    label: 'Prophy',
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
    hTimeMin: 50,
    dTimeMin: 10,
    dTimeOffsetMin: 25,
    ...overrides,
  });

  it('should return hasSplit=true when both H and D times are configured', () => {
    const bt = makeHygieneBlockType();
    const result = getHygieneDAProportion(bt, 60);
    expect(result.hasSplit).toBe(true);
  });

  it('should return hProportion > 0 and dProportion > 0 when configured', () => {
    const bt = makeHygieneBlockType({ dTimeOffsetMin: 25, dTimeMin: 10 });
    const result = getHygieneDAProportion(bt, 60);
    expect(result.hProportion).toBeGreaterThan(0);
    expect(result.dProportion).toBeGreaterThan(0);
  });

  it('should have proportions that sum to ≤ 1', () => {
    const bt = makeHygieneBlockType({ dTimeOffsetMin: 25, dTimeMin: 10 });
    const result = getHygieneDAProportion(bt, 60);
    expect(result.hProportion + result.dProportion).toBeLessThanOrEqual(1.001); // float tolerance
  });

  it('should return hasSplit=false when no H or D times configured', () => {
    const bt = makeHygieneBlockType({ hTimeMin: undefined, dTimeMin: undefined, dTimeOffsetMin: undefined });
    const result = getHygieneDAProportion(bt, 60);
    expect(result.hasSplit).toBe(false);
    expect(result.hProportion).toBe(1);
    expect(result.dProportion).toBe(0);
  });

  it('should handle zero total duration gracefully', () => {
    const bt = makeHygieneBlockType();
    const result = getHygieneDAProportion(bt, 0);
    expect(result.hasSplit).toBe(false);
    expect(result.hProportion).toBe(1);
  });

  it('hProportion should correspond to the D-time offset fraction', () => {
    // dTimeOffsetMin=30, totalDuration=60 → hProportion should be 0.5
    const bt = makeHygieneBlockType({ dTimeOffsetMin: 30 });
    const result = getHygieneDAProportion(bt, 60);
    expect(result.hProportion).toBeCloseTo(0.5, 1);
  });
});
