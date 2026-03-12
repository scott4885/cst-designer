/**
 * App Settings — Sprint 17, Task 4
 *
 * Global settings persisted in localStorage.
 * Provides both a plain object API (getSettings/saveSettings) and
 * a Zustand hook (useAppSettings) for reactive consumption.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  // ── Legacy / Schedule Defaults ──────────────────────────────────────────
  timeIncrement: number;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultLunchStart: string;
  defaultLunchEnd: string;
  autoSaveSchedules: boolean;
  showProductionWarnings: boolean;
  theme: 'light' | 'dark' | 'system';

  // ── Schedule Display (Sprint 17) ─────────────────────────────────────────
  /** Show production dollar amounts by default on the schedule grid */
  showProductionAmounts: boolean;
  /** Default view when opening an office */
  defaultView: 'template_builder' | 'matrix' | 'weekly_report';

  // ── Generation Defaults (Sprint 17) ─────────────────────────────────────
  /** Default goal achievement target percentage (65–90) */
  defaultTargetPct: number;
  /** When true, generator fills morning slots first */
  preferAmScheduling: boolean;
  /** When true, auto-saves after generate completes */
  autoSaveAfterGenerate: boolean;

  // ── Notifications (Sprint 17) ────────────────────────────────────────────
  /** Enable in-app notification toasts */
  enableInAppNotifications: boolean;
  /** Show clinical warnings panel automatically after generation */
  showClinicalWarningsAutomatically: boolean;
  /** Notify when quality score improves by this many points (0 = disabled) */
  qualityScoreImprovementThreshold: number;

  // ── Analytics (Sprint 17) ────────────────────────────────────────────────
  /** Default period shown on the analytics page */
  defaultAnalyticsPeriod: 'this_month' | 'last_30_days' | 'last_quarter';
  /** Benchmark comparison reference */
  benchmarkComparison: 'org_average' | 'top_quartile' | 'industry_benchmark';

  // ── Export (Sprint 17) ───────────────────────────────────────────────────
  /** Default export file format */
  defaultExportFormat: 'excel' | 'csv';
  /** Include clinical warnings section in exports */
  includeWarningsInExport: boolean;
  /** Include quality score in exports */
  includeQualityScoreInExport: boolean;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  // Legacy
  timeIncrement: 10,
  defaultStartTime: '07:00',
  defaultEndTime: '16:00',
  defaultLunchStart: '12:00',
  defaultLunchEnd: '13:00',
  autoSaveSchedules: true,
  showProductionWarnings: true,
  theme: 'system',

  // Schedule Display
  showProductionAmounts: true,
  defaultView: 'template_builder',

  // Generation Defaults
  defaultTargetPct: 75,
  preferAmScheduling: false,
  autoSaveAfterGenerate: true,

  // Notifications
  enableInAppNotifications: true,
  showClinicalWarningsAutomatically: true,
  qualityScoreImprovementThreshold: 5,

  // Analytics
  defaultAnalyticsPeriod: 'last_30_days',
  benchmarkComparison: 'org_average',

  // Export
  defaultExportFormat: 'excel',
  includeWarningsInExport: true,
  includeQualityScoreInExport: true,
};

const STORAGE_KEY = 'app-settings';

// ─── Plain API ────────────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function resetSettings(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── Zustand Hook ─────────────────────────────────────────────────────────────

// Lazy import Zustand to avoid SSR issues — the hook is client-only
// We define the hook factory here; the actual store is created on first use.
let _useAppSettings: (() => AppSettingsState) | null = null;

export interface AppSettingsState extends AppSettings {
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetToDefaults: () => void;
}

/**
 * useAppSettings — reactive Zustand hook for app-wide settings.
 * Reads from localStorage on mount, persists every change immediately.
 *
 * Usage: const { defaultTargetPct, setSetting } = useAppSettings();
 */
export function useAppSettings(): AppSettingsState {
  // Dynamic import so Next.js SSR doesn't blow up
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { create } = require('zustand') as typeof import('zustand');

  if (!_useAppSettings) {
    _useAppSettings = create<AppSettingsState>((set) => ({
      ...getSettings(),

      setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        set((state) => {
          const next = { ...state, [key]: value };
          saveSettings(next as AppSettings);
          return { [key]: value } as Partial<AppSettingsState>;
        });
      },

      resetToDefaults: () => {
        resetSettings();
        set({ ...DEFAULT_SETTINGS });
      },
    }));
  }

  return _useAppSettings();
}
