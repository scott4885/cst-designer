import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useOfficeStore } from '@/store/office-store';

/**
 * SSR resiliency tests
 * ────────────────────
 * Locks in the iter 6 fix: during Next.js SSR / static generation, the
 * office-store fetch helpers must short-circuit instead of hitting `fetch`
 * with a relative URL (which throws server-side). Refactors that re-introduce
 * a bare `fetch()` call before the SSR guard should break these tests.
 */

function resetStore() {
  useOfficeStore.setState({
    currentOffice: null,
    offices: [],
    isLoading: false,
  });
}

describe('office-store — SSR resiliency', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStore();
  });

  it('fetchOffices returns empty array when window is undefined (SSR)', async () => {
    // Simulate server-side environment — next-themes/next.js SSR path
    vi.stubGlobal('window', undefined);

    // Spy on fetch to prove it was NOT called during SSR
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchOffices } = useOfficeStore.getState();
    await fetchOffices();

    const state = useOfficeStore.getState();
    expect(state.offices).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchOffice returns null currentOffice when window is undefined (SSR)', async () => {
    vi.stubGlobal('window', undefined);

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchOffice } = useOfficeStore.getState();
    await fetchOffice('any-id');

    const state = useOfficeStore.getState();
    expect(state.currentOffice).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetchOffices does not throw when SSR-guarded (no unhandled rejection)', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('fetch', vi.fn());

    const { fetchOffices } = useOfficeStore.getState();
    await expect(fetchOffices()).resolves.toBeUndefined();
  });

  it('fetchOffice does not throw when SSR-guarded (no unhandled rejection)', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('fetch', vi.fn());

    const { fetchOffice } = useOfficeStore.getState();
    await expect(fetchOffice('abc')).resolves.toBeUndefined();
  });
});
