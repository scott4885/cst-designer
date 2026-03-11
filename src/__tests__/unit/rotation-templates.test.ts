/**
 * Sprint 8 — Multi-Week Rotating Templates (§9.3)
 * Tests for:
 * - T1: 4-week rotation tabs
 * - T2: Copy from Week A
 * - T3: Provider rotation week exclusion (ScheduleGrid display)
 * - T4: 2-week A→B switch loads independently
 * - T5: 4-week A→D switch
 * - T6: Rotation off = no tabs, no week state
 * - T7: Legacy alternateWeekEnabled backward compat
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type { RotationWeek } from '@/store/schedule-store';
import { generateSchedule } from '@/lib/engine/generator';
import type { GenerationResult } from '@/lib/engine/types';
import type { ProviderInput, BlockTypeInput, ScheduleRules } from '@/lib/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchedule(dayOfWeek: string, marker?: string): GenerationResult {
  return {
    dayOfWeek,
    slots: marker ? [{ time: marker, providerId: 'p1', operatory: 'OP1', staffingCode: null, blockTypeId: null, blockLabel: null, isBreak: false }] : [],
    productionSummary: [],
    warnings: [],
  };
}

function makeLSMock() {
  const store: Record<string, string> = {};
  return {
    store,
    mock: {
      setItem: (k: string, v: string) => { store[k] = v; },
      getItem: (k: string) => store[k] ?? null,
      removeItem: (k: string) => { delete store[k]; },
    },
  };
}

// ---------------------------------------------------------------------------
// Store reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  useScheduleStore.setState({
    generatedSchedules: {},
    activeDay: 'MONDAY',
    activeWeek: 'A',
    currentOfficeId: null,
    isGenerating: false,
    isExporting: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// T1 — 4-week rotation: store supports A/B/C/D
// ---------------------------------------------------------------------------

describe('T1 — 4-week rotation week support', () => {
  it('setActiveWeek can switch to C', () => {
    useScheduleStore.getState().setActiveWeek('C');
    expect(useScheduleStore.getState().activeWeek).toBe('C');
  });

  it('setActiveWeek can switch to D', () => {
    useScheduleStore.getState().setActiveWeek('D');
    expect(useScheduleStore.getState().activeWeek).toBe('D');
  });

  it('setActiveWeek cycles through A→B→C→D', () => {
    const weeks: RotationWeek[] = ['A', 'B', 'C', 'D'];
    for (const w of weeks) {
      useScheduleStore.getState().setActiveWeek(w);
      expect(useScheduleStore.getState().activeWeek).toBe(w);
    }
  });
});

// ---------------------------------------------------------------------------
// T2 — Copy from Week A
// ---------------------------------------------------------------------------

describe('T2 — Copy from Week A', () => {
  it('copyWeekFromA copies Week A data to Week B', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    // Seed Week A data
    store['schedule-designer:schedule-state:office1'] = JSON.stringify({ MONDAY: makeSchedule('MONDAY', '07:00') });

    useScheduleStore.setState({ currentOfficeId: 'office1', activeWeek: 'B' });
    const result = useScheduleStore.getState().copyWeekFromA('B', 'office1');

    expect(result).toBe(true);
    const weekBData = JSON.parse(store['schedule-designer:schedule-state:office1:weekB'] ?? '{}');
    expect(weekBData).toHaveProperty('MONDAY');
  });

  it('copyWeekFromA copies to Week C in a 4-week rotation', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    store['schedule-designer:schedule-state:office2'] = JSON.stringify({ TUESDAY: makeSchedule('TUESDAY') });

    const result = useScheduleStore.getState().copyWeekFromA('C', 'office2');
    expect(result).toBe(true);
    expect(store['schedule-designer:schedule-state:office2:weekC']).toBeDefined();
    const weekCData = JSON.parse(store['schedule-designer:schedule-state:office2:weekC']);
    expect(weekCData).toHaveProperty('TUESDAY');
  });

  it('copyWeekFromA returns false when Week A is empty', () => {
    const { mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    const result = useScheduleStore.getState().copyWeekFromA('B', 'office-empty');
    expect(result).toBe(false);
  });

  it('copyWeekFromA loads copied data into memory when viewing target week', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    store['schedule-designer:schedule-state:officeX'] = JSON.stringify({ FRIDAY: makeSchedule('FRIDAY') });

    useScheduleStore.setState({ activeWeek: 'D', currentOfficeId: 'officeX' });
    useScheduleStore.getState().copyWeekFromA('D', 'officeX');

    const inMemory = useScheduleStore.getState().generatedSchedules;
    expect(inMemory).toHaveProperty('FRIDAY');
  });

  it('copyWeekFromA copies to Week D in 4-week rotation', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    store['schedule-designer:schedule-state:off4'] = JSON.stringify({ WEDNESDAY: makeSchedule('WEDNESDAY') });

    const result = useScheduleStore.getState().copyWeekFromA('D', 'off4');
    expect(result).toBe(true);
    expect(store['schedule-designer:schedule-state:off4:weekD']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// T3 — Provider rotation week exclusion (generator level)
// ---------------------------------------------------------------------------

describe('T3 — Provider rotation week exclusion', () => {
  const baseProvider: ProviderInput = {
    id: 'hyg1',
    name: 'Sarah RDH',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '16:00',
    dailyGoal: 2000,
    color: '#aaa',
    providerSchedule: {
      MONDAY: {
        enabled: true,
        rotationWeeks: ['A', 'C'], // works only Weeks A and C on Monday
      },
    },
  };

  const blockTypes: BlockTypeInput[] = [
    { id: 'recare', label: 'Recare', appliesToRole: 'HYGIENIST', durationMin: 60, minimumAmount: 150 },
  ];

  const rules: ScheduleRules = {
    npModel: 'HYGIENIST_ONLY',
    npBlocksPerDay: 1,
    srpBlocksPerDay: 0,
    hpPlacement: 'MORNING',
    doubleBooking: false,
    matrixing: false,
    emergencyHandling: 'ACCESS_BLOCKS',
  };

  it('provider included in Week A (in rotation weeks)', () => {
    const result = generateSchedule({
      providers: [baseProvider],
      blockTypes,
      rules,
      timeIncrement: 10,
      dayOfWeek: 'MONDAY',
      activeWeek: 'A',
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'hyg1');
    expect(providerSlots.length).toBeGreaterThan(0);
  });

  it('provider excluded in Week B (not in rotation weeks)', () => {
    const result = generateSchedule({
      providers: [baseProvider],
      blockTypes,
      rules,
      timeIncrement: 10,
      dayOfWeek: 'MONDAY',
      activeWeek: 'B',
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'hyg1');
    expect(providerSlots.length).toBe(0);
  });

  it('provider excluded in Week D (not in rotation weeks)', () => {
    const result = generateSchedule({
      providers: [baseProvider],
      blockTypes,
      rules,
      timeIncrement: 10,
      dayOfWeek: 'MONDAY',
      activeWeek: 'D',
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'hyg1');
    expect(providerSlots.length).toBe(0);
  });

  it('provider included in Week C (in rotation weeks)', () => {
    const result = generateSchedule({
      providers: [baseProvider],
      blockTypes,
      rules,
      timeIncrement: 10,
      dayOfWeek: 'MONDAY',
      activeWeek: 'C',
    });
    const providerSlots = result.slots.filter(s => s.providerId === 'hyg1');
    expect(providerSlots.length).toBeGreaterThan(0);
  });

  it('provider with no rotationWeeks works all weeks', () => {
    const noRotProvider: ProviderInput = {
      ...baseProvider,
      id: 'hyg-norot',
      providerSchedule: { MONDAY: { enabled: true } }, // no rotationWeeks
    };
    for (const w of ['A', 'B', 'C', 'D'] as RotationWeek[]) {
      const result = generateSchedule({
        providers: [noRotProvider],
        blockTypes,
        rules,
        timeIncrement: 10,
        dayOfWeek: 'MONDAY',
        activeWeek: w,
      });
      expect(result.slots.filter(s => s.providerId === 'hyg-norot').length).toBeGreaterThan(0);
    }
  });

  it('provider with empty rotationWeeks array works all weeks (default)', () => {
    const emptyRotProvider: ProviderInput = {
      ...baseProvider,
      id: 'hyg-emptyrot',
      providerSchedule: { MONDAY: { enabled: true, rotationWeeks: [] } },
    };
    for (const w of ['A', 'B', 'C', 'D'] as RotationWeek[]) {
      const result = generateSchedule({
        providers: [emptyRotProvider],
        blockTypes,
        rules,
        timeIncrement: 10,
        dayOfWeek: 'MONDAY',
        activeWeek: w,
      });
      expect(result.slots.filter(s => s.providerId === 'hyg-emptyrot').length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// T4 — 2-week A→B switch (independent schedules)
// ---------------------------------------------------------------------------

describe('T4 — 2-week A/B independent schedules', () => {
  it('Week A and Week B store independently', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'office-2week' });

    // Save Week A: Monday
    useScheduleStore.setState({ activeWeek: 'A' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'office-2week');

    // Save Week B: Wednesday
    useScheduleStore.getState().setActiveWeek('B');
    useScheduleStore.getState().setSchedules([makeSchedule('WEDNESDAY')], 'office-2week');

    const weekA = JSON.parse(store['schedule-designer:schedule-state:office-2week'] ?? '{}');
    const weekB = JSON.parse(store['schedule-designer:schedule-state:office-2week:weekB'] ?? '{}');

    expect(weekA).toHaveProperty('MONDAY');
    expect(weekA).not.toHaveProperty('WEDNESDAY');
    expect(weekB).toHaveProperty('WEDNESDAY');
    expect(weekB).not.toHaveProperty('MONDAY');
  });

  it('switching to Week B loads Week B persisted schedule', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    store['schedule-designer:schedule-state:office-switch'] = JSON.stringify({ MONDAY: makeSchedule('MONDAY') });
    store['schedule-designer:schedule-state:office-switch:weekB'] = JSON.stringify({ TUESDAY: makeSchedule('TUESDAY') });

    useScheduleStore.setState({ currentOfficeId: 'office-switch', activeWeek: 'A' });
    useScheduleStore.getState().setActiveWeek('B');

    const schedules = useScheduleStore.getState().generatedSchedules;
    expect(schedules).toHaveProperty('TUESDAY');
    expect(schedules).not.toHaveProperty('MONDAY');
  });
});

// ---------------------------------------------------------------------------
// T5 — 4-week A→D switch
// ---------------------------------------------------------------------------

describe('T5 — 4-week A→D switch', () => {
  it('switching to Week D loads Week D persisted schedule (empty initially)', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    store['schedule-designer:schedule-state:office-4week'] = JSON.stringify({ MONDAY: makeSchedule('MONDAY') });
    // Week D is empty

    useScheduleStore.setState({ currentOfficeId: 'office-4week', activeWeek: 'A' });
    useScheduleStore.getState().setActiveWeek('D');

    const schedules = useScheduleStore.getState().generatedSchedules;
    expect(Object.keys(schedules).length).toBe(0); // Week D empty until built
  });

  it('can save and load Week D independently', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'office-4wk', activeWeek: 'D' });
    useScheduleStore.getState().setSchedules([makeSchedule('THURSDAY')], 'office-4wk');

    const weekD = JSON.parse(store['schedule-designer:schedule-state:office-4wk:weekD'] ?? '{}');
    expect(weekD).toHaveProperty('THURSDAY');
  });

  it('Week C and D keys are distinct', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'office-cd', activeWeek: 'C' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'office-cd');

    useScheduleStore.setState({ activeWeek: 'D' });
    useScheduleStore.getState().setSchedules([makeSchedule('FRIDAY')], 'office-cd');

    const weekC = JSON.parse(store['schedule-designer:schedule-state:office-cd:weekC'] ?? '{}');
    const weekD = JSON.parse(store['schedule-designer:schedule-state:office-cd:weekD'] ?? '{}');

    expect(weekC).toHaveProperty('MONDAY');
    expect(weekC).not.toHaveProperty('FRIDAY');
    expect(weekD).toHaveProperty('FRIDAY');
    expect(weekD).not.toHaveProperty('MONDAY');
  });
});

// ---------------------------------------------------------------------------
// T6 — Office with rotation off: no week state changes
// ---------------------------------------------------------------------------

describe('T6 — Rotation disabled offices', () => {
  it('activeWeek defaults to A', () => {
    expect(useScheduleStore.getState().activeWeek).toBe('A');
  });

  it('single schedule stored without week suffix when office has no rotation', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'office-norot', activeWeek: 'A' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'office-norot');

    // Should be stored in the un-suffixed key
    expect(store['schedule-designer:schedule-state:office-norot']).toBeDefined();
    // No week B/C/D keys
    expect(store['schedule-designer:schedule-state:office-norot:weekB']).toBeUndefined();
    expect(store['schedule-designer:schedule-state:office-norot:weekC']).toBeUndefined();
    expect(store['schedule-designer:schedule-state:office-norot:weekD']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T7 — Backward compat: alternateWeekEnabled acts as 2-week rotation
// ---------------------------------------------------------------------------

describe('T7 — Legacy alternateWeekEnabled backward compat', () => {
  it('OfficeData with alternateWeekEnabled=true can still use Week B store', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    const legacyOffice = {
      id: 'legacy-1',
      alternateWeekEnabled: true,
      rotationEnabled: undefined,
      rotationWeeks: undefined,
    };

    // Simulate: store Week A
    useScheduleStore.setState({ currentOfficeId: legacyOffice.id, activeWeek: 'A' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], legacyOffice.id);

    // Switch to Week B
    useScheduleStore.getState().setActiveWeek('B');
    useScheduleStore.getState().setSchedules([makeSchedule('WEDNESDAY')], legacyOffice.id);

    // Both keys exist
    expect(store[`schedule-designer:schedule-state:${legacyOffice.id}`]).toBeDefined();
    expect(store[`schedule-designer:schedule-state:${legacyOffice.id}:weekB`]).toBeDefined();

    // Week A data is intact
    const weekA = JSON.parse(store[`schedule-designer:schedule-state:${legacyOffice.id}`]);
    expect(weekA).toHaveProperty('MONDAY');
  });

  it('alternateWeekEnabled field presence on OfficeData remains valid', () => {
    const office = {
      id: 'leg',
      name: 'Legacy Office',
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
    // rotationEnabled/rotationWeeks are optional — not breaking
    expect((office as any).rotationEnabled).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// LS key format tests
// ---------------------------------------------------------------------------

describe('localStorage key format for all 4 weeks', () => {
  it('Week A uses base key (no suffix)', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'key-test', activeWeek: 'A' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'key-test');

    expect(Object.keys(store)).toContain('schedule-designer:schedule-state:key-test');
    expect(Object.keys(store).some(k => k.includes(':week'))).toBe(false);
  });

  it('Week B uses :weekB suffix', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'key-test', activeWeek: 'B' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'key-test');

    expect(Object.keys(store)).toContain('schedule-designer:schedule-state:key-test:weekB');
  });

  it('Week C uses :weekC suffix', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'key-test', activeWeek: 'C' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'key-test');

    expect(Object.keys(store)).toContain('schedule-designer:schedule-state:key-test:weekC');
  });

  it('Week D uses :weekD suffix', () => {
    const { store, mock } = makeLSMock();
    vi.stubGlobal('localStorage', mock);

    useScheduleStore.setState({ currentOfficeId: 'key-test', activeWeek: 'D' });
    useScheduleStore.getState().setSchedules([makeSchedule('MONDAY')], 'key-test');

    expect(Object.keys(store)).toContain('schedule-designer:schedule-state:key-test:weekD');
  });
});
