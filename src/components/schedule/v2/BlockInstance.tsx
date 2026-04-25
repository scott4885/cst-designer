"use client";

/**
 * BlockInstance — Sprint 2 Stream B (redesigned v2)
 * ────────────────────────────────────────────────
 * Renders one PlacedBlock as either:
 *
 *   COMPACT (default, showXSegments=false):
 *     Solid provider-tinted card, 4px TOP accent strip carrying the
 *     X-segment proportions (A-pre / D / A-post) as three horizontally
 *     laid-out spans, 1px border, 6px radius, top-left anchored label,
 *     no shadow. The accent strip encodes the same information that
 *     Open Dental's left-edge time-bar does — just rotated 90°.
 *
 *   FULL-BAND (showXSegments=true, legacy / diagnostic mode):
 *     Three full-height bands (A-pre / D / A-post) coloured separately
 *     so designers can study doctor-vs-assistant allocation inside a
 *     single block. Toggled from the grid toolbar.
 *
 * Label: top-left anchored (not vertically centred), Inter 600 13px,
 *   truncates with ellipsis. Dollar amount hides when block height
 *   < 56px (Google Calendar pattern — suppress secondary fields rather
 *   than resize the primary one).
 *
 * Elevation: **borders only, no shadow** (Linear density rule — at
 *   template-mode density, 100+ blocks with per-block shadows become
 *   visual soup).
 *
 * Left category stripe: **removed** from the compact view. The top
 *   accent strip already carries the provider-color signal; a left
 *   stripe would duplicate/compete. Category colour shows through in
 *   the accent strip's D-segment hue (future: swap to category-hue
 *   accent if we want that mapping).
 *
 * Bible: §2.1 (X-segment primitive), §3 (doctor-as-bottleneck invariant).
 * PRD-V4: UX-L1, UX-L2, UX-L3, UX-L6, UX-L9.
 * Reference study: BRIEF-BLOCK-REFERENCE-STUDY.md (Open Dental +
 * Linear + Google Calendar convergence).
 */

import { memo, useMemo } from 'react';
import type { PlacedBlock, Violation } from '@/lib/engine/types';
import BlockLabel from './BlockLabel';
import { IconWarning, IconSoft, IconInfo } from './icons';
import { useScheduleView } from '@/store/use-schedule-view';

export interface BlockInstanceProps {
  block: PlacedBlock;
  /** Height of a single 10-min slot row in px. */
  slotHeightPx: number;
  /** Colour for the block / provider — drives accent strip + body tint. */
  providerColor?: string;
  /** Soft/low-chroma version of the provider colour — used as the
   *  compact-view body fill. Falls back to `--a-zone-tint` when absent. */
  providerColorSoft?: string;
  /** Whether the block is currently hovered or selected. */
  isHovered?: boolean;
  isSelected?: boolean;
  /** Violations affecting this block (drives the badge row). */
  violations?: Violation[];
  /** When true, render the hygiene doctor-exam glyph on the D band (UX-L3). */
  isHygieneBlock?: boolean;
  /**
   * When the block is a hygiene block whose D-band is a doctor-check exam,
   * highlight that single unit with a thin top border (polish-brief item).
   * Defaults to `isHygieneBlock` when not provided.
   */
  highlightHygieneExamSlot?: boolean;
  /** Procedure category — reserved; not currently rendered in compact view. */
  procedureCategory?: ProcedureCategoryCode;
  /** Fires when the block is clicked / Enter is pressed on the block. */
  onActivate?: (blockId: string) => void;
  onHoverChange?: (blockId: string | null) => void;
}

/**
 * Procedure-category codes — drive the UX-L6 left-border stripe colour.
 * Token-mapped in design-tokens.css under `--sg-category-*`.
 */
export type ProcedureCategoryCode =
  | 'MAJOR_RESTORATIVE'
  | 'ENDODONTICS'
  | 'BASIC_RESTORATIVE'
  | 'PERIODONTICS'
  | 'NEW_PATIENT_DIAG'
  | 'EMERGENCY_ACCESS'
  | 'ORAL_SURGERY'
  | 'PROSTHODONTICS';

const CATEGORY_VAR: Record<ProcedureCategoryCode, string> = {
  MAJOR_RESTORATIVE: 'var(--sg-category-major-restorative)',
  ENDODONTICS: 'var(--sg-category-endodontics)',
  BASIC_RESTORATIVE: 'var(--sg-category-basic-restorative)',
  PERIODONTICS: 'var(--sg-category-periodontics)',
  NEW_PATIENT_DIAG: 'var(--sg-category-new-patient-diag)',
  EMERGENCY_ACCESS: 'var(--sg-category-emergency-access)',
  ORAL_SURGERY: 'var(--sg-category-oral-surgery)',
  PROSTHODONTICS: 'var(--sg-category-prosthodontics)',
};

