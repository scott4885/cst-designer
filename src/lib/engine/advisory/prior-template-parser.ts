/**
 * Sprint 6 Epic P — Prior-template parser.
 *
 * Three sub-parsers (CSV / XLSX / DOCX) share a common output contract:
 * `PriorTemplateParseResult`. The UI treats all three formats identically.
 *
 * CSV is the P0 target. XLSX uses exceljs (already in lockfile). DOCX in
 * Sprint 6 is a FREETEXT degrade — the raw text runs are preserved but the
 * parser does not attempt to infer blocks. Structured DOCX is Sprint 7.
 *
 * Block labels are fuzzy-matched against the canonical codes defined in
 * `prior-template-synonyms.ts` via a four-stage pipeline:
 *   1. Direct label equality
 *   2. Synonym lookup
 *   3. Token Jaccard overlap (≥ 0.5)
 *   4. Levenshtein distance (≤ 3)
 *
 * See SPRINT-6-PLAN §4.1 + §4.3.
 */

import ExcelJS from 'exceljs';
import type {
  PriorTemplateBlock,
  PriorTemplateParseResult,
  PriorTemplateSourceFormat,
} from './types';
import { BLOCK_SYNONYMS } from './prior-template-synonyms';

// ---------------------------------------------------------------------------
// Day + time normalization
// ---------------------------------------------------------------------------

const DAY_CODE: Record<string, string> = {
  MON: 'MON', MONDAY: 'MON', M: 'MON',
  TUE: 'TUE', TUES: 'TUE', TUESDAY: 'TUE', T: 'TUE',
  WED: 'WED', WEDS: 'WED', WEDNESDAY: 'WED', W: 'WED',
  THU: 'THU', THURS: 'THU', THURSDAY: 'THU', TH: 'THU',
  FRI: 'FRI', FRIDAY: 'FRI', F: 'FRI',
  SAT: 'SAT', SATURDAY: 'SAT',
  SUN: 'SUN', SUNDAY: 'SUN',
};

export function normalizeDay(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase().replace(/[^A-Z]/g, '');
  return DAY_CODE[key] ?? null;
}

/** Accepts "HH:MM" 24h, "H:MMam/pm", "9am", etc. Returns "HH:MM" 24-hour. */
export function normalizeTime(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  // "HH:MM" 24-hour form
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const mm = Number(m24[2]);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  // 12-hour forms
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (m12) {
    let h = Number(m12[1]);
    const mm = m12[2] ? Number(m12[2]) : 0;
    const ap = m12[3];
    if (h < 1 || h > 12 || mm < 0 || mm > 59) return null;
    if (ap === 'am') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
}

export function diffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// ---------------------------------------------------------------------------
// Label → canonical BlockType code match (4-stage pipeline)
// ---------------------------------------------------------------------------

interface LabelMatch {
  matchedBlockType: string | null;
  matchConfidence: number;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s/-]/g, ' ').split(/\s+/).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array<number>(b.length + 1);
  const curr = Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return curr[b.length];
}

