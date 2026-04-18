import { create } from 'zustand';
import { GenerationResult, BlockTypeInput, ProviderInput } from '@/lib/engine/types';
import { calculateProductionSummary } from '@/lib/engine/calculator';
import { detectConflicts } from '@/lib/engine/stagger';
import { parseAmountFromLabel } from '@/lib/engine/generator';
import { detectDTimeConflicts } from '@/lib/engine/da-time';

export type RotationWeek = 'A' | 'B' | 'C' | 'D';

// ---------------------------------------------------------------------------
// Undo/Redo stack
// ---------------------------------------------------------------------------
const MAX_UNDO_DEPTH = 50;

interface UndoEntry {
  generatedSchedules: Record<string, GenerationResult>;
}

interface ScheduleState {
  generatedSchedules: Record<string, GenerationResult>; // keyed by dayOfWeek
  activeDay: string;
  /** Active schedule week — 'A' standard, 'B' alternate, 'C'/'D' for 4-week rotation. */
  activeWeek: RotationWeek;
  isGenerating: boolean;
  isExporting: boolean;
  currentOfficeId: string | null;
  // Undo/Redo
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  canUndo: boolean;
  canRedo: boolean;
  setActiveDay: (day: string) => void;
  /** Switch to a different week and reload persisted schedules for that week. */
  setActiveWeek: (week: RotationWeek) => void;
  setSchedules: (schedules: GenerationResult[], officeId?: string) => void;
  setGenerating: (v: boolean) => void;
  setExporting: (v: boolean) => void;
  clearSchedules: () => void;
  loadSchedulesForOffice: (officeId: string) => Promise<void>;
  /**
   * Copy Week A's persisted schedules into the target week (B/C/D).
   * Returns true if Week A had data to copy, false if Week A was empty.
   */
  copyWeekFromA: (targetWeek: RotationWeek, officeId: string) => boolean;
  // Interactive editing methods
  placeBlockInDay: (day: string, time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => boolean;
  removeBlockInDay: (day: string, time: string, providerId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  moveBlockInDay: (day: string, fromTime: string, fromProviderId: string, toTime: string, toProviderId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  updateBlockInDay: (day: string, time: string, providerId: string, newBlockType: BlockTypeInput, newDurationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[], customProductionAmount?: number | null) => void;
  // Undo/Redo
  undo: () => void;
  redo: () => void;
}

function generateBlockInstanceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Parse a virtual provider ID that may contain an operatory suffix ("realId::OP1").
 * Returns the real provider ID and optional operatory component.
 * Used by multi-op provider support to route store slot operations to the correct operatory slot.
 */
function parseProviderId(id: string): { realId: string; operatory?: string } {
  const colonIdx = id.lastIndexOf('::');
  if (colonIdx === -1) return { realId: id };
  return { realId: id.slice(0, colonIdx), operatory: id.slice(colonIdx + 2) };
}

/**
 * Find a slot index by time + providerId (+ optional operatory for multi-op disambiguation).
 * When an operatory is supplied (from a virtual ID like "doc-id::OP1"), only slots in
 * that operatory are matched so we don't accidentally pick the wrong multi-op slot.
 */
function findSlotIndex(
  slots: GenerationResult['slots'],
  time: string,
  realProviderId: string,
  operatory?: string
): number {
  return slots.findIndex(s => {
    if (s.time !== time || s.providerId !== realProviderId) return false;
    if (operatory && s.operatory) return s.operatory === operatory;
    return true;
  });
}

/**
 * Find a provider from the providers list, supporting virtual IDs with "::OP" suffix.
 */
function findProvider(providers: ProviderInput[], id: string): ProviderInput | undefined {
  const { realId } = parseProviderId(id);
  return providers.find(p => p.id === realId);
}

function recalcProductionSummary(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): GenerationResult {
  const productionSummary = providers.map(provider => {
    const providerSlots = schedule.slots.filter(
      s => s.providerId === provider.id && s.blockTypeId !== null && !s.isBreak
    );

    // Group consecutive slots by blockInstanceId (when available) or blockTypeId+operatory.
    // This ensures:
    //   1. Adjacent blocks of the same type placed as separate instances stay distinct (blockInstanceId)
    //   2. Multi-op doctor slots interleaved in the array are counted per-operatory (blockTypeId::operatory)
    //   3. Each multi-row block is counted ONCE (not per row) — fixes production per-appointment calc
    const blocks: { blockTypeId: string; blockLabel: string; customProductionAmount?: number | null }[] = [];
    let currentGroupKey: string | null = null;

    for (const slot of providerSlots) {
      // Use blockInstanceId as group key when available (manually placed blocks)
      // else fall back to blockTypeId::operatory to separate multi-op interleaved slots
      const groupKey = slot.blockInstanceId
        ? slot.blockInstanceId
        : `${slot.blockTypeId}::${slot.operatory ?? ''}`;
      if (groupKey !== currentGroupKey) {
        blocks.push({
          blockTypeId: slot.blockTypeId!,
          blockLabel: slot.blockLabel || '',
          customProductionAmount: slot.customProductionAmount,
        });
        currentGroupKey = groupKey;
      }
    }

    const scheduledBlocks = blocks.map(block => {
      // Use per-block override if set; otherwise look up the block type default
      const bt = blockTypes.find(b => b.id === block.blockTypeId);
      const amount = block.customProductionAmount != null
        ? block.customProductionAmount
        : (bt != null ? (bt.minimumAmount ?? 0) : parseAmountFromLabel(block.blockLabel));
      return {
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        amount,
        // Pass through minimumAmount so calculateProductionSummary can compute highProductionScheduled
        minimumAmount: bt?.minimumAmount ?? 0,
      };
    });

    return calculateProductionSummary(provider, scheduledBlocks);
  });

  // Recalculate conflict warnings, preserving non-conflict warnings
  const conflicts = detectConflicts(schedule, providers);
  const dTimeConflicts = detectDTimeConflicts(schedule, providers, blockTypes);

  const nonConflictWarnings = (schedule.warnings ?? []).filter(
    w => !w.startsWith('Conflict at ') && !w.startsWith('D-time conflict')
  );
  const conflictWarnings = conflicts.map(
    (c) => `Conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`
  );
  const dTimeWarnings = dTimeConflicts.map(
    (c) => `D-time conflict at ${c.time}: ${c.providerName} has overlapping hands-on time in ${c.operatories.join(' and ')} (${c.blockLabels.join(', ')})`
  );

  return { ...schedule, productionSummary, warnings: [...nonConflictWarnings, ...conflictWarnings, ...dTimeWarnings] };
}

// ---------------------------------------------------------------------------
// localStorage persistence helpers
// ---------------------------------------------------------------------------

const LS_SCHEDULE_PREFIX = 'schedule-designer:schedule-state:';

function lsKey(officeId: string, week: RotationWeek = 'A'): string {
  return week === 'A'
    ? `${LS_SCHEDULE_PREFIX}${officeId}`
    : `${LS_SCHEDULE_PREFIX}${officeId}:week${week}`;
}

function persistSchedules(officeId: string, schedulesMap: Record<string, GenerationResult>, week: RotationWeek = 'A'): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(lsKey(officeId, week), JSON.stringify(schedulesMap));
    }
  } catch (e) {
    console.warn('Failed to persist schedules to localStorage:', e);
  }
}

