/**
 * Sprint 14 Tests
 *
 * Task 1: Analytics dashboard — org summary, quality distribution, goal achievement
 * Task 2: Multi-location production rollup & gap table, CSV export
 * Task 3: DPMS CSV import — ADA code mapping, Open Dental parser
 * Task 4: Treatment sequence templates — built-in sequences, step helpers
 */

import { describe, it, expect } from 'vitest';

// ─── Task 3: DPMS Import ──────────────────────────────────────────────────────

import {
  mapADACodeToCategory,
  parseOpenDentalCSV,
  parseDentrixCSV,
} from '@/lib/dpms-import';

describe('mapADACodeToCategory', () => {
  it('maps D0150 → NEW_PATIENT_DIAG', () => {
    expect(mapADACodeToCategory('D0150')).toBe('NEW_PATIENT_DIAG');
  });

  it('maps D0140 → EMERGENCY_ACCESS (limited exam)', () => {
    expect(mapADACodeToCategory('D0140')).toBe('EMERGENCY_ACCESS');
  });

  it('maps D2140 → BASIC_RESTORATIVE (amalgam filling)', () => {
    expect(mapADACodeToCategory('D2140')).toBe('BASIC_RESTORATIVE');
  });

  it('maps D2750 → MAJOR_RESTORATIVE (PFM crown)', () => {
    expect(mapADACodeToCategory('D2750')).toBe('MAJOR_RESTORATIVE');
  });

  it('maps D3330 → ENDODONTICS (molar RCT)', () => {
    expect(mapADACodeToCategory('D3330')).toBe('ENDODONTICS');
  });

  it('maps D4341 → PERIODONTICS (SRP per quad)', () => {
    expect(mapADACodeToCategory('D4341')).toBe('PERIODONTICS');
  });

  it('maps D5110 → PROSTHODONTICS (complete upper denture)', () => {
    expect(mapADACodeToCategory('D5110')).toBe('PROSTHODONTICS');
  });

  it('maps D6010 → MAJOR_RESTORATIVE (implant fixture)', () => {
    expect(mapADACodeToCategory('D6010')).toBe('MAJOR_RESTORATIVE');
  });

  it('maps D7140 → ORAL_SURGERY (simple extraction)', () => {
    expect(mapADACodeToCategory('D7140')).toBe('ORAL_SURGERY');
  });

  it('maps D9110 → EMERGENCY_ACCESS (palliative treatment)', () => {
    expect(mapADACodeToCategory('D9110')).toBe('EMERGENCY_ACCESS');
  });

  it('handles lowercase codes', () => {
    expect(mapADACodeToCategory('d2750')).toBe('MAJOR_RESTORATIVE');
  });

  it('handles codes with leading/trailing spaces', () => {
    expect(mapADACodeToCategory('  D3330  ')).toBe('ENDODONTICS');
  });

  it('returns BASIC_RESTORATIVE for unknown codes', () => {
    expect(mapADACodeToCategory('X9999')).toBe('BASIC_RESTORATIVE');
    expect(mapADACodeToCategory('')).toBe('BASIC_RESTORATIVE');
  });
});

