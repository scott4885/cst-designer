/**
 * Drag preview validity engine — Loop 10.
 *
 * Given a source block (time+provider) and a candidate drop target, compute
 * the validity tier:
 *   - 'valid'    — fits cleanly, drop is allowed (green paint)
 *   - 'warning'  — drop is allowed but produces a soft conflict (amber paint)
 *                  e.g. moving a doctor block onto the same doctor's other
 *                  operatory column at the same time (multi-op overlap).
 *   - 'conflict' — drop would overwrite an existing block, hit a break, or
 *                  fall outside the working window (red paint, drop blocked).
 *
 * The function is pure — given the same inputs it always returns the same
 * tier. Used by TimeSlotInteraction to paint per-cell feedback while the
 * user drags a block.
 *
 * @module engine/drag-preview
 */

import type { TimeSlotOutput } from "@/components/schedule/TimeGridRenderer";

export type DragValidity = "valid" | "warning" | "conflict";

export interface DragPreviewTarget {
  /** Time of the candidate drop cell (first slot of the would-be target range). */
  time: string;
  /** Provider/column receiving the drop. May be a virtual "id::OP" for multi-op. */
  providerId: string;
}

export interface DragPreviewSource {
  /** First-slot time of the block being dragged. */
  time: string;
  /** Provider/column the block originated from. */
  providerId: string;
  /** Unique block instance id (when available). */
  blockInstanceId: string | null;
  /** Block type id of the moving block. */
  blockTypeId: string;
}

export interface DragPreviewArgs {
  source: DragPreviewSource;
  target: DragPreviewTarget;
  timeSlots: TimeSlotOutput[];
  /** Number of slots the source block occupies. */
  sourceSlotCount: number;
}

export interface DragPreviewResult {
  /** Validity tier for the entire target range. */
  validity: DragValidity;
  /** List of "time:providerId" keys covered by the target range. */
  targetKeys: string[];
  /** Human-readable reason, used for tooltips / review panel. */
  reason: string | null;
}

/**
 * Helper — get all ordered slots for a given provider column from timeSlots.
 */
function getColumnSlots(
  timeSlots: TimeSlotOutput[],
  providerId: string
): { time: string; blockTypeId?: string; blockInstanceId?: string | null; isBreak?: boolean }[] {
  const out: { time: string; blockTypeId?: string; blockInstanceId?: string | null; isBreak?: boolean }[] = [];
  for (const row of timeSlots) {
    const s = row.slots.find((x) => x.providerId === providerId);
    if (!s) continue;
    out.push({
      time: row.time,
      blockTypeId: s.blockTypeId,
      blockInstanceId: s.blockInstanceId ?? null,
      isBreak: s.isBreak,
    });
  }
  return out;
}

/**
 * Parse "providerId" that may carry a multi-op suffix "realId::OP".
 */
function splitProviderId(id: string): { realId: string; op?: string } {
  const idx = id.lastIndexOf("::");
  if (idx === -1) return { realId: id };
  return { realId: id.slice(0, idx), op: id.slice(idx + 2) };
}

/**
 * Compute the validity of dropping `source` onto `target`.
 *
 * Rules, in order:
 *   1. Target provider column must exist in timeSlots → otherwise 'conflict'
 *   2. Target start time must exist on that column → otherwise 'conflict'
 *   3. The target range (sourceSlotCount consecutive cells starting at target)
 *      must fit within the column's working window → otherwise 'conflict'
 *   4. Every target cell must be either empty OR part of the source block
 *      itself (in-place move / overlap with own tail) — otherwise 'conflict'
 *   5. None of the target cells may be breaks — otherwise 'conflict'
 *   6. If the target column is the SAME REAL doctor (virtual id shares the
 *      realId with source but different operatory), and the target cells
 *      would overlap in time with source cells, emit 'warning' (soft
 *      multi-op conflict — the stagger resolver will have to re-sort later).
 *   7. Otherwise → 'valid'
 */
