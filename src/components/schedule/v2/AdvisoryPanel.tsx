"use client";

/**
 * Sprint 5 Feature B — Advisory Panel.
 *
 * In-app rendering of the persisted AdvisoryArtifact returned by
 * POST /api/offices/:id/advisory. Shows the 6-axis score at the top,
 * the six advisory document sections below, a review-plan strip, and
 * (when variants are present) a 3-card comparison with the
 * recommendation banner.
 *
 * Controls: "Generate Advisory", "Generate 3 Variants", "Download .md",
 * "Copy as Prompt". Generation is gated by intake completeness (≥ 80%)
 * per SPRINT-5-PLAN §1 DoD.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type {
  AdvisoryArtifact,
  AxisScore,
  ScoreBand,
  TemplateScore,
  VariantSet,
  VariantResult,
  ReviewPlan,
} from "@/lib/engine/advisory/types";

export interface AdvisoryPanelProps {
  officeId: string;
  officeName: string;
  /** Latest persisted advisory, or null if none generated yet. */
  artifact: AdvisoryArtifact | null;
  /** Intake completeness 0-100 (from the most recent GET or computed locally). */
  completenessPct: number;
  /** Fires after POST completes so the parent can refresh and re-render. */
  onGenerated: (next: AdvisoryArtifact) => void;
}

const BAND_BG: Record<ScoreBand, string> = {
  weak: "bg-red-100 text-red-700 border-red-200",
  fair: "bg-amber-100 text-amber-700 border-amber-200",
  strong: "bg-green-100 text-green-700 border-green-200",
};

const BAND_BAR: Record<ScoreBand, string> = {
  weak: "bg-red-400",
  fair: "bg-amber-400",
  strong: "bg-green-500",
};

