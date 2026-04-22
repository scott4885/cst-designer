/**
 * Data Access Layer — Prisma/SQLite backend
 */
import { prisma } from './db';
import type { ProviderInput, BlockTypeInput, ScheduleRules, GenerationResult } from './engine/types';
import { generateSchedule as engineGenerateSchedule } from './engine/generator';
import { detectConflicts } from './engine/stagger';
import { autoResolveStaggerConflicts } from './engine/stagger-resolver';
import { mergeProcedureOverrides } from './engine/procedure-overrides';
import { defaultRules } from './mock-data';
import { DEFAULT_OPERATORIES } from './operatory-utils';
import type {
  Office as DbOffice,
  Provider as DbProvider,
  BlockType as DbBlockType,
  ScheduleRule as DbScheduleRule,
  ScheduleTemplate as DbScheduleTemplate,
} from '@/generated/prisma';

// Office with its relations as loaded in getOfficeById (providers, blockTypes, rules)
type DbOfficeWithRelations = DbOffice & {
  providers?: DbProvider[];
  blockTypes?: DbBlockType[];
  rules?: DbScheduleRule | null;
};

export interface OfficeListItem {
  id: string;
  name: string;
  dpmsSystem: string;
  feeModel: string;
  providerCount: number;
  totalDailyGoal: number;
  updatedAt: string;
  workingDays?: string[];
  timeIncrement?: number;
}

export interface OfficeDetail {
  id: string;
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  operatories: string[];
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  rules: ScheduleRules;
  totalDailyGoal: number;
  schedulingRules: string;
  alternateWeekEnabled: boolean;
  rotationEnabled: boolean;
  rotationWeeks: number;
  schedulingWindows: string;
}

export interface CreateOfficeInput {
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  operatories?: string[];
  providers?: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  rules?: ScheduleRules;
  schedulingRules?: string;
  alternateWeekEnabled?: boolean;
  rotationEnabled?: boolean;
  rotationWeeks?: number;
  schedulingWindows?: string;
}

// ---------------------------------------------------------------------------
// Helpers to convert DB rows → app shapes
// ---------------------------------------------------------------------------

function dbOfficeToDetail(office: DbOfficeWithRelations): OfficeDetail {
  const providers: ProviderInput[] = (office.providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role as ProviderInput['role'],
    operatories: safeParseJSON(p.operatories, []),
    columns: p.columns ?? 1,
    workingStart: p.workingStart,
    workingEnd: p.workingEnd,
    lunchStart: p.lunchEnabled !== false && p.lunchStart ? p.lunchStart : undefined,
    lunchEnd: p.lunchEnabled !== false && p.lunchEnd ? p.lunchEnd : undefined,
    lunchEnabled: p.lunchEnabled !== false,
    dailyGoal: p.dailyGoal,
    color: p.color,
    seesNewPatients: p.seesNewPatients,
    staggerOffsetMin: p.staggerOffsetMin ?? 0,
    providerSchedule: safeParseJSON(p.providerSchedule, {}),
    currentProcedureMix: safeParseJSON(p.currentProcedureMix, {}),
    futureProcedureMix: safeParseJSON(p.futureProcedureMix, {}),
  }));

  const blockTypes: BlockTypeInput[] = (office.blockTypes || []).map((b) => ({
    id: b.id,
    label: b.label,
    description: b.description || undefined,
    minimumAmount: b.minimumAmount || undefined,
    appliesToRole: b.appliesToRole as BlockTypeInput['appliesToRole'],
    durationMin: b.durationMin,
    durationMax: b.durationMax || undefined,
    isHygieneType: b.isHygieneType ?? false,
    color: b.color || undefined,
    dTimeMin: b.dTimeMin ?? 0,
    aTimeMin: b.aTimeMin ?? 0,
    procedureCategory: (b.procedureCategory || 'BASIC_RESTORATIVE') as BlockTypeInput['procedureCategory'],
  }));

  const r = office.rules;
  const rules: ScheduleRules = r
    ? {
        npModel: r.npModel as ScheduleRules['npModel'],
        npBlocksPerDay: r.npBlocksPerDay,
        srpBlocksPerDay: r.srpBlocksPerDay,
        hpPlacement: r.hpPlacement as ScheduleRules['hpPlacement'],
        doubleBooking: r.doubleBooking,
        matrixing: r.matrixing,
        emergencyHandling: r.emergencyHandling as ScheduleRules['emergencyHandling'],
      }
    : defaultRules;

  const totalDailyGoal = providers.reduce((sum, p) => sum + (p.dailyGoal || 0), 0);

  return {
    id: office.id,
    name: office.name,
    dpmsSystem: office.dpmsSystem,
    workingDays: safeParseJSON(office.workingDays, []),
    timeIncrement: office.timeIncrement,
    feeModel: office.feeModel,
    operatories: safeParseJSON(office.operatories, []),
    providers,
    blockTypes,
    rules,
    totalDailyGoal,
    schedulingRules: office.schedulingRules || '',
    alternateWeekEnabled: office.alternateWeekEnabled ?? false,
    rotationEnabled: office.rotationEnabled ?? false,
    rotationWeeks: office.rotationWeeks ?? 2,
    schedulingWindows: office.schedulingWindows || '[]',
  };
}

function safeParseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getOffices(): Promise<OfficeListItem[]> {
  const offices = await prisma.office.findMany({
    include: { providers: { orderBy: { id: 'asc' } } },
    orderBy: { name: 'asc' },
  });

  return offices.map((office) => {
    const providerCount = office.providers.length;
    const totalDailyGoal = office.providers.reduce((sum, p) => sum + (p.dailyGoal || 0), 0);
    return {
      id: office.id,
      name: office.name,
      dpmsSystem: office.dpmsSystem,
      feeModel: office.feeModel,
      providerCount,
      totalDailyGoal,
      updatedAt: office.updatedAt.toISOString(),
      workingDays: safeParseJSON(office.workingDays, []),
      timeIncrement: office.timeIncrement,
    };
  });
}

export async function getOfficeById(id: string): Promise<OfficeDetail | null> {
  const office = await prisma.office.findUnique({
    where: { id },
    include: { providers: { orderBy: { id: 'asc' } }, blockTypes: true, rules: true },
  });
  if (!office) return null;
  return dbOfficeToDetail(office);
}

export async function createOffice(data: CreateOfficeInput): Promise<OfficeDetail> {
  const rules = data.rules || defaultRules;

  const office = await prisma.office.create({
    data: {
      name: data.name,
      dpmsSystem: data.dpmsSystem,
      workingDays: JSON.stringify(data.workingDays),
      timeIncrement: data.timeIncrement,
      feeModel: data.feeModel,
      operatories: JSON.stringify(data.operatories || DEFAULT_OPERATORIES),
      schedulingRules: data.schedulingRules || '',
      providers: {
        create: (data.providers || []).map((p) => ({
          name: p.name,
          role: p.role,
          operatories: JSON.stringify(p.operatories),
          columns: p.columns ?? 1,
          workingStart: p.workingStart,
          workingEnd: p.workingEnd,
          lunchEnabled: p.lunchEnabled !== false,
          lunchStart: p.lunchEnabled !== false ? (p.lunchStart || '12:00') : '',
          lunchEnd: p.lunchEnabled !== false ? (p.lunchEnd || '13:00') : '',
          dailyGoal: p.dailyGoal,
          color: p.color,
          seesNewPatients: p.seesNewPatients !== false,
          staggerOffsetMin: p.staggerOffsetMin ?? 0,
          providerSchedule: JSON.stringify(p.providerSchedule ?? {}),
          currentProcedureMix: JSON.stringify(p.currentProcedureMix ?? {}),
          futureProcedureMix: JSON.stringify(p.futureProcedureMix ?? {}),
        })),
      },
      blockTypes: {
        create: (data.blockTypes || []).map((b) => ({
          label: b.label,
          description: b.description || '',
          minimumAmount: b.minimumAmount || 0,
          appliesToRole: b.appliesToRole,
          durationMin: b.durationMin,
          durationMax: b.durationMax || b.durationMin,
          color: '#666',
          isHygieneType: b.appliesToRole === 'HYGIENIST',
          dTimeMin: b.dTimeMin ?? 0,
          aTimeMin: b.aTimeMin ?? 0,
          procedureCategory: b.procedureCategory || 'BASIC_RESTORATIVE',
        })),
      },
      rules: {
        create: {
          npModel: rules.npModel,
          npBlocksPerDay: rules.npBlocksPerDay,
          srpBlocksPerDay: rules.srpBlocksPerDay,
          hpPlacement: rules.hpPlacement,
          doubleBooking: rules.doubleBooking,
          matrixing: rules.matrixing,
          emergencyHandling: rules.emergencyHandling,
        },
      },
    },
    include: { providers: true, blockTypes: true, rules: true },
  });

  return dbOfficeToDetail(office);
}

