/**
 * The 8 clinical procedure categories used for mix intelligence.
 */
export type ProcedureCategory =
  | 'MAJOR_RESTORATIVE'   // Crown, Bridge, Onlay, Veneer, Implant Crown
  | 'ENDODONTICS'          // Root Canal, Retreatment
  | 'BASIC_RESTORATIVE'    // Composites, Amalgams, Build-ups
  | 'PERIODONTICS'         // SRP, Perio Maintenance, Osseous
  | 'NEW_PATIENT_DIAG'     // Comprehensive Exam, X-rays, Consult
  | 'EMERGENCY_ACCESS'     // Limited Exam, Palliative
  | 'ORAL_SURGERY'         // Extractions, Implant Placement
  | 'PROSTHODONTICS';      // Dentures, Partials, Implant-Retained

/** All 8 procedure categories in display order */
export const ALL_PROCEDURE_CATEGORIES: ProcedureCategory[] = [
  'MAJOR_RESTORATIVE',
  'ENDODONTICS',
  'BASIC_RESTORATIVE',
  'PERIODONTICS',
  'NEW_PATIENT_DIAG',
  'EMERGENCY_ACCESS',
  'ORAL_SURGERY',
  'PROSTHODONTICS',
];

/** Human-readable labels for each procedure category */
export const PROCEDURE_CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  MAJOR_RESTORATIVE: 'Major Restorative',
  ENDODONTICS: 'Endodontics',
  BASIC_RESTORATIVE: 'Basic Restorative',
  PERIODONTICS: 'Periodontics',
  NEW_PATIENT_DIAG: 'New Patient / Diag',
  EMERGENCY_ACCESS: 'Emergency / Access',
  ORAL_SURGERY: 'Oral Surgery',
  PROSTHODONTICS: 'Prosthodontics',
};

/** Procedure mix as percentage values (should sum to 100) */
export type ProcedureMix = Partial<Record<ProcedureCategory, number>>;

/**
 * Auto-assign a ProcedureCategory based on block type label keywords.
 * Case-insensitive. Falls back to BASIC_RESTORATIVE if no match.
 */
export function inferProcedureCategory(label: string): ProcedureCategory {
  const lbl = label.toUpperCase();
  if (/CROWN|BRIDGE|VENEER|ONLAY|INLAY|IMPLANT CROWN/.test(lbl)) return 'MAJOR_RESTORATIVE';
  if (/ROOT CANAL|ENDO|RCT|PULP/.test(lbl)) return 'ENDODONTICS';
  if (/COMPOSITE|FILLING|AMALGAM|BUILD.?UP|\bBU\b/.test(lbl)) return 'BASIC_RESTORATIVE';
  if (/SRP|PERIO|SCALING/.test(lbl)) return 'PERIODONTICS';
  // Emergency/limited BEFORE exam so "Limited Exam" → EMERGENCY_ACCESS
  if (/EMERGENCY|\bER\b|LIMITED EXAM|PALLIATIVE|LIMITED OCCLUSAL/.test(lbl)) return 'EMERGENCY_ACCESS';
  if (/NEW PATIENT|\bNP\b|EXAM|CONSULT|DIAGNOSTIC/.test(lbl)) return 'NEW_PATIENT_DIAG';
  // ER as standalone after clearing "Other" → word-boundary on both sides
  if (/\bER\b/.test(lbl)) return 'EMERGENCY_ACCESS';
  if (/EXTRACTION|SURGERY|IMPLANT PLACE|SURGICAL/.test(lbl)) return 'ORAL_SURGERY';
  if (/DENTURE|PARTIAL|PROSTH/.test(lbl)) return 'PROSTHODONTICS';
  return 'BASIC_RESTORATIVE';
}

