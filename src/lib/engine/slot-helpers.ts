/**
 * Slot Manipulation Utilities
 *
 * Low-level helpers for working with TimeSlotOutput arrays:
 * time conversions, slot indexing, range finding, block placement,
 * and variety enforcement.
 *
 * @module slot-helpers
 */

import type { TimeSlotOutput, ProviderInput, BlockTypeInput, StaffingCode } from './types';
import { resolvePattern, derivePattern } from './pattern-catalog';
import type { MultiColumnCoordinator } from './multi-column-coordinator';

// ---------------------------------------------------------------------------
// Time conversion helpers
// ---------------------------------------------------------------------------

/** Convert "HH:MM" to minutes since midnight */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to "HH:MM" */
export function fromMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Provider slot indexing
// ---------------------------------------------------------------------------

/** Slot index group for a single provider+operatory pair */
export interface ProviderSlots {
  provider: ProviderInput;
  /** Indices into the master slots array for this provider+operatory, in time order */
  indices: number[];
  operatory: string;
}

/**
 * Build a map from "providerId::operatory" to ProviderSlots.
 * Each entry contains the indices into the master slots array for quick lookup.
 *
 * @param slots - The master slots array
 * @param providers - All providers to index
 * @returns Map keyed by "providerId::operatory"
 */
