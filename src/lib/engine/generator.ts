import type {
  GenerationInput,
  GenerationResult,
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
  StaffingCode,
  ScheduleRules,
  ProviderProductionSummary
} from './types';
import { calculateTarget75, calculateProductionSummary } from './calculator';
import { calculateStaggerOffset, DEFAULT_COLUMN_STAGGER_MIN, snapRotationTime } from './stagger';

// Re-export snapRotationTime so callers can import it from generator if needed
export { snapRotationTime };

/**
 * Maximum fraction of a provider's filled slots that may be occupied by a single block type.
 * Enforces the "no single appointment type fills the entire day" variety requirement (§7).
 */
export const MAX_SAME_TYPE_FRACTION = 0.65;

/**
 * Generate time slots from start to end in specified increments (24h format: "07:00")
 */
export function generateTimeSlots(start: string, end: string, increment: number): string[] {
  const slots: string[] = [];

  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes < endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const minutes = currentMinutes % 60;
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    currentMinutes += increment;
  }

  return slots;
}

/**
 * Check if a time falls within lunch break
 */
export function isLunchTime(time: string, lunchStart?: string, lunchEnd?: string): boolean {
  if (!lunchStart || !lunchEnd) return false;

  const timeMinutes = toMinutes(time);
  const lunchStartMinutes = toMinutes(lunchStart);
  const lunchEndMinutes = toMinutes(lunchEnd);

  return timeMinutes >= lunchStartMinutes && timeMinutes < lunchEndMinutes;
}

/** Convert "HH:MM" to minutes since midnight */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Get staffing code based on provider role
 */
export function getStaffingCode(role: 'DOCTOR' | 'HYGIENIST' | 'OTHER'): StaffingCode {
  if (role === 'DOCTOR') return 'D';
  if (role === 'HYGIENIST') return 'H';
  return 'A'; // 'OTHER' role gets 'A' for Assistant/Other
}

// ---------------------------------------------------------------------------
// Block categorization helpers — works with arbitrary block type labels
// ---------------------------------------------------------------------------

export type BlockCategory = 'HP' | 'NP' | 'SRP' | 'ER' | 'MP' | 'RECARE' | 'PM' | 'NON_PROD' | 'ASSISTED_HYG' | 'OTHER';

/**
 * Identify the "category" of a block by its label string.
 * Exported so production-mix and other modules can reuse without re-implementing.
 */
export function categorizeLabel(label: string): BlockCategory {
  const lbl = label.toUpperCase();
  // Order matters — more specific first
  if (lbl.includes('ASSISTED HYG') || lbl.includes('ASSISTED HYGIENE') || lbl === 'AH') return 'ASSISTED_HYG';
  if (lbl.includes('SRP') || lbl.includes('AHT') || lbl.includes('PERIO SRP')) return 'SRP';
  if (lbl.includes('NON-PROD') || lbl === 'SEAT') return 'NON_PROD';
  if (lbl.includes('NP') || lbl.includes('CONSULT') || lbl === 'EXAM') return 'NP';
  if (lbl.includes('ER') || lbl.includes('EMER') || lbl.includes('EMERGENCY') || lbl === 'LIMITED') return 'ER';
  if (lbl.includes('HP') || lbl.includes('CROWN') || lbl.includes('IMPLANT') || lbl.includes('BRIDGE') || lbl.includes('VENEERS') || lbl.includes('ENDO')) return 'HP';
  if (lbl.includes('MP') || lbl.includes('FILL') || lbl.includes('RESTO')) return 'MP';
  if (lbl.includes('RECARE') || lbl.includes('RECALL') || lbl.includes('PROPHY')) return 'RECARE';
  if (lbl.includes('PM') || lbl.includes('PERIO MAINT') || lbl.includes('DEBRIDE')) return 'PM';
  return 'OTHER';
}

/** Identify the "category" of a block type by its label */
function categorize(bt: BlockTypeInput): BlockCategory {
  return categorizeLabel(bt.label);
}

function blockAppliesToProvider(bt: BlockTypeInput, provider: ProviderInput): boolean {
  // Hygiene-typed blocks must never be placed in Doctor columns
  if (provider.role === 'DOCTOR' && bt.isHygieneType) return false;
  return bt.appliesToRole === 'BOTH' || bt.appliesToRole === provider.role;
}

// ---------------------------------------------------------------------------
// Slot-level helpers
// ---------------------------------------------------------------------------

interface ProviderSlots {
  provider: ProviderInput;
  /** Indices into the master slots array for this provider+operatory, in time order */
  indices: number[];
  operatory: string;
}

/** Build a map from "providerId::operatory" → ProviderSlots */
function buildProviderSlotMap(slots: TimeSlotOutput[], providers: ProviderInput[]): Map<string, ProviderSlots> {
  const map = new Map<string, ProviderSlots>();
  for (const p of providers) {
    const ops = p.operatories.length > 0 ? p.operatories : ['OP1'];
    for (const op of ops) {
      const key = `${p.id}::${op}`;
      map.set(key, { provider: p, indices: [], operatory: op });
    }
  }
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const key = `${slot.providerId}::${slot.operatory}`;
    const ps = map.get(key);
    if (ps) ps.indices.push(i);
  }
  return map;
}

/** Get all ProviderSlots entries for a given providerId (across all ops) */
function getProviderOpSlots(psMap: Map<string, ProviderSlots>, providerId: string): ProviderSlots[] {
  const result: ProviderSlots[] = [];
  for (const [key, ps] of psMap) {
    if (key.startsWith(`${providerId}::`)) {
      result.push(ps);
    }
  }
  return result;
}


/** Find contiguous available slot ranges for a provider */
function findAvailableRanges(
  slots: TimeSlotOutput[],
  providerSlots: ProviderSlots,
  slotsNeeded: number
): number[][] {
  const ranges: number[][] = [];
  const idxs = providerSlots.indices;

  for (let i = 0; i <= idxs.length - slotsNeeded; i++) {
    let ok = true;
    const range: number[] = [];
    for (let j = 0; j < slotsNeeded; j++) {
      const idx = idxs[i + j];
      const slot = slots[idx];
      if (slot.blockTypeId !== null || slot.isBreak) {
        ok = false;
        break;
      }
      range.push(idx);
    }
    if (ok) ranges.push(range);
  }
  return ranges;
}