export function matchLabelToBlockType(
  raw: string,
  canonicalLabels: string[] = Object.keys(BLOCK_SYNONYMS),
): LabelMatch {
  const normalized = raw.toLowerCase().trim().replace(/[^a-z0-9\s/-]/g, ' ').replace(/\s+/g, ' ');
  if (!normalized) return { matchedBlockType: null, matchConfidence: 0 };

  // Stage 1 — direct equality against canonical codes
  const upper = normalized.toUpperCase().replace(/\s+/g, '_');
  if (canonicalLabels.includes(upper)) {
    return { matchedBlockType: upper, matchConfidence: 1 };
  }

  // Stage 2 — synonym lookup
  for (const [code, syns] of Object.entries(BLOCK_SYNONYMS)) {
    if (!canonicalLabels.includes(code)) continue;
    for (const syn of syns) {
      if (normalized === syn) return { matchedBlockType: code, matchConfidence: 0.95 };
      // substring match on shorter tokens
      if (syn.length >= 3 && normalized.includes(syn)) {
        return { matchedBlockType: code, matchConfidence: 0.85 };
      }
    }
  }

  // Stage 3 — Jaccard overlap
  const tokens = new Set(tokenize(normalized));
  let bestJaccard = 0;
  let bestCode: string | null = null;
  for (const [code, syns] of Object.entries(BLOCK_SYNONYMS)) {
    if (!canonicalLabels.includes(code)) continue;
    for (const syn of syns) {
      const synTokens = new Set(tokenize(syn));
      const inter = [...tokens].filter((t) => synTokens.has(t)).length;
      const uni = new Set([...tokens, ...synTokens]).size;
      if (uni === 0) continue;
      const j = inter / uni;
      if (j > bestJaccard) {
        bestJaccard = j;
        bestCode = code;
      }
    }
  }
  if (bestJaccard >= 0.5 && bestCode) {
    return { matchedBlockType: bestCode, matchConfidence: bestJaccard };
  }

  // Stage 4 — Levenshtein against canonical codes themselves
  let bestDist = Infinity;
  let bestLevCode: string | null = null;
  for (const code of canonicalLabels) {
    const d = levenshtein(normalized.slice(0, 12), code.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      bestLevCode = code;
    }
  }
  if (bestLevCode && bestDist <= 3) {
    const conf = Math.max(0, 1 - bestDist / Math.max(normalized.length, bestLevCode.length));
    if (conf >= 0.4) return { matchedBlockType: bestLevCode, matchConfidence: conf };
  }

  return { matchedBlockType: null, matchConfidence: 0 };
}

