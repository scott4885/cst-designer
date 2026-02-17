/**
 * Ideal Day Templates — "Rocks & Sand" Methodology
 *
 * Lets users define what an "ideal day" looks like and score generated
 * schedules against it.  Rocks (high-value blocks) go in the morning;
 * sand (maintenance/lighter blocks) fills the afternoon.
 */

import type { GenerationResult, TimeSlotOutput } from './types';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

type BlockCategory =
  | 'HP'
  | 'NP'
  | 'SRP'
  | 'ER'
  | 'MP'
  | 'RECARE'
  | 'PM'
  | 'NON_PROD'
  | 'OTHER';

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export type TimeOfDay = 'MORNING' | 'AFTERNOON' | 'ANY';

export interface CategoryPreference {
  /** The block category this preference applies to */
  category: BlockCategory;
  /**
   * Preferred time of day.
   *  - 'MORNING'   = before noon (< 12:00)
   *  - 'AFTERNOON' = noon or later (>= 12:00)
   *  - 'ANY'       = no preference; always counts as aligned
   */
  preferredTimeOfDay: TimeOfDay;
}

export interface IdealDayTemplate {
  name: string;
  description?: string;
  preferences: CategoryPreference[];
}

export interface CategoryAlignmentScore {
  category: BlockCategory;
  /** Total block instances for this category (excluding breaks / empties) */
  totalBlocks: number;
  /** Block instances whose start time matches the preferred time of day */
  alignedBlocks: number;
  /** 0–100 */
  score: number;
  /** Start times of block instances that were NOT in the preferred range */
  misplacedBlockTimes: string[];
}

export interface AlignmentScore {
  /** Overall weighted score 0–100 */
  overallScore: number;
  /** Per-category breakdown (only categories present in the template) */
  categoryBreakdown: CategoryAlignmentScore[];
  /** Total block instances considered (excluding 'ANY' preference blocks) */
  totalBlocks: number;
  /** Block instances correctly placed */
  alignedBlocks: number;
}

// ---------------------------------------------------------------------------
// Default Template — "Rocks in the Morning, Sand in the Afternoon"
// ---------------------------------------------------------------------------

export const DEFAULT_IDEAL_DAY_TEMPLATE: IdealDayTemplate = {
  name: 'Rocks & Sand (Industry Best Practice)',
  description:
    'High-value blocks scheduled in the morning peak hours; lighter maintenance blocks in the afternoon.',
  preferences: [
    { category: 'HP',      preferredTimeOfDay: 'MORNING' },
    { category: 'NP',      preferredTimeOfDay: 'MORNING' },
    { category: 'SRP',     preferredTimeOfDay: 'MORNING' },
    { category: 'MP',      preferredTimeOfDay: 'AFTERNOON' },
    { category: 'RECARE',  preferredTimeOfDay: 'AFTERNOON' },
    { category: 'PM',      preferredTimeOfDay: 'AFTERNOON' },
    { category: 'ER',      preferredTimeOfDay: 'ANY' },
    { category: 'NON_PROD', preferredTimeOfDay: 'ANY' },
  ],
};

// ---------------------------------------------------------------------------
// Label → Category helper (mirrors generator.ts `categorize`)
// ---------------------------------------------------------------------------

/** Determine a block's category from its label string */
function categorizeLabel(label: string): BlockCategory {
  const lbl = label.toUpperCase();
  if (lbl.includes('SRP') || lbl.includes('AHT') || lbl.includes('PERIO SRP')) return 'SRP';
  if (lbl.includes('NON-PROD') || lbl === 'SEAT' || lbl.includes('NON_PROD')) return 'NON_PROD';
  if (lbl.includes('NP CONS') || lbl.includes('NEW PATIENT') || lbl.includes('CONSULT') || lbl === 'EXAM') return 'NP';
  // NP check before HP to avoid 'NP' being swallowed by the HP check
  if (lbl.startsWith('NP') && !lbl.startsWith('NP ')) return 'NP'; // bare "NP"
  if (lbl === 'NP') return 'NP';
  if (lbl.includes('ER') || lbl.includes('EMER') || lbl.includes('EMERGENCY') || lbl === 'LIMITED') return 'ER';
  if (lbl.includes('HP') || lbl.includes('CROWN') || lbl.includes('IMPLANT') || lbl.includes('BRIDGE') || lbl.includes('VENEERS') || lbl.includes('ENDO')) return 'HP';
  if (lbl.includes('MP') || lbl.includes('FILL') || lbl.includes('RESTO')) return 'MP';
  if (lbl.includes('RECARE') || lbl.includes('RECALL') || lbl.includes('PROPHY')) return 'RECARE';
  if (lbl.includes('PM') || lbl.includes('PERIO MAINT') || lbl.includes('DEBRIDE')) return 'PM';
  return 'OTHER';
}

/** Return true if the time string represents a morning slot (before noon) */
function isMorning(time: string): boolean {
  const [h] = time.split(':').map(Number);
  return h < 12;
}

/** Return true if the time string represents an afternoon slot (noon or later) */
function isAfternoon(time: string): boolean {
  const [h] = time.split(':').map(Number);
  return h >= 12;
}

