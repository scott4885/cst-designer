import ExcelJS from 'exceljs';

export interface ExportProvider {
  id: string;
  name: string;
  role: string;
  operatories: string[];
  dailyGoal: number;
  hourlyRate: number;
  color: string;
  goal75: number;
}

export interface ExportBlockType {
  label: string;
  description?: string;
  minimumAmount?: number;
  color?: string;
}

export interface ExportTimeSlot {
  time: string;
  providerId: string;
  staffingCode: string | null;
  blockLabel: string | null;
  isBreak: boolean;
}

export interface ExportDaySchedule {
  dayOfWeek: string;
  variant?: string;
  slots: ExportTimeSlot[];
  productionSummary: {
    providerId: string;
    actualScheduled: number;
    status: 'MET' | 'UNDER' | 'OVER';
  }[];
}

export interface ExportInput {
  officeName: string;
  providers: ExportProvider[];
  blockTypes: ExportBlockType[];
  daySchedules: ExportDaySchedule[];
}

/**
 * Generate Excel workbook from schedule data
 */
export async function generateExcel(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // Set workbook properties
  workbook.creator = 'Custom Schedule Template';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `Customized Schedule Template - ${input.officeName}`;

  // Add instruction sheets
  addReadingSheet(workbook);
  addGuidelinesSheet(workbook);

  // Add day schedule sheets
  for (const daySchedule of input.daySchedules) {
    addDayScheduleSheet(workbook, input, daySchedule);
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Sheet 1: Reading the Schedule Template
 */
function addReadingSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('Reading the Schedule Template');

  // Title
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'How to Read the Schedule Template';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 25;

  let currentRow = 3;

  // Section 1: Provider Info
  sheet.getRow(currentRow).getCell(1).value = '1. Provider Info/Working';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'The left panel shows provider information including name, ID, assigned operatories/columns, daily goals, working hours, hourly rate, and 75% production target.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Section 2: Hygiene Exam Assignments
  sheet.getRow(currentRow).getCell(1).value = '2. Hygiene Exam Assignments';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'HYG EX ID column indicates which doctor is assigned to perform exams for each hygienist during their recare appointments.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Section 3: Operatory Assignments
  sheet.getRow(currentRow).getCell(1).value = '3. Operatory Assignments';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Each provider is assigned specific operatories or columns. Doctors may work in multiple operatories (OP1, OP2) while hygienists typically have dedicated hygiene rooms (HYG 1, HYG 2, etc.).';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Section 4: Daily Financial Goals
  sheet.getRow(currentRow).getCell(1).value = '4. Daily Financial Goals';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Each provider has a daily production goal. The 75% target represents the minimum production that should be pre-scheduled through block minimums. The remaining 25% comes from same-day treatment acceptance and schedule optimization.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Section 5: Block Types
  sheet.getRow(currentRow).getCell(1).value = '5. Block Types and Production Minimums';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Block types define categories of appointments with minimum production values:\n' +
    '• HP (High Production) - Crowns, implants, major restorative (typically >$1200)\n' +
    '• MP (Medium Production) - Fillings, smaller restorative ($300-$1200)\n' +
    '• NP (New Patient) - Consultation and same-day treatment\n' +
    '• ER (Emergency) - Urgent care, limited exams\n' +
    '• Recare - Routine hygiene cleanings (>$150)\n' +
    '• PM (Perio Maintenance) - Periodontal maintenance (>$190)\n' +
    '• SRP (Scaling & Root Planing) - Deep cleanings\n' +
    '• NON-PROD - Non-productive appointments (seats, adjustments)';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  sheet.getRow(currentRow).height = 150;
  currentRow += 2;

  // Section 6: Matrixing Codes
  sheet.getRow(currentRow).getCell(1).value = '6. Matrixing and Staffing Codes';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Staffing codes indicate provider activity:\n' +
    '• D - Doctor providing treatment\n' +
    '• H - Hygienist providing treatment\n' +
    '• A - Assistant helping with procedure\n' +
    'Color-coding shows when providers are busy (colored) vs available (white).';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  sheet.getRow(currentRow).height = 75;

  // Set column width
  sheet.getColumn(1).width = 100;
}

/**
 * Sheet 2: Scheduling Guidelines
 */
function addGuidelinesSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet('Scheduling Guidelines');

  // Title
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'Scheduling Guidelines & Policies';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 25;

  let currentRow = 3;

  // 48-Hour Rule
  sheet.getRow(currentRow).getCell(1).value = '1. 48-Hour Advance Booking Rule';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'High Production (HP) appointments require at least 48 hours advance notice for proper preparation and lab work coordination.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Priority Booking
  sheet.getRow(currentRow).getCell(1).value = '2. Priority Booking';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Schedule in order of priority: HP blocks first, then NP consultations, then fill with medium production and recare appointments.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Confirmation
  sheet.getRow(currentRow).getCell(1).value = '3. Confirmation & Cancellation Policy';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Confirm all HP appointments 48 hours in advance. Maintain a cancellation list to fill openings. Same-day cancellations should be filled with ER or flex appointments when possible.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // Flexibility
  sheet.getRow(currentRow).getCell(1).value = '4. Flexibility for Same-Day Treatment';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Leave buffer time and flex slots to accommodate same-day treatment acceptance from hygiene exams and new patient consultations.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  currentRow += 2;

  // OSA Optimization
  sheet.getRow(currentRow).getCell(1).value = '5. OSA (Operatory/Staff/Asset) Optimization';
  sheet.getRow(currentRow).getCell(1).font = { bold: true, size: 12 };
  currentRow++;
  sheet.getRow(currentRow).getCell(1).value = 
    'Maximize utilization of operatories, staff, and equipment. Use matrixing to allow doctors to float between hygiene exams and restorative work. Enable double-booking when multiple operatories are available.';
  sheet.getRow(currentRow).getCell(1).alignment = { wrapText: true };
  sheet.getRow(currentRow).height = 50;

  // Set column width
  sheet.getColumn(1).width = 100;
}

