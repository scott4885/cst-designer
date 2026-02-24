export interface AppSettings {
  timeIncrement: number;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultLunchStart: string;
  defaultLunchEnd: string;
  autoSaveSchedules: boolean;
  showProductionWarnings: boolean;
  theme: "light" | "dark" | "system";
}

export const DEFAULT_SETTINGS: AppSettings = {
  timeIncrement: 10,
  defaultStartTime: "07:00",
  defaultEndTime: "16:00",
  defaultLunchStart: "12:00",
  defaultLunchEnd: "13:00",
  autoSaveSchedules: true,
  showProductionWarnings: true,
  theme: "system",
};

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem("app-settings");
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}
