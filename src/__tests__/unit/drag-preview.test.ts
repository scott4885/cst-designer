/**
 * Loop 10 — Drag-preview validity engine tests.
 *
 * Covers every code path in previewDrop():
 *   • 'valid'    — clean move to empty target within the working window
 *   • 'warning'  — multi-op doctor soft overlap across virtual columns
 *   • 'conflict' — missing column / missing time / out-of-window /
 *                  overlap with another block / hits a break
 *
 * The function is pure — same inputs → same output — so these tests do not
 * touch the DOM or the Zustand store.
 */

import { describe, it, expect } from "vitest";
import { previewDrop } from "@/lib/engine/drag-preview";
import type { TimeSlotOutput } from "@/components/schedule/TimeGridRenderer";

// ─── Fixture builder ────────────────────────────────────────────────────
/**
 * Build a minimal timeSlots array spanning [8:00, 12:00) at 30-min increments
 * with two provider columns. Optional block placements may be supplied as
 * `{ time, providerId, blockTypeId, blockInstanceId }` triples.
 */
interface Placement {
  time: string;
  providerId: string;
  blockTypeId?: string;
  blockInstanceId?: string | null;
  isBreak?: boolean;
}

function buildSlots(
  times: string[],
  providerIds: string[],
  placements: Placement[] = [],
): TimeSlotOutput[] {
  const rows: TimeSlotOutput[] = times.map((t) => ({
    time: t,
    slots: providerIds.map((pid) => ({ providerId: pid })),
  }));
  for (const p of placements) {
    const row = rows.find((r) => r.time === p.time);
    if (!row) continue;
    const slot = row.slots.find((s) => s.providerId === p.providerId);
    if (!slot) continue;
    if (p.isBreak) slot.isBreak = true;
    if (p.blockTypeId) slot.blockTypeId = p.blockTypeId;
    if (p.blockInstanceId !== undefined) slot.blockInstanceId = p.blockInstanceId;
  }
  return rows;
}

const TIMES = ["8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM"];

