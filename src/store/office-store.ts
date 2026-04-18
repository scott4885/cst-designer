import { create } from 'zustand';
import { OfficeData } from '@/lib/mock-data';
import type { ProviderInput } from '@/lib/engine/types';

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
    set({ offices });
  },

  fetchOffices: async () => {
    // Skip during SSR/static generation — relative URLs fail server-side
    if (typeof window === 'undefined') {
      set({ offices: [], isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const res = await fetch('/api/offices');
      if (!res.ok) throw new Error('Failed to fetch offices');
      const offices = await res.json();
      set({ offices, isLoading: false });
    } catch (error) {
      console.error('Error fetching offices:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  fetchOffice: async (id: string) => {
    // Skip during SSR/static generation — relative URLs fail server-side
    if (typeof window === 'undefined') {
      set({ currentOffice: null, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const res = await fetch(`/api/offices/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch office');
      const office = await res.json();
      const providerCount = office.providers?.length || 0;
      const totalDailyGoal = office.providers?.reduce((sum: number, p: ProviderInput) => sum + (p.dailyGoal || 0), 0) || 0;
      const currentOffice: OfficeData = {
        ...(office as unknown as OfficeData),
        providerCount,
        totalDailyGoal,
        updatedAt: office.updatedAt || new Date().toISOString(),
      };
      set({ currentOffice, isLoading: false });
    } catch (error) {
      console.error('Error fetching office:', error);
      set({ isLoading: false });
      throw error;
    }
  },
}));
