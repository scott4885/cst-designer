"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, PanelLeft, PanelRight } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Schedule-builder panels
import {
  ToolbarRibbon,
  LeftSidebar,
  ScheduleCanvas,
  PropertiesPanel,
  EmptyState,
} from "@/components/schedule-builder";
import type { SelectedBlock, ProductionSummaryData } from "@/components/schedule-builder";

// Existing components (untouched)
import type { ProviderInput, TimeSlotOutput } from "@/components/schedule/ScheduleGrid";
import OpenDentalExportDialog from "@/components/schedule/OpenDentalExportDialog";
import CloneTemplateModal from "@/components/schedule/CloneTemplateModal";
import CopyDayModal from "@/components/schedule/CopyDayModal";
import OfficeInfoDrawer from "@/components/schedule/OfficeInfoDrawer";
import ReviewPanel from "@/components/schedule/ReviewPanel";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Stores
import { useOfficeStore } from "@/store/office-store";
import { useScheduleStore, type RotationWeek } from "@/store/schedule-store";
import { useFullScreen } from "@/components/layout/ClientLayout";

// Engine utilities (DO NOT MODIFY these imports — Agent B owns engine/)
import type { BlockTypeInput, GenerationResult } from "@/lib/engine/types";
import { detectConflicts } from "@/lib/engine/stagger";
import type { ConflictResult } from "@/lib/engine/stagger";
import { detectDTimeConflicts } from "@/lib/engine/da-time";
import type { DTimeConflict } from "@/lib/engine/da-time";
import { validateClinicalRules } from "@/lib/engine/clinical-rules";
import type { ClinicalWarning } from "@/lib/engine/clinical-rules";
import { calculateQualityScore } from "@/lib/engine/quality-score";
import type { QualityScore } from "@/lib/engine/quality-score";
// Export utilities (DO NOT MODIFY — Agent A owns)
import { generateExcel, type ExportInput } from "@/lib/export/excel";
import { notify } from "@/lib/notifications";

// ─── Helpers ───────────────────────────────────────────────────────

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
};

function getDayLabel(day: string): string {
  return DAY_LABELS[day] || day;
}

function formatBlockLabel(label: string, blockTypes: BlockTypeInput[], blockTypeId: string | null): string {
  if (label === "LUNCH") return "LUNCH";
  if (label.includes(">$")) return label;
  if (blockTypeId) {
    const bt = blockTypes.find((b) => b.id === blockTypeId);
    if (bt && bt.minimumAmount && bt.minimumAmount > 0) return `${label}>$${bt.minimumAmount}`;
  }
  return label;
}

function calculateHourlyRate(
  workingStart: string, workingEnd: string,
  lunchStart?: string, lunchEnd?: string,
  dailyGoal?: number
): number {
  if (!dailyGoal) return 0;
  const [sh, sm] = workingStart.split(":").map(Number);
  const [eh, em] = workingEnd.split(":").map(Number);
  let totalMin = eh * 60 + em - (sh * 60 + sm);
  if (lunchStart && lunchEnd) {
    const [lsh, lsm] = lunchStart.split(":").map(Number);
    const [leh, lem] = lunchEnd.split(":").map(Number);
    totalMin -= (leh * 60 + lem - (lsh * 60 + lsm));
  }
  return Math.round(dailyGoal / (totalMin / 60));
}

// ─── DPMS helpers ──────────────────────────────────────────────────

const DPMS_LABELS: Record<string, string> = {
  OPEN_DENTAL: "Open Dental",
  DENTRIX: "Dentrix",
  EAGLESOFT: "Eaglesoft",
  CURVE_DENTAL: "Curve",
  CARESTREAM: "Carestream",
  DSN: "DSN",
};

// ─── Main Page Component ──────────────────────────────────────────

