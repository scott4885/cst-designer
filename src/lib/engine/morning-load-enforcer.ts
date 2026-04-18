/**
 * Morning-Load Enforcer — ROADMAP Loop 4.
 *
 * Enforces the Burkhart-80/20 rule as a HARD post-fill constraint: 80% of
 * each doctor's restorative production should land before lunch. After the
 * Rock-Sand-Water pass + prescription fill have placed everything, we
 * compute the actual morning-load ratio per provider+operatory and, when
 * it's below target, swap the HIGHEST-value PM HP block with the
 * equal-duration LOWEST-value AM region (block, empty, or block+empty mix).
 * Loop until ≥ target or no more legal swaps exist.
 *
 * Design contract:
 *   - Pure post-pass — does not change mix prescription or placement
 *     policy. Just re-orders already-placed blocks.
 *   - Deterministic: stable tiebreaks on start-time + amount.
 *   - Respects hard constraints:
 *     * Moves blocks only within a single provider+operatory.
 *     * Moves across exactly equal slot spans (stagger-preserving).
 *     * Never crosses a lunch/break slot.
 *     * Never creates a new cross-column D-phase overlap (checked by
 *       upstream generator via D-phase avoid sets; we only relocate in
 *       the same op, so staggers stay intact).
 *   - Safety cap: 20 iterations per provider+operatory.
 *
 * @module engine/morning-load-enforcer
 */

import type { TimeSlotOutput, ProviderInput, BlockTypeInput } from './types';
import { categorize, type BlockCategory } from './block-categories';
import {
  toMinutes,
  getProviderOpSlots,
  buildProviderSlotMap,
  getLunchMidpoint,
  parseAmountFromLabel,
  type ProviderSlots,
} from './slot-helpers';

// ---------------------------------------------------------------------------
// Thresholds — documented in ROADMAP and quality-score.ts
// ---------------------------------------------------------------------------

/** Ratio below this triggers swaps. 0.75 = 5-point tolerance under target. */
export const MORNING_LOAD_SWAP_TRIGGER = 0.75;

/** Target ratio — stop swapping once we clear this. */
export const MORNING_LOAD_TARGET = 0.80;

/** Hard cap — ratios below this cap the quality tier at 'fair' (see quality-score.ts). */
export const MORNING_LOAD_HARD_CAP = 0.70;

/** Max swap iterations per provider+operatory — safety guard. */
const MAX_SWAPS_PER_OP = 20;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MorningLoadSwap {
  providerId: string;
  operatory: string;
  amBlockLabel: string;
  amBlockTime: string;
  pmBlockLabel: string;
  pmBlockTime: string;
  ratioBefore: number;
  ratioAfter: number;
}

export interface MorningLoadReport {
  /** Per-provider+operatory final morning ratio (after any swaps). */
  ratios: Record<string, number>;
  /** All swaps applied, in order. */
  swaps: MorningLoadSwap[];
  /** Providers whose ratio is still below HARD_CAP after enforcement. */
  hardCapViolators: string[];
}

// ---------------------------------------------------------------------------
// Internal grid model
// ---------------------------------------------------------------------------

/**
 * Cell = one placed block (possibly spanning multiple slots) OR one empty
 * slot OR one lunch slot. Cells are the atomic unit the swap algorithm
 * operates on.
 */
interface Cell {
  /** Position in ps.indices where this cell starts. */
  psStartPos: number;
  /** Number of slots in this cell. */
  length: number;
  /** Master indices covered by this cell. */
  masterIndices: number[];
  /** First slot time (minutes since midnight). */
  startMinutes: number;
  kind: 'block' | 'empty' | 'lunch';
  /** Only set when kind === 'block'. */
  blockTypeId?: string;
  blockLabel?: string;
  category?: BlockCategory;
  amount?: number;
}

