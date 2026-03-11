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
// Shared ctx recalibration — Sprint 6 §5.4
// ---------------------------------------------------------------------------

/**
 * Recompute a doctor's shared production ctx from the actual placed slots, using
 * the same consecutive-group merge logic as calculateAllProductionSummaries.
 *
 * This corrects for the fact that `recordProd` counts each block placement
 * individually ($1,200 per HP), while the production summary merges consecutive
 * same-type blocks into one group ($1,200 for the entire run). Without recalibration,
 * the ctx would over-count consecutive HP blocks and prematurely signal goal-met,
 * leaving later ops under-filled.
 *
 * Call this AFTER each operatory's `placeDoctorBlocks` so the next op starts with
 * an accurate ctx.
 */
function recomputeSharedCtxFromSlots(
  slots: TimeSlotOutput[],
  providerId: string,
  blockTypes: BlockTypeInput[],
  ctx: { target: number; produced: number }
): void {
  const btAmountMap = new Map<string, number>(
    blockTypes.map(bt => [bt.id, bt.minimumAmount ?? 0])
  );
  const providerSlots = slots.filter(
    s => s.providerId === providerId && s.blockTypeId !== null && !s.isBreak
  );
  let production = 0;
  let prevKey: string | null = null;
  for (const slot of providerSlots) {
    const key = `${slot.blockTypeId}::${slot.operatory}`;
    if (key !== prevKey) {
      production += btAmountMap.get(slot.blockTypeId!) ?? parseAmountFromLabel(slot.blockLabel ?? '');
      prevKey = key;
    }
  }
  ctx.produced = production;
}

// ---------------------------------------------------------------------------
// Main schedule generation — Rock-Sand-Water Algorithm
// ---------------------------------------------------------------------------

/**
 * Resolve the effective working hours for a provider on a specific day.
 * Returns null if the provider is disabled (off) for that day.
 * Falls back to general working hours if no per-day override exists.
 */
export function resolveProviderDayHours(
  provider: ProviderInput,
  dayOfWeek: string
): { workingStart: string; workingEnd: string; lunchStart?: string; lunchEnd?: string; lunchEnabled: boolean } | null {
  const dayEntry = provider.providerSchedule?.[dayOfWeek];
  if (dayEntry !== undefined) {
    if (dayEntry.enabled === false) return null; // provider is off this day
    return {
      workingStart: dayEntry.workingStart || provider.workingStart,
      workingEnd: dayEntry.workingEnd || provider.workingEnd,
      lunchStart: dayEntry.lunchStart ?? provider.lunchStart,
      lunchEnd: dayEntry.lunchEnd ?? provider.lunchEnd,
      lunchEnabled: !!(dayEntry.lunchStart && dayEntry.lunchEnd),
    };
  }
  // No per-day override — use general hours
  return {
    workingStart: provider.workingStart,
    workingEnd: provider.workingEnd,
    lunchStart: provider.lunchStart,
    lunchEnd: provider.lunchEnd,
    lunchEnabled: provider.lunchEnabled !== false,
  };
}

