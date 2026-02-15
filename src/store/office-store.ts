import { create } from 'zustand';
import { OfficeData } from '@/lib/mock-data';
import { getOffices, getOfficeById, saveOffices } from '@/lib/local-storage';

interface OfficeState {
  currentOffice: OfficeData | null;
  offices: OfficeData[];
  isLoading: boolean;
  setCurrentOffice: (office: OfficeData | null) => void;
  setOffices: (offices: OfficeData[]) => void;
  fetchOffices: () => Promise<void>;
  fetchOffice: (id: string) => Promise<void>;
}

export const useOfficeStore = create<OfficeState>((set) => ({
  currentOffice: null,
  offices: [],
  isLoading: false,
  
  setCurrentOffice: (office: OfficeData | null) => set({ currentOffice: office }),
  
  setOffices: (offices: OfficeData[]) => {
    saveOffices(offices as any);
    set({ offices });
  },
  
  fetchOffices: async () => {
    set({ isLoading: true });
    try {
      const offices = (await getOffices()) as OfficeData[];
      set({ offices, isLoading: false });
    } catch (error) {
      console.error('Error fetching offices:', error);
      set({ isLoading: false });
      throw error;
    }
  },
  
  fetchOffice: async (id: string) => {
    set({ isLoading: true });
    try {
      const office = await getOfficeById(id);
      if (!office) {
        throw new Error('Failed to fetch office');
      }
      const providerCount = office.providers?.length || 0;
      const totalDailyGoal = office.providers?.reduce((sum, p) => sum + (p.dailyGoal || 0), 0) || 0;
      const currentOffice: OfficeData = {
        ...(office as OfficeData),
        providerCount,
        totalDailyGoal,
        updatedAt: (office as any).updatedAt || new Date().toISOString(),
      };
      set({ currentOffice, isLoading: false });
    } catch (error) {
      console.error('Error fetching office:', error);
      set({ isLoading: false });
      throw error;
    }
  },
}));
