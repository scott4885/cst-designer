/**
 * Sprint 15 Tests
 *
 * Task 1: Multi-provider scheduling matrix helpers
 * Task 2: Patient flow simulation engine (Monte Carlo)
 * Task 3: Weekly schedule report page helpers
 * Task 4: In-app notification store
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ─── Task 1: Matrix Helpers ───────────────────────────────────────────────────

import { buildMatrixData, parseTimeToMinutes, abbreviateLabel } from '@/lib/matrix-helpers';
import type { GenerationResult, ProviderInput, BlockTypeInput } from '@/lib/engine/types';

const mockProvider1: ProviderInput = {
  id: 'p1', name: 'Dr. Smith', role: 'DOCTOR',
  operatories: ['OP1'], workingStart: '08:00', workingEnd: '17:00',
  dailyGoal: 5000, color: '#3b82f6',
};
const mockProvider2: ProviderInput = {
  id: 'p2', name: 'Jane Hyg', role: 'HYGIENIST',
  operatories: ['OP2'], workingStart: '08:00', workingEnd: '17:00',
  dailyGoal: 2000, color: '#10b981',
};

const mockBlockType: BlockTypeInput = {
  id: 'bt1', label: 'Crown Prep', appliesToRole: 'DOCTOR',
  durationMin: 60, color: '#f59e0b',
};

const mockSchedule: GenerationResult = {
  dayOfWeek: 'MONDAY',
  slots: [
    { time: '8:00 AM', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: 'bi1' },
    { time: '8:10 AM', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: 'bi1' },
    { time: '12:00 PM', providerId: 'p1', operatory: 'OP1', staffingCode: null, blockTypeId: null, blockLabel: 'LUNCH', isBreak: true, blockInstanceId: null },
    { time: '12:00 PM', providerId: 'p2', operatory: 'OP2', staffingCode: null, blockTypeId: null, blockLabel: 'LUNCH', isBreak: true, blockInstanceId: null },
  ],
  productionSummary: [
    { providerId: 'p1', providerName: 'Dr. Smith', dailyGoal: 5000, target75: 3750, actualScheduled: 1800, status: 'UNDER', blocks: [] },
    { providerId: 'p2', providerName: 'Jane Hyg', dailyGoal: 2000, target75: 1500, actualScheduled: 900, status: 'UNDER', blocks: [] },
  ],
  warnings: [],
};

describe('buildMatrixData', () => {
  it('returns provider headers for each provider', () => {
    const matrix = buildMatrixData(mockSchedule, [mockProvider1, mockProvider2], [mockBlockType]);
    expect(matrix.providerHeaders).toHaveLength(2);
    expect(matrix.providerHeaders[0].providerName).toBe('Dr. Smith');
    expect(matrix.providerHeaders[1].providerName).toBe('Jane Hyg');
  });

  it('calculates fill percent from production vs goal', () => {
    const matrix = buildMatrixData(mockSchedule, [mockProvider1], [mockBlockType]);
    const header = matrix.providerHeaders[0];
    expect(header.scheduledProduction).toBe(1800);
    expect(header.dailyGoal).toBe(5000);
    expect(header.fillPercent).toBe(36); // 1800/5000 = 36%
  });

  it('marks lunch rows as isLunch=true when all providers are on break', () => {
    const matrix = buildMatrixData(mockSchedule, [mockProvider1, mockProvider2], [mockBlockType]);
    const lunchRow = matrix.rows.find(r => r.time === '12:00 PM');
    expect(lunchRow?.isLunch).toBe(true);
  });

  it('builds cells for each time slot x provider combination', () => {
    const matrix = buildMatrixData(mockSchedule, [mockProvider1, mockProvider2], [mockBlockType]);
    const firstRow = matrix.rows.find(r => r.time === '8:00 AM');
    expect(firstRow).toBeDefined();
    expect(firstRow!.cells).toHaveLength(2);
    expect(firstRow!.cells[0].blockLabel).toBe('Crown Prep');
    expect(firstRow!.cells[0].staffingCode).toBe('D');
  });

  it('includes timeSlots list in sorted order', () => {
    const matrix = buildMatrixData(mockSchedule, [mockProvider1, mockProvider2], [mockBlockType]);
    expect(matrix.timeSlots.length).toBeGreaterThan(0);
    // 8:00 AM should come before 12:00 PM
    const t1 = matrix.timeSlots.indexOf('8:00 AM');
    const t2 = matrix.timeSlots.indexOf('12:00 PM');
    expect(t1).toBeLessThan(t2);
  });
});

describe('parseTimeToMinutes', () => {
  it('parses HH:MM format', () => {
    expect(parseTimeToMinutes('08:00')).toBe(480);
    expect(parseTimeToMinutes('17:00')).toBe(1020);
  });

  it('parses H:MM AM/PM format', () => {
    expect(parseTimeToMinutes('8:00 AM')).toBe(480);
    expect(parseTimeToMinutes('12:00 PM')).toBe(720);
    expect(parseTimeToMinutes('5:00 PM')).toBe(1020);
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
  });
});

describe('abbreviateLabel', () => {
  it('returns short labels unchanged', () => {
    expect(abbreviateLabel('Crown')).toBe('Crown');
    expect(abbreviateLabel('LUNCH')).toBe('LUNCH');
  });

  it('abbreviates long multi-word labels to initials', () => {
    const result = abbreviateLabel('Crown Prep', 8);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('truncates very long single-word labels', () => {
    const result = abbreviateLabel('Compositefillingprocedure', 8);
    expect(result.length).toBeLessThanOrEqual(8);
  });
});

// ─── Task 2: Patient Flow Simulation ─────────────────────────────────────────

import {
  simulatePatientFlow,
  simulateAllProviders,
  SeededRandom,
} from '@/lib/engine/simulate-patient-flow';

const simulationSchedule: GenerationResult = {
  dayOfWeek: 'MONDAY',
  slots: [
    // Dr. Smith: Crown Prep block (60 min = 6 × 10min slots)
    ...Array.from({ length: 6 }, (_, i) => ({
      time: `8:${String(i * 10).padStart(2, '0')} AM`,
      providerId: 'p1',
      operatory: 'OP1',
      staffingCode: 'D' as const,
      blockTypeId: 'bt1',
      blockLabel: 'Crown Prep',
      isBreak: false,
      blockInstanceId: 'bi-crown',
    })),
    // Dr. Smith: NP Exam block (30 min = 3 × 10min slots)
    ...Array.from({ length: 3 }, (_, i) => ({
      time: `9:${String(i * 10).padStart(2, '0')} AM`,
      providerId: 'p1',
      operatory: 'OP1',
      staffingCode: 'D' as const,
      blockTypeId: 'bt2',
      blockLabel: 'NP Exam',
      isBreak: false,
      blockInstanceId: 'bi-np',
    })),
  ],
  productionSummary: [
    { providerId: 'p1', providerName: 'Dr. Smith', dailyGoal: 5000, target75: 3750, actualScheduled: 1800, status: 'UNDER', blocks: [] },
  ],
  warnings: [],
};

describe('simulatePatientFlow', () => {
  it('returns a result with expected structure', () => {
    const rng = new SeededRandom(42);
    const result = simulatePatientFlow('p1', 'Dr. Smith', simulationSchedule, 10, 100, rng);
    expect(result).toMatchObject({
      providerId: 'p1',
      providerName: 'Dr. Smith',
    });
    expect(result.expectedPatients).toBeGreaterThan(0);
    expect(result.p50EndTime).toMatch(/\d+:\d{2}\s*(AM|PM)/);
    expect(result.p90EndTime).toMatch(/\d+:\d{2}\s*(AM|PM)/);
  });

  it('P90 >= P50 always', () => {
    const rng = new SeededRandom(42);
    const result = simulatePatientFlow('p1', 'Dr. Smith', simulationSchedule, 10, 100, rng);
    // Parse and compare
    const p50min = parseTimeToMinutes(result.p50EndTime);
    const p90min = parseTimeToMinutes(result.p90EndTime);
    expect(p90min).toBeGreaterThanOrEqual(p50min);
  });

  it('is deterministic with same seed', () => {
    const r1 = simulatePatientFlow('p1', 'Dr. Smith', simulationSchedule, 10, 100, new SeededRandom(99));
    const r2 = simulatePatientFlow('p1', 'Dr. Smith', simulationSchedule, 10, 100, new SeededRandom(99));
    expect(r1.p50EndTime).toBe(r2.p50EndTime);
    expect(r1.p90EndTime).toBe(r2.p90EndTime);
  });

  it('returns zeroed result for a provider with no blocks', () => {
    const emptySchedule: GenerationResult = {
      ...simulationSchedule,
      slots: [],
      productionSummary: [],
    };
    const rng = new SeededRandom(42);
    const result = simulatePatientFlow('p1', 'Dr. Smith', emptySchedule, 10, 100, rng);
    expect(result.expectedPatients).toBe(0);
  });

  it('identifies a bottleneck for high-variance blocks', () => {
    const rng = new SeededRandom(42);
    const result = simulatePatientFlow('p1', 'Dr. Smith', simulationSchedule, 10, 100, rng);
    // Crown Prep has high variance (±15 min) so bottleneck should be set
    expect(result.bottleneck).not.toBeNull();
  });
});

describe('SeededRandom', () => {
  it('produces values between 0 and 1', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 20; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('produces deterministic sequence', () => {
    const r1 = new SeededRandom(123);
    const r2 = new SeededRandom(123);
    const seq1 = Array.from({ length: 10 }, () => r1.next());
    const seq2 = Array.from({ length: 10 }, () => r2.next());
    expect(seq1).toEqual(seq2);
  });
});

describe('simulateAllProviders', () => {
  it('returns a result per provider', () => {
    const results = simulateAllProviders(
      simulationSchedule,
      [mockProvider1, mockProvider2],
      10, 100,
      new SeededRandom(42)
    );
    expect(results).toHaveLength(2);
    expect(results[0].providerId).toBe('p1');
    expect(results[1].providerId).toBe('p2');
  });
});

// ─── Task 3: Report Helpers ───────────────────────────────────────────────────

import { buildWeeklyReport } from '@/lib/report-helpers';

const reportSchedules: Record<string, GenerationResult> = {
  MONDAY: {
    dayOfWeek: 'MONDAY',
    slots: [
      { time: '8:00 AM', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: 'bi1' },
    ],
    productionSummary: [
      { providerId: 'p1', providerName: 'Dr. Smith', dailyGoal: 5000, target75: 3750, actualScheduled: 2400, status: 'UNDER', blocks: [] },
    ],
    warnings: [],
  },
  TUESDAY: {
    dayOfWeek: 'TUESDAY',
    slots: [
      { time: '8:00 AM', providerId: 'p1', operatory: 'OP1', staffingCode: 'D', blockTypeId: 'bt1', blockLabel: 'Crown Prep', isBreak: false, blockInstanceId: 'bi2' },
    ],
    productionSummary: [
      { providerId: 'p1', providerName: 'Dr. Smith', dailyGoal: 5000, target75: 3750, actualScheduled: 3200, status: 'UNDER', blocks: [] },
    ],
    warnings: [],
  },
};

describe('buildWeeklyReport', () => {
  it('returns the office name and date info', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    expect(report.officeName).toBe('Test Office');
    expect(report.generatedAt).toBeDefined();
    expect(report.weekOf).toBeDefined();
  });

  it('calculates total scheduled production across all days', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    expect(report.totalScheduledProduction).toBe(5600); // 2400 + 3200
  });

  it('calculates goal achievement percentage', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    // 5600 / 10000 = 56%
    expect(report.goalAchievementPct).toBe(56);
  });

  it('returns a day entry for each day with a schedule', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    expect(report.days).toHaveLength(2);
    expect(report.days[0].label).toBe('Monday');
    expect(report.days[1].label).toBe('Tuesday');
  });

  it('returns provider count', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    expect(report.providerCount).toBe(1);
  });

  it('includes procedure mix rows', () => {
    const report = buildWeeklyReport('Test Office', reportSchedules, [mockProvider1], [], 5000);
    expect(report.procedureMix.length).toBeGreaterThan(0);
    expect(report.procedureMix[0]).toMatchObject({
      label: 'Crown Prep',
      currentPct: expect.any(Number),
    });
  });

  it('handles empty schedules gracefully', () => {
    const report = buildWeeklyReport('Test Office', {}, [mockProvider1], [], 5000);
    expect(report.totalScheduledProduction).toBe(0);
    expect(report.days).toHaveLength(0);
  });
});

// ─── Task 4: Notification Store ───────────────────────────────────────────────

import { useNotificationStore, notify } from '@/lib/notifications';

describe('NotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('starts empty after clearAll', () => {
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('adds a notification with correct fields', () => {
    useNotificationStore.getState().addNotification('success', '✅ Saved', '/offices/1');
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe('success');
    expect(notifs[0].message).toBe('✅ Saved');
    expect(notifs[0].link).toBe('/offices/1');
    expect(notifs[0].read).toBe(false);
    expect(notifs[0].id).toBeTruthy();
    expect(notifs[0].timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('prepends new notifications (newest first)', () => {
    useNotificationStore.getState().addNotification('info', 'First');
    useNotificationStore.getState().addNotification('info', 'Second');
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].message).toBe('Second');
    expect(notifs[1].message).toBe('First');
  });

  it('marks a specific notification as read', () => {
    useNotificationStore.getState().addNotification('info', 'Test');
    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markRead(id);
    expect(useNotificationStore.getState().notifications[0].read).toBe(true);
  });

  it('marks all as read', () => {
    useNotificationStore.getState().addNotification('info', 'A');
    useNotificationStore.getState().addNotification('info', 'B');
    useNotificationStore.getState().markAllRead();
    useNotificationStore.getState().notifications.forEach(n => {
      expect(n.read).toBe(true);
    });
  });

  it('clears all notifications', () => {
    useNotificationStore.getState().addNotification('info', 'X');
    useNotificationStore.getState().clearAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('prunes oldest notifications when over 20 max', () => {
    for (let i = 0; i < 25; i++) {
      useNotificationStore.getState().addNotification('info', `Notif ${i}`);
    }
    expect(useNotificationStore.getState().notifications).toHaveLength(20);
    // Newest should be "Notif 24"
    expect(useNotificationStore.getState().notifications[0].message).toBe('Notif 24');
  });

  it('unread count is computed correctly', () => {
    useNotificationStore.getState().addNotification('success', 'A');
    useNotificationStore.getState().addNotification('info', 'B');
    const id = useNotificationStore.getState().notifications[1].id; // 'A' (older)
    useNotificationStore.getState().markRead(id);
    const unread = useNotificationStore.getState().notifications.filter(n => !n.read).length;
    expect(unread).toBe(1);
  });
});

describe('notify helpers', () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it('notify.saved adds a success notification', () => {
    notify.saved('Monday Week A');
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].type).toBe('success');
    expect(notifs[0].message).toContain('Monday Week A');
  });

  it('notify.cloned adds an info notification with count', () => {
    notify.cloned(5);
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].message).toContain('5 offices');
  });

  it('notify.clinicalWarning adds a warning notification', () => {
    notify.clinicalWarning(3);
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].type).toBe('warning');
    expect(notifs[0].message).toContain('3 warnings');
  });

  it('notify.versionRestored adds an info notification', () => {
    notify.versionRestored('Monday 2:15 PM');
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].message).toContain('Monday 2:15 PM');
  });

  it('notify.scoreImproved adds a score notification', () => {
    notify.scoreImproved(72, 81);
    const notifs = useNotificationStore.getState().notifications;
    expect(notifs[0].type).toBe('score');
    expect(notifs[0].message).toContain('72 → 81');
  });
});
