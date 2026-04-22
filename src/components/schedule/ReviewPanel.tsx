"use client";

/**
 * ReviewPanel — Loop 10 unified review surface
 * ────────────────────────────────────────────
 * Single panel replacing the orphaned ClinicalValidationPanel / ConflictPanel /
 * QualityScoreBadge trio. Renders three severity buckets — Must Fix (red),
 * Consider (amber), Opportunity (blue) — each with a "Jump to cell" link that
 * flashes the corresponding grid slot via the Zustand store's flashSlot().
 *
 * Top of panel:
 *   - Quality score pill (tier emoji + score/100 + tier label)
 *   - Optional "Couldn't clear floor" banner when the engine's retry envelope
 *     reports floorMet === false (surfaces the Loop 2 retry result visually so
 *     users know a schedule shipped below the quality floor).
 *
 * The panel is pure presentation — it receives pre-computed warnings,
 * conflicts, clinical warnings and the quality score. Nothing here runs the
 * engine; nothing here mutates the store except flashSlot() on jump-to-cell.
 */

import { useMemo } from "react";
import {
  XCircle,
  AlertTriangle,
  Info,
  ShieldCheck,
  ExternalLink,
  Flag,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useScheduleStore } from "@/store/schedule-store";
import type { QualityScore } from "@/lib/engine/quality-score";
import type { ClinicalWarning } from "@/lib/engine/clinical-rules";
import type { ConflictResult } from "@/lib/engine/stagger";
import type { DTimeConflict } from "@/lib/engine/da-time";

// ─── Props ──────────────────────────────────────────────────────────────
export interface ReviewPanelProps {
  qualityScore?: QualityScore;
  clinicalWarnings: ClinicalWarning[];
  conflicts: ConflictResult[];
  dTimeConflicts: DTimeConflict[];
  /** Free-form warnings from the generation result (retry envelope, etc.). */
  scheduleWarnings: string[];
  /**
   * Called when the user clicks "Jump to cell" on an item. The parent is
   * responsible for scrolling the grid viewport to the target cell (the
   * flash-pulse outline is already triggered by flashSlot()).
   */
  onJumpToCell?: (time: string, providerId: string) => void;
}

// ─── Severity buckets ──────────────────────────────────────────────────
type Severity = "must-fix" | "consider" | "opportunity";

interface ReviewItem {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
  time?: string;
  providerId?: string;
  // Grouping header text for the section
  source: string;
}

const SEVERITY_META: Record<
  Severity,
  { label: string; bg: string; border: string; text: string; icon: typeof XCircle; pill: string }
> = {
  "must-fix": {
    label: "Must Fix",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    pill: "bg-red-100 text-red-700",
    icon: XCircle,
  },
  "consider": {
    label: "Consider",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    pill: "bg-amber-100 text-amber-700",
    icon: AlertTriangle,
  },
  "opportunity": {
    label: "Opportunity",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    pill: "bg-blue-100 text-blue-700",
    icon: Info,
  },
};

// ─── Quality tier → pill colour mapping ────────────────────────────────
const TIER_PILL: Record<string, string> = {
  excellent: "bg-green-100 text-green-800 border-green-300",
  good: "bg-yellow-100 text-yellow-800 border-yellow-300",
  fair: "bg-orange-100 text-orange-800 border-orange-300",
  needs_work: "bg-red-100 text-red-800 border-red-300",
};

// ─── Retry envelope parser ─────────────────────────────────────────────
/**
 * Parse a Loop 2 retry envelope warning of the form:
 *   "QUALITY_RETRY: used 3/3 attempts, floorMet=false, scores=[62, 64, 71]"
 * Returns null if not a retry warning or if floorMet is missing/true.
 */
