import ExcelJS from 'exceljs';

export interface ExportProvider {
  id: string;
  name: string;
  /** DPMS provider ID (e.g. "DG001") — included as column header label when present */
  providerId?: string;
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
  /**
   * Sprint 2 Stream B — optional X-segment role per Bible §2.1.
   * Marks which part of the block this 10-min slot belongs to.
   *   'A_PRE'  → assistant-only pre-band
   *   'D'      → doctor hands-on band
   *   'A_POST' → assistant-only post-band
   * When present, exports annotate the "S" column accordingly.
   */
  xsegmentRole?: 'A_PRE' | 'D' | 'A_POST';
  /** Optional: true if this is the first slot of the block (for header row). */
  isFirstSlotOfBlock?: boolean;
}

export interface ExportDaySchedule {
  dayOfWeek: string;
  /** Legacy: unused "variant" key (kept for backward compat). Prefer `variantLabel`. */
  variant?: string;
  /** Loop 9: variant day tag ("EOF", "Opt1", "Opt2", ...). Null/undefined = regular day. */
  variantLabel?: string | null;
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
  /** Time increment in minutes for the office (10 or 15). Defaults to 10. */
  timeIncrement?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Color utilities
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert a hex color (#RRGGBB or RRGGBB) to an ExcelJS ARGB string with the given opacity (0-1).
 * Blends with white background.
 */
function hexToArgbTint(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  // Blend with white (255, 255, 255)
  const tr = Math.round(r * opacity + 255 * (1 - opacity));
  const tg = Math.round(g * opacity + 255 * (1 - opacity));
  const tb = Math.round(b * opacity + 255 * (1 - opacity));
  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `FF${toHex(tr)}${toHex(tg)}${toHex(tb)}`;
}

/** Full opaque ARGB from hex color string. */
function hexToArgb(hex: string): string {
  const h = hex.replace('#', '');
  return `FF${h.toUpperCase().padStart(6, '0')}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Time formatting
// ────────────────────────────────────────────────────────────────────────────

/**
 * Format a 24-hour time string ("07:00") as "7:00 AM" / "1:00 PM".
 */
function formatTime12h(time: string): string {
  const [hourStr, minStr] = time.split(':');
  let hour = parseInt(hourStr, 10);
  const min = minStr;
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${hour}:${min} ${period}`;
}

/**
 * Generate time slots between start and end time (inclusive of end time).
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

// ────────────────────────────────────────────────────────────────────────────
// Thin border helper
// ────────────────────────────────────────────────────────────────────────────

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'thin', color: { argb: 'FFD0D0D0' } },
  bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  left:   { style: 'thin', color: { argb: 'FFD0D0D0' } },
  right:  { style: 'thin', color: { argb: 'FFD0D0D0' } },
};

const MEDIUM_BORDER: Partial<ExcelJS.Borders> = {
  top:    { style: 'medium', color: { argb: 'FF999999' } },
  bottom: { style: 'medium', color: { argb: 'FF999999' } },
  left:   { style: 'medium', color: { argb: 'FF999999' } },
  right:  { style: 'medium', color: { argb: 'FF999999' } },
};

// ────────────────────────────────────────────────────────────────────────────
// Main export entry point
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate production-quality Excel workbook from schedule data.
 *
 * Sheet order:
 *   1. Summary        — office overview, providers, weekly totals
 *   2. Reading the Schedule Template — how-to reference
 *   3. Scheduling Guidelines         — booking policies
 *   4–N. <DayOfWeek> [variant]       — one sheet per working day
 */
export async function generateExcel(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Custom Schedule Template';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `Customized Schedule Template - ${input.officeName}`;

  // Sheet 1: Summary cover sheet
  addSummarySheet(workbook, input);

  // Sheets 2-3: Instruction sheets
  addReadingSheet(workbook);
  addGuidelinesSheet(workbook);

  // Sheets 4+: One per working day
  const increment = input.timeIncrement ?? 10;
  for (const daySchedule of input.daySchedules) {
    addDayScheduleSheet(workbook, input, daySchedule, increment);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ────────────────────────────────────────────────────────────────────────────
// Summary cover sheet
// ────────────────────────────────────────────────────────────────────────────

function addSummarySheet(workbook: ExcelJS.Workbook, input: ExportInput): void {
  const sheet = workbook.addWorksheet('Summary');
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 18;
  sheet.getColumn(4).width = 18;

  // Title
  let row = 1;
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = input.officeName;
  titleCell.font = { bold: true, size: 18, color: { argb: 'FF1F2937' } };
  sheet.mergeCells(row, 1, row, 4);
  sheet.getRow(row).height = 30;
  row++;

  const subtitleCell = sheet.getCell(row, 1);
  subtitleCell.value = 'Customized Schedule Template — Summary';
  subtitleCell.font = { size: 12, italic: true, color: { argb: 'FF6B7280' } };
  sheet.mergeCells(row, 1, row, 4);
  row++;

  const dateCell = sheet.getCell(row, 1);
  dateCell.value = `Generated: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  sheet.mergeCells(row, 1, row, 4);
  row += 2;

  // Providers table header
  const hdrs = ['Provider', 'Role', 'Daily Goal', '75% Target'];
  for (let c = 0; c < hdrs.length; c++) {
    const cell = sheet.getCell(row, c + 1);
    cell.value = hdrs[c];
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = THIN_BORDER;
  }
  sheet.getRow(row).height = 20;
  row++;

  for (const p of input.providers) {
    const tint = hexToArgbTint(p.color, 0.12);
    const cells = [p.name, p.role, `$${p.dailyGoal.toLocaleString()}`, `$${p.goal75.toLocaleString()}`];
    for (let c = 0; c < cells.length; c++) {
      const cell = sheet.getCell(row, c + 1);
      cell.value = cells[c];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: c === 0 ? 'left' : 'center', vertical: 'middle' };
    }
    // Colour swatch in provider name cell left border
    sheet.getCell(row, 1).border = {
      ...THIN_BORDER,
      left: { style: 'thick', color: { argb: hexToArgb(p.color) } },
    };
    row++;
  }

  row += 2;

  // Weekly production totals table
  const daysWithData = input.daySchedules.filter(d => d.productionSummary.length > 0);
  if (daysWithData.length > 0) {
    const wHdr = sheet.getCell(row, 1);
    wHdr.value = 'Weekly Production Totals';
    wHdr.font = { bold: true, size: 12 };
    sheet.mergeCells(row, 1, row, 4);
    row++;

    const wColHdrs = ['Day', 'Scheduled Production', 'Status'];
    for (let c = 0; c < wColHdrs.length; c++) {
      const cell = sheet.getCell(row, c + 1);
      cell.value = wColHdrs[c];
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center' };
    }
    row++;

    let weekTotal = 0;
    for (const day of daysWithData) {
      const dayTotal = day.productionSummary.reduce((s, p) => s + p.actualScheduled, 0);
      const allMet = day.productionSummary.every(p => p.status === 'MET' || p.status === 'OVER');
      weekTotal += dayTotal;

      sheet.getCell(row, 1).value = day.dayOfWeek;
      sheet.getCell(row, 2).value = `$${dayTotal.toLocaleString()}`;
      sheet.getCell(row, 3).value = allMet ? '✅ MET' : '⚠️ UNDER';

      for (let c = 1; c <= 3; c++) {
        sheet.getCell(row, c).border = THIN_BORDER;
        sheet.getCell(row, c).alignment = { horizontal: c === 1 ? 'left' : 'center' };
      }
      row++;
    }

    // Total row
    sheet.getCell(row, 1).value = 'WEEKLY TOTAL';
    sheet.getCell(row, 1).font = { bold: true };
    sheet.getCell(row, 2).value = `$${weekTotal.toLocaleString()}`;
    sheet.getCell(row, 2).font = { bold: true };
    for (let c = 1; c <= 3; c++) {
      sheet.getCell(row, c).border = THIN_BORDER;
      sheet.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// How-to reference sheet
// ────────────────────────────────────────────────────────────────────────────

function addReadingSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('Reading the Schedule Template');
  sheet.getColumn(1).width = 100;

  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = 'How to Read the Schedule Template';
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.height = 25;

  let r = 3;

  const sections: [string, string, number?][] = [
    ['1. Provider Info/Working',
     'The left panel shows provider information including name, ID, assigned operatories/columns, daily goals, working hours, hourly rate, and 75% production target.'],
    ['2. Hygiene Exam Assignments',
     'HYG EX ID column indicates which doctor is assigned to perform exams for each hygienist during their recare appointments.'],
    ['3. Operatory Assignments',
     'Each provider is assigned specific operatories or columns. Doctors may work in multiple operatories (OP1, OP2) while hygienists typically have dedicated hygiene rooms (HYG 1, HYG 2, etc.).'],
    ['4. Daily Financial Goals',
     'Each provider has a daily production goal. The 75% target represents the minimum production that should be pre-scheduled through block minimums. The remaining 25% comes from same-day treatment acceptance and schedule optimization.'],
    ['5. Block Types and Production Minimums',
     'Block types define categories of appointments with minimum production values:\n• HP (High Production) - Crowns, implants, major restorative (typically >$1200)\n• MP (Medium Production) - Fillings, smaller restorative ($300-$1200)\n• NP (New Patient) - Consultation and same-day treatment\n• ER (Emergency) - Urgent care, limited exams\n• Recare - Routine hygiene cleanings (>$150)\n• PM (Perio Maintenance) - Periodontal maintenance (>$190)\n• SRP (Scaling & Root Planing) - Deep cleanings\n• NON-PROD - Non-productive appointments (seats, adjustments)', 150],
    ['6. Matrixing and Staffing Codes',
     'Staffing codes indicate provider activity:\n• D - Doctor providing treatment\n• H - Hygienist providing treatment\n• A - Assistant helping with procedure\nColor-coding shows when providers are busy (colored) vs available (white).', 75],
  ];

  for (const [title, body, height] of sections) {
    sheet.getRow(r).getCell(1).value = title;
    sheet.getRow(r).getCell(1).font = { bold: true, size: 12 };
    r++;
    sheet.getRow(r).getCell(1).value = body;
    sheet.getRow(r).getCell(1).alignment = { wrapText: true };
    if (height) sheet.getRow(r).height = height;
    r += 2;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Scheduling guidelines sheet
// ────────────────────────────────────────────────────────────────────────────

function addGuidelinesSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('Scheduling Guidelines');
  sheet.getColumn(1).width = 100;

  sheet.getRow(1).getCell(1).value = 'Scheduling Guidelines & Policies';
  sheet.getRow(1).getCell(1).font = { bold: true, size: 14 };
  sheet.getRow(1).height = 25;

  let r = 3;

  const policies: [string, string, number?][] = [
    ['1. 48-Hour Advance Booking Rule',
     'High Production (HP) appointments require at least 48 hours advance notice for proper preparation and lab work coordination.'],
    ['2. Priority Booking',
     'Schedule in order of priority: HP blocks first, then NP consultations, then fill with medium production and recare appointments.'],
    ['3. Confirmation & Cancellation Policy',
     'Confirm all HP appointments 48 hours in advance. Maintain a cancellation list to fill openings. Same-day cancellations should be filled with ER or flex appointments when possible.'],
    ['4. Flexibility for Same-Day Treatment',
     'Leave buffer time and flex slots to accommodate same-day treatment acceptance from hygiene exams and new patient consultations.'],
    ['5. OSA (Operatory/Staff/Asset) Optimization',
     'Maximize utilization of operatories, staff, and equipment. Use matrixing to allow doctors to float between hygiene exams and restorative work. Enable double-booking when multiple operatories are available.', 50],
  ];

  for (const [title, body, height] of policies) {
    sheet.getRow(r).getCell(1).value = title;
    sheet.getRow(r).getCell(1).font = { bold: true, size: 12 };
    r++;
    sheet.getRow(r).getCell(1).value = body;
    sheet.getRow(r).getCell(1).alignment = { wrapText: true };
    if (height) sheet.getRow(r).height = height;
    r += 2;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Day schedule sheet — production-quality layout
// ────────────────────────────────────────────────────────────────────────────

function addDayScheduleSheet(
  workbook: ExcelJS.Workbook,
  input: ExportInput,
  daySchedule: ExportDaySchedule,
  timeIncrement: number = 10
): void {
  // Loop 9: prefer variantLabel (new field, shown in parens "Friday (EOF)").
  // Fall back to legacy `variant` field which uses space separator "Monday 1.26".
  let sheetName: string;
  if (daySchedule.variantLabel) {
    sheetName = `${daySchedule.dayOfWeek} (${daySchedule.variantLabel})`;
  } else if (daySchedule.variant) {
    sheetName = `${daySchedule.dayOfWeek} ${daySchedule.variant}`;
  } else {
    sheetName = daySchedule.dayOfWeek;
  }

  const sheet = workbook.addWorksheet(sheetName);
  const providers = input.providers;

  // Column layout: col 1 = time, then per provider: [S col (staffing), Block Type col]
  // TIME col width
  sheet.getColumn(1).width = 12;
  // Per-provider columns
  for (let pi = 0; pi < providers.length; pi++) {
    const sCol = 2 + pi * 2;       // staffing code column
    const btCol = 3 + pi * 2;      // block type column
    sheet.getColumn(sCol).width = 4;
    sheet.getColumn(btCol).width = 28;
  }

  let currentRow = 1;

  // ── Provider info header rows ─────────────────────────────────────────────
  // Row 1: section title spanning all columns
  const totalCols = 1 + providers.length * 2;
  sheet.mergeCells(currentRow, 1, currentRow, totalCols);
  const infoTitle = sheet.getCell(currentRow, 1);
  infoTitle.value = 'PROVIDER INFO/WORKING';
  infoTitle.font = { bold: true, size: 11 };
  infoTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  infoTitle.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  infoTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(currentRow).height = 20;
  currentRow++;

  // Row 2: Provider info column headers
  const infoHeaders = ['PROVIDER INFO/WORKING', 'PROV ID', 'COLUMN(S)', 'DAILY GOAL', 'GOAL TODAY', 'HRS TODAY', '$ PER HR', '75% of GOAL'];
  for (let c = 0; c < Math.min(infoHeaders.length, totalCols); c++) {
    const cell = sheet.getCell(currentRow, c + 1);
    cell.value = infoHeaders[c];
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  sheet.getRow(currentRow).height = 18;
  currentRow++;

  // Rows 3+: one per provider
  for (const provider of providers) {
    const row = sheet.getRow(currentRow);
    const tint = hexToArgbTint(provider.color, 0.12);
    const workingHours = 10; // simplified

    const vals = [
      provider.name,
      provider.providerId || provider.id,
      provider.operatories.join(', '),
      provider.dailyGoal,
      provider.dailyGoal,
      workingHours,
      provider.hourlyRate,
      provider.goal75,
    ];

    for (let c = 0; c < Math.min(vals.length, totalCols); c++) {
      const cell = row.getCell(c + 1);
      cell.value = vals[c];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
      cell.border = c === 0
        ? { ...THIN_BORDER, left: { style: 'thick', color: { argb: hexToArgb(provider.color) } } }
        : THIN_BORDER;
      cell.alignment = { horizontal: c === 0 ? 'left' : 'center', vertical: 'middle' };
    }
    row.height = 18;
    currentRow++;
  }

  currentRow++; // gap

  // ── Block type legend ─────────────────────────────────────────────────────
  const legendTitle = sheet.getCell(currentRow, 1);
  legendTitle.value = 'BLOCK TYPE LEGEND';
  legendTitle.font = { bold: true };
  sheet.mergeCells(currentRow, 1, currentRow, 4);
  currentRow++;

  const legendHdrs = ['Label', 'Description', 'Minimum Amount', 'Color'];
  for (let c = 0; c < legendHdrs.length; c++) {
    const cell = sheet.getCell(currentRow, c + 1);
    cell.value = legendHdrs[c];
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = THIN_BORDER;
  }
  currentRow++;

  for (const bt of input.blockTypes) {
    const row = sheet.getRow(currentRow);
    row.getCell(1).value = bt.label;
    row.getCell(2).value = bt.description || '';
    row.getCell(3).value = bt.minimumAmount || 0;
    row.getCell(4).value = bt.color || '';
    for (let c = 1; c <= 4; c++) row.getCell(c).border = THIN_BORDER;
    currentRow++;
  }

  currentRow += 2; // gap before schedule grid
  const gridStartRow = currentRow;

  // ── Schedule grid header ──────────────────────────────────────────────────
  // Row A: Merged provider name headers (one per provider spanning S + Block columns)
  const headerRowA = sheet.getRow(gridStartRow);
  headerRowA.height = 22;

  // Time column header cell
  const timeHdrCell = headerRowA.getCell(1);
  timeHdrCell.value = 'Time';
  timeHdrCell.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
  timeHdrCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  timeHdrCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  timeHdrCell.border = MEDIUM_BORDER;
  timeHdrCell.alignment = { horizontal: 'center', vertical: 'middle' };
  // Merge time header across rows A and B
  sheet.mergeCells(gridStartRow, 1, gridStartRow + 1, 1);

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const sCol = 2 + pi * 2;
    const btCol = 3 + pi * 2;

    // Merge provider name header across S and Block columns
    sheet.mergeCells(gridStartRow, sCol, gridStartRow, btCol);
    const nameCell = headerRowA.getCell(sCol);
    const shortName = provider.role === 'DOCTOR'
      ? `DR ${provider.name.split(' ').slice(1).join(' ') || provider.name}`
      : `HYG ${provider.name.split(' ')[0]}`;
    const idSuffix = provider.providerId ? ` [${provider.providerId}]` : '';
    nameCell.value = shortName + idSuffix;
    nameCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(provider.color) } };
    nameCell.alignment = { horizontal: 'center', vertical: 'middle' };
    nameCell.border = MEDIUM_BORDER;
  }

  // Row B: Sub-headers (S / Block Type) per provider
  const headerRowB = sheet.getRow(gridStartRow + 1);
  headerRowB.height = 16;
  for (let pi = 0; pi < providers.length; pi++) {
    const sCol = 2 + pi * 2;
    const btCol = 3 + pi * 2;

    const sCell = headerRowB.getCell(sCol);
    sCell.value = 'S';
    sCell.font = { bold: true, size: 9 };
    sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    sCell.border = THIN_BORDER;
    sCell.alignment = { horizontal: 'center' };

    const btCell = headerRowB.getCell(btCol);
    btCell.value = 'Block Type';
    btCell.font = { bold: true, size: 9 };
    btCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
    btCell.border = THIN_BORDER;
    btCell.alignment = { horizontal: 'left' };
  }

  currentRow = gridStartRow + 2;

  // ── Slot index: group by time, track first/last slots per provider+block ──

  // Build lookup: time → provider ID → slot
  const slotsByTime = new Map<string, Map<string, ExportTimeSlot>>();
  for (const slot of daySchedule.slots) {
    if (!slotsByTime.has(slot.time)) slotsByTime.set(slot.time, new Map());
    slotsByTime.get(slot.time)!.set(slot.providerId, slot);
  }

  // Track per-provider active block label to detect first-row-of-block
  const lastBlockLabel: Map<string, string | null> = new Map(
    providers.map(p => [p.id, null])
  );

  const startTime = '07:00';
  const endTime = '18:00';
  const timeSlots = generateTimeSlots(startTime, endTime, timeIncrement);

  // ── Render each time slot row ─────────────────────────────────────────────
  for (const timeSlot of timeSlots) {
    const row = sheet.getRow(currentRow);
    row.height = 16;

    // Time cell (formatted as "8:00 AM")
    const timeCell = row.getCell(1);
    timeCell.value = formatTime12h(timeSlot);
    timeCell.font = { name: 'Calibri', size: 10, bold: false };
    timeCell.alignment = { horizontal: 'right', vertical: 'middle' };
    timeCell.border = THIN_BORDER;
    timeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };

    const slotsAtTime = slotsByTime.get(timeSlot);

    for (let pi = 0; pi < providers.length; pi++) {
      const provider = providers[pi];
      const sCol = 2 + pi * 2;
      const btCol = 3 + pi * 2;

      const provSlot = slotsAtTime?.get(provider.id);
      const staffCell = row.getCell(sCol);
      const blockCell = row.getCell(btCol);

      if (!provSlot || (!provSlot.staffingCode && !provSlot.blockLabel)) {
        // Empty slot
        staffCell.border = THIN_BORDER;
        blockCell.border = THIN_BORDER;
        lastBlockLabel.set(provider.id, null);
      } else if (provSlot.isBreak) {
        // Lunch row — grey fill, italic LUNCH label
        const greyFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
        staffCell.fill = greyFill;
        staffCell.border = THIN_BORDER;

        const isFirstLunch = lastBlockLabel.get(provider.id) !== 'LUNCH';
        blockCell.value = isFirstLunch ? 'LUNCH' : '';
        blockCell.font = { italic: true, color: { argb: 'FF6B7280' }, size: 10 };
        blockCell.fill = greyFill;
        blockCell.border = THIN_BORDER;
        blockCell.alignment = { horizontal: 'center', vertical: 'middle' };
        lastBlockLabel.set(provider.id, 'LUNCH');
      } else {
        // Occupied slot — provider color tint (12% opacity)
        const tintArgb = hexToArgbTint(provider.color, 0.12);
        const colorFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tintArgb } };

        // Staffing code cell — append X-segment glyph when metadata provided.
        // Sprint 2 Stream B: backward-compatible extension. When xsegmentRole
        // is set on the slot, the cell renders e.g. "A·" / "D" / "·A" so the
        // exported workbook carries the X-segment data through to Excel.
        const xMarker = provSlot.xsegmentRole === 'D'
          ? ''
          : provSlot.xsegmentRole === 'A_PRE'
            ? '↓'
            : provSlot.xsegmentRole === 'A_POST'
              ? '↑'
              : '';
        staffCell.value = `${provSlot.staffingCode || ''}${xMarker}`.trim();
        staffCell.font = { bold: true, size: 9, color: { argb: 'FF374151' } };
        staffCell.fill = colorFill;
        if (provSlot.xsegmentRole) {
          // Store the role on the cell as a hidden note for downstream tooling
          // (e.g. Python/BI pipelines that parse workbook notes).
          staffCell.note = `xsegment:${provSlot.xsegmentRole}`;
        }
        staffCell.border = {
          ...THIN_BORDER,
          left: { style: 'medium', color: { argb: hexToArgb(provider.color) } },
        };
        staffCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Block label cell — show label only on FIRST row of the block
        const prevLabel = lastBlockLabel.get(provider.id);
        const isFirstRow = provSlot.blockLabel !== prevLabel;
        blockCell.value = isFirstRow ? (provSlot.blockLabel || '') : '';
        blockCell.font = { size: 10, color: { argb: 'FF1F2937' } };
        blockCell.fill = colorFill;
        blockCell.border = THIN_BORDER;
        blockCell.alignment = { horizontal: 'left', vertical: 'middle' };

        lastBlockLabel.set(provider.id, provSlot.blockLabel);
      }
    }

    currentRow++;
  }

  // ── Production summary footer ─────────────────────────────────────────────
  currentRow += 2;

  for (const provider of providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    if (!summary) continue;

    const sCol = 2 + providers.indexOf(provider) * 2;
    const btCol = sCol + 1;
    const tint = hexToArgbTint(provider.color, 0.08);

    const pName = sheet.getRow(currentRow);
    pName.height = 16;
    // Provider name spanning S+Block columns
    sheet.mergeCells(currentRow, sCol, currentRow, btCol);
    const pNameCell = pName.getCell(sCol);
    pNameCell.value = provider.name;
    pNameCell.font = { bold: true, size: 10, color: { argb: hexToArgb(provider.color) } };
    pNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint } };
    pNameCell.border = THIN_BORDER;
    pNameCell.alignment = { horizontal: 'center' };
  }
  currentRow++;

  // Scheduled Production row
  const prodRow = sheet.getRow(currentRow);
  prodRow.height = 16;
  prodRow.getCell(1).value = 'Scheduled Production:';
  prodRow.getCell(1).font = { bold: true, size: 10 };
  prodRow.getCell(1).alignment = { horizontal: 'right' };

  for (const provider of providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    const btCol = 3 + providers.indexOf(provider) * 2;
    const cell = prodRow.getCell(btCol);
    cell.value = summary ? `$${summary.actualScheduled.toLocaleString()}` : '$0';
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: 'center' };
    cell.border = THIN_BORDER;
  }
  currentRow++;

  // Target (75%) row
  const targetRow = sheet.getRow(currentRow);
  targetRow.height = 16;
  targetRow.getCell(1).value = 'Target (75%):';
  targetRow.getCell(1).font = { size: 10 };
  targetRow.getCell(1).alignment = { horizontal: 'right' };

  for (const provider of providers) {
    const btCol = 3 + providers.indexOf(provider) * 2;
    const cell = targetRow.getCell(btCol);
    cell.value = `$${provider.goal75.toLocaleString()}`;
    cell.font = { size: 10 };
    cell.alignment = { horizontal: 'center' };
    cell.border = THIN_BORDER;
  }
  currentRow++;

  // Status row
  const statusRow = sheet.getRow(currentRow);
  statusRow.height = 18;
  statusRow.getCell(1).value = 'Status:';
  statusRow.getCell(1).font = { bold: true, size: 10 };
  statusRow.getCell(1).alignment = { horizontal: 'right' };

  for (const provider of providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    const btCol = 3 + providers.indexOf(provider) * 2;
    const cell = statusRow.getCell(btCol);
    const isMet = summary?.status === 'MET' || summary?.status === 'OVER';
    cell.value = isMet ? '✅ MET' : '⚠️ UNDER';
    cell.font = { bold: true, size: 10, color: { argb: isMet ? 'FF16A34A' : 'FFCA8A04' } };
    cell.alignment = { horizontal: 'center' };
    cell.border = THIN_BORDER;
  }

  // Legacy "Total Production Minimums" row for test compatibility
  currentRow += 2;
  const legacyRow = sheet.getRow(currentRow);
  legacyRow.getCell(1).value = 'Total Production Minimums';
  legacyRow.getCell(1).font = { bold: true };

  currentRow++;
  const legacyValRow = sheet.getRow(currentRow);
  for (const provider of providers) {
    const summary = daySchedule.productionSummary.find(s => s.providerId === provider.id);
    const btCol = 3 + providers.indexOf(provider) * 2;
    legacyValRow.getCell(btCol).value = summary ? `$${summary.actualScheduled.toLocaleString()}` : '$0';
    legacyValRow.getCell(btCol).font = { bold: true };
  }
}
