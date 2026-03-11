/**
 * In-app notification system (Sprint 15 Task 4)
 * Zustand store with localStorage persistence
 */
import { create } from 'zustand';

export type NotificationType =
  | 'success'
  | 'info'
  | 'warning'
  | 'score';

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  link?: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: AppNotification[];
  addNotification: (type: NotificationType, message: string, link?: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const MAX_NOTIFICATIONS = 20;
const LS_KEY = 'schedule-designer:notifications';

function loadFromStorage(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AppNotification[];
  } catch {
    return [];
  }
}

function saveToStorage(notifications: AppNotification[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notifications));
  } catch {
    // ignore storage errors
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: loadFromStorage(),

  addNotification: (type, message, link) => {
    const newNotif: AppNotification = {
      id: generateId(),
      type,
      message,
      link,
      timestamp: Date.now(),
      read: false,
    };
    const current = get().notifications;
    // Prepend new, keep max 20
    const updated = [newNotif, ...current].slice(0, MAX_NOTIFICATIONS);
    saveToStorage(updated);
    set({ notifications: updated });
  },

  markRead: (id) => {
    const updated = get().notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    );
    saveToStorage(updated);
    set({ notifications: updated });
  },

  markAllRead: () => {
    const updated = get().notifications.map(n => ({ ...n, read: true }));
    saveToStorage(updated);
    set({ notifications: updated });
  },

  clearAll: () => {
    saveToStorage([]);
    set({ notifications: [] });
  },
}));

/** Convenience helpers for common notification events */
export const notify = {
  saved: (dayLabel: string) =>
    useNotificationStore.getState().addNotification('success', `✅ Schedule saved — ${dayLabel}`),

  cloned: (count: number) =>
    useNotificationStore.getState().addNotification('info', `📋 Template cloned to ${count} office${count !== 1 ? 's' : ''}`),

  clinicalWarning: (count: number) =>
    useNotificationStore.getState().addNotification('warning', `⚠️ Clinical rule violation detected — ${count} warning${count !== 1 ? 's' : ''}`),

  optimizationSuggestion: (points: number) =>
    useNotificationStore.getState().addNotification('info', `💡 Optimization suggestion: +${points} pts available`),

  versionRestored: (label: string) =>
    useNotificationStore.getState().addNotification('info', `🔄 Version restored — ${label}`),

  scoreImproved: (from: number, to: number) =>
    useNotificationStore.getState().addNotification('score', `📊 Quality score improved: ${from} → ${to}`),
};