/** Place a block into the slots array */
function placeBlockInSlots(
  slots: TimeSlotOutput[],
  range: number[],
  blockType: BlockTypeInput,
  provider: ProviderInput,
  labelOverride?: string
): void {
  const len = range.length;
  for (let i = 0; i < len; i++) {
    const idx = range[i];
    slots[idx].blockTypeId = blockType.id;
    slots[idx].blockLabel = labelOverride || blockType.label;

    // For doctor blocks ≥ 3 slots: mark first and last as 'A' (assistant-only time)
    // A → D → D → D → A models the real clinical workflow:
    //   first slot: assistant seats patient, places topical anesthetic
    //   last slot:  assistant does cleanup, post-op instructions
    if (provider.role === 'DOCTOR' && len >= 3 && (i === 0 || i === len - 1)) {
      slots[idx].staffingCode = 'A';
    } else {
      slots[idx].staffingCode = getStaffingCode(provider.role);
    }
  }
}

// ---------------------------------------------------------------------------
// Production label helpers
// ---------------------------------------------------------------------------

/** Round a dollar amount to the nearest $25 for clean labels */
function roundTo25(n: number): number {
  return Math.round(n / 25) * 25;
}

/** Build label like "HP>$1200" */
function makeLabel(bt: BlockTypeInput, overrideAmount?: number): string {
  const amount = overrideAmount ?? bt.minimumAmount;
  if (amount && amount > 0) {
    return `${bt.label}>$${amount}`;
  }
  return bt.label;
}

// ---------------------------------------------------------------------------
// Default block type factories — used when office doesn't configure a category
// ---------------------------------------------------------------------------

const DEFAULT_BLOCKS: Record<string, Omit<BlockTypeInput, 'id'>> = {
  HP: { label: 'HP', description: 'High Production', minimumAmount: 1200, appliesToRole: 'DOCTOR', durationMin: 90 },
  NP: { label: 'NP CONS', description: 'New Patient Consult', minimumAmount: 300, appliesToRole: 'DOCTOR', durationMin: 40 },
  MP: { label: 'MP', description: 'Medium Production', minimumAmount: 375, appliesToRole: 'DOCTOR', durationMin: 40 },
  ER: { label: 'ER', description: 'Emergency Access', minimumAmount: 187, appliesToRole: 'DOCTOR', durationMin: 30 },
  NON_PROD: { label: 'NON-PROD', description: 'Non-Productive', minimumAmount: 0, appliesToRole: 'DOCTOR', durationMin: 30 },
  SRP: { label: 'SRP', description: 'Scaling & Root Planing', minimumAmount: 300, appliesToRole: 'HYGIENIST', durationMin: 80 },
  PM: { label: 'PM', description: 'Perio Maintenance', minimumAmount: 190, appliesToRole: 'HYGIENIST', durationMin: 60 },
  RECARE: { label: 'Recare', description: 'Recall/Prophy', minimumAmount: 150, appliesToRole: 'HYGIENIST', durationMin: 60 },
  ASSISTED_HYG: { label: 'Assisted Hyg', description: 'Assisted Hygiene (2-3 chair rotation)', minimumAmount: 150, appliesToRole: 'HYGIENIST', durationMin: 60, color: '#8b5cf6', isHygieneType: true },
};

/**
 * Fallback IDs that MATCH the global Appointment Library (defaultBlockTypes in mock-data.ts).
 * This ensures generated slots can always be found and edited via the BlockEditor.
 * Pattern: "{label-slug}-default"   (previously was "default-{category}" which caused mismatches)
 */
const FALLBACK_IDS: Record<string, string> = {
  HP:           'hp-default',
  NP:           'np-cons-default',
  MP:           'mp-default',
  ER:           'er-default',
  NON_PROD:     'non-prod-default',
  SRP:          'srp-default',
  PM:           'pm-default',
  RECARE:       'recare-default',
  ASSISTED_HYG: 'assisted-hyg-default',
};

function getBlockForCategory(
  category: BlockCategory,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  provider: ProviderInput
): BlockTypeInput | null {
  const blocks = blocksByCategory.get(category) || [];
  const applicable = blocks.filter(b => blockAppliesToProvider(b, provider));
  if (applicable.length > 0) return applicable[0];

  // Fallback: create a synthetic default if we have a default definition
  // IDs match the global Appointment Library so BlockEditor can find them by id
  const def = DEFAULT_BLOCKS[category];
  if (def && (def.appliesToRole === 'BOTH' || def.appliesToRole === provider.role)) {
    return { id: FALLBACK_IDS[category], ...def };
  }
  return null;
}

