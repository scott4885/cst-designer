"use client";

/**
 * Sprint 5 — Advisory full-screen view.
 *
 * Dedicated route for the template advisory: score bars, six-section
 * document, variants comparison, 30/60/90 review plan. Loads the latest
 * persisted advisory on mount (GET) and re-renders in place after the
 * user clicks Generate (POST).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvisoryPanel } from "@/components/schedule/v2/AdvisoryPanel";
import { IntakeV2 } from "@/components/intake/IntakeV2";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type {
  AdvisoryArtifact,
  IntakeGoals,
  IntakeConstraints,
  IntakeCompleteness,
  PriorTemplate,
  TemplateDelta,
} from "@/lib/engine/advisory/types";
import { PriorTemplateUpload } from "@/components/advisory/PriorTemplateUpload";
import { DeltaView } from "@/components/advisory/DeltaView";
import { RefineWithAiPanel } from "@/components/advisory/RefineWithAiPanel";
import { VariantCommitControls } from "@/components/advisory/VariantCommitControls";
import { WorkflowBanner, type WorkflowStep } from "@/components/advisory/WorkflowBanner";
import { FirstRunWalkthrough } from "@/components/advisory/FirstRunWalkthrough";

const REWRITE_ENABLED =
  process.env.NEXT_PUBLIC_ADVISORY_REWRITE_ENABLED === "1";

export default function AdvisoryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const officeId = params.id;

  const [officeName, setOfficeName] = useState<string>("");
  const [artifact, setArtifact] = useState<AdvisoryArtifact | null>(null);
  const [completeness, setCompleteness] = useState<IntakeCompleteness | null>(null);
  const [intakeGoals, setIntakeGoals] = useState<IntakeGoals>({});
  const [intakeConstraints, setIntakeConstraints] = useState<IntakeConstraints>({});
  const [savingIntake, setSavingIntake] = useState(false);
  const [loading, setLoading] = useState(true);
  const [priorTemplate, setPriorTemplate] = useState<PriorTemplate | null>(null);
  const [delta, setDelta] = useState<TemplateDelta | null>(null);
  const [deltaMeta, setDeltaMeta] = useState<{
    hasPriorTemplate: boolean;
    priorFilename?: string;
    priorSourceFormat?: string;
    parseStatus?: string;
  }>({ hasPriorTemplate: false });

  const refresh = useCallback(async () => {
    const [officeRes, advisoryRes, priorRes, deltaRes] = await Promise.all([
      fetch(`/api/offices/${officeId}`),
      fetch(`/api/offices/${officeId}/advisory`),
      fetch(`/api/offices/${officeId}/prior-template`),
      fetch(`/api/offices/${officeId}/prior-template/delta`),
    ]);
    if (!officeRes.ok) {
      toast.error("Failed to load office.");
      return;
    }
    const office = await officeRes.json();
    setOfficeName(office.name);
    setIntakeGoals((office.intakeGoals ?? {}) as IntakeGoals);
    setIntakeConstraints((office.intakeConstraints ?? {}) as IntakeConstraints);

    if (advisoryRes.ok) {
      const data = await advisoryRes.json();
      setArtifact(data.advisory);
      setCompleteness(data.completeness);
    }

    if (priorRes.ok) {
      const data = await priorRes.json();
      setPriorTemplate(data.priorTemplate);
    }

    if (deltaRes.ok) {
      const data = await deltaRes.json();
      setDelta(data.delta);
      setDeltaMeta({
        hasPriorTemplate: Boolean(data.hasPriorTemplate),
        priorFilename: data.priorFilename,
        priorSourceFormat: data.priorSourceFormat,
        parseStatus: data.parseStatus,
      });
    }
  }, [officeId]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  async function saveIntake(nextGoals: IntakeGoals, nextConstraints: IntakeConstraints) {
    setSavingIntake(true);
    try {
      const res = await fetch(`/api/offices/${officeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeGoals: nextGoals,
          intakeConstraints: nextConstraints,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Refresh completeness after save.
      const advisoryRes = await fetch(`/api/offices/${officeId}/advisory`);
      if (advisoryRes.ok) {
        const data = await advisoryRes.json();
        setCompleteness(data.completeness);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save intake");
    } finally {
      setSavingIntake(false);
    }
  }

  const workflowSteps = useMemo<WorkflowStep[]>(() => {
    const pct = completeness?.completenessPct ?? 0;
    const intakeDone = pct >= 80;
    const uploadDone = Boolean(priorTemplate);
    const generated = Boolean(artifact);
    const committed = Boolean(artifact?.chosenVariant);

    let currentId: "intake" | "upload" | "generate" | "commit";
    if (!intakeDone) currentId = "intake";
    else if (!generated) currentId = "generate";
    else if (!committed) currentId = "commit";
    else currentId = "commit";

    return [
      {
        id: "intake",
        label: "Intake",
        state: intakeDone ? "done" : currentId === "intake" ? "current" : "pending",
        hint: `${pct}% complete`,
      },
      {
        id: "upload",
        label: "Upload prior template",
        state: uploadDone ? "done" : "optional",
      },
      {
        id: "generate",
        label: "Generate advisory",
        state: generated ? "done" : currentId === "generate" ? "current" : "pending",
      },
      {
        id: "commit",
        label: "Refine & commit",
        state: committed ? "done" : currentId === "commit" ? "current" : "pending",
      },
    ];
  }, [completeness, priorTemplate, artifact]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading advisory…</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" data-testid="advisory-page">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/offices/${officeId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to schedule
        </Button>
        <h1 className="text-2xl font-semibold">{officeName || "Office"} — Advisory</h1>
        <div className="ml-auto">
          <FirstRunWalkthrough />
        </div>
      </div>

      <WorkflowBanner steps={workflowSteps} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Intake</CardTitle>
        </CardHeader>
        <CardContent>
          <IntakeV2
            intakeGoals={intakeGoals}
            intakeConstraints={intakeConstraints}
            onChange={(next) => {
              setIntakeGoals(next.intakeGoals);
              setIntakeConstraints(next.intakeConstraints);
              // Autosave (debounced by React batching — one PUT per change is fine
              // at the intake form scale).
              void saveIntake(next.intakeGoals, next.intakeConstraints);
            }}
          />
          {savingIntake && (
            <p className="text-xs text-muted-foreground mt-2">Saving…</p>
          )}
        </CardContent>
      </Card>

      <PriorTemplateUpload
        officeId={officeId}
        priorTemplate={priorTemplate}
        onUploaded={(pt) => {
          setPriorTemplate(pt);
          void refresh();
        }}
      />

      <DeltaView
        delta={delta}
        hasPriorTemplate={deltaMeta.hasPriorTemplate}
        priorFilename={deltaMeta.priorFilename}
        priorSourceFormat={deltaMeta.priorSourceFormat}
        parseStatus={deltaMeta.parseStatus}
      />

      <AdvisoryPanel
        officeId={officeId}
        officeName={officeName}
        artifact={artifact}
        completenessPct={completeness?.completenessPct ?? 0}
        onGenerated={(next) => {
          setArtifact(next);
          // Refetch so delta + workflow banner reflect the new generation.
          void refresh();
        }}
      />

      <VariantCommitControls
        officeId={officeId}
        artifact={artifact}
        onCommitted={() => void refresh()}
      />

      <RefineWithAiPanel
        officeId={officeId}
        artifact={artifact}
        enabled={REWRITE_ENABLED}
        onStateChange={() => void refresh()}
      />

      <div className="text-xs text-muted-foreground">
        <Link href={`/offices/${officeId}`} className="underline">
          Return to schedule
        </Link>
      </div>
    </div>
  );
}
