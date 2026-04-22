/**
 * Sprint 3 — ProcedureOverride merge (PRD-V4 FR-6).
 *
 * Per-practice x-segment overrides shadow the base `BlockType.xSegment` at
 * generation time. The merge runs **once per generation call** (not per
 * block) to keep the hot path free of DB reads and avoid accidental
 * quadratic blowup on schedules with many blocks.
 *
 * Rules:
 *   - An override exists iff `(officeId, blockTypeId)` has a row.
 *   - Each of `asstPreMin / doctorMin / asstPostMin` is independent:
 *       null or undefined on the override  →  keep base value
 *       defined on the override            →  replace base value
 *   - Fields preserved from the base BlockType: `doctorContinuityRequired`,
 *     `examWindowMin`, `durationMin`, `procedureCategory`, etc.
 *   - `durationMin` is recomputed from the merged x-segment sums so the
 *     coordinator (which rounds by `durationMin / timeIncrement`) stays in
 *     sync. When no xSegment exists on the base, we leave `durationMin`
 *     alone rather than inventing one.
 *
 * @module procedure-overrides
 */

import type { BlockTypeInput } from './types';

export interface ProcedureOverrideRow {
  readonly officeId: string;
  readonly blockTypeId: string;
  readonly asstPreMin: number | null;
  readonly doctorMin: number | null;
  readonly asstPostMin: number | null;
}

/**
 * Merge a set of ProcedureOverride rows onto the block-type list. Pure,
 * deterministic, and allocation-light — returns a new array with new
 * objects only for the types that had an override.
 *
 * @param blockTypes - the base BlockType list loaded from the office
 * @param overrides  - the override rows for the same office (order irrelevant)
 */
export function mergeProcedureOverrides(
  blockTypes: readonly BlockTypeInput[],
  overrides: readonly ProcedureOverrideRow[],
): BlockTypeInput[] {
  if (overrides.length === 0) return blockTypes.slice();

  const byId = new Map<string, ProcedureOverrideRow>();
  for (const o of overrides) byId.set(o.blockTypeId, o);

  return blockTypes.map((bt) => {
    const ovr = byId.get(bt.id);
    if (!ovr) return bt;

    const baseAsstPre = bt.xSegment?.asstPreMin ?? 0;
    const baseDoctor = bt.xSegment?.doctorMin ?? 0;
    const baseAsstPost = bt.xSegment?.asstPostMin ?? 0;

    const asstPreMin = ovr.asstPreMin ?? baseAsstPre;
    const doctorMin = ovr.doctorMin ?? baseDoctor;
    const asstPostMin = ovr.asstPostMin ?? baseAsstPost;

    // No-op when every override field is null (empty row). Returning the
    // base row keeps structural sharing and simplifies test expectations.
    if (
      asstPreMin === baseAsstPre &&
      doctorMin === baseDoctor &&
      asstPostMin === baseAsstPost
    ) {
      return bt;
    }

    const mergedTotal = asstPreMin + doctorMin + asstPostMin;
    const mergedXSegment = {
      asstPreMin,
      doctorMin,
      asstPostMin,
      ...(bt.xSegment?.doctorContinuityRequired !== undefined && {
        doctorContinuityRequired: bt.xSegment.doctorContinuityRequired,
      }),
      ...(bt.xSegment?.examWindowMin !== undefined && {
        examWindowMin: bt.xSegment.examWindowMin,
      }),
    };

    return {
      ...bt,
      xSegment: mergedXSegment,
      // Only recompute `durationMin` when the base had a non-zero x-segment —
      // otherwise we'd be inventing a duration that didn't exist.
      ...(baseAsstPre + baseDoctor + baseAsstPost > 0 && {
        durationMin: mergedTotal,
      }),
    };
  });
}
