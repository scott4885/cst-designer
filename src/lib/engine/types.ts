export interface ProviderInput {
  id: string;
  name: string;
  role: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  operatories: string[];
  columns?: number;     // Number of simultaneous ops (1=single, 2+=multi-column). Defaults to 1.
  workingStart: string; // "07:00"
  workingEnd: string;   // "18:00"
  lunchStart?: string;  // "13:00"
  lunchEnd?: string;    // "14:00"
  dailyGoal: number;
  color: string;
  seesNewPatients?: boolean;          // defaults to true
  enabledBlockTypeIds?: string[];     // if set, only these block types; if unset, all applicable
}

export interface BlockTypeInput {
  id: string;
  label: string;
  description?: string;
  minimumAmount?: number;
  appliesToRole: 'DOCTOR' | 'HYGIENIST' | 'BOTH';
  durationMin: number;  // minutes
  durationMax?: number;
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
  status: 'MET' | 'UNDER' | 'OVER';
  blocks: { label: string; amount: number; count: number }[];
}

export type StaffingCode = 'D' | 'A' | 'H' | null;
