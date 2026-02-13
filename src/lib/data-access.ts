/**
 * Data Access Layer
 * Single source of truth for all database operations
 */
import { prisma } from './db';
import { ProviderInput, BlockTypeInput, ScheduleRules, GenerationResult } from './engine/types';
import { generateSchedule as engineGenerateSchedule } from './engine/generator';

export interface OfficeListItem {
  id: string;
  name: string;
  dpmsSystem: string;
  feeModel: string;
  providerCount: number;
  totalDailyGoal: number;
  updatedAt: string;
}

export interface OfficeDetail {
  id: string;
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  rules: ScheduleRules;
}

export interface CreateOfficeInput {
  name: string;
  dpmsSystem: string;
  workingDays: string[];
  timeIncrement: number;
  feeModel: string;
  providers?: ProviderInput[];
  blockTypes?: BlockTypeInput[];
  rules?: ScheduleRules;
}

/**
 * Get all offices with summary data
 */
export async function getOffices(): Promise<OfficeListItem[]> {
  const offices = await prisma.office.findMany({
    include: {
      providers: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  return offices.map(office => ({
    id: office.id,
    name: office.name,
    dpmsSystem: office.dpmsSystem,
    feeModel: office.feeModel,
    providerCount: office.providers.length,
    totalDailyGoal: office.providers.reduce((sum, p) => sum + p.dailyGoal, 0),
    updatedAt: office.updatedAt.toISOString(),
  }));
}

/**
 * Get office by ID with full details
 */
export async function getOfficeById(id: string): Promise<OfficeDetail | null> {
  const office = await prisma.office.findUnique({
    where: { id },
    include: {
      providers: true,
      blockTypes: true,
      scheduleRules: true,
    },
  });

  if (!office) return null;

  // Parse JSON fields and reconstruct the office data
  const providers: ProviderInput[] = office.providers.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role as 'DOCTOR' | 'HYGIENIST',
    operatories: JSON.parse(p.operatories),
    workingStart: p.workingStart,
    workingEnd: p.workingEnd,
    lunchStart: p.lunchStart || undefined,
    lunchEnd: p.lunchEnd || undefined,
    dailyGoal: p.dailyGoal,
    color: p.color,
  }));

  const blockTypes: BlockTypeInput[] = office.blockTypes.map(bt => ({
    id: bt.id,
    label: bt.label,
    description: bt.description || undefined,
    minimumAmount: bt.minimumAmount || undefined,
    appliesToRole: bt.appliesToRole as 'DOCTOR' | 'HYGIENIST' | 'BOTH',
    durationMin: bt.durationMin,
    durationMax: bt.durationMax || undefined,
  }));

  // Reconstruct rules from individual rule records
  const ruleRecords = office.scheduleRules;
  const rules: ScheduleRules = {
    npModel: 'DOCTOR_ONLY',
    npBlocksPerDay: 2,
    srpBlocksPerDay: 0,
    hpPlacement: 'MORNING',
    doubleBooking: false,
    matrixing: false,
    emergencyHandling: 'ACCESS_BLOCKS',
  };

  for (const rule of ruleRecords) {
    const value = JSON.parse(rule.ruleValue);
    switch (rule.ruleType) {
      case 'NP_MODEL':
        rules.npModel = value.model;
        rules.npBlocksPerDay = value.blocksPerDay;
        break;
      case 'HP_PLACEMENT':
        rules.hpPlacement = value.placement;
        break;
      case 'DOUBLE_BOOKING':
        rules.doubleBooking = value.enabled;
        break;
      case 'MATRIXING':
        rules.matrixing = value.enabled;
        break;
      case 'EMERGENCY_HANDLING':
        rules.emergencyHandling = value.strategy;
        break;
      case 'SRP_PLACEMENT':
        rules.srpBlocksPerDay = value.blocksPerDay;
        break;
    }
  }

  return {
    id: office.id,
    name: office.name,
    dpmsSystem: office.dpmsSystem,
    workingDays: JSON.parse(office.workingDays),
    timeIncrement: office.timeIncrement,
    feeModel: office.feeModel,
    providers,
    blockTypes,
    rules,
  };
}

/**
 * Create a new office
 */