describe('parseOpenDentalCSV', () => {
  const HEADER = 'ProcDate,Provider,ProcCode,Description,Qty,Fee,Production';

  it('parses an empty string', () => {
    const result = parseOpenDentalCSV('');
    expect(result.rowCount).toBe(0);
    expect(result.warnings).toContain('CSV file is empty');
    expect(result.totalProduction).toBe(0);
  });

  it('parses header-only CSV', () => {
    const result = parseOpenDentalCSV(HEADER);
    expect(result.rowCount).toBe(0);
    expect(result.totalProduction).toBe(0);
  });

  it('parses a simple 2-row CSV', () => {
    const csv = [
      HEADER,
      '2024-01-15,Dr. Smith,D2750,PFM Crown,1,1500.00,1500.00',
      '2024-01-15,Dr. Smith,D4341,SRP per Quad,2,250.00,500.00',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    expect(result.rowCount).toBe(2);
    expect(result.totalProduction).toBeCloseTo(2000, 0);
    expect(result.mix.MAJOR_RESTORATIVE).toBeCloseTo(75, 0);
    expect(result.mix.PERIODONTICS).toBeCloseTo(25, 0);
    expect(result.providerName).toBe('Dr. Smith');
  });

  it('handles dollar-sign formatted production values', () => {
    const csv = [
      HEADER,
      '2024-01-15,Dr. Smith,D2750,PFM Crown,1,"$1,500.00","$1,500.00"',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    expect(result.totalProduction).toBeCloseTo(1500, 0);
  });

  it('reports warnings for unrecognized procedure codes', () => {
    const csv = [
      HEADER,
      '2024-01-15,Dr. Smith,ZZZZ,Unknown,1,100.00,100.00',
      '2024-01-15,Dr. Smith,D2750,Crown,1,1500.00,1500.00',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('unrecognized');
  });

  it('mix percentages sum to 100', () => {
    const csv = [
      HEADER,
      '2024-01-15,Dr. Smith,D2750,Crown,1,1200.00,1200.00',
      '2024-01-15,Dr. Smith,D3330,RCT,1,900.00,900.00',
      '2024-01-15,Dr. Smith,D4341,SRP,1,300.00,300.00',
      '2024-01-15,Dr. Smith,D7140,Extraction,1,200.00,200.00',
      '2024-01-15,Dr. Smith,D0150,Comp Exam,1,100.00,100.00',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    const total = Object.values(result.mix).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it('captures date range', () => {
    const csv = [
      HEADER,
      '2024-01-10,Dr. Smith,D2750,Crown,1,1500.00,1500.00',
      '2024-01-20,Dr. Smith,D2750,Crown,1,1500.00,1500.00',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    expect(result.dateRange.from).toBe('2024-01-10');
    expect(result.dateRange.to).toBe('2024-01-20');
  });

  it('handles multiple providers', () => {
    const csv = [
      HEADER,
      '2024-01-15,Dr. Smith,D2750,Crown,1,1500.00,1500.00',
      '2024-01-15,Dr. Jones,D4341,SRP,1,300.00,300.00',
    ].join('\n');

    const result = parseOpenDentalCSV(csv);
    expect(result.providerName).toContain('2 Providers');
  });

  it('Dentrix stub returns empty result with warning', () => {
    const result = parseDentrixCSV('any,csv,data');
    expect(result.totalProduction).toBe(0);
    expect(result.rowCount).toBe(0);
    expect(result.warnings[0]).toContain('not yet implemented');
  });
});

// ─── Task 4: Treatment Sequences ──────────────────────────────────────────────

import {
  BUILT_IN_SEQUENCES,
  serializeSteps,
  deserializeSteps,
  getFirstStep,
  getFollowUpHints,
  type SequenceStep,
} from '@/lib/treatment-sequences';

describe('Built-in Sequences', () => {
  it('seeds exactly 5 built-in sequences', () => {
    expect(BUILT_IN_SEQUENCES).toHaveLength(5);
  });

  it('all sequences have required fields', () => {
    for (const seq of BUILT_IN_SEQUENCES) {
      expect(seq.id).toBeTruthy();
      expect(seq.name).toBeTruthy();
      expect(seq.description).toBeTruthy();
      expect(seq.isBuiltIn).toBe(true);
      expect(Array.isArray(seq.steps)).toBe(true);
      expect(seq.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('sequence names are unique', () => {
    const names = BUILT_IN_SEQUENCES.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('Crown Series has 2 steps with correct day offsets', () => {
    const crown = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-crown');
    expect(crown).toBeDefined();
    expect(crown!.steps).toHaveLength(2);
    expect(crown!.steps[0].dayOffset).toBe(0);
    expect(crown!.steps[1].dayOffset).toBe(14);
    expect(crown!.steps[1].label).toBe('Crown Seat');
  });

  it('New Patient Flow has 3 steps', () => {
    const np = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-new-patient');
    expect(np).toBeDefined();
    expect(np!.steps).toHaveLength(3);
  });

  it('Perio Treatment Series has 4 steps', () => {
    const perio = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-perio');
    expect(perio).toBeDefined();
    expect(perio!.steps).toHaveLength(4);
  });

  it('Implant Series has 3 steps', () => {
    const implant = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-implant');
    expect(implant).toBeDefined();
    expect(implant!.steps).toHaveLength(3);
  });

  it('Denture Series has 4 steps', () => {
    const denture = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-denture');
    expect(denture).toBeDefined();
    expect(denture!.steps).toHaveLength(4);
  });

  it('all steps have stepIndex matching their array position', () => {
    for (const seq of BUILT_IN_SEQUENCES) {
      seq.steps.forEach((step, i) => {
        expect(step.stepIndex).toBe(i);
      });
    }
  });

  it('step 0 always has dayOffset = 0', () => {
    for (const seq of BUILT_IN_SEQUENCES) {
      expect(seq.steps[0].dayOffset).toBe(0);
    }
  });
});

describe('serializeSteps / deserializeSteps', () => {
  it('round-trips a steps array', () => {
    const steps: SequenceStep[] = [
      { stepIndex: 0, label: 'Prep', category: 'MAJOR_RESTORATIVE', durationMin: 90, dayOffset: 0 },
      { stepIndex: 1, label: 'Seat', category: 'MAJOR_RESTORATIVE', durationMin: 30, dayOffset: 14 },
    ];
    const json = serializeSteps(steps);
    const back = deserializeSteps(json);
    expect(back).toEqual(steps);
  });

  it('deserializeSteps handles invalid JSON', () => {
    expect(deserializeSteps('not json')).toEqual([]);
    expect(deserializeSteps('')).toEqual([]);
  });

  it('deserializeSteps handles non-array JSON', () => {
    expect(deserializeSteps('{"not": "array"}')).toEqual([]);
  });
});

describe('getFirstStep', () => {
  it('returns step at index 0', () => {
    const crown = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-crown')!;
    const first = getFirstStep(crown);
    expect(first).not.toBeNull();
    expect(first!.stepIndex).toBe(0);
    expect(first!.label).toBe('Crown Prep');
  });

  it('returns null for empty steps', () => {
    const empty = { id: 'x', name: 'X', description: '', isBuiltIn: false, steps: [] };
    expect(getFirstStep(empty)).toBeNull();
  });
});

describe('getFollowUpHints', () => {
  it('returns hints only for steps after index 0', () => {
    const crown = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-crown')!;
    const hints = getFollowUpHints(crown);
    expect(hints).toHaveLength(1);
    expect(hints[0].step.stepIndex).toBe(1);
  });

  it('renders "~2 weeks out" for dayOffset 14', () => {
    const crown = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-crown')!;
    const hints = getFollowUpHints(crown);
    expect(hints[0].hint).toContain('2 week');
  });

  it('renders "~3 months out" for dayOffset ~90', () => {
    const implant = BUILT_IN_SEQUENCES.find(s => s.id === 'builtin-implant')!;
    const hints = getFollowUpHints(implant);
    // step 1 = 90 days = 3 months
    expect(hints[0].hint).toContain('month');
  });

  it('returns empty array for single-step sequence', () => {
    const single = { id: 'x', name: 'X', description: '', isBuiltIn: false, steps: [
      { stepIndex: 0, label: 'Single', category: 'BASIC_RESTORATIVE' as const, durationMin: 30, dayOffset: 0 }
    ]};
    expect(getFollowUpHints(single)).toHaveLength(0);
  });
});

// ─── Task 1 & 2: Analytics ────────────────────────────────────────────────────

import {
  computeOrgSummary,
  computeQualityDistribution,
  computeGoalAchievementByDay,
  computeScheduleStatusDonut,
  buildLeagueTable,
  buildProductionGapTable,
  exportGapTableToCSV,
  getScheduleStatus,
  type OfficeScheduleData,
} from '@/lib/analytics';
import type { OfficeData } from '@/lib/mock-data';

function makeOffice(overrides: Partial<OfficeData> = {}): OfficeData {
  return {
    id: 'office-1',
    name: 'Test Office',
    dpmsSystem: 'OPEN_DENTAL',
    workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    timeIncrement: 10,
    feeModel: 'UCR',
    providerCount: 2,
    totalDailyGoal: 10000,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeScheduleData(overrides: Partial<OfficeScheduleData> = {}): OfficeScheduleData {
  return {
    officeId: 'office-1',
    qualityScore: 85,
    scheduledDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    productionByDay: {
      MONDAY: 10000,
      TUESDAY: 9500,
      WEDNESDAY: 11000,
      THURSDAY: 9000,
      FRIDAY: 8500,
    },
    procedureMix: {},
    ...overrides,
  };
}

describe('getScheduleStatus', () => {
  it('returns not_started when no working days', () => {
    expect(getScheduleStatus([], [])).toBe('not_started');
  });

  it('returns not_started when scheduled days is empty', () => {
    expect(getScheduleStatus(['MONDAY', 'TUESDAY'], [])).toBe('not_started');
  });

  it('returns built when all working days scheduled', () => {
    expect(getScheduleStatus(['MONDAY', 'TUESDAY'], ['MONDAY', 'TUESDAY'])).toBe('built');
  });

  it('returns partial when some days scheduled', () => {
    expect(getScheduleStatus(['MONDAY', 'TUESDAY', 'WEDNESDAY'], ['MONDAY'])).toBe('partial');
  });
});

describe('computeOrgSummary', () => {
  it('computes totals for a single office with full schedule', () => {
    const offices = [makeOffice()];
    const data = makeScheduleData();
    const map = new Map<string, OfficeScheduleData>([['office-1', data]]);

    const summary = computeOrgSummary(offices, map);
    expect(summary.totalOffices).toBe(1);
    expect(summary.officesWithSchedules).toBe(1);
    expect(summary.averageQualityScore).toBe(85);
    expect(summary.totalWeeklyProduction).toBe(48000);
  });

  it('returns null averageQualityScore when no schedules exist', () => {
    const offices = [makeOffice()];
    const map = new Map<string, OfficeScheduleData>();
    const summary = computeOrgSummary(offices, map);
    expect(summary.averageQualityScore).toBeNull();
    expect(summary.officesWithSchedules).toBe(0);
    expect(summary.totalWeeklyProduction).toBe(0);
  });

  it('handles multiple offices', () => {
    const offices = [
      makeOffice({ id: 'o1', name: 'Office 1' }),
      makeOffice({ id: 'o2', name: 'Office 2' }),
    ];
    const data1 = makeScheduleData({ officeId: 'o1', qualityScore: 90 });
    const data2 = makeScheduleData({ officeId: 'o2', qualityScore: 80 });
    const map = new Map<string, OfficeScheduleData>([
      ['o1', data1],
      ['o2', data2],
    ]);

    const summary = computeOrgSummary(offices, map);
    expect(summary.totalOffices).toBe(2);
    expect(summary.officesWithSchedules).toBe(2);
    expect(summary.averageQualityScore).toBe(85);
  });
});

describe('computeQualityDistribution', () => {
  it('distributes offices into correct buckets', () => {
    const offices = [
      makeOffice({ id: 'o1' }),
      makeOffice({ id: 'o2' }),
      makeOffice({ id: 'o3' }),
      makeOffice({ id: 'o4' }),
    ];
    const map = new Map<string, OfficeScheduleData>([
      ['o1', makeScheduleData({ officeId: 'o1', qualityScore: 95 })],
      ['o2', makeScheduleData({ officeId: 'o2', qualityScore: 80 })],
      ['o3', makeScheduleData({ officeId: 'o3', qualityScore: 65 })],
      ['o4', makeScheduleData({ officeId: 'o4', qualityScore: 45 })],
    ]);

    const dist = computeQualityDistribution(offices, map);
    expect(dist[0].label).toBe('90–100');
    expect(dist[0].count).toBe(1);
    expect(dist[1].label).toBe('75–89');
    expect(dist[1].count).toBe(1);
    expect(dist[2].label).toBe('60–74');
    expect(dist[2].count).toBe(1);
    expect(dist[3].label).toBe('<60');
    expect(dist[3].count).toBe(1);
  });

  it('skips offices with no quality score', () => {
    const offices = [makeOffice()];
    const map = new Map<string, OfficeScheduleData>([
      ['office-1', makeScheduleData({ qualityScore: null })],
    ]);
    const dist = computeQualityDistribution(offices, map);
    const totalCount = dist.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(0);
  });
});

describe('computeScheduleStatusDonut', () => {
  it('counts statuses correctly', () => {
    const offices = [
      makeOffice({ id: 'o1' }),
      makeOffice({ id: 'o2' }),
      makeOffice({ id: 'o3' }),
    ];
    // o1: built (5/5 days), o2: partial (2/5 days), o3: not started
    const map = new Map<string, OfficeScheduleData>([
      ['o1', makeScheduleData({ officeId: 'o1', scheduledDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY'] })],
      ['o2', makeScheduleData({ officeId: 'o2', scheduledDays: ['MONDAY','TUESDAY'] })],
      // o3 has no data → not_started
    ]);

    const donut = computeScheduleStatusDonut(offices, map);
    expect(donut.built).toBe(1);
    expect(donut.partial).toBe(1);
    expect(donut.not_started).toBe(1);
  });
});

describe('buildLeagueTable', () => {
  it('builds rows for all offices', () => {
    const offices = [makeOffice()];
    const data = makeScheduleData();
    const map = new Map<string, OfficeScheduleData>([['office-1', data]]);
    const rows = buildLeagueTable(offices, map);

    expect(rows).toHaveLength(1);
    expect(rows[0].officeId).toBe('office-1');
    expect(rows[0].officeName).toBe('Test Office');
    expect(rows[0].qualityScore).toBe(85);
    expect(rows[0].daysScheduled).toBe(5);
    expect(rows[0].weeklyProduction).toBe(48000);
    expect(rows[0].status).toBe('built');
  });

  it('calculates gap correctly — over goal', () => {
    const offices = [makeOffice({ totalDailyGoal: 8000 })];
    const data = makeScheduleData(); // 48000 weekly
    const map = new Map<string, OfficeScheduleData>([['office-1', data]]);
    const rows = buildLeagueTable(offices, map);

    // gap = 48000 - (8000 * 5) = 48000 - 40000 = +8000
    expect(rows[0].gap).toBe(8000);
  });
});

describe('buildProductionGapTable', () => {
  it('builds production gap rows', () => {
    const offices = [makeOffice({ totalDailyGoal: 10000 })];
    const data = makeScheduleData({
      productionByDay: { MONDAY: 8000, TUESDAY: 9000, WEDNESDAY: 0, THURSDAY: 0, FRIDAY: 0 },
      scheduledDays: ['MONDAY', 'TUESDAY'],
    });
    const map = new Map<string, OfficeScheduleData>([['office-1', data]]);
    const rows = buildProductionGapTable(offices, map);

    expect(rows).toHaveLength(1);
    expect(rows[0].weeklyTotal).toBe(17000);
    // gap = 17000 - 10000*5 = -33000
    expect(rows[0].gap).toBe(-33000);
    expect(rows[0].status).toBe('partial');
  });
});

describe('exportGapTableToCSV', () => {
  it('exports correct header row', () => {
    const rows = buildProductionGapTable([makeOffice()], new Map());
    const csv = exportGapTableToCSV(rows);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('Office');
    expect(lines[0]).toContain('Goal/Day');
    expect(lines[0]).toContain('Weekly Total');
    expect(lines[0]).toContain('Gap');
    expect(lines[0]).toContain('Status');
  });

  it('exports one data row per office', () => {
    const offices = [
      makeOffice({ id: 'o1', name: 'Office 1' }),
      makeOffice({ id: 'o2', name: 'Office 2' }),
    ];
    const csv = exportGapTableToCSV(buildProductionGapTable(offices, new Map()));
    const lines = csv.split('\n').filter(l => l.trim());
    // 1 header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it('includes office name in output', () => {
    const offices = [makeOffice({ name: 'Smile Cascade' })];
    const csv = exportGapTableToCSV(buildProductionGapTable(offices, new Map()));
    expect(csv).toContain('Smile Cascade');
  });
});
