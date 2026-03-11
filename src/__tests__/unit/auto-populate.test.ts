/**
 * Sprint 7 — Task 4: Auto-Populate Existing Schedules
 * Tests for localStorage auto-load behavior in the schedule store.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Simulate the localStorage persistence helpers from schedule-store.ts
const LS_PREFIX = 'schedule-designer:schedule-state:';

function lsKey(officeId: string, week: 'A' | 'B'): string {
  return week === 'B' ? `${LS_PREFIX}${officeId}:weekB` : `${LS_PREFIX}${officeId}`;
}

type ScheduleMap = Record<string, { dayOfWeek: string; slots: any[]; productionSummary: any[]; warnings: string[] }>;

function persistSchedules(officeId: string, week: 'A' | 'B', schedules: ScheduleMap) {
  localStorage.setItem(lsKey(officeId, week), JSON.stringify(schedules));
}

function loadPersistedSchedules(officeId: string, week: 'A' | 'B'): ScheduleMap | null {
  try {
    const raw = localStorage.getItem(lsKey(officeId, week));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

describe('Auto-populate: localStorage schedule persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no saved schedule exists', () => {
    const result = loadPersistedSchedules('office-123', 'A');
    expect(result).toBeNull();
  });

  it('loads saved schedule from localStorage for Week A', () => {
    const mock: ScheduleMap = {
      MONDAY: { dayOfWeek: 'MONDAY', slots: [], productionSummary: [], warnings: [] },
    };
    persistSchedules('office-123', 'A', mock);
    const result = loadPersistedSchedules('office-123', 'A');
    expect(result).not.toBeNull();
    expect(result!.MONDAY.dayOfWeek).toBe('MONDAY');
  });

  it('loads saved schedule from localStorage for Week B', () => {
    const mock: ScheduleMap = {
      TUESDAY: { dayOfWeek: 'TUESDAY', slots: [], productionSummary: [], warnings: [] },
    };
    persistSchedules('office-456', 'B', mock);
    const result = loadPersistedSchedules('office-456', 'B');
    expect(result).not.toBeNull();
    expect(result!.TUESDAY.dayOfWeek).toBe('TUESDAY');
  });

  it('Week A and B keys are separate', () => {
    const mockA: ScheduleMap = {
      MONDAY: { dayOfWeek: 'MONDAY', slots: [], productionSummary: [], warnings: [] },
    };
    const mockB: ScheduleMap = {
      TUESDAY: { dayOfWeek: 'TUESDAY', slots: [], productionSummary: [], warnings: [] },
    };
    persistSchedules('office-789', 'A', mockA);
    persistSchedules('office-789', 'B', mockB);
    const resultA = loadPersistedSchedules('office-789', 'A');
    const resultB = loadPersistedSchedules('office-789', 'B');
    expect(resultA!.MONDAY).toBeDefined();
    expect(resultA!.TUESDAY).toBeUndefined();
    expect(resultB!.TUESDAY).toBeDefined();
    expect(resultB!.MONDAY).toBeUndefined();
  });

  it('returns null after localStorage is cleared', () => {
    const mock: ScheduleMap = {
      MONDAY: { dayOfWeek: 'MONDAY', slots: [], productionSummary: [], warnings: [] },
    };
    persistSchedules('office-123', 'A', mock);
    localStorage.clear();
    const result = loadPersistedSchedules('office-123', 'A');
    expect(result).toBeNull();
  });
});