function parseRetryEnvelope(warnings: string[]): {
  attemptsUsed: string;
  floorMet: boolean;
  scores: string;
} | null {
  for (const w of warnings) {
    if (!w.startsWith("QUALITY_RETRY:")) continue;
    const attemptMatch = w.match(/used\s+(\d+\/\d+)\s+attempts/);
    const floorMatch = w.match(/floorMet\s*=\s*(true|false)/);
    const scoresMatch = w.match(/scores\s*=\s*(\[.+?\])/);
    if (!floorMatch) continue;
    return {
      attemptsUsed: attemptMatch?.[1] ?? "?/?",
      floorMet: floorMatch[1] === "true",
      scores: scoresMatch?.[1] ?? "[]",
    };
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────────
export default function ReviewPanel({
  qualityScore,
  clinicalWarnings,
  conflicts,
  dTimeConflicts,
  scheduleWarnings,
  onJumpToCell,
}: ReviewPanelProps) {
  const flashSlot = useScheduleStore((s) => s.flashSlot);
  const retry = useMemo(() => parseRetryEnvelope(scheduleWarnings), [scheduleWarnings]);

  // Build unified item list
  const items: ReviewItem[] = useMemo(() => {
    const out: ReviewItem[] = [];

    // 1. Hard conflicts → must-fix
    conflicts.forEach((c, i) => {
      out.push({
        id: `conflict-${i}`,
        severity: "must-fix",
        title: `Double-booking at ${c.time}`,
        detail: `Same provider in ${c.operatories.join(" and ")} — blocks: ${c.blockLabels.join(", ")}`,
        time: c.time,
        providerId: c.providerId,
        source: "Conflict",
      });
    });

    // 2. D-time conflicts → must-fix
    dTimeConflicts.forEach((c, i) => {
      out.push({
        id: `dtime-${i}`,
        severity: "must-fix",
        title: `D-time overlap at ${c.time}`,
        detail: `${c.providerName} has hands-on time in ${c.operatories.join(", ")} simultaneously (${c.blockLabels.join(", ")})`,
        time: c.time,
        providerId: c.providerId,
        source: "D-time overlap",
      });
    });

    // 3. Clinical warnings → error→must-fix, warning→consider, info→opportunity
    clinicalWarnings.forEach((w, i) => {
      const severity: Severity =
        w.severity === "error"
          ? "must-fix"
          : w.severity === "warning"
          ? "consider"
          : "opportunity";
      out.push({
        id: `clinical-${w.ruleId}-${i}`,
        severity,
        title: w.message,
        detail: w.affectedProvider ? `Provider: ${w.affectedProvider}` : undefined,
        time: w.affectedTime,
        source: "Clinical",
      });
    });

    return out;
  }, [conflicts, dTimeConflicts, clinicalWarnings]);

  const mustFix = items.filter((i) => i.severity === "must-fix");
  const consider = items.filter((i) => i.severity === "consider");
  const opportunity = items.filter((i) => i.severity === "opportunity");

  const handleJump = (time: string, providerId: string) => {
    flashSlot(time, providerId);
    onJumpToCell?.(time, providerId);
  };

  const renderItem = (item: ReviewItem) => {
    const meta = SEVERITY_META[item.severity];
    const Icon = meta.icon;
    const canJump = !!item.time && !!item.providerId;
    return (
      <li
        key={item.id}
        className={`rounded-md border p-2.5 ${meta.bg} ${meta.border}`}
      >
        <div className="flex items-start gap-2">
          <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${meta.text}`} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${meta.pill}`}>
                {item.source}
              </span>
              {item.time && (
                <span className="text-[10px] font-mono text-muted-foreground">@{item.time}</span>
              )}
            </div>
            <p className={`text-xs leading-snug ${meta.text}`}>{item.title}</p>
            {item.detail && (
              <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">{item.detail}</p>
            )}
            {canJump && (
              <button
                type="button"
                onClick={() => handleJump(item.time!, item.providerId!)}
                className={`inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${meta.pill} hover:opacity-80 transition-opacity`}
                aria-label={`Jump to cell at ${item.time}`}
              >
                <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                Jump to cell
              </button>
            )}
          </div>
        </div>
      </li>
    );
  };

  const totalItems = items.length;
  const isClean = totalItems === 0 && (!retry || retry.floorMet);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Review</h3>
          </div>
          {qualityScore && (
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
                TIER_PILL[qualityScore.tier] ?? TIER_PILL.needs_work
              }`}
              title={`Schedule quality: ${qualityScore.tierLabel} (${qualityScore.total}/100)`}
              aria-label={`Schedule quality score ${qualityScore.total} of 100, ${qualityScore.tierLabel}`}
            >
              <span className="text-sm leading-none">{qualityScore.emoji}</span>
              <span className="tabular-nums">{qualityScore.total}/100</span>
              <span className="font-semibold">{qualityScore.tierLabel}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {mustFix.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
              {mustFix.length} must fix
            </span>
          )}
          {consider.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
              {consider.length} consider
            </span>
          )}
          {opportunity.length > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
              {opportunity.length} opportunity
            </span>
          )}
          {isClean && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
              ✓ All clear
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3 flex-1 overflow-y-auto">
        {/* Couldn't-clear-floor banner — lives inside Must Fix */}
        {retry && !retry.floorMet && (
          <div className="rounded-md border border-red-300 bg-red-100 p-2.5 flex items-start gap-2">
            <Flag className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-800">
                Couldn&apos;t clear quality floor
              </p>
              <p className="text-[11px] leading-snug text-red-700 mt-0.5">
                Generator used {retry.attemptsUsed} attempts and none cleared the quality
                floor. Best score shown. Consider adjusting providers, breaks, or targets.
              </p>
              <p className="text-[10px] font-mono text-red-600 mt-0.5">scores={retry.scores}</p>
            </div>
          </div>
        )}

        {mustFix.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-red-700 mb-1.5">
              Must Fix ({mustFix.length})
            </h4>
            <ul className="space-y-1.5 list-none">{mustFix.map(renderItem)}</ul>
          </section>
        )}

        {consider.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
              Consider ({consider.length})
            </h4>
            <ul className="space-y-1.5 list-none">{consider.map(renderItem)}</ul>
          </section>
        )}

        {opportunity.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1.5">
              Opportunity ({opportunity.length})
            </h4>
            <ul className="space-y-1.5 list-none">{opportunity.map(renderItem)}</ul>
          </section>
        )}

        {isClean && (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-green-500" aria-hidden="true" />
            <span>Nothing to review. Schedule looks clean.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
