/**
 * ScheduleGrid — Sprint 2 Stream C polish tests.
 *
 * Covers the additive Stream C props only (existing interaction tests live
 * in ScheduleGrid.test.tsx):
 *   • `state` short-circuits to Empty / Error / Loading
 *   • providerRole surfaces a ProviderRoleBadge in the header
 *   • blockCategories forwards procedureCategory to each BlockInstance
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScheduleGrid, { type ScheduleGridColumn } from '../ScheduleGrid';
import { useScheduleView } from '@/store/use-schedule-view';
import type { GeneratedSchedule } from '@/lib/engine/types';
import type { ProcedureCategoryCode } from '../BlockInstance';

const minimalSchedule: GeneratedSchedule = {
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
    },
  ],
  doctorTrace: [],
  guardReport: { passed: true, results: [], violations: [], counts: { hard: 0, soft: 0, info: 0 } },
  warnings: [],
};

const cols: ScheduleGridColumn[] = [
  {
    id: 'op-1',
    label: 'Op 1 — Dr. Kim',
    providerColorIndex: 1,
    providerRole: 'DDS',
  },
  {
    id: 'hyg-1',
    label: 'Hyg 1 — Sam',
    providerColorIndex: 2,
    providerRole: 'RDH',
  },
];

describe('ScheduleGrid — state short-circuit', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('renders empty state when state.kind === "empty"', () => {
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
        state={{ kind: 'empty', actionLabel: 'Create first office' }}
      />,
    );
    expect(screen.getByTestId('sg-state-empty')).toBeDefined();
    expect(
      screen.getByTestId('sg-schedule-grid').getAttribute('data-sg-state'),
    ).toBe('empty');
  });

  it('renders error state when state.kind === "error"', () => {
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
        state={{ kind: 'error', message: 'Engine failed' }}
      />,
    );
    expect(screen.getByTestId('sg-state-error')).toBeDefined();
  });

  it('renders loading state when state.kind === "loading"', () => {
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
        state={{ kind: 'loading', rows: 4, columns: 2 }}
      />,
    );
    expect(screen.getByTestId('sg-state-loading')).toBeDefined();
    expect(screen.getAllByTestId('sg-state-loading-row')).toHaveLength(8);
  });

  it('renders the canonical grid when state.kind === "ready" or undefined', () => {
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
        state={{ kind: 'ready' }}
      />,
    );
    expect(screen.getAllByTestId('sg-block-instance')).toHaveLength(1);
  });
});

describe('ScheduleGrid — provider role badge in headers', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('does NOT render ProviderRoleBadge inside column headers (dropped in redesign — role is implied by column naming + provider colour bar)', () => {
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
      />,
    );
    expect(screen.queryAllByTestId('sg-provider-role-badge')).toHaveLength(0);
  });
});

describe('ScheduleGrid — blockCategories propagation', () => {
  beforeEach(() => {
    useScheduleView.setState({
      zoom: 'default',
      cursor: null,
      hoveredBlockId: null,
      selectedBlockId: null,
      showDoctorFlow: false,
    });
  });

  it('forwards procedureCategory to BlockInstance via the blockCategories map', () => {
    const map = new Map<string, ProcedureCategoryCode>([
      ['b-1', 'MAJOR_RESTORATIVE'],
    ]);
    render(
      <ScheduleGrid
        schedule={minimalSchedule}
        columns={cols}
        workingStartMin={480}
        workingEndMin={540}
        blockCategories={map}
      />,
    );
    const block = screen.getByTestId('sg-block-instance') as HTMLElement;
    // The redesign dropped the left category stripe from the compact
    // view (the top accent strip already carries provider-colour signal;
    // a left stripe would duplicate/compete — see reference study). The
    // prop is still forwarded and surfaced as a data-attribute so future
    // orthogonal signals (e.g. category filter highlighting) can light
    // up without a render change.
    expect(block.getAttribute('data-procedure-category')).toBe('MAJOR_RESTORATIVE');
  });
});