/** Benchmark procedure mix presets */
export const PROCEDURE_MIX_BENCHMARKS: Record<string, ProcedureMix> = {
  'General Practice': {
    MAJOR_RESTORATIVE: 25, ENDODONTICS: 10, BASIC_RESTORATIVE: 20, PERIODONTICS: 10,
    NEW_PATIENT_DIAG: 12, EMERGENCY_ACCESS: 8, ORAL_SURGERY: 10, PROSTHODONTICS: 5,
  },
  'Endo-Heavy': {
    MAJOR_RESTORATIVE: 15, ENDODONTICS: 35, BASIC_RESTORATIVE: 15, PERIODONTICS: 10,
    NEW_PATIENT_DIAG: 10, EMERGENCY_ACCESS: 5, ORAL_SURGERY: 5, PROSTHODONTICS: 5,
  },
  'Cosmetic-Focused': {
    MAJOR_RESTORATIVE: 40, ENDODONTICS: 5, BASIC_RESTORATIVE: 15, PERIODONTICS: 10,
    NEW_PATIENT_DIAG: 15, EMERGENCY_ACCESS: 5, ORAL_SURGERY: 5, PROSTHODONTICS: 5,
  },
};

/** A single row in the gap analysis table */
export interface MixGapRow {
  category: ProcedureCategory;
  label: string;
  currentPct: number;
  targetPct: number;
  gap: number; // targetPct - currentPct (positive = need more, negative = need less)
  action: string;
  severity: 'ok' | 'amber' | 'red';
}

/**
 * Per-day working hours entry for a provider.
 * When `enabled` is false, the provider is off that day (no slots generated).
 * When `enabled` is true, use `workingStart`/`workingEnd`/`lunchStart`/`lunchEnd` for that day.
 */
export interface ProviderDayScheduleEntry {
  enabled: boolean;
  workingStart?: string;
  workingEnd?: string;
  lunchStart?: string | null;
  lunchEnd?: string | null;
  /**
   * Which rotation weeks this provider works on this specific day.
   * Undefined or empty = works all weeks (default).
   * Example: ['A', 'C'] means provider only works Week A and Week C on this day.
   */
  rotationWeeks?: string[];
}

/** Per-day schedule overrides keyed by day of week ("MONDAY", "TUESDAY", etc.). */
export type ProviderSchedule = Partial<Record<string, ProviderDayScheduleEntry>>;

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
  /**
   * Per-day working hours overrides.
   * Empty object or undefined = use general workingStart/workingEnd for all days.
   * Key: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY"
   */
  providerSchedule?: ProviderSchedule;
  /**
   * Current procedure mix percentages (8 categories summing to 100).
   * Represents today's actual production distribution.
   */
  currentProcedureMix?: ProcedureMix;
  /**
   * Future procedure mix percentages (8 categories summing to 100).
   * When set and valid (sum ~100), drives the generator's category-weighted placement.
   */
  futureProcedureMix?: ProcedureMix;
  /**
   * Sprint 1 — Day-of-week roster (Bible \u00a77). First-class, not an override.
   * Provider only appears on days listed here. When undefined/empty, defaults to
   * all five weekdays (MON\u2013FRI) per backward-compatibility.
   *
   * Example: Kelli (hygienist) with roster ['MON','TUE','WED','THU'] does NOT
   * appear on Friday regardless of providerSchedule overrides.
   */
  dayOfWeekRoster?: DayOfWeekCode[];
}

// ---------------------------------------------------------------------------
// Sprint 1 — X-segment canonical primitive (Bible §2.1)
// ---------------------------------------------------------------------------

/**
 * The X-segment template is the canonical decomposition of a procedure into
 * three contiguous time bands:
 *
 *   [ asstPreMin ][ doctorMin ][ asstPostMin ]
 *   (assistant)  (doctor X)    (assistant)
 *
 * All durations are in **minutes**. Total duration = asstPreMin + doctorMin + asstPostMin.
 *
 * Per Bible §2.1:
 * - `doctorMin` is the constrained (singleton) resource the multi-column
 *   coordinator solves on.
 * - `asstPreMin` and `asstPostMin` are assistant-only (or hygienist-only for
 *   hygiene blocks) and may overlap freely across columns.
 * - `doctorContinuityRequired=true` forces the doctor to remain in the room
 *   for the full `doctorMin` window (endo, surgical ext, implant, IV sedation).
 *   The coordinator refuses to schedule a second continuity-required D-segment
 *   concurrent on the same doctor even if `maxConcurrentDoctorOps > 1`.
 * - `examWindowMin` constrains a hygiene block's embedded doctor exam to a
 *   given sub-range (in 10-min unit indices within the block).
 */