/**
 * Add a day schedule sheet (e.g., "Monday 1.26")
 */
function addDayScheduleSheet(
  workbook: ExcelJS.Workbook,
  input: ExportInput,
  daySchedule: ExportDaySchedule
) {
  // Format sheet name with date variant if provided
  const sheetName = daySchedule.variant 
    ? `${daySchedule.dayOfWeek} ${daySchedule.variant}`
    : daySchedule.dayOfWeek;
  
  const sheet = workbook.addWorksheet(sheetName);

  // Header rows (1-2): Provider info
  sheet.getRow(1).values = [
    'PROVIDER INFO/WORKING',
    'PROV ID',
    'COLUMN(S)',
    'DAILY GOAL',
    'GOAL TODAY',
    'HRS TODAY',
    '$ PER HR',
    '75% of GOAL'
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Provider data rows (3 to 3+N)
  let currentRow = 3;
  for (const provider of input.providers) {
    const row = sheet.getRow(currentRow);
    const workingHours = 10; // Simplified - should calculate from working hours
    
    row.values = [
      provider.name,
      provider.id,
      provider.operatories.join(', '),
      provider.dailyGoal,
      provider.dailyGoal, // GOAL TODAY (same as daily goal for now)
      workingHours,
      provider.hourlyRate,
      provider.goal75
    ];
    
    currentRow++;
  }

  // Gap row
  currentRow++;

  // Block type legend
  sheet.getRow(currentRow).getCell(1).value = 'BLOCK TYPE LEGEND';
  sheet.getRow(currentRow).getCell(1).font = { bold: true };
  currentRow++;

  sheet.getRow(currentRow).values = ['Label', 'Description', 'Minimum Amount', 'Color'];
  sheet.getRow(currentRow).font = { bold: true };
  currentRow++;

  for (const blockType of input.blockTypes) {
    const row = sheet.getRow(currentRow);
    row.values = [
      blockType.label,
      blockType.description || '',
      blockType.minimumAmount || 0,
      blockType.color || ''
    ];
    currentRow++;
  }

  // Gap before schedule grid
  currentRow += 2;
  const gridStartRow = currentRow;

  // Schedule grid header (row 16 typically)
  const headerRow = sheet.getRow(gridStartRow);
  const headerValues: any[] = ['Time'];
  
  // Add provider column headers (2 columns per provider: staffing + block type)
  for (const provider of input.providers) {
    const shortName = provider.role === 'DOCTOR' 
      ? `DR ${provider.name.split(' ')[1] || provider.name}` 
      : `HYG ${provider.name.split(' ')[0]}`;
    headerValues.push('', shortName); // Empty for staffing column, name for block column
  }
  
  headerRow.values = headerValues;
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Add light gray border
  for (let col = 1; col <= headerValues.length; col++) {
    const cell = headerRow.getCell(col);
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  }

  currentRow++;

  // Group slots by time for easier lookup
  const slotsByTime = new Map<string, ExportTimeSlot[]>();
  for (const slot of daySchedule.slots) {
    if (!slotsByTime.has(slot.time)) {
      slotsByTime.set(slot.time, []);
    }
    slotsByTime.get(slot.time)!.push(slot);
  }

  // Use default time range 7:00 AM to 6:00 PM (standard office hours)
  // This ensures consistent grid even with sparse slot data
  const startTime = '07:00';
  const endTime = '18:00';
  const timeSlots = generateTimeSlots(startTime, endTime, 10);

  // Render each time slot row
  for (const timeSlot of timeSlots) {
    const row = sheet.getRow(currentRow);
    const rowData: any[] = [formatTime(timeSlot)];
    
    // Get slots for this time
    const slotsAtTime = slotsByTime.get(timeSlot) || [];
    
    // For each provider, add staffing code and block label
    let colIndex = 2; // Start from column 2 (column 1 is time)
    for (const provider of input.providers) {
      const providerSlot = slotsAtTime.find(s => s.providerId === provider.id);
      
      if (providerSlot) {
        rowData.push(providerSlot.staffingCode || '');
        rowData.push(providerSlot.blockLabel || '');
      } else {
        rowData.push(''); // Empty staffing
        rowData.push(''); // Empty block
      }
      
      colIndex += 2;
    }
    
    // Set row values first
    row.values = rowData;
    
    // Then apply colors
    colIndex = 2; // Reset to column 2
    for (const provider of input.providers) {
      const providerSlot = slotsAtTime.find(s => s.providerId === provider.id);
      
      if (providerSlot) {
        const staffingCell = row.getCell(colIndex);
        const blockCell = row.getCell(colIndex + 1);
        
        // Apply provider color if occupied
        if (providerSlot.blockLabel && !providerSlot.isBreak) {
          // Set background color
          const fillColor = provider.color.replace('#', 'FF');
          staffingCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor }
          };
          blockCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: fillColor }
          };
        }
        
        // Lunch rows get light gray background
        if (providerSlot.isBreak) {
          staffingCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
          blockCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
          };
        }
      }
      
      colIndex += 2;
    }
    
    // Format: Calibri 11pt, center alignment, borders
    row.font = { name: 'Calibri', size: 11 };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
    
    for (let col = 1; col <= rowData.length; col++) {
      const cell = row.getCell(col);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    }
    
    currentRow++;
  }

  // Footer: Production summary
  currentRow += 2;
  
  const summaryLabelRow = sheet.getRow(currentRow);
  summaryLabelRow.getCell(1).value = 'Total Production Minimums';
  summaryLabelRow.getCell(1).font = { bold: true };
  currentRow++;

  const summaryValueRow = sheet.getRow(currentRow);
  const summaryValues: any[] = [''];
  
  for (const provider of input.providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    summaryValues.push(''); // Empty for staffing column
    summaryValues.push(summary ? `$${summary.actualScheduled.toLocaleString()}` : '$0');
  }
  
  summaryValueRow.values = summaryValues;
  summaryValueRow.font = { bold: true };
  currentRow++;

  const statusRow = sheet.getRow(currentRow);
  const statusValues: any[] = [''];
  
  for (const provider of input.providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    statusValues.push(''); // Empty for staffing column
    statusValues.push(summary ? summary.status : 'N/A');
  }
  
  statusRow.values = statusValues;

  // Set column widths
  sheet.getColumn(1).width = 12; // Time column
  for (let i = 2; i <= 1 + (input.providers.length * 2); i++) {
    sheet.getColumn(i).width = 15;
  }
}

/**
 * Generate time slots between start and end time (inclusive of end time)
 */
function generateTimeSlots(start: string, end: string, increment: number): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  
  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  while (currentMinutes <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    slots.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
    currentMinutes += increment;
  }
  
  return slots;
}

/**
 * Format time for display (e.g., "07:00" -> "7:00")
 */
function formatTime(time: string): string {
  const [hour, min] = time.split(':');
  return `${parseInt(hour)}:${min}`;
}