export function previewDrop(args: DragPreviewArgs): DragPreviewResult {
  const { source, target, timeSlots, sourceSlotCount } = args;

  const targetCol = getColumnSlots(timeSlots, target.providerId);
  if (targetCol.length === 0) {
    return { validity: "conflict", targetKeys: [], reason: "Target column not found" };
  }

  const startIdx = targetCol.findIndex((s) => s.time === target.time);
  if (startIdx === -1) {
    return { validity: "conflict", targetKeys: [], reason: "Target time not found" };
  }

  // Must fit within working window
  if (startIdx + sourceSlotCount > targetCol.length) {
    const tailKeys: string[] = [];
    for (let i = startIdx; i < targetCol.length; i++) {
      tailKeys.push(`${targetCol[i].time}:${target.providerId}`);
    }
    return {
      validity: "conflict",
      targetKeys: tailKeys,
      reason: "Would extend past working hours",
    };
  }

  const targetKeys: string[] = [];
  for (let k = 0; k < sourceSlotCount; k++) {
    targetKeys.push(`${targetCol[startIdx + k].time}:${target.providerId}`);
  }

  // Check occupancy and breaks
  const isSameRealColumn =
    splitProviderId(source.providerId).realId === splitProviderId(target.providerId).realId;
  for (let k = 0; k < sourceSlotCount; k++) {
    const cell = targetCol[startIdx + k];
    if (cell.isBreak) {
      return { validity: "conflict", targetKeys, reason: "Overlaps a break" };
    }
    if (cell.blockTypeId) {
      // Allow overlap ONLY when the occupying cell IS the source block.
      const isSourceCell = source.blockInstanceId
        ? cell.blockInstanceId === source.blockInstanceId && isSameRealColumn
        : isSameRealColumn && cell.blockTypeId === source.blockTypeId;
      if (!isSourceCell) {
        return { validity: "conflict", targetKeys, reason: "Would overwrite an existing block" };
      }
    }
  }

  // Multi-op doctor soft warning: same real provider, different virtual column,
  // target range overlaps in time with where the source block was — the
  // doctor would be hands-on in two ops simultaneously.
  const { realId: srcReal, op: srcOp } = splitProviderId(source.providerId);
  const { realId: tgtReal, op: tgtOp } = splitProviderId(target.providerId);
  if (srcReal === tgtReal && srcOp && tgtOp && srcOp !== tgtOp) {
    // Check whether any target time overlaps with existing blocks of this
    // same real doctor in a DIFFERENT virtual column.
    const otherColumns = new Set(
      timeSlots.flatMap((row) =>
        row.slots
          .filter((s) => {
            const { realId, op } = splitProviderId(s.providerId);
            return realId === tgtReal && op && op !== tgtOp;
          })
          .map((s) => s.providerId)
      )
    );
    // Collect the actual target-range times (not derived from the composite
    // targetKeys, since times themselves contain a colon — e.g. "10:00 AM" —
    // which breaks naive `.split(":")` parsing).
    const targetTimes: string[] = [];
    for (let k = 0; k < sourceSlotCount; k++) {
      targetTimes.push(targetCol[startIdx + k].time);
    }
    for (const otherCol of otherColumns) {
      const otherSlots = getColumnSlots(timeSlots, otherCol);
      for (let k = 0; k < sourceSlotCount; k++) {
        const t = targetTimes[k];
        const other = otherSlots.find((s) => s.time === t);
        if (!other || !other.blockTypeId || other.isBreak) continue;
        // Skip if that cell IS the source block itself.
        if (
          source.blockInstanceId &&
          other.blockInstanceId === source.blockInstanceId
        ) {
          continue;
        }
        return {
          validity: "warning",
          targetKeys,
          reason: "Same doctor in another operatory at this time — stagger may break",
        };
      }
    }
  }

  return { validity: "valid", targetKeys, reason: null };
}
