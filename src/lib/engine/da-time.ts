/**
 * D/A Time (Doctor/Assistant Time) — Double-Booking Logic
 *
 * D-time (Doctor-active time): Doctor is physically in the chair doing hands-on work.
 *   Only ONE D-time block can be active at a time across all of a doctor's columns.
 *
 * A-time (Assistant-managed time): Assistant manages the chair. Doctor CAN be in
 *   D-time elsewhere during A-time — this is the core of productive double-booking.
 *
 * This module provides:
 * - detectDTimeConflicts: find D-time overlaps across same-doctor columns (warning-level)
 * - getDTimeWindow: compute D-time start/end for a placed block instance
 */

import type { GenerationResult, ProviderInput, BlockTypeInput } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DTimeConflict {
  /** 24h time string where conflict starts */
  time: string;
  /** The doctor provider ID */
  providerId: string;
  /** The doctor provider name */
  providerName: string;
  /** Operatories that have overlapping D-time */
  operatories: string[];
  /** Block labels involved */
  blockLabels: string[];
}

export interface DTimeWindow {
  /** Provider/doctor ID */
  providerId: string;
  /** Operatory */
  operatory: string;
  /** Block instance ID */
  blockInstanceId: string;
  /** Block label */
  blockLabel: string;
  /** D-time start in minutes since midnight */
  dStartMin: number;
  /** D-time end in minutes since midnight (exclusive) */
  dEndMin: number;
  /** A-time start in minutes since midnight */
  aStartMin: number;
  /** A-time end in minutes since midnight (exclusive) */
  aEndMin: number;
  /** Total block start in minutes */
  blockStartMin: number;
  /** Total block end in minutes */
  blockEndMin: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Compute D-time windows for all placed blocks in a schedule
// ---------------------------------------------------------------------------

/**
 * For each distinct placed block instance, compute the D-time and A-time windows.
 * Only looks at non-break, non-empty slots.
 */
export function computeDTimeWindows(
  schedule: GenerationResult,
  blockTypes: BlockTypeInput[]
): DTimeWindow[] {
  // Group slots by blockInstanceId to find each block's start/end
  const instanceMap = new Map<string, {
    providerId: string;
    operatory: string;
    blockLabel: string;
    blockTypeId: string;
    times: number[];
  }>();

  for (const slot of schedule.slots) {
    if (slot.isBreak || !slot.blockTypeId || !slot.blockInstanceId) continue;

    const key = slot.blockInstanceId;
    const existing = instanceMap.get(key);
    const timeMin = timeToMinutes(slot.time);

    if (existing) {
      existing.times.push(timeMin);
    } else {
      instanceMap.set(key, {
        providerId: slot.providerId,
        operatory: slot.operatory,
        blockLabel: slot.blockLabel ?? '',
        blockTypeId: slot.blockTypeId,
        times: [timeMin],
      });
    }
  }

  // Infer time increment from schedule
  const uniqueTimes = [...new Set(schedule.slots.map(s => s.time))]
    .map(timeToMinutes)
    .sort((a, b) => a - b);
  const increment = uniqueTimes.length >= 2 ? uniqueTimes[1] - uniqueTimes[0] : 10;

  const windows: DTimeWindow[] = [];

  for (const [instanceId, block] of instanceMap) {
    if (block.times.length === 0) continue;

    const blockStartMin = Math.min(...block.times);
    // blockEnd = last slot start + 1 increment
    const blockEndMin = Math.max(...block.times) + increment;
    const blockDurationMin = blockEndMin - blockStartMin;

    // Look up D/A time from block type
    const bt = blockTypes.find(b => b.id === block.blockTypeId);
    const dTimeMin = bt?.dTimeMin ?? 0;
    const aTimeMin = bt?.aTimeMin ?? 0;
    const hasDA = dTimeMin > 0 || aTimeMin > 0;

    let dStartMin: number;
    let dEndMin: number;
    let aStartMin: number;
    let aEndMin: number;

    if (hasDA && dTimeMin + aTimeMin <= blockDurationMin) {
      // Use explicit D/A breakdown
      dStartMin = blockStartMin;
      dEndMin = blockStartMin + dTimeMin;
      aStartMin = dEndMin;
      aEndMin = aStartMin + aTimeMin;
    } else {
      // No D/A breakdown configured — treat all of block as D-time
      dStartMin = blockStartMin;
      dEndMin = blockEndMin;
      aStartMin = blockEndMin;
      aEndMin = blockEndMin;
    }

    windows.push({
      providerId: block.providerId,
      operatory: block.operatory,
      blockInstanceId: instanceId,
      blockLabel: block.blockLabel,
      dStartMin,
      dEndMin,
      aStartMin,
      aEndMin,
      blockStartMin,
      blockEndMin,
    });
  }

  return windows;
}

// ---------------------------------------------------------------------------
// Detect D-time conflicts across same-doctor columns
// ---------------------------------------------------------------------------

/**
 * Detect when a doctor has D-time active simultaneously in multiple columns.
 * Only doctor-role providers are checked.
 * Returns DTimeConflict records sorted by time.
 */
export function detectDTimeConflicts(
  schedule: GenerationResult,
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): DTimeConflict[] {
  const doctorIds = new Set(
    providers.filter(p => p.role === 'DOCTOR').map(p => p.id)
  );

  const windows = computeDTimeWindows(schedule, blockTypes).filter(w =>
    doctorIds.has(w.providerId) && w.dEndMin > w.dStartMin
  );

  // Group windows by doctor
  const byDoctor = new Map<string, DTimeWindow[]>();
  for (const w of windows) {
    const list = byDoctor.get(w.providerId) ?? [];
    list.push(w);
    byDoctor.set(w.providerId, list);
  }

  const conflicts: DTimeConflict[] = [];

  for (const [providerId, docWindows] of byDoctor) {
    if (docWindows.length <= 1) continue;

    const provider = providers.find(p => p.id === providerId);
    const providerName = provider?.name ?? providerId;

    // Check every pair of windows for D-time overlap
    for (let i = 0; i < docWindows.length; i++) {
      for (let j = i + 1; j < docWindows.length; j++) {
        const a = docWindows[i];
        const b = docWindows[j];

        // D-time intervals overlap if: a.dStart < b.dEnd AND b.dStart < a.dEnd
        const overlapStart = Math.max(a.dStartMin, b.dStartMin);
        const overlapEnd = Math.min(a.dEndMin, b.dEndMin);

        if (overlapStart < overlapEnd) {
          const conflictTime = minutesToTime(overlapStart);

          // Check if we already have a conflict for this provider at this time
          const existing = conflicts.find(
            c => c.time === conflictTime && c.providerId === providerId
          );

          if (existing) {
            if (!existing.operatories.includes(b.operatory)) {
              existing.operatories.push(b.operatory);
            }
            if (b.blockLabel && !existing.blockLabels.includes(b.blockLabel)) {
              existing.blockLabels.push(b.blockLabel);
            }
          } else {
            conflicts.push({
              time: conflictTime,
              providerId,
              providerName,
              operatories: [a.operatory, b.operatory].filter(Boolean),
              blockLabels: [a.blockLabel, b.blockLabel].filter(Boolean),
            });
          }
        }
      }
    }
  }

  // Sort by time ascending
  conflicts.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  return conflicts;
}

// ---------------------------------------------------------------------------
// Compute D/A proportions for visual display
// ---------------------------------------------------------------------------

/**
 * Given a block type and the total number of time slots placed,
 * return the D-time and A-time proportions (0–1) for visual rendering.
 * Falls back to 1.0 D-time if no D/A split is configured.
 */
export function getDAProportion(
  blockType: BlockTypeInput,
  totalDurationMin: number
): { dProportion: number; aProportion: number; hasSplit: boolean } {
  const dTimeMin = blockType.dTimeMin ?? 0;
  const aTimeMin = blockType.aTimeMin ?? 0;

  if (dTimeMin <= 0 && aTimeMin <= 0) {
    return { dProportion: 1, aProportion: 0, hasSplit: false };
  }

  const configured = dTimeMin + aTimeMin;

  if (configured <= 0 || totalDurationMin <= 0) {
    return { dProportion: 1, aProportion: 0, hasSplit: false };
  }

  const scale = Math.min(1, configured / totalDurationMin);
  const dProportion = (dTimeMin / configured) * scale;
  const aProportion = (aTimeMin / configured) * scale;

  return { dProportion, aProportion, hasSplit: dTimeMin > 0 && aTimeMin > 0 };
}

// ---------------------------------------------------------------------------
// Hygiene H+D Time Model (§3.5)
// ---------------------------------------------------------------------------

/** Minimum offset (minutes from appointment start) before doctor D-time may begin in hygiene. */
export const HYGIENE_DTIME_MIN_OFFSET = 20;

/** Default D-time offset (minutes) for a standard 60-min hygiene appointment. */
export const HYGIENE_DTIME_DEFAULT_OFFSET = 25;

/** Default D-time duration (minutes) for a hygiene doctor exam. */
export const HYGIENE_DTIME_DEFAULT_DURATION = 10;

export interface HygieneDTimeValidation {
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

/**
 * Validate the D-time offset for a hygiene appointment type.
 *
 * Rules (§3.5):
 *  - D-time start offset must be ≥ HYGIENE_DTIME_MIN_OFFSET (20 min)
 *  - D-time start offset must be < appointment duration
 *  - D-time duration must fit within the appointment (offset + dTimeMin ≤ durationMin)
 *
 * @param dTimeOffsetMin  - Minutes from appointment start when doctor enters
 * @param dTimeMin        - Duration of doctor exam (minutes)
 * @param appointmentDurationMin - Total appointment duration (minutes)
 */
export function validateHygieneDTimeOffset(
  dTimeOffsetMin: number,
  dTimeMin: number,
  appointmentDurationMin: number
): HygieneDTimeValidation {
  if (dTimeOffsetMin < HYGIENE_DTIME_MIN_OFFSET) {
    return {
      valid: false,
      error: `D-time start must be at minute ${HYGIENE_DTIME_MIN_OFFSET} or later (got minute ${dTimeOffsetMin}). Doctor exam cannot begin before minute 20 of a hygiene appointment.`,
    };
  }

  if (dTimeOffsetMin >= appointmentDurationMin) {
    return {
      valid: false,
      error: `D-time start (minute ${dTimeOffsetMin}) must be before the end of the appointment (${appointmentDurationMin} min).`,
    };
  }

  if (dTimeMin > 0 && dTimeOffsetMin + dTimeMin > appointmentDurationMin) {
    return {
      valid: false,
      error: `D-time window (minute ${dTimeOffsetMin} to ${dTimeOffsetMin + dTimeMin}) extends beyond the appointment duration (${appointmentDurationMin} min).`,
    };
  }

  return { valid: true };
}

/**
 * Compute the default D-time offset for a hygiene appointment based on its duration.
 * Scales the offset proportionally: longer appointments → later exam time.
 * Always returns a value ≥ HYGIENE_DTIME_MIN_OFFSET.
 *
 * @param appointmentDurationMin - Total appointment duration in minutes
 * @param timeIncrement - Office time increment (10 or 15 min)
 */
export function computeDefaultHygieneDTimeOffset(
  appointmentDurationMin: number,
  timeIncrement: number = 10
): number {
  // Default: ~40% into the appointment (after hygiene assessment & scaling portion)
  const rawOffset = Math.round(appointmentDurationMin * 0.4);
  // Snap to the time increment
  const snapped = Math.round(rawOffset / timeIncrement) * timeIncrement;
  // Enforce minimum of 20 minutes
  return Math.max(HYGIENE_DTIME_MIN_OFFSET, snapped);
}

/**
 * Compute H/D time proportions for a hygiene appointment block.
 * H-time fills the appointment until the doctor arrives; D-time is the doctor exam overlay.
 *
 * Returns proportions for visual rendering in the ScheduleGrid.
 */
export function getHygieneDAProportion(
  blockType: BlockTypeInput,
  totalDurationMin: number
): { hProportion: number; dProportion: number; hasSplit: boolean } {
  const hTimeMin = blockType.hTimeMin ?? 0;
  const dTimeMin = blockType.dTimeMin ?? 0;
  const dTimeOffsetMin = blockType.dTimeOffsetMin ?? 0;

  if ((hTimeMin <= 0 && dTimeMin <= 0) || totalDurationMin <= 0) {
    return { hProportion: 1, dProportion: 0, hasSplit: false };
  }

  // H-time fills from start until the doctor overlay begins
  const effectiveOffset = dTimeOffsetMin > 0
    ? Math.min(dTimeOffsetMin, totalDurationMin)
    : computeDefaultHygieneDTimeOffset(totalDurationMin);

  const hProportion = Math.min(1, effectiveOffset / totalDurationMin);
  const dEnd = Math.min(totalDurationMin, effectiveOffset + (dTimeMin > 0 ? dTimeMin : HYGIENE_DTIME_DEFAULT_DURATION));
  const dProportion = Math.max(0, (dEnd - effectiveOffset) / totalDurationMin);

  return { hProportion, dProportion, hasSplit: dProportion > 0 };
}
