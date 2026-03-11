/**
 * Clinical Scheduling Rules Engine — Sprint 11
 *
 * Validates a generated schedule against dental clinical best practices.
 * Returns an array of ClinicalWarning objects (errors, warnings, info).
 */

import type { GenerationResult, ProviderInput, BlockTypeInput, TimeSlotOutput } from './types';
import { inferProcedureCategory } from './types';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type WarningSeverity = 'error' | 'warning' | 'info';

export interface ClinicalWarning {
  ruleId: string;
  severity: WarningSeverity;
  message: string;
  /** Affected time slot (HH:MM format), if applicable */
  affectedTime?: string;
  /** Affected provider name, if applicable */
  affectedProvider?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "HH:MM" string to minutes since midnight */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Convert minutes since midnight to "HH:MM" */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Get all unique block labels for a provider in the current slot list.
 * Returns { blockTypeId, blockLabel, startTime, startMinutes, dTimeMin }[]
 * — only the first slot of each block instance (by blockInstanceId or contiguous label).
 */
interface BlockOccurrence {
  blockTypeId: string | null;
  blockLabel: string | null;
  startTime: string;
  startMinutes: number;
  dTimeMin: number;
  aTimeMin: number;
  dTimeOffsetMin: number;
  category: string;
}

function getProviderBlocks(
  slots: TimeSlotOutput[],
  providerId: string,
  blockTypes: BlockTypeInput[]
): BlockOccurrence[] {
  const byId = new Map(blockTypes.map(bt => [bt.id, bt]));
  const providerSlots = slots
    .filter(s => s.providerId === providerId && !s.isBreak && s.blockTypeId)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  const blocks: BlockOccurrence[] = [];
  const seenInstances = new Set<string>();

  for (const slot of providerSlots) {
    // Skip if we've already seen this block instance
    if (slot.blockInstanceId && seenInstances.has(slot.blockInstanceId)) continue;
    if (slot.blockInstanceId) seenInstances.add(slot.blockInstanceId);

    const bt = slot.blockTypeId ? byId.get(slot.blockTypeId) : undefined;
    const cat = bt
      ? (bt.procedureCategory ?? inferProcedureCategory(bt.label))
      : inferProcedureCategory(slot.blockLabel ?? '');

    blocks.push({
      blockTypeId: slot.blockTypeId,
      blockLabel: slot.blockLabel,
      startTime: slot.time,
      startMinutes: timeToMinutes(slot.time),
      dTimeMin: bt?.dTimeMin ?? 0,
      aTimeMin: bt?.aTimeMin ?? 0,
      dTimeOffsetMin: bt?.dTimeOffsetMin ?? 0,
      category: cat,
    });
  }

  return blocks;
}

/**
 * Count total consecutive D-time minutes for a provider starting at a given time.
 * Consecutive = no A-time or lunch gap between blocks.
 */
function getConsecutiveDTimeMinutes(
  slots: TimeSlotOutput[],
  providerId: string,
  blockTypes: BlockTypeInput[],
  startMinutes: number
): { dTimeMinutes: number; endTime: string } {
  const byId = new Map(blockTypes.map(bt => [bt.id, bt]));
  const providerSlots = slots
    .filter(s => s.providerId === providerId && !s.isBreak)
    .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  let totalDTime = 0;
  let currentMinute = startMinutes;

  // Walk forward slot-by-slot
  for (const slot of providerSlots) {
    const slotMin = timeToMinutes(slot.time);
    if (slotMin < startMinutes) continue;
    if (slotMin > currentMinute + 10) break; // gap in time → stop

    const bt = slot.blockTypeId ? byId.get(slot.blockTypeId) : undefined;
    const code = slot.staffingCode;

    if (code === 'D') {
      totalDTime += /* assume 10-min increment */10;
      currentMinute = slotMin + 10;
    } else if (code === 'A' || slot.isBreak) {
      // A-time or break interrupts consecutive D-time
      break;
    } else {
      // null staffing — move forward
      currentMinute = slotMin + 10;
    }
  }

  return { dTimeMinutes: totalDTime, endTime: minutesToTime(currentMinute) };
}

// ─── Rule Implementations ─────────────────────────────────────────────────────

/**
 * Rule 1: New Patient → Comprehensive Exam first
 * Provider who seesNewPatients=true should have at least one NP slot.
 * If they only have major restorative and no NP slot, warn.
 */
function checkRule1_NewPatientFirst(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];