export interface XSegmentTemplate {
  /** Leading assistant-only minutes (setup, seat, numb, x-rays) */
  readonly asstPreMin: number;
  /** Middle doctor hands-on minutes — the X-segment. 0 = pure assistant/hygiene block */
  readonly doctorMin: number;
  /** Trailing assistant-only minutes (dismiss, turnover, temps) */
  readonly asstPostMin: number;
  /** If true, doctor cannot leave mid-procedure (endo, surgical ext, implant) */
  readonly doctorContinuityRequired?: boolean;
  /**
   * Hygiene-only: the range of 10-min unit indices within the block where
   * the embedded doctor exam may land. `earliestUnitIdx` inclusive,
   * `latestUnitIdx` inclusive. Middle 30 min of a 60-min recall = {1, 4}.
   */
  readonly examWindowMin?: {
    readonly earliestUnitIdx: number;
    readonly latestUnitIdx: number;
  };
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
  /**
   * Procedure category for mix intelligence (Sprint 9).
   * One of the 8 ProcedureCategory values. Auto-assigned from label keywords if not set.
   */
  procedureCategory?: ProcedureCategory;
  /**
   * Per-slot staffing pattern extracted from real practice templates.
   *
   * @deprecated Prefer `xSegment` for Sprint 1+ code. The legacy `pattern`
   * array is still honored by `pattern-catalog.resolvePattern()` as a
   * single-column fallback when no X-segment template is present.
   */
  pattern?: StaffingCode[];
  /**
   * Sprint 1 — X-segment canonical primitive. When present, the Multi-Column
   * Coordinator uses this (not `pattern`) to solve the doctor graph. See
   * Bible §2.1 and `XSegmentTemplate` above.
   */
  xSegment?: XSegmentTemplate;
  /**
   * Sprint 1 — convenience duplicate of `xSegment.doctorContinuityRequired`
   * so the Prisma column can map 1:1. When both are set, `xSegment` wins.
   */
  doctorContinuityRequired?: boolean;
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
  /** Loop 1: optional seed for deterministic generation (goldens + retry-envelope). */
  seed?: number;
  /** Loop 1: optional pre-built seeded RNG function (takes precedence over seed). */
  rng?: () => number;
  /** Loop 3: 0..1 intensity dial for default mix prescription (defaults to 0.5). */
  intensity?: number;
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
  /** Loop 5: one-line explanation of why the engine placed this block (null = user-placed or pre-Loop-5 data). */
  rationale?: string | null;
}

