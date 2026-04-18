import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ScheduleGrid, { type ProviderInput, type TimeSlotOutput } from '@/components/schedule/ScheduleGrid';

// ────────────────────────────────────────────────────────────────
// Shared test fixtures
// ────────────────────────────────────────────────────────────────

const providers: ProviderInput[] = [
  { id: 'p1', name: 'Dr. Test', role: 'DOCTOR', color: '#ec8a1b' },
];

/**
 * Grid slots:
 *   7:00 AM – 7:20 AM  → block bt1 "HP>$1200"  (3 slots, block spans rows)
 *   7:30 AM – 7:50 AM  → empty                 (3 slots)
 *   1:00 PM            → break (lunch)
 */
function makeGridSlots(): TimeSlotOutput[] {
  const block = { providerId: 'p1', blockTypeId: 'bt1', blockLabel: 'HP>$1200', staffingCode: 'D', isBreak: false };
  const empty = { providerId: 'p1', isBreak: false };
  const brk   = { providerId: 'p1', isBreak: true };

  return [
    { time: '7:00 AM', slots: [{ ...block }] },
    { time: '7:10 AM', slots: [{ ...block }] },
    { time: '7:20 AM', slots: [{ ...block }] },
    { time: '7:30 AM', slots: [{ ...empty }] },
    { time: '7:40 AM', slots: [{ ...empty }] },
    { time: '7:50 AM', slots: [{ ...empty }] },
    { time: '1:00 PM', slots: [{ ...brk }] },
  ];
}

/** Minimal DataTransfer mock (HTML5 DnD API) */
function mockDataTransfer() {
  return {
    effectAllowed: '' as DataTransfer['effectAllowed'],
    dropEffect: '' as DataTransfer['dropEffect'],
    setData: vi.fn(),
    getData: vi.fn(() => 'block'),
    clearData: vi.fn(),
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as readonly string[],
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
}

// ────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────

describe('ScheduleGrid – drag-and-drop integration', () => {
  let onMoveBlock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMoveBlock = vi.fn();
  });

  // ── Test 1 ────────────────────────────────────────────────────
  it('calls onMoveBlock with correct args when dragging block to a valid empty slot', () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();

    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');
    const targetCell = screen.getByTestId('block-cell-7:30 AM-p1');

    // 1. Start drag on the block
    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });

    // 2. Hover over the target
    act(() => { fireEvent.dragOver(targetCell, { dataTransfer: dt }); });

    // 3. Drop
    act(() => { fireEvent.drop(targetCell, { dataTransfer: dt }); });

    expect(onMoveBlock).toHaveBeenCalledOnce();
    expect(onMoveBlock).toHaveBeenCalledWith('7:00 AM', 'p1', '7:30 AM', 'p1');
  });

  // ── Test 2 ────────────────────────────────────────────────────
  it('does NOT call onMoveBlock when dropping on a break/lunch cell', () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();

    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');
    const lunchCell  = screen.getByTestId('block-cell-1:00 PM-p1');

    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });
    act(() => { fireEvent.dragOver(lunchCell, { dataTransfer: dt }); });
    act(() => { fireEvent.drop(lunchCell, { dataTransfer: dt }); });

    // Break cells have isEmpty=false, so the drop handler should not fire
    expect(onMoveBlock).not.toHaveBeenCalled();
  });

  // ── Test 3 ────────────────────────────────────────────────────
  it('shows drag-over visual feedback (ring class) when hovering a valid target', async () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();
    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');
    const targetCell = screen.getByTestId('block-cell-7:30 AM-p1');

    // Before drag: target cell should have no drag-paint styling
    const targetInner = targetCell.firstChild as HTMLElement;
    expect(targetInner?.className).not.toMatch(/ring-(accent|emerald-400|amber-400|red-400)/);

    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });
    act(() => { fireEvent.dragOver(targetCell, { dataTransfer: dt }); });

    // After dragOver: Loop 10 drag-preview paints 'valid' target with emerald ring.
    const updatedInner = targetCell.firstChild as HTMLElement;
    expect(updatedInner?.className).toContain('ring-emerald-400');
  });

  // ── Test 4 ────────────────────────────────────────────────────
  it('clears visual feedback after drop (ring removed)', () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();
    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');
    const targetCell = screen.getByTestId('block-cell-7:30 AM-p1');

    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });
    act(() => { fireEvent.dragOver(targetCell, { dataTransfer: dt }); });
    act(() => { fireEvent.drop(targetCell, { dataTransfer: dt }); });

    // After drop the drag state is cleared → no drag-paint ring on target
    const afterInner = targetCell.firstChild as HTMLElement;
    expect(afterInner?.className).not.toMatch(/ring-(accent|emerald-400|amber-400|red-400)/);
  });

  // ── Test 5 ────────────────────────────────────────────────────
  it('applies isDragging opacity style to source block during drag', () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();
    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');

    // Before drag: no opacity-40
    const beforeInner = sourceCell.firstChild as HTMLElement;
    expect(beforeInner?.className).not.toContain('opacity-40');

    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });

    // After dragStart: source block's first slot should have opacity-40
    const afterInner = sourceCell.firstChild as HTMLElement;
    expect(afterInner?.className).toContain('opacity-40');
  });

  // ── Test 6 ────────────────────────────────────────────────────
  it('clears drag state when drag ends without a drop (dragEnd)', () => {
    render(
      <ScheduleGrid
        slots={makeGridSlots()}
        providers={providers}
        onMoveBlock={onMoveBlock}
      />,
    );

    const dt = mockDataTransfer();
    const sourceCell = screen.getByTestId('block-cell-7:00 AM-p1');
    const targetCell = screen.getByTestId('block-cell-7:30 AM-p1');

    act(() => { fireEvent.dragStart(sourceCell, { dataTransfer: dt }); });
    act(() => { fireEvent.dragOver(targetCell, { dataTransfer: dt }); });

    // Cancel drag instead of dropping
    act(() => { fireEvent.dragEnd(sourceCell, { dataTransfer: dt }); });

    // onMoveBlock should NOT have been called
    expect(onMoveBlock).not.toHaveBeenCalled();

    // Visual state should be cleared
    const srcInner = sourceCell.firstChild as HTMLElement;
    expect(srcInner?.className).not.toContain('opacity-40');
    const tgtInner = targetCell.firstChild as HTMLElement;
    expect(tgtInner?.className).not.toMatch(/ring-(accent|emerald-400|amber-400|red-400)/);
  });
});