/** Build the cell list for one ProviderSlots in time order. */
function buildCells(
  slots: TimeSlotOutput[],
  ps: ProviderSlots,
  blockTypes: BlockTypeInput[],
): Cell[] {
  const btById = new Map(blockTypes.map((bt) => [bt.id, bt]));
  const cells: Cell[] = [];
  const idxs = ps.indices;

  let i = 0;
  while (i < idxs.length) {
    const slot = slots[idxs[i]];
    const startMinutes = toMinutes(slot.time);
    const startPos = i;

    if (slot.isBreak) {
      // Walk lunch run.
      const masterIndices: number[] = [idxs[i]];
      i++;
      while (i < idxs.length && slots[idxs[i]].isBreak) {
        masterIndices.push(idxs[i]);
        i++;
      }
      cells.push({
        psStartPos: startPos,
        length: masterIndices.length,
        masterIndices,
        startMinutes,
        kind: 'lunch',
      });
      continue;
    }

    if (!slot.blockTypeId) {
      // Empty — single-slot cells (cheap, keeps swap math simple).
      cells.push({
        psStartPos: startPos,
        length: 1,
        masterIndices: [idxs[i]],
        startMinutes,
        kind: 'empty',
      });
      i++;
      continue;
    }

    // Block — walk same-instance run.
    const instanceId = slot.blockInstanceId ?? `${slot.time}-${slot.blockTypeId}`;
    const masterIndices: number[] = [idxs[i]];
    i++;
    while (i < idxs.length) {
      const next = slots[idxs[i]];
      if (next.isBreak || !next.blockTypeId) break;
      const nextInstanceId = next.blockInstanceId ?? `${next.time}-${next.blockTypeId}`;
      if (nextInstanceId !== instanceId) break;
      masterIndices.push(idxs[i]);
      i++;
    }

    const bt = btById.get(slot.blockTypeId);
    const amount =
      slot.customProductionAmount ??
      bt?.minimumAmount ??
      (slot.blockLabel ? parseAmountFromLabel(slot.blockLabel) : 0);

    cells.push({
      psStartPos: startPos,
      length: masterIndices.length,
      masterIndices,
      startMinutes,
      kind: 'block',
      blockTypeId: slot.blockTypeId,
      blockLabel: slot.blockLabel ?? bt?.label ?? '',
      category: categorize({
        id: slot.blockTypeId,
        label: slot.blockLabel ?? bt?.label ?? '',
      } as BlockTypeInput),
      amount: amount ?? 0,
    });
  }

  return cells;
}

function computeRatio(cells: Cell[], morningBoundaryMin: number): number {
  let am = 0;
  let total = 0;
  for (const c of cells) {
    if (c.kind !== 'block') continue;
    if (!c.amount || c.amount <= 0) continue;
    total += c.amount;
    if (c.startMinutes < morningBoundaryMin) am += c.amount;
  }
  if (total <= 0) return 0;
  return am / total;
}

// ---------------------------------------------------------------------------
// Swap search
// ---------------------------------------------------------------------------

/**
 * Finds a legal swap for one ProviderSlots. Returns:
 *   - pm: the PM HP cell to be relocated
 *   - amRangeStartCell: the first cell index (in cells[]) of the AM target region
 *   - amRangeEndCell: one past the last cell index of the AM target region
 *
 * The AM target region's total slot span must equal pm.length AND must
 * not cross a lunch cell AND must start in the morning (startMinutes <
 * boundary). The chosen region must have:
 *   - No HP blocks (we don't swap HP↔HP).
 *   - Not be entirely composed of empty slots beyond the PM HP's
 *     placement (placing the HP in morning empty slots is the cheapest
 *     possible move — we prefer that over displacing an AM block).
 */
interface SwapChoice {
  pmCellIdx: number;
  amRangeStartCellIdx: number;
  amRangeEndCellIdx: number; // exclusive
  amRangeMasterIndices: number[]; // length === pmCell.length
  displacedSegments: Array<{
    cellIdx: number;
    length: number;
    masterIndices: number[];
  }>;
  displacedAmValue: number; // sum of AM blocks being displaced (tie-break)
  displacedEmptyCount: number;
  amStartMinutes: number;
}