  for (const provider of providers) {
    if (!provider.seesNewPatients) continue;
    if (provider.role === 'HYGIENIST') continue;

    const blocks = getProviderBlocks(schedule.slots, provider.id, blockTypes);
    const hasNP = blocks.some(b => b.category === 'NEW_PATIENT_DIAG');
    const hasMajorRestorative = blocks.some(b => b.category === 'MAJOR_RESTORATIVE');

    if (!hasNP && hasMajorRestorative) {
      warnings.push({
        ruleId: 'RULE_1_NP_FIRST',
        severity: 'warning',
        message: `${provider.name} is configured to see new patients but has no New Patient/Exam slot. Consider adding a comprehensive exam block.`,
        affectedProvider: provider.name,
      });
    }
  }

  return warnings;
}

/**
 * Rule 2: SRP → Perio Maintenance minimum 4-week gap
 * Flag if both SRP and Perio Maintenance blocks exist for the same provider in one day.
 */
function checkRule2_SrpAndPerioMaintenance(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];

  for (const provider of providers) {
    const blocks = getProviderBlocks(schedule.slots, provider.id, blockTypes);

    const hasSRP = blocks.some(b => {
      const label = (b.blockLabel ?? '').toUpperCase();
      return /\bSRP\b|SCALING.*ROOT|DEEP.*CLEAN/.test(label);
    });
    const hasPerioMaint = blocks.some(b => {
      const label = (b.blockLabel ?? '').toUpperCase();
      // Must match PM-specific patterns but NOT match SRP patterns
      const isSRP = /\bSRP\b|SCALING.*ROOT|DEEP.*CLEAN/.test(label);
      if (isSRP) return false;
      return /PERIO.*MAINT|PERIODONTAL.*MAINT|\bPM\b/.test(label);
    });

    if (hasSRP && hasPerioMaint) {
      warnings.push({
        ruleId: 'RULE_2_SRP_PERIO_SAME_DAY',
        severity: 'warning',
        message: `${provider.name} has both SRP and Perio Maintenance scheduled on the same day. These are different treatment stages — SRP patients need at least 4 weeks before Perio Maintenance.`,
        affectedProvider: provider.name,
      });
    }
  }

  return warnings;
}

/**
 * Rule 3: Emergency block — morning only (before 10:00 AM)
 * ER blocks scheduled at or after 10:00 → warning.
 */
function checkRule3_EmergencyMorningOnly(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];
  const CUTOFF_MINUTES = 10 * 60; // 10:00 AM

  for (const provider of providers) {
    const blocks = getProviderBlocks(schedule.slots, provider.id, blockTypes);

    for (const block of blocks) {
      const isER = block.category === 'EMERGENCY_ACCESS' ||
        /EMERGENCY|\bER\b|LIMITED EXAM|PALLIATIVE/.test((block.blockLabel ?? '').toUpperCase());

      if (isER && block.startMinutes >= CUTOFF_MINUTES) {
        warnings.push({
          ruleId: 'RULE_3_ER_MORNING_ONLY',
          severity: 'warning',
          message: `${provider.name} has an Emergency/Access block at ${block.startTime}. Emergency slots should be placed before 10:00 AM for same-day access.`,
          affectedTime: block.startTime,
          affectedProvider: provider.name,
        });
      }
    }
  }

  return warnings;
}

/**
 * Rule 4: No consecutive high-production blocks without assistant time
 * Doctor D-time should not exceed 90 min continuously without break or A-time.
 */