export async function createOffice(data: CreateOfficeInput): Promise<OfficeDetail> {
  const office = await prisma.office.create({
    data: {
      name: data.name,
      dpmsSystem: data.dpmsSystem,
      workingDays: JSON.stringify(data.workingDays),
      timeIncrement: data.timeIncrement,
      feeModel: data.feeModel,
    },
  });

  // Create providers if provided
  if (data.providers && data.providers.length > 0) {
    await Promise.all(
      data.providers.map(provider =>
        prisma.provider.create({
          data: {
            id: provider.id,
            officeId: office.id,
            name: provider.name,
            providerId: provider.id,
            role: provider.role,
            operatories: JSON.stringify(provider.operatories),
            workingDays: JSON.stringify(data.workingDays),
            workingStart: provider.workingStart,
            workingEnd: provider.workingEnd,
            lunchStart: provider.lunchStart,
            lunchEnd: provider.lunchEnd,
            dailyGoal: provider.dailyGoal,
            color: provider.color,
          },
        })
      )
    );
  }

  // Create block types if provided
  if (data.blockTypes && data.blockTypes.length > 0) {
    await Promise.all(
      data.blockTypes.map(blockType =>
        prisma.blockType.create({
          data: {
            id: blockType.id,
            officeId: office.id,
            label: blockType.label,
            description: blockType.description,
            minimumAmount: blockType.minimumAmount,
            appliesToRole: blockType.appliesToRole,
            durationMin: blockType.durationMin,
            durationMax: blockType.durationMax,
          },
        })
      )
    );
  }

  // Create rules if provided
  if (data.rules) {
    const ruleTypes = [
      { type: 'NP_MODEL', value: { model: data.rules.npModel, blocksPerDay: data.rules.npBlocksPerDay } },
      { type: 'HP_PLACEMENT', value: { placement: data.rules.hpPlacement } },
      { type: 'DOUBLE_BOOKING', value: { enabled: data.rules.doubleBooking } },
      { type: 'MATRIXING', value: { enabled: data.rules.matrixing } },
      { type: 'EMERGENCY_HANDLING', value: { strategy: data.rules.emergencyHandling } },
      { type: 'SRP_PLACEMENT', value: { blocksPerDay: data.rules.srpBlocksPerDay } },
    ];

    await Promise.all(
      ruleTypes.map(rule =>
        prisma.scheduleRule.create({
          data: {
            officeId: office.id,
            ruleType: rule.type,
            ruleValue: JSON.stringify(rule.value),
          },
        })
      )
    );
  }

  // Return the created office with full details
  return (await getOfficeById(office.id))!;
}

/**
 * Update an existing office
 */
