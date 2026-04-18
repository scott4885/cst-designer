import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimeSlotCell from '@/components/schedule/TimeSlotCell';

// ────────────────────────────────────────────────────────────────────────────
// Iteration 12b — Keyboard accessibility tests for TimeSlotCell.
// Regression guard against the QA-flagged CRITICAL issue: the primary
// interaction surface (click-to-add, click-to-edit) was a <div onClick>
// with no role, tabIndex, or keyboard handler — unusable without a mouse.
// ────────────────────────────────────────────────────────────────────────────

describe('TimeSlotCell keyboard accessibility', () => {
  it('exposes role="button" and tabIndex on empty interactive cell', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TimeSlotCell onClick={onClick} isClickable />
    );
    const cell = container.querySelector('[role="button"]');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell).toHaveAttribute('aria-label');
  });

  it('fires onClick when Enter is pressed on an empty cell', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TimeSlotCell onClick={onClick} isClickable />
    );
    const cell = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when Space is pressed on an empty cell', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TimeSlotCell onClick={onClick} isClickable />
    );
    const cell = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick for other keys', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TimeSlotCell onClick={onClick} isClickable />
    );
    const cell = container.querySelector('[role="button"]') as HTMLElement;
    fireEvent.keyDown(cell, { key: 'Tab' });
    fireEvent.keyDown(cell, { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('exposes role="button" on a block cell and fires onClick for Enter', () => {
    const onClick = vi.fn();
    const { container } = render(
      <TimeSlotCell
        blockLabel="Exam"
        staffingCode="D"
        providerColor="#3B82F6"
        onClick={onClick}
        isClickable
        isBlockFirst
        isBlockLast
      />
    );
    const cell = container.querySelector('[role="button"]') as HTMLElement;
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(cell.getAttribute('aria-label')).toMatch(/Exam/);
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not set role="button" or tabIndex on non-interactive cells', () => {
    // No onClick provided → not interactive.
    const { container } = render(<TimeSlotCell blockLabel="Exam" isBlockFirst />);
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it('marks the conflict icon group as decorative (aria-hidden)', () => {
    const { container } = render(
      <TimeSlotCell
        blockLabel="Exam"
        staffingCode="D"
        providerColor="#3B82F6"
        hasConflict
        conflictTooltip="Double-booked"
        isBlockFirst
      />
    );
    const decor = container.querySelector('[aria-hidden="true"]');
    expect(decor).toBeInTheDocument();
  });
});
