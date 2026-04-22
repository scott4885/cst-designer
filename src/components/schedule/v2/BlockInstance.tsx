"use client";

/**
 * BlockInstance — Sprint 2 Stream B
 * ─────────────────────────────────
 * Renders one PlacedBlock as a SINGLE rectangle that spans N 10-min rows
 * (N = durationMin / 10). Inside the rectangle:
 *
 *   1. A visible outline that groups the slots (UX-L1).
 *   2. Three X-segment bands — A-pre / D / A-post (UX-L2). A-zones get a
 *      subtle tint + side rule; D-zone is neutral fill + stronger outline.
 *   3. A single BlockLabel centred vertically (UX-L1, UX-L8).
 *   4. Optional violation badges (HARD / SOFT / INFO) from the guardReport.
 *
 * Bible: §2.1 (X-segment primitive), §3 (doctor-as-bottleneck invariant).
 * PRD-V4: UX-L1, UX-L2, UX-L3, UX-L6, UX-L9.
 * Sprint plan: T-201, T-202, T-203.
 */

import { memo, useMemo } from 'react';
import type { PlacedBlock, Violation } from '@/lib/engine/types';
import BlockLabel from './BlockLabel';
import { IconWarning, IconSoft, IconInfo } from './icons';

export interface BlockInstanceProps {
  block: PlacedBlock;
  /** Height of a single 10-min slot row in px. */
  slotHeightPx: number;
  /** Colour for the block / provider — used for the left accent bar. */
  providerColor?: string;
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
  /** Procedure category — drives the 3-px left-border stripe (UX-L6). */
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

const BlockInstance = memo(function BlockInstance({
  block,
  slotHeightPx,
  providerColor,
  isHovered = false,
  isSelected = false,
  violations = [],
  isHygieneBlock = false,
  highlightHygieneExamSlot,
  procedureCategory,
  onActivate,
  onHoverChange,
}: BlockInstanceProps) {
  const durationSlots = Math.max(1, Math.round(block.durationMin / 10));
  const preSlots = Math.round((block.asstPreMin ?? 0) / 10);
  const docSlots = Math.round((block.doctorMin ?? 0) / 10);
  const postSlots = Math.max(0, durationSlots - preSlots - docSlots);

  const totalHeightPx = durationSlots * slotHeightPx;
  const preHeightPx = preSlots * slotHeightPx;
  const docHeightPx = docSlots * slotHeightPx;
  const postHeightPx = postSlots * slotHeightPx;

  const highestSev = useMemo(() => {
    if (!violations?.length) return null;
    if (violations.some((v) => v.severity === 'HARD')) return 'HARD' as const;
    if (violations.some((v) => v.severity === 'SOFT')) return 'SOFT' as const;
    return 'INFO' as const;
  }, [violations]);

  const outlineClass = '';
  // Selected / hover / severity use the shared focus-ring token system so
  // states compose cleanly. Precedence: HARD sev > selected > SOFT sev >
  // hovered. INFO severity does NOT paint an outline (non-blocking).
  let sevBorderStyle: React.CSSProperties | undefined;
  if (highestSev === 'HARD') {
    sevBorderStyle = { boxShadow: '0 0 0 2px var(--severity-hard)' };
  } else if (isSelected) {
    sevBorderStyle = { boxShadow: 'var(--focus-ring)' };
  } else if (highestSev === 'SOFT') {
    sevBorderStyle = { boxShadow: '0 0 0 2px var(--severity-soft)' };
  } else if (isHovered) {
    sevBorderStyle = {
      boxShadow: '0 0 0 1px var(--block-border-strong)',
    };
  }

  // Left-border colour: procedure category takes precedence (UX-L6),
  // falling back to provider colour, then a neutral default.
  const leftBorderColor = procedureCategory
    ? CATEGORY_VAR[procedureCategory]
    : providerColor ?? 'var(--block-border)';

  const effectiveHighlightExam = highlightHygieneExamSlot ?? isHygieneBlock;

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
      className={`relative flex flex-col overflow-hidden rounded-[var(--block-radius)] bg-white cursor-pointer select-none focus-visible:outline-none ${outlineClass}`}
      style={{
        height: totalHeightPx,
        border: `1px solid var(--block-border)`,
        borderLeft: `4px solid ${leftBorderColor}`,
        willChange: 'height',
        transition:
          'height var(--sg-transition-fast), box-shadow var(--sg-transition-fast), border-color var(--sg-transition-fast)',
        ...sevBorderStyle,
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
      {/* A-pre band */}
      {preSlots > 0 && (
        <div
          data-testid="sg-aband-pre"
          data-slots={preSlots}
          className="w-full"
          style={{
            height: preHeightPx,
            background: 'var(--a-zone-tint)',
            borderBottom: '1px dashed var(--block-border)',
          }}
          aria-hidden="true"
        />
      )}

      {/* D band — where the doctor is hands-on */}
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

      {/* A-post band */}
      {postSlots > 0 && (
        <div
          data-testid="sg-aband-post"
          data-slots={postSlots}
          className="w-full"
          style={{
            height: postHeightPx,
            background: 'var(--a-zone-tint)',
            borderTop: '1px dashed var(--block-border)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Label — absolutely centred over the three bands */}
      <div
        className="absolute inset-0 flex flex-col justify-center pointer-events-none"
        data-testid="sg-block-label-wrap"
      >
        <BlockLabel
          label={block.blockLabel}
          productionAmount={block.productionAmount}
          heightPx={totalHeightPx}
        />
      </div>

      {/* Violation badge(s) — top-right */}
      {highestSev && (
        <div
          data-testid="sg-violation-badge"
          data-severity={highestSev}
          className="absolute top-1 right-1 flex items-center gap-0.5 pointer-events-auto"
          style={{ zIndex: 'var(--z-violation-badge)' as unknown as number }}
          title={violations.map((v) => `${v.ap}: ${v.message}`).join(' • ')}
        >
          {(() => {
            const Icon = severityIcon(highestSev);
            return (
              <Icon
                size="sm"
                className={severityClass(highestSev)}
              />
            );
          })()}
          {violations.length > 1 && (
            <span className={`text-[var(--font-xs)] font-bold ${severityClass(highestSev)}`}>
              {violations.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default BlockInstance;
