"use client";

/**
 * Goal Pacing Panel — Sprint 16 + Loop 4 morning-load viz
 *
 * Collapsible panel showing cumulative production vs. daily goal
 * with projected goal-hit time and recommendations.
 *
 * Loop 4 adds a prominent morning-load section surfacing the
 * Burkhart-80/20 ratio, target marker, swap history, and hard-cap warnings.
 */

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
  Sunrise,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateGoalPacing } from "@/lib/engine/goal-pacing";
import {
  MORNING_LOAD_TARGET,
  MORNING_LOAD_SWAP_TRIGGER,
  MORNING_LOAD_HARD_CAP,
} from "@/lib/engine/morning-load-enforcer";
import type {
  TimeSlotOutput,
  ProviderInput,
  BlockTypeInput,
  GenerationResult,
} from "@/lib/engine/types";

interface GoalPacingPanelProps {
  providers: ProviderInput[];
  slots: TimeSlotOutput[];
  blockTypes: BlockTypeInput[];
  /** Loop 4: morning-load telemetry from the generator. Optional for backward compat. */
  morningLoadSwaps?: GenerationResult["morningLoadSwaps"];
}

export default function GoalPacingPanel({
  providers,
  slots,
  blockTypes,
  morningLoadSwaps,
}: GoalPacingPanelProps) {
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
                    ? "bg-green-50 text-green-800"
                    : "bg-amber-50 text-amber-800"
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

              {/* Loop 4: Morning-load (Burkhart 80/20) section */}
              <MorningLoadSection morningLoadSwaps={morningLoadSwaps} />

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

// ─── Loop 4: Morning-Load (Burkhart 80/20) Section ─────────────────────────

interface MorningLoadSectionProps {
  morningLoadSwaps?: GenerationResult["morningLoadSwaps"];
}

function MorningLoadSection({ morningLoadSwaps }: MorningLoadSectionProps) {
  if (!morningLoadSwaps) return null;

  const { scheduleRatio, swaps, hardCapViolators } = morningLoadSwaps;
  const pct = Math.round(scheduleRatio * 100);
  const targetPct = Math.round(MORNING_LOAD_TARGET * 100);

  // Four-tier color scheme
  let tier: "target" | "acceptable" | "needs_work" | "hard_cap";
  let tierLabel: string;
  if (scheduleRatio >= MORNING_LOAD_TARGET) {
    tier = "target";
    tierLabel = "On Target";
  } else if (scheduleRatio >= MORNING_LOAD_SWAP_TRIGGER) {
    tier = "acceptable";
    tierLabel = "Acceptable";
  } else if (scheduleRatio >= MORNING_LOAD_HARD_CAP) {
    tier = "needs_work";
    tierLabel = "Needs Work";
  } else {
    tier = "hard_cap";
    tierLabel = "Below Hard Cap";
  }

  const tierColors: Record<typeof tier, { bg: string; text: string; bar: string }> = {
    target: { bg: "bg-emerald-50", text: "text-emerald-800", bar: "bg-emerald-500" },
    acceptable: { bg: "bg-sky-50", text: "text-sky-800", bar: "bg-sky-500" },
    needs_work: { bg: "bg-amber-50", text: "text-amber-800", bar: "bg-amber-500" },
    hard_cap: { bg: "bg-rose-50", text: "text-rose-800", bar: "bg-rose-500" },
  };
  const c = tierColors[tier];

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sunrise className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Morning Load (80/20)
          </span>
        </div>
        <Badge variant="secondary" className={`text-xs ${c.bg} ${c.text} border-0`}>
          {tierLabel}
        </Badge>
      </div>

      {/* Big ratio + mini bar with 80% marker */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className={`text-2xl font-bold ${c.text}`}>{pct}%</span>
          <span className="text-xs text-muted-foreground">
            Target: {targetPct}%
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${c.bar}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {/* 80% target marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-foreground/40"
            style={{ left: `${targetPct}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Hard-cap violator warning */}
      {hardCapViolators.length > 0 && (
        <div className="flex items-start gap-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>
            {hardCapViolators.length} provider-op
            {hardCapViolators.length !== 1 ? "s" : ""} below{" "}
            {Math.round(MORNING_LOAD_HARD_CAP * 100)}% floor
          </span>
        </div>
      )}

      {/* Swap history */}
      {swaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Auto-swaps applied ({swaps.length})
          </p>
          <ul className="space-y-0.5 max-h-24 overflow-y-auto">
            {swaps.map((s, i) => (
              <li
                key={i}
                className="text-[11px] text-muted-foreground flex gap-1"
              >
                <span className="shrink-0">•</span>
                <span>
                  {s.operatory} {s.pmBlockTime} {s.pmBlockLabel} ↔{" "}
                  {s.amBlockTime} {s.amBlockLabel} ({Math.round(s.ratioBefore * 100)}%→
                  {Math.round(s.ratioAfter * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
