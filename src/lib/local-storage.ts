import type { OfficeDetail, OfficeListItem, CreateOfficeInput } from './data-access';
import { DEFAULT_OPERATORIES } from './operatory-utils';
import type { GenerationResult } from './engine/types';
import { generateSchedule as engineGenerateSchedule } from './engine/generator';
import { detectConflicts } from './engine/stagger';
import { defaultRules } from './mock-data';

const OFFICES_KEY = 'schedule-template-designer:offices';
const SCHEDULES_KEY = 'schedule-template-designer:schedules';

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const memoryStorage: StorageLike = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

function getStorage(): StorageLike {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = getStorage().getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`Failed to parse localStorage key ${key}:`, error);
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T) {
  try {
    getStorage().setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write localStorage key ${key}:`, error);
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface StoredOffice extends OfficeDetail {
  updatedAt: string;
}

function readOffices(): StoredOffice[] {
  return readJSON<StoredOffice[]>(OFFICES_KEY, []);
}

function writeOffices(offices: StoredOffice[]) {
  writeJSON(OFFICES_KEY, offices);
}

function calculateProviderSummary(office: { providers: { dailyGoal: number }[] }) {
  const providerCount = office.providers.length;
  const totalDailyGoal = office.providers.reduce((sum, p) => sum + (p.dailyGoal || 0), 0);
  return { providerCount, totalDailyGoal };
}

export async function getOffices(): Promise<OfficeListItem[]> {
  const offices = readOffices();

  return offices
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((office) => {
      const { providerCount, totalDailyGoal } = calculateProviderSummary(office);
      return {
        id: office.id,
        name: office.name,
        dpmsSystem: office.dpmsSystem,
        feeModel: office.feeModel,
        providerCount,
        totalDailyGoal,
        updatedAt: office.updatedAt,
        // Extra fields used by the UI
        workingDays: office.workingDays,
        timeIncrement: office.timeIncrement,
      } as OfficeListItem;
    });
}

export async function getOfficeById(id: string): Promise<OfficeDetail | null> {
  const offices = readOffices();
  const office = offices.find((o) => o.id === id);
  return office || null;
}

export async function createOffice(data: CreateOfficeInput): Promise<OfficeDetail> {
  const offices = readOffices();
  const now = new Date().toISOString();

  const office: StoredOffice = {
    id: generateId(),
    name: data.name,
    dpmsSystem: data.dpmsSystem,
    workingDays: data.workingDays,
    timeIncrement: data.timeIncrement,
    feeModel: data.feeModel,
    operatories: data.operatories || DEFAULT_OPERATORIES,
    providers: (data.providers || []).map((provider) => ({
      ...provider,
      id: provider.id || generateId(),
    })),
    blockTypes: (data.blockTypes || []).map((blockType) => ({
      ...blockType,
      id: blockType.id || generateId(),
    })),
    rules: data.rules || defaultRules,
    updatedAt: now,
  };

  offices.push(office);
  writeOffices(offices);

  return office;
}

export async function updateOffice(id: string, data: Partial<CreateOfficeInput>): Promise<OfficeDetail | null> {
  const offices = readOffices();
  const index = offices.findIndex((office) => office.id === id);
  if (index === -1) return null;

  const existing = offices[index];
  const updated: StoredOffice = {
    ...existing,
    name: data.name ?? existing.name,
    dpmsSystem: data.dpmsSystem ?? existing.dpmsSystem,
    workingDays: data.workingDays ?? existing.workingDays,
    timeIncrement: data.timeIncrement ?? existing.timeIncrement,
    feeModel: data.feeModel ?? existing.feeModel,
    providers: data.providers
      ? data.providers.map((provider) => ({
          ...provider,
          id: provider.id || generateId(),
        }))
      : existing.providers,
    blockTypes: data.blockTypes
      ? data.blockTypes.map((blockType) => ({
          ...blockType,
          id: blockType.id || generateId(),
        }))
      : existing.blockTypes,
    rules: data.rules ?? existing.rules,
    updatedAt: new Date().toISOString(),
  };

  offices[index] = updated;
  writeOffices(offices);

  return updated;
}

export async function deleteOffice(id: string): Promise<boolean> {
  const offices = readOffices();
  const nextOffices = offices.filter((office) => office.id !== id);
  if (nextOffices.length === offices.length) {
    return false;
  }
  writeOffices(nextOffices);
  removeSchedulesForOffice(id);
  return true;
}

export async function generateSchedule(officeId: string, days: string[]): Promise<GenerationResult[]> {
  const office = await getOfficeById(officeId);
  if (!office) throw new Error('Office not found');

  const results: GenerationResult[] = [];

  for (const day of days) {
    const result = engineGenerateSchedule({
      providers: office.providers,
      blockTypes: office.blockTypes,
      rules: office.rules,
      timeIncrement: office.timeIncrement,
      dayOfWeek: day,
    });

    // Detect conflicts and add to warnings
    const conflicts = detectConflicts(result, office.providers);
    if (conflicts.length > 0) {
      const conflictWarnings = conflicts.map(
        (c) =>
          `Conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`
      );
      result.warnings = [...(result.warnings ?? []), ...conflictWarnings];
    }

    results.push(result);
  }

  // Persist schedules per office
  const existing = getSchedulesForOffice(officeId);
  const scheduleMap = new Map(existing.map((s) => [s.dayOfWeek, s]));
  results.forEach((result) => scheduleMap.set(result.dayOfWeek, result));
  saveSchedulesForOffice(officeId, Array.from(scheduleMap.values()));

  return results;
}

export async function getScheduleTemplates(officeId: string) {
  const schedules = getSchedulesForOffice(officeId);

  if (schedules.length === 0) return [];

  return [
    {
      id: `local-${officeId}`,
      version: 1,
      status: 'DRAFT',
      generatedBy: 'RULE_BASED',
      createdAt: new Date().toISOString(),
      daySchedules: schedules.map((schedule) => ({
        dayOfWeek: schedule.dayOfWeek,
        slots: schedule.slots.map((slot) => ({
          time: slot.time,
          providerId: slot.providerId || undefined,
          operatory: slot.operatory || undefined,
          staffingCode: slot.staffingCode,
          blockTypeId: slot.blockTypeId || undefined,
          blockLabel: slot.blockLabel || undefined,
          isBreak: slot.isBreak,
        })),
      })),
    },
  ];
}

export function saveOffices(offices: StoredOffice[]) {
  const normalized = offices.map((office) => ({
    ...office,
    updatedAt: office.updatedAt || new Date().toISOString(),
  }));
  writeOffices(normalized);
}

export function getSchedulesForOffice(officeId: string): GenerationResult[] {
  const schedules = readJSON<Record<string, GenerationResult[]>>(SCHEDULES_KEY, {});
  return schedules[officeId] || [];
}

export function saveSchedulesForOffice(officeId: string, schedulesForOffice: GenerationResult[]) {
  const schedules = readJSON<Record<string, GenerationResult[]>>(SCHEDULES_KEY, {});
  schedules[officeId] = schedulesForOffice;
  writeJSON(SCHEDULES_KEY, schedules);
}

export function removeSchedulesForOffice(officeId: string) {
  const schedules = readJSON<Record<string, GenerationResult[]>>(SCHEDULES_KEY, {});
  if (schedules[officeId]) {
    delete schedules[officeId];
    writeJSON(SCHEDULES_KEY, schedules);
  }
}
