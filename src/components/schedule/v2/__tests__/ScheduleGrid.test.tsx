/**
 * ScheduleGrid — Sprint 2 Stream B interaction + a11y tests.
 *
 * Contracts under test:
 *   • Renders sticky time rail (time cells) + sticky column headers
 *   • Keyboard cursor navigation via Arrow keys moves within bounds
 *   • Ctrl+/- zooms between compact/default/expanded
 *   • Escape clears selection
 *   • Enter on cursor cell over a block triggers onBlockActivate
 *   • Grid exposes role="grid" with correct aria-row/col counts
 *   • Doctor-flow toggle renders overlay when active
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ScheduleGrid, {
  type ScheduleGridColumn,
} from '../ScheduleGrid';
import { useScheduleView } from '@/store/use-schedule-view';
import type { GeneratedSchedule } from '@/lib/engine/types';

const cols: ScheduleGridColumn[] = [
  { id: 'op-1', label: 'Op 1 — Dr. Kim', sublabel: 'Doctor', providerColorIndex: 1 },
  { id: 'op-2', label: 'Op 2 — Dr. Kim', sublabel: 'Doctor', providerColorIndex: 1 },
  { id: 'hyg-1', label: 'Hyg 1 — Sam', sublabel: 'Hygiene', providerColorIndex: 2 },
];

const sampleSchedule: GeneratedSchedule = {
  dayOfWeek: 'MON',
  blocks: [
    {
      blockInstanceId: 'b-1',
      blockTypeId: 'bt-hp',
      blockLabel: 'HP — Crown',
      providerId: 'dr-kim',
      operatory: 'op-1',
      startMinute: 480,
      durationMin: 60,
      asstPreMin: 10,
      doctorMin: 40,
      asstPostMin: 10,
      productionAmount: 1400,
    },
    {
      blockInstanceId: 'b-2',
      blockTypeId: 'bt-rc',
      blockLabel: 'Recall',
      providerId: 'hyg-1',
      operatory: 'hyg-1',
      startMinute: 480,
      durationMin: 50,
      asstPreMin: 40,
      doctorMin: 10,
      asstPostMin: 0,
    },
  ],
  doctorTrace: [
    {
      doctorStartMinute: 490,
      doctorEndMinute: 530,
      doctorProviderId: 'dr-kim',
      operatory: 'op-1',
      blockInstanceId: 'b-1',
      continuityRequired: false,
      concurrencyIndex: 0,
    },
    {
      doctorStartMinute: 520,
      doctorEndMinute: 530,
      doctorProviderId: 'dr-kim',
      operatory: 'hyg-1',
      blockInstanceId: 'b-2',
      continuityRequired: false,
      concurrencyIndex: 0,
    },
  ],
  guardReport: {
    passed: true,
    results: [],
    violations: [],
    counts: { hard: 0, soft: 0, info: 0 },
  },
  warnings: [],
};

function renderGrid(opts: { onBlockActivate?: (b: unknown) => void } = {}) {
  return render(
    <ScheduleGrid
      schedule={sampleSchedule}
      columns={cols}
      workingStartMin={480}
      workingEndMin={540}
      onBlockActivate={opts.onBlockActivate as never}
    />,
  );
}

describe('ScheduleGrid — structure & a11y', () => {
  beforeEach(() => {
    // Reset zustand store between tests
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('renders the grid body with role="grid" and aria-rowcount/aria-colcount', () => {
    renderGrid();
    // Phase 6 fix: root is now role="region" (so toolbar/live-region aren't
    // grid children); role="grid" lives on the inner body so all grid
    // descendants are rows/rowheaders/cells per aria-required-children.
    const root = screen.getByTestId('sg-schedule-grid');
    expect(root.getAttribute('role')).toBe('region');
    const body = screen.getByTestId('sg-grid-body');
    expect(body.getAttribute('role')).toBe('grid');
    // 60min / 10min = 6 rows + 1 header = 7
    expect(body.getAttribute('aria-rowcount')).toBe('7');
    // 3 cols + 1 time rail = 4
    expect(body.getAttribute('aria-colcount')).toBe('4');
  });

  it('renders one column header per column', () => {
    renderGrid();
    const headers = screen.getAllByTestId('sg-col-header');
    expect(headers).toHaveLength(3);
    expect(headers[0].textContent).toContain('Op 1');
    expect(headers[2].textContent).toContain('Hyg 1');
  });

  it('renders time rail cells with a full label at every 10-min row', () => {
    renderGrid();
    const timeCells = screen.getAllByTestId('sg-time-cell');
    // 60min / 10min = 6 time cells
    expect(timeCells).toHaveLength(6);
    expect(timeCells[0].textContent).toContain('8:00 AM');
    expect(timeCells[1].textContent).toContain('8:10 AM');
    expect(timeCells[2].textContent).toContain('8:20 AM');
    expect(timeCells[3].textContent).toContain('8:30 AM');
    expect(timeCells[5].textContent).toContain('8:50 AM');
  });

  it('renders all blocks attached to their column', () => {
    renderGrid();
    const blocks = screen.getAllByTestId('sg-block-instance');
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.getAttribute('data-block-id'))).toEqual([
      'b-1',
      'b-2',
    ]);
  });

  it('sets data-sg-zoom on root', () => {
    renderGrid();
    expect(
      screen.getByTestId('sg-schedule-grid').getAttribute('data-sg-zoom'),
    ).toBe('default');
  });
});

describe('ScheduleGrid — keyboard interaction (UX-L6, UX-L9)', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('auto-initialises cursor at (0, 0) on mount', () => {
    renderGrid();
    expect(useScheduleView.getState().cursor).toEqual({
      rowIndex: 0,
      colIndex: 0,
    });
  });

  it('ArrowRight moves cursor by one column', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(useScheduleView.getState().cursor).toEqual({
      rowIndex: 0,
      colIndex: 1,
    });
  });

  it('ArrowDown moves cursor by one row', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(useScheduleView.getState().cursor).toEqual({
      rowIndex: 1,
      colIndex: 0,
    });
  });

  it('cursor does not escape bounds', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    for (let i = 0; i < 50; i++) fireEvent.keyDown(grid, { key: 'ArrowDown' });
    for (let i = 0; i < 50; i++) fireEvent.keyDown(grid, { key: 'ArrowRight' });
    const cur = useScheduleView.getState().cursor!;
    expect(cur.rowIndex).toBeLessThanOrEqual(5); // 6 rows - 1
    expect(cur.colIndex).toBeLessThanOrEqual(2); // 3 cols - 1
  });

  it('Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: '=', ctrlKey: true });
    expect(useScheduleView.getState().zoom).toBe('expanded');
    fireEvent.keyDown(grid, { key: '-', ctrlKey: true });
    expect(useScheduleView.getState().zoom).toBe('default');
    fireEvent.keyDown(grid, { key: '-', ctrlKey: true });
    expect(useScheduleView.getState().zoom).toBe('compact');
    fireEvent.keyDown(grid, { key: '0', ctrlKey: true });
    expect(useScheduleView.getState().zoom).toBe('default');
  });

  it('Enter on cursor over a block triggers onBlockActivate', () => {
    const onBlockActivate = vi.fn();
    renderGrid({ onBlockActivate });
    const grid = screen.getByTestId('sg-schedule-grid');
    // Cursor at (0, 0) → minute 480 in op-1 → lands inside b-1
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(onBlockActivate).toHaveBeenCalledTimes(1);
    expect(onBlockActivate.mock.calls[0][0].blockInstanceId).toBe('b-1');
    expect(useScheduleView.getState().selectedBlockId).toBe('b-1');
  });

  it('Escape clears the selectedBlockId', () => {
    renderGrid();
    act(() => {
      useScheduleView.setState({ selectedBlockId: 'b-1' });
    });
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(useScheduleView.getState().selectedBlockId).toBeNull();
  });

  it('Home moves cursor to col 0 of current row', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    expect(useScheduleView.getState().cursor).toEqual({ rowIndex: 1, colIndex: 2 });
    fireEvent.keyDown(grid, { key: 'Home' });
    expect(useScheduleView.getState().cursor).toEqual({ rowIndex: 1, colIndex: 0 });
  });

  it('End moves cursor to last col of current row', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'End' });
    expect(useScheduleView.getState().cursor).toEqual({ rowIndex: 1, colIndex: 2 });
  });

  it('Ctrl+Home jumps to (0, 0)', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    fireEvent.keyDown(grid, { key: 'Home', ctrlKey: true });
    expect(useScheduleView.getState().cursor).toEqual({ rowIndex: 0, colIndex: 0 });
  });

  it('Ctrl+End jumps to (lastRow, lastCol)', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'End', ctrlKey: true });
    expect(useScheduleView.getState().cursor).toEqual({ rowIndex: 5, colIndex: 2 });
  });

  it('PageDown jumps 10 rows (clamped to bound)', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    fireEvent.keyDown(grid, { key: 'PageDown' });
    // 6 rows total → clamped to last row index (5)
    expect(useScheduleView.getState().cursor?.rowIndex).toBe(5);
  });

  it('PageUp moves up 10 rows (clamped to 0)', () => {
    renderGrid();
    const grid = screen.getByTestId('sg-schedule-grid');
    // Cursor at (0, 0) initial — PageUp should clamp to 0
    fireEvent.keyDown(grid, { key: 'PageUp' });
    expect(useScheduleView.getState().cursor?.rowIndex).toBe(0);
  });
});

describe('ScheduleGrid — doctor-flow overlay toggle', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('overlay starts hidden and toggles visible on button click', () => {
    renderGrid();
    expect(screen.queryByTestId('sg-doctor-flow-overlay')).toBeNull();
    fireEvent.click(screen.getByTestId('sg-doctor-flow-toggle'));
    expect(useScheduleView.getState().showDoctorFlow).toBe(true);
    expect(screen.getByTestId('sg-doctor-flow-overlay')).toBeDefined();
  });
});

describe('ScheduleGrid — violation badges from GuardReport', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('surfaces per-block violation badges when guardReport includes the blockInstanceId', () => {
    const scheduleWithViolations: GeneratedSchedule = {
      ...sampleSchedule,
      guardReport: {
        passed: false,
        results: [],
        violations: [
          {
            ap: 'AP-1',
            code: 'D_COLLISION',
            message: 'Doctor overlap',
            severity: 'HARD',
            blockInstanceIds: ['b-1'],
          },
        ],
        counts: { hard: 1, soft: 0, info: 0 },
      },
    };
    render(
      <ScheduleGrid
        schedule={scheduleWithViolations}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
      />,
    );
    const badges = screen.getAllByTestId('sg-violation-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute('data-severity')).toBe('HARD');
  });
});
