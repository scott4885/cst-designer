"use client";

/**
 * Sprint 5 — Advisory full-screen view.
 *
 * Dedicated route for the template advisory: score bars, six-section
 * document, variants comparison, 30/60/90 review plan. Loads the latest
 * persisted advisory on mount (GET) and re-renders in place after the
 * user clicks Generate (POST).
 */

import { useCallback, useEffect, useState } from "react";
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
} from "@/lib/engine/advisory/types";

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

  const refresh = useCallback(async () => {
    const [officeRes, advisoryRes] = await Promise.all([
      fetch(`/api/offices/${officeId}`),
      fetch(`/api/offices/${officeId}/advisory`),
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

  if (loading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading advisory…</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" data-testid="advisory-page">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/offices/${officeId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to schedule
        </Button>
        <h1 className="text-2xl font-semibold">{officeName || "Office"} — Advisory</h1>
      </div>

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

      <AdvisoryPanel
        officeId={officeId}
        officeName={officeName}
        artifact={artifact}
        completenessPct={completeness?.completenessPct ?? 0}
        onGenerated={(next) => {
          setArtifact(next);
        }}
      />

      <div className="text-xs text-muted-foreground">
        <Link href={`/offices/${officeId}`} className="underline">
          Return to schedule
        </Link>
      </div>
    </div>
  );
}
