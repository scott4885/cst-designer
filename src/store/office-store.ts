import { create } from 'zustand';
import { OfficeData } from '@/lib/mock-data';

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
  
  setOffices: (offices: OfficeData[]) => set({ offices }),
  
  fetchOffices: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/offices');
      if (!response.ok) {
        throw new Error('Failed to fetch offices');
      }
      const offices = await response.json();
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
      const response = await fetch(`/api/offices/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch office');
      }
      const office = await response.json();
      set({ currentOffice: office, isLoading: false });
    } catch (error) {
      console.error('Error fetching office:', error);
      set({ isLoading: false });
      throw error;
    }
  },
}));
