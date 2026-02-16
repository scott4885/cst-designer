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

type BlockCategory = 'HP' | 'NP' | 'SRP' | 'ER' | 'MP' | 'RECARE' | 'PM' | 'NON_PROD' | 'OTHER';

/** Identify the "category" of a block type by its label */
function categorize(bt: BlockTypeInput): BlockCategory {
  const lbl = bt.label.toUpperCase();
  // Order matters — more specific first
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

function blockAppliesToProvider(bt: BlockTypeInput, provider: ProviderInput): boolean {
  return bt.appliesToRole === 'BOTH' || bt.appliesToRole === provider.role;
}

// ---------------------------------------------------------------------------
// Slot-level helpers
// ---------------------------------------------------------------------------

interface ProviderSlots {
  provider: ProviderInput;
  /** Indices into the master slots array for this provider, in time order */
  indices: number[];
}

function buildProviderSlotMap(slots: TimeSlotOutput[], providers: ProviderInput[]): Map<string, ProviderSlots> {
  const map = new Map<string, ProviderSlots>();
  for (const p of providers) {
    map.set(p.id, { provider: p, indices: [] });
  }
  for (let i = 0; i < slots.length; i++) {
    const ps = map.get(slots[i].providerId);
    if (ps) ps.indices.push(i);
  }
  return map;
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
  for (const idx of range) {
    slots[idx].blockTypeId = blockType.id;
    slots[idx].blockLabel = labelOverride || blockType.label;
    slots[idx].staffingCode = getStaffingCode(provider.role);
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
  const def = DEFAULT_BLOCKS[category];
  if (def && (def.appliesToRole === 'BOTH' || def.appliesToRole === provider.role)) {
    return { id: `default-${category.toLowerCase()}`, ...def };
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
    return [{ id: `default-${category.toLowerCase()}`, ...def }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Time range helpers
// ---------------------------------------------------------------------------

function getLunchMidpoint(provider: ProviderInput): number {
  if (!provider.lunchStart || !provider.lunchEnd) {
    // Default: assume lunch at 13:00
    return 13 * 60;
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

  // ─── Step 1: Create empty time slots for every provider ───
  for (const provider of providers) {
    const timeSlots = generateTimeSlots(provider.workingStart, provider.workingEnd, timeIncrement);

    for (const time of timeSlots) {
      const operatory = provider.operatories[0] || 'OP1';
      const isLunch = isLunchTime(time, provider.lunchStart, provider.lunchEnd);

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

  // ─── Step 2: Place DOCTOR blocks (Rock-Sand-Water order) ───
  for (const doc of doctors) {
    placeDoctorBlocks(slots, psMap, doc, blocksByCategory, rules, timeIncrement, warnings);
  }

  // ─── Step 3: Place HYGIENIST blocks (SRP morning, PM, Recare filling) ───
  for (let i = 0; i < hygienists.length; i++) {
    placeHygienistBlocks(slots, psMap, hygienists[i], i, hygienists.length, blocksByCategory, rules, timeIncrement, warnings);
  }

  // ─── Step 4: Fill ANY remaining gaps ───
  fillRemainingDoctorSlots(slots, psMap, doctors, blocksByCategory, timeIncrement);
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
  psMap: Map<string, ProviderSlots>,
  doc: ProviderInput,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  const ps = psMap.get(doc.id)!;
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

  // 2a. NP CONSULT — First available morning slot
  if (npBlock && rules.npBlocksPerDay > 0 && (rules.npModel === 'DOCTOR_ONLY' || rules.npModel === 'EITHER')) {
    const slotsNeeded = Math.ceil(npBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // NP in first 2 hours of the day
    const startMin = toMinutes(doc.workingStart);
    const earlyRanges = rangesBefore(ranges, slots, startMin + 120);
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

  // 2b-e. HP BLOCKS — Fill morning with rocks (2-3 morning HP blocks)
  const morningHPTarget = 3;
  let morningHPPlaced = 0;

  for (let i = 0; i < morningHPTarget; i++) {
    const hp = hpBlocks[i % hpBlocks.length];
    if (!hp) break;

    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = morningRanges(ranges, slots, doc);

    if (amRanges.length > 0) {
      const amount = hp.minimumAmount || hpMinPerBlock;
      placeBlockInSlots(slots, amRanges[0], hp, doc, makeLabel(hp, amount));
      totalScheduled += amount;
      morningHPPlaced++;
    } else {
      break; // No more morning room
    }
  }

  // 2d. ER/ACCESS — Mid-morning (~10:00-10:30)
  if (erBlock && rules.emergencyHandling !== 'FLEX') {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Prefer 10:00-11:30 window
    const midMorningRanges = rangesInWindow(ranges, slots, 10 * 60, 11 * 60 + 30);
    const targetRange = midMorningRanges[0] || morningRanges(ranges, slots, doc)[0];

    if (targetRange) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, targetRange, erBlock, doc, makeLabel(erBlock, amount));
      totalScheduled += amount;
    }
  }

  // Fill remaining morning slots with more HP if available
  if (morningHPPlaced < 4 && hpBlocks.length > 0) {
    const hp = hpBlocks[0];
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = morningRanges(ranges, slots, doc);
    if (amRanges.length > 0) {
      const amount = hp.minimumAmount || hpMinPerBlock;
      placeBlockInSlots(slots, amRanges[0], hp, doc, makeLabel(hp, amount));
      totalScheduled += amount;
    }
  }

  // ──────── AFTERNOON: SAND & WATER ────────

  // 2f. HP BLOCK (afternoon) — 1 HP block right after lunch
  if (hpBlocks.length > 0) {
    const hp = hpBlocks[0];
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const amount = hp.minimumAmount || hpMinPerBlock;
      placeBlockInSlots(slots, pmRanges[0], hp, doc, makeLabel(hp, amount));
      totalScheduled += amount;
    }
  }

  // 2g. MP BLOCK — After afternoon HP
  if (mpBlock) {
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
  if (mpBlock) {
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

  // 2k. Production check — if total < 75% target, add more MP blocks
  let safety = 0;
  while (totalScheduled < targets.target75 && mpBlock && safety < 10) {
    safety++;
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    if (ranges.length === 0) break;

    const amount = mpBlock.minimumAmount || mpMinPerBlock;
    placeBlockInSlots(slots, ranges[0], mpBlock, doc, makeLabel(mpBlock, amount));
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
  psMap: Map<string, ProviderSlots>,
  hyg: ProviderInput,
  hygIndex: number,
  totalHygienists: number,
  blocksByCategory: Map<string, BlockTypeInput[]>,
  rules: ScheduleRules,
  timeIncrement: number,
  warnings: string[]
): void {
  const ps = psMap.get(hyg.id)!;

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

// ---------------------------------------------------------------------------
// Fill remaining gaps — ensure every slot has a block
// ---------------------------------------------------------------------------

function fillRemainingDoctorSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  doctors: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number
): void {
  for (const doc of doctors) {
    const ps = psMap.get(doc.id)!;
    
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
    
    // Shuffle and distribute blocks
    let safety = 0;
    while (safety < 30) {
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
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
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
    }

    // Fill any remaining small gaps with MP
    const mpBlock = mpBlocks[0];
    if (mpBlock) {
      for (const idx of ps.indices) {
        const slot = slots[idx];
        if (slot.blockTypeId === null && !slot.isBreak) {
          slots[idx].blockTypeId = mpBlock.id;
          slots[idx].blockLabel = makeLabel(mpBlock);
          slots[idx].staffingCode = getStaffingCode(doc.role);
        }
      }
    }
  }
}

function fillRemainingHygienistSlots(
  slots: TimeSlotOutput[],
  psMap: Map<string, ProviderSlots>,
  hygienists: ProviderInput[],
  blocksByCategory: Map<string, BlockTypeInput[]>,
  timeIncrement: number
): void {
  for (const hyg of hygienists) {
    const ps = psMap.get(hyg.id)!;
    
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
    while (safety < 30) {
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
      const ranges = findAvailableRanges(slots, ps, slotsNeeded);
      if (ranges.length === 0) break;
      
      placeBlockInSlots(slots, ranges[0], selectedBlock, hyg, makeLabel(selectedBlock));
    }

    // Fill any remaining small gaps with Prophy/Recare
    const recareBlock = recareBlocks[0] || getBlockForCategory('RECARE', blocksByCategory, hyg);
    if (recareBlock) {
      for (const idx of ps.indices) {
        const slot = slots[idx];
        if (slot.blockTypeId === null && !slot.isBreak) {
          slots[idx].blockTypeId = recareBlock.id;
          slots[idx].blockLabel = makeLabel(recareBlock);
          slots[idx].staffingCode = getStaffingCode(hyg.role);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Doctor Matrixing — D/A codes and hygiene exam markers
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
    const ps = psMap.get(hyg.id)!;
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
  }
}

// ---------------------------------------------------------------------------
// Production Summary
// ---------------------------------------------------------------------------

function calculateAllProductionSummaries(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[]
): ProviderProductionSummary[] {
  return providers.map(provider => {
    const providerSlots = slots.filter(s => s.providerId === provider.id && s.blockTypeId !== null && !s.isBreak);

    // Group consecutive slots by blockTypeId to identify distinct blocks
    const blocks: { blockTypeId: string; blockLabel: string; slotCount: number }[] = [];
    let currentBlockTypeId: string | null = null;

    for (const slot of providerSlots) {
      if (slot.blockTypeId !== currentBlockTypeId) {
        blocks.push({
          blockTypeId: slot.blockTypeId!,
          blockLabel: slot.blockLabel || '',
          slotCount: 1
        });
        currentBlockTypeId = slot.blockTypeId;
      } else {
        blocks[blocks.length - 1].slotCount++;
      }
    }

    // Convert to scheduled block format
    const scheduledBlocks = blocks.map(block => {
      const blockType = blockTypes.find(bt => bt.id === block.blockTypeId);
      return {
        blockTypeId: block.blockTypeId,
        blockLabel: block.blockLabel,
        amount: blockType?.minimumAmount || 0
      };
    });

    return calculateProductionSummary(provider, scheduledBlocks);
  });
}

// Re-export helpers for external use
export { findAvailableRanges, placeBlockInSlots };
