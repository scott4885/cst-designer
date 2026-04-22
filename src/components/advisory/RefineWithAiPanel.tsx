"use client";

/**
 * Sprint 6 Epic Q — Claude Opus rewrite panel.
 *
 * "Refine with AI" button + side-by-side diff + Accept/Reject controls.
 * Rate-limited to 3 generations / office / 24h server-side. Fact-check
 * violations are surfaced inline; ACCEPT is disabled when the rewrite
 * didn't pass fact-check.
 *
 * See SPRINT-6-PLAN §5.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type {
  AdvisoryArtifact,
  FactCheckResult,
  FactCheckViolation,
  RewriteState,
} from "@/lib/engine/advisory/types";

export interface RefineWithAiPanelProps {
  officeId: string;
  artifact: AdvisoryArtifact | null;
  enabled: boolean;                       // NEXT_PUBLIC_ADVISORY_REWRITE_ENABLED
  onStateChange: () => void;              // parent refetches after ACCEPT/REJECT/GENERATE
}

function describeViolation(v: FactCheckViolation): string {
  switch (v.code) {
    case "SCORE_MUTATED":
      return `Score for ${v.axis} changed from ${v.original} to ${v.rewrite ?? "missing"}`;
    case "AXIS_MISSING":
      return `Axis "${v.axis}" missing from rewrite`;
    case "AXIS_INVENTED":
      return `Rewrite added an unknown axis "${v.axis}"`;
    case "RISK_DROPPED":
      return `Risk dropped: ${v.ruleCode ?? ""} ${v.plainEnglish ?? ""}`.trim();
    case "RISK_INVENTED":
      return `Rewrite invented a new risk: "${v.plainEnglish}"`;
    case "KPI_WHOLESALE_REMOVAL":
      return `KPI list changed from ${v.originalCount} to ${v.rewriteCount} items`;
    case "STRUCTURE_BROKEN":
      return `Missing section: ${v.missingSection}`;
  }
}

export function RefineWithAiPanel({
  officeId,
  artifact,
  enabled,
  onStateChange,
}: RefineWithAiPanelProps) {
  const [busy, setBusy] = useState(false);

  if (!enabled) return null;
  if (!artifact) return null;

  const state: RewriteState = artifact.rewriteState ?? "NONE";
  const hasRewrite = Boolean(artifact.documentRewrite);
  const rewriteText = artifact.documentRewrite?.rewrite ?? null;
  const factCheck: FactCheckResult | null =
    artifact.documentRewrite?.factCheck ?? null;
  const cached = artifact.documentRewrite?.cached ?? false;
  const costUsd = artifact.documentRewrite?.estimatedCostUsd ?? 0;

  async function runAction(action: "GENERATE" | "ACCEPT" | "REJECT") {
    setBusy(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/advisory/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advisoryId: artifact?.id, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (action === "GENERATE") {
        if (data.factCheck?.passed) {
          toast.success(
            data.cached
              ? "Refined advisory retrieved from cache."
              : `Refined advisory generated (≈$${Number(data.costUsd ?? 0).toFixed(3)}).`,
          );
        } else {
          toast.warning(
            `Refined advisory generated but fact-check failed — review before accepting.`,
          );
        }
      } else if (action === "ACCEPT") {
        toast.success("Refined advisory accepted.");
      } else {
        toast.info("Refined advisory rejected.");
      }
      onStateChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const acceptDisabled = !hasRewrite || !factCheck?.passed || busy;

  return (
    <Card data-testid="refine-with-ai-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span>Refine with AI</span>
          {hasRewrite && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase bg-indigo-50 text-indigo-800 border-indigo-200"
              data-testid="refine-state-badge"
            >
              {state}
              {cached ? " · cached" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Claude Opus rewrites the advisory prose only. Axis scores, risks,
          and section structure are preserved by a deterministic fact-check
          layer. Rate-limited to 3 generations per office per 24 hours.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => runAction("GENERATE")}
            disabled={busy}
            data-testid="refine-generate-btn"
          >
            {busy ? "Refining…" : hasRewrite ? "Regenerate" : "Refine with AI"}
          </Button>
          {hasRewrite && state !== "ACCEPTED" && (
            <>
              <Button
                type="button"
                variant="default"
                onClick={() => runAction("ACCEPT")}
                disabled={acceptDisabled}
                data-testid="refine-accept-btn"
              >
                Accept rewrite
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runAction("REJECT")}
                disabled={busy}
                data-testid="refine-reject-btn"
              >
                Reject
              </Button>
            </>
          )}
        </div>

        {factCheck && !factCheck.passed && (
          <div
            className="rounded-md border border-red-200 bg-red-50 text-red-900 px-3 py-2 text-xs space-y-1"
            data-testid="refine-factcheck-violations"
          >
            <p className="font-semibold">
              Fact-check failed — {factCheck.violations.length} violation(s):
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {factCheck.violations.map((v, ix) => (
                <li key={ix}>{describeViolation(v)}</li>
              ))}
            </ul>
          </div>
        )}

        {factCheck?.passed && hasRewrite && (
          <div className="rounded-md border border-green-200 bg-green-50 text-green-900 px-3 py-2 text-xs">
            Fact-check passed. Original scores, axes, and risks preserved.
          </div>
        )}

        {rewriteText && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Rewrite (Markdown preview)
              {costUsd > 0 && (
                <span className="ml-2 text-slate-600 font-normal">
                  ≈ ${costUsd.toFixed(3)}
                </span>
              )}
            </p>
            <pre
              className="bg-slate-50 border border-slate-200 rounded p-2 text-[11px] font-mono text-slate-700 whitespace-pre-wrap max-h-80 overflow-y-auto"
              data-testid="refine-rewrite-preview"
            >
              {rewriteText}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