export async function updateOffice(id: string, data: Partial<CreateOfficeInput>): Promise<OfficeDetail | null> {
  const existingOffice = await prisma.office.findUnique({ where: { id } });
  if (!existingOffice) return null;

  // Update office record
  await prisma.office.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.dpmsSystem && { dpmsSystem: data.dpmsSystem }),
      ...(data.workingDays && { workingDays: JSON.stringify(data.workingDays) }),
      ...(data.timeIncrement && { timeIncrement: data.timeIncrement }),
      ...(data.feeModel && { feeModel: data.feeModel }),
    },
  });

  // Update providers if provided
  if (data.providers) {
    // Delete existing providers and recreate
    await prisma.provider.deleteMany({ where: { officeId: id } });
    await Promise.all(
      data.providers.map(provider =>
        prisma.provider.create({
          data: {
            id: provider.id || crypto.randomUUID(),
            officeId: id,
            name: provider.name,
            providerId: provider.id || crypto.randomUUID(),
            role: provider.role,
            operatories: JSON.stringify(provider.operatories || []),
            workingDays: JSON.stringify(data.workingDays || JSON.parse(existingOffice.workingDays)),
            workingStart: provider.workingStart || '07:00',
            workingEnd: provider.workingEnd || '18:00',
            lunchStart: provider.lunchStart,
            lunchEnd: provider.lunchEnd,
            dailyGoal: provider.dailyGoal || 0,
            color: provider.color || '#6b9bd1',
          },
        })
      )
    );
  }

  // Update block types if provided
  if (data.blockTypes) {
    await prisma.blockType.deleteMany({ where: { officeId: id } });
    await Promise.all(
      data.blockTypes.map(blockType =>
        prisma.blockType.create({
          data: {
            id: blockType.id,
            officeId: id,
            label: blockType.label,
            description: blockType.description,
            minimumAmount: blockType.minimumAmount,
            appliesToRole: blockType.appliesToRole,
            durationMin: blockType.durationMin,
            durationMax: blockType.durationMax,
          },
        })
      )
    );
  }

  // Update rules if provided
  if (data.rules) {
    await prisma.scheduleRule.deleteMany({ where: { officeId: id } });
    const ruleTypes = [
      { type: 'NP_MODEL', value: { model: data.rules.npModel, blocksPerDay: data.rules.npBlocksPerDay } },
      { type: 'HP_PLACEMENT', value: { placement: data.rules.hpPlacement } },
      { type: 'DOUBLE_BOOKING', value: { enabled: data.rules.doubleBooking } },
      { type: 'MATRIXING', value: { enabled: data.rules.matrixing } },
      { type: 'EMERGENCY_HANDLING', value: { strategy: data.rules.emergencyHandling } },
      { type: 'SRP_PLACEMENT', value: { blocksPerDay: data.rules.srpBlocksPerDay } },
    ];

    await Promise.all(
      ruleTypes.map(rule =>
        prisma.scheduleRule.create({
          data: {
            officeId: id,
            ruleType: rule.type,
            ruleValue: JSON.stringify(rule.value),
          },
        })
      )
    );
  }

  return getOfficeById(id);
}

/**
 * Delete an office (cascade deletes all related data)
 */
export async function deleteOffice(id: string): Promise<boolean> {
  try {
    await prisma.office.delete({ where: { id } });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate schedule for an office and save to database
 */
export async function generateSchedule(officeId: string, days: string[]): Promise<GenerationResult[]> {
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
    });

    results.push(result);

    // Save to database
    // Create or update schedule template
    let template = await prisma.scheduleTemplate.findFirst({
      where: {
        officeId,
        status: 'DRAFT',
      },
    });

    if (!template) {
      template = await prisma.scheduleTemplate.create({
        data: {
          officeId,
          status: 'DRAFT',
          generatedBy: 'RULE_BASED',
        },
      });
    }

    // Delete existing day schedule if exists
    await prisma.daySchedule.deleteMany({
      where: {
        templateId: template.id,
        dayOfWeek: day,
      },
    });

    // Create new day schedule with time slots
    const daySchedule = await prisma.daySchedule.create({
      data: {
        templateId: template.id,
        dayOfWeek: day,
      },
    });

    // Create time slots
    await Promise.all(
      result.slots.map(slot =>
        prisma.timeSlot.create({
          data: {
            dayScheduleId: daySchedule.id,
            time: slot.time,
            providerId: slot.providerId || null,
            operatory: slot.operatory || null,
            staffingCode: slot.staffingCode || null,
            blockTypeId: slot.blockTypeId || null,
            blockLabel: slot.blockLabel || null,
            isBreak: slot.isBreak,
          },
        })
      )
    );
  }

  return results;
}

/**
 * Get saved schedule templates for an office
 */
export async function getScheduleTemplates(officeId: string) {
  const templates = await prisma.scheduleTemplate.findMany({
    where: { officeId },
    include: {
      daySchedules: {
        include: {
          timeSlots: {
            orderBy: { time: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return templates.map(template => ({
    id: template.id,
    version: template.version,
    status: template.status,
    generatedBy: template.generatedBy,
    createdAt: template.createdAt.toISOString(),
    daySchedules: template.daySchedules.map(ds => ({
      dayOfWeek: ds.dayOfWeek,
      slots: ds.timeSlots.map(slot => ({
        time: slot.time,
        providerId: slot.providerId || undefined,
        operatory: slot.operatory || undefined,
        staffingCode: slot.staffingCode as any,
        blockTypeId: slot.blockTypeId || undefined,
        blockLabel: slot.blockLabel || undefined,
        isBreak: slot.isBreak,
      })),
    })),
  }));
}
