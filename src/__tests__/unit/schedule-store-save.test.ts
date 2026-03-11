/**
 * Sprint 2 — Task 1: Save/Load Cycle Tests
 *
 * Verifies that:
 * 1. Schedule state is persisted to localStorage after block mutations
 * 2. Loaded state exactly matches saved state (no data loss across cycles)
 * 3. Production calculation counts each block once (not per-row)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type { GenerationResult, ProviderInput, BlockTypeInput } from '@/lib/engine/types';

// ────────────────────────────────────────────────────────────────
// Mock localStorage
// ────────────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});

// ────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────

const testProvider: ProviderInput = {
  id: 'p1',
  name: 'Dr. Test',
  role: 'DOCTOR',
  operatories: ['OP1'],
  workingStart: '07:00',
  workingEnd: '18:00',
  lunchStart: '13:00',
  lunchEnd: '14:00',
  dailyGoal: 5000,
  color: '#ff0000',
};

const testBlockType: BlockTypeInput = {
  id: 'bt-np',
  label: 'NP Consult',
  description: 'New Patient Consultation',
  minimumAmount: 350,
  appliesToRole: 'DOCTOR',
  durationMin: 60, // 6 × 10-min slots
};

function makeSchedule(): GenerationResult {
  const slots = [];
  const times = ['07:00', '07:10', '07:20', '07:30', '07:40', '07:50'];
  for (const t of times) {
    slots.push({
      time: t,
      providerId: 'p1',
      staffingCode: 'D' as const,
      blockTypeId: null,
      blockLabel: null,
      isBreak: false,
      blockInstanceId: null,
      customProductionAmount: null,
      operatory: 'OP1',
    });
  }
  return {
    dayOfWeek: 'MONDAY',
    slots,
    productionSummary: [],
    warnings: [],
  };
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('Schedule Store — Save/Load Cycle', () => {
  const OFFICE_ID = 'test-office-123';

  beforeEach(() => {
    localStorageMock.clear();
    useScheduleStore.setState({
      generatedSchedules: {},
      currentOfficeId: null,
    });
  });

  it('persists schedules to localStorage after setSchedules', () => {
    const schedule = makeSchedule();
    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    const lsKey = `schedule-designer:schedule-state:${OFFICE_ID}`;
    const saved = localStorageMock.getItem(lsKey);
    expect(saved).not.toBeNull();

    const parsed = JSON.parse(saved!);
    expect(parsed['MONDAY']).toBeDefined();
    expect(parsed['MONDAY'].dayOfWeek).toBe('MONDAY');
  });

  it('restores exact schedule state via loadSchedulesForOffice', async () => {
    const schedule = makeSchedule();
    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    // Reset in-memory state (simulate page navigation)
    useScheduleStore.setState({ generatedSchedules: {}, currentOfficeId: null });

    // Reload from localStorage
    await useScheduleStore.getState().loadSchedulesForOffice(OFFICE_ID);

    const loaded = useScheduleStore.getState().generatedSchedules;
    expect(loaded['MONDAY']).toBeDefined();
    expect(loaded['MONDAY'].slots.length).toBe(6);
    expect(loaded['MONDAY'].dayOfWeek).toBe('MONDAY');
  });

  it('persists block placement and restores exact block positions', async () => {
    const schedule = makeSchedule();
    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    // Place a block
    const placed = useScheduleStore.getState().placeBlockInDay(
      'MONDAY', '07:00', 'p1', testBlockType, 6, [testProvider], [testBlockType]
    );
    expect(placed).toBe(true);

    // Simulate navigation away and back
    useScheduleStore.setState({ generatedSchedules: {}, currentOfficeId: null });
    await useScheduleStore.getState().loadSchedulesForOffice(OFFICE_ID);

    const restored = useScheduleStore.getState().generatedSchedules['MONDAY'];
    expect(restored).toBeDefined();

    // Block should be at 07:00
    const blockSlot = restored.slots.find(s => s.time === '07:00' && s.providerId === 'p1');
    expect(blockSlot?.blockTypeId).toBe('bt-np');
    expect(blockSlot?.blockLabel).toContain('NP Consult');
  });

  it('clearSchedules removes from localStorage', () => {
    const schedule = makeSchedule();
    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    useScheduleStore.getState().clearSchedules();

    const lsKey = `schedule-designer:schedule-state:${OFFICE_ID}`;
    expect(localStorageMock.getItem(lsKey)).toBeNull();
    expect(Object.keys(useScheduleStore.getState().generatedSchedules)).toHaveLength(0);
  });
});

describe('Schedule Store — Production Calculation (per appointment, not per row)', () => {
  const OFFICE_ID = 'prod-calc-office';

  beforeEach(() => {
    localStorageMock.clear();
    useScheduleStore.setState({
      generatedSchedules: {},
      currentOfficeId: null,
    });
  });

  it('counts a 60-min NP block once at $350, not 6 rows × $350', () => {
    const schedule = makeSchedule();
    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    // Place a 6-slot NP Consult block
    const placed = useScheduleStore.getState().placeBlockInDay(
      'MONDAY', '07:00', 'p1', testBlockType, 6, [testProvider], [testBlockType]
    );
    expect(placed).toBe(true);

    const updated = useScheduleStore.getState().generatedSchedules['MONDAY'];
    const providerSummary = updated.productionSummary.find(s => s.providerId === 'p1');

    expect(providerSummary).toBeDefined();
    // Should be $350 (1 block), NOT $2100 (6 rows × $350)
    expect(providerSummary!.actualScheduled).toBe(350);
  });

  it('counts 3 separate Recare blocks as 3 × fee', () => {
    const recareBlock: BlockTypeInput = {
      id: 'bt-recare',
      label: 'Recare',
      description: 'Recall/Prophy',
      minimumAmount: 150,
      appliesToRole: 'HYGIENIST',
      durationMin: 60,
    };

    const hygProvider: ProviderInput = {
      id: 'hyg1',
      name: 'Hygienist',
      role: 'HYGIENIST',
      operatories: ['HYG1'],
      workingStart: '07:00',
      workingEnd: '18:00',
      lunchStart: '13:00',
      lunchEnd: '14:00',
      dailyGoal: 2000,
      color: '#0000ff',
    };

    // Build schedule with enough slots for 3 recare blocks (18 slots at 10-min = 180 min)
    const slots = [];
    const times = [
      '07:00','07:10','07:20','07:30','07:40','07:50',
      '08:00','08:10','08:20','08:30','08:40','08:50',
      '09:00','09:10','09:20','09:30','09:40','09:50',
    ];
    for (const t of times) {
      slots.push({
        time: t,
        providerId: 'hyg1',
        staffingCode: 'H' as const,
        blockTypeId: null,
        blockLabel: null,
        isBreak: false,
        blockInstanceId: null,
        customProductionAmount: null,
        operatory: 'HYG1',
      });
    }

    const schedule: GenerationResult = {
      dayOfWeek: 'MONDAY',
      slots,
      productionSummary: [],
      warnings: [],
    };

    useScheduleStore.getState().setSchedules([schedule], OFFICE_ID);

    // Place 3 recare blocks
    useScheduleStore.getState().placeBlockInDay('MONDAY', '07:00', 'hyg1', recareBlock, 6, [hygProvider], [recareBlock]);
    useScheduleStore.getState().placeBlockInDay('MONDAY', '08:00', 'hyg1', recareBlock, 6, [hygProvider], [recareBlock]);
    useScheduleStore.getState().placeBlockInDay('MONDAY', '09:00', 'hyg1', recareBlock, 6, [hygProvider], [recareBlock]);

    const updated = useScheduleStore.getState().generatedSchedules['MONDAY'];
    const providerSummary = updated.productionSummary.find(s => s.providerId === 'hyg1');

    expect(providerSummary).toBeDefined();
    // 3 × $150 = $450
    expect(providerSummary!.actualScheduled).toBe(450);
  });
});
