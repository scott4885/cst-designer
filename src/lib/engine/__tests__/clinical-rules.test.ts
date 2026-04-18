import { describe, it, expect } from 'vitest';
import { validateClinicalRules } from '../clinical-rules';
import type { GenerationResult, ProviderInput, BlockTypeInput, TimeSlotOutput, ProviderProductionSummary } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    id: 'p1',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    operatories: ['OP1'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    lunchEnabled: true,
    dailyGoal: 5000,
    color: '#666',
    seesNewPatients: true,
    ...overrides,
  };
}

function makeHygienist(overrides: Partial<ProviderInput> = {}): ProviderInput {
  return {
    id: 'h1',
    name: 'RDH Jones',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '08:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    lunchEnabled: true,
    dailyGoal: 2000,
    color: '#999',
    seesNewPatients: false,
    ...overrides,
  };
}

function makeBlockType(overrides: Partial<BlockTypeInput> = {}): BlockTypeInput {
  return {
    id: 'bt1',
    label: 'Crown Prep',
    appliesToRole: 'DOCTOR',
    durationMin: 90,
    minimumAmount: 1500,
    procedureCategory: 'MAJOR_RESTORATIVE',
    dTimeMin: 60,
    aTimeMin: 30,
    ...overrides,
  };
}

function makeSlot(
  time: string,
  providerId: string,
  blockLabel: string,
  blockTypeId: string,
  staffingCode: 'D' | 'A' | 'H' | null = 'D',
  isBreak = false
) {
  return {
    time,
    providerId,
    operatory: 'OP1',
    staffingCode,
    blockTypeId,
    blockLabel,
    isBreak,
    blockInstanceId: `${time}-${providerId}-${blockTypeId}`,
    customProductionAmount: null,
  };
}

function makeSchedule(slots: TimeSlotOutput[], productionSummary: ProviderProductionSummary[] = []): GenerationResult {
  return {
    dayOfWeek: 'MONDAY',
    slots,
    productionSummary,
    warnings: [],
  };
}

// ─── Rule 1: New Patient First ─────────────────────────────────────────────────

