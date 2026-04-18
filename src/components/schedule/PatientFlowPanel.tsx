"use client";

import { useState, useMemo } from "react";
import { Users, ChevronDown, ChevronUp, AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GenerationResult, ProviderInput } from "@/lib/engine/types";
import { simulateAllProviders, SeededRandom } from "@/lib/engine/simulate-patient-flow";

interface PatientFlowPanelProps {
  schedule: GenerationResult | null;
  providers: ProviderInput[];
  timeIncrement?: number;
}

export default function PatientFlowPanel({
  schedule,
  providers,
  timeIncrement = 10,
}: PatientFlowPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const results = useMemo(() => {
    if (!schedule || providers.length === 0) return [];
    return simulateAllProviders(schedule, providers, timeIncrement, 100, new SeededRandom(42));
  }, [schedule, providers, timeIncrement]);

  if (!schedule) return null;

  const hasWarnings = results.some(r => r.runLongWarning);

  return (
    <Card className="w-full">
      <CardHeader
        className="flex flex-row items-center justify-between pb-2 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          👥 Patient Flow Estimate
          {hasWarnings && (
            <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-[10px] px-1.5 py-0.5">
              ⚠️ Overrun Risk
            </Badge>
          )}
        </CardTitle>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-3 pt-0">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No schedule data available.</p>
          ) : (
            results.map(result => (
              <div
                key={result.providerId}
                className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
              >
                {/* Provider name */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{result.providerName}</span>
                  <span className="text-xs text-muted-foreground">
                    ~{result.expectedPatients} patient{result.expectedPatients !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Time estimates */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">P50 End</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-green-500" />
                      <span className="text-xs font-medium text-foreground">{result.p50EndTime}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">P90 End</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendingUp className={`w-3 h-3 ${result.runLongWarning ? "text-red-500" : "text-orange-400"}`} />
                      <span className={`text-xs font-medium ${result.runLongWarning ? "text-red-600" : "text-foreground"}`}>
                        {result.p90EndTime}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Run long warning */}
                {result.runLongWarning && (
                  <div className="flex items-start gap-1.5 rounded-md bg-yellow-50 border border-yellow-200 px-2 py-1.5">
                    <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-yellow-800 leading-snug">
                      ⚠️ {result.providerName}&apos;s schedule may run long on 1 in 10 days
                    </p>
                  </div>
                )}

                {/* Bottleneck */}
                {result.bottleneck && (
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    <span className="font-medium">Bottleneck:</span>{" "}
                    {result.bottleneck.blockLabel} at {result.bottleneck.time} — {result.bottleneck.reason}
                  </p>
                )}
              </div>
            ))
          )}

          <p className="text-[10px] text-muted-foreground/60 leading-tight">
            Based on 100-run Monte Carlo simulation. P50 = median completion, P90 = 90th percentile.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
