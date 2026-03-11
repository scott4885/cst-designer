"use client";

/**
 * Goal Pacing Panel — Sprint 16
 *
 * Collapsible panel showing cumulative production vs. daily goal
 * with projected goal-hit time and recommendations.
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Target, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateGoalPacing } from "@/lib/engine/goal-pacing";
import type { TimeSlotOutput, ProviderInput, BlockTypeInput } from "@/lib/engine/types";

interface GoalPacingPanelProps {
  providers: ProviderInput[];
  slots: TimeSlotOutput[];
  blockTypes: BlockTypeInput[];
}

export default function GoalPacingPanel({ providers, slots, blockTypes }: GoalPacingPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    providers[0]?.id ?? ""
  );

  const provider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId),
    [providers, selectedProviderId]
  );

  const pacing = useMemo(() => {
    if (!provider) return null;
    return calculateGoalPacing(
      provider.id,
      provider.dailyGoal,
      slots,
      blockTypes,
      provider
    );
  }, [provider, slots, blockTypes]);

  if (providers.length === 0) return null;

  const goalPct = pacing
    ? Math.min(100, Math.round((pacing.scheduledTotal / pacing.dailyGoal) * 100))
    : 0;

  const isOnTrack = pacing?.goalHitByEnd ?? false;

  return (
    <Card className="border rounded-lg overflow-hidden">
      {/* Header */}
      <CardHeader
        className="py-3 px-4 cursor-pointer flex flex-row items-center justify-between"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-sm font-semibold">📈 Goal Pacing</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {pacing && (
            <Badge
              variant={isOnTrack ? "default" : "destructive"}
              className="text-xs"
            >
              {isOnTrack ? `🎯 ${goalPct}%` : `⚠️ ${goalPct}%`}
            </Badge>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Provider selector */}
          {providers.length > 1 && (
            <Select
              value={selectedProviderId}
              onValueChange={setSelectedProviderId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {pacing ? (
            <>
              {/* Key callout */}
              <div
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  isOnTrack
                    ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                }`}
              >
                {isOnTrack ? "🎯" : "⚠️"} {pacing.onTrackAt}
              </div>

              {/* Goal progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>${pacing.scheduledTotal.toLocaleString()} scheduled</span>
                  <span>Goal: ${pacing.dailyGoal.toLocaleString()}</span>
                </div>
                <Progress value={goalPct} className="h-2" />
              </div>

              {/* Cumulative by hour */}
              {pacing.cumulativeByHour.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Production by Hour
                  </p>
                  <div className="space-y-1">
                    {pacing.cumulativeByHour.map((m) => (
                      <div key={m.time} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">
                          {m.time}
                        </span>
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, m.pct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                          {m.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {pacing.recommendations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Recommendations
                  </p>
                  <ul className="space-y-1">
                    {pacing.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1">
                        <span className="shrink-0">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No provider selected
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
