/**
 * Sprint 7 — Task 3: Full Provider Edit Capability
 * Tests for staggerOffsetMin logic in the provider edit form submit handler.
 */
import { describe, it, expect } from 'vitest';

interface ProviderFormData {
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  staggerOffsetMin?: number;
}

/** Simulate the submit handler's stagger calculation */
function computeStaggerOffsetMin(
  provider: ProviderFormData,
  doctorIdx: number,
  officeStaggerMin: number
): number {
  const isDoctor = provider.role === 'DOCTOR';
  const hasExplicitStagger = (provider.staggerOffsetMin ?? 0) > 0;
  const autoStagger = isDoctor ? doctorIdx * officeStaggerMin : 0;
  return hasExplicitStagger ? (provider.staggerOffsetMin ?? autoStagger) : autoStagger;
}

describe('Provider edit — stagger offset calculation', () => {
  it('returns 0 for hygienists regardless of stagger settings', () => {
    const result = computeStaggerOffsetMin({ role: 'HYGIENIST', staggerOffsetMin: 0 }, 0, 20);
    expect(result).toBe(0);
  });

  it('auto-calculates stagger for first doctor (idx=0): 0 min', () => {
    const result = computeStaggerOffsetMin({ role: 'DOCTOR', staggerOffsetMin: 0 }, 0, 20);
    expect(result).toBe(0);
  });

  it('auto-calculates stagger for second doctor (idx=1): 20 min', () => {
    const result = computeStaggerOffsetMin({ role: 'DOCTOR', staggerOffsetMin: 0 }, 1, 20);
    expect(result).toBe(20);
  });

  it('uses explicit staggerOffsetMin when non-zero (overrides auto-calc)', () => {
    const result = computeStaggerOffsetMin({ role: 'DOCTOR', staggerOffsetMin: 30 }, 2, 20);
    // Would auto-calc to 40 (2*20), but explicit 30 should be used
    expect(result).toBe(30);
  });

  it('falls back to auto-calc when staggerOffsetMin is 0', () => {
    const result = computeStaggerOffsetMin({ role: 'DOCTOR', staggerOffsetMin: 0 }, 2, 20);
    // Explicit 0 treated as "auto" → 2*20=40
    expect(result).toBe(40);
  });

  it('handles undefined staggerOffsetMin as 0 (auto-calc)', () => {
    const result = computeStaggerOffsetMin({ role: 'DOCTOR', staggerOffsetMin: undefined }, 1, 15);
    expect(result).toBe(15);
  });
});
