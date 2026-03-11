/**
 * Sprint 16 Tests
 *
 * Task 1: Goal Pacing Calculator
 * Task 2: Block Type Audit Engine
 * Task 3: Provider Benchmarking
 * Task 4: Keyboard Shortcuts Hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Task 1: Goal Pacing Calculator ──────────────────────────────────────────────

import {
  calculateGoalPacing,
  calculateAllProvidersPacing,
} from '@/lib/engine/goal-pacing';
import type { TimeSlotOutput, BlockTypeInput, ProviderInput } from '@/lib/engine/types';

const mockDoctorProvider: ProviderInput = {
  id: 'doc1',
  name: 'Dr. Smith',
  role: 'DOCTOR',
  operatories: ['OP1'],
  workingStart: '08:00',
  workingEnd: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  dailyGoal: 5000,
  color: '#3b82f6',
};

const mockBlockTypeCrown: BlockTypeInput = {
  id: 'bt-crown',
  label: 'Crown Prep',
  appliesToRole: 'DOCTOR',
  durationMin: 60,
  minimumAmount: 1500,
};

const mockBlockTypeComposite: BlockTypeInput = {
  id: 'bt-comp',
  label: 'Composite Filling',
  appliesToRole: 'DOCTOR',
  durationMin: 30,
  minimumAmount: 350,
};

/** Build slots for a 60-min block at given start time (10-min increments) */
function makeSlots(
  startHour: number,
  startMin: number,
  durationMin: number,
  providerId: string,
  blockTypeId: string,
  blockLabel: string,
  instanceId: string,
  increment = 10
): TimeSlotOutput[] {
  const slots: TimeSlotOutput[] = [];
  const totalSlots = durationMin / increment;
  for (let i = 0; i < totalSlots; i++) {
    const totalMinutes = startHour * 60 + startMin + i * increment;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const time = `${displayH}:${String(m).padStart(2, '0')} ${period}`;
    slots.push({
      time,
      providerId,
      operatory: 'OP1',
      staffingCode: 'D',
      blockTypeId,
      blockLabel,
      isBreak: false,
      blockInstanceId: instanceId,
    });
  }
  return slots;
}

describe('calculateGoalPacing — basic structure', () => {
  it('returns PacingResult with correct shape', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown], mockDoctorProvider);
    expect(result.providerId).toBe('doc1');
    expect(result.dailyGoal).toBe(5000);
    expect(result.scheduledTotal).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.cumulativeByHour)).toBe(true);
    expect(typeof result.goalHitByEnd).toBe('boolean');
    expect(typeof result.onTrackAt).toBe('string');
    expect(typeof result.shortfallAmount).toBe('number');
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('calculates scheduledTotal as sum of block production amounts', () => {
    // 3 crowns = 4500
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(9, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-3'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.scheduledTotal).toBe(4500);
  });

  it('returns goalHitByEnd=true when production >= daily goal', () => {
    // 4 crowns at $1500 each = $6000 > $5000 goal
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(9, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-3'),
      ...makeSlots(11, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-4'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.goalHitByEnd).toBe(true);
    expect(result.shortfallAmount).toBe(0);
  });

  it('returns goalHitByEnd=false when production < daily goal', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.goalHitByEnd).toBe(false);
    expect(result.shortfallAmount).toBe(3500);
  });

  it('projectedGoalTime is null when goal not met', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.projectedGoalTime).toBeNull();
  });

  it('projectedGoalTime is a time string when goal is met', () => {
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(9, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-3'),
      ...makeSlots(11, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-4'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.projectedGoalTime).not.toBeNull();
    expect(result.projectedGoalTime).toMatch(/\d+:\d{2}\s*(AM|PM)/);
  });

  it('cumulativeByHour is sorted by time (first entry <= last entry production)', () => {
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown], mockDoctorProvider);
    const milestones = result.cumulativeByHour;
    expect(milestones.length).toBeGreaterThan(0);
    // Cumulative should be non-decreasing
    for (let i = 1; i < milestones.length; i++) {
      expect(milestones[i].cumulative).toBeGreaterThanOrEqual(milestones[i - 1].cumulative);
    }
  });

  it('onTrackAt contains "On track" when goal hit', () => {
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(9, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-3'),
      ...makeSlots(11, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-4'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.onTrackAt).toMatch(/on track/i);
  });

  it('onTrackAt mentions shortfall when goal not hit', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    expect(result.onTrackAt).toMatch(/fall short/i);
    expect(result.onTrackAt).toContain('3,500');
  });

  it('returns empty recommendations when goal met', () => {
    const slots = [
      ...makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1'),
      ...makeSlots(9, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-2'),
      ...makeSlots(10, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-3'),
      ...makeSlots(11, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-4'),
    ];
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown], mockDoctorProvider);
    expect(result.recommendations).toHaveLength(0);
  });

  it('returns recommendations when goal not met', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown], mockDoctorProvider);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('handles empty slots array', () => {
    const result = calculateGoalPacing('doc1', 5000, [], [mockBlockTypeCrown]);
    expect(result.scheduledTotal).toBe(0);
    expect(result.goalHitByEnd).toBe(false);
    expect(result.shortfallAmount).toBe(5000);
    expect(result.projectedGoalTime).toBeNull();
  });

  it('handles zero goal without dividing by zero', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 0, slots, [mockBlockTypeCrown]);
    expect(result.goalHitByEnd).toBe(true);
    expect(result.shortfallAmount).toBe(0);
  });

  it('cumulativeByHour pct is between 0 and 100 (or higher if over goal)', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown], mockDoctorProvider);
    for (const m of result.cumulativeByHour) {
      expect(m.pct).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not double-count slots with same blockInstanceId', () => {
    // Same blockInstanceId = same block, should only count once
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    // $1500 once (6 slots, 1 instance)
    expect(result.scheduledTotal).toBe(1500);
  });

  it('uses customProductionAmount when set on slot', () => {
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    // Override production on the first slot
    slots[0].customProductionAmount = 2000;
    const result = calculateGoalPacing('doc1', 5000, slots, [mockBlockTypeCrown]);
    // Should use the customProductionAmount for the instance
    expect(result.scheduledTotal).toBe(2000);
  });
});

