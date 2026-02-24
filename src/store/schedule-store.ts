import { create } from 'zustand';
import { GenerationResult, BlockTypeInput, ProviderInput } from '@/lib/engine/types';
import { calculateProductionSummary } from '@/lib/engine/calculator';
import { detectConflicts } from '@/lib/engine/stagger';
import { parseAmountFromLabel } from '@/lib/engine/generator';

interface ScheduleState {
  generatedSchedules: Record<string, GenerationResult>; // keyed by dayOfWeek
  activeDay: string;
  isGenerating: boolean;
  isExporting: boolean;
  currentOfficeId: string | null;
  setActiveDay: (day: string) => void;
  setSchedules: (schedules: GenerationResult[], officeId?: string) => void;
  setGenerating: (v: boolean) => void;
  setExporting: (v: boolean) => void;
  clearSchedules: () => void;
  loadSchedulesForOffice: (officeId: string) => Promise<void>;
  // Interactive editing methods
  placeBlockInDay: (day: string, time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => boolean;
  removeBlockInDay: (day: string, time: string, providerId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  moveBlockInDay: (day: string, fromTime: string, fromProviderId: string, toTime: string, toProviderId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  updateBlockInDay: (day: string, time: string, providerId: string, newBlockType: BlockTypeInput, newDurationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[], customProductionAmount?: number | null) => void;
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

    // Group consecutive slots by blockInstanceId (when available) or blockTypeId
    // This ensures adjacent blocks of the same type placed as separate instances
    // are counted separately (fixes Issue 5 + 6).
    const blocks: { blockTypeId: string; blockLabel: string; customProductionAmount?: number | null }[] = [];
    let currentGroupKey: string | null = null;

    for (const slot of providerSlots) {
      // Use blockInstanceId as group key when available, else fall back to blockTypeId
      const groupKey = slot.blockInstanceId || slot.blockTypeId;
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
  const nonConflictWarnings = (schedule.warnings ?? []).filter(w => !w.startsWith('Conflict at '));
  const conflictWarnings = conflicts.map(
    (c) => `Conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`
  );

  return { ...schedule, productionSummary, warnings: [...nonConflictWarnings, ...conflictWarnings] };
}

// Schedules are kept in Zustand memory only (no localStorage persistence needed with DB backend)

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  generatedSchedules: {},
  activeDay: 'MONDAY',
  isGenerating: false,
  isExporting: false,
  currentOfficeId: null,

  setActiveDay: (day: string) => set({ activeDay: day }),

  setSchedules: (schedules: GenerationResult[], officeId?: string) => {
    const schedulesMap: Record<string, GenerationResult> = {};
    schedules.forEach((schedule) => {
      schedulesMap[schedule.dayOfWeek] = schedule;
    });

    const resolvedOfficeId = officeId || get().currentOfficeId;

    set({
      generatedSchedules: schedulesMap,
      currentOfficeId: resolvedOfficeId,
    });
  },

  setGenerating: (v: boolean) => set({ isGenerating: v }),
  setExporting: (v: boolean) => set({ isExporting: v }),

  clearSchedules: () => {
    set({ generatedSchedules: {} });
  },

  loadSchedulesForOffice: async (officeId: string) => {
    // Schedules are generated on-demand via API; just track the office ID
    const currentId = get().currentOfficeId;
    set({
      currentOfficeId: officeId,
      generatedSchedules: currentId === officeId ? get().generatedSchedules : {},
    });
  },

  placeBlockInDay: (day, time, providerId, blockType, durationSlots, providers, blockTypes) => {
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
    // schedules persisted in-memory only
    return true;
  },

  removeBlockInDay: (day, time, providerId, providers, blockTypes) => {
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
    // schedules persisted in-memory only
  },

  moveBlockInDay: (day, fromTime, fromProviderId, toTime, toProviderId, providers, blockTypes) => {
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
    // schedules persisted in-memory only
  },

  updateBlockInDay: (day, time, providerId, newBlockType, newDurationSlots, providers, blockTypes, customProductionAmount) => {
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
    // schedules persisted in-memory only
  },
}));