export async function updateOffice(id: string, data: Partial<CreateOfficeInput>): Promise<OfficeDetail | null> {
  const existing = await prisma.office.findUnique({ where: { id } });
  if (!existing) return null;

  // Update top-level office fields
  await prisma.office.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.dpmsSystem !== undefined && { dpmsSystem: data.dpmsSystem }),
      ...(data.workingDays !== undefined && { workingDays: JSON.stringify(data.workingDays) }),
      ...(data.timeIncrement !== undefined && { timeIncrement: data.timeIncrement }),
      ...(data.feeModel !== undefined && { feeModel: data.feeModel }),
      ...(data.operatories !== undefined && { operatories: JSON.stringify(data.operatories) }),
      ...(data.schedulingRules !== undefined && { schedulingRules: data.schedulingRules }),
      ...(data.alternateWeekEnabled !== undefined && { alternateWeekEnabled: data.alternateWeekEnabled }),
      ...(data.rotationEnabled !== undefined && { rotationEnabled: data.rotationEnabled }),
      ...(data.rotationWeeks !== undefined && { rotationWeeks: data.rotationWeeks }),
      ...(data.schedulingWindows !== undefined && { schedulingWindows: data.schedulingWindows }),
    },
  });

  // Replace providers if provided — preserve existing IDs to avoid orphaned references
  if (data.providers) {
    // Collect IDs that should be kept; any provider in DB but not in payload gets deleted
    const incomingIds = data.providers
      .map((p) => p.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    // Delete providers that are no longer in the payload
    if (incomingIds.length > 0) {
      await prisma.provider.deleteMany({
        where: { officeId: id, id: { notIn: incomingIds } },
      });
    } else {
      await prisma.provider.deleteMany({ where: { officeId: id } });
    }

    // Upsert each provider individually to preserve IDs and role integrity
    for (let i = 0; i < data.providers.length; i++) {
      const p = data.providers[i];
      const providerId = p.id;
      const providerData = {
        officeId: id,
        name: p.name,
        role: p.role,
        operatories: JSON.stringify(p.operatories),
        columns: p.columns ?? 1,
        workingStart: p.workingStart,
        workingEnd: p.workingEnd,
        lunchEnabled: p.lunchEnabled !== false,
        lunchStart: p.lunchEnabled !== false ? (p.lunchStart || '12:00') : '',
        lunchEnd: p.lunchEnabled !== false ? (p.lunchEnd || '13:00') : '',
        dailyGoal: p.dailyGoal,
        color: p.color,
        seesNewPatients: p.seesNewPatients !== false,
        staggerOffsetMin: p.staggerOffsetMin ?? 0,
        providerSchedule: JSON.stringify(p.providerSchedule ?? {}),
        currentProcedureMix: JSON.stringify(p.currentProcedureMix ?? {}),
        futureProcedureMix: JSON.stringify(p.futureProcedureMix ?? {}),
      };

      if (providerId) {
        await prisma.provider.upsert({
          where: { id: providerId },
          update: providerData,
          create: { id: providerId, ...providerData },
        });
      } else {
        await prisma.provider.create({ data: providerData });
      }
    }
  }

  // Replace block types if provided
  if (data.blockTypes) {
    await prisma.blockType.deleteMany({ where: { officeId: id } });
    await prisma.blockType.createMany({
      data: data.blockTypes.map((b) => ({
        officeId: id,
        label: b.label,
        description: b.description || '',
        minimumAmount: b.minimumAmount || 0,
        appliesToRole: b.appliesToRole,
        durationMin: b.durationMin,
        durationMax: b.durationMax || b.durationMin,
        color: '#666',
        isHygieneType: b.appliesToRole === 'HYGIENIST',
        dTimeMin: b.dTimeMin ?? 0,
        aTimeMin: b.aTimeMin ?? 0,
        procedureCategory: b.procedureCategory || 'BASIC_RESTORATIVE',
      })),
    });
  }

  // Upsert rules if provided
  if (data.rules) {
    await prisma.scheduleRule.upsert({
      where: { officeId: id },
      update: {
        npModel: data.rules.npModel,
        npBlocksPerDay: data.rules.npBlocksPerDay,
        srpBlocksPerDay: data.rules.srpBlocksPerDay,
        hpPlacement: data.rules.hpPlacement,
        doubleBooking: data.rules.doubleBooking,
        matrixing: data.rules.matrixing,
        emergencyHandling: data.rules.emergencyHandling,
      },
      create: {
        officeId: id,
        npModel: data.rules.npModel,
        npBlocksPerDay: data.rules.npBlocksPerDay,
        srpBlocksPerDay: data.rules.srpBlocksPerDay,
        hpPlacement: data.rules.hpPlacement,
        doubleBooking: data.rules.doubleBooking,
        matrixing: data.rules.matrixing,
        emergencyHandling: data.rules.emergencyHandling,
      },
    });
  }

  return getOfficeById(id);
}