// ---------------------------------------------------------------------------
// Block instance extraction
// ---------------------------------------------------------------------------

interface BlockInstance {
  providerId: string;
  operatory: string;
  blockTypeId: string;
  blockLabel: string;
  /** Start time of the first slot in this contiguous block run */
  startTime: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Extract distinct "block instances" from a schedule.
 *
 * A block instance is a contiguous run of slots that share the same
 * (providerId, operatory, blockTypeId).  Lunch breaks naturally split
 * otherwise-adjacent runs.
 */
function extractBlockInstances(schedule: GenerationResult): BlockInstance[] {
  if (schedule.slots.length === 0) return [];

  // Infer the time increment
  const uniqueTimes = [...new Set(schedule.slots.map(s => s.time))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b)
  );
  const increment = uniqueTimes.length >= 2
    ? timeToMinutes(uniqueTimes[1]) - timeToMinutes(uniqueTimes[0])
    : 10;

  // Group active slots by (providerId, operatory), sorted by time
  const groups = new Map<string, TimeSlotOutput[]>();
  for (const slot of schedule.slots) {
    if (slot.isBreak || slot.blockTypeId === null) continue;
    const key = `${slot.providerId}:${slot.operatory}`;
    const list = groups.get(key) ?? [];
    list.push(slot);
    groups.set(key, list);
  }

  const instances: BlockInstance[] = [];

  for (const slots of groups.values()) {
    // Sort by time
    slots.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

    let i = 0;
    while (i < slots.length) {
      const { blockTypeId, blockLabel, providerId, operatory, time: startTime } = slots[i];
      if (!blockTypeId) { i++; continue; }

      // Advance while the block type is the same AND slots are consecutive
      let j = i + 1;
      while (j < slots.length) {
        const prev = slots[j - 1];
        const curr = slots[j];
        const gap = timeToMinutes(curr.time) - timeToMinutes(prev.time);
        if (curr.blockTypeId !== blockTypeId || gap !== increment) break;
        j++;
      }

      instances.push({
        providerId,
        operatory,
        blockTypeId,
        blockLabel: blockLabel ?? '',
        startTime,
      });

      i = j;
    }
  }

  return instances;
}

// ---------------------------------------------------------------------------
// scoreScheduleAlignment
// ---------------------------------------------------------------------------

/**
 * Score how well the generated schedule aligns with the ideal day template.
 *
 * @returns AlignmentScore with overallScore (0–100) and per-category breakdown.
 */
export function scoreScheduleAlignment(
  schedule: GenerationResult,
  template: IdealDayTemplate
): AlignmentScore {
  const instances = extractBlockInstances(schedule);

  // Build a map of category → preference from the template
  const prefMap = new Map<BlockCategory, TimeOfDay>();
  for (const pref of template.preferences) {
    prefMap.set(pref.category, pref.preferredTimeOfDay);
  }

  // Accumulate per-category data
  const categoryData = new Map<
    BlockCategory,
    { total: number; aligned: number; misplacedTimes: string[] }
  >();

  for (const instance of instances) {
    const category = categorizeLabel(instance.blockLabel);
    const pref = prefMap.get(category);

    // If the template has no preference for this category, skip
    if (pref === undefined) continue;

    const data = categoryData.get(category) ?? { total: 0, aligned: 0, misplacedTimes: [] };

    if (pref === 'ANY') {
      // 'ANY' preference → always aligned; still track for breakdown
      data.total++;
      data.aligned++;
    } else if (pref === 'MORNING') {
      data.total++;
      if (isMorning(instance.startTime)) {
        data.aligned++;
      } else {
        data.misplacedTimes.push(instance.startTime);
      }
    } else {
      // 'AFTERNOON'
      data.total++;
      if (isAfternoon(instance.startTime)) {
        data.aligned++;
      } else {
        data.misplacedTimes.push(instance.startTime);
      }
    }

    categoryData.set(category, data);
  }

  // Build per-category breakdown (only for categories with a preference)
  const categoryBreakdown: CategoryAlignmentScore[] = [];
  let totalBlocks = 0;
  let alignedBlocks = 0;

  // Only include MORNING/AFTERNOON categories in the overall score denominator
  // (ANY categories are always aligned but inflate the score unnaturally)
  for (const [category, data] of categoryData) {
    const pref = prefMap.get(category)!;
    const categoryScore = data.total === 0 ? 100 : Math.round((data.aligned / data.total) * 100);

    categoryBreakdown.push({
      category,
      totalBlocks: data.total,
      alignedBlocks: data.aligned,
      score: categoryScore,
      misplacedBlockTimes: data.misplacedTimes,
    });

    // Exclude 'ANY' blocks from the overall score denominator
    if (pref !== 'ANY') {
      totalBlocks += data.total;
      alignedBlocks += data.aligned;
    }
  }

  const overallScore =
    totalBlocks === 0 ? 100 : Math.round((alignedBlocks / totalBlocks) * 100);

  return {
    overallScore,
    categoryBreakdown,
    totalBlocks,
    alignedBlocks,
  };
}
