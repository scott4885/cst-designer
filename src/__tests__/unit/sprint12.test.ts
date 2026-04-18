/**
 * Sprint 12 Tests
 * - Template cloning (provider role matching)
 * - Dashboard filter/sort logic
 * - Comparison stats
 * - Bulk goal update logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildProviderMapping,
  cloneDaySchedule,
  cloneTemplateToOffices,
  loadSchedulesFromStorage,
  saveSchedulesToStorage,
} from '@/lib/clone-template';
import { applyFilters, applySorting } from '@/app/page';
import type { ProviderInput, GenerationResult } from '@/lib/engine/types';
import type { OfficeData } from '@/lib/mock-data';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeProvider = (id: string, role: 'DOCTOR' | 'HYGIENIST', ops = ['OP1']): ProviderInput => ({
  id,
  name: `${role} ${id}`,
  role,
  operatories: ops,
  workingStart: '08:00',
  workingEnd: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  dailyGoal: role === 'DOCTOR' ? 5000 : 2500,
  color: '#000',
});

const makeSlot = (
  time: string,
  providerId: string,
  operatory = 'OP1',
  blockLabel = 'HP',
  blockTypeId = 'bt-1'
): GenerationResult['slots'][0] => ({
  time,
  providerId,
  operatory,
  staffingCode: null,
  blockTypeId,
  blockLabel,
  isBreak: false,
  blockInstanceId: null,
  customProductionAmount: null,
});

const makeSchedule = (slots: GenerationResult['slots']): GenerationResult => ({
  dayOfWeek: 'MONDAY',
  slots,
  productionSummary: [],
  warnings: [],
});

const makeOffice = (id: string, overrides: Partial<OfficeData> = {}): OfficeData => ({
  id,
  name: `Office ${id}`,
  dpmsSystem: 'DENTRIX',
  workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timeIncrement: 10,
  feeModel: 'UCR',
  providerCount: 2,
  totalDailyGoal: 7500,
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Clone Logic Tests ─────────────────────────────────────────────────────────

describe('buildProviderMapping', () => {
  it('maps single doctor to single doctor', () => {
    const src = [makeProvider('d1', 'DOCTOR')];
    const tgt = [makeProvider('d2', 'DOCTOR')];
    const mapping = buildProviderMapping(src, tgt);
    expect(mapping.get('d1')).toBe('d2');
  });

  it('maps multiple providers by role+index', () => {
    const src = [makeProvider('d1', 'DOCTOR'), makeProvider('h1', 'HYGIENIST'), makeProvider('h2', 'HYGIENIST')];
    const tgt = [makeProvider('D2', 'DOCTOR'), makeProvider('H2', 'HYGIENIST'), makeProvider('H3', 'HYGIENIST')];
    const mapping = buildProviderMapping(src, tgt);
    expect(mapping.get('d1')).toBe('D2');
    expect(mapping.get('h1')).toBe('H2');
    expect(mapping.get('h2')).toBe('H3');
  });

  it('returns null for unmatched source providers (more source than target)', () => {
    const src = [makeProvider('d1', 'DOCTOR'), makeProvider('d2', 'DOCTOR')];
    const tgt = [makeProvider('D1', 'DOCTOR')]; // only 1 doctor in target
    const mapping = buildProviderMapping(src, tgt);
    expect(mapping.get('d1')).toBe('D1');
    expect(mapping.get('d2')).toBeNull(); // no match
  });

  it('leaves extra target providers unmapped (more target than source)', () => {
    const src = [makeProvider('d1', 'DOCTOR')];
    const tgt = [makeProvider('D1', 'DOCTOR'), makeProvider('D2', 'DOCTOR')];
    const mapping = buildProviderMapping(src, tgt);
    expect(mapping.get('d1')).toBe('D1');
    // D2 in target is not in mapping (it's a target, not a source key)
    expect(mapping.size).toBe(1);
  });

  it('handles empty source and target', () => {
    const mapping = buildProviderMapping([], []);
    expect(mapping.size).toBe(0);
  });

  it('handles source with only doctors, target with only hygienists → all null', () => {
    const src = [makeProvider('d1', 'DOCTOR')];
    const tgt = [makeProvider('h1', 'HYGIENIST')];
    const mapping = buildProviderMapping(src, tgt);
    expect(mapping.get('d1')).toBeNull();
  });
});

describe('cloneDaySchedule', () => {
  it('remaps provider IDs by role', () => {
    const srcProviders = [makeProvider('d1', 'DOCTOR'), makeProvider('h1', 'HYGIENIST')];
    const tgtProviders = [makeProvider('D2', 'DOCTOR'), makeProvider('H2', 'HYGIENIST')];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('09:00', 'h1', 'HYG1'),
    ];
    const schedule = makeSchedule(slots);

    const { schedule: cloned, unmatchedSourceIds } = cloneDaySchedule(
      schedule,
      srcProviders,
      tgtProviders
    );

    expect(unmatchedSourceIds).toHaveLength(0);
    const slot0 = cloned.slots.find(s => s.time === '08:00');
    const slot1 = cloned.slots.find(s => s.time === '09:00');
    expect(slot0?.providerId).toBe('D2');
    expect(slot1?.providerId).toBe('H2');
  });

  it('reports unmatched source providers when target has fewer doctors', () => {
    const srcProviders = [makeProvider('d1', 'DOCTOR'), makeProvider('d2', 'DOCTOR')];
    const tgtProviders = [makeProvider('D1', 'DOCTOR')];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd2', 'OP2'),
    ];
    const { schedule: cloned, unmatchedSourceIds } = cloneDaySchedule(
      makeSchedule(slots),
      srcProviders,
      tgtProviders
    );
    expect(unmatchedSourceIds).toContain('d2');
    // Only d1's slot should appear
    expect(cloned.slots).toHaveLength(1);
    expect(cloned.slots[0].providerId).toBe('D1');
  });

  it('preserves block content (blockLabel, blockTypeId, isBreak)', () => {
    const srcProviders = [makeProvider('d1', 'DOCTOR')];
    const tgtProviders = [makeProvider('D1', 'DOCTOR')];
    const slot = makeSlot('08:00', 'd1', 'OP1', 'CROWN', 'bt-crown');
    const { schedule: cloned } = cloneDaySchedule(makeSchedule([slot]), srcProviders, tgtProviders);
    expect(cloned.slots[0].blockLabel).toBe('CROWN');
    expect(cloned.slots[0].blockTypeId).toBe('bt-crown');
  });

  it('maps operatory by index when target has different operatory names', () => {
    const srcProviders = [makeProvider('d1', 'DOCTOR', ['OP1', 'OP2'])];
    const tgtProviders = [makeProvider('D1', 'DOCTOR', ['A1', 'A2'])];
    const slots = [
      makeSlot('08:00', 'd1', 'OP1'),
      makeSlot('08:00', 'd1', 'OP2'),
    ];
    const { schedule: cloned } = cloneDaySchedule(makeSchedule(slots), srcProviders, tgtProviders);
    const times = cloned.slots.map(s => s.operatory);
    expect(times).toContain('A1');
    expect(times).toContain('A2');
  });

  it('preserves dayOfWeek from source', () => {
    const src = [makeProvider('d1', 'DOCTOR')];
    const tgt = [makeProvider('D1', 'DOCTOR')];
    const schedule: GenerationResult = { ...makeSchedule([makeSlot('08:00', 'd1')]), dayOfWeek: 'TUESDAY' };
    const { schedule: cloned } = cloneDaySchedule(schedule, src, tgt);
    expect(cloned.dayOfWeek).toBe('TUESDAY');
  });
});

describe('localStorage helpers', () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    });
  });

  it('returns empty object when nothing stored', () => {
    const schedules = loadSchedulesFromStorage('office-1');
    expect(schedules).toEqual({});
  });

  it('round-trips save/load', () => {
    const schedule = makeSchedule([makeSlot('08:00', 'd1')]);
    saveSchedulesToStorage('office-1', { MONDAY: schedule });
    const loaded = loadSchedulesFromStorage('office-1');
    expect(loaded.MONDAY).toBeDefined();
    expect(loaded.MONDAY.slots[0].time).toBe('08:00');
  });

  it('uses different keys for different weeks', () => {
    const schedA = makeSchedule([makeSlot('08:00', 'd1')]);
    const schedB = makeSchedule([makeSlot('09:00', 'd1')]);
    saveSchedulesToStorage('office-1', { MONDAY: schedA }, 'A');
    saveSchedulesToStorage('office-1', { MONDAY: schedB }, 'B');
    const loadedA = loadSchedulesFromStorage('office-1', 'A');
    const loadedB = loadSchedulesFromStorage('office-1', 'B');
    expect(loadedA.MONDAY.slots[0].time).toBe('08:00');
    expect(loadedB.MONDAY.slots[0].time).toBe('09:00');
  });
});

// ─── Iter 12a — cloneTemplateToOffices deep-clone isolation ───────────────────

describe('cloneTemplateToOffices — target office isolation (Iter 12a)', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    });
  });

  it('mutating one target office does not leak into another target office', () => {
    // Source office has a MONDAY schedule with one doctor block.
    const srcProviders = [makeProvider('d1', 'DOCTOR')];
    const srcSchedules: Record<string, GenerationResult> = {
      MONDAY: makeSchedule([makeSlot('08:00', 'd1', 'OP1', 'HP', 'bt-hp')]),
    };
    saveSchedulesToStorage('src-office', srcSchedules);

    const tgtA = {
      id: 'tgt-A',
      name: 'Office A',
      providers: [makeProvider('dA', 'DOCTOR')],
    };
    const tgtB = {
      id: 'tgt-B',
      name: 'Office B',
      providers: [makeProvider('dB', 'DOCTOR')],
    };

    const { results } = cloneTemplateToOffices(
      'src-office',
      srcProviders,
      [tgtA, tgtB],
      { days: ['MONDAY'], weeks: ['A'], cloneLibrary: false }
    );

    expect(results).toHaveLength(2);
    const resA = results.find(r => r.officeId === 'tgt-A')!;
    const resB = results.find(r => r.officeId === 'tgt-B')!;

    // Both offices got the MONDAY schedule with their own doctor id remapped.
    expect(resA.schedules.MONDAY.slots[0].providerId).toBe('dA');
    expect(resB.schedules.MONDAY.slots[0].providerId).toBe('dB');

    // Mutate Office A's cloned slot (the bug: mutation bleeds into Office B).
    resA.schedules.MONDAY.slots[0].blockLabel = 'MUTATED';

    // Office B must be unaffected.
    expect(resB.schedules.MONDAY.slots[0].blockLabel).toBe('HP');

    // And localStorage for Office B must still hold the unmutated value.
    const lsB = loadSchedulesFromStorage('tgt-B');
    expect(lsB.MONDAY.slots[0].blockLabel).toBe('HP');
  });

  it('mutating cloned result does not leak back into localStorage', () => {
    const srcProviders = [makeProvider('d1', 'DOCTOR')];
    const srcSchedules: Record<string, GenerationResult> = {
      MONDAY: makeSchedule([makeSlot('08:00', 'd1', 'OP1', 'ORIGINAL', 'bt-hp')]),
    };
    saveSchedulesToStorage('src-office', srcSchedules);

    const tgtA = {
      id: 'tgt-A',
      name: 'Office A',
      providers: [makeProvider('dA', 'DOCTOR')],
    };

    const { results } = cloneTemplateToOffices(
      'src-office',
      srcProviders,
      [tgtA],
      { days: ['MONDAY'], weeks: ['A'], cloneLibrary: false }
    );

    // Mutate the in-memory result aggressively.
    results[0].schedules.MONDAY.slots[0].blockLabel = 'CORRUPTED';
    results[0].schedules.MONDAY.slots.push(makeSlot('09:00', 'dA', 'OP1', 'INJECTED'));

    // localStorage must still have the clean, pristine clone.
    const persisted = loadSchedulesFromStorage('tgt-A');
    expect(persisted.MONDAY.slots).toHaveLength(1);
    expect(persisted.MONDAY.slots[0].blockLabel).toBe('ORIGINAL');
  });
});

// ─── Dashboard Filter/Sort Tests ───────────────────────────────────────────────

describe('applyFilters', () => {
  const offices: OfficeData[] = [
    makeOffice('1', { name: 'Alpha Dental', dpmsSystem: 'DENTRIX', providerCount: 2, workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
    makeOffice('2', { name: 'Beta Smiles', dpmsSystem: 'OPEN_DENTAL', providerCount: 4, workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'] }),
    makeOffice('3', { name: 'Gamma Care', dpmsSystem: 'EAGLESOFT', providerCount: 1, workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }),
  ];

  const noSchedules = new Map<string, boolean>();
  const scheduleMap = new Map([['1', true], ['2', false], ['3', true]]);

  const emptyFilters = {
    dpms: new Set<string>(),
    providerCount: 'all' as const,
    scheduleStatus: 'all' as const,
    qualityRange: 'all' as const,
    daysPerWeek: 'all' as const,
  };

  it('returns all offices with no filters', () => {
    const result = applyFilters(offices, '', emptyFilters, noSchedules);
    expect(result).toHaveLength(3);
  });

  it('filters by name search', () => {
    const result = applyFilters(offices, 'alpha', emptyFilters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by DPMS system search', () => {
    const result = applyFilters(offices, 'eaglesoft', emptyFilters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('filters by DPMS checkbox', () => {
    const filters = { ...emptyFilters, dpms: new Set(['DENTRIX']) };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by provider count 2-3', () => {
    const filters = { ...emptyFilters, providerCount: '2-3' as const };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by provider count 4+', () => {
    const filters = { ...emptyFilters, providerCount: '4+' as const };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by provider count 0-1', () => {
    const filters = { ...emptyFilters, providerCount: '0-1' as const };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('filters by schedule status has-schedule', () => {
    const filters = { ...emptyFilters, scheduleStatus: 'has-schedule' as const };
    const result = applyFilters(offices, '', filters, scheduleMap);
    expect(result.map(o => o.id)).toEqual(['1', '3']);
  });

  it('filters by schedule status no-schedule', () => {
    const filters = { ...emptyFilters, scheduleStatus: 'no-schedule' as const };
    const result = applyFilters(offices, '', filters, scheduleMap);
    expect(result.map(o => o.id)).toEqual(['2']);
  });

  it('filters by days per week 4', () => {
    const filters = { ...emptyFilters, daysPerWeek: '4' as const };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filters by days per week 5', () => {
    const filters = { ...emptyFilters, daysPerWeek: '5' as const };
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result.map(o => o.id)).toEqual(['1', '3']);
  });

  it('combines multiple filters (AND logic)', () => {
    const filters = {
      ...emptyFilters,
      dpms: new Set(['OPEN_DENTAL', 'EAGLESOFT']),
      providerCount: '4+' as const,
    };
    // Only beta (OPEN_DENTAL, 4 providers) matches both
    const result = applyFilters(offices, '', filters, noSchedules);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });
});

describe('applySorting', () => {
  const offices: OfficeData[] = [
    makeOffice('c', { name: 'Zeta Dental', totalDailyGoal: 5000, updatedAt: '2024-01-01T00:00:00Z' }),
    makeOffice('a', { name: 'Alpha Care', totalDailyGoal: 15000, updatedAt: '2024-03-01T00:00:00Z' }),
    makeOffice('b', { name: 'Beta Smiles', totalDailyGoal: 10000, updatedAt: '2024-02-01T00:00:00Z' }),
  ];

  it('sorts by name A-Z', () => {
    const sorted = applySorting(offices, 'name-asc');
    expect(sorted.map(o => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by production goal high to low', () => {
    const sorted = applySorting(offices, 'goal-desc');
    expect(sorted.map(o => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by last updated newest first', () => {
    const sorted = applySorting(offices, 'updated-desc');
    expect(sorted.map(o => o.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate input array', () => {
    const original = [...offices];
    applySorting(offices, 'goal-desc');
    expect(offices).toEqual(original);
  });
});
