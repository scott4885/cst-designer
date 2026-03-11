/**
 * DPMS CSV Import — Sprint 14
 *
 * Parses DPMS production report CSVs and maps procedure codes to categories.
 * Supports Open Dental format; Dentrix is a stub for future use.
 */

import type { ProcedureCategory } from './engine/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcedureMixImportResult {
  providerName: string;
  totalProduction: number;
  mix: Record<ProcedureCategory, number>; // % per category, sums to 100
  rowCount: number;
  dateRange: { from: string; to: string };
  warnings: string[];
}

// ─── ADA Code → Category Mapping ─────────────────────────────────────────────

/**
 * Map an ADA procedure code string (e.g. "D2750", "D0150") to a ProcedureCategory.
 * Follows the code-range rules from the brief.
 */
export function mapADACodeToCategory(procCode: string): ProcedureCategory {
  const cleaned = procCode.trim().toUpperCase();

  // Extract numeric portion: "D2750" → 2750
  const match = cleaned.match(/^D(\d+)/);
  if (!match) return 'BASIC_RESTORATIVE';

  const num = parseInt(match[1], 10);

  // D0100–D0199 → NEW_PATIENT_DIAG (comprehensive exams, full-mouth x-rays, etc.)
  if (num >= 100 && num <= 199) {
    // D0140 (limited exam), D9110 (emergency palliative) → EMERGENCY_ACCESS
    if (num === 140) return 'EMERGENCY_ACCESS';
    return 'NEW_PATIENT_DIAG';
  }

  // D9110 → EMERGENCY_ACCESS (palliative treatment)
  if (num === 9110) return 'EMERGENCY_ACCESS';

  // D2140–D2394 → BASIC_RESTORATIVE (amalgam/composite fillings)
  if (num >= 2140 && num <= 2394) return 'BASIC_RESTORATIVE';

  // D2710–D2999 → MAJOR_RESTORATIVE (crowns, onlays, veneers)
  if (num >= 2710 && num <= 2999) return 'MAJOR_RESTORATIVE';

  // D3000–D3999 → ENDODONTICS
  if (num >= 3000 && num <= 3999) return 'ENDODONTICS';

  // D4000–D4999 → PERIODONTICS
  if (num >= 4000 && num <= 4999) return 'PERIODONTICS';

  // D5000–D5999 → PROSTHODONTICS
  if (num >= 5000 && num <= 5999) return 'PROSTHODONTICS';

  // D6000–D6999 → MAJOR_RESTORATIVE (implants, bridges)
  if (num >= 6000 && num <= 6999) return 'MAJOR_RESTORATIVE';

  // D7000–D7999 → ORAL_SURGERY
  if (num >= 7000 && num <= 7999) return 'ORAL_SURGERY';

  // Any remaining D0xxx (diagnostics/imaging beyond D0199) → NEW_PATIENT_DIAG
  if (num < 1000) return 'NEW_PATIENT_DIAG';

  return 'BASIC_RESTORATIVE';
}

// ─── CSV Parser Helpers ───────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseProduction(val: string): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

const ZERO_MIX = (): Record<ProcedureCategory, number> => ({
  MAJOR_RESTORATIVE: 0,
  ENDODONTICS: 0,
  BASIC_RESTORATIVE: 0,
  PERIODONTICS: 0,
  NEW_PATIENT_DIAG: 0,
  EMERGENCY_ACCESS: 0,
  ORAL_SURGERY: 0,
  PROSTHODONTICS: 0,
});

// ─── Open Dental Parser ───────────────────────────────────────────────────────

/**
 * Parse an Open Dental "Procedure Production" CSV export.
 *
 * Expected columns (header row required):
 *   ProcDate, Provider, ProcCode, Description, Qty, Fee, Production
 *
 * Rows without a recognized provider name are aggregated as "All Providers".
 */
export function parseOpenDentalCSV(csvText: string): ProcedureMixImportResult {
  const lines = csvText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return {
      providerName: 'Unknown',
      totalProduction: 0,
      mix: ZERO_MIX(),
      rowCount: 0,
      dateRange: { from: '', to: '' },
      warnings: ['CSV file is empty'],
    };
  }

  const warnings: string[] = [];

  // Normalize header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().replace(/\s+/g, ''));

  const colProcDate = headers.findIndex(h => h.includes('procdate') || h.includes('date'));
  const colProvider = headers.findIndex(h => h.includes('provider') || h.includes('prov'));
  const colProcCode = headers.findIndex(h => h.includes('proccode') || h.includes('code'));
  const colProduction = headers.findIndex(h => h.includes('production') || h.includes('amount'));

  if (colProcCode === -1) {
    warnings.push('Could not find ProcCode column — check CSV format');
  }
  if (colProduction === -1) {
    warnings.push('Could not find Production column — check CSV format');
  }

  const categoryTotals = ZERO_MIX();
  let totalProduction = 0;
  let unrecognizedCount = 0;
  const dates: string[] = [];
  const providerNames: Set<string> = new Set();

  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    rowCount++;

    // Date
    if (colProcDate >= 0 && cols[colProcDate]) {
      dates.push(cols[colProcDate]);
    }

    // Provider
    if (colProvider >= 0 && cols[colProvider]) {
      providerNames.add(cols[colProvider]);
    }

    // Proc Code
    const procCode = colProcCode >= 0 ? cols[colProcCode] : '';
    const production = colProduction >= 0 ? parseProduction(cols[colProduction]) : 0;

    if (production <= 0) continue;

    if (!procCode || !procCode.match(/^D\d+/i)) {
      unrecognizedCount++;
      continue;
    }

    const category = mapADACodeToCategory(procCode);
    categoryTotals[category] += production;
    totalProduction += production;
  }

  if (unrecognizedCount > 0) {
    warnings.push(`${unrecognizedCount} rows had unrecognized procedure codes`);
  }

  // Build percentage mix
  const mix = ZERO_MIX();
  if (totalProduction > 0) {
    let assignedTotal = 0;
    const cats = Object.keys(categoryTotals) as ProcedureCategory[];
    // Compute percentages rounded to 1 decimal
    for (const cat of cats) {
      mix[cat] = Math.round((categoryTotals[cat] / totalProduction) * 1000) / 10;
      assignedTotal += mix[cat];
    }
    // Adjust rounding error on the largest category
    const diff = Math.round((100 - assignedTotal) * 10) / 10;
    if (diff !== 0) {
      const largest = cats.reduce((a, b) => (mix[a] > mix[b] ? a : b));
      mix[largest] = Math.round((mix[largest] + diff) * 10) / 10;
    }
  }

  // Date range
  const sortedDates = dates.sort();
  const dateFrom = sortedDates[0] ?? '';
  const dateTo = sortedDates[sortedDates.length - 1] ?? '';

  const providerName =
    providerNames.size === 1
      ? Array.from(providerNames)[0]
      : providerNames.size === 0
      ? 'Unknown'
      : `${providerNames.size} Providers`;

  return {
    providerName,
    totalProduction,
    mix,
    rowCount,
    dateRange: { from: dateFrom, to: dateTo },
    warnings,
  };
}

// ─── Dentrix Parser (stub) ────────────────────────────────────────────────────

/**
 * Dentrix CSV import — stub for future implementation.
 * Dentrix exports a different column order; this will be implemented in a future sprint.
 */
export function parseDentrixCSV(_csvText: string): ProcedureMixImportResult {
  return {
    providerName: 'Unknown',
    totalProduction: 0,
    mix: ZERO_MIX(),
    rowCount: 0,
    dateRange: { from: '', to: '' },
    warnings: ['Dentrix CSV import is not yet implemented'],
  };
}
