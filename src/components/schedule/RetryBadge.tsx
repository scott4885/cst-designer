"use client";

/**
 * RetryBadge — Loop 2 quality-floor retry envelope surfacing.
 *
 * Renders:
 *   - Nothing when attemptsUsed <= 1 (happy path — stay quiet).
 *   - A small neutral badge "Best of N" when retries ran and the floor
 *     was met. Hover reveals per-attempt scores.
 *   - A one-line amber warning strip when the floor was NOT met — this
 *     is a call to action ("adjust providers/goals").
 */

import { useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { RetryMetadata } from "@/lib/engine/retry-envelope";

interface RetryBadgeProps {
  metadata: RetryMetadata;
}

export function RetryBadge({ metadata }: RetryBadgeProps) {
  const [open, setOpen] = useState(false);

  // Happy path: single attempt cleared the floor — don't distract the user.
  if (metadata.attemptsUsed <= 1) return null;

  const scoresSummary = metadata.allAttemptScores
    .map((s, i) => `#${i + 1}: ${s}${i + 1 === metadata.selectedAttempt ? " ←" : ""}`)
    .join("\n");

  if (!metadata.floorMet) {
    // Didn't clear the floor — amber strip. Visible inline above schedule.
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-[11px] flex-shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="leading-tight">
          Couldn&rsquo;t clear the <strong>{metadata.tierFloor}</strong> quality floor after{" "}
          {metadata.attemptsUsed} {metadata.attemptsUsed === 1 ? "try" : "tries"} — best attempt
          shown (score {Math.max(...metadata.allAttemptScores)}). Consider adjusting providers or
          daily goals.
        </span>
        <span className="ml-auto text-[10px] text-amber-700/70 tabular-nums" title={scoresSummary}>
          attempts: [{metadata.allAttemptScores.join(", ")}]
        </span>
      </div>
    );
  }

  // Cleared the floor — quiet badge so the user knows retries happened.
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-sky-200 bg-sky-50 text-sky-800 text-[11px] font-medium hover:bg-sky-100 transition-colors"
        title={`Best of ${metadata.attemptsUsed} attempts\n${scoresSummary}`}
        aria-label={`Best of ${metadata.attemptsUsed} attempts. Selected attempt ${metadata.selectedAttempt}.`}
        aria-expanded={open}
      >
        <Sparkles className="w-3 h-3" />
        Best of {metadata.attemptsUsed}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-md border bg-popover shadow-lg z-50 p-2 text-[11px]">
          <div className="font-semibold text-slate-800 mb-1">Retry attempts</div>
          <ul className="space-y-0.5">
            {metadata.allAttemptScores.map((s, i) => (
              <li
                key={i}
                className={`flex items-center justify-between tabular-nums ${
                  i + 1 === metadata.selectedAttempt ? "font-semibold text-slate-900" : "text-slate-600"
                }`}
              >
                <span>
                  #{i + 1} {i + 1 === metadata.selectedAttempt && <span className="text-sky-600">(kept)</span>}
                </span>
                <span>{s}/100</span>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 pt-1.5 border-t text-[10px] text-slate-500">
            Floor: {metadata.tierFloor} &middot; cap: {metadata.maxAttempts}
          </div>
        </div>
      )}
    </div>
  );
}

export default RetryBadge;
