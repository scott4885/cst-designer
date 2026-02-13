import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  loadSchedulesForOffice: (officeId: string) => void;
}

// Helper to get storage key for office schedules
const getStorageKey = (officeId: string) => `schedules-${officeId}`;

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
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
        
        set({ generatedSchedules: schedulesMap });
        
        // Persist to localStorage for the specific office
        const targetOfficeId = officeId || get().currentOfficeId;
        if (targetOfficeId && typeof window !== 'undefined') {
          try {
            localStorage.setItem(getStorageKey(targetOfficeId), JSON.stringify(schedulesMap));
          } catch (error) {
            console.error('Failed to save schedules to localStorage:', error);
          }
        }
      },
      
      setGenerating: (v: boolean) => set({ isGenerating: v }),
      setExporting: (v: boolean) => set({ isExporting: v }),
      
      clearSchedules: () => {
        const { currentOfficeId } = get();
        set({ generatedSchedules: {} });
        
        // Clear from localStorage
        if (currentOfficeId && typeof window !== 'undefined') {
          try {
            localStorage.removeItem(getStorageKey(currentOfficeId));
          } catch (error) {
            console.error('Failed to clear schedules from localStorage:', error);
          }
        }
      },
      
      loadSchedulesForOffice: (officeId: string) => {
        if (typeof window === 'undefined') return;
        
        try {
          const stored = localStorage.getItem(getStorageKey(officeId));
          if (stored) {
            const schedulesMap = JSON.parse(stored);
            set({ 
              generatedSchedules: schedulesMap,
              currentOfficeId: officeId 
            });
          } else {
            set({ 
              generatedSchedules: {},
              currentOfficeId: officeId 
            });
          }
        } catch (error) {
          console.error('Failed to load schedules from localStorage:', error);
          set({ 
            generatedSchedules: {},
            currentOfficeId: officeId 
          });
        }
      },
    }),
    {
      name: 'schedule-storage',
      // Only persist non-transient state
      partialize: (state) => ({
        activeDay: state.activeDay,
      }),
    }
  )
);