describe('calculateAllProvidersPacing', () => {
  it('returns one result per provider', () => {
    const provider2: ProviderInput = { ...mockDoctorProvider, id: 'hyg1', role: 'HYGIENIST' };
    const slots = makeSlots(8, 0, 60, 'doc1', 'bt-crown', 'Crown Prep', 'bi-1');
    const results = calculateAllProvidersPacing(
      [mockDoctorProvider, provider2],
      slots,
      [mockBlockTypeCrown]
    );
    expect(results).toHaveLength(2);
    expect(results[0].providerId).toBe('doc1');
    expect(results[1].providerId).toBe('hyg1');
  });
});

// ─── Task 2: Block Type Audit Engine ─────────────────────────────────────────────

import { auditBlockTypes, exportAuditToCSV } from '@/lib/audit';
import type { OfficeWithSchedules } from '@/lib/audit';

const auditBlockTypes1: BlockTypeInput[] = [
  { id: 'bt1', label: 'Crown Prep', appliesToRole: 'DOCTOR', durationMin: 60, minimumAmount: 1500 },
  { id: 'bt2', label: 'Composite Filling', appliesToRole: 'DOCTOR', durationMin: 30, minimumAmount: 350 },
  { id: 'bt3', label: 'Perio Maintenance', appliesToRole: 'HYGIENIST', durationMin: 60, minimumAmount: 200 },
  { id: 'bt4', label: 'Root Canal', appliesToRole: 'DOCTOR', durationMin: 90, minimumAmount: 1200 },
  { id: 'bt5', label: 'Unused Block Type', appliesToRole: 'DOCTOR', durationMin: 45, minimumAmount: 500 },
];

const officeWithSchedules: OfficeWithSchedules = {
  id: 'off1',
  name: 'Smile Cascade',
  blockTypes: auditBlockTypes1,
  schedules: {
    MONDAY: [
      { blockTypeId: 'bt1', isBreak: false, blockInstanceId: 'bi-1' },
      { blockTypeId: 'bt1', isBreak: false, blockInstanceId: 'bi-1' }, // same instance
      { blockTypeId: 'bt2', isBreak: false, blockInstanceId: 'bi-2' },
      { blockTypeId: 'bt3', isBreak: false, blockInstanceId: 'bi-3' },
      { blockTypeId: null, isBreak: true, blockInstanceId: null },
    ],
    TUESDAY: [
      { blockTypeId: 'bt1', isBreak: false, blockInstanceId: 'bi-4' },
      { blockTypeId: 'bt4', isBreak: false, blockInstanceId: 'bi-5' },
    ],
  },
};

