import { describe, it, expect, beforeEach } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type { GenerationResult, ProviderInput, BlockTypeInput } from '@/lib/engine/types';

// ────────────────────────────────────────────────────────────────
// Shared test fixtures
// ────────────────────────────────────────────────────────────────

const testProviders: ProviderInput[] = [
  {
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
  },
  {
    id: 'p2',
    name: 'Hygienist Test',
    role: 'HYGIENIST',
    operatories: ['HYG1'],
    workingStart: '07:00',
    workingEnd: '18:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    dailyGoal: 2500,
    color: '#0000ff',
  },
];

const testBlockTypes: BlockTypeInput[] = [
  {
    id: 'bt1',
    label: 'HP',
    description: 'High Production',
    minimumAmount: 1200,
    appliesToRole: 'DOCTOR',
    durationMin: 30, // 3 × 10-min slots
  },
  {
    id: 'bt2',
    label: 'PP',
    description: 'Perio Procedure',
    minimumAmount: 500,
    appliesToRole: 'HYGIENIST',
    durationMin: 60,
  },
];

/**
 * Build a minimal GenerationResult that the store can operate on.
 *
 * Layout (10-min increment, provider p1):
 *   07:00-07:20  → block bt1 "HP>$1200"   (3 slots)
 *   07:30-07:50  → empty                  (3 slots)
 *   08:00        → empty                  (1 slot)
 *   13:00-13:20  → break / lunch          (3 slots)
 */
