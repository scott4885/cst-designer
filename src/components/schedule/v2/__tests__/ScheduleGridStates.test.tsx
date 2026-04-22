/**
 * ScheduleGridStates — Sprint 2 Stream C (Polish) tests.
 *
 * Covers the empty / error / loading / no-violations states:
 *   • Every state renders a message, icon, and suggested action.
 *   • Retry callback fires.
 *   • Loading renders N rows × M columns skeletons.
 *   • Empty action is optional; badge state takes a label prop.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ScheduleGridEmpty,
  ScheduleGridError,
  ScheduleGridLoading,
  ScheduleGridNoViolations,
} from '../ScheduleGridStates';

describe('ScheduleGridEmpty', () => {
  it('renders message and optional action button', () => {
    const onSuggestedAction = vi.fn();
    render(
      <ScheduleGridEmpty
        onSuggestedAction={onSuggestedAction}
        suggestedActionLabel="Create first office"
      />,
    );
    expect(screen.getByTestId('sg-state-empty')).toBeDefined();
    const btn = screen.getByTestId('sg-state-empty-action');
    expect(btn.textContent).toContain('Create first office');
    fireEvent.click(btn);
    expect(onSuggestedAction).toHaveBeenCalledTimes(1);
  });

  it('omits the button when no action callback is supplied', () => {
    render(<ScheduleGridEmpty />);
    expect(screen.queryByTestId('sg-state-empty-action')).toBeNull();
  });
});

describe('ScheduleGridError', () => {
  it('renders message, optional detail and retry button', () => {
    const onRetry = vi.fn();
    render(
      <ScheduleGridError
        message="Engine exploded"
        detail="ruleCode: AP-7"
        onRetry={onRetry}
      />,
    );
    const card = screen.getByTestId('sg-state-error');
    expect(card.textContent).toContain('Engine exploded');
    expect(card.textContent).toContain('ruleCode: AP-7');
    fireEvent.click(screen.getByTestId('sg-state-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ScheduleGridLoading', () => {
  it('renders rows × columns skeleton cells', () => {
    render(<ScheduleGridLoading rows={3} columns={4} />);
    const cells = screen.getAllByTestId('sg-state-loading-row');
    expect(cells).toHaveLength(12);
    expect(screen.getByTestId('sg-state-loading-spinner')).toBeDefined();
  });
});

describe('ScheduleGridNoViolations', () => {
  it('renders badge with label', () => {
    render(<ScheduleGridNoViolations label="All 15 anti-patterns clean" />);
    const badge = screen.getByTestId('sg-state-no-violations');
    expect(badge.textContent).toContain('All 15 anti-patterns clean');
  });
});
