import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateExcel, ExportInput } from '../excel';
import { smileCascadeProviders, smileCascadeBlockTypes } from '../../mock-data';

describe('Excel Export', () => {
  const mockExportInput: ExportInput = {
    officeName: 'Smile Cascade',
    providers: smileCascadeProviders.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      operatories: p.operatories,
      dailyGoal: p.dailyGoal,
      hourlyRate: p.dailyGoal / 10, // Simplified calculation
      color: p.color,
      goal75: p.dailyGoal * 0.75,
    })),
    blockTypes: smileCascadeBlockTypes.map(b => ({
      label: b.label,
      description: b.description,
      minimumAmount: b.minimumAmount,
      color: undefined,
    })),
    daySchedules: [
      {
        dayOfWeek: 'Monday',
        variant: '1.26',
        slots: [
          {
            time: '07:00',
            providerId: 'fitz-1',
            staffingCode: 'D',
            blockLabel: 'HP>$1200',
            isBreak: false,
          },
          {
            time: '07:00',
            providerId: 'cheryl-1',
            staffingCode: 'H',
            blockLabel: 'Recare>$150',
            isBreak: false,
          },
          {
            time: '13:00',
            providerId: 'fitz-1',
            staffingCode: null,
            blockLabel: 'LUNCH',
            isBreak: true,
          },
          {
            time: '13:00',
            providerId: 'cheryl-1',
            staffingCode: null,
            blockLabel: 'LUNCH',
            isBreak: true,
          },
        ],
        productionSummary: [
          {
            providerId: 'fitz-1',
            actualScheduled: 3800,
            status: 'MET',
          },
          {
            providerId: 'cheryl-1',
            actualScheduled: 2000,
            status: 'MET',
          },
        ],
      },
      {
        dayOfWeek: 'Tuesday',
        slots: [],
        productionSummary: [],
      },
    ],
  };

  it('should generate a valid Excel buffer', async () => {
    const buffer = await generateExcel(mockExportInput);
    
    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(0);
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should have correct number of sheets', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    // 2 instruction sheets + 2 day schedules = 4 sheets
    expect(workbook.worksheets.length).toBe(4);
  });

  it('should have correct sheet names', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    expect(sheetNames).toContain('Reading the Schedule Template');
    expect(sheetNames).toContain('Scheduling Guidelines');
    expect(sheetNames).toContain('Monday 1.26');
    expect(sheetNames).toContain('Tuesday');
  });

  it('should contain provider data in day sheets', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    expect(mondaySheet).toBeDefined();
    
    // Check for provider names (should appear in rows 3-6)
    const row3 = mondaySheet!.getRow(3);
    const providerName = row3.getCell(1).value;
    expect(providerName).toBe('Dr. Kevin Fitzpatrick');
  });

  it('should contain time slots from 7:00 to 6:00', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    expect(mondaySheet).toBeDefined();
    
    // Find the time column (should start around row 16)
    // Look for the first "7:00" entry
    let found700 = false;
    let found1800 = false;
    
    mondaySheet!.eachRow((row, rowNumber) => {
      const timeCell = row.getCell(1);
      if (timeCell.value === '7:00' || timeCell.value === '7:0') {
        found700 = true;
      }
      if (timeCell.value === '18:00' || timeCell.value === '18:0') {
        found1800 = true;
      }
    });
    
    expect(found700).toBe(true);
    expect(found1800).toBe(true);
  });

  it('should contain block type legend', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    expect(mondaySheet).toBeDefined();
    
    // Look for "BLOCK TYPE LEGEND"
    let foundLegend = false;
    
    mondaySheet!.eachRow((row) => {
      const cell = row.getCell(1);
      if (cell.value === 'BLOCK TYPE LEGEND') {
        foundLegend = true;
      }
    });
    
    expect(foundLegend).toBe(true);
  });

  it('should apply provider colors to cells', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    expect(mondaySheet).toBeDefined();
    
    // Check that at least some cells have fill colors
    let foundColoredCell = false;
    
    mondaySheet!.eachRow((row) => {
      row.eachCell((cell) => {
        // Check if cell has any fill
        if (cell.fill && cell.fill.type === 'pattern') {
          foundColoredCell = true;
        }
      });
    });
    
    expect(foundColoredCell).toBe(true);
  });

  it('should include production summary in footer', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    expect(mondaySheet).toBeDefined();
    
    // Look for "Total Production Minimums"
    let foundSummary = false;
    
    mondaySheet!.eachRow((row) => {
      const cell = row.getCell(1);
      if (cell.value === 'Total Production Minimums') {
        foundSummary = true;
      }
    });
    
    expect(foundSummary).toBe(true);
  });

  it('should set correct workbook properties', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    expect(workbook.creator).toBe('Schedule Template Designer');
    expect(workbook.subject).toBe('Customized Schedule Template - Smile Cascade');
  });

  it('should handle multiple days correctly', async () => {
    const buffer = await generateExcel(mockExportInput);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    
    // Should have Monday and Tuesday sheets
    const mondaySheet = workbook.getWorksheet('Monday 1.26');
    const tuesdaySheet = workbook.getWorksheet('Tuesday');
    
    expect(mondaySheet).toBeDefined();
    expect(tuesdaySheet).toBeDefined();
  });
});