export function AdvisoryPanel({
  officeId,
  officeName: _officeName,
  artifact,
  completenessPct,
  onGenerated,
}: AdvisoryPanelProps) {
  const [busy, setBusy] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);

  const gateOpen = completenessPct >= 80;

  async function runGenerate(includeVariants: boolean) {
    if (!gateOpen) {
      toast.error(`Intake is ${completenessPct}% complete — need ≥80% to generate.`);
      return;
    }
    if (includeVariants) setVariantBusy(true);
    else setBusy(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/advisory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeVariants }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onGenerated(data.advisory);
      toast.success(
        includeVariants
          ? "Advisory + 3 variants generated."
          : "Advisory generated.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate advisory");
    } finally {
      setBusy(false);
      setVariantBusy(false);
    }
  }

  function downloadMarkdown() {
    if (!artifact) return;
    // Navigate to the markdown route — Content-Disposition triggers download.
    window.location.href = `/api/offices/${officeId}/advisory/markdown`;
  }

  async function copyAsPrompt() {
    if (!artifact) return;
    const prompt = renderAsPrompt(artifact);
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied to clipboard.");
    } catch {
      toast.error("Clipboard unavailable — try Download .md instead.");
    }
  }

  return (
    <div className="space-y-4" data-testid="advisory-panel">
      {/* Header + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Template Advisory</h2>
          <p className="text-xs text-muted-foreground">
            {artifact
              ? `Generated ${new Date(artifact.generatedAt).toLocaleString()}`
              : "No advisory generated yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => runGenerate(false)}
            disabled={busy || variantBusy || !gateOpen}
            data-testid="advisory-generate-btn"
          >
            {busy ? "Generating…" : "Generate Advisory"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => runGenerate(true)}
            disabled={busy || variantBusy || !gateOpen}
            data-testid="advisory-variants-btn"
          >
            {variantBusy ? "Generating…" : "Generate 3 Variants"}
          </Button>
          {artifact && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={downloadMarkdown}
                data-testid="advisory-download-btn"
              >
                Download .md
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={copyAsPrompt}
                data-testid="advisory-copy-prompt-btn"
              >
                Copy as Prompt
              </Button>
            </>
          )}
        </div>
      </div>

      {!gateOpen && (
        <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-sm px-3 py-2">
          Intake is {completenessPct}% complete. Generate is enabled at 80%.
        </div>
      )}

      {!artifact ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Click <b>Generate Advisory</b> to score this template and produce
            the six-section advisory document.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="score" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="score">Score</TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="variants" data-testid="advisory-tab-variants">
              Variants
            </TabsTrigger>
            <TabsTrigger value="review">Review Plan</TabsTrigger>
          </TabsList>

          <TabsContent value="score" className="space-y-4" data-testid="advisory-score-tab">
            <ScoreBars score={artifact.score} />
          </TabsContent>

          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Executive Summary</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p className="whitespace-pre-line">
                  {artifact.document.executiveSummary.narrative}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Practice: <b>{artifact.document.executiveSummary.practiceName}</b> ·
                  Policy: <b>{artifact.document.executiveSummary.productionPolicy}</b> ·
                  Goal status: <b>{artifact.document.executiveSummary.weeklyGoalStatus}</b>
                </p>
                <p className="mt-3 text-sm">
                  <span className="font-semibold">Top recommendation:</span>{" "}
                  {artifact.document.executiveSummary.topRecommendation}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Key Inputs & Assumptions</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm divide-y">
                  {artifact.document.keyInputs.map((i, ix) => (
                    <li key={ix} className="py-1.5 flex justify-between gap-4">
                      <span className="text-muted-foreground">{i.field}</span>
                      <span className="text-right">
                        <span className="font-medium">{i.value}</span>
                        {i.source === "assumed-default" && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700">
                            assumed
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="detail" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weekly Template</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-4">Day</th>
                        <th className="py-1 pr-4">Time</th>
                        <th className="py-1 pr-4">Type</th>
                        <th className="py-1 pr-4">Purpose</th>
                        <th className="py-1">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artifact.document.weeklyTemplate.map((r, ix) => (
                        <tr key={ix} className="border-t">
                          <td className="py-1 pr-4">{r.day}</td>
                          <td className="py-1 pr-4">{r.timeBlock}</td>
                          <td className="py-1 pr-4">{r.appointmentType}</td>
                          <td className="py-1 pr-4">{r.purpose}</td>
                          <td className="py-1">{r.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Block Rationale</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {artifact.document.blockRationale.map((b, ix) => (
                    <div key={ix}>
                      <div className="font-semibold text-xs uppercase text-muted-foreground">
                        {b.day}
                      </div>
                      <p className="mt-0.5">{b.prose}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risks & Trade-offs</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {artifact.document.risks.map((r, ix) => (
                    <li key={ix} className="flex gap-2">
                      <span
                        className={`inline-block text-[10px] px-1.5 py-0.5 rounded border uppercase ${
                          r.severity === "hard"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : r.severity === "soft"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-700 border-slate-200"
                        }`}
                      >
                        {r.ruleCode ?? r.severity}
                      </span>
                      <span>{r.plainEnglish}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">KPIs to Monitor</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm divide-y">
                  {artifact.document.kpis.map((k, ix) => (
                    <li key={ix} className="py-1.5">
                      <div className="flex justify-between">
                        <span className="font-medium">{k.metric}</span>
                        <span className="text-muted-foreground">{k.target}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{k.whyItMatters}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="variants" className="space-y-4">
            {artifact.variants ? (
              <VariantComparison variants={artifact.variants} />
            ) : (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No variants generated yet. Click <b>Generate 3 Variants</b> above
                  to produce Growth / Access / Balanced side-by-side.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <ReviewPlanStrip plan={artifact.reviewPlan} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ScoreBars({ score }: { score: TemplateScore }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Six-Axis Template Score</span>
          <span
            className={`text-sm font-semibold px-2 py-0.5 rounded border ${BAND_BG[score.band]}`}
            data-testid="advisory-overall-score"
          >
            Overall: {score.overall}/10 ({score.band})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {score.axes.map((a) => (
          <AxisRow key={a.axis} axis={a} />
        ))}
      </CardContent>
    </Card>
  );
}

function AxisRow({ axis }: { axis: AxisScore }) {
  const [open, setOpen] = useState(false);
  const pct = Math.max(0, Math.min(10, axis.score)) * 10;
  return (
    <div className="text-sm" data-testid={`axis-${axis.axis.toLowerCase()}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="w-28 text-xs font-medium text-slate-700">{axis.label}</span>
        <div className="flex-1 h-2 rounded bg-slate-100 overflow-hidden">
          <div className={`h-2 ${BAND_BAR[axis.band]}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-16 text-right text-xs font-semibold">
          {axis.score}/10
        </span>
        <span
          className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border uppercase ${BAND_BG[axis.band]}`}
        >
          {axis.band}
        </span>
      </button>
      {open && (
        <div className="mt-1 ml-28 pl-3 border-l border-slate-200 text-xs space-y-1">
          {axis.signals.length > 0 && (
            <div>
              <span className="font-semibold text-slate-600">Signals:</span>
              <ul className="mt-0.5 space-y-0.5">
                {axis.signals.map((s, ix) => (
                  <li key={ix} className="text-slate-600">
                    • {s.name}: <b>{s.value}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {axis.raiseSuggestions.length > 0 && (
            <div>
              <span className="font-semibold text-slate-600">
                How to raise this score:
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {axis.raiseSuggestions.map((r, ix) => (
                  <li key={ix} className="text-slate-600">
                    → {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VariantComparison({ variants }: { variants: VariantSet }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
        <span className="font-semibold text-indigo-900">
          Recommended: {variants.recommendation.winner}
        </span>
        <span className="text-indigo-900"> — {variants.recommendation.reason}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {variants.variants.map((v) => (
          <VariantCard
            key={v.code}
            v={v}
            recommended={v.code === variants.recommendation.winner}
          />
        ))}
      </div>
    </div>
  );
}

function VariantCard({
  v,
  recommended,
}: {
  v: VariantResult;
  recommended: boolean;
}) {
  return (
    <Card
      className={recommended ? "border-indigo-400 ring-1 ring-indigo-300" : ""}
      data-testid={`variant-card-${v.code.toLowerCase()}`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{v.label}</span>
          {recommended && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-600 text-white uppercase">
              Winner
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Policy: {v.productionPolicy}</p>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className={`text-sm font-semibold px-2 py-0.5 rounded border inline-block ${BAND_BG[v.score.band]}`}>
          Score: {v.score.overall}/10 ({v.score.band})
        </div>
        <ul className="text-xs text-slate-700 grid grid-cols-2 gap-x-3 gap-y-0.5">
          <li>Production: <b>${v.headlineKpis.productionTotal.toLocaleString()}</b></li>
          <li>NP / wk: <b>{v.headlineKpis.npSlotsPerWeek}</b></li>
          <li>ER / wk: <b>{v.headlineKpis.erSlotsPerWeek}</b></li>
          <li>Hyg exams: <b>{v.headlineKpis.hygieneExamsPlaced}</b></li>
          <li>HP blocks: <b>{v.headlineKpis.rockBlocksPlaced}</b></li>
        </ul>
        {v.topTradeoffs.length > 0 && (
          <div>
            <p className="text-xs font-semibold mt-2 text-slate-600">Trade-offs:</p>
            <ul className="text-xs text-slate-600 list-disc list-inside">
              {v.topTradeoffs.map((t, ix) => (
                <li key={ix}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewPlanStrip({ plan }: { plan: ReviewPlan }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {plan.milestones.map((m) => (
        <Card key={m.day} data-testid={`review-day-${m.day}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day {m.day}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-slate-600">{m.summary}</p>
            <ul className="space-y-1.5">
              {m.kpis.map((k, ix) => (
                <li key={ix} className="border-t pt-1.5">
                  <div className="font-medium text-xs">{k.metric}</div>
                  <div className="text-xs text-muted-foreground">
                    Target: <b>{k.target}</b>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Trend: {k.trendToWatch}
                  </div>
                  <div className="text-xs text-amber-700">
                    Revise if: {k.revisionTrigger}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Emit the advisory document as a docx-style user prompt. Mirrors
 * `renderUserPrompt()` from @/lib/engine/advisory/markdown so operators
 * can paste the output into a downstream LLM for rewrites.
 */
function renderAsPrompt(a: AdvisoryArtifact): string {
  const doc = a.document;
  const lines: string[] = [];
  lines.push(`PRACTICE: ${doc.executiveSummary.practiceName}`);
  lines.push(`POLICY: ${doc.productionPolicy}`);
  lines.push(`MODEL: ${doc.practiceModel}`);
  lines.push("");
  lines.push("GOALS");
  for (const i of doc.keyInputs.filter((k) => k.source === "intake")) {
    lines.push(`- ${i.field}: ${i.value}`);
  }
  lines.push("");
  lines.push("CONSTRAINTS + ISSUES");
  for (const r of doc.risks) {
    lines.push(`- ${r.ruleCode ? r.ruleCode + " " : ""}${r.plainEnglish}`);
  }
  lines.push("");
  lines.push("OUTPUT REQUEST");
  lines.push(
    "Return a refined weekly template (Mon-Fri) with one block per row " +
      "(Day, Time, Type, Purpose, Notes), followed by a 3-sentence rationale " +
      "per day and a 30/60/90 review plan.",
  );
  return lines.join("\n");
}
