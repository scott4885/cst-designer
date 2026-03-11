"use client";

import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, CheckSquare, Square } from "lucide-react";

interface OfficeCardProps {
  id: string;
  name: string;
  dpms: string;
  providerCount: number;
  dailyGoal: number;
  workingDays: string[];
  lastUpdated: string;
  /** Quality score 0–100, if schedule exists */
  qualityScore?: number | null;
  /** Whether the office has any schedule built */
  hasSchedule?: boolean;
  /** Bulk edit: whether this card is selected */
  bulkSelected?: boolean;
  /** Bulk edit: toggle selection callback */
  onBulkToggle?: (id: string) => void;
  /** Compare: called when user clicks Compare button */
  onCompare?: (id: string) => void;
}

function qualityBadge(score: number) {
  if (score >= 90) return { emoji: '🟢', label: `${score}`, className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400' };
  if (score >= 75) return { emoji: '🟡', label: `${score}`, className: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400' };
  if (score >= 60) return { emoji: '🟠', label: `${score}`, className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400' };
  return { emoji: '🔴', label: `${score}`, className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400' };
}

export default function OfficeCard({
  id,
  name,
  dpms,
  providerCount,
  dailyGoal,
  workingDays,
  lastUpdated,
  qualityScore,
  hasSchedule,
  bulkSelected,
  onBulkToggle,
  onCompare,
}: OfficeCardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const dayLabels: Record<string, string> = {
    Mon: "M",
    Tue: "T",
    Wed: "W",
    Thu: "T",
    Fri: "F",
  };

  const daysPerWeek = workingDays.length;
  const badge = qualityScore != null ? qualityBadge(qualityScore) : null;

  const cardContent = (
    <Card
      className={`hover:border-accent/50 transition-all cursor-pointer group relative ${
        bulkSelected ? 'ring-2 ring-accent border-accent' : ''
      }`}
      onClick={onBulkToggle ? (e) => { e.preventDefault(); onBulkToggle(id); } : undefined}
    >
      {/* Bulk selection checkbox overlay */}
      {onBulkToggle !== undefined && (
        <div className="absolute top-3 right-3 z-10">
          {bulkSelected ? (
            <CheckSquare className="w-5 h-5 text-accent" />
          ) : (
            <Square className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors truncate">
              {name}
            </h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge variant="secondary" className="text-xs">{dpms}</Badge>
              {hasSchedule ? (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300 dark:text-green-400">
                  Schedule Ready
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  No Schedule
                </Badge>
              )}
            </div>
          </div>
          {/* Quality score badge */}
          {badge && (
            <div
              className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-bold border ${badge.className}`}
              title={`Quality score: ${qualityScore}`}
            >
              {badge.emoji} {badge.label}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Providers</p>
            <p className="font-semibold text-foreground">{providerCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Daily Goal</p>
            <p className="font-semibold text-foreground">{formatCurrency(dailyGoal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Days/Week</p>
            <p className="font-semibold text-foreground">{daysPerWeek}</p>
          </div>
        </div>

        {/* Working Days */}
        <div className="flex items-center gap-1.5">
          {Object.entries(dayLabels).map(([day, label]) => (
            <div
              key={day}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                workingDays.includes(day)
                  ? "bg-accent/20 text-accent border border-accent/30"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Bottom row: last updated + compare button */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Updated {lastUpdated}</p>
          {onCompare && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-accent"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                onCompare(id);
              }}
            >
              <GitCompareArrows className="w-3 h-3" />
              Compare
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // In bulk mode, don't wrap with Link (card itself handles clicks)
  if (onBulkToggle !== undefined) {
    return cardContent;
  }

  return <Link href={`/offices/${id}`}>{cardContent}</Link>;
}
