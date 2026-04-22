/**
 * Open Dental Schedule Export
 *
 * Transforms a GenerationResult into the Open Dental Schedule API blockout format.
 * Produces:
 *   1. A JSON array of OpenDentalScheduleEntry objects (for API import)
 *   2. A human-readable CSV mapping document
 */

import type { GenerationResult, TimeSlotOutput } from '@/lib/engine/types';

// ─── Types ──────────────────────────────────────────────────────────────────

/** One blockout entry in the Open Dental Schedule API format */
export interface OpenDentalScheduleEntry {
  SchedDate: string;       // "2026-03-02"
  StartTime: string;       // "08:00:00"
  StopTime: string;        // "09:30:00"
  SchedType: 'Blockout';
  ProvNum: string;         // Open Dental provider number
  BlockoutType: string;    // Open Dental Definition.DefNum for blockout type
  Note: string;            // Block label (human-readable)
  operatories: string;     // Comma-separated operatory IDs
}

/** User-supplied mapping: STD Provider → Open Dental ProvNum */
export interface ProviderMapping {
  providerId: string;
  providerName: string;
  provNum: string;
}

/** User-supplied mapping: STD Block Type label → Open Dental DefNum */
export interface BlockTypeMapping {
  blockTypeId: string;
  blockTypeLabel: string;
  defNum: string;
}

/** Full input to the Open Dental exporter */
export interface OpenDentalExportInput {
  schedule: GenerationResult;
  /** ISO date string: "2026-03-02" */
  schedDate: string;
  /** Minutes per time slot (10 or 15) */
  timeIncrement: number;
  providerMappings: ProviderMapping[];
  blockTypeMappings: BlockTypeMapping[];
}

