"use client";

import { useState, useRef, useEffect } from "react";
import type { QualityScore } from "@/lib/engine/quality-score";

interface QualityScoreBadgeProps {
  score: QualityScore;
}

const TIER_BADGE: Record<string, string> = {
  excellent:  "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700",
  good:       "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700",
  fair:       "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  needs_work: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
};

const TRACK_COLOR: Record<string, string> = {
  excellent:  "bg-green-500",
  good:       "bg-yellow-500",
  fair:       "bg-orange-500",
  needs_work: "bg-red-500",
};

export default function QualityScoreBadge({ score }: QualityScoreBadgeProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const tierStyle = TIER_BADGE[score.tier] ?? TIER_BADGE.needs_work;
  const trackColor = TRACK_COLOR[score.tier] ?? TRACK_COLOR.needs_work;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity ${tierStyle}`}
        onClick={() => setOpen(v => !v)}
        title="Schedule quality score — click for breakdown"
      >
        <span className="text-base leading-none">{score.emoji}</span>
        <span>{score.total}/100</span>
        <span className="opacity-75">{score.tierLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-lg border bg-popover shadow-lg z-50 overflow-hidden">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Schedule Quality Score</h4>
              <span className={`text-sm font-bold`}>
                {score.emoji} {score.total}/100
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${trackColor}`}
                style={{ width: `${score.total}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{score.tierLabel}</p>
          </div>
          <div className="p-3 space-y-2.5 max-h-72 overflow-y-auto">
            {score.components.map(comp => {
              const pct = comp.maxScore > 0 ? (comp.score / comp.maxScore) * 100 : 0;
              return (
                <div key={comp.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-medium">{comp.label}</span>
                    <span className="text-xs font-semibold tabular-nums">
                      {comp.score}/{comp.maxScore}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{comp.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
