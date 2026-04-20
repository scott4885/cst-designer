/**
 * Golden tests for the pattern catalog.
 * Asserts the canonical per-slot staffing patterns extracted from 6 real practice
 * multi-column templates (see .rebuild-research/extracted-patterns.md).
 */

import { describe, it, expect } from 'vitest';
import { PATTERN_CATALOG, resolvePattern, derivePattern } from '../pattern-catalog';
import { placeBlockInSlots } from '../slot-helpers';
import type { BlockTypeInput, ProviderInput, TimeSlotOutput } from '../types';

const makeSlot = (i: number): TimeSlotOutput => ({
  time: `07:${String(i * 10).padStart(2, '0')}`,
  providerId: 'p1',
  operatory: 'OP1',
  staffingCode: null,
  blockTypeId: null,
  blockLabel: null,
  isBreak: false,
});

const makeProvider = (role: 'DOCTOR' | 'HYGIENIST' = 'DOCTOR'): ProviderInput => ({
  id: 'p1',
  name: 'Test',
  role,
  operatories: ['OP1'],
  workingStart: '07:00',
  workingEnd: '17:00',
  dailyGoal: 5000,
  color: '#000',
});

const makeBlockType = (label: string, role: 'DOCTOR' | 'HYGIENIST', duration: number): BlockTypeInput => ({
  id: `bt-${label}`,
  label,
  appliesToRole: role,
  durationMin: duration,
});

describe('PATTERN_CATALOG — real-template ground truth', () => {
  it('HP > $1800 is A-A-D-D-D-D-A-A (80 min)', () => {
    expect(PATTERN_CATALOG.HP.pattern).toEqual(['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A']);
    expect(PATTERN_CATALOG.HP.durationMin).toBe(80);
  });

  it('MP is A-D-D-A (40 min)', () => {
    expect(PATTERN_CATALOG.MP.pattern).toEqual(['A', 'D', 'D', 'A']);
    expect(PATTERN_CATALOG.MP.durationMin).toBe(40);
  });

  it('ER is A-D-A (30 min)', () => {
    expect(PATTERN_CATALOG.ER.pattern).toEqual(['A', 'D', 'A']);
    expect(PATTERN_CATALOG.ER.durationMin).toBe(30);
  });

  it('NON-PROD is A-A-A (30 min)', () => {
    expect(PATTERN_CATALOG.NON_PROD.pattern).toEqual(['A', 'A', 'A']);
  });

  it('NP (hygiene) is H-H-H-H-H-D-D-D-H (90 min, doctor exam at minute 50)', () => {
    expect(PATTERN_CATALOG.NP_HYG.pattern).toEqual(['H', 'H', 'H', 'H', 'H', 'D', 'D', 'D', 'H']);
    expect(PATTERN_CATALOG.NP_HYG.durationMin).toBe(90);
  });

  it('NP CONS (doctor) is A-D-D-A (40 min) — distinct from hygiene NP', () => {
    expect(PATTERN_CATALOG.NP_DOC.pattern).toEqual(['A', 'D', 'D', 'A']);
    expect(PATTERN_CATALOG.NP_DOC.durationMin).toBe(40);
    expect(PATTERN_CATALOG.NP_DOC.role).toBe('DOCTOR');
  });

  it('RC/PM is H-D-H-H-H-H (60 min, exam at minute 10)', () => {
    expect(PATTERN_CATALOG.RC_PM.pattern).toEqual(['H', 'D', 'H', 'H', 'H', 'H']);
  });

  it('SRP is all-H (60 min)', () => {
    expect(PATTERN_CATALOG.SRP.pattern).toEqual(['H', 'H', 'H', 'H', 'H', 'H']);
  });

  it('PM/GING is all-H (60 min)', () => {
    expect(PATTERN_CATALOG.PM_GING.pattern).toEqual(['H', 'H', 'H', 'H', 'H', 'H']);
  });
});

