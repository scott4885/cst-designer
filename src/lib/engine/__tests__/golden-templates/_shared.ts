/**
 * Sprint 3 — Shared fixture helpers for the 6 golden-template tests.
 *
 * These fixtures encode the ground truth from `.rebuild-research/extracted-patterns.md`
 * (6 real-practice templates). They are **not** circular golden files
 * (regenerate engine output → save output → diff output against itself) —
 * instead they are structural assertions about:
 *
 *   1. The expected block types, their x-segments, and their approximate counts.
 *   2. Engine invariants — zero HARD violations from the 15 anti-pattern guards.
 *   3. No doctor X-segment overlap across columns (Bible §4 — AP-1, AP-6).
 *   4. Hygiene exam windows fall inside the advertised `examWindowMin`.
 *
 * The extracted patterns are:
 *   - HP > $1800       A-A-D-D-D-D-A-A   80 min  (asstPre=20, doctor=40, asstPost=20)
 *   - MP               A-D-D-A           40 min  (asstPre=10, doctor=20, asstPost=10)
 *   - ER               A-D-A             30 min  (asstPre=10, doctor=10, asstPost=10)
 *   - PM/GING>$150     H-H-H-H-H-H       60 min  (asstPre=60, doctor=0,  asstPost=0)
 *   - NP>$300          H-H-H-H-H-D-D-D-H 90 min  (asstPre=50, doctor=30, asstPost=10)
 *   - RC/PM > $130     H-D-H-H-H-H       60 min  (asstPre=10, doctor=10, asstPost=40)  (modal)
 *   - SRP>$400         H-H-H-H-H-H       60 min  (asstPre=60, doctor=0,  asstPost=0)
 *   - NON-PROD         A-A-A             30 min  (asstPre=30, doctor=0,  asstPost=0)
 */

import type {
  BlockTypeInput,
  ProviderInput,
  ScheduleRules,
} from '../../types';

/** Canonical block-type library drawn from the extracted patterns table. */
export function smileBlockTypes(): BlockTypeInput[] {
  return [
    {
      id: 'HP',
      label: 'HP > $1800',
      appliesToRole: 'DOCTOR',
      durationMin: 80,
      minimumAmount: 1800,
      procedureCategory: 'MAJOR_RESTORATIVE',
      xSegment: { asstPreMin: 20, doctorMin: 40, asstPostMin: 20 },
    },
    {
      id: 'MP',
      label: 'MP',
      appliesToRole: 'DOCTOR',
      durationMin: 40,
      minimumAmount: 600,
      procedureCategory: 'BASIC_RESTORATIVE',
      xSegment: { asstPreMin: 10, doctorMin: 20, asstPostMin: 10 },
    },
    {
      id: 'ER',
      label: 'ER',
      appliesToRole: 'DOCTOR',
      durationMin: 30,
      minimumAmount: 250,
      procedureCategory: 'EMERGENCY_ACCESS',
      xSegment: { asstPreMin: 10, doctorMin: 10, asstPostMin: 10 },
    },
    {
      id: 'NONPROD',
      label: 'NON-PROD',
      appliesToRole: 'DOCTOR',
      durationMin: 30,
      minimumAmount: 0,
      procedureCategory: 'BASIC_RESTORATIVE',
      xSegment: { asstPreMin: 30, doctorMin: 0, asstPostMin: 0 },
    },
    {
      id: 'PMGING',
      label: 'PM/GING>$150',
      appliesToRole: 'HYGIENIST',
      durationMin: 60,
      minimumAmount: 150,
      isHygieneType: true,
      procedureCategory: 'PERIODONTICS',
      xSegment: { asstPreMin: 60, doctorMin: 0, asstPostMin: 0 },
    },
    {
      id: 'NP',
      label: 'NP>$300',
      appliesToRole: 'HYGIENIST',
      durationMin: 90,
      minimumAmount: 300,
      isHygieneType: true,
      procedureCategory: 'NEW_PATIENT_DIAG',
      xSegment: {
        asstPreMin: 50,
        doctorMin: 30,
        asstPostMin: 10,
        examWindowMin: { earliestUnitIdx: 5, latestUnitIdx: 7 },
      },
    },
    {
      id: 'RCPM',
      label: 'RC/PM > $130',
      appliesToRole: 'HYGIENIST',
      durationMin: 60,
      minimumAmount: 130,
      isHygieneType: true,
      procedureCategory: 'PERIODONTICS',
      xSegment: {
        asstPreMin: 10,
        doctorMin: 10,
        asstPostMin: 40,
        examWindowMin: { earliestUnitIdx: 0, latestUnitIdx: 3 },
      },
    },
    {
      id: 'SRP',
      label: 'SRP>$400',
      appliesToRole: 'HYGIENIST',
      durationMin: 60,
      minimumAmount: 400,
      isHygieneType: true,
      procedureCategory: 'PERIODONTICS',
      xSegment: { asstPreMin: 60, doctorMin: 0, asstPostMin: 0 },
    },
  ];
}

