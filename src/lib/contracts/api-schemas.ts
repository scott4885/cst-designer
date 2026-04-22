/**
 * Centralized Zod schemas for API request validation.
 *
 * All API routes use `.safeParse()` against these schemas and return 400
 * with `error.flatten()` on failure. Replaces hand-rolled `if (!body.x)`
 * guards. Enums reject unknown values instead of silently coercing them.
 *
 * Scope: request bodies only — response shapes live in `api-types.ts`.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (shared)
// ---------------------------------------------------------------------------

/**
 * Provider role. Accepts any casing ("Doctor", "DOCTOR", "doctor") and
 * normalizes to uppercase — but rejects typos like "Doctore" or "HYG".
 */
export const ProviderRoleSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(['DOCTOR', 'HYGIENIST']));

/**
 * Block-type role — same casing rules as provider role, plus 'BOTH'.
 */
export const BlockRoleSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(['DOCTOR', 'HYGIENIST', 'BOTH']));

/**
 * Working day. Accepts full English day names in any casing, plus 3-letter
 * abbreviations (Mon, Tue, Wed, Thu, Fri, Sat, Sun). Rejects "Funday" etc.
 */
const DAY_NORMALIZE: Record<string, string> = {
  MON: 'MONDAY',
  TUE: 'TUESDAY',
  WED: 'WEDNESDAY',
  THU: 'THURSDAY',
  FRI: 'FRIDAY',
  SAT: 'SATURDAY',
  SUN: 'SUNDAY',
};
export const DayOfWeekSchema = z
  .string()
  .transform((s) => {
    const up = s.toUpperCase();
    return DAY_NORMALIZE[up] ?? up;
  })
  .pipe(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']));

/**
 * Week type — 'A' or 'B' for alternating-week offices.
 */
export const WeekTypeSchema = z.enum(['A', 'B']);

/**
 * NP model — how new-patient blocks are owned.
 */
export const NpModelSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(['DOCTOR_ONLY', 'HYGIENIST_ONLY', 'EITHER']));

/**
 * HP placement — when to prefer high-production blocks.
 */
export const HpPlacementSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(['MORNING', 'AFTERNOON', 'ANY']));

/**
 * Emergency handling strategy.
 */
export const EmergencyHandlingSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(['DEDICATED', 'FLEX', 'ACCESS_BLOCKS']));

/**
 * Staffing code letters used by the engine.
 */
export const StaffingCodeSchema = z.enum(['D', 'A', 'H']).nullable();

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

/** HH:MM 24-hour time, range 00:00 – 23:59. */
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

/** Daily dollar goal — clamp to sensible range. */
const DailyGoalSchema = z.number().min(0).max(100000);

/** Block duration in minutes — clamp 5–480. */
const DurationSchema = z.number().int().min(5).max(480);

// ---------------------------------------------------------------------------
// Office composition
// ---------------------------------------------------------------------------

export const ProviderInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    role: ProviderRoleSchema,
    operatories: z.array(z.string()).default(['OP1']),
    workingHours: z
      .object({
        start: TimeSchema.optional(),
        end: TimeSchema.optional(),
      })
      .optional(),
    lunchBreak: z
      .object({
        start: TimeSchema.optional(),
        end: TimeSchema.optional(),
      })
      .optional(),
    dailyGoal: DailyGoalSchema.optional(),
    color: z.string().optional(),
    providerId: z.string().optional(),
    lunchEnabled: z.boolean().optional(),
    staggerOffsetMin: z.number().int().min(0).max(240).optional(),
    assistedHygiene: z.boolean().optional(),
    handlesNewPatients: z.boolean().optional(),
  })
  .passthrough(); // let downstream accept future fields without a release

export const BlockTypeInputSchema = z
  .object({
    id: z.string().optional(),
    label: z.string().min(1),
    description: z.string().optional(),
    minimumAmount: z.number().min(0).optional(),
    appliesToRole: BlockRoleSchema.optional(),
    role: BlockRoleSchema.optional(),
    duration: DurationSchema.optional(),
    durationMax: DurationSchema.optional(),
  })
  .passthrough();

