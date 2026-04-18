import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTimeSlotInteraction } from '@/components/schedule/TimeSlotInteraction';
import { BLOCK_TYPE_DRAG_KEY } from '@/components/schedule/BlockPalette';
import type { BlockTypeInput } from '@/lib/engine/types';
import type { ProviderInput, TimeSlotOutput } from '@/components/schedule/TimeGridRenderer';

// ────────────────────────────────────────────────────────────────────────────
// Iteration 12a — drag state cleanup regression guard.
// The QA sweep flagged a CRITICAL bug: when the drop handler took the early
// return path (dragState=null OR no onMoveBlock), setDragState(null) and
// setDragOverCell(null) were skipped — leaving stale drag visuals on the
// grid that followed the user around until the next successful drop/dragEnd.
// ────────────────────────────────────────────────────────────────────────────

const makeProvider = (id = 'p1'): ProviderInput => ({
  id,
  name: 'Dr. Test',
  role: 'DOCTOR',
  color: '#123456',
  operatories: ['OP1'],
});

const makeBlockType = (): BlockTypeInput => ({
  id: 'bt-hp',
  name: 'HP Crown',
  color: '#ff0000',
  durationMin: 30,
  category: 'high-production',
  minimumAmount: 1500,
});

const makeTimeSlot = (
  time: string,
  providerId = 'p1',
  blockTypeId?: string
): TimeSlotOutput => ({
  time,
  slots: blockTypeId
    ? [{ providerId, blockTypeId, blockLabel: 'HP $1500', blockInstanceId: 'inst1' }]
    : [{ providerId }],
});

// Build a minimal DataTransfer mock compatible with React.DragEvent.
function makeDataTransfer(payload: Record<string, string> = {}): DataTransfer {
  const store = { ...payload };
  return {
    getData: (k: string) => store[k] ?? '',
    setData: (k: string, v: string) => {
      store[k] = v;
    },
    effectAllowed: 'move',
    dropEffect: 'move',
    types: Object.keys(store),
    clearData: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  } as unknown as DataTransfer;
}

function makeDragEvent(payload: Record<string, string> = {}): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    dataTransfer: makeDataTransfer(payload),
  } as unknown as React.DragEvent;
}

describe('useTimeSlotInteraction — drag state cleanup (Iter 12a)', () => {
  it('clears dragState on a drop that takes the early-return path (no onMoveBlock)', () => {
    const providers = [makeProvider()];
    const timeSlots = [makeTimeSlot('07:00', 'p1', 'bt-hp')];
    const slots = [{ time: '07:00', providerId: 'p1', blockTypeId: 'bt-hp', blockLabel: 'HP' }];

    const { result } = renderHook(() =>
      useTimeSlotInteraction({
        slots: slots as never,
        timeSlots,
        providers,
        effectiveBlockTypes: [makeBlockType()],
        timeIncrement: 10,
        // Intentionally omit onMoveBlock so drop triggers early return.
      })
    );

    // Start a drag on the existing block.
    act(() => {
      result.current.handleDragStart(makeDragEvent(), '07:00', 'p1');
    });
    expect(result.current.dragState).not.toBeNull();

    // Hover another cell to set dragOverCell.
    act(() => {
      result.current.handleDragOver(makeDragEvent(), '07:30', 'p1');
    });
    expect(result.current.dragOverCell).not.toBeNull();

    // Drop — with no onMoveBlock prop, this hits the early-return path.
    act(() => {
      result.current.handleDrop(makeDragEvent(), '07:30', 'p1');
    });

    // Both drag flags MUST be cleared even though move was a no-op.
    expect(result.current.dragState).toBeNull();
    expect(result.current.dragOverCell).toBeNull();
    expect(result.current.sidebarDragging).toBe(false);
  });

  it('clears dragState after a successful grid move', () => {
    const onMoveBlock = vi.fn();
    const providers = [makeProvider()];
    const timeSlots = [makeTimeSlot('07:00', 'p1', 'bt-hp')];
    const slots = [{ time: '07:00', providerId: 'p1', blockTypeId: 'bt-hp', blockLabel: 'HP' }];

    const { result } = renderHook(() =>
      useTimeSlotInteraction({
        slots: slots as never,
        timeSlots,
        providers,
        effectiveBlockTypes: [makeBlockType()],
        timeIncrement: 10,
        onMoveBlock,
      })
    );

    act(() => {
      result.current.handleDragStart(makeDragEvent(), '07:00', 'p1');
    });
    act(() => {
      result.current.handleDrop(makeDragEvent(), '07:30', 'p1');
    });

    expect(onMoveBlock).toHaveBeenCalledWith('07:00', 'p1', '07:30', 'p1');
    expect(result.current.dragState).toBeNull();
    expect(result.current.dragOverCell).toBeNull();
    expect(result.current.sidebarDragging).toBe(false);
  });

  it('clears sidebarDragging after a sidebar drop with malformed JSON', () => {
    const onAddBlock = vi.fn();
    const providers = [makeProvider()];
    const timeSlots = [makeTimeSlot('07:00', 'p1')];

    const { result } = renderHook(() =>
      useTimeSlotInteraction({
        slots: [],
        timeSlots,
        providers,
        effectiveBlockTypes: [makeBlockType()],
        timeIncrement: 10,
        onAddBlock,
      })
    );

    // Simulate sidebar dragOver (sets sidebarDragging) then a broken-JSON drop.
    act(() => {
      result.current.handleDragOver(
        makeDragEvent({ [BLOCK_TYPE_DRAG_KEY]: '{not valid json' }),
        '07:00',
        'p1'
      );
    });
    expect(result.current.sidebarDragging).toBe(true);

    act(() => {
      result.current.handleDrop(
        makeDragEvent({ [BLOCK_TYPE_DRAG_KEY]: '{not valid json' }),
        '07:00',
        'p1'
      );
    });

    // Malformed JSON must not call onAddBlock but must clear all drag flags.
    expect(onAddBlock).not.toHaveBeenCalled();
    expect(result.current.dragState).toBeNull();
    expect(result.current.dragOverCell).toBeNull();
    expect(result.current.sidebarDragging).toBe(false);
  });
});
