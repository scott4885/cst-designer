import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBlockTypeStore, BLOCK_TYPE_STORAGE_KEY, type LibraryBlockType } from '@/store/block-type-store';
import { defaultBlockTypes } from '@/lib/mock-data';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function resetStore() {
  // Wipe localStorage & reset store state to seed defaults
  localStorage.removeItem(BLOCK_TYPE_STORAGE_KEY);
  useBlockTypeStore.setState({
    blockTypes: defaultBlockTypes.map((bt) => ({ ...bt, isCustom: false })),
  });
}

function getStore() {
  return useBlockTypeStore.getState();
}

const sampleCustomType: Omit<LibraryBlockType, 'id' | 'isCustom'> = {
  label: 'Implant Placement',
  description: 'Full implant surgery',
  appliesToRole: 'DOCTOR',
  durationMin: 90,
  durationMax: 120,
  minimumAmount: 2500,
  color: '#6366f1',
};

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('useBlockTypeStore - CRUD Operations', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('seeds with the default block types', () => {
      const { blockTypes } = getStore();
      expect(blockTypes.length).toBe(defaultBlockTypes.length);
    });

    it('marks all seeded types as non-custom', () => {
      const { blockTypes } = getStore();
      expect(blockTypes.every((bt) => bt.isCustom === false)).toBe(true);
    });

    it('preserves all default type fields', () => {
      const { blockTypes } = getStore();
      const hpDefault = blockTypes.find((bt) => bt.id === 'hp-default');
      expect(hpDefault).toBeDefined();
      expect(hpDefault?.label).toBe('HP');
      expect(hpDefault?.appliesToRole).toBe('DOCTOR');
    });
  });

  // ── initFromStorage ───────────────────────────────────────────────────────

  describe('initFromStorage', () => {
    it('loads types from localStorage when present', () => {
      const customData: LibraryBlockType[] = [
        { id: 'test-1', label: 'Test Type', appliesToRole: 'DOCTOR', durationMin: 30, isCustom: true },
      ];
      localStorage.setItem(BLOCK_TYPE_STORAGE_KEY, JSON.stringify(customData));

      getStore().initFromStorage();

      expect(getStore().blockTypes).toHaveLength(1);
      expect(getStore().blockTypes[0].label).toBe('Test Type');
    });

    it('seeds defaults when localStorage is empty', () => {
      localStorage.removeItem(BLOCK_TYPE_STORAGE_KEY);
      getStore().initFromStorage();

      const { blockTypes } = getStore();
      expect(blockTypes.length).toBe(defaultBlockTypes.length);
    });

    it('persists defaults to localStorage on first init', () => {
      localStorage.removeItem(BLOCK_TYPE_STORAGE_KEY);
      getStore().initFromStorage();

      const stored = localStorage.getItem(BLOCK_TYPE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(defaultBlockTypes.length);
    });
  });

  // ── addBlockType ──────────────────────────────────────────────────────────

  describe('addBlockType', () => {
    it('adds a new custom block type', () => {
      const result = getStore().addBlockType(sampleCustomType);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const { blockTypes } = getStore();
      const added = blockTypes.find((bt) => bt.id === result.blockType.id);
      expect(added).toBeDefined();
      expect(added?.label).toBe('Implant Placement');
      expect(added?.isCustom).toBe(true);
    });

    it('assigns a unique id', () => {
      const r1 = getStore().addBlockType(sampleCustomType);
      const r2 = getStore().addBlockType({ ...sampleCustomType, label: 'Another Type' });

      expect(r1.success && r2.success).toBe(true);
      if (!r1.success || !r2.success) return;
      expect(r1.blockType.id).not.toBe(r2.blockType.id);
    });

    it('persists to localStorage after adding', () => {
      getStore().addBlockType(sampleCustomType);

      const stored = localStorage.getItem(BLOCK_TYPE_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed: LibraryBlockType[] = JSON.parse(stored!);
      expect(parsed.some((bt) => bt.label === 'Implant Placement')).toBe(true);
    });

    it('stores all provided fields', () => {
      const result = getStore().addBlockType(sampleCustomType);
      if (!result.success) throw new Error('Expected success');

      const bt = result.blockType;
      expect(bt.description).toBe('Full implant surgery');
      expect(bt.durationMin).toBe(90);
      expect(bt.durationMax).toBe(120);
      expect(bt.minimumAmount).toBe(2500);
      expect(bt.color).toBe('#6366f1');
    });

    // Edge cases

    it('rejects an empty label', () => {
      const result = getStore().addBlockType({ ...sampleCustomType, label: '' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/label/i);
    });

    it('rejects a whitespace-only label', () => {
      const result = getStore().addBlockType({ ...sampleCustomType, label: '   ' });
      expect(result.success).toBe(false);
    });

    it('rejects a negative durationMin', () => {
      const result = getStore().addBlockType({ ...sampleCustomType, durationMin: -10 });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/duration/i);
    });

    it('rejects durationMax less than durationMin', () => {
      const result = getStore().addBlockType({ ...sampleCustomType, durationMin: 60, durationMax: 30 });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/duration/i);
    });

    it('rejects duplicate label + role combination (case-insensitive)', () => {
      getStore().addBlockType(sampleCustomType); // adds DOCTOR "Implant Placement"

      // Same label, same role → duplicate
      const result = getStore().addBlockType({ ...sampleCustomType, label: 'implant placement' });
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/already exists/i);
    });

    it('allows same label for different roles', () => {
      // Use a label that does not exist in the default block types for either role
      const uniqueLabel = 'CustomXRayReview';
      getStore().addBlockType({ ...sampleCustomType, label: uniqueLabel, appliesToRole: 'DOCTOR' });
      const result = getStore().addBlockType({ ...sampleCustomType, label: uniqueLabel, appliesToRole: 'HYGIENIST' });
      expect(result.success).toBe(true);
    });

    it('does not add to store state on failure', () => {
      const before = getStore().blockTypes.length;
      getStore().addBlockType({ ...sampleCustomType, label: '' });
      expect(getStore().blockTypes.length).toBe(before);
    });
  });

  // ── updateBlockType ───────────────────────────────────────────────────────

  describe('updateBlockType', () => {
    it('updates an existing block type', () => {
      const addResult = getStore().addBlockType(sampleCustomType);
      if (!addResult.success) throw new Error('setup failed');

      const success = getStore().updateBlockType(addResult.blockType.id, {
        label: 'Updated Implant',
        durationMin: 100,
      });

      expect(success).toBe(true);
      const bt = getStore().blockTypes.find((b) => b.id === addResult.blockType.id);
      expect(bt?.label).toBe('Updated Implant');
      expect(bt?.durationMin).toBe(100);
    });

    it('returns false for non-existent id', () => {
      const success = getStore().updateBlockType('does-not-exist', { label: 'X' });
      expect(success).toBe(false);
    });

    it('allows editing default block types', () => {
      const defaultType = getStore().blockTypes.find((bt) => bt.id === 'hp-default');
      expect(defaultType).toBeDefined();

      const success = getStore().updateBlockType('hp-default', { durationMin: 75 });
      expect(success).toBe(true);

      const updated = getStore().blockTypes.find((bt) => bt.id === 'hp-default');
      expect(updated?.durationMin).toBe(75);
    });

    it('rejects update that creates a duplicate label+role', () => {
      const r1 = getStore().addBlockType({ ...sampleCustomType, label: 'Type A', appliesToRole: 'DOCTOR' });
      const r2 = getStore().addBlockType({ ...sampleCustomType, label: 'Type B', appliesToRole: 'DOCTOR' });
      if (!r1.success || !r2.success) throw new Error('setup failed');

      // Try to rename Type B to Type A (same role)
      const success = getStore().updateBlockType(r2.blockType.id, { label: 'Type A' });
      expect(success).toBe(false);
    });

    it('persists changes to localStorage', () => {
      const addResult = getStore().addBlockType(sampleCustomType);
      if (!addResult.success) throw new Error('setup failed');

      getStore().updateBlockType(addResult.blockType.id, { label: 'Modified' });

      const stored = JSON.parse(localStorage.getItem(BLOCK_TYPE_STORAGE_KEY)!) as LibraryBlockType[];
      expect(stored.some((bt) => bt.label === 'Modified')).toBe(true);
    });
  });

  // ── deleteBlockType ───────────────────────────────────────────────────────

  describe('deleteBlockType', () => {
    it('deletes a custom block type', () => {
      const addResult = getStore().addBlockType(sampleCustomType);
      if (!addResult.success) throw new Error('setup failed');

      const success = getStore().deleteBlockType(addResult.blockType.id);
      expect(success).toBe(true);

      const bt = getStore().blockTypes.find((b) => b.id === addResult.blockType.id);
      expect(bt).toBeUndefined();
    });

    it('returns false when trying to delete a default (built-in) type', () => {
      const success = getStore().deleteBlockType('hp-default');
      expect(success).toBe(false);
      expect(getStore().blockTypes.find((bt) => bt.id === 'hp-default')).toBeDefined();
    });

    it('returns false for non-existent id', () => {
      const success = getStore().deleteBlockType('ghost-id');
      expect(success).toBe(false);
    });

    it('persists deletion to localStorage', () => {
      const addResult = getStore().addBlockType(sampleCustomType);
      if (!addResult.success) throw new Error('setup failed');

      getStore().deleteBlockType(addResult.blockType.id);

      const stored = JSON.parse(localStorage.getItem(BLOCK_TYPE_STORAGE_KEY)!) as LibraryBlockType[];
      expect(stored.some((bt) => bt.id === addResult.blockType.id)).toBe(false);
    });

    it('does not affect other block types', () => {
      const r1 = getStore().addBlockType({ ...sampleCustomType, label: 'Keep Me' });
      const r2 = getStore().addBlockType({ ...sampleCustomType, label: 'Delete Me' });
      if (!r1.success || !r2.success) throw new Error('setup failed');

      getStore().deleteBlockType(r2.blockType.id);

      expect(getStore().blockTypes.find((bt) => bt.id === r1.blockType.id)).toBeDefined();
    });
  });

  // ── resetToDefaults ───────────────────────────────────────────────────────

  describe('resetToDefaults', () => {
    it('removes all custom types', () => {
      getStore().addBlockType(sampleCustomType);
      getStore().addBlockType({ ...sampleCustomType, label: 'Another Custom' });

      getStore().resetToDefaults();

      const { blockTypes } = getStore();
      expect(blockTypes.every((bt) => !bt.isCustom)).toBe(true);
    });

    it('restores the default count', () => {
      getStore().addBlockType(sampleCustomType);
      getStore().resetToDefaults();

      expect(getStore().blockTypes.length).toBe(defaultBlockTypes.length);
    });

    it('persists reset to localStorage', () => {
      getStore().addBlockType(sampleCustomType);
      getStore().resetToDefaults();

      const stored = JSON.parse(localStorage.getItem(BLOCK_TYPE_STORAGE_KEY)!) as LibraryBlockType[];
      expect(stored.length).toBe(defaultBlockTypes.length);
      expect(stored.every((bt) => !bt.isCustom)).toBe(true);
    });
  });
});
