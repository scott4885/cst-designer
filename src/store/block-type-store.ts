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

// ────────────────────────────────────────────────────────────────────────────
// Store interface
// ────────────────────────────────────────────────────────────────────────────

export interface BlockTypeState {
  blockTypes: LibraryBlockType[];

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

  initFromStorage: () => {
    const fromStorage = readStorage();
    if (fromStorage) {
      set({ blockTypes: fromStorage });
    } else {
      // First visit: persist the defaults
      const defaults = seedDefaults();
      writeStorage(defaults);
      set({ blockTypes: defaults });
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
}));
