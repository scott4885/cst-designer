import { create } from 'zustand';
import { GenerationResult } from '@/lib/engine/types';

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
    
    set({ 
      generatedSchedules: schedulesMap,
      currentOfficeId: officeId || get().currentOfficeId,
    });
  },
  
  setGenerating: (v: boolean) => set({ isGenerating: v }),
  setExporting: (v: boolean) => set({ isExporting: v }),
  
  clearSchedules: () => {
    set({ generatedSchedules: {} });
  },
  
  // Load schedules from database for an office
  loadSchedulesForOffice: async (officeId: string) => {
    try {
      // Note: This would need a new API endpoint to fetch saved schedules
      // For now, we'll just set the officeId and clear schedules
      // The generate endpoint will create new schedules and save to DB
      set({ 
        currentOfficeId: officeId,
        generatedSchedules: {},
      });
    } catch (error) {
      console.error('Failed to load schedules for office:', error);
      set({ 
        generatedSchedules: {},
        currentOfficeId: officeId 
      });
    }
  },
}));