// ---------------------------------------------------------------------------
// CSV parser — row-oriented, header:
//   day,start,end,label,provider?,notes?
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(csvText: string): PriorTemplateParseResult {
  const blocks: PriorTemplateBlock[] = [];
  const failingRows: number[] = [];
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      sourceFormat: 'CSV',
      parseStatus: 'FAILED',
      blocks: [],
      failingRows: [],
      errorMessage: 'CSV file is empty.',
    };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    day: header.indexOf('day'),
    start: header.indexOf('start'),
    end: header.indexOf('end'),
    label: header.indexOf('label'),
    provider: header.indexOf('provider'),
    notes: header.indexOf('notes'),
  };

  if (idx.day === -1 || idx.start === -1 || idx.end === -1 || idx.label === -1) {
    return {
      sourceFormat: 'CSV',
      parseStatus: 'FAILED',
      blocks: [],
      failingRows: [1],
      errorMessage: `CSV header must include day,start,end,label. Got: ${header.join(',')}`,
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const day = normalizeDay(fields[idx.day]);
    const start = normalizeTime(fields[idx.start]);
    const end = normalizeTime(fields[idx.end]);
    const label = fields[idx.label] ?? '';
    if (!day || !start || !end || !label) {
      failingRows.push(i + 1);
      continue;
    }
    const durationMin = diffMinutes(start, end);
    if (durationMin <= 0 || durationMin > 12 * 60) {
      failingRows.push(i + 1);
      continue;
    }
    const match = matchLabelToBlockType(label);
    blocks.push({
      day,
      start,
      end,
      durationMin,
      label,
      matchedBlockType: match.matchedBlockType,
      matchConfidence: match.matchConfidence,
      provider: idx.provider >= 0 ? fields[idx.provider] || undefined : undefined,
      notes: idx.notes >= 0 ? fields[idx.notes] || undefined : undefined,
    });
  }

  const parseStatus: 'OK' | 'PARTIAL' | 'FAILED' =
    blocks.length === 0 ? 'FAILED' : failingRows.length > 0 ? 'PARTIAL' : 'OK';

  return {
    sourceFormat: 'CSV',
    parseStatus,
    blocks,
    failingRows: failingRows.length > 0 ? failingRows : undefined,
    errorMessage:
      parseStatus === 'FAILED'
        ? 'No valid rows found. Check that day/start/end/label columns are populated.'
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// XLSX parser — reads first worksheet, row 1 = header
// ---------------------------------------------------------------------------

export async function parseXlsx(buffer: Buffer | ArrayBuffer): Promise<PriorTemplateParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs accepts Buffer-like for xlsx.load; accept ArrayBuffer too.
    const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer;
    // exceljs types declare Buffer but accept Uint8Array; cast through unknown.
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  } catch (err) {
    return {
      sourceFormat: 'XLSX',
      parseStatus: 'FAILED',
      blocks: [],
      errorMessage: `Could not read XLSX: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const ws = wb.worksheets[0];
  if (!ws) {
    return {
      sourceFormat: 'XLSX',
      parseStatus: 'FAILED',
      blocks: [],
      errorMessage: 'Workbook has no worksheets.',
    };
  }

  // Extract header row
  const headerRow = ws.getRow(1);
  const header: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    header[col - 1] = String(cell.value ?? '').trim().toLowerCase();
  });

  const idx = {
    day: header.indexOf('day'),
    start: header.indexOf('start'),
    end: header.indexOf('end'),
    label: header.indexOf('label'),
    provider: header.indexOf('provider'),
    notes: header.indexOf('notes'),
  };

  if (idx.day === -1 || idx.start === -1 || idx.end === -1 || idx.label === -1) {
    return {
      sourceFormat: 'XLSX',
      parseStatus: 'FAILED',
      blocks: [],
      failingRows: [1],
      errorMessage: `Worksheet header must include day,start,end,label. Got: ${header.join(',')}`,
    };
  }

  const blocks: PriorTemplateBlock[] = [];
  const failingRows: number[] = [];

  const cellVal = (row: ExcelJS.Row, col: number): string => {
    if (col < 0) return '';
    const c = row.getCell(col + 1);
    const v = c.value;
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && 'text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text;
    }
    return String(v);
  };

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const day = normalizeDay(cellVal(row, idx.day));
    const start = normalizeTime(cellVal(row, idx.start));
    const end = normalizeTime(cellVal(row, idx.end));
    const label = cellVal(row, idx.label);
    if (!day || !start || !end || !label) {
      failingRows.push(rowNum);
      return;
    }
    const durationMin = diffMinutes(start, end);
    if (durationMin <= 0 || durationMin > 12 * 60) {
      failingRows.push(rowNum);
      return;
    }
    const match = matchLabelToBlockType(label);
    blocks.push({
      day,
      start,
      end,
      durationMin,
      label,
      matchedBlockType: match.matchedBlockType,
      matchConfidence: match.matchConfidence,
      provider: cellVal(row, idx.provider) || undefined,
      notes: cellVal(row, idx.notes) || undefined,
    });
  });

  const parseStatus: 'OK' | 'PARTIAL' | 'FAILED' =
    blocks.length === 0 ? 'FAILED' : failingRows.length > 0 ? 'PARTIAL' : 'OK';

  return {
    sourceFormat: 'XLSX',
    parseStatus,
    blocks,
    failingRows: failingRows.length > 0 ? failingRows : undefined,
    errorMessage: parseStatus === 'FAILED' ? 'No valid rows found in worksheet.' : undefined,
  };
}

// ---------------------------------------------------------------------------
// DOCX / FREETEXT — Sprint 6 ships DOCX as FREETEXT-only. Structured DOCX
// with block detection is Sprint 7.
// ---------------------------------------------------------------------------

export function parseFreeText(rawText: string, format: 'DOCX' | 'FREETEXT' = 'FREETEXT'): PriorTemplateParseResult {
  return {
    sourceFormat: format,
    parseStatus: 'OK',
    blocks: [],
    rawText,
  };
}

// ---------------------------------------------------------------------------
// Format dispatcher
// ---------------------------------------------------------------------------

export async function parsePriorTemplate(
  format: PriorTemplateSourceFormat,
  payload: string | Buffer | ArrayBuffer,
): Promise<PriorTemplateParseResult> {
  if (format === 'CSV') {
    const text = typeof payload === 'string'
      ? payload
      : Buffer.isBuffer(payload)
        ? payload.toString('utf-8')
        : Buffer.from(payload as ArrayBuffer).toString('utf-8');
    return parseCsv(text);
  }
  if (format === 'XLSX') {
    if (typeof payload === 'string') {
      return {
        sourceFormat: 'XLSX',
        parseStatus: 'FAILED',
        blocks: [],
        errorMessage: 'XLSX parser requires a binary payload.',
      };
    }
    return parseXlsx(payload);
  }
  // DOCX + FREETEXT
  const text = typeof payload === 'string'
    ? payload
    : Buffer.isBuffer(payload)
      ? payload.toString('utf-8')
      : Buffer.from(payload as ArrayBuffer).toString('utf-8');
  return parseFreeText(text, format === 'DOCX' ? 'DOCX' : 'FREETEXT');
}