function getAllBlocksForCategory(
  category: BlockCategory,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  provider: ProviderInput
): BlockTypeInput[] {
  const blocks = blocksByCategory.get(category) || [];
  const applicable = blocks.filter(b => blockAppliesToProvider(b, provider));
  if (applicable.length > 0) return applicable;

  const def = DEFAULT_BLOCKS[category];
  if (def && (def.appliesToRole === 'BOTH' || def.appliesToRole === provider.role)) {
    return [{ id: FALLBACK_IDS[category], ...def }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Time range helpers
// ---------------------------------------------------------------------------

function getLunchMidpoint(provider: ProviderInput): number {
  // When lunch is disabled, use noon as the morning/afternoon boundary
  if (provider.lunchEnabled === false || !provider.lunchStart || !provider.lunchEnd) {
    return 12 * 60;
  }
  return toMinutes(provider.lunchStart);
}

function isMorningSlot(slots: TimeSlotOutput[], idx: number, provider: ProviderInput): boolean {
  return toMinutes(slots[idx].time) < getLunchMidpoint(provider);
}

function isAfternoonSlot(slots: TimeSlotOutput[], idx: number, provider: ProviderInput): boolean {
  return toMinutes(slots[idx].time) >= getLunchMidpoint(provider);
}

/** Filter ranges to only those starting in the morning (before lunch) */
function morningRanges(ranges: number[][], slots: TimeSlotOutput[], provider: ProviderInput): number[][] {
  return ranges.filter(r => isMorningSlot(slots, r[0], provider));
}

/** Filter ranges to only those starting in the afternoon (after lunch) */
function afternoonRanges(ranges: number[][], slots: TimeSlotOutput[], provider: ProviderInput): number[][] {
  return ranges.filter(r => isAfternoonSlot(slots, r[0], provider));
}

/** Filter ranges to those starting before a certain time (in minutes) */
function rangesBefore(ranges: number[][], slots: TimeSlotOutput[], beforeMinutes: number): number[][] {
  return ranges.filter(r => toMinutes(slots[r[0]].time) < beforeMinutes);
}

/** Filter ranges to those starting at or after a certain time (in minutes) */
function rangesAfter(ranges: number[][], slots: TimeSlotOutput[], afterMinutes: number): number[][] {
  return ranges.filter(r => toMinutes(slots[r[0]].time) >= afterMinutes);
}

/** Filter ranges to those starting in a time window */
function rangesInWindow(ranges: number[][], slots: TimeSlotOutput[], fromMin: number, toMin: number): number[][] {
  return ranges.filter(r => {
    const t = toMinutes(slots[r[0]].time);
    return t >= fromMin && t < toMin;
  });
}

/** Get the latest range (last one that fits in a time window) */
function lastRange(ranges: number[][]): number[] | undefined {
  return ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
}

// ---------------------------------------------------------------------------
// Production target calculator
// ---------------------------------------------------------------------------

interface ProductionTargets {
  target75: number;
  hpTarget: number;      // 55-70% of target75
  npTarget: number;      // 5-10% of target75
  mpTarget: number;      // 15-25% of target75
  erTarget: number;      // 5-10% of target75
}

function calculateProductionTargets(provider: ProviderInput): ProductionTargets {
  const target75 = calculateTarget75(provider.dailyGoal);
  return {
    target75,
    hpTarget: target75 * 0.60,   // 60% of 75% target
    npTarget: target75 * 0.08,   // 8%
    mpTarget: target75 * 0.20,   // 20%
    erTarget: target75 * 0.05,   // 5%
  };
}

// ---------------------------------------------------------------------------
// Main schedule generation — Rock-Sand-Water Algorithm
// ---------------------------------------------------------------------------

export function generateSchedule(input: GenerationInput): GenerationResult {
  const { providers, blockTypes, rules, timeIncrement, dayOfWeek } = input;
  const warnings: string[] = [];
  const slots: TimeSlotOutput[] = [];

  // ─── Step 1: Create empty time slots for every provider × operatory ───
  for (const provider of providers) {
    const timeSlots = generateTimeSlots(provider.workingStart, provider.workingEnd, timeIncrement);
    // Multi-op: create a slot sequence for EACH operatory.
    // When doubleBooking is disabled, doctors only use their FIRST operatory (single-column schedule).
    let allOperatories = provider.operatories.length > 0 ? provider.operatories : ['OP1'];
    const operatories = (!rules.doubleBooking && provider.role === 'DOCTOR')
      ? [allOperatories[0]]
      : allOperatories;

    // When lunchEnabled is explicitly false, treat no slots as lunch breaks
    const lunchActive = provider.lunchEnabled !== false;

    for (const operatory of operatories) {
      for (const time of timeSlots) {
        const isLunch = lunchActive
          ? isLunchTime(time, provider.lunchStart, provider.lunchEnd)
          : false;

        slots.push({
          time,
          providerId: provider.id,
          operatory,
          staffingCode: isLunch ? null : getStaffingCode(provider.role),
          blockTypeId: null,
          blockLabel: isLunch ? 'LUNCH' : null,
          isBreak: isLunch
        });
      }
    }
  }

  const psMap = buildProviderSlotMap(slots, providers);

  // Separate providers by role
  const doctors = providers.filter(p => p.role === 'DOCTOR');
  const hygienists = providers.filter(p => p.role === 'HYGIENIST');

  // Group block types by category
  const blocksByCategory = new Map<string, BlockTypeInput[]>();
  for (const bt of blockTypes) {
    const cat = categorize(bt);
    if (!blocksByCategory.has(cat)) blocksByCategory.set(cat, []);
    blocksByCategory.get(cat)!.push(bt);
  }

  // ─── Step 2: Place DOCTOR blocks across ALL operatories (with staggering) ───
  // Provider-level stagger: each doctor gets an offset start time to avoid competing for the
  // same hygiene checks. Default: 20 min per doctor index.
  //
  // Column-level stagger (NEW): when a single doctor works multiple operatories simultaneously
  // (multi-column), each column gets its OWN independently-generated schedule offset by
  // columnStaggerIntervalMin (default 20 min) per column.
  //   Column 0 → T+0 (no extra offset)
  //   Column 1 → T+20
  //   Column 2 → T+40
  // This prevents the provider from being double-booked at the same time across columns.
  const STAGGER_INTERVAL_MIN = 20;

  // Track per-operatory stagger offsets so the fill function can respect them.
  // Key: "providerId::operatory", Value: total stagger offset in minutes.
  const doctorColumnStagger = new Map<string, number>();

  for (let di = 0; di < doctors.length; di++) {
    const doc = doctors[di];
    // Base (provider-level) stagger: use explicit override if set, else auto-calculate
    const baseStaggerMin = doc.staggerOffsetMin ?? (di * STAGGER_INTERVAL_MIN);
    // Per-column stagger interval: configurable per provider, default 20 min
    const columnStaggerInterval = doc.columnStaggerIntervalMin ?? DEFAULT_COLUMN_STAGGER_MIN;
    const opSlots = getProviderOpSlots(psMap, doc.id);
    // A provider is "multi-column" when they are assigned to more than one operatory
    const isMultiColumn = opSlots.length > 1;

    if (isMultiColumn) {
      // Generate blocks INDEPENDENTLY on each operatory with a per-column stagger offset.
      // Each column's schedule is staggered so appointment start times differ across columns,
      // ensuring the provider is never scheduled in two places at the same instant.
      //
      // FIX (Sprint 5 §5.4): Divide the daily goal evenly across all operatories so the
      // combined scheduled production doesn't exceed the provider's actual daily goal.
      const perOpGoal = doc.dailyGoal / opSlots.length;
      const docPerOp: ProviderInput = { ...doc, dailyGoal: perOpGoal };
      for (let oi = 0; oi < opSlots.length; oi++) {
        const columnOffset = calculateStaggerOffset(di, oi, columnStaggerInterval);
        const totalStagger = baseStaggerMin + columnOffset;
        doctorColumnStagger.set(`${doc.id}::${opSlots[oi].operatory}`, totalStagger);
        placeDoctorBlocks(slots, opSlots[oi], docPerOp, blocksByCategory, rules, timeIncrement, warnings, totalStagger, di, doctors.length);
      }
    } else {
      // Single-column: place with base provider stagger only
      for (const ps of opSlots) {
        doctorColumnStagger.set(`${doc.id}::${ps.operatory}`, baseStaggerMin);
        placeDoctorBlocks(slots, ps, doc, blocksByCategory, rules, timeIncrement, warnings, baseStaggerMin, di, doctors.length);
      }
    }
  }

  // ─── Step 3: Place HYGIENIST blocks across all operatories ───
  for (let i = 0; i < hygienists.length; i++) {
    const opSlots = getProviderOpSlots(psMap, hygienists[i].id);
    for (const ps of opSlots) {
      placeHygienistBlocks(slots, ps, hygienists[i], i, hygienists.length, blocksByCategory, rules, timeIncrement, warnings);
    }
  }

  // ─── Step 4: Fill ANY remaining gaps ───
  // Pass doctorColumnStagger so fill respects per-column stagger windows
  // (secondary columns should not be filled before their stagger offset start time).
  fillRemainingDoctorSlots(slots, psMap, doctors, blocksByCategory, timeIncrement, doctorColumnStagger);
  fillRemainingHygienistSlots(slots, psMap, hygienists, blocksByCategory, timeIncrement);

  // ─── Step 5: Doctor matrixing — D/A codes ───
  if (rules.matrixing) {
    addDoctorMatrixing(slots, psMap, doctors, hygienists, timeIncrement);
  }

  // ─── Step 6: Calculate production summary ───
  const productionSummary = calculateAllProductionSummaries(slots, providers, blockTypes);

  return {
    dayOfWeek,
    slots,
    productionSummary,
    warnings
  };
}

// ---------------------------------------------------------------------------
// Doctor block placement — follows Rock-Sand-Water exactly
// ---------------------------------------------------------------------------

function placeDoctorBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  doc: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[],
  staggerOffsetMin: number = 0,
  _doctorIndex: number = 0,
  _totalDoctors: number = 1
): void {
  // Stagger: offset the "available from" start time for morning block placement.
  // This spreads doctors across the morning so they aren't competing for the same hygiene checks.
  const staggeredStartMin = toMinutes(doc.workingStart) + staggerOffsetMin;
  const targets = calculateProductionTargets(doc);

  // Resolve block types for each category
  const hpBlock = getBlockForCategory('HP', blocksByCategory, doc);
  const npBlock = getBlockForCategory('NP', blocksByCategory, doc);
  const mpBlock = getBlockForCategory('MP', blocksByCategory, doc);
  const erBlock = getBlockForCategory('ER', blocksByCategory, doc);
  const nonProdBlock = getBlockForCategory('NON_PROD', blocksByCategory, doc);

  // Get all HP block variants (some offices have CROWN, IMPLANT, ENDO as separate types)
  const hpBlocks = getAllBlocksForCategory('HP', blocksByCategory, doc);
  // Sort by minimumAmount descending — place highest production first
  hpBlocks.sort((a, b) => (b.minimumAmount || 0) - (a.minimumAmount || 0));

  let totalScheduled = 0;

  // Calculate per-block production minimums from the 75% target
  const hpMinPerBlock = roundTo25(targets.hpTarget / 3); // ~3 HP blocks
  const npMin = roundTo25(targets.npTarget);
  const mpMinPerBlock = roundTo25(targets.mpTarget / 2); // ~2 MP blocks
  const erMin = roundTo25(targets.erTarget);

  // ──────── MORNING: ROCKS ────────

  // 2a. NP CONSULT — First available morning slot (staggered by doctor index)
  if (npBlock && rules.npBlocksPerDay > 0 && (rules.npModel === 'DOCTOR_ONLY' || rules.npModel === 'EITHER')) {
    const slotsNeeded = Math.ceil(npBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // NP in first 2 hours of the staggered start window
    const earlyRanges = rangesAfter(
      rangesBefore(ranges, slots, staggeredStartMin + 120),
      slots,
      staggeredStartMin
    );
    const targetRange = earlyRanges[0] || morningRanges(ranges, slots, doc)[0];

    if (targetRange) {
      const amount = npBlock.minimumAmount || npMin;
      placeBlockInSlots(slots, targetRange, npBlock, doc, makeLabel(npBlock, amount));
      totalScheduled += amount;
    } else if (ranges[0]) {
      const amount = npBlock.minimumAmount || npMin;
      placeBlockInSlots(slots, ranges[0], npBlock, doc, makeLabel(npBlock, amount));
      totalScheduled += amount;
    } else {
      warnings.push(`No room for NP block for ${doc.name}`);
    }
  }

  // 2b-e. HP BLOCKS — Fill morning with rocks (2-3 morning HP blocks), starting at staggered offset
  const morningHPTarget = 3;
  let morningHPPlaced = 0;

  for (let i = 0; i < morningHPTarget; i++) {
    // Production cap guard: stop placing HP blocks once we've hit the per-op target.
    // This prevents multi-op doctors from over-scheduling when dailyGoal is divided per op.
    if (totalScheduled >= targets.target75) break;

    const hp = hpBlocks[i % hpBlocks.length];
    if (!hp) break;

    const hpAmount = hp.minimumAmount || hpMinPerBlock;
    // Additional guard: if a single HP block would exceed the per-op target by 1.5×,
    // skip HP placements entirely. This handles cases where the per-op goal is very
    // small relative to block size (e.g. 3 ops with $3000 goal → target75 = $750, HP = $1200).
    if (hpAmount > targets.target75 * 1.5) break;

    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Start from staggered offset to spread doctors across morning
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);

    const targetRange = amRanges[0] || fallbackAmRanges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, hpAmount));
      totalScheduled += hpAmount;
      morningHPPlaced++;
    } else {
      break; // No more morning room
    }
  }

  // 2d. ER/ACCESS — Mid-morning, offset by stagger to spread doctors
  if (erBlock && rules.emergencyHandling !== 'FLEX') {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Prefer 10:00-11:30 window, but shift forward by stagger offset
    const erWindowStart = Math.max(10 * 60 + staggerOffsetMin, staggeredStartMin);
    const midMorningRanges = rangesInWindow(ranges, slots, erWindowStart, 11 * 60 + 30 + staggerOffsetMin);
    const targetRange = midMorningRanges[0] || morningRanges(ranges, slots, doc)[0];

    if (targetRange) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, targetRange, erBlock, doc, makeLabel(erBlock, amount));
      totalScheduled += amount;
    }
  }

  // Fill remaining morning slots with more HP if available
  // Only fill if still under the per-op target (guards multi-op over-scheduling).
  if (morningHPPlaced < 4 && hpBlocks.length > 0 && totalScheduled < targets.target75) {
    const hp = hpBlocks[0];
    const fillHpAmount = hp.minimumAmount || hpMinPerBlock;
    // Same block-size guard: skip if this HP block itself would exceed target by 1.5×
    if (fillHpAmount <= targets.target75 * 1.5) {
      const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      const amRanges = morningRanges(ranges, slots, doc);
      if (amRanges.length > 0) {
        placeBlockInSlots(slots, amRanges[0], hp, doc, makeLabel(hp, fillHpAmount));
        totalScheduled += fillHpAmount;
      }
    }
  }

  // ──────── AFTERNOON: SAND & WATER ────────

  // 2f. HP BLOCK (afternoon) — 1 HP block right after lunch
  // For staggered doctors: offset the first afternoon block to avoid lunch overlap.
  // If stagger offset > 0, give secondary doctors an earlier/later first-PM block.
  // Guard: skip if we've already met the per-op target (multi-op doctors with divided goals).
  if (hpBlocks.length > 0 && totalScheduled < targets.target75) {
    const hp = hpBlocks[0];
    const pmHpAmount = hp.minimumAmount || hpMinPerBlock;
    // Same block-size guard as morning: skip if single block far exceeds per-op target
    if (pmHpAmount <= targets.target75 * 1.5) {
      const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      const pmRanges = afternoonRanges(ranges, slots, doc);

      if (pmRanges.length > 0) {
        // Stagger first afternoon HP: each additional doctor delays by stagger offset
        const pmStaggerStart = getLunchMidpoint(doc) + staggerOffsetMin;
        const staggeredPmRanges = rangesAfter(pmRanges, slots, pmStaggerStart);
        const targetRange = staggeredPmRanges[0] || pmRanges[0];
        placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, pmHpAmount));
        totalScheduled += pmHpAmount;
      }
    }
  }

  // 2g. MP BLOCK — After afternoon HP
  // Guard: skip if already at per-op target (multi-op doctors with divided goals).
  if (mpBlock && totalScheduled < targets.target75 * 1.5) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, pmRanges[0], mpBlock, doc, makeLabel(mpBlock, amount));
      totalScheduled += amount;
    }
  }

  // 2h. NON-PROD — Late afternoon (crown seat, adjustment)
  if (nonProdBlock) {
    const slotsNeeded = Math.ceil(nonProdBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);
    // Prefer late afternoon (4 PM+), else latest available afternoon
    const lateRanges = rangesAfter(pmRanges, slots, 16 * 60);
    const targetRange = lastRange(lateRanges) || lastRange(pmRanges);

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, nonProdBlock, doc, makeLabel(nonProdBlock));
      totalScheduled += nonProdBlock.minimumAmount || 0;
    }
  }

  // 2i. Second MP block — fill remaining afternoon gap
  // Guard: skip if already at per-op target.
  if (mpBlock && totalScheduled < targets.target75 * 1.5) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, pmRanges[0], mpBlock, doc, makeLabel(mpBlock, amount));
      totalScheduled += amount;
    }
  }

  // 2j. Second ER block in early afternoon if ACCESS_BLOCKS mode
  if (erBlock && rules.emergencyHandling === 'ACCESS_BLOCKS') {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const earlyPM = rangesInWindow(ranges, slots, 14 * 60, 15 * 60 + 30);

    if (earlyPM.length > 0) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, earlyPM[0], erBlock, doc, makeLabel(erBlock, amount));
      totalScheduled += amount;
    }
  }

  // 2k. Goal-driven gap fill — work backwards from target to select best block type
  // Sort available blocks by production per slot (descending) to maximize efficiency
  let safety = 0;
  while (totalScheduled < targets.target75 && safety < 15) {
    safety++;
    const gap = targets.target75 - totalScheduled;

    // Pick the block type that best fills the remaining gap
    // Prefer HP if gap is large, MP if medium, ER/NP if small
    const candidateBlocks: { block: BlockTypeInput; priority: number }[] = [];
    
    if (hpBlocks.length > 0 && gap >= (hpBlocks[0].minimumAmount || 800)) {
      hpBlocks.forEach(b => candidateBlocks.push({ block: b, priority: 3 }));
    }
    if (mpBlock && gap >= (mpBlock.minimumAmount || 200)) {
      candidateBlocks.push({ block: mpBlock, priority: 2 });
    }
    if (erBlock && gap >= (erBlock.minimumAmount || 100)) {
      candidateBlocks.push({ block: erBlock, priority: 1 });
    }
    if (candidateBlocks.length === 0 && mpBlock) {
      candidateBlocks.push({ block: mpBlock, priority: 0 });
    }
    if (candidateBlocks.length === 0) break;

    // Use highest-priority block (ties broken by production value)
    candidateBlocks.sort((a, b) => b.priority - a.priority || (b.block.minimumAmount || 0) - (a.block.minimumAmount || 0));
    const selected = candidateBlocks[0].block;

    const slotsNeeded = Math.ceil(selected.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;

    const amount = selected.minimumAmount || mpMinPerBlock;
    placeBlockInSlots(slots, ranges[0], selected, doc, makeLabel(selected, amount));
    totalScheduled += amount;
  }

  if (totalScheduled < targets.target75) {
    warnings.push(`${doc.name}: scheduled $${totalScheduled} vs $${Math.round(targets.target75)} target (${Math.round(totalScheduled / targets.target75 * 100)}%)`);
  }
}

