"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  Save,
  CheckCircle2,
  Download,
  FileJson,
  Undo2,
  Redo2,
  Loader2,
  ChevronDown,
  Maximize,
  Minimize,
  Wand2,
  Printer,
  MoreHorizontal,
  Trash2,
  Copy,
  BarChart2,
  Grid3X3,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RotationWeek } from "@/store/schedule-store";

interface ToolbarRibbonProps {
  officeName: string;
  officeId: string;
  workingDays: string[];
  activeDay: string;
  onDayChange: (day: string) => void;
  activeWeek: RotationWeek;
  onWeekChange: (week: RotationWeek) => void;
  rotationEnabled: boolean;
  rotationWeeks: RotationWeek[];
  // Actions
  hasSchedules: boolean;
  isDirty: boolean;
  isGenerating: boolean;
  generatingDay: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onGenerate: () => void;
  onGenerateAll: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onExportDpms: () => void;
  onPrint: () => void;
  onClone: () => void;
  /** Loop 9: open the "Copy day to…" modal. */
  onCopyDay: () => void;
  /** Loop 9: set/clear variant label ("EOF" / "Opt1" / "Opt2" / null) on the active day. */
  onSetVariant: (label: string | null) => void;
  /** Loop 9: per-day variant labels for tab badges. */
  variantLabelsByDay: Record<string, string | null | undefined>;
  onClearAll: () => void;
  onDeleteOffice: () => void;
  onSmartFill: () => void;
  isSmartFilling: boolean;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
  // Conflict counts per day
  conflictsPerDay: Record<string, number>;
  // Schedule existence per day
  scheduleExistsPerDay: Record<string, boolean>;
  lastSavedAt: Date | null;
  dpmsLabel: string;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
};

const WEEK_DESCRIPTIONS: Record<string, string> = {
  A: "Standard weeks",
  B: "Alternate weeks",
  C: "Third-week",
  D: "Fourth-week",
};

