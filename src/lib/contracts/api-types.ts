/**
 * Shared API type contracts between frontend (Agent C) and backend (Agent A).
 * Both agents read this file — keep it in sync.
 */

import type { TimeSlotOutput, ProviderProductionSummary } from '../engine/types';

export interface SaveScheduleRequest {
  dayOfWeek: string;
  weekType: string;
  slots: TimeSlotOutput[];
  productionSummary: ProviderProductionSummary[];
  warnings: string[];
  label?: string;
}

export interface SaveScheduleResponse {
  id: string;
  officeId: string;
  dayOfWeek: string;
  weekType: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoadScheduleResponse {
  id: string;
  officeId: string;
  dayOfWeek: string;
  weekType: string;
  slots: TimeSlotOutput[];
  productionSummary: ProviderProductionSummary[];
  warnings: string[];
  label: string;
  createdAt: string;
}

export interface GenerateScheduleRequest {
  days?: string[];
  weekType?: string;
  autoApplyStagger?: boolean;
}

export interface MigrateScheduleRequest {
  schedules: Record<string, { slots: TimeSlotOutput[]; productionSummary: ProviderProductionSummary[]; warnings: string[] }>;
  weekType: string;
}