describe("previewDrop — validity engine", () => {
  it("returns 'valid' for a clean move into empty cells", () => {
    const slots = buildSlots(TIMES, ["docA", "docB"], [
      { time: "8:00 AM", providerId: "docA", blockTypeId: "bt-crown", blockInstanceId: "inst-1" },
      { time: "8:30 AM", providerId: "docA", blockTypeId: "bt-crown", blockInstanceId: "inst-1" },
    ]);

    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "inst-1",
        blockTypeId: "bt-crown",
      },
      target: { time: "9:00 AM", providerId: "docB" },
      timeSlots: slots,
      sourceSlotCount: 2,
    });

    expect(result.validity).toBe("valid");
    expect(result.targetKeys).toEqual(["9:00 AM:docB", "9:30 AM:docB"]);
    expect(result.reason).toBeNull();
  });

  it("returns 'conflict' when the target time doesn't exist on the column", () => {
    const slots = buildSlots(TIMES, ["docA"]);
    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "inst-1",
        blockTypeId: "bt-crown",
      },
      target: { time: "7:00 AM", providerId: "docA" }, // not in fixture
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("conflict");
    expect(result.reason).toBe("Target time not found");
  });

  it("returns 'conflict' when the target column doesn't exist", () => {
    const slots = buildSlots(TIMES, ["docA"]);
    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "inst-1",
        blockTypeId: "bt-crown",
      },
      target: { time: "8:00 AM", providerId: "ghostProvider" },
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("conflict");
    expect(result.reason).toBe("Target column not found");
  });

  it("returns 'conflict' when the block would extend past the working window", () => {
    const slots = buildSlots(TIMES, ["docA"]);
    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "inst-1",
        blockTypeId: "bt-crown",
      },
      target: { time: "10:30 AM", providerId: "docA" }, // last cell, block len 2
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("conflict");
    expect(result.reason).toBe("Would extend past working hours");
  });

  it("returns 'conflict' when dropping on top of another block", () => {
    const slots = buildSlots(TIMES, ["docA", "docB"], [
      { time: "8:00 AM", providerId: "docA", blockTypeId: "bt-crown", blockInstanceId: "src" },
      { time: "9:00 AM", providerId: "docB", blockTypeId: "bt-other", blockInstanceId: "blocker" },
    ]);
    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "src",
        blockTypeId: "bt-crown",
      },
      target: { time: "9:00 AM", providerId: "docB" },
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("conflict");
    expect(result.reason).toBe("Would overwrite an existing block");
  });

  it("returns 'conflict' when target range hits a break", () => {
    const slots = buildSlots(TIMES, ["docA"], [
      { time: "8:30 AM", providerId: "docA", isBreak: true },
    ]);
    const result = previewDrop({
      source: {
        time: "9:00 AM",
        providerId: "docA",
        blockInstanceId: "src",
        blockTypeId: "bt-crown",
      },
      target: { time: "8:00 AM", providerId: "docA" },
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("conflict");
    expect(result.reason).toBe("Overlaps a break");
  });

  it("allows in-place overlap with the source block (moving backward by one slot)", () => {
    const slots = buildSlots(TIMES, ["docA"], [
      { time: "8:30 AM", providerId: "docA", blockTypeId: "bt-crown", blockInstanceId: "src" },
      { time: "9:00 AM", providerId: "docA", blockTypeId: "bt-crown", blockInstanceId: "src" },
    ]);
    // Move source block up by 30min — target range is [8:00, 8:30] and the
    // 8:30 cell is the source itself so this should NOT count as an overwrite.
    const result = previewDrop({
      source: {
        time: "8:30 AM",
        providerId: "docA",
        blockInstanceId: "src",
        blockTypeId: "bt-crown",
      },
      target: { time: "8:00 AM", providerId: "docA" },
      timeSlots: slots,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("valid");
  });

  it("returns 'warning' for multi-op doctor soft overlap (same real doctor, different op)", () => {
    // Three virtual columns for the same real doctor ("doc::OP1/OP2/OP3").
    // Move source from OP1 → OP2 at 10:00. OP2 is empty at 10:00 but OP3 has
    // a DIFFERENT block for the same real doctor at 10:00 → stagger-risk
    // warning.
    const slots2 = buildSlots(TIMES, ["doc::OP1", "doc::OP2", "doc::OP3"], [
      { time: "10:00 AM", providerId: "doc::OP1", blockTypeId: "bt-crown", blockInstanceId: "src" },
      { time: "10:30 AM", providerId: "doc::OP1", blockTypeId: "bt-crown", blockInstanceId: "src" },
      { time: "10:00 AM", providerId: "doc::OP3", blockTypeId: "bt-filling", blockInstanceId: "other" },
      { time: "10:30 AM", providerId: "doc::OP3", blockTypeId: "bt-filling", blockInstanceId: "other" },
    ]);
    const result = previewDrop({
      source: {
        time: "10:00 AM",
        providerId: "doc::OP1",
        blockInstanceId: "src",
        blockTypeId: "bt-crown",
      },
      target: { time: "10:00 AM", providerId: "doc::OP2" },
      timeSlots: slots2,
      sourceSlotCount: 2,
    });
    expect(result.validity).toBe("warning");
    expect(result.reason).toMatch(/same doctor/i);
  });

  it("populates targetKeys for the full source slot count", () => {
    const slots = buildSlots(TIMES, ["docA"]);
    const result = previewDrop({
      source: {
        time: "8:00 AM",
        providerId: "docA",
        blockInstanceId: "src",
        blockTypeId: "bt-crown",
      },
      target: { time: "8:00 AM", providerId: "docA" },
      timeSlots: slots,
      sourceSlotCount: 4,
    });
    expect(result.targetKeys.length).toBe(4);
    expect(result.targetKeys[0]).toBe("8:00 AM:docA");
    expect(result.targetKeys[3]).toBe("9:30 AM:docA");
  });
});
