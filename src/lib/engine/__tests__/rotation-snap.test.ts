/**
 * Sprint 4 P3 Tests — Doctor Rotation Time Increment Snapping (§5.5)
 *
 * Tests:
 * - snapRotationTime — snaps rotation event times to increment boundaries
 * - isAlignedToIncrement — checks alignment
 * - snapToIncrement from types.ts — general-purpose snapper
 */

import { describe, it, expect } from 'vitest';
import { snapRotationTime, isAlignedToIncrement } from '../stagger';
import { snapToIncrement } from '../types';

// ─── snapRotationTime ─────────────────────────────────────────────────────────

describe('snapRotationTime', () => {
  describe('10-minute increment', () => {
    it('should return the same value when already aligned', () => {
      expect(snapRotationTime(7 * 60, 10)).toBe(420);        // 07:00
      expect(snapRotationTime(7 * 60 + 10, 10)).toBe(430);  // 07:10
      expect(snapRotationTime(7 * 60 + 30, 10)).toBe(450);  // 07:30
    });

    it('should round to nearest 10-min boundary', () => {
      // 07:04 → rounds to 07:00
      expect(snapRotationTime(7 * 60 + 4, 10)).toBe(420);
      // 07:05 → rounds to 07:10 (5 rounds up with default Math.round)
      expect(snapRotationTime(7 * 60 + 5, 10)).toBe(430);
      // 07:06 → rounds to 07:10
      expect(snapRotationTime(7 * 60 + 6, 10)).toBe(430);
      // 07:12 → rounds to 07:10
      expect(snapRotationTime(7 * 60 + 12, 10)).toBe(430);
    });

    it('should floor to previous boundary', () => {
      // 07:09 → floor to 07:00
      expect(snapRotationTime(7 * 60 + 9, 10, 'floor')).toBe(420);
      // 07:19 → floor to 07:10
      expect(snapRotationTime(7 * 60 + 19, 10, 'floor')).toBe(430);
    });

    it('should ceil to next boundary', () => {
      // 07:01 → ceil to 07:10
      expect(snapRotationTime(7 * 60 + 1, 10, 'ceil')).toBe(430);
      // 07:10 → ceil stays at 07:10 (already aligned)
      expect(snapRotationTime(7 * 60 + 10, 10, 'ceil')).toBe(430);
    });
  });

  describe('15-minute increment', () => {
    it('should return the same value when already aligned', () => {
      expect(snapRotationTime(7 * 60, 15)).toBe(420);        // 07:00
      expect(snapRotationTime(7 * 60 + 15, 15)).toBe(435);  // 07:15
      expect(snapRotationTime(7 * 60 + 45, 15)).toBe(465);  // 07:45
    });

    it('should round to nearest 15-min boundary', () => {
      // 07:07 = 427 min. 427/15 = 28.47 → rounds to 28. 28*15 = 420 = 07:00
      expect(snapRotationTime(7 * 60 + 7, 15)).toBe(420);
      // 07:08 = 428 min. 428/15 = 28.53 → rounds to 29. 29*15 = 435 = 07:15
      expect(snapRotationTime(7 * 60 + 8, 15)).toBe(435);
    });

    it('should floor to 15-min boundary', () => {
      expect(snapRotationTime(7 * 60 + 14, 15, 'floor')).toBe(420);
      expect(snapRotationTime(7 * 60 + 15, 15, 'floor')).toBe(435);
    });
  });

  it('should return 0 for invalid increment (zero)', () => {
    expect(snapRotationTime(7 * 60, 0)).toBe(7 * 60); // passthrough
  });

  it('should handle large minute values correctly', () => {
    // 18:00 = 1080 minutes, increment 10
    expect(snapRotationTime(1080, 10)).toBe(1080);
    // 18:07 → 18:10 = 1090
    expect(snapRotationTime(1087, 10)).toBe(1090);
  });
});

// ─── isAlignedToIncrement ─────────────────────────────────────────────────────

describe('isAlignedToIncrement', () => {
  it('should return true for exact multiples of increment', () => {
    expect(isAlignedToIncrement(0, 10)).toBe(true);
    expect(isAlignedToIncrement(10, 10)).toBe(true);
    expect(isAlignedToIncrement(60, 15)).toBe(true);
    expect(isAlignedToIncrement(420, 10)).toBe(true);  // 07:00
  });

  it('should return false for non-multiples', () => {
    expect(isAlignedToIncrement(5, 10)).toBe(false);
    expect(isAlignedToIncrement(7, 15)).toBe(false);
    expect(isAlignedToIncrement(421, 10)).toBe(false); // 07:01
  });

  it('should return true for zero increment (skip check)', () => {
    expect(isAlignedToIncrement(7, 0)).toBe(true);
  });
});

// ─── snapToIncrement from types.ts ────────────────────────────────────────────

describe('snapToIncrement (types.ts)', () => {
  it('should snap to nearest increment boundary (round)', () => {
    expect(snapToIncrement(24, 10)).toBe(20);
    expect(snapToIncrement(25, 10)).toBe(30);
    expect(snapToIncrement(30, 10)).toBe(30);
  });

  it('should floor to previous boundary', () => {
    expect(snapToIncrement(29, 10, 'floor')).toBe(20);
    expect(snapToIncrement(30, 10, 'floor')).toBe(30);
  });

  it('should ceil to next boundary', () => {
    expect(snapToIncrement(21, 10, 'ceil')).toBe(30);
    expect(snapToIncrement(20, 10, 'ceil')).toBe(20);
  });

  it('should handle 15-minute increment', () => {
    expect(snapToIncrement(22, 15)).toBe(15);
    expect(snapToIncrement(23, 15)).toBe(30);
  });

  it('should return value unchanged for increment = 0', () => {
    expect(snapToIncrement(17, 0)).toBe(17);
  });

  it('should return 0 for input 0', () => {
    expect(snapToIncrement(0, 10)).toBe(0);
    expect(snapToIncrement(0, 15)).toBe(0);
  });

  it('should handle already-aligned values', () => {
    expect(snapToIncrement(20, 10)).toBe(20);
    expect(snapToIncrement(45, 15)).toBe(45);
  });
});

// ─── Stagger offset snapping integration ─────────────────────────────────────

describe('Stagger offset to time increment alignment', () => {
  it('default 20-minute stagger offset aligns with 10-minute increment', () => {
    // 20 is a multiple of 10
    expect(isAlignedToIncrement(20, 10)).toBe(true);
  });

  it('default 20-minute stagger offset aligns with 15-minute increment (snapped)', () => {
    // 20 is NOT a multiple of 15 (20/15 = 1.33), so it must be snapped
    const snapped = snapToIncrement(20, 15);
    expect(isAlignedToIncrement(snapped, 15)).toBe(true);
    // 20 → nearest 15-min boundary is 15 or 30 (20 rounds to 15)
    expect(snapped).toBe(15);
  });

  it('30-minute stagger offset aligns with both 10 and 15 minute increments', () => {
    expect(isAlignedToIncrement(30, 10)).toBe(true);
    expect(isAlignedToIncrement(30, 15)).toBe(true);
  });

  it('column stagger offset should be snapped to increment before use', () => {
    // If the office uses 15-min increments and stagger is 20 → snap to 15 or 30
    const stagger = 20;
    const increment = 15;
    const snapped = snapToIncrement(stagger, increment, 'round');
    expect(isAlignedToIncrement(snapped, increment)).toBe(true);
  });
});
