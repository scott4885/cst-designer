/**
 * Loop 8 — Unit tests for provider-operations helpers.
 *
 * Covers:
 *   - cloneProvider: carried fields, name suffixing, operatory reset,
 *     idempotence on repeat clones.
 *   - validateBulkGoals: happy path, caps, and per-row error surfacing.
 */
import { describe, it, expect } from 'vitest';
import {
  cloneProvider,
  validateBulkGoals,
  type ProviderFormEntry,
} from '@/lib/provider-operations';

const baseProvider: ProviderFormEntry = {
  id: 'prov-src-123',
  name: 'Dr. Jane Smith',
  providerId: 'DG001',
  role: 'DOCTOR',
  operatories: ['OP1', 'OP2', 'OP3'],
  columns: 2,
  workingStart: '07:00',
  workingEnd: '17:00',
  lunchEnabled: true,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  dailyGoal: 7500,
  color: '#ec8a1b',
  seesNewPatients: true,
  enabledBlockTypeIds: ['bt-hp', 'bt-np'],
  assistedHygiene: false,
  providerSchedule: {
    MONDAY: { enabled: true, workingStart: '07:00', workingEnd: '17:00' },
  },
  staggerOffsetMin: 20,
};

describe('cloneProvider', () => {
  it('preserves role, hours, goal, lunch, color, and stagger from the source', () => {
    const clone = cloneProvider(baseProvider);
    expect(clone.role).toBe('DOCTOR');
    expect(clone.workingStart).toBe('07:00');
    expect(clone.workingEnd).toBe('17:00');
    expect(clone.lunchEnabled).toBe(true);
    expect(clone.lunchStart).toBe('12:00');
    expect(clone.lunchEnd).toBe('13:00');
    expect(clone.dailyGoal).toBe(7500);
    expect(clone.color).toBe('#ec8a1b');
    expect(clone.staggerOffsetMin).toBe(20);
    expect(clone.columns).toBe(2);
    expect(clone.seesNewPatients).toBe(true);
    expect(clone.enabledBlockTypeIds).toEqual(['bt-hp', 'bt-np']);
  });

  it('drops the source db id and clears the DPMS providerId', () => {
    const clone = cloneProvider(baseProvider);
    expect(clone.id).toBeUndefined();
    expect(clone.providerId).toBe('');
  });

  it('resets operatories to a single target op (default OP1)', () => {
    const clone = cloneProvider(baseProvider);
    expect(clone.operatories).toEqual(['OP1']);

    const custom = cloneProvider(baseProvider, { targetOperatory: 'HYG2' });
    expect(custom.operatories).toEqual(['HYG2']);
  });

  it('appends "(Copy)" to a fresh name and increments the counter on subsequent clones', () => {
    const clone1 = cloneProvider(baseProvider);
    expect(clone1.name).toBe('Dr. Jane Smith (Copy)');

    const clone2 = cloneProvider({ ...baseProvider, name: clone1.name });
    expect(clone2.name).toBe('Dr. Jane Smith (Copy 2)');

    const clone3 = cloneProvider({ ...baseProvider, name: clone2.name });
    expect(clone3.name).toBe('Dr. Jane Smith (Copy 3)');
  });

  it('deep-copies providerSchedule so mutations on the clone do not leak back', () => {
    const clone = cloneProvider(baseProvider);
    // Mutate the clone's schedule…
    const schedule = clone.providerSchedule as Record<
      string,
      { enabled?: boolean }
    >;
    schedule.MONDAY = { enabled: false };
    // …and verify the source is untouched.
    const src = baseProvider.providerSchedule as Record<
      string,
      { enabled?: boolean }
    >;
    expect(src.MONDAY?.enabled).toBe(true);
  });

  it('applies extras.currentProcedureMix and futureProcedureMix when provided', () => {
    const clone = cloneProvider(baseProvider, {
      extras: {
        currentProcedureMix: { CROWN: 30 },
        futureProcedureMix: { CROWN: 35 },
      },
    });
    expect(clone.currentProcedureMix).toEqual({ CROWN: 30 });
    expect(clone.futureProcedureMix).toEqual({ CROWN: 35 });
  });
});

describe('validateBulkGoals', () => {
  it('accepts a list of valid entries', () => {
    const result = validateBulkGoals({
      entries: [
        { index: 0, providerId: 'a', dailyGoal: 5000 },
        { index: 1, providerId: 'b', dailyGoal: 7500 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.entries).toHaveLength(2);
  });

  it('rejects goals above the $10,000/day cap with a per-row error', () => {
    const result = validateBulkGoals({
      entries: [
        { index: 0, providerId: 'a', dailyGoal: 5000 },
        { index: 1, providerId: 'b', dailyGoal: 15000 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The failing entry is at array index 1 (zod path), which carries
      // providerIndex 1 — validateBulkGoals keys its error map by the zod
      // path index, so consumers map back via entries[pathIndex].
      expect(result.errors[1]).toMatch(/\$10,000/);
    }
  });

  it('rejects zero or negative goals (goals must be positive)', () => {
    const result = validateBulkGoals({
      entries: [{ index: 0, dailyGoal: 0 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/greater than 0/);
    }

    const negative = validateBulkGoals({
      entries: [{ index: 0, dailyGoal: -100 }],
    });
    expect(negative.ok).toBe(false);
  });

  it('rejects an empty entries array with a form-level error', () => {
    const result = validateBulkGoals({ entries: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toMatch(/at least one/i);
    }
  });

  it('rejects non-numeric goals with a clear message', () => {
    const result = validateBulkGoals({
      entries: [{ index: 0, dailyGoal: 'not a number' as unknown as number }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The message comes from the Zod number() schema.
      expect(result.errors[0]).toBeDefined();
    }
  });
});