export default function ScheduleBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const officeId = params.id as string;

  // Stores
  const { currentOffice, offices, fetchOffice, fetchOffices, isLoading: officeLoading } = useOfficeStore();
  const {
    generatedSchedules, activeDay, activeWeek,
    setActiveDay, setActiveWeek, setSchedules,
    isGenerating, setGenerating, isExporting: _isExporting, setExporting,
    loadSchedulesForOffice, clearSchedules,
    placeBlockInDay, removeBlockInDay, moveBlockInDay, updateBlockInDay,
    copyDayToDays, setVariantLabel,
  } = useScheduleStore();
  const { fullScreen, setFullScreen } = useFullScreen();

  // Local state
  const [generatingDay, setGeneratingDay] = useState<string | null>(null);
  const [generatingProviderId, setGeneratingProviderId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });
  const [showODExportDialog, setShowODExportDialog] = useState(false);
  const [, setIsExportingPdf] = useState(false);
  const [autoLoadedBanner, setAutoLoadedBanner] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [showGenerateWarning, setShowGenerateWarning] = useState(false);
  const [pendingGenerateAction, setPendingGenerateAction] = useState<"single" | "all" | null>(null);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [showCopyDayModal, setShowCopyDayModal] = useState(false);
  const [showOfficeInfo, setShowOfficeInfo] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlock | null>(null);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false);
  // Mobile/tablet drawers for narrow viewports (< lg / < xl)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobilePropsOpen, setMobilePropsOpen] = useState(false);
  const scheduleGridRef = useRef<HTMLDivElement>(null);

  // Fetch office data
  useEffect(() => {
    fetchOffice(officeId).catch(() => {
      toast.error("Failed to load office");
      router.push("/");
    });
    fetchOffices().catch(() => {});
  }, [officeId, fetchOffice, fetchOffices, router]);

  // Load schedules from localStorage
  useEffect(() => {
    loadSchedulesForOffice(officeId).then(() => {
      const schedules = useScheduleStore.getState().generatedSchedules;
      if (Object.keys(schedules).length > 0) {
        setAutoLoadedBanner(true);
        const t = setTimeout(() => setAutoLoadedBanner(false), 3000);
        return () => clearTimeout(t);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  // Set initial active day
  useEffect(() => {
    if (currentOffice && currentOffice.workingDays.length > 0) {
      setActiveDay(currentOffice.workingDays[0]);
    }
  }, [currentOffice, setActiveDay]);

  // ─── Computed values (ALL useMemos before any early return) ──────

  const currentDaySchedule = generatedSchedules[activeDay];
  const hasSchedules = Object.keys(generatedSchedules).length > 0;

  const fullProviders = currentOffice?.providers || [];
  const blockTypesForStore = currentOffice?.blockTypes || [];
  const blockTypes = (currentOffice?.blockTypes && currentOffice.blockTypes.length > 0) ? currentOffice.blockTypes : undefined;
  const timeIncrement = currentOffice?.timeIncrement || 10;

  // Multi-op provider expansion
  const multiOpProviderIds = useMemo(() => new Set<string>(
    (currentOffice?.providers || [])
      .filter(p => (p.operatories || []).length > 1)
      .map(p => p.id)
  ), [currentOffice]);

  // Build display providers (expand multi-op)
  const providers: ProviderInput[] = useMemo(() => {
    if (!currentOffice) return [];
    const result: ProviderInput[] = [];
    for (const p of currentOffice.providers || []) {
      const ops = p.operatories || [];
      const dayEntry = p.providerSchedule?.[activeDay];
      const rotationActive = currentOffice.rotationEnabled || currentOffice.alternateWeekEnabled;
      const dayRotationWeeks: string[] | undefined = dayEntry?.rotationWeeks;
      const excludedByRotation = rotationActive && dayRotationWeeks && dayRotationWeeks.length > 0 ? !dayRotationWeeks.includes(activeWeek) : false;
      const isDisabledToday = (dayEntry !== undefined && dayEntry.enabled === false) || excludedByRotation;
      const effectiveStart = (dayEntry?.enabled !== false && dayEntry?.workingStart) ? dayEntry.workingStart : p.workingStart;
      const effectiveEnd = (dayEntry?.enabled !== false && dayEntry?.workingEnd) ? dayEntry.workingEnd : p.workingEnd;

      if (ops.length > 1) {
        ops.forEach((op: string) => {
          result.push({ id: `${p.id}::${op}`, name: p.name, role: p.role, color: p.color, operatories: [op], workingStart: effectiveStart, workingEnd: effectiveEnd, disabled: isDisabledToday });
        });
      } else {
        const singleOp = ops.length > 0 ? ops[0] : "OP1";
        result.push({ id: p.id, name: p.name, role: p.role, color: p.color, operatories: [singleOp], workingStart: effectiveStart, workingEnd: effectiveEnd, disabled: isDisabledToday });
      }
    }
    return result;
  }, [currentOffice, activeDay, activeWeek]);

  // Time slots for grid
  const timeSlots: TimeSlotOutput[] = useMemo(() => {
    if (!currentDaySchedule) return [];
    const slotsByTime: Record<string, TimeSlotOutput['slots']> = {};
    currentDaySchedule.slots.forEach((slot) => {
      if (!slotsByTime[slot.time]) slotsByTime[slot.time] = [];
      const displayProviderId = multiOpProviderIds.has(slot.providerId) ? `${slot.providerId}::${slot.operatory}` : slot.providerId;
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

    const result: TimeSlotOutput[] = [];
    Object.keys(slotsByTime).forEach((time) => result.push({ time, slots: slotsByTime[time] }));
    result.sort((a, b) => {
      const parseT = (t: string) => {
        const [time, period] = t.split(" ");
        const [h, m] = time.split(":").map(Number);
        let hr = h;
        if (period === "PM" && hr !== 12) hr += 12;
        if (period === "AM" && hr === 12) hr = 0;
        return hr * 60 + m;
      };
      return parseT(a.time) - parseT(b.time);
    });
    return result;
  }, [currentDaySchedule, multiOpProviderIds]);

  // Production summaries
  const productionSummaries: ProductionSummaryData[] = useMemo(() => {
    if (!currentDaySchedule?.productionSummary || !currentOffice) return [];
    try {
      return currentDaySchedule.productionSummary.map((summary) => {
        const p = currentOffice.providers?.find((pr) => pr.id === summary.providerId);
        return {
          providerName: String(summary.providerName || "Unknown"),
          providerColor: p?.color || "#666",
          dailyGoal: Number(summary.dailyGoal) || 0,
          actualScheduled: Number(summary.actualScheduled) || 0,
          highProductionScheduled: Number(summary.highProductionScheduled) || 0,
        };
      });
    } catch { return []; }
  }, [currentDaySchedule, currentOffice]);

  // Conflicts
  const currentDayConflicts: ConflictResult[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return [];
    try { return detectConflicts(currentDaySchedule, currentOffice.providers); } catch { return []; }
  }, [currentDaySchedule, currentOffice]);

  const currentDayDTimeConflicts: DTimeConflict[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return [];
    try { return detectDTimeConflicts(currentDaySchedule, currentOffice.providers, currentOffice.blockTypes ?? []); } catch { return []; }
  }, [currentDaySchedule, currentOffice]);

  const conflictsPerDay: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!currentOffice?.providers?.length) return counts;
    for (const [day, schedule] of Object.entries(generatedSchedules)) {
      try { counts[day] = detectConflicts(schedule, currentOffice.providers).length; } catch { counts[day] = 0; }
    }
    return counts;
  }, [generatedSchedules, currentOffice]);

  const scheduleExistsPerDay: Record<string, boolean> = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const day of currentOffice?.workingDays || []) {
      result[day] = !!generatedSchedules[day];
    }
    return result;
  }, [generatedSchedules, currentOffice]);

  // Loop 9: per-day variant labels (EOF / Opt1 / Opt2) for badges + copy modal
  const variantLabelsByDay: Record<string, string | null | undefined> = useMemo(() => {
    const result: Record<string, string | null | undefined> = {};
    for (const day of currentOffice?.workingDays || []) {
      result[day] = generatedSchedules[day]?.variantLabel ?? null;
    }
    return result;
  }, [generatedSchedules, currentOffice]);
  const daysWithSchedules = useMemo(
    () => Object.keys(generatedSchedules),
    [generatedSchedules],
  );

  // Warnings
  const allWarnings: string[] = useMemo(() => currentDaySchedule?.warnings ?? [], [currentDaySchedule]);

  // Clinical warnings
  const clinicalWarnings: ClinicalWarning[] = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return [];
    try { return validateClinicalRules(currentDaySchedule, currentOffice.providers, currentOffice.blockTypes ?? []); } catch { return []; }
  }, [currentDaySchedule, currentOffice]);

  // Quality score
  const qualityScore: QualityScore | undefined = useMemo(() => {
    if (!currentDaySchedule || !currentOffice?.providers?.length) return undefined;
    try { return calculateQualityScore(currentDaySchedule, currentOffice.providers, currentOffice.blockTypes ?? [], clinicalWarnings); } catch { return undefined; }
  }, [currentDaySchedule, currentOffice, clinicalWarnings]);

  // Loop 10: Jump-to-cell handler fired by the Review panel. Scrolls the grid
  // viewport so the target cell is in view (the cell's own flashPulse ring is
  // already triggered by flashSlot() inside the ReviewPanel component).
  const handleJumpToCell = useMemo(
    () => (time: string, providerId: string) => {
      if (!scheduleGridRef.current) return;
      const selector = `[data-testid="block-cell-${CSS.escape(time)}-${CSS.escape(providerId)}"]`;
      const target = scheduleGridRef.current.querySelector(selector) as HTMLElement | null;
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [],
  );

  // Rotation
  const rotationEnabled = currentOffice?.rotationEnabled || currentOffice?.alternateWeekEnabled;
  const rotationLength: number = currentOffice?.rotationEnabled ? (currentOffice?.rotationWeeks ?? 2) : 2;
  const rotationWeeks: RotationWeek[] = rotationLength === 4 ? ["A", "B", "C", "D"] : ["A", "B"];

  // DPMS
  const dpmsNormalized = (currentOffice?.dpmsSystem || "").toUpperCase().replace(/ /g, "_");
  const dpmsLabel = DPMS_LABELS[dpmsNormalized] || "Open Dental";
  const isOpenDental = !dpmsNormalized || dpmsNormalized === "OPEN_DENTAL";

  // ─── Loading state ──────────────────────────────────────────────

  if (officeLoading || !currentOffice) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
          <p className="text-sm text-slate-500">Loading office...</p>
        </div>
      </div>
    );
  }

  // ─── D-time conflict check helper ───────────────────────────────

  const checkAndWarnDTimeConflicts = (day: string, actionProviderId: string, actionTime: string) => {
    const updatedSchedule = useScheduleStore.getState().generatedSchedules[day];
    if (!updatedSchedule) return;
    const dTimeWarnings = (updatedSchedule.warnings ?? []).filter(w => w.startsWith("D-time conflict"));
    if (dTimeWarnings.length === 0) return;
    const realProviderId = actionProviderId.includes("::") ? actionProviderId.slice(0, actionProviderId.lastIndexOf("::")) : actionProviderId;
    const provider = fullProviders.find(p => p.id === realProviderId);
    if (provider && provider.role !== "DOCTOR") return;
    setTimeout(() => {
      toast.warning(`D-time conflict: ${provider?.name ?? "Doctor"} already has active chair time at ${actionTime}`, { duration: 6000 });
    }, 150);
  };

  // ─── Schedule action handlers ───────────────────────────────────

  const handleAddBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number) => {
    const placed = placeBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore);
    if (placed) { setIsDirty(true); toast.success(`${blockType.label} block added`); checkAndWarnDTimeConflicts(activeDay, providerId, time); }
    else { toast.error("Could not place block — slot not found or outside work hours"); }
  };

  const handleRemoveBlock = (time: string, providerId: string) => {
    removeBlockInDay(activeDay, time, providerId, fullProviders, blockTypesForStore);
    setIsDirty(true);
    setSelectedBlock(null);
    toast.success("Block removed");
  };

  const handleMoveBlock = (fromTime: string, fromProviderId: string, toTime: string, toProviderId: string) => {
    moveBlockInDay(activeDay, fromTime, fromProviderId, toTime, toProviderId, fullProviders, blockTypesForStore);
    setIsDirty(true);
    toast.success("Block moved");
    checkAndWarnDTimeConflicts(activeDay, toProviderId, toTime);
  };

  const handleUpdateBlock = (time: string, providerId: string, blockType: BlockTypeInput, durationSlots: number, customProductionAmount?: number | null) => {
    updateBlockInDay(activeDay, time, providerId, blockType, durationSlots, fullProviders, blockTypesForStore, customProductionAmount);
    setIsDirty(true);
    toast.success(`Block updated to ${blockType.label}`);
    checkAndWarnDTimeConflicts(activeDay, providerId, time);
  };

  // Properties panel update handler
  const handlePropertiesUpdate = (time: string, providerId: string, newBlockType: BlockTypeInput, newDurationSlots: number, customProductionAmount?: number | null) => {
    handleUpdateBlock(time, providerId, newBlockType, newDurationSlots, customProductionAmount);
    // Update selected block state to reflect changes
    setSelectedBlock(prev => prev ? {
      ...prev,
      blockTypeId: newBlockType.id,
      blockLabel: newBlockType.label,
      durationSlots: newDurationSlots,
      customProductionAmount: customProductionAmount ?? null,
    } : null);
  };

  // ─── Generation handlers ────────────────────────────────────────

  const doGenerateSchedule = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/offices/${officeId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: [activeDay], weekType: activeWeek }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSchedules(data.schedules, officeId);
      setIsDirty(false);
      setLastSavedAt(new Date());
      toast.success(`Schedule generated for ${getDayLabel(activeDay)}!`);
    } catch { toast.error("Failed to generate schedule"); }
    finally { setGenerating(false); }
  };

  const doGenerateAllDays = async () => {
    if (!currentOffice.workingDays.length) return;
    setGenerating(true);
    const totalDays = currentOffice.workingDays.length;
    let completedDays = 0;
    setGenerationProgress({ completed: 0, total: totalDays });
    const allSchedules: GenerationResult[] = [];
    try {
      for (const day of currentOffice.workingDays) {
        setGeneratingDay(day);
        const genRes = await fetch(`/api/offices/${officeId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: [day], weekType: activeWeek }) });
        if (!genRes.ok) throw new Error(`Failed ${day}`);
        const genData = await genRes.json();
        allSchedules.push(...genData.schedules);
        setSchedules([...allSchedules], officeId);
        completedDays++;
        setGenerationProgress({ completed: completedDays, total: totalDays });
      }
      setIsDirty(false);
      setLastSavedAt(new Date());
      toast.success("All schedules generated!");
      setGeneratingDay(null);
    } catch { toast.error("Failed to generate all schedules"); setGeneratingDay(null); }
    finally { setGenerating(false); }
  };

  const handleGenerateProvider = async (realProviderId: string) => {
    setGeneratingProviderId(realProviderId);
    try {
      const res = await fetch(`/api/offices/${officeId}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: activeDay, providerId: realProviderId }) });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      const existingSchedules = Object.values(generatedSchedules);
      const mergedSchedule = data.schedule ?? data.schedules?.[0];
      if (mergedSchedule) {
        const others = existingSchedules.filter(s => s.dayOfWeek !== mergedSchedule.dayOfWeek);
        setSchedules([...others, mergedSchedule], officeId);
      } else if (data.schedules) {
        setSchedules(data.schedules, officeId);
      }
      setIsDirty(true);
      toast.success(`Smart schedule generated for ${fullProviders.find(p => p.id === realProviderId)?.name ?? "Provider"}!`);
    } catch { toast.error("Failed to generate provider schedule"); }
    finally { setGeneratingProviderId(null); }
  };

  const handleGenerateSchedule = async () => {
    if (hasSchedules) { setPendingGenerateAction("single"); setShowGenerateWarning(true); }
    else { await doGenerateSchedule(); }
  };

  const handleGenerateAllDays = async () => {
    if (hasSchedules) { setPendingGenerateAction("all"); setShowGenerateWarning(true); }
    else { await doGenerateAllDays(); }
  };

  const handleConfirmGenerate = async () => {
    setShowGenerateWarning(false);
    if (pendingGenerateAction === "single") await doGenerateSchedule();
    else if (pendingGenerateAction === "all") await doGenerateAllDays();
    setPendingGenerateAction(null);
  };

  // Smart Fill All
  const handleSmartFillAll = async () => {
    const dayProviders = fullProviders.filter(p => {
      const dayEntry = p.providerSchedule?.[activeDay];
      return dayEntry?.enabled !== false;
    });
    for (const p of dayProviders) { await handleGenerateProvider(p.id); }
  };

  // ─── Save handler ───────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    if (officeId && Object.keys(generatedSchedules).length > 0) {
      const weekSuffix = activeWeek === "A" ? "" : `:week${activeWeek}`;
      const lsKey = `schedule-designer:schedule-state:${officeId}${weekSuffix}`;
      try { localStorage.setItem(lsKey, JSON.stringify(generatedSchedules)); } catch {}
    }
    if (currentDaySchedule && officeId) {
      try {
        await fetch(`/api/offices/${officeId}/schedule-versions`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dayOfWeek: activeDay, weekType: activeWeek, slots: currentDaySchedule.slots, productionSummary: currentDaySchedule.productionSummary, label: "" }),
        });
      } catch {}
    }
    setIsDirty(false);
    setLastSavedAt(new Date());
    toast.success(rotationEnabled ? `Week ${activeWeek} template saved!` : "Template saved!", { duration: 2000 });
    notify.saved(`${getDayLabel(activeDay)} Week ${activeWeek}`);
  };

  // ─── Clear / Delete ─────────────────────────────────────────────

  const handleClearAndStartOver = () => {
    clearSchedules();
    setIsDirty(false);
    setLastSavedAt(null);
    setSelectedBlock(null);
    toast.info("Schedules cleared.");
  };

  const handleDeleteOffice = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/offices/${officeId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Office deleted");
      router.push("/");
    } catch { toast.error("Failed to delete office"); }
    finally { setIsDeleting(false); setShowDeleteDialog(false); }
  };

  // ─── Export handlers ────────────────────────────────────────────

  const handleExportExcel = async () => {
    if (!currentDaySchedule) { toast.error("Generate a schedule first"); return; }
    setExporting(true);
    try {
      const allSchedules = Object.values(generatedSchedules);
      const exportInput: ExportInput = {
        officeName: currentOffice.name,
        timeIncrement: currentOffice.timeIncrement || 10,
        providers: (currentOffice.providers || []).map((p) => ({
          id: p.id, name: p.name, providerId: p.providerId || undefined,
          role: p.role, operatories: p.operatories, dailyGoal: p.dailyGoal,
          hourlyRate: calculateHourlyRate(p.workingStart, p.workingEnd, p.lunchStart, p.lunchEnd, p.dailyGoal),
          color: p.color, goal75: p.dailyGoal * 0.75,
        })),
        blockTypes: (currentOffice.blockTypes || []).map((b) => ({ label: b.label, description: b.description, minimumAmount: b.minimumAmount, color: undefined })),
        daySchedules: allSchedules.map((schedule) => ({
          dayOfWeek: schedule.dayOfWeek,
          variant: schedule.variantLabel || (schedule as GenerationResult & { variant?: string }).variant || undefined,
          variantLabel: schedule.variantLabel ?? null,
          slots: schedule.slots.map((slot) => ({
            time: slot.time, providerId: slot.providerId, staffingCode: slot.staffingCode,
            blockLabel: slot.blockLabel ? formatBlockLabel(slot.blockLabel, currentOffice.blockTypes || [], slot.blockTypeId) : null,
            isBreak: slot.isBreak,
          })),
          productionSummary: schedule.productionSummary.map((s) => ({ providerId: s.providerId, actualScheduled: s.actualScheduled, status: s.status })),
        })),
      };
      const buffer = await generateExcel(exportInput);
      const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Customized Schedule Template - ${currentOffice.name}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Schedule exported!");
    } catch { toast.error("Failed to export schedule"); }
    finally { setExporting(false); }
  };

  const handleExportPdf = async () => {
    if (!currentDaySchedule || !scheduleGridRef.current) { toast.error("Generate a schedule first"); return; }
    setIsExportingPdf(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(scheduleGridRef.current, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text(currentOffice.name, pw / 2, 13, { align: "center" });
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${getDayLabel(activeDay)} Schedule Template`, pw / 2, 20, { align: "center" });
      const imgAspect = canvas.width / canvas.height;
      let imgW = pw - 16;
      let imgH = imgW / imgAspect;
      if (imgH > ph - 35) { imgH = ph - 35; imgW = imgH * imgAspect; }
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw - imgW) / 2, 27, imgW, imgH);
      pdf.save(`${currentOffice.name} - ${getDayLabel(activeDay)} Schedule.pdf`);
      toast.success("PDF exported!");
    } catch { toast.error("Failed to export PDF"); }
    finally { setIsExportingPdf(false); }
  };

  const handleExportDpms = () => {
    if (isOpenDental) setShowODExportDialog(true);
    else toast.info(`${dpmsLabel} export is in development.`);
  };

  // ─── Loop 9: Copy day handler + variant label handler ───────────

  const handleCopyDay = (
    targetDays: string[],
    options: Parameters<typeof copyDayToDays>[4],
  ) => {
    const result = copyDayToDays(activeDay, targetDays, fullProviders, blockTypesForStore, options);
    setIsDirty(true);
    if (result.copiedDays.length > 0) {
      toast.success(
        `Copied ${result.blocksCopied} block${result.blocksCopied === 1 ? "" : "s"} to ${result.copiedDays.length} day${
          result.copiedDays.length === 1 ? "" : "s"
        }. Undo (Ctrl+Z) reverts all at once.`,
      );
    }
    for (const w of result.warnings) toast.warning(w);
    return result;
  };

  const handleSetVariant = (label: string | null) => {
    setVariantLabel(activeDay, label);
    setIsDirty(true);
    toast.success(
      label ? `Tagged ${getDayLabel(activeDay)} as "${label}"` : `Cleared variant from ${getDayLabel(activeDay)}`,
    );
  };

  // ─── Undo/Redo (from store if available, else no-op) ────────────

  const storeState = useScheduleStore.getState();
  const canUndo = storeState.canUndo;
  const canRedo = storeState.canRedo;
  const handleUndo = () => useScheduleStore.getState().undo();
  const handleRedo = () => useScheduleStore.getState().redo();

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 flex flex-col bg-white">
      {/* Toolbar Ribbon */}
      <ToolbarRibbon
        officeName={currentOffice.name}
        officeId={officeId}
        workingDays={currentOffice.workingDays}
        activeDay={activeDay}
        onDayChange={setActiveDay}
        activeWeek={activeWeek}
        onWeekChange={setActiveWeek}
        rotationEnabled={!!rotationEnabled}
        rotationWeeks={rotationWeeks}
        hasSchedules={hasSchedules}
        isDirty={isDirty}
        isGenerating={isGenerating}
        generatingDay={generatingDay}
        canUndo={canUndo}
        canRedo={canRedo}
        onGenerate={handleGenerateSchedule}
        onGenerateAll={handleGenerateAllDays}
        onSave={handleSaveTemplate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportExcel={handleExportExcel}
        onExportPdf={handleExportPdf}
        onExportDpms={handleExportDpms}
        onPrint={() => window.open(`/offices/${officeId}/print?day=${activeDay.toLowerCase()}`, "_blank")}
        onClone={() => setShowCloneModal(true)}
        onCopyDay={() => setShowCopyDayModal(true)}
        onSetVariant={handleSetVariant}
        variantLabelsByDay={variantLabelsByDay}
        onClearAll={handleClearAndStartOver}
        onDeleteOffice={() => setShowDeleteDialog(true)}
        onSmartFill={handleSmartFillAll}
        isSmartFilling={generatingProviderId !== null}
        fullScreen={fullScreen}
        onToggleFullScreen={() => setFullScreen(!fullScreen)}
        conflictsPerDay={conflictsPerDay}
        scheduleExistsPerDay={scheduleExistsPerDay}
        lastSavedAt={lastSavedAt}
        dpmsLabel={dpmsLabel}
      />

      {/* Auto-loaded banner */}
      {autoLoadedBanner && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-emerald-50 border-b border-emerald-100 text-emerald-700 text-xs font-medium flex-shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Auto-loaded saved schedule
        </div>
      )}

      {/* Sprint 5 — Advisory quick-link */}
      <div className="flex items-center justify-end gap-2 px-4 py-1.5 bg-indigo-50 border-b border-indigo-100 text-indigo-800 text-xs font-medium flex-shrink-0">
        <span>Sprint 5: Template Advisory available for this office.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[11px]"
          data-testid="open-advisory-btn"
          onClick={() => router.push(`/offices/${officeId}/advisory`)}
        >
          Open Advisory →
        </Button>
      </div>

      {/* Mobile/tablet panel toggle bar (hidden on xl+) */}
      {!fullScreen && hasSchedules && (
        <div className="xl:hidden flex items-center gap-2 px-3 py-1.5 bg-white border-b border-border/40 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] gap-1.5 lg:hidden"
            onClick={() => setMobileToolsOpen(true)}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            Tools
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px] gap-1.5"
            onClick={() => setMobilePropsOpen(true)}
          >
            <PanelRight className="w-3.5 h-3.5" />
            Properties
          </Button>
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Sidebar (desktop: lg+) */}
        {!fullScreen && (
          <div className="hidden lg:flex">
            <LeftSidebar
              blockTypes={blockTypesForStore}
              providers={providers}
              hasSchedule={hasSchedules}
              officeId={officeId}
            />
          </div>
        )}

        {/* Center: Schedule Canvas */}
        {hasSchedules ? (
          <ScheduleCanvas
            slots={timeSlots}
            providers={providers}
            blockTypes={blockTypes}
            timeIncrement={timeIncrement}
            conflicts={currentDayConflicts}
            dTimeConflicts={currentDayDTimeConflicts}
            hasSchedule={!!currentDaySchedule}
            gridRef={scheduleGridRef}
            onAddBlock={currentDaySchedule ? handleAddBlock : undefined}
            onRemoveBlock={currentDaySchedule ? handleRemoveBlock : undefined}
            onMoveBlock={currentDaySchedule ? handleMoveBlock : undefined}
            onUpdateBlock={currentDaySchedule ? handleUpdateBlock : undefined}
            onGenerateProvider={currentDaySchedule ? handleGenerateProvider : undefined}
            generatingProviderId={generatingProviderId}
            fullScreen={fullScreen}
          />
        ) : (
          <EmptyState
            officeName={currentOffice.name}
            onGenerate={handleGenerateSchedule}
            onSelectTemplate={() => {}}
            isGenerating={isGenerating}
          />
        )}

        {/* Right: Properties Panel (desktop: xl+) */}
        {!fullScreen && hasSchedules && showPropertiesPanel && (
          <div className="hidden xl:flex">
            <PropertiesPanel
              selectedBlock={selectedBlock}
              blockTypes={blockTypesForStore}
              productionSummaries={productionSummaries}
              warnings={allWarnings}
              onClose={() => { setShowPropertiesPanel(false); setSelectedBlock(null); }}
              onDelete={(time, providerId) => { handleRemoveBlock(time, providerId); setSelectedBlock(null); }}
              onUpdate={handlePropertiesUpdate}
            />
          </div>
        )}

        {/* Always-visible right panel for production summaries when no block is selected (desktop: xl+) */}
        {!fullScreen && hasSchedules && !showPropertiesPanel && (
          <div className="hidden xl:flex flex-col flex-shrink-0 w-[320px] border-l border-border/40 bg-slate-50 min-h-0 overflow-hidden">
            {/* Review panel — Loop 10 unified surface for quality + issues */}
            <div className="px-3 pt-3 pb-2 border-b border-border/30 flex-shrink-0 max-h-[55%] overflow-y-auto">
              <ReviewPanel
                qualityScore={qualityScore}
                clinicalWarnings={clinicalWarnings}
                conflicts={currentDayConflicts}
                dTimeConflicts={currentDayDTimeConflicts}
                scheduleWarnings={allWarnings}
                onJumpToCell={handleJumpToCell}
              />
            </div>

            <div
              className="flex-1 min-h-0 overflow-y-auto cursor-pointer"
              onClick={() => setShowPropertiesPanel(true)}
            >
              <div className="px-4 py-2.5 border-b border-border/30">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Production
                </span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {productionSummaries.length > 0 ? (
                  productionSummaries.map((ps, i) => {
                    const pct = ps.dailyGoal > 0 ? Math.round((ps.actualScheduled / ps.dailyGoal) * 100) : 0;
                    const isAtGoal = pct >= 100;
                    const isNear = pct >= 75;
                    const formatCurrency = (a: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(a);

                    return (
                      <div key={i} className="bg-white rounded-lg px-3 py-2 border border-border/30">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ps.providerColor }} />
                            <span className="text-[11px] font-medium text-slate-700 truncate max-w-[120px]">{ps.providerName}</span>
                          </div>
                          <span className={`text-[11px] font-bold ${isAtGoal ? "text-emerald-800" : isNear ? "text-amber-800" : "text-red-700"}`}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${isAtGoal ? "bg-emerald-500" : isNear ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] font-medium text-slate-700">{formatCurrency(ps.actualScheduled)}</span>
                          <span className="text-[11px] text-slate-600">Goal: {formatCurrency(ps.dailyGoal)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[11px] text-slate-600">Generate a schedule to see production data.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Mobile drawers (narrow viewports < xl) ───────────────── */}

      {/* Tools drawer (< lg) */}
      <Dialog open={mobileToolsOpen} onOpenChange={setMobileToolsOpen}>
        <DialogContent className="p-0 max-w-sm max-h-[85vh] overflow-hidden flex flex-col lg:hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <LeftSidebar
              blockTypes={blockTypesForStore}
              providers={providers}
              hasSchedule={hasSchedules}
              officeId={officeId}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Properties drawer (< xl) */}
      <Dialog open={mobilePropsOpen} onOpenChange={setMobilePropsOpen}>
        <DialogContent className="p-0 max-w-sm max-h-[85vh] overflow-hidden flex flex-col xl:hidden">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PropertiesPanel
              selectedBlock={selectedBlock}
              blockTypes={blockTypesForStore}
              productionSummaries={productionSummaries}
              warnings={allWarnings}
              onClose={() => { setMobilePropsOpen(false); setSelectedBlock(null); }}
              onDelete={(time, providerId) => { handleRemoveBlock(time, providerId); setSelectedBlock(null); setMobilePropsOpen(false); }}
              onUpdate={handlePropertiesUpdate}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Dialogs ─────────────────────────────────────────────── */}

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Office"
        description={`Are you sure you want to delete "${currentOffice.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteOffice}
        isLoading={isDeleting}
      />

      <ConfirmDialog
        open={showGenerateWarning}
        onOpenChange={(open) => { setShowGenerateWarning(open); if (!open) setPendingGenerateAction(null); }}
        title="Overwrite Saved Schedule?"
        description="This will overwrite your saved schedule with a newly generated one. Any manual edits will be lost."
        confirmLabel="Yes, Regenerate"
        variant="destructive"
        onConfirm={handleConfirmGenerate}
      />

      <Dialog open={isGenerating && generatingDay !== null}>
        <DialogContent className="max-w-sm [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="space-y-4 text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-800">Generating Schedules</h3>
            <p className="text-slate-500">Currently generating {generatingDay ? getDayLabel(generatingDay) : ""}...</p>
            <Progress value={generationProgress.total > 0 ? (generationProgress.completed / generationProgress.total) * 100 : 0} />
            <p className="text-sm text-slate-400">{generationProgress.completed} of {generationProgress.total} days complete</p>
          </div>
        </DialogContent>
      </Dialog>

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

      <OfficeInfoDrawer
        open={showOfficeInfo}
        onClose={() => setShowOfficeInfo(false)}
        office={currentOffice}
      />

      <CloneTemplateModal
        open={showCloneModal}
        onOpenChange={setShowCloneModal}
        sourceOfficeId={officeId}
        sourceOfficeName={currentOffice.name}
        sourceProviders={fullProviders}
        allOffices={offices}
        rotationEnabled={currentOffice.rotationEnabled || currentOffice.alternateWeekEnabled}
        rotationWeeks={currentOffice.rotationWeeks ?? 2}
        activeWeek={activeWeek}
        workingDays={currentOffice.workingDays}
      />

      <CopyDayModal
        open={showCopyDayModal}
        onOpenChange={setShowCopyDayModal}
        sourceDay={activeDay}
        workingDays={currentOffice.workingDays}
        daysWithSchedules={daysWithSchedules}
        variantLabelsByDay={variantLabelsByDay}
        onCopy={handleCopyDay}
      />
    </div>
  );
}