function makeTestSchedule(): GenerationResult {
  const makeSlot = (
    time: string,
    providerId: string,
    blockTypeId: string | null,
    blockLabel: string | null,
    isBreak: boolean,
  ) => ({
    time,
    providerId,
    operatory: 'OP1',
    staffingCode: isBreak ? null : ('D' as const),
    blockTypeId,
    blockLabel,
    isBreak,
  });

  return {
    dayOfWeek: 'MONDAY',
    slots: [
      // Block bt1 @ 07:00–07:20 for p1
      makeSlot('07:00', 'p1', 'bt1', 'HP>$1200', false),
      makeSlot('07:10', 'p1', 'bt1', 'HP>$1200', false),
      makeSlot('07:20', 'p1', 'bt1', 'HP>$1200', false),
      // Empty slots for p1
      makeSlot('07:30', 'p1', null, null, false),
      makeSlot('07:40', 'p1', null, null, false),
      makeSlot('07:50', 'p1', null, null, false),
      makeSlot('08:00', 'p1', null, null, false),
      // Lunch break for p1
      makeSlot('13:00', 'p1', null, null, true),
      makeSlot('13:10', 'p1', null, null, true),
      makeSlot('13:20', 'p1', null, null, true),
      // Empty slots for p2 (different provider)
      makeSlot('07:00', 'p2', null, null, false),
      makeSlot('07:10', 'p2', null, null, false),
      makeSlot('07:20', 'p2', null, null, false),
      makeSlot('07:30', 'p2', null, null, false),
      makeSlot('07:40', 'p2', null, null, false),
      makeSlot('07:50', 'p2', null, null, false),
      makeSlot('13:00', 'p2', null, null, true),
    ],
    productionSummary: [],
    warnings: [],
  };
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function getSlot(dayOfWeek: string, time: string, providerId: string) {
  const schedule = useScheduleStore.getState().generatedSchedules[dayOfWeek];
  return schedule?.slots.find(s => s.time === time && s.providerId === providerId) ?? null;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('Schedule Store – drag-and-drop (moveBlockInDay)', () => {
  beforeEach(() => {
    // Reset store state to a fresh schedule before each test
    useScheduleStore.setState({
      generatedSchedules: { MONDAY: makeTestSchedule() },
      activeDay: 'MONDAY',
      currentOfficeId: null,
    });
  });

  // ── Test 1 ──────────────────────────────────────────────────
  it('moves a block from slot A to slot B and updates the store', () => {
    // Block starts at 07:00.  Move it to 07:30 (all 3 slots available).
    useScheduleStore.getState().moveBlockInDay(
      'MONDAY',
      '07:00', 'p1',
      '07:30', 'p1',
      testProviders,
      testBlockTypes,
    );

    // Source slots should now be empty
    expect(getSlot('MONDAY', '07:00', 'p1')?.blockTypeId).toBeNull();
    expect(getSlot('MONDAY', '07:10', 'p1')?.blockTypeId).toBeNull();
    expect(getSlot('MONDAY', '07:20', 'p1')?.blockTypeId).toBeNull();

    // Destination slots should carry the block
    expect(getSlot('MONDAY', '07:30', 'p1')?.blockTypeId).toBe('bt1');
    expect(getSlot('MONDAY', '07:40', 'p1')?.blockTypeId).toBe('bt1');
    expect(getSlot('MONDAY', '07:50', 'p1')?.blockTypeId).toBe('bt1');
  });

  // ── Test 2 ──────────────────────────────────────────────────
  it('rejects a drop onto a break/lunch slot (no state change)', () => {
    // Try to move the block into the lunch break at 13:00
    useScheduleStore.getState().moveBlockInDay(
      'MONDAY',
      '07:00', 'p1',
      '13:00', 'p1',
      testProviders,
      testBlockTypes,
    );

    // Block should still be at original position
    expect(getSlot('MONDAY', '07:00', 'p1')?.blockTypeId).toBe('bt1');
    expect(getSlot('MONDAY', '07:10', 'p1')?.blockTypeId).toBe('bt1');
    expect(getSlot('MONDAY', '07:20', 'p1')?.blockTypeId).toBe('bt1');

    // Break slots unchanged
    expect(getSlot('MONDAY', '13:00', 'p1')?.blockTypeId).toBeNull();
    expect(getSlot('MONDAY', '13:00', 'p1')?.isBreak).toBe(true);
  });

  // ── Test 3 ──────────────────────────────────────────────────
  it('preserves blockTypeId, blockLabel, and full duration after a move', () => {
    useScheduleStore.getState().moveBlockInDay(
      'MONDAY',
      '07:00', 'p1',
      '07:30', 'p1',
      testProviders,
      testBlockTypes,
    );

    // All three destination slots must carry the exact same blockTypeId and label
    const slot30 = getSlot('MONDAY', '07:30', 'p1');
    const slot40 = getSlot('MONDAY', '07:40', 'p1');
    const slot50 = getSlot('MONDAY', '07:50', 'p1');

    expect(slot30?.blockTypeId).toBe('bt1');
    expect(slot30?.blockLabel).toBe('HP>$1200');

    expect(slot40?.blockTypeId).toBe('bt1');
    expect(slot40?.blockLabel).toBe('HP>$1200');

    expect(slot50?.blockTypeId).toBe('bt1');
    expect(slot50?.blockLabel).toBe('HP>$1200');

    // Source is cleared – confirms duration is preserved at the new location, not split
    expect(getSlot('MONDAY', '07:00', 'p1')?.blockTypeId).toBeNull();
    expect(getSlot('MONDAY', '07:10', 'p1')?.blockTypeId).toBeNull();
    expect(getSlot('MONDAY', '07:20', 'p1')?.blockTypeId).toBeNull();
  });

  // ── Bonus ────────────────────────────────────────────────────
  it('rejects a drop when there is not enough room (would overflow into break)', () => {
    // 3-slot block trying to start at 08:00 — only 1 empty slot before lunch
    useScheduleStore.getState().moveBlockInDay(
      'MONDAY',
      '07:00', 'p1',
      '08:00', 'p1',  // only slot 08:00 is in our test data → not enough room
      testProviders,
      testBlockTypes,
    );

    // Block should still be at original position (not enough room)
    expect(getSlot('MONDAY', '07:00', 'p1')?.blockTypeId).toBe('bt1');
  });

  it('allows cross-provider move when destination is empty', () => {
    useScheduleStore.getState().moveBlockInDay(
      'MONDAY',
      '07:00', 'p1',
      '07:00', 'p2',
      testProviders,
      testBlockTypes,
    );

    // Source cleared
    expect(getSlot('MONDAY', '07:00', 'p1')?.blockTypeId).toBeNull();

    // Destination populated with correct staffing code for p2 (HYGIENIST → 'H')
    expect(getSlot('MONDAY', '07:00', 'p2')?.blockTypeId).toBe('bt1');
    expect(getSlot('MONDAY', '07:00', 'p2')?.staffingCode).toBe('H');
  });
});
