import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ────────────────────────────────────────────────────────────────────────────
// Iteration 12b — ErrorBoundary gains componentDidCatch + scope + custom
// fallback. These tests prove:
//   (1) errors are logged via console.error with scope label,
//   (2) default fallback UI renders,
//   (3) a custom fallback prop replaces the default UI,
//   (4) sibling boundaries are unaffected — a crash in one does NOT crash
//       the other (row-scoped wrapping behavior).
// ────────────────────────────────────────────────────────────────────────────

function Boom({ message = 'kaboom' }: { message?: string }) {
  throw new Error(message);
}

describe('ErrorBoundary', () => {
  // React logs the caught error to console.error as part of its own error
  // reporting. We silence it here so test output stays clean, while still
  // asserting that OUR boundary's labeled log fired.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs caught error via console.error with the boundary name', () => {
    render(
      <ErrorBoundary name="unit-test-boundary">
        <Boom message="test-crash" />
      </ErrorBoundary>
    );

    const ourLog = errorSpy.mock.calls.find((call) =>
      typeof call[0] === 'string' && call[0].includes('unit-test-boundary')
    );
    expect(ourLog).toBeDefined();
  });

  it('renders the default fallback UI when a child throws', () => {
    render(
      <ErrorBoundary name="default-fallback">
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Try Again/i)).toBeInTheDocument();
  });

  it('renders a scope label in the default fallback when scope prop is provided', () => {
    render(
      <ErrorBoundary name="scoped" scope="the schedule row">
        <Boom />
      </ErrorBoundary>
    );
    expect(
      screen.getByText(/Something went wrong in the schedule row/i)
    ).toBeInTheDocument();
  });

  it('uses a custom fallback when the `fallback` prop is supplied', () => {
    render(
      <ErrorBoundary name="custom" fallback={<div>row crashed</div>}>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('row crashed')).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it('isolates errors — sibling boundaries continue rendering when one throws', () => {
    render(
      <div>
        <ErrorBoundary name="row-a" fallback={<div data-testid="row-a-error">A failed</div>}>
          <Boom message="row-a-crash" />
        </ErrorBoundary>
        <ErrorBoundary name="row-b" fallback={<div data-testid="row-b-error">B failed</div>}>
          <div data-testid="row-b-ok">B still renders</div>
        </ErrorBoundary>
      </div>
    );

    // Row A's boundary caught the error → fallback shown.
    expect(screen.getByTestId('row-a-error')).toBeInTheDocument();
    // Row B never threw → its children rendered normally.
    expect(screen.getByTestId('row-b-ok')).toBeInTheDocument();
    expect(screen.queryByTestId('row-b-error')).not.toBeInTheDocument();
  });

  it('invokes the onError callback with the thrown error', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary name="callback" onError={onError}>
        <Boom message="callback-crash" />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    const [err] = onError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('callback-crash');
  });
});
