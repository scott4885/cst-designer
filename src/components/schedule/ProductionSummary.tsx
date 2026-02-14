"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export interface ProviderProductionSummary {
  providerName: string;
  providerColor: string;
  dailyGoal: number;
  target75: number;
  actualScheduled: number;
}

interface ProductionSummaryProps {
  summaries: ProviderProductionSummary[];
}

export default function ProductionSummary({ summaries }: ProductionSummaryProps) {
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
    </div>
  );
}
