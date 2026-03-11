"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { AlignmentScore } from "@/lib/engine/ideal-day";
import type { MixGapRow } from "@/lib/engine/types";
import { computeMixGapAnalysis } from "@/lib/engine/procedure-mix";
import type { ProcedureMix } from "@/lib/engine/types";

export interface ProviderProductionSummary {
  providerName: string;
  providerColor: string;
  providerRole?: 'DOCTOR' | 'HYGIENIST' | 'OTHER';
  dailyGoal: number;
  target75: number;
  actualScheduled: number;
  /** Sum of only blocks with minimumAmount >= role-based HP threshold (Dr≥$1k, Hyg≥$300) */
  highProductionScheduled: number;
  /** Per-operatory production breakdown (Sprint 6 §5.4). Only present for multi-op doctors. */
  opBreakdown?: { operatory: string; amount: number }[];
  /** Current procedure mix for gap analysis (Sprint 9). Only for DOCTOR providers. */
  currentProcedureMix?: ProcedureMix;
  /** Future/target procedure mix for gap analysis (Sprint 9). Only for DOCTOR providers. */
  futureProcedureMix?: ProcedureMix;
}

interface ProductionSummaryProps {
  summaries: ProviderProductionSummary[];
  alignmentScore?: AlignmentScore;
}

