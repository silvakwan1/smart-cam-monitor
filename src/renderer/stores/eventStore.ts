import { create } from 'zustand';
import { SystemEvent } from '../../shared/types';

interface EventState {
  events: SystemEvent[];
  filterType: string; // 'all' or specific event types / labels
  
  fetchEvents: () => Promise<void>;
  clearEvents: () => Promise<void>;
  addEvent: (event: SystemEvent) => void;
  setFilterType: (filter: string) => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  filterType: 'all',

  fetchEvents: async () => {
    try {
      const list = await window.electronAPI.getEvents();
      set({ events: list });
    } catch (err) {
      console.error('Failed to load event history logs:', err);
    }
  },

  clearEvents: async () => {
    try {
      const list = await window.electronAPI.clearEvents();
      set({ events: list });
    } catch (err) {
      console.error('Failed to clear event log history:', err);
    }
  },

  addEvent: (event) => {
    // Keep list sorted by newest first
    set((state) => ({
      events: [event, ...state.events].slice(0, 500)
    }));
  },

  setFilterType: (filter) => {
    set({ filterType: filter });
  }
}));