describe('Rule 1 — New Patient First', () => {
  const crownBT = makeBlockType({ id: 'crown', label: 'Crown Prep', procedureCategory: 'MAJOR_RESTORATIVE' });
  const npBT = makeBlockType({ id: 'np', label: 'New Patient Exam', procedureCategory: 'NEW_PATIENT_DIAG', appliesToRole: 'BOTH' });

  it('passes when provider has an NP slot alongside restorative', () => {
    const provider = makeProvider({ seesNewPatients: true });
    const schedule = makeSchedule([
      makeSlot('08:00', 'p1', 'New Patient Exam', 'np'),
      makeSlot('09:30', 'p1', 'Crown Prep', 'crown'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT, npBT]);
    const rule1 = warnings.filter(w => w.ruleId === 'RULE_1_NP_FIRST');
    expect(rule1).toHaveLength(0);
  });

  it('warns when provider sees new patients but has major restorative with no NP slot', () => {
    const provider = makeProvider({ seesNewPatients: true });
    const schedule = makeSchedule([
      makeSlot('08:00', 'p1', 'Crown Prep', 'crown'),
      makeSlot('09:30', 'p1', 'Crown Prep', 'crown'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT, npBT]);
    const rule1 = warnings.filter(w => w.ruleId === 'RULE_1_NP_FIRST');
    expect(rule1).toHaveLength(1);
    expect(rule1[0].severity).toBe('warning');
  });

  it('does not warn when provider has seesNewPatients=false', () => {
    const provider = makeProvider({ seesNewPatients: false });
    const schedule = makeSchedule([
      makeSlot('08:00', 'p1', 'Crown Prep', 'crown'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT, npBT]);
    const rule1 = warnings.filter(w => w.ruleId === 'RULE_1_NP_FIRST');
    expect(rule1).toHaveLength(0);
  });
});

// ─── Rule 2: SRP + Perio Maintenance Same Day ──────────────────────────────────

describe('Rule 2 — SRP and Perio Maintenance same day', () => {
  const srpBT = makeBlockType({ id: 'srp', label: 'SRP', appliesToRole: 'HYGIENIST', procedureCategory: 'PERIODONTICS' });
  const pmBT = makeBlockType({ id: 'pm', label: 'Perio Maintenance', appliesToRole: 'HYGIENIST', procedureCategory: 'PERIODONTICS' });
  const recallBT = makeBlockType({ id: 'recall', label: 'Prophy', appliesToRole: 'HYGIENIST', procedureCategory: 'PERIODONTICS' });

  it('passes when provider only has SRP (no Perio Maintenance)', () => {
    const provider = makeHygienist();
    const schedule = makeSchedule([
      makeSlot('08:00', 'h1', 'SRP', 'srp', 'H'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [srpBT, pmBT]);
    const rule2 = warnings.filter(w => w.ruleId === 'RULE_2_SRP_PERIO_SAME_DAY');
    expect(rule2).toHaveLength(0);
  });

  it('warns when both SRP and Perio Maintenance appear in same provider-day', () => {
    const provider = makeHygienist();
    const schedule = makeSchedule([
      makeSlot('08:00', 'h1', 'SRP', 'srp', 'H'),
      makeSlot('09:00', 'h1', 'Perio Maintenance', 'pm', 'H'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [srpBT, pmBT]);
    const rule2 = warnings.filter(w => w.ruleId === 'RULE_2_SRP_PERIO_SAME_DAY');
    expect(rule2).toHaveLength(1);
    expect(rule2[0].severity).toBe('warning');
    expect(rule2[0].affectedProvider).toBe('RDH Jones');
  });
});

// ─── Rule 3: Emergency Morning Only ──────────────────────────────────────────

describe('Rule 3 — Emergency blocks before 10:00 AM', () => {
  const erBT = makeBlockType({ id: 'er', label: 'Emergency', appliesToRole: 'DOCTOR', procedureCategory: 'EMERGENCY_ACCESS', minimumAmount: 200 });

  it('passes when ER block is before 10:00 AM', () => {
    const provider = makeProvider();
    const schedule = makeSchedule([
      makeSlot('08:00', 'p1', 'Emergency', 'er'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [erBT]);
    const rule3 = warnings.filter(w => w.ruleId === 'RULE_3_ER_MORNING_ONLY');
    expect(rule3).toHaveLength(0);
  });

  it('warns when ER block is at or after 10:00 AM', () => {
    const provider = makeProvider();
    const schedule = makeSchedule([
      makeSlot('10:00', 'p1', 'Emergency', 'er'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [erBT]);
    const rule3 = warnings.filter(w => w.ruleId === 'RULE_3_ER_MORNING_ONLY');
    expect(rule3).toHaveLength(1);
    expect(rule3[0].severity).toBe('warning');
    expect(rule3[0].affectedTime).toBe('10:00');
  });

  it('warns when ER block is in afternoon (14:00)', () => {
    const provider = makeProvider();
    const schedule = makeSchedule([
      makeSlot('14:00', 'p1', 'Emergency', 'er'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [erBT]);
    const rule3 = warnings.filter(w => w.ruleId === 'RULE_3_ER_MORNING_ONLY');
    expect(rule3).toHaveLength(1);
  });
});

// ─── Rule 4: Consecutive D-Time ───────────────────────────────────────────────

describe('Rule 4 — Consecutive D-time limit', () => {
  const crownBT = makeBlockType({ id: 'crown', label: 'Crown Prep', procedureCategory: 'MAJOR_RESTORATIVE', dTimeMin: 60, aTimeMin: 30 });

  it('passes when D-time run is ≤ 90 min', () => {
    const provider = makeProvider();
    const slots = [];
    // 9 slots of D-time = 90 min → should NOT warn
    for (let i = 0; i < 9; i++) {
      const h = Math.floor((8 * 60 + i * 10) / 60).toString().padStart(2, '0');
      const m = ((8 * 60 + i * 10) % 60).toString().padStart(2, '0');
      slots.push(makeSlot(`${h}:${m}`, 'p1', 'Crown Prep', 'crown', 'D'));
    }
    const schedule = makeSchedule(slots);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT]);
    const rule4 = warnings.filter(w => w.ruleId === 'RULE_4_CONSECUTIVE_D_TIME');
    expect(rule4).toHaveLength(0);
  });

  it('warns when D-time run exceeds 90 min', () => {
    const provider = makeProvider();
    const slots = [];
    // 12 slots of D-time = 120 min → should warn
    for (let i = 0; i < 12; i++) {
      const totalMin = 8 * 60 + i * 10;
      const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
      const m = (totalMin % 60).toString().padStart(2, '0');
      slots.push(makeSlot(`${h}:${m}`, 'p1', 'Crown Prep', 'crown', 'D'));
    }
    const schedule = makeSchedule(slots);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT]);
    const rule4 = warnings.filter(w => w.ruleId === 'RULE_4_CONSECUTIVE_D_TIME');
    expect(rule4.length).toBeGreaterThan(0);
    expect(rule4[0].severity).toBe('warning');
  });
});

// ─── Rule 5: Lunch Enforced ───────────────────────────────────────────────────

describe('Rule 5 — Lunch enforced', () => {
  const crownBT = makeBlockType({ id: 'crown', label: 'Crown Prep', procedureCategory: 'MAJOR_RESTORATIVE' });

  it('passes when no blocks overlap lunch window', () => {
    const provider = makeProvider({ lunchStart: '12:00', lunchEnd: '13:00' });
    const schedule = makeSchedule([
      makeSlot('11:00', 'p1', 'Crown Prep', 'crown'),
      makeSlot('13:00', 'p1', 'Crown Prep', 'crown'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT]);
    const rule5 = warnings.filter(w => w.ruleId === 'RULE_5_LUNCH_ENFORCED');
    expect(rule5).toHaveLength(0);
  });

  it('errors when a block is scheduled during lunch', () => {
    const provider = makeProvider({ lunchStart: '12:00', lunchEnd: '13:00' });
    const schedule = makeSchedule([
      makeSlot('12:00', 'p1', 'Crown Prep', 'crown'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [crownBT]);
    const rule5 = warnings.filter(w => w.ruleId === 'RULE_5_LUNCH_ENFORCED');
    expect(rule5).toHaveLength(1);
    expect(rule5[0].severity).toBe('error');
  });
});

// ─── Rule 6: Hygienist D-time Offset ─────────────────────────────────────────

describe('Rule 6 — Hygienist D-time offset ≥ 20', () => {
  it('passes when dTimeOffsetMin is ≥ 20', () => {
    const provider = makeHygienist();
    const hygBT = makeBlockType({
      id: 'hyg', label: 'Prophy', appliesToRole: 'HYGIENIST', procedureCategory: 'PERIODONTICS',
      dTimeMin: 15, dTimeOffsetMin: 25,
    });
    const schedule = makeSchedule([
      makeSlot('08:00', 'h1', 'Prophy', 'hyg', 'H'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [hygBT]);
    const rule6 = warnings.filter(w => w.ruleId === 'RULE_6_HYG_DTIME_OFFSET');
    expect(rule6).toHaveLength(0);
  });

  it('warns when dTimeOffsetMin is < 20', () => {
    const provider = makeHygienist();
    const hygBT = makeBlockType({
      id: 'hyg', label: 'Prophy', appliesToRole: 'HYGIENIST', procedureCategory: 'PERIODONTICS',
      dTimeMin: 15, dTimeOffsetMin: 10, // too early
    });
    const schedule = makeSchedule([
      makeSlot('08:00', 'h1', 'Prophy', 'hyg', 'H'),
    ]);
    const warnings = validateClinicalRules(schedule, [provider], [hygBT]);
    const rule6 = warnings.filter(w => w.ruleId === 'RULE_6_HYG_DTIME_OFFSET');
    expect(rule6).toHaveLength(1);
    expect(rule6[0].severity).toBe('warning');
  });
});

// ─── Integration: No schedule → no warnings ───────────────────────────────────

describe('Edge cases', () => {
  it('returns empty array for an empty schedule', () => {
    const schedule = makeSchedule([]);
    const warnings = validateClinicalRules(schedule, [makeProvider()], [makeBlockType()]);
    expect(warnings).toEqual([]);
  });

  it('handles multiple providers independently', () => {
    const doc = makeProvider({ id: 'p1', name: 'Dr. Smith', seesNewPatients: true });
    const hyg = makeHygienist({ id: 'h1', name: 'RDH Jones' });
    const crownBT = makeBlockType({ id: 'crown', label: 'Crown Prep', procedureCategory: 'MAJOR_RESTORATIVE' });
    const npBT = makeBlockType({ id: 'np', label: 'New Patient Exam', procedureCategory: 'NEW_PATIENT_DIAG', appliesToRole: 'BOTH' });

    // Dr. Smith has restorative but NO NP → rule 1 should warn for Dr. Smith only
    const schedule = makeSchedule([
      makeSlot('08:00', 'p1', 'Crown Prep', 'crown'),
      makeSlot('08:00', 'h1', 'Prophy', 'recall', 'H'),
    ]);
    const warnings = validateClinicalRules(schedule, [doc, hyg], [crownBT, npBT]);
    const rule1 = warnings.filter(w => w.ruleId === 'RULE_1_NP_FIRST');
    expect(rule1).toHaveLength(1);
    expect(rule1[0].affectedProvider).toBe('Dr. Smith');
  });
});