export default function ProductionSummary({ summaries, alignmentScore }: ProductionSummaryProps) {
  const [alignmentExpanded, setAlignmentExpanded] = useState(false);
  const [opBreakdownExpanded, setOpBreakdownExpanded] = useState<Record<number, boolean>>({});
  const [mixGapExpanded, setMixGapExpanded] = useState<Record<number, boolean>>({});

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  /** Returns the HP percentage color class based on 75% target threshold */
  const getHPColor = (hpAmount: number, dailyGoal: number) => {
    if (dailyGoal === 0) return "text-muted-foreground";
    const pct = (hpAmount / dailyGoal) * 100;
    if (pct >= 75) return "text-green-600 dark:text-green-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getHPProgressColor = (hpAmount: number, dailyGoal: number) => {
    if (dailyGoal === 0) return "[&>[data-slot=progress-indicator]]:bg-muted-foreground";
    const pct = (hpAmount / dailyGoal) * 100;
    if (pct >= 75) return "[&>[data-slot=progress-indicator]]:bg-green-500";
    if (pct >= 50) return "[&>[data-slot=progress-indicator]]:bg-amber-500";
    return "[&>[data-slot=progress-indicator]]:bg-red-500";
  };

  const getHPBadge = (hpAmount: number, dailyGoal: number) => {
    if (dailyGoal === 0) return null;
    const pct = (hpAmount / dailyGoal) * 100;
    if (pct >= 75)
      return <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400">✓ Met</Badge>;
    if (pct >= 50)
      return <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400">⚠ Partial</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400">✕ Below</Badge>;
  };

  const getStatusBadge = (actual: number, target: number) => {
    if (actual >= target) {
      return <Badge className="bg-success/20 text-success border-success/30">✓ Met</Badge>;
    } else if (actual >= target * 0.9) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">⚠ Under</Badge>;
    } else {
      return <Badge className="bg-error/20 text-error border-error/30">✕ Under</Badge>;
    }
  };

  const totalDailyGoal = summaries.reduce((sum, s) => sum + s.dailyGoal, 0);
  const totalTarget = summaries.reduce((sum, s) => sum + s.target75, 0);
  const totalActual = summaries.reduce((sum, s) => sum + s.actualScheduled, 0);
  const totalHP = summaries.reduce((sum, s) => sum + (s.highProductionScheduled ?? 0), 0);

  if (summaries.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Production Summary</h3>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Production metrics will appear here after generating a schedule
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Production Summary</h3>

      {/* Per Provider */}
      {summaries.map((summary, index) => {
        const hp = summary.highProductionScheduled ?? 0;
        const hpPct = summary.dailyGoal > 0 ? Math.round((hp / summary.dailyGoal) * 100) : 0;
        const hpBarPct = Math.min(hpPct, 100);

        return (
          <Card key={index}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: summary.providerColor }}
                />
                <CardTitle className="text-sm">{summary.providerName}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Goal:</span>
                <span className="font-semibold">{formatCurrency(summary.dailyGoal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual Scheduled:</span>
                <span className="font-semibold">{formatCurrency(summary.actualScheduled)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(summary.actualScheduled, summary.target75)}
              </div>

              {/* Per-op breakdown (multi-op doctors only) */}
              {summary.opBreakdown && summary.opBreakdown.length > 1 && (
                <div>
                  <button
                    onClick={() => setOpBreakdownExpanded(prev => ({ ...prev, [index]: !prev[index] }))}
                    className="text-xs text-accent hover:underline flex items-center gap-1"
                  >
                    {opBreakdownExpanded[index] ? "▾ Hide" : "▸ Show"} op breakdown
                  </button>
                  {opBreakdownExpanded[index] && (
                    <div className="mt-1.5 space-y-1 border-l-2 border-border pl-3">
                      {summary.opBreakdown.map(op => (
                        <div key={op.operatory} className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground font-mono">{op.operatory}</span>
                          <span className="font-medium tabular-nums">{formatCurrency(op.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* High Production section */}
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-foreground/80">
                    High Production{" "}
                    <span className="font-normal text-muted-foreground">
                      ({summary.providerRole === 'HYGIENIST' ? '≥$300' : '≥$1k'} · Target: 75%)
                    </span>
                  </span>
                  {getHPBadge(hp, summary.dailyGoal)}
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-base font-bold tabular-nums ${getHPColor(hp, summary.dailyGoal)}`}>
                    {formatCurrency(hp)}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${getHPColor(hp, summary.dailyGoal)}`}>
                    {hpPct}%
                  </span>
                </div>
                {/* Progress bar with 75% target marker */}
                <div className="relative">
                  <Progress
                    value={hpBarPct}
                    className={`h-2.5 ${getHPProgressColor(hp, summary.dailyGoal)}`}
                  />
                  {/* 75% target marker line */}
                  <div
                    className="absolute top-0 h-2.5 w-0.5 bg-foreground/50 rounded-full"
                    style={{ left: "75%" }}
                    title="75% target"
                  />
                </div>
                <div className="flex justify-end">
                  <span className="text-[10px] text-muted-foreground" style={{ marginRight: "calc(25% - 12px)" }}>
                    75% ↑
                  </span>
                </div>
              </div>

              {/* Mix Gap Analysis — Sprint 9 */}
              {summary.providerRole === 'DOCTOR' &&
                summary.currentProcedureMix && summary.futureProcedureMix &&
                Object.keys(summary.currentProcedureMix).length > 0 &&
                Object.keys(summary.futureProcedureMix).length > 0 && (() => {
                  const gapRows = computeMixGapAnalysis(summary.currentProcedureMix!, summary.futureProcedureMix!);
                  if (gapRows.length === 0) return null;
                  return (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <button
                          onClick={() => setMixGapExpanded(prev => ({ ...prev, [index]: !prev[index] }))}
                          className="text-xs font-semibold text-foreground/80 flex items-center gap-1 w-full text-left"
                        >
                          <span>📊 Mix Gap Analysis</span>
                          <span className="text-muted-foreground font-normal ml-1">
                            ({mixGapExpanded[index] ? 'hide' : `${gapRows.length} gap${gapRows.length !== 1 ? 's' : ''}`})
                          </span>
                        </button>
                        {mixGapExpanded[index] && (
                          <div className="space-y-1 text-xs">
                            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wide pb-1 border-b border-border">
                              <span>Category</span>
                              <span className="text-right">Now</span>
                              <span className="text-right">Target</span>
                              <span className="text-right">Gap</span>
                            </div>
                            {gapRows.map((row: MixGapRow) => (
                              <div key={row.category} className="space-y-0.5">
                                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center">
                                  <span className="text-foreground/80 truncate">{row.label}</span>
                                  <span className="text-right tabular-nums text-muted-foreground">{row.currentPct}%</span>
                                  <span className="text-right tabular-nums text-muted-foreground">{row.targetPct}%</span>
                                  <span className={`text-right tabular-nums font-semibold ${
                                    row.severity === 'red' ? 'text-red-600 dark:text-red-400' :
                                    row.severity === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                                    'text-green-600 dark:text-green-400'
                                  }`}>
                                    {row.gap > 0 ? '+' : ''}{row.gap}%
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground pl-1 pb-1">→ {row.action}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
            </CardContent>
          </Card>
        );
      })}

      {/* Office Total */}
      {summaries.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Total Office</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Goal:</span>
                <span className="font-semibold">{formatCurrency(totalDailyGoal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual Scheduled:</span>
                <span className="font-semibold">{formatCurrency(totalActual)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(totalActual, totalTarget)}
              </div>

              {/* Total High Production */}
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-foreground/80">
                    High Production <span className="font-normal text-muted-foreground">(Target: 75%)</span>
                  </span>
                  {getHPBadge(totalHP, totalDailyGoal)}
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-base font-bold tabular-nums ${getHPColor(totalHP, totalDailyGoal)}`}>
                    {formatCurrency(totalHP)}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums ${getHPColor(totalHP, totalDailyGoal)}`}>
                    {totalDailyGoal > 0 ? Math.round((totalHP / totalDailyGoal) * 100) : 0}%
                  </span>
                </div>
                <div className="relative">
                  <Progress
                    value={Math.min(totalDailyGoal > 0 ? Math.round((totalHP / totalDailyGoal) * 100) : 0, 100)}
                    className={`h-2.5 ${getHPProgressColor(totalHP, totalDailyGoal)}`}
                  />
                  <div
                    className="absolute top-0 h-2.5 w-0.5 bg-foreground/50 rounded-full"
                    style={{ left: "75%" }}
                    title="75% target"
                  />
                </div>
                <div className="flex justify-end">
                  <span className="text-[10px] text-muted-foreground" style={{ marginRight: "calc(25% - 12px)" }}>
                    75% ↑
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Schedule Alignment Score */}
      {alignmentScore !== undefined && (
        <>
          <Separator />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Schedule Alignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ideal Day Score:</span>
                <span
                  className={`font-bold text-base ${
                    alignmentScore.overallScore >= 80
                      ? "text-green-600"
                      : alignmentScore.overallScore >= 60
                      ? "text-yellow-600"
                      : "text-red-600"
                  }`}
                >
                  {alignmentScore.overallScore}%
                </span>
              </div>
              <Progress
                value={alignmentScore.overallScore}
                className={`h-2 ${
                  alignmentScore.overallScore >= 80
                    ? "[&>[data-slot=progress-indicator]]:bg-green-500"
                    : alignmentScore.overallScore >= 60
                    ? "[&>[data-slot=progress-indicator]]:bg-yellow-500"
                    : "[&>[data-slot=progress-indicator]]:bg-red-500"
                }`}
              />
              <div className="text-xs text-muted-foreground">
                {alignmentScore.alignedBlocks} of {alignmentScore.totalBlocks} blocks optimally placed
              </div>

              {/* Expandable per-category breakdown */}
              {alignmentScore.categoryBreakdown.length > 0 && (
                <div>
                  <button
                    onClick={() => setAlignmentExpanded(!alignmentExpanded)}
                    className="text-xs text-accent hover:underline flex items-center gap-1 mt-1"
                  >
                    {alignmentExpanded ? "▾ Hide" : "▸ Show"} category breakdown
                  </button>
                  {alignmentExpanded && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      {alignmentScore.categoryBreakdown.map((cat) => (
                        <div key={cat.category}>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-foreground/80">{cat.category}</span>
                            <span
                              className={`text-xs font-semibold ${
                                cat.score >= 80
                                  ? "text-green-600"
                                  : cat.score >= 60
                                  ? "text-yellow-600"
                                  : "text-red-600"
                              }`}
                            >
                              {cat.score}%
                            </span>
                          </div>
                          <Progress
                            value={cat.score}
                            className={`h-1 mt-0.5 ${
                              cat.score >= 80
                                ? "[&>[data-slot=progress-indicator]]:bg-green-400"
                                : cat.score >= 60
                                ? "[&>[data-slot=progress-indicator]]:bg-yellow-400"
                                : "[&>[data-slot=progress-indicator]]:bg-red-400"
                            }`}
                          />
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {cat.alignedBlocks}/{cat.totalBlocks} aligned
                            {cat.misplacedBlockTimes.length > 0 && (
                              <span className="text-red-500 ml-1">
                                (misplaced: {cat.misplacedBlockTimes.slice(0, 3).join(", ")}{cat.misplacedBlockTimes.length > 3 ? "…" : ""})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
