"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowLeft, Plus, Trash2, Save, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useOfficeStore } from "@/store/office-store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
// updateOffice uses API route
import type { BlockTypeInput } from "@/lib/engine/types";

// Form schema for editing
const editOfficeSchema = z.object({
  name: z.string().min(1, "Office name is required"),
  timeIncrement: z.number().min(10).max(15).optional(),
  staggerMinutes: z.number().min(0).max(120),
  providers: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1, "Provider name is required"),
      providerId: z.string().optional(),
      role: z.enum(["DOCTOR", "HYGIENIST", "OTHER"]),
      operatories: z.array(z.string()).min(1, "Select at least one operatory"),
      columns: z.number().min(1).max(3).optional(),
      workingStart: z.string(),
      workingEnd: z.string(),
      lunchEnabled: z.boolean(),
      lunchStart: z.string().optional(),
      lunchEnd: z.string().optional(),
      dailyGoal: z.number().min(0),
      color: z.string(),
      seesNewPatients: z.boolean().optional(),
      enabledBlockTypeIds: z.array(z.string()).optional(),
      assistedHygiene: z.boolean().optional(),
    })
  ).min(1, "Add at least one provider"),
  scheduleRules: z.object({
    npModel: z.enum(["DOCTOR_ONLY", "HYGIENIST_ONLY", "EITHER"]),
    npBlocksPerDay: z.number().min(1).max(5),
    srpBlocksPerDay: z.number().min(0).max(5),
    hpPlacement: z.enum(["MORNING", "AFTERNOON", "ANY"]),
    doubleBooking: z.boolean(),
    matrixing: z.boolean(),
    emergencyHandling: z.enum(["DEDICATED", "FLEX", "ACCESS_BLOCKS"]),
  }).optional(),
  schedulingRules: z.string().optional(),
});

type EditOfficeFormData = z.infer<typeof editOfficeSchema>;

const OPERATORIES = ["OP1", "OP2", "OP3", "OP4", "OP5", "HYG1", "HYG2", "HYG3", "HYG4", "Main", "Consult Room"];
const PROVIDER_COLORS = ["#ec8a1b", "#87bcf3", "#f4de37", "#44f2ce", "#ff6b9d", "#9b59b6"];