/** Highest-severity badge icon. */
function severityIcon(sev: 'HARD' | 'SOFT' | 'INFO') {
  if (sev === 'HARD') return IconWarning;
  if (sev === 'SOFT') return IconSoft;
  return IconInfo;
}

function severityClass(sev: 'HARD' | 'SOFT' | 'INFO'): string {
  if (sev === 'HARD') return 'text-[var(--severity-hard)]';
  if (sev === 'SOFT') return 'text-[var(--severity-soft)]';
  return 'text-[var(--severity-info)]';
}

/** Height threshold (px) below which secondary label content (dollar
 *  amount, sublines) is suppressed. Google Calendar 2024 pattern. */
const SECONDARY_LABEL_THRESHOLD_PX = 56;

const BlockInstance = memo(function BlockInstance({
  block,
  slotHeightPx,
  providerColor,
  providerColorSoft,
  isHovered = false,
  isSelected = false,
  violations = [],
  isHygieneBlock = false,
  highlightHygieneExamSlot,
  procedureCategory,
  onActivate,
  onHoverChange,
}: BlockInstanceProps) {
  const showXSegments = useScheduleView((s) => s.showXSegments);

  const durationSlots = Math.max(1, Math.round(block.durationMin / 10));
  const preSlots = Math.round((block.asstPreMin ?? 0) / 10);
  const docSlots = Math.round((block.doctorMin ?? 0) / 10);
  const postSlots = Math.max(0, durationSlots - preSlots - docSlots);

  const totalHeightPx = durationSlots * slotHeightPx;
  const preHeightPx = preSlots * slotHeightPx;
  const docHeightPx = docSlots * slotHeightPx;
  const postHeightPx = postSlots * slotHeightPx;

  // Accent-strip proportions (sum to totalMin; flex-basis handles the
  // layout math). When any segment is zero it collapses naturally.
  const totalMin = Math.max(1, block.durationMin);
  const prePct = ((block.asstPreMin ?? 0) / totalMin) * 100;
  const docPct = ((block.doctorMin ?? 0) / totalMin) * 100;
  const postPct = Math.max(0, 100 - prePct - docPct);

  const highestSev = useMemo(() => {
    if (!violations?.length) return null;
    if (violations.some((v) => v.severity === 'HARD')) return 'HARD' as const;
    if (violations.some((v) => v.severity === 'SOFT')) return 'SOFT' as const;
    return 'INFO' as const;
  }, [violations]);

  // Borders-only elevation (Linear rule). Selected / hover / severity
  // compose the outline ring; no block-shadow.
  let outlineStyle: React.CSSProperties | undefined;
  if (highestSev === 'HARD') {
    outlineStyle = { boxShadow: '0 0 0 2px var(--severity-hard)' };
  } else if (isSelected) {
    outlineStyle = { boxShadow: 'var(--focus-ring)' };
  } else if (highestSev === 'SOFT') {
    outlineStyle = { boxShadow: '0 0 0 2px var(--severity-soft)' };
  } else if (isHovered) {
    outlineStyle = { boxShadow: '0 0 0 1px var(--block-border-strong)' };
  }

  // Compact-view body tint: provider-soft if available, fall back to the
  // neutral A-zone tint. Matches Dentrix / Open Dental convention of
  // "provider identity lives in the fill."
  const bodyFill = providerColorSoft ?? 'var(--a-zone-tint)';
  const accentColor = providerColor ?? 'var(--block-border-strong)';

  // Accent-strip colors: D segment uses full provider color; A segments
  // use a darker mix (via CSS color-mix at render time in the style tag).
  const accentDoctor = accentColor;
  const accentAssist =
    providerColor
      ? `color-mix(in oklch, ${providerColor} 70%, black 15%)`
      : 'var(--block-border-strong)';

  // Category signal (reserved — not currently painted in compact view).
  const _categoryColor = procedureCategory
    ? CATEGORY_VAR[procedureCategory]
    : undefined;

  const effectiveHighlightExam = highlightHygieneExamSlot ?? isHygieneBlock;
  const showSecondaryLabel = totalHeightPx >= SECONDARY_LABEL_THRESHOLD_PX;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Block ${block.blockLabel}, ${block.durationMin} minutes starting minute ${block.startMinute}`}
      data-testid="sg-block-instance"
      data-block-id={block.blockInstanceId}
      data-duration-slots={durationSlots}
      data-pre-slots={preSlots}
      data-doctor-slots={docSlots}
      data-post-slots={postSlots}
      data-procedure-category={procedureCategory ?? undefined}
      data-view={showXSegments ? 'xsegments' : 'compact'}
      className="relative flex flex-col overflow-hidden rounded-[var(--block-radius)] cursor-pointer select-none focus-visible:outline-none"
      style={{
        height: totalHeightPx,
        background: showXSegments ? 'white' : bodyFill,
        border: `1px solid var(--block-border)`,
        willChange: 'height',
        transition:
          'height var(--sg-transition-fast), box-shadow var(--sg-transition-fast), border-color var(--sg-transition-fast)',
        ...outlineStyle,
      }}
      onClick={() => onActivate?.(block.blockInstanceId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate?.(block.blockInstanceId);
        }
      }}
      onMouseEnter={() => onHoverChange?.(block.blockInstanceId)}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={() => onHoverChange?.(block.blockInstanceId)}
      onBlur={() => onHoverChange?.(null)}
    >
      {showXSegments ? (
        <>
          {/* Legacy full-bleed 3-band view (diagnostic mode) */}
          {preSlots > 0 && (
            <div
              data-testid="sg-aband-pre"
              data-slots={preSlots}
              className="w-full"
              style={{
                height: preHeightPx,
                background: bodyFill,
                borderBottom: '1px solid var(--d-zone-border)',
              }}
              aria-hidden="true"
            />
          )}
          {docSlots > 0 && (
            <div
              data-testid="sg-dband"
              data-slots={docSlots}
              data-hygiene-exam={effectiveHighlightExam ? 'true' : 'false'}
              className="w-full relative flex-1 min-h-0"
              style={{
                height: docHeightPx,
                background: 'var(--d-zone-fill)',
                borderTop: effectiveHighlightExam
                  ? '2px solid var(--hygiene-exam-border)'
                  : preSlots > 0
                    ? '1px solid var(--d-zone-border)'
                    : undefined,
                borderBottom: postSlots > 0 ? '1px solid var(--d-zone-border)' : undefined,
              }}
              aria-hidden="true"
            >
              {isHygieneBlock && (
                <div
                  data-testid="sg-hygiene-exam-glyph"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(45deg, var(--hygiene-exam-stripe) 0 4px, transparent 4px 8px)',
                  }}
                  aria-hidden="true"
                />
              )}
              {isHygieneBlock && (
                <span
                  aria-hidden="true"
                  data-testid="sg-hygiene-exam-dot"
                  className="absolute top-1 left-1 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--hygiene-exam-border)' }}
                />
              )}
            </div>
          )}
          {postSlots > 0 && (
            <div
              data-testid="sg-aband-post"
              data-slots={postSlots}
              className="w-full"
              style={{
                height: postHeightPx,
                background: bodyFill,
                borderTop: '1px solid var(--d-zone-border)',
              }}
              aria-hidden="true"
            />
          )}
        </>
      ) : (
        /* Compact view: 4px top accent strip + solid tinted body */
        <div
          data-testid="sg-accent-strip"
          className="flex w-full"
          style={{ height: 4, flex: '0 0 4px' }}
          aria-hidden="true"
        >
          {prePct > 0 && (
            <span
              data-testid="sg-accent-pre"
              style={{ flexBasis: `${prePct}%`, background: accentAssist }}
            />
          )}
          {docPct > 0 && (
            <span
              data-testid="sg-accent-doc"
              style={{ flexBasis: `${docPct}%`, background: accentDoctor }}
            />
          )}
          {postPct > 0 && (
            <span
              data-testid="sg-accent-post"
              style={{ flexBasis: `${postPct}%`, background: accentAssist }}
            />
          )}
        </div>
      )}

      {/* Label — top-left anchored (Google Calendar / Linear / Open Dental
          pattern). In compact view the label sits above the solid body;
          in xsegments view it absolute-positions to stay readable over
          the 3-band backdrop. */}
      <div
        className={
          showXSegments
            ? 'absolute inset-0 flex flex-col justify-center pointer-events-none'
            : 'px-2 py-1 flex-1 min-h-0 flex flex-col pointer-events-none'
        }
        data-testid="sg-block-label-wrap"
      >
        <BlockLabel
          label={block.blockLabel}
          productionAmount={showSecondaryLabel ? block.productionAmount : null}
          heightPx={totalHeightPx}
          topAligned={!showXSegments}
        />
      </div>

      {/* Violation badge(s) — top-right. Severity carries via icon shape +
          colour AND a screen-reader-only text label so users with colour
          vision deficiency aren't relying on hue alone. */}
      {highestSev && (
        <div
          data-testid="sg-violation-badge"
          data-severity={highestSev}
          className="absolute top-1 right-1 flex items-center gap-0.5 pointer-events-auto"
          style={{ zIndex: 'var(--z-violation-badge)' as unknown as number }}
          title={violations.map((v) => `${v.ap}: ${v.message}`).join(' • ')}
        >
          <span className="sr-only">{`${highestSev} severity${violations.length > 1 ? `, ${violations.length} violations` : ''}: `}</span>
          {(() => {
            const Icon = severityIcon(highestSev);
            return (
              <Icon
                size="sm"
                className={severityClass(highestSev)}
                aria-hidden="true"
              />
            );
          })()}
          {violations.length > 1 && (
            <span
              aria-hidden="true"
              className={`text-[var(--font-xs)] font-bold ${severityClass(highestSev)}`}
            >
              {violations.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default BlockInstance;
