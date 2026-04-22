"use client";

/**
 * Sprint 5 Feature A — Intake V2 component.
 *
 * Standalone controlled section that captures the 14 GOALS/HYGIENE fields +
 * 14 CONSTRAINTS/ISSUES/VISITMIX fields from SPRINT-5-PLAN §2.1. State is
 * lifted to the parent (new/edit office page) via onChange so the parent can
 * persist `intakeGoals` + `intakeConstraints` JSON blobs through the
 * existing POST /api/offices flow.
 *
 * Completeness badge is self-computing. The Generate-gate is enforced
 * downstream in the AdvisoryPanel, not here.
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  IntakeGoals,
  IntakeConstraints,
} from "@/lib/engine/advisory/types";
import { computeIntakeCompleteness } from "@/lib/engine/advisory/completeness";

export interface IntakeV2Props {
  intakeGoals: IntakeGoals;
  intakeConstraints: IntakeConstraints;
  onChange: (next: { intakeGoals: IntakeGoals; intakeConstraints: IntakeConstraints }) => void;
  derivedHaveCount?: number;
}

export function IntakeV2({
  intakeGoals,
  intakeConstraints,
  onChange,
  derivedHaveCount = 4,
}: IntakeV2Props) {
  const completeness = useMemo(
    () => computeIntakeCompleteness(intakeGoals, intakeConstraints, derivedHaveCount),
    [intakeGoals, intakeConstraints, derivedHaveCount],
  );

  const bandColor =
    completeness.completenessPct >= 80
      ? "text-green-700 bg-green-50 border-green-200"
      : completeness.completenessPct >= 50
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";

  function setGoal<K extends keyof IntakeGoals>(key: K, value: IntakeGoals[K]) {
    onChange({
      intakeGoals: { ...intakeGoals, [key]: value },
      intakeConstraints,
    });
  }
  function setConstraint<K extends keyof IntakeConstraints>(key: K, value: IntakeConstraints[K]) {
    onChange({
      intakeGoals,
      intakeConstraints: { ...intakeConstraints, [key]: value },
    });
  }

  return (
    <div className="space-y-6" data-testid="intake-v2">
      <div
        className={`rounded-md border px-4 py-3 text-sm flex items-center justify-between ${bandColor}`}
        data-testid="intake-completeness-badge"
      >
        <div>
          <strong>Intake Completeness: {completeness.completenessPct}%</strong>
          {" "}— {completeness.haveFields} of {completeness.totalFields} fields captured
        </div>
        <div className="text-xs uppercase tracking-wide">
          {completeness.gateOpen ? "Advisory enabled" : "Advisory gated (need ≥ 80%)"}
        </div>
      </div>

      {/* --- 3. GOALS --- */}
      <Card>
        <CardHeader>
          <CardTitle>3. Goals</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Practice type</Label>
            <Input
              data-testid="intake-practiceType"
              value={intakeGoals.practiceType ?? ""}
              onChange={(e) => setGoal("practiceType", e.target.value)}
              placeholder="e.g. general, pediatric, perio-heavy"
            />
          </div>
          <div>
            <Label>Growth priority</Label>
            <Select
              value={intakeGoals.growthPriority ?? ""}
              onValueChange={(v) => setGoal("growthPriority", v as IntakeGoals["growthPriority"])}
            >
              <SelectTrigger data-testid="intake-growthPriority"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORE_PRODUCTION">More production</SelectItem>
                <SelectItem value="MORE_NP">More new patients</SelectItem>
                <SelectItem value="BETTER_ACCESS">Better access (emergency / same day)</SelectItem>
                <SelectItem value="STABILITY">Stability (fewer fires)</SelectItem>
                <SelectItem value="HYGIENE_CAPACITY">Hygiene capacity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Monthly production goal ($)</Label>
            <Input
              type="number"
              data-testid="intake-monthlyProductionGoal"
              value={intakeGoals.monthlyProductionGoal ?? ""}
              onChange={(e) => setGoal("monthlyProductionGoal", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <Label>Daily production goal ($)</Label>
            <Input
              type="number"
              data-testid="intake-dailyProductionGoal"
              value={intakeGoals.dailyProductionGoal ?? ""}
              onChange={(e) => setGoal("dailyProductionGoal", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <Label>Monthly NP goal</Label>
            <Input
              type="number"
              data-testid="intake-monthlyNewPatientGoal"
              value={intakeGoals.monthlyNewPatientGoal ?? ""}
              onChange={(e) => setGoal("monthlyNewPatientGoal", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <Label>Same-day treatment goal (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              data-testid="intake-sameDayTreatmentGoalPct"
              value={intakeGoals.sameDayTreatmentGoalPct ?? ""}
              onChange={(e) => setGoal("sameDayTreatmentGoalPct", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <Label>Hygiene reappointment demand</Label>
            <Select
              value={intakeGoals.hygieneReappointmentDemand ?? ""}
              onValueChange={(v) => setGoal("hygieneReappointmentDemand", v as IntakeGoals["hygieneReappointmentDemand"])}
            >
              <SelectTrigger data-testid="intake-hygieneReappointmentDemand"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Emergency access goal</Label>
            <Select
              value={intakeGoals.emergencyAccessGoal ?? ""}
              onValueChange={(v) => setGoal("emergencyAccessGoal", v as IntakeGoals["emergencyAccessGoal"])}
            >
              <SelectTrigger data-testid="intake-emergencyAccessGoal"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAME_DAY">Same day whenever possible</SelectItem>
                <SelectItem value="NEXT_DAY">Next day</SelectItem>
                <SelectItem value="WEEKLY">Within the week</SelectItem>
                <SelectItem value="NONE">Not a priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Main scheduling problems to solve</Label>
            <Textarea
              rows={3}
              data-testid="intake-mainSchedulingProblems"
              value={intakeGoals.mainSchedulingProblems ?? ""}
              onChange={(e) => setGoal("mainSchedulingProblems", e.target.value)}
              placeholder="e.g. NP booked > 2 weeks out; PM hygiene column runs late; emergencies bump restorative"
            />
          </div>
        </CardContent>
      </Card>

      {/* --- 5. HYGIENE / EXAM --- */}
      <Card>
        <CardHeader>
          <CardTitle>5. Hygiene / Exam</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Hygiene demand level</Label>
            <Select
              value={intakeGoals.hygieneDemandLevel ?? ""}
              onValueChange={(v) => setGoal("hygieneDemandLevel", v as IntakeGoals["hygieneDemandLevel"])}
            >
              <SelectTrigger data-testid="intake-hygieneDemandLevel"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Doctor exam frequency needed</Label>
            <Select
              value={intakeGoals.doctorExamFrequencyNeeded ?? ""}
              onValueChange={(v) => setGoal("doctorExamFrequencyNeeded", v as IntakeGoals["doctorExamFrequencyNeeded"])}
            >
              <SelectTrigger data-testid="intake-doctorExamFrequencyNeeded"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EVERY_VISIT">Every hygiene visit</SelectItem>
                <SelectItem value="RECARE_ONLY">Recare visits only</SelectItem>
                <SelectItem value="AS_NEEDED">As needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Perio demand</Label>
            <Select
              value={intakeGoals.perioDemand ?? ""}
              onValueChange={(v) => setGoal("perioDemand", v as IntakeGoals["perioDemand"])}
            >
              <SelectTrigger data-testid="intake-perioDemand"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>NP hygiene flow</Label>
            <Select
              value={intakeGoals.npHygieneFlow ?? ""}
              onValueChange={(v) => setGoal("npHygieneFlow", v as IntakeGoals["npHygieneFlow"])}
            >
              <SelectTrigger data-testid="intake-npHygieneFlow"><SelectValue placeholder="Choose..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DOCTOR_ONLY">Doctor only</SelectItem>
                <SelectItem value="HYGIENIST_ONLY">Hygienist only</SelectItem>
                <SelectItem value="EITHER">Either</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Hygiene bottlenecks (free text)</Label>
            <Textarea
              rows={2}
              data-testid="intake-hygieneBottlenecks"
              value={intakeGoals.hygieneBottlenecks ?? ""}
              onChange={(e) => setGoal("hygieneBottlenecks", e.target.value)}
              placeholder="e.g. Exam coverage gaps when all 3 hygienists running concurrently"
            />
          </div>
        </CardContent>
      </Card>

      {/* --- 4. VISIT MIX --- */}
      <Card>
        <CardHeader>
          <CardTitle>4. Visit Mix</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>High-value procedures to protect</Label>
            <Input
              data-testid="intake-highValueProcedures"
              value={intakeConstraints.highValueProcedures ?? ""}
              onChange={(e) => setConstraint("highValueProcedures", e.target.value)}
              placeholder="e.g. Crown, Implant, Endo"
            />
          </div>
          <div>
            <Label>Flexible procedures (can reschedule)</Label>
            <Input
              data-testid="intake-flexibleProcedures"
              value={intakeConstraints.flexibleProcedures ?? ""}
              onChange={(e) => setConstraint("flexibleProcedures", e.target.value)}
              placeholder="e.g. prophy, 1-surface MP"
            />
          </div>
          <div>
            <Label>Limited exam duration (min)</Label>
            <Input
              type="number"
              data-testid="intake-limitedExamDurationMin"
              value={intakeConstraints.limitedExamDurationMin ?? ""}
              onChange={(e) => setConstraint("limitedExamDurationMin", e.target.value ? Number(e.target.value) : undefined)}
              placeholder="20"
            />
          </div>
        </CardContent>
      </Card>

      {/* --- 6. CONSTRAINTS --- */}
      <Card>
        <CardHeader>
          <CardTitle>6. Constraints</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Existing commitments (e.g. Wed 8am huddle)</Label>
            <Textarea
              rows={2}
              data-testid="intake-existingCommitments"
              value={intakeConstraints.existingCommitments ?? ""}
              onChange={(e) => setConstraint("existingCommitments", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Provider preferences</Label>
            <Textarea
              rows={2}
              data-testid="intake-providerPreferences"
              value={intakeConstraints.providerPreferences ?? ""}
              onChange={(e) => setConstraint("providerPreferences", e.target.value)}
            />
          </div>
          <div>
            <Label>Team limitations</Label>
            <Textarea
              rows={2}
              data-testid="intake-teamLimitations"
              value={intakeConstraints.teamLimitations ?? ""}
              onChange={(e) => setConstraint("teamLimitations", e.target.value)}
            />
          </div>
          <div>
            <Label>Room / equipment limitations</Label>
            <Textarea
              rows={2}
              data-testid="intake-roomEquipmentLimitations"
              value={intakeConstraints.roomEquipmentLimitations ?? ""}
              onChange={(e) => setConstraint("roomEquipmentLimitations", e.target.value)}
            />
          </div>
          <div>
            <Label>Time blocks that must stay open</Label>
            <Textarea
              rows={2}
              data-testid="intake-mustStayOpenBlocks"
              value={intakeConstraints.mustStayOpenBlocks ?? ""}
              onChange={(e) => setConstraint("mustStayOpenBlocks", e.target.value)}
            />
          </div>
          <div>
            <Label>Never-use-for-certain-visits blocks</Label>
            <Textarea
              rows={2}
              data-testid="intake-neverUseForBlocks"
              value={intakeConstraints.neverUseForBlocks ?? ""}
              onChange={(e) => setConstraint("neverUseForBlocks", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* --- 7. CURRENT TEMPLATE ISSUES --- */}
      <Card>
        <CardHeader>
          <CardTitle>7. Current Template Issues</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Where production is leaking</Label>
            <Textarea
              rows={2}
              data-testid="intake-productionLeakage"
              value={intakeConstraints.productionLeakage ?? ""}
              onChange={(e) => setConstraint("productionLeakage", e.target.value)}
            />
          </div>
          <div>
            <Label>Where access is poor</Label>
            <Textarea
              rows={2}
              data-testid="intake-poorAccess"
              value={intakeConstraints.poorAccess ?? ""}
              onChange={(e) => setConstraint("poorAccess", e.target.value)}
            />
          </div>
          <div>
            <Label>What gets overbooked</Label>
            <Textarea
              rows={2}
              data-testid="intake-overbookedSlots"
              value={intakeConstraints.overbookedSlots ?? ""}
              onChange={(e) => setConstraint("overbookedSlots", e.target.value)}
            />
          </div>
          <div>
            <Label>What gets underutilized</Label>
            <Textarea
              rows={2}
              data-testid="intake-underutilizedSlots"
              value={intakeConstraints.underutilizedSlots ?? ""}
              onChange={(e) => setConstraint("underutilizedSlots", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>No-show / cancellation patterns</Label>
            <Textarea
              rows={2}
              data-testid="intake-noShowCancellationPatterns"
              value={intakeConstraints.noShowCancellationPatterns ?? ""}
              onChange={(e) => setConstraint("noShowCancellationPatterns", e.target.value)}
              placeholder="e.g. PM cancellations running 20%; Monday morning no-shows on new patients"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
