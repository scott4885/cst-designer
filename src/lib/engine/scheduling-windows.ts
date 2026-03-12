/**
 * Smart Scheduling Windows — Sprint 17, Task 3
 *
 * Defines time windows with preferred procedure categories.
 * Used by the generator to weight block placement and by clinical rules
 * to validate that high-production blocks are in prime-time windows.
 */

import type { ProcedureCategory } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulingWindow {
  label: string;
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  preferredCategories: ProcedureCategory[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Find which scheduling window a given time falls into.
 * Returns null if no window matches.
 */
export function findWindowForTime(
  timeStr: string,
  windows: SchedulingWindow[]
): SchedulingWindow | null {
  const min = timeToMin(timeStr);
  for (const w of windows) {
    const wStart = timeToMin(w.start);
    const wEnd = timeToMin(w.end);
    if (min >= wStart && min < wEnd) return w;
  }
  return null;
}

/**
 * Check if a procedure category is preferred in the window containing the given time.
 * Returns true if the category is in the preferred list for that window,
 * or if no window is defined for that time (no preference constraint).
 */
export function isCategoryInPreferredWindow(
  timeStr: string,
  category: ProcedureCategory,
  windows: SchedulingWindow[]
): boolean {
  if (windows.length === 0) return true;
  const window = findWindowForTime(timeStr, windows);
  if (!window) return true; // no constraint outside defined windows
  return window.preferredCategories.includes(category);
}

/**
 * Calculate a window preference weight for block scoring.
 * Returns +0.20 bonus if the category matches the preferred window,
 * -0.10 penalty if in a window that has other preferred categories,
 * 0 if no windows defined.
 */
export function windowPreferenceWeight(
  timeStr: string,
  category: ProcedureCategory,
  windows: SchedulingWindow[]
): number {
  if (windows.length === 0) return 0;
  const window = findWindowForTime(timeStr, windows);
  if (!window) return 0;
  if (window.preferredCategories.includes(category)) return 0.20;
  if (window.preferredCategories.length > 0) return -0.10; // mismatch penalty
  return 0;
}

/**
 * Parse schedulingWindows JSON string from Office model.
 * Returns empty array on parse failure.
 */
export function parseSchedulingWindows(json: string): SchedulingWindow[] {
  if (!json || json === '[]') return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w): w is SchedulingWindow =>
        typeof w.label === 'string' &&
        typeof w.start === 'string' &&
        typeof w.end === 'string' &&
        Array.isArray(w.preferredCategories)
    );
  } catch {
    return [];
  }
}

/**
 * Clinical Rule 7: Detect HP (Major Restorative / Endodontics) blocks
 * scheduled in non-prime windows when prime windows exist.
 *
 * Returns an array of warning messages.
 */
export interface WindowViolation {
  ruleId: 'RULE_7_WINDOW_MISMATCH';
  severity: 'warning';
  message: string;
  affectedTime?: string;
  affectedProvider?: string;
}

export interface BlockPlacement {
  time: string; // "HH:MM" or "H:MM AM/PM"
  providerName: string;
  category: ProcedureCategory;
  blockLabel: string;
}

export function validateSchedulingWindows(
  placements: BlockPlacement[],
  windows: SchedulingWindow[]
): WindowViolation[] {
  if (windows.length === 0) return [];

  const HP_CATEGORIES: ProcedureCategory[] = ['MAJOR_RESTORATIVE', 'ENDODONTICS'];
  const violations: WindowViolation[] = [];

  // Find prime windows (ones with HP categories as preferred)
  const primeWindows = windows.filter((w) =>
    w.preferredCategories.some((c) => HP_CATEGORIES.includes(c))
  );
  if (primeWindows.length === 0) return []; // No prime windows defined

  for (const placement of placements) {
    if (!HP_CATEGORIES.includes(placement.category)) continue;

    const window = findWindowForTime(placement.time, windows);
    if (!window) continue;

    // Check if the block is in a prime window
    const isInPrime = primeWindows.some((pw) => pw.label === window.label);
    if (!isInPrime) {
      violations.push({
        ruleId: 'RULE_7_WINDOW_MISMATCH',
        severity: 'warning',
        message: `Major restorative scheduled outside prime time window (${placement.blockLabel} at ${placement.time} in "${window.label}" — prime time is ${primeWindows.map((p) => p.label).join(', ')})`,
        affectedTime: placement.time,
        affectedProvider: placement.providerName,
      });
    }
  }

  return violations;
}

/**
 * Default scheduling windows preset for a typical GP practice.
 */
export const DEFAULT_SCHEDULING_WINDOWS: SchedulingWindow[] = [
  {
    label: 'Morning Prime',
    start: '08:00',
    end: '11:00',
    preferredCategories: ['MAJOR_RESTORATIVE', 'ENDODONTICS'],
  },
  {
    label: 'Midday',
    start: '11:00',
    end: '13:00',
    preferredCategories: ['BASIC_RESTORATIVE', 'NEW_PATIENT_DIAG'],
  },
  {
    label: 'Afternoon Fill',
    start: '14:00',
    end: '17:00',
    preferredCategories: ['BASIC_RESTORATIVE', 'EMERGENCY_ACCESS'],
  },
];
