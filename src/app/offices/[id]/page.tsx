"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Sparkles, ChevronLeft, ChevronRight, Loader2, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import ScheduleGrid, { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import ProductionSummary, { ProviderProductionSummary } from "@/components/schedule/ProductionSummary";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore } from "@/store/schedule-store";
import { GenerationResult } from "@/lib/engine/types";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  } = useScheduleStore();

  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [generatingDay, setGeneratingDay] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });

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

  // Get current day's schedule
  const currentDaySchedule = generatedSchedules[activeDay];

  // Convert schedule to TimeSlotOutput format for ScheduleGrid
  // Group slots by time
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
        isBreak: slot.isBreak,
      });
    });

    // Convert to array
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

  // Convert production summary for ProductionSummary component
  const productionSummaries: ProviderProductionSummary[] =
    currentDaySchedule?.productionSummary.map((summary) => ({
      providerName: summary.providerName,
      providerColor:
        currentOffice.providers?.find((p) => p.id === summary.providerId)?.color || "#666",
      dailyGoal: summary.dailyGoal,
      target75: summary.target75,
      actualScheduled: summary.actualScheduled,
    })) || [];

  // Generate schedule for a single day
  const handleGenerateSchedule = async () => {
    if (!currentOffice) return;

    setGenerating(true);
    try {
      const response = await fetch(`/api/offices/${officeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: [activeDay] }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate schedule");
      }

      const data = await response.json();
      setSchedules(data.schedules, officeId);
      toast.success(`Schedule generated for ${activeDay}!`);
    } catch (error) {
      console.error("Error generating schedule:", error);
      toast.error("Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  // Generate schedules for all working days (with yielding to prevent UI blocking)
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
        
        // Yield to browser to prevent "Page Unresponsive" error
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const response = await fetch(`/api/offices/${officeId}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: [day] }),
        });

        if (!response.ok) {
          throw new Error(`Failed to generate schedule for ${day}`);
        }

        const data = await response.json();
        
        // Collect schedules
        allSchedules.push(...data.schedules);
        
        // Update UI incrementally
        setSchedules(allSchedules, officeId);

        completedDays++;
        setGenerationProgress({ completed: completedDays, total: totalDays });
        toast.success(`Generated ${getDayLabel(day)} (${completedDays}/${totalDays})`);
        
        // Another yield for smoother UI updates
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

  // Export schedule to Excel
  const handleDeleteOffice = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/offices/${officeId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete office");
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

      const response = await fetch(`/api/offices/${officeId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedules: allSchedules }),
      });

      if (!response.ok) {
        throw new Error("Failed to export schedule");
      }

      // Download the file
      const blob = await response.blob();
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

  // Convert day format for display
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
              {currentOffice.dpmsSystem} • Template Builder
            </p>
          </div>
        </div>
        <div className="flex gap-2">
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
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center Panel - Schedule Grid */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeDay} onValueChange={setActiveDay} className="flex-1 flex flex-col">
            <TabsList className={`grid w-full mb-4 grid-cols-${currentOffice.workingDays.length}`}>
              {currentOffice.workingDays.map((day) => (
                <TabsTrigger key={day} value={day}>
                  {getDayLabel(day)}
                  {generatedSchedules[day] && (
                    <span className="ml-2 w-2 h-2 rounded-full bg-success" />
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
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>

        {/* Right Panel - Production Summary */}
        <div className="w-80 flex-shrink-0 overflow-auto">
          <ProductionSummary summaries={productionSummaries} />
        </div>
      </div>
    </div>
  );
}
