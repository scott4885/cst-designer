/**
 * Iteration 12a — loadSchedulesForOffice parallel DB fetch tests.
 *
 * Regression guard for the HIGH-severity cross-device masking bug:
 * prior implementation returned early after reading localStorage, so a
 * second device (empty localStorage) never fetched DB state and showed an
 * empty schedule even when the DB had data. Fix: always fire an API fetch
 * in parallel and merge fresher data if the office id still matches.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useScheduleStore } from '@/store/schedule-store';
import type { GenerationResult } from '@/lib/engine/types';

// ─── Minimal localStorage mock scoped to this test file ─────────────────────
const makeLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    _store: () => store,
  };
};

let lsMock: ReturnType<typeof makeLocalStorageMock>;

function resetStore() {
  useScheduleStore.setState({
    generatedSchedules: {},
    currentOfficeId: null,
    activeWeek: 'A' as const,
    activeDay: 'MONDAY',
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
    isGenerating: false,
    isExporting: false,
  });
}

const makeDbSchedule = (day: string): GenerationResult => ({
  dayOfWeek: day,
  slots: [{ time: '07:00', providerId: 'p1', operatory: 'OP1', blockTypeId: 'bt-hp', blockLabel: 'HP', isBreak: false } as never],
  productionSummary: [],
  warnings: [],
});

describe('loadSchedulesForOffice — parallel DB fetch (Iter 12a)', () => {
  beforeEach(() => {
    lsMock = makeLocalStorageMock();
    vi.stubGlobal('localStorage', lsMock);
    vi.stubGlobal('window', { localStorage: lsMock });
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetStore();
  });

  it('fetches DB and populates state when localStorage is empty (cross-device case)', async () => {
    const dbRows = [makeDbSchedule('MONDAY'), makeDbSchedule('TUESDAY')];
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schedules: dbRows }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await useScheduleStore.getState().loadSchedulesForOffice('office-A');

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/offices/office-A/schedules?weekType=A'
    );
    const state = useScheduleStore.getState();
    expect(state.currentOfficeId).toBe('office-A');
    expect(Object.keys(state.generatedSchedules).sort()).toEqual(['MONDAY', 'TUESDAY']);
    // Should have written back to localStorage for fast future loads.
    const lsKey = 'schedule-designer:schedule-state:office-A';
    const lsRaw = lsMock.getItem(lsKey);
    expect(lsRaw).not.toBeNull();
    expect(Object.keys(JSON.parse(lsRaw!)).sort()).toEqual(['MONDAY', 'TUESDAY']);
  });

  it('merges DB-only days into localStorage-populated state', async () => {
    // Seed localStorage with MONDAY only
    const seed: Record<string, GenerationResult> = { MONDAY: makeDbSchedule('MONDAY') };
    lsMock.setItem(
      'schedule-designer:schedule-state:office-A',
      JSON.stringify(seed)
    );

    // DB returns MONDAY + TUESDAY
    const dbRows = [makeDbSchedule('MONDAY'), makeDbSchedule('TUESDAY')];
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schedules: dbRows }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await useScheduleStore.getState().loadSchedulesForOffice('office-A');

    const state = useScheduleStore.getState();
    expect(Object.keys(state.generatedSchedules).sort()).toEqual(['MONDAY', 'TUESDAY']);
    // TUESDAY came from DB (localStorage only had MONDAY).
    expect(state.generatedSchedules.TUESDAY).toBeDefined();
  });

  it('falls back silently when fetch rejects', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchSpy);

    // Nothing in localStorage either — we just shouldn't throw.
    await expect(
      useScheduleStore.getState().loadSchedulesForOffice('office-B')
    ).resolves.toBeUndefined();

    const state = useScheduleStore.getState();
    expect(state.currentOfficeId).toBe('office-B');
    expect(state.generatedSchedules).toEqual({});
  });

  it('does not clobber state if the user switches offices mid-fetch', async () => {
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetchSpy);

    const loadPromise = useScheduleStore.getState().loadSchedulesForOffice('office-A');

    // User switches to a different office before DB responds.
    useScheduleStore.setState({ currentOfficeId: 'office-B' });

    // Resolve the stale fetch with office-A data.
    resolveFetch({
      ok: true,
      json: async () => ({ schedules: [makeDbSchedule('MONDAY')] }),
    });
    await loadPromise;

    const state = useScheduleStore.getState();
    // Must still be on office-B and must NOT have office-A's schedules merged.
    expect(state.currentOfficeId).toBe('office-B');
    expect(state.generatedSchedules).toEqual({});
  });
});
