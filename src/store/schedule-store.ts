import { create } from 'zustand';
import { GenerationResult, BlockTypeInput, ProviderInput } from '@/lib/engine/types';
import { getSchedulesForOffice, saveSchedulesForOffice } from '@/lib/local-storage';
import { calculateProductionSummary } from '@/lib/engine/calculator';
import { detectConflicts } from '@/lib/engine/stagger';

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
  placeBlockInDay: (day: string, time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  removeBlockInDay: (day: string, time: string, providerId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  moveBlockInDay: (day: string, fromTime: string, fromProviderId: string, toTime: string, toProviderId: string, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
  updateBlockInDay: (day: string, time: string, providerId: string, newBlockType: BlockTypeInput, newDurationSlots: number, providers: ProviderInput[], blockTypes: BlockTypeInput[]) => void;
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

    // Group consecutive slots by blockTypeId
    const blocks: { blockTypeId: string; blockLabel: string }[] = [];
    let currentBlockTypeId: string | null = null;

    for (const slot of providerSlots) {
      if (slot.blockTypeId !== currentBlockTypeId) {
        blocks.push({ blockTypeId: slot.blockTypeId!, blockLabel: slot.blockLabel || '' });
        currentBlockTypeId = slot.blockTypeId;
      }
    }

    const scheduledBlocks = blocks.map(block => {
      const bt = blockTypes.find(b => b.id === block.blockTypeId);
      return {
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        amount: bt?.minimumAmount || 0,
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

function persist(state: { generatedSchedules: Record<string, GenerationResult>; currentOfficeId: string | null }) {
  if (state.currentOfficeId) {
    saveSchedulesForOffice(state.currentOfficeId, Object.values(state.generatedSchedules));
  }
}

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
    if (resolvedOfficeId) {
      saveSchedulesForOffice(resolvedOfficeId, schedules);
    }

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
    try {
      const schedules = getSchedulesForOffice(officeId);
      const schedulesMap: Record<string, GenerationResult> = {};
      schedules.forEach((schedule) => {
        schedulesMap[schedule.dayOfWeek] = schedule;
      });
      set({
        currentOfficeId: officeId,
        generatedSchedules: schedulesMap,
      });
    } catch (error) {
      console.error('Failed to load schedules for office:', error);
      set({
        generatedSchedules: {},
        currentOfficeId: officeId
      });
    }
  },

  placeBlockInDay: (day, time, providerId, blockType, durationSlots, providers, blockTypes) => {
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Find starting slot index
    const startIdx = newSlots.findIndex(s => s.time === time && s.providerId === providerId);
    if (startIdx === -1) return;

    // Get all slots for this provider in time order
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === providerId)
      .map(x => x.i);

    const startProvIdx = providerIndices.indexOf(startIdx);
    if (startProvIdx === -1) return;

    const label = blockType.minimumAmount
      ? `${blockType.label}>$${blockType.minimumAmount}`
      : blockType.label;

    const staffingCode = provider.role === 'DOCTOR' ? 'D' : 'H';

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
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    persist({ generatedSchedules: newSchedules, currentOfficeId: state.currentOfficeId });
  },

  removeBlockInDay: (day, time, providerId, providers, blockTypes) => {
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];
    // Find the clicked slot
    const clickedIdx = newSlots.findIndex(s => s.time === time && s.providerId === providerId);
    if (clickedIdx === -1) return;

    const blockTypeId = newSlots[clickedIdx].blockTypeId;
    if (!blockTypeId) return;

    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Find all contiguous slots with same blockTypeId for this provider
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === providerId)
      .map(x => x.i);

    const clickedProvIdx = providerIndices.indexOf(clickedIdx);

    // Expand backwards to find start of block
    let blockStart = clickedProvIdx;
    while (blockStart > 0 && newSlots[providerIndices[blockStart - 1]].blockTypeId === blockTypeId) {
      blockStart--;
    }

    // Expand forwards to find end of block
    let blockEnd = clickedProvIdx;
    while (blockEnd < providerIndices.length - 1 && newSlots[providerIndices[blockEnd + 1]].blockTypeId === blockTypeId) {
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
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    persist({ generatedSchedules: newSchedules, currentOfficeId: state.currentOfficeId });
  },

  moveBlockInDay: (day, fromTime, fromProviderId, toTime, toProviderId, providers, blockTypes) => {
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];

    // Find source block
    const fromIdx = newSlots.findIndex(s => s.time === fromTime && s.providerId === fromProviderId);
    if (fromIdx === -1) return;

    const blockTypeId = newSlots[fromIdx].blockTypeId;
    const blockLabel = newSlots[fromIdx].blockLabel;
    if (!blockTypeId) return;

    const fromProvider = providers.find(p => p.id === fromProviderId);
    const toProvider = providers.find(p => p.id === toProviderId);
    if (!fromProvider || !toProvider) return;

    // Find all slots of the source block
    const fromProviderIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === fromProviderId)
      .map(x => x.i);

    const fromProvIdx = fromProviderIndices.indexOf(fromIdx);
    let blockStart = fromProvIdx;
    while (blockStart > 0 && newSlots[fromProviderIndices[blockStart - 1]].blockTypeId === blockTypeId) {
      blockStart--;
    }
    let blockEnd = fromProvIdx;
    while (blockEnd < fromProviderIndices.length - 1 && newSlots[fromProviderIndices[blockEnd + 1]].blockTypeId === blockTypeId) {
      blockEnd++;
    }
    const blockLen = blockEnd - blockStart + 1;

    // Find destination
    const toIdx = newSlots.findIndex(s => s.time === toTime && s.providerId === toProviderId);
    if (toIdx === -1) return;

    const toProviderIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === toProviderId)
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
      // Allow if it's empty or part of the source block
      if (slot.blockTypeId !== null && !(slot.providerId === fromProviderId && slot.blockTypeId === blockTypeId)) return;
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
      };
    }

    // Place at destination
    for (let j = 0; j < blockLen; j++) {
      const pIdx = toProvIdx + j;
      const slotIdx = toProviderIndices[pIdx];
      newSlots[slotIdx] = {
        ...newSlots[slotIdx],
        blockTypeId,
        blockLabel,
        staffingCode: toStaffingCode as 'D' | 'H',
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    persist({ generatedSchedules: newSchedules, currentOfficeId: state.currentOfficeId });
  },

  updateBlockInDay: (day, time, providerId, newBlockType, newDurationSlots, providers, blockTypes) => {
    const state = get();
    const schedule = state.generatedSchedules[day];
    if (!schedule) return;

    const newSlots = [...schedule.slots];
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    // Find the clicked slot
    const clickedIdx = newSlots.findIndex(s => s.time === time && s.providerId === providerId);
    if (clickedIdx === -1) return;

    const oldBlockTypeId = newSlots[clickedIdx].blockTypeId;
    if (!oldBlockTypeId) return;

    // Find old block boundaries
    const providerIndices = newSlots
      .map((s, i) => ({ s, i }))
      .filter(x => x.s.providerId === providerId)
      .map(x => x.i);

    const clickedProvIdx = providerIndices.indexOf(clickedIdx);
    let blockStart = clickedProvIdx;
    while (blockStart > 0 && newSlots[providerIndices[blockStart - 1]].blockTypeId === oldBlockTypeId) {
      blockStart--;
    }
    let blockEnd = clickedProvIdx;
    while (blockEnd < providerIndices.length - 1 && newSlots[providerIndices[blockEnd + 1]].blockTypeId === oldBlockTypeId) {
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
      };
    }

    // Place new block from blockStart
    const label = newBlockType.minimumAmount
      ? `${newBlockType.label}>$${newBlockType.minimumAmount}`
      : newBlockType.label;

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
      };
    }

    const updated = recalcProductionSummary(
      { ...schedule, slots: newSlots },
      providers,
      blockTypes
    );

    const newSchedules = { ...state.generatedSchedules, [day]: updated };
    set({ generatedSchedules: newSchedules });
    persist({ generatedSchedules: newSchedules, currentOfficeId: state.currentOfficeId });
  },
}));
