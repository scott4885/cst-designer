/**
 * Data Access Layer — Prisma/SQLite backend
 */
import { prisma } from './db';
import type { ProviderInput, BlockTypeInput, ScheduleRules, GenerationResult } from './engine/types';
import { generateSchedule as engineGenerateSchedule } from './engine/generator';
import { detectConflicts } from './engine/stagger';
import { defaultRules } from './mock-data';
import { DEFAULT_OPERATORIES } from './operatory-utils';

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

function dbOfficeToDetail(office: any): OfficeDetail {
  const providers: ProviderInput[] = (office.providers || []).map((p: any) => ({
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
    staggerOffsetMin: (p as any).staggerOffsetMin ?? 0,
    providerSchedule: safeParseJSON((p as any).providerSchedule, {}),
    currentProcedureMix: safeParseJSON((p as any).currentProcedureMix, {}),
    futureProcedureMix: safeParseJSON((p as any).futureProcedureMix, {}),
  }));

  const blockTypes: BlockTypeInput[] = (office.blockTypes || []).map((b: any) => ({
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
    schedulingRules: (office as any).schedulingRules || '',
    alternateWeekEnabled: (office as any).alternateWeekEnabled ?? false,
    rotationEnabled: (office as any).rotationEnabled ?? false,
    rotationWeeks: (office as any).rotationWeeks ?? 2,
    schedulingWindows: (office as any).schedulingWindows || '[]',
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
          columns: (p as any).columns ?? 1,
          workingStart: p.workingStart,
          workingEnd: p.workingEnd,
          lunchEnabled: p.lunchEnabled !== false,
          lunchStart: p.lunchEnabled !== false ? (p.lunchStart || '12:00') : '',
          lunchEnd: p.lunchEnabled !== false ? (p.lunchEnd || '13:00') : '',
          dailyGoal: p.dailyGoal,
          color: p.color,
          seesNewPatients: p.seesNewPatients !== false,
          staggerOffsetMin: (p as any).staggerOffsetMin ?? 0,
          providerSchedule: JSON.stringify((p as any).providerSchedule ?? {}),
          currentProcedureMix: JSON.stringify((p as any).currentProcedureMix ?? {}),
          futureProcedureMix: JSON.stringify((p as any).futureProcedureMix ?? {}),
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
          dTimeMin: (b as any).dTimeMin ?? 0,
          aTimeMin: (b as any).aTimeMin ?? 0,
          procedureCategory: (b as any).procedureCategory || 'BASIC_RESTORATIVE',
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
      .map((p) => (p as any).id)
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
      const providerId = (p as any).id;
      const providerData = {
        officeId: id,
        name: p.name,
        role: p.role,
        operatories: JSON.stringify(p.operatories),
        columns: (p as any).columns ?? 1,
        workingStart: p.workingStart,
        workingEnd: p.workingEnd,
        lunchEnabled: p.lunchEnabled !== false,
        lunchStart: p.lunchEnabled !== false ? (p.lunchStart || '12:00') : '',
        lunchEnd: p.lunchEnabled !== false ? (p.lunchEnd || '13:00') : '',
        dailyGoal: p.dailyGoal,
        color: p.color,
        seesNewPatients: p.seesNewPatients !== false,
        staggerOffsetMin: (p as any).staggerOffsetMin ?? 0,
        providerSchedule: JSON.stringify((p as any).providerSchedule ?? {}),
        currentProcedureMix: JSON.stringify((p as any).currentProcedureMix ?? {}),
        futureProcedureMix: JSON.stringify((p as any).futureProcedureMix ?? {}),
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
        dTimeMin: (b as any).dTimeMin ?? 0,
        aTimeMin: (b as any).aTimeMin ?? 0,
        procedureCategory: (b as any).procedureCategory || 'BASIC_RESTORATIVE',
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

export async function generateSchedule(officeId: string, days: string[], _weekType = 'A'): Promise<GenerationResult[]> {
  const office = await getOfficeById(officeId);
  if (!office) throw new Error('Office not found');

  const results: GenerationResult[] = [];

  for (const day of days) {
    const result = engineGenerateSchedule({
      providers: office.providers,
      blockTypes: office.blockTypes,
      rules: office.rules,
      timeIncrement: office.timeIncrement,
      dayOfWeek: day,
      activeWeek: _weekType,
    });

    // Detect conflicts
    const conflicts = detectConflicts(result, office.providers);
    if (conflicts.length > 0) {
      const conflictWarnings = conflicts.map(
        (c) => `Conflict at ${c.time}: provider ${c.providerId} is double-booked in ${c.operatories.join(' and ')}`
      );
      result.warnings = [...(result.warnings ?? []), ...conflictWarnings];
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
    weekType: (t as any).weekType ?? 'A',
    slots: safeParseJSON(t.slotsJson, []),
    productionSummary: safeParseJSON(t.summaryJson, []),
    warnings: safeParseJSON(t.warningsJson, []),
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}