describe('resolvePattern — label + alias resolution', () => {
  it('resolves exact label match', () => {
    expect(resolvePattern('HP > $1800')?.pattern).toEqual(['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A']);
  });

  it('resolves case-insensitive', () => {
    expect(resolvePattern('er')?.pattern).toEqual(['A', 'D', 'A']);
  });

  it('resolves alias', () => {
    expect(resolvePattern('EMERGENCY')?.pattern).toEqual(['A', 'D', 'A']);
    expect(resolvePattern('CROWN')).toBeNull(); // no alias
  });

  it('fuzzy substring match', () => {
    expect(resolvePattern('HP RESTO 1500')?.label).toBe('HP > $1800');
  });

  it('returns null for unknown labels', () => {
    expect(resolvePattern(null)).toBeNull();
    expect(resolvePattern('')).toBeNull();
    expect(resolvePattern('ZZZ-UNKNOWN')).toBeNull();
  });
});

describe('derivePattern — fallback when catalog lookup fails', () => {
  it('all-H for any-length hygienist block', () => {
    expect(derivePattern('HYGIENIST', 4)).toEqual(['H', 'H', 'H', 'H']);
    expect(derivePattern('HYGIENIST', 9)).toEqual(Array(9).fill('H'));
  });

  it('A-D-A for 3-slot doctor block (matches ER)', () => {
    expect(derivePattern('DOCTOR', 3)).toEqual(['A', 'D', 'A']);
  });

  it('A-D-D-A for 4-slot doctor block (matches MP)', () => {
    expect(derivePattern('DOCTOR', 4)).toEqual(['A', 'D', 'D', 'A']);
  });

  it('A-A-D-D-D-D-A-A for 8-slot doctor block (matches HP)', () => {
    expect(derivePattern('DOCTOR', 8)).toEqual(['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A']);
  });
});

describe('placeBlockInSlots — end-to-end with real patterns', () => {
  it('places HP block with A-A-D-D-D-D-A-A (80min / 8 slots)', () => {
    const slots = Array.from({ length: 8 }, (_, i) => makeSlot(i));
    const bt = makeBlockType('HP > $1800', 'DOCTOR', 80);
    placeBlockInSlots(slots, [0, 1, 2, 3, 4, 5, 6, 7], bt, makeProvider('DOCTOR'));
    expect(slots.map((s) => s.staffingCode)).toEqual(['A', 'A', 'D', 'D', 'D', 'D', 'A', 'A']);
  });

  it('places MP block with A-D-D-A (40min / 4 slots)', () => {
    const slots = Array.from({ length: 4 }, (_, i) => makeSlot(i));
    const bt = makeBlockType('MP', 'DOCTOR', 40);
    placeBlockInSlots(slots, [0, 1, 2, 3], bt, makeProvider('DOCTOR'));
    expect(slots.map((s) => s.staffingCode)).toEqual(['A', 'D', 'D', 'A']);
  });

  it('places NP hygiene block with H-H-H-H-H-D-D-D-H (90min / 9 slots)', () => {
    const slots = Array.from({ length: 9 }, (_, i) => makeSlot(i));
    const bt: BlockTypeInput = {
      id: 'bt-np-hyg',
      label: 'NP>$300',
      appliesToRole: 'HYGIENIST',
      durationMin: 90,
      pattern: ['H', 'H', 'H', 'H', 'H', 'D', 'D', 'D', 'H'],
      isHygieneType: true,
    };
    placeBlockInSlots(slots, [0, 1, 2, 3, 4, 5, 6, 7, 8], bt, makeProvider('HYGIENIST'));
    expect(slots.map((s) => s.staffingCode)).toEqual(['H', 'H', 'H', 'H', 'H', 'D', 'D', 'D', 'H']);
  });

  it('places NON-PROD with A-A-A (no D-phase at all — correctly excludes middle D)', () => {
    const slots = Array.from({ length: 3 }, (_, i) => makeSlot(i));
    const bt = makeBlockType('NON-PROD', 'DOCTOR', 30);
    placeBlockInSlots(slots, [0, 1, 2], bt, makeProvider('DOCTOR'));
    expect(slots.map((s) => s.staffingCode)).toEqual(['A', 'A', 'A']);
  });
});
