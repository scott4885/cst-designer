import { create } from 'zustand';
import { GenerationResult } from '@/lib/engine/types';

interface ScheduleState {
  generatedSchedules: Record<string, GenerationResult>; // keyed by dayOfWeek
  activeDay: string;
  isGenerating: boolean;
  isExporting: boolean;
  setActiveDay: (day: string) => void;
  setSchedules: (schedules: GenerationResult[]) => void;
  setGenerating: (v: boolean) => void;
  setExporting: (v: boolean) => void;
  clearSchedules: () => void;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  generatedSchedules: {},
  activeDay: 'MONDAY',
  isGenerating: false,
  isExporting: false,
  setActiveDay: (day: string) => set({ activeDay: day }),
  setSchedules: (schedules: GenerationResult[]) => {
    const schedulesMap: Record<string, GenerationResult> = {};
    schedules.forEach((schedule) => {
      schedulesMap[schedule.dayOfWeek] = schedule;
    });
    set({ generatedSchedules: schedulesMap });
  },
  setGenerating: (v: boolean) => set({ isGenerating: v }),
  setExporting: (v: boolean) => set({ isExporting: v }),
  clearSchedules: () => set({ generatedSchedules: {} }),
}));
