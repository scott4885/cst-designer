/**
 * Sprint 3 — Slot ↔ PlacedBlock translator (engine-side).
 *
 * The legacy generator produces `TimeSlotOutput[]` keyed to a time-rail grid.
 * The Sprint 1 invariant model (Anti-Pattern Guard, MultiColumnCoordinator)
 * works on `PlacedBlock[]` + `DoctorScheduleTrace[]`. This module converts
 * between the two representations — used both by the generator to build a
 * guard report and by the V2 canvas adapter to render.
 *
 * Kept deterministic and allocation-minimal. No side effects on input.
 */

import type {
  BlockTypeInput,
  DoctorScheduleTrace,
  PlacedBlock,
  ProviderInput,
  TimeSlotOutput,
} from './types';

function parseDisplayMinutes(t: string): number {
  // Accepts "HH:MM" (24h) and "H:MM AM/PM" (12h).
  if (/am|pm/i.test(t)) {
    const [time, mer] = t.split(/\s+/);
    const [hStr, mStr] = time.split(':');
    let h = Number(hStr);
    const m = Number(mStr);
    if (/pm/i.test(mer) && h !== 12) h += 12;
    if (/am/i.test(mer) && h === 12) h = 0;
    return h * 60 + m;
  }
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

/**
 * Convert a slot stream to placed blocks. Groups sequential slots with the
 * same `blockInstanceId` (or synthesizes one when missing).
 */
export function slotsToPlacedBlocks(
  slots: TimeSlotOutput[],
  blockTypes: BlockTypeInput[],
  timeIncrement: number,
): PlacedBlock[] {
  if (slots.length === 0) return [];
  const btById = new Map<string, BlockTypeInput>();
  for (const bt of blockTypes) btById.set(bt.id, bt);

  const buckets = new Map<string, TimeSlotOutput[]>();
  let runningInstanceId: string | null = null;
  let runningProvider: string | null = null;
  let runningOperatory: string | null = null;
  let runningLabel: string | null = null;
  let runningBtDurationMin: number | null = null;
  let runningStartMinute: number | null = null;

  const reset = () => {
    runningInstanceId = null;
    runningProvider = null;
    runningOperatory = null;
    runningLabel = null;
    runningBtDurationMin = null;
    runningStartMinute = null;
  };

  for (const slot of slots) {
    if (slot.isBreak) {
      reset();
      continue;
    }
    if (!slot.blockLabel && !slot.staffingCode) {
      reset();
      continue;
    }
    const slotMin = parseDisplayMinutes(slot.time);
    const bt = slot.blockTypeId ? btById.get(slot.blockTypeId) : undefined;
    const btDurationMin = bt?.durationMin ?? null;

    let id = slot.blockInstanceId;
    // A "new block" starts when any of the following changes from the
    // running state:
    //   (a) providerId, operatory, or blockLabel changes (handles an
    //       adjacent block of a different type on the same column)
    //   (b) running accumulated length would EQUAL OR EXCEED the
    //       blockType's declared durationMin (handles the common case
    //       of the generator emitting N back-to-back instances of the
    //       SAME block type — e.g. eight consecutive 30-min MP blocks
    //       filling a 4-hour mid-day stretch. Without this check, all
    //       eight were merged into one 240-min phantom block with a
    //       single A-D-A x-segment at the front.)
    const wouldExceedDuration =
      runningBtDurationMin != null &&
      runningStartMinute != null &&
      slotMin - runningStartMinute >= runningBtDurationMin;

    const isBoundary =
      slot.providerId !== runningProvider ||
      slot.operatory !== runningOperatory ||
      (slot.blockLabel != null && slot.blockLabel !== runningLabel) ||
      wouldExceedDuration;

    if (!id) {
      if (isBoundary || runningInstanceId == null) {
        id = `syn:${slot.providerId}:${slot.operatory ?? ''}:${slot.time}`;
        runningInstanceId = id;
        runningStartMinute = slotMin;
        runningBtDurationMin = btDurationMin;
      } else {
        id = runningInstanceId;
      }
    } else {
      if (id !== runningInstanceId) {
        runningInstanceId = id;
        runningStartMinute = slotMin;
        runningBtDurationMin = btDurationMin;
      }
    }
    runningProvider = slot.providerId;
    runningOperatory = slot.operatory ?? null;
    if (slot.blockLabel != null) runningLabel = slot.blockLabel;
    const arr = buckets.get(id) ?? [];
    arr.push(slot);
    buckets.set(id, arr);
  }

  const blocks: PlacedBlock[] = [];
  for (const [instanceId, group] of buckets) {
    const sorted = [...group].sort(
      (a, b) => parseDisplayMinutes(a.time) - parseDisplayMinutes(b.time),
    );
    const startMinute = parseDisplayMinutes(sorted[0].time);
    const durationMin = sorted.length * timeIncrement;
    const bt = sorted[0].blockTypeId ? btById.get(sorted[0].blockTypeId) : undefined;
    const asstPreMin = bt?.xSegment?.asstPreMin ?? bt?.aTimeMin ?? 0;
    const doctorMin = bt?.xSegment?.doctorMin ?? bt?.dTimeMin ?? 0;
    const asstPostMin = bt?.xSegment?.asstPostMin ?? 0;
    const label = sorted[0].blockLabel ?? bt?.label ?? '';
    const productionAmount =
      sorted[0].customProductionAmount ?? bt?.minimumAmount ?? undefined;

    // Fallback decomposition when no xSegment is published on the BlockType —
    // use D-run length from staffingCode if present, else whole block is A.
    let pre = asstPreMin;
    let doc = doctorMin;
    let post = asstPostMin;
    if (pre + doc + post !== durationMin) {
      const dSlots = sorted.filter((s) => s.staffingCode === 'D').length;
      const firstD = sorted.findIndex((s) => s.staffingCode === 'D');
      if (dSlots > 0 && firstD >= 0) {
        pre = firstD * timeIncrement;
        doc = dSlots * timeIncrement;
        post = durationMin - pre - doc;
      } else {
        pre = durationMin;
        doc = 0;
        post = 0;
      }
    }

    blocks.push({
      blockInstanceId: instanceId,
      blockTypeId: sorted[0].blockTypeId ?? '',
      blockLabel: label,
      providerId: sorted[0].providerId,
      operatory: sorted[0].operatory ?? sorted[0].providerId,
      startMinute,
      durationMin,
      asstPreMin: pre,
      doctorMin: doc,
      asstPostMin: post,
      doctorStartMinute: doc > 0 ? startMinute + pre : undefined,
      doctorContinuityRequired:
        bt?.doctorContinuityRequired ?? bt?.xSegment?.doctorContinuityRequired ?? false,
      productionAmount: typeof productionAmount === 'number' ? productionAmount : undefined,
      rationale: sorted[0].rationale ?? null,
    });
  }
  return blocks.sort(
    (a, b) => a.operatory.localeCompare(b.operatory) || a.startMinute - b.startMinute,
  );
}

/**
 * Extract a DoctorScheduleTrace from a placed-block list. Only blocks with
 * `doctorMin > 0` contribute. Concurrency index is computed from overlap
 * count — pure read, no state.
 */
export function placedBlocksToDoctorTrace(
  blocks: PlacedBlock[],
  providers: ProviderInput[],
): DoctorScheduleTrace[] {
  const doctorIds = new Set(
    providers.filter((p) => p.role === 'DOCTOR').map((p) => p.id),
  );

  const traces = blocks
    .filter((b) => b.doctorMin > 0 && doctorIds.has(b.providerId))
    .map((b) => {
      const doctorStartMinute = b.doctorStartMinute ?? b.startMinute + b.asstPreMin;
      const doctorEndMinute = doctorStartMinute + b.doctorMin;
      return {
        doctorStartMinute,
        doctorEndMinute,
        doctorProviderId: b.providerId,
        operatory: b.operatory,
        blockInstanceId: b.blockInstanceId,
        continuityRequired: !!b.doctorContinuityRequired,
        concurrencyIndex: 0,
      };
    });

  // Compute concurrencyIndex: count of other traces whose D-window overlaps
  // this one's start minute.
  return traces.map((t, i) => {
    let count = 0;
    for (let j = 0; j < traces.length; j++) {
      if (i === j) continue;
      const o = traces[j];
      if (
        o.doctorProviderId === t.doctorProviderId &&
        o.doctorStartMinute < t.doctorEndMinute &&
        t.doctorStartMinute < o.doctorEndMinute
      ) {
        count++;
      }
    }
    return { ...t, concurrencyIndex: count };
  });
}