// ---------------------------------------------------------------------------
// Hygienist block placement — SRP morning, PM, then Recare fills rest
// ---------------------------------------------------------------------------

function placeHygienistBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  hygIndex: number,
  totalHygienists: number,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  // If hygienist is in Assisted Hygiene mode, use a different block pattern
  if (hyg.assistedHygiene) {
    placeAssistedHygienistBlocks(slots, ps, hyg, hygIndex, blocksByCategory, rules, timeIncrement, warnings);
    return;
  }

  const srpBlock = getBlockForCategory('SRP', blocksByCategory, hyg);
  const pmBlock = getBlockForCategory('PM', blocksByCategory, hyg);
  const recareBlock = getBlockForCategory('RECARE', blocksByCategory, hyg);

  // ──────── MORNING: SRP (Rock) ────────

  // 3a. SRP — First morning slot (stagger if multiple hygienists)
  if (srpBlock && rules.srpBlocksPerDay > 0) {
    const slotsNeeded = Math.ceil(srpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);

    // Stagger: HYG1 gets first available, HYG2 offset by ~90 min
    const staggerOffset = hygIndex * 90; // minutes offset per hygienist
    const startMin = toMinutes(hyg.workingStart) + staggerOffset;

    const staggeredRanges = rangesAfter(
      morningRanges(ranges, slots, hyg),
      slots,
      startMin
    );

    const targetRange = staggeredRanges[0] || morningRanges(ranges, slots, hyg)[0] || ranges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, srpBlock, hyg, makeLabel(srpBlock));
    } else {
      warnings.push(`No room for SRP block for ${hyg.name}`);
    }
  }

  // 3b. PM (Perio Maintenance) — Morning or early afternoon
  if (pmBlock) {
    const slotsNeeded = Math.ceil(pmBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Prefer morning, then early afternoon
    const amRanges = morningRanges(ranges, slots, hyg);
    const earlyPM = rangesInWindow(ranges, slots, getLunchMidpoint(hyg), getLunchMidpoint(hyg) + 120);
    const targetRange = amRanges[0] || earlyPM[0] || ranges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, pmBlock, hyg, makeLabel(pmBlock));
    }
  }

  // 3c. RECARE — Place a few recare blocks (not all slots - variety will come from fill function)
  if (recareBlock) {
    const slotsNeeded = Math.ceil(recareBlock.durationMin / timeIncrement);
    let safety = 0;

    // Place only 2-3 recare blocks initially, rest will be varied in fill function
    while (safety < 3) {
      safety++;
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;

      placeBlockInSlots(slots, ranges[0], recareBlock, hyg, makeLabel(recareBlock));
    }
  }
}

