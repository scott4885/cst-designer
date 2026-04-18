import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimeGridRenderer, {
  type ProviderInput,
  type TimeSlotOutput,
} from '@/components/schedule/TimeGridRenderer';
import type { BlockTypeInput } from '@/lib/engine/types';
import type { ConflictResult } from '@/lib/engine/stagger';

// ────────────────────────────────────────────────────────────────────────────
// Smoke test — proves the Iteration 9 split preserves basic rendering.
// Iter 9 broke ScheduleGrid into TimeGridRenderer + TimeSlotInteraction +
// ConflictOverlay. This test renders the pure render piece with a minimal
// mock slots array and verifies the cells appear.
// ────────────────────────────────────────────────────────────────────────────

const noop = () => {};
// Typed as the renderer expects; body ignores args. Using `any` here keeps the
// harness narrow without forcing unused-arg names through strict lint rules.
const noopDragStart: React.ComponentProps<typeof TimeGridRenderer>['onDragStart'] = () => {};
const noopDragOver: React.ComponentProps<typeof TimeGridRenderer>['onDragOver'] = () => {};
const noopDrop: React.ComponentProps<typeof TimeGridRenderer>['onDrop'] = () => {};
const noopCellClick: React.ComponentProps<typeof TimeGridRenderer>['onEmptyCellClick'] = () => {};

describe('TimeGridRenderer smoke test', () => {
  const provider: ProviderInput = {
    id: 'dr-smith',
    name: 'Dr. Smith',
    role: 'DOCTOR',
    color: '#3B82F6',
    operatories: ['OP1'],
  };

  const timeSlots: TimeSlotOutput[] = [
    {
      time: '8:00 AM',
      slots: [
        {
          providerId: 'dr-smith',
          blockTypeId: 'exam',
          blockLabel: 'Exam',
          blockInstanceId: 'inst-1',
          staffingCode: 'D',
        },
      ],
    },
    {
      time: '8:10 AM',
      slots: [
        {
          providerId: 'dr-smith',
          blockTypeId: 'filling',
          blockLabel: 'Filling',
          blockInstanceId: 'inst-2',
          staffingCode: 'D',
        },
      ],
    },
  ];

  const blockTypes: BlockTypeInput[] = [
    {
      id: 'exam',
      label: 'Exam',
      durationMin: 10,
      minimumAmount: 100,
      appliesToRole: 'DOCTOR',
      dTimeMin: 10,
      aTimeMin: 0,
    } as BlockTypeInput,
    {
      id: 'filling',
      label: 'Filling',
      durationMin: 10,
      minimumAmount: 300,
      appliesToRole: 'DOCTOR',
      dTimeMin: 10,
      aTimeMin: 0,
    } as BlockTypeInput,
  ];

  const blockTypeById = new Map(blockTypes.map((bt) => [bt.id, bt]));

  function renderGrid() {
    return render(
      <TimeGridRenderer
        timeSlots={timeSlots}
        providers={[provider]}
        rowHeight={20}
        columnsExpanded={false}
        colWidth={120}
        canZoomIn
        canZoomOut
        setColumnsExpanded={noop}
        onZoomIn={noop}
        onZoomOut={noop}
        onFitToScreen={noop}
        conflictMap={new Map<string, ConflictResult>()}
        dTimeConflictInstanceIds={new Set<string>()}
        blockTypeById={blockTypeById}
        partnerMap={new Map()}
        isInteractive
        dragState={null}
        dragOverCell={null}
        sidebarDragging={false}
        dragValidityMap={new Map()}
        currentDragValidity={null}
        getBlockInfo={(time) => {
          // Minimal mock: each slot is a 1-cell block that is both first and last.
          const row = timeSlots.find((r) => r.time === time);
          const slot = row?.slots[0];
          if (!slot?.blockTypeId) return null;
          return {
            blockTypeId: slot.blockTypeId,
            blockLabel: slot.blockLabel ?? '',
            blockInstanceId: slot.blockInstanceId ?? null,
            customProductionAmount: null,
            slotCount: 1,
            isFirst: true,
            isLast: true,
            startTime: time,
          };
        }}
        onEmptyCellClick={noopCellClick}
        onBlockCellClick={noopCellClick}
        onDragStart={noopDragStart}
        onDragOver={noopDragOver}
        onDragLeave={noop}
        onDrop={noopDrop}
        onDragEnd={noop}
        onMoveBlockEnabled
      />
    );
  }

  it('renders block cells for each slot in the mock array', () => {
    renderGrid();

    // Two time rows, one provider → two block-cell testids
    const cell0800 = screen.getByTestId('block-cell-8:00 AM-dr-smith');
    const cell0810 = screen.getByTestId('block-cell-8:10 AM-dr-smith');
    expect(cell0800).toBeInTheDocument();
    expect(cell0810).toBeInTheDocument();
  });

  it('renders the provider header with name and role', () => {
    renderGrid();
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
    expect(screen.getByText('DOCTOR')).toBeInTheDocument();
  });

  it('renders the zoom toolbar with current row height', () => {
    renderGrid();
    expect(screen.getByText('20px')).toBeInTheDocument();
  });

  it('calls onZoomOut when the zoom-out button is clicked', () => {
    const onZoomOut = vi.fn();
    render(
      <TimeGridRenderer
        timeSlots={timeSlots}
        providers={[provider]}
        rowHeight={20}
        columnsExpanded={false}
        colWidth={120}
        canZoomIn
        canZoomOut
        setColumnsExpanded={noop}
        onZoomIn={noop}
        onZoomOut={onZoomOut}
        onFitToScreen={noop}
        conflictMap={new Map<string, ConflictResult>()}
        dTimeConflictInstanceIds={new Set<string>()}
        blockTypeById={blockTypeById}
        partnerMap={new Map()}
        isInteractive
        dragState={null}
        dragOverCell={null}
        sidebarDragging={false}
        dragValidityMap={new Map()}
        currentDragValidity={null}
        getBlockInfo={() => null}
        onEmptyCellClick={noopCellClick}
        onBlockCellClick={noopCellClick}
        onDragStart={noopDragStart}
        onDragOver={noopDragOver}
        onDragLeave={noop}
        onDrop={noopDrop}
        onDragEnd={noop}
        onMoveBlockEnabled
      />
    );
    const zoomOut = screen.getByTitle('Zoom out');
    zoomOut.click();
    expect(onZoomOut).toHaveBeenCalledTimes(1);
  });
});
