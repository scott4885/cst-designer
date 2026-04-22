"use client";

/**
 * Sprint 6 Epic S — Workflow banner.
 *
 * Horizontal stepper pinned above the advisory page showing where the user
 * is in the 4-step workflow:
 *   1. Intake (80% gate)
 *   2. Upload prior template (optional)
 *   3. Generate advisory + variants
 *   4. Refine & commit
 *
 * Pure presentation — the parent computes step completeness and passes it in.
 *
 * See SPRINT-6-PLAN §7.
 */

import { CheckCircle2, Circle, Dot } from "lucide-react";

export type WorkflowStepId = "intake" | "upload" | "generate" | "commit";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  state: "done" | "current" | "pending" | "optional";
  hint?: string;
}

export interface WorkflowBannerProps {
  steps: WorkflowStep[];
}

export function WorkflowBanner({ steps }: WorkflowBannerProps) {
  return (
    <div
      className="rounded-md border border-slate-200 bg-white px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
      data-testid="workflow-banner"
      aria-label="Advisory workflow progress"
    >
      {steps.map((s, ix) => {
        const icon =
          s.state === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          ) : s.state === "current" ? (
            <Dot className="h-6 w-6 text-indigo-600 -ml-1" aria-hidden="true" />
          ) : (
            <Circle className="h-4 w-4 text-slate-300" aria-hidden="true" />
          );
        // WCAG AA contrast on white bg requires ≥ 4.5:1 for normal text.
        // text-slate-400 is ~2.8:1 on white — use slate-600 (~4.7:1) for inactive steps.
        const textColour =
          s.state === "done"
            ? "text-slate-700"
            : s.state === "current"
              ? "text-indigo-700 font-semibold"
              : "text-slate-600";
        return (
          <div
            key={s.id}
            className="flex items-center gap-2"
            data-testid={`workflow-step-${s.id}`}
            data-state={s.state}
          >
            <span aria-hidden="true">{icon}</span>
            <span className={`text-sm ${textColour}`}>
              {ix + 1}. {s.label}
              {s.state === "optional" && (
                <span className="ml-1 text-[10px] uppercase text-slate-600">
                  optional
                </span>
              )}
            </span>
            {s.hint && s.state === "current" && (
              <span className="hidden sm:inline text-xs text-slate-600">
                — {s.hint}
              </span>
            )}
            {ix < steps.length - 1 && (
              <span className="hidden sm:inline text-slate-300">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
