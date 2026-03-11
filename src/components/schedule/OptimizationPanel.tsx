"use client";

import { useState, useMemo } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Zap, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GenerationResult, ProviderInput, BlockTypeInput } from "@/lib/engine/types";
import type { QualityScore } from "@/lib/engine/quality-score";
import type { ClinicalWarning } from "@/lib/engine/clinical-rules";
import {
  generateOptimizationSuggestions,
  type OptimizationSuggestion,
} from "@/lib/engine/optimizer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OptimizationPanelProps {
  schedule: GenerationResult | null;
  providers: ProviderInput[];
  blockTypes: BlockTypeInput[];
  qualityScore: QualityScore | undefined;
  clinicalWarnings: ClinicalWarning[];
  onApplySuggestion?: (suggestion: OptimizationSuggestion) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  production: "bg-green-100 text-green-700 border-green-200",
  utilization: "bg-blue-100 text-blue-700 border-blue-200",
  clinical: "bg-red-100 text-red-700 border-red-200",
  mix: "bg-purple-100 text-purple-700 border-purple-200",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-green-600",
  medium: "text-yellow-600",
  hard: "text-red-600",
};

export default function OptimizationPanel({
  schedule,
  providers,
  blockTypes,
  qualityScore,
  clinicalWarnings,
  onApplySuggestion,
}: OptimizationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const suggestions = useMemo(() => {
    if (!schedule || !qualityScore) return [];
    try {
      return generateOptimizationSuggestions(
        schedule,
        providers,
        blockTypes,
        qualityScore,
        clinicalWarnings
      );
    } catch {
      return [];
    }
  }, [schedule, providers, blockTypes, qualityScore, clinicalWarnings]);

  const easySuggestions = suggestions.filter(s => s.difficulty === "easy" && s.canAutoApply);
  const totalPotentialScore = suggestions.reduce((sum, s) => sum + s.estimatedScoreImprovement, 0);

  const handleApply = (suggestion: OptimizationSuggestion) => {
    if (onApplySuggestion) {
      onApplySuggestion(suggestion);
    }
    setApplied(prev => new Set(prev).add(suggestion.id));
    toast.success(`Applied: ${suggestion.action.slice(0, 60)}${suggestion.action.length > 60 ? "…" : ""}`);
  };

  const handleApplyAllEasy = () => {
    const toApply = easySuggestions.filter(s => !applied.has(s.id));
    if (toApply.length === 0) {
      toast.info("All easy suggestions already applied.");
      return;
    }
    for (const s of toApply) {
      if (onApplySuggestion) onApplySuggestion(s);
      setApplied(prev => new Set(prev).add(s.id));
    }
    toast.success(`Applied ${toApply.length} easy suggestion${toApply.length !== 1 ? "s" : ""}!`);
  };

  if (!schedule || !qualityScore) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            Optimization Suggestions
            {suggestions.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {suggestions.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-0 space-y-3">
          {suggestions.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              <span>Schedule is well-optimized — no suggestions at this time!</span>
            </div>
          ) : (
            <>
              {/* Summary + Apply All Easy */}
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <span className="text-[11px] text-muted-foreground">
                  Potential: <span className="font-semibold text-foreground">+{Math.min(totalPotentialScore, 100 - qualityScore.total)} pts</span>
                </span>
                {easySuggestions.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2 gap-1"
                    onClick={handleApplyAllEasy}
                    disabled={easySuggestions.every(s => applied.has(s.id))}
                  >
                    <Zap className="w-3 h-3" />
                    Apply All Easy ({easySuggestions.length})
                  </Button>
                )}
              </div>

              {/* Suggestion list */}
              <div className="space-y-2">
                {suggestions.map(suggestion => {
                  const isApplied = applied.has(suggestion.id);
                  return (
                    <div
                      key={suggestion.id}
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-lg border transition-colors",
                        isApplied
                          ? "bg-green-50 border-green-200 opacity-60"
                          : "bg-card border-border hover:bg-accent/5"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                              CATEGORY_COLORS[suggestion.category] ?? "bg-muted"
                            )}
                          >
                            {suggestion.category}
                          </span>
                          <span className="text-[10px] font-bold text-accent">
                            +{suggestion.estimatedScoreImprovement} pts
                          </span>
                          <span className={cn("text-[10px] font-medium", DIFFICULTY_COLORS[suggestion.difficulty])}>
                            {suggestion.difficulty}
                          </span>
                          {isApplied && (
                            <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              Applied
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground leading-snug">{suggestion.action}</p>
                      </div>
                      {suggestion.canAutoApply && !isApplied && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2 flex-shrink-0"
                          onClick={() => handleApply(suggestion)}
                        >
                          Apply
                        </Button>
                      )}
                      {!suggestion.canAutoApply && !isApplied && (
                        <div className="flex-shrink-0">
                          <Circle className="w-4 h-4 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
