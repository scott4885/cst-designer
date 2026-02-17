"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { AlignmentScore } from "@/lib/engine/ideal-day";

export interface ProviderProductionSummary {
  providerName: string;
  providerColor: string;
  dailyGoal: number;
  target75: number;
  actualScheduled: number;
}

interface ProductionSummaryProps {
  summaries: ProviderProductionSummary[];
  alignmentScore?: AlignmentScore;
}

export default function ProductionSummary({ summaries, alignmentScore }: ProductionSummaryProps) {
  const [alignmentExpanded, setAlignmentExpanded] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
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
      {summaries.map((summary, index) => (
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
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Daily Goal:</span>
              <span className="font-semibold">{formatCurrency(summary.dailyGoal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">75% Target:</span>
              <span className="font-semibold">{formatCurrency(summary.target75)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actual Scheduled:</span>
              <span className="font-semibold">{formatCurrency(summary.actualScheduled)}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-muted-foreground">Status:</span>
              {getStatusBadge(summary.actualScheduled, summary.target75)}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Office Total */}
      {summaries.length > 0 && (
        <>
          <Separator />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Total Office</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Goal:</span>
                <span className="font-semibold">{formatCurrency(totalDailyGoal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">75% Target:</span>
                <span className="font-semibold">{formatCurrency(totalTarget)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual Scheduled:</span>
                <span className="font-semibold">{formatCurrency(totalActual)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-muted-foreground">Status:</span>
                {getStatusBadge(totalActual, totalTarget)}
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
