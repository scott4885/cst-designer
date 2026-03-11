export interface ProviderInput {
  id: string;
  name: string;
  /** Provider ID for DPMS export (e.g. "DG001", "DR-01"). Optional but recommended. */
  providerId?: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  operatories: string[];
  columns?: number;     // Number of simultaneous ops (1=single, 2+=multi-column). Defaults to 1.
  workingStart: string; // "07:00"
  workingEnd: string;   // "16:00"
  lunchStart?: string;  // "12:00"
  lunchEnd?: string;    // "13:00"
  lunchEnabled?: boolean; // defaults to true; when false, no lunch break rendered
  dailyGoal: number;
  color: string;
  seesNewPatients?: boolean;          // defaults to true
  enabledBlockTypeIds?: string[];     // if set, only these block types; if unset, all applicable
  assistedHygiene?: boolean;          // hygienists only: enables assisted hygiene (2-3 chair rotation) mode
  staggerOffsetMin?: number;          // doctor stagger override (auto-calculated if not set)
  columnStaggerIntervalMin?: number;  // minutes between each column's schedule offset (default 20). Used when provider works multiple operatories simultaneously.
}

export interface BlockTypeInput {
  id: string;
  label: string;
  description?: string;
  minimumAmount?: number;
  appliesToRole: 'DOCTOR' | 'HYGIENIST' | 'BOTH';
  durationMin: number;  // minutes (total = dTimeMin + aTimeMin when both set)
  durationMax?: number;
  isHygieneType?: boolean; // when true, never auto-place in Doctor columns
  color?: string;
  /** D-time (Doctor-active time): minutes the doctor is physically hands-on. 0 = not set. */
  dTimeMin?: number;
  /** A-time (Assistant-managed time): minutes the assistant manages the chair. 0 = not set. */
  aTimeMin?: number;
  /**
   * H-time (Hygienist time): minutes the hygienist actively works the chair.
   * Only applies to hygiene appointment types. When set, combined with dTimeMin for
   * the H+D model (hygienist majority + doctor exam overlay).
   */
  hTimeMin?: number;
  /**
   * D-time start offset for hygiene appointments (minutes from appointment start).
   * Doctor exam time begins at this offset. Must be ≥ 20 (cannot be earlier than
   * 20 minutes into the hygiene appointment).
   * Default: 25 (doctor comes in at minute 25 for a standard 60-min hygiene appointment).
   */
  dTimeOffsetMin?: number;
}

export interface ScheduleRules {
  npModel: 'DOCTOR_ONLY' | 'HYGIENIST_ONLY' | 'EITHER';
  npBlocksPerDay: number;
  srpBlocksPerDay: number;
  hpPlacement: 'MORNING' | 'AFTERNOON' | 'ANY';
  doubleBooking: boolean;
  matrixing: boolean;
  emergencyHandling: 'DEDICATED' | 'FLEX' | 'ACCESS_BLOCKS';
}

export interface GenerationInput {
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  rules: ScheduleRules;
  timeIncrement: number; // 10 or 15
  dayOfWeek: string;
}

export interface TimeSlotOutput {
  time: string;        // "07:00", "07:10", etc.
  providerId: string;
  operatory: string;
  staffingCode: 'D' | 'A' | 'H' | null;
  blockTypeId: string | null;
  blockLabel: string | null;
  isBreak: boolean;
  /** Unique ID shared by all slots of the same placed block instance (prevents adjacent same-type blocks from merging) */
  blockInstanceId?: string | null;
  /** Per-block override of the production minimum (overrides blockType.minimumAmount for this specific placed block) */
  customProductionAmount?: number | null;
}

export interface GenerationResult {
  dayOfWeek: string;
  slots: TimeSlotOutput[];
  productionSummary: ProviderProductionSummary[];
  warnings: string[];
}

export interface ProviderProductionSummary {
  providerId: string;
  providerName: string;
  dailyGoal: number;
  target75: number;
  actualScheduled: number;
  /** Sum of blocks where minimumAmount >= 1000 (High Production metric) */
  highProductionScheduled?: number;
  status: 'MET' | 'UNDER' | 'OVER';
  blocks: { label: string; amount: number; count: number }[];
  /** Per-operatory production breakdown (only populated for multi-op doctors). */
  opBreakdown?: { operatory: string; amount: number }[];
}

export type StaffingCode = 'D' | 'A' | 'H' | null;

/**
 * Per-day working hours override.
 * Key: day abbreviation ("Mon", "Tue", etc.)
 * Value: { start, end } for working days, or null for closed days.
 */
export type PerDayHours = Record<string, { start: string; end: string } | null>;

/**
 * Snap a minute value to the nearest time increment boundary.
 * Used to ensure rotation events, stagger offsets, and D-time windows
 * align with the office's configured time increment (10 or 15 min).
 *
 * @param minutes - The minute value to snap
 * @param increment - The time increment in minutes (e.g. 10 or 15)
 * @param direction - 'round' (default), 'floor', or 'ceil'
 */
export function snapToIncrement(
  minutes: number,
  increment: number,
  direction: 'round' | 'floor' | 'ceil' = 'round'
): number {
  if (increment <= 0) return minutes;
  switch (direction) {
    case 'floor': return Math.floor(minutes / increment) * increment;
    case 'ceil':  return Math.ceil(minutes / increment) * increment;
    default:      return Math.round(minutes / increment) * increment;
  }
}
