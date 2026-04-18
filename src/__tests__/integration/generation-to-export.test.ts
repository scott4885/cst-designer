import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateSchedule } from '@/lib/engine/generator';
import { generateExcel } from '@/lib/export/excel';
import type { GenerationInput } from '@/lib/engine/types';
import type { ExportInput, ExportDaySchedule } from '@/lib/export/excel';

/**
 * Integration tests for Generation → Export flow.
 * Runs the schedule generator then feeds the result through the Excel exporter
 * and verifies the workbook structure and content.
 */

const PROVIDERS_CONFIG = [
  {
    id: 'dr-export',
    name: 'Dr. Export',
    role: 'DOCTOR' as const,
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 3000,
    color: '#f59e0b',
    operatories: ['OP1'],
  },
  {
    id: 'hyg-export',
    name: 'Hygienist Export',
    role: 'HYGIENIST' as const,
    workingStart: '07:00',
    workingEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dailyGoal: 2000,
    color: '#14b8a6',
    operatories: ['HYG1'],
  },
];

const BLOCK_TYPES = [
  { id: 'hp', label: 'HP', description: 'High Production', minimumAmount: 1200, appliesToRole: 'DOCTOR' as const, durationMin: 90 },
  { id: 'np', label: 'NP CONS', description: 'New Patient', minimumAmount: 300, appliesToRole: 'DOCTOR' as const, durationMin: 40 },
  { id: 'er', label: 'ER', description: 'Emergency', minimumAmount: 187, appliesToRole: 'DOCTOR' as const, durationMin: 30 },
  { id: 'recare', label: 'Recare', description: 'Recare', minimumAmount: 150, appliesToRole: 'HYGIENIST' as const, durationMin: 60 },
];

const RULES = {
  npModel: 'DOCTOR_ONLY' as const,
  npBlocksPerDay: 1,
  srpBlocksPerDay: 1,
  hpPlacement: 'MORNING' as const,
  doubleBooking: false,
  matrixing: false,
  emergencyHandling: 'DEDICATED' as const,
};

function buildExportInput(days: string[], results: ReturnType<typeof generateSchedule>[]): ExportInput {
  return {
    officeName: 'Export Integration Test Office',
    timeIncrement: 10,
    providers: PROVIDERS_CONFIG.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      operatories: p.operatories,
      dailyGoal: p.dailyGoal,
      hourlyRate: p.dailyGoal / 9, // simplified
      color: p.color,
      goal75: p.dailyGoal * 0.75,
    })),
    blockTypes: BLOCK_TYPES.map(bt => ({
      label: bt.label,
      description: bt.description,
      minimumAmount: bt.minimumAmount,
    })),
    daySchedules: results.map((result, i): ExportDaySchedule => ({
      dayOfWeek: days[i],
      slots: result.slots.map(s => ({
        time: s.time,
        providerId: s.providerId,
        staffingCode: s.staffingCode,
        blockLabel: s.blockLabel,
        isBreak: s.isBreak,
      })),
      productionSummary: result.productionSummary.map(p => ({
        providerId: p.providerId,
        actualScheduled: p.actualScheduled,
        status: p.status as 'MET' | 'UNDER' | 'OVER',
      })),
    })),
  };
}

describe('Generation to Export Flow Integration', () => {
  it('should export generated schedules to Excel', async () => {
    // Step 1: Generate schedule for Monday
    const genInput: GenerationInput = {
      providers: PROVIDERS_CONFIG,
      blockTypes: BLOCK_TYPES,
      rules: RULES,
      timeIncrement: 10,
      dayOfWeek: 'Monday',
    };
    const result = generateSchedule(genInput);
    expect(result.slots.length).toBeGreaterThan(0);

    // Step 2: Export to Excel
    const exportInput = buildExportInput(['Monday'], [result]);
    const buffer = await generateExcel(exportInput);

    expect(buffer).toBeDefined();
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);

    // Step 3: Validate workbook structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    // Summary + 2 instruction + 1 day = 4 sheets minimum
    expect(workbook.worksheets.length).toBeGreaterThanOrEqual(3);
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    expect(sheetNames).toContain('Monday');

    // Monday sheet should have time slots
    const mondaySheet = workbook.getWorksheet('Monday');
    expect(mondaySheet).toBeDefined();
    let hasTimeSlots = false;
    mondaySheet!.eachRow((row) => {
      const val = String(row.getCell(1).value ?? '');
      if (val.includes('AM') || val.includes('PM')) hasTimeSlots = true;
    });
    expect(hasTimeSlots).toBe(true);
  });

  it('should handle multi-day schedule exports', async () => {
    // Generate schedules for multiple days then export all at once
    const days = ['Monday', 'Tuesday', 'Wednesday'];
    const results = days.map(day =>
      generateSchedule({
        providers: PROVIDERS_CONFIG,
        blockTypes: BLOCK_TYPES,
        rules: RULES,
        timeIncrement: 10,
        dayOfWeek: day,
      })
    );

    const exportInput = buildExportInput(days, results);
    const buffer = await generateExcel(exportInput);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetNames = workbook.worksheets.map(ws => ws.name);
    expect(sheetNames).toContain('Monday');
    expect(sheetNames).toContain('Tuesday');
    expect(sheetNames).toContain('Wednesday');

    // Each day sheet should have time slots
    for (const day of days) {
      const daySheet = workbook.getWorksheet(day);
      expect(daySheet).toBeDefined();
      let hasSlots = false;
      daySheet!.eachRow(row => {
        const val = String(row.getCell(1).value ?? '');
        if (val.includes('AM') || val.includes('PM')) hasSlots = true;
      });
      expect(hasSlots).toBe(true);
    }
  });
});
