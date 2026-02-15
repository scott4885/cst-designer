/**
 * Data Access Layer
 * Single source of truth for all data operations (localStorage-based)
 */
import type { ProviderInput, BlockTypeInput, ScheduleRules, GenerationResult } from './engine/types';
import {
  getOffices as getStoredOffices,
  getOfficeById as getStoredOfficeById,
  createOffice as createStoredOffice,
  updateOffice as updateStoredOffice,
  deleteOffice as deleteStoredOffice,
  generateSchedule as generateStoredSchedule,
  getScheduleTemplates as getStoredScheduleTemplates,
} from './local-storage';

export interface OfficeListItem {
  id: string;
  name: string;
  dpmsSystem: string;
  feeModel: string;
  providerCount: number;
  totalDailyGoal: number;
  updatedAt: string;
}

export interface OfficeDetail {
  id: string;
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  rules: ScheduleRules;
}

export interface CreateOfficeInput {
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  providers?: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  rules?: ScheduleRules;
}

export async function getOffices(): Promise<OfficeListItem[]> {
  return getStoredOffices();
}

export async function getOfficeById(id: string): Promise<OfficeDetail | null> {
  return getStoredOfficeById(id);
}

export async function createOffice(data: CreateOfficeInput): Promise<OfficeDetail> {
  return createStoredOffice(data);
}

export async function updateOffice(id: string, data: Partial<CreateOfficeInput>): Promise<OfficeDetail | null> {
  return updateStoredOffice(id, data);
}

export async function deleteOffice(id: string): Promise<boolean> {
  return deleteStoredOffice(id);
}

export async function generateSchedule(officeId: string, days: string[]): Promise<GenerationResult[]> {
  return generateStoredSchedule(officeId, days);
}

export async function getScheduleTemplates(officeId: string) {
  return getStoredScheduleTemplates(officeId);
}