export function buildProviderSlotMap(slots: TimeSlotOutput[], providers: ProviderInput[]): Map<string, ProviderSlots> {
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

/**
 * Get all ProviderSlots entries for a given providerId (across all operatories).
 *
 * @param psMap - The provider slot map
 * @param providerId - The provider ID to look up
 * @returns Array of ProviderSlots for each operatory
 */
export function getProviderOpSlots(psMap: Map<string, ProviderSlots>, providerId: string): ProviderSlots[] {
  const result: ProviderSlots[] = [];
  for (const [key, ps] of psMap) {
    if (key.startsWith(`${providerId}::`)) {
      result.push(ps);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Range finding
// ---------------------------------------------------------------------------

/**
 * Find contiguous available slot ranges for a provider+operatory.
 * A "range" is an array of indices into the master slots array where
 * consecutive slots are empty (no block, not a break).
 *
 * @param slots - The master slots array
 * @param providerSlots - The ProviderSlots to search within
 * @param slotsNeeded - How many consecutive empty slots are needed
 * @returns Array of ranges (each range is an array of slot indices)
 */
export function findAvailableRanges(
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

// ---------------------------------------------------------------------------
// Staffing code helpers
// ---------------------------------------------------------------------------

/**
 * Get the default staffing code based on provider role.
 *
 * @param role - Provider role
 * @returns 'D' for Doctor, 'H' for Hygienist, 'A' for Other
 */
export function getStaffingCode(role: 'DOCTOR' | 'HYGIENIST' | 'OTHER'): StaffingCode {
  if (role === 'DOCTOR') return 'D';
  if (role === 'HYGIENIST') return 'H';
  return 'A';
}

// ---------------------------------------------------------------------------
// Block placement
// ---------------------------------------------------------------------------

/**
 * Resolve the staffing pattern for a block. Priority:
 *   1. blockType.pattern (explicit per-slot codes)
 *   2. PATTERN_CATALOG lookup via label/aliases
 *   3. derivePattern(role, length) — role-aware fallback
 *
 * Pattern length is stretched/trimmed to match the actual range length so
 * variable-length placements (dynamic HP expansion, Rock truncation, etc.)
 * never desync from the canonical A/D/H shape.
 */
function resolveBlockPattern(
  blockType: BlockTypeInput,
  provider: ProviderInput,
  len: number
): StaffingCode[] {
  let base: StaffingCode[] | null = null;

  if (blockType.pattern && blockType.pattern.length > 0) {
    base = blockType.pattern;
  } else {
    const catalog = resolvePattern(blockType.label);
    if (catalog) base = catalog.pattern;
  }

  if (!base) {
    return derivePattern(provider.role, len);
  }

  if (base.length === len) return base.slice();

  // Pattern length mismatch: proportionally sample the middle, then force
  // bookend slots to the canonical pattern's ends so A-A/A bookends and
  // trailing A's are always preserved. This handles variable-length
  // placements (dynamic HP expansion, Rock truncation) without regressing
  // to the old hardcoded A-at-ends behavior.
  const out: StaffingCode[] = [];
  for (let i = 0; i < len; i++) {
    const srcIdx = Math.min(base.length - 1, Math.floor((i / len) * base.length));
    out.push(base[srcIdx]);
  }

  // Hard-preserve bookends (first and last).
  out[0] = base[0];
  out[len - 1] = base[base.length - 1];

  // For patterns of length >= 4 where both ends are 2+ of the same code
  // (e.g. HP's A-A...A-A), preserve the second slot from each end too.
  if (len >= 4 && base.length >= 4) {
    if (base[0] === base[1]) out[1] = base[1];
    if (base[base.length - 1] === base[base.length - 2]) out[len - 2] = base[base.length - 2];
  }

  return out;
}

/**
 * Place a block type into the slots array at the given range of indices.
 * Applies the block's canonical staffing pattern (from BlockTypeInput.pattern,
 * PATTERN_CATALOG, or a role-derived fallback).
 *
 * @param slots - The master slots array (mutated in place)
 * @param range - Array of indices to fill
 * @param blockType - The block type to place
 * @param provider - The provider being scheduled
 * @param labelOverride - Optional label override (e.g., "HP>$1200")
 * @param rationale - Loop 5: optional one-line reason ("morning rock anchor", etc.) stamped on every slot
 */
export function placeBlockInSlots(
  slots: TimeSlotOutput[],
  range: number[],
  blockType: BlockTypeInput,
  provider: ProviderInput,
  labelOverride?: string,
  rationale?: string
): void {
  const len = range.length;
  const pattern = resolveBlockPattern(blockType, provider, len);

  for (let i = 0; i < len; i++) {
    const idx = range[i];
    slots[idx].blockTypeId = blockType.id;
    slots[idx].blockLabel = labelOverride || blockType.label;
    if (rationale !== undefined) {
      slots[idx].rationale = rationale;
    }
    slots[idx].staffingCode = pattern[i] ?? getStaffingCode(provider.role);
  }
}

// ---------------------------------------------------------------------------
// Production label helpers
// ---------------------------------------------------------------------------

/** Round a dollar amount to the nearest $25 for clean labels */
export function roundTo25(n: number): number {
  return Math.round(n / 25) * 25;
}

/** Build label like "HP>$1200" */
export function makeLabel(bt: BlockTypeInput, overrideAmount?: number): string {
  const amount = overrideAmount ?? bt.minimumAmount;
  if (amount && amount > 0) {
    return `${bt.label}>$${amount}`;
  }
  return bt.label;
}

/** Parse the dollar amount from a block label like "HP>$1200" */
export function parseAmountFromLabel(label: string): number {
  const match = label.match(/>?\$(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// ---------------------------------------------------------------------------
// Time range filtering
// ---------------------------------------------------------------------------

/**
 * Get the lunch midpoint for a provider (used to divide morning/afternoon).
 * Falls back to noon if lunch is disabled.
 */
export function getLunchMidpoint(provider: ProviderInput): number {
  if (provider.lunchEnabled === false || !provider.lunchStart || !provider.lunchEnd) {
    return 12 * 60;
  }
  return toMinutes(provider.lunchStart);
}

/** Check if a slot index is in the morning (before lunch) */
export function isMorningSlot(slots: TimeSlotOutput[], idx: number, provider: ProviderInput): boolean {
  return toMinutes(slots[idx].time) < getLunchMidpoint(provider);
}

/** Check if a slot index is in the afternoon (at or after lunch) */
export function isAfternoonSlot(slots: TimeSlotOutput[], idx: number, provider: ProviderInput): boolean {
  return toMinutes(slots[idx].time) >= getLunchMidpoint(provider);
}

/** Filter ranges to only those starting in the morning (before lunch) */
export function morningRanges(ranges: number[][], slots: TimeSlotOutput[], provider: ProviderInput): number[][] {
  return ranges.filter(r => isMorningSlot(slots, r[0], provider));
}

/** Filter ranges to only those starting in the afternoon (after lunch) */
export function afternoonRanges(ranges: number[][], slots: TimeSlotOutput[], provider: ProviderInput): number[][] {
  return ranges.filter(r => isAfternoonSlot(slots, r[0], provider));
}

/** Filter ranges to those starting before a certain time (in minutes) */
export function rangesBefore(ranges: number[][], slots: TimeSlotOutput[], beforeMinutes: number): number[][] {
  return ranges.filter(r => toMinutes(slots[r[0]].time) < beforeMinutes);
}

/** Filter ranges to those starting at or after a certain time (in minutes) */
export function rangesAfter(ranges: number[][], slots: TimeSlotOutput[], afterMinutes: number): number[][] {
  return ranges.filter(r => toMinutes(slots[r[0]].time) >= afterMinutes);
}

/** Filter ranges to those starting in a time window [fromMin, toMin) */
export function rangesInWindow(ranges: number[][], slots: TimeSlotOutput[], fromMin: number, toMin: number): number[][] {
  return ranges.filter(r => {
    const t = toMinutes(slots[r[0]].time);
    return t >= fromMin && t < toMin;
  });
}

/** Get the last range from an array */
export function lastRange(ranges: number[][]): number[] | undefined {
  return ranges.length > 0 ? ranges[ranges.length - 1] : undefined;
}

// ---------------------------------------------------------------------------
// A-D Phase Coordination (cross-column zigzag)
// ---------------------------------------------------------------------------

/**
 * Collect minutes-since-midnight where the provider is currently in D-phase
 * (doctor hands-on) in this ProviderSlots. A slot is D-phase when its
 * staffingCode is 'D' and it has a block assigned.
 *
 * Used by the cross-column zigzag logic: after placing a doctor's primary
 * operatory, we pass this set to secondary-op placement so that secondary
 * blocks prefer ranges whose D-phase minutes don't overlap.
 */
export function getDPhaseMinutes(
  slots: TimeSlotOutput[],
  ps: ProviderSlots
): Set<number> {
  const result = new Set<number>();
  for (const idx of ps.indices) {
    const s = slots[idx];
    if (!s.isBreak && s.blockTypeId && s.staffingCode === 'D') {
      result.add(toMinutes(s.time));
    }
  }
  return result;
}

/**
 * Predict which minutes of a candidate range would be D-phase if a doctor
 * block were placed there.
 *
 * When `blockType` and `provider` are provided, uses the block's canonical
 * staffing pattern (real-template-derived). Otherwise falls back to a
 * general heuristic (first/last A, middle D for len >= 3; all D for <3)
 * — preserved for backwards compatibility and for placement-phase callers
 * that haven't chosen a block yet.
 */
export function predictRangeDMinutes(
  slots: TimeSlotOutput[],
  range: number[],
  blockType?: BlockTypeInput,
  provider?: ProviderInput
): number[] {
  const len = range.length;
  const result: number[] = [];

  if (blockType && provider) {
    const pattern = resolveBlockPattern(blockType, provider, len);
    for (let i = 0; i < len; i++) {
      if (pattern[i] === 'D') result.push(toMinutes(slots[range[i]].time));
    }
    return result;
  }

  for (let i = 0; i < len; i++) {
    const isDPhase = len >= 3 ? i > 0 && i < len - 1 : true;
    if (isDPhase) result.push(toMinutes(slots[range[i]].time));
  }
  return result;
}

/**
 * Filter/rank candidate ranges to avoid cross-column D-phase overlap.
 *
 * The A-D zigzag methodology allows AT MOST 1 slot of D-overlap between
 * columns. This helper:
 *   1. Returns ranges whose predicted D-minutes have 0 overlap with `avoid`
 *      first (preferred).
 *   2. Falls back to ranges with exactly 1 slot of overlap if no clean
 *      candidates exist.
 *   3. Returns the original list if even that fails (caller can still place).
 *
 * @param ranges - Candidate ranges
 * @param slots - Master slots array
 * @param avoid - Set of minutes (from other op's D-phase) to avoid
 */
export function rangesAvoidingDMinutes(
  ranges: number[][],
  slots: TimeSlotOutput[],
  avoid: Set<number> | undefined,
  blockType?: BlockTypeInput,
  provider?: ProviderInput,
  /**
   * Sprint 3 — when a MultiColumnCoordinator is provided, fold its current
   * D-reservations into the `avoid` set before scoring. This makes the
   * coordinator the source-of-truth for doctor-bottleneck collisions (per
   * Bible §4) while keeping the legacy function signature and deterministic
   * tie-break ordering (originalIdx ASC) intact.
   */
  coordinator?: MultiColumnCoordinator,
): number[][] {
  // Fold coordinator reservations into the avoid set (deterministic — reservations
  // are appended in insertion order and iterated in that same order here).
  let effectiveAvoid: Set<number> | undefined = avoid;
  if (coordinator) {
    const trace = coordinator.trace();
    if (trace.length > 0) {
      effectiveAvoid = new Set(avoid ?? []);
      for (const r of trace) {
        for (let m = r.doctorStartMinute; m < r.doctorEndMinute; m++) {
          effectiveAvoid.add(m);
        }
      }
    }
  }

  if (!effectiveAvoid || effectiveAvoid.size === 0 || ranges.length === 0) return ranges;
  const avoidLocal = effectiveAvoid;

  const scored = ranges.map((r, i) => {
    const dMins = predictRangeDMinutes(slots, r, blockType, provider);
    let overlap = 0;
    for (const m of dMins) if (avoidLocal.has(m)) overlap++;
    return { range: r, overlap, originalIdx: i };
  });

  // Prefer zero-overlap ranges. Fall back to ≤1-overlap. If neither exists,
  // return ranges sorted by (overlap ASC, originalIdx ASC) so the caller still
  // picks the LEAST-conflicting option rather than ranges[0].
  const zero = scored.filter(s => s.overlap === 0).map(s => s.range);
  if (zero.length > 0) return zero;

  const oneOrLess = scored.filter(s => s.overlap <= 1).map(s => s.range);
  if (oneOrLess.length > 0) return oneOrLess;

  const sorted = [...scored].sort(
    (a, b) => a.overlap - b.overlap || a.originalIdx - b.originalIdx
  );
  return sorted.map(s => s.range);
}

// ---------------------------------------------------------------------------
// Variety enforcement
// ---------------------------------------------------------------------------

/**
 * Maximum fraction of a provider's filled slots that may be occupied by a single block type.
 * Enforces the "no single appointment type fills the entire day" variety requirement.
 */
export const MAX_SAME_TYPE_FRACTION = 0.65;

/**
 * Count occupied slots (non-break, has blockTypeId) per blockTypeId for a ProviderSlots.
 */
export function countSlotsByBlockType(slots: TimeSlotOutput[], ps: ProviderSlots): Map<string, number> {
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
export function countOccupiedSlots(slots: TimeSlotOutput[], ps: ProviderSlots): number {
  return ps.indices.filter(idx => !slots[idx].isBreak && slots[idx].blockTypeId).length;
}

/**
 * Check if placing `slotsNeeded` more slots of `blockTypeId` would exceed
 * MAX_SAME_TYPE_FRACTION of the total available (non-break) time.
 *
 * @param slots - The master slots array
 * @param ps - Provider+operatory slot group
 * @param blockTypeId - The block type being considered
 * @param slotsNeeded - Number of additional slots to place
 * @returns true if placing would violate the cap (block should be skipped)
 */
export function wouldExceedVarietyCap(
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
