"use client";

/**
 * Sprint 6 Epic S — First-run walkthrough.
 *
 * Lightweight 4-step tour dialog. Stored completion in localStorage under
 * `cst:sprint6:walkthrough-dismissed`. Explicitly dismissable + re-openable
 * from the banner's "?" icon.
 *
 * Pure client-side. No PHI. No analytics. Accessible via keyboard (Tab /
 * Enter / Esc) — drives the DoD "0 new axe violations" target.
 *
 * See SPRINT-6-PLAN §7.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HelpCircle } from "lucide-react";

const LS_KEY = "cst:sprint6:walkthrough-dismissed";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "1 — Fill out intake",
    body: "Start with the Intake section above. Advisory generation unlocks at 80% completeness.",
  },
  {
    title: "2 — Upload your current template (optional)",
    body: "Drop in your existing weekly schedule (CSV, XLSX, or DOCX). CST will compare it to the recommended template and show you the KPI and axis deltas.",
  },
  {
    title: "3 — Generate advisory + variants",
    body: "Click Generate Advisory for the recommended template, or Generate 3 Variants to see Growth / Access / Balanced side-by-side.",
  },
  {
    title: "4 — Refine & commit",
    body: "Click Refine with AI to let Claude tighten the prose (structure and scores are preserved). Commit a variant to rescope the 30/60/90 review plan — this never changes your live schedule.",
  },
];

/** Read localStorage synchronously during the initial render. Safe because
 *  this file is only imported from a client component. Avoids the
 *  set-state-in-effect anti-pattern. */
function initialOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !localStorage.getItem(LS_KEY);
  } catch {
    return false;
  }
}

export function FirstRunWalkthrough() {
  const [open, setOpen] = useState<boolean>(initialOpen);
  const [step, setStep] = useState(0);

  function closeAndDismiss() {
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
    setStep(0);
  }

  function restart() {
    setStep(0);
    setOpen(true);
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={restart}
        data-testid="walkthrough-reopen"
        aria-label="Open advisory walkthrough"
      >
        <HelpCircle className="h-4 w-4 mr-1" />
        Walkthrough
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeAndDismiss())}>
        <DialogContent data-testid="walkthrough-dialog" aria-label="Advisory workflow walkthrough">
          <DialogHeader>
            <DialogTitle>{current.title}</DialogTitle>
            <DialogDescription>{current.body}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <div className="flex gap-1" aria-hidden="true">
              {STEPS.map((_, ix) => (
                <span
                  key={ix}
                  className={`h-1.5 w-6 rounded-full ${
                    ix <= step ? "bg-indigo-500" : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={closeAndDismiss}
              data-testid="walkthrough-skip"
            >
              Skip tour
            </Button>
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                data-testid="walkthrough-back"
              >
                Back
              </Button>
            )}
            <Button
              type="button"
              onClick={() =>
                isLast ? closeAndDismiss() : setStep((s) => Math.min(STEPS.length - 1, s + 1))
              }
              data-testid="walkthrough-next"
            >
              {isLast ? "Got it" : "Next"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
