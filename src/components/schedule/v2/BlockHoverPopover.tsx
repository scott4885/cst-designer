"use client";

/**
 * BlockHoverPopover — Sprint 2 Stream C (Polish)
 * ──────────────────────────────────────────────
 * Refined hover popover that anchors off the BlockInstance and surfaces
 * the full block metadata without obscuring the block itself.
 *
 * Typography contract:
 *   • Section headers — small caps, `letter-spacing: --letter-spacing-smallcaps`
 *   • Facts           — tight leading, `font-sm`, tabular-nums
 *   • Divider between facts + actions
 *   • Actions         — `font-sm`, action-blue
 *
 * Positioning contract:
 *   • Always anchors to the side of the block that has more room
 *     (right by default; mirrors to the left when within 320 px of the
 *     viewport edge). Never overlaps its own block.
 *   • Soft elevation: 1-px border + shadow-md. No scrim.
 *
 * Animation:
 *   • Fades in over `--duration-medium` with `--ease-out`.
 *   • `prefers-reduced-motion` zeroes the transition (tokens do the work).
 */

import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { PlacedBlock, Violation } from '@/lib/engine/types';
import { IconForProviderRole, IconWarning, IconSoft, IconInfo, type ProviderRoleCode } from './icons';

export interface BlockHoverPopoverProps {
  block: PlacedBlock;
  /** DOM element the popover is anchored to (the BlockInstance). */
  anchorEl: HTMLElement | null;
  /** Popover is shown while hovered or focused; parent owns this state. */
  open: boolean;
  /** Provider display name, used in the facts section. */
  providerName?: string;
  providerRole?: ProviderRoleCode;
  /** Optional violations to list under facts. */
  violations?: Violation[];
  /** Primary action — "Edit block". */
  onEdit?: () => void;
  /** Secondary action — "Replace". */
  onReplace?: () => void;
  /** Tertiary action — "Delete". */
  onDelete?: () => void;
}