function checkRule4_ConsecutiveDTime(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];
  const MAX_CONSECUTIVE_D_TIME = 90; // minutes

  for (const provider of providers) {
    if (provider.role !== 'DOCTOR') continue;

    // Walk through D-time slots and accumulate consecutive runs
    const providerSlots = schedule.slots
      .filter(s => s.providerId === provider.id && !s.isBreak)
      .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    let consecutiveDTime = 0;
    let runStart: string | null = null;
    let prevMinute = -999;

    for (const slot of providerSlots) {
      const slotMin = timeToMinutes(slot.time);
      const gap = slotMin - prevMinute;

      if (gap > 15) {
        // Reset on any gap > 15 min (lunch, break, etc.)
        consecutiveDTime = 0;
        runStart = null;
      }

      if (slot.staffingCode === 'D') {
        if (runStart === null) runStart = slot.time;
        consecutiveDTime += 10; // assume 10-min slots
        if (consecutiveDTime > MAX_CONSECUTIVE_D_TIME) {
          warnings.push({
            ruleId: 'RULE_4_CONSECUTIVE_D_TIME',
            severity: 'warning',
            message: `${provider.name} has ${consecutiveDTime}+ min of consecutive doctor time starting at ${runStart}. Consider adding a break or assistant-managed block.`,
            affectedTime: runStart,
            affectedProvider: provider.name,
          });
          // Reset so we don't keep warning on every subsequent slot
          consecutiveDTime = 0;
          runStart = null;
        }
      } else if (slot.staffingCode === 'A') {
        // A-time resets consecutive D-time
        consecutiveDTime = 0;
        runStart = null;
      }

      prevMinute = slotMin;
    }
  }

  return warnings;
}

/**
 * Rule 5: Lunch enforced — no blocks scheduled during lunch window
 */
function checkRule5_LunchEnforced(
  schedule: GenerationResult,
  providers: ProviderInput[],
  _blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];

  for (const provider of providers) {
    if (!provider.lunchStart || !provider.lunchEnd) continue;
    const lunchStartMin = timeToMinutes(provider.lunchStart);
    const lunchEndMin = timeToMinutes(provider.lunchEnd);

    const conflictingSlots = schedule.slots.filter(s => {
      if (s.providerId !== provider.id) return false;
      if (s.isBreak) return false;
      if (!s.blockTypeId) return false;
      const slotMin = timeToMinutes(s.time);
      return slotMin >= lunchStartMin && slotMin < lunchEndMin;
    });

    if (conflictingSlots.length > 0) {
      const firstConflict = conflictingSlots[0];
      warnings.push({
        ruleId: 'RULE_5_LUNCH_ENFORCED',
        severity: 'error',
        message: `${provider.name} has a block scheduled during lunch (${provider.lunchStart}–${provider.lunchEnd}). Lunch time must be kept clear.`,
        affectedTime: firstConflict.time,
        affectedProvider: provider.name,
      });
    }
  }

  return warnings;
}

/**
 * Rule 6: Hygienist D-time start offset must be ≥ 20 min into appointment
 * Validates saved schedules to ensure D-time doesn't start before minute 20.
 */
function checkRule6_HygienistDTimeOffset(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const warnings: ClinicalWarning[] = [];
  const byId = new Map(blockTypes.map(bt => [bt.id, bt]));

  for (const provider of providers) {
    if (provider.role !== 'HYGIENIST') continue;

    const blocks = getProviderBlocks(schedule.slots, provider.id, blockTypes);

    for (const block of blocks) {
      if (!block.blockTypeId) continue;
      const bt = byId.get(block.blockTypeId);
      if (!bt || !bt.dTimeMin || bt.dTimeMin <= 0) continue;

      const offset = bt.dTimeOffsetMin ?? 25;
      if (offset < 20) {
        warnings.push({
          ruleId: 'RULE_6_HYG_DTIME_OFFSET',
          severity: 'warning',
          message: `${provider.name}: "${bt.label}" has D-time starting at minute ${offset} (minimum is 20). Doctor exam cannot begin before minute 20 of the hygiene appointment.`,
          affectedTime: block.startTime,
          affectedProvider: provider.name,
        });
      }
    }
  }

  return warnings;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Run all clinical rules against a schedule and return warnings.
 *
 * @param schedule   The GenerationResult to validate
 * @param providers  Provider definitions (for rule context)
 * @param blockTypes Block type definitions (for category resolution)
 */
export function validateClinicalRules(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ClinicalWarning[] {
  const allWarnings: ClinicalWarning[] = [
    ...checkRule1_NewPatientFirst(schedule, providers, blockTypes),
    ...checkRule2_SrpAndPerioMaintenance(schedule, providers, blockTypes),
    ...checkRule3_EmergencyMorningOnly(schedule, providers, blockTypes),
    ...checkRule4_ConsecutiveDTime(schedule, providers, blockTypes),
    ...checkRule5_LunchEnforced(schedule, providers, blockTypes),
    ...checkRule6_HygienistDTimeOffset(schedule, providers, blockTypes),
  ];

  return allWarnings;
}
