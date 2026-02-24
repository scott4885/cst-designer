"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Sparkles, ChevronLeft, ChevronRight, Loader2, Settings, Trash2, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ScheduleGrid, { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import ProductionSummary, { ProviderProductionSummary } from "@/components/schedule/ProductionSummary";
import ProductionMixChart from "@/components/schedule/ProductionMixChart";
import ConflictPanel from "@/components/schedule/ConflictPanel";
import VersionPanel from "@/components/schedule/VersionPanel";
import OpenDentalExportDialog from "@/components/schedule/OpenDentalExportDialog";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
// CRUD operations go through API routes (Prisma backend)
import { generateExcel, ExportInput, ExportDaySchedule } from "@/lib/export/excel";
import type { BlockTypeInput } from "@/lib/engine/types";
import { detectConflicts } from "@/lib/engine/stagger";
import type { ConflictResult } from "@/lib/engine/stagger";
import { detectDTimeConflicts } from "@/lib/engine/da-time";
import type { DTimeConflict } from "@/lib/engine/da-time";
import { scoreScheduleAlignment, DEFAULT_IDEAL_DAY_TEMPLATE } from "@/lib/engine/ideal-day";
import type { AlignmentScore } from "@/lib/engine/ideal-day";

export default function TemplateBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const officeId = params.id as string;

  const { currentOffice, fetchOffice, isLoading: officeLoading } = useOfficeStore();
  const {
    generatedSchedules,
    activeDay,
    setActiveDay,
    setSchedules,
    isGenerating,
    setGenerating,
    isExporting,
    setExporting,
    loadSchedulesForOffice,
    placeBlockInDay,
    removeBlockInDay,
    moveBlockInDay,
    updateBlockInDay,
  } = useScheduleStore();

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [generatingDay, setGeneratingDay] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });
  const [showODExportDialog, setShowODExportDialog] = useState(false);

  // Fetch office data on mount
  useEffect(() => {
    fetchOffice(officeId).catch((error) => {
      toast.error("Failed to load office");
      console.error(error);
      router.push("/");
    });
  }, [officeId, fetchOffice, router]);

  // Load schedules for this office from localStorage
  useEffect(() => {
    loadSchedulesForOffice(officeId);
  }, [officeId, loadSchedulesForOffice]);

  // Set initial active day when office loads
  useEffect(() => {
    if (currentOffice && currentOffice.workingDays.length > 0) {
      setActiveDay(currentOffice.workingDays[0]);
    }
  }, [currentOffice, setActiveDay]);

  // Get current day's schedule
  const currentDaySchedule = generatedSchedules[activeDay];

  // Reactively compute production summaries from current slots
  // NOTE: All useMemos MUST be above the early return to maintain consistent hook order
  const productionSummaries: ProviderProductionSummary[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice) return [];
    if (!currentDaySchedule.productionSummary || !Array.isArray(currentDaySchedule.productionSummary)) return [];
    try {
      return currentDaySchedule.productionSummary.map((summary) => ({
        providerName: String(summary.providerName || "Unknown"),
        providerColor:
          currentOffice.providers?.find((p) => p.id === summary.providerId)?.color || "#666",
        dailyGoal: Number(summary.dailyGoal) || 0,
        target75: Number(summary.target75) || 0,
        actualScheduled: Number(summary.actualScheduled) || 0,
        highProductionScheduled: Number(summary.highProductionScheduled) || 0,
      }));
    } catch {
      console.error("Error computing production summaries");
      return [];
    }
  }, [currentDaySchedule, currentOffice]);

  // Conflicts for the currently visible day → passed to ScheduleGrid
  const currentDayConflicts: ConflictResult[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return [];
    try {
      return detectConflicts(currentDaySchedule, currentOffice.providers);
    } catch {
      return [];
    }
  }, [currentDaySchedule, currentOffice]);

  // D-time conflicts: doctor hands-on time overlapping across columns → warning level
  const currentDayDTimeConflicts: DTimeConflict[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return [];
    try {
      return detectDTimeConflicts(
        currentDaySchedule,
        currentOffice.providers,
        currentOffice.blockTypes ?? []
      );
    } catch {
      return [];
    }
  }, [currentDaySchedule, currentOffice]);

  // Conflict counts per day → shown on day tabs
  const conflictsPerDay = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!currentOffice?.providers?.length) return counts;
    for (const [day, schedule] of Object.entries(generatedSchedules)) {
      try {
        counts[day] = detectConflicts(schedule, currentOffice.providers).length;
      } catch {
        counts[day] = 0;
      }
    }
    return counts;
  }, [generatedSchedules, currentOffice]);

  // Ideal Day alignment score → passed to ProductionSummary
  const alignmentScore: AlignmentScore | undefined = useMemo(() => {
    if (!currentDaySchedule) return undefined;
    try {
      return scoreScheduleAlignment(currentDaySchedule, DEFAULT_IDEAL_DAY_TEMPLATE);
    } catch {
      return undefined;
    }
  }, [currentDaySchedule]);

  if (officeLoading || !currentOffice) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-2">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading office...</p>
        </div>
      </div>
    );
  }

  // Convert providers to ScheduleGrid format - expand multi-op doctors into separate display columns
  // Multi-op providers get virtual IDs: "${id}::${op}" so each op has its own column.
  // When doubleBooking=false, doctors only get ONE column (their first operatory) since the
  // generator only creates slots for a single operatory in that case.
  const doubleBookingEnabled = currentOffice.rules?.doubleBooking !== false;
  const providers: ProviderInput[] = [];
  for (const p of (currentOffice.providers || [])) {
    const ops = p.operatories || [];
    const isDoctor = p.role === 'DOCTOR';
    // For non-double-booked doctors, only show 1 column regardless of operatory count
    const displayOps = (!doubleBookingEnabled && isDoctor) ? ops.slice(0, 1) : ops;
    if (displayOps.length > 1) {
      // Multi-op: create one display column per operatory with virtual ID
      displayOps.forEach((op) => {
        providers.push({
          id: `${p.id}::${op}`,
          name: p.name,
          role: p.role,
          color: p.color,
          operatories: [op],
          workingStart: p.workingStart,
          workingEnd: p.workingEnd,
        });
      });
    } else {
      const singleOp = displayOps.length > 0 ? displayOps[0] : (ops[0] || 'OP1');
      providers.push({
        // Use virtual ID with operatory when provider has multiple ops but we're showing one
        id: (ops.length > 1 && !doubleBookingEnabled && isDoctor) ? `${p.id}::${singleOp}` : p.id,
        name: p.name,
        role: p.role,
        color: p.color,
        operatories: [singleOp],
        workingStart: p.workingStart,
        workingEnd: p.workingEnd,
      });
    }
  }

  // Full provider data for store operations
  const fullProviders = currentOffice.providers || [];
  // Use office-specific block types when available, otherwise undefined to let BlockPicker use the global library
  const blockTypes = (currentOffice.blockTypes && currentOffice.blockTypes.length > 0)
    ? currentOffice.blockTypes
    : undefined;
  const blockTypesForStore = currentOffice.blockTypes || [];
  const timeIncrement = currentOffice.timeIncrement || 10;

  // Build set of multi-op provider IDs for virtual ID conversion.
  // When doubleBooking=false, doctors with multiple ops are treated as single-op for display purposes.
  const multiOpProviderIds = new Set<string>(
    (currentOffice.providers || [])
      .filter(p => {
        const hasMultipleOps = (p.operatories || []).length > 1;
        if (!hasMultipleOps) return false;
        // Doctors with doubleBooking=false only show 1 column, but their slots still use virtual ID
        // because the generator assigns slots to the first operatory specifically.
        return true;
      })
      .map(p => p.id)
  );

  // Convert schedule to TimeSlotOutput format for ScheduleGrid
  const timeSlots: TimeSlotOutput[] = [];
  if (currentDaySchedule) {
    const slotsByTime: Record<string, any[]> = {};

    currentDaySchedule.slots.forEach((slot) => {
      if (!slotsByTime[slot.time]) {
        slotsByTime[slot.time] = [];
      }
      // For multi-op providers, use virtual provider ID to separate operatory columns
      const displayProviderId = multiOpProviderIds.has(slot.providerId)
        ? `${slot.providerId}::${slot.operatory}`
        : slot.providerId;

      slotsByTime[slot.time].push({
        providerId: displayProviderId,
        staffingCode: slot.staffingCode || undefined,
        blockLabel: slot.blockLabel || undefined,
        blockTypeId: slot.blockTypeId || undefined,
        isBreak: slot.isBreak,
        blockInstanceId: slot.blockInstanceId ?? null,
        customProductionAmount: slot.customProductionAmount ?? null,
      });
    });

    Object.keys(slotsByTime).forEach((time) => {
      timeSlots.push({
        time,
        slots: slotsByTime[time],
      });
    });

    // Sort by time
    timeSlots.sort((a, b) => {
      const parseTime = (t: string) => {
        const [time, period] = t.split(' ');
        const [hour, min] = time.split(':').map(Number);
        let h = hour;
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      return parseTime(a.time) - parseTime(b.time);
    });
  }

  // Generate schedule for a single day
  const handleGenerateSchedule = async () => {
    if (!currentOffice) return;

    setGenerating(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: [activeDay] }),
      });
      if (!res.ok) throw new Error('Failed to generate schedule');
      const data = await res.json();
      setSchedules(data.schedules, officeId);
      toast.success(`Schedule generated for ${activeDay}!`);
    } catch (error) {
      console.error("Error generating schedule:", error);
      toast.error("Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  // Generate schedules for all working days
  const handleGenerateAllDays = async () => {
    if (!currentOffice || !currentOffice.workingDays.length) return;

    setGenerating(true);
    const totalDays = currentOffice.workingDays.length;
    let completedDays = 0;
    setGenerationProgress({ completed: 0, total: totalDays });
    const allSchedules: any[] = [...Object.values(generatedSchedules)];

    try {
      for (const day of currentOffice.workingDays) {
        setGeneratingDay(day);

        await new Promise(resolve => setTimeout(resolve, 0));

        const genRes = await fetch(`/api/offices/${officeId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: [day] }),
        });
        if (!genRes.ok) throw new Error(`Failed to generate ${day}`);
        const genData = await genRes.json();
        const schedules = genData.schedules;
        allSchedules.push(...schedules);
        setSchedules(allSchedules, officeId);

        completedDays++;
        setGenerationProgress({ completed: completedDays, total: totalDays });
        toast.success(`Generated ${getDayLabel(day)} (${completedDays}/${totalDays})`);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      toast.success("All schedules generated successfully!");
      setGeneratingDay(null);
    } catch (error) {
      console.error("Error generating all schedules:", error);
      toast.error("Failed to generate all schedules");
      setGeneratingDay(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteOffice = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/offices/${officeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete office");
      toast.success("Office deleted");
      router.push("/");
    } catch (error) {
      console.error("Error deleting office:", error);
      toast.error("Failed to delete office");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleExport = async () => {
    if (!currentDaySchedule) {
      toast.error("Please generate a schedule first");
      return;
    }

    setExporting(true);
    try {
      const allSchedules = Object.values(generatedSchedules);

      if (allSchedules.length === 0) {
        toast.error("No schedules to export");
        return;
      }

      const exportInput: ExportInput = {
        officeName: currentOffice.name,
        providers: (currentOffice.providers || []).map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          operatories: p.operatories,
          dailyGoal: p.dailyGoal,
          hourlyRate: calculateHourlyRate(
            p.workingStart,
            p.workingEnd,
            p.lunchStart,
            p.lunchEnd,
            p.dailyGoal
          ),
          color: p.color,
          goal75: p.dailyGoal * 0.75,
        })),
        blockTypes: (currentOffice.blockTypes || []).map((b) => ({
          label: b.label,
          description: b.description,
          minimumAmount: b.minimumAmount,
          color: undefined,
        })),
        daySchedules: allSchedules.map((schedule: any) => {
          const daySchedule: ExportDaySchedule = {
            dayOfWeek: schedule.dayOfWeek,
            variant: schedule.variant,
            slots: schedule.slots.map((slot: any) => ({
              time: slot.time,
              providerId: slot.providerId,
              staffingCode: slot.staffingCode,
              blockLabel: slot.blockLabel
                ? formatBlockLabel(slot.blockLabel, currentOffice.blockTypes || [], slot.blockTypeId)
                : null,
              isBreak: slot.isBreak,
            })),
            productionSummary: schedule.productionSummary.map((summary: any) => ({
              providerId: summary.providerId,
              actualScheduled: summary.actualScheduled,
              status: summary.status,
            })),
          };
          return daySchedule;
        }),
      };

      const buffer = await generateExcel(exportInput);
      const blob = new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Customized Schedule Template - ${currentOffice.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("Schedule exported successfully!");
    } catch (error) {
      console.error("Error exporting schedule:", error);
      toast.error("Failed to export schedule");
    } finally {
      setExporting(false);
    }
  };

  // Interactive schedule editing handlers
  // Note: store functions now accept virtual provider IDs ("realId::OP") for multi-op providers
  const handleAddBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => {
    const placed = placeBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore);
    if (placed) {
      toast.success(`${blockType.label} block added`);
    } else {
      toast.error("Could not place block — slot not found or outside work hours");
    }
  };

  const handleRemoveBlock = (time: string, providerId: string) => {
    removeBlockInDay(activeDay, time, providerId, fullProviders, blockTypesForStore);
    toast.success("Block removed");
  };

  const handleMoveBlock = (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => {
    moveBlockInDay(activeDay, fromTime, fromProviderId, toTime, toProviderId, fullProviders, blockTypesForStore);
    toast.success("Block moved");
  };

  const handleUpdateBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => {
    updateBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore, customProductionAmount);
    toast.success(`Block updated to ${blockType.label}`);
  };

  const getDayLabel = (day: string): string => {
    const dayLabels: Record<string, string> = {
      MONDAY: "Monday",
      TUESDAY: "Tuesday",
      WEDNESDAY: "Wednesday",
      THURSDAY: "Thursday",
      FRIDAY: "Friday",
    };
    return dayLabels[day] || day;
  };

  const getDayShort = (day: string): string => {
    return getDayLabel(day).substring(0, 3);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">{currentOffice.name}</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              {currentOffice.dpmsSystem} &bull; Template Builder
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={Object.keys(generatedSchedules).length === 0 || isExporting}
                  className="min-h-[44px]"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Export</span>
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {Object.keys(generatedSchedules).length === 0
                ? "Generate a schedule first"
                : "Export all generated schedules to Excel"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowODExportDialog(true)}
                  disabled={!currentDaySchedule}
                  className="min-h-[44px]"
                >
                  <FileJson className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Open Dental</span>
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!currentDaySchedule
                ? "Generate a schedule first"
                : "Export current day schedule for Open Dental import"}
            </TooltipContent>
          </Tooltip>
          <Button onClick={handleGenerateAllDays} disabled={isGenerating} variant="secondary" size="sm" className="min-h-[44px]">
            {isGenerating && generatingDay ? (
              <>
                <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                <span className="hidden sm:inline">Generating {getDayShort(generatingDay)}...</span>
                <span className="sm:hidden">Gen All...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Generate All Days</span>
                <span className="sm:hidden">All Days</span>
              </>
            )}
          </Button>
          <Button onClick={handleGenerateSchedule} disabled={isGenerating} size="sm" className="min-h-[44px]">
            {isGenerating && !generatingDay ? (
              <>
                <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                <span className="hidden sm:inline">Generating...</span>
                <span className="sm:hidden">Gen...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Generate {getDayLabel(activeDay)}</span>
                <span className="sm:hidden">Generate</span>
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            title="Delete office"
            className="min-h-[44px] min-w-[44px]"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Office"
        description={`Are you sure you want to delete "${currentOffice.name}"? This will permanently remove all providers, block types, rules, and generated schedules. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteOffice}
        isLoading={isDeleting}
      />

      {/* Generate All Days Progress Overlay */}
      <Dialog open={isGenerating && generatingDay !== null}>
        <DialogContent className="max-w-sm [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="space-y-4 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-accent" />
            <h3 className="text-lg font-semibold">Generating Schedules</h3>
            <p className="text-muted-foreground">
              Currently generating {generatingDay ? getDayLabel(generatingDay) : ""}...
            </p>
            <Progress value={generationProgress.total > 0 ? (generationProgress.completed / generationProgress.total) * 100 : 0} />
            <p className="text-sm text-muted-foreground">
              {generationProgress.completed} of {generationProgress.total} days complete
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3-Panel Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 overflow-auto lg:overflow-hidden">
        {/* Left Panel - Office Info (hidden on mobile) */}
        <div
          className={`transition-all duration-300 hidden lg:block ${
            leftPanelCollapsed ? "w-12" : "w-80"
          } flex-shrink-0`}
        >
          {leftPanelCollapsed ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLeftPanelCollapsed(false)}
              className="w-full h-12"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          ) : (
            <Card className="h-full overflow-auto">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm">Office Information</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLeftPanelCollapsed(true)}
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase">
                      Providers
                    </h3>
                    <Link href={`/offices/${officeId}/edit`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                        <Settings className="w-3 h-3" />
                        Edit
                      </Button>
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {(currentOffice.providers || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        No providers configured
                      </p>
                    ) : (
                      // Deduplicate by provider ID so multi-op providers appear only once
                      Array.from(
                        new Map((currentOffice.providers || []).map(p => [p.id, p])).values()
                      ).map((provider) => (
                        <div key={provider.id} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: provider.color }}
                          />
                          <div>
                            <p className="text-sm font-medium">{provider.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {provider.role}
                              {(provider.operatories || []).length > 0 && (
                                <span className="ml-1 text-muted-foreground/60">
                                  · {provider.operatories!.join(', ')}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Working Days
                  </h3>
                  <div className="flex gap-1">
                    {currentOffice.workingDays.map((day) => (
                      <div
                        key={day}
                        className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-medium border border-accent/30"
                      >
                        {getDayShort(day)[0]}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    System
                  </h3>
                  <p className="text-sm">{currentOffice.dpmsSystem}</p>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                    Daily Goal
                  </h3>
                  <p className="text-sm font-semibold">
                    ${currentOffice.totalDailyGoal.toLocaleString()}
                  </p>
                </div>

                {currentDaySchedule && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                        Editing
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Click empty slots to add blocks. Click existing blocks to edit. Drag blocks to move them.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center Panel - Schedule Grid */}
        <div className="w-full lg:flex-1 flex flex-col lg:overflow-hidden">
          <Tabs value={activeDay} onValueChange={setActiveDay} className="flex-1 flex flex-col">
            <TabsList className="flex w-full overflow-x-auto mb-4 h-10">
              {currentOffice.workingDays.map((day) => (
                <TabsTrigger key={day} value={day} className="flex-1 min-w-[64px] sm:min-w-[120px] text-xs sm:text-sm px-1 sm:px-3">
                  {getDayLabel(day)}
                  {generatedSchedules[day] && (
                    <span className="ml-2 w-2 h-2 rounded-full bg-success" />
                  )}
                  {(conflictsPerDay[day] ?? 0) > 0 && (
                    <span
                      className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600"
                      title={`${conflictsPerDay[day]} double-booking conflict${conflictsPerDay[day] === 1 ? '' : 's'}`}
                    >
                      ⚠️{conflictsPerDay[day]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1 overflow-auto">
              {currentOffice.workingDays.map((day) => (
                <TabsContent key={day} value={day} className="h-full mt-0">
                  <Card className="h-full">
                    <CardContent className="p-2 sm:p-6">
                      <ScheduleGrid
                        slots={activeDay === day ? timeSlots : []}
                        providers={providers}
                        blockTypes={blockTypes}
                        timeIncrement={timeIncrement}
                        conflicts={activeDay === day ? currentDayConflicts : []}
                        dTimeConflicts={activeDay === day ? currentDayDTimeConflicts : []}
                        onAddBlock={currentDaySchedule ? handleAddBlock : undefined}
                        onRemoveBlock={currentDaySchedule ? handleRemoveBlock : undefined}
                        onMoveBlock={currentDaySchedule ? handleMoveBlock : undefined}
                        onUpdateBlock={currentDaySchedule ? handleUpdateBlock : undefined}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>

        {/* Right Panel - Production Summary + Mix (collapsible on desktop, always shown on mobile) */}
        <div
          className={`transition-all duration-300 w-full lg:flex-shrink-0 ${
            rightPanelCollapsed ? "lg:w-10" : "lg:w-80 xl:lg:w-96"
          }`}
        >
          {/* On mobile, always show content. On desktop, respect collapsed state. */}
          {rightPanelCollapsed ? (
            <div className="hidden lg:flex flex-col items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightPanelCollapsed(false)}
                className="w-10 h-10"
                title="Expand production panel"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </div>
          ) : null}
          <div className={`${rightPanelCollapsed ? "lg:hidden" : ""} overflow-auto space-y-4 lg:space-y-6 lg:h-full`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Production</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightPanelCollapsed(true)}
                className="hidden lg:flex h-7 w-7"
                title="Collapse production panel"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <ProductionSummary summaries={productionSummaries} alignmentScore={alignmentScore} />
            {currentDaySchedule && (
              <ProductionMixChart
                schedule={currentDaySchedule}
                blockTypes={blockTypesForStore}
                providers={fullProviders}
              />
            )}
            <ConflictPanel
              schedule={currentDaySchedule || null}
              providers={fullProviders}
              blockTypes={currentOffice.blockTypes ?? []}
            />
            <VersionPanel
              officeId={officeId}
              activeDay={activeDay}
              currentSchedule={currentDaySchedule || null}
              onLoadVersion={(schedule) => {
                setSchedules([...Object.values(generatedSchedules).filter(s => s.dayOfWeek !== schedule.dayOfWeek), schedule], officeId);
              }}
            />
          </div>
        </div>
      </div>

      {/* Open Dental Export Dialog */}
      {currentDaySchedule && (
        <OpenDentalExportDialog
          open={showODExportDialog}
          onOpenChange={setShowODExportDialog}
          officeId={officeId}
          officeName={currentOffice.name}
          schedule={currentDaySchedule}
          providers={fullProviders}
          blockTypes={blockTypesForStore}
          timeIncrement={timeIncrement}
        />
      )}
    </div>
  );
}

function calculateHourlyRate(
  workingStart: string,
  workingEnd: string,
  lunchStart?: string,
  lunchEnd?: string,
  dailyGoal?: number
): number {
  if (!dailyGoal) return 0;

  const [startHour, startMin] = workingStart.split(":").map(Number);
  const [endHour, endMin] = workingEnd.split(":").map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  let totalMinutes = endMinutes - startMinutes;

  if (lunchStart && lunchEnd) {
    const [lunchStartHour, lunchStartMin] = lunchStart.split(":").map(Number);
    const [lunchEndHour, lunchEndMin] = lunchEnd.split(":").map(Number);
    const lunchMinutes =
      lunchEndHour * 60 +
      lunchEndMin -
      (lunchStartHour * 60 + lunchStartMin);
    totalMinutes -= lunchMinutes;
  }

  const hours = totalMinutes / 60;
  return Math.round(dailyGoal / hours);
}

function formatBlockLabel(
  label: string,
  blockTypes: any[],
  blockTypeId: string | null
): string {
  if (label === "LUNCH") return "LUNCH";

  if (label.includes(">$")) return label;

  if (blockTypeId) {
    const blockType = blockTypes.find((bt) => bt.id === blockTypeId);
    if (blockType && blockType.minimumAmount && blockType.minimumAmount > 0) {
      return `${label}>$${blockType.minimumAmount}`;
    }
  }

  return label;
}