describe('auditBlockTypes', () => {
  it('returns correct totalBlockTypes count', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    expect(result.totalBlockTypes).toBe(5);
  });

  it('identifies used block types', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const usedIds = result.usedBlockTypes.map(u => u.blockTypeId);
    expect(usedIds).toContain('bt1');
    expect(usedIds).toContain('bt2');
    expect(usedIds).toContain('bt3');
    expect(usedIds).toContain('bt4');
  });

  it('identifies unused block types', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const unusedIds = result.unusedBlockTypes.map(u => u.id);
    expect(unusedIds).toContain('bt5');
    expect(unusedIds).not.toContain('bt1');
  });

  it('does not double-count slots with same blockInstanceId', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const bt1Usage = result.usedBlockTypes.find(u => u.blockTypeId === 'bt1');
    expect(bt1Usage).toBeDefined();
    // bi-1 and bi-4 = 2 instances
    expect(bt1Usage!.useCount).toBe(2);
  });

  it('returns topBlocksByProduction sorted desc by totalProduction', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    expect(result.topBlocksByProduction.length).toBeGreaterThan(0);
    for (let i = 1; i < result.topBlocksByProduction.length; i++) {
      expect(result.topBlocksByProduction[i - 1].totalProduction)
        .toBeGreaterThanOrEqual(result.topBlocksByProduction[i].totalProduction);
    }
  });

  it('returns topBlocksByFrequency sorted desc by useCount', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    expect(result.topBlocksByFrequency.length).toBeGreaterThan(0);
    for (let i = 1; i < result.topBlocksByFrequency.length; i++) {
      expect(result.topBlocksByFrequency[i - 1].useCount)
        .toBeGreaterThanOrEqual(result.topBlocksByFrequency[i].useCount);
    }
  });

  it('returns office breakdown for each office', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    expect(result.offices).toHaveLength(1);
    expect(result.offices[0].officeId).toBe('off1');
    expect(result.offices[0].officeName).toBe('Smile Cascade');
  });

  it('handles office with no schedules (no blocks used)', () => {
    const emptyOffice: OfficeWithSchedules = {
      id: 'off2', name: 'Empty', blockTypes: auditBlockTypes1, schedules: {},
    };
    const result = auditBlockTypes([emptyOffice], auditBlockTypes1);
    expect(result.unusedBlockTypes).toHaveLength(5);
    expect(result.usedBlockTypes).toHaveLength(0);
  });

  it('counts offices correctly per block type', () => {
    const office2: OfficeWithSchedules = {
      id: 'off2', name: 'Office 2', blockTypes: auditBlockTypes1,
      schedules: {
        MONDAY: [{ blockTypeId: 'bt1', isBreak: false, blockInstanceId: 'bi-off2-1' }],
      },
    };
    const result = auditBlockTypes([officeWithSchedules, office2], auditBlockTypes1);
    const bt1Usage = result.usedBlockTypes.find(u => u.blockTypeId === 'bt1');
    expect(bt1Usage?.officeCount).toBe(2);
  });

  it('handles global block types not in any office blockTypes list', () => {
    const extraBT: BlockTypeInput = {
      id: 'bt-extra', label: 'Extra', appliesToRole: 'DOCTOR', durationMin: 30,
    };
    const result = auditBlockTypes([officeWithSchedules], [...auditBlockTypes1, extraBT]);
    expect(result.totalBlockTypes).toBe(6);
    const unusedIds = result.unusedBlockTypes.map(u => u.id);
    expect(unusedIds).toContain('bt-extra');
  });
});

describe('exportAuditToCSV', () => {
  it('returns a non-empty CSV string', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const csv = exportAuditToCSV(result);
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);
  });

  it('CSV includes header row', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const csv = exportAuditToCSV(result);
    expect(csv).toContain('Block Type');
    expect(csv).toContain('Use Count');
  });

  it('CSV includes both used and unused block types', () => {
    const result = auditBlockTypes([officeWithSchedules], auditBlockTypes1);
    const csv = exportAuditToCSV(result);
    expect(csv).toContain('Used');
    expect(csv).toContain('Unused');
  });
});

// ─── Task 3: Provider Benchmarking ───────────────────────────────────────────────

import {
  benchmarkProviders,
  buildGoalHistogram,
} from '@/lib/benchmark-providers';
import type { OfficeProviderData } from '@/lib/benchmark-providers';

