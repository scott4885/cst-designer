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
import OpenDentalExportDialog from "@/components/schedule/OpenDentalExportDialog";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { deleteOffice, generateSchedule } from "@/lib/local-storage";
import { generateExcel, ExportInput, ExportDaySchedule } from "@/lib/export/excel";
import type { BlockTypeInput } from "@/lib/engine/types";
import { detectConflicts } from "@/lib/engine/stagger";
import type { ConflictResult } from "@/lib/engine/stagger";
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

  // Convert providers to ScheduleGrid format
  const providers: ProviderInput[] =
    currentOffice.providers?.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      color: p.color,
    })) || [];

  // Full provider data for store operations
  const fullProviders = currentOffice.providers || [];
  const blockTypes = currentOffice.blockTypes || [];
  const timeIncrement = currentOffice.timeIncrement || 10;

  // Convert schedule to TimeSlotOutput format for ScheduleGrid
  const timeSlots: TimeSlotOutput[] = [];
  if (currentDaySchedule) {
    const slotsByTime: Record<string, any[]> = {};

    currentDaySchedule.slots.forEach((slot) => {
      if (!slotsByTime[slot.time]) {
        slotsByTime[slot.time] = [];
      }
      slotsByTime[slot.time].push({
        providerId: slot.providerId,
        staffingCode: slot.staffingCode || undefined,
        blockLabel: slot.blockLabel || undefined,
        blockTypeId: slot.blockTypeId || undefined,
        isBreak: slot.isBreak,
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
      const schedules = await generateSchedule(officeId, [activeDay]);
      setSchedules(schedules, officeId);
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

        const schedules = await generateSchedule(officeId, [day]);
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
      const deleted = await deleteOffice(officeId);
      if (!deleted) throw new Error("Failed to delete office");
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
  const handleAddBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => {
    placeBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypes);
    toast.success(`Added ${blockType.label} block`);
  };

  const handleRemoveBlock = (time: string, providerId: string) => {
    removeBlockInDay(activeDay, time, providerId, fullProviders, blockTypes);
    toast.success("Block removed");
  };

  const handleMoveBlock = (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => {
    moveBlockInDay(activeDay, fromTime, fromProviderId, toTime, toProviderId, fullProviders, blockTypes);
    toast.success("Block moved");
  };

  const handleUpdateBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => {
    updateBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypes);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{currentOffice.name}</h1>
            <p className="text-muted-foreground text-sm">
              {currentOffice.dpmsSystem} &bull; Template Builder
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  variant="outline"
                  onClick={handleExport}
                  disabled={Object.keys(generatedSchedules).length === 0 || isExporting}
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Export
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
                  onClick={() => setShowODExportDialog(true)}
                  disabled={!currentDaySchedule}
                >
                  <FileJson className="w-4 h-4 mr-2" />
                  Open Dental
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!currentDaySchedule
                ? "Generate a schedule first"
                : "Export current day schedule for Open Dental import"}
            </TooltipContent>
          </Tooltip>
          <Button onClick={handleGenerateAllDays} disabled={isGenerating} variant="secondary">
            {isGenerating && generatingDay ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating {getDayLabel(generatingDay)}...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate All Days
              </>
            )}
          </Button>
          <Button onClick={handleGenerateSchedule} disabled={isGenerating}>
            {isGenerating && !generatingDay ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate {getDayLabel(activeDay)}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowDeleteDialog(true)}
            title="Delete office"
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
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Panel - Office Info */}
        <div
          className={`transition-all duration-300 ${
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
                    {providers.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        No providers configured
                      </p>
                    ) : (
                      providers.map((provider) => (
                        <div key={provider.id} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: provider.color }}
                          />
                          <div>
                            <p className="text-sm font-medium">{provider.name}</p>
                            <p className="text-xs text-muted-foreground">{provider.role}</p>
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeDay} onValueChange={setActiveDay} className="flex-1 flex flex-col">
            <TabsList className="inline-flex w-auto mb-4 h-10">
              {currentOffice.workingDays.map((day) => (
                <TabsTrigger key={day} value={day} className="flex-1 min-w-[120px]">
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
                    <CardContent className="p-6">
                      <ScheduleGrid
                        slots={activeDay === day ? timeSlots : []}
                        providers={providers}
                        blockTypes={blockTypes}
                        timeIncrement={timeIncrement}
                        conflicts={activeDay === day ? currentDayConflicts : []}
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

        {/* Right Panel - Production Summary + Mix */}
        <div className="w-80 flex-shrink-0 overflow-auto space-y-6">
          <ProductionSummary summaries={productionSummaries} alignmentScore={alignmentScore} />
          {currentDaySchedule && (
            <ProductionMixChart
              schedule={currentDaySchedule}
              blockTypes={blockTypes}
              providers={fullProviders}
            />
          )}
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
          blockTypes={blockTypes}
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
