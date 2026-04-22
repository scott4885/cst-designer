"use client";

/**
 * ScheduleGridStates — Sprint 2 Stream C (Polish)
 * ───────────────────────────────────────────────
 * Meaningful empty / error / loading / "no-guard-violation" states for
 * `ScheduleGrid.v2`. Each state is a self-contained card that can be
 * rendered inside the canvas container; none of them touches engine state.
 *
 * Contracts:
 *   • All four states ship with a short message, an icon, and a single
 *     suggested next action (button or text).
 *   • Calm visual language — the grid is clinical software, not a web app.
 *   • Animations obey `prefers-reduced-motion` via the motion tokens.
 *   • Loading state renders N skeleton rows that match the grid geometry.
 */

import { memo } from 'react';
import {
  IconInfo,
  IconError,
} from './icons';

/* ─────────────────────────────────────────────────────────────
   Empty state
   ────────────────────────────────────────────────────────────── */

export interface ScheduleGridEmptyProps {
  /** Actionable next step — defaults to "Create first office". */
  suggestedActionLabel?: string;
  onSuggestedAction?: () => void;
  message?: string;
}

export const ScheduleGridEmpty = memo(function ScheduleGridEmpty({
  suggestedActionLabel = 'Create first office',
  onSuggestedAction,
  message = 'No schedule yet for this office. Add providers and block types to generate a template.',
}: ScheduleGridEmptyProps) {
  return (
    <div
      role="status"
      data-testid="sg-state-empty"
      className="flex flex-col items-center justify-center gap-3 py-16 px-6 mx-auto max-w-md text-center"
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-center h-12 w-12 rounded-full"
        style={{ background: 'var(--sg-provider-1-soft)' }}
      >
        <IconInfo size="md" className="text-[oklch(48%_0.15_250)]" />
      </div>
      <h2 className="sg-section-header" style={{ fontSize: 'var(--font-sm)' }}>
        No schedule yet
      </h2>
      <p
        data-micro={message.length < 20 ? 'true' : 'false'}
        className="text-[var(--font-sm)] leading-snug text-neutral-600"
      >
        {message}
      </p>
      {onSuggestedAction && (
        <button
          type="button"
          data-testid="sg-state-empty-action"
          onClick={onSuggestedAction}
          className="mt-2 rounded-md border border-[rgba(17,24,39,0.12)] bg-white px-3 py-1.5 text-[var(--font-sm)] font-medium text-neutral-900 hover:bg-neutral-50 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-shadow"
          style={{ transition: 'box-shadow var(--sg-transition-fast), background-color var(--sg-transition-fast)' }}
        >
          {suggestedActionLabel}
        </button>
      )}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────
   Error state
   ────────────────────────────────────────────────────────────── */

export interface ScheduleGridErrorProps {
  /** Short human-readable summary — defaults to a generic message. */
  message?: string;
  /** Optional detail text (stack / ruleCode). Rendered in muted small text. */
  detail?: string;
  /** Retry handler — when set, the button renders. */
  onRetry?: () => void;
}

export const ScheduleGridError = memo(function ScheduleGridError({
  message = 'We could not generate the schedule.',
  detail,
  onRetry,
}: ScheduleGridErrorProps) {
  return (
    <div
      role="alert"
      data-testid="sg-state-error"
      className="flex flex-col items-center justify-center gap-3 py-16 px-6 mx-auto max-w-md text-center"
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-center h-12 w-12 rounded-full"
        style={{
          background: 'var(--severity-hard-surface)',
          border: `1px solid var(--severity-hard-border)`,
        }}
      >
        <IconError size="md" className="text-[var(--severity-hard)]" />
      </div>
      <h2 className="sg-section-header" style={{ fontSize: 'var(--font-sm)' }}>
        Generation failed
      </h2>
      <p className="text-[var(--font-sm)] leading-snug text-neutral-800">{message}</p>
      {detail && (
        <p className="text-[var(--font-xs)] leading-snug text-neutral-500 tabular-nums">
          {detail}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          data-testid="sg-state-error-retry"
          onClick={onRetry}
          className="mt-2 rounded-md border px-3 py-1.5 text-[var(--font-sm)] font-medium focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-shadow"
          style={{
            background: 'white',
            borderColor: 'var(--severity-hard-border)',
            color: 'var(--severity-hard)',
            transition: 'box-shadow var(--sg-transition-fast), background-color var(--sg-transition-fast)',
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────
   Loading state — skeleton grid
   ────────────────────────────────────────────────────────────── */

export interface ScheduleGridLoadingProps {
  /** Number of skeleton rows; defaults to 12 (~2 hours at 10-min density). */
  rows?: number;
  /** Number of skeleton columns; defaults to 3. */
  columns?: number;
  /** Slot height in px; defaults to design-token default. */
  slotHeightPx?: number;
  /** Optional message under the spinner. */
  message?: string;
}

export const ScheduleGridLoading = memo(function ScheduleGridLoading({
  rows = 12,
  columns = 3,
  slotHeightPx = 32,
  message = 'Generating schedule…',
}: ScheduleGridLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sg-state-loading"
      className="flex flex-col gap-3 py-6 px-4"
    >
      <div className="flex items-center gap-2 text-[var(--font-sm)] text-neutral-600">
        <span
          aria-hidden="true"
          data-testid="sg-state-loading-spinner"
          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-[rgba(17,24,39,0.15)] border-t-[oklch(48%_0.15_250)] animate-spin"
          style={{ animationDuration: 'var(--duration-long)' }}
        />
        {message}
      </div>
      <div
        aria-hidden="true"
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows * columns }, (_, i) => (
          <div
            key={`skeleton-${i}`}
            data-testid="sg-state-loading-row"
            className="rounded-[var(--block-radius)] animate-pulse"
            style={{
              height: slotHeightPx,
              background: i % 7 === 0 ? 'var(--d-zone-fill)' : 'var(--a-zone-tint)',
              border: '1px solid var(--block-border)',
              animationDuration: 'var(--duration-long)',
            }}
          />
        ))}
      </div>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────
   No-violations state — the happy case shown under the canvas
   ────────────────────────────────────────────────────────────── */

export interface ScheduleGridNoViolationsProps {
  /** Label for the badge — defaults to "All 15 anti-patterns clean". */
  label?: string;
}

export const ScheduleGridNoViolations = memo(function ScheduleGridNoViolations({
  label = 'All 15 anti-patterns clean',
}: ScheduleGridNoViolationsProps) {
  return (
    <div
      role="status"
      data-testid="sg-state-no-violations"
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[var(--font-xs)] font-medium"
      style={{
        background: 'oklch(96% 0.025 160)',
        borderColor: 'oklch(65% 0.120 160 / 0.40)',
        color: 'oklch(35% 0.110 160)',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: 'oklch(55% 0.150 160)' }}
      />
      <span data-micro={label.length < 20 ? 'true' : 'false'}>{label}</span>
    </div>
  );
});

const ScheduleGridStates = {
  Empty: ScheduleGridEmpty,
  Error: ScheduleGridError,
  Loading: ScheduleGridLoading,
  NoViolations: ScheduleGridNoViolations,
};
export default ScheduleGridStates;