/**
 * Assisted Hygiene mode: hygienist rotates across 2-3 chairs with assistant support.
 * Shorter appointment slots (30-45 min), more patients per day.
 * Blocks labeled "Assisted Hyg" (AH) with distinct teal color.
 */
function placeAssistedHygienistBlocks(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  hygIndex: number,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  // Get the assisted hygiene block type, fall back to creating one
  const assistedHygBlock = getBlockForCategory('ASSISTED_HYG', blocksByCategory, hyg)
    || { id: FALLBACK_IDS.ASSISTED_HYG, ...DEFAULT_BLOCKS.ASSISTED_HYG as Omit<BlockTypeInput, 'id'> };

  // Also get SRP for morning (assisted hygiene still does SRP)
  const srpBlock = getBlockForCategory('SRP', blocksByCategory, hyg);

  // 1. SRP morning block (staggered)
  if (srpBlock && rules.srpBlocksPerDay > 0) {
    const slotsNeeded = Math.ceil(srpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const staggerOffset = hygIndex * 90;
    const startMin = toMinutes(hyg.workingStart) + staggerOffset;
    const staggeredRanges = rangesAfter(morningRanges(ranges, slots, hyg), slots, startMin);
    const targetRange = staggeredRanges[0] || morningRanges(ranges, slots, hyg)[0] || ranges[0];
    if (targetRange) {
      placeBlockInSlots(slots, targetRange, srpBlock, hyg, makeLabel(srpBlock));
    } else {
      warnings.push(`No room for SRP block for ${hyg.name} (assisted hygiene mode)`);
    }
  }

  // 2. Fill remaining slots with assisted hygiene blocks (shorter = more patients)
  const slotsNeeded = Math.ceil(assistedHygBlock.durationMin / timeIncrement);
  let safety = 0;
  while (safety < 12) {
    safety++;
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;
    placeBlockInSlots(slots, ranges[0], assistedHygBlock, hyg, 'Assisted Hyg');
  }
}

// ---------------------------------------------------------------------------
// Fill remaining gaps — ensure every slot has a block
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Variety enforcement helper — tracks how many SLOTS each blockTypeId occupies
// for a provider+operatory so we can enforce MAX_SAME_TYPE_FRACTION (§7).
// ---------------------------------------------------------------------------

/**
 * Count occupied slots (non-break, has blockTypeId) per blockTypeId for a ProviderSlots.
 */
function countSlotsByBlockType(slots: TimeSlotOutput[], ps: ProviderSlots): Map<string, number> {
  const counts = new Map<string, number>();
  for (const idx of ps.indices) {
    const slot = slots[idx];
    if (!slot.isBreak && slot.blockTypeId) {
      counts.set(slot.blockTypeId, (counts.get(slot.blockTypeId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Count total occupied (non-break) slots for a ProviderSlots.
 */
function countOccupiedSlots(slots: TimeSlotOutput[], ps: ProviderSlots): number {
  return ps.indices.filter(idx => !slots[idx].isBreak && slots[idx].blockTypeId).length;
}

/**
 * Check if placing `slotsNeeded` more slots of `blockTypeId` would exceed
 * MAX_SAME_TYPE_FRACTION of the total available (non-break) time.
 * Returns true if placing would violate the cap (block should be skipped).
 */
function wouldExceedVarietyCap(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  blockTypeId: string,
  slotsNeeded: number
): boolean {
  const totalNonBreak = ps.indices.filter(idx => !slots[idx].isBreak).length;
  if (totalNonBreak === 0) return false;

  const byType = countSlotsByBlockType(slots, ps);
  const currentCount = byType.get(blockTypeId) ?? 0;
  const afterCount = currentCount + slotsNeeded;

  return afterCount / totalNonBreak > MAX_SAME_TYPE_FRACTION;
}

/**
 * Compute the production already scheduled for a provider in a specific operatory.
 * Walks consecutive same-blockTypeId runs and sums their minimumAmount values.
 * Used by fillDocOpSlots to enforce per-op production caps for multi-column doctors.
 */
function computeCurrentOpProduction(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  blocksByCategory: Map<string, BlockTypeInput[]>
): number {
  // Build a flat block-id → amount lookup
  const btAmountMap = new Map<string, number>();
  for (const bts of blocksByCategory.values()) {
    for (const bt of bts) {
      btAmountMap.set(bt.id, bt.minimumAmount ?? 0);
    }
  }
  const opSlots = slots.filter(
    s => s.providerId === ps.provider.id && s.operatory === ps.operatory && s.blockTypeId && !s.isBreak
  );
  let total = 0;
  let currentBlockId: string | null = null;
  for (const slot of opSlots) {
    if (slot.blockTypeId !== currentBlockId) {
      total += btAmountMap.get(slot.blockTypeId!) ?? 0;
      currentBlockId = slot.blockTypeId;
    }
  }
  return total;
}

function fillRemainingDoctorSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  doctors: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  columnStaggerMap?: Map<string, number>
): void {
  for (const doc of doctors) {
    const opSlotsList = getProviderOpSlots(psMap, doc.id);
    // For multi-column doctors, cap per-op fill to dailyGoal / numOps so the
    // fill step doesn't undo the per-op goal division applied in placeDoctorBlocks.
    const perOpCap = opSlotsList.length > 1 ? doc.dailyGoal / opSlotsList.length : undefined;
    for (const ps of opSlotsList) {
      const staggerMin = columnStaggerMap?.get(`${doc.id}::${ps.operatory}`) ?? 0;
      fillDocOpSlots(slots, ps, doc, blocksByCategory, timeIncrement, staggerMin, perOpCap);
    }
  }
}

function fillDocOpSlots(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  doc: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number,
  staggerOffsetMin: number = 0,
  productionCap?: number
): void {
    // Get all available block types for this doctor
    const hpBlocks = getAllBlocksForCategory('HP', blocksByCategory, doc);
    const mpBlocks = getAllBlocksForCategory('MP', blocksByCategory, doc);
    const npBlocks = getAllBlocksForCategory('NP', blocksByCategory, doc);
    const erBlocks = getAllBlocksForCategory('ER', blocksByCategory, doc);
    
    // Distribution: HP (30%), MP (30%), ER/Low (20%), NP (20%)
    const blockPool: { block: BlockTypeInput; weight: number }[] = [];
    hpBlocks.forEach(b => blockPool.push({ block: b, weight: 30 }));
    mpBlocks.forEach(b => blockPool.push({ block: b, weight: 30 }));
    erBlocks.forEach(b => blockPool.push({ block: b, weight: 20 }));
    npBlocks.forEach(b => blockPool.push({ block: b, weight: 20 }));
    
    if (blockPool.length === 0) return;

    // For staggered columns: the fill function must respect the stagger window.
    // Slots before the staggered start time are intentionally left empty — they
    // represent the ramp-up period before this column's patients arrive.
    const staggeredFillStart = toMinutes(doc.workingStart) + staggerOffsetMin;

    // If a production cap is set (multi-op doctors), pre-compute already-placed production
    // and stop filling if we've already hit the cap.
    let filledProduction = 0;
    if (productionCap !== undefined) {
      filledProduction = computeCurrentOpProduction(slots, ps, blocksByCategory);
      if (filledProduction >= productionCap) return;
    }
    
    // Shuffle and distribute blocks
    let safety = 0;
    while (safety < 20) {
      safety++;
      
      // Production cap guard: stop filling if per-op cap is reached
      if (productionCap !== undefined && filledProduction >= productionCap) break;

      // Pick a random block type based on weights
      const totalWeight = blockPool.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedBlock = blockPool[0].block;
      
      for (const item of blockPool) {
        random -= item.weight;
        if (random <= 0) {
          selectedBlock = item.block;
          break;
        }
      }
      
      const slotsNeeded = Math.ceil(selectedBlock.durationMin / timeIncrement);

      // Production cap: skip this block if it would push past the cap
      if (productionCap !== undefined) {
        const blockAmount = selectedBlock.minimumAmount ?? 0;
        if (filledProduction + blockAmount > productionCap * 1.25) {
          // Allow up to 25% over cap to avoid getting stuck (block granularity)
          // If even 25% over is exceeded, try a smaller block or bail
          continue;
        }
      }

      // Variety cap: if placing this block type would exceed MAX_SAME_TYPE_FRACTION,
      // skip it this iteration so a different type gets placed instead (§7 variety enforcement).
      if (wouldExceedVarietyCap(slots, ps, selectedBlock.id, slotsNeeded)) {
        continue;
      }

      // Only consider slots at or after the staggered start time for this column
      const allRanges = findAvailableRanges(slots, ps, slotsNeeded);
      const ranges = staggerOffsetMin > 0
        ? rangesAfter(allRanges, slots, staggeredFillStart)
        : allRanges;
      if (ranges.length === 0) break;
      
      // Prefer morning for HP, afternoon for MP/ER
      const cat = categorize(selectedBlock);
      let targetRange = ranges[0];
      if (cat === 'HP') {
        const amRanges = morningRanges(ranges, slots, doc);
        targetRange = amRanges[0] || ranges[0];
      } else if (cat === 'MP' || cat === 'ER') {
        const pmRanges = afternoonRanges(ranges, slots, doc);
        targetRange = pmRanges[0] || ranges[0];
      }
      
      placeBlockInSlots(slots, targetRange, selectedBlock, doc, makeLabel(selectedBlock));
      filledProduction += selectedBlock.minimumAmount ?? 0;
    }
    // NOTE: intentionally leave ~15% of slots empty for click-to-add
}

function fillRemainingHygienistSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  hygienists: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number
): void {
  for (const hyg of hygienists) {
    const opSlotsList = getProviderOpSlots(psMap, hyg.id);
    for (const ps of opSlotsList) {
      fillHygOpSlots(slots, ps, hyg, blocksByCategory, timeIncrement);
    }
  }
}

function fillHygOpSlots(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  hyg: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number
): void {
    // Assisted hygiene mode: fill remaining gaps with assisted hyg blocks
    if (hyg.assistedHygiene) {
      const assistedHygBlock = getBlockForCategory('ASSISTED_HYG', blocksByCategory, hyg)
        || { id: FALLBACK_IDS.ASSISTED_HYG, ...DEFAULT_BLOCKS.ASSISTED_HYG as Omit<BlockTypeInput, 'id'> };
      const slotsNeeded = Math.ceil(assistedHygBlock.durationMin / timeIncrement);
      let safety = 0;
      while (safety < 20) {
        safety++;
        const ranges = findAvailableRanges(slots, ps, slotsNeeded);
        if (ranges.length === 0) break;
        placeBlockInSlots(slots, ranges[0], assistedHygBlock, hyg, 'Assisted Hyg');
      }
      return;
    }

    // Standard hygiene fill
    // Get all available block types for this hygienist
    const recareBlocks = getAllBlocksForCategory('RECARE', blocksByCategory, hyg);
    const pmBlocks = getAllBlocksForCategory('PM', blocksByCategory, hyg);
    const srpBlocks = getAllBlocksForCategory('SRP', blocksByCategory, hyg);
    const npBlocks = getAllBlocksForCategory('NP', blocksByCategory, hyg);
    
    // Distribution: Prophy/Recare (40%), Perio/PM (25%), New Patient (25%), SRP/Other (10%)
    const blockPool: { block: BlockTypeInput; weight: number }[] = [];
    recareBlocks.forEach(b => blockPool.push({ block: b, weight: 40 }));
    pmBlocks.forEach(b => blockPool.push({ block: b, weight: 25 }));
    npBlocks.forEach(b => blockPool.push({ block: b, weight: 25 }));
    srpBlocks.forEach(b => blockPool.push({ block: b, weight: 10 }));
    
    if (blockPool.length === 0) {
      // Fallback: if no blocks, just fill with recare
      const recareBlock = getBlockForCategory('RECARE', blocksByCategory, hyg);
      if (recareBlock) blockPool.push({ block: recareBlock, weight: 100 });
    }
    
    if (blockPool.length === 0) return;
    
    // Shuffle and distribute blocks
    let safety = 0;
    while (safety < 20) {
      safety++;
      
      // Pick a random block type based on weights
      const totalWeight = blockPool.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      let selectedBlock = blockPool[0].block;
      
      for (const item of blockPool) {
        random -= item.weight;
        if (random <= 0) {
          selectedBlock = item.block;
          break;
        }
      }
      
      const slotsNeeded = Math.ceil(selectedBlock.durationMin / timeIncrement);

      // Variety cap: prevent a single hygiene block type from filling >65% of the day (§7)
      if (wouldExceedVarietyCap(slots, ps, selectedBlock.id, slotsNeeded)) {
        continue;
      }

      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;
      
      placeBlockInSlots(slots, ranges[0], selectedBlock, hyg, makeLabel(selectedBlock));
    }
    // NOTE: intentionally leave ~15% of slots empty for click-to-add
}

// ---------------------------------------------------------------------------
// Doctor Matrixing — D/A codes and hygiene exam markers
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

function addDoctorMatrixing(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  doctors: ProviderInput[],
  hygienists: ProviderInput[],
  _timeIncrement: number
): void {
  if (doctors.length === 0 || hygienists.length === 0) return;

  // For each hygienist, find blocks mid-way through where doctor does exam
  for (const hyg of hygienists) {
    const opSlotsList = getProviderOpSlots(psMap, hyg.id);
    for (const ps of opSlotsList) {
    const hygSlots = ps.indices;

    // Find the start of each block in hygienist's schedule
    const blockStarts: number[] = [];
    for (let i = 0; i < hygSlots.length; i++) {
      const idx = hygSlots[i];
      const slot = slots[idx];
      if (slot.blockTypeId && !slot.isBreak) {
        if (i === 0 || slots[hygSlots[i - 1]].blockTypeId !== slot.blockTypeId || slots[hygSlots[i - 1]].isBreak) {
          blockStarts.push(i);
        }
      }
    }

    // For each block, ~60% through, mark a slot for doctor exam
    // EXCLUDE SRP blocks — those are standalone hygienist procedures without doctor exam
    for (const startPos of blockStarts) {
      const blockTypeId = slots[hygSlots[startPos]].blockTypeId;
      const blockLabel = slots[hygSlots[startPos]].blockLabel || '';
      
      // Skip SRP blocks — no doctor exam needed
      if (blockLabel.toUpperCase().includes('SRP') || blockLabel.toUpperCase().includes('PERIO SRP')) {
        continue;
      }

      let endPos = startPos;
      while (endPos < hygSlots.length && slots[hygSlots[endPos]].blockTypeId === blockTypeId) {
        endPos++;
      }
      const blockLen = endPos - startPos;
      if (blockLen < 3) continue; // Too short for matrixing

      const examPos = startPos + Math.floor(blockLen * 0.6);
      if (examPos < hygSlots.length) {
        slots[hygSlots[examPos]].staffingCode = 'D';
      }
    }
    } // end for opSlotsList
  }
}

// ---------------------------------------------------------------------------
// Production Summary
// ---------------------------------------------------------------------------

/** Parse the dollar amount from a block label like "HP>$1200" */
export function parseAmountFromLabel(label: string): number {
  const match = label.match(/>?\$(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function calculateAllProductionSummaries(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ProviderProductionSummary[] {
  return providers.map(provider => {
    // Include all slots for this provider (including multi-op slots)
    const providerSlots = slots.filter(s => s.providerId === provider.id && s.blockTypeId !== null && !s.isBreak);

    // Group consecutive slots by (blockTypeId, operatory) to identify distinct blocks
    const blocks: { blockTypeId: string; blockLabel: string; slotCount: number; operatory: string }[] = [];
    let currentKey: string | null = null;

    for (const slot of providerSlots) {
      const key = `${slot.blockTypeId}::${slot.operatory}`;
      if (key !== currentKey) {
        blocks.push({
          blockTypeId: slot.blockTypeId!,
          blockLabel: slot.blockLabel || '',
          slotCount: 1,
          operatory: slot.operatory,
        });
        currentKey = key;
      } else {
        blocks[blocks.length - 1].slotCount++;
      }
    }

    // Convert to scheduled block format — use block label amount as fallback
    const scheduledBlocks = blocks.map(block => {
      const blockType = blockTypes.find(bt => bt.id === block.blockTypeId);
      const amount = blockType != null
        ? (blockType.minimumAmount ?? 0)
        : parseAmountFromLabel(block.blockLabel);
      return {
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        amount,
        minimumAmount: blockType?.minimumAmount ?? 0,
      };
    });

    return calculateProductionSummary(provider, scheduledBlocks);
  });
}

// Re-export helpers for external use
export { findAvailableRanges, placeBlockInSlots, countSlotsByBlockType, countOccupiedSlots, wouldExceedVarietyCap };
