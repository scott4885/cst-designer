"use client";

/**
 * Sprint 6 Epic R — Commit-variant controls.
 *
 * Buttons "Use Growth", "Use Access", "Use Balanced", "Undo commitment".
 * Opens a confirmation dialog explaining that the commitment is advisory
 * only — it does not activate the template in production.
 *
 * Shows the currently committed variant as a chip + a compact history
 * trail (last 3 commitments). Idempotent: clicking the already-committed
 * variant is a no-op.
 *
 * See SPRINT-6-PLAN §6.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type {
  AdvisoryArtifact,
  VariantCode,
  ChosenVariantHistoryEntry,
} from "@/lib/engine/advisory/types";

const VARIANT_COLOURS: Record<VariantCode, string> = {
  GROWTH: "bg-indigo-600 hover:bg-indigo-700",
  ACCESS: "bg-sky-600 hover:bg-sky-700",
  BALANCED: "bg-emerald-600 hover:bg-emerald-700",
};

const VARIANT_LABELS: Record<VariantCode, string> = {
  GROWTH: "Growth",
  ACCESS: "Access",
  BALANCED: "Balanced",
};

export interface VariantCommitControlsProps {
  officeId: string;
  artifact: AdvisoryArtifact | null;
  onCommitted: () => void;
}

export function VariantCommitControls({
  officeId,
  artifact,
  onCommitted,
}: VariantCommitControlsProps) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<VariantCode | null | false>(false);

  if (!artifact?.variants) return null;

  const committed = (artifact.chosenVariant ?? null) as VariantCode | null;
  const history = (artifact.chosenVariantHistory ?? []) as ChosenVariantHistoryEntry[];

  async function confirm() {
    if (pending === false) return;
    const target = pending;
    setBusy(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/advisory/commit-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisoryId: artifact?.id, variantCode: target }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.idempotent) {
        toast.info(
          target === null
            ? "No variant was committed."
            : `${VARIANT_LABELS[target]} is already committed.`,
        );
      } else {
        toast.success(
          target === null
            ? "Variant commitment cleared."
            : `${VARIANT_LABELS[target]} committed — 30/60/90 plan rescoped.`,
        );
      }
      setPending(false);
      onCommitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="variant-commit-controls">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>Commit a variant</span>
          {committed && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 uppercase"
              data-testid="variant-committed-chip"
            >
              Committed: {VARIANT_LABELS[committed]}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Committing a variant tells CST to rescope the 30/60/90 plan around
          that strategy. <b>Nothing changes on the live schedule.</b> The live
          template is only updated when you publish from the Templates
          workspace.
        </p>

        <div className="flex flex-wrap gap-2">
          {(["GROWTH", "ACCESS", "BALANCED"] as VariantCode[]).map((v) => {
            const isCommitted = committed === v;
            return (
              <Button
                key={v}
                type="button"
                className={`text-white ${VARIANT_COLOURS[v]} ${isCommitted ? "ring-2 ring-offset-2 ring-indigo-400" : ""}`}
                onClick={() => setPending(v)}
                disabled={busy || isCommitted}
                data-testid={`commit-variant-${v.toLowerCase()}`}
              >
                {isCommitted ? `${VARIANT_LABELS[v]} (current)` : `Use ${VARIANT_LABELS[v]}`}
              </Button>
            );
          })}
          {committed && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setPending(null)}
              disabled={busy}
              data-testid="commit-variant-undo"
            >
              Undo commitment
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div className="text-xs text-slate-600 border-t pt-2">
            <p className="font-semibold mb-1">Commitment history:</p>
            <ul className="space-y-0.5" data-testid="variant-commit-history">
              {history.slice(-3).reverse().map((h, ix) => (
                <li key={ix} className="flex justify-between">
                  <span>{h.variant ? VARIANT_LABELS[h.variant] : "Cleared"}</span>
                  <span className="text-slate-400">
                    {new Date(h.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <AlertDialog open={pending !== false} onOpenChange={(o) => !o && setPending(false)}>
          <AlertDialogContent data-testid="commit-variant-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pending === null
                  ? "Clear variant commitment?"
                  : pending
                    ? `Commit ${VARIANT_LABELS[pending]} variant?`
                    : ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pending === null
                  ? "The 30/60/90 plan will revert to the baseline (Balanced-weighted) KPIs."
                  : "This rescopes the 30/60/90 review-plan KPIs around the variant's weights. It does NOT publish the variant to the live schedule."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirm} disabled={busy}>
                {busy ? "Committing…" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
