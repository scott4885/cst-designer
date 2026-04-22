/**
 * BlockHoverPopover — Sprint 2 Stream C tests.
 *
 * Covers:
 *   • Opens / closes based on `open` prop
 *   • Renders facts grid (Time, X-segments, Production)
 *   • Action buttons fire their callbacks
 *   • Violations section appears when provided
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockHoverPopover from '../BlockHoverPopover';
import type { PlacedBlock, Violation } from '@/lib/engine/types';

const block: PlacedBlock = {
  blockInstanceId: 'blk-1',
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
};

function anchor(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 200, right: 400, top: 100, bottom: 160, width: 200, height: 60, x: 200, y: 100, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('BlockHoverPopover', () => {
  it('returns null when closed', () => {
    render(
      <BlockHoverPopover block={block} anchorEl={anchor()} open={false} />,
    );
    expect(screen.queryByTestId('sg-block-hover-popover')).toBeNull();
  });

  it('renders facts, title, and end-time when open', () => {
    render(
      <BlockHoverPopover
        block={block}
        anchorEl={anchor()}
        open
        providerName="Dr. Kim"
        providerRole="DDS"
      />,
    );
    const pop = screen.getByTestId('sg-block-hover-popover');
    expect(pop.textContent).toContain('HP — Crown');
    expect(pop.textContent).toContain('Dr. Kim');
    expect(pop.textContent).toContain('8:00 AM');
    expect(pop.textContent).toContain('9:00 AM');
    expect(pop.textContent).toContain('10/40/10');
    expect(pop.textContent).toContain('$1,400');
  });

  it('renders issues section when violations provided', () => {
    const violations: Violation[] = [
      { ap: 'AP-1', code: 'D_COLLISION', message: 'Doctor overlap', severity: 'HARD' },
    ];
    render(
      <BlockHoverPopover
        block={block}
        anchorEl={anchor()}
        open
        violations={violations}
      />,
    );
    const pop = screen.getByTestId('sg-block-hover-popover');
    expect(pop.textContent).toContain('AP-1');
    expect(pop.textContent).toContain('Doctor overlap');
  });

  it('action buttons call their handlers', () => {
    const onEdit = vi.fn();
    const onReplace = vi.fn();
    const onDelete = vi.fn();
    render(
      <BlockHoverPopover
        block={block}
        anchorEl={anchor()}
        open
        onEdit={onEdit}
        onReplace={onReplace}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByTestId('sg-popover-action-edit'));
    fireEvent.click(screen.getByTestId('sg-popover-action-replace'));
    fireEvent.click(screen.getByTestId('sg-popover-action-delete'));
    expect(onEdit).toHaveBeenCalled();
    expect(onReplace).toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalled();
  });
});