export default function EditOfficePage() {
  const params = useParams();
  const router = useRouter();
  const officeId = params.id as string;
  const { currentOffice, fetchOffice, isLoading } = useOfficeStore();
  const [isSaving, setIsSaving] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const DRAFT_KEY = `schedule-designer-draft-${officeId}`;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditOfficeFormData>({
    resolver: zodResolver(editOfficeSchema),
    mode: "onBlur",
    defaultValues: {
      name: "",
      staggerMinutes: 0,
      providers: [],
      scheduleRules: {
        npModel: "DOCTOR_ONLY",
        npBlocksPerDay: 2,
        srpBlocksPerDay: 2,
        hpPlacement: "MORNING",
        doubleBooking: true,
        matrixing: true,
        emergencyHandling: "ACCESS_BLOCKS",
      },
    },
  });

  const { fields: providerFields, append: appendProvider, remove: removeProvider } = useFieldArray({
    control,
    name: "providers",
  });

  const watchProviders = watch("providers");

  // Warn on browser navigation away with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleBack = () => {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Leave anyway?")) return;
    }
    router.push(`/offices/${officeId}`);
  };

  // Load office data
  useEffect(() => {
    fetchOffice(officeId).catch((error) => {
      toast.error("Failed to load office");
      console.error(error);
      router.push("/");
    });
  }, [officeId, fetchOffice, router]);

  // Populate form when office loads
  useEffect(() => {
    if (currentOffice) {
      const rules = (currentOffice as any).rules;
      // Infer staggerMinutes from second doctor's staggerOffsetMin (= 1 * staggerMinutes)
      const doctors = currentOffice.providers?.filter(p => p.role === 'DOCTOR') || [];
      const inferredStagger = (doctors[1] as any)?.staggerOffsetMin ?? 0;
      reset({
        name: currentOffice.name,
        timeIncrement: currentOffice.timeIncrement ?? 10,
        staggerMinutes: inferredStagger,
        schedulingRules: (currentOffice as any).schedulingRules || '',
        providers: currentOffice.providers?.map(p => ({
          id: p.id,
          name: p.name,
          providerId: (p as any).providerId || '',
          role: p.role,
          operatories: p.operatories || ["OP1"],
          columns: (p as any).columns ?? 1,
          workingStart: p.workingStart || "07:00",
          workingEnd: p.workingEnd || "16:00",
          lunchEnabled: (p as any).lunchEnabled !== false,
          lunchStart: p.lunchStart || "12:00",
          lunchEnd: p.lunchEnd || "13:00",
          dailyGoal: p.dailyGoal || 5000,
          color: p.color || "#666",
          seesNewPatients: p.seesNewPatients !== false,
          enabledBlockTypeIds: p.enabledBlockTypeIds || [],
          assistedHygiene: (p as any).assistedHygiene === true,
        })) || [],
        scheduleRules: {
          npModel: rules?.npModel || "DOCTOR_ONLY",
          npBlocksPerDay: rules?.npBlocksPerDay ?? 2,
          srpBlocksPerDay: rules?.srpBlocksPerDay ?? 2,
          hpPlacement: rules?.hpPlacement || "MORNING",
          doubleBooking: rules?.doubleBooking ?? true,
          matrixing: rules?.matrixing ?? true,
          emergencyHandling: rules?.emergencyHandling || "ACCESS_BLOCKS",
        },
      });
    }
  }, [currentOffice, reset]);

  // localStorage draft: check for saved draft on mount (after office loads)
  useEffect(() => {
    if (!currentOffice) return; // only check after data loads
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt: string; data: EditOfficeFormData };
        if (parsed?.savedAt) {
          setDraftSavedAt(parsed.savedAt);
          setShowDraftBanner(true);
        }
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOffice?.id]);

  // localStorage draft: save on every form change
  useEffect(() => {
    const subscription = watch((values) => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          savedAt: new Date().toISOString(),
          data: values,
        }));
      } catch { /* quota errors etc. */ }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  const addProvider = () => {
    appendProvider({
      name: "",
      providerId: "",
      role: "DOCTOR",
      operatories: ["OP1"],
      columns: 1,
      workingStart: "07:00",
      workingEnd: "16:00",
      lunchEnabled: true,
      lunchStart: "12:00",
      lunchEnd: "13:00",
      dailyGoal: 5000,
      color: PROVIDER_COLORS[providerFields.length % PROVIDER_COLORS.length],
      seesNewPatients: true,
      enabledBlockTypeIds: [],
      assistedHygiene: false,
    });
    // Scroll to bottom after adding
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  };

  const onSubmit = async (data: EditOfficeFormData) => {
    setIsSaving(true);
    try {
      const generateId = () =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const staggerMin = data.staggerMinutes ?? 0;
      let doctorIdx = 0;
      const providers = data.providers.map((provider) => {
        const isDoctor = provider.role === "DOCTOR";
        // Always persist staggerOffsetMin: 0 for non-doctors and first doctor, N*staggerMin for Nth doctor
        const staggerOffsetMin = isDoctor ? doctorIdx * staggerMin : 0;
        if (isDoctor) doctorIdx++;
        return {
          ...provider,
          id: provider.id || generateId(),
          staggerOffsetMin,
          ...(provider.providerId ? { providerId: provider.providerId } : {}),
        };
      });

      const rules = data.scheduleRules ? {
        npModel: data.scheduleRules.npModel,
        npBlocksPerDay: data.scheduleRules.npBlocksPerDay,
        srpBlocksPerDay: data.scheduleRules.srpBlocksPerDay,
        hpPlacement: data.scheduleRules.hpPlacement,
        doubleBooking: data.scheduleRules.doubleBooking,
        matrixing: data.scheduleRules.matrixing,
        emergencyHandling: data.scheduleRules.emergencyHandling,
      } : undefined;

      const res = await fetch(`/api/offices/${officeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          timeIncrement: data.timeIncrement ?? currentOffice?.timeIncrement ?? 10,
          providers,
          ...(rules ? { rules } : {}),
          schedulingRules: data.schedulingRules || '',
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update office");
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Office updated successfully!");
      // Refetch to update the store before navigating
      await fetchOffice(officeId);
      router.push(`/offices/${officeId}`);
    } catch (error) {
      console.error("Error updating office:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update office");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !currentOffice) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Loading office...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={handleBack} className="min-h-[44px] min-w-[44px]">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Edit Office</h1>
          <p className="text-muted-foreground mt-1">
            Update office information and providers
          </p>
        </div>
      </div>

      {/* Draft resume banner */}
      {showDraftBanner && draftSavedAt && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-sm">
          <span className="text-amber-800 dark:text-amber-300">
            📝 You have an unsaved draft from{" "}
            <span className="font-medium">{new Date(draftSavedAt).toLocaleString()}</span>.
            Resume?
          </span>
          <div className="flex gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[36px] border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-300 dark:border-amber-700"
              onClick={() => {
                try {
                  const raw = localStorage.getItem(DRAFT_KEY);
                  if (raw) {
                    const parsed = JSON.parse(raw) as { savedAt: string; data: EditOfficeFormData };
                    if (parsed?.data) reset(parsed.data);
                  }
                } catch { /* ignore */ }
                setShowDraftBanner(false);
              }}
            >
              Resume
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-[36px] text-amber-700 dark:text-amber-400"
              onClick={() => {
                try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
                setShowDraftBanner(false);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Office Name */}
        <Card>
          <CardHeader>
            <CardTitle>Office Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Office Name</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="e.g., Smile Cascade"
              />
              {errors.name && (
                <p className="text-sm text-error mt-1">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="edit-timeIncrement">Time Increment</Label>
              <Select
                value={String(watch("timeIncrement") ?? currentOffice?.timeIncrement ?? 10)}
                onValueChange={(value) => setValue("timeIncrement", parseInt(value) as 10 | 15, { shouldDirty: true })}
              >
                <SelectTrigger id="edit-timeIncrement">
                  <SelectValue placeholder="10 minutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 minutes</SelectItem>
                  <SelectItem value="15">15 minutes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Schedule grid granularity. Changing this will affect stagger options and appointment durations.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Providers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Providers</CardTitle>
            <Button type="button" onClick={addProvider} size="sm" className="gap-2 min-h-[44px]">
              <Plus className="w-4 h-4" />
              Add Provider
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Doctor start stagger */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="edit-staggerMinutes" className="font-medium">Doctor start stagger</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Stagger offsets each successive doctor&apos;s start time by this many minutes. This prevents all doctors from starting procedures simultaneously, reducing assistant bottlenecks.</p>
                      <p className="mt-1 text-muted-foreground">Example (30 min stagger): Dr 1 starts at 7:00, Dr 2 at 7:30, Dr 3 at 8:00.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each successive doctor starts this many minutes later. Must be a multiple of the office time increment ({currentOffice?.timeIncrement ?? 10} min). Set to 0 to disable.
                </p>
              </div>
              <Select
                value={String(watch("staggerMinutes") ?? 0)}
                onValueChange={(val) => setValue("staggerMinutes", Number(val), { shouldDirty: true })}
              >
                <SelectTrigger className="w-28 shrink-0">
                  <SelectValue placeholder="0 min" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const increment = currentOffice?.timeIncrement ?? 10;
                    const options = [];
                    for (let m = 0; m <= 60; m += increment) {
                      options.push(
                        <SelectItem key={m} value={String(m)}>
                          {m === 0 ? "Off (0 min)" : `${m} min`}
                        </SelectItem>
                      );
                    }
                    return options;
                  })()}
                </SelectContent>
              </Select>
            </div>
            {providerFields.length === 0 && (
              <p className="text-muted-foreground text-center py-6">
                No providers added. Click "Add Provider" to start.
              </p>
            )}

            {providerFields.map((field, index) => (
              <div key={field.id} className="border border-border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Provider {index + 1}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setProviderToDelete(index)}
                  >
                    <Trash2 className="w-4 h-4 text-error" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input {...register(`providers.${index}.name`)} placeholder="Dr. John Doe" />
                    {errors.providers?.[index]?.name && (
                      <p className="text-sm text-error mt-1">
                        {errors.providers[index]?.name?.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select
                      onValueChange={(value) =>
                        setValue(`providers.${index}.role`, value as any, { shouldDirty: true })
                      }
                      value={watchProviders?.[index]?.role || "DOCTOR"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DOCTOR">Dentist</SelectItem>
                        <SelectItem value="HYGIENIST">Hygienist</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`edit-providers-${index}-providerId`}>
                    Provider ID
                    {!watchProviders?.[index]?.providerId && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
                        ⚠ Recommended for DPMS export
                      </span>
                    )}
                  </Label>
                  <Input
                    id={`edit-providers-${index}-providerId`}
                    {...register(`providers.${index}.providerId`)}
                    placeholder="e.g. DG001, DR-01"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Alphanumeric ID used in DPMS export. Optional but recommended.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id={`provider-${index}-new-patients`}
                    checked={field.seesNewPatients !== false}
                    onCheckedChange={(checked) =>
                      setValue(`providers.${index}.seesNewPatients`, checked)
                    }
                  />
                  <Label htmlFor={`provider-${index}-new-patients`} className="cursor-pointer">
                    Sees New Patients
                  </Label>
                </div>

                {watchProviders?.[index]?.role === 'HYGIENIST' && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`provider-${index}-assisted-hygiene`}
                      checked={!!(watchProviders?.[index]?.assistedHygiene)}
                      onCheckedChange={(checked) =>
                        setValue(`providers.${index}.assistedHygiene`, checked, { shouldDirty: true })
                      }
                    />
                    <div>
                      <Label htmlFor={`provider-${index}-assisted-hygiene`} className="cursor-pointer">
                        Assisted Hygiene Mode
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        2–3 chair rotation: hygienist moves between rooms while assistant handles setup/cleanup. Increases patient volume per day.
                      </p>
                    </div>
                  </div>
                )}

                {currentOffice?.blockTypes && currentOffice.blockTypes.length > 0 && (
                  <div>
                    <Label className="mb-2 block">Appointment Types Handled</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Leave all unchecked to handle all applicable types
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-border rounded-lg p-3">
                      {currentOffice.blockTypes
                        .filter(bt => 
                          bt.appliesToRole === 'BOTH' || 
                          bt.appliesToRole === field.role ||
                          (field.role === 'OTHER')
                        )
                        .map((blockType) => (
                          <div key={blockType.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`provider-${index}-block-${blockType.id}`}
                              value={blockType.id}
                              checked={field.enabledBlockTypeIds?.includes(blockType.id) || false}
                              onChange={(e) => {
                                const current = field.enabledBlockTypeIds || [];
                                const updated = e.target.checked
                                  ? [...current, blockType.id]
                                  : current.filter(id => id !== blockType.id);
                                setValue(`providers.${index}.enabledBlockTypeIds`, updated);
                              }}
                              className="w-4 h-4 rounded border-border"
                            />
                            <Label
                              htmlFor={`provider-${index}-block-${blockType.id}`}
                              className="text-sm cursor-pointer"
                            >
                              {blockType.label}
                            </Label>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Daily Goal ($)</Label>
                    <Input
                      type="number"
                      {...register(`providers.${index}.dailyGoal`, { valueAsNumber: true })}
                      placeholder="5000"
                    />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        {...register(`providers.${index}.color`)}
                        className="w-10 h-10 p-1 cursor-pointer rounded-md border border-border"
                      />
                      <Input
                        {...register(`providers.${index}.color`)}
                        placeholder="#ec8a1b"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Working Hours</Label>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <Input type="time" {...register(`providers.${index}.workingStart`)} className="flex-1" />
                      <span className="self-center text-sm text-muted-foreground text-center">to</span>
                      <Input type="time" {...register(`providers.${index}.workingEnd`)} className="flex-1" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">e.g. 7:00 AM – 5:00 PM</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Lunch Break</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {watchProviders?.[index]?.lunchEnabled !== false ? "Enabled" : "Disabled"}
                        </span>
                        <Switch
                          checked={watchProviders?.[index]?.lunchEnabled !== false}
                          onCheckedChange={(checked) =>
                            setValue(`providers.${index}.lunchEnabled`, checked, { shouldDirty: true })
                          }
                        />
                      </div>
                    </div>
                    {watchProviders?.[index]?.lunchEnabled !== false ? (
                      <>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input type="time" {...register(`providers.${index}.lunchStart`)} className="flex-1" />
                          <span className="self-center text-sm text-muted-foreground text-center">to</span>
                          <Input type="time" {...register(`providers.${index}.lunchEnd`)} className="flex-1" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">e.g. 12:00 PM – 1:00 PM</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        No lunch break — full day schedule
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Operatory Assignment</Label>
                  <p className="text-xs text-muted-foreground mb-2">Select which operatories this provider works in</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 border border-border rounded-lg p-3">
                    {OPERATORIES.map((op) => {
                      const currentOps = watchProviders?.[index]?.operatories || [];
                      const isChecked = currentOps.includes(op);
                      return (
                        <div key={op} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`edit-provider-${index}-op-${op}`}
                            checked={isChecked}
                            onChange={(e) => {
                              const updated = e.target.checked
                                ? [...currentOps, op]
                                : currentOps.filter((o: string) => o !== op);
                              setValue(
                                `providers.${index}.operatories`,
                                updated.length > 0 ? updated : [op]
                              );
                            }}
                            className="w-4 h-4 rounded border-border"
                          />
                          <label
                            htmlFor={`edit-provider-${index}-op-${op}`}
                            className="text-sm cursor-pointer"
                          >
                            {op}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  {errors.providers?.[index]?.operatories && (
                    <p className="text-sm text-error mt-1">
                      Select at least one operatory
                    </p>
                  )}
                </div>

                <div>
                  <Label>Columns / Ops</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue(`providers.${index}.columns`, parseInt(value), { shouldDirty: true })
                    }
                    value={String(watchProviders?.[index]?.columns ?? 1)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Column</SelectItem>
                      <SelectItem value="2">2 Columns</SelectItem>
                      <SelectItem value="3">3 Columns</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Multi-column: schedule spans all assigned ops simultaneously
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Schedule Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>New Patient Model</Label>
                <Select
                  onValueChange={(value) => setValue("scheduleRules.npModel", value as any)}
                  defaultValue={watch("scheduleRules.npModel") || "DOCTOR_ONLY"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOCTOR_ONLY">Doctor Only</SelectItem>
                    <SelectItem value="HYGIENIST_ONLY">Hygienist Only</SelectItem>
                    <SelectItem value="EITHER">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>HP Placement</Label>
                <Select
                  onValueChange={(value) => setValue("scheduleRules.hpPlacement", value as any)}
                  defaultValue={watch("scheduleRules.hpPlacement") || "MORNING"}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MORNING">Morning</SelectItem>
                    <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                    <SelectItem value="ANY">Any</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>NP Blocks Per Day</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  {...register("scheduleRules.npBlocksPerDay", { valueAsNumber: true })}
                  placeholder="2"
                />
              </div>
              <div>
                <Label>SRP Blocks Per Day</Label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  {...register("scheduleRules.srpBlocksPerDay", { valueAsNumber: true })}
                  placeholder="2"
                />
              </div>
            </div>

            <div>
              <Label>Emergency Handling</Label>
              <Select
                onValueChange={(value) => setValue("scheduleRules.emergencyHandling", value as any)}
                defaultValue={watch("scheduleRules.emergencyHandling") || "ACCESS_BLOCKS"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCESS_BLOCKS">Access Blocks</SelectItem>
                  <SelectItem value="DEDICATED">Dedicated</SelectItem>
                  <SelectItem value="FLEX">Flex</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-3">
                <Switch
                  id="edit-double-booking"
                  key={`double-booking-${watch("scheduleRules.doubleBooking")}`}
                  checked={watch("scheduleRules.doubleBooking") === true}
                  onCheckedChange={(checked) => setValue("scheduleRules.doubleBooking", checked, { shouldDirty: true })}
                />
                <div>
                  <Label htmlFor="edit-double-booking" className="cursor-pointer font-medium">
                    Allow Double Booking
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, doctors can be scheduled across multiple operatories simultaneously.
                    When disabled, a single-column schedule is generated.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <Switch
                  id="edit-matrixing"
                  key={`matrixing-${watch("scheduleRules.matrixing")}`}
                  checked={watch("scheduleRules.matrixing") === true}
                  onCheckedChange={(checked) => setValue("scheduleRules.matrixing", checked, { shouldDirty: true })}
                />
                <div>
                  <Label htmlFor="edit-matrixing" className="cursor-pointer font-medium">
                    Use Matrixing (D/A Codes)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, dentist schedules will include assistant (A) and doctor-exam (D) staffing codes for hygiene blocks.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Office-Specific Scheduling Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Office-Specific Scheduling Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              {...register("schedulingRules")}
              className="min-h-[200px] font-mono text-sm"
              placeholder="Enter office-specific scheduling rules..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Supports markdown. Use headings, lists, and comments to document custom rules.
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
          <Button type="button" variant="outline" onClick={handleBack} className="w-full sm:w-auto min-h-[44px]">
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving} className="w-full sm:w-auto min-h-[44px]">
            {isSaving ? (
              <>Saving...</>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
        title="Remove Provider"
        description={`Remove ${providerToDelete !== null ? providerFields[providerToDelete]?.name || `Provider ${providerToDelete + 1}` : "this provider"}? This cannot be undone after saving.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          if (providerToDelete !== null) {
            removeProvider(providerToDelete);
            toast.success("Provider removed");
            setProviderToDelete(null);
          }
        }}
      />
    </div>
  );
}
