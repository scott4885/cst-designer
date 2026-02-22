"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GenerationResult, ProviderInput } from "@/lib/engine/types";
import {
  detectAllConflicts,
  getProductionTotals,
  type ScheduleConflict,
} from "@/lib/engine/conflict-detector";

interface ConflictPanelProps {
  schedule: GenerationResult | null;
  providers: ProviderInput[];
  onSlotClick?: (time: string, providerId: string) => void;
}

export default function ConflictPanel({ schedule, providers, onSlotClick }: ConflictPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const conflicts = useMemo(() => {
    if (!schedule) return [];
    return detectAllConflicts(schedule, providers);
  }, [schedule, providers]);

  const productionTotals = useMemo(() => {
    if (!schedule?.productionSummary) return null;
    return getProductionTotals(schedule.productionSummary);
  }, [schedule]);

  const errors = conflicts.filter(c => c.severity === 'error');
  const warnings = conflicts.filter(c => c.severity === 'warning');
  const isClean = conflicts.length === 0;

  if (!schedule) return null;

  return (
    <Card className="mt-4">
      <CardHeader
        className="cursor-pointer py-3 px-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {isClean ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : errors.length > 0 ? (
              <AlertCircle className="w-4 h-4 text-red-500" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
            )}
            Schedule Validation
            {!isClean && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                ({errors.length} error{errors.length !== 1 ? 's' : ''}, {warnings.length} warning{warnings.length !== 1 ? 's' : ''})
              </span>
            )}
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4 space-y-3">
          {isClean && productionTotals && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="font-medium">All good!</p>
                <p className="text-xs opacity-80">
                  Total production: ${Math.round(productionTotals.totalScheduled).toLocaleString()} / ${Math.round(productionTotals.totalTarget75).toLocaleString()} target
                </p>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-2">
              {errors.map((conflict) => (
                <ConflictItem
                  key={conflict.id}
                  conflict={conflict}
                  onSlotClick={onSlotClick}
                />
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((conflict) => (
                <ConflictItem
                  key={conflict.id}
                  conflict={conflict}
                  onSlotClick={onSlotClick}
                />
              ))}
            </div>
          )}

          {productionTotals && !isClean && (
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Total: ${Math.round(productionTotals.totalScheduled).toLocaleString()} / ${Math.round(productionTotals.totalTarget75).toLocaleString()} target ({Math.round((productionTotals.totalScheduled / productionTotals.totalTarget75) * 100)}%)
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ConflictItem({
  conflict,
  onSlotClick,
}: {
  conflict: ScheduleConflict;
  onSlotClick?: (time: string, providerId: string) => void;
}) {
  const isError = conflict.severity === 'error';

  return (
    <div
      className={`flex items-start gap-2 p-2 rounded-lg text-sm cursor-pointer hover:opacity-80 transition-opacity ${
        isError
          ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'
          : 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400'
      }`}
      onClick={() => {
        if (conflict.time && conflict.providerId && onSlotClick) {
          onSlotClick(conflict.time, conflict.providerId);
        }
      }}
    >
      {isError ? (
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <p className="font-medium text-xs">{conflict.message}</p>
        {conflict.details && (
          <p className="text-xs opacity-70">{conflict.details}</p>
        )}
      </div>
    </div>
  );
}
