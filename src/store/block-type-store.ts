import { create } from 'zustand';
import type { BlockTypeInput } from '@/lib/engine/types';
import { defaultBlockTypes } from '@/lib/mock-data';

export const BLOCK_TYPE_STORAGE_KEY = 'appointment-type-library';

/** Extended block type with UI metadata */
export interface LibraryBlockType extends BlockTypeInput {
  color?: string;
  isCustom?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function seedDefaults(): LibraryBlockType[] {
  return defaultBlockTypes.map((bt) => ({ ...bt, isCustom: false }));
}

function readStorage(): LibraryBlockType[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BLOCK_TYPE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LibraryBlockType[];
  } catch {
    return null;
  }
}

function writeStorage(blockTypes: LibraryBlockType[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BLOCK_TYPE_STORAGE_KEY, JSON.stringify(blockTypes));
  } catch (e) {
    console.error('Failed to save block types:', e);
  }
}

function readProviderOverrides(): Record<string, ProviderBlockTypeOverride[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PROVIDER_OVERRIDES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeProviderOverrides(overrides: Record<string, ProviderBlockTypeOverride[]>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PROVIDER_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (e) {
    console.error('Failed to save provider overrides:', e);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Per-provider overrides: map from providerId → override values per block type label
// ────────────────────────────────────────────────────────────────────────────

export interface ProviderBlockTypeOverride {
  /** Block type label (e.g., "HP") — matches by label across all block types */
  label: string;
  /** Override minimum production amount */
  minimumAmount?: number;
  /** Override duration min */
  durationMin?: number;
  /** Override duration max */
  durationMax?: number;
}

export const PROVIDER_OVERRIDES_KEY = 'appointment-library-provider-overrides';

// ────────────────────────────────────────────────────────────────────────────
// Store interface
// ────────────────────────────────────────────────────────────────────────────

export interface BlockTypeState {
  blockTypes: LibraryBlockType[];
  /** Per-provider overrides: { [providerId]: ProviderBlockTypeOverride[] } */
  providerOverrides: Record<string, ProviderBlockTypeOverride[]>;

  /** Load from localStorage (call once on client mount) */
  initFromStorage: () => void;

  /** Add a new custom block type; returns the created entry */
  addBlockType: (data: Omit<LibraryBlockType, 'id' | 'isCustom'>) => { success: true; blockType: LibraryBlockType } | { success: false; error: string };

  /** Update an existing block type by id */
  updateBlockType: (id: string, data: Partial<Omit<LibraryBlockType, 'id'>>) => boolean;

  /** Delete a custom block type (default types cannot be deleted) */
  deleteBlockType: (id: string) => boolean;

  /** Reset the library to the seeded defaults */
  resetToDefaults: () => void;

  /** Set per-provider overrides for a specific provider */
  setProviderOverrides: (providerId: string, overrides: ProviderBlockTypeOverride[]) => void;

  /** Get block type effective values for a specific provider (merges defaults with overrides) */
  getBlockTypesForProvider: (providerId: string) => LibraryBlockType[];
}

// ────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ────────────────────────────────────────────────────────────────────────────

function validateBlockTypeData(
  data: Omit<LibraryBlockType, 'id' | 'isCustom'>,
  existingBlockTypes: LibraryBlockType[],
  excludeId?: string,
): string | null {
  if (!data.label || !data.label.trim()) {
    return 'Label is required';
  }

  if (data.durationMin == null || data.durationMin < 0) {
    return 'Minimum duration must be a non-negative number';
  }

  if (data.durationMax != null && data.durationMax < data.durationMin) {
    return 'Maximum duration must be greater than or equal to minimum duration';
  }

  // Duplicate label check (case-insensitive, within the same appliesToRole)
  const duplicate = existingBlockTypes.find(
    (bt) =>
      bt.id !== excludeId &&
      bt.label.trim().toLowerCase() === data.label.trim().toLowerCase() &&
      bt.appliesToRole === data.appliesToRole,
  );
  if (duplicate) {
    return `A block type named "${data.label}" already exists for ${data.appliesToRole}`;
  }

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

export const useBlockTypeStore = create<BlockTypeState>((set, get) => ({
  blockTypes: seedDefaults(),
  providerOverrides: {},

  initFromStorage: () => {
    const fromStorage = readStorage();
    const overrides = readProviderOverrides();
    if (fromStorage) {
      set({ blockTypes: fromStorage, providerOverrides: overrides });
    } else {
      // First visit: persist the defaults
      const defaults = seedDefaults();
      writeStorage(defaults);
      set({ blockTypes: defaults, providerOverrides: overrides });
    }
  },

  addBlockType: (data) => {
    const error = validateBlockTypeData(data, get().blockTypes);
    if (error) return { success: false, error };

    const newBlockType: LibraryBlockType = {
      ...data,
      label: data.label.trim(),
      id: generateId(),
      isCustom: true,
    };

    const next = [...get().blockTypes, newBlockType];
    set({ blockTypes: next });
    writeStorage(next);
    return { success: true, blockType: newBlockType };
  },

  updateBlockType: (id, data) => {
    const blockTypes = get().blockTypes;
    const idx = blockTypes.findIndex((bt) => bt.id === id);
    if (idx === -1) return false;

    // If label/role is changing, validate for duplicates
    const existing = blockTypes[idx];
    const merged = { ...existing, ...data };
    const error = validateBlockTypeData(merged, blockTypes, id);
    if (error) return false;

    const updated = blockTypes.map((bt) => (bt.id === id ? { ...bt, ...data } : bt));
    set({ blockTypes: updated });
    writeStorage(updated);
    return true;
  },

  deleteBlockType: (id) => {
    const blockTypes = get().blockTypes;
    const bt = blockTypes.find((b) => b.id === id);
    if (!bt || !bt.isCustom) return false;

    const next = blockTypes.filter((b) => b.id !== id);
    set({ blockTypes: next });
    writeStorage(next);
    return true;
  },

  resetToDefaults: () => {
    const defaults = seedDefaults();
    set({ blockTypes: defaults });
    writeStorage(defaults);
  },

  setProviderOverrides: (providerId, overrides) => {
    const current = get().providerOverrides;
    const updated = { ...current, [providerId]: overrides };
    set({ providerOverrides: updated });
    writeProviderOverrides(updated);
  },

  getBlockTypesForProvider: (providerId) => {
    const { blockTypes, providerOverrides } = get();
    const overrides = providerOverrides[providerId] || [];
    if (overrides.length === 0) return blockTypes;

    // Apply per-provider overrides on top of global defaults
    return blockTypes.map(bt => {
      const override = overrides.find(o => o.label.toLowerCase() === bt.label.toLowerCase());
      if (!override) return bt;
      return {
        ...bt,
        minimumAmount: override.minimumAmount ?? bt.minimumAmount,
        durationMin: override.durationMin ?? bt.durationMin,
        durationMax: override.durationMax ?? bt.durationMax,
      };
    });
  },
}));