export async function deleteOffice(id: string): Promise<boolean> {
  try {
    await prisma.office.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Schedule generation (still uses the engine, now persists to DB)
// ---------------------------------------------------------------------------

export async function generateSchedule(
  officeId: string,
  days: string[],
  _weekType = 'A',
  options: { autoApplyStagger?: boolean } = {},
): Promise<GenerationResult[]> {
  const office = await getOfficeById(officeId);
  if (!office) throw new Error('Office not found');

  const { autoApplyStagger = true } = options;

  // Sprint 3 — ProcedureOverride merge (PRD-V4 FR-6). Resolve ONCE per
  // generation call so the hot path never hits the DB. Falls through to
  // `office.blockTypes` when no overrides exist (common case).
  const overrides = await prisma.procedureOverride.findMany({
    where: { officeId },
  });
  const blockTypesForEngine = mergeProcedureOverrides(
    office.blockTypes,
    overrides.map((o) => ({
      officeId: o.officeId,
      blockTypeId: o.blockTypeId,
      asstPreMin: o.asstPreMin,
      doctorMin: o.doctorMin,
      asstPostMin: o.asstPostMin,
    })),
  );

  const results: GenerationResult[] = [];

  for (const day of days) {
    const result = engineGenerateSchedule({
      providers: office.providers,
      blockTypes: blockTypesForEngine,
      rules: office.rules,
      timeIncrement: office.timeIncrement,
      dayOfWeek: day,
      activeWeek: _weekType,
    });

    // Auto-resolve multi-column D-time conflicts (A-D zigzag) before surfacing warnings.
    // The resolver mutates result.slots in place and returns any conflicts it could
    // not shift out of the way; those remain as warnings for the UI.
    if (autoApplyStagger) {
      const { appliedMoves, remainingConflicts } = autoResolveStaggerConflicts(
        result,
        office.providers,
      );

      if (appliedMoves.length > 0) {
        result.warnings = [
          ...(result.warnings ?? []),
          `Stagger resolver applied ${appliedMoves.length} auto-shift${appliedMoves.length === 1 ? '' : 's'} to eliminate D-time overlaps.`,
        ];
      }

      if (remainingConflicts.length > 0) {
        const conflictWarnings = remainingConflicts.map(
          (c) => `Unresolved conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`,
        );
        result.warnings = [...(result.warnings ?? []), ...conflictWarnings];
      }
    } else {
      // Resolver disabled — fall back to plain detection so the UI still sees conflicts.
      const conflicts = detectConflicts(result, office.providers);
      if (conflicts.length > 0) {
        const conflictWarnings = conflicts.map(
          (c) => `Conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`,
        );
        result.warnings = [...(result.warnings ?? []), ...conflictWarnings];
      }
    }

    results.push(result);
  }

  return results;
}

export async function getScheduleTemplates(officeId: string, weekType?: string) {
  const templates = await prisma.scheduleTemplate.findMany({
    where: {
      officeId,
      ...(weekType ? { weekType } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    dayOfWeek: t.dayOfWeek,
    weekType: t.weekType ?? 'A',
    slots: safeParseJSON(t.slotsJson, []),
    productionSummary: safeParseJSON(t.summaryJson, []),
    warnings: safeParseJSON(t.warningsJson, []),
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Schedule persistence (new — bridges localStorage gap)
// ---------------------------------------------------------------------------

export interface SaveScheduleInput {
  dayOfWeek: string;
  weekType: string;
  slots: unknown;
  productionSummary: unknown;
  warnings: unknown;
  label?: string;
  /** Loop 9: optional variant tag (EOF / Opt1 / Opt2). */
  variantLabel?: string | null;
}

export interface UpdateScheduleInput {
  slots: unknown;
  productionSummary: unknown;
  warnings: unknown;
  label?: string;
  /** Loop 9: optional variant tag. */
  variantLabel?: string | null;
}

export interface AutoSaveInput {
  dayOfWeek: string;
  weekType: string;
  slots: unknown;
  productionSummary: unknown;
  warnings: unknown;
  /** Loop 9: optional variant tag. */
  variantLabel?: string | null;
}

export interface MigrateInput {
  schedules: Record<string, { slots: unknown; productionSummary: unknown; warnings: unknown }>;
  weekType: string;
}

/** Validate that an office exists; throws if not found. */
async function requireOffice(officeId: string): Promise<void> {
  const office = await prisma.office.findUnique({ where: { id: officeId }, select: { id: true } });
  if (!office) throw new Error(`Office not found: ${officeId}`);
}

/** Parse a ScheduleTemplate DB row into an API-friendly shape. */
function parseScheduleRow(t: DbScheduleTemplate) {
  return {
    id: t.id,
    officeId: t.officeId,
    name: t.name,
    dayOfWeek: t.dayOfWeek,
    weekType: t.weekType ?? 'A',
    type: t.type ?? 'WORKING',
    label: t.name,
    // Loop 9: variant tag (EOF / Opt1 / Opt2), nullable.
    variantLabel: (t as DbScheduleTemplate & { variantLabel?: string | null }).variantLabel ?? null,
    slots: safeParseJSON(t.slotsJson, []),
    productionSummary: safeParseJSON(t.summaryJson, []),
    warnings: safeParseJSON(t.warningsJson, []),
    isActive: t.isActive,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  };
}

/**
 * List schedules for an office, with optional filters.
 */
export async function getSchedules(
  officeId: string,
  filters?: { weekType?: string; dayOfWeek?: string; type?: string },
) {
  await requireOffice(officeId);

  const rows = await prisma.scheduleTemplate.findMany({
    where: {
      officeId,
      ...(filters?.weekType ? { weekType: filters.weekType } : {}),
      ...(filters?.dayOfWeek ? { dayOfWeek: filters.dayOfWeek } : {}),
      ...(filters?.type ? { type: filters.type } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  return rows.map(parseScheduleRow);
}

/**
 * Get a single schedule by ID.
 */
export async function getScheduleById(scheduleId: string) {
  const row = await prisma.scheduleTemplate.findUnique({ where: { id: scheduleId } });
  if (!row) return null;
  return parseScheduleRow(row);
}

/**
 * Save a new NAMED schedule snapshot for an office+day+week.
 */
export async function saveSchedule(officeId: string, data: SaveScheduleInput) {
  await requireOffice(officeId);

  const row = await prisma.scheduleTemplate.create({
    data: {
      officeId,
      name: data.label || `${data.dayOfWeek} ${data.weekType}`,
      dayOfWeek: data.dayOfWeek,
      weekType: data.weekType,
      type: 'NAMED',
      slotsJson: JSON.stringify(data.slots),
      summaryJson: JSON.stringify(data.productionSummary),
      warningsJson: JSON.stringify(data.warnings),
      ...(data.variantLabel !== undefined
        ? { variantLabel: data.variantLabel }
        : {}),
    },
  });

  return parseScheduleRow(row);
}

/**
 * Update an existing schedule (any type).
 */
export async function updateSchedule(scheduleId: string, data: UpdateScheduleInput) {
  const existing = await prisma.scheduleTemplate.findUnique({ where: { id: scheduleId } });
  if (!existing) throw new Error(`Schedule not found: ${scheduleId}`);

  const row = await prisma.scheduleTemplate.update({
    where: { id: scheduleId },
    data: {
      slotsJson: JSON.stringify(data.slots),
      summaryJson: JSON.stringify(data.productionSummary),
      warningsJson: JSON.stringify(data.warnings),
      ...(data.label !== undefined && { name: data.label }),
      ...(data.variantLabel !== undefined
        ? { variantLabel: data.variantLabel }
        : {}),
    },
  });

  return parseScheduleRow(row);
}

/**
 * Delete a schedule by ID.
 */
export async function deleteSchedule(scheduleId: string): Promise<void> {
  const existing = await prisma.scheduleTemplate.findUnique({ where: { id: scheduleId } });
  if (!existing) throw new Error(`Schedule not found: ${scheduleId}`);
  await prisma.scheduleTemplate.delete({ where: { id: scheduleId } });
}

/**
 * Auto-save: upsert a WORKING schedule for a given office+day+week.
 * Uses the compound unique index to ensure one working copy per slot.
 */
export async function autoSaveSchedule(officeId: string, data: AutoSaveInput) {
  await requireOffice(officeId);

  const row = await prisma.scheduleTemplate.upsert({
    where: {
      unique_working_schedule: {
        officeId,
        dayOfWeek: data.dayOfWeek,
        weekType: data.weekType,
        type: 'WORKING',
      },
    },
    update: {
      slotsJson: JSON.stringify(data.slots),
      summaryJson: JSON.stringify(data.productionSummary),
      warningsJson: JSON.stringify(data.warnings),
      ...(data.variantLabel !== undefined ? { variantLabel: data.variantLabel } : {}),
    },
    create: {
      officeId,
      name: `${data.dayOfWeek} ${data.weekType} (working)`,
      dayOfWeek: data.dayOfWeek,
      weekType: data.weekType,
      type: 'WORKING',
      slotsJson: JSON.stringify(data.slots),
      summaryJson: JSON.stringify(data.productionSummary),
      warningsJson: JSON.stringify(data.warnings),
      ...(data.variantLabel !== undefined ? { variantLabel: data.variantLabel } : {}),
    },
  });

  return parseScheduleRow(row);
}

/**
 * One-time migration of localStorage schedules into the DB.
 * Creates a WORKING schedule for each day key in the record.
 */
export async function migrateLocalStorageSchedules(
  officeId: string,
  data: MigrateInput,
): Promise<{ migratedCount: number; scheduleIds: string[] }> {
  await requireOffice(officeId);

  const scheduleIds: string[] = [];

  for (const [dayOfWeek, schedule] of Object.entries(data.schedules)) {
    const row = await prisma.scheduleTemplate.upsert({
      where: {
        unique_working_schedule: {
          officeId,
          dayOfWeek,
          weekType: data.weekType,
          type: 'WORKING',
        },
      },
      update: {
        slotsJson: JSON.stringify(schedule.slots),
        summaryJson: JSON.stringify(schedule.productionSummary),
        warningsJson: JSON.stringify(schedule.warnings),
      },
      create: {
        officeId,
        name: `${dayOfWeek} ${data.weekType} (migrated)`,
        dayOfWeek,
        weekType: data.weekType,
        type: 'WORKING',
        slotsJson: JSON.stringify(schedule.slots),
        summaryJson: JSON.stringify(schedule.productionSummary),
        warningsJson: JSON.stringify(schedule.warnings),
      },
    });

    scheduleIds.push(row.id);
  }

  return { migratedCount: scheduleIds.length, scheduleIds };
}