function loadPersistedSchedules(officeId: string, week: RotationWeek = 'A'): Record<string, GenerationResult> | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem(lsKey(officeId, week));
      if (raw) return JSON.parse(raw) as Record<string, GenerationResult>;
    }
  } catch (e) {
    console.warn('Failed to load persisted schedules from localStorage:', e);
  }
  return null;
}

function clearPersistedSchedules(officeId: string, week: RotationWeek = 'A'): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(lsKey(officeId, week));
    }
  } catch (e) {
    console.warn('Failed to clear persisted schedules from localStorage:', e);
  }
}

/**
 * Push current state onto the undo stack (called before every mutation).
 */
function pushUndo(get: () => ScheduleState, set: (partial: Partial<ScheduleState>) => void) {
  const { generatedSchedules, undoStack } = get();
  const entry: UndoEntry = { generatedSchedules: { ...generatedSchedules } };
  const newStack = [...undoStack, entry].slice(-MAX_UNDO_DEPTH);
  set({ undoStack: newStack, redoStack: [], canUndo: true, canRedo: false });
}

// ---------------------------------------------------------------------------
// Debounced API persistence (2-second delay)
// ---------------------------------------------------------------------------
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedApiPersist(officeId: string, schedulesMap: Record<string, GenerationResult>, week: RotationWeek) {
  // Always persist to localStorage immediately (fast, reliable)
  persistSchedules(officeId, schedulesMap, week);

  // Debounce the API call
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      for (const [day, result] of Object.entries(schedulesMap)) {
        await fetch(`/api/offices/${officeId}/schedules/auto-save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayOfWeek: day,
            weekType: week,
            slots: result.slots,
            productionSummary: result.productionSummary,
            warnings: result.warnings,
          }),
        }).catch(() => {}); // silently fail API persistence — localStorage is the fallback
      }
    } catch {
      // API persistence is best-effort
    }
  }, 2000);
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  generatedSchedules: {},
  activeDay: 'MONDAY',
  activeWeek: 'A' as RotationWeek,
  isGenerating: false,
  isExporting: false,
  currentOfficeId: null,
  undoStack: [],
  redoStack: [],
  canUndo: false,
  canRedo: false,

  setActiveDay: (day: string) => set({ activeDay: day }),

  setActiveWeek: (week: RotationWeek) => {
    const { currentOfficeId } = get();
    set({ activeWeek: week, generatedSchedules: {} });
    if (currentOfficeId) {
      const persisted = loadPersistedSchedules(currentOfficeId, week);
      if (persisted && Object.keys(persisted).length > 0) {
        set({ generatedSchedules: persisted });
      }
    }
  },

  setSchedules: (schedules: GenerationResult[], officeId?: string) => {
    const schedulesMap: Record<string, GenerationResult> = {};
    schedules.forEach((schedule) => {
      schedulesMap[schedule.dayOfWeek] = schedule;
    });

    const resolvedOfficeId = officeId || get().currentOfficeId;
    const { activeWeek } = get();

    // Persist to localStorage so schedule survives page refresh / navigation
    if (resolvedOfficeId) {
      persistSchedules(resolvedOfficeId, schedulesMap, activeWeek);
    }

    set({
      generatedSchedules: schedulesMap,
      currentOfficeId: resolvedOfficeId,
    });
  },

  setGenerating: (v: boolean) => set({ isGenerating: v }),
  setExporting: (v: boolean) => set({ isExporting: v }),

  clearSchedules: () => {
    const { currentOfficeId, activeWeek } = get();
    if (currentOfficeId) {
      clearPersistedSchedules(currentOfficeId, activeWeek);
    }
    set({ generatedSchedules: {} });
  },

  loadSchedulesForOffice: async (officeId: string) => {
    const { currentOfficeId, activeWeek } = get();

    // If already loaded for this office+week (e.g. navigated back in same session), keep in-memory state
    if (currentOfficeId === officeId && Object.keys(get().generatedSchedules).length > 0) {
      return;
    }

    // Iter 12a fix: Cross-device localStorage masking DB
    // Prior implementation loaded from localStorage only, so a second device
    // with empty localStorage would see an empty schedule even when DB had
    // data. Fix: load localStorage (fast path) AND fetch the DB in parallel.
    // If DB returns more/fresher data than localStorage, use DB and overwrite
    // localStorage so the next load is fast.
    const persisted = loadPersistedSchedules(officeId, activeWeek);
    if (persisted && Object.keys(persisted).length > 0) {
      // Fast path: show localStorage data immediately
      set({
        currentOfficeId: officeId,
        generatedSchedules: persisted,
      });
    } else {
      // No local data — at minimum set the office id
      set({
        currentOfficeId: officeId,
        generatedSchedules: {},
      });
    }

    // Parallel DB fetch — runs regardless of localStorage state. If DB has
    // data that localStorage does not, merge it in. Never throws: API
    // failures fall back to whatever localStorage gave us.
    try {
      if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
      const response = await fetch(
        `/api/offices/${officeId}/schedules?weekType=${activeWeek}`,
      );
      if (!response.ok) return;
      const data = await response.json();
      const rows: Array<{ dayOfWeek: string; slots: unknown; productionSummary: unknown; warnings: unknown }> =
        data?.schedules ?? [];
      if (rows.length === 0) return;

      // Build a dayOfWeek → GenerationResult map from DB rows.
      const dbSchedules: Record<string, GenerationResult> = {};
      for (const row of rows) {
        if (!row?.dayOfWeek) continue;
        // If we already have a row for this day from DB, keep the first one
        // (ordered by updatedAt desc per data-access.ts).
        if (dbSchedules[row.dayOfWeek]) continue;
        dbSchedules[row.dayOfWeek] = {
          dayOfWeek: row.dayOfWeek,
          slots: (row.slots as GenerationResult['slots']) ?? [],
          productionSummary:
            (row.productionSummary as GenerationResult['productionSummary']) ?? [],
          warnings: (row.warnings as string[]) ?? [],
        };
      }

      // Stale state can happen if the user switched offices mid-fetch; bail
      // out so we don't clobber a different office's state.
      if (get().currentOfficeId !== officeId) return;

      // Merge: prefer DB data when it has days that localStorage lacks, OR
      // when localStorage was empty. If both have the same day, localStorage
      // wins (it's the edited-in-memory source of truth for this session).
      const current = get().generatedSchedules;
      const merged: Record<string, GenerationResult> = { ...dbSchedules, ...current };
      const mergedKeys = Object.keys(merged);
      const currentKeys = Object.keys(current);
      const isFresher =
        mergedKeys.length > currentKeys.length ||
        (currentKeys.length === 0 && mergedKeys.length > 0);
      if (!isFresher) return;

      set({ generatedSchedules: merged });
      // Overwrite localStorage so subsequent same-device loads are fast
      persistSchedules(officeId, merged, activeWeek);
    } catch {
      // Best-effort: API failures fall back silently to localStorage/in-memory.
    }
  },

  undo: () => {
    const { undoStack, generatedSchedules, redoStack, currentOfficeId, activeWeek } = get();
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);
    const newRedo = [...redoStack, { generatedSchedules }].slice(-MAX_UNDO_DEPTH);
    set({
      generatedSchedules: prev.generatedSchedules,
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: newUndo.length > 0,
      canRedo: true,
    });
    if (currentOfficeId) debouncedApiPersist(currentOfficeId, prev.generatedSchedules, activeWeek);
  },

  redo: () => {
    const { redoStack, generatedSchedules, undoStack, currentOfficeId, activeWeek } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);
    const newUndo = [...undoStack, { generatedSchedules }].slice(-MAX_UNDO_DEPTH);
    set({
      generatedSchedules: next.generatedSchedules,
      undoStack: newUndo,
      redoStack: newRedo,
      canUndo: true,
      canRedo: newRedo.length > 0,
    });
    if (currentOfficeId) debouncedApiPersist(currentOfficeId, next.generatedSchedules, activeWeek);
  },

  placeBlockInDay: (day, time, providerId, blockType, durationSlots, providers, blockTypes) => {
    pushUndo(get, set);
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return false;

    const newSlots = [...schedule.slots];
    // Support virtual provider IDs (e.g. "doc-id::OP1" for multi-op providers)
    const { realId, operatory } = parseProviderId(providerId);
    const provider = findProvider(providers, providerId);
    if (!provider) return false;

    // Find starting slot index, using operatory for multi-op disambiguation
    const startIdx = findSlotIndex(newSlots, time, realId, operatory);
    if (startIdx === -1) return false;

    // Get all slots for this provider in time order (filter by realId + operatory for multi-op)
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === realId && (!operatory || !x.s.operatory || x.s.operatory === operatory))
      .map(x => x.i);

    const startProvIdx = providerIndices.indexOf(startIdx);
    if (startProvIdx === -1) return false;

    const label = blockType.minimumAmount
      ? `${blockType.label}>$${blockType.minimumAmount}`
      : blockType.label;

    const staffingCode = provider.role === 'DOCTOR' ? 'D' : 'H';
    // Each placed block gets a unique instance ID so adjacent same-type blocks stay separate
    const blockInstanceId = generateBlockInstanceId();

    for (let j = 0; j < durationSlots; j++) {
      const pIdx = startProvIdx + j;
      if (pIdx >= providerIndices.length) break;
      const slotIdx = providerIndices[pIdx];
      if (newSlots[slotIdx].isBreak) break;

      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId: blockType.id,
        blockLabel: label,
        staffingCode: staffingCode as 'D' | 'H',
        blockInstanceId,
        customProductionAmount: blockType.minimumAmount ?? null,
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    // Persist changes (localStorage + debounced API)
    const officeIdForPersist = get().currentOfficeId;
    if (officeIdForPersist) debouncedApiPersist(officeIdForPersist, newSchedules, get().activeWeek);
    return true;
  },

  removeBlockInDay: (day, time, providerId, providers, blockTypes) => {
    pushUndo(get, set);
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];
    // Support virtual provider IDs for multi-op
    const { realId, operatory } = parseProviderId(providerId);

    // Find the clicked slot
    const clickedIdx = findSlotIndex(newSlots, time, realId, operatory);
    if (clickedIdx === -1) return;

    const blockTypeId = newSlots[clickedIdx].blockTypeId;
    if (!blockTypeId) return;

    const blockInstanceId = newSlots[clickedIdx].blockInstanceId ?? null;

    const provider = findProvider(providers, providerId);
    if (!provider) return;

    // Find all contiguous slots for this block instance for this provider (operatory-aware)
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === realId && (!operatory || !x.s.operatory || x.s.operatory === operatory))
      .map(x => x.i);

    const clickedProvIdx = providerIndices.indexOf(clickedIdx);

    // Use blockInstanceId for boundary detection when available (prevents merging adjacent same-type blocks)
    const sameBlock = (idx: number) => {
      const s = newSlots[providerIndices[idx]];
      if (blockInstanceId) return s.blockInstanceId === blockInstanceId;
      return s.blockTypeId === blockTypeId;
    };

    // Expand backwards to find start of block
    let blockStart = clickedProvIdx;
    while (blockStart > 0 && sameBlock(blockStart - 1)) {
      blockStart--;
    }

    // Expand forwards to find end of block
    let blockEnd = clickedProvIdx;
    while (blockEnd < providerIndices.length - 1 && sameBlock(blockEnd + 1)) {
      blockEnd++;
    }

    const staffingCode = provider.role === 'DOCTOR' ? 'D' : 'H';

    // Clear all slots in this block
    for (let i = blockStart; i <= blockEnd; i++) {
      const slotIdx = providerIndices[i];
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId: null,
        blockLabel: null,
        staffingCode: staffingCode as 'D' | 'H',
        blockInstanceId: null,
        customProductionAmount: null,
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    // Persist changes (localStorage + debounced API)
    const officeIdForPersist = get().currentOfficeId;
    if (officeIdForPersist) debouncedApiPersist(officeIdForPersist, newSchedules, get().activeWeek);
  },

  moveBlockInDay: (day, fromTime, fromProviderId, toTime, toProviderId, providers, blockTypes) => {
    pushUndo(get, set);
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];

    // Support virtual provider IDs (e.g. "doc-id::OP1" for multi-op)
    const { realId: fromRealId, operatory: fromOp } = parseProviderId(fromProviderId);
    const { realId: toRealId, operatory: toOp } = parseProviderId(toProviderId);

    // Find source block slot using operatory for precise multi-op matching
    const fromIdx = findSlotIndex(newSlots, fromTime, fromRealId, fromOp);
    if (fromIdx === -1) return;

    const blockTypeId = newSlots[fromIdx].blockTypeId;
    const blockLabel = newSlots[fromIdx].blockLabel;
    const blockInstanceId = newSlots[fromIdx].blockInstanceId ?? null;
    const customProductionAmount = newSlots[fromIdx].customProductionAmount ?? null;
    if (!blockTypeId) return;

    const fromProvider = findProvider(providers, fromProviderId);
    const toProvider = findProvider(providers, toProviderId);
    if (!fromProvider || !toProvider) return;

    // Find all slots of the source block (operatory-aware for multi-op)
    const fromProviderIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === fromRealId && (!fromOp || !x.s.operatory || x.s.operatory === fromOp))
      .map(x => x.i);

    const fromProvIdx = fromProviderIndices.indexOf(fromIdx);
    const sameSourceBlock = (idx: number) => {
      const s = newSlots[fromProviderIndices[idx]];
      if (blockInstanceId) return s.blockInstanceId === blockInstanceId;
      return s.blockTypeId === blockTypeId;
    };
    let blockStart = fromProvIdx;
    while (blockStart > 0 && sameSourceBlock(blockStart - 1)) {
      blockStart--;
    }
    let blockEnd = fromProvIdx;
    while (blockEnd < fromProviderIndices.length - 1 && sameSourceBlock(blockEnd + 1)) {
      blockEnd++;
    }
    const blockLen = blockEnd - blockStart + 1;

    // Find destination (operatory-aware)
    const toIdx = findSlotIndex(newSlots, toTime, toRealId, toOp);
    if (toIdx === -1) return;

    const toProviderIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === toRealId && (!toOp || !x.s.operatory || x.s.operatory === toOp))
      .map(x => x.i);

    const toProvIdx = toProviderIndices.indexOf(toIdx);
    if (toProvIdx === -1) return;

    // Check if destination has enough contiguous empty slots
    for (let j = 0; j < blockLen; j++) {
      const pIdx = toProvIdx + j;
      if (pIdx >= toProviderIndices.length) return; // Not enough room
      const slotIdx = toProviderIndices[pIdx];
      const slot = newSlots[slotIdx];
      if (slot.isBreak) return;
      // Allow if it's empty or part of the source block instance being moved
      const isSourceSlot = blockInstanceId
        ? slot.blockInstanceId === blockInstanceId && slot.providerId === fromRealId
        : slot.providerId === fromRealId && slot.blockTypeId === blockTypeId;
      if (slot.blockTypeId !== null && !isSourceSlot) return;
    }

    const fromStaffingCode = fromProvider.role === 'DOCTOR' ? 'D' : 'H';
    const toStaffingCode = toProvider.role === 'DOCTOR' ? 'D' : 'H';

    // Clear source
    for (let i = blockStart; i <= blockEnd; i++) {
      const slotIdx = fromProviderIndices[i];
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId: null,
        blockLabel: null,
        staffingCode: fromStaffingCode as 'D' | 'H',
        blockInstanceId: null,
        customProductionAmount: null,
      };
    }

    // Place at destination (preserve blockInstanceId and customProductionAmount)
    for (let j = 0; j < blockLen; j++) {
      const pIdx = toProvIdx + j;
      const slotIdx = toProviderIndices[pIdx];
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId,
        blockLabel,
        staffingCode: toStaffingCode as 'D' | 'H',
        blockInstanceId,
        customProductionAmount,
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    // Persist changes (localStorage + debounced API)
    const officeIdForPersist = get().currentOfficeId;
    if (officeIdForPersist) debouncedApiPersist(officeIdForPersist, newSchedules, get().activeWeek);
  },

  copyWeekFromA: (targetWeek: RotationWeek, officeId: string): boolean => {
    const weekAData = loadPersistedSchedules(officeId, 'A');
    if (!weekAData || Object.keys(weekAData).length === 0) {
      return false;
    }
    persistSchedules(officeId, weekAData, targetWeek);
    // If currently viewing the target week, load the copied data into memory
    const { activeWeek } = get();
    if (activeWeek === targetWeek) {
      set({ generatedSchedules: weekAData, currentOfficeId: officeId });
    }
    return true;
  },

  updateBlockInDay: (day, time, providerId, newBlockType, newDurationSlots, providers, blockTypes, customProductionAmount) => {
    pushUndo(get, set);
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];
    // Support virtual provider IDs for multi-op
    const { realId, operatory } = parseProviderId(providerId);
    const provider = findProvider(providers, providerId);
    if (!provider) return;

    // Find the clicked slot (operatory-aware)
    const clickedIdx = findSlotIndex(newSlots, time, realId, operatory);
    if (clickedIdx === -1) return;

    const oldBlockTypeId = newSlots[clickedIdx].blockTypeId;
    if (!oldBlockTypeId) return;

    const oldBlockInstanceId = newSlots[clickedIdx].blockInstanceId ?? null;

    // Find old block boundaries (use blockInstanceId when available to avoid merging adjacent same-type blocks)
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === realId && (!operatory || !x.s.operatory || x.s.operatory === operatory))
      .map(x => x.i);

    const clickedProvIdx = providerIndices.indexOf(clickedIdx);
    const sameBlock = (idx: number) => {
      const s = newSlots[providerIndices[idx]];
      if (oldBlockInstanceId) return s.blockInstanceId === oldBlockInstanceId;
      return s.blockTypeId === oldBlockTypeId;
    };
    let blockStart = clickedProvIdx;
    while (blockStart > 0 && sameBlock(blockStart - 1)) {
      blockStart--;
    }
    let blockEnd = clickedProvIdx;
    while (blockEnd < providerIndices.length - 1 && sameBlock(blockEnd + 1)) {
      blockEnd++;
    }

    const staffingCode = provider.role === 'DOCTOR' ? 'D' : 'H';

    // Clear old block
    for (let i = blockStart; i <= blockEnd; i++) {
      const slotIdx = providerIndices[i];
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId: null,
        blockLabel: null,
        staffingCode: staffingCode as 'D' | 'H',
        blockInstanceId: null,
        customProductionAmount: null,
      };
    }

    // Place new block from blockStart with a fresh blockInstanceId
    const label = newBlockType.minimumAmount
      ? `${newBlockType.label}>$${newBlockType.minimumAmount}`
      : newBlockType.label;

    const newBlockInstanceId = generateBlockInstanceId();
    // customProductionAmount: use explicit override if provided, else use block type default
    const resolvedProductionAmount = customProductionAmount !== undefined
      ? customProductionAmount
      : (newBlockType.minimumAmount ?? null);

    for (let j = 0; j < newDurationSlots; j++) {
      const pIdx = blockStart + j;
      if (pIdx >= providerIndices.length) break;
      const slotIdx = providerIndices[pIdx];
      if (newSlots[slotIdx].isBreak) break;
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId: newBlockType.id,
        blockLabel: label,
        staffingCode: staffingCode as 'D' | 'H',
        blockInstanceId: newBlockInstanceId,
        customProductionAmount: resolvedProductionAmount,
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    // Persist changes (localStorage + debounced API)
    const officeIdForPersist = get().currentOfficeId;
    if (officeIdForPersist) debouncedApiPersist(officeIdForPersist, newSchedules, get().activeWeek);
  },
}));
