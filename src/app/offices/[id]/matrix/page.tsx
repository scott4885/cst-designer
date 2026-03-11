"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Download, Camera, Grid3X3, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import { buildMatrixData, abbreviateLabel, parseTimeToMinutes } from "@/lib/matrix-helpers";
import type { MatrixData } from "@/lib/matrix-helpers";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday", FRIDAY: "Friday",
};

type DisplayMode = "codes" | "names" | "production";

const ROLE_ICONS: Record<string, string> = {
  DOCTOR: "D",
  HYGIENIST: "H",
  OTHER: "A",
};

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n}`;
}

export default function MatrixPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const officeId = params.id as string;

  const { currentOffice, fetchOffice, isLoading } = useOfficeStore();
  const { generatedSchedules, loadSchedulesForOffice } = useScheduleStore();

  const [activeDay, setActiveDay] = useState<string>(
    (searchParams.get("day") || "MONDAY").toUpperCase()
  );
  const [displayMode, setDisplayMode] = useState<DisplayMode>("names");
  const [isExporting, setIsExporting] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOffice(officeId).catch(() => router.push("/"));
  }, [officeId, fetchOffice, router]);

  useEffect(() => {
    loadSchedulesForOffice(officeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  const schedule = generatedSchedules[activeDay];
  const providers = currentOffice?.providers ?? [];
  const blockTypes = currentOffice?.blockTypes ?? [];

  const matrixData: MatrixData | null = useMemo(() => {
    if (!schedule || providers.length === 0) return null;
    return buildMatrixData(schedule, providers, blockTypes);
  }, [schedule, providers, blockTypes]);

  const handleExportPng = async () => {
    if (!matrixRef.current) {
      toast.error("Matrix not ready");
      return;
    }
    setIsExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(matrixRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `${currentOffice?.name ?? "Office"} - ${DAY_LABELS[activeDay]} Matrix.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Matrix exported as PNG!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export PNG");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !currentOffice) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const workingDays = currentOffice.workingDays.filter(d => DAYS.includes(d));

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={`/offices/${officeId}`}>
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-lg font-bold">{currentOffice.name}</h1>
              <Badge variant="outline" className="text-xs">Matrix View</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Multi-provider schedule matrix</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Display mode toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
            {(["codes", "names", "production"] as DisplayMode[]).map((mode, i) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDisplayMode(mode)}
                className={`px-3 py-1.5 transition-colors capitalize ${i > 0 ? "border-l border-border" : ""} ${
                  displayMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode === "codes" ? "D/A/H" : mode === "names" ? "Names" : "$ Prod"}
              </button>
            ))}
          </div>

          {/* Export PNG */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPng}
                disabled={!matrixData || isExporting}
                className="min-h-[44px] gap-1"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Export PNG</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {!matrixData ? "Generate a schedule first" : "Download matrix as PNG"}
            </TooltipContent>
          </Tooltip>

          {/* Back to Template Builder */}
          <Link href={`/offices/${officeId}`}>
            <Button variant="secondary" size="sm" className="min-h-[44px]">
              Template Builder
            </Button>
          </Link>
        </div>
      </div>

      {/* Day Selector */}
      <div className="flex gap-1">
        {workingDays.map(day => (
          <button
            key={day}
            type="button"
            onClick={() => setActiveDay(day)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeDay === day
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent/20"
            }`}
          >
            {DAY_LABELS[day].slice(0, 3)}
            {generatedSchedules[day] && (
              <span className="ml-1 w-1.5 h-1.5 inline-block rounded-full bg-green-400" />
            )}
          </button>
        ))}
      </div>

      {/* Matrix */}
      {!schedule ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No schedule for {DAY_LABELS[activeDay]}.</p>
            <p className="text-xs mt-1">Generate a schedule in Template Builder first.</p>
            <Link href={`/offices/${officeId}`}>
              <Button variant="outline" size="sm" className="mt-3">Go to Template Builder</Button>
            </Link>
          </div>
        </div>
      ) : !matrixData ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div
            ref={matrixRef}
            className="min-w-max bg-white rounded-xl border border-border shadow-sm overflow-hidden"
            data-matrix-capture="true"
          >
            {/* Provider Header Row */}
            <div className="flex border-b border-border bg-muted/30">
              {/* Time column header */}
              <div className="w-20 flex-shrink-0 px-3 py-2 border-r border-border">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Time</span>
              </div>
              {/* Provider columns */}
              {matrixData.providerHeaders.map(header => (
                <div
                  key={header.providerId}
                  className="flex-1 min-w-[120px] px-3 py-2 border-r border-border last:border-r-0"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: header.color }}
                    />
                    <span className="text-xs font-semibold text-foreground truncate">{header.providerName}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                      {ROLE_ICONS[header.role]}
                    </span>
                  </div>
                  {/* Goal fill bar */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatCurrency(header.scheduledProduction)}</span>
                      <span>{header.fillPercent}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          header.fillPercent >= 100 ? "bg-green-500" :
                          header.fillPercent >= 75 ? "bg-blue-500" :
                          "bg-orange-400"
                        }`}
                        style={{ width: `${Math.min(header.fillPercent, 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-muted-foreground/60">
                      Goal: {formatCurrency(header.dailyGoal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Time Rows */}
            {matrixData.rows.map((row, rowIdx) => (
              <div
                key={row.time}
                className={`flex border-b border-border last:border-b-0 ${
                  row.isLunch ? "bg-slate-100/80 dark:bg-slate-800/50" : rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50 dark:bg-slate-900/20"
                }`}
              >
                {/* Time label */}
                <div className="w-20 flex-shrink-0 px-3 py-1.5 border-r border-border flex items-center">
                  <span className="text-[10px] text-muted-foreground font-mono">{row.time}</span>
                </div>

                {/* Cells */}
                {row.cells.map((cell, cellIdx) => {
                  const isEmpty = !cell.blockLabel;
                  const isLunchCell = cell.isBreak;
                  const header = matrixData.providerHeaders[cellIdx];

                  let cellContent = null;
                  if (isLunchCell) {
                    cellContent = (
                      <span className="text-[10px] text-slate-400 italic">Lunch</span>
                    );
                  } else if (!isEmpty) {
                    if (displayMode === "codes") {
                      cellContent = (
                        <div className="flex items-center gap-1">
                          {cell.staffingCode && (
                            <span
                              className={`text-[10px] font-bold px-1 rounded ${
                                cell.staffingCode === "D" ? "bg-blue-100 text-blue-700" :
                                cell.staffingCode === "H" ? "bg-green-100 text-green-700" :
                                "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {cell.staffingCode}
                            </span>
                          )}
                          <span className="text-[10px] text-foreground truncate">
                            {abbreviateLabel(cell.blockLabel ?? "", 6)}
                          </span>
                        </div>
                      );
                    } else if (displayMode === "names") {
                      cellContent = (
                        <div className="flex items-center gap-1">
                          <div
                            className="w-2 h-2 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: cell.blockColor }}
                          />
                          <span className="text-[10px] text-foreground truncate">
                            {abbreviateLabel(cell.blockLabel ?? "", 12)}
                          </span>
                          {cell.staffingCode && (
                            <span className="text-[9px] text-muted-foreground">
                              {cell.staffingCode}
                            </span>
                          )}
                        </div>
                      );
                    } else {
                      // production mode
                      cellContent = (
                        <div className="flex flex-col gap-0">
                          <span className="text-[10px] text-foreground truncate">
                            {abbreviateLabel(cell.blockLabel ?? "", 10)}
                          </span>
                          {cell.customProductionAmount != null && (
                            <span className="text-[9px] text-green-600 font-medium">
                              {formatCurrency(cell.customProductionAmount)}
                            </span>
                          )}
                        </div>
                      );
                    }
                  }

                  return (
                    <div
                      key={cell.providerId}
                      title={
                        cell.blockLabel
                          ? `${cell.blockLabel}${cell.staffingCode ? ` (${cell.staffingCode})` : ""}${cell.customProductionAmount ? ` · $${cell.customProductionAmount}` : ""}`
                          : undefined
                      }
                      className={`flex-1 min-w-[120px] px-2 py-1 border-r border-border last:border-r-0 flex items-center min-h-[28px] ${
                        !isEmpty && !isLunchCell ? "cursor-pointer hover:opacity-80" : ""
                      }`}
                      style={
                        !isEmpty && !isLunchCell
                          ? { borderLeft: `3px solid ${cell.blockColor}` }
                          : undefined
                      }
                    >
                      {cellContent}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">Legend:</span>
            {["D = Doctor", "H = Hygienist", "A = Assistant"].map(l => (
              <span key={l} className="text-[10px] text-muted-foreground">{l}</span>
            ))}
            <span className="text-[10px] text-slate-400">Grey stripe = Lunch</span>
          </div>
        </div>
      )}
    </div>
  );
}
