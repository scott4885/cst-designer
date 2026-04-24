/**
 * slots-to-placed-blocks — unit tests for the slot → PlacedBlock aggregator.
 *
 * Critical contract: when the engine emits N back-to-back instances of the
 * SAME block type on the same operatory (e.g. eight consecutive 30-min MP
 * blocks filling a 4-hour stretch), each instance must become its OWN
 * PlacedBlock. Before the fix they collapsed into one 240-min phantom block
 * with a single A-D-A x-segment at the front, which is what produced the
 * "360-min NP Consult" artifact reported from the live grid.
 */

import { describe, it, expect } from 'vitest';
import { slotsToPlacedBlocks } from '../slots-to-placed-blocks';
import type { BlockTypeInput, TimeSlotOutput } from '../types';

const mpBlockType: BlockTypeInput = {
  id: 'bt-mp',
  label: 'MP>$375',
  durationMin: 30,
  appliesToRole: 'DOCTOR',
  minimumAmount: 375,
  xSegment: { asstPreMin: 10, doctorMin: 10, asstPostMin: 10 },
};

const lunchBlockType: BlockTypeInput = {
  id: 'bt-lunch',
  label: 'LUNCH',
  durationMin: 60,
  appliesToRole: 'BOTH',
};

function mpSlots(
  providerId: string,
  operatory: string,
  times: ReadonlyArray<string>,
  staffingCodes: ReadonlyArray<'A' | 'D'>,
): TimeSlotOutput[] {
  return times.map((t, i) => ({
    time: t,
    providerId,
    operatory,
    staffingCode: staffingCodes[i],
    blockTypeId: 'bt-mp',
    blockLabel: 'MP>$375',
    isBreak: false,
    rationale: null,
    customProductionAmount: null,
    blockInstanceId: null,
  }));
}

describe('slotsToPlacedBlocks — adjacent-same-type splitting', () => {
  it('splits eight back-to-back 30-min MP blocks into eight separate PlacedBlocks', () => {
    // Simulate OP1 09:00..12:50 = 24 slots of MP>$375 (ADA × 8)
    const times: string[] = [];
    const codes: ('A' | 'D')[] = [];
    for (let i = 0; i < 24; i++) {
      const totalMin = 9 * 60 + i * 10;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      codes.push(i % 3 === 1 ? 'D' : 'A');
    }
    const slots = mpSlots('dr-1', 'OP1', times, codes);
    const blocks = slotsToPlacedBlocks(slots, [mpBlockType], 10);

    expect(blocks).toHaveLength(8);
    blocks.forEach((b) => {
      expect(b.blockLabel).toBe('MP>$375');
      expect(b.durationMin).toBe(30);
      expect(b.asstPreMin).toBe(10);
      expect(b.doctorMin).toBe(10);
      expect(b.asstPostMin).toBe(10);
    });
    // First block starts at 09:00 (= 540 min), last at 12:30 (= 750 min).
    expect(blocks[0].startMinute).toBe(9 * 60);
    expect(blocks[blocks.length - 1].startMinute).toBe(12 * 60 + 30);
  });

  it('still merges slots that legitimately belong to one block instance', () => {
    // Three 10-min slots of MP (one full 30-min instance)
    const slots = mpSlots(
      'dr-1',
      'OP1',
      ['09:00', '09:10', '09:20'],
      ['A', 'D', 'A'],
    );
    const blocks = slotsToPlacedBlocks(slots, [mpBlockType], 10);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].durationMin).toBe(30);
  });

  it('resets run when a break (LUNCH) separates two same-type blocks', () => {
    const slots: TimeSlotOutput[] = [
      ...mpSlots('dr-1', 'OP1', ['09:00', '09:10', '09:20'], ['A', 'D', 'A']),
      {
        time: '09:30',
        providerId: 'dr-1',
        operatory: 'OP1',
        staffingCode: '0',
        blockTypeId: 'bt-lunch',
        blockLabel: 'LUNCH',
        isBreak: true,
        rationale: null,
        customProductionAmount: null,
        blockInstanceId: null,
      },
      ...mpSlots('dr-1', 'OP1', ['10:30', '10:40', '10:50'], ['A', 'D', 'A']),
    ];
    const blocks = slotsToPlacedBlocks(slots, [mpBlockType, lunchBlockType], 10);
    // Two MP blocks (lunch is a break and is omitted).
    const mpBlocks = blocks.filter((b) => b.blockLabel === 'MP>$375');
    expect(mpBlocks).toHaveLength(2);
    expect(mpBlocks[0].startMinute).toBe(9 * 60);
    expect(mpBlocks[1].startMinute).toBe(10 * 60 + 30);
  });

  it('splits on provider change even within the same label', () => {
    const slots: TimeSlotOutput[] = [
      ...mpSlots('dr-1', 'OP1', ['09:00', '09:10', '09:20'], ['A', 'D', 'A']),
      ...mpSlots('dr-2', 'OP1', ['09:30', '09:40', '09:50'], ['A', 'D', 'A']),
    ];
    const blocks = slotsToPlacedBlocks(slots, [mpBlockType], 10);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].providerId).toBe('dr-1');
    expect(blocks[1].providerId).toBe('dr-2');
  });
});
