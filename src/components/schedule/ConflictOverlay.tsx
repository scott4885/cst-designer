"use client";

/**
 * ConflictOverlay
 * ───────────────
 * Extracted from ScheduleGrid. Owns the derivation of conflict lookups used
 * by the renderer to decorate cells:
 *
 *   - conflictMap — hard double-booking lookup keyed by "time:providerId"
 *   - dTimeConflictInstanceIds — Set of blockInstanceIds whose D-time window
 *     overlaps another block for the same real doctor (cross-column hands-on
 *     conflict)
 *
 * Today, conflicts render *inside* TimeSlotCell via props (red outlines,
 * warning triangles, D/A stripes). Those cell props are computed by the
 * renderer from the lookups this module produces. No DOM is rendered here.
 *
 * If a future iteration wants true absolutely-positioned overlays (provider
 * presence stripes spanning multiple rows, etc.), they can be added as a
 * default-exported component in this file and composed in ScheduleGrid.
 */

import { useMemo } from "react";
import type { BlockTypeInput } from "@/lib/engine/types";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";
import type { TimeSlotOutput } from "./TimeGridRenderer";

export interface ConflictLookups {
  /** Map of "time:providerId" → ConflictResult (hard double-booking) */
  conflictMap: Map<string, ConflictResult>;
  /** Set of blockInstanceIds whose D-time window overlaps another block. */
  dTimeConflictInstanceIds: Set<string>;
  /** Map of blockTypeId → BlockTypeInput (used for HP badges + D/A minutes). */
  blockTypeById: Map<string, BlockTypeInput>;
}

export function useConflictLookups(
  slots: TimeSlotOutput[],
  conflicts: ConflictResult[],
  dTimeConflicts: DTimeConflict[],
  blockTypes: BlockTypeInput[] | undefined
): ConflictLookups {
  // Build hard-conflict lookup: "time:providerId" → ConflictResult
  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictResult>();
    for (const c of conflicts) {
      map.set(`${c.time}:${c.providerId}`, c);
    }
    return map;
  }, [conflicts]);

  // Build blockType lookup by ID — used for HP thresholds + D/A minutes in
  // renderer AND for D-time conflict derivation below.
  const blockTypeById = useMemo(() => {
    const map = new Map<string, BlockTypeInput>();
    for (const bt of blockTypes ?? []) {
      map.set(bt.id, bt);
    }
    return map;
  }, [blockTypes]);

  // Derive the set of block instance IDs that have a D-time overlap with
  // another block for the same real doctor. This is the core cross-column
  // hands-on-time conflict detection.
  const dTimeConflictInstanceIds = useMemo(() => {
    if (dTimeConflicts.length === 0 || slots.length === 0) return new Set<string>();

    const instanceStartTimes = new Map<string, number>();
    const instanceByProvider = new Map<string, Map<string, number>>();

    for (const row of slots) {
      for (const slot of row.slots) {
        if (!slot.blockTypeId || !slot.blockInstanceId || slot.isBreak) continue;
        const realProviderId = slot.providerId.includes("::")
          ? slot.providerId.slice(0, slot.providerId.lastIndexOf("::"))
          : slot.providerId;

        const timeParts = row.time.match(/^(\d{1,2}):(\d{2})$/);
        const timeMin = timeParts
          ? parseInt(timeParts[1], 10) * 60 + parseInt(timeParts[2], 10)
          : -1;
        if (timeMin < 0) continue;

        const existing = instanceStartTimes.get(slot.blockInstanceId);
        if (existing === undefined || timeMin < existing) {
          instanceStartTimes.set(slot.blockInstanceId, timeMin);
        }

        const pMap = instanceByProvider.get(realProviderId) ?? new Map<string, number>();
        const pExisting = pMap.get(slot.blockInstanceId);
        if (pExisting === undefined || timeMin < pExisting) {
          pMap.set(slot.blockInstanceId, timeMin);
        }
        instanceByProvider.set(realProviderId, pMap);
      }
    }

    const conflictingIds = new Set<string>();

    for (const conflict of dTimeConflicts) {
      const conflictMin = (() => {
        const m = conflict.time.match(/^(\d{1,2}):(\d{2})$/);
        return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
      })();
      if (conflictMin < 0) continue;

      const pMap = instanceByProvider.get(conflict.providerId);
      if (!pMap) continue;

      for (const [instanceId, startMin] of pMap) {
        // Resolve the blockTypeId for this instance from slots
        let blockTypeId: string | undefined;
        outer: for (const row of slots) {
          for (const s of row.slots) {
            if (s.blockInstanceId === instanceId) {
              blockTypeId = s.blockTypeId ?? undefined;
              break outer;
            }
          }
        }
        if (!blockTypeId) continue;

        const bt = blockTypeById.get(blockTypeId);
        const dTimeMin = bt?.dTimeMin ?? 0;
        const dEndMin = startMin + (dTimeMin > 0 ? dTimeMin : bt?.durationMin ?? 30);

        if (conflictMin >= startMin && conflictMin < dEndMin) {
          conflictingIds.add(instanceId);
        }
      }
    }

    return conflictingIds;
  }, [dTimeConflicts, slots, blockTypeById]);

  return { conflictMap, dTimeConflictInstanceIds, blockTypeById };
}