export default function ToolbarRibbon({
  officeName,
  officeId,
  workingDays,
  activeDay,
  onDayChange,
  activeWeek,
  onWeekChange,
  rotationEnabled,
  rotationWeeks,
  hasSchedules,
  isDirty,
  isGenerating,
  generatingDay,
  canUndo,
  canRedo,
  onGenerate,
  onGenerateAll,
  onSave,
  onUndo,
  onRedo,
  onExportExcel,
  onExportPdf,
  onExportDpms,
  onPrint,
  onClone,
  onCopyDay,
  onSetVariant,
  variantLabelsByDay,
  onClearAll,
  onDeleteOffice,
  onSmartFill,
  isSmartFilling,
  fullScreen,
  onToggleFullScreen,
  conflictsPerDay,
  scheduleExistsPerDay,
  lastSavedAt,
  dpmsLabel,
}: ToolbarRibbonProps) {
  const activeVariantLabel = variantLabelsByDay[activeDay] ?? null;
  const VARIANT_PRESETS = ["EOF", "Opt1", "Opt2"];
  return (
    <div className="flex-shrink-0 border-b border-border/60 bg-white px-3 py-1.5">
      {/* Single row toolbar */}
      <div className="flex items-center gap-2 min-h-[40px]">
        {/* Left: Back + Office Name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Back to offices">
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>
          <h1 className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
            {officeName}
          </h1>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-border/60 flex-shrink-0" />

        {/* Center: Day tabs */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {workingDays.map((day) => {
            const isActive = activeDay === day;
            const hasSchedule = scheduleExistsPerDay[day];
            const conflicts = conflictsPerDay[day] ?? 0;
            const variant = variantLabelsByDay[day] ?? null;

            return (
              <button
                key={day}
                type="button"
                onClick={() => onDayChange(day)}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <span className="inline-flex items-center gap-1">
                  {DAY_LABELS[day] ?? day.slice(0, 3)}
                  {variant ? (
                    <span
                      data-testid={`day-variant-badge-${day}`}
                      className={`text-[9px] font-bold px-1 py-0 rounded leading-4 ${
                        isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {variant}
                    </span>
                  ) : null}
                </span>
                {hasSchedule && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                {conflicts > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-[8px] text-white font-bold flex items-center justify-center">
                    {conflicts}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Week rotation tabs */}
        {rotationEnabled && (
          <>
            <div className="w-px h-6 bg-border/60 flex-shrink-0" />
            <div className="flex items-center gap-0.5 bg-slate-50 rounded-md p-0.5 border border-border/40 flex-shrink-0">
              {rotationWeeks.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onWeekChange(w)}
                  className={`px-2 py-1 text-[11px] font-semibold rounded transition-all ${
                    activeWeek === w
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-500"
                  }`}
                  title={WEEK_DESCRIPTIONS[w]}
                >
                  Wk {w}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right: Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Undo / Redo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Undo last change"
              >
                <Undo2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Redo last undone change"
              >
                <Redo2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>

          <div className="w-px h-6 bg-border/60" />

          {/* Smart Fill */}
          {hasSchedules && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1.5 text-slate-500 hover:text-slate-700"
                  onClick={onSmartFill}
                  disabled={isSmartFilling}
                >
                  {isSmartFilling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  Smart Fill
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-fill all providers for this day</TooltipContent>
            </Tooltip>
          )}

          {/* Generate */}
          <Button
            onClick={onGenerate}
            disabled={isGenerating}
            size="sm"
            className="h-8 px-3 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            {isGenerating && !generatingDay ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {hasSchedules ? "Regenerate" : "Generate"}
          </Button>

          {/* Save */}
          {hasSchedules && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isDirty ? "default" : "outline"}
                  size="sm"
                  onClick={onSave}
                  className={`h-8 px-3 text-xs gap-1.5 ${
                    isDirty
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      : "text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  }`}
                >
                  {isDirty ? (
                    <Save className="w-3.5 h-3.5" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {isDirty ? "Save" : "Saved"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isDirty
                  ? "Save changes"
                  : lastSavedAt
                    ? `Last saved ${lastSavedAt.toLocaleTimeString()}`
                    : "All changes saved"}
              </TooltipContent>
            </Tooltip>
          )}

          <div className="w-px h-6 bg-border/60" />

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onExportExcel} disabled={!hasSchedules}>
                <Download className="w-4 h-4 mr-2" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportPdf} disabled={!hasSchedules}>
                <FileJson className="w-4 h-4 mr-2" />
                PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExportDpms} disabled={!hasSchedules}>
                <FileJson className="w-4 h-4 mr-2" />
                {dpmsLabel} Format
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onPrint} disabled={!hasSchedules}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={onGenerateAll} disabled={isGenerating}>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate All Days
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyDay} disabled={!hasSchedules}>
                <Copy className="w-4 h-4 mr-2" />
                Copy {DAY_LABELS[activeDay] ?? "day"} to…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Variant ({DAY_LABELS[activeDay] ?? activeDay})
              </div>
              {VARIANT_PRESETS.map((v) => (
                <DropdownMenuItem
                  key={v}
                  onClick={() => onSetVariant(activeVariantLabel === v ? null : v)}
                  disabled={!hasSchedules}
                >
                  <span
                    className={`w-4 h-4 mr-2 inline-flex items-center justify-center text-[10px] font-bold rounded ${
                      activeVariantLabel === v ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {activeVariantLabel === v ? "✓" : ""}
                  </span>
                  {v === "EOF" ? "EOF (Early-Off Friday)" : v}
                </DropdownMenuItem>
              ))}
              {activeVariantLabel && !VARIANT_PRESETS.includes(activeVariantLabel) && (
                <DropdownMenuItem onClick={() => onSetVariant(null)}>
                  <span className="w-4 h-4 mr-2 inline-flex items-center justify-center text-[10px] font-bold rounded bg-amber-500 text-white">
                    ✓
                  </span>
                  {activeVariantLabel} (clear)
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClone}>
                <Copy className="w-4 h-4 mr-2" />
                Clone to another office
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/offices/${officeId}/edit`}>
                  <Users className="w-4 h-4 mr-2" />
                  Manage Providers
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/offices/${officeId}/matrix?day=${activeDay.toLowerCase()}`}>
                  <Grid3X3 className="w-4 h-4 mr-2" />
                  Matrix View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/offices/${officeId}/report`}>
                  <BarChart2 className="w-4 h-4 mr-2" />
                  Weekly Report
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {hasSchedules && (
                <DropdownMenuItem onClick={onClearAll} className="text-amber-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Schedules
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDeleteOffice} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Office
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Full Screen */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleFullScreen}
                aria-label={fullScreen ? "Exit full screen" : "Enter full screen"}
              >
                {fullScreen ? (
                  <Minimize className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Maximize className="w-4 h-4" aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{fullScreen ? "Exit full screen (Esc)" : "Full screen"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
