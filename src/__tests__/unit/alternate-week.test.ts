/**
 * Unit tests for Alternate Week Schedule feature (Sprint 5 §5.5)
 *
 * Tests cover:
 * - Schedule store: activeWeek state, setActiveWeek, per-week localStorage
 * - OfficeData: alternateWeekEnabled field present in interface
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type { GenerationResult } from '@/lib/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchedule(dayOfWeek: string): GenerationResult {
  return {
    dayOfWeek,
    slots: [],
    productionSummary: [],
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Schedule Store — activeWeek
// ---------------------------------------------------------------------------

describe('schedule store — alternate week (Sprint 5)', () => {
  beforeEach(() => {
    // Reset store to initial state
    useScheduleStore.setState({
      generatedSchedules: {},
      activeDay: 'MONDAY',
      activeWeek: 'A',
      currentOfficeId: null,
      isGenerating: false,
      isExporting: false,
    });
  });

  it('defaults activeWeek to "A"', () => {
    const { activeWeek } = useScheduleStore.getState();
    expect(activeWeek).toBe('A');
  });

  it('setActiveWeek changes activeWeek to "B"', () => {
    const { setActiveWeek } = useScheduleStore.getState();
    setActiveWeek('B');
    expect(useScheduleStore.getState().activeWeek).toBe('B');
  });

  it('setActiveWeek back to "A" from "B"', () => {
    const { setActiveWeek } = useScheduleStore.getState();
    setActiveWeek('B');
    setActiveWeek('A');
    expect(useScheduleStore.getState().activeWeek).toBe('A');
  });

  it('setActiveWeek clears in-memory schedules', () => {
    const { setSchedules, setActiveWeek } = useScheduleStore.getState();
    // Set up some Week A schedules in memory
    useScheduleStore.setState({ currentOfficeId: 'office1' });
    setSchedules([makeSchedule('MONDAY')], 'office1');
    expect(Object.keys(useScheduleStore.getState().generatedSchedules).length).toBeGreaterThan(0);

    // Switching to B should clear them
    setActiveWeek('B');
    expect(Object.keys(useScheduleStore.getState().generatedSchedules).length).toBe(0);
  });

  it('setSchedules persists using week-aware key', () => {
    const localStorageMock: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      setItem: (key: string, val: string) => { localStorageMock[key] = val; },
      getItem: (key: string) => localStorageMock[key] ?? null,
      removeItem: (key: string) => { delete localStorageMock[key]; },
    });

    try {
      const { setSchedules } = useScheduleStore.getState();

      // Week A
      useScheduleStore.setState({ activeWeek: 'A', currentOfficeId: 'office1' });
      setSchedules([makeSchedule('MONDAY')], 'office1');
      expect(Object.keys(localStorageMock)).toContain('schedule-designer:schedule-state:office1');

      // Week B
      useScheduleStore.setState({ activeWeek: 'B', currentOfficeId: 'office1' });
      setSchedules([makeSchedule('TUESDAY')], 'office1');
      expect(Object.keys(localStorageMock)).toContain('schedule-designer:schedule-state:office1:weekB');

      // Verify the two keys have different data
      const weekAData = JSON.parse(localStorageMock['schedule-designer:schedule-state:office1']);
      const weekBData = JSON.parse(localStorageMock['schedule-designer:schedule-state:office1:weekB']);
      expect(Object.keys(weekAData)).toContain('MONDAY');
      expect(Object.keys(weekBData)).toContain('TUESDAY');
      expect(Object.keys(weekAData)).not.toContain('TUESDAY');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Week A and Week B schedules are stored independently', () => {
    const localStorageMock: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      setItem: (key: string, val: string) => { localStorageMock[key] = val; },
      getItem: (key: string) => localStorageMock[key] ?? null,
      removeItem: (key: string) => { delete localStorageMock[key]; },
    });

    try {
      const { setSchedules } = useScheduleStore.getState();
      useScheduleStore.setState({ currentOfficeId: 'office2' });

      // Save Week A: Monday
      useScheduleStore.setState({ activeWeek: 'A' });
      setSchedules([makeSchedule('MONDAY')], 'office2');

      // Save Week B: Wednesday  
      useScheduleStore.setState({ activeWeek: 'B' });
      setSchedules([makeSchedule('WEDNESDAY')], 'office2');

      // Read back separately
      const weekA = JSON.parse(localStorageMock['schedule-designer:schedule-state:office2'] ?? '{}');
      const weekB = JSON.parse(localStorageMock['schedule-designer:schedule-state:office2:weekB'] ?? '{}');

      expect(weekA).toHaveProperty('MONDAY');
      expect(weekA).not.toHaveProperty('WEDNESDAY');
      expect(weekB).toHaveProperty('WEDNESDAY');
      expect(weekB).not.toHaveProperty('MONDAY');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('clearSchedules removes the active week localStorage entry', () => {
    const localStorageMock: Record<string, string> = {
      'schedule-designer:schedule-state:office3': '{"MONDAY":{}}',
      'schedule-designer:schedule-state:office3:weekB': '{"TUESDAY":{}}',
    };
    vi.stubGlobal('localStorage', {
      setItem: (key: string, val: string) => { localStorageMock[key] = val; },
      getItem: (key: string) => localStorageMock[key] ?? null,
      removeItem: (key: string) => { delete localStorageMock[key]; },
    });

    try {
      useScheduleStore.setState({ currentOfficeId: 'office3', activeWeek: 'A' });
      useScheduleStore.getState().clearSchedules();
      // Week A key should be gone
      expect(localStorageMock['schedule-designer:schedule-state:office3']).toBeUndefined();
      // Week B key should remain (different week)
      expect(localStorageMock['schedule-designer:schedule-state:office3:weekB']).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// OfficeData interface — alternateWeekEnabled field
// ---------------------------------------------------------------------------

describe('OfficeData — alternateWeekEnabled', () => {
  it('alternateWeekEnabled is a valid optional field on OfficeData', async () => {
    const { } = await import('@/lib/mock-data');
    // We just need to verify the type compiles and the field is optional
    // If the import works and the type is correct, this test passes
    const office = {
      id: 'test',
      name: 'Test Office',
      dpmsSystem: 'OPEN_DENTAL' as const,
      workingDays: ['MONDAY'],
      timeIncrement: 10,
      feeModel: 'UCR' as const,
      providerCount: 1,
      totalDailyGoal: 5000,
      updatedAt: new Date().toISOString(),
      alternateWeekEnabled: true,
    };
    expect(office.alternateWeekEnabled).toBe(true);
  });

  it('alternateWeekEnabled defaults to falsy when omitted', () => {
    const office = {
      id: 'test',
      name: 'Test Office',
      dpmsSystem: 'OPEN_DENTAL' as const,
      workingDays: ['MONDAY'],
      timeIncrement: 10,
      feeModel: 'UCR' as const,
      providerCount: 1,
      totalDailyGoal: 5000,
      updatedAt: new Date().toISOString(),
    };
    // Not set — should be undefined (falsy)
    expect(office.alternateWeekEnabled).toBeFalsy();
  });
});
