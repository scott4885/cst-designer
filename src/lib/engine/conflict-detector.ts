/**
 * Conflict Detector — Advanced schedule conflict analysis
 *
 * Detects:
 * - Doctor in hygiene operatory simultaneously with hygiene block
 * - Provider double-booked without multi-column setup
 * - Production below daily goal
 * - Missing lunch breaks
 * - D-time overlaps (doctor hands-on time conflict across columns)
 */

import type { TimeSlotOutput, ProviderInput, GenerationResult, ProviderProductionSummary, BlockTypeInput } from './types';
import { detectDTimeConflicts } from './da-time';

export type ConflictSeverity = 'error' | 'warning' | 'info';
export type ConflictCategory =
  | 'DOCTOR_HYGIENE_CONFLICT'
  | 'DOUBLE_BOOKING'
  | 'PRODUCTION_UNDER_GOAL'
  | 'MISSING_LUNCH'
  | 'ALL_GOOD';

export interface ScheduleConflict {
  id: string;
  severity: ConflictSeverity;
  category: ConflictCategory;
  message: string;
  time?: string;
  providerId?: string;
  providerName?: string;
  operatory?: string;
  details?: string;
}

/**
 * Detect all conflicts in a schedule
 */
export function detectAllConflicts(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[] = []
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  let idCounter = 0;
  const nextId = () => `conflict-${idCounter++}`;

  // 1. Doctor-Hygiene conflicts: doctor placed in a hygiene operatory at the same time as a hygiene block
  const doctorIds = new Set(providers.filter(p => p.role === 'DOCTOR').map(p => p.id));
  const hygienistIds = new Set(providers.filter(p => p.role === 'HYGIENIST').map(p => p.id));

  // Group slots by time + operatory
  const slotsByTimeOp = new Map<string, TimeSlotOutput[]>();
  for (const slot of schedule.slots) {
    if (slot.isBreak || !slot.blockTypeId) continue;
    const key = `${slot.time}::${slot.operatory}`;
    const list = slotsByTimeOp.get(key) ?? [];
    list.push(slot);
    slotsByTimeOp.set(key, list);
  }

  for (const [key, slotsAtTimeOp] of slotsByTimeOp) {
    const hasDoctorBlock = slotsAtTimeOp.some(s => doctorIds.has(s.providerId));
    const hasHygieneBlock = slotsAtTimeOp.some(s => hygienistIds.has(s.providerId));

    if (hasDoctorBlock && hasHygieneBlock) {
      const [time, operatory] = key.split('::');
      const docSlot = slotsAtTimeOp.find(s => doctorIds.has(s.providerId))!;
      const hygSlot = slotsAtTimeOp.find(s => hygienistIds.has(s.providerId))!;
      const docProvider = providers.find(p => p.id === docSlot.providerId);
      const hygProvider = providers.find(p => p.id === hygSlot.providerId);

      conflicts.push({
        id: nextId(),
        severity: 'error',
        category: 'DOCTOR_HYGIENE_CONFLICT',
        message: `Doctor ${docProvider?.name || docSlot.providerId} conflicts with hygienist ${hygProvider?.name || hygSlot.providerId} in ${operatory} at ${time}`,
        time,
        providerId: docSlot.providerId,
        providerName: docProvider?.name,
        operatory,
        details: `Doctor block "${docSlot.blockLabel}" overlaps with hygiene block "${hygSlot.blockLabel}"`,
      });
    }
  }

  // 2. Double-booking: provider in 2+ ops at same time WITHOUT multi-column setup
  const slotsByTime = new Map<string, TimeSlotOutput[]>();
  for (const slot of schedule.slots) {
    if (slot.isBreak || !slot.blockTypeId) continue;
    const list = slotsByTime.get(slot.time) ?? [];
    list.push(slot);
    slotsByTime.set(slot.time, list);
  }

  for (const [time, slotsAtTime] of slotsByTime) {
    const byProvider = new Map<string, TimeSlotOutput[]>();
    for (const slot of slotsAtTime) {
      const list = byProvider.get(slot.providerId) ?? [];
      list.push(slot);
      byProvider.set(slot.providerId, list);
    }

    for (const [providerId, provSlots] of byProvider) {
      const uniqueOps = [...new Set(provSlots.map(s => s.operatory))];
      if (uniqueOps.length <= 1) continue;

      const provider = providers.find(p => p.id === providerId);
      const columns = provider?.columns ?? 1;

      // Multi-column providers are expected to be in multiple ops
      if (columns > 1 && uniqueOps.length <= columns) continue;

      conflicts.push({
        id: nextId(),
        severity: 'error',
        category: 'DOUBLE_BOOKING',
        message: `${provider?.name || providerId} is double-booked in ${uniqueOps.join(' and ')} at ${time}`,
        time,
        providerId,
        providerName: provider?.name,
        details: `Provider scheduled in ${uniqueOps.length} operatories but columns=${columns}`,
      });
    }
  }

  // 3. Production below daily goal
  if (schedule.productionSummary) {
    for (const summary of schedule.productionSummary) {
      if (summary.status === 'UNDER') {
        const gap = summary.target75 - summary.actualScheduled;
        conflicts.push({
          id: nextId(),
          severity: 'warning',
          category: 'PRODUCTION_UNDER_GOAL',
          message: `${summary.providerName}: $${Math.round(summary.actualScheduled)} scheduled vs $${Math.round(summary.target75)} target (-$${Math.round(gap)})`,
          providerId: summary.providerId,
          providerName: summary.providerName,
          details: `${Math.round((summary.actualScheduled / summary.target75) * 100)}% of 75% target`,
        });
      }
    }
  }

  // 4. Missing lunch breaks
  for (const provider of providers) {
    if (!provider.lunchStart || !provider.lunchEnd) continue;

    const providerSlots = schedule.slots.filter(
      s => s.providerId === provider.id
    );
    const lunchSlots = providerSlots.filter(s => s.isBreak && s.blockLabel === 'LUNCH');

    if (lunchSlots.length === 0 && providerSlots.length > 0) {
      conflicts.push({
        id: nextId(),
        severity: 'warning',
        category: 'MISSING_LUNCH',
        message: `${provider.name} has no lunch break scheduled`,
        providerId: provider.id,
        providerName: provider.name,
      });
    }
  }

  // 5. D-time conflicts: doctor hands-on time overlapping across columns (warning level)
  if (blockTypes.length > 0) {
    const dTimeConflicts = detectDTimeConflicts(schedule, providers, blockTypes);
    for (const c of dTimeConflicts) {
      conflicts.push({
        id: nextId(),
        severity: 'warning',
        category: 'DOUBLE_BOOKING',
        message: `⚡ D-time overlap: ${c.providerName} has hands-on time in ${c.operatories.join(' and ')} at ${c.time}`,
        time: c.time,
        providerId: c.providerId,
        providerName: c.providerName,
        details: `Blocks: ${c.blockLabels.join(', ')}. Doctor is scheduled for hands-on (D-time) in multiple chairs simultaneously. Consider staggering start times so A-time in one chair overlaps with D-time in the next.`,
      });
    }
  }

  return conflicts;
}

/**
 * Check if schedule has no issues
 */
export function isScheduleClean(conflicts: ScheduleConflict[]): boolean {
  return conflicts.length === 0;
}

/**
 * Get production totals from schedule
 */
export function getProductionTotals(summary: ProviderProductionSummary[]): {
  totalScheduled: number;
  totalGoal: number;
  totalTarget75: number;
} {
  return {
    totalScheduled: summary.reduce((sum, s) => sum + s.actualScheduled, 0),
    totalGoal: summary.reduce((sum, s) => sum + s.dailyGoal, 0),
    totalTarget75: summary.reduce((sum, s) => sum + s.target75, 0),
  };
}