export interface GenerationResult {
  dayOfWeek: string;
  slots: TimeSlotOutput[];
  productionSummary: ProviderProductionSummary[];
  warnings: string[];
  /**
   * Loop 9: optional variant tag (e.g. "EOF" for Early-Off Friday, "Opt1"/"Opt2"
   * for alternate schedules). Null/undefined/empty = regular (non-variant) day.
   */
  variantLabel?: string | null;
  /**
   * Sprint 3 — Anti-Pattern Guard report (AP-1..AP-15). Computed from the
   * placed-block decomposition of `slots` at the tail of generation. Null
   * when the pipeline has no placed doctor D-segments (e.g. hygiene-only
   * office with no xSegment data). The UI "Guard Report" panel reads this.
   */
  guardReport?: GuardReport | null;
  /** Loop 4: Morning-load enforcer telemetry (optional; omitted if no doctors). */
  morningLoadSwaps?: {
    /** Schedule-wide ratio of morning doctor restorative $ / total doctor restorative $. */
    scheduleRatio: number;
    /** Per provider+operatory key → ratio. */
    perOpRatios: Record<string, number>;
    /** List of provider+operatory keys still below the hard cap after enforcement. */
    hardCapViolators: string[];
    /** Swap operations recorded by the enforcer, in order of application. */
    swaps: Array<{
      providerId: string;
      operatory: string;
      amBlockLabel: string;
      amBlockTime: string;
      pmBlockLabel: string;
      pmBlockTime: string;
      ratioBefore: number;
      ratioAfter: number;
    }>;
  };
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

// ---------------------------------------------------------------------------
// Rock-Sand-Water types
// ---------------------------------------------------------------------------

/** Rock-Sand-Water production tier classification */
export type RSWTier = 'ROCK' | 'SAND' | 'WATER';

/**
 * Configuration for Rock-Sand-Water scheduling methodology.
 * Controls production distribution, block placement rules, and timing constraints.
 */
export interface RSWConfig {
  /** Target percentage of daily production from ROCK blocks (default 0.55, aim 0.60-0.70) */
  rockProductionPct: number;
  /** Target percentage of restorative production in morning — Burkhart 80/20 rule (default 0.80) */
  morningProductionPct: number;
  /** Number of New Patient blocks per day (default 2: 1 AM ~9-10am, 1 PM ~2-3pm) */
  npBlocksPerDay: number;
  /** ER block placement strategy: mid-morning (10-11am) + early afternoon (2-3pm) */
  erPlacement: 'MID_MORNING_EARLY_PM';
  /** Protected rock blocks per half-day — Linda Miles rule (default { am: 2, pm: 1 }) */
  protectedRockBlocks: { am: number; pm: number };
}

/**
 * Result of auto-applying stagger fixes to a multi-column schedule.
 * Returned by the stagger-resolver after conflict resolution.
 */
export interface StaggerApplicationResult {
  /** The modified slots array */
  modifiedSlots: TimeSlotOutput[];
  /** Record of each move that was applied */
  appliedMoves: Array<{
    fromTime: string;
    toTime: string;
    providerId: string;
    operatory: string;
    reason: string;
  }>;
  /** Any conflicts that could not be automatically resolved */
  remainingConflicts: Array<{
    time: string;
    providerId: string;
    operatories: string[];
    blockLabels: string[];
  }>;
}

/**
 * Per-day working hours override.
 * Key: day abbreviation ("Mon", "Tue", etc.)
 * Value: { start, end } for working days, or null for closed days.
 */
export type PerDayHours = Record<string, { start: string; end: string } | null>;

// ---------------------------------------------------------------------------
// Sprint 1 — Coordination contracts (Bible §3, §4, §9)
// ---------------------------------------------------------------------------

/**
 * Canonical practice-model codes per Bible §8 / PRD-V4 §6.
 * Format: `<nDoctors>D<nOps>O[_<nHygienists>H]` or hybrid variants.
 * - `1D1O`: 1 doctor, 1 operatory (single-column)
 * - `1D2O`: 1 doctor, 2 ops (classic dual-column)
 * - `1D3O`: 1 doctor, 3 ops (quarterback model — only with EFDA scope)
 * - `2D3O`: 2 doctors, 3 ops (Dr. A & Dr. B sharing middle op)
 * - `1D2O_3H`: 1 doctor, 2 doctor ops, 3 hygiene ops
 * - `2D4O_2H`: 2 doctors, 4 doctor ops, 2 hygiene ops
 */
export type PracticeModelCode =
  | '1D1O'
  | '1D2O'
  | '1D3O'
  | '1D4O'
  | '2D3O'
  | '2D4O'
  | '2D5O'
  | '2D6O'
  | '1D2O_3H'
  | '2D4O_2H'
  | 'CUSTOM';

/**
 * Production-target policy per Bible §4.
 * - `JAMESON_50`: Jameson — 50% primary pre-block
 * - `LEVIN_60`: Levin Group — 60–65% morning
 * - `FARRAN_75_BY_NOON`: Farran / Burkhart — 75–80% primary before noon
 * - `CUSTOM`: caller supplies explicit morningSharePct + morningCutoffMin
 */
export type ProductionTargetPolicy =
  | 'JAMESON_50'
  | 'LEVIN_60'
  | 'FARRAN_75_BY_NOON'
  | 'CUSTOM';

/**
 * EFDA (Expanded Function Dental Assistant) scope profile per Bible §3.3.
 * Gates whether `maxConcurrentDoctorOps` may exceed 2.
 */
export type EfdaScopeLevel = 'NONE' | 'LIMITED' | 'BROAD';

/** Day-of-week roster abbreviation per Bible §7. */
export type DayOfWeekCode = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

/**
 * Canonical placed-block shape returned by the generator after coordination.
 * Extends the slot-level TimeSlotOutput with block-level metadata and
 * X-segment band minutes per Bible §2.1.
 */
export interface PlacedBlock {
  /** Unique instance id shared by every slot of this block */
  blockInstanceId: string;
  blockTypeId: string;
  blockLabel: string;
  providerId: string;
  operatory: string;
  /** Start minute of day (0 = midnight) */
  startMinute: number;
  /** Total duration in minutes (asstPreMin + doctorMin + asstPostMin) */
  durationMin: number;
  /** Leading assistant-only minutes (X-segment pre-band) */
  asstPreMin: number;
  /** Middle doctor hands-on minutes (X-segment D-band) */
  doctorMin: number;
  /** Trailing assistant-only minutes (X-segment post-band) */
  asstPostMin: number;
  /** Start minute (of day) of the doctor-X band */
  doctorStartMinute?: number;
  /** Set true when doctor must remain continuous for the full D-band */
  doctorContinuityRequired?: boolean;
  /** Production amount in dollars for this placed block */
  productionAmount?: number;
  /** Explanation string for the UI rationale tooltip */
  rationale?: string | null;
}

/**
 * Per-minute (or per-unit) doctor-occupancy entry recorded by the
 * MultiColumnCoordinator. Used for trace inspection, tests, and debug UI.
 */
export interface DoctorScheduleTrace {
  /** Minute of day (0 = midnight) the D-band starts */
  doctorStartMinute: number;
  /** Minute of day (exclusive) the D-band ends */
  doctorEndMinute: number;
  /** Doctor provider id the D-band is bound to */
  doctorProviderId: string;
  /** Operatory the patient is seated in (may differ from doctorProviderId.operatories[0]) */
  operatory: string;
  /** Placed block instance that owns this D-band */
  blockInstanceId: string;
  /** True when serialized due to continuityRequired */
  continuityRequired: boolean;
  /** Whether this D-band was placed as the 'primary' or an overlap */
  concurrencyIndex: number;
}

/**
 * A single anti-pattern violation flagged by the AntiPatternGuard.
 * `ap` identifies which rule (AP-1..AP-15, Bible §9).
 */
export interface Violation {
  /** Anti-pattern identifier, e.g. "AP-1", "AP-7" */
  ap: string;
  /** Short machine-readable code (e.g. "D_COLLISION", "ORPHAN_X") */
  code: string;
  /** Human-readable explanation (surfaced in UI) */
  message: string;
  /** Severity: HARD = must be fixed, SOFT = advisory, INFO = telemetry */
  severity: 'HARD' | 'SOFT' | 'INFO';
  /** Optional block instance(s) involved */
  blockInstanceIds?: string[];
  /** Optional time-of-day range */
  range?: { startMinute: number; endMinute: number };
  /** Optional provider id */
  providerId?: string;
  /** Optional operatory */
  operatory?: string;
}

/**
 * Per-guard result. Returned by each AP-* guard function and aggregated by
 * `runAllGuards()`.
 */
export interface GuardResult {
  /** Guard identifier, e.g. "AP-1" */
  ap: string;
  /** Whether no violations were found */
  passed: boolean;
  violations: Violation[];
}

/**
 * Aggregate report from `runAllGuards()`.
 */
export interface GuardReport {
  /** True only when every guard passed */
  passed: boolean;
  results: GuardResult[];
  /** Flat list of every violation across all guards, sorted by severity */
  violations: Violation[];
  /** Counts by severity, for dashboards */
  counts: { hard: number; soft: number; info: number };
}

/**
 * Full generator output. Sprint 1 onward this is the coordinator-backed shape;
 * legacy `GenerationResult` stays for back-compat with the existing UI until
 * Sprint 2 finishes the UI migration.
 */
export interface GeneratedSchedule {
  dayOfWeek: DayOfWeekCode;
  blocks: PlacedBlock[];
  doctorTrace: DoctorScheduleTrace[];
  guardReport: GuardReport;
  warnings: string[];
  /** Optional telemetry surfaced for diagnostics / policy-tuning UI */
  policy?: {
    policy: ProductionTargetPolicy;
    targetPrimaryPct: number;
    morningSharePct?: number;
    morningCutoffMin?: number;
    achievedPrimaryPct?: number;
    achievedMorningPct?: number;
  };
}

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