export function generateSchedule(input: GenerationInput & { activeWeek?: string }): GenerationResult {
  const { providers, blockTypes, rules, timeIncrement, dayOfWeek, activeWeek } = input;
  const warnings: string[] = [];
  const slots: TimeSlotOutput[] = [];
  /** Providers that are active for this day (not disabled by providerSchedule), with per-day hour overrides applied */
  const activeProviders: ProviderInput[] = [];

  // ─── Step 1: Create empty time slots for every provider × operatory ───
  for (const provider of providers) {
    // Resolve per-day hours (returns null if provider is disabled/off this day)
    const dayHours = resolveProviderDayHours(provider, dayOfWeek);
    if (dayHours === null) continue; // skip provider — off this day

    // If rotation is active and provider has per-day rotation weeks, skip if this week excluded
    if (activeWeek) {
      const dayEntry = provider.providerSchedule?.[dayOfWeek];
      if (dayEntry?.rotationWeeks && dayEntry.rotationWeeks.length > 0) {
        if (!dayEntry.rotationWeeks.includes(activeWeek)) continue; // provider off this week+day
      }
    }

    // Override provider hours for this day
    const effectiveProvider = dayHours.workingStart !== provider.workingStart || dayHours.workingEnd !== provider.workingEnd
      ? { ...provider, workingStart: dayHours.workingStart, workingEnd: dayHours.workingEnd, lunchStart: dayHours.lunchStart, lunchEnd: dayHours.lunchEnd, lunchEnabled: dayHours.lunchEnabled }
      : provider;

    const timeSlots = generateTimeSlots(effectiveProvider.workingStart, effectiveProvider.workingEnd, timeIncrement);
    // Multi-op: create a slot sequence for EACH operatory.
    // When doubleBooking is disabled, doctors only use their FIRST operatory (single-column schedule).
    let allOperatories = provider.operatories.length > 0 ? provider.operatories : ['OP1'];
    const operatories = (!rules.doubleBooking && provider.role === 'DOCTOR')
      ? [allOperatories[0]]
      : allOperatories;

    // When lunchEnabled is explicitly false, treat no slots as lunch breaks
    const lunchActive = effectiveProvider.lunchEnabled !== false;

    for (const operatory of operatories) {
      for (const time of timeSlots) {
        const isLunch = lunchActive
          ? isLunchTime(time, effectiveProvider.lunchStart, effectiveProvider.lunchEnd)
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
    // Track effective provider (with per-day hour overrides applied) for block placement
    activeProviders.push(effectiveProvider);
  }

  // Build map from active providers only (those not disabled for this day)
  const psMap = buildProviderSlotMap(slots, activeProviders);

  // Separate providers by role (only active ones)
  const doctors = activeProviders.filter(p => p.role === 'DOCTOR');
  const hygienists = activeProviders.filter(p => p.role === 'HYGIENIST');

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

  // Sprint 6: Shared production pool per doctor (multi-op).
  // Key: doctor id, Value: mutable ctx shared across all ops for that doctor.
  const sharedDoctorCtxMap = new Map<string, { target: number; produced: number }>();

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
      // Sprint 6 FIX: Shared production pool — one target for ALL ops combined.
      // Instead of dividing dailyGoal / numOps (Sprint 5 approach), we use a mutable
      // ctx object that tracks production across all ops. Each op fills until the
      // combined goal is met, rather than being constrained to a fraction of the goal.
      // Op 0 leads with HP (Rocks), Op 1 with MP, Op 2+ with NP/ER.
      const sharedTarget = calculateTarget75(doc.dailyGoal);
      const sharedProductionCtx = { target: sharedTarget, produced: 0 };
      sharedDoctorCtxMap.set(doc.id, sharedProductionCtx);
      for (let oi = 0; oi < opSlots.length; oi++) {
        const columnOffset = calculateStaggerOffset(di, oi, columnStaggerInterval);
        const totalStagger = baseStaggerMin + columnOffset;
        doctorColumnStagger.set(`${doc.id}::${opSlots[oi].operatory}`, totalStagger);
        placeDoctorBlocks(slots, opSlots[oi], doc, blocksByCategory, rules, timeIncrement, warnings, totalStagger, di, doctors.length, oi, sharedProductionCtx);
        // Recalibrate shared ctx after each op so the NEXT op's isGoalMet() check
        // uses summary-consistent merged-group production counts, not the raw
        // per-placement counts tracked by recordProd (which may overcount consecutive
        // same-type blocks by treating them as separate $1,200 blocks).
        recomputeSharedCtxFromSlots(slots, doc.id, blockTypes, sharedProductionCtx);
      }
    } else {
      // Single-column: place with base provider stagger only (no shared ctx needed)
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
  // Pass sharedDoctorCtxMap so fill respects the shared production pool for multi-op doctors.
  fillRemainingDoctorSlots(slots, psMap, doctors, blocksByCategory, timeIncrement, doctorColumnStagger, sharedDoctorCtxMap);
  fillRemainingHygienistSlots(slots, psMap, hygienists, blocksByCategory, timeIncrement);

  // ─── Step 5: Doctor matrixing — D/A codes ───
  if (rules.matrixing) {
    addDoctorMatrixing(slots, psMap, doctors, hygienists, timeIncrement);
  }

  // ─── Step 6: Calculate production summary ───
  const productionSummary = calculateAllProductionSummaries(slots, activeProviders, blockTypes);

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
  _totalDoctors: number = 1,
  opIndex: number = 0,
  sharedProductionCtx?: { target: number; produced: number }
): void {
  // Stagger: offset the "available from" start time for morning block placement.
  // This spreads doctors across the morning so they aren't competing for the same hygiene checks.
  const staggeredStartMin = toMinutes(doc.workingStart) + staggerOffsetMin;
  const targets = calculateProductionTargets(doc);

  // Sprint 6: shared-pool helpers.
  // isGoalMet() checks whether the shared target has been reached (or local total if no shared ctx).
  // recordProd() updates both the local counter and the shared ctx.
  const isGoalMet = () =>
    sharedProductionCtx
      ? sharedProductionCtx.produced >= sharedProductionCtx.target
      : totalScheduled >= targets.target75;
  const recordProd = (amount: number) => {
    totalScheduled += amount;
    if (sharedProductionCtx) sharedProductionCtx.produced += amount;
  };

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

  // 2a. NP CONSULT — First available morning slot (staggered by doctor index).
  // Always attempt for all ops (NP is lightweight and applies across op roles).
  if (npBlock && rules.npBlocksPerDay > 0 && (rules.npModel === 'DOCTOR_ONLY' || rules.npModel === 'EITHER') && !isGoalMet()) {
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
      recordProd(amount);
    } else if (ranges[0]) {
      const amount = npBlock.minimumAmount || npMin;
      placeBlockInSlots(slots, ranges[0], npBlock, doc, makeLabel(npBlock, amount));
      recordProd(amount);
    } else {
      warnings.push(`No room for NP block for ${doc.name}`);
    }
  }

  // 2b-e. HP BLOCKS — Fill morning with rocks.
  // Op 0: strong HP preference — up to 3 morning HP blocks (original behavior).
  // Op 1: limited HP — at most 1 morning HP block; rely on MP for the rest.
  // Op 2+: skip HP morning entirely — use ER/NP/MP for lighter-touch production.
  const morningHPMax = opIndex === 0 ? 3 : opIndex === 1 ? 1 : 0;
  let morningHPPlaced = 0;

  for (let i = 0; i < morningHPMax; i++) {
    if (isGoalMet()) break;

    const hp = hpBlocks[i % hpBlocks.length];
    if (!hp) break;

    const hpAmount = hp.minimumAmount || hpMinPerBlock;

    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Start from staggered offset to spread doctors across morning
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);

    const targetRange = amRanges[0] || fallbackAmRanges[0];

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, hpAmount));
      recordProd(hpAmount);
      morningHPPlaced++;
    } else {
      break; // No more morning room
    }
  }

  // 2b-alt. For Op 1+: place an MP block in the morning (fills the role that HP would have had on Op 0).
  if (opIndex >= 1 && mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = rangesAfter(morningRanges(ranges, slots, doc), slots, staggeredStartMin);
    const fallbackAmRanges = morningRanges(ranges, slots, doc);
    const targetRange = amRanges[0] || fallbackAmRanges[0];
    if (targetRange) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, targetRange, mpBlock, doc, makeLabel(mpBlock, amount));
      recordProd(amount);
    }
  }

  // 2d. ER/ACCESS — Mid-morning, offset by stagger to spread doctors
  if (erBlock && rules.emergencyHandling !== 'FLEX' && !isGoalMet()) {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    // Prefer 10:00-11:30 window, but shift forward by stagger offset
    const erWindowStart = Math.max(10 * 60 + staggerOffsetMin, staggeredStartMin);
    const midMorningRanges = rangesInWindow(ranges, slots, erWindowStart, 11 * 60 + 30 + staggerOffsetMin);
    const targetRange = midMorningRanges[0] || morningRanges(ranges, slots, doc)[0];

    if (targetRange) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, targetRange, erBlock, doc, makeLabel(erBlock, amount));
      recordProd(amount);
    }
  }

  // Fill remaining morning slots with more HP if available (Op 0 and Op 1 only).
  if (opIndex <= 1 && morningHPPlaced < 4 && hpBlocks.length > 0 && !isGoalMet()) {
    const hp = hpBlocks[0];
    const fillHpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const amRanges = morningRanges(ranges, slots, doc);
    if (amRanges.length > 0) {
      placeBlockInSlots(slots, amRanges[0], hp, doc, makeLabel(hp, fillHpAmount));
      recordProd(fillHpAmount);
    }
  }

  // ──────── AFTERNOON: SAND & WATER ────────

  // 2f. HP BLOCK (afternoon) — 1 HP block right after lunch.
  // Op 0 and Op 1: place HP in afternoon if goal not yet met.
  // Op 2+: skip HP afternoon — use lighter blocks to fill the remaining goal gap.
  if (opIndex <= 1 && hpBlocks.length > 0 && !isGoalMet()) {
    const hp = hpBlocks[0];
    const pmHpAmount = hp.minimumAmount || hpMinPerBlock;
    const slotsNeeded = Math.ceil(hp.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      // Stagger first afternoon HP: each additional doctor delays by stagger offset
      const pmStaggerStart = getLunchMidpoint(doc) + staggerOffsetMin;
      const staggeredPmRanges = rangesAfter(pmRanges, slots, pmStaggerStart);
      const targetRange = staggeredPmRanges[0] || pmRanges[0];
      placeBlockInSlots(slots, targetRange, hp, doc, makeLabel(hp, pmHpAmount));
      recordProd(pmHpAmount);
    }
  }

  // 2g. MP BLOCK — After afternoon HP
  if (mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, pmRanges[0], mpBlock, doc, makeLabel(mpBlock, amount));
      recordProd(amount);
    }
  }

  // 2h. NON-PROD — Late afternoon (crown seat, adjustment). Always place regardless of goal.
  if (nonProdBlock) {
    const slotsNeeded = Math.ceil(nonProdBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);
    // Prefer late afternoon (4 PM+), else latest available afternoon
    const lateRanges = rangesAfter(pmRanges, slots, 16 * 60);
    const targetRange = lastRange(lateRanges) || lastRange(pmRanges);

    if (targetRange) {
      placeBlockInSlots(slots, targetRange, nonProdBlock, doc, makeLabel(nonProdBlock));
      recordProd(nonProdBlock.minimumAmount || 0);
    }
  }

  // 2i. Second MP block — fill remaining afternoon gap
  if (mpBlock && !isGoalMet()) {
    const slotsNeeded = Math.ceil(mpBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const pmRanges = afternoonRanges(ranges, slots, doc);

    if (pmRanges.length > 0) {
      const amount = mpBlock.minimumAmount || mpMinPerBlock;
      placeBlockInSlots(slots, pmRanges[0], mpBlock, doc, makeLabel(mpBlock, amount));
      recordProd(amount);
    }
  }

  // 2j. Second ER block in early afternoon if ACCESS_BLOCKS mode
  if (erBlock && rules.emergencyHandling === 'ACCESS_BLOCKS' && !isGoalMet()) {
    const slotsNeeded = Math.ceil(erBlock.durationMin / timeIncrement);
    const ranges = findAvailableRanges(slots, ps, slotsNeeded);
    const earlyPM = rangesInWindow(ranges, slots, 14 * 60, 15 * 60 + 30);

    if (earlyPM.length > 0) {
      const amount = erBlock.minimumAmount || erMin;
      placeBlockInSlots(slots, earlyPM[0], erBlock, doc, makeLabel(erBlock, amount));
      recordProd(amount);
    }
  }

  // 2k. Goal-driven gap fill — work backwards from target to select best block type.
  // Block priority varies by opIndex:
  //   Op 0: HP → MP → ER  (Rocks dominate)
  //   Op 1: MP → HP → ER  (Sand/mid-tier fills)
  //   Op 2+: NP → ER → MP (Water/lighter fills)
  let safety = 0;
  while (!isGoalMet() && safety < 15) {
    safety++;
    const sharedGap = sharedProductionCtx
      ? sharedProductionCtx.target - sharedProductionCtx.produced
      : targets.target75 - totalScheduled;

    const candidateBlocks: { block: BlockTypeInput; priority: number }[] = [];

    if (opIndex === 0) {
      // Op 0: HP-heavy priority
      if (hpBlocks.length > 0 && sharedGap >= (hpBlocks[0].minimumAmount || 800)) {
        hpBlocks.forEach(b => candidateBlocks.push({ block: b, priority: 3 }));
      }
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 2 });
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 1 });
      }
    } else if (opIndex === 1) {
      // Op 1: MP → HP → ER
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 3 });
      }
      if (hpBlocks.length > 0 && sharedGap >= (hpBlocks[0].minimumAmount || 800)) {
        hpBlocks.forEach(b => candidateBlocks.push({ block: b, priority: 2 }));
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 1 });
      }
    } else {
      // Op 2+: NP → ER → MP (lighter fill)
      if (npBlock && sharedGap >= (npBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: npBlock, priority: 3 });
      }
      if (erBlock && sharedGap >= (erBlock.minimumAmount || 100)) {
        candidateBlocks.push({ block: erBlock, priority: 2 });
      }
      if (mpBlock && sharedGap >= (mpBlock.minimumAmount || 200)) {
        candidateBlocks.push({ block: mpBlock, priority: 1 });
      }
    }

    if (candidateBlocks.length === 0 && mpBlock) {
      candidateBlocks.push({ block: mpBlock, priority: 0 });
    }
    if (candidateBlocks.length === 0 && erBlock) {
      candidateBlocks.push({ block: erBlock, priority: 0 });
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
    recordProd(amount);
  }

  // Warn only for single-op or after all ops (skip per-op warnings for multi-op doctors).
  // For multi-op doctors the combined total is checked after all ops are processed.
  if (!sharedProductionCtx && totalScheduled < targets.target75) {
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
  columnStaggerMap?: Map<string, number>,
  sharedDoctorCtxMap?: Map<string, { target: number; produced: number }>
): void {
  for (const doc of doctors) {
    const opSlotsList = getProviderOpSlots(psMap, doc.id);
    // Sprint 6: For multi-op doctors, use the shared production ctx instead of per-op cap.
    // Single-op doctors have no shared ctx → no production cap in fill.
    const sharedCtx = sharedDoctorCtxMap?.get(doc.id);
    for (const ps of opSlotsList) {
      const staggerMin = columnStaggerMap?.get(`${doc.id}::${ps.operatory}`) ?? 0;
      fillDocOpSlots(slots, ps, doc, blocksByCategory, timeIncrement, staggerMin, undefined, sharedCtx);
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
  _productionCap?: number,
  sharedProductionCtx?: { target: number; produced: number }
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

    // Sprint 6: If shared ctx exists and goal is already met, skip fill entirely.
    if (sharedProductionCtx && sharedProductionCtx.produced >= sharedProductionCtx.target) return;

    // For staggered columns: the fill function must respect the stagger window.
    const staggeredFillStart = toMinutes(doc.workingStart) + staggerOffsetMin;
    
    // Shuffle and distribute blocks
    let safety = 0;
    while (safety < 20) {
      safety++;

      // Sprint 6: Stop filling if shared goal is met
      if (sharedProductionCtx && sharedProductionCtx.produced >= sharedProductionCtx.target) break;

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

      // Sprint 6: Skip block if it would push combined production too far over target
      if (sharedProductionCtx) {
        const blockAmount = selectedBlock.minimumAmount ?? 0;
        if (sharedProductionCtx.produced + blockAmount > sharedProductionCtx.target * 1.25) {
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
      if (sharedProductionCtx) sharedProductionCtx.produced += selectedBlock.minimumAmount ?? 0;
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
        operatory: block.operatory,
      };
    });

    const summary = calculateProductionSummary(provider, scheduledBlocks);

    // Sprint 6: Compute per-op production breakdown for multi-op providers.
    // Only include the breakdown when production actually spans multiple operatories.
    const opAmounts = new Map<string, number>();
    for (const sb of scheduledBlocks) {
      opAmounts.set(sb.operatory, (opAmounts.get(sb.operatory) ?? 0) + sb.amount);
    }
    const opBreakdown: { operatory: string; amount: number }[] | undefined =
      opAmounts.size > 1
        ? [...opAmounts.entries()].map(([operatory, amount]) => ({ operatory, amount }))
        : undefined;

    return opBreakdown ? { ...summary, opBreakdown } : summary;
  });
}

// Re-export helpers for external use
export { findAvailableRanges, placeBlockInSlots, countSlotsByBlockType, countOccupiedSlots, wouldExceedVarietyCap };
