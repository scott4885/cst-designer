"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, Sparkles, ChevronLeft, ChevronRight, Loader2, Settings, Trash2, FileJson, FileText, Save, CheckCircle2 } from "lucide-react";
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
    activeWeek,
    setActiveDay,
    setActiveWeek,
    setSchedules,
    isGenerating,
    setGenerating,
    isExporting,
    setExporting,
    loadSchedulesForOffice,
    clearSchedules,
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
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const scheduleGridRef = useRef<HTMLDivElement>(null);
  /** Shows a brief "Auto-loaded saved schedule" banner when schedule is restored from localStorage */
  const [autoLoadedBanner, setAutoLoadedBanner] = useState(false);

  // Save state tracking
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // Warning before regenerating when saved schedules exist
  const [showGenerateWarning, setShowGenerateWarning] = useState(false);
  const [pendingGenerateAction, setPendingGenerateAction] = useState<'single' | 'all' | null>(null);

  // Per-provider "Generate Smart Schedule" state
  const [generatingProviderId, setGeneratingProviderId] = useState<string | null>(null);

  // Fetch office data on mount
  useEffect(() => {
    fetchOffice(officeId).catch((error) => {
      toast.error("Failed to load office");
      console.error(error);
      router.push("/");
    });
  }, [officeId, fetchOffice, router]);

  // Load schedules for this office from localStorage — auto-populate on mount
  useEffect(() => {
    loadSchedulesForOffice(officeId).then(() => {
      // Show banner if schedules were restored from localStorage
      const schedules = useScheduleStore.getState().generatedSchedules;
      if (Object.keys(schedules).length > 0) {
        setAutoLoadedBanner(true);
        const t = setTimeout(() => setAutoLoadedBanner(false), 3000);
        return () => clearTimeout(t);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

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
      return currentDaySchedule.productionSummary.map((summary) => {
        const providerRecord = currentOffice.providers?.find((p) => p.id === summary.providerId);
        return {
          providerName: String(summary.providerName || "Unknown"),
          providerColor: providerRecord?.color || "#666",
          providerRole: providerRecord?.role as 'DOCTOR' | 'HYGIENIST' | 'OTHER' | undefined,
          dailyGoal: Number(summary.dailyGoal) || 0,
          target75: Number(summary.target75) || 0,
          actualScheduled: Number(summary.actualScheduled) || 0,
          highProductionScheduled: Number(summary.highProductionScheduled) || 0,
          opBreakdown: Array.isArray(summary.opBreakdown) ? summary.opBreakdown : undefined,
          currentProcedureMix: (providerRecord as any)?.currentProcedureMix ?? {},
          futureProcedureMix: (providerRecord as any)?.futureProcedureMix ?? {},
        };
      });
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
  // Always render one column per assigned operatory so multi-op providers are fully visible.
  // doubleBooking flag controls the generator (whether to fill all op columns with blocks)
  // but should never hide display columns that the user explicitly configured.
  const doubleBookingEnabled = currentOffice.rules?.doubleBooking !== false;
  const providers: ProviderInput[] = [];
  for (const p of (currentOffice.providers || [])) {
    const ops = p.operatories || [];
    // Resolve per-day working hours for this active day
    const dayEntry = (p as any).providerSchedule?.[activeDay];
    // Provider disabled today if: explicit off-day OR rotation week exclusion
    const rotationActive = (currentOffice as any).rotationEnabled || (currentOffice as any).alternateWeekEnabled;
    const dayRotationWeeks: string[] | undefined = dayEntry?.rotationWeeks;
    const excludedByRotation = rotationActive && dayRotationWeeks && dayRotationWeeks.length > 0
      ? !dayRotationWeeks.includes(activeWeek)
      : false;
    const isDisabledToday = (dayEntry !== undefined && dayEntry.enabled === false) || excludedByRotation;
    const effectiveStart = (dayEntry?.enabled !== false && dayEntry?.workingStart) ? dayEntry.workingStart : p.workingStart;
    const effectiveEnd = (dayEntry?.enabled !== false && dayEntry?.workingEnd) ? dayEntry.workingEnd : p.workingEnd;

    // Always display all assigned operatories — never restrict to 1 based on doubleBooking flag
    if (ops.length > 1) {
      // Multi-op: create one display column per operatory with virtual ID
      ops.forEach((op) => {
        providers.push({
          id: `${p.id}::${op}`,
          name: p.name,
          role: p.role,
          color: p.color,
          operatories: [op],
          workingStart: effectiveStart,
          workingEnd: effectiveEnd,
          disabled: isDisabledToday,
        });
      });
    } else {
      const singleOp = ops.length > 0 ? ops[0] : 'OP1';
      providers.push({
        id: p.id,
        name: p.name,
        role: p.role,
        color: p.color,
        operatories: [singleOp],
        workingStart: effectiveStart,
        workingEnd: effectiveEnd,
        disabled: isDisabledToday,
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
  // Any provider with 2+ operatories gets virtual IDs ("realId::OP") for each column.
  const multiOpProviderIds = new Set<string>(
    (currentOffice.providers || [])
      .filter(p => (p.operatories || []).length > 1)
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

  // Whether there are any persisted/generated schedules for this office
  const hasSchedules = Object.keys(generatedSchedules).length > 0;

  // Explicit Save: persists current state to localStorage, clears dirty flag, shows confirmation
  const handleSaveTemplate = () => {
    // The store already auto-saves to localStorage on every edit (placeBlock, removeBlock, etc.)
    // This explicit Save button provides user confirmation and resets the dirty state.
    // Re-persist current state explicitly (idempotent — safe to call again).
    // Use week-aware key so Week A and Week B schedules are persisted separately.
    if (officeId && Object.keys(generatedSchedules).length > 0) {
      const weekSuffix = activeWeek === 'A' ? '' : `:week${activeWeek}`;
      const lsKey = `schedule-designer:schedule-state:${officeId}${weekSuffix}`;
      try {
        localStorage.setItem(lsKey, JSON.stringify(generatedSchedules));
      } catch (e) {
        console.warn('Failed to explicitly save template:', e);
      }
    }
    setIsDirty(false);
    setLastSavedAt(new Date());
    toast.success(
      ((currentOffice as any).rotationEnabled || (currentOffice as any).alternateWeekEnabled)
        ? `Week ${activeWeek} template saved!`
        : "Template saved!",
      { duration: 2000 }
    );
  };

  // Clear all schedules and localStorage state, reset to empty
  const handleClearAndStartOver = () => {
    clearSchedules();
    setIsDirty(false);
    setLastSavedAt(null);
    toast.info("Schedules cleared. Click Generate to create a new schedule.");
  };

  // Internal: actually run single-day generation
  const doGenerateSchedule = async () => {
    if (!currentOffice) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: [activeDay], weekType: activeWeek }),
      });
      if (!res.ok) throw new Error('Failed to generate schedule');
      const data = await res.json();
      setSchedules(data.schedules, officeId);
      setIsDirty(false);
      setLastSavedAt(new Date());
      toast.success(`Schedule generated for ${getDayLabel(activeDay)}!`);
    } catch (error) {
      console.error("Error generating schedule:", error);
      toast.error("Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  // Internal: actually run all-days generation
  const doGenerateAllDays = async () => {
    if (!currentOffice || !currentOffice.workingDays.length) return;
    setGenerating(true);
    const totalDays = currentOffice.workingDays.length;
    let completedDays = 0;
    setGenerationProgress({ completed: 0, total: totalDays });
    const allSchedules: any[] = [];

    try {
      for (const day of currentOffice.workingDays) {
        setGeneratingDay(day);
        await new Promise(resolve => setTimeout(resolve, 0));
        const genRes = await fetch(`/api/offices/${officeId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: [day], weekType: activeWeek }),
        });
        if (!genRes.ok) throw new Error(`Failed to generate ${day}`);
        const genData = await genRes.json();
        allSchedules.push(...genData.schedules);
        setSchedules([...allSchedules], officeId);
        completedDays++;
        setGenerationProgress({ completed: completedDays, total: totalDays });
        toast.success(`Generated ${getDayLabel(day)} (${completedDays}/${totalDays})`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      setIsDirty(false);
      setLastSavedAt(new Date());
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

  // Per-provider "Generate Smart Schedule" — generates only for the specified provider in the current day
  const handleGenerateProvider = async (realProviderId: string) => {
    if (!currentOffice) return;
    setGeneratingProviderId(realProviderId);
    try {
      const res = await fetch(`/api/offices/${officeId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: activeDay, providerId: realProviderId }),
      });
      if (!res.ok) throw new Error('Failed to generate schedule');
      const data = await res.json();
      // Merge the returned schedule into the store (preserving other days)
      const existingSchedules = Object.values(generatedSchedules);
      const mergedSchedule = data.schedule ?? data.schedules?.[0];
      if (mergedSchedule) {
        const others = existingSchedules.filter(s => s.dayOfWeek !== mergedSchedule.dayOfWeek);
        setSchedules([...others, mergedSchedule], officeId);
      } else if (data.schedules) {
        setSchedules(data.schedules, officeId);
      }
      setIsDirty(true);
      const providerName = fullProviders.find(p => p.id === realProviderId)?.name ?? 'Provider';
      toast.success(`Smart schedule generated for ${providerName}!`);
    } catch {
      toast.error('Failed to generate provider schedule');
    } finally {
      setGeneratingProviderId(null);
    }
  };

  // Generate schedule for a single day — warn if saved template exists
  const handleGenerateSchedule = async () => {
    if (hasSchedules) {
      setPendingGenerateAction('single');
      setShowGenerateWarning(true);
    } else {
      await doGenerateSchedule();
    }
  };

  // Generate schedules for all working days — warn if saved template exists
  const handleGenerateAllDays = async () => {
    if (hasSchedules) {
      setPendingGenerateAction('all');
      setShowGenerateWarning(true);
    } else {
      await doGenerateAllDays();
    }
  };

  // Confirm generation after warning
  const handleConfirmGenerate = async () => {
    setShowGenerateWarning(false);
    if (pendingGenerateAction === 'single') {
      await doGenerateSchedule();
    } else if (pendingGenerateAction === 'all') {
      await doGenerateAllDays();
    }
    setPendingGenerateAction(null);
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
        timeIncrement: currentOffice.timeIncrement || 10,
        providers: (currentOffice.providers || []).map((p) => ({
          id: p.id,
          name: p.name,
          providerId: (p as any).providerId || undefined,
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

  const handleExportPdf = async () => {
    if (!currentDaySchedule) {
      toast.error("Please generate a schedule first");
      return;
    }
    if (!scheduleGridRef.current) {
      toast.error("Schedule grid not found");
      return;
    }

    setIsExportingPdf(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const element = scheduleGridRef.current;

      // Capture the schedule grid with a white background
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        // Force all text/elements to be rendered as if on white bg
        onclone: (clonedDoc) => {
          const clonedEl = clonedDoc.querySelector<HTMLElement>("[data-pdf-capture]");
          if (clonedEl) {
            clonedEl.style.background = "#ffffff";
            clonedEl.style.color = "#000000";
          }
        },
      });

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      // ── Header ─────────────────────────────────────────
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text(currentOffice.name, pageWidth / 2, 13, { align: "center" });

      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${getDayLabel(activeDay)} Schedule Template`, pageWidth / 2, 20, { align: "center" });

      // Thin rule under header
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(180, 180, 180);
      pdf.line(10, 23, pageWidth - 10, 23);

      // ── Grid image ─────────────────────────────────────
      const headerOffset = 27; // mm from top where image starts
      const margin = 8;
      const maxImgWidth = pageWidth - margin * 2;
      const maxImgHeight = pageHeight - headerOffset - margin;

      const imgAspect = canvas.width / canvas.height;
      let imgW = maxImgWidth;
      let imgH = imgW / imgAspect;
      if (imgH > maxImgHeight) {
        imgH = maxImgHeight;
        imgW = imgH * imgAspect;
      }

      const imgX = (pageWidth - imgW) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", imgX, headerOffset, imgW, imgH);

      // ── Footer ─────────────────────────────────────────
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `Generated by Schedule Template Designer`,
        pageWidth / 2,
        pageHeight - 4,
        { align: "center" }
      );

      pdf.save(`${currentOffice.name} - ${getDayLabel(activeDay)} Schedule.pdf`);
      toast.success("PDF exported successfully!");
    } catch (error) {
      console.error("Error exporting PDF:", error);
      toast.error("Failed to export PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Helper: check updated schedule for new D-time conflicts and show a warning toast
  const checkAndWarnDTimeConflicts = (day: string, actionProviderId: string, actionTime: string) => {
    const updatedSchedule = useScheduleStore.getState().generatedSchedules[day];
    if (!updatedSchedule) return;

    // D-time warnings are stored in schedule.warnings with prefix "D-time conflict"
    const dTimeWarnings = (updatedSchedule.warnings ?? []).filter(w =>
      w.startsWith('D-time conflict')
    );
    if (dTimeWarnings.length === 0) return;

    // Find the real provider name (strip virtual "::OP" suffix)
    const realProviderId = actionProviderId.includes('::')
      ? actionProviderId.slice(0, actionProviderId.lastIndexOf('::'))
      : actionProviderId;
    const provider = fullProviders.find(p => p.id === realProviderId);

    // Only warn for doctor providers
    if (provider && provider.role !== 'DOCTOR') return;

    const providerName = provider?.name ?? 'Doctor';
    // Small delay so success toast appears first
    setTimeout(() => {
      toast.warning(`⚠️ D-time conflict: ${providerName} already has active chair time at ${actionTime}`, {
        duration: 6000,
        description: 'The doctor has hands-on work in another column at the same time. This is allowed but worth reviewing.',
      });
    }, 150);
  };

  // Interactive schedule editing handlers
  // Note: store functions now accept virtual provider IDs ("realId::OP") for multi-op providers
  const handleAddBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => {
    const placed = placeBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore);
    if (placed) {
      setIsDirty(true);
      toast.success(`${blockType.label} block added`);
      // Warn if placing this block created a D-time conflict for a doctor
      checkAndWarnDTimeConflicts(activeDay, providerId, time);
    } else {
      toast.error("Could not place block — slot not found or outside work hours");
    }
  };

  const handleRemoveBlock = (time: string, providerId: string) => {
    removeBlockInDay(activeDay, time, providerId, fullProviders, blockTypesForStore);
    setIsDirty(true);
    toast.success("Block removed");
  };

  const handleMoveBlock = (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => {
    moveBlockInDay(activeDay, fromTime, fromProviderId, toTime, toProviderId, fullProviders, blockTypesForStore);
    setIsDirty(true);
    toast.success("Block moved");
    // Warn if the move created a new D-time conflict
    checkAndWarnDTimeConflicts(activeDay, toProviderId, toTime);
  };

  const handleUpdateBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => {
    updateBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore, customProductionAmount);
    setIsDirty(true);
    toast.success(`Block updated to ${blockType.label}`);
    // Warn if the update created a D-time conflict
    checkAndWarnDTimeConflicts(activeDay, providerId, time);
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

  // ─── DPMS-specific export button ────────────────────────────────────────────
  /**
   * Returns a Tooltip+Button for the DPMS-specific import button.
   * Open Dental: opens the existing export dialog.
   * Other supported DPMS: shows "coming soon" toast.
   * OTHER: hidden.
   * Not set: defaults to Open Dental behavior.
   */
  const dpmsNormalized = (currentOffice.dpmsSystem || '').toUpperCase().replace(/ /g, '_');
  const DPMS_LABELS: Record<string, string> = {
    OPEN_DENTAL: 'Open Dental',
    DENTRIX: 'Dentrix',
    EAGLESOFT: 'Eaglesoft',
    CURVE_DENTAL: 'Curve',
    CARESTREAM: 'Carestream',
    DSN: 'DSN',
  };
  const dpmsLabel = DPMS_LABELS[dpmsNormalized] || 'Open Dental';
  const isOpenDental = !dpmsNormalized || dpmsNormalized === 'OPEN_DENTAL';
  const isOtherDpms = dpmsNormalized === 'OTHER';

  const getDpmsExportButton = (dpms: string, schedule: any, onOpenDentalClick: () => void) => {
    if (isOtherDpms) return null;
    const handleClick = () => {
      if (isOpenDental) {
        onOpenDentalClick();
      } else {
        toast.info(`${dpmsLabel} export is in development. Use Open Dental format for now.`);
      }
    };
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClick}
              disabled={!schedule}
              className="min-h-[44px]"
            >
              <FileJson className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{dpmsLabel}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {!schedule
            ? "Generate a schedule first"
            : isOpenDental
              ? `Export current day schedule for ${dpmsLabel} import`
              : `Export to ${dpmsLabel} (coming soon)`}
        </TooltipContent>
      </Tooltip>
    );
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
          {/* Save Template button — visible when schedule exists */}
          {hasSchedules && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isDirty ? "default" : "outline"}
                  size="sm"
                  onClick={handleSaveTemplate}
                  className={`min-h-[44px] gap-1 ${isDirty ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                >
                  {isDirty ? (
                    <>
                      <Save className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">Save</span>
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-300 ml-1" title="Unsaved changes" />
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 sm:mr-1 text-green-500" />
                      <span className="hidden sm:inline">{lastSavedAt ? "Saved" : "Save"}</span>
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isDirty ? "You have unsaved changes — click to save" : lastSavedAt ? `Saved at ${lastSavedAt.toLocaleTimeString()}` : "Save template"}
              </TooltipContent>
            </Tooltip>
          )}
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
          {getDpmsExportButton(currentOffice.dpmsSystem, currentDaySchedule, () => setShowODExportDialog(true))}
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPdf}
                  disabled={!currentDaySchedule || isExportingPdf}
                  className="min-h-[44px]"
                >
                  {isExportingPdf ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Exporting...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 sm:mr-2" />
                      <span className="hidden sm:inline">Export PDF</span>
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {!currentDaySchedule
                ? "Generate a schedule first"
                : `Export ${getDayLabel(activeDay)} schedule as PDF`}
            </TooltipContent>
          </Tooltip>
          {hasSchedules && (
            <Button
              onClick={handleClearAndStartOver}
              disabled={isGenerating}
              variant="outline"
              size="sm"
              className="min-h-[44px] border-destructive/50 text-destructive hover:bg-destructive/10"
              title="Wipe all schedules and start fresh"
            >
              <Trash2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Clear &amp; Start Over</span>
            </Button>
          )}
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
                <span className="hidden sm:inline">{hasSchedules ? 'Regenerate All Days' : 'Generate All Days'}</span>
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
                <span className="hidden sm:inline">{hasSchedules ? `Regenerate ${getDayLabel(activeDay)}` : `Generate ${getDayLabel(activeDay)}`}</span>
                <span className="sm:hidden">{hasSchedules ? 'Regenerate' : 'Generate'}</span>
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

      {/* Generate Warning Dialog */}
      <ConfirmDialog
        open={showGenerateWarning}
        onOpenChange={(open) => {
          setShowGenerateWarning(open);
          if (!open) setPendingGenerateAction(null);
        }}
        title="Overwrite Saved Schedule?"
        description="This will overwrite your saved schedule with a newly generated one. Any manual edits you've made will be lost. Continue?"
        confirmLabel="Yes, Regenerate"
        variant="destructive"
        onConfirm={handleConfirmGenerate}
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
          {/* Auto-loaded banner — fades after 3s when a saved schedule is restored from localStorage */}
          {autoLoadedBanner && (
            <div className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-md bg-success/10 border border-success/20 text-success text-xs font-medium transition-opacity duration-500 w-fit">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Auto-loaded saved schedule
            </div>
          )}

          {/* Rotation week selector — shown when rotationEnabled (or legacy alternateWeekEnabled) */}
          {((currentOffice as any).rotationEnabled || (currentOffice as any).alternateWeekEnabled) && (() => {
            // Determine rotation length: rotationWeeks takes priority, then fall back to 2 (legacy)
            const rotLen: number = (currentOffice as any).rotationEnabled
              ? ((currentOffice as any).rotationWeeks ?? 2)
              : 2;
            const weeks: Array<'A' | 'B' | 'C' | 'D'> = rotLen === 4
              ? ['A', 'B', 'C', 'D']
              : ['A', 'B'];
            const weekDescriptions: Record<string, string> = {
              A: 'Standard (odd) weeks',
              B: 'Alternate (even) weeks',
              C: 'Third-week schedule',
              D: 'Fourth-week schedule',
            };

            // "Copy from Week A" — copies Week A localStorage data into current week
            const handleCopyFromA = () => {
              if (!currentOffice?.id) return;
              const copied = useScheduleStore.getState().copyWeekFromA(activeWeek as 'A' | 'B' | 'C' | 'D', currentOffice.id);
              if (copied) {
                toast.success(`Week A schedule copied to Week ${activeWeek}`);
              } else {
                toast.error('Week A has no schedule to copy. Generate Week A first.');
              }
            };

            const currentWeekIsEmpty = Object.keys(generatedSchedules).length === 0;

            return (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium">Week:</span>
                <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
                  {weeks.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => { if (activeWeek !== w) setActiveWeek(w); }}
                      className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-border' : ''} ${
                        activeWeek === w
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      aria-pressed={activeWeek === w}
                      data-testid={`week-toggle-${w.toLowerCase()}`}
                    >
                      Week {w}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {weekDescriptions[activeWeek] ?? `Week ${activeWeek} schedule`}
                </span>
                {/* Copy from Week A — available for B/C/D when the week is empty */}
                {activeWeek !== 'A' && currentWeekIsEmpty && (
                  <button
                    type="button"
                    onClick={handleCopyFromA}
                    className="ml-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-muted hover:bg-accent transition-colors"
                    data-testid="copy-from-week-a"
                  >
                    Copy from Week A
                  </button>
                )}
              </div>
            );
          })()}

          <Tabs value={activeDay} onValueChange={setActiveDay} className="flex-1 flex flex-col">
            <TabsList className="flex w-full overflow-x-auto mb-4 h-10">
              {currentOffice.workingDays.map((day) => (
                <TabsTrigger key={day} value={day} className="flex-1 min-w-[52px] sm:min-w-[100px] text-xs sm:text-sm px-1 sm:px-3">
                  <span className="sm:hidden">{getDayShort(day)}</span>
                  <span className="hidden sm:inline">{getDayLabel(day)}</span>
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
                      <div
                        ref={day === activeDay ? scheduleGridRef : undefined}
                        data-pdf-capture="true"
                        style={{ background: "var(--background)" }}
                      >
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
                          onGenerateProvider={currentDaySchedule ? handleGenerateProvider : undefined}
                          generatingProviderId={generatingProviderId}
                        />
                      </div>
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
              activeWeek={activeWeek}
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
