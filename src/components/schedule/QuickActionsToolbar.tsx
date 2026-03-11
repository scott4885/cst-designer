"use client";

import { useState } from "react";
import { Wand2, Copy, RotateCcw, ShieldCheck, Printer, Download, Loader2, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface QuickActionsToolbarProps {
  /** Currently active day of week (e.g. "MONDAY") */
  activeDay: string;
  /** Whether a schedule exists for the current day */
  hasSchedule: boolean;
  /** Whether any schedule exists (for copy-all) */
  hasAnySchedule: boolean;
  /** Working days for the office */
  workingDays: string[];
  /** Whether Smart Fill All is running */
  isSmartFilling?: boolean;
  onSmartFillAll: () => void;
  onCopyMondayToAll: () => void;
  onResetDay: () => void;
  onValidate: () => void;
  onPrint: () => void;
  onExport: () => void;
  /** Optional: opens the clone template modal */
  onClone?: () => void;
}

const getDayLabel = (day: string) => {
  const labels: Record<string, string> = {
    MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri',
  };
  return labels[day] || day;
};

export default function QuickActionsToolbar({
  activeDay,
  hasSchedule,
  hasAnySchedule,
  workingDays,
  isSmartFilling = false,
  onSmartFillAll,
  onCopyMondayToAll,
  onResetDay,
  onValidate,
  onPrint,
  onExport,
  onClone,
}: QuickActionsToolbarProps) {
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const firstDay = workingDays[0] ?? 'MONDAY';
  const firstDayLabel = getDayLabel(firstDay);
  const activeDayLabel = getDayLabel(activeDay);
  const hasMultipleDays = workingDays.length > 1;

  return (
    <>
      <div
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border bg-muted/40 flex-wrap"
        role="toolbar"
        aria-label="Quick actions"
        data-testid="quick-actions-toolbar"
      >
        {/* Smart Fill All */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onSmartFillAll}
              disabled={isSmartFilling}
              data-testid="quick-action-smart-fill"
            >
              {isSmartFilling ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wand2 className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">Smart Fill All</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Generate Smart Fill for all providers on {activeDayLabel}</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Copy First Day → All Days */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => setShowCopyConfirm(true)}
              disabled={!hasAnySchedule || !hasMultipleDays}
              data-testid="quick-action-copy-monday"
            >
              <Copy className="w-3 h-3" />
              <span className="hidden sm:inline">Copy {firstDayLabel} → All Days</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasAnySchedule
              ? `Generate a schedule for ${firstDayLabel} first`
              : !hasMultipleDays
                ? 'Only one working day configured'
                : `Copy ${firstDayLabel}'s schedule to all other working days`}
          </TooltipContent>
        </Tooltip>

        {/* Reset Day */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setShowResetConfirm(true)}
              disabled={!hasSchedule}
              data-testid="quick-action-reset-day"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset {activeDayLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasSchedule
              ? `No schedule to reset for ${activeDayLabel}`
              : `Clear all blocks for ${activeDayLabel}`}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Validate */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onValidate}
              disabled={!hasSchedule}
              data-testid="quick-action-validate"
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="hidden sm:inline">Validate</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasSchedule ? 'Generate a schedule first' : 'Run clinical rules validation'}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Print */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onPrint}
              disabled={!hasSchedule}
              data-testid="quick-action-print"
            >
              <Printer className="w-3 h-3" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasSchedule ? 'Generate a schedule first' : `Open print view for ${activeDayLabel}`}
          </TooltipContent>
        </Tooltip>

        {/* Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={onExport}
              disabled={!hasAnySchedule}
              data-testid="quick-action-export"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {!hasAnySchedule ? 'Generate a schedule first' : 'Export all schedules to Excel'}
          </TooltipContent>
        </Tooltip>

        {onClone && (
          <>
            <div className="w-px h-5 bg-border mx-0.5" />
            {/* Clone to Another Office */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={onClone}
                  disabled={!hasAnySchedule}
                  data-testid="quick-action-clone"
                >
                  <ClipboardCopy className="w-3 h-3" />
                  <span className="hidden sm:inline">Clone to Office</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {!hasAnySchedule ? 'Generate a schedule first' : 'Clone this schedule to another office'}
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Confirm: Copy first day → all days */}
      <ConfirmDialog
        open={showCopyConfirm}
        onOpenChange={setShowCopyConfirm}
        title={`Copy ${firstDayLabel} Schedule to All Days?`}
        description={`This will overwrite the current schedules for all other working days with ${firstDayLabel}'s schedule. Any existing blocks on those days will be lost.`}
        confirmLabel={`Copy ${firstDayLabel} → All Days`}
        variant="destructive"
        onConfirm={() => {
          setShowCopyConfirm(false);
          onCopyMondayToAll();
        }}
      />

      {/* Confirm: Reset day */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={`Reset ${activeDayLabel}?`}
        description={`This will clear all blocks for ${activeDayLabel}. This cannot be undone.`}
        confirmLabel="Reset Day"
        variant="destructive"
        onConfirm={() => {
          setShowResetConfirm(false);
          onResetDay();
        }}
      />
    </>
  );
}