function formatMinute(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function severityIcon(sev: 'HARD' | 'SOFT' | 'INFO') {
  if (sev === 'HARD') return IconWarning;
  if (sev === 'SOFT') return IconSoft;
  return IconInfo;
}

function severityClass(sev: 'HARD' | 'SOFT' | 'INFO') {
  if (sev === 'HARD') return 'text-[var(--severity-hard)]';
  if (sev === 'SOFT') return 'text-[var(--severity-soft)]';
  return 'text-[var(--severity-info)]';
}

const BlockHoverPopover = memo(function BlockHoverPopover({
  block,
  anchorEl,
  open,
  providerName,
  providerRole,
  violations = [],
  onEdit,
  onReplace,
  onDelete,
}: BlockHoverPopoverProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; side: 'left' | 'right' }>({ top: 0, left: 0, side: 'right' });

  useLayoutEffect(() => {
    if (!open || !anchorEl || !popRef.current) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const popRect = popRef.current.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;

    // Prefer right; flip to left when not enough room (≤ popover width + 16 px gap)
    const gap = 8;
    const spaceRight = vw - anchorRect.right;
    const side: 'left' | 'right' = spaceRight < popRect.width + 24 ? 'left' : 'right';
    const left =
      side === 'right'
        ? anchorRect.right + gap
        : Math.max(8, anchorRect.left - popRect.width - gap);
    const top = Math.min(
      Math.max(8, anchorRect.top),
      vh - popRect.height - 8,
    );
    setPos({ top, left, side });
  }, [open, anchorEl, block.blockInstanceId]);

  if (!open || !anchorEl) return null;

  const endMin = block.startMinute + block.durationMin;
  const role = providerRole ?? 'OTHER';

  return (
    <div
      ref={popRef}
      role="tooltip"
      data-testid="sg-block-hover-popover"
      data-side={pos.side}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 'var(--z-popover)' as unknown as number,
        minWidth: 260,
        maxWidth: 320,
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-2px)',
        transition: `opacity var(--sg-transition-med), transform var(--sg-transition-med)`,
      }}
      className="rounded-md bg-white border border-[rgba(17,24,39,0.08)] shadow-md overflow-hidden"
    >
      {/* Header row with provider + role */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <IconForProviderRole role={role} size="sm" className="text-neutral-700 shrink-0" />
        <div className="flex-1 min-w-0">
          <div
            className="sg-block-label font-semibold text-[var(--font-sm)] leading-tight text-neutral-900 truncate"
            data-micro={block.blockLabel.length < 20 ? 'true' : 'false'}
          >
            {block.blockLabel}
          </div>
          {providerName && (
            <div className="text-[var(--font-xs)] leading-tight text-neutral-500 truncate">
              {providerName}
            </div>
          )}
        </div>
      </div>

      {/* Facts section */}
      <div className="px-3 pb-2">
        <div className="sg-section-header mt-2 mb-1">Facts</div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[var(--font-sm)] leading-tight">
          <dt className="text-neutral-500">Time</dt>
          <dd className="text-neutral-900 tabular-nums">
            {formatMinute(block.startMinute)} – {formatMinute(endMin)} <span className="text-neutral-400">({block.durationMin}m)</span>
          </dd>
          <dt className="text-neutral-500">X-segments</dt>
          <dd className="text-neutral-900 tabular-nums">
            {block.asstPreMin}/{block.doctorMin}/{block.asstPostMin}
            <span className="text-neutral-400"> (pre/D/post)</span>
          </dd>
          {typeof block.productionAmount === 'number' && block.productionAmount > 0 && (
            <>
              <dt className="text-neutral-500">Production</dt>
              <dd className="text-neutral-900 tabular-nums">${block.productionAmount.toLocaleString()}</dd>
            </>
          )}
          {block.doctorStartMinute !== undefined && (
            <>
              <dt className="text-neutral-500">Doctor</dt>
              <dd className="text-neutral-900 tabular-nums">
                {formatMinute(block.doctorStartMinute)}
                {block.doctorContinuityRequired && (
                  <span
                    className="ml-1 inline-block rounded px-1 text-[var(--font-xs)] border"
                    style={{
                      background: 'var(--severity-soft-surface)',
                      borderColor: 'var(--severity-soft-border)',
                      color: 'var(--severity-soft)',
                    }}
                  >
                    continuity
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>

        {violations.length > 0 && (
          <>
            <div className="sg-section-header mt-3 mb-1">Issues</div>
            <ul className="flex flex-col gap-0.5">
              {violations.map((v, i) => {
                const Icon = severityIcon(v.severity);
                return (
                  <li
                    key={`${v.ap}-${i}`}
                    className="flex items-start gap-1.5 text-[var(--font-sm)] leading-tight"
                  >
                    <Icon
                      size="sm"
                      className={`${severityClass(v.severity)} shrink-0 mt-0.5`}
                    />
                    <span className="text-neutral-800">
                      <span className="font-semibold">{v.ap}</span> — {v.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Divider */}
      {(onEdit || onReplace || onDelete) && (
        <>
          <div className="h-px bg-[rgba(17,24,39,0.06)]" aria-hidden="true" />
          <div className="flex items-center gap-2 px-3 py-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-[var(--font-sm)] font-medium text-[oklch(48%_0.15_250)] hover:underline focus-visible:outline-none"
                data-testid="sg-popover-action-edit"
              >
                Edit
              </button>
            )}
            {onReplace && (
              <button
                type="button"
                onClick={onReplace}
                className="text-[var(--font-sm)] text-neutral-700 hover:underline focus-visible:outline-none"
                data-testid="sg-popover-action-replace"
              >
                Replace
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto text-[var(--font-sm)] text-[var(--severity-hard)] hover:underline focus-visible:outline-none"
                data-testid="sg-popover-action-delete"
              >
                Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default BlockHoverPopover;