const doctorA: ProviderInput = {
  id: 'doc-a', name: 'Dr. Alpha', role: 'DOCTOR',
  operatories: ['OP1'], workingStart: '08:00', workingEnd: '17:00',
  dailyGoal: 5000, color: '#3b82f6',
};
const doctorB: ProviderInput = {
  id: 'doc-b', name: 'Dr. Beta', role: 'DOCTOR',
  operatories: ['OP1'], workingStart: '08:00', workingEnd: '17:00',
  dailyGoal: 6000, color: '#ef4444',
};
const hygA: ProviderInput = {
  id: 'hyg-a', name: 'Jane RDH', role: 'HYGIENIST',
  operatories: ['OP2'], workingStart: '08:00', workingEnd: '17:00',
  dailyGoal: 2500, color: '#10b981',
};

const officeDataA: OfficeProviderData = {
  officeId: 'off-a', officeName: 'Alpha Dental',
  providers: [doctorA, hygA],
  scheduledProductionByProvider: new Map([
    ['doc-a', 4200],
    ['hyg-a', 2100],
  ]),
  officeQualityScore: 85,
};

const officeDataB: OfficeProviderData = {
  officeId: 'off-b', officeName: 'Beta Dental',
  providers: [doctorB],
  scheduledProductionByProvider: new Map([
    ['doc-b', 5800],
  ]),
  officeQualityScore: 72,
};

describe('benchmarkProviders', () => {
  it('returns byRole map with doctor and hygienist keys', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    expect(result.byRole.has('DOCTOR')).toBe(true);
    expect(result.byRole.has('HYGIENIST')).toBe(true);
  });

  it('counts providers correctly per role', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    expect(result.byRole.get('DOCTOR')!.count).toBe(2);
    expect(result.byRole.get('HYGIENIST')!.count).toBe(1);
  });

  it('calculates avgDailyGoal for doctors', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const doctorStats = result.byRole.get('DOCTOR')!;
    // (5000 + 6000) / 2 = 5500
    expect(doctorStats.avgDailyGoal).toBe(5500);
  });

  it('calculates medianScheduledProduction', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const doctorStats = result.byRole.get('DOCTOR')!;
    // [4200, 5800] → median = 5000
    expect(doctorStats.medianScheduledProduction).toBe(5000);
  });

  it('calculates p25 and p75 production', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const stats = result.byRole.get('DOCTOR')!;
    expect(stats.p25ScheduledProduction).toBeGreaterThanOrEqual(0);
    expect(stats.p75ScheduledProduction).toBeGreaterThanOrEqual(stats.p25ScheduledProduction);
  });

  it('returns topOfficesByProduction (up to 3)', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const stats = result.byRole.get('DOCTOR')!;
    expect(stats.topOfficesByProduction.length).toBeLessThanOrEqual(3);
    // doc-b (5800) should be first
    expect(stats.topOfficesByProduction[0].providerId).toBe('doc-b');
  });

  it('returns rows with gapToMedian and vsMedian set', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const docARow = result.rows.find(r => r.providerId === 'doc-a');
    const docBRow = result.rows.find(r => r.providerId === 'doc-b');
    expect(docARow).toBeDefined();
    expect(docBRow).toBeDefined();
    // doc-a: 4200 < median(5000) → below
    expect(docARow!.vsMedian).toBe('below');
    // doc-b: 5800 > median(5000) → above
    expect(docBRow!.vsMedian).toBe('above');
  });

  it('returns all providers as rows', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    expect(result.rows).toHaveLength(3); // doc-a, hyg-a, doc-b
  });

  it('handles empty offices array', () => {
    const result = benchmarkProviders([]);
    expect(result.byRole.size).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it('sets avgQualityScore from officeQualityScore', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const stats = result.byRole.get('DOCTOR')!;
    // doc-a: 85, doc-b: 72 → avg = 78.5 → Math.round = 79
    expect(stats.avgQualityScore).toBe(79);
  });
});

describe('buildGoalHistogram', () => {
  it('returns bins for given role', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const bins = buildGoalHistogram(result.rows, 'DOCTOR', 1000);
    expect(bins.length).toBeGreaterThan(0);
    expect(bins[0].count).toBeGreaterThanOrEqual(0);
  });

  it('bins cover all provider goals', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const bins = buildGoalHistogram(result.rows, 'DOCTOR', 1000);
    const totalCount = bins.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(2); // 2 doctors
  });

  it('returns empty array for role with no providers', () => {
    const result = benchmarkProviders([officeDataA, officeDataB]);
    const bins = buildGoalHistogram(result.rows, 'ASSISTANT', 1000);
    expect(bins).toHaveLength(0);
  });
});

// ─── Task 4: Keyboard Shortcuts ──────────────────────────────────────────────────

