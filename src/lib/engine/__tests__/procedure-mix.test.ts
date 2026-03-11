/**
 * Sprint 9 — Procedure Mix Intelligence tests
 * Tests: mix validation, category target calculation, generator fallback, gap analysis
 */
import { describe, it, expect } from 'vitest';
import { isMixValid, calculateCategoryTargets } from '../generator';
import { computeMixGapAnalysis, getMixTotal, isMixComplete } from '../procedure-mix';
import { inferProcedureCategory } from '../types';
import type { ProviderInput, BlockTypeInput, ProcedureMix } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    id: 'doc1',
    name: 'Dr. Test',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '07:00',
    workingEnd: '17:00',
    dailyGoal: 5000,
    color: '#666',
    ...overrides,
  };
}

function makeBlockType(overrides: Partial<BlockTypeInput> = {}): BlockTypeInput {
  return {
    id: 'bt1',
    label: 'Crown',
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    minimumAmount: 1200,
    procedureCategory: 'MAJOR_RESTORATIVE',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mix validation
// ─────────────────────────────────────────────────────────────────────────────

describe('isMixValid', () => {
  it('returns false for undefined', () => {
    expect(isMixValid(undefined)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isMixValid({})).toBe(false);
  });

  it('returns false when sum < 95', () => {
    expect(isMixValid({ MAJOR_RESTORATIVE: 50, ENDODONTICS: 30 })).toBe(false); // 80%
  });

  it('returns true when sum is exactly 100', () => {
    expect(isMixValid({
      MAJOR_RESTORATIVE: 25, ENDODONTICS: 10, BASIC_RESTORATIVE: 20, PERIODONTICS: 10,
      NEW_PATIENT_DIAG: 12, EMERGENCY_ACCESS: 8, ORAL_SURGERY: 10, PROSTHODONTICS: 5,
    })).toBe(true);
  });

  it('returns true when sum is within tolerance (95-105)', () => {
    expect(isMixValid({ MAJOR_RESTORATIVE: 50, ENDODONTICS: 47 })).toBe(true); // 97%
    expect(isMixValid({ MAJOR_RESTORATIVE: 50, ENDODONTICS: 53 })).toBe(true); // 103%
  });

  it('returns false when sum > 105', () => {
    expect(isMixValid({ MAJOR_RESTORATIVE: 60, ENDODONTICS: 50 })).toBe(false); // 110%
  });
});

describe('getMixTotal', () => {
  it('sums all category values', () => {
    expect(getMixTotal({ MAJOR_RESTORATIVE: 25, ENDODONTICS: 75 })).toBe(100);
    expect(getMixTotal({})).toBe(0);
    expect(getMixTotal({ MAJOR_RESTORATIVE: 30, BASIC_RESTORATIVE: 70 })).toBe(100);
  });
});

describe('isMixComplete', () => {
  it('returns true when total is 100', () => {
    expect(isMixComplete({ MAJOR_RESTORATIVE: 60, ENDODONTICS: 40 })).toBe(true);
  });
  it('returns false when total is not 100', () => {
    expect(isMixComplete({ MAJOR_RESTORATIVE: 60 })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category target calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateCategoryTargets', () => {
  it('returns empty for categories with no matching block types', () => {
    const doc = makeProvider({ dailyGoal: 5000 });
    const mix: ProcedureMix = { MAJOR_RESTORATIVE: 100 };
    // No block types provided → no matching blocks
    const result = calculateCategoryTargets(doc, [], mix);
    expect(result.MAJOR_RESTORATIVE).toBeUndefined(); // no matching blocks
  });

  it('calculates block count based on dollar target / avg block value', () => {
    const doc = makeProvider({ dailyGoal: 5000 });
    // 75% of 5000 = 3750; 25% of 3750 = 937.5 for MAJOR_RESTORATIVE
    // avg block value = 1200 → count = round(937.5 / 1200) = 1
    const bt = makeBlockType({ minimumAmount: 1200, procedureCategory: 'MAJOR_RESTORATIVE' });
    const mix: ProcedureMix = { MAJOR_RESTORATIVE: 25, BASIC_RESTORATIVE: 75 };

    const result = calculateCategoryTargets(doc, [bt], mix);
    expect(result.MAJOR_RESTORATIVE).toBe(1); // 937.5 / 1200 ≈ 1
  });

  it('returns 0 for categories where block value is 0', () => {
    const doc = makeProvider({ dailyGoal: 5000 });
    const bt = makeBlockType({ minimumAmount: 0, procedureCategory: 'EMERGENCY_ACCESS' });
    const mix: ProcedureMix = { EMERGENCY_ACCESS: 100 };
    const result = calculateCategoryTargets(doc, [bt], mix);
    expect(result.EMERGENCY_ACCESS).toBe(0);
  });

  it('only includes blocks that apply to the provider role', () => {
    const doc = makeProvider({ role: 'DOCTOR', dailyGoal: 5000 });
    const hygBlock = makeBlockType({
      appliesToRole: 'HYGIENIST',
      procedureCategory: 'MAJOR_RESTORATIVE',
      minimumAmount: 1200,
    });
    const mix: ProcedureMix = { MAJOR_RESTORATIVE: 100 };
    const result = calculateCategoryTargets(doc, [hygBlock], mix);
    // Hygienist block doesn't apply to doctor → no match
    expect(result.MAJOR_RESTORATIVE).toBeUndefined();
  });

  it('uses multiple block types for average', () => {
    const doc = makeProvider({ dailyGoal: 4000 });
    // 75% of 4000 = 3000; 50% for MAJOR = 1500
    // avg of 1200 + 1800 = 1500 → count = round(1500/1500) = 1
    const bt1 = makeBlockType({ id: 'bt1', minimumAmount: 1200, procedureCategory: 'MAJOR_RESTORATIVE' });
    const bt2 = makeBlockType({ id: 'bt2', minimumAmount: 1800, procedureCategory: 'MAJOR_RESTORATIVE' });
    const mix: ProcedureMix = { MAJOR_RESTORATIVE: 50, BASIC_RESTORATIVE: 50 };
    const result = calculateCategoryTargets(doc, [bt1, bt2], mix);
    expect(result.MAJOR_RESTORATIVE).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap analysis
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMixGapAnalysis', () => {
  it('returns empty when mixes are identical', () => {
    const mix: ProcedureMix = { MAJOR_RESTORATIVE: 50, ENDODONTICS: 50 };
    expect(computeMixGapAnalysis(mix, mix)).toHaveLength(0);
  });

  it('only returns rows with |gap| > 3%', () => {
    const current: ProcedureMix = { MAJOR_RESTORATIVE: 20, ENDODONTICS: 80 };
    const future: ProcedureMix = { MAJOR_RESTORATIVE: 22, ENDODONTICS: 78 }; // gap of 2% — excluded
    const rows = computeMixGapAnalysis(current, future);
    expect(rows).toHaveLength(0);
  });

  it('returns rows with gap > 3%', () => {
    const current: ProcedureMix = { MAJOR_RESTORATIVE: 18, ENDODONTICS: 82 };
    const future: ProcedureMix = { MAJOR_RESTORATIVE: 35, ENDODONTICS: 65 };
    const rows = computeMixGapAnalysis(current, future);
    expect(rows.length).toBeGreaterThan(0);
    const majorRow = rows.find(r => r.category === 'MAJOR_RESTORATIVE');
    expect(majorRow).toBeDefined();
    expect(majorRow!.gap).toBe(17); // 35 - 18
    expect(majorRow!.severity).toBe('red'); // > 10%
  });

  it('uses amber severity for 4-10% gaps', () => {
    const current: ProcedureMix = { MAJOR_RESTORATIVE: 20, BASIC_RESTORATIVE: 80 };
    const future: ProcedureMix = { MAJOR_RESTORATIVE: 28, BASIC_RESTORATIVE: 72 }; // +8% gap
    const rows = computeMixGapAnalysis(current, future);
    const row = rows.find(r => r.category === 'MAJOR_RESTORATIVE');
    expect(row).toBeDefined();
    expect(row!.severity).toBe('amber');
    expect(row!.gap).toBe(8);
  });

  it('includes correct action text', () => {
    const current: ProcedureMix = { MAJOR_RESTORATIVE: 10 };
    const future: ProcedureMix = { MAJOR_RESTORATIVE: 30 }; // +20% gap
    const rows = computeMixGapAnalysis(current, future);
    const row = rows.find(r => r.category === 'MAJOR_RESTORATIVE');
    expect(row).toBeDefined();
    expect(row!.action).toContain('crown'); // action references crown for MAJOR_RESTORATIVE
  });

  it('sorts rows by absolute gap descending', () => {
    const current: ProcedureMix = { MAJOR_RESTORATIVE: 5, ENDODONTICS: 5 };
    const future: ProcedureMix = { MAJOR_RESTORATIVE: 25, ENDODONTICS: 15 }; // +20% and +10%
    const rows = computeMixGapAnalysis(current, future);
    if (rows.length >= 2) {
      expect(Math.abs(rows[0].gap)).toBeGreaterThanOrEqual(Math.abs(rows[1].gap));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auto-category inference
// ─────────────────────────────────────────────────────────────────────────────

describe('inferProcedureCategory', () => {
  it('infers MAJOR_RESTORATIVE from Crown', () => {
    expect(inferProcedureCategory('Crown')).toBe('MAJOR_RESTORATIVE');
    expect(inferProcedureCategory('Bridge Work')).toBe('MAJOR_RESTORATIVE');
    expect(inferProcedureCategory('Veneer')).toBe('MAJOR_RESTORATIVE');
  });

  it('infers ENDODONTICS from Root Canal', () => {
    expect(inferProcedureCategory('Root Canal')).toBe('ENDODONTICS');
    expect(inferProcedureCategory('Endo')).toBe('ENDODONTICS');
    expect(inferProcedureCategory('RCT')).toBe('ENDODONTICS');
  });

  it('infers BASIC_RESTORATIVE from Composite', () => {
    expect(inferProcedureCategory('Composite')).toBe('BASIC_RESTORATIVE');
    expect(inferProcedureCategory('Filling')).toBe('BASIC_RESTORATIVE');
    expect(inferProcedureCategory('Build-up')).toBe('BASIC_RESTORATIVE');
  });

  it('infers PERIODONTICS from SRP', () => {
    expect(inferProcedureCategory('SRP')).toBe('PERIODONTICS');
    expect(inferProcedureCategory('Perio Maintenance')).toBe('PERIODONTICS');
  });

  it('infers NEW_PATIENT_DIAG from New Patient', () => {
    expect(inferProcedureCategory('New Patient')).toBe('NEW_PATIENT_DIAG');
    expect(inferProcedureCategory('NP Consult')).toBe('NEW_PATIENT_DIAG');
    expect(inferProcedureCategory('Exam')).toBe('NEW_PATIENT_DIAG');
  });

  it('infers EMERGENCY_ACCESS from Emergency', () => {
    expect(inferProcedureCategory('Emergency')).toBe('EMERGENCY_ACCESS');
    expect(inferProcedureCategory('Limited Exam')).toBe('EMERGENCY_ACCESS');
    expect(inferProcedureCategory('ER Access')).toBe('EMERGENCY_ACCESS');
  });

  it('infers ORAL_SURGERY from Extraction', () => {
    expect(inferProcedureCategory('Extraction')).toBe('ORAL_SURGERY');
    expect(inferProcedureCategory('Surgical')).toBe('ORAL_SURGERY');
  });

  it('infers PROSTHODONTICS from Denture', () => {
    expect(inferProcedureCategory('Denture')).toBe('PROSTHODONTICS');
    expect(inferProcedureCategory('Partial Denture')).toBe('PROSTHODONTICS');
  });

  it('falls back to BASIC_RESTORATIVE for unknown labels', () => {
    expect(inferProcedureCategory('Miscellaneous')).toBe('BASIC_RESTORATIVE');
    expect(inferProcedureCategory('Other Procedure')).toBe('BASIC_RESTORATIVE');
  });

  it('is case-insensitive', () => {
    expect(inferProcedureCategory('crown')).toBe('MAJOR_RESTORATIVE');
    expect(inferProcedureCategory('ROOT CANAL')).toBe('ENDODONTICS');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Generator fallback (existing offices without mix)
// ─────────────────────────────────────────────────────────────────────────────

describe('generator fallback when no mix set', () => {
  it('isMixValid returns false for provider with no future mix', () => {
    const doc = makeProvider();
    expect(isMixValid(doc.futureProcedureMix)).toBe(false);
  });

  it('isMixValid returns false for provider with empty future mix', () => {
    const doc = makeProvider({ futureProcedureMix: {} });
    expect(isMixValid(doc.futureProcedureMix)).toBe(false);
  });

  it('isMixValid returns true for provider with valid future mix summing to 100', () => {
    const doc = makeProvider({
      futureProcedureMix: {
        MAJOR_RESTORATIVE: 25, ENDODONTICS: 10, BASIC_RESTORATIVE: 20, PERIODONTICS: 10,
        NEW_PATIENT_DIAG: 12, EMERGENCY_ACCESS: 8, ORAL_SURGERY: 10, PROSTHODONTICS: 5,
      },
    });
    expect(isMixValid(doc.futureProcedureMix)).toBe(true);
  });
});