/**
 * Finds the best legal swap. Operates in two modes:
 *
 * HP-priority mode (first pass): Any PM HP block is considered for relocation
 * to AM — the ratio improves by at least (pmValue - displacedAmValue), and we
 * always want HP blocks in the AM.
 *
 * Value-gain mode (fallback): Any PM block whose value exceeds the AM range's
 * displaced value is a valid swap — it improves the morning ratio by the
 * net value gain. This handles the "PM has huge MP tail" case where there's
 * no PM HP to move but moving FILLING into AM empty slots lifts the ratio.
 *
 * Safety rule: we never move an AM HP block to PM (hpPreservation). Our AM
 * range can contain any mix of empty cells and non-HP blocks.
 */
/**
 * Find the chronologically-first block cell's start time. Used to preserve
 * stagger — the enforcer must not move a block into an AM range that starts
 * earlier than the op's current first-placed-block, or it would invalidate
 * multi-column stagger offsets measured against "first block of op".
 */
function firstBlockStartMinutes(cells: Cell[]): number {
  for (const c of cells) {
    if (c.kind === 'block') return c.startMinutes;
  }
  return Infinity;
}

function findBestSwap(
  cells: Cell[],
  morningBoundaryMin: number,
  minAmStartMinutes: number,
  rejectedKeys: Set<string> = new Set(),
): SwapChoice | null {
  // Collect all PM blocks that could be moved.
  const pmBlockIndices: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.kind === 'block' && c.startMinutes >= morningBoundaryMin) {
      // Skip NON_PROD (meetings/blocked time) — those don't count as production.
      if (c.category === 'NON_PROD') continue;
      // Skip tiny/zero-amount blocks — moving them won't help the ratio.
      if ((c.amount ?? 0) <= 0) continue;
      pmBlockIndices.push(i);
    }
  }
  if (pmBlockIndices.length === 0) return null;

  // Sort PM blocks highest-value first.
  pmBlockIndices.sort((a, b) => {
    const ca = cells[a];
    const cb = cells[b];
    const amt = (cb.amount ?? 0) - (ca.amount ?? 0);
    if (amt !== 0) return amt;
    // Prefer HP over non-HP on ties.
    const hpPri = (cb.category === 'HP' ? 1 : 0) - (ca.category === 'HP' ? 1 : 0);
    if (hpPri !== 0) return hpPri;
    return ca.startMinutes - cb.startMinutes;
  });

  // Enumerate every AM contiguous cell range of total span == pm.length.
  // Constraints:
  //   - First cell starts in AM (startMinutes < boundary).
  //   - No lunch cells inside.
  //   - No AM HP blocks inside (hpPreservation — don't demote AM HP).
  //   - Total span exactly matches pm.length.
  // Net ratio gain = (pm.amount - amValue). Must be > 0 for the swap to help.

  const candidates: Array<SwapChoice & { netGain: number; isHpMove: boolean }> = [];

  for (const pmIdx of pmBlockIndices) {
    const pmCell = cells[pmIdx];
    const targetLen = pmCell.length;
    const pmAmount = pmCell.amount ?? 0;
    const isHpMove = pmCell.category === 'HP';

    for (let start = 0; start < cells.length; start++) {
      const first = cells[start];
      if (first.startMinutes >= morningBoundaryMin) break; // past AM
      if (first.kind === 'lunch') break;
      // Stagger preservation: never move a block into an AM range that
      // starts before the op's current first-placed block. Doing so would
      // create a new "first block" earlier than stagger offset allows.
      if (first.startMinutes < minAmStartMinutes) continue;

      let span = 0;
      let end = start;
      let valid = true;
      let amValue = 0;
      let emptyCount = 0;
      const amRangeMasterIndices: number[] = [];
      const displacedSegments: SwapChoice['displacedSegments'] = [];

      while (end < cells.length && span < targetLen) {
        const c = cells[end];
        if (c.kind === 'lunch') {
          valid = false;
          break;
        }
        if (c.kind === 'block' && c.category === 'HP') {
          // Never displace an AM HP — HP preservation.
          valid = false;
          break;
        }
        // Pushing this cell must not overflow into PM.
        if (c.startMinutes >= morningBoundaryMin) {
          valid = false;
          break;
        }
        span += c.length;
        amRangeMasterIndices.push(...c.masterIndices);
        if (c.kind === 'empty') {
          emptyCount += c.length;
        } else {
          amValue += c.amount ?? 0;
          displacedSegments.push({
            cellIdx: end,
            length: c.length,
            masterIndices: [...c.masterIndices],
          });
        }
        end++;
      }

      if (!valid) continue;
      if (span !== targetLen) continue;

      // Only accept swaps with positive ratio gain. HP moves are accepted
      // even on flat ratio (isHpMove) because HP-in-AM is structurally
      // preferred under RSW — but we skip clear regressions.
      const netGain = pmAmount - amValue;
      if (isHpMove) {
        if (netGain < 0) continue; // never move HP for a loss
      } else {
        if (netGain <= 0) continue; // non-HP must strictly improve
      }

      // Skip candidates that were previously rejected by the cross-column
      // D-phase overlap guard in the caller loop.
      const rejectKey = `${pmIdx}::${start}::${end}`;
      if (rejectedKeys.has(rejectKey)) continue;

      candidates.push({
        pmCellIdx: pmIdx,
        amRangeStartCellIdx: start,
        amRangeEndCellIdx: end,
        amRangeMasterIndices,
        displacedSegments,
        displacedAmValue: amValue,
        displacedEmptyCount: emptyCount,
        amStartMinutes: first.startMinutes,
        netGain,
        isHpMove,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Ranking (highest priority first):
  //   1. HP moves beat non-HP moves (HP-in-AM is the Burkhart goal).
  //   2. Highest net ratio gain.
  //   3. Most empty slots displaced (cheapest swap — fewer slots vacated).
  //   4. Lowest displaced AM value (preserve the AM blocks that ARE productive).
  //   5. Earliest AM start time (stable tiebreak).
  candidates.sort((a, b) => {
    if (a.isHpMove !== b.isHpMove) return a.isHpMove ? -1 : 1;
    if (a.netGain !== b.netGain) return b.netGain - a.netGain;
    if (a.displacedEmptyCount !== b.displacedEmptyCount) {
      return b.displacedEmptyCount - a.displacedEmptyCount;
    }
    if (a.displacedAmValue !== b.displacedAmValue) {
      return a.displacedAmValue - b.displacedAmValue;
    }
    return a.amStartMinutes - b.amStartMinutes;
  });

  return candidates[0];
}

// ---------------------------------------------------------------------------
// Swap execution
// ---------------------------------------------------------------------------

interface SlotSnapshot {
  blockTypeId: string | null;
  blockLabel: string | null;
  staffingCode: 'D' | 'A' | 'H' | null;
  customProductionAmount: number | null | undefined;
  blockInstanceId: string | null | undefined;
  rationale: string | null | undefined;
}

function snapshotSlots(slots: TimeSlotOutput[], indices: number[]): SlotSnapshot[] {
  return indices.map((idx) => ({
    blockTypeId: slots[idx].blockTypeId,
    blockLabel: slots[idx].blockLabel,
    staffingCode: slots[idx].staffingCode,
    customProductionAmount: slots[idx].customProductionAmount,
    blockInstanceId: slots[idx].blockInstanceId,
    rationale: slots[idx].rationale,
  }));
}

function emptySnapshot(count: number): SlotSnapshot[] {
  return Array.from({ length: count }, () => ({
    blockTypeId: null,
    blockLabel: null,
    staffingCode: null,
    customProductionAmount: undefined,
    blockInstanceId: null,
    rationale: null,
  }));
}

function writeSlots(
  slots: TimeSlotOutput[],
  indices: number[],
  snapshot: SlotSnapshot[],
  overrideInstanceId?: string,
  rationaleOverride?: string | null,
): void {
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const s = snapshot[i];
    slots[idx].blockTypeId = s.blockTypeId;
    slots[idx].blockLabel = s.blockLabel;
    // Preserve original staffing code when clearing (empty cell).
    if (s.blockTypeId === null) {
      slots[idx].staffingCode = slots[idx].staffingCode; // keep existing
    } else {
      slots[idx].staffingCode = s.staffingCode;
    }
    slots[idx].customProductionAmount = s.customProductionAmount ?? null;
    slots[idx].blockInstanceId = overrideInstanceId ?? s.blockInstanceId ?? null;
    // Loop 5: rationale handling. When rationaleOverride is explicitly set,
    // stamp that (including null to clear). Otherwise preserve snapshot value.
    if (rationaleOverride !== undefined) {
      slots[idx].rationale = rationaleOverride;
    } else if (s.blockTypeId === null) {
      // Clearing a slot — clear rationale so empty cells aren't mislabeled.
      slots[idx].rationale = null;
    } else {
      slots[idx].rationale = s.rationale ?? null;
    }
  }
}

/**
 * Execute a swap: place PM HP into the AM range, relocate displaced AM
 * blocks into the PM HP's former slots, and fill any remaining PM slots
 * with empties.
 */
function executeSwap(
  slots: TimeSlotOutput[],
  cells: Cell[],
  choice: SwapChoice,
): void {
  const pmCell = cells[choice.pmCellIdx];

  // Snapshot PM HP content.
  const pmSnapshot = snapshotSlots(slots, pmCell.masterIndices);

  // Snapshot every displaced segment in order.
  const displacedSnapshots = choice.displacedSegments.map((seg) => ({
    seg,
    snap: snapshotSlots(slots, seg.masterIndices),
  }));

  // --- 1) Write PM HP metadata into AM range ---
  const firstAmIdx = choice.amRangeMasterIndices[0];
  const firstAmSlot = slots[firstAmIdx];
  const newHpInstanceId = `blk-ml-${firstAmSlot.providerId}-${firstAmSlot.operatory}-${firstAmSlot.time}-${pmCell.blockTypeId}`;

  // Expand pmSnapshot to cover entire AM range (pmCell.length === amRange length).
  // It already does (same slot count), so direct index write.
  // Loop 5: relabel the relocated block's rationale to reflect the auto-swap.
  writeSlots(slots, choice.amRangeMasterIndices, pmSnapshot, newHpInstanceId, 'morning rock — auto-swapped to AM');

  // --- 2) Write displaced AM segments into PM HP's old slot range ---
  // We place them back-to-back starting at the beginning of the PM range.
  // Any leftover PM slots become empty.
  let cursor = 0;
  for (const { seg, snap } of displacedSnapshots) {
    const pmTargetIndices = pmCell.masterIndices.slice(cursor, cursor + seg.length);
    const firstPmTarget = slots[pmTargetIndices[0]];
    const blockTypeIdForId = snap[0].blockTypeId ?? 'unknown';
    const newInstanceId = `blk-ml-${firstPmTarget.providerId}-${firstPmTarget.operatory}-${firstPmTarget.time}-${blockTypeIdForId}`;
    // Loop 5: the displaced AM block is now in the PM — mark it as auto-swapped.
    writeSlots(slots, pmTargetIndices, snap, newInstanceId, 'afternoon sand — auto-swapped from PM');
    cursor += seg.length;
  }

  // Remaining slots = empty (from amRangeEmptyCount).
  if (cursor < pmCell.masterIndices.length) {
    const remainingIndices = pmCell.masterIndices.slice(cursor);
    writeSlots(slots, remainingIndices, emptySnapshot(remainingIndices.length));
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function enforceMorningLoad(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
  opts: {
    swapTrigger?: number;
    target?: number;
    hardCap?: number;
  } = {},
): MorningLoadReport {
  const target = opts.target ?? MORNING_LOAD_TARGET;
  const hardCap = opts.hardCap ?? MORNING_LOAD_HARD_CAP;

  const psMap = buildProviderSlotMap(slots, providers);
  const report: MorningLoadReport = {
    ratios: {},
    swaps: [],
    hardCapViolators: [],
  };

  // Only enforce on doctors — HP placement is the restorative story.
  const doctors = providers.filter((p) => p.role === 'DOCTOR');

  for (const doc of doctors) {
    const opSlotsList = getProviderOpSlots(psMap, doc.id);
    if (opSlotsList.length === 0) continue;
    const morningBoundary = getLunchMidpoint(doc);

    for (const ps of opSlotsList) {
      const key = `${doc.id}::${ps.operatory}`;

      let iterations = 0;
      let cells = buildCells(slots, ps, blockTypes);
      let currentRatio = computeRatio(cells, morningBoundary);
      // Stagger preservation (only when provider has multiple ops): snapshot
      // the op's first-block start time before any swaps. Solo-op providers
      // (e.g., single-op specialists) have no stagger concern and can swap
      // into earlier empty slots freely.
      const minAmStart =
        opSlotsList.length > 1 ? firstBlockStartMinutes(cells) : -Infinity;

      // Track rejected swaps so we don't retry the same one each iteration.
      const rejectedKeys = new Set<string>();

      while (iterations < MAX_SWAPS_PER_OP && currentRatio < target) {
        const choice = findBestSwap(cells, morningBoundary, minAmStart, rejectedKeys);
        if (!choice) break;

        const pmCell = cells[choice.pmCellIdx];
        const amStartCell = cells[choice.amRangeStartCellIdx];

        // Safety snapshot — invariant guards below may roll this back.
        // Always snapshot (solo or multi op) so production invariant holds.
        const preSwapSnapshot = snapshotSlots(slots, ps.indices);

        // Cross-column D-phase overlap guard (multi-op doctors only).
        const isMultiOp = opSlotsList.length > 1;
        const overlapBefore = isMultiOp
          ? countDPhaseOverlapMinutes(slots, doc.id)
          : 0;
        const productionBefore = computeDoctorProduction(slots, doc.id, blockTypes);

        const ratioBefore = currentRatio;
        executeSwap(slots, cells, choice);
        iterations++;

        // Invariant 1: cross-column D-phase overlap must not grow.
        if (isMultiOp) {
          const overlapAfter = countDPhaseOverlapMinutes(slots, doc.id);
          if (overlapAfter > overlapBefore) {
            writeSlots(slots, ps.indices, preSwapSnapshot);
            cells = buildCells(slots, ps, blockTypes);
            currentRatio = computeRatio(cells, morningBoundary);
            rejectedKeys.add(
              `${choice.pmCellIdx}::${choice.amRangeStartCellIdx}::${choice.amRangeEndCellIdx}`,
            );
            continue;
          }
        }

        // Invariant 2: total doctor production must not change.
        // A swap is a relocation, never a net production delta. If a swap
        // inadvertently changes total production (e.g., consecutive-type
        // merging in production-calculator), roll back.
        const productionAfter = computeDoctorProduction(slots, doc.id, blockTypes);
        if (productionAfter !== productionBefore) {
          writeSlots(slots, ps.indices, preSwapSnapshot);
          cells = buildCells(slots, ps, blockTypes);
          currentRatio = computeRatio(cells, morningBoundary);
          rejectedKeys.add(
            `${choice.pmCellIdx}::${choice.amRangeStartCellIdx}::${choice.amRangeEndCellIdx}`,
          );
          continue;
        }

        // Rebuild cells + ratio after mutation.
        cells = buildCells(slots, ps, blockTypes);
        currentRatio = computeRatio(cells, morningBoundary);

        const amBlockLabel = choice.displacedSegments.length === 0
          ? '(empty AM range)'
          : choice.displacedSegments
              .map((seg) => slots[seg.masterIndices[0]].blockLabel ?? '')
              .join('+');

        report.swaps.push({
          providerId: doc.id,
          operatory: ps.operatory,
          amBlockLabel,
          amBlockTime: formatMinutes(amStartCell.startMinutes),
          pmBlockLabel: pmCell.blockLabel ?? '',
          pmBlockTime: formatMinutes(pmCell.startMinutes),
          ratioBefore: roundRatio(ratioBefore),
          ratioAfter: roundRatio(currentRatio),
        });

        // Guard against cycling — break if ratio didn't improve.
        if (currentRatio <= ratioBefore) break;
      }

      report.ratios[key] = roundRatio(currentRatio);
      if (currentRatio < hardCap) {
        report.hardCapViolators.push(key);
      }
    }
  }

  return report;
}

/**
 * Sum production $ for one doctor via the same grouping rule as
 * `calculateAllProductionSummaries`: consecutive slots with the same
 * (blockTypeId, operatory) count as ONE block. Used as a swap-safety
 * invariant — a swap may never change this total.
 */
function computeDoctorProduction(
  slots: TimeSlotOutput[],
  doctorId: string,
  blockTypes: BlockTypeInput[],
): number {
  const btAmount = new Map<string, number>(
    blockTypes.map((bt) => [bt.id, bt.minimumAmount ?? 0]),
  );
  const providerSlots = slots.filter(
    (s) => s.providerId === doctorId && s.blockTypeId !== null && !s.isBreak,
  );
  let production = 0;
  let prevKey: string | null = null;
  for (const slot of providerSlots) {
    const key = `${slot.blockTypeId}::${slot.operatory}`;
    if (key !== prevKey) {
      production +=
        slot.customProductionAmount ??
        btAmount.get(slot.blockTypeId!) ??
        parseAmountFromLabel(slot.blockLabel ?? '') ??
        0;
      prevKey = key;
    }
  }
  return production;
}

/**
 * Count minutes where a single doctor has D-phase staffing active in 2+
 * operatories at the same time. Used as a swap-safety guard: a swap that
 * *increases* this count relocates a block into a time-slice that newly
 * collides with another operatory's D-phase, which must be rejected.
 *
 * Matches the invariant in sprint6-shared-pool.test.ts.
 */
function countDPhaseOverlapMinutes(
  slots: TimeSlotOutput[],
  doctorId: string,
): number {
  const opsByTime = new Map<string, Set<string>>();
  for (const s of slots) {
    if (s.providerId !== doctorId) continue;
    if (s.staffingCode !== 'D') continue;
    if (s.isBreak || !s.blockTypeId) continue;
    const ops = opsByTime.get(s.time) ?? new Set<string>();
    ops.add(s.operatory);
    opsByTime.set(s.time, ops);
  }
  let overlap = 0;
  for (const ops of opsByTime.values()) {
    if (ops.size > 1) overlap++;
  }
  return overlap;
}

/** Round to 2 decimals. */
function roundRatio(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Whole-schedule ratio computation (exported for UI + quality-score use)
// ---------------------------------------------------------------------------

/**
 * Compute the schedule-wide restorative morning-load ratio — fraction of
 * doctor production placed before each doctor's individual lunch start.
 * Mirrors the formula used in golden.test.ts so UI + tests + scorer all
 * agree on the definition.
 */
export function computeScheduleMorningLoadRatio(
  slots: TimeSlotOutput[],
  providers: ProviderInput[],
  blockTypes: BlockTypeInput[],
): number {
  const doctorIds = new Set(providers.filter((p) => p.role === 'DOCTOR').map((p) => p.id));
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const btById = new Map(blockTypes.map((bt) => [bt.id, bt]));

  const seen = new Set<string>();
  let morning = 0;
  let total = 0;

  for (const slot of slots) {
    if (!doctorIds.has(slot.providerId)) continue;
    if (slot.isBreak || !slot.blockTypeId) continue;
    const key = `${slot.providerId}::${slot.operatory}::${slot.blockInstanceId ?? slot.time}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bt = btById.get(slot.blockTypeId);
    const amount =
      slot.customProductionAmount ??
      bt?.minimumAmount ??
      (slot.blockLabel ? parseAmountFromLabel(slot.blockLabel) : 0);
    if (!amount || amount <= 0) continue;

    const provider = providerById.get(slot.providerId);
    const boundary = provider?.lunchStart ?? '12:00';
    const isAm = toMinutes(slot.time) < toMinutes(boundary);

    total += amount;
    if (isAm) morning += amount;
  }

  if (total <= 0) return 0;
  return roundRatio(morning / total);
}