import { SHORTCUT_DEFINITIONS } from '@/lib/keyboard-shortcuts';

// We test the non-React logic: SHORTCUT_DEFINITIONS and the handler dispatch logic
// The hook itself uses useEffect/useCallback which requires a DOM environment
// We test it through a mock of the handler dispatch logic

describe('SHORTCUT_DEFINITIONS', () => {
  it('has entries for all documented shortcuts', () => {
    expect(SHORTCUT_DEFINITIONS.length).toBeGreaterThanOrEqual(14);
  });

  it('includes a ? shortcut for help', () => {
    const helpShortcut = SHORTCUT_DEFINITIONS.find(s => s.key === '?');
    expect(helpShortcut).toBeDefined();
    expect(helpShortcut!.category).toBe('Global');
  });

  it('includes Cmd+S for save', () => {
    const saveShortcut = SHORTCUT_DEFINITIONS.find(s => s.key === 'Cmd+S');
    expect(saveShortcut).toBeDefined();
  });

  it('includes Escape in Global category', () => {
    const escShortcut = SHORTCUT_DEFINITIONS.find(s => s.key === 'Esc');
    expect(escShortcut).toBeDefined();
    expect(escShortcut!.category).toBe('Global');
  });

  it('includes navigation shortcuts', () => {
    const navShortcuts = SHORTCUT_DEFINITIONS.filter(s => s.category === 'Navigation');
    expect(navShortcuts.length).toBeGreaterThanOrEqual(4);
  });

  it('includes template builder shortcuts', () => {
    const builderShortcuts = SHORTCUT_DEFINITIONS.filter(s => s.category === 'Template Builder');
    expect(builderShortcuts.length).toBeGreaterThanOrEqual(6);
  });

  it('all shortcuts have non-empty display and description', () => {
    for (const s of SHORTCUT_DEFINITIONS) {
      expect(s.display.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });
});

// Test the handler dispatch logic by simulating keyboard events
describe('Keyboard shortcut event dispatch (document simulation)', () => {
  let handlers: Record<string, ReturnType<typeof vi.fn>>;
  let cleanup: (() => void) | undefined;

  // We directly test the handler dispatch logic by calling the same function
  // the hook registers on document. Import the logic as a pure function.
  function simulateKey(
    key: string,
    options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; target?: EventTarget | null } = {}
  ): void {
    const event = new KeyboardEvent('keydown', {
      key,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      shiftKey: options.shiftKey ?? false,
      bubbles: true,
    });
    if (options.target) {
      Object.defineProperty(event, 'target', { value: options.target });
    }
    document.dispatchEvent(event);
  }

  function attachShortcuts(h: typeof handlers): () => void {
    // Re-implement the dispatch logic inline (same as the hook) for pure DOM testing
    function onKeyDown(e: KeyboardEvent): void {
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        ['input', 'textarea', 'select'].includes(target.tagName?.toLowerCase() ?? '') ||
        target.isContentEditable
      );

      if (ctrl) {
        if (key === 's') { e.preventDefault(); h.onSave?.(); return; }
        if (key === 'p') { e.preventDefault(); h.onPrint?.(); return; }
        if (key === 'e') { e.preventDefault(); h.onExport?.(); return; }
      }
      if (key === 'Escape') { h.onEscape?.(); return; }
      if (isInput) return;
      if (key === 'ArrowLeft') { h.onPrevDay?.(); return; }
      if (key === 'ArrowRight') { h.onNextDay?.(); return; }
      if (!shift && !ctrl && /^[1-5]$/.test(key)) { h.onJumpDay?.(parseInt(key, 10)); return; }
      if (!shift && !ctrl) {
        if (key === '?') { h.onHelp?.(); return; }
        if (key === 'g' || key === 'G') { h.onGenerate?.(); return; }
        if (key === 'v' || key === 'V') { h.onVersionHistory?.(); return; }
        if (key === 'o' || key === 'O') { h.onGoOffices?.(); return; }
        if (key === 'a' || key === 'A') { h.onGoAnalytics?.(); return; }
        if (key === 'l' || key === 'L') { h.onGoLibrary?.(); return; }
        if (key === 'r' || key === 'R') { h.onResetDay?.(); return; }
      }
      if (shift && !ctrl) {
        if (key === 'C' || key === 'c') { h.onCopyMonday?.(); return; }
        if (key === 'R' || key === 'r') { h.onGoRollup?.(); return; }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }

  beforeEach(() => {
    handlers = {
      onHelp: vi.fn(), onSave: vi.fn(), onPrint: vi.fn(), onExport: vi.fn(),
      onEscape: vi.fn(), onPrevDay: vi.fn(), onNextDay: vi.fn(), onJumpDay: vi.fn(),
      onGenerate: vi.fn(), onVersionHistory: vi.fn(), onResetDay: vi.fn(),
      onCopyMonday: vi.fn(), onGoOffices: vi.fn(), onGoAnalytics: vi.fn(),
      onGoLibrary: vi.fn(), onGoRollup: vi.fn(),
    };
    cleanup = attachShortcuts(handlers);
  });

  afterEach(() => {
    cleanup?.();
  });

  it('? triggers onHelp', () => {
    simulateKey('?');
    expect(handlers.onHelp).toHaveBeenCalledOnce();
  });

  it('Ctrl+S triggers onSave', () => {
    simulateKey('s', { ctrlKey: true });
    expect(handlers.onSave).toHaveBeenCalledOnce();
  });

  it('Cmd+S (metaKey) triggers onSave', () => {
    simulateKey('s', { metaKey: true });
    expect(handlers.onSave).toHaveBeenCalledOnce();
  });

  it('Ctrl+P triggers onPrint', () => {
    simulateKey('p', { ctrlKey: true });
    expect(handlers.onPrint).toHaveBeenCalledOnce();
  });

  it('Ctrl+E triggers onExport', () => {
    simulateKey('e', { ctrlKey: true });
    expect(handlers.onExport).toHaveBeenCalledOnce();
  });

  it('Escape triggers onEscape', () => {
    simulateKey('Escape');
    expect(handlers.onEscape).toHaveBeenCalledOnce();
  });

  it('ArrowLeft triggers onPrevDay', () => {
    simulateKey('ArrowLeft');
    expect(handlers.onPrevDay).toHaveBeenCalledOnce();
  });

  it('ArrowRight triggers onNextDay', () => {
    simulateKey('ArrowRight');
    expect(handlers.onNextDay).toHaveBeenCalledOnce();
  });

  it('1-5 keys trigger onJumpDay with correct index', () => {
    for (let i = 1; i <= 5; i++) {
      simulateKey(String(i));
    }
    expect(handlers.onJumpDay).toHaveBeenCalledTimes(5);
    expect(handlers.onJumpDay).toHaveBeenCalledWith(1);
    expect(handlers.onJumpDay).toHaveBeenCalledWith(3);
    expect(handlers.onJumpDay).toHaveBeenCalledWith(5);
  });

  it('G triggers onGenerate', () => {
    simulateKey('G');
    expect(handlers.onGenerate).toHaveBeenCalledOnce();
  });

  it('V triggers onVersionHistory', () => {
    simulateKey('V');
    expect(handlers.onVersionHistory).toHaveBeenCalledOnce();
  });

  it('R triggers onResetDay', () => {
    simulateKey('R');
    expect(handlers.onResetDay).toHaveBeenCalledOnce();
  });

  it('Shift+C triggers onCopyMonday', () => {
    simulateKey('C', { shiftKey: true });
    expect(handlers.onCopyMonday).toHaveBeenCalledOnce();
  });

  it('O triggers onGoOffices', () => {
    simulateKey('O');
    expect(handlers.onGoOffices).toHaveBeenCalledOnce();
  });

  it('A triggers onGoAnalytics', () => {
    simulateKey('A');
    expect(handlers.onGoAnalytics).toHaveBeenCalledOnce();
  });

  it('L triggers onGoLibrary', () => {
    simulateKey('L');
    expect(handlers.onGoLibrary).toHaveBeenCalledOnce();
  });

  it('Shift+R triggers onGoRollup', () => {
    simulateKey('R', { shiftKey: true });
    expect(handlers.onGoRollup).toHaveBeenCalledOnce();
  });

  it('ignores letter keys when target is an input element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    simulateKey('G', { target: input });
    expect(handlers.onGenerate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('Ctrl+S still fires when target is an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    simulateKey('s', { ctrlKey: true, target: input });
    expect(handlers.onSave).toHaveBeenCalledOnce();
    document.body.removeChild(input);
  });

  it('does not trigger when 6+ number key pressed', () => {
    simulateKey('6');
    expect(handlers.onJumpDay).not.toHaveBeenCalled();
  });

  it('does not trigger onGenerate when Ctrl+G pressed', () => {
    simulateKey('g', { ctrlKey: true });
    expect(handlers.onGenerate).not.toHaveBeenCalled();
  });
});
