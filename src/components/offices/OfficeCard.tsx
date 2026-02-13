"use client";

import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OfficeCardProps {
  id: string;
  name: string;
  dpms: string;
  providerCount: number;
  dailyGoal: number;
  workingDays: string[];
  lastUpdated: string;
}

export default function OfficeCard({
  id,
  name,
  dpms,
  providerCount,
  dailyGoal,
  workingDays,
  lastUpdated,
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

  return (
    <Link href={`/offices/${id}`}>
      <Card className="hover:border-accent/50 transition-all cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                {name}
              </h3>
              <Badge variant="secondary" className="mt-1 text-xs">
                {dpms}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Providers</p>
              <p className="font-semibold text-foreground">{providerCount}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Daily Goal</p>
              <p className="font-semibold text-foreground">
                {formatCurrency(dailyGoal)}
              </p>
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

          {/* Last Updated */}
          <p className="text-xs text-muted-foreground">
            Updated {lastUpdated}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