export const OfficeRulesSchema = z
  .object({
    npModel: NpModelSchema.optional(),
    npBlocksPerDay: z.number().int().min(0).max(20).optional(),
    srpBlocksPerDay: z.number().int().min(0).max(20).optional(),
    hpPlacement: HpPlacementSchema.optional(),
    doubleBooking: z.boolean().optional(),
    matrixing: z.boolean().optional(),
    emergencyHandling: EmergencyHandlingSchema.optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Office create / update
// ---------------------------------------------------------------------------

/**
 * Working days accepted as array of day strings OR a comma-separated string
 * (matches the existing POST /api/offices behavior).
 */
const WorkingDaysSchema = z.union([
  z.array(DayOfWeekSchema).min(1),
  z
    .string()
    .transform((s) => s.split(',').map((d) => d.trim()).filter(Boolean))
    .pipe(z.array(DayOfWeekSchema).min(1)),
]);

/**
 * Sprint 5 — intake V2 JSON blobs. Validated as `record(unknown)` at the
 * API edge so new fields can be added without API churn; strong typing
 * lives in `src/lib/engine/advisory/types.ts`.
 */
export const IntakeGoalsSchema = z.record(z.string(), z.unknown());
export const IntakeConstraintsSchema = z.record(z.string(), z.unknown());

export const CreateOfficeInputSchema = z
  .object({
    name: z.string().min(1, 'Office name required'),
    dpmsSystem: z.string().min(1, 'dpmsSystem required'),
    workingDays: WorkingDaysSchema,
    timeIncrement: z.number().int().min(5).max(60).optional(),
    feeModel: z.string().optional(),
    providers: z.array(ProviderInputSchema).optional(),
    blockTypes: z.array(BlockTypeInputSchema).optional(),
    rules: OfficeRulesSchema.optional(),
    schedulingRules: z.string().optional(),
    intakeGoals: IntakeGoalsSchema.optional(),
    intakeConstraints: IntakeConstraintsSchema.optional(),
  })
  .passthrough();

/** Partial update — every field optional, but present ones must be valid. */
export const UpdateOfficeInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    dpmsSystem: z.string().min(1).optional(),
    workingDays: WorkingDaysSchema.optional(),
    timeIncrement: z.number().int().min(5).max(60).optional(),
    feeModel: z.string().optional(),
    providers: z.array(ProviderInputSchema).optional(),
    blockTypes: z.array(BlockTypeInputSchema).optional(),
    rules: OfficeRulesSchema.optional(),
    schedulingRules: z.string().optional(),
    alternateWeekEnabled: z.boolean().optional(),
    rotationEnabled: z.boolean().optional(),
    rotationWeeks: z.number().int().min(1).max(52).optional(),
    schedulingWindows: z.unknown().optional(),
    intakeGoals: IntakeGoalsSchema.optional(),
    intakeConstraints: IntakeConstraintsSchema.optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/**
 * A single generated slot. Kept loose (`passthrough()`) because the engine
 * owns the canonical shape — we only guard the envelope.
 */
export const TimeSlotInputSchema = z
  .object({
    time: z.string().optional(),
    providerId: z.string().optional(),
    blockTypeId: z.string().nullable().optional(),
    blockLabel: z.string().nullable().optional(),
    isBreak: z.boolean().optional(),
    operatory: z.string().optional(),
    staffingCode: StaffingCodeSchema.optional(),
  })
  .passthrough();

const ProductionSummarySchema = z.array(z.unknown());

export const ScheduleSaveInputSchema = z
  .object({
    dayOfWeek: DayOfWeekSchema,
    weekType: WeekTypeSchema,
    slots: z.array(TimeSlotInputSchema),
    productionSummary: ProductionSummarySchema.optional(),
    warnings: z.array(z.string()).optional(),
    label: z.string().optional(),
    // Loop 9: optional variant tag (EOF / Opt1 / Opt2). Nullable.
    variantLabel: z.string().nullable().optional(),
  })
  .passthrough();

export const ScheduleAutoSaveInputSchema = ScheduleSaveInputSchema;

export const ScheduleUpdateInputSchema = z
  .object({
    slots: z.array(TimeSlotInputSchema),
    productionSummary: ProductionSummarySchema,
    warnings: z.array(z.string()),
    label: z.string().optional(),
  })
  .passthrough();

export const ScheduleMigrateInputSchema = z
  .object({
    weekType: WeekTypeSchema,
    schedules: z.record(
      z.string(),
      z
        .object({
          slots: z.array(TimeSlotInputSchema),
          productionSummary: ProductionSummarySchema.optional(),
          warnings: z.array(z.string()).optional(),
        })
        .passthrough()
    ),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

export const GenerateInputSchema = z
  .object({
    days: z.array(DayOfWeekSchema).optional(),
    weekType: WeekTypeSchema.optional(),
    autoApplyStagger: z.boolean().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Templates (per-office)
// ---------------------------------------------------------------------------

export const TemplateCreateInputSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    dayOfWeek: DayOfWeekSchema,
    weekType: WeekTypeSchema.optional(),
    slots: z.array(TimeSlotInputSchema).optional(),
    productionSummary: ProductionSummarySchema.optional(),
    warnings: z.array(z.string()).optional(),
  })
  .passthrough();

export const TemplateUpdateInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Template library
// ---------------------------------------------------------------------------

export const TemplateLibraryCreateInputSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    category: z.string().optional(),
    slotsJson: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough();

export const TemplateApplyInputSchema = z
  .object({
    targetOfficeId: z.string().min(1, 'targetOfficeId is required'),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Schedule versions
// ---------------------------------------------------------------------------

export const ScheduleVersionCreateInputSchema = z
  .object({
    dayOfWeek: DayOfWeekSchema,
    weekType: WeekTypeSchema.optional(),
    slots: z.array(TimeSlotInputSchema).optional(),
    productionSummary: ProductionSummarySchema.optional(),
    label: z.string().optional(),
  })
  .passthrough();

export const ScheduleVersionUpdateInputSchema = z
  .object({
    label: z.string().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Bulk goals
// ---------------------------------------------------------------------------

export const BulkGoalsInputSchema = z
  .object({
    officeIds: z.array(z.string().min(1)).min(1, 'officeIds must be a non-empty array'),
    doctorGoal: DailyGoalSchema.nullable(),
    hygienistGoal: DailyGoalSchema.nullable(),
  })
  .refine(
    (d) => d.doctorGoal !== null || d.hygienistGoal !== null,
    { message: 'At least one of doctorGoal or hygienistGoal must be provided' }
  );

// ---------------------------------------------------------------------------
// Provider absences
// ---------------------------------------------------------------------------

/** Date must be YYYY-MM-DD (keeps storage deterministic). */
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const ProviderAbsenceSchema = z
  .object({
    date: IsoDateSchema,
    reason: z.string().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Treatment sequences
// ---------------------------------------------------------------------------

export const SequenceCreateSchema = z
  .object({
    name: z.string().min(1, 'name is required'),
    description: z.string().optional(),
    stepsJson: z.string().min(1, 'stepsJson is required'),
  })
  .passthrough();

export const SequenceUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    stepsJson: z.string().min(1).optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// ProcedureOverride — Sprint 3 (PRD-V4 FR-6)
// Per-practice x-segment overrides on top of base BlockType.
// All three length fields are optional; null/undefined = "no override".
// ---------------------------------------------------------------------------

const nonNegativeIntOrNull = z
  .union([z.number().int().min(0).max(600), z.null()])
  .optional();

export const ProcedureOverrideCreateSchema = z
  .object({
    blockTypeId: z.string().min(1, 'blockTypeId is required'),
    asstPreMin: nonNegativeIntOrNull,
    doctorMin: nonNegativeIntOrNull,
    asstPostMin: nonNegativeIntOrNull,
  })
  .passthrough();

export const ProcedureOverrideUpdateSchema = z
  .object({
    asstPreMin: nonNegativeIntOrNull,
    doctorMin: nonNegativeIntOrNull,
    asstPostMin: nonNegativeIntOrNull,
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const ExportInputSchema = z
  .object({
    weekType: WeekTypeSchema.optional(),
    schedules: z
      .array(
        z
          .object({
            dayOfWeek: DayOfWeekSchema,
            variant: z.string().optional(),
            slots: z.array(TimeSlotInputSchema),
            productionSummary: ProductionSummarySchema,
          })
          .passthrough()
      )
      .optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Helper — format a ZodError flatten for ApiError details
// ---------------------------------------------------------------------------

export function formatZodDetails(error: z.ZodError): Record<string, unknown> {
  return error.flatten();
}
