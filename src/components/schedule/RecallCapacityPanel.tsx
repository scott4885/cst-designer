"use client";

import { useState, useMemo } from "react";
import { Users, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  calculateRecallCapacity,
  buildOrgRecallSnapshot,
  type RecallCapacityResult,
  type OfficeRecallSnapshot,
  type OfficeHygieneData,
} from "@/lib/engine/recall-optimizer";
import type { OfficeData } from "@/lib/mock-data";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecallForm {
  activePatientCount: number;
  recallIntervalMonths: number;
}

const DEFAULT_FORM: RecallForm = {
  activePatientCount: 600,
  recallIntervalMonths: 6,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countHygienists(office: OfficeData): number {
  return (office.providers ?? []).filter((p) => p.role === "HYGIENIST").length;
}

function countHygieneBlocksPerDay(office: OfficeData): number {
  // Approximate: assume each hygienist runs 8 blocks per day at 60-min intervals
  // This can be refined with actual schedule data
  const hygienists = countHygienists(office);
  if (hygienists === 0) return 0;
  const avgDailyHours = 8; // 8 working hours
  const avgBlockHours = 1; // 60-min recall appointments
  return Math.floor(avgDailyHours / avgBlockHours);
}

// ─── Org Snapshot Table ───────────────────────────────────────────────────────

function SnapshotTable({ snapshots }: { snapshots: OfficeRecallSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No offices with hygienists found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-left">
            <th className="pb-2 pr-4 font-medium">Office</th>
            <th className="pb-2 pr-4 font-medium text-right">Hygienists</th>
            <th className="pb-2 pr-4 font-medium text-right">Slots/Mo</th>
            <th className="pb-2 pr-4 font-medium text-right">Need/Mo</th>
            <th className="pb-2 pr-4 font-medium text-right">Surplus</th>
            <th className="pb-2 font-medium">Capacity</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snap) => (
            <tr key={snap.officeId} className="border-b last:border-0">
              <td className="py-2 pr-4 font-medium">{snap.officeName}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground">
                {snap.hygienistCount}
              </td>
              <td className="py-2 pr-4 text-right">{snap.monthlySlotsAvailable}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground">
                {snap.monthlyRecallNeed}
              </td>
              <td className="py-2 pr-4 text-right">
                <span
                  className={
                    snap.surplusOrDeficit >= 0
                      ? "text-green-600 font-medium"
                      : "text-red-600 font-medium"
                  }
                >
                  {snap.surplusOrDeficit >= 0 ? "+" : ""}
                  {snap.surplusOrDeficit}
                </span>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <Progress
                    value={Math.min(100, snap.utilizationPct)}
                    className="h-2 w-20"
                  />
                  <span
                    className={`text-xs font-medium ${
                      snap.utilizationPct > 100
                        ? "text-red-600"
                        : snap.utilizationPct > 80
                        ? "text-green-600"
                        : "text-yellow-600"
                    }`}
                  >
                    {snap.utilizationPct}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface RecallCapacityPanelProps {
  offices: OfficeData[];
}

export default function RecallCapacityPanel({ offices }: RecallCapacityPanelProps) {
  const [form, setForm] = useState<RecallForm>(DEFAULT_FORM);
  const [result, setResult] = useState<RecallCapacityResult | null>(null);

  // Build per-office hygiene data
  const officeHygieneData = useMemo<OfficeHygieneData[]>(() => {
    return offices
      .filter((o) => countHygienists(o) > 0)
      .map((o) => ({
        officeId: o.id,
        officeName: o.name,
        hygienistCount: countHygienists(o),
        workingDays: (o as any).workingDays ?? [
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
        ],
        hygieneBlocksPerDay: countHygieneBlocksPerDay(o),
        avgBlockDurationMin: 60,
        activePatientCount: form.activePatientCount,
        recallIntervalMonths: form.recallIntervalMonths,
      }));
  }, [offices, form.activePatientCount, form.recallIntervalMonths]);

  const snapshots = useMemo<OfficeRecallSnapshot[]>(
    () => buildOrgRecallSnapshot(officeHygieneData),
    [officeHygieneData]
  );

  // Org-level totals
  const orgTotalSlots = snapshots.reduce(
    (s, r) => s + r.monthlySlotsAvailable,
    0
  );
  const orgTotalNeed = snapshots.reduce(
    (s, r) => s + r.monthlyRecallNeed,
    0
  );

  const handleOptimize = () => {
    // Use org-wide totals and total hygienist count for the org-level recommendation
    const totalHygienists = snapshots.reduce(
      (s, r) => s + r.hygienistCount,
      0
    );
    const avgDaysPerWeek =
      officeHygieneData.length > 0
        ? officeHygieneData.reduce((s, o) => s + o.workingDays.length, 0) /
          officeHygieneData.length
        : 5;
    const avgBlocksPerDay =
      officeHygieneData.length > 0
        ? officeHygieneData.reduce((s, o) => s + o.hygieneBlocksPerDay, 0) /
          officeHygieneData.length
        : 8;

    const res = calculateRecallCapacity({
      hygienistCount: totalHygienists,
      daysPerWeek: avgDaysPerWeek,
      hygieneBlocksPerDay: avgBlocksPerDay,
      avgBlockDurationMin: 60,
      activePatientCount: form.activePatientCount,
      recallIntervalMonths: form.recallIntervalMonths,
    });
    setResult(res);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Recall Capacity Optimizer
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Analyze your hygiene capacity against your patient recall needs.
          Benchmark: a healthy GP practice recalls 30–40% of active patients/month.
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-card border rounded-lg p-5">
        <h3 className="font-medium text-foreground mb-4">Practice Parameters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="activePatients">Active Patient Count</Label>
            <Input
              id="activePatients"
              type="number"
              min={0}
              value={form.activePatientCount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  activePatientCount: parseInt(e.target.value) || 0,
                }))
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Total active patients in the practice
            </p>
          </div>
          <div>
            <Label htmlFor="recallInterval">Recall Interval (months)</Label>
            <Input
              id="recallInterval"
              type="number"
              min={1}
              max={24}
              value={form.recallIntervalMonths}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  recallIntervalMonths: parseInt(e.target.value) || 6,
                }))
              }
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Typically 6 months for standard recall
            </p>
          </div>
        </div>
        <Button onClick={handleOptimize} className="mt-4 gap-2">
          <TrendingUp className="w-4 h-4" />
          Optimize Recall Capacity
        </Button>
      </div>

      {/* Org-Wide Summary */}
      {snapshots.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border rounded-lg p-4">
            <div className="text-xs text-muted-foreground font-medium mb-1">
              Org Recall Slots/Month
            </div>
            <div className="text-2xl font-bold text-foreground">
              {orgTotalSlots.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Across {snapshots.length} offices with hygienists
            </div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-xs text-muted-foreground font-medium mb-1">
              Org Monthly Recall Need
            </div>
            <div className="text-2xl font-bold text-foreground">
              {orgTotalNeed.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {form.activePatientCount.toLocaleString()} pts ÷{" "}
              {form.recallIntervalMonths}mo
            </div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-xs text-muted-foreground font-medium mb-1">
              Org Surplus / Deficit
            </div>
            <div
              className={`text-2xl font-bold ${
                orgTotalSlots - orgTotalNeed >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {orgTotalSlots - orgTotalNeed >= 0 ? "+" : ""}
              {(orgTotalSlots - orgTotalNeed).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Slots available for NP growth
            </div>
          </div>
        </div>
      )}

      {/* Org-Wide Recall Bar */}
      {orgTotalSlots > 0 && (
        <div className="bg-card border rounded-lg p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              Org-Wide Recall Utilization
            </span>
            <span className="text-sm text-muted-foreground">
              {orgTotalNeed.toLocaleString()} need /{" "}
              {orgTotalSlots.toLocaleString()} available
            </span>
          </div>
          <Progress
            value={Math.min(100, Math.round((orgTotalNeed / orgTotalSlots) * 100))}
            className="h-4"
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-muted-foreground">0%</span>
            <span
              className={`text-xs font-medium ${
                orgTotalNeed > orgTotalSlots
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {Math.round((orgTotalNeed / orgTotalSlots) * 100)}% utilized
            </span>
            <span className="text-xs text-muted-foreground">100%</span>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {result && result.recommendations.length > 0 && (
        <div className="bg-card border rounded-lg p-5">
          <h3 className="font-medium text-foreground mb-3">
            Recommendations
          </h3>
          <ul className="space-y-2">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {rec.startsWith("⚠️") ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                )}
                <span className="text-foreground">
                  {rec.replace(/^[⚠️✓]\s*/, "")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-Office Table */}
      <div className="bg-card border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-medium text-foreground">Per-Office Recall Capacity</h3>
        </div>
        <SnapshotTable snapshots={snapshots} />
      </div>
    </div>
  );
}
