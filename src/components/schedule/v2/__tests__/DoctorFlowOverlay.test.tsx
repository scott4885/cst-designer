/**
 * DoctorFlowOverlay — Sprint 2 Stream B unit tests.
 *
 * Contracts under test:
 *   • Emits one <path> per cross-column hop for a single doctor
 *   • Same-operatory consecutive bands produce no connector
 *   • Unknown operatory ids are skipped silently
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import DoctorFlowOverlay from '../DoctorFlowOverlay';
import type { DoctorScheduleTrace } from '@/lib/engine/types';
import type { ScheduleGridColumn } from '../ScheduleGrid';

// jsdom has no ResizeObserver — polyfill with a synchronous stub so the SVG
// renders at a known box during tests.
beforeAll(() => {
  // @ts-expect-error test shim
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Force clientWidth/clientHeight non-zero so the SVG actually renders.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 300;
    },
  });
});

const cols: ScheduleGridColumn[] = [
  { id: 'op-1', label: 'Op 1' },
  { id: 'op-2', label: 'Op 2' },
  { id: 'op-3', label: 'Op 3' },
];

describe('DoctorFlowOverlay', () => {
  it('renders a connector for each inter-op hop of a doctor', () => {
    const trace: DoctorScheduleTrace[] = [
      {
        doctorStartMinute: 480,
        doctorEndMinute: 500,
        doctorProviderId: 'dr-a',
        operatory: 'op-1',
        blockInstanceId: 'b-1',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
      {
        doctorStartMinute: 510,
        doctorEndMinute: 530,
        doctorProviderId: 'dr-a',
        operatory: 'op-2',
        blockInstanceId: 'b-2',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
      {
        doctorStartMinute: 540,
        doctorEndMinute: 560,
        doctorProviderId: 'dr-a',
        operatory: 'op-3',
        blockInstanceId: 'b-3',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
    ];

    render(
      <DoctorFlowOverlay
        trace={trace}
        columns={cols}
        workingStartMin={480}
        slotHeightPx={32}
        slotMinutes={10}
      />,
    );

    // 3 bands → 2 inter-op hops
    const paths = screen.getAllByTestId('sg-doctor-flow-path');
    expect(paths).toHaveLength(2);
  });

  it('skips connectors when consecutive bands are in the same column', () => {
    const trace: DoctorScheduleTrace[] = [
      {
        doctorStartMinute: 480,
        doctorEndMinute: 500,
        doctorProviderId: 'dr-a',
        operatory: 'op-1',
        blockInstanceId: 'b-1',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
      {
        doctorStartMinute: 510,
        doctorEndMinute: 530,
        doctorProviderId: 'dr-a',
        operatory: 'op-1',
        blockInstanceId: 'b-2',
        continuityRequired: false,
        concurrencyIndex: 0,
      },
    ];
    render(
      <DoctorFlowOverlay
        trace={trace}
        columns={cols}
        workingStartMin={480}
        slotHeightPx={32}
        slotMinutes={10}
      />,
    );
    expect(screen.queryAllByTestId('sg-doctor-flow-path')).toHaveLength(0);
  });

  it('renders nothing when trace is empty', () => {
    render(
      <DoctorFlowOverlay
        trace={[]}
        columns={cols}
        workingStartMin={480}
        slotHeightPx={32}
        slotMinutes={10}
      />,
    );
    expect(screen.queryAllByTestId('sg-doctor-flow-path')).toHaveLength(0);
  });
});