/** Result returned by transformToOpenDental */
export interface OpenDentalExportResult {
  entries: OpenDentalScheduleEntry[];
  /** JSON string ready for file download */
  json: string;
  /** CSV mapping document string */
  csv: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** "HH:MM" → "HH:MM:SS" */
function toTimeString(hhmm: string): string {
  return `${hhmm}:00`;
}

/** Add `minutes` to an "HH:MM" string and return "HH:MM" */
function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/** Strip ">$NNN" suffix to get the base block type label */
function stripAmountSuffix(label: string): string {
  const idx = label.indexOf('>$');
  return idx >= 0 ? label.slice(0, idx).trim() : label.trim();
}

// ─── Block range extraction ──────────────────────────────────────────────────

interface BlockRange {
  providerId: string;
  operatory: string;
  blockTypeId: string;
  blockLabel: string;
  startTime: string;
  endTime: string;  // exclusive (= last slot time + increment)
}

/**
 * Extract consecutive block ranges from a flat list of time slots.
 * Slots must belong to a single provider and be sorted by time.
 */
function extractBlockRanges(
  slots: TimeSlotOutput[],
  timeIncrement: number
): BlockRange[] {
  const ranges: BlockRange[] = [];
  if (slots.length === 0) return ranges;

  let rangeStart = 0;

  for (let i = 1; i <= slots.length; i++) {
    const prev = slots[i - 1];
    const curr = i < slots.length ? slots[i] : null;

    // A range ends when: we reach the end, blockTypeId changes, or isBreak changes
    const sameBlock =
      curr !== null &&
      curr.blockTypeId === prev.blockTypeId &&
      curr.blockTypeId !== null &&
      !curr.isBreak &&
      !prev.isBreak;

    if (!sameBlock) {
      // Flush the current range (only if it has a blockTypeId and isn't a break)
      const startSlot = slots[rangeStart];
      if (startSlot.blockTypeId !== null && !startSlot.isBreak) {
        ranges.push({
          providerId: startSlot.providerId,
          operatory: startSlot.operatory,
          blockTypeId: startSlot.blockTypeId,
          blockLabel: startSlot.blockLabel ?? '',
          startTime: startSlot.time,
          endTime: addMinutes(prev.time, timeIncrement),
        });
      }
      rangeStart = i;
    }
  }

  return ranges;
}

// ─── Main transformer ────────────────────────────────────────────────────────

/**
 * Transform a GenerationResult into Open Dental Schedule API entries.
 */
export function transformToOpenDental(
  input: OpenDentalExportInput
): OpenDentalExportResult {
  const { schedule, schedDate, timeIncrement, providerMappings, blockTypeMappings } = input;

  // Build lookup maps
  const provNumByProviderId = new Map(
    providerMappings.map(m => [m.providerId, m.provNum])
  );
  const defNumByBlockTypeId = new Map(
    blockTypeMappings.map(m => [m.blockTypeId, m.defNum])
  );
  const defNumByLabel = new Map(
    blockTypeMappings.map(m => [m.blockTypeLabel.toLowerCase(), m.defNum])
  );

  // Group slots by provider
  const slotsByProvider = new Map<string, TimeSlotOutput[]>();
  for (const slot of schedule.slots) {
    if (!slotsByProvider.has(slot.providerId)) {
      slotsByProvider.set(slot.providerId, []);
    }
    slotsByProvider.get(slot.providerId)!.push(slot);
  }

  const entries: OpenDentalScheduleEntry[] = [];

  for (const [_providerId, slots] of slotsByProvider) {
    void _providerId;
    // Sort by time (they should already be, but be safe)
    const sorted = [...slots].sort((a, b) => {
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      return toMin(a.time) - toMin(b.time);
    });

    const ranges = extractBlockRanges(sorted, timeIncrement);

    for (const range of ranges) {
      const provNum = provNumByProviderId.get(range.providerId) ?? '';
      const baseLabel = stripAmountSuffix(range.blockLabel);

      // Look up defNum by blockTypeId first, then by label
      const defNum =
        defNumByBlockTypeId.get(range.blockTypeId) ??
        defNumByLabel.get(baseLabel.toLowerCase()) ??
        '';

      entries.push({
        SchedDate: schedDate,
        StartTime: toTimeString(range.startTime),
        StopTime: toTimeString(range.endTime),
        SchedType: 'Blockout',
        ProvNum: provNum,
        BlockoutType: defNum,
        Note: range.blockLabel,
        operatories: range.operatory,
      });
    }
  }

  const json = generateOpenDentalJSON(entries);
  const csv = generateMappingCSV(providerMappings, blockTypeMappings);

  return { entries, json, csv };
}

// ─── Output generators ───────────────────────────────────────────────────────

/**
 * Serialize entries to a JSON string suitable for API import.
 */
export function generateOpenDentalJSON(entries: OpenDentalScheduleEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/**
 * Generate a human-readable CSV mapping document.
 * Includes two sections:
 *   1. Provider mappings (STD Name → ProvNum)
 *   2. Block type mappings (STD Label → DefNum)
 */
export function generateMappingCSV(
  providerMappings: ProviderMapping[],
  blockTypeMappings: BlockTypeMapping[]
): string {
  const lines: string[] = [];

  // CSV helpers
  const escape = (v: string) =>
    v.includes(',') || v.includes('"') || v.includes('\n')
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const row = (...cols: string[]) => cols.map(escape).join(',');

  // Section 1: Provider Mappings
  lines.push('PROVIDER MAPPINGS');
  lines.push(row('STD Provider ID', 'STD Provider Name', 'Open Dental ProvNum'));
  for (const m of providerMappings) {
    lines.push(row(m.providerId, m.providerName, m.provNum));
  }

  lines.push('');

  // Section 2: Block Type Mappings
  lines.push('BLOCK TYPE MAPPINGS');
  lines.push(row('STD Block Type ID', 'STD Block Type Label', 'Open Dental BlockoutType DefNum'));
  for (const m of blockTypeMappings) {
    lines.push(row(m.blockTypeId, m.blockTypeLabel, m.defNum));
  }

  return lines.join('\n');
}

// ─── localStorage persistence ────────────────────────────────────────────────

const PROVIDER_MAPPING_KEY = (officeId: string) =>
  `od_provider_mappings_${officeId}`;
const BLOCKTYPE_MAPPING_KEY = (officeId: string) =>
  `od_blocktype_mappings_${officeId}`;

export function loadProviderMappings(officeId: string): ProviderMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROVIDER_MAPPING_KEY(officeId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProviderMappings(officeId: string, mappings: ProviderMapping[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROVIDER_MAPPING_KEY(officeId), JSON.stringify(mappings));
}

export function loadBlockTypeMappings(officeId: string): BlockTypeMapping[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BLOCKTYPE_MAPPING_KEY(officeId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBlockTypeMappings(officeId: string, mappings: BlockTypeMapping[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BLOCKTYPE_MAPPING_KEY(officeId), JSON.stringify(mappings));
}
