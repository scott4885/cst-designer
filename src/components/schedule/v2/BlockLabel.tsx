"use client";

/**
 * BlockLabel — Sprint 2 Stream B
 * ──────────────────────────────
 * Legible, wrap-only label for a placed block. Never truncates with "…".
 * When the block is too short to fit the full label, renders a 2-3 char
 * short code (HP / MP / NP) and an "i" glyph; consumers attach the popover.
 *
 * Contracts:
 *   - Always shows: short code + production $ (if provided)
 *   - When tall enough: full label wraps to multiple lines via text-balance
 *   - No truncation / ellipsis
 *
 * PRD-V4 UX-L1 (multi-row block rendering), UX-L8 (overflow strategy).
 * Bible §2.1, §2.2.
 */

import { memo, useMemo } from 'react';
import { Info } from 'lucide-react';

export interface BlockLabelProps {
  label: string;
  shortCode?: string;
  /** Dollar amount for HP / MP / NP etc. When provided, shown under the label. */
  productionAmount?: number | null;
  /** Effective pixel height of the block. Drives the short-code fallback. */
  heightPx: number;
  /** When true, render the info glyph next to the short code (popover trigger). */
  showInfoGlyph?: boolean;
  /** When true, label is rendered in its compact form regardless of height. */
  forceCompact?: boolean;
}

/**
 * Derive a 2–3 character short code from a block label when no explicit one
 * is provided. Matches Bible §5 canonical labels (HP, MP, ER, NP, RC, SRP, PM).
 */
export function deriveShortCode(label: string): string {
  if (!label) return '—';
  const upper = label.toUpperCase();
  // Known canonical prefixes — see Bible §5
  if (upper.startsWith('HP') || upper.startsWith('HIGH ')) return 'HP';
  if (upper.startsWith('MP') || upper.startsWith('MEDIUM ') || upper.startsWith('MED ')) return 'MP';
  if (upper.startsWith('ER') || upper.startsWith('EMERGENCY')) return 'ER';
  if (upper.startsWith('NP') || upper.startsWith('NEW ')) return 'NP';
  if (upper.startsWith('RC') || upper.startsWith('RECALL') || upper.startsWith('RECARE')) return 'RC';
  if (upper.startsWith('SRP') || upper.startsWith('SCALING')) return 'SRP';
  if (upper.startsWith('PM') || upper.startsWith('PROPHY')) return 'PM';
  if (upper.startsWith('NON')) return 'NP';  // non-production
  if (upper.startsWith('LUNCH')) return 'LN';
  // Fallback: first word up to 3 chars
  const firstWord = upper.split(/[\s>/-]/)[0];
  return firstWord.slice(0, 3) || upper.slice(0, 3);
}

/**
 * Heuristic: under this height, we cannot reliably render full multi-line
 * labels without clipping. Falls back to short-code + info glyph.
 */
const COMPACT_THRESHOLD_PX = 36;

const BlockLabel = memo(function BlockLabel({
  label,
  shortCode,
  productionAmount,
  heightPx,
  showInfoGlyph = true,
  forceCompact = false,
}: BlockLabelProps) {
  const effectiveShortCode = useMemo(
    () => shortCode ?? deriveShortCode(label),
    [shortCode, label],
  );

  const compact = forceCompact || heightPx < COMPACT_THRESHOLD_PX;

  if (compact) {
    return (
      <div
        className="flex items-center justify-between gap-1 px-1 h-full"
        data-testid="sg-block-label-compact"
      >
        <span
          className="font-semibold tabular-nums text-[var(--font-xs)] text-neutral-900"
          aria-label={label}
          title={label}
        >
          {effectiveShortCode}
        </span>
        {showInfoGlyph && (
          <Info
            className="h-3 w-3 text-neutral-500 shrink-0"
            aria-hidden="true"
            data-testid="sg-block-info-glyph"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="sg-block-label flex flex-col gap-0.5 px-[var(--block-padding-x)] py-[var(--block-padding-y)] h-full justify-center"
      data-testid="sg-block-label-full"
    >
      <span className="font-semibold text-[var(--font-sm)] leading-tight text-neutral-900">
        {label}
      </span>
      {typeof productionAmount === 'number' && productionAmount > 0 && (
        <span className="text-[var(--font-xs)] tabular-nums text-neutral-600">
          ${productionAmount.toLocaleString()}
        </span>
      )}
    </div>
  );
});

export default BlockLabel;