/** Two-doctor, 4-room, 3-RDH practice mirroring SMILE NM. */
export function smileNmProviders(): ProviderInput[] {
  return [
    {
      id: 'DR_HALL',
      name: 'Dr Hall',
      role: 'DOCTOR',
      operatories: ['R1', 'R2'],
      workingStart: '07:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 10000,
      color: '#1E88E5',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'DR_BORST',
      name: 'Dr Borst',
      role: 'DOCTOR',
      operatories: ['R3', 'R4'],
      workingStart: '07:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 8000,
      color: '#43A047',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG2',
      name: 'RDH Amanda',
      role: 'HYGIENIST',
      operatories: ['H2'],
      workingStart: '07:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 2000,
      color: '#FB8C00',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG3',
      name: 'RDH Megan',
      role: 'HYGIENIST',
      operatories: ['H3'],
      workingStart: '07:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 1800,
      color: '#8E24AA',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG4',
      name: 'RDH Alexa',
      role: 'HYGIENIST',
      operatories: ['H4'],
      workingStart: '07:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 1700,
      color: '#E53935',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  ];
}

/** Single-doctor (Fitzpatrick) 2-op + 3 RDH — Smile Cascade Monday. */
export function smileCascadeProviders(): ProviderInput[] {
  return [
    {
      id: 'DR_FITZ',
      name: 'Dr Fitzpatrick',
      role: 'DOCTOR',
      operatories: ['OP8', 'OP9'],
      workingStart: '08:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 5000,
      color: '#1E88E5',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG_OP1',
      name: 'RDH OP1',
      role: 'HYGIENIST',
      operatories: ['OP1'],
      workingStart: '08:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 1800,
      color: '#FB8C00',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG_OP2',
      name: 'RDH OP2',
      role: 'HYGIENIST',
      operatories: ['OP2'],
      workingStart: '08:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 1800,
      color: '#8E24AA',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
    {
      id: 'HYG_OP3',
      name: 'RDH OP3',
      role: 'HYGIENIST',
      operatories: ['OP3'],
      workingStart: '08:00',
      workingEnd: '17:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      lunchEnabled: true,
      dailyGoal: 1600,
      color: '#E53935',
      seesNewPatients: true,
      dayOfWeekRoster: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    },
  ];
}

export function rulesDefaults(): ScheduleRules {
  return {
    npModel: 'HYGIENIST_ONLY',
    npBlocksPerDay: 4,
    srpBlocksPerDay: 2,
    hpPlacement: 'ANY',
    doubleBooking: true,
    matrixing: true,
    emergencyHandling: 'ACCESS_BLOCKS',
  };
}

/**
 * Expected block-count tolerances per day. The engine is deterministic but
 * not byte-reproducible against the Excel source (the 5x "A-A-D-D-D-D-A-A-A-D-A-A"
 * variant is an engine-intractable edit), so we assert ranges rather than
 * exact counts.
 */
export interface ExpectedCounts {
  /** Min/max HP blocks in the full day (across all doctor ops). */
  hpMin: number;
  hpMax: number;
  /** Hygiene blocks should saturate the RDH columns. */
  hygMin: number;
  /** Total blocks across the schedule. */
  blocksMin: number;
  blocksMax: number;
  /**
   * Sprint 4 (P0-2) — per-AP HARD-violation ceiling map. Replaces the
   * previous global `hardCeiling` so that a regression in AP-1 cannot
   * hide behind unchanged AP-8/15 counts. Keys are AP-N labels ('AP-1',
   * 'AP-6', etc.). A missing key is treated as "ceiling = 0" — i.e. any
   * HARD violation under an unlisted AP fails the test.
   *
   * Tracking this per-AP also lets a future regression in AP-15 surface
   * as a named failure (`AP-15: 1 > 0`) rather than a total-count inflation.
   */
  knownHardDebt: Partial<Record<string, number>>;
  /**
   * @deprecated Sprint 4 P0-2: use `knownHardDebt` instead. Retained for
   * a one-sprint backward-compat window; fixtures should migrate. When
   * BOTH fields are set, `knownHardDebt` wins and `hardCeiling` is ignored.
   */
  hardCeiling?: number;
}
