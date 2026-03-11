/**
 * Matrix view helpers (Sprint 15 Task 1)
 * Utilities for building the multi-provider scheduling matrix.
 */

import type { GenerationResult, ProviderInput, BlockTypeInput, TimeSlotOutput } from './engine/types';

export interface MatrixCell {
  time: string;
  providerId: string;
  blockLabel: string | null;
  blockTypeId: string | null;
  staffingCode: 'D' | 'A' | 'H' | null;
  isBreak: boolean;
  blockColor: string;
  blockInstanceId: string | null;
  customProductionAmount: number | null;
}

export interface MatrixRow {
  time: string;
  isLunch: boolean;
  cells: MatrixCell[];
}

export interface ProviderHeader {
  providerId: string;
  providerName: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  dailyGoal: number;
  scheduledProduction: number;
  fillPercent: number; // 0-100
  color: string;
}

export interface MatrixData {
  providerHeaders: ProviderHeader[];
  rows: MatrixRow[];
  timeSlots: string[];
}

const DEFAULT_BLOCK_COLOR = '#94a3b8';

function getBlockColor(blockTypeId: string | null, blockTypes: BlockTypeInput[]): string {
  if (!blockTypeId) return DEFAULT_BLOCK_COLOR;
  const bt = blockTypes.find(b => b.id === blockTypeId);
  return (bt as any)?.color ?? DEFAULT_BLOCK_COLOR;
}

/**
 * Build matrix data from a schedule.
 * @param schedule - The GenerationResult for the selected day
 * @param providers - List of providers (display order)
 * @param blockTypes - Block type definitions (for colors)
 * @returns MatrixData ready for rendering
 */
export function buildMatrixData(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): MatrixData {
  // Gather all unique time slots from the schedule
  const allTimes = Array.from(new Set(schedule.slots.map(s => s.time))).sort(
    (a, b) => parseTimeToMinutes(a) - parseTimeToMinutes(b)
  );

  // Build lookup: time -> providerId -> slot
  const slotMap = new Map<string, Map<string, TimeSlotOutput>>();
  for (const slot of schedule.slots) {
    if (!slotMap.has(slot.time)) slotMap.set(slot.time, new Map());
    slotMap.get(slot.time)!.set(slot.providerId, slot);
  }

  // Build provider headers with production data
  const providerHeaders: ProviderHeader[] = providers.map(p => {
    const summary = schedule.productionSummary.find(s => s.providerId === p.id);
    const scheduled = summary?.actualScheduled ?? 0;
    const goal = p.dailyGoal ?? 0;
    return {
      providerId: p.id,
      providerName: p.name,
      role: p.role,
      dailyGoal: goal,
      scheduledProduction: scheduled,
      fillPercent: goal > 0 ? Math.min(100, Math.round((scheduled / goal) * 100)) : 0,
      color: p.color,
    };
  });

  // Build rows
  const rows: MatrixRow[] = allTimes.map(time => {
    const timeSlotMap = slotMap.get(time);
    const isLunch = providers.every(p => {
      const slot = timeSlotMap?.get(p.id);
      return slot?.isBreak === true;
    });

    const cells: MatrixCell[] = providers.map(p => {
      const slot = timeSlotMap?.get(p.id);
      return {
        time,
        providerId: p.id,
        blockLabel: slot?.blockLabel ?? null,
        blockTypeId: slot?.blockTypeId ?? null,
        staffingCode: slot?.staffingCode ?? null,
        isBreak: slot?.isBreak ?? false,
        blockColor: getBlockColor(slot?.blockTypeId ?? null, blockTypes),
        blockInstanceId: slot?.blockInstanceId ?? null,
        customProductionAmount: slot?.customProductionAmount ?? null,
      };
    });

    return { time, isLunch, cells };
  });

  return {
    providerHeaders,
    rows,
    timeSlots: allTimes,
  };
}

/** Parse time string to minutes from midnight */
export function parseTimeToMinutes(time: string): number {
  const hmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) return parseInt(hmMatch[1]) * 60 + parseInt(hmMatch[2]);

  const ampmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1]);
    const m = parseInt(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  }
  return 0;
}

/** Abbreviate a block label for compact display */
export function abbreviateLabel(label: string, maxLen = 8): string {
  if (!label || label === 'LUNCH') return label;
  if (label.length <= maxLen) return label;
  // Try first letters of each word
  const words = label.split(/\s+/);
  if (words.length > 1) {
    const abbr = words.map(w => w[0]).join('').toUpperCase();
    if (abbr.length <= maxLen) return abbr;
  }
  return label.slice(0, maxLen - 1) + '…';
}
